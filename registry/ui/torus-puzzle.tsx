"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TorusPuzzlePattern =
  "ring" | "plus" | "diamond" | "arrow" | readonly boolean[];

export type TorusPuzzleMove = {
  axis: "row" | "column";
  index: number;
  /** Cells moved: positive is right (rows) or down (columns). */
  by: number;
};

export type TorusPuzzleHandle = {
  /** Plays the board back home, one step at a time. */
  solve: () => void;
  /** Scrambles the board with `scramble` steps. */
  scramble: () => void;
};

export type TorusPuzzleProps = {
  /** Dots per side (3 to 9). @default 6 */
  grid?: number;
  /** Milliseconds per autoplay step while solving; scrambling runs at 0.7 of it (200 to 1500). @default 600 */
  pace?: number;
  /** Halo of the lit dots and their boost while moving, 0 (none) to 1. @default 0.6 */
  glow?: number;
  /** The picture the lit dots make at home, or your own `grid × grid` cells, row by row. @default "ring" */
  pattern?: TorusPuzzlePattern;
  /** Steps in each scramble (1 to 30). @default 7 */
  scramble?: number;
  /** Scrambles and solves itself while on screen. @default true */
  autoplay?: boolean;
  /** Quiet time after your last move before autoplay solves from where you left it, ms. @default 5000 */
  resumeAfter?: number;
  /** Colours, as CSS colours: lit dots, unlit dots, and the track behind a moving line. */
  colors?: { lit?: string; dim?: string; track?: string };
  /** Fires for every committed move — yours, a button's or autoplay's. */
  onMove?: (move: TorusPuzzleMove) => void;
  /** Whether the picture is home, reported from the start and on every change. */
  onSolvedChange?: (solved: boolean) => void;
  /** Steps from home, reported from the start and on every change. */
  onDistanceChange?: (steps: number) => void;
  /** Ticks as dots cross cells, for your moves only. Off unless asked for. @default false */
  sound?: boolean;
  /** No drag and no keys; autoplay still runs. @default false */
  disabled?: boolean;
  /** The grid's name. @default "Torus puzzle" */
  label?: string;
  /** Sizes the square board. @default "w-52" */
  className?: string;
  /** Imperative `solve()` and `scramble()`. */
  ref?: React.Ref<TorusPuzzleHandle>;
};

const DEFAULT_COLORS = {
  lit: "var(--accent-bright)",
  dim: "var(--ink-3)",
  track: "var(--accent-wash)",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (v: number, n: number) => ((v % n) + n) % n;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The lit cells of a named picture on an n × n board. */
function picture(n: number, kind: TorusPuzzlePattern): boolean[] {
  if (typeof kind !== "string") {
    return kind.length === n * n ? [...kind] : picture(n, "ring");
  }
  const out = new Array<boolean>(n * n).fill(false);
  const inset = n >= 5 ? 1 : 0;
  const lo = inset;
  const hi = n - 1 - inset;
  const mid = Math.floor(n / 2);
  const c0 = (n - 1) / 2;
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      let on = false;
      if (kind === "ring") {
        const inside = r >= lo && r <= hi && c >= lo && c <= hi;
        const edge = r === lo || r === hi || c === lo || c === hi;
        const corner = (r === lo || r === hi) && (c === lo || c === hi);
        on = inside && edge && !(corner && hi - lo >= 3);
        if (n === 3) on = r === 1 && c === 1;
      } else if (kind === "plus") {
        on =
          (r === mid && c >= lo && c <= hi) ||
          (c === mid && r >= lo && r <= hi);
      } else if (kind === "diamond") {
        const radius = Math.floor((n - 1) / 2);
        on = Math.abs(Math.abs(r - c0) + Math.abs(c - c0) - radius) < 0.6;
      } else {
        const head = r - lo;
        on =
          (c === mid && r >= lo && r <= hi) ||
          (head >= 1 &&
            head <= Math.max(1, Math.floor((n - 2) / 2)) &&
            Math.abs(c - mid) === head);
      }
      out[r * n + c] = on;
    }
  }
  return out;
}

