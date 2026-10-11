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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type WordHuntMarker = "cobalt" | "amber" | "rose" | "sage";
export type WordHuntFinder = "marker" | "visitor";

export type WordHuntProps = {
  /** The words to hide. Letters only are kept; a word longer than the grid is left out. */
  words: string[];
  /** Controlled: the words found so far, as given in `words`. */
  value?: string[];
  /** Words found at the start when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the find (or the reset) that changed the list, with the new list. */
  onValueChange?: (found: string[]) => void;
  /** A word was found: by the hunting marker, or by the visitor's drag or key. */
  onFind?: (word: string, by: WordHuntFinder) => void;
  /** Columns in the grid, 6 to 24. @default 14 */
  gridSize?: number;
  /** Rows; by default about 0.42 of the columns, at least 5. */
  rows?: number;
  /** Hide words in all eight directions, or only reading right and down. @default "all" */
  directions?: "all" | "straight";
  /** Where the words go and which letters fill the rest. @default 7 */
  seed?: number;
  /** The pen: a named pigment or any CSS colour. @default "cobalt" */
  marker?: WordHuntMarker | (string & {});
  /** How quickly the marker hunts, 0.5 to 2. @default 1 */
  pace?: number;
  /** The marker hunts for words on its own while the grid is on screen. @default true */
  autoplay?: boolean;
  /** Once every word is found, clear the tints and hunt again. @default true */
  loop?: boolean;
  /** Show the word list beside (or under) the grid. @default true */
  showList?: boolean;
  /** The grid's accessible name. @default "Word search" */
  label?: string;
  /** No dragging and no keys; the marker still hunts. @default false */
  disabled?: boolean;
  className?: string;
};

/** Markers are text-tuned tokens: the letters they ink stay legible in either theme. */
const MARKERS: Record<WordHuntMarker, string> = {
  cobalt: "var(--accent-bright)",
  amber: "var(--warn)",
  rose: "oklch(from var(--danger) l c 2)",
  sage: "oklch(from var(--success) l 0.09 150)",
};

/** One cell is ten units; the SVG scales to its box. */
const CELL = 10;
const THICK = 8.2;
/** Letters weighted like ordinary text, so the filler reads as a real puzzle. */
const FILLER =
  "EEEEEEEAAAAARRRRIIIIOOOOTTTTNNNNSSSSLLLCCCUUDDPPMMHHGGBBFYWKVXZJQ";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Placement = {
  word: string;
  /** The letters as hidden, upper case. */
  letters: string;
  r: number;
  c: number;
  dr: number;
  dc: number;
};

type Puzzle = {
  cells: string[];
  placed: Placement[];
  cols: number;
  rows: number;
};

const ALL_DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [1, -1],
];
const STRAIGHT: [number, number][] = [
  [0, 1],
  [1, 0],
];

/**
 * Deterministic: the same words, size and seed give the same grid on the
 * server and in the browser. Longest words go first; crossings may share a
 * letter; anything that will not fit after two hundred tries is left out.
 */
function buildPuzzle(
  words: string[],
  cols: number,
  rows: number,
  seed: number,
  directions: "all" | "straight",
): Puzzle {
  const rand = mulberry(seed * 7919 + cols * 31 + rows);
  const cells: string[] = Array.from({ length: cols * rows }, () => "");
  const dirs = directions === "all" ? ALL_DIRS : STRAIGHT;
  const order = words
    .map((word, i) => ({
      word,
      letters: word.toUpperCase().replace(/[^\p{L}]/gu, ""),
      i,
    }))
    .filter((w) => w.letters.length > 1)
    .sort((a, b) => b.letters.length - a.letters.length || a.i - b.i);
  const placed: (Placement & { i: number })[] = [];
  for (const { word, letters, i } of order) {
    const n = letters.length;
    let done = false;
    for (let attempt = 0; attempt < 200 && !done; attempt += 1) {
      const [dr, dc] = dirs[Math.floor(rand() * dirs.length)] ?? [0, 1];
      const r = Math.floor(rand() * rows);
      const c = Math.floor(rand() * cols);
      const er = r + dr * (n - 1);
      const ec = c + dc * (n - 1);
      if (er < 0 || er >= rows || ec < 0 || ec >= cols) continue;
      let fits = true;
      for (let k = 0; k < n; k += 1) {
        const cell = cells[(r + dr * k) * cols + (c + dc * k)];
        if (cell !== "" && cell !== letters[k]) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;
      for (let k = 0; k < n; k += 1) {
        cells[(r + dr * k) * cols + (c + dc * k)] = letters[k] ?? "";
      }
      placed.push({ word, letters, r, c, dr, dc, i });
      done = true;
    }
  }
  for (let k = 0; k < cells.length; k += 1) {
    if (cells[k] === "") {
      cells[k] = FILLER[Math.floor(rand() * FILLER.length)] ?? "E";
    }
  }
  placed.sort((a, b) => a.i - b.i);
  return { cells, placed, cols, rows };
}

type Capsule = { cx: number; cy: number; ang: number; len: number };

const centreOf = (r: number, c: number) => ({
  x: c * CELL + CELL / 2,
  y: r * CELL + CELL / 2,
});

function capsuleOf(p: Placement): Capsule {
  const a = centreOf(p.r, p.c);
  const n = p.letters.length - 1;
  const b = centreOf(p.r + p.dr * n, p.c + p.dc * n);
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    len: Math.hypot(b.x - a.x, b.y - a.y),
  };
}

