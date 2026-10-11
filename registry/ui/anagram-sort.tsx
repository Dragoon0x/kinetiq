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
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type AnagramSortMethod = "pairs" | "place" | "sweep";
export type AnagramSortTrigger = "mount" | "inView" | "hover" | "manual";
export type AnagramSortElement = "h1" | "h2" | "h3" | "p" | "div" | "span";

export type AnagramSortProps = {
  /** The headline. Letters only ever travel inside their own word. */
  text: string;
  /** The element rendered. @default "h2" */
  as?: AnagramSortElement;
  /**
   * How the jumble sorts: `pairs` swaps every out-of-order neighbour pair on
   * each beat, `place` leaps each slot's letter into place one at a time,
   * `sweep` runs one pass along the line hopping each letter back. @default "pairs"
   */
  method?: AnagramSortMethod;
  /** Tempo of hops and beats, 0.5 to 2.5. @default 1 */
  swapSpeed?: number;
  /** Peak height of a hop, em, 0 to 1. @default 0.55 */
  arcHeight?: number;
  /** Time scale of a hop's spring, ms; its damping ratio is kept. @default 340 */
  duration?: number;
  /** Base gap between beats, ms at speed 1. @default 140 */
  stagger?: number;
  /** Wait before the sort starts, ms. @default 0 */
  delay?: number;
  /** How hard a letter lands — squash and overshoot, 0 to 1. @default 0.5 */
  settle?: number;
  /** Which anagram the headline starts as. @default 1 */
  seed?: number;
  /** Ink of a letter in its place. @default "currentColor" */
  color?: string;
  /** Ink of a letter out of place. @default a 42% mix of currentColor */
  strayColor?: string;
  /** What starts the sort. @default "inView" */
  trigger?: AnagramSortTrigger;
  /** Manual trigger: true sorts, false tosses the letters back into a jumble. */
  play?: boolean;
  /** Sort once; false jumbles again when it leaves view or the hover ends. @default true */
  once?: boolean;
  /** A press, Enter or Space tosses the letters and sorts them again. @default true */
  interactive?: boolean;
  /** Any change tosses the letters into a new jumble and sorts them again. */
  replayKey?: string | number;
  /** A tick on every landing of a sort the visitor started. Off unless asked for. @default false */
  sound?: boolean;
  /** Letters in their place, out of the letters that move: on arrival and from every landing. */
  onProgress?: (home: number, total: number) => void;
  /** Every letter is home and settled. */
  onComplete?: () => void;
  className?: string;
};

/** The duration the snap spring was tuned at, ms. */
const BASE = 300;
/** Rest between a toss landing and the sort starting, ms. */
const HOLD = 220;
/** The tween a reduced-motion sort develops the ink with, s. */
const DEVELOP = durations.slow;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (v: number) => Math.round(clamp01(v) * 100);

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

/** A calibration spring run `f` times slower, with its damping ratio kept. */
const timed = (s: Spring, f: number): Spring => ({
  ...s,
  stiffness: s.stiffness / (f * f),
  damping: s.damping / f,
});

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same jumble for the same text and seed. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Splits text into graphemes, so emoji and combining marks stay whole. */
function graphemes(text: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (!Segmenter) return Array.from(text);
  return Array.from(
    new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (s) => s.segment,
  );
}

const MOVABLE = /[\p{L}\p{N}]/u;

type Glyph = { char: string; word: number; home: number };
type Word = {
  /** Glyph ids in reading order: slot → id at home. */
  glyphs: number[];
  /** The slots whose letters move (letters and digits). */
  free: number[];
};
type Layout = {
  glyphs: Glyph[];
  words: Word[];
  /** The jumble the letters are laid out in (slot → id), per word. */
  dom: number[][];
  /** Each glyph's slot in that jumble. */
  domSlot: number[];
  /** Letters that move. */
  total: number;
  base: number;
};

/**
 * One word's jumble: a seeded shuffle of its letters, the best of a few tries
 * at moving most of them, with equal letters kept in reading order so the
 * sort never has to cross two of the same.
 */
