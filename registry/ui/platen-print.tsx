"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PlatenPrintInk = "black" | "red" | "blue";

export type PlatenPrintProps = {
  /** The status phrases, printed one after another and cycled in order. */
  phrases: string[];
  /** Printing. False wipes the line, prints `doneText` and stops. @default true */
  active?: boolean;
  /** What stays printed once inactive. @default the last phrase */
  doneText?: string;
  /** How fast the press strikes, rests and returns, 0.5 to 2. @default 1 */
  speed?: number;
  /** How hard the platen strikes, 0 (a kiss) to 1 (a bite): squash, ink and depth. @default 0.6 */
  pressure?: number;
  /** The ink on the platen. @default "black" */
  ink?: PlatenPrintInk;
  /** Play the strikes the visitor makes. Off unless asked for. @default false */
  sound?: boolean;
  /** Print on its own, but not by hand. */
  disabled?: boolean;
  /** A phrase began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  className?: string;
};

/** A letter's strike interval, s at speed 1. */
const STRIKE = 0.11;
/** A space: the carriage steps without striking. */
const SPACE = 0.06;
/** Rest on a printed line before the carriage returns, s at speed 1. */
const HOLD = 1.3;
/** The tempo while the pointer or focus is on the strip. */
const SLOW = 0.35;
/** The plunger's fall to the paper, s. */
const FALL = 0.045;
/** How far the plunger travels, px. */
const PLUNGE = 9;
/** What a wiped letter leaves behind, as a share of its ink. */
const GHOST = 0.1;
const HEAD_W = 18;
const PAD_X = 20;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Pigments on card stock: the same in both themes. The stock is pulled a
// tenth of the way toward the page so a dark page does not glare.
const INKS: Record<PlatenPrintInk, string> = {
  black: "oklch(0.24 0.012 260)",
  red: "oklch(0.5 0.19 27)",
  blue: "oklch(0.43 0.15 264)",
};
const STOCK = "oklch(0.972 0.012 85)";
const TOOTH = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.27 0 0 0 0 0.22 0 0 0 -1 0.46'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;
const METAL = "oklch(0.55 0.012 260)";
const METAL_DARK = "oklch(0.36 0.014 260)";
const METAL_LIGHT = "oklch(0.86 0.008 260)";

/** Every impression is a little different: seeded from the phrase. */
type Impression = {
  density: number;
  tilt: number;
  dx: number;
  dy: number;
  angle: number;
  under: number;
  double: number;
  pitch: number;
  beat: number;
};

function impressionsOf(chars: string[], seed: number): Impression[] {
  const rand = lcg(seed);
  return chars.map(() => ({
    density: rand(),
    tilt: rand() - 0.5,
    dx: rand() - 0.5,
    dy: rand() - 0.5,
    angle: Math.round(rand() * 360),
    under: rand(),
    double: rand() < 0.12 ? 0.4 + rand() * 0.4 : 0,
    pitch: rand(),
    beat: 0.8 + rand() * 0.45,
  }));
}

/** How one impression prints at a pressure: harder is darker, more even, deeper. */
function inkStyle(m: Impression, p: number, ink: string): React.CSSProperties {
  const spread = 1 - p * 0.6;
  const shadows = [
    // Ink squeezed out at the edges of the type.
    `0 0 ${r2(0.3 + 0.5 * p)}px color-mix(in oklab, ${ink} ${Math.round(25 + 45 * p)}%, transparent)`,
    // The deboss: a lit lower edge where the paper was pressed in.
    `0 ${r2(0.4 + 0.5 * p)}px 0 oklch(1 0 0 / ${r2(0.2 + 0.5 * p)})`,
  ];
  if (m.double > 0) {
    shadows.push(
      `${r2(m.double)}px 0 0 color-mix(in oklab, ${ink} 22%, transparent)`,
    );
  }
  const low = r2(clamp01(0.35 + 0.6 * p - m.under * 0.25 * spread));
  const mask = `linear-gradient(${m.angle}deg, black 30%, rgb(0 0 0 / ${low}) 100%)`;
  return {
    color: ink,
    textShadow: shadows.join(", "),
    maskImage: mask,
    WebkitMaskImage: mask,
  };
}

type Cell = {
  struck: MotionValue<number>;
  x: MotionValue<number>;
  y: MotionValue<number>;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
};

type Slot = {
  n: number;
  index: number;
  text: string;
  final: boolean;
  /** Arrives already printed (a line that starts finished). */
  printed: boolean;
};

type Press = {
  phase: "print" | "hold" | "return" | "done";
  /** The next character to strike. */
  next: number;
  timer: number | null;
};

type Api = {
  /** The rhythm's own strike, then the next beat. */
  tick: () => void;
  /** The rhythm's own carriage return. */
  home: () => void;
  /** The next phrase, from the latest render (the host may have spoken). */
  advance: () => void;
  resume: () => void;
  pause: () => void;
  turn: (on: boolean) => void;
  measure: () => void;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Glyphs({
  chars,
  marks,
  pressure,
  ink,
  cells,
  bind,
}: {
  chars: string[];
  marks: Impression[];
  pressure: number;
  ink: string;
  cells?: Cell[];
  bind?: (i: number) => (node: HTMLSpanElement | null) => void;
}) {
  // Words stay whole: a phrase too long for the strip wraps between them.
  const words: { at: number[]; key: number }[] = [];
  let current: number[] = [];
  chars.forEach((char, at) => {
    if (char.trim() === "") {
      if (current.length) words.push({ at: current, key: at });
      current = [];
      return;
    }
    current.push(at);
  });
  if (current.length) words.push({ at: current, key: chars.length });
  const p = clamp01(pressure);
  const evenness = 1 - p * 0.6;

  return words.map((word, w) => (
    <React.Fragment key={word.key}>
      {w > 0 ? " " : null}
      <span className="inline-block whitespace-nowrap">
        {word.at.map((at) => {
          const m = marks[at] as Impression;
          const cell = cells?.[at];
          const look = inkStyle(m, p, ink);
          return (
            <span
              key={at}
              ref={bind?.(at)}
              className="relative inline-block"
              style={{
                opacity: r2(1 - m.density * 0.35 * evenness),
                transform: `translate(${r2(m.dx * 0.8)}px, ${r2(m.dy * 1.1)}px) rotate(${r2(m.tilt * 2.4 * evenness)}deg)`,
              }}
            >
              {cell ? (
                <motion.span
                  className="block"
                  style={{
                    ...look,
                    opacity: cell.struck,
                    x: cell.x,
                    y: cell.y,
                    scaleX: cell.sx,
                    scaleY: cell.sy,
                    originY: 0.77,
                  }}
                >
                  {chars[at]}
                </motion.span>
              ) : (
                <span
                  className="block"
                  style={{
                    ...look,
                    opacity: GHOST,
                    transform: "translateX(-1.5px)",
                  }}
                >
                  {chars[at]}
                </span>
              )}
            </span>
          );
        })}
      </span>
    </React.Fragment>
  ));
}

/**
 * A status line printed by a platen press, one struck letter at a time. A
 * small head rides a rail over a strip of card stock; for each letter its
 * plunger falls and the letter drops with it onto the line, squashes on its
 * baseline and springs back, and the carriage steps on. Every impression is
 * a little uneven — density, a tilt, a side that took less ink — seeded from
 * the phrase, and `pressure` decides how hard, dark and even the press bites.
 * When a phrase has rested the carriage returns on the glide spring, wiping
 * the line to a ghost as it passes, and the next phrase prints over that
 * ghost while it fades.
 *
 * Hover or focus slows the press so each strike reads. The strip is a real
 * button: a press, a tap, Enter or Space strikes the next letter by hand,
 * and on a finished line it sends the carriage back. Letters are motion
 * values animated per strike; the rhythm is a timer that runs only on screen
 * in a visible page. The phrase is in a polite live region, announced once.
 * Under reduced motion letters appear in place one at a time and the wipe is
 * a fade; the head stays parked.
 */
export function PlatenPrint({
  phrases,
  active = true,
  doneText,
  speed = 1,
  pressure = 0.6,
  ink = "black",
  sound = false,
  disabled = false,
  onPhraseChange,
  className,
}: PlatenPrintProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rate = clamp(speed, 0.5, 2);
  const p = clamp01(pressure);
  const inkColour = INKS[ink] ?? INKS.black;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const list = phrases.length > 0 ? phrases : [doneText ?? ""];
  const done = doneText ?? list[list.length - 1] ?? "";

  const [slot, setSlot] = React.useState<Slot>(() =>
    active
      ? { n: 0, index: 0, text: list[0] ?? "", final: false, printed: false }
      : { n: 0, index: -1, text: done, final: true, printed: true },
  );
  const [ghost, setGhost] = React.useState<{ n: number; text: string } | null>(
    null,
  );
  const [height, setHeight] = React.useState<number | null>(null);

  const run = React.useMemo(() => {
    const chars = Array.from(slot.text);
    return {
      chars,
      marks: impressionsOf(chars, hash(slot.text)),
      cells: chars.map((): Cell => ({
        struck: motionValue(slot.printed ? 1 : 0),
        x: motionValue(0),
        y: motionValue(0),
        sx: motionValue(1),
        sy: motionValue(1),
      })),
    };
  }, [slot]);
  const ghostRun = React.useMemo(() => {
    if (!ghost) return null;
    const chars = Array.from(ghost.text);
    return { chars, marks: impressionsOf(chars, hash(ghost.text)) };
  }, [ghost]);

  const headX = useMotionValue(PAD_X + 4 - HEAD_W / 2);
  const plunge = useMotionValue(0);
  const tempo = useMotionValue(1);

  const stripRef = React.useRef<HTMLButtonElement | null>(null);
  const letters = React.useRef(new Map<string, HTMLSpanElement>());
  const centres = React.useRef<{ x: number }[]>([]);
  const press = React.useRef<Press>({
    phase: slot.printed ? "done" : "print",
    next: slot.printed ? Array.from(slot.text).length : 0,
    timer: null,
  });
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const strikes = React.useRef<AnimationPlaybackControls[]>([]);
  const over = React.useRef({ pointer: false, focus: false, type: "mouse" });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onPhraseChange);
  const wasActive = React.useRef(active);

  const runAnim = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const measure = () => {
    const box = stripRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    // Offsets, not boxes: each impression's seeded tilt and jitter must not
    // move the head.
    centres.current = run.chars.map((_, i) => {
      const node = letters.current.get(`${slot.n}:${i}`);
      const parent = node?.offsetParent;
      if (!node || !parent) return { x: -1 };
      const base = parent.getBoundingClientRect();
      return {
        x: r2(
          base.left -
            rect.left -
            box.clientLeft +
            node.offsetLeft +
            node.offsetWidth / 2,
        ),
      };
    });
    // Spaces sit halfway between their neighbours.
    centres.current.forEach((c, i) => {
      if (c.x >= 0) return;
      const before = centres.current[i - 1];
      const after = centres.current[i + 1];
      if (before && after && before.x >= 0 && after.x >= 0) {
        c.x = r2((before.x + after.x) / 2);
      } else if (before && before.x >= 0) {
        c.x = before.x + 8;
      }
    });
    // A head at rest follows the text when it moves (a font arriving, a
    // resize): over the next letter, or parked at the start under reduced
    // motion.
    const pr = press.current;
    if (pr.phase !== "return" && !headX.isAnimating()) {
      headTo(motionSafe ? pr.next : 0, true);
    }
  };

  /** Where the head sits over character i (or just past the end). */
  const spotOf = (i: number) => {
    const all = centres.current;
    const at = all[i];
    if (at && at.x >= 0) return at;
    const last = all[all.length - 1];
    const before = all[all.length - 2];
    const step = last && before ? Math.max(6, last.x - before.x) : 9;
    return last ? { x: last.x + step } : { x: PAD_X };
  };

  // The head never leaves its rail: on a phrase that wraps, the carriage
  // simply runs back for the next row, as a line feed does.
  const headTo = (i: number, instant = false) => {
    // A strike still landing as the carriage starts home must not stop it.
    if (press.current.phase === "return") return;
    const x = r2(spotOf(i).x - HEAD_W / 2);
    if (instant || !motionSafe) {
      anims.current.get("headX")?.stop();
      if (motionSafe || instant) headX.jump(x);
      return;
    }
    runAnim("headX", animate(headX, x, springs.flick));
  };

  const panOf = (i: number) => {
    const box = stripRef.current;
    if (!box) return 0;
    const rect = box.getBoundingClientRect();
    return panFrom(rect.left + spotOf(i).x, box);
  };

  /** One strike of the press on the next character. */
  const strike = (byHand: boolean) => {
    const pr = press.current;
    if (pr.phase !== "print") return;
    const i = pr.next;
    const char = run.chars[i];
    if (char === undefined) {
      pr.phase = slot.final && !active ? "done" : "hold";
      return;
    }
    pr.next = i + 1;
    const cell = run.cells[i];
    const mark = run.marks[i];
    const finished = pr.next >= run.chars.length;
    if (finished) pr.phase = slot.final && !active ? "done" : "hold";
    if (char.trim() === "" || !cell || !mark) {
      headTo(i + 1);
      if (byHand) audio.play("click", { pitch: 1.3, gain: 0.2, pan: panOf(i) });
      return;
    }
    if (!motionSafe) {
      cell.struck.set(1);
      if (byHand) {
        audio.play("thock", {
          pitch: r2(0.85 + mark.pitch * 0.3),
          gain: r2(0.35 + 0.35 * p),
          pan: panOf(i),
        });
      }
      return;
    }
    // The plunger falls and the letter with it; at contact the type squashes
    // onto its baseline and springs back, the plunger lifts and the carriage
    // steps on — the escapement.
    const drop = r2(PLUNGE * (0.7 + 0.3 * p));
    cell.y.set(-drop);
    cell.x.set(0);
    cell.sx.set(1);
    cell.sy.set(1);
    const land = () => {
      cell.sy.set(r2(1 - 0.26 * p));
      cell.sx.set(r2(1 + 0.14 * p));
      strikes.current.push(
        animate(cell.sy, 1, springs.snap),
        animate(cell.sx, 1, springs.snap),
      );
      runAnim("plunge", animate(plunge, 0, springs.snap));
      headTo(i + 1);
      if (byHand) {
        audio.play("thock", {
          pitch: r2(0.85 + mark.pitch * 0.3),
          gain: r2(0.35 + 0.35 * p),
          pan: panOf(i),
        });
        audio.play("click", { pitch: 1.6, gain: 0.18, pan: panOf(i) });
      }
    };
    strikes.current.push(
      animate(cell.struck, 1, { duration: FALL * 0.6, ease: easings.enter }),
      animate(cell.y, 0, {
        duration: FALL,
        ease: easings.exit,
        onComplete: land,
      }),
    );
    runAnim(
      "plunge",
      animate(plunge, PLUNGE * (0.8 + 0.2 * p), {
        duration: FALL,
        ease: easings.exit,
      }),
    );
    if (strikes.current.length > 60) strikes.current.splice(0, 30);
  };

  const clearTimer = () => {
    const pr = press.current;
    if (pr.timer !== null) window.clearTimeout(pr.timer);
    pr.timer = null;
  };

  /** The next beat of the press, at the tempo it is running at now. */
  const schedule = () => {
    clearTimer();
    if (!running) return;
    const pr = press.current;
    if (pr.phase === "print") {
      const char = run.chars[pr.next];
      const beat =
        char === undefined || char.trim() === ""
          ? SPACE
          : STRIKE * (run.marks[pr.next]?.beat ?? 1);
      const wait = beat / (rate * Math.max(0.05, tempo.get()));
      pr.timer = window.setTimeout(
        () => {
          pr.timer = null;
          api.current?.tick();
        },
        Math.round(wait * 1000),
      );
      return;
    }
    if (pr.phase === "hold") {
      pr.timer = window.setTimeout(
        () => {
          pr.timer = null;
          api.current?.home();
        },
        Math.round((HOLD / rate) * 1000),
      );
    }
  };

  /** The carriage goes home and wipes the line as it passes. */
  const carriageReturn = (byHand: boolean) => {
    const pr = press.current;
    clearTimer();
    pr.phase = "return";
    if (byHand) audio.play("click", { pitch: 0.7, gain: 0.35, pan: panOf(0) });
    const home = r2(spotOf(0).x - HEAD_W / 2);
    // Each letter is wiped once, as the head first passes it.
    const wiped = new Set<number>();
    const wipe = (i: number) => {
      const cell = run.cells[i];
      if (!cell || wiped.has(i)) return;
      wiped.add(i);
      if (cell.struck.get() <= GHOST + 0.001) return;
      strikes.current.push(
        animate(cell.struck, GHOST, {
          duration: durations.fast,
          ease: easings.exit,
        }),
        animate(cell.x, -1.5, { duration: durations.fast, ease: easings.exit }),
      );
    };
    if (!motionSafe) {
      run.cells.forEach((_, i) => wipe(i));
      runAnim(
        "return",
        animate(0, 1, {
          duration: durations.base,
          onComplete: () => api.current?.advance(),
        }),
      );
      return;
    }
    runAnim(
      "headX",
      animate(headX, home, {
        ...springs.glide,
        onUpdate: (x) => {
          const centre = x + HEAD_W / 2;
          centres.current.forEach((c, i) => {
            if (c.x >= centre) wipe(i);
          });
        },
        onComplete: () => {
          run.cells.forEach((_, i) => wipe(i));
          api.current?.advance();
        },
      }),
    );
  };

  /** The next phrase, printed over the ghost of this one. */
  const advance = () => {
    clearTimer();
    let next: Slot;
    if (!active) {
      next = {
        n: slot.n + 1,
        index: -1,
        text: done,
        final: true,
        printed: false,
      };
    } else {
      const index = slot.final ? 0 : (slot.index + 1) % list.length;
      next = {
        n: slot.n + 1,
        index,
        text: list[index] ?? "",
        final: false,
        printed: false,
      };
    }
    press.current = { phase: "print", next: 0, timer: null };
    setGhost({ n: slot.n, text: slot.text });
    setSlot(next);
    report.current?.(next.index);
  };

  const resume = () => {
    const pr = press.current;
    if (!running) return;
    if (pr.phase === "return") {
      if (!anims.current.has("headX") && !anims.current.has("return")) {
        carriageReturn(false);
      }
      return;
    }
    schedule();
  };

  const pause = () => {
    clearTimer();
    const pr = press.current;
    if (pr.phase === "return") {
      // Off screen mid-return: it picks up from where the head stands.
      anims.current.get("headX")?.stop();
      anims.current.delete("headX");
      anims.current.get("return")?.stop();
      anims.current.delete("return");
    }
  };

  const turn = (on: boolean) => {
    const pr = press.current;
    if (on) {
      if (slot.final && pr.phase !== "return") carriageReturn(false);
      return;
    }
    if (!slot.final && (pr.phase === "print" || pr.phase === "hold")) {
      carriageReturn(false);
    }
  };

  const byHand = () => {
    if (disabled) return;
    const pr = press.current;
    if (pr.phase === "print") {
      strike(true);
      // The rhythm waits a full beat after a hand's strike.
      schedule();
      return;
    }
    if (pr.phase === "hold") carriageReturn(true);
  };

  const setTempo = () => {
    const slow = over.current.pointer || over.current.focus;
    runAnim(
      "tempo",
      animate(
        tempo,
        slow ? SLOW : 1,
        motionSafe ? springs.drift : { duration: 0 },
      ),
    );
  };

  // Before any other layout effect, so a measure on arrival finds it.
  React.useLayoutEffect(() => {
    api.current = {
      tick: () => {
        strike(false);
        resume();
      },
      home: () => carriageReturn(false),
      advance,
      resume,
      pause,
      turn,
      measure,
    };
    report.current = onPhraseChange;
  });

  // The first phrase is state too: the host hears it from the first commit.
  React.useEffect(() => {
    report.current?.(slot.index);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (wasActive.current === active) return;
    wasActive.current = active;
    api.current?.turn(active);
  }, [active]);

  // A new phrase, the strip coming on screen, a new speed: the rhythm picks
  // up from wherever it stands.
  React.useEffect(() => {
    api.current?.resume();
    return () => api.current?.pause();
  }, [slot, running, rate]);

  // A new phrase is measured before it paints, which sets the head over its
  // first letter (or, for a line that arrives printed, past its last).
  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [run]);

  React.useEffect(() => {
    const running = anims.current;
    const struck = strikes;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const c of struck.current) c.stop();
      struck.current = [];
    };
  }, []);

  const bindStrip = React.useCallback((node: HTMLButtonElement | null) => {
    stripRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindLine = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setHeight(Math.round(node.offsetHeight));
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const bindLetter = (i: number) => (node: HTMLSpanElement | null) => {
    const key = `${slot.n}:${i}`;
    if (node) letters.current.set(key, node);
    else letters.current.delete(key);
  };

  const paperColour = `color-mix(in oklab, ${STOCK} 90%, var(--background))`;

  return (
    <>
      <div
        className={cn("relative w-full", className)}
        aria-busy={active || undefined}
      >
        <button
          ref={bindStrip}
          type="button"
          aria-label="Strike the next letter"
          aria-describedby={hintId}
          disabled={disabled}
          onPointerDown={(event) => {
            over.current.type = event.pointerType;
            // A key strikes on the way down, and so does a mouse button.
            if (event.pointerType === "mouse" && event.button === 0) byHand();
          }}
          onClick={(event) => {
            // No pointer behind it (Space, Enter, assistive technology), or
            // a finger's tap: the press strikes now.
            if (event.detail === 0 || over.current.type !== "mouse") byHand();
          }}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            over.current.pointer = true;
            setTempo();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            over.current.pointer = false;
            setTempo();
          }}
          onFocus={() => {
            over.current.focus = true;
            setTempo();
          }}
          onBlur={() => {
            over.current.focus = false;
            setTempo();
          }}
          className={cn(
            "@container relative block w-full touch-manipulation overflow-clip rounded-3 border border-hairline-strong text-left outline-none select-none [-webkit-touch-callout:none]",
            "shadow-[0_1px_2px_color-mix(in_oklab,black_10%,transparent)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-default" : "cursor-pointer",
          )}
          style={{
            backgroundColor: paperColour,
            backgroundImage: TOOTH,
            backgroundSize: "120px 120px",
          }}
        >
          {/* The rail, and the brackets that hold it. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-3 top-[8px] h-[3px] rounded-full"
            style={{
              background: `linear-gradient(${METAL_LIGHT}, ${METAL} 55%, ${METAL_DARK})`,
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-[4px] left-2 h-[11px] w-[5px] rounded-[1.5px]"
            style={{ background: METAL_DARK }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-[4px] right-2 h-[11px] w-[5px] rounded-[1.5px]"
            style={{ background: METAL_DARK }}
          />

          <motion.div
            initial={false}
            animate={{ height: height ?? "auto" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <div
              ref={bindLine}
              aria-hidden
              className="relative px-5 pt-8 pb-4 font-mono text-[15px] leading-6 @md:text-[17px]"
            >
              {ghost && ghostRun ? (
                <motion.div
                  key={ghost.n}
                  className="pointer-events-none absolute inset-x-0 top-0 px-5 pt-8"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 1.4, ease: easings.enter }}
                >
                  <Glyphs
                    chars={ghostRun.chars}
                    marks={ghostRun.marks}
                    pressure={p}
                    ink={inkColour}
                  />
                </motion.div>
              ) : null}
              <div className="relative">
                <Glyphs
                  chars={run.chars}
                  marks={run.marks}
                  pressure={p}
                  ink={inkColour}
                  cells={run.cells}
                  bind={bindLetter}
                />
              </div>
            </div>
          </motion.div>

          {/* The head: a carriage on the rail and a plunger with an inked face. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-[2px] left-0 block"
            style={{
              x: headX,
              width: HEAD_W,
              height: 30,
            }}
          >
            <motion.svg
              width={HEAD_W}
              height={30}
              viewBox="0 0 18 30"
              className="absolute inset-0 overflow-visible"
              style={{ y: plunge }}
            >
              <rect x={7.5} y={8} width={3} height={12} fill={METAL_DARK} />
              <rect x={3} y={19} width={12} height={5} rx={1} fill={METAL} />
              <rect
                x={3.5}
                y={23}
                width={11}
                height={1.6}
                rx={0.6}
                fill={inkColour}
              />
            </motion.svg>
            <svg
              width={HEAD_W}
              height={30}
              viewBox="0 0 18 30"
              className="absolute inset-0 overflow-visible"
            >
              <rect x={1} y={3} width={16} height={9} rx={2} fill={METAL} />
              <rect
                x={1.6}
                y={3.5}
                width={14.8}
                height={2.6}
                rx={1.2}
                fill={METAL_LIGHT}
                opacity={0.75}
              />
              <circle cx={9} cy={7.5} r={1.5} fill={METAL_DARK} />
            </svg>
          </motion.span>
        </button>
        <span id={hintId} className="sr-only">
          Press to strike the next letter by hand; hovering or focusing slows
          the press.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {slot.text}
      </p>
    </>
  );
}