type Dot = {
  id: number;
  lit: boolean;
  x: MotionValue<number>;
  y: MotionValue<number>;
  gx: MotionValue<number>;
  gy: MotionValue<number>;
  glow: MotionValue<number>;
  pop: MotionValue<number>;
};

type Step = { axis: "row" | "column"; index: number; dir: 1 | -1 };

const HIDDEN = -9;

function DotView({
  dot,
  glow,
  litFill,
  motionSafe,
}: {
  dot: Dot;
  glow: number;
  litFill: string;
  motionSafe: boolean;
}) {
  const halo = useTransform(dot.glow, (g) =>
    r3(clamp(glow, 0, 1) * (0.32 + 0.68 * g)),
  );
  const core = useTransform(dot.glow, (g) =>
    r3(dot.lit ? 0.86 + 0.14 * g : 0.38 + 0.42 * g),
  );
  const haloR = r3(0.21 + 0.3 * clamp(glow, 0, 1));
  const coreR = dot.lit ? 0.19 : 0.075;
  const scale = motionSafe ? dot.pop : 1;
  const parts: [MotionValue<number>, MotionValue<number>, string][] = [
    [dot.x, dot.y, "main"],
    [dot.gx, dot.gy, "ghost"],
  ];
  return (
    <>
      {parts.map(([cx, cy, key]) => (
        <g key={key}>
          {dot.lit && glow > 0 ? (
            <motion.circle
              cx={cx}
              cy={cy}
              r={haloR}
              fill={litFill}
              style={{ opacity: halo, scale, originX: 0.5, originY: 0.5 }}
            />
          ) : null}
          <motion.circle
            cx={cx}
            cy={cy}
            r={coreR}
            fill="currentColor"
            className={
              dot.lit ? "text-[var(--torus-lit)]" : "text-[var(--torus-dim)]"
            }
            style={{ opacity: core, scale, originX: 0.5, originY: 0.5 }}
          />
        </g>
      ))}
    </>
  );
}

type Line = { dot: Dot; base: number }[];

type Live = {
  pace: number;
  scrambleSteps: number;
  autoplay: boolean;
  resumeAfter: number;
  motionSafe: boolean;
  disabled: boolean;
  audio: ReturnType<typeof useTactileSound>;
  onMove?: (move: TorusPuzzleMove) => void;
  onSolvedChange?: (solved: boolean) => void;
  onDistanceChange?: (steps: number) => void;
};

type Shown = { at: number[]; steps: number; solved: boolean };

/**
 * Everything that moves the board, outside React: the board itself, the
 * history home, the running step, the autoplay timers. React only renders
 * what it reports, so nothing here re-renders per frame.
 */
