"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LensSweepLens = "round" | "bar";

export type LensSweepProps = {
  /** The status phrases, read over one after another and cycled in order. */
  phrases: string[];
  /** Reading. False puts the lens down and leaves `doneText` sharp and still. @default true */
  active?: boolean;
  /** What stays, read, once inactive. @default the last phrase */
  doneText?: string;
  /** How long the lens checks each word and rests on a read phrase, 0.5 to 2. @default 1 */
  speed?: number;
  /** How much the lens magnifies, 1.2 to 2. @default 1.5 */
  zoom?: number;
  /** How soft the words outside the lens are, 0 to 4 px. @default 1.5 */
  blur?: number;
  /** A jeweller's loupe, or a reading bar that magnifies a wider span. @default "round" */
  lens?: LensSweepLens;
  /** Play the lens under the visitor's hand. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep reading, but the lens cannot be moved by hand or by key. */
  disabled?: boolean;
  /** A phrase began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  /** The lens came to a word: its index in the phrase. */
  onWordChange?: (word: number) => void;
  className?: string;
};

/** A word is checked for this long, plus a little a letter, s at speed 1. */
const DWELL = 0.22;
const PER_LETTER = 0.035;
/** A read phrase's rest, s at speed 1. */
const REST = 1.2;
/** The phrase fading before the next, s at speed 1. */
const CLEAR = 0.3;
/** After a key moves the lens, reading waits this long, s. */
const KEY_WAIT = 1;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

type Word = { key: number; text: string; at: number };
type Plan = { words: Word[] };

function planOf(text: string): Plan {
  const words: Word[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    words.push({ key: m.index, text: m[0], at: words.length });
  }
  return { words };
}

type Box = { x: number; y: number; w: number; h: number };
type Layout = {
  width: number;
  height: number;
  lineH: number;
  /** The surface's padding: how far the lens may lean out of the text. */
  padX: number;
  padY: number;
  boxes: (Box | null)[];
};

type Slot = { n: number; index: number; text: string; final: boolean };

type Phase = "read" | "dwell" | "wait" | "rest" | "clear" | "drag" | "done";
type Engine = {
  phase: Phase;
  word: number;
  timer: number | null;
  until: number | null;
  /** What was left of that wait when the lens was paused, ms. */
  left: number | null;
  /** The word a glide is heading for, or -1. */
  gliding: number;
  /** A key moved the lens: reading waits a moment after the check. */
  keyed: boolean;
};

