"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MarginPencilElement = "p" | "div" | "blockquote";

export type MarginPencilKind = "underline" | "circle" | "bracket" | "strike";

export type MarginPencilMark = {
  /** The words to mark, exactly as they appear in the text. */
  phrase: string;
  /** How the reader marks them. */
  kind: MarginPencilKind;
  /** A short note written in the margin beside them. */
  note?: string;
  /** Which appearance of the phrase, counting from 0. @default 0 */
  occurrence?: number;
};

export type MarginPencilTone = "red" | "blue" | "graphite" | "green";

export type MarginPencilStyle = "pencil" | "ink" | "marker";

export type MarginPencilNotes = "auto" | "margin" | "footnotes";

export type MarginPencilTrigger = "mount" | "inView" | "manual";

export type MarginPencilProps = {
  /** The paragraph, as a string. Wins over `text`. */
  children?: string;
  /** The paragraph, when it is not given as children. */
  text?: string;
  /** What the reader marks, in reading order or not; overlapping marks after the first are skipped. @default [] */
  marks?: MarginPencilMark[];
  /** The element that carries the paragraph. @default "p" */
  as?: MarginPencilElement;
  /** The colour of the marks: a named pencil or any CSS colour. @default "red" */
  pencil?: MarginPencilTone | (string & {});
  /** The instrument: a coloured pencil, a fountain pen or a felt marker. @default "pencil" */
  markStyle?: MarginPencilStyle;
  /** How fast the hand works, 0.5 to 2. @default 1 */
  pace?: number;
  /** How much a stroke's width follows the hand's pressure, 0 to 1. @default 0.6 */
  pressure?: number;
  /** How much the hand wobbles, 0 to 1. @default 0.5 */
  wobble?: number;
  /** Where notes go: the margin, footnotes, or the margin when there is room. @default "auto" */
  notes?: MarginPencilNotes;
  /** Draw the pencil at the tip of the stroke. @default true */
  showPencil?: boolean;
  /** When the marking starts. @default "inView" */
  trigger?: MarginPencilTrigger;
  /** Mark once, or again each time the paragraph comes back into view. @default true */
  once?: boolean;
  /** With trigger "manual": true marks it up (again, each time it turns true). @default false */
  play?: boolean;
  /** Wait before the first stroke, ms. @default 250 */
  delay?: number;
  /** Seeds the hand's wobble and pressure. @default 3 */
  seed?: number;
  /** A pencil scratch while it draws, for runs the visitor starts. Off unless asked for. @default false */
  sound?: boolean;
  /** A mark finished drawing: its index in `marks`. */
  onMarkDrawn?: (index: number) => void;
  /** Every mark is drawn. */
  onComplete?: () => void;
  className?: string;
};

const TONES: Record<MarginPencilTone, string> = {
  // Pencil lead is pigment: a hue at a fixed lightness that reads on either
  // page — except graphite, which follows the theme's own ink.
  red: "oklch(from var(--danger) 0.6 0.19 h)",
  blue: "oklch(from var(--accent) 0.6 0.17 h)",
  graphite: "color-mix(in oklab, var(--ink) 72%, oklch(0.55 0.01 260))",
  green: "oklch(0.6 0.13 155)",
};

const KIND_WORDS: Record<MarginPencilKind, string> = {
  underline: "underlined",
  circle: "circled",
  bracket: "bracketed",
  strike: "struck through",
};

/** Width and pressure range per instrument, px at 16px type. */
const INSTRUMENTS: Record<
  MarginPencilStyle,
  { base: number; swing: number; alpha: number; blot: boolean }
> = {
  pencil: { base: 1.5, swing: 0.9, alpha: 0.9, blot: false },
  ink: { base: 1.15, swing: 1.3, alpha: 1, blot: true },
  marker: { base: 4.2, swing: 0.5, alpha: 0.42, blot: false },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const f1 = (v: number) => String(Math.round(v * 10) / 10);
const r2 = (v: number) => Math.round(v * 100) / 100;

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A hand's speed along a stroke: slow away, fast through the middle, slow to stop. */
const minJerk = (t: number) => {
  const u = clamp01(t);
  return u * u * u * (10 - 15 * u + 6 * u * u);
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Frag = { left: number; right: number; top: number; bottom: number };

/** The middle of a phrase's fragments, and the loop's horizontal radius round them. */
const cxOf = (frags: Frag[]) =>
  (Math.min(...frags.map((f) => f.left)) +
    Math.max(...frags.map((f) => f.right))) /
  2;
const rxOf = (frags: Frag[], em: number) =>
  (Math.max(...frags.map((f) => f.right)) -
    Math.min(...frags.map((f) => f.left))) /
    2 +
  0.38 * em;

type Piece = { text: string; mark: number };

/** The paragraph cut into plain runs and marked phrases, marks in text order. */
function piecesOf(text: string, marks: MarginPencilMark[]) {
  const found: { start: number; end: number; index: number }[] = [];
  marks.forEach((mark, index) => {
    if (!mark.phrase) return;
    let from = 0;
    let at = -1;
    for (let k = 0; k <= (mark.occurrence ?? 0); k += 1) {
      at = text.indexOf(mark.phrase, from);
      if (at < 0) break;
      from = at + mark.phrase.length;
    }
    if (at < 0) return;
    const end = at + mark.phrase.length;
    if (found.some((f) => at < f.end && end > f.start)) return;
    found.push({ start: at, end, index });
  });
  found.sort((a, b) => a.start - b.start);
  const pieces: Piece[] = [];
  let cursor = 0;
  for (const f of found) {
    if (f.start > cursor)
      pieces.push({ text: text.slice(cursor, f.start), mark: -1 });
    pieces.push({ text: text.slice(f.start, f.end), mark: f.index });
    cursor = f.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), mark: -1 });
  return { pieces, order: found.map((f) => f.index) };
}