function createConductor(
  n: number,
  home: boolean[],
  dots: Dot[],
  slide: MotionValue<number>,
  track: Record<"x" | "y" | "w" | "h" | "o", MotionValue<number>>,
  live: React.RefObject<Live>,
  board: React.RefObject<HTMLDivElement | null>,
  show: (s: Shown) => void,
  say: (words: string) => void,
) {
  const at = Int16Array.from({ length: n * n }, (_, i) => i);
  let history: Step[] = [];
  let timers: number[] = [];
  let resume = 0;
  let visible = false;
  let userActive = false;
  let running: {
    controls: AnimationPlaybackControls | null;
    finish: (() => void) | null;
  } = { controls: null, finish: null };
  let grab: {
    axis: Step["axis"];
    index: number;
    cell: number;
    line: Line;
    detent: number;
  } | null = null;
  const rand = lcg(n * 31 + 7);

  const solvedNow = () => {
    for (let p = 0; p < n * n; p += 1) {
      if ((home[at[p] ?? 0] ?? false) !== (home[p] ?? false)) return false;
    }
    return true;
  };

  const lineDots = (axis: Step["axis"], index: number): Line => {
    const out: Line = [];
    for (let k = 0; k < n; k += 1) {
      const pos = axis === "row" ? index * n + k : k * n + index;
      const dot = dots[at[pos] ?? 0];
      if (dot) out.push({ dot, base: k });
    }
    return out;
  };

  const clearTimers = () => {
    for (const t of timers) window.clearTimeout(t);
    timers = [];
  };
  const later = (ms: number, fn: () => void) => {
    timers.push(window.setTimeout(fn, ms));
  };

  const tick = (index: number) => {
    const r = board.current?.getBoundingClientRect();
    live.current.audio.play("tick", {
      pitch: 0.9 + (index / Math.max(1, n - 1)) * 0.3,
      gain: 0.5,
      pan: r ? panFrom(r.left + (r.width * (index + 0.5)) / n, null) : 0,
    });
  };

  /** Lifts the track behind a moving line. */
  const lift = (axis: Step["axis"], index: number) => {
    if (axis === "row") {
      track.x.jump(-0.47);
      track.y.jump(index - 0.44);
      track.w.jump(n - 0.06);
      track.h.jump(0.88);
    } else {
      track.x.jump(index - 0.44);
      track.y.jump(-0.47);
      track.w.jump(0.88);
      track.h.jump(n - 0.06);
    }
    animate(track.o, 1, { duration: durations.fast, ease: easings.enter });
  };

  /** Solved: the lit dots swell and land, in a cascade from the centre. */
  const celebrate = () => {
    const centre = (n - 1) / 2;
    const lit = dots.filter((d) => d.lit);
    const span = cascade(lit.length) * lit.length;
    for (const dot of lit) {
      const pos = at.indexOf(dot.id);
      const d = Math.hypot((pos % n) - centre, Math.floor(pos / n) - centre);
      const delay = r3((d / Math.max(1, centre * 1.42)) * span);
      animate(dot.glow, [0, 1, 0], {
        duration: 0.7,
        delay,
        ease: easings.move,
      });
      if (!live.current.motionSafe) continue;
      // Up on flick, then home on recoil: two springs, two keyframes each.
      void animate(dot.pop, 1.34, { ...springs.flick, delay }).then(() =>
        animate(dot.pop, 1, springs.recoil),
      );
    }
  };

  const report = (step: Step, raw: number, visitor: boolean) => {
    // A throw can spin a line round more than once: what counts is where it
    // lands, the shortest way.
    const half = Math.floor(n / 2);
    const by = mod(raw + half, n) - half;
    const wasSolved = history.length === 0;
    // History keeps the way home: a step that undoes the last one cancels it.
    for (let k = 0; k < Math.abs(by); k += 1) {
      const dir = (Math.sign(by) || 1) as 1 | -1;
      const top = history[history.length - 1];
      if (
        top &&
        top.axis === step.axis &&
        top.index === step.index &&
        top.dir === -dir
      ) {
        history.pop();
      } else history.push({ axis: step.axis, index: step.index, dir });
    }
    const solved = solvedNow();
    if (solved) history = [];
    const steps = history.length;
    const l = live.current;
    l.onMove?.({ axis: step.axis, index: step.index, by });
    l.onDistanceChange?.(steps);
    l.onSolvedChange?.(solved);
    if (visitor) {
      const where = step.axis === "row" ? "Row" : "Column";
      const way =
        step.axis === "row"
          ? by > 0
            ? "right"
            : "left"
          : by > 0
            ? "down"
            : "up";
      const cells = Math.abs(by) === 1 ? "" : ` ${Math.abs(by)} cells`;
      say(
        solved
          ? "Solved"
          : `${where} ${step.index + 1} slid ${way}${cells}, ${steps} ${steps === 1 ? "step" : "steps"} from home`,
      );
    }
    if (solved && !wasSolved) celebrate();
    show({ at: Array.from(at), steps, solved });
  };

  /** Writes a line's dots to an offset, wrapping round with a ghost. */
  const place = (line: Line, axis: Step["axis"], s: number) => {
    for (const { dot, base } of line) {
      const p = mod(base + s + 0.5, n) - 0.5;
      const ghost = p > n - 1 ? p - n : p < 0 ? p + n : HIDDEN;
      if (axis === "row") {
        dot.x.set(r3(p));
        dot.gx.set(ghost === HIDDEN ? HIDDEN : r3(ghost));
        dot.gy.set(ghost === HIDDEN ? HIDDEN : dot.y.get());
      } else {
        dot.y.set(r3(p));
        dot.gy.set(ghost === HIDDEN ? HIDDEN : r3(ghost));
        dot.gx.set(ghost === HIDDEN ? HIDDEN : dot.x.get());
      }
    }
  };

  /** A move of `by` cells, committed: the board, the dots' rest, the report. */
  const commit = (step: Step, by: number, visitor: boolean) => {
    const k = mod(by, n);
    if (k !== 0) {
      const before = Array.from({ length: n }, (_, i) =>
        step.axis === "row"
          ? (at[step.index * n + i] ?? 0)
          : (at[i * n + step.index] ?? 0),
      );
      for (let i = 0; i < n; i += 1) {
        const id = before[i] ?? 0;
        const j = mod(i + k, n);
        if (step.axis === "row") at[step.index * n + j] = id;
        else at[j * n + step.index] = id;
      }
    }
    for (let p = 0; p < n * n; p += 1) {
      const dot = dots[at[p] ?? 0];
      if (!dot) continue;
      dot.x.jump(p % n);
      dot.y.jump(Math.floor(p / n));
      dot.gx.jump(HIDDEN);
      dot.gy.jump(HIDDEN);
    }
    slide.jump(0);
    for (const { dot } of lineDots(step.axis, step.index)) {
      animate(dot.glow, 0, { duration: durations.slow, ease: easings.exit });
    }
    animate(track.o, 0, { duration: durations.slow, ease: easings.exit });
    if (by !== 0) report(step, by, visitor);
  };

  /** Finishes whatever is moving now, at once, so a new move starts clean. */
  const settleNow = () => {
    const r = running;
    running = { controls: null, finish: null };
    r.controls?.stop();
    r.finish?.();
  };

  /** One line, `by` cells, on springs.snap (or at once, reduced). */
  const run = (
    step: Step,
    by: number,
    visitor: boolean,
    from = 0,
    velocity = 0,
  ) => {
    settleNow();
    const line = lineDots(step.axis, step.index);
    if (!live.current.motionSafe) {
      // Reduced motion: no travel — the line swaps and flashes.
      for (const { dot } of line) dot.glow.set(1);
      animate(track.o, [0, 1, 0], { duration: durations.slow });
      commit(step, by, visitor);
      if (visitor && by !== 0) tick(step.index);
      return;
    }
    let detent = Math.round(from);
    const unsubscribe = slide.on("change", (s) => {
      place(line, step.axis, s);
      const g = clamp(0.45 + Math.abs(slide.getVelocity()) / 7, 0, 1);
      for (const { dot } of line) dot.glow.set(r3(g));
      const cell = Math.round(s);
      if (cell !== detent) {
        detent = cell;
        if (visitor) tick(step.index);
      }
    });
    const finish = () => {
      unsubscribe();
      commit(step, by, visitor);
    };
    lift(step.axis, step.index);
    slide.jump(from);
    const controls = animate(slide, by, { ...springs.snap, velocity });
    running = { controls, finish };
    void controls.then(() => {
      if (running.controls !== controls) return;
      running = { controls: null, finish: null };
      finish();
    });
  };

  const canAuto = () =>
    live.current.autoplay && visible && !document.hidden && !userActive;

  const randomStep = (): Step => {
    const last = history[history.length - 1];
    let pick: Step = { axis: "row", index: 0, dir: 1 };
    for (let tries = 0; tries < 12; tries += 1) {
      pick = {
        axis: rand() < 0.5 ? "row" : "column",
        index: Math.floor(rand() * n),
        dir: rand() < 0.5 ? 1 : -1,
      };
      const undoes =
        last &&
        last.axis === pick.axis &&
        last.index === pick.index &&
        last.dir === -pick.dir;
      // A line with no lit dot looks the same moved: not worth a step.
      const line = lineDots(pick.axis, pick.index);
      if (!undoes && line.some(({ dot }) => dot.lit)) break;
    }
    return pick;
  };

  function scrambleChain(left: number, visitor: boolean) {
    if (!visitor && !canAuto()) return;
    const s = randomStep();
    run(s, s.dir, visitor);
    const gap = clamp(live.current.pace, 200, 1500) * 0.7;
    if (left > 1) later(gap, () => scrambleChain(left - 1, visitor));
    else if (!visitor) later(gap + 1200, () => solveChain(false));
    else later(gap, restAfterVisitor);
  }

  function solveChain(visitor: boolean) {
    if (!visitor && !canAuto()) return;
    const top = history[history.length - 1];
    if (!top) {
      if (visitor) restAfterVisitor();
      else later(2400, cycle);
      return;
    }
    const dir = -top.dir as 1 | -1;
    run({ axis: top.axis, index: top.index, dir }, dir, visitor);
    later(clamp(live.current.pace, 200, 1500), () => solveChain(visitor));
  }

  function cycle() {
    clearTimers();
    if (!canAuto()) return;
    if (history.length > 0) {
      solveChain(false);
      return;
    }
    later(1600, () => scrambleChain(live.current.scrambleSteps, false));
  }

  function restAfterVisitor() {
    clearTimers();
    if (resume) window.clearTimeout(resume);
    resume = window.setTimeout(
      () => {
        resume = 0;
        userActive = false;
        cycle();
      },
      clamp(live.current.resumeAfter, 500, 600000),
    );
  }

  /** The visitor has taken the board: autoplay waits for quiet. */
  const takeOver = () => {
    userActive = true;
    clearTimers();
    settleNow();
    restAfterVisitor();
  };

  const cellSize = () => {
    const r = board.current?.getBoundingClientRect();
    return r ? Math.max(1, r.width / n) : 1;
  };

  return {
    setVisible(on: boolean) {
      visible = on;
      if (!on) clearTimers();
      else if (!userActive) cycle();
    },
    hidden(on: boolean) {
      if (on) clearTimers();
      else if (!userActive) cycle();
    },
    autoplayChanged() {
      if (!live.current.autoplay) clearTimers();
      else if (!userActive) cycle();
    },
    solve() {
      takeOver();
      clearTimers();
      solveChain(true);
    },
    scramble() {
      takeOver();
      clearTimers();
      scrambleChain(clamp(Math.round(live.current.scrambleSteps), 1, 30), true);
    },
    keySlide(axis: Step["axis"], index: number, dir: 1 | -1) {
      takeOver();
      run({ axis, index, dir }, dir, true);
    },
    dragStart(pos: number, dx: number, dy: number) {
      takeOver();
      const axis: Step["axis"] =
        Math.abs(dx) >= Math.abs(dy) ? "row" : "column";
      const index = axis === "row" ? Math.floor(pos / n) : pos % n;
      grab = {
        axis,
        index,
        cell: cellSize(),
        line: lineDots(axis, index),
        detent: 0,
      };
      lift(axis, index);
    },
    dragMove(dx: number, dy: number) {
      const g = grab;
      if (!g) return;
      const s = (g.axis === "row" ? dx : dy) / g.cell;
      slide.jump(s);
      place(g.line, g.axis, s);
      for (const { dot } of g.line) dot.glow.set(0.85);
      const cell = Math.round(s);
      if (cell !== g.detent) {
        g.detent = cell;
        tick(g.index);
      }
    },
    dragEnd(vx: number, vy: number) {
      const g = grab;
      grab = null;
      if (!g) return;
      const s = slide.get();
      const motionSafe = live.current.motionSafe;
      const v = (g.axis === "row" ? vx : vy) / g.cell;
      const landing = Math.round(motionSafe ? project(s, v, 0.99) : s);
      run(
        { axis: g.axis, index: g.index, dir: landing >= 0 ? 1 : -1 },
        landing,
        true,
        s,
        motionSafe ? v : 0,
      );
    },
    dragCancel() {
      const g = grab;
      grab = null;
      if (!g) return;
      run({ axis: g.axis, index: g.index, dir: 1 }, 0, true, slide.get(), 0);
    },
    dispose() {
      clearTimers();
      if (resume) window.clearTimeout(resume);
      resume = 0;
      settleNow();
      visible = false;
    },
  };
}