type Api = {
  resume: () => void;
  pause: () => void;
  arrived: (k: number) => void;
  next: () => void;
  clear: () => void;
  advance: () => void;
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

function Words({
  plan,
  bind,
}: {
  plan: Plan;
  bind?: (k: number) => (node: HTMLSpanElement | null) => void;
}) {
  return (
    <>
      {plan.words.map((word, k) => (
        <React.Fragment key={word.key}>
          {k > 0 ? " " : null}
          <span ref={bind?.(k)} className="inline-block whitespace-nowrap">
            {word.text}
          </span>
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * A status line read over by a loupe. Outside the lens the words are soft
 * and faint; under it they are sharp, full ink and magnified about the lens's
 * centre, the way glass swells what it covers. The lens reads in saccades: it
 * glides from word to word on the glide spring, rest to rest, and pauses on
 * each as if checking it — a hairline check draws under the word and stays as
 * the lens moves on. A read phrase rests, fades, and the lens makes its return
 * sweep to the next one.
 *
 * The lens can be picked up and dragged anywhere along the text, 1:1 under the
 * finger and rubber-banded at the ends, ticking as it enters each word; let go,
 * it settles on the nearest word with the throw's velocity, checks it, and
 * reads on from there. It is a real slider over the words: Left and Right move
 * it a word, Home and End to the ends, and reading waits a moment after each
 * key. Two copies of the line share one layout: a still, blurred page copy,
 * and a clipped copy scaled from its corner and shifted by the centre times
 * one minus the zoom. The phrase is in a polite live region, announced once.
 * Under reduced motion the lens appears at each word instead of gliding.
 */
export function LensSweep({
  phrases,
  active = true,
  doneText,
  speed = 1,
  zoom = 1.5,
  blur = 1.5,
  lens = "round",
  sound = false,
  disabled = false,
  onPhraseChange,
  onWordChange,
  className,
}: LensSweepProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rate = clamp(speed, 0.5, 2);
  const z = r2(clamp(zoom, 1.2, 2));
  const soft = r2(clamp(blur, 0, 4));
  const bar = lens === "bar";
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
  const plan = React.useMemo(() => planOf(slot.text), [slot]);
  const [layout, setLayout] = React.useState<Layout | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  const [checked, setChecked] = React.useState(slot.final ? 1e9 : 0);
  const [at, setAt] = React.useState(0);

  const lensX = useMotionValue(0);
  const lensY = useMotionValue(0);
  const nod = useMotionValue(0);
  const lensOn = useMotionValue(0);
  const sheet = useMotionValue(1);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const wordNodes = React.useRef(new Map<string, HTMLSpanElement>());
  const engine = React.useRef<Engine>({
    phase: slot.final ? "done" : "read",
    word: 0,
    timer: null,
    until: null,
    left: null,
    gliding: -1,
    keyed: false,
  });
  const glides = React.useRef<AnimationPlaybackControls[]>([]);
  const glideToken = React.useRef(0);
  const others = React.useRef(new Map<string, AnimationPlaybackControls>());
  const grab = React.useRef({
    x: 0,
    y: 0,
    word: -1,
    /** Pressed off the glass: a drag brings the lens to the finger. */
    away: false,
    /** Where the press landed, in the stage. */
    px: 0,
    py: 0,
  });
  const placed = React.useRef(-1);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onPhraseChange, onWordChange });
  const wasActive = React.useRef(active);

  const n = plan.words.length;
  const lineH = layout?.lineH ?? 52;
  const radius = Math.round(lineH * 0.75);
  const halfW = bar ? Math.round(lineH * 1.6) : radius;
  const halfH = bar ? Math.round(lineH * 0.62) : radius;

  const run = (key: string, controls: AnimationPlaybackControls) => {
    others.current.get(key)?.stop();
    others.current.set(key, controls);
  };

  const stopGlide = () => {
    glideToken.current += 1;
    for (const g of glides.current) g.stop();
    glides.current = [];
    engine.current.gliding = -1;
  };

  const clearTimer = () => {
    const e = engine.current;
    if (e.timer !== null) window.clearTimeout(e.timer);
    e.timer = null;
  };

  const beat = (seconds: number, then: () => void, scaled = true) => {
    const e = engine.current;
    clearTimer();
    if (!running) return;
    const now = performance.now();
    if (e.until === null) {
      e.until = now + (e.left ?? (scaled ? seconds / rate : seconds) * 1000);
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

  /** Where the lens rests to read a word: its centre, kept inside the box. */
  const spotOf = (k: number) => {
    const box = layout?.boxes[k];
    if (!layout || !box) return null;
    return {
      x: r2(
        clamp(
          box.x + box.w / 2,
          halfW - layout.padX + 2,
          layout.width + layout.padX - halfW - 2,
        ),
      ),
      y: r2(
        clamp(
          box.y + box.h / 2,
          halfH - layout.padY + 2,
          layout.height + layout.padY - halfH - 2,
        ),
      ),
    };
  };

  /** Just past the phrase's end: where a finished lens is put down. */
  const restSpot = () => {
    if (!layout) return null;
    let last: Box | null = null;
    for (const b of layout.boxes) if (b) last = b;
    if (!last) return null;
    return {
      x: r2(
        clamp(
          last.x + last.w + halfW + 10,
          halfW - layout.padX + 2,
          layout.width + layout.padX - halfW - 2,
        ),
      ),
      y: r2(last.y + last.h / 2),
    };
  };

  const glideTo = (
    k: number,
    velocity: { x: number; y: number } = { x: 0, y: 0 },
  ) => {
    const spot = spotOf(k);
    if (!spot) return;
    stopGlide();
    const e = engine.current;
    e.gliding = k;
    if (!motionSafe) {
      // Appears at the word: no travel, a short fade to say it moved.
      lensX.set(spot.x);
      lensY.set(spot.y);
      lensOn.set(0.35);
      run(
        "on",
        animate(lensOn, 1, { duration: durations.fast, ease: easings.enter }),
      );
      e.gliding = -1;
      api.current?.arrived(k);
      return;
    }
    // Arrived when both axes have come to rest, and only for this glide:
    // one that was stopped or replaced never reports.
    const token = glideToken.current;
    let resting = 0;
    const settle = () => {
      resting += 1;
      if (resting < 2 || glideToken.current !== token) return;
      engine.current.gliding = -1;
      api.current?.arrived(k);
    };
    glides.current = [
      animate(lensX, spot.x, {
        ...springs.glide,
        velocity: velocity.x,
        onComplete: settle,
      }),
      animate(lensY, spot.y, {
        ...springs.glide,
        velocity: velocity.y,
        onComplete: settle,
      }),
    ];
  };

  /** The lens has come to rest on a word: it checks it. */
  const arrived = (k: number) => {
    const e = engine.current;
    if (e.phase !== "read") return;
    e.phase = "dwell";
    e.until = null;
    e.left = null;
    setAt(k);
    setChecked((c) => Math.max(c, k + 1));
    report.current.onWordChange?.(k);
    if (motionSafe) {
      run(
        "nod",
        animate(nod, [0, 1.5, 0], {
          duration: 0.32,
          times: [0, 0.35, 1],
          ease: easings.move,
        }),
      );
    }
    schedule();
  };

  const next = () => {
    const e = engine.current;
    if (e.phase === "dwell" && e.keyed) {
      e.keyed = false;
      e.phase = "wait";
      e.until = null;
      e.left = null;
      schedule();
      return;
    }
    if (e.word + 1 < n) {
      e.word += 1;
      e.phase = "read";
    } else {
      e.phase = "rest";
    }
    e.until = null;
    e.left = null;
    schedule();
  };

  /** The lens's next move, from where it stands. */
  const schedule = () => {
    clearTimer();
    const e = engine.current;
    if (!running || !layout) {
      stopGlide();
      return;
    }
    switch (e.phase) {
      case "done":
      case "drag":
        return;
      case "read":
        if (e.gliding !== e.word) glideTo(e.word);
        return;
      case "dwell": {
        const word = plan.words[e.word];
        beat(DWELL + PER_LETTER * (word?.text.length ?? 0), () =>
          api.current?.next(),
        );
        return;
      }
      case "wait":
        beat(
          KEY_WAIT,
          () => {
            const now = engine.current;
            now.phase = "dwell";
            api.current?.next();
          },
          false,
        );
        return;
      case "rest":
        beat(REST, () => api.current?.clear());
        return;
      case "clear":
        beat(CLEAR, () => api.current?.advance());
        return;
    }
  };

  const clear = () => {
    const e = engine.current;
    stopGlide();
    clearTimer();
    e.phase = "clear";
    e.until = null;
    e.left = null;
    run(
      "sheet",
      animate(sheet, 0, { duration: (CLEAR * 0.9) / rate, ease: easings.exit }),
    );
    schedule();
  };

  const advance = () => {
    clearTimer();
    stopGlide();
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
    engine.current = {
      phase: next.final ? "done" : "read",
      word: 0,
      timer: null,
      until: null,
      left: null,
      gliding: -1,
      keyed: false,
    };
    setSlot(next);
    setChecked(next.final ? 1e9 : 0);
    setAt(0);
    run(
      "sheet",
      animate(sheet, 1, { duration: durations.base, ease: easings.enter }),
    );
    report.current.onPhraseChange?.(next.index);
  };

  const turn = (on: boolean) => {
    const e = engine.current;
    if (e.phase === "clear") return;
    if (on ? slot.final : !slot.final) clear();
  };

  const measure = () => {
    const stage = stageRef.current;
    const surface = stage?.parentElement;
    if (!stage || !surface) return;
    const rect = stage.getBoundingClientRect();
    const style = getComputedStyle(surface);
    const block = stage.querySelector<HTMLElement>("[data-lens-text]");
    const boxes = plan.words.map((_, k): Box | null => {
      const node = wordNodes.current.get(`${slot.n}:${k}`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {
        x: r2(r.left - rect.left),
        y: r2(r.top - rect.top),
        w: r2(r.width),
        h: r2(r.height),
      };
    });
    setLayout({
      width: r2(stage.clientWidth),
      height: r2(block?.offsetHeight ?? stage.clientHeight),
      lineH: Math.round(
        parseFloat(getComputedStyle(block ?? stage).lineHeight) || 52,
      ),
      padX: parseFloat(style.paddingLeft) || 0,
      padY: parseFloat(style.paddingTop) || 0,
      boxes,
    });
  };

  // --- By hand -----------------------------------------------------------

  const panAt = (x: number) => {
    const stage = stageRef.current;
    return stage ? panFrom(stage.getBoundingClientRect().left + x, stage) : 0;
  };

  /** The word under a point in the stage, or the nearest one. */
  const wordAt = (x: number, y: number) => {
    let best = -1;
    let bestD = Infinity;
    layout?.boxes.forEach((box, k) => {
      if (!box) return;
      const dx =
        x < box.x ? box.x - x : x > box.x + box.w ? x - box.x - box.w : 0;
      const dy =
        y < box.y ? box.y - y : y > box.y + box.h ? y - box.y - box.h : 0;
      const d = dx + dy * 3;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    return best;
  };

  const tickFor = (k: number, x: number) => {
    audio.play("tick", {
      pitch: r2(0.85 + (0.5 * k) / Math.max(1, n - 1)),
      gain: 0.35,
      pan: panAt(x),
    });
  };

  /** A press anywhere on the line holds the lens still, right where it is. */
  const hold = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (disabled || !layout || !stage) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = stage.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const e = engine.current;
    stopGlide();
    clearTimer();
    e.phase = "drag";
    e.until = null;
    e.left = null;
    e.keyed = false;
    const x = lensX.get();
    const y = lensY.get();
    grab.current = {
      x,
      y,
      word: wordAt(x, y),
      away: Math.abs(px - x) > halfW || Math.abs(py - y) > halfH,
      px,
      py,
    };
  };

  const drag = useDrag({
    disabled: disabled || !layout,
    threshold: 3,
    onStart: () => {
      const g = grab.current;
      run("on", animate(lensOn, 1, { duration: durations.fast }));
      if (g.away) {
        // Picked up from elsewhere on the line: the glass comes to the finger.
        g.x = g.px;
        g.y = g.py;
      }
    },
    onMove: ({ offset }) => {
      if (!layout) return;
      const g = grab.current;
      const x = rubberClamp(
        g.x + offset.x,
        halfW - layout.padX + 2,
        layout.width + layout.padX - halfW - 2,
        layout.width,
      );
      const y = rubberClamp(
        g.y + offset.y,
        halfH - layout.padY + 2,
        layout.height + layout.padY - halfH - 2,
        layout.height + halfH,
      );
      lensX.set(r2(x));
      lensY.set(r2(y));
      const k = wordAt(x, y);
      if (k >= 0 && k !== g.word) {
        g.word = k;
        tickFor(k, x);
      }
    },
    onEnd: ({ velocity }) => {
      // Thrown, it settles on the word it would have come to rest over.
      const k = wordAt(
        project(lensX.get(), velocity.x, 0.992),
        project(lensY.get(), velocity.y, 0.992),
      );
      settleOn(k < 0 ? engine.current.word : k, velocity);
    },
    onCancel: () => settleOn(engine.current.word),
    onTap: () => {
      // A tap on a word sends the lens there; a tap on the glass rereads.
      const g = grab.current;
      const k = g.away ? wordAt(g.px, g.py) : wordAt(lensX.get(), lensY.get());
      if (k >= 0 && k !== engine.current.word) {
        const spot = spotOf(k);
        if (spot) tickFor(k, spot.x);
      }
      settleOn(k < 0 ? engine.current.word : k);
    },
  });

  /** Put down on a word: it is checked, and reading goes on from there. */
  const settleOn = (k: number, velocity?: { x: number; y: number }) => {
    const e = engine.current;
    if (slot.final) {
      // Finished: the lens is only a magnifier now, put back where it rests.
      e.phase = "done";
      const rest = restSpot();
      if (rest) {
        run("x", animate(lensX, rest.x, springs.glide));
        run("y", animate(lensY, rest.y, springs.glide));
      }
      return;
    }
    e.word = clamp(k, 0, Math.max(0, n - 1));
    e.phase = "read";
    e.until = null;
    e.left = null;
    glideTo(e.word, velocity);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !layout || n === 0) return;
    const e = engine.current;
    let to: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        to = Math.min(n - 1, e.word + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        to = Math.max(0, e.word - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (slot.final) return;
    clearTimer();
    e.keyed = true;
    setAt(to);
    const spot = spotOf(to);
    if (spot) tickFor(to, spot.x);
    settleOn(to);
  };

  React.useLayoutEffect(() => {
    api.current = {
      resume: schedule,
      pause: () => {
        clearTimer();
        stopGlide();
        const e = engine.current;
        if (e.until !== null) {
          e.left = Math.max(0, e.until - performance.now());
          e.until = null;
        }
      },
      arrived,
      next,
      clear,
      advance,
      turn,
      measure,
    };
    report.current = { onPhraseChange, onWordChange };
  });

  // The first phrase and word are state too: reported from the first commit.
  React.useEffect(() => {
    report.current.onPhraseChange?.(slot.index);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (wasActive.current === active) return;
    wasActive.current = active;
    api.current?.turn(active);
  }, [active]);

  // A new layout re-plans too: a glide heads for where the word is now.
  React.useEffect(() => {
    api.current?.resume();
    return () => api.current?.pause();
  }, [slot, running, rate, layout]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [plan, lens]);

  // A new phrase or layout: the lens goes where the reading stands.
  React.useLayoutEffect(() => {
    if (!layout) return;
    const e = engine.current;
    const first = placed.current === -1;
    if (placed.current === slot.n && e.phase !== "done") return;
    placed.current = slot.n;
    const spot = slot.final ? restSpot() : spotOf(e.word);
    if (!spot) return;
    if (first || !motionSafe) {
      lensX.set(spot.x);
      lensY.set(spot.y);
      if (first) lensOn.set(1);
    }
    // Otherwise the read for the new phrase glides it there: the return sweep.
    if (slot.final) {
      run("x", animate(lensX, spot.x, springs.glide));
      run("y", animate(lensY, spot.y, springs.glide));
    }
    // Placed once per phrase; the reading moves it from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, slot]);

  React.useEffect(() => {
    const all = others.current;
    return () => {
      for (const g of glides.current) g.stop();
      glides.current = [];
      for (const c of all.values()) c.stop();
      all.clear();
      const e = engine.current;
      if (e.timer !== null) window.clearTimeout(e.timer);
      e.timer = null;
    };
  }, []);

  const bindSurface = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const bindText = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setHeight(Math.round(node.offsetHeight));
      api.current?.measure();
    });
    sizer.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => sizer.disconnect();
  }, []);

  const bindWord = (k: number) => (node: HTMLSpanElement | null) => {
    const key = `${slot.n}:${k}`;
    if (node) wordNodes.current.set(key, node);
    else wordNodes.current.delete(key);
  };

  const shownY = useTransform(
    [lensY, nod] as MotionValue<number>[],
    ([y = 0, d = 0]: number[]) => r2(y + d),
  );
  const clipPath = useTransform(
    [lensX, shownY] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) =>
      bar
        ? `inset(${r2(y - halfH)}px ${r2((layout?.width ?? 0) - x - halfW)}px ${r2((layout?.height ?? 0) - y - halfH)}px ${r2(x - halfW)}px round 8px)`
        : `circle(${radius}px at ${r2(x)}px ${r2(y)}px)`,
  );
  // Scaled from its corner and shifted by centre × (1 − zoom): the point
  // under the lens stays put and everything around it swells outward.
  const copyX = useTransform(lensX, (x) => r2(x * (1 - z)));
  const copyY = useTransform(shownY, (y) => r2(y * (1 - z)));
  const frameX = useTransform(lensX, (x) => r2(x - halfW));
  const frameY = useTransform(shownY, (y) => r2(y - halfH));

  const final = slot.final;
  const word = plan.words[clamp(at, 0, Math.max(0, n - 1))];
  const valueText = word
    ? `Word ${Math.min(at + 1, n)} of ${n}, ${word.text}`
    : "No words";

  return (
    <>
      <div
        className={cn("@container relative w-full", className)}
        aria-busy={active || undefined}
      >
        <div
          ref={bindSurface}
          className="relative overflow-clip rounded-3 border border-hairline bg-card px-4 py-3.5 [contain:paint] @md:py-4"
        >
          {/* The whole line takes the gesture: the lens is 2D under a finger,
              the rest of the line lets a vertical swipe scroll the page. */}
          <div
            ref={stageRef}
            {...drag}
            onPointerDown={(event) => {
              hold(event);
              drag.onPointerDown(event);
            }}
            onContextMenu={(event) => event.preventDefault()}
            className={cn(
              "relative touch-pan-y select-none [-webkit-touch-callout:none]",
              !disabled && layout && "cursor-pointer",
            )}
          >
            <motion.div
              initial={false}
              animate={{ height: height ?? "auto" }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            >
              <motion.div
                key={slot.n}
                ref={bindText}
                data-lens-text=""
                aria-hidden
                className="relative text-[18px] leading-[44px] @md:text-[22px] @md:leading-[52px]"
                style={{ opacity: sheet }}
              >
                {/* The page: soft and faint where the lens is not, sharp once read. */}
                <div
                  className={final ? "text-foreground" : "text-ink-3"}
                  style={{ filter: final ? "none" : `blur(${soft}px)` }}
                >
                  <Words plan={plan} bind={bindWord} />
                </div>
                {/* Checked words keep a hairline under them. */}
                {layout && !final
                  ? plan.words.map((w, k) => {
                      const box = layout.boxes[k];
                      if (!box) return null;
                      const on = k < checked;
                      return (
                        <motion.span
                          key={w.key}
                          className="pointer-events-none absolute h-[1.5px] origin-left rounded-full bg-cobalt-bright/45"
                          style={{
                            left: box.x,
                            top: r2(box.y + box.h - 9),
                            width: box.w,
                          }}
                          initial={false}
                          animate={
                            motionSafe
                              ? { scaleX: on ? 1 : 0, opacity: on ? 1 : 0 }
                              : { opacity: on ? 1 : 0 }
                          }
                          transition={{
                            duration: durations.base,
                            ease: easings.enter,
                          }}
                        />
                      );
                    })
                  : null}
                {/* The glass: an opaque disc of the card, and the words magnified in it. */}
                <motion.div
                  className="pointer-events-none absolute inset-0 bg-card"
                  style={{ clipPath }}
                >
                  <motion.div
                    className="absolute inset-x-0 top-0 origin-top-left text-foreground"
                    style={{ x: copyX, y: copyY, scale: z }}
                  >
                    <Words plan={plan} />
                  </motion.div>
                </motion.div>
              </motion.div>
            </motion.div>
            <motion.div
              ref={frameRef}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label="Reading lens"
              aria-describedby={hintId}
              aria-orientation="horizontal"
              aria-valuemin={1}
              aria-valuemax={Math.max(1, n)}
              aria-valuenow={Math.min(Math.max(1, at + 1), Math.max(1, n))}
              aria-valuetext={valueText}
              aria-disabled={disabled || undefined}
              onKeyDown={onKeyDown}
              className={cn(
                "absolute top-0 left-0 touch-none outline-none select-none [-webkit-touch-callout:none]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                bar ? "rounded-2" : "rounded-full",
                disabled
                  ? "cursor-default"
                  : "cursor-grab active:cursor-grabbing",
                !layout && "invisible",
              )}
              style={{
                x: frameX,
                y: frameY,
                width: halfW * 2,
                height: halfH * 2,
                opacity: final ? 0.55 : lensOn,
              }}
            >
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 border-2 border-ink-3/45 shadow-[inset_0_0_0_1px_color-mix(in_oklab,white_35%,transparent),0_2px_6px_color-mix(in_oklab,black_14%,transparent)]",
                  bar ? "rounded-2" : "rounded-full",
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-[3px] bg-[radial-gradient(90%_70%_at_30%_18%,color-mix(in_oklab,white_28%,transparent),transparent_55%)]",
                  bar ? "rounded-[4px]" : "rounded-full",
                )}
              />
            </motion.div>
          </div>
        </div>
        <span id={hintId} className="sr-only">
          Drag the lens along the line, or use Left and Right, to read a word;
          it reads on from there.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {slot.text}
      </p>
    </>
  );
}
