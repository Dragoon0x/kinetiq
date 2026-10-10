"use client";

import * as React from "react";

import {
  animate,
  cubicBezier,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TuneInTrigger = "mount" | "inView" | "hover" | "manual";

export type TuneInElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type TuneInProps = {
  /** The headline. */
  text: string;
  /** The element rendered. @default "h2" */
  as?: TuneInElement;
  /** Where the readout lands when the headline locks. @default 104.7 */
  frequency?: number;
  /** Where the readout starts as the carrier sets off. @default 87.5 */
  from?: number;
  /** Printed after the readout. @default "MHz" */
  unit?: string;
  /** How long the carrier takes to cross the headline, ms. @default 1400 */
  sweep?: number;
  /** Static strength, 0 to 1: opacity, jitter, churn and scanline roughness. 0 is a still, faint ghost alphabet. @default 0.5 */
  noise?: number;
  /** Show the small frequency readout riding the carrier, in a strip reserved above the text. @default true */
  readout?: boolean;
  /** The carrier, the readout and each letter's brief lock flash. @default "var(--accent-bright)" */
  color?: string;
  /** The static glyphs and the scanline under them. @default "var(--ink-3)" */
  staticColor?: string;
  /** The alphabet the static is drawn from. @default a set of strokes and symbols */
  glyphs?: string;
  /** A mouse or pen over a tuned headline detunes the letters under it for a moment. @default true */
  interactive?: boolean;
  /** When it tunes in: on mount, when scrolled into view, on hover or keyboard focus, or when `active` turns true. @default "inView" */
  trigger?: TuneInTrigger;
  /** Tune in only the first time it is seen or hovered. False re-tunes each time. @default true */
  once?: boolean;
  /** Wait before the carrier sets off, ms. @default 120 */
  delay?: number;
  /** For `trigger="manual"`: true tunes in, false drops back to static. */
  active?: boolean;
  /** Seeds the static, so it is the same on the server and in the browser. @default derived from `text` */
  seed?: number;
  /** Fires when the last letter locks. */
  onComplete?: () => void;
  className?: string;
};

const DEFAULT_GLYPHS = "/\\|-_=+:;*#%~^<>{}[]!?";
/** As wide as a digit, so the readout never changes width as it rolls. */
const FIGURE_SPACE = String.fromCharCode(0x2007);
/** How far ahead of the carrier the letters start to settle, in em. */
const CAPTURE = 2.6;
/** How close to the pointer a tuned letter detunes, in em. */
const DETUNE_REACH = 1.25;
/** How long a detuned letter holds its static once the pointer has moved on, ms. */
const DETUNE_HOLD = 360;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(clamp01(v) * 100);
const sweepEase = cubicBezier(...easings.move);

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A deterministic 0–1 from three integers: the same static on every render. */
function noise3(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (b + 0x632be5ab), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (c + 0x27d4eb2f), 0x165667b1) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Graphemes, so an emoji or a combining mark is never split in two. */
const graphemes = (text: string): string[] =>
  segmenter
    ? Array.from(segmenter.segment(text), (s) => s.segment)
    : Array.from(text);

type Cell = {
  char: string;
  glyph: MotionValue<string>;
  /** The static's vertical jitter, em. */
  staticY: MotionValue<number>;
  staticO: MotionValue<number>;
  lockO: MotionValue<number>;
  /** The true glyph's settle offset, em. */
  lockY: MotionValue<number>;
  /** The lock's flash of signal colour, 0–1. */
  flash: MotionValue<number>;
};

type Layout = {
  words: { cells: number[]; key: number }[];
  cells: Cell[];
};

/** The static at rest: how faint, how far it jitters (em) and how often it churns (Hz). */
const staticOf = (noise: number) => ({
  opacity: 0.2 + 0.32 * noise,
  amp: 0.012 + 0.07 * noise,
  rate: 4 + 20 * noise,
});

function layoutOf(
  text: string,
  seed: number,
  glyphs: string[],
  noise: number,
): Layout {
  const chars = graphemes(text);
  const s = staticOf(noise);
  const cells: Cell[] = [];
  const words: Layout["words"] = [];
  let current: number[] = [];
  chars.forEach((char, at) => {
    if (char.trim() === "") {
      if (current.length) words.push({ cells: current, key: at });
      current = [];
      return;
    }
    const index = cells.length;
    const g = glyphs[Math.floor(noise3(seed, index, 0) * glyphs.length)];
    cells.push({
      char,
      glyph: motionValue(g ?? "·"),
      staticY: motionValue(r3((noise3(seed, index, 7) * 2 - 1) * s.amp)),
      staticO: motionValue(r3(s.opacity)),
      lockO: motionValue(0),
      lockY: motionValue(0),
      flash: motionValue(0),
    });
    current.push(index);
  });
  if (current.length) words.push({ cells: current, key: chars.length });
  return { words, cells };
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Letter({
  cell,
  color,
  staticColor,
}: {
  cell: Cell;
  color: string;
  staticColor: string;
}) {
  const staticY = useTransform(cell.staticY, (v) => `${r3(v)}em`);
  const lockY = useTransform(cell.lockY, (v) => `${r3(v)}em`);
  // The flash is mixed into the inherited colour, so the lock reads as the
  // signal arriving and then cooling to the headline's own ink.
  const tint = useTransform(cell.flash, (f) =>
    f <= 0.005
      ? "currentColor"
      : `color-mix(in oklab, ${color} ${pct(f)}%, currentColor)`,
  );
  const line = useTransform(cell.staticO, (o) => r3(o * 0.55));
  return (
    <span className="relative inline-block">
      <motion.span
        className="relative inline-block"
        style={{ opacity: cell.lockO, y: lockY, color: tint }}
      >
        {cell.char}
      </motion.span>
      {/* Static is thin and mono, centred on the letter's box: noise on the
          line, not a second, heavier word competing with the first. */}
      <motion.span
        className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[0.74em] font-normal select-none"
        style={{ opacity: cell.staticO, y: staticY, color: staticColor }}
      >
        {cell.glyph}
      </motion.span>
      <motion.span
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px select-none"
        style={{ opacity: line, y: staticY, backgroundColor: staticColor }}
      />
    </span>
  );
}

type Run = {
  phase: "static" | "sweeping" | "tuned";
  /** Seconds of sweep elapsed, advanced only while the loop runs. */
  elapsed: number;
  /** Seconds the static has churned, for its tick. */
  clock: number;
  last: number;
  tick: number;
  frame: number;
  locked: boolean[];
  /** performance.now() until which a hovered letter stays detuned. */
  detuned: number[];
  played: boolean;
  timer: number | null;
};

type Api = {
  play: () => void;
  begin: () => void;
  reset: () => void;
  wake: () => void;
  frame: (now: number) => void;
  repaint: () => void;
  measure: () => void;
};

/**
 * A headline that comes in like a station on an analogue dial. Before it
 * plays, every letter is faint static — a seeded glyph that jitters and
 * churns over a broken scanline — while its true glyph already holds the
 * final box, transparent, so nothing reflows. A thin carrier line then sweeps
 * across on a tween; letters ahead of it calm down and flicker toward their
 * real shape as it approaches, and each one it passes locks: the static cuts
 * out and the true glyph settles from the static's last jitter on the snap
 * spring with a brief flash of signal colour that cools to the headline's ink.
 * A small mono readout rides the top of the carrier and rolls to `frequency`.
 *
 * A mouse or pen over the tuned headline detunes the letters under it for a
 * moment, and they relock on the same spring as it moves on. One rAF loop runs
 * the static, only while some letter is static, the headline is on screen and
 * the page is visible. The text is read once from an sr-only copy; the true
 * glyphs are real text, so selection and copy give the real words. Under
 * reduced motion the static is still and the letters crossfade in reading
 * order, with the readout already at its frequency.
 */
export function TuneIn({
  text,
  as = "h2",
  frequency = 104.7,
  from = 87.5,
  unit = "MHz",
  sweep = 1400,
  noise = 0.5,
  readout = true,
  color = "var(--accent-bright)",
  staticColor = "var(--ink-3)",
  glyphs = DEFAULT_GLYPHS,
  interactive = true,
  trigger = "inView",
  once = true,
  delay = 120,
  active,
  seed,
  onComplete,
  className,
}: TuneInProps) {
  const motionSafe = useMotionSafe();
  const n = clamp01(noise);
  const sweepS = Math.max(0.2, sweep / 1000);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const seedValue = (seed ?? hashText(text)) >>> 0;
  const alphabet = React.useMemo(() => {
    const list = graphemes(glyphs).filter((g) => g.trim() !== "");
    return list.length ? list : graphemes(DEFAULT_GLYPHS);
  }, [glyphs]);
  // The letters belong to the text and its seed; the noise only sets where
  // the static starts, so a noise change does not rebuild them.
  const [startNoise] = React.useState(n);
  const layout = React.useMemo(
    () => layoutOf(text, seedValue, alphabet, startNoise),
    [text, seedValue, alphabet, startNoise],
  );

  const carrier = useMotionValue(0);
  const carrierOn = useMotionValue(0);
  /** Where the letters start and end inside the block, px. */
  const left = useMotionValue(0);
  const width = useMotionValue(0);
  const labelWidth = useMotionValue(0);
  const tuned = useMotionValue(0);
  const value = useMotionValue(from);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const blockRef = React.useRef<HTMLSpanElement | null>(null);
  const labelRef = React.useRef<HTMLSpanElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLSpanElement>());
  const centres = React.useRef<{ x: number; y: number }[]>([]);
  const em = React.useRef(16);
  const anims = React.useRef(new Map<number, AnimationPlaybackControls[]>());
  const shared = React.useRef<AnimationPlaybackControls[]>([]);
  const run = React.useRef<Run>({
    phase: "static",
    elapsed: 0,
    clock: 0,
    last: 0,
    tick: -1,
    frame: 0,
    locked: [],
    detuned: [],
    played: false,
    timer: null,
  });
  const api = React.useRef<Api | null>(null);
  const done = React.useRef(onComplete);
  // Every frame runs through the latest render's closure.
  const pump = React.useCallback((now: number) => {
    run.current.frame = 0;
    api.current?.frame(now);
  }, []);

  const stopCell = (i: number) => {
    for (const c of anims.current.get(i) ?? []) c.stop();
    anims.current.delete(i);
  };
  const stopShared = () => {
    for (const c of shared.current) c.stop();
    shared.current = [];
  };

  const stopLoop = () => {
    const r = run.current;
    if (r.frame) window.cancelAnimationFrame(r.frame);
    r.frame = 0;
  };

  /** The static's resting look for letter i at the current tick. */
  const paintStatic = (i: number, tick: number, closeness: number) => {
    const cell = layout.cells[i];
    if (!cell) return;
    const s = staticOf(n);
    const calm = 1 - 0.85 * closeness;
    // Ahead of the carrier the true glyph flickers through more and more
    // often: the station is almost there.
    const ghost =
      closeness > 0 && noise3(seedValue, i, tick * 3 + 1) < closeness ** 1.6;
    const g =
      alphabet[Math.floor(noise3(seedValue, i, tick) * alphabet.length)];
    cell.glyph.set(ghost ? cell.char : (g ?? "·"));
    cell.staticY.set(
      motionSafe
        ? r3((noise3(seedValue, i, tick + 7) * 2 - 1) * s.amp * calm)
        : 0,
    );
    const flicker = motionSafe
      ? 0.78 + 0.22 * noise3(seedValue, i, tick + 13)
      : 1;
    cell.staticO.set(r3(s.opacity * flicker * (1 + 0.7 * closeness)));
  };

  const lockCell = (i: number) => {
    const cell = layout.cells[i];
    const r = run.current;
    if (!cell || r.locked[i]) return;
    r.locked[i] = true;
    r.detuned[i] = 0;
    stopCell(i);
    // The true glyph comes in from where the static last sat, so the lock is
    // one settle rather than a jump.
    cell.lockY.jump(cell.staticY.get());
    cell.flash.jump(1);
    anims.current.set(i, [
      animate(cell.staticO, 0, {
        duration: durations.fast,
        ease: easings.exit,
      }),
      animate(cell.lockO, 1, { duration: durations.fast, ease: easings.enter }),
      animate(cell.lockY, 0, springs.snap),
      animate(cell.flash, 0, { duration: durations.slow, ease: easings.enter }),
    ]);
  };

  const unlockCell = (i: number, until: number) => {
    const cell = layout.cells[i];
    const r = run.current;
    if (!cell) return;
    r.detuned[i] = until;
    if (!r.locked[i]) return;
    r.locked[i] = false;
    stopCell(i);
    cell.flash.jump(0);
    anims.current.set(i, [
      animate(cell.lockO, 0, { duration: durations.blink, ease: easings.exit }),
    ]);
    paintStatic(i, run.current.tick, 0);
  };

  const finish = () => {
    const r = run.current;
    r.phase = "tuned";
    stopShared();
    value.set(frequency);
    shared.current = [
      animate(carrierOn, 0, {
        duration: durations.slow,
        ease: easings.exit,
      }),
      motionSafe
        ? animate(tuned, 1, springs.snap)
        : animate(tuned, 1, { duration: durations.base }),
    ];
    done.current?.();
  };

  const frame = (now: number) => {
    const r = run.current;
    const dt = r.last ? Math.min(0.05, (now - r.last) / 1000) : 0;
    r.last = now;
    r.clock += dt;
    const s = staticOf(n);
    let carrierX = -Infinity;
    const x0 = left.get();
    const w = width.get();
    if (r.phase === "sweeping") {
      r.elapsed += dt;
      const p = clamp01(r.elapsed / sweepS);
      const eased = sweepEase(p);
      carrierX = x0 + eased * w;
      carrier.set(r2(carrierX));
      value.set(Math.round((from + (frequency - from) * eased) * 10) / 10);
    }
    const tick = Math.floor(r.clock * s.rate);
    const churn = tick !== r.tick;
    r.tick = tick;
    const window_ = CAPTURE * em.current;
    let busy = false;
    layout.cells.forEach((_, i) => {
      const c = centres.current[i];
      const x = c ? c.x : 0;
      if (r.locked[i]) return;
      const held = (r.detuned[i] ?? 0) > now;
      if (r.phase === "sweeping" && x <= carrierX && !held) {
        lockCell(i);
        return;
      }
      if (r.phase === "tuned" && !held) {
        lockCell(i);
        return;
      }
      busy = true;
      const closeness =
        r.phase === "sweeping" ? clamp01(1 - (x - carrierX) / window_) : 0;
      if (churn || closeness > 0) paintStatic(i, tick, closeness);
    });
    if (r.phase === "sweeping" && r.elapsed >= sweepS) {
      layout.cells.forEach((_, i) => lockCell(i));
      finish();
      busy = false;
    }
    if (busy || r.phase === "sweeping") {
      r.frame = window.requestAnimationFrame(pump);
    } else {
      r.last = 0;
    }
  };

  /** Runs the loop if anything static is on screen and changing. */
  const wake = () => {
    const r = run.current;
    if (r.frame || !running || !motionSafe) return;
    const sweepingNow = r.phase === "sweeping";
    const anyStatic = layout.cells.some((_, i) => !r.locked[i]);
    // A still static (noise 0) needs no frames until the carrier comes.
    if (!sweepingNow && (!anyStatic || n === 0)) {
      const detuning = r.detuned.some((t) => t > 0);
      if (!detuning) return;
    }
    r.last = 0;
    r.frame = window.requestAnimationFrame(pump);
  };

  const toStatic = () => {
    const r = run.current;
    stopLoop();
    stopShared();
    for (const i of anims.current.keys()) stopCell(i);
    r.phase = "static";
    r.elapsed = 0;
    r.locked = layout.cells.map(() => false);
    r.detuned = layout.cells.map(() => 0);
    const s = staticOf(n);
    layout.cells.forEach((cell, i) => {
      cell.lockO.jump(0);
      cell.lockY.jump(0);
      cell.flash.jump(0);
      cell.staticO.jump(r3(s.opacity));
      paintStatic(i, Math.max(0, r.tick), 0);
    });
    carrier.jump(left.get());
    carrierOn.jump(0);
    tuned.jump(0);
    value.jump(from);
  };

  /** The carrier sets off — or, under reduced motion, the crossfade runs. */
  const begin = () => {
    const r = run.current;
    r.timer = null;
    if (!motionSafe) {
      // Reduced motion: a crossfade in reading order, nothing travels.
      const gap = cascade(layout.cells.length);
      r.phase = "tuned";
      value.set(frequency);
      layout.cells.forEach((cell, i) => {
        r.locked[i] = true;
        anims.current.set(i, [
          animate(cell.lockO, 1, {
            duration: durations.base,
            delay: i * gap,
            ease: easings.enter,
          }),
          animate(cell.staticO, 0, {
            duration: durations.base,
            delay: i * gap,
            ease: easings.exit,
          }),
        ]);
      });
      shared.current = [
        animate(carrierOn, 0, { duration: 0 }),
        animate(tuned, 1, {
          duration: durations.base,
          delay: layout.cells.length * gap,
          onComplete: () => done.current?.(),
        }),
      ];
      return;
    }
    r.phase = "sweeping";
    r.elapsed = 0;
    shared.current = [
      animate(carrierOn, 1, {
        duration: durations.fast,
        ease: easings.enter,
      }),
    ];
    wake();
  };

  const play = () => {
    const r = run.current;
    if (r.timer !== null) window.clearTimeout(r.timer);
    r.timer = null;
    r.played = true;
    toStatic();
    // Through the latest render: the reduced-motion answer can arrive while
    // the delay runs.
    if (delay > 0) {
      r.timer = window.setTimeout(() => api.current?.begin(), delay);
    } else {
      begin();
    }
  };

  const reset = () => {
    const r = run.current;
    if (r.timer !== null) window.clearTimeout(r.timer);
    r.timer = null;
    toStatic();
    api.current?.wake();
  };

  const measure = () => {
    const block = blockRef.current;
    if (!block) return;
    const rect = block.getBoundingClientRect();
    em.current = parseFloat(getComputedStyle(block).fontSize) || 16;
    // The carrier crosses the letters, not the empty end of a wide block.
    let lo = Infinity;
    let hi = -Infinity;
    centres.current = layout.cells.map((_, i) => {
      const node = nodes.current.get(i);
      if (!node) return { x: 0, y: 0 };
      const b = node.getBoundingClientRect();
      lo = Math.min(lo, b.left - rect.left);
      hi = Math.max(hi, b.right - rect.left);
      return {
        x: r2(b.left - rect.left + b.width / 2),
        y: r2(b.top - rect.top + b.height / 2),
      };
    });
    if (!Number.isFinite(lo)) {
      lo = 0;
      hi = rect.width;
    }
    // Inside the block by a hair, so the line never pokes past its box.
    lo = clamp(lo, 1, Math.max(1, rect.width - 1));
    hi = clamp(hi, lo, Math.max(lo, rect.width - 1));
    left.set(r2(lo));
    width.set(r2(hi - lo));
    if (run.current.phase === "static") carrier.set(r2(lo));
    if (labelRef.current) labelWidth.set(labelRef.current.offsetWidth);
  };

  /** The static at the current noise, for letters that are showing it. */
  const repaint = () => {
    const r = run.current;
    layout.cells.forEach((_, i) => {
      if (!r.locked[i]) paintStatic(i, Math.max(0, r.tick), 0);
    });
  };

  /** A pointer over the tuned headline loosens the letters under it. */
  const detuneAt = (x: number, y: number) => {
    const r = run.current;
    if (!interactive || !motionSafe || r.phase === "static") return;
    const reach = DETUNE_REACH * em.current;
    const until = performance.now() + DETUNE_HOLD;
    let touched = false;
    centres.current.forEach((c, i) => {
      if (Math.hypot(c.x - x, (c.y - y) * 1.4) > reach) return;
      unlockCell(i, until);
      touched = true;
    });
    if (touched) wake();
  };

  React.useLayoutEffect(() => {
    api.current = { play, begin, reset, wake, frame, repaint, measure };
    done.current = onComplete;
  });

  // New letters arrive static; measure them, and if the headline had
  // already tuned in, the new text tunes in too.
  React.useLayoutEffect(() => {
    const r = run.current;
    r.locked = layout.cells.map(() => false);
    r.detuned = layout.cells.map(() => 0);
    api.current?.measure();
    if (r.played) api.current?.play();
    else api.current?.wake();
    const anims_ = anims.current;
    return () => {
      for (const list of anims_.values()) for (const c of list) c.stop();
      anims_.clear();
    };
  }, [layout]);

  // A new noise shows on the static at once, even while it is still.
  React.useEffect(() => {
    api.current?.repaint();
  }, [n, motionSafe]);

  // The reduced-motion answer can arrive after a sweep began: the headline
  // runs again in the mode the visitor asked for.
  const firstSafe = React.useRef(motionSafe);
  React.useEffect(() => {
    if (firstSafe.current === motionSafe) return;
    firstSafe.current = motionSafe;
    if (run.current.played) api.current?.play();
  }, [motionSafe]);

  // Triggers that do not need the pointer.
  React.useEffect(() => {
    if (trigger === "mount") api.current?.play();
  }, [trigger]);

  React.useEffect(() => {
    if (trigger !== "manual" || active === undefined) return;
    if (active) api.current?.play();
    else api.current?.reset();
  }, [trigger, active]);

  // The loop follows the page and the viewport: off screen or hidden it
  // stops where it is, and picks up from there.
  React.useEffect(() => {
    if (running) api.current?.wake();
    const r = run.current;
    return () => {
      if (r.frame) window.cancelAnimationFrame(r.frame);
      r.frame = 0;
      r.last = 0;
    };
  }, [running, n, sweepS, motionSafe]);

  React.useEffect(() => {
    const r = run.current;
    const shared_ = shared;
    return () => {
      if (r.timer !== null) window.clearTimeout(r.timer);
      r.timer = null;
      for (const c of shared_.current) c.stop();
      shared_.current = [];
    };
  }, []);

  const latestTrigger = React.useRef({ trigger, once });
  React.useEffect(() => {
    latestTrigger.current = { trigger, once };
  });

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        setOnScreen(entry.isIntersecting);
        const { trigger: t, once: o } = latestTrigger.current;
        if (t !== "inView") return;
        const r = run.current;
        if (entry.intersectionRatio >= 0.35 && (!r.played || !o)) {
          if (r.phase === "static") api.current?.play();
        } else if (!entry.isIntersecting && !o && r.played) {
          api.current?.reset();
        }
      },
      { threshold: [0, 0.35] },
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const bindBlock = React.useCallback((node: HTMLSpanElement | null) => {
    blockRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => sizer.disconnect();
  }, []);

  const bindLabel = React.useCallback((node: HTMLSpanElement | null) => {
    labelRef.current = node;
    if (node) api.current?.measure();
  }, []);

  const bindCell = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) nodes.current.set(i, node);
    else nodes.current.delete(i);
  };

  const hoverPlay = () => {
    const r = run.current;
    if (trigger !== "hover") return;
    if (r.played && once) return;
    if (r.phase === "sweeping") return;
    play();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const block = blockRef.current;
    if (!block) return;
    const rect = block.getBoundingClientRect();
    detuneAt(event.clientX - rect.left, event.clientY - rect.top);
  };

  const carrierX = useTransform(carrier, (x) => r2(x));
  const labelX = useTransform(
    [carrier, left, width, labelWidth],
    ([x = 0, x0 = 0, w = 0, lw = 0]: number[]) =>
      r2(clamp(x - 1, 0, Math.max(0, x0 + w - lw))),
  );
  const labelOpacity = useTransform(
    [carrierOn, tuned],
    ([c = 0, t = 0]: number[]) => r3(Math.max(c, t)),
  );
  const digits = Math.max(from.toFixed(1).length, frequency.toFixed(1).length);
  const reading = useTransform(value, (v) =>
    v.toFixed(1).padStart(digits, FIGURE_SPACE),
  );
  const dot = useTransform(tuned, (t) => r3(clamp(t, 0, 1.2)));

  const Tag = as as "h2";
  const focusable = trigger === "hover";

  return (
    <Tag
      ref={bindRoot}
      tabIndex={focusable ? 0 : undefined}
      onPointerEnter={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "touch") hoverPlay();
      }}
      onFocus={hoverPlay}
      onPointerMove={onPointerMove}
      className={cn(
        "relative",
        focusable &&
          "rounded-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <span className="sr-only select-none">{text}</span>
      <span
        aria-hidden
        className={cn("relative block", readout && "pt-[max(16px,0.46em)]")}
      >
        <span ref={bindBlock} className="relative block">
          {layout.words.map((word, w) => (
            <React.Fragment key={word.key}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {word.cells.map((i) => (
                  <span key={i} ref={bindCell(i)} className="inline-block">
                    <Letter
                      cell={layout.cells[i] as Cell}
                      color={color}
                      staticColor={staticColor}
                    />
                  </span>
                ))}
              </span>
            </React.Fragment>
          ))}
        </span>
        <motion.span
          className="pointer-events-none absolute bottom-0 left-0 w-[1.5px] -translate-x-1/2 rounded-full select-none"
          style={{
            top: readout ? "max(13px,0.36em)" : 0,
            x: carrierX,
            opacity: carrierOn,
            backgroundColor: color,
            boxShadow: `0 0 6px color-mix(in oklab, ${color} 55%, transparent)`,
          }}
        />
        {readout ? (
          <motion.span
            ref={bindLabel}
            className="pointer-events-none absolute top-0 left-0 inline-flex items-center gap-[0.4em] font-mono font-normal tracking-[0.04em] whitespace-nowrap tabular-nums select-none"
            style={{
              x: labelX,
              opacity: labelOpacity,
              fontSize: "max(9px,0.2em)",
              lineHeight: 1.3,
            }}
          >
            <motion.span
              className="inline-block size-[0.55em] shrink-0 rounded-full"
              style={{ scale: dot, backgroundColor: color }}
            />
            <motion.span style={{ color }}>{reading}</motion.span>
            <span className="text-ink-3">{unit}</span>
          </motion.span>
        ) : null}
      </span>
    </Tag>
  );
}