type Stroke = {
  /** x, y pairs along the stroke. */
  pts: Float32Array;
  /** The width at each point. */
  w: Float32Array;
  /** Cumulative length at each point. */
  cum: Float32Array;
  len: number;
};

/** A stroke from a polyline: resampled, wobbled perpendicular, pressure-shaped. */
function strokeOf(
  raw: [number, number][],
  rand: () => number,
  wobble: number,
  pressure: number,
  base: number,
  swing: number,
): Stroke {
  // Resample evenly so wobble and pressure have a steady grain.
  const dense: [number, number][] = [];
  for (let i = 0; i < raw.length - 1; i += 1) {
    const a = raw[i] as [number, number];
    const b = raw[i + 1] as [number, number];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / 2.5));
    for (let k = 0; k < n; k += 1) {
      const t = k / n;
      dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  const lastRaw = raw[raw.length - 1];
  if (lastRaw) dense.push(lastRaw);
  const n = dense.length;
  const pts = new Float32Array(n * 2);
  const w = new Float32Array(n);
  const cum = new Float32Array(n);
  const ph1 = rand() * Math.PI * 2;
  const ph2 = rand() * Math.PI * 2;
  const f1w = 0.018 + rand() * 0.02;
  const f2w = 0.07 + rand() * 0.05;
  const amp = 1.1 * clamp01(wobble);
  let len = 0;
  for (let i = 0; i < n; i += 1) {
    const p = dense[i] as [number, number];
    const prev = dense[Math.max(0, i - 1)] as [number, number];
    const next = dense[Math.min(n - 1, i + 1)] as [number, number];
    if (i > 0) len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    cum[i] = len;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl;
    const ny = tx / tl;
    // A slow drift and a quicker tremor, both seeded, across the line.
    const off =
      amp *
      (Math.sin(len * f1w + ph1) * 0.8 + Math.sin(len * f2w + ph2) * 0.25);
    pts[i * 2] = p[0] + nx * off;
    pts[i * 2 + 1] = p[1] + ny * off;
  }
  for (let i = 0; i < n; i += 1) {
    const u = len > 0 ? (cum[i] ?? 0) / len : 0;
    // Light at touch-down, heavy through the middle, lifting off at the end.
    const press = Math.pow(Math.sin(Math.PI * clamp(u, 0.04, 0.96)), 0.55);
    const grain = 1 + 0.12 * Math.sin((cum[i] ?? 0) * 0.31 + ph2);
    w[i] = Math.max(
      0.35,
      (base + swing * clamp01(pressure) * (press - 0.5)) * grain,
    );
  }
  return { pts, w, cum, len };
}

