"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CrosswordGrid = "news" | "pastel" | "ink";

export type CrosswordGuessProps = {
  /** The status phrases, solved into the grid one row each and cycled in order. */
  phrases: string[];
  /** Solving. False finishes the row, solves `doneText` and rests. @default true */
  active?: boolean;
  /** The row that stays once inactive. @default the last phrase */
  doneText?: string;
  /** How fast the solver works, 0.5 to 2. @default 1 */
  speed?: number;
  /** Wrong guesses pencilled into each phrase before they are rubbed out, 0 to 3. @default 1 */
  guesses?: number;
  /** How the grid is printed. @default "news" */
  grid?: CrosswordGrid;
  /** Determinate progress, 0 to 1: the phrases share it, and the squares fill with it. */
  progress?: number;
  /** Play the visitor's ticks and rubs. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep solving, but squares cannot be checked. */
  disabled?: boolean;
  /** A row began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  className?: string;
};

type Print = {
  square: string;
  /** Pastel: each entry on its own tint. */
  tints: readonly string[] | null;
  block: string;
  rule: string;
  number: string;
  pencil: string;
  ink: string;
  entry: string;
  cursor: string;
};

// The grid is printed matter: fixed pigments that read the same on a light
// or a dark page, framed by their own rules.
const PRINTS: Record<CrosswordGrid, Print> = {
  news: {
    square: "oklch(0.975 0.008 95)",
    tints: null,
    block: "oklch(0.22 0.012 262)",
    rule: "oklch(0.34 0.012 262)",
    number: "oklch(0.36 0.012 262)",
    pencil: "oklch(0.52 0.008 262)",
    ink: "oklch(0.18 0.02 262)",
    entry: "oklch(0.935 0.055 96)",
    cursor: "oklch(0.875 0.13 94)",
  },
  pastel: {
    square: "oklch(0.975 0.01 300)",
    tints: [
      "oklch(0.95 0.035 20)",
      "oklch(0.955 0.035 160)",
      "oklch(0.95 0.032 245)",
      "oklch(0.96 0.045 90)",
    ],
    block: "oklch(0.76 0.07 300)",
    rule: "oklch(0.6 0.06 300)",
    number: "oklch(0.45 0.06 300)",
    pencil: "oklch(0.54 0.02 290)",
    ink: "oklch(0.36 0.14 285)",
    entry: "oklch(0.9 0.06 300)",
    cursor: "oklch(0.83 0.11 300)",
  },
  ink: {
    square: "oklch(0.3 0.05 266)",
    tints: null,
    block: "oklch(0.17 0.035 266)",
    rule: "oklch(0.5 0.06 266)",
    number: "oklch(0.74 0.04 266)",
    pencil: "oklch(0.78 0.015 266)",
    ink: "oklch(0.94 0.08 88)",
    entry: "oklch(0.37 0.07 266)",
    cursor: "oklch(0.47 0.1 266)",
  },
};

const RUBBER = "oklch(0.78 0.09 12)";

/** Near misses: what a solver writes before a crossing has confirmed it. */
const NEAR: Record<string, string> = {
  A: "E",
  B: "D",
  C: "G",
  D: "B",
  E: "F",
  F: "E",
  G: "C",
  H: "N",
  I: "L",
  J: "I",
  K: "X",
  L: "I",
  M: "N",
  N: "M",
  O: "Q",
  P: "R",
  Q: "O",
  R: "P",
  S: "Z",
  T: "I",
  U: "V",
  V: "U",
  W: "V",
  X: "K",
  Y: "V",
  Z: "S",
};

/** Seconds at speed 1. */
const LEAD = 0.4;
const NOTICE = 0.45;
const TRAVEL = 0.22;
const RUB = 0.5;
const SWAP = 0.3;
const HOLD = 1.4;
/** The pen lifting off past the row's end. */
const PARK = 0.5;
/** A visitor's rub: the eraser's share of it, then the right letter. */
const RUB_SHARE = 0.8;
/** The tool leans up and to the right of the square it works in. */
const LEAN = -40;
const COS = Number(Math.cos((LEAN * Math.PI) / 180).toFixed(4));
const SIN = Number(Math.sin((LEAN * Math.PI) / 180).toFixed(4));
/** Rubber crumbs: where each leaves the square, in squares. */
const CRUMBS = [
  [-0.2, 0.02],
  [0.14, 0.07],
  [-0.06, 0.12],
  [0.24, 0],
] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same hand, the same slips, every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Cell = {
  ch: string;
  block: boolean;
  /** Entry (word) index in the row; -1 for a block. */
  entry: number;
  first: boolean;
  /** The near miss written first, when this square is a wrong guess. */
  wrong: string | null;
  /** A hand's lean and drift inside the box, deg and % of the square. */
  tilt: number;
  dx: number;
  dy: number;
};

type Entry = { num: number; start: number; len: number };

type Plan = { text: string; cells: Cell[]; entries: Entry[] };

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

function planOf(text: string, base: number, guesses: number): Plan {
  const rand = lcg(hash(text));
  const cells: Cell[] = [];
  const entries: Entry[] = [];
  wordsOf(text).forEach((word, w) => {
    if (w > 0) {
      cells.push({
        ch: "",
        block: true,
        entry: -1,
        first: false,
        wrong: null,
        tilt: 0,
        dx: 0,
        dy: 0,
      });
    }
    const chars = Array.from(word.toUpperCase());
    entries.push({ num: base + w, start: cells.length, len: chars.length });
    chars.forEach((ch, k) => {
      cells.push({
        ch,
        block: false,
        entry: w,
        first: k === 0,
        wrong: null,
        tilt: r1((rand() - 0.5) * 8),
        dx: r1((rand() - 0.5) * 5),
        dy: r1((rand() - 0.5) * 6),
      });
    });
  });
  const letters = cells.filter((c) => !c.block).length;
  const pool = cells
    .map((c, i) => (!c.block && NEAR[c.ch] ? i : -1))
    .filter((i) => i >= 0);
  const count = Math.min(
    Math.max(0, Math.round(guesses)),
    Math.floor(letters / 3),
    pool.length,
  );
  for (let k = 0; k < count; k += 1) {
    const [i] = pool.splice(Math.floor(rand() * pool.length), 1);
    const cell = i === undefined ? undefined : cells[i];
    if (cell) cell.wrong = NEAR[cell.ch] ?? null;
  }
  return { text, cells, entries };
}

type Tool = "pencil" | "eraser" | "pen";

type Seg = {
  a: number;
  b: number;
  kind: "write" | "erase" | "move" | "ink" | "park";
  cell: number;
  tool: Tool;
};