/** A pill around a span of letters, as a path in grid units (rounded). */
function capsulePath(cx: number, cy: number, ang: number, len: number): string {
  const t = THICK / 2;
  const half = Math.max(0, len / 2);
  const a = (ang * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const p = (x: number, y: number) =>
    `${r2(cx + x * cos - y * sin)} ${r2(cy + x * sin + y * cos)}`;
  return [
    `M ${p(-half, -t)}`,
    `L ${p(half, -t)}`,
    `A ${t} ${t} 0 0 1 ${p(half, t)}`,
    `L ${p(-half, t)}`,
    `A ${t} ${t} 0 0 1 ${p(-half, -t)}`,
    "Z",
  ].join(" ");
}

/** The angle the capsule should turn to: a pill is the same pill half a turn on. */
const nearestTurn = (from: number, to: number) => {
  const k = Math.round((from - to) / 180);
  return to + k * 180;
};

const cellsOf = (p: Placement) =>
  Array.from(
    { length: p.letters.length },
    (_, k) => (p.r + p.dr * k) * 1000 + (p.c + p.dc * k),
  );

function useCapsule(initial: Capsule) {
  const cx = useMotionValue(initial.cx);
  const cy = useMotionValue(initial.cy);
  const ang = useMotionValue(initial.ang);
  const len = useMotionValue(initial.len);
  const d = useTransform(
    [cx, cy, ang, len] as MotionValue<number>[],
    (v: number[]) => capsulePath(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0),
  );
  return { cx, cy, ang, len, d };
}

/**
 * A word search: a wall of mono capitals with your words hidden in it, in all
 * eight directions or only right and down, the rest filled with letters
 * weighted like ordinary text. A marker capsule, the pill a highlighter
 * leaves, hunts them one at a time: it glides to the next word on the glide
 * spring — centre, angle (the short way round) and length each on its own —
 * draws its outline round it, and the letters take the ink in a cascade
 * along the word. Moving on, it leaves the word tinted. When every word is
 * found, the tints clear and the hunt begins again.
 *
 * Drag across the grid to circle a word yourself: the capsule follows the
 * finger 1:1, held to the nearest allowed direction, and lets go onto whole
 * cells on the snap spring if it caught a hidden word, or fades away if not.
 * The grid is one tab stop: arrow keys move the marker between found words,
 * Home and End jump, Enter or Space circles the next hidden word. Under
 * reduced motion the marker appears round each word with a short fade and
 * the ink swaps in; the dragged capsule still follows the finger.
 */
export function WordHunt({
  words,
  value,
  defaultValue = [],
  onValueChange,
  onFind,
  gridSize = 14,
  rows,
  directions = "all",
  seed = 7,
  marker = "cobalt",
  pace = 1,
  autoplay = true,
  loop = true,
  showList = true,
  label = "Word search",
  disabled = false,
  className,
}: WordHuntProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const cols = Math.round(clamp(gridSize, 6, 24));
  const rowCount = Math.round(
    clamp(rows ?? Math.max(5, Math.round(cols * 0.42)), 4, 20),
  );
  const wordsKey = words.join("\u0001");
  const puzzle = React.useMemo(
    () => buildPuzzle(words, cols, rowCount, seed, directions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wordsKey, cols, rowCount, seed, directions],
  );
  const ink = MARKERS[marker as WordHuntMarker] ?? marker;
  const speed = clamp(pace, 0.5, 2);

  const [own, setOwn] = React.useState<string[]>(defaultValue);
  const found = value ?? own;
  const foundSet = React.useMemo(() => new Set(found), [found]);
  const [byVisitor, setByVisitor] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [visible, setVisible] = React.useState(false);
  const [engaged, setEngaged] = React.useState(false);
  const [focusWord, setFocusWord] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<Set<number>>(
    () => new Set(),
  );

  const first = puzzle.placed[0];
  const start = first ? capsuleOf(first) : { cx: 0, cy: 0, ang: 0, len: 0 };
  const pen = useCapsule(start);
  const penFill = useMotionValue(0);
  const penDraw = useMotionValue(1);
  const penLine = useMotionValue(0);
  const hand = useCapsule(start);
  const handOpacity = useMotionValue(0);

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const handRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const dragFrom = React.useRef<{ r: number; c: number } | null>(null);
  const resumeTimer = React.useRef(0);
  /** A mouse resting over the grid keeps the hunt waiting. */
  const hovering = React.useRef(false);

  const halt = React.useCallback(() => {
    for (const run of running.current) run.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  /** Glide the marker to a word and draw its outline round it. */
  const markWord = React.useCallback(
    (p: Placement) => {
      halt();
      const to = capsuleOf(p);
      const ang = nearestTurn(pen.ang.get(), to.ang);
      if (!motionSafe) {
        pen.cx.jump(to.cx);
        pen.cy.jump(to.cy);
        pen.ang.jump(ang);
        pen.len.jump(to.len);
        penDraw.jump(0);
        penLine.jump(0);
        running.current = [
          animate(penLine, 1, { duration: durations.fast }),
          animate(penFill, 0.18, { duration: durations.fast }),
        ];
        return;
      }
      const fresh = penFill.get() < 0.01;
      if (fresh) {
        // Out of nowhere: appear on the word rather than fly in from a corner.
        pen.cx.jump(to.cx);
        pen.cy.jump(to.cy);
        pen.ang.jump(ang);
        pen.len.jump(Math.max(0, to.len - CELL));
      }
      running.current = [
        animate(penLine, 0, { duration: durations.blink }),
        animate(penFill, 0.14, { duration: durations.fast }),
        animate(pen.cx, to.cx, springs.glide),
        animate(pen.cy, to.cy, springs.glide),
        animate(pen.ang, ang, springs.glide),
        animate(pen.len, to.len, springs.glide),
      ];
      timers.current = [
        window.setTimeout(() => {
          penDraw.jump(1);
          penLine.jump(1);
          running.current.push(
            animate(penDraw, 0, { duration: 0.42, ease: easings.move }),
            animate(penFill, 0.2, { duration: durations.base }),
          );
        }, 380),
      ];
    },
    [halt, motionSafe, pen, penDraw, penFill, penLine],
  );

  const commit = React.useCallback(
    (word: string, by: WordHuntFinder) => {
      if (foundSet.has(word)) return;
      const next = [...found, word];
      if (value === undefined) setOwn(next);
      if (by === "visitor") {
        setByVisitor((s) => new Set(s).add(word));
      }
      onValueChange?.(next);
      onFind?.(word, by);
      const total = puzzle.placed.length;
      setSaid((s) => ({
        n: s.n + 1,
        text: `${by === "visitor" ? "You found" : "Found"} ${word.toLowerCase()}, ${next.length} of ${total}${next.length === total ? ". All found" : ""}`,
      }));
    },
    [found, foundSet, onFind, onValueChange, puzzle.placed.length, value],
  );

  const reset = React.useCallback(() => {
    if (value === undefined) setOwn([]);
    setByVisitor(new Set());
    onValueChange?.([]);
    halt();
    running.current = [
      animate(penFill, 0, { duration: durations.base }),
      animate(penLine, 0, { duration: durations.base }),
    ];
  }, [halt, onValueChange, penFill, penLine, value]);

  // On screen or not: the hunt only runs while it can be seen.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setVisible(Boolean(entry?.isIntersecting) && !document.hidden);
    });
    io.observe(node);
    const onVis = () => {
      if (document.hidden) setVisible(false);
      else {
        const box = node.getBoundingClientRect();
        setVisible(box.bottom > 0 && box.top < window.innerHeight);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // The hunt: one step per found word, each step its own timer.
  const hidden = puzzle.placed.filter((p) => !foundSet.has(p.word));
  const nextHidden = hidden[0];
  const allFound = puzzle.placed.length > 0 && hidden.length === 0;
  React.useEffect(() => {
    if (!autoplay || !visible || engaged) return;
    if (allFound) {
      if (!loop) return;
      const t = window.setTimeout(reset, Math.round(2600 / speed));
      return () => window.clearTimeout(t);
    }
    if (!nextHidden) return;
    const lead = found.length === 0 ? 700 : 520;
    const t1 = window.setTimeout(
      () => markWord(nextHidden),
      Math.round(lead / speed),
    );
    const t2 = window.setTimeout(
      () => commit(nextHidden.word, "marker"),
      Math.round(lead / speed) + (motionSafe ? 820 : 160),
    );
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [
    allFound,
    autoplay,
    commit,
    engaged,
    found.length,
    loop,
    markWord,
    motionSafe,
    nextHidden,
    reset,
    speed,
    visible,
  ]);

  React.useEffect(
    () => () => {
      halt();
      for (const run of handRuns.current) run.stop();
      window.clearTimeout(resumeTimer.current);
    },
    [halt],
  );

  const engage = () => {
    window.clearTimeout(resumeTimer.current);
    setEngaged(true);
  };
  const release = (ms = 2600) => {
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setEngaged(false), ms);
  };

  // ── The visitor's capsule ───────────────────────────────────────────────
  const toGrid = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };
  const cellAt = (x: number, y: number) => ({
    r: clamp(Math.floor(y / CELL), 0, rowCount - 1),
    c: clamp(Math.floor(x / CELL), 0, cols - 1),
  });

  /** The selection a drag describes: a start cell, a direction, a length. */
  const spanTo = (from: { r: number; c: number }, x: number, y: number) => {
    const a = centreOf(from.r, from.c);
    const dx = x - a.x;
    const dy = y - a.y;
    const dirs = directions === "all" ? ALL_DIRS : STRAIGHT;
    let best: [number, number] = [0, 1];
    let bestDot = -Infinity;
    for (const [dr, dc] of dirs) {
      const l = Math.hypot(dr, dc);
      const dot = (dx * dc + dy * dr) / l;
      if (dot > bestDot) {
        bestDot = dot;
        best = [dr, dc];
      }
    }
    const [dr, dc] = best;
    const step = Math.hypot(dr, dc) * CELL;
    let maxK = 0;
    while (true) {
      const r = from.r + dr * (maxK + 1);
      const c = from.c + dc * (maxK + 1);
      if (r < 0 || r >= rowCount || c < 0 || c >= cols) break;
      maxK += 1;
    }
    const along = clamp(Math.max(0, bestDot) / step, 0, maxK);
    return { dr, dc, along, cells: Math.round(along) };
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ event }) => {
      const at = toGrid(event.clientX, event.clientY);
      if (!at) return;
      // The press point, not the threshold point, is where the circle starts.
      const startAt = dragFrom.current;
      if (!startAt) dragFrom.current = cellAt(at.x, at.y);
      engage();
      halt();
      for (const run of handRuns.current) run.stop();
      handRuns.current = [];
      const from = dragFrom.current ?? cellAt(at.x, at.y);
      const a = centreOf(from.r, from.c);
      hand.cx.jump(a.x);
      hand.cy.jump(a.y);
      hand.len.jump(0);
      handOpacity.jump(1);
    },
    onMove: ({ event }) => {
      const from = dragFrom.current;
      const at = toGrid(event.clientX, event.clientY);
      if (!from || !at) return;
      const span = spanTo(from, at.x, at.y);
      const a = centreOf(from.r, from.c);
      const step = Math.hypot(span.dr, span.dc) * CELL;
      const ang = (Math.atan2(span.dr, span.dc) * 180) / Math.PI;
      // 1:1 along the held direction; the cells under it light as it passes.
      hand.len.set(r2(span.along * step));
      hand.ang.set(ang);
      hand.cx.set(
        r2(a.x + (Math.cos((ang * Math.PI) / 180) * span.along * step) / 2),
      );
      hand.cy.set(
        r2(a.y + (Math.sin((ang * Math.PI) / 180) * span.along * step) / 2),
      );
      const next = new Set<number>();
      for (let k = 0; k <= span.cells; k += 1) {
        next.add((from.r + span.dr * k) * 1000 + (from.c + span.dc * k));
      }
      setSelection((prev) =>
        prev.size === next.size && [...next].every((v) => prev.has(v))
          ? prev
          : next,
      );
    },
    onEnd: ({ event }) => {
      const from = dragFrom.current;
      const at = toGrid(event.clientX, event.clientY);
      dragFrom.current = null;
      setSelection(new Set());
      if (!from || !at) return letGo(null);
      const span = spanTo(from, at.x, at.y);
      const hit = puzzle.placed.find((p) => {
        if (foundSet.has(p.word)) return false;
        const n = p.letters.length - 1;
        if (span.cells !== n) return false;
        const fwd =
          p.r === from.r &&
          p.c === from.c &&
          p.dr === span.dr &&
          p.dc === span.dc;
        const end = { r: p.r + p.dr * n, c: p.c + p.dc * n };
        const back =
          end.r === from.r &&
          end.c === from.c &&
          -p.dr === span.dr &&
          -p.dc === span.dc;
        return fwd || back;
      });
      letGo(hit ?? null);
    },
    onCancel: () => {
      dragFrom.current = null;
      setSelection(new Set());
      letGo(null);
    },
    onTap: () => {
      dragFrom.current = null;
    },
  });

  /** The dragged capsule lands on whole cells, or fades if it caught nothing. */
  const letGo = (hit: Placement | null) => {
    for (const run of handRuns.current) run.stop();
    if (!hovering.current) release();
    if (!hit) {
      handRuns.current = [
        animate(handOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      ];
      return;
    }
    const to = capsuleOf(hit);
    const ang = nearestTurn(hand.ang.get(), to.ang);
    const t = motionSafe ? springs.snap : { duration: durations.fast };
    handRuns.current = [
      animate(hand.cx, to.cx, t),
      animate(hand.cy, to.cy, t),
      animate(hand.ang, ang, t),
      animate(hand.len, to.len, t),
      animate(handOpacity, 0, { duration: durations.base, delay: 0.32 }),
    ];
    commit(hit.word, "visitor");
  };

  // ── Keyboard ────────────────────────────────────────────────────────────
  const foundPlaced = puzzle.placed.filter((p) => foundSet.has(p.word));
  const visit = (p: Placement) => {
    engage();
    setFocusWord(p.word);
    markWord(p);
    const at = foundPlaced.indexOf(p);
    setSaid((s) => ({
      n: s.n + 1,
      text: `${p.word.toLowerCase()}, found word ${at + 1} of ${foundPlaced.length}`,
    }));
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const key = event.key;
    const list = foundPlaced;
    const at = list.findIndex((p) => p.word === focusWord);
    if (
      [
        "ArrowRight",
        "ArrowDown",
        "ArrowLeft",
        "ArrowUp",
        "Home",
        "End",
      ].includes(key)
    ) {
      event.preventDefault();
      if (list.length === 0) {
        setSaid((s) => ({
          n: s.n + 1,
          text: "No words found yet. Enter circles one.",
        }));
        return;
      }
      const forward = key === "ArrowRight" || key === "ArrowDown";
      const index =
        key === "Home"
          ? 0
          : key === "End"
            ? list.length - 1
            : at < 0
              ? forward
                ? 0
                : list.length - 1
              : clamp(at + (forward ? 1 : -1), 0, list.length - 1);
      const p = list[index];
      if (p) visit(p);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      const p = nextHidden;
      engage();
      if (!p) {
        setSaid((s) => ({ n: s.n + 1, text: "Every word is found" }));
        return;
      }
      setFocusWord(p.word);
      markWord(p);
      const wait = motionSafe ? 820 : 160;
      timers.current.push(
        window.setTimeout(() => commit(p.word, "visitor"), wait),
      );
    }
  };

  const listWords = puzzle.placed;
  const inkedCells = new Set<number>();
  for (const p of puzzle.placed) {
    if (foundSet.has(p.word)) for (const k of cellsOf(p)) inkedCells.add(k);
  }
  const inkIndex = new Map<number, number>();
  for (const p of foundPlaced) cellsOf(p).forEach((k, i) => inkIndex.set(k, i));

  const width = cols * CELL;
  const height = rowCount * CELL;
  const fillOf = (word: string) =>
    `color-mix(in oklab, ${ink} ${byVisitor.has(word) ? 26 : 16}%, transparent)`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      className={cn("group/word-hunt @container relative", className)}
    >
      <div className="flex size-full flex-col gap-3 @[34rem]:flex-row">
        <div
          role="application"
          tabIndex={disabled ? -1 : 0}
          aria-label="Letter grid"
          aria-roledescription="word search"
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          onFocus={() => engage()}
          onBlur={() => {
            setFocusWord(null);
            if (!hovering.current) release();
          }}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            hovering.current = true;
            engage();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            hovering.current = false;
            if (!dragFrom.current) release(1600);
          }}
          onPointerDown={(event) => {
            const at = toGrid(event.clientX, event.clientY);
            dragFrom.current = at ? cellAt(at.x, at.y) : null;
            drag.onPointerDown(event);
          }}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
          onLostPointerCapture={drag.onLostPointerCapture}
          className={cn(
            // The SVG is laid absolutely inside, so this box takes exactly
            // the room the layout gives it and the grid scales into it.
            "relative flex-1 basis-0 overflow-hidden rounded-2 outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-default" : "cursor-crosshair touch-none",
          )}
        >
          <svg
            ref={svgRef}
            aria-hidden
            viewBox={`-2 -2 ${width + 4} ${height + 4}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 block size-full"
          >
            {foundPlaced.map((p) => {
              const c = capsuleOf(p);
              return (
                <path
                  key={p.word}
                  d={capsulePath(c.cx, c.cy, c.ang, c.len)}
                  className={cn(
                    motionSafe && "transition-opacity duration-300",
                  )}
                  style={{
                    fill: fillOf(p.word),
                    stroke: `color-mix(in oklab, ${ink} 42%, transparent)`,
                  }}
                  strokeWidth={0.5}
                />
              );
            })}
            {/* The pens take their ink from this plain group, so a new
                marker colour reaches paths that motion manages. */}
            <g style={{ color: ink }}>
              <motion.path
                d={pen.d}
                fill="currentColor"
                style={{ opacity: penFill }}
              />
              <motion.path
                d={pen.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.9}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1 1"
                style={{ strokeDashoffset: penDraw, opacity: penLine }}
              />
              <motion.path
                d={hand.d}
                fill="currentColor"
                fillOpacity={0.2}
                stroke="currentColor"
                strokeWidth={0.9}
                style={{ opacity: handOpacity }}
              />
            </g>
            {puzzle.cells.map((ch, k) => {
              const r = Math.floor(k / cols);
              const c = k % cols;
              const key = r * 1000 + c;
              const inked = inkedCells.has(key);
              const lit = selection.has(key);
              const order = inkIndex.get(key) ?? 0;
              return (
                <text
                  key={k}
                  x={c * CELL + CELL / 2}
                  y={r * CELL + CELL / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    "font-mono",
                    motionSafe && "transition-[fill] duration-300",
                    lit ? "fill-foreground" : inked ? undefined : "fill-ink-3",
                  )}
                  style={{
                    fontSize: 5.2,
                    fontWeight: inked || lit ? 600 : 500,
                    fill: inked && !lit ? ink : undefined,
                    transitionDelay:
                      inked && motionSafe ? `${order * 45}ms` : undefined,
                  }}
                >
                  {ch}
                </text>
              );
            })}
          </svg>
        </div>
        {showList ? (
          <ul
            aria-hidden
            className="flex shrink-0 flex-wrap justify-center gap-x-3 gap-y-1 @[34rem]:w-28 @[34rem]:flex-col @[34rem]:justify-center @[34rem]:gap-y-1.5"
          >
            {listWords.map((p) => {
              const isFound = foundSet.has(p.word);
              return (
                <li
                  key={p.word}
                  className={cn(
                    "inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] uppercase",
                    motionSafe && "transition-colors duration-300",
                    isFound ? "text-foreground" : "text-ink-3",
                  )}
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full transition-colors"
                    style={{
                      background: isFound
                        ? ink
                        : "color-mix(in oklab, var(--foreground) 18%, transparent)",
                    }}
                  />
                  <span
                    className={cn(isFound && "line-through decoration-1")}
                    style={{ textDecorationColor: isFound ? ink : undefined }}
                  >
                    {p.letters}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <p className="sr-only">
        {`Hidden words: ${
          listWords
            .filter((p) => !foundSet.has(p.word))
            .map((p) => p.word.toLowerCase())
            .join(", ") || "none"
        }. Found: ${
          foundPlaced.map((p) => p.word.toLowerCase()).join(", ") || "none"
        }.`}
      </p>
      <span id={hintId} className="sr-only">
        Drag across the letters to circle a word. Arrow keys move between found
        words; Enter circles the next hidden word.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
