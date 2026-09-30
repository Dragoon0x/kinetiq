"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionStyle,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BrailleRiseProps = {
  /** The status phrases, embossed and printed one after another, cycled in order. */
  phrases: string[];
  /** Printing. False clears the line, prints `doneText` and stops. @default true */
  active?: boolean;
  /** What stays printed once inactive. @default the last phrase */
  doneText?: string;
  /** How fast the cells rise and print, 0.5 to 2. @default 1 */
  speed?: number;
  /** How deep the paper is pressed, 0 (flat ink dots) to 1 (a deep relief). @default 0.6 */
  emboss?: number;
  /** Show each letter's whole six-dot cell as faint pits until it is printed. @default true */
  cells?: boolean;
  /** Play the cells under the visitor's finger. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep printing, but the line cannot be read by hand. */
  disabled?: boolean;
  /** A phrase began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  className?: string;
};

/** The rise wave's step from one letter to the next, s at speed 1. */
const STEP = 0.055;
/** How long a cell stays up before it prints, s at speed 1. */
const DWELL = 0.65;
/** A printed phrase's rest, s at speed 1. */
const HOLD = 2.2;
/** The phrase fading before the next, s at speed 1. */
const CLEAR = 0.3;
/** A cell the finger has left sinks back after this long, ms. */
const LET_GO = 220;
/** A pressed cell stays up this long, ms. */
const PRESSED = 1000;

/** Dot pitch and dot size, em: a cell is always narrower than a mono slot. */
const PITCH = 0.3;
const DOT = 0.2;
const PIT = 0.11;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

/** Grade 1 braille, as the dot numbers of each cell. */
const CELL_DOTS: Record<string, string> = {
  a: "1",
  b: "12",
  c: "14",
  d: "145",
  e: "15",
  f: "124",
  g: "1245",
  h: "125",
  i: "24",
  j: "245",
  k: "13",
  l: "123",
  m: "134",
  n: "1345",
  o: "135",
  p: "1234",
  q: "12345",
  r: "1235",
  s: "234",
  t: "2345",
  u: "136",
  v: "1236",
  w: "2456",
  x: "1346",
  y: "13456",
  z: "1356",
  // The digits share the first ten letters' cells.
  "1": "1",
  "2": "12",
  "3": "14",
  "4": "145",
  "5": "15",
  "6": "124",
  "7": "1245",
  "8": "125",
  "9": "24",
  "0": "245",
  ",": "2",
  ";": "23",
  ":": "25",
  ".": "256",
  "!": "235",
  "?": "236",
  "'": "3",
  "-": "36",
  "/": "34",
};

/** Dots 1–3 run down the left column, 4–6 down the right. */
const SITES = [1, 2, 3, 4, 5, 6].map((d) => ({
  d,
  left: r3(d > 3 ? PITCH : 0),
  top: r3(((d - 1) % 3) * PITCH),
}));

const dotsOf = (ch: string) => CELL_DOTS[ch.toLowerCase()] ?? "";

/** A CSS custom property carried by a motion value (motion sets it with setProperty). */
const cssVar = (name: `--${string}`, value: MotionValue<number>) =>
  ({ [name]: value }) as MotionStyle;

type Cell = {
  lift: MotionValue<number>;
  ink: MotionValue<number>;
  dots: string;
};

/** Where each cell of the phrase stands, kept apart from the render. */
type Marks = {
  n: number;
  /** Where the print run has it: 0 blank, 1 raised, 2 printed. */
  base: number[];
  /** How far the visitor's finger holds it up, 0 to 1. */
  touch: number[];
};

type Plan = {
  chars: string[];
  cells: Cell[];
  words: { key: number; at: number[] }[];
};

function planOf(text: string, printed: boolean): Plan {
  const chars = Array.from(text);
  const words: { key: number; at: number[] }[] = [];
  let current: number[] = [];
  chars.forEach((ch, i) => {
    if (ch.trim() === "") {
      if (current.length) words.push({ key: i, at: current });
      current = [];
      return;
    }
    current.push(i);
  });
  if (current.length) words.push({ key: chars.length, at: current });
  return {
    chars,
    words,
    cells: chars.map((ch) => ({
      lift: motionValue(0),
      ink: motionValue(printed ? 1 : 0),
      dots: dotsOf(ch),
    })),
  };
}