type Timeline = {
  /** When each square is pencilled, s at speed 1; -1 for blocks. */
  pen: number[];
  /** When the solver starts rubbing out a wrong guess; -1 when it never does. */
  erase: number[];
  /** When the right letter goes in after a rub. */
  fix: number[];
  ink: number[];
  write: number;
  rub: number;
  inkWipe: number;
  pencilEnd: number;
  /** When the solver sets off for its first correction. */
  rubStart: number;
  checkEnd: number;
  inkStart: number;
  inkEnd: number;
  holdEnd: number;
  segs: Seg[];
  first: number;
  last: number;
};

function timelineOf(
  plan: Plan,
  caught: ReadonlySet<number>,
  motionSafe: boolean,
): Timeline {
  const rand = lcg(hash(plan.text) ^ 0x2f6b1c3d);
  const n = plan.cells.length;
  const pen = new Array<number>(n).fill(-1);
  const erase = new Array<number>(n).fill(-1);
  const fix = new Array<number>(n).fill(-1);
  const ink = new Array<number>(n).fill(-1);
  const segs: Seg[] = [];
  const letters = plan.cells.filter((c) => !c.block).length;
  const first = Math.max(
    0,
    plan.cells.findIndex((c) => !c.block),
  );
  let last = first;
  plan.cells.forEach((c, i) => {
    if (!c.block) last = i;
  });

  // Long phrases are solved a little faster, so no pencil pass runs past ~2.4s.
  const step = Math.min(0.12, 2.4 / Math.max(1, letters));
  const write = motionSafe ? Math.min(0.1, step * 0.9) : 0.24;
  const rub = motionSafe ? RUB : 0.3;
  let t = motionSafe ? LEAD : 0.1;
  plan.cells.forEach((c, i) => {
    // Drawn for every square, so the rhythm never depends on what is caught.
    const jitter = rand();
    if (c.block) {
      if (motionSafe) t += step * 0.7;
      return;
    }
    pen[i] = t;
    if (motionSafe) {
      segs.push({ a: t, b: t + write, kind: "write", cell: i, tool: "pencil" });
      t += step * (0.78 + jitter * 0.44);
    }
  });
  // Written all at once, a row keeps the reading time the pencil would have
  // given it.
  const pencilEnd = motionSafe
    ? t
    : t + write + Math.min(1.8, letters * step * 0.8);
  t = pencilEnd + NOTICE * (motionSafe ? 1 : 1.5);
  const rubStart = t;

  plan.cells.forEach((c, i) => {
    if (!c.wrong || caught.has(i)) return;
    if (motionSafe) {
      segs.push({ a: t, b: t + TRAVEL, kind: "move", cell: i, tool: "eraser" });
      t += TRAVEL;
    }
    erase[i] = t;
    segs.push({ a: t, b: t + rub, kind: "erase", cell: i, tool: "eraser" });
    t += rub;
    fix[i] = t;
    segs.push({ a: t, b: t + write, kind: "write", cell: i, tool: "pencil" });
    t += write + (motionSafe ? 0.14 : 0.4);
  });
  const checkEnd = t;

  let inkWipe: number;
  let inkStart: number;
  let inkEnd: number;
  if (motionSafe) {
    segs.push({ a: t, b: t + SWAP, kind: "move", cell: first, tool: "pen" });
    t += SWAP;
    inkStart = t;
    const inkStep = Math.min(0.075, 1.5 / Math.max(1, letters));
    inkWipe = inkStep * 1.8;
    let lastInk = t;
    plan.cells.forEach((c, i) => {
      if (c.block) {
        t += inkStep * 0.5;
        return;
      }
      ink[i] = t;
      lastInk = t;
      t += inkStep;
    });
    inkEnd = lastInk + inkWipe;
    segs.push({ a: inkStart, b: inkEnd, kind: "ink", cell: last, tool: "pen" });
  } else {
    inkStart = t;
    inkWipe = 0.3;
    plan.cells.forEach((c, i) => {
      if (!c.block) ink[i] = t;
    });
    inkEnd = t + inkWipe;
  }
  segs.push({
    a: inkEnd,
    b: inkEnd + PARK,
    kind: "park",
    cell: last,
    tool: "pen",
  });
  return {
    pen,
    erase,
    fix,
    ink,
    write,
    rub,
    inkWipe,
    pencilEnd,
    rubStart,
    checkEnd,
    inkStart,
    inkEnd,
    holdEnd: inkEnd + HOLD,
    segs,
    first,
    last,
  };
}

/**
 * Where a determinate row waits for more progress: never mid-rub or
 * mid-letter, but with the letter written or the eraser poised over the
 * guess it is about to take out.
 */
function restAt(tl: Timeline, t: number): number {
  const seg = tl.segs.find((s) => s.a <= t && t < s.b);
  if (!seg) return Math.min(t, tl.inkEnd);
  if (seg.kind === "erase") return seg.a;
  if (seg.kind === "write" || seg.kind === "move") return seg.b;
  return t;
}

/** The segment working now, or the next one while the tool is between squares. */
const segAt = (tl: Timeline, t: number): Seg | undefined =>
  tl.segs.find((s) => s.b > t);

type Geo = {
  /** The column's top-left in the root, without its scroll. */
  ox: number;
  oy: number;
  /** One square's size. */
  c: number;
  /** Square centres in the column. */
  pts: { x: number; y: number }[];
};

/** Where the tool's point is headed: a square's centre, or along the ink. */
function targetAt(tl: Timeline, t: number, g: Geo) {
  const at = (i: number) => g.pts[i] ?? { x: 0, y: 0 };
  const seg = segAt(tl, t);
  if (!seg || (seg.kind === "park" && t >= seg.a)) {
    const p = at(tl.last);
    return { x: p.x + g.c * 0.9, y: p.y + g.c * 0.35 };
  }
  if (seg.kind === "ink" && t >= seg.a) {
    let k = tl.first;
    tl.ink.forEach((s, i) => {
      if (s >= 0 && s <= t) k = i;
    });
    const p = at(k);
    const u = clamp01((t - (tl.ink[k] ?? t)) / Math.max(0.01, tl.inkWipe));
    return { x: p.x + (u - 0.5) * g.c * 0.8, y: p.y };
  }
  return at(seg.cell);
}

/** The scribble of a letter being written, or the rub of the eraser. */
function handAt(tl: Timeline, t: number, c: number) {
  const seg = segAt(tl, t);
  if (!seg || t < seg.a) return { dx: 0, dy: 0 };
  const u = clamp01((t - seg.a) / Math.max(0.01, seg.b - seg.a));
  if (seg.kind === "write") {
    return {
      dx: (u - 0.5) * c * 0.42 + Math.sin(u * Math.PI * 5) * c * 0.06,
      dy: -Math.sin(u * Math.PI * 3) * c * 0.2,
    };
  }
  if (seg.kind === "erase") {
    const s = (t - seg.a) * Math.PI * 2 * 4.5;
    return { dx: Math.sin(s) * c * 0.24, dy: Math.cos(s * 2) * c * 0.04 };
  }
  return { dx: 0, dy: 0 };
}