/** The stroke's ribbon up to length `upTo`, as a filled path. */
function ribbon(s: Stroke, upTo: number): string {
  const n = s.w.length;
  if (n < 2 || upTo <= 0.2) return "";
  let end = n - 1;
  while (end > 0 && (s.cum[end] ?? 0) > upTo) end -= 1;
  const left: string[] = [];
  const right: string[] = [];
  const push = (x: number, y: number, nx: number, ny: number, w: number) => {
    left.push(`${f1(x + (nx * w) / 2)} ${f1(y + (ny * w) / 2)}`);
    right.push(`${f1(x - (nx * w) / 2)} ${f1(y - (ny * w) / 2)}`);
  };
  const normal = (i: number) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const tx = (s.pts[b * 2] ?? 0) - (s.pts[a * 2] ?? 0);
    const ty = (s.pts[b * 2 + 1] ?? 0) - (s.pts[a * 2 + 1] ?? 0);
    const l = Math.hypot(tx, ty) || 1;
    return [-ty / l, tx / l] as const;
  };
  for (let i = 0; i <= end; i += 1) {
    const [nx, ny] = normal(i);
    push(s.pts[i * 2] ?? 0, s.pts[i * 2 + 1] ?? 0, nx, ny, s.w[i] ?? 1);
  }
  // The live tip, between two samples.
  if (end < n - 1) {
    const a = s.cum[end] ?? 0;
    const b = s.cum[end + 1] ?? a;
    const t = b > a ? (upTo - a) / (b - a) : 0;
    const x =
      (s.pts[end * 2] ?? 0) +
      ((s.pts[(end + 1) * 2] ?? 0) - (s.pts[end * 2] ?? 0)) * t;
    const y =
      (s.pts[end * 2 + 1] ?? 0) +
      ((s.pts[(end + 1) * 2 + 1] ?? 0) - (s.pts[end * 2 + 1] ?? 0)) * t;
    const [nx, ny] = normal(end);
    push(x, y, nx, ny, s.w[end] ?? 1);
  }
  return `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
}

/** Where the tip is at length `at` along a stroke. */
function tipOf(s: Stroke, at: number): { x: number; y: number } {
  const n = s.w.length;
  let i = 0;
  while (i < n - 1 && (s.cum[i + 1] ?? 0) < at) i += 1;
  const a = s.cum[i] ?? 0;
  const b = s.cum[Math.min(n - 1, i + 1)] ?? a;
  const t = b > a ? clamp01((at - a) / (b - a)) : 0;
  const j = Math.min(n - 1, i + 1);
  return {
    x: (s.pts[i * 2] ?? 0) + ((s.pts[j * 2] ?? 0) - (s.pts[i * 2] ?? 0)) * t,
    y:
      (s.pts[i * 2 + 1] ?? 0) +
      ((s.pts[j * 2 + 1] ?? 0) - (s.pts[i * 2 + 1] ?? 0)) * t,
  };
}

type NoteLine = { x: number; y: number; w: number; h: number };

type Geometry = {
  /** Strokes per mark, by mark index. */
  strokes: Stroke[][];
  /** Note placement in the margin (px from the paper), by mark index. */
  noteTop: number[];
  /** Footnote numbers by mark index (0 for none). */
  numbers: number[];
  /** Superscript spots for footnote numbers. */
  sup: ({ x: number; y: number } | null)[];
  margin: boolean;
};

type Segment =
  | { kind: "draw"; mark: number; stroke: number; t0: number; t1: number }
  | { kind: "write"; mark: number; t0: number; t1: number }
  | {
      kind: "air";
      from: { x: number; y: number };
      to: { x: number; y: number };
      t0: number;
      t1: number;
    };

type Api = {
  layout: () => void;
  run: (visitor: boolean) => void;
  finish: () => void;
  halt: () => void;
  resume: () => void;
};

/** The pencil: a coloured lead, a cone of bare wood and a painted body, tip at the origin. */
function Pencil() {
  return (
    <>
      <path d="M0 0 L5.5 -9.5 L11 -6.3 Z" fill="oklch(0.86 0.06 75)" />
      <path d="M0 0 L2.1 -3.6 L4.2 -2.4 Z" fill="currentColor" />
      <path d="M5.5 -9.5 L30 -52 L35.5 -48.8 L11 -6.3 Z" fill="currentColor" />
      <path
        d="M7.4 -8.4 L31.9 -50.9 L33.3 -50.1 L8.8 -7.6 Z"
        fill="oklch(1 0 0 / 0.35)"
      />
      <path
        d="M30 -52 L33 -57.2 L38.5 -54 L35.5 -48.8 Z"
        fill="oklch(0.78 0.03 80)"
      />
    </>
  );
}

/**
 * A paragraph and a careful reader with a coloured pencil. When it comes into
 * view the pencil marks it up, mark by mark — an underline under one phrase,
 * a loop round another that overshoots its own start, a bracket in the gutter
 * with a short note written beside it, a phrase struck through. Every mark is
 * built from the real layout, line fragment by line fragment, so it sits on
 * the words wherever they wrap.
 *
 * Each stroke is a ribbon whose width follows the hand's pressure — light as
 * it touches down, heavier through the middle, lifting at the end — with a
 * seeded wobble across it. The pen travels each stroke on a minimum-jerk
 * profile (slow away, fast through the middle, slow to stop) for a time set by
 * the stroke's length, lifts between strokes and moves between marks; a small
 * pencil rides the tip. Notes are written left to right, line by line, behind
 * a clip that follows it — in a margin column when there is room, or as
 * numbered footnotes under the paragraph when there is not.
 *
 * The paragraph stays real, selectable text; each marked phrase is followed by
 * an sr-only note of its mark, so it is all read once, in place. One loop
 * draws while a run is under way, halts off screen and in hidden tabs, and
 * stops when the last mark is down. Under reduced motion the marks and notes
 * are simply there, already drawn.
 */
export function MarginPencil({
  children,
  text,
  marks = [],
  as = "p",
  pencil = "red",
  markStyle = "pencil",
  pace = 1,
  pressure = 0.6,
  wobble = 0.5,
  notes = "auto",
  showPencil = true,
  trigger = "inView",
  once = true,
  play = false,
  delay = 250,
  seed = 3,
  sound = false,
  onMarkDrawn,
  onComplete,
  className,
}: MarginPencilProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const line = (typeof children === "string" ? children : text) ?? "";
  const colour =
    typeof pencil === "string" && pencil in TONES
      ? TONES[pencil as MarginPencilTone]
      : pencil;
  const tool = INSTRUMENTS[markStyle] ?? INSTRUMENTS.pencil;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const { pieces, order } = React.useMemo(
    () => piecesOf(line, marks),
    [line, marks],
  );
  const hasNotes = order.some((i) => Boolean(marks[i]?.note));
  const hasBracket = order.some((i) => marks[i]?.kind === "bracket");
  const numbering = React.useMemo(() => {
    const out = new Map<number, number>();
    let k = 0;
    for (const i of order) {
      if (marks[i]?.note) {
        k += 1;
        out.set(i, k);
      }
    }
    return out;
  }, [order, marks]);

  // The shape of what was measured: how many strokes each mark has and where
  // its note sits. Changes only when the layout does.
  const [shape, setShape] = React.useState<{
    counts: number[];
    noteTop: number[];
    sup: ({ x: number; y: number } | null)[];
    height: number;
  }>({ counts: [], noteTop: [], sup: [], height: 0 });
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);

  const paperRef = React.useRef<HTMLDivElement | null>(null);
  const textRef = React.useRef<HTMLElement | null>(null);
  const marginRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const pencilRef = React.useRef<SVGGElement | null>(null);
  const geo = React.useRef<Geometry>({
    strokes: [],
    noteTop: [],
    numbers: [],
    sup: [],
    margin: false,
  });
  const plan = React.useRef<{ segments: Segment[]; total: number }>({
    segments: [],
    total: 0,
  });
  const clock = React.useRef({
    t: -1,
    last: 0,
    raf: 0,
    visitor: false,
    told: new Set<number>(),
    complete: false,
  });
  const scratch = React.useRef<LoopHandle | null>(null);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    pace,
    pressure,
    wobble,
    seed,
    motionSafe,
    markStyle,
    marks,
    order,
    showPencil,
    audio,
    onMarkDrawn,
    onComplete,
  });
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  /** Everything the hand will draw, from the words where they lie now. */
  const layout = () => {
    const paper = paperRef.current;
    const body = textRef.current;
    if (!paper || !body) return;
    const c = cfg.current;
    const box = paper.getBoundingClientRect();
    const em = parseFloat(getComputedStyle(body).fontSize) || 16;
    const k = em / 16;
    const inst = INSTRUMENTS[c.markStyle] ?? INSTRUMENTS.pencil;
    const textBox = body.getBoundingClientRect();
    const margin =
      marginRef.current !== null &&
      getComputedStyle(marginRef.current).display !== "none";
    const column = margin ? marginRef.current?.getBoundingClientRect() : null;
    const columnTop = column ? column.top - box.top : 0;
    const columnLeft = column ? column.left - box.left : 0;
    const strokes: Stroke[][] = [];
    const noteTop: number[] = [];
    const sup: ({ x: number; y: number } | null)[] = [];
    let nextFree = -Infinity;
    for (const i of c.order) {
      const mark = c.marks[i];
      const span = body.querySelector<HTMLElement>(`[data-mark="${i}"]`);
      if (!mark || !span) continue;
      const rand = lcg((c.seed * 7919 + i * 104729) >>> 0);
      const frags = Array.from(span.getClientRects())
        .filter((r) => r.width > 1)
        .map((r) => ({
          left: r.left - box.left,
          right: r.right - box.left,
          top: r.top - box.top,
          bottom: r.bottom - box.top,
        }));
      if (frags.length === 0) continue;
      const make = (raw: [number, number][]) =>
        strokeOf(
          raw,
          rand,
          c.wobble,
          c.pressure,
          inst.base * k,
          inst.swing * k,
        );
      const list: Stroke[] = [];
      const first = frags[0] as (typeof frags)[number];
      const lastFrag = frags[frags.length - 1] as (typeof frags)[number];
      if (mark.kind === "underline" || mark.kind === "strike") {
        for (const f of frags) {
          const h = f.bottom - f.top;
          const y =
            mark.kind === "underline" ? f.bottom - 0.14 * h : f.top + 0.56 * h;
          const tilt = (rand() - 0.5) * 2.2 * k;
          const bow = (rand() - 0.3) * 1.4 * k;
          const x0 = f.left - 2 * k;
          const x1 = f.right + 3 * k;
          const raw: [number, number][] = [];
          for (let s = 0; s <= 12; s += 1) {
            const u = s / 12;
            raw.push([
              x0 + (x1 - x0) * u,
              y +
                tilt * (u - 0.5) +
                bow * Math.sin(Math.PI * u) -
                (mark.kind === "strike" ? 1.2 * k * u : 0),
            ]);
          }
          list.push(make(raw));
        }
      } else if (mark.kind === "circle") {
        const left = Math.min(...frags.map((f) => f.left));
        const right = Math.max(...frags.map((f) => f.right));
        const top = first.top;
        const bottom = lastFrag.bottom;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        const rx = (right - left) / 2 + 0.38 * em;
        const ry = (bottom - top) / 2 + 0.16 * em;
        const a0 = Math.PI * (1.08 + rand() * 0.12);
        const sweep = Math.PI * 2 + 0.35 + rand() * 0.25;
        const lean = (rand() - 0.5) * 0.08;
        const raw: [number, number][] = [];
        const steps = 48;
        for (let s = 0; s <= steps; s += 1) {
          const u = s / steps;
          // A hand's loop: a little wider on the way round, drifting inward
          // as it closes past its own start.
          const a = a0 - sweep * u;
          const grow = 1 + 0.05 * Math.sin(2 * a + rand() * 0.2) - 0.06 * u;
          const x = cx + rx * grow * Math.cos(a);
          const y = cy + ry * grow * Math.sin(a) + lean * (x - cx);
          raw.push([x, y]);
        }
        list.push(make(raw));
      } else {
        const top = first.top + 0.1 * em;
        const bottom = lastFrag.bottom - 0.1 * em;
        // In the gutter the paragraph keeps for it, just past the words.
        const x = textBox.right - box.left - 0.42 * em;
        const tick = 0.32 * em;
        list.push(
          make([
            [x - tick, top],
            [x - tick * 0.25, top + 0.02 * em],
            [x, top + 0.18 * em],
            [x + 0.02 * em, (top + bottom) / 2],
            [x, bottom - 0.18 * em],
            [x - tick * 0.25, bottom - 0.02 * em],
            [x - tick, bottom],
          ]),
        );
      }
      // Notes sit beside their marks' first line, pushed down past the one
      // above so two never collide.
      if (mark.note && margin) {
        const want = first.top - columnTop - 0.08 * em;
        const at = Math.max(0, want, nextFree);
        noteTop[i] = Math.round(at);
        const node = paper.querySelector<HTMLElement>(`[data-note="${i}"]`);
        nextFree = at + (node ? node.offsetHeight : 1.4 * em) + 0.3 * em;
        if (mark.kind === "circle") {
          // A leader from the top of the loop, up into the gap above the
          // line and across to the note, so it never runs through words.
          const sx = cxOf(frags) + rxOf(frags, em) * 0.55;
          const sy = first.top - 0.02 * em;
          const lane = first.top - 0.22 * em;
          const ex = columnLeft - 0.25 * em;
          const ey = columnTop + at + 0.6 * em;
          list.push(
            make([
              [sx, sy],
              [sx + 0.35 * em, lane],
              [ex - 0.8 * em, lane],
              [ex, ey],
            ]),
          );
        }
      }
      sup[i] =
        mark.note && !margin
          ? {
              x: Math.round(lastFrag.right + 1),
              y: Math.round(lastFrag.top - 0.1 * em),
            }
          : null;
      strokes[i] = list;
    }
    geo.current = {
      strokes,
      noteTop,
      numbers: [],
      sup,
      margin,
    };
    // The time line: for each mark, the hand moves there, draws its strokes
    // with a lift between, then writes its note.
    const segments: Segment[] = [];
    let t = 0;
    let at: { x: number; y: number } | null = null;
    for (const i of c.order) {
      const list = strokes[i];
      if (!list || list.length === 0) continue;
      list.forEach((s, j) => {
        const start = tipOf(s, 0);
        const move = at ? (j === 0 ? 260 : 110) : 0;
        if (at)
          segments.push({
            kind: "air",
            from: at,
            to: start,
            t0: t,
            t1: t + move,
          });
        t += move;
        const dur = 90 + 22 * Math.pow(Math.max(1, s.len), 0.66);
        segments.push({ kind: "draw", mark: i, stroke: j, t0: t, t1: t + dur });
        t += dur;
        at = tipOf(s, s.len);
      });
      const note = c.marks[i]?.note;
      if (note) {
        const dur = 30 * note.length + 120;
        segments.push({
          kind: "write",
          mark: i,
          t0: t + 140,
          t1: t + 140 + dur,
        });
        t += 140 + dur;
      }
    }
    plan.current = { segments, total: t };
    const counts = c.marks.map((_, i) => strokes[i]?.length ?? 0);
    const height = Math.round(Math.max(0, nextFree));
    setShape((prev) => {
      const same =
        prev.height === height &&
        prev.counts.length === counts.length &&
        prev.counts.every((v, k2) => v === counts[k2]) &&
        prev.noteTop.length === noteTop.length &&
        prev.noteTop.every((v, k2) => v === noteTop[k2]) &&
        prev.sup.length === sup.length &&
        prev.sup.every((v, k2) => v?.x === sup[k2]?.x && v?.y === sup[k2]?.y);
      return same ? prev : { counts, noteTop, sup, height };
    });
    // A page already marked follows its words at once.
    if (clock.current.t >= 0) paint(clock.current.t);
  };

  /** Draws the page as it stands at time t (ms into the run); -1 is blank. */
  const paint = (t: number) => {
    const svg = svgRef.current;
    const paper = paperRef.current;
    if (!svg || !paper) return;
    const g = geo.current;
    const c = cfg.current;
    const segs = plan.current.segments;
    let tip: { x: number; y: number } | null = null;
    let lifted = 0;
    let drawing = false;
    let speed = 0;
    let press = 0;
    for (const seg of segs) {
      if (seg.kind === "air") {
        if (t >= seg.t0 && t < seg.t1) {
          const u = minJerk((t - seg.t0) / Math.max(1, seg.t1 - seg.t0));
          tip = {
            x: seg.from.x + (seg.to.x - seg.from.x) * u,
            y: seg.from.y + (seg.to.y - seg.from.y) * u,
          };
          lifted = Math.sin(Math.PI * u);
        }
        continue;
      }
      if (seg.kind === "draw") {
        const s = g.strokes[seg.mark]?.[seg.stroke];
        const node = svg.querySelector<SVGPathElement>(
          `[data-stroke="${seg.mark}:${seg.stroke}"]`,
        );
        if (!s || !node) continue;
        const u =
          t < 0 ? 0 : clamp01((t - seg.t0) / Math.max(1, seg.t1 - seg.t0));
        const at = minJerk(u) * s.len;
        const done = node.dataset.done === "1";
        if (u >= 1) {
          if (!done) {
            node.setAttribute("d", ribbon(s, s.len + 1));
            node.dataset.done = "1";
          }
        } else {
          node.setAttribute("d", ribbon(s, at));
          node.dataset.done = "0";
        }
        const blot = svg.querySelector<SVGCircleElement>(
          `[data-blot="${seg.mark}:${seg.stroke}"]`,
        );
        if (blot) {
          const p0 = tipOf(s, 0);
          blot.setAttribute("cx", f1(p0.x));
          blot.setAttribute("cy", f1(p0.y));
          blot.setAttribute("opacity", u > 0 ? "1" : "0");
        }
        if (u > 0 && u < 1) {
          tip = tipOf(s, at);
          drawing = true;
          // The pen's speed along the stroke, from the minimum-jerk profile.
          const du = 1 / Math.max(1, seg.t1 - seg.t0);
          speed =
            ((minJerk(Math.min(1, u + du)) - minJerk(u)) * s.len) /
            Math.max(1e-3, du * 1000);
          press = Math.sin(Math.PI * u);
        }
        continue;
      }
      // The note, written line by line behind a clip that follows the pen.
      const note = paper.querySelector<HTMLElement>(
        `[data-note="${seg.mark}"]`,
      );
      const foot = paper.querySelector<HTMLElement>(
        `[data-foot="${seg.mark}"]`,
      );
      const supNode = paper.querySelector<HTMLElement>(
        `[data-sup="${seg.mark}"]`,
      );
      const u =
        t < 0 ? 0 : clamp01((t - seg.t0) / Math.max(1, seg.t1 - seg.t0));
      if (foot) foot.style.opacity = String(r2(u > 0 ? Math.min(1, u * 3) : 0));
      if (supNode) supNode.style.opacity = u > 0 ? "1" : "0";
      if (!note) continue;
      const lines = linesOf(note, paper);
      const total = lines.reduce((sum, l) => sum + l.w, 0);
      const base = note.getBoundingClientRect();
      const pbox = paper.getBoundingClientRect();
      const ox = base.left - pbox.left;
      const oy = base.top - pbox.top;
      let left = total * u;
      // Lines already written are open full width; the line being written
      // is open as far as the pen has gone.
      let fullBottom = -2;
      let part: { w: number; top: number; bottom: number } | null = null;
      for (const l of lines) {
        if (left >= l.w) {
          left -= l.w;
          fullBottom = l.y - oy + l.h + 1;
          continue;
        }
        if (left > 0) {
          part = {
            w: l.x - ox + left,
            top: l.y - oy,
            bottom: l.y - oy + l.h + 2,
          };
          if (u > 0 && u < 1) {
            tip = { x: l.x + left, y: l.y + l.h * 0.8 };
            drawing = true;
            speed = 0.12;
            press = 0.6;
          }
        }
        break;
      }
      if (u >= 1) note.style.clipPath = "none";
      else if (!part && fullBottom < 0)
        note.style.clipPath = "inset(0 100% 0 0)";
      else {
        const W = base.width + 4;
        const top = Math.max(fullBottom, part ? part.top : fullBottom);
        const pts = [
          `-2px -2px`,
          `${f1(W)}px -2px`,
          `${f1(W)}px ${f1(fullBottom)}px`,
        ];
        if (part) {
          pts.push(`${f1(part.w)}px ${f1(top)}px`);
          pts.push(`${f1(part.w)}px ${f1(part.bottom)}px`);
          pts.push(`-2px ${f1(part.bottom)}px`);
        } else {
          pts.push(`-2px ${f1(fullBottom)}px`);
        }
        note.style.clipPath = `polygon(${pts.join(", ")})`;
      }
    }
    const pen = pencilRef.current;
    if (pen) {
      const show = c.showPencil && c.motionSafe && tip !== null && t >= 0;
      if (show && tip) {
        const k = (parseFloat(getComputedStyle(paper).fontSize) || 16) / 16;
        pen.setAttribute(
          "transform",
          `translate(${f1(tip.x + lifted * 5 * k)} ${f1(tip.y - lifted * 9 * k)}) scale(${r2(0.62 * k)})`,
        );
      }
      pen.setAttribute("opacity", show ? "1" : "0");
    }
    // The pencil on paper, louder with pressure and higher with speed.
    const loop = scratch.current;
    if (loop) {
      loop.set({
        gain: drawing ? r2(clamp(press * 0.55, 0, 0.6)) : 0,
        pitch: r2(clamp(0.75 + speed * 0.9, 0.7, 1.6)),
      });
    }
    // Marks report as they finish.
    for (const seg of segs) {
      if (seg.kind !== "draw" && seg.kind !== "write") continue;
      const lastOfMark = !segs.some(
        (o) =>
          o !== seg &&
          (o.kind === "draw" || o.kind === "write") &&
          o.mark === seg.mark &&
          o.t1 > seg.t1,
      );
      if (lastOfMark && t >= seg.t1 && !clock.current.told.has(seg.mark)) {
        clock.current.told.add(seg.mark);
        c.onMarkDrawn?.(seg.mark);
      }
    }
  };

  const stopScratch = () => {
    scratch.current?.stop();
    scratch.current = null;
  };

  const halt = () => {
    const k = clock.current;
    if (k.raf) window.cancelAnimationFrame(k.raf);
    k.raf = 0;
    stopScratch();
  };

  const frame = (now: number) => {
    const k = clock.current;
    k.raf = 0;
    const dt = Math.min(50, Math.max(0, now - k.last));
    k.last = now;
    k.t += dt * clamp(cfg.current.pace, 0.5, 2);
    const total = plan.current.total;
    if (k.t >= total) {
      k.t = total;
      paint(total);
      stopScratch();
      if (!k.complete) {
        k.complete = true;
        cfg.current.onComplete?.();
      }
      return;
    }
    paint(k.t);
    k.raf = window.requestAnimationFrame((ts) => frameRef.current(ts));
  };

  /** Runs the pencil from where it is, if a run is under way. */
  const resume = () => {
    const k = clock.current;
    if (k.raf || k.t < 0 || k.t >= plan.current.total) return;
    k.last = performance.now();
    if (k.visitor && !scratch.current && cfg.current.motionSafe) {
      scratch.current = cfg.current.audio.start("scratch", {
        gain: 0,
        pitch: 1,
      });
    }
    k.raf = window.requestAnimationFrame((ts) => frameRef.current(ts));
  };

  /** A fresh run from a blank page. */
  const run = (visitor: boolean) => {
    const k = clock.current;
    halt();
    k.t = 0;
    k.complete = false;
    k.told = new Set();
    k.visitor = visitor;
    if (!cfg.current.motionSafe) {
      finish();
      return;
    }
    paint(-1);
    paint(0);
    resume();
  };

  /** Everything drawn at once: reduced motion, or a re-layout after a run. */
  const finish = () => {
    const k = clock.current;
    halt();
    k.t = plan.current.total;
    paint(k.t);
    if (!k.complete) {
      k.complete = true;
      cfg.current.onComplete?.();
    }
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      pace,
      pressure,
      wobble,
      seed,
      motionSafe,
      markStyle,
      marks,
      order,
      showPencil,
      audio,
      onMarkDrawn,
      onComplete,
    };
    frameRef.current = frame;
    api.current = { layout, run, finish, halt, resume };
  });

  // The strokes follow the layout; a page already drawn is redrawn whole.
  React.useLayoutEffect(() => {
    api.current?.layout();
  }, [line, order, markStyle, pressure, wobble, seed, notes]);

  React.useLayoutEffect(() => {
    const k = clock.current;
    if (k.t < 0) {
      paint(-1);
      return;
    }
    if (k.t >= plan.current.total || !motionSafe) api.current?.finish();
    else paint(k.t);
  }, [shape, motionSafe]);

  React.useEffect(() => {
    if (running) api.current?.resume();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  const runTimer = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!started) return;
    // A run the visitor asked for — a manual play set inside a click or a
    // key — is heard; one that starts on scrolling into view never is.
    const ua = (navigator as { userActivation?: { isActive: boolean } })
      .userActivation;
    const visitor = trigger === "manual" && Boolean(ua?.isActive);
    runTimer.current = window.setTimeout(() => {
      runTimer.current = null;
      api.current?.run(visitor);
    }, delay);
    return () => {
      if (runTimer.current !== null) window.clearTimeout(runTimer.current);
      runTimer.current = null;
    };
    // The delay belongs to the trigger, not to a later change of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, entrance.n]);

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback((restart: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, 0);
  }, []);
  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false);
    if (trigger === "manual") {
      if (play) begin(true);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, begin, reset]);

  const seen = React.useRef({ trigger, once, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once };
    if (started) seen.current.played = true;
  });

  React.useEffect(() => {
    const k = clock.current;
    return () => {
      if (k.raf) window.cancelAnimationFrame(k.raf);
      k.raf = 0;
    };
  }, []);

  const bindPaper = React.useCallback(
    (node: HTMLDivElement | null) => {
      paperRef.current = node;
      if (!node) return;
      const relayout = () => api.current?.layout();
      let first = true;
      const sizer = new ResizeObserver(() => {
        if (first) {
          first = false;
          return;
        }
        relayout();
      });
      sizer.observe(node);
      document.fonts?.addEventListener?.("loadingdone", relayout);
      const watcher = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          const visible = Boolean(entry?.isIntersecting);
          setOnScreen(visible);
          const t = seen.current;
          if (t.trigger !== "inView") return;
          if (visible) begin(!t.once && t.played);
          else if (!t.once && t.played) reset();
        },
        { threshold: 0.35 },
      );
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        document.fonts?.removeEventListener?.("loadingdone", relayout);
      };
    },
    [begin, reset],
  );

  /** Hovering a phrase or its note brings both up. */
  const hot = (i: number | null) => {
    const paper = paperRef.current;
    if (!paper) return;
    paper
      .querySelectorAll<SVGElement | HTMLElement>("[data-hot]")
      .forEach((el) => {
        el.dataset.hot = el.dataset.of === String(i) ? "on" : "off";
      });
  };

  const Tag = as;
  const marginOn = notes === "margin";
  const footOn = notes === "footnotes";
  const showMargin = hasNotes && !footOn;
  const showFoot = hasNotes && !marginOn;

  return (
    <div className={cn("@container/margin-pencil relative w-full", className)}>
      <div
        ref={bindPaper}
        className={cn(
          "relative grid grid-cols-1 gap-x-[1.4em] overflow-clip p-[0.6em]",
          showMargin &&
            (marginOn
              ? "grid-cols-[minmax(0,1fr)_7.5rem]"
              : "@[30rem]/margin-pencil:grid-cols-[minmax(0,1fr)_7.5rem]"),
        )}
      >
        <Tag
          ref={(node: HTMLElement | null) => {
            textRef.current = node;
          }}
          className={cn("relative m-0", hasBracket && "pr-[0.9em]")}
          onPointerOver={(event) => {
            const el = (event.target as Element).closest?.("[data-mark]");
            hot(el ? Number(el.getAttribute("data-mark")) : null);
          }}
          onPointerLeave={() => hot(null)}
        >
          {pieces.map((piece, k) =>
            piece.mark < 0 ? (
              <React.Fragment key={k}>{piece.text}</React.Fragment>
            ) : (
              <React.Fragment key={k}>
                <span data-mark={piece.mark}>{piece.text}</span>
                <span className="sr-only">
                  {` (${KIND_WORDS[marks[piece.mark]?.kind ?? "underline"]}${
                    marks[piece.mark]?.note
                      ? `; note: ${marks[piece.mark]?.note}`
                      : ""
                  })`}
                </span>
              </React.Fragment>
            ),
          )}
        </Tag>
        {showMargin ? (
          <div
            ref={marginRef}
            aria-hidden
            className={cn(
              "relative",
              marginOn ? "block" : "hidden @[30rem]/margin-pencil:block",
            )}
            style={{ height: shape.height || undefined }}
          >
            {order.map((i) =>
              marks[i]?.note ? (
                <span
                  key={i}
                  data-note={i}
                  data-hot="off"
                  data-of={i}
                  className="absolute top-0 left-0 block w-full text-[0.8em] leading-[1.25] italic opacity-80 transition-opacity data-[hot=on]:opacity-100"
                  style={{
                    color: colour,
                    top: shape.noteTop[i] ?? 0,
                    clipPath: "inset(0 100% 0 0)",
                  }}
                >
                  {marks[i]?.note}
                </span>
              ) : null,
            )}
          </div>
        ) : null}
        {showFoot ? (
          <ol
            aria-hidden
            className={cn(
              "m-0 mt-[0.5em] flex list-none flex-col gap-[0.15em] p-0 text-[0.8em] italic",
              !footOn && "@[30rem]/margin-pencil:hidden",
            )}
            style={{ color: colour }}
          >
            {order.map((i) =>
              marks[i]?.note ? (
                <li
                  key={i}
                  data-foot={i}
                  className="opacity-0"
                  style={{ transition: `opacity ${durations.base}s` }}
                >
                  <span className="mr-[0.4em] font-mono not-italic">
                    {numbering.get(i)}
                  </span>
                  {marks[i]?.note}
                </li>
              ) : null,
            )}
          </ol>
        ) : null}
        <svg
          ref={svgRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          style={{ color: colour }}
        >
          {markStyle === "pencil" ? (
            <defs>
              <filter
                id={`${uid}-lead`}
                x="-5%"
                y="-5%"
                width="110%"
                height="110%"
              >
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="1.4"
                  numOctaves={2}
                  seed={seed}
                  result="grain"
                />
                <feColorMatrix
                  in="grain"
                  values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.7 1.6"
                  result="tooth"
                />
                <feComposite in="SourceGraphic" in2="tooth" operator="in" />
              </filter>
            </defs>
          ) : null}
          <g
            filter={markStyle === "pencil" ? `url(#${uid}-lead)` : undefined}
            opacity={tool.alpha}
          >
            {order.map((i) => (
              <g
                key={i}
                data-hot="off"
                data-of={i}
                className="opacity-90 transition-opacity data-[hot=on]:opacity-100"
              >
                {Array.from({ length: shape.counts[i] ?? 0 }, (_, j) => (
                  <React.Fragment key={j}>
                    {tool.blot ? (
                      <circle
                        data-blot={`${i}:${j}`}
                        r={1.3}
                        fill="currentColor"
                        opacity={0}
                      />
                    ) : null}
                    <path data-stroke={`${i}:${j}`} fill="currentColor" />
                  </React.Fragment>
                ))}
              </g>
            ))}
          </g>
          {showPencil ? (
            <g ref={pencilRef} opacity={0}>
              <Pencil />
            </g>
          ) : null}
        </svg>
        {order.map((i) => {
          const at = shape.sup[i];
          return at ? (
            <span
              key={i}
              aria-hidden
              data-sup={i}
              className="pointer-events-none absolute font-mono text-[0.62em] leading-none opacity-0"
              style={{ left: at.x, top: at.y, color: colour }}
            >
              {numbering.get(i)}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}

/** A note's line boxes, relative to the paper. */
function linesOf(note: HTMLElement, paper: HTMLElement): NoteLine[] {
  const range = document.createRange();
  range.selectNodeContents(note);
  const base = paper.getBoundingClientRect();
  const out: NoteLine[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1) continue;
    const last = out[out.length - 1];
    // Fragments on one line merge into that line.
    if (last && Math.abs(last.y - (r.top - base.top)) < 2) {
      last.w = r.right - base.left - last.x;
      continue;
    }
    out.push({
      x: r.left - base.left,
      y: r.top - base.top,
      w: r.width,
      h: r.height,
    });
  }
  return out;
}