type Slot = { n: number; index: number; text: string; final: boolean };
type Box = { x: number; y: number; w: number; h: number };

type Phase = "wave" | "hold" | "clear" | "done";
type Engine = {
  phase: Phase;
  risen: number;
  flat: number;
  timer: number | null;
  /** When the pending beat is due (performance.now ms); kept across a pause. */
  until: number | null;
  /** What was left of that wait when the line was paused, ms. */
  left: number | null;
};

type Api = {
  resume: () => void;
  pause: () => void;
  tick: (t: number) => void;
  hold: () => void;
  clear: (force?: boolean) => void;
  advance: () => void;
  turn: (on: boolean) => void;
  measure: () => void;
  release: (i: number) => void;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/** A cell's box, em: two columns and three rows of dots. */
const CELL_W = r3(PITCH + DOT);
const CELL_H = r3(2 * PITCH + DOT);

/**
 * The paper's look for an emboss depth, as custom properties set once on the
 * surface: every dot is a pair of background layers that read them, so a
 * letter's cell is one element however many dots it has. Shallow dots are
 * ink; deep ones are the paper itself, read by the light from the upper left.
 */
function paperOf(emboss: number, grow: number): React.CSSProperties {
  const e = clamp(emboss, 0, 1);
  const base = `color-mix(in oklab, var(--foreground) ${Math.round(lerp(78, 20, e))}%, var(--card))`;
  const pits = SITES.map(
    (s) =>
      `var(--br-pit) ${r3(s.left + (DOT - PIT) / 2)}em ${r3(s.top + (DOT - PIT) / 2)}em / ${PIT}em ${PIT}em no-repeat`,
  ).join(", ");
  return {
    "--br-base": base,
    "--br-light": `color-mix(in oklab, ${base} ${Math.round(100 - 75 * e)}%, white)`,
    "--br-dark": `color-mix(in oklab, ${base} ${Math.round(100 - 50 * e)}%, black)`,
    "--br-shade": `color-mix(in oklab, black ${Math.round(20 + 25 * e)}%, transparent)`,
    "--br-rim": `color-mix(in oklab, white ${Math.round(35 * e)}%, transparent)`,
    "--br-depth": r2(1.8 * e),
    "--br-grow": r2(0.55 * grow),
    "--br-hl":
      "radial-gradient(circle at 35% 30%, var(--br-light), transparent 50%)",
    "--br-disk":
      "radial-gradient(circle closest-side, var(--br-base) 50%, var(--br-dark) 86%, transparent 100%)",
    "--br-pit":
      "radial-gradient(circle closest-side, color-mix(in oklab, var(--foreground) 18%, transparent) 72%, transparent 100%)",
    "--br-pits": pits,
  } as React.CSSProperties;
}

/** The raised dots of one cell: the swell, the fade and the cast shadow follow `--lift`. */
const DOTS: React.CSSProperties = {
  width: `${CELL_W}em`,
  height: `${CELL_H}em`,
  backgroundSize: `${DOT}em ${DOT}em`,
  backgroundRepeat: "no-repeat",
  opacity: "calc(var(--lift) * 1.6)",
  transform:
    "translate(-50%, -50%) scale(calc(1 - var(--br-grow) * (1 - var(--lift))))",
  filter:
    "drop-shadow(calc(var(--lift) * var(--br-depth) * 0.7px) calc(var(--lift) * var(--br-depth) * 0.9px) calc(var(--lift) * var(--br-depth) * 0.8px) var(--br-shade)) drop-shadow(calc(var(--lift) * var(--br-depth) * -0.4px) calc(var(--lift) * var(--br-depth) * -0.4px) 0px var(--br-rim))",
};

const PITS: React.CSSProperties = {
  width: `${CELL_W}em`,
  height: `${CELL_H}em`,
  background: "var(--br-pits)",
  opacity: "calc(1 - var(--ink))",
  transform: "translate(-50%, -50%)",
};

const GLYPH: React.CSSProperties = {
  opacity: "var(--ink)",
  filter: "blur(calc((1 - var(--ink)) * 1.5px))",
};

function Letter({
  char,
  cell,
  pits,
  bind,
}: {
  char: string;
  cell: Cell;
  pits: boolean;
  bind: (node: HTMLSpanElement | null) => void;
}) {
  const raised = SITES.filter((s) => cell.dots.includes(String(s.d)));
  return (
    <motion.span
      ref={bind}
      className="relative inline-block"
      style={{ ...cssVar("--lift", cell.lift), ...cssVar("--ink", cell.ink) }}
    >
      <span className="relative" style={GLYPH}>
        {char}
      </span>
      {char.trim() !== "" && pits ? (
        <span
          className="pointer-events-none absolute top-1/2 left-1/2"
          style={PITS}
        />
      ) : null}
      {raised.length ? (
        <span
          className="pointer-events-none absolute top-1/2 left-1/2"
          style={{
            ...DOTS,
            backgroundImage: raised
              .map(() => "var(--br-hl), var(--br-disk)")
              .join(", "),
            backgroundPosition: raised
              .map((s) => `${s.left}em ${s.top}em, ${s.left}em ${s.top}em`)
              .join(", "),
          }}
        />
      ) : null}
    </motion.span>
  );
}

/**
 * A status line that is felt before it is read. Each letter first rises as
 * its real six-dot braille cell — the dots come up out of the paper on the
 * snap spring, and the one overshoot brightens each dome as it catches the
 * light — then, a moment behind, the dots sink back and the printed letter
 * comes up out of them. A band of raised cells rides across the line ahead
 * of the print. The printed phrase rests, fades, and the next one rises.
 *
 * Reading by hand: moving the pointer along the line lifts the cells under
 * it again, like a finger reading, and they sink back once it has passed; a
 * press pops a cell up on the recoil spring. The line is a slider over its
 * letters: Left and Right move a reading caret that raises the cell under it,
 * its value names the letter and its dots, and Space or Enter presses. Each
 * letter's height is one motion value written as a CSS variable, so the dots
 * are shaded in `calc()` without a style write each. The phrase is in a
 * polite live region, announced once. Under reduced motion dots appear and
 * sink with fades and nothing swells.
 */
export function BrailleRise({
  phrases,
  active = true,
  doneText,
  speed = 1,
  emboss = 0.6,
  cells = true,
  sound = false,
  disabled = false,
  onPhraseChange,
  className,
}: BrailleRiseProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rate = clamp(speed, 0.5, 2);
  const depth = clamp(emboss, 0, 1);
  const paper = React.useMemo(
    () => paperOf(depth, motionSafe ? depth : 0),
    [depth, motionSafe],
  );
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
      ? { n: 0, index: 0, text: list[0] ?? "", final: false }
      : { n: 0, index: -1, text: done, final: true },
  );
  const plan = React.useMemo(() => planOf(slot.text, slot.final), [slot]);
  const [height, setHeight] = React.useState<number | null>(null);
  const [caret, setCaret] = React.useState(0);
  // Keys can arrive faster than renders: the caret they move is read here.
  const caretAt = React.useRef(0);

  const wave = useMotionValue(0);
  const sheet = useMotionValue(1);
  const caretX = useMotionValue(0);
  const caretY = useMotionValue(0);
  const caretW = useMotionValue(0);

  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const lineRef = React.useRef<HTMLDivElement | null>(null);
  const letters = React.useRef(new Map<string, HTMLSpanElement>());
  const boxes = React.useRef<(Box | null)[]>([]);
  const engine = React.useRef<Engine>({
    phase: slot.final ? "done" : "wave",
    risen: 0,
    flat: 0,
    timer: null,
    until: null,
    left: null,
  });
  const waveRun = React.useRef<AnimationPlaybackControls | null>(null);
  const sheetRun = React.useRef<AnimationPlaybackControls | null>(null);
  const cellRuns = React.useRef(new Map<string, AnimationPlaybackControls>());
  const letGo = React.useRef(new Map<number, number>());
  const touched = React.useRef(new Set<number>());
  const reading = React.useRef(-1);
  const marks = React.useRef<Marks>({ n: -1, base: [], touch: [] });
  const keyed = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onPhraseChange);
  const wasActive = React.useRef(active);

  const n = plan.chars.length;
  const end = Math.max(0, n - 1) * STEP + DWELL + 0.3;

  const run = (key: string, controls: AnimationPlaybackControls) => {
    cellRuns.current.get(key)?.stop();
    cellRuns.current.set(key, controls);
  };

  const stopCells = () => {
    for (const c of cellRuns.current.values()) c.stop();
    cellRuns.current.clear();
  };

  const clearTimer = () => {
    const e = engine.current;
    if (e.timer !== null) window.clearTimeout(e.timer);
    e.timer = null;
  };

  const stopWave = () => {
    waveRun.current?.stop();
    waveRun.current = null;
  };

  /** This phrase's cell states, laid fresh the first time a phrase asks. */
  const marksOf = () => {
    const m = marks.current;
    if (m.n !== slot.n) {
      m.n = slot.n;
      m.base = plan.chars.map(() => (slot.final ? 2 : 0));
      m.touch = plan.chars.map(() => 0);
    }
    return m;
  };

  /** A cell goes where the print run and the finger together put it. */
  const apply = (i: number, pop = false) => {
    const cell = plan.cells[i];
    const m = marksOf();
    if (!cell) return;
    const base = m.base[i] ?? 0;
    const touch = Math.min(1, m.touch[i] ?? 0);
    const lift = Math.max(base === 1 ? 1 : 0, touch);
    const ink = (base === 2 ? 1 : 0) * (1 - touch);
    const now = cell.lift.get();
    if (!motionSafe) {
      run(
        `${i}l`,
        animate(cell.lift, lift, { duration: durations.fast, ease: "linear" }),
      );
    } else if (pop) {
      // A press: the paper gives and springs back past its rest, twice.
      run(
        `${i}l`,
        animate(cell.lift, lift, { ...springs.recoil, velocity: 9 }),
      );
    } else if (lift > now) {
      run(`${i}l`, animate(cell.lift, lift, springs.snap));
    } else if (lift < now) {
      run(
        `${i}l`,
        animate(cell.lift, lift, {
          duration: durations.slow,
          ease: easings.enter,
        }),
      );
    }
    if (Math.abs(cell.ink.get() - ink) > 0.001) {
      run(
        `${i}i`,
        animate(cell.ink, ink, {
          duration: motionSafe ? durations.slow : durations.fast,
          ease: easings.enter,
        }),
      );
    }
  };

  /** The print run's clock: cells rise at their step and print a dwell later. */
  const tick = (t: number) => {
    const e = engine.current;
    if (e.phase !== "wave") return;
    const m = marksOf();
    while (e.risen < n && t >= e.risen * STEP) {
      if ((m.base[e.risen] ?? 0) === 0) {
        m.base[e.risen] = 1;
        apply(e.risen);
      }
      e.risen += 1;
    }
    while (e.flat < n && t >= e.flat * STEP + DWELL) {
      m.base[e.flat] = 2;
      apply(e.flat);
      e.flat += 1;
    }
  };

  /** The engine's next move after a wait; the deadline survives a pause. */
  const beat = (seconds: number, then: () => void) => {
    const e = engine.current;
    clearTimer();
    if (!running) return;
    const now = performance.now();
    if (e.until === null) {
      e.until = now + (e.left ?? (seconds / rate) * 1000);
      e.left = null;
    }
    e.timer = window.setTimeout(
      () => {
        e.timer = null;
        e.until = null;
        e.left = null;
        then();
      },
      Math.max(0, Math.round(e.until - now)),
    );
  };

  const schedule = () => {
    clearTimer();
    stopWave();
    if (!running) return;
    const e = engine.current;
    switch (e.phase) {
      case "done":
        return;
      case "wave": {
        const from = wave.get();
        e.until = null;
        e.left = null;
        if (from >= end) {
          hold();
          return;
        }
        waveRun.current = animate(wave, end, {
          duration: (end - from) / rate,
          ease: "linear",
          onComplete: () => api.current?.hold(),
        });
        return;
      }
      case "hold":
        beat(HOLD, () => api.current?.clear());
        return;
      case "clear":
        beat(CLEAR, () => api.current?.advance());
        return;
    }
  };

  const hold = () => {
    const e = engine.current;
    if (e.phase !== "wave") return;
    tick(Number.MAX_SAFE_INTEGER);
    e.phase = "hold";
    e.until = null;
    e.left = null;
    schedule();
  };

  const clear = (force = false) => {
    const e = engine.current;
    // A reader's finger or caret is on the line: it waits for them, rather
    // than changing the words under them. Only the host ending it cannot wait.
    if (!force && (keyed.current || touched.current.size > 0)) {
      e.until = null;
      e.left = null;
      beat(HOLD / 2, () => api.current?.clear());
      return;
    }
    stopWave();
    clearTimer();
    e.phase = "clear";
    e.until = null;
    e.left = null;
    sheetRun.current?.stop();
    sheetRun.current = animate(sheet, 0, {
      duration: (CLEAR * 0.9) / rate,
      ease: easings.exit,
    });
    schedule();
  };

  const advance = () => {
    clearTimer();
    stopWave();
    stopCells();
    for (const t of letGo.current.values()) window.clearTimeout(t);
    letGo.current.clear();
    touched.current.clear();
    reading.current = -1;
    const next: Slot = !active
      ? { n: slot.n + 1, index: -1, text: done, final: true }
      : (() => {
          const index = slot.final ? 0 : (slot.index + 1) % list.length;
          return {
            n: slot.n + 1,
            index,
            text: list[index] ?? "",
            final: false,
          };
        })();
    // Rewound while the engine still says "clear", so the old plan's cells
    // never hear the clock go back to zero.
    wave.set(0);
    engine.current = {
      phase: next.final ? "done" : "wave",
      risen: 0,
      flat: 0,
      timer: null,
      until: null,
      left: null,
    };
    sheetRun.current?.stop();
    sheetRun.current = animate(sheet, 1, {
      duration: durations.base,
      ease: easings.enter,
    });
    setSlot(next);
    caretAt.current = 0;
    setCaret(0);
    report.current?.(next.index);
  };

  const turn = (on: boolean) => {
    const e = engine.current;
    if (e.phase === "clear") return;
    if (on ? slot.final : !slot.final) clear(true);
  };

  const measure = () => {
    const line = lineRef.current;
    const surface = surfaceRef.current;
    if (!line || !surface) return;
    const rect = surface.getBoundingClientRect();
    boxes.current = plan.chars.map((_, i) => {
      const node = letters.current.get(`${slot.n}:${i}`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {
        x: r2(r.left - rect.left - surface.clientLeft),
        y: r2(r.top - rect.top - surface.clientTop),
        w: r2(r.width),
        h: r2(r.height),
      };
    });
    placeCaret(caretAt.current);
  };

  const placeCaret = (i: number) => {
    const box = boxes.current[i];
    if (!box) return;
    caretX.set(r2(box.x + box.w * 0.2));
    caretW.set(r2(box.w * 0.6));
    caretY.set(r2(box.y + box.h - 7));
  };

  const release = (i: number) => {
    letGo.current.delete(i);
    const m = marksOf();
    if (!m.touch[i]) return;
    m.touch[i] = 0;
    touched.current.delete(i);
    apply(i);
  };

  /** Lifts the cell under the finger fully and its neighbours halfway. */
  const feel = (center: number, pop = false) => {
    const want = new Map<number, number>();
    if (center >= 0) {
      want.set(center, 1);
      for (const j of [center - 1, center + 1]) {
        if (j >= 0 && j < n && (plan.chars[j] ?? " ").trim() !== "") {
          want.set(j, 0.45);
        }
      }
    }
    const m = marksOf();
    for (const [i, level] of want) {
      const pending = letGo.current.get(i);
      if (pending !== undefined) window.clearTimeout(pending);
      letGo.current.delete(i);
      if (i >= m.touch.length) continue;
      if (m.touch[i] !== level || (pop && i === center)) {
        m.touch[i] = level;
        touched.current.add(i);
        apply(i, pop && i === center);
      }
    }
    for (const i of touched.current) {
      if (want.has(i) || letGo.current.has(i)) continue;
      letGo.current.set(
        i,
        window.setTimeout(() => api.current?.release(i), LET_GO),
      );
    }
    if (center !== reading.current && center >= 0 && !pop) {
      const cell = plan.cells[center];
      const box = boxes.current[center];
      if (cell && cell.dots) {
        const surface = surfaceRef.current;
        const pan =
          surface && box
            ? panFrom(
                surface.getBoundingClientRect().left + box.x + box.w / 2,
                surface,
              )
            : 0;
        audio.play("tick", {
          pitch: r2(1.35 - 0.09 * cell.dots.length),
          gain: 0.32,
          pan,
        });
      }
    }
    if (center >= 0) reading.current = center;
  };

  const letAllGo = () => {
    reading.current = -1;
    feel(-1);
  };

  /** The letter under a point, in the surface's own coordinates. */
  const letterAt = (clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return -1;
    const rect = surface.getBoundingClientRect();
    const x = clientX - rect.left - surface.clientLeft;
    const y = clientY - rect.top - surface.clientTop;
    let best = -1;
    let bestD = Infinity;
    boxes.current.forEach((box, i) => {
      if (!box) return;
      const dy =
        y < box.y ? box.y - y : y > box.y + box.h ? y - box.y - box.h : 0;
      const dx =
        x < box.x ? box.x - x : x > box.x + box.w ? x - box.x - box.w : 0;
      const d = dy * 4 + dx;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return bestD <= 14 ? best : -1;
  };

  const readAt = (clientX: number, clientY: number, pop = false) => {
    if (disabled) return;
    const i = letterAt(clientX, clientY);
    if (i < 0) {
      letAllGo();
      return;
    }
    if (pop) {
      pressAt(i);
      return;
    }
    feel(i);
  };

  const pressAt = (i: number) => {
    const cell = plan.cells[i];
    if (!cell || (plan.chars[i] ?? " ").trim() === "") return;
    feel(i, true);
    const pending = letGo.current.get(i);
    if (pending !== undefined) window.clearTimeout(pending);
    letGo.current.set(
      i,
      window.setTimeout(() => api.current?.release(i), PRESSED),
    );
    const surface = surfaceRef.current;
    const box = boxes.current[i];
    audio.play("pop", {
      pitch: r2(0.9 + 0.05 * cell.dots.length),
      gain: 0.5,
      pan:
        surface && box
          ? panFrom(
              surface.getBoundingClientRect().left + box.x + box.w / 2,
              surface,
            )
          : 0,
    });
  };

  const moveCaret = (i: number) => {
    const to = clamp(i, 0, Math.max(0, n - 1));
    keyed.current = true;
    caretAt.current = to;
    setCaret(to);
    placeCaret(to);
    feel(to);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onMove: ({ point }) => readAt(point.x, point.y),
    onEnd: () => letAllGo(),
    onCancel: () => letAllGo(),
    onTap: (event) => readAt(event.clientX, event.clientY, true),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || n === 0) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveCaret(caretAt.current + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveCaret(caretAt.current - 1);
        return;
      case "Home":
        event.preventDefault();
        moveCaret(0);
        return;
      case "End":
        event.preventDefault();
        moveCaret(n - 1);
        return;
      case " ":
      case "Enter":
        event.preventDefault();
        if (!event.repeat) {
          if (!keyed.current) moveCaret(caretAt.current);
          pressAt(caretAt.current);
        }
        return;
    }
  };

  React.useLayoutEffect(() => {
    api.current = {
      resume: schedule,
      pause: () => {
        clearTimer();
        stopWave();
        // Off screen or hidden, a wait is frozen, not spent.
        const e = engine.current;
        if (e.until !== null) {
          e.left = Math.max(0, e.until - performance.now());
          e.until = null;
        }
      },
      tick,
      hold,
      clear,
      advance,
      turn,
      measure,
      release,
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

  React.useEffect(() => {
    api.current?.resume();
    return () => api.current?.pause();
  }, [slot, running, rate]);

  React.useEffect(() => wave.on("change", (t) => api.current?.tick(t)), [wave]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [plan]);

  // A cell left raised by a finger or a key goes back when reading stops.
  React.useEffect(() => {
    if (!disabled) return;
    for (const i of [...touched.current]) api.current?.release(i);
  }, [disabled]);

  React.useEffect(() => {
    const timers = letGo.current;
    const runs = cellRuns.current;
    return () => {
      waveRun.current?.stop();
      waveRun.current = null;
      sheetRun.current?.stop();
      for (const c of runs.values()) c.stop();
      runs.clear();
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
      const e = engine.current;
      if (e.timer !== null) window.clearTimeout(e.timer);
      e.timer = null;
    };
  }, []);

  const bindSurface = React.useCallback((node: HTMLDivElement | null) => {
    surfaceRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const bindLine = React.useCallback((node: HTMLDivElement | null) => {
    lineRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setHeight(Math.round(node.offsetHeight));
      api.current?.measure();
    });
    sizer.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => sizer.disconnect();
  }, []);

  const bindLetter = (key: string) => (node: HTMLSpanElement | null) => {
    if (node) letters.current.set(key, node);
    else letters.current.delete(key);
  };

  const at = clamp(caret, 0, Math.max(0, n - 1));
  const ch = plan.chars[at] ?? "";
  const dots = plan.cells[at]?.dots ?? "";
  const valueText =
    ch.trim() === ""
      ? `Space, letter ${at + 1} of ${n}`
      : `${ch}, ${dots ? `dots ${dots.split("").join(" ")}` : "no dots"}, letter ${at + 1} of ${n}`;

  return (
    <>
      <div
        className={cn("@container relative w-full", className)}
        aria-busy={active || undefined}
      >
        <div
          ref={bindSurface}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Read the braille"
          aria-describedby={hintId}
          aria-orientation="horizontal"
          aria-valuemin={1}
          aria-valuemax={Math.max(1, n)}
          aria-valuenow={Math.min(at + 1, Math.max(1, n))}
          aria-valuetext={valueText}
          aria-disabled={disabled || undefined}
          {...drag}
          onPointerMove={(event) => {
            drag.onPointerMove(event);
            if (event.pointerType === "mouse" && event.buttons === 0) {
              readAt(event.clientX, event.clientY);
            }
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") letAllGo();
          }}
          onKeyDown={onKeyDown}
          onFocus={(event) => {
            // Arriving by keyboard, the finger rests on the caret's letter.
            if (disabled || !event.currentTarget.matches(":focus-visible")) {
              return;
            }
            moveCaret(caretAt.current);
          }}
          onBlur={() => {
            keyed.current = false;
            letAllGo();
          }}
          onContextMenu={(event) => event.preventDefault()}
          className={cn(
            "group/braille-rise relative block touch-pan-y overflow-clip rounded-3 border border-hairline bg-card px-4 py-1 outline-none select-none [-webkit-touch-callout:none] @md:px-5",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-default" : "cursor-pointer",
          )}
          style={paper}
        >
          <motion.div
            aria-hidden
            initial={false}
            animate={{ height: height ?? "auto" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <motion.div
              key={slot.n}
              ref={bindLine}
              className="font-mono text-[18px] leading-[42px] text-foreground @md:text-[22px] @md:leading-[48px]"
              style={{ opacity: sheet }}
            >
              {plan.words.map((word, w) => (
                <React.Fragment key={word.key}>
                  {w > 0 ? " " : null}
                  <span className="inline-block whitespace-nowrap">
                    {word.at.map((i) => (
                      <Letter
                        key={i}
                        char={plan.chars[i] ?? ""}
                        cell={plan.cells[i] as Cell}
                        pits={cells}
                        bind={bindLetter(`${slot.n}:${i}`)}
                      />
                    ))}
                  </span>
                </React.Fragment>
              ))}
            </motion.div>
          </motion.div>
          {/* The reading caret: shown while the keyboard is reading. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 h-0.5 rounded-full bg-cobalt-bright opacity-0 group-focus-visible/braille-rise:opacity-100"
            style={{ x: caretX, y: caretY, width: caretW }}
          />
        </div>
        <span id={hintId} className="sr-only">
          Move the pointer along the line, or use Left and Right, to raise the
          cells again; press to feel one.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {slot.text}
      </p>
    </>
  );
}