type Marks = {
  /** A visitor's rub of a wrong guess, 0 to 1. */
  rub: MotionValue<number>;
  /** A visitor revealing an empty square. */
  hand: MotionValue<number>;
  /** A visitor inking a pencilled letter. */
  inked: MotionValue<number>;
};

type Slot = {
  /** New for every row, so the same phrase twice is two rows. */
  n: number;
  /** Index in `phrases`, or -1 for the done text. */
  index: number;
  text: string;
  final: boolean;
  /** Wrong guesses are dealt when a row begins. */
  guesses: number;
};

type Lit = "cursor" | "entry" | null;

const LETTER =
  "pointer-events-none absolute inset-0 flex items-center justify-center leading-none [font-size:calc(var(--cell)*0.56)]";

/** Letters sit a little right of and below centre, clear of the clue number. */
const seat = (cell: Cell) => `${r1(cell.dx + 4)}% ${r1(cell.dy + 7)}%`;

function squareOf(print: Print, num: number, lit: Lit) {
  if (lit === "cursor") return print.cursor;
  if (lit === "entry") return print.entry;
  return print.tints
    ? (print.tints[num % print.tints.length] ?? print.square)
    : print.square;
}

function ClueNumber({
  print,
  num,
  lit,
}: {
  print: Print;
  num: number;
  lit: Lit;
}) {
  return (
    <span
      className="pointer-events-none absolute top-px left-[2px] [font-size:max(6px,calc(var(--cell)*0.25))] leading-none tabular-nums"
      style={{ color: print.number, fontWeight: lit ? 700 : 500 }}
    >
      {num}
    </span>
  );
}

type Look = {
  wrong: number;
  erased: number;
  right: number;
  ink: number;
  /** The visitor's own eraser, 0 to 1, or -1. */
  rubbing: number;
};

type LiveCellProps = {
  cell: Cell;
  at: number;
  num: number;
  marks: Marks;
  clock: MotionValue<number>;
  tl: Timeline;
  print: Print;
  lit: Lit;
  motionSafe: boolean;
  bind: (node: HTMLSpanElement | null) => void;
};

function LiveCell({
  cell,
  at,
  num,
  marks,
  clock,
  tl,
  print,
  lit,
  motionSafe,
  bind,
}: LiveCellProps) {
  const look = useTransform(
    [clock, marks.rub, marks.hand, marks.inked],
    ([t = 0, rub = 0, hand = 0, inked = 0]: number[]): Look => {
      const start = tl.pen[at] ?? -1;
      const penned = start >= 0 ? clamp01((t - start) / tl.write) : 0;
      let wrong = 0;
      let erased = 0;
      let right = penned;
      let rubbing = -1;
      if (cell.wrong && hand <= 0) {
        wrong = penned;
        right = 0;
        const e = tl.erase[at] ?? -1;
        if (rub > 0) {
          erased = clamp01(rub / RUB_SHARE);
          right = clamp01((rub - RUB_SHARE) / (1 - RUB_SHARE));
          rubbing = erased;
        } else if (e >= 0) {
          erased = clamp01((t - e) / tl.rub);
          right = clamp01((t - (tl.fix[at] ?? e)) / tl.write);
        }
      }
      right = Math.max(right, hand);
      const s = tl.ink[at] ?? -1;
      const ink = Math.max(s >= 0 ? clamp01((t - s) / tl.inkWipe) : 0, inked);
      return { wrong, erased, right, ink, rubbing };
    },
  );

  // A letter is written by revealing it behind the point, left to right;
  // under reduced motion it simply appears.
  const wipe = (p: number) =>
    !motionSafe || p >= 1
      ? "none"
      : `inset(-20% ${r1(100 - p * 100)}% -20% -20%)`;
  const shown = (p: number) => (motionSafe ? (p > 0 ? 1 : 0) : p);

  const wrongClip = useTransform(look, (l) => wipe(l.wrong));
  const wrongOpacity = useTransform(look, (l) =>
    r2(shown(l.wrong) * Math.pow(1 - l.erased, 1.4) * (1 - l.ink)),
  );
  // The rub drags the graphite sideways and softens it as it goes.
  const wrongBlur = useTransform(look, (l) =>
    motionSafe && l.erased > 0 ? `blur(${r2(l.erased * 0.9)}px)` : "none",
  );
  const wrongSmear = useTransform(look, (l) =>
    motionSafe ? `${r1(l.erased * 9)}%` : "0%",
  );
  // An erased guess leaves a graphite ghost, as it does on real paper.
  const ghost = useTransform(look, (l) =>
    r2(0.2 * l.erased * (1 - 0.6 * l.ink)),
  );
  const rightClip = useTransform(look, (l) => wipe(l.right));
  const rightOpacity = useTransform(look, (l) =>
    r2(shown(l.right) * (1 - l.ink)),
  );
  const inkClip = useTransform(look, (l) => wipe(l.ink));
  const inkOpacity = useTransform(look, (l) => r2(shown(l.ink)));
  const crumbs = useTransform(look, (l) => {
    if (!motionSafe || l.erased <= 0 || l.erased >= 1) return "none";
    const e = l.erased;
    const alpha = Math.round((1 - e) * 90);
    return CRUMBS.map(
      ([kx, ky]) =>
        `calc(var(--cell) * ${r2(kx * (0.5 + e))}) calc(var(--cell) * ${r2(ky + e * e * 0.9)}) 0 0.6px color-mix(in oklab, ${RUBBER} ${alpha}%, transparent)`,
    ).join(", ");
  });
  const eraserOpacity = useTransform(look, (l) =>
    motionSafe && l.rubbing > 0 && l.rubbing < 1
      ? r2(Math.min(1, l.rubbing * 8, (1 - l.rubbing) * 8))
      : 0,
  );
  const eraserX = useTransform(look, (l) =>
    l.rubbing > 0
      ? `${r1(Math.sin(l.rubbing * Math.PI * 2 * 3.5) * 22)}%`
      : "0%",
  );

  const hand = {
    rotate: `${cell.tilt}deg`,
    translate: seat(cell),
  };

  return (
    <span
      ref={bind}
      data-cell={at}
      data-row="live"
      className="relative -mr-px -mb-px box-border flex size-[var(--cell)] shrink-0 items-center justify-center border transition-colors duration-150"
      style={{
        borderColor: print.rule,
        backgroundColor: squareOf(print, num, lit),
      }}
    >
      {cell.first ? <ClueNumber print={print} num={num} lit={lit} /> : null}
      <motion.span
        className="pointer-events-none absolute inset-[16%] rounded-full"
        style={{
          background: `radial-gradient(closest-side, color-mix(in oklab, ${print.pencil} 70%, transparent), transparent)`,
          opacity: ghost,
        }}
      />
      {cell.wrong ? (
        <motion.span
          className={cn(LETTER, "font-medium")}
          style={{
            ...hand,
            color: print.pencil,
            clipPath: wrongClip,
            opacity: wrongOpacity,
            filter: wrongBlur,
            x: wrongSmear,
          }}
        >
          {cell.wrong}
        </motion.span>
      ) : null}
      <motion.span
        className={cn(LETTER, "font-medium")}
        style={{
          ...hand,
          color: print.pencil,
          clipPath: rightClip,
          opacity: rightOpacity,
        }}
      >
        {cell.ch}
      </motion.span>
      <motion.span
        className={cn(LETTER, "font-semibold")}
        style={{
          rotate: `${r1(cell.tilt * 0.6)}deg`,
          translate: seat(cell),
          color: print.ink,
          clipPath: inkClip,
          opacity: inkOpacity,
        }}
      >
        {cell.ch}
      </motion.span>
      <motion.span
        className="pointer-events-none absolute top-[62%] left-1/2 size-[2px] rounded-full"
        style={{ boxShadow: crumbs }}
      />
      <motion.span
        className="pointer-events-none absolute top-[34%] left-[20%] h-[36%] w-[60%] rounded-[3px] shadow-[0_1px_1px_color-mix(in_oklab,black_25%,transparent)]"
        style={{ backgroundColor: RUBBER, opacity: eraserOpacity, x: eraserX }}
      />
    </span>
  );
}