function jumbleWord(
  word: Word,
  glyphs: Glyph[],
  rand: () => number,
  avoid?: number[],
): number[] {
  const arr = word.glyphs.slice();
  const ids = word.free.map((s) => word.glyphs[s] as number);
  const n = ids.length;
  if (n < 2) return arr;
  const charOf = (id: number) => glyphs[id]?.char ?? "";
  let best = ids;
  let bestScore = -1;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const p = ids.slice();
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i] as number;
      p[i] = p[j] as number;
      p[j] = t;
    }
    const byChar = new Map<string, number[]>();
    p.forEach((id, i) => {
      const c = charOf(id);
      const list = byChar.get(c) ?? [];
      list.push(i);
      byChar.set(c, list);
    });
    for (const [, places] of byChar) {
      const sorted = places.map((i) => p[i] as number).sort((a, b) => a - b);
      places.forEach((i, k) => {
        p[i] = sorted[k] as number;
      });
    }
    let moved = 0;
    let same = 0;
    p.forEach((id, i) => {
      if (charOf(id) !== charOf(ids[i] as number)) moved += 1;
      if (avoid && avoid[word.free[i] as number] === id) same += 1;
    });
    const score = moved * 2 - same;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
    if (moved >= Math.ceil(n * 0.75) && same < n / 2) break;
  }
  word.free.forEach((s, i) => {
    arr[s] = best[i] as number;
  });
  return arr;
}

function layoutOf(text: string, seed: number): Layout {
  const glyphs: Glyph[] = [];
  const words: Word[] = [];
  const clean = text.replace(/\s+/g, " ").trim();
  for (const part of clean ? clean.split(" ") : []) {
    const w = words.length;
    const word: Word = { glyphs: [], free: [] };
    graphemes(part).forEach((char, slot) => {
      word.glyphs.push(glyphs.length);
      if (MOVABLE.test(char)) word.free.push(slot);
      glyphs.push({ char, word: w, home: slot });
    });
    words.push(word);
  }
  const base = (hash(clean) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  const rand = lcg(base);
  const dom = words.map((word) => jumbleWord(word, glyphs, rand));
  const domSlot = glyphs.map(() => 0);
  dom.forEach((arr) =>
    arr.forEach((id, slot) => {
      domSlot[id] = slot;
    }),
  );
  const total = words.reduce((sum, w) => sum + w.free.length, 0);
  return { glyphs, words, dom, domSlot, total, base };
}

type Cell = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rot: MotionValue<number>;
  /** Landing squash, signed: positive squashes, negative stretches. */
  sq: MotionValue<number>;
  /** Passing under another letter, 0 to 1. */
  dip: MotionValue<number>;
  /** 0 out of place, 1 home. */
  ink: MotionValue<number>;
  z: MotionValue<number>;
};

type Move =
  | { word: number; kind: "swap"; a: number; b: number; lead: number }
  | { word: number; kind: "insert"; from: number; to: number };

type Role = "over" | "under" | "aside";

type Phase =
  "jumbled" | "waiting" | "tossing" | "sorting" | "draining" | "sorted";
type Next = null | "start" | "beat";

function Letter({
  char,
  cell,
  color,
  stray,
}: {
  char: string;
  cell: Cell;
  color: string;
  stray: string;
}) {
  const ink = useTransform(cell.ink, (v) =>
    v >= 0.995
      ? color
      : v <= 0.005
        ? stray
        : `color-mix(in oklab, ${color} ${pct(v)}%, ${stray})`,
  );
  const scaleX = useTransform([cell.sq, cell.dip], ([s = 0, d = 0]: number[]) =>
    r3((1 + 0.08 * s) * (1 - 0.07 * d)),
  );
  const scaleY = useTransform([cell.sq, cell.dip], ([s = 0, d = 0]: number[]) =>
    r3((1 - 0.16 * s) * (1 - 0.07 * d)),
  );
  return (
    <motion.span
      className="relative inline-block"
      style={{
        x: cell.x,
        y: cell.y,
        rotate: cell.rot,
        scaleX,
        scaleY,
        color: ink,
        zIndex: cell.z,
        originX: 0.5,
        originY: 1,
      }}
    >
      {char}
    </motion.span>
  );
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  sync: () => void;
  measure: () => void;
  relayout: () => void;
  press: () => void;
  replay: () => void;
  start: () => void;
  beat: () => void;
  settle: () => void;
  stop: () => void;
};