type Conductor = ReturnType<typeof createConductor>;

function Board({
  n,
  home,
  pace,
  glow,
  scrambleSteps,
  autoplay,
  resumeAfter,
  onMove,
  onSolvedChange,
  onDistanceChange,
  sound,
  disabled,
  label,
  handleRef,
}: {
  n: number;
  home: boolean[];
  pace: number;
  glow: number;
  scrambleSteps: number;
  autoplay: boolean;
  resumeAfter: number;
  onMove?: (move: TorusPuzzleMove) => void;
  onSolvedChange?: (solved: boolean) => void;
  onDistanceChange?: (steps: number) => void;
  sound: boolean;
  disabled: boolean;
  label: string;
  handleRef?: React.Ref<TorusPuzzleHandle>;
}) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const gradientId = `${uid}-halo`;
  const clipId = `${uid}-clip`;
  const hintId = `${uid}-hint`;

  // Dot id = its home cell. The dots and their motion values are made once
  // for this board; a new size or picture remounts it.
  const [dots] = React.useState<Dot[]>(() =>
    Array.from({ length: n * n }, (_, id) => ({
      id,
      lit: home[id] ?? false,
      x: motionValue(id % n),
      y: motionValue(Math.floor(id / n)),
      gx: motionValue(HIDDEN),
      gy: motionValue(HIDDEN),
      glow: motionValue(0),
      pop: motionValue(1),
    })),
  );
  const [slide] = React.useState(() => motionValue(0));
  const [track] = React.useState(() => ({
    x: motionValue(-0.44),
    y: motionValue(-0.44),
    w: motionValue(0.88),
    h: motionValue(0.88),
    o: motionValue(0),
  }));
  // What the grid says: a snapshot taken at each commit.
  const [shown, setShown] = React.useState<Shown>(() => ({
    at: Array.from({ length: n * n }, (_, i) => i),
    steps: 0,
    solved: true,
  }));
  const [focusPos, setFocusPos] = React.useState(0);
  const [said, setSaid] = React.useState("");
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const cellRefs = React.useRef(new Map<number, HTMLDivElement>());
  const startCell = React.useRef(0);
  const live = React.useRef<Live>({
    pace,
    scrambleSteps,
    autoplay,
    resumeAfter,
    motionSafe,
    disabled,
    audio,
    onMove,
    onSolvedChange,
    onDistanceChange,
  });
  const conductor = React.useRef<Conductor | null>(null);

  React.useEffect(() => {
    live.current = {
      pace,
      scrambleSteps,
      autoplay,
      resumeAfter,
      motionSafe,
      disabled,
      audio,
      onMove,
      onSolvedChange,
      onDistanceChange,
    };
  });

  // The conductor lives as long as the mount; StrictMode's rehearsal gets
  // its own and disposes it, so the second run starts from a clean slate.
  React.useEffect(() => {
    const c = createConductor(
      n,
      home,
      dots,
      slide,
      track,
      live,
      boardRef,
      setShown,
      setSaid,
    );
    conductor.current = c;
    // State is reported from the first commit.
    live.current.onSolvedChange?.(true);
    live.current.onDistanceChange?.(0);
    const node = boardRef.current;
    const watcher = node
      ? new IntersectionObserver((entries) => {
          const entry = entries[entries.length - 1];
          c.setVisible(Boolean(entry?.isIntersecting));
        })
      : null;
    if (node) watcher?.observe(node);
    const onVisibility = () => c.hidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      c.dispose();
      if (conductor.current === c) conductor.current = null;
      // Put every dot back where the fresh conductor will expect it.
      for (const dot of dots) {
        dot.x.jump(dot.id % n);
        dot.y.jump(Math.floor(dot.id / n));
        dot.gx.jump(HIDDEN);
        dot.gy.jump(HIDDEN);
        dot.glow.jump(0);
        dot.pop.jump(1);
      }
      slide.jump(0);
      track.o.jump(0);
    };
  }, [dots, home, n, slide, track]);

  React.useEffect(() => {
    conductor.current?.autoplayChanged();
  }, [autoplay]);

  React.useImperativeHandle(
    handleRef,
    () => ({
      solve: () => conductor.current?.solve(),
      scramble: () => conductor.current?.scramble(),
    }),
    [],
  );

  const cellAt = (clientX: number, clientY: number) => {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r) return 0;
    const c = clamp(Math.floor(((clientX - r.left) / r.width) * n), 0, n - 1);
    const row = clamp(Math.floor(((clientY - r.top) / r.height) * n), 0, n - 1);
    return row * n + c;
  };

  // Drag: the axis is chosen by the first travel; the line follows 1:1 and
  // wraps as far as it is pulled; release snaps to a whole step.
  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ offset }) =>
      conductor.current?.dragStart(startCell.current, offset.x, offset.y),
    onMove: ({ offset }) => conductor.current?.dragMove(offset.x, offset.y),
    onEnd: ({ velocity }) => conductor.current?.dragEnd(velocity.x, velocity.y),
    onCancel: () => conductor.current?.dragCancel(),
  });

  const focusCell = (pos: number) => {
    setFocusPos(pos);
    cellRefs.current.get(pos)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const row = Math.floor(focusPos / n);
    const col = focusPos % n;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const arrow = arrows[event.key];
    if (arrow) {
      event.preventDefault();
      const [dr, dc] = arrow;
      if (event.shiftKey) {
        // Slide the focused cell's row or column one step; focus rides along.
        const axis: Step["axis"] = dc !== 0 ? "row" : "column";
        const dir = (dc !== 0 ? dc : dr) as 1 | -1;
        conductor.current?.keySlide(axis, axis === "row" ? row : col, dir);
        focusCell(
          axis === "row"
            ? row * n + mod(col + dir, n)
            : mod(row + dir, n) * n + col,
        );
        return;
      }
      // A torus: moving off one edge comes back on the other.
      focusCell(mod(row + dr, n) * n + mod(col + dc, n));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusCell(event.ctrlKey ? 0 : row * n);
    } else if (event.key === "End") {
      event.preventDefault();
      focusCell(event.ctrlKey ? n * n - 1 : row * n + n - 1);
    }
  };

  const name = shown.solved
    ? `${label}, solved`
    : `${label}, ${shown.steps} ${shown.steps === 1 ? "step" : "steps"} from home`;

  return (
    <div
      ref={boardRef}
      className="absolute inset-[7%] touch-none"
      {...drag}
      onPointerDown={(event) => {
        startCell.current = cellAt(event.clientX, event.clientY);
        drag.onPointerDown(event);
      }}
    >
      <svg
        aria-hidden
        viewBox={`-0.5 -0.5 ${n} ${n}`}
        className="absolute inset-0 size-full overflow-hidden"
      >
        <defs>
          <radialGradient id={gradientId}>
            <stop
              offset="0%"
              style={{ stopColor: "var(--torus-lit)", stopOpacity: 0.75 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--torus-lit)", stopOpacity: 0 }}
            />
          </radialGradient>
          <clipPath id={clipId}>
            <rect x={-0.5} y={-0.5} width={n} height={n} />
          </clipPath>
        </defs>
        <motion.rect
          x={track.x}
          y={track.y}
          width={track.w}
          height={track.h}
          rx={0.44}
          className="fill-[var(--torus-track)]"
          style={{ opacity: track.o }}
        />
        {home.map((on, pos) =>
          on ? (
            <circle
              key={pos}
              cx={pos % n}
              cy={Math.floor(pos / n)}
              r={0.29}
              fill="none"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="stroke-[var(--torus-dim)] opacity-40"
            />
          ) : null,
        )}
        <g clipPath={`url(#${clipId})`}>
          {dots.map((dot) => (
            <DotView
              key={dot.id}
              dot={dot}
              glow={glow}
              litFill={`url(#${gradientId})`}
              motionSafe={motionSafe}
            />
          ))}
        </g>
      </svg>
      <div
        role="grid"
        aria-label={name}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className="absolute inset-0 flex flex-col"
      >
        {Array.from({ length: n }, (_, row) => (
          <div key={row} role="row" className="flex flex-1">
            {Array.from({ length: n }, (_, col) => {
              const pos = row * n + col;
              const lit = home[shown.at[pos] ?? 0] ?? false;
              const belongs = home[pos] ?? false;
              const state = lit
                ? belongs
                  ? "lit, in place"
                  : "lit, out of place"
                : belongs
                  ? "dark, a lit dot belongs here"
                  : "dark";
              return (
                <div
                  key={col}
                  ref={(node) => {
                    if (node) cellRefs.current.set(pos, node);
                    else cellRefs.current.delete(pos);
                  }}
                  role="gridcell"
                  tabIndex={disabled ? -1 : pos === focusPos ? 0 : -1}
                  aria-label={`Row ${row + 1}, column ${col + 1}, ${state}`}
                  onFocus={() => setFocusPos(pos)}
                  className="flex-1 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring focus-visible:outline-solid"
                />
              );
            })}
          </div>
        ))}
      </div>
      <span id={hintId} className="sr-only">
        Arrow keys move between dots. Shift with an arrow slides the row or
        column.
      </span>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}

/**
 * A square of glowing dots holding a simple picture. Whole rows and columns
 * slide one cell at a time on springs.snap and wrap round the edges like a
 * torus — the dot leaving one side is drawn again entering the other — while
 * the moving line's track lifts behind it and its dots glow with its speed.
 * On its own the board scrambles itself and then solves back in a calm,
 * deliberate sequence: the inverse of every step it took.
 *
 * Drag any row or column: it follows 1:1 and wraps as far as you pull, and a
 * release snaps to the nearest whole step with the throw's velocity. Every
 * move joins the history, so after `resumeAfter` of quiet it solves from
 * wherever you left it; solve it yourself and it notices. Solved, the lit
 * dots swell and land on springs.recoil in a cascade from the centre. It is a
 * real grid: arrow keys move between dots (wrapping, as a torus does) and
 * Shift with an arrow slides the row or column. Under reduced motion steps
 * are instant swaps with a flash, and solved is a glow, not a swell.
 */
export function TorusPuzzle({
  grid = 6,
  pace = 600,
  glow = 0.6,
  pattern = "ring",
  scramble = 7,
  autoplay = true,
  resumeAfter = 5000,
  colors,
  onMove,
  onSolvedChange,
  onDistanceChange,
  sound = false,
  disabled = false,
  label = "Torus puzzle",
  className,
  ref,
}: TorusPuzzleProps) {
  const n = clamp(Math.round(grid), 3, 9);
  const home = React.useMemo(() => picture(n, pattern), [n, pattern]);
  const key = `${n}|${home.map((on) => (on ? 1 : 0)).join("")}`;
  const lit = colors?.lit ?? DEFAULT_COLORS.lit;
  const dim = colors?.dim ?? DEFAULT_COLORS.dim;
  const trackColor = colors?.track ?? DEFAULT_COLORS.track;

  return (
    <div
      className={cn(
        "group/torus-puzzle relative isolate aspect-square w-52 rounded-4 border border-hairline bg-surface-2 select-none",
        disabled && "opacity-60",
        className,
      )}
      style={
        {
          "--torus-lit": lit,
          "--torus-dim": dim,
          "--torus-track": trackColor,
        } as React.CSSProperties
      }
    >
      <Board
        key={key}
        n={n}
        home={home}
        pace={pace}
        glow={glow}
        scrambleSteps={clamp(Math.round(scramble), 1, 30)}
        autoplay={autoplay}
        resumeAfter={resumeAfter}
        onMove={onMove}
        onSolvedChange={onSolvedChange}
        onDistanceChange={onDistanceChange}
        sound={sound}
        disabled={disabled}
        label={label}
        handleRef={ref}
      />
    </div>
  );
}