type StaticCellProps = {
  cell: Cell;
  at: number;
  num: number;
  print: Print;
  lit: Lit;
  inked: boolean;
  row: "next" | "leaving";
};

function StaticCell({
  cell,
  at,
  num,
  print,
  lit,
  inked,
  row,
}: StaticCellProps) {
  return (
    <span
      data-cell={at}
      data-row={row}
      className="relative -mr-px -mb-px box-border flex size-[var(--cell)] shrink-0 items-center justify-center border transition-colors duration-150"
      style={{
        borderColor: print.rule,
        backgroundColor: squareOf(print, num, lit),
      }}
    >
      {cell.first ? <ClueNumber print={print} num={num} lit={lit} /> : null}
      {inked ? (
        <span
          className={cn(LETTER, "font-semibold")}
          style={{
            rotate: `${r1(cell.tilt * 0.6)}deg`,
            translate: seat(cell),
            color: print.ink,
          }}
        >
          {cell.ch}
        </span>
      ) : null}
    </span>
  );
}

type SquaresProps = {
  plan: Plan;
  print: Print;
  render: (cell: Cell, at: number, num: number) => React.ReactNode;
};

/** A row of squares: whole words, each with the block after it, wrapping between words. */
function Squares({ plan, print, render }: SquaresProps) {
  const groups: { key: number; items: number[] }[] = [];
  plan.cells.forEach((cell, i) => {
    if (cell.first || groups.length === 0) groups.push({ key: i, items: [] });
    groups[groups.length - 1]?.items.push(i);
  });
  return (
    <div className="flex flex-wrap pr-px pb-px">
      {groups.map((g) => (
        <span key={g.key} className="flex">
          {g.items.map((i) => {
            const cell = plan.cells[i] as Cell;
            if (cell.block) {
              return (
                <span
                  key={i}
                  className="-mr-px -mb-px box-border block size-[var(--cell)] shrink-0 border"
                  style={{
                    borderColor: print.rule,
                    backgroundColor: print.block,
                  }}
                />
              );
            }
            const num = plan.entries[cell.entry]?.num ?? 0;
            return (
              <React.Fragment key={i}>{render(cell, i, num)}</React.Fragment>
            );
          })}
        </span>
      ))}
    </div>
  );
}

function Pencil() {
  return (
    <svg
      viewBox="0 0 100 20"
      className="absolute inset-0 size-full overflow-visible"
    >
      <g
        stroke="oklch(0.25 0.02 262 / 0.55)"
        strokeWidth={0.8}
        strokeLinejoin="round"
      >
        <polygon points="7,7.4 22,3 22,17 7,12.6" fill="oklch(0.85 0.06 72)" />
        <polygon points="0,10 7,7.4 7,12.6" fill="oklch(0.32 0.01 262)" />
        <rect x={22} y={3} width={58} height={14} fill="oklch(0.84 0.15 88)" />
        <rect
          x={22}
          y={3}
          width={58}
          height={4}
          fill="oklch(0.9 0.12 92)"
          stroke="none"
        />
        <rect
          x={22}
          y={13}
          width={58}
          height={4}
          fill="oklch(0.74 0.14 78)"
          stroke="none"
        />
        <rect
          x={80}
          y={2.4}
          width={8}
          height={15.2}
          fill="oklch(0.8 0.02 95)"
        />
        <line x1={83} x2={83} y1={2.8} y2={17.2} />
        <line x1={85.5} x2={85.5} y1={2.8} y2={17.2} />
        <rect x={88} y={3} width={11.5} height={14} rx={3} fill={RUBBER} />
      </g>
    </svg>
  );
}