/**
 * A headline that starts as an anagram of itself and sorts itself back. Each
 * word's letters begin in a seeded jumble — the server renders it, so the
 * first frame is a legible anagram in a softer ink — and the sort runs in
 * beats: a letter hops over its neighbour on an arc whose height rides its
 * horizontal spring (springs.snap, time-scaled, so its one overshoot lands it
 * a hair past its slot and back), leaning into the hop, while the letter it
 * crosses dips under the baseline and the letters between glide aside by the
 * difference in width on springs.glide. A landing squashes the letter on its
 * baseline, and a letter that lands home turns to full ink, so the word
 * develops as it sorts.
 *
 * `method` is the rhythm: `pairs` swaps every out-of-order neighbour pair at
 * once on each beat, `place` leaps each slot's letter into place in one long
 * arc, `sweep` runs one pass along the line hopping each letter back over the
 * ones it belongs before. A press, or Enter or Space, tosses the letters into
 * a new jumble and sorts them again, ticking on each landing when `sound` is
 * on. The real words sit underneath for selection and screen readers. Under
 * reduced motion nothing travels: the letters jump home and the ink develops
 * on a tween.
 */
export function AnagramSort({
  text,
  as = "h2",
  method = "pairs",
  swapSpeed = 1,
  arcHeight = 0.55,
  duration = 340,
  stagger = 140,
  delay = 0,
  settle = 0.5,
  seed = 1,
  color = "currentColor",
  strayColor = "color-mix(in oklab, currentColor 42%, transparent)",
  trigger = "inView",
  play,
  once = true,
  interactive = true,
  replayKey,
  sound = false,
  onProgress,
  onComplete,
  className,
}: AnagramSortProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const running = onScreen && !hidden;

  const layout = React.useMemo(() => layoutOf(text, seed), [text, seed]);
  const cells = React.useMemo(
    () =>
      layout.glyphs.map((g, id): Cell => ({
        x: motionValue(0),
        y: motionValue(0),
        rot: motionValue(0),
        sq: motionValue(0),
        dip: motionValue(0),
        ink: motionValue(layout.dom[g.word]?.[g.home] === id ? 1 : 0),
        z: motionValue(2),
      })),
    [layout],
  );

  const speed = clamp(swapSpeed, 0.25, 4);
  const arc = clamp(arcHeight, 0, 1.5);
  const hopMs = clamp(duration, 120, 1500);
  const f = hopMs / BASE / speed;

  const target =
    trigger === "manual"
      ? Boolean(play)
      : trigger === "mount"
        ? true
        : trigger === "hover"
          ? hovered
          : onScreen;

  const rootRef = React.useRef<HTMLElement | null>(null);
  const homes = React.useRef(new Map<number, HTMLSpanElement>());
  const geo = React.useRef({
    widths: [] as number[],
    lefts: [] as number[],
    em: 16,
    dir: 1,
  });
  const st = React.useRef({
    layout,
    phase: "jumbled" as Phase,
    cur: layout.dom.map((a) => a.slice()),
    tx: layout.glyphs.map(() => 0),
    plan: { parity: 0, cursor: [] as number[], word: 0, i: 1 },
    voiced: false,
    tosses: 0,
    next: null as Next,
    timer: null as number | null,
    hops: new Map<number, AnimationPlaybackControls>(),
    squash: new Map<number, AnimationPlaybackControls>(),
    inks: new Map<number, AnimationPlaybackControls>(),
    develop: null as AnimationPlaybackControls | null,
    home: -1,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onProgress, onComplete });
  const lastReplay = React.useRef(replayKey);

  /** Lefts of each slot in an arrangement, from the measured widths. */
  const leftsOf = (arr: number[]) => {
    const out: number[] = [];
    let at = 0;
    for (const id of arr) {
      out.push(at);
      at += geo.current.widths[id] ?? 0;
    }
    return out;
  };

  /** Where every letter of a word sits in an arrangement, as x offsets from its DOM slot. */
  const targetsOf = (w: number, arr: number[]) => {
    const s = st.current;
    const dom = s.layout.dom[w] ?? [];
    const now = leftsOf(arr);
    const was = leftsOf(dom);
    const out = new Map<number, number>();
    arr.forEach((id, slot) => {
      const from = was[s.layout.domSlot[id] ?? 0] ?? 0;
      out.set(id, r2(geo.current.dir * ((now[slot] ?? 0) - from)));
    });
    return out;
  };

  const homeCount = () => {
    const s = st.current;
    let n = 0;
    s.layout.words.forEach((word, w) => {
      for (const slot of word.free) {
        if (s.cur[w]?.[slot] === word.glyphs[slot]) n += 1;
      }
    });
    return n;
  };

  const isHome = (id: number) => {
    const s = st.current;
    const g = s.layout.glyphs[id];
    if (!g) return true;
    const slot = (s.cur[g.word] ?? []).indexOf(id);
    return s.layout.words[g.word]?.glyphs[slot] === id;
  };

  const progress = () => {
    const s = st.current;
    const n = homeCount();
    if (n === s.home) return n;
    s.home = n;
    report.current.onProgress?.(n, s.layout.total);
    return n;
  };

  const clearTimer = () => {
    const s = st.current;
    if (s.timer !== null) window.clearTimeout(s.timer);
    s.timer = null;
  };

  /**
   * Finishes, never freezes, whatever is moving: each letter goes exactly
   * where it now belongs. The beat schedule is left alone.
   */
  const settleNow = () => {
    const s = st.current;
    for (const c of s.hops.values()) c.stop();
    for (const c of s.squash.values()) c.stop();
    for (const c of s.inks.values()) c.stop();
    s.develop?.stop();
    s.develop = null;
    s.hops.clear();
    s.squash.clear();
    s.inks.clear();
    cells.forEach((cell, id) => {
      cell.x.jump(s.tx[id] ?? 0);
      cell.y.jump(0);
      cell.rot.jump(0);
      cell.sq.jump(0);
      cell.dip.jump(0);
      cell.z.jump(2);
      cell.ink.jump(isHome(id) ? 1 : 0);
    });
  };

  const glyphPan = (id: number) => {
    const root = rootRef.current;
    const s = st.current;
    const g = s.layout.glyphs[id];
    if (!root || !g) return 0;
    const slot = (s.cur[g.word] ?? []).indexOf(id);
    const owner = s.layout.words[g.word]?.glyphs[slot] ?? id;
    return panFrom(
      root.getBoundingClientRect().left + (geo.current.lefts[owner] ?? 0),
      root,
    );
  };

  const inkTo = (id: number, to: number) => {
    const s = st.current;
    const cell = cells[id];
    if (!cell || Math.abs(cell.ink.get() - to) < 0.01) return;
    s.inks.get(id)?.stop();
    s.inks.set(
      id,
      animate(cell.ink, to, { duration: durations.base, ease: easings.enter }),
    );
  };

  /** A letter touches down: squash, ink, and a tick for the visitor. */
  const land = (id: number, role: Role, travel: number) => {
    const s = st.current;
    const cell = cells[id];
    if (!cell) return;
    const k =
      clamp01(settle) *
      (role === "over" ? 1 : role === "under" ? 0.55 : 0.3) *
      clamp(Math.abs(travel) / (0.6 * geo.current.em), 0.35, 1);
    if (k > 0.02) {
      s.squash.get(id)?.stop();
      cell.sq.jump(r3(k));
      s.squash.set(id, animate(cell.sq, 0, timed(springs.snap, f * 0.8)));
    }
    inkTo(id, isHome(id) ? 1 : 0);
    const n = progress();
    if (s.voiced && s.phase !== "tossing" && role !== "aside") {
      const total = Math.max(1, s.layout.total);
      audio.play("tick", {
        pitch: r3(semitones(-5 + Math.round((n / total) * 12))),
        gain: n === total ? 0.6 : 0.38,
        pan: glyphPan(id),
      });
    }
  };

  const drained = () => {
    const s = st.current;
    if (s.phase !== "draining" || s.hops.size > 0 || s.develop) return;
    s.phase = "sorted";
    s.voiced = false;
    progress();
    report.current.onComplete?.();
  };

  /**
   * One letter flies to `to`. Its horizontal progress is a spring; its
   * height is derived from that progress, so the arc and the overshoot are
   * one motion. A hop that interrupts another starts from wherever it is.
   */
  const hop = (id: number, to: number, role: Role, lift = 1, wait = 0) => {
    const s = st.current;
    const cell = cells[id];
    if (!cell) return;
    s.hops.get(id)?.stop();
    const x0 = cell.x.get();
    const y0 = cell.y.get();
    const r0 = cell.rot.get();
    const d = to - x0;
    const em = geo.current.em;
    const h =
      role === "over"
        ? arc *
          em *
          lift *
          clamp(0.5 + (0.5 * Math.abs(d)) / (1.3 * em), 0.5, 1)
        : role === "under"
          ? -0.1 * arc * em
          : 0;
    const lean = role === "over" ? Math.sign(d) * (4 + 8 * clamp01(arc)) : 0;
    cell.z.set(role === "over" ? 3 : role === "under" ? 1 : 2);
    let landed = false;
    const controls = animate(0, 1, {
      ...(role === "aside"
        ? timed(springs.glide, f * 0.85)
        : timed(springs.snap, f)),
      delay: wait / 1000,
      onUpdate: (p) => {
        const q = clamp01(p);
        cell.x.set(r2(x0 + d * p));
        cell.y.set(r2(y0 * (1 - q) - h * Math.sin(Math.PI * q)));
        cell.rot.set(r2(r0 * (1 - q) + lean * Math.sin(2 * Math.PI * q)));
        if (role === "under") cell.dip.set(r3(Math.sin(Math.PI * q)));
        if (!landed && p >= 0.985) {
          landed = true;
          land(id, role, d);
        }
      },
      onComplete: () => {
        if (s.hops.get(id) !== controls) return;
        s.hops.delete(id);
        cell.dip.set(0);
        cell.z.set(2);
        if (!landed) land(id, role, d);
        drained();
      },
    });
    s.hops.set(id, controls);
  };

  /** Applies a move to the arrangement and sends every letter it shifts. */
  const apply = (m: Move) => {
    const s = st.current;
    const word = s.layout.words[m.word];
    const arr = s.cur[m.word];
    if (!word || !arr) return;
    const S = word.free;
    let lead = -1;
    let under = -1;
    if (m.kind === "swap") {
      const a = S[m.a] as number;
      const b = S[m.b] as number;
      const ga = arr[a] as number;
      const gb = arr[b] as number;
      arr[a] = gb;
      arr[b] = ga;
      lead = m.lead;
      under = lead === ga ? gb : ga;
    } else {
      const ids = S.map((slot) => arr[slot] as number);
      const [g] = ids.splice(m.from, 1);
      if (g === undefined) return;
      ids.splice(m.to, 0, g);
      S.forEach((slot, k) => {
        arr[slot] = ids[k] as number;
      });
      lead = g;
    }
    for (const [id, x] of targetsOf(m.word, arr)) {
      if (Math.abs((s.tx[id] ?? 0) - x) < 0.01) continue;
      s.tx[id] = x;
      hop(id, x, id === lead ? "over" : id === under ? "under" : "aside");
    }
  };

  /** The next beat's moves, from the arrangement as it stands. */
  const nextStep = (): Move[] | null => {
    const s = st.current;
    const { words } = s.layout;
    // Glyph ids run in reading order, so an id is its letter's sort key.
    if (method === "pairs") {
      for (let tries = 0; tries < 2; tries += 1) {
        const moves: Move[] = [];
        words.forEach((word, w) => {
          const arr = s.cur[w] ?? [];
          const S = word.free;
          for (let i = s.plan.parity; i + 1 < S.length; i += 2) {
            const a = arr[S[i] as number] as number;
            const b = arr[S[i + 1] as number] as number;
            // The letter heading back toward the start jumps the queue.
            if (a > b) {
              moves.push({ word: w, kind: "swap", a: i, b: i + 1, lead: b });
            }
          }
        });
        s.plan.parity ^= 1;
        if (moves.length) return moves;
      }
      return null;
    }
    if (method === "place") {
      const moves: Move[] = [];
      words.forEach((word, w) => {
        const arr = s.cur[w] ?? [];
        const S = word.free;
        let i = s.plan.cursor[w] ?? 0;
        while (
          i < S.length &&
          arr[S[i] as number] === word.glyphs[S[i] as number]
        ) {
          i += 1;
        }
        s.plan.cursor[w] = i;
        if (i >= S.length) return;
        const want = word.glyphs[S[i] as number] as number;
        const j = S.findIndex((slot) => arr[slot] === want);
        if (j > i) {
          moves.push({ word: w, kind: "swap", a: i, b: j, lead: want });
        }
      });
      return moves.length ? moves : null;
    }
    while (s.plan.word < words.length) {
      const word = words[s.plan.word] as Word;
      const arr = s.cur[s.plan.word] ?? [];
      const S = word.free;
      while (s.plan.i < S.length) {
        const i = s.plan.i;
        s.plan.i += 1;
        const k = arr[S[i] as number] as number;
        let p = i;
        while (p > 0 && (arr[S[p - 1] as number] as number) > k) p -= 1;
        if (p < i) {
          return [{ word: s.plan.word, kind: "insert", from: i, to: p }];
        }
      }
      s.plan.word += 1;
      s.plan.i = 1;
    }
    return null;
  };

  const beatMs = () =>
    Math.round(
      (method === "pairs"
        ? Math.max(stagger, 0.8 * hopMs)
        : method === "place"
          ? Math.max(stagger, 0.75 * hopMs)
          : Math.max(stagger * 0.9, 0.5 * hopMs)) / speed,
    );

  /**
   * Runs `next` after `ms` — or, off screen and in a hidden tab, holds it
   * until the element is back. Always through the latest render.
   */
  const later = (next: "start" | "beat", ms: number) => {
    const s = st.current;
    clearTimer();
    s.next = next;
    if (!running) return;
    s.timer = window.setTimeout(() => {
      s.timer = null;
      const what = s.next;
      s.next = null;
      if (what === "start") api.current?.start();
      else if (what === "beat") api.current?.beat();
    }, ms);
  };

  /** Nothing travels: every letter goes home and the ink develops. */
  const develop = () => {
    const s = st.current;
    settleNow();
    s.cur = s.layout.words.map((w) => w.glyphs.slice());
    s.layout.words.forEach((_, w) => {
      for (const [id, x] of targetsOf(w, s.cur[w] ?? [])) s.tx[id] = x;
    });
    s.phase = "draining";
    cells.forEach((cell, id) => {
      cell.x.jump(s.tx[id] ?? 0);
      if (cell.ink.get() < 0.99) {
        s.inks.set(
          id,
          animate(cell.ink, 1, { duration: DEVELOP, ease: easings.enter }),
        );
      }
    });
    progress();
    s.develop = animate(0, 1, {
      duration: DEVELOP,
      onComplete: () => {
        s.develop = null;
        drained();
      },
    });
  };

  const beat = () => {
    const s = st.current;
    if (s.phase !== "sorting") return;
    if (!motionSafe) {
      develop();
      return;
    }
    if (!running) {
      s.next = "beat";
      return;
    }
    const moves = nextStep();
    if (!moves) {
      s.phase = "draining";
      drained();
      return;
    }
    for (const m of moves) apply(m);
    later("beat", beatMs());
  };

  const start = () => {
    const s = st.current;
    s.plan = { parity: 0, cursor: s.layout.words.map(() => 0), word: 0, i: 1 };
    s.phase = "sorting";
    beat();
  };

  /**
   * A new jumble: every letter hops to its new place at once and, when
   * `thenSort`, the sort begins a beat after they land.
   */
  const toss = (thenSort: boolean, voiced: boolean) => {
    const s = st.current;
    clearTimer();
    s.next = null;
    settleNow();
    s.tosses += 1;
    s.voiced = voiced;
    const rand = lcg((s.layout.base ^ Math.imul(s.tosses, 0x85ebca6b)) >>> 0);
    s.cur = s.layout.words.map((word, w) =>
      jumbleWord(word, s.layout.glyphs, rand, s.cur[w]),
    );
    s.phase = thenSort ? "tossing" : "jumbled";
    let longest = 0;
    s.layout.words.forEach((_, w) => {
      for (const [id, x] of targetsOf(w, s.cur[w] ?? [])) {
        const moved = Math.abs((s.tx[id] ?? 0) - x) > 0.01;
        s.tx[id] = x;
        const cell = cells[id];
        if (!cell) continue;
        if (!motionSafe) {
          cell.x.jump(x);
          cell.ink.jump(isHome(id) ? 1 : 0);
          continue;
        }
        if (!moved) {
          inkTo(id, isHome(id) ? 1 : 0);
          continue;
        }
        const r = rand();
        const wait = Math.round(r * 90);
        longest = Math.max(longest, wait);
        hop(id, x, r < 0.3 ? "under" : "over", 0.7 + 0.3 * r, wait);
      }
    });
    progress();
    if (thenSort) {
      later(
        "start",
        motionSafe ? Math.round(longest + hopMs * 1.1 + HOLD) : 700,
      );
    }
  };

  /** Back to the server's jumble at once: the element is off screen. */
  const reset = () => {
    const s = st.current;
    clearTimer();
    s.next = null;
    s.cur = s.layout.dom.map((a) => a.slice());
    s.tx = s.layout.glyphs.map(() => 0);
    s.phase = "jumbled";
    settleNow();
    progress();
  };

  /** Brings the run in line with what should be happening now. */
  const sync = () => {
    const s = st.current;
    if (target) {
      if (s.phase === "jumbled") {
        s.phase = "waiting";
        later("start", Math.max(0, delay));
        return;
      }
      // Paused off screen, or a re-run cleared the timer: pick it back up.
      if (s.timer === null && s.next !== null) later(s.next, 0);
      return;
    }
    if (s.phase === "waiting") {
      clearTimer();
      s.next = null;
      s.phase = "jumbled";
      return;
    }
    if (!once && s.phase !== "jumbled") {
      if (trigger === "inView") reset();
      else toss(false, false);
      return;
    }
    if (s.timer === null && s.next !== null) later(s.next, 0);
  };

  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const s = st.current;
    const style = getComputedStyle(root);
    const box = root.getBoundingClientRect();
    geo.current.em = parseFloat(style.fontSize) || 16;
    geo.current.dir = style.direction === "rtl" ? -1 : 1;
    s.layout.glyphs.forEach((_, id) => {
      const node = homes.current.get(id);
      if (!node) return;
      const r = node.getBoundingClientRect();
      geo.current.widths[id] = r.width;
      geo.current.lefts[id] = r.left - box.left;
    });
    // New widths move every slot: letters go straight to theirs.
    let changed = false;
    s.layout.words.forEach((_, w) => {
      for (const [id, x] of targetsOf(w, s.cur[w] ?? [])) {
        if (Math.abs((s.tx[id] ?? 0) - x) > 0.01) changed = true;
        s.tx[id] = x;
      }
    });
    if (!changed) return;
    settleNow();
    drained();
  };

  /** A new text or seed: a new jumble, straight from the server's layout. */
  const relayout = () => {
    const s = st.current;
    if (s.layout === layout) return;
    clearTimer();
    s.layout = layout;
    s.cur = layout.dom.map((a) => a.slice());
    s.tx = layout.glyphs.map(() => 0);
    s.phase = "jumbled";
    s.next = null;
    s.home = -1;
    for (const c of s.hops.values()) c.stop();
    s.hops.clear();
    measure();
  };

  const press = () => {
    if (!interactive) return;
    toss(true, true);
  };

  React.useLayoutEffect(() => {
    api.current = {
      sync,
      measure,
      relayout,
      press,
      replay: () => toss(true, false),
      start,
      beat,
      settle: settleNow,
      stop: () => {
        clearTimer();
        settleNow();
      },
    };
    report.current = { onProgress, onComplete };
  });

  React.useLayoutEffect(() => {
    api.current?.relayout();
    api.current?.measure();
  }, [layout]);

  // Letters in place are state: the host hears the count from the first commit.
  React.useEffect(() => {
    const s = st.current;
    const n = homeCount();
    s.home = n;
    // Reported once per layout, as it arrives.
    report.current.onProgress?.(n, s.layout.total);
  }, [layout]);

  React.useEffect(() => {
    api.current?.sync();
    const s = st.current;
    return () => {
      if (s.timer !== null) window.clearTimeout(s.timer);
      s.timer = null;
    };
  }, [target, running, motionSafe, layout, once]);

  React.useEffect(() => {
    if (lastReplay.current === replayKey) return;
    lastReplay.current = replayKey;
    api.current?.replay();
  }, [replayKey]);

  // A switch to reduced motion mid-flight finishes the letters where they belong.
  React.useEffect(() => {
    if (!motionSafe) api.current?.settle();
  }, [motionSafe]);

  React.useEffect(() => () => api.current?.stop(), []);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        setOnScreen(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.35 },
    );
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindHome = (id: number) => (node: HTMLSpanElement | null) => {
    if (node) homes.current.set(id, node);
    else homes.current.delete(id);
  };

  const Tag: React.ElementType = as;
  const { words, glyphs, dom } = layout;
  const pad = r3(arc);

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={interactive ? 0 : undefined}
        aria-describedby={interactive ? hintId : undefined}
        onPointerEnter={(event: React.PointerEvent) => {
          if (trigger === "hover" && event.pointerType === "mouse") {
            setHovered(true);
          }
        }}
        onPointerLeave={(event: React.PointerEvent) => {
          if (trigger === "hover" && event.pointerType === "mouse" && !once) {
            setHovered(false);
          }
        }}
        onClick={() => {
          // Touch has no hover: the first tap starts a hover-triggered sort.
          if (trigger === "hover" && !hovered) {
            setHovered(true);
            return;
          }
          const picked = window.getSelection()?.toString() ?? "";
          if (!picked.trim()) api.current?.press();
        }}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (!interactive) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (!event.repeat) api.current?.press();
        }}
        className={cn(
          "relative grid",
          interactive &&
            "cursor-pointer rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
        style={{ paddingTop: `${pad}em`, paddingBottom: `${r3(0.12 * arc)}em` }}
      >
        <span className="sr-only">{text}</span>
        {/* The real words, invisible: they hold the box and the selection. */}
        <span aria-hidden className="col-start-1 row-start-1 text-transparent">
          {words.map((word, w) => (
            <React.Fragment key={w}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {word.glyphs.map((id) => (
                  <span key={id} ref={bindHome(id)} className="inline-block">
                    {glyphs[id]?.char}
                  </span>
                ))}
              </span>
            </React.Fragment>
          ))}
        </span>
        <span
          aria-hidden
          className="pointer-events-none col-start-1 row-start-1 select-none"
        >
          {words.map((_, w) => (
            <React.Fragment key={w}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {(dom[w] ?? []).map((id) => (
                  <Letter
                    key={id}
                    char={glyphs[id]?.char ?? ""}
                    cell={cells[id] as Cell}
                    color={color}
                    stray={strayColor}
                  />
                ))}
              </span>
            </React.Fragment>
          ))}
        </span>
      </Tag>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Press Enter to shuffle the letters and sort them again.
        </span>
      ) : null}
    </>
  );
}