function Pen({ ink }: { ink: string }) {
  return (
    <svg
      viewBox="0 0 100 20"
      className="absolute inset-0 size-full overflow-visible"
    >
      <g
        stroke="oklch(0.95 0.01 262 / 0.35)"
        strokeWidth={0.8}
        strokeLinejoin="round"
      >
        <polygon
          points="5,8.4 16,5.4 16,14.6 5,11.6"
          fill="oklch(0.74 0.01 262)"
        />
        <polygon points="0,10 5,8.6 5,11.4" fill={ink} />
        <rect
          x={16}
          y={5}
          width={22}
          height={10}
          rx={2}
          fill="oklch(0.36 0.02 262)"
        />
        <rect
          x={38}
          y={4}
          width={62}
          height={12}
          rx={3}
          fill="oklch(0.26 0.03 262)"
        />
        <rect
          x={60}
          y={2.4}
          width={34}
          height={2.6}
          rx={1.2}
          fill="oklch(0.62 0.02 262)"
        />
      </g>
    </svg>
  );
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Status = { entry: number; act: string };

type Api = {
  play: () => void;
  halt: () => void;
  measure: () => void;
  fit: () => void;
  status: (t: number) => void;
};

/**
 * A status line solved into a crossword. Each phrase fills a row of
 * squares — words across, a black block between them, clue numbers in the
 * corners — and the next phrase waits under it as empty squares. A pencil
 * writes the letters in graphite, square by square; a few are near misses,
 * which the solver comes back for once the row is pencilled: it flips the
 * pencil, rubs each one out and writes the right letter. Then a pen inks the
 * row over the pencil, the phrase is announced, and the grid scrolls up a row
 * to the next one.
 *
 * The pointer over a square shows its clue: the entry lights up and the clue
 * bar reads its number. Pressing a square checks it — a wrong guess is
 * rubbed out on the spot, a right one inked, an empty one revealed — and the
 * keyboard does the same with a cursor square. One clock per row drives every
 * square and the tool through motion values; nothing renders per frame.
 * Under reduced motion nothing travels: letters appear, corrections and ink
 * are cross-fades, and rows swap in place.
 */
export function CrosswordGuess({
  phrases,
  active = true,
  doneText,
  speed = 1,
  guesses = 1,
  grid = "news",
  progress,
  sound = false,
  disabled = false,
  onPhraseChange,
  className,
}: CrosswordGuessProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const print = PRINTS[grid] ?? PRINTS.news;
  const rate = clamp(speed, 0.5, 2);
  const deal = clamp(Math.round(guesses), 0, 3);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const list = phrases.length > 0 ? phrases : [doneText ?? ""];
  const done = doneText ?? list[list.length - 1] ?? "";
  const determinate = progress !== undefined;
  const share = clamp01(progress ?? 0);
  const band = Math.min(list.length - 1, Math.floor(share * list.length));
  const local = clamp01(share * list.length - band);

  // Clue numbers run on through the phrases, as in one grid; every row
  // shares the column pitch of the widest.
  const listKey = list.join("\u0000");
  const layout = React.useMemo(() => {
    const texts = listKey.split("\u0000");
    let b = 1;
    const bases = texts.map((p) => {
      const start = b;
      b += wordsOf(p).length;
      return start;
    });
    const cols = Math.max(
      1,
      ...[...texts, done].map((p) => planOf(p, 0, 0).cells.length),
    );
    return { bases, done: b, cols };
  }, [listKey, done]);
  const baseOf = (index: number) =>
    index < 0 ? layout.done : (layout.bases[index] ?? 1);

  const [slot, setSlot] = React.useState<Slot>(() => {
    if (!active) {
      return { n: 0, index: -1, text: done, final: true, guesses: 0 };
    }
    const index = determinate ? band : 0;
    return {
      n: 0,
      index,
      text: list[index] ?? "",
      final: false,
      guesses: deal,
    };
  });
  const [leaving, setLeaving] = React.useState<Slot | null>(null);
  const [caught, setCaught] = React.useState<{ n: number; list: number[] }>({
    n: -1,
    list: [],
  });
  const [said, setSaid] = React.useState(() =>
    slot.final ? { n: slot.n, text: slot.text } : { n: -1, text: "" },
  );
  const [reading, setReading] = React.useState({ n: 0, text: "" });
  const [status, setStatus] = React.useState<Status>({
    entry: 0,
    act: slot.final ? "inked" : "pencil",
  });
  const [hover, setHover] = React.useState<{
    row: "live" | "next";
    cell: number;
  } | null>(null);
  const [cursor, setCursor] = React.useState(-1);
  const [keyed, setKeyed] = React.useState(false);
  const [sized, setSized] = React.useState(false);
  const [toolSize, setToolSize] = React.useState(38);

  const nextOf = (s: Slot): Slot | null => {
    if (!active) {
      return s.final
        ? null
        : { n: s.n + 1, index: -1, text: done, final: true, guesses: 0 };
    }
    const index = s.final ? 0 : s.index + 1;
    if (determinate && index >= list.length) return null;
    const i = index % list.length;
    return {
      n: s.n + 1,
      index: i,
      text: list[i] ?? "",
      final: false,
      guesses: deal,
    };
  };
  const next = nextOf(slot);

  const base = baseOf(slot.index);
  const plan = React.useMemo(
    () => planOf(slot.text, base, slot.guesses),
    [slot, base],
  );
  const nextPlan = next ? planOf(next.text, baseOf(next.index), 0) : null;
  const leavingPlan = leaving
    ? planOf(leaving.text, baseOf(leaving.index), 0)
    : null;
  const marks = React.useMemo(
    () =>
      plan.cells.map((): Marks => ({
        rub: motionValue(0),
        hand: motionValue(0),
        inked: motionValue(0),
      })),
    [plan],
  );
  const caughtSet = React.useMemo(
    () => new Set(caught.n === slot.n ? caught.list : []),
    [caught, slot.n],
  );
  const tl = React.useMemo(
    () => timelineOf(plan, caughtSet, motionSafe),
    [plan, caughtSet, motionSafe],
  );

  // A row that starts finished is already inked.
  const [firstT] = React.useState(() => (slot.final ? 1e4 : 0));
  const clock = useMotionValue(firstT);
  const stackY = useMotionValue(0);
  const frameH = useMotionValue(0);
  const layoutTick = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const columnRef = React.useRef<HTMLDivElement | null>(null);
  const cellNodes = React.useRef(new Map<string, HTMLSpanElement>());
  const geo = React.useRef<Geo>({ ox: 0, oy: 0, c: 26, pts: [] });
  const clockRun = React.useRef<AnimationPlaybackControls | null>(null);
  const stackRun = React.useRef<AnimationPlaybackControls | null>(null);
  const sizeRun = React.useRef<AnimationPlaybackControls | null>(null);
  const handRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const loops = React.useRef(new Set<LoopHandle>());
  const busy = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onPhraseChange);
  const shownN = React.useRef(slot.n);

  const halt = () => {
    clockRun.current?.stop();
    clockRun.current = null;
  };

  /** The next row becomes the live one; the finished row scrolls away. */
  const advance = () => {
    halt();
    let upcoming = nextOf(slot);
    if (determinate && active && !slot.final && band > slot.index) {
      upcoming = {
        n: slot.n + 1,
        index: band,
        text: list[band] ?? "",
        final: false,
        guesses: deal,
      };
    }
    if (!upcoming) return;
    for (const c of handRuns.current) c.stop();
    handRuns.current = [];
    for (const loop of loops.current) loop.stop();
    loops.current.clear();
    busy.current = 0;
    if (motionSafe && sized) setLeaving(slot);
    setHover(null);
    setSlot(upcoming);
    report.current?.(upcoming.index);
  };

  /** Runs the row's clock from where it stands to wherever it may go now. */
  const play = () => {
    halt();
    if (!running) return;
    const t = clock.get();
    let r = rate;
    let target: number;
    let then = false;
    if (slot.final) {
      // A finished row runs on until the pen has lifted off, then rests.
      target = active ? tl.inkEnd : tl.inkEnd + PARK;
      then = active;
    } else if (!active) {
      // Finishing: the row is completed briskly and the done row follows.
      r = rate * 2.5;
      target = tl.inkEnd;
      then = true;
    } else if (determinate) {
      if (band > slot.index) {
        r = rate * 3;
        target = tl.inkEnd;
        then = true;
      } else {
        target = local >= 1 ? tl.inkEnd + PARK : restAt(tl, local * tl.inkEnd);
      }
    } else {
      target = tl.holdEnd;
      then = true;
    }
    if (t < target - 1e-3) {
      clockRun.current = animate(clock, target, {
        duration: (target - t) / r,
        ease: "linear",
        onComplete: () => api.current?.play(),
      });
      return;
    }
    // A rub in the visitor's hand finishes before the row moves on.
    if (then && busy.current === 0) advance();
  };

  const measure = () => {
    const root = rootRef.current;
    const column = columnRef.current;
    if (!root || !column) return;
    const rr = root.getBoundingClientRect();
    const cr = column.getBoundingClientRect();
    const pts: { x: number; y: number }[] = [];
    let c = geo.current.c;
    plan.cells.forEach((_, i) => {
      const node = cellNodes.current.get(`${slot.n}:${i}`);
      if (!node) {
        pts.push(pts[pts.length - 1] ?? { x: 0, y: 0 });
        return;
      }
      const r = node.getBoundingClientRect();
      c = r.width;
      pts.push({
        x: r2(r.left - cr.left + r.width / 2),
        y: r2(r.top - cr.top + r.height / 2),
      });
    });
    geo.current = {
      ox: r2(cr.left - rr.left),
      oy: r2(cr.top - rr.top - stackY.get()),
      c: r2(c),
      pts,
    };
    const size = Math.round(clamp(c * 1.25, 24, 42));
    setToolSize((s) => (Math.abs(s - size) >= 1 ? size : s));
    layoutTick.set(layoutTick.get() + 1);
  };

  /** The window shows the live row and the next one, and follows their height. */
  const fit = () => {
    const column = columnRef.current;
    if (!column) return;
    let h = 0;
    let rows = 0;
    for (const node of Array.from(column.children)) {
      if (!(node instanceof HTMLElement)) continue;
      const role = node.dataset.rowRole;
      if (role !== "live" && role !== "next") continue;
      h += node.offsetHeight;
      rows += 1;
    }
    // Rows share their border line.
    h = Math.max(0, h - Math.max(0, rows - 1));
    if (!sized) {
      frameH.jump(h);
      setSized(true);
    } else if (Math.abs(frameH.get() - h) > 0.5) {
      sizeRun.current?.stop();
      if (motionSafe) sizeRun.current = animate(frameH, h, springs.glide);
      else frameH.jump(h);
    }
    measure();
  };

  /** The clue bar follows the solver; the phrase is announced once it is inked. */
  const statusAt = (t: number) => {
    const seg = segAt(tl, t);
    const cell = plan.cells[seg ? seg.cell : tl.last];
    const entry = cell && cell.entry >= 0 ? cell.entry : 0;
    const act =
      t >= tl.inkEnd
        ? "inked"
        : t >= tl.checkEnd
          ? "ink"
          : t >= tl.rubStart
            ? "rubbing out"
            : t >= tl.pencilEnd
              ? "checking"
              : "pencil";
    setStatus((s) => (s.entry === entry && s.act === act ? s : { entry, act }));
    if (t >= tl.inkEnd - 1e-4) {
      setSaid((s) => (s.n === slot.n ? s : { n: slot.n, text: slot.text }));
    }
  };

  // Before any other layout effect, so a measure on arrival finds it.
  React.useLayoutEffect(() => {
    api.current = { play, halt, measure, fit, status: statusAt };
    report.current = onPhraseChange;
  });

  // The first row is state too: the host hears it from the first commit.
  React.useEffect(() => {
    report.current?.(slot.index);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new row: its clock starts from nothing before it paints, and the row
  // that finished glides up out of the window.
  React.useLayoutEffect(() => {
    if (shownN.current === slot.n) return;
    shownN.current = slot.n;
    clock.set(0);
    setCursor(-1);
    stackRun.current?.stop();
    stackY.jump(0);
    api.current?.fit();
    const gone = columnRef.current?.querySelector<HTMLElement>(
      "[data-row-role='leaving']",
    );
    if (!gone) return;
    stackRun.current = animate(stackY, -(gone.offsetHeight - 1), {
      ...springs.glide,
      onComplete: () => setLeaving(null),
    });
  }, [slot.n, clock, stackY]);

  // Once the old row has left the column, the column is back at rest.
  React.useLayoutEffect(() => {
    if (leaving) return;
    stackRun.current?.stop();
    stackY.jump(0);
    api.current?.fit();
  }, [leaving, stackY]);

  React.useEffect(() => {
    const update = (t: number) => api.current?.status(t);
    update(clock.get());
    return clock.on("change", update);
  }, [clock]);

  // Anything that changes where the clock may run restarts it from where it
  // stands: a new row, the page or the element coming and going, a speed, a
  // caught guess, the progress.
  React.useEffect(() => {
    api.current?.play();
    return () => api.current?.halt();
  }, [slot, running, active, rate, tl, progress]);

  React.useEffect(() => {
    const runs = handRuns;
    const owned = loops;
    const stack = stackRun;
    const size = sizeRun;
    return () => {
      for (const c of runs.current) c.stop();
      for (const loop of owned.current) loop.stop();
      owned.current.clear();
      stack.current?.stop();
      size.current?.stop();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => watcher.disconnect();
  }, []);

  // The column's size, bound to the node when it arrives.
  const bindColumn = React.useCallback((node: HTMLDivElement | null) => {
    columnRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.fit());
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const bindCell = (key: string) => (node: HTMLSpanElement | null) => {
    if (node) cellNodes.current.set(key, node);
    else cellNodes.current.delete(key);
  };

  // The tool: its point heads for the square it works in, a stiff spring
  // gives the travel a hand's lag without ever teleporting, and the scribble
  // or rub rides on top so it stays crisp.
  const target = useTransform(
    [clock, stackY, layoutTick],
    ([t = 0, sy = 0]: number[]) => {
      const g = geo.current;
      const p = targetAt(tl, t, g);
      return { x: r2(g.ox + p.x), y: r2(g.oy + sy + p.y) };
    },
  );
  const targetX = useTransform(target, (p) => p.x);
  const targetY = useTransform(target, (p) => p.y);
  const follow = {
    stiffness: springs.flick.stiffness,
    damping: springs.flick.damping,
    mass: springs.flick.mass,
  };
  const pointX = useSpring(targetX, follow);
  const pointY = useSpring(targetY, follow);
  const half = toolSize / 2;
  const toolX = useTransform([pointX, clock], ([x = 0, t = 0]: number[]) =>
    r2(x + handAt(tl, t, geo.current.c).dx + half * COS - half),
  );
  const toolY = useTransform([pointY, clock], ([y = 0, t = 0]: number[]) =>
    r2(y + handAt(tl, t, geo.current.c).dy + half * SIN - toolSize * 0.1),
  );
  // Rubbing out, the pencil turns end over end: a snap along its own axis.
  const flipTarget = useTransform(clock, (t): number =>
    segAt(tl, t)?.tool === "eraser" ? -1 : 1,
  );
  const flip = useSpring(flipTarget, {
    stiffness: springs.snap.stiffness,
    damping: springs.snap.damping,
    mass: springs.snap.mass,
  });
  const toolOn = useTransform(clock, (t) =>
    r2(
      Math.min(
        clamp01((t - 0.05) / 0.25),
        1 - clamp01((t - tl.inkEnd - 0.15) / 0.3),
      ),
    ),
  );
  const penMix = useTransform(clock, (t) =>
    r2(clamp01((t - (tl.inkStart - SWAP)) / (SWAP * 0.7))),
  );
  const pencilOn = useTransform([toolOn, penMix], ([s = 0, m = 0]: number[]) =>
    r2(s * (1 - m)),
  );
  const penOn = useTransform([toolOn, penMix], ([s = 0, m = 0]: number[]) =>
    r2(s * m),
  );

  const letters = plan.cells
    .map((c, i) => (c.block ? -1 : i))
    .filter((i) => i >= 0);

  const panAt = (i: number) => {
    const root = rootRef.current;
    const p = geo.current.pts[i];
    if (!root || !p) return 0;
    const rect = root.getBoundingClientRect();
    return panFrom(rect.left + geo.current.ox + p.x, root);
  };

  const tickAt = (i: number, gain = 0.22) =>
    audio.play("tick", {
      pitch: r2(0.85 + 0.4 * (i / Math.max(1, plan.cells.length - 1))),
      gain,
      pan: panAt(i),
    });

  const say = (text: string) => setReading((r) => ({ n: r.n + 1, text }));

  const stateOf = (i: number) => {
    const cell = plan.cells[i];
    const m = marks[i];
    if (!cell || !m) return "empty";
    const t = clock.get();
    const s = tl.ink[i] ?? -1;
    if (m.inked.get() >= 0.5 || (s >= 0 && t >= s + tl.inkWipe * 0.5)) {
      return "inked";
    }
    const pen = tl.pen[i] ?? -1;
    const e = tl.erase[i] ?? -1;
    const rub = m.rub.get();
    const hand = m.hand.get();
    if (cell.wrong && hand <= 0 && rub <= 0 && pen >= 0 && t >= pen) {
      if (e < 0 || t < e) return "wrong";
    }
    if (rub > 0 && rub < 1) return "rubbing";
    if (e >= 0 && t >= e && t < (tl.fix[i] ?? e) + tl.write) return "rubbing";
    if ((pen >= 0 && t >= pen) || hand > 0 || rub >= 1) return "pencilled";
    return "empty";
  };

  const catchIt = (i: number) =>
    setCaught((c) => {
      const caughtNow = c.n === slot.n ? c.list : [];
      return caughtNow.includes(i) ? c : { n: slot.n, list: [...caughtNow, i] };
    });

  /** Every letter inked by hand: the row does not wait for the pen. */
  const settleIfDone = () => {
    if (clock.get() >= tl.inkEnd) return;
    const all = letters.every((i) => (marks[i]?.inked.get() ?? 0) >= 1);
    if (!all) return;
    halt();
    clock.set(tl.inkEnd);
    api.current?.play();
  };

  const track = (c: AnimationPlaybackControls) => {
    handRuns.current.push(c);
  };

  /** The visitor checks a square: the same outcome by pointer or key. */
  const check = (i: number) => {
    const cell = plan.cells[i];
    const m = marks[i];
    if (disabled || !cell || cell.block || !m) return;
    const state = stateOf(i);
    if (state === "wrong") {
      catchIt(i);
      busy.current += 1;
      const loop = audio.start("scratch", {
        pitch: 0.9,
        gain: 0.5,
        pan: panAt(i),
      });
      loops.current.add(loop);
      const quiet = () => {
        loop.stop();
        loops.current.delete(loop);
      };
      track(
        animate(m.rub, 1, {
          duration: motionSafe ? (RUB + tl.write) / rate : durations.slow,
          ease: "linear",
          onUpdate: (r) => {
            if (r >= RUB_SHARE) quiet();
            else {
              loop.set({
                pitch: r2(0.8 + 0.4 * Math.abs(Math.sin(r * Math.PI * 7))),
              });
            }
          },
          onComplete: () => {
            quiet();
            busy.current = Math.max(0, busy.current - 1);
            api.current?.play();
          },
        }),
      );
      say(`${cell.wrong ?? ""} rubbed out. ${cell.ch} pencilled in.`);
      return;
    }
    if (state === "pencilled") {
      track(
        animate(m.inked, 1, {
          duration: motionSafe ? durations.fast : durations.base,
          ease: easings.enter,
          onComplete: settleIfDone,
        }),
      );
      tickAt(i, 0.5);
      say(`${cell.ch}, inked.`);
      return;
    }
    if (state === "empty") {
      if (cell.wrong) catchIt(i);
      track(
        animate(m.hand, 1, {
          duration: motionSafe ? tl.write / rate : durations.base,
          ease: "linear",
        }),
      );
      audio.play("tick", { pitch: 0.75, gain: 0.35, pan: panAt(i) });
      say(`${cell.ch} pencilled in.`);
      return;
    }
    tickAt(i, 0.18);
    say(
      state === "inked"
        ? `${cell.ch}, already inked.`
        : `${cell.ch}, being corrected.`,
    );
  };

  const cursorAt =
    cursor >= 0 && plan.cells[cursor] && !plan.cells[cursor]?.block
      ? cursor
      : (letters[0] ?? -1);
  const showCursor = keyed && !disabled && cursorAt >= 0;

  const readCursor = (i: number) => {
    const cell = plan.cells[i];
    const entry = cell ? plan.entries[cell.entry] : undefined;
    if (!cell || !entry) return;
    const state = stateOf(i);
    const letter = state === "wrong" ? (cell.wrong ?? "") : cell.ch;
    const where = `${entry.num} across, square ${i - entry.start + 1} of ${entry.len}`;
    say(
      state === "empty"
        ? `${where}, empty.`
        : state === "inked"
          ? `${where}: ${letter}, inked.`
          : `${where}: ${letter}, in pencil.`,
    );
  };

  const moveCursor = (to: number) => {
    if (letters.length === 0) return;
    const cell = letters[clamp(to, 0, letters.length - 1)] as number;
    setCursor(cell);
    setKeyed(true);
    tickAt(cell);
    readCursor(cell);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = letters.indexOf(cursorAt);
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveCursor(k + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveCursor(k - 1);
        return;
      case "Home":
        event.preventDefault();
        moveCursor(0);
        return;
      case "End":
        event.preventDefault();
        moveCursor(letters.length - 1);
        return;
    }
  };

  const cellFrom = (node: EventTarget | null) => {
    const found =
      node instanceof Element
        ? node.closest<HTMLElement>("[data-cell][data-row]")
        : null;
    const row = found?.dataset.row;
    const i = Number(found?.dataset.cell ?? -1);
    if (!found || (row !== "live" && row !== "next") || i < 0) return null;
    return { row, cell: i } as const;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const now = cellFrom(event.target);
    if (now?.row === hover?.row && now?.cell === hover?.cell) return;
    setHover(now);
    if (now?.row === "live") tickAt(now.cell);
  };

  // What the clue bar reads: the square under the pointer, the cursor, or
  // the entry the solver is working on.
  const bar = (() => {
    if (hover) {
      const p = hover.row === "next" ? nextPlan : plan;
      const cell = p?.cells[hover.cell];
      const entry = cell ? p?.entries[cell.entry] : undefined;
      if (entry) return entry;
    }
    if (showCursor) {
      const cell = plan.cells[cursorAt];
      const entry = cell ? plan.entries[cell.entry] : undefined;
      if (entry) return entry;
    }
    return plan.entries[status.entry] ?? plan.entries[0];
  })();

  const litOf = (row: "live" | "next", p: Plan, i: number): Lit => {
    const cell = p.cells[i];
    const pick =
      hover ?? (showCursor ? { row: "live" as const, cell: cursorAt } : null);
    if (!cell || !pick || pick.row !== row) return null;
    if (pick.cell === i) return "cursor";
    return p.cells[pick.cell]?.entry === cell.entry ? "entry" : null;
  };

  // Squares are sized from the component's own width: the widest phrase
  // across it, whole pixels, 18 to 34.
  const cellSize = `clamp(18px, round(down, calc((100cqw - 41px) / ${layout.cols} + 1px), 1px), 34px)`;
  const gridWidth = `min(calc(100% - 40px), calc(${layout.cols} * (var(--cell) - 1px) + 1px))`;

  return (
    <>
      <div
        ref={bindRoot}
        className={cn("@container relative w-full", className)}
        aria-busy={active || undefined}
        style={{ "--cell": cellSize } as React.CSSProperties}
      >
        <div
          className="mx-auto flex flex-col gap-3"
          style={{ width: gridWidth }}
        >
          <div
            aria-hidden
            className="flex h-5 items-center justify-between gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="grid h-5 min-w-6 place-items-center overflow-clip rounded-1 border border-hairline-strong px-1 text-foreground tabular-nums">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={bar?.num ?? 0}
                    className="[grid-area:1/1]"
                    initial={
                      motionSafe
                        ? { y: distances.step, opacity: 0 }
                        : { opacity: 0 }
                    }
                    animate={{ y: 0, opacity: 1 }}
                    exit={{
                      ...(motionSafe ? { y: -distances.step } : {}),
                      opacity: 0,
                      // Exits never spring: the old number eases out of the way.
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe ? springs.snap : { duration: durations.fast }
                    }
                  >
                    {bar?.num ?? ""}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="truncate">
                across{bar ? ` (${bar.len})` : ""}
              </span>
            </span>
            <span className="shrink-0 text-ink-2">{status.act}</span>
          </div>

          <button
            type="button"
            aria-label="Check a square"
            aria-describedby={hintId}
            disabled={disabled}
            onClick={(event) => {
              // A pointer press checks the square under it. A click with no
              // pointer behind it — Space, Enter, assistive technology —
              // checks the cursor square.
              if (event.detail === 0) {
                setKeyed(true);
                if (cursorAt >= 0) check(cursorAt);
                return;
              }
              const found = cellFrom(event.target);
              if (!found || found.row !== "live") return;
              setCursor(found.cell);
              check(found.cell);
            }}
            onKeyDown={onKeyDown}
            onFocus={(event) =>
              setKeyed(event.currentTarget.matches(":focus-visible"))
            }
            onBlur={() => setKeyed(false)}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
            className={cn(
              "relative block w-full touch-manipulation rounded-1 text-left outline-none select-none [-webkit-touch-callout:none]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled ? "cursor-default" : "cursor-pointer",
            )}
          >
            <motion.div
              className="overflow-clip [contain:paint]"
              style={{ height: sized ? frameH : undefined }}
            >
              <motion.div
                ref={bindColumn}
                className="flex flex-col"
                style={{ y: stackY }}
              >
                {leaving && leavingPlan ? (
                  <motion.div
                    key={leaving.n}
                    data-row-role="leaving"
                    initial={false}
                    animate={{ opacity: 0 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                    }}
                  >
                    <Squares
                      plan={leavingPlan}
                      print={print}
                      render={(cell, i, num) => (
                        <StaticCell
                          cell={cell}
                          at={i}
                          num={num}
                          print={print}
                          lit={null}
                          inked
                          row="leaving"
                        />
                      )}
                    />
                  </motion.div>
                ) : null}
                <div
                  key={slot.n}
                  data-row-role="live"
                  className={leaving ? "-mt-px" : undefined}
                >
                  <Squares
                    plan={plan}
                    print={print}
                    render={(cell, i, num) => (
                      <LiveCell
                        cell={cell}
                        at={i}
                        num={num}
                        marks={marks[i] as Marks}
                        clock={clock}
                        tl={tl}
                        print={print}
                        lit={litOf("live", plan, i)}
                        motionSafe={motionSafe}
                        bind={bindCell(`${slot.n}:${i}`)}
                      />
                    )}
                  />
                </div>
                {next && nextPlan ? (
                  <motion.div
                    key={next.n}
                    data-row-role="next"
                    className="-mt-px"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    <Squares
                      plan={nextPlan}
                      print={print}
                      render={(cell, i, num) => (
                        <StaticCell
                          cell={cell}
                          at={i}
                          num={num}
                          print={print}
                          lit={litOf("next", nextPlan, i)}
                          inked={false}
                          row="next"
                        />
                      )}
                    />
                  </motion.div>
                ) : null}
              </motion.div>
            </motion.div>
          </button>
        </div>

        {motionSafe ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-clip"
          >
            <motion.div
              className="absolute top-0 left-0 drop-shadow-[0_1px_1px_color-mix(in_oklab,black_28%,transparent)]"
              style={{
                width: toolSize,
                height: r2(toolSize * 0.2),
                x: toolX,
                y: toolY,
                rotate: LEAN,
              }}
            >
              <motion.div
                className="absolute inset-0"
                style={{ scaleX: flip, opacity: pencilOn }}
              >
                <Pencil />
              </motion.div>
              <motion.div
                className="absolute inset-0"
                style={{ opacity: penOn }}
              >
                <Pen ink={print.ink} />
              </motion.div>
            </motion.div>
          </div>
        ) : null}

        <span id={hintId} className="sr-only">
          Arrow keys move between squares. Enter checks one: a wrong guess is
          rubbed out, a right one is inked.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {said.text}
      </p>
      <p role="status" className="sr-only">
        <span key={reading.n}>{reading.text}</span>
      </p>
    </>
  );
}
