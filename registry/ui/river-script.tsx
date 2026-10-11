"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type RiverScriptProps = {
  /** The sentence, as a string. Wins over `text`. */
  children?: string;
  /** The sentence, when it is not given as children. */
  text?: string;
  /** How far the river winds, 0 (a straight canal) to 1 (deep bends). @default 0.6 */
  meander?: number;
  /** The current's speed through an average reach, px/s; quicker in the narrows, slower in the pools. @default 38 */
  flowSpeed?: number;
  /** The river's width at an average reach, px. @default 30 */
  width?: number;
  /** How much the width swings between pools and narrows, 0 (even) to 1. @default 0.6 */
  narrows?: number;
  /** How many bends the course passes through, 3 to 7. @default 5 */
  bends?: number;
  /** Controlled offsets the visitor has added to each bend, -1 to 1 of the half height (negative is north). */
  course?: number[];
  /** Initial bend offsets when uncontrolled. @default all 0 */
  defaultCourse?: number[];
  /** Fires from the drag or key that re-routed the river, with every bend's offset. */
  onCourseChange?: (course: number[]) => void;
  /** Controlled: the current is held. */
  paused?: boolean;
  /** Initial hold when uncontrolled. @default false */
  defaultPaused?: boolean;
  /** Fires when Space holds or frees the current. */
  onPausedChange?: (paused: boolean) => void;
  /** Hovering the text slows the current to a stop so it can be read. @default true */
  hoverToRead?: boolean;
  /** The water's colour. @default a light wash of the accent */
  waterColor?: string;
  /** The banks' ink. @default "var(--ink-3)" */
  bankColor?: string;
  /** Names for the widest pool and the tightest narrows, in that order. @default ["Fern Pool", "the Gauge"] */
  places?: readonly [string, string];
  /** Seeds the course and its pools, so two rivers never match. @default 3 */
  seed?: number;
  /** The map's height, px. @default 200 */
  height?: number;
  /** No dragging, no keys; the current still runs. @default false */
  disabled?: boolean;
  /** The map's accessible name. @default "River map" */
  label?: string;
  /** Called with the current's state: flowing, held by a hand over the text, or paused. */
  onFlowChange?: (state: RiverFlow) => void;
  className?: string;
};

export type RiverFlow = "flowing" | "reading" | "paused";

const DEFAULT_TEXT =
  "Down from the fells the water idles through the pools and races the narrows to the sea.";

/** The width the server lays the map out at; the client redraws at its own. */
const NOMINAL = 720;
const SAMPLES = 220;
const STEP = 1 / 120;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x2545f491) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function graphemes(text: string): string[] {
  const Seg = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment: (t: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

type Shape = {
  meander: number;
  width: number;
  narrows: number;
  bends: number;
  seed: number;
};

/** How many bends fit a map w wide without kinking the text: about one per 130 px. */
const bendsFor = (w: number, n: number) =>
  clamp(Math.round((0.92 * w) / 130), 2, n);

/** The seeded part of the course: each bend's swing, and the pools' phase. */
function seeded(shape: Shape) {
  const rand = lcg(shape.seed * 7193 + 11);
  const n = clamp(Math.round(shape.bends), 3, 7);
  const swings: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    swings.push(side * (0.45 + rand() * 0.55));
  }
  return {
    n,
    swings,
    ends: [(rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4] as const,
    phase: [rand(), rand()] as const,
  };
}

type Course = {
  x: Float64Array;
  y: Float64Array;
  nx: Float64Array;
  ny: Float64Array;
  s: Float64Array;
  wd: Float64Array;
  total: number;
  /** Where each bend sits, for the handles. */
  bx: number[];
  by: number[];
  /** Arclength of the widest pool and the tightest narrows. */
  pool: number;
  narrow: number;
  mean: number;
  amp: number;
};

/**
 * The river for a box w × h: a Catmull-Rom spline through the bends (each
 * the seeded swing times the meander, plus the visitor's own offset),
 * sampled with its arclength, normals and a width that swings between
 * pools and narrows along it. Ends run past the box so the river enters and
 * leaves the map.
 */
function buildCourse(
  w: number,
  h: number,
  shape: Shape,
  offsets: readonly number[],
): Course {
  const seed = seeded(shape);
  const base = clamp(shape.width, 8, 80);
  const swing = clamp01(shape.narrows) * 0.5;
  const maxW = base * (1 + swing);
  const amp = Math.max(0, h / 2 - maxW / 2 - 12);
  const px: number[] = [];
  const py: number[] = [];
  const n = bendsFor(w, seed.n);
  px.push(-0.08 * w);
  py.push(h / 2 + seed.ends[0] * amp);
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    px.push(lerp(0.04 * w, 0.96 * w, t));
    const off = clamp(
      (seed.swings[i] ?? 0) * clamp01(shape.meander) + (offsets[i] ?? 0),
      -1.15,
      1.15,
    );
    py.push(h / 2 + off * amp);
  }
  px.push(1.08 * w);
  py.push(h / 2 + seed.ends[1] * amp);
  const x = new Float64Array(SAMPLES);
  const y = new Float64Array(SAMPLES);
  const segs = px.length - 1;
  for (let k = 0; k < SAMPLES; k += 1) {
    const u = (k / (SAMPLES - 1)) * segs;
    const i = Math.min(segs - 1, Math.floor(u));
    const t = u - i;
    const p0 = Math.max(0, i - 1);
    const p3 = Math.min(segs, i + 2);
    const cr = (a: number, b: number, c: number, d: number) =>
      0.5 *
      (2 * b +
        (-a + c) * t +
        (2 * a - 5 * b + 4 * c - d) * t * t +
        (-a + 3 * b - 3 * c + d) * t * t * t);
    x[k] = cr(px[p0] ?? 0, px[i] ?? 0, px[i + 1] ?? 0, px[p3] ?? 0);
    y[k] = cr(py[p0] ?? 0, py[i] ?? 0, py[i + 1] ?? 0, py[p3] ?? 0);
  }
  const s = new Float64Array(SAMPLES);
  const nx = new Float64Array(SAMPLES);
  const ny = new Float64Array(SAMPLES);
  const wd = new Float64Array(SAMPLES);
  for (let k = 1; k < SAMPLES; k += 1) {
    s[k] =
      (s[k - 1] ?? 0) +
      Math.hypot((x[k] ?? 0) - (x[k - 1] ?? 0), (y[k] ?? 0) - (y[k - 1] ?? 0));
  }
  const total = s[SAMPLES - 1] ?? 1;
  let pool = 0;
  let narrow = 0;
  let wide = -Infinity;
  let tight = Infinity;
  let sum = 0;
  for (let k = 0; k < SAMPLES; k += 1) {
    const a = Math.max(0, k - 1);
    const b = Math.min(SAMPLES - 1, k + 1);
    const tx = (x[b] ?? 0) - (x[a] ?? 0);
    const ty = (y[b] ?? 0) - (y[a] ?? 0);
    const l = Math.hypot(tx, ty) || 1;
    nx[k] = -ty / l;
    ny[k] = tx / l;
    const u = (s[k] ?? 0) / total;
    const wave =
      0.62 * Math.cos(Math.PI * 2 * (1.6 * u + seed.phase[0])) +
      0.38 * Math.cos(Math.PI * 2 * (3.1 * u + seed.phase[1]));
    const wk = clamp(base * (1 + swing * 1.6 * wave), base * 0.42, maxW * 1.1);
    wd[k] = wk;
    sum += wk;
    const xx = x[k] ?? 0;
    if (xx > 0.12 * w && xx < 0.88 * w) {
      if (wk > wide) {
        wide = wk;
        pool = s[k] ?? 0;
      }
      if (wk < tight) {
        tight = wk;
        narrow = s[k] ?? 0;
      }
    }
  }
  return {
    x,
    y,
    nx,
    ny,
    s,
    wd,
    total,
    bx: px.slice(1, -1),
    by: py.slice(1, -1),
    pool,
    narrow,
    mean: sum / SAMPLES,
    amp,
  };
}

type Probe = {
  x: number;
  y: number;
  nx: number;
  ny: number;
  w: number;
  angle: number;
};

/** The river at arclength s: position, normal, width and heading (deg). */
function at(c: Course, s: number, out: Probe): Probe {
  const S = c.s;
  let lo = 0;
  let hi = SAMPLES - 1;
  const t = clamp(s, 0, c.total);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((S[mid] ?? 0) < t) lo = mid;
    else hi = mid;
  }
  const s0 = S[lo] ?? 0;
  const s1 = S[hi] ?? 1;
  const f = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
  out.x = lerp(c.x[lo] ?? 0, c.x[hi] ?? 0, f);
  out.y = lerp(c.y[lo] ?? 0, c.y[hi] ?? 0, f);
  out.nx = lerp(c.nx[lo] ?? 0, c.nx[hi] ?? 0, f);
  out.ny = lerp(c.ny[lo] ?? 1, c.ny[hi] ?? 1, f);
  out.w = lerp(c.wd[lo] ?? 0, c.wd[hi] ?? 0, f);
  out.angle =
    (Math.atan2(
      (c.y[hi] ?? 0) - (c.y[lo] ?? 0),
      (c.x[hi] ?? 0) - (c.x[lo] ?? 0),
    ) *
      180) /
    Math.PI;
  return out;
}

/** The water, the two banks and two contour hints, as path strings. */
function riverPaths(c: Course) {
  const left: string[] = [];
  const right: string[] = [];
  const outerA: string[] = [];
  const outerB: string[] = [];
  for (let k = 0; k < SAMPLES; k += 2) {
    const x = c.x[k] ?? 0;
    const y = c.y[k] ?? 0;
    const nx = c.nx[k] ?? 0;
    const ny = c.ny[k] ?? 0;
    const half = (c.wd[k] ?? 0) / 2;
    left.push(`${r2(x + nx * half)} ${r2(y + ny * half)}`);
    right.push(`${r2(x - nx * half)} ${r2(y - ny * half)}`);
    outerA.push(`${r2(x + nx * (half + 14))} ${r2(y + ny * (half + 14))}`);
    outerB.push(`${r2(x - nx * (half + 14))} ${r2(y - ny * (half + 14))}`);
  }
  return {
    water: `M${left.join(" L")} L${right.reverse().join(" L")} Z`,
    bankA: `M${left.join(" L")}`,
    bankB: `M${[...right].reverse().join(" L")}`,
    contourA: `M${outerA.join(" L")}`,
    contourB: `M${outerB.join(" L")}`,
  };
}

/**
 * A clear spot for a place name beside the river at arclength s: either
 * bank, a little further out if need be, inside the map and clear of every
 * reach of the river (the label's ends and middle are each checked). No
 * spot, no label: a name never sits on the water.
 */
function labelSpot(
  c: Course,
  s: number,
  prefer: number,
  w: number,
  h: number,
  name: string,
): { x: number; y: number; ok: boolean } {
  const p = at(c, s, { x: 0, y: 0, nx: 0, ny: 0, w: 0, angle: 0 });
  const half = name.length * 3.4 + 4;
  const clear = (x: number, y: number) => {
    for (let k = 0; k < SAMPLES; k += 3) {
      const d = Math.hypot((c.x[k] ?? 0) - x, (c.y[k] ?? 0) - y);
      if (d - (c.wd[k] ?? 0) / 2 < 7) return false;
    }
    return true;
  };
  for (const side of [prefer, -prefer]) {
    for (const extra of [14, 24, 36]) {
      const room = p.w / 2 + extra;
      const x = p.x + p.nx * room * side;
      const y = p.y + p.ny * room * side;
      if (x - half < 8 || x + half > w - 8 || y < 12 || y > h - 8) continue;
      if (clear(x, y) && clear(x - half, y) && clear(x + half, y)) {
        return { x: r2(x), y: r2(y), ok: true };
      }
    }
  }
  return { x: r2(p.x), y: r2(p.y), ok: false };
}

/** A letter's advance before the font can be measured: a fair average. */
const guessAdvance = (g: string, em: number) =>
  g === " "
    ? em * 0.3
    : /[il.,'’:;!|]/.test(g)
      ? em * 0.3
      : /[mwMW]/.test(g)
        ? em * 0.82
        : em * 0.56;

/** How far letters open up in a reach of width w: tight in the narrows, loose in the pools. */
const trackFor = (w: number, mean: number) =>
  clamp(0.8 + 0.55 * (w / Math.max(1, mean) - 0.6), 0.84, 1.45);

type Placement = { x: number; y: number; angle: number; s: number };

/**
 * Lays the sentence back up the river from its head: each step between
 * letters is their mean advance, opened or closed by the reach it is in, and
 * each letter drifts across the stream by an eddy that the banks pinch.
 */
function placeLetters(
  c: Course,
  head: number,
  advances: readonly number[],
  eddy: number,
  clock: number,
  out: Placement[],
  probe: Probe,
) {
  // The head is the sentence's last letter, furthest downstream; the rest
  // follow it, so the line reads left to right as the river runs.
  let s = head;
  const last = advances.length - 1;
  for (let i = last; i >= 0; i -= 1) {
    if (i < last) {
      at(c, s, probe);
      const step =
        (((advances[i + 1] ?? 0) + (advances[i] ?? 0)) / 2) *
        trackFor(probe.w, c.mean);
      s -= step;
    }
    at(c, s, probe);
    const room = Math.max(0, probe.w / 2 - 7);
    const drift =
      eddy *
      room *
      Math.sin(s * 0.021 + clock * 0.55 + i * 0.13) *
      Math.min(1, probe.w / Math.max(1, c.mean));
    const p = out[i] ?? { x: 0, y: 0, angle: 0, s: 0 };
    p.x = probe.x + probe.nx * drift;
    p.y = probe.y + probe.ny * drift;
    p.angle = probe.angle;
    p.s = s;
    out[i] = p;
  }
  return out;
}

/** Where the sentence rests to be read: centred on the widest pool. */
const readingHead = (c: Course, length: number) =>
  clamp(c.pool + length / 2, length, c.total);

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/**
 * Text that flows down a winding river on a pale map. The sentence rides
 * the river letter by letter, laid along its centreline and turned to its
 * heading, as an accordion: the spacing opens in the wide pools, where the
 * letters also drift across the stream on a slow eddy, and closes up tight in
 * the narrows, where the banks pinch the eddy out; and the sentence's speed
 * follows continuity — slow through the pools, quick through the narrows —
 * so one sentence breathes as it travels, then leaves at the mouth and
 * enters again at the source.
 *
 * Hover the text and the current eases to a stop on the drift spring, the
 * eddies settle and the line lies straight to be read. Grab the river by a
 * bank and drag: the nearest bend follows the finger 1:1, the course
 * re-splines live and the letters flow along the new course; on release the
 * bend settles on the snap spring with the release speed. Each bend is a
 * slider for the keyboard, and Space holds and frees the current. Under
 * reduced motion the sentence lies still in the widest pool.
 */
export function RiverScript({
  children,
  text,
  meander = 0.6,
  flowSpeed = 38,
  width = 30,
  narrows = 0.6,
  bends = 5,
  course,
  defaultCourse,
  onCourseChange,
  paused,
  defaultPaused = false,
  onPausedChange,
  hoverToRead = true,
  waterColor = "color-mix(in oklab, var(--accent-bright) 18%, transparent)",
  bankColor = "var(--ink-3)",
  places = ["Fern Pool", "the Gauge"],
  seed = 3,
  height = 200,
  disabled = false,
  label = "River map",
  onFlowChange,
  className,
}: RiverScriptProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const sentence =
    (typeof children === "string" ? children : text) ?? DEFAULT_TEXT;
  const glyphs = React.useMemo(() => graphemes(sentence), [sentence]);
  const n = clamp(Math.round(bends), 3, 7);
  const shape: Shape = { meander, width, narrows, bends: n, seed };
  const [own, setOwn] = React.useState<number[]>(() =>
    Array.from({ length: n }, (_, i) => clamp(defaultCourse?.[i] ?? 0, -1, 1)),
  );
  const source = course ?? own;
  const offsets = Array.from({ length: n }, (_, i) =>
    clamp(source[i] ?? 0, -1, 1),
  );
  const offsetsKey = offsets.join(",");
  const [ownPaused, setOwnPaused] = React.useState(defaultPaused);
  const isPaused = paused ?? ownPaused;
  const [said, setSaid] = React.useState("");
  // The width the map was last drawn at: it decides how many bends fit.
  const [room, setRoom] = React.useState(NOMINAL);
  const fitted = bendsFor(room, n);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const h = clamp(height, 80, 800);

  // The designed first frame, laid out at a nominal width: the server and
  // the first client render agree on it, and the map crops to fit until the
  // client redraws at its own size.
  const first = (() => {
    const c = buildCourse(NOMINAL, h, shape, offsets);
    const paths = riverPaths(c);
    const em = 14;
    const adv = glyphs.map((g) => guessAdvance(g, em));
    const length = adv.reduce((a, b) => a + b, 0);
    const probe: Probe = { x: 0, y: 0, nx: 0, ny: 0, w: 0, angle: 0 };
    const placed = placeLetters(
      c,
      readingHead(c, length),
      adv,
      0,
      0,
      [],
      probe,
    );
    const poolAt = labelSpot(c, c.pool, -1, NOMINAL, h, places[0]);
    const narrowAt = labelSpot(c, c.narrow, 1, NOMINAL, h, places[1]);
    return { c, paths, placed, poolAt, narrowAt };
  })();

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const els = React.useRef({
    water: null as SVGPathElement | null,
    bankA: null as SVGPathElement | null,
    bankB: null as SVGPathElement | null,
    contourA: null as SVGPathElement | null,
    contourB: null as SVGPathElement | null,
    pool: null as SVGTextElement | null,
    narrow: null as SVGTextElement | null,
  });
  const letterEls = React.useRef<(SVGTextElement | null)[]>([]);
  const handleEls = React.useRef<(HTMLDivElement | null)[]>([]);
  const visible = React.useRef(false);
  const api = React.useRef<{
    rebuild: () => void;
    kick: () => void;
    measure: () => void;
    setBend: (i: number, value: number) => void;
    settleBend: (i: number, velocity: number) => void;
    hover: (x: number, y: number) => void;
    leave: () => void;
  } | null>(null);
  const live = React.useRef({
    shape,
    offsets,
    motionSafe,
    flowSpeed,
    paused: isPaused,
    hidden,
    hoverToRead,
    glyphs,
    onFlowChange,
  });
  React.useLayoutEffect(() => {
    live.current = {
      shape,
      offsets,
      motionSafe,
      flowSpeed,
      paused: isPaused,
      hidden,
      hoverToRead,
      glyphs,
      onFlowChange,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    if (!root || !svg) return;
    let c: Course | null = null;
    let w = 0;
    let raf = 0;
    let last = 0;
    let carry = 0;
    let disposed = false;
    let advances: number[] = [];
    let length = 0;
    let head = 0;
    let clock = 0;
    /** The current's share of full speed and the eddies' share, each on a spring. */
    const flow = { v: 1, dv: 0, eddy: 1, de: 0 };
    let reading = false;
    let state: RiverFlow = "flowing";
    /** Live bend offsets: the committed course plus any bend in hand. */
    let bendNow: number[] = [...live.current.offsets];
    const bendVel: number[] = bendNow.map(() => 0);
    const settling = new Set<number>();
    const held = new Set<number>();
    const placed: Placement[] = [];
    const probe: Probe = { x: 0, y: 0, nx: 0, ny: 0, w: 0, angle: 0 };

    const say = (next: RiverFlow) => {
      if (next === state) return;
      state = next;
      live.current.onFlowChange?.(next);
    };

    const measure = () => {
      const lettersNow = letterEls.current;
      const em = parseFloat(getComputedStyle(root).fontSize) || 14;
      advances = live.current.glyphs.map((g, i) => {
        const el = lettersNow[i];
        let a = 0;
        try {
          a = el ? el.getComputedTextLength() : 0;
        } catch {
          a = 0;
        }
        return a > 0 ? a : guessAdvance(g, em);
      });
      length = advances.reduce((a, b) => a + b, 0);
    };

    const rebuild = () => {
      w = root.clientWidth;
      if (w < 1) return;
      const L = live.current;
      if (bendNow.length !== L.offsets.length) {
        bendNow = [...L.offsets];
        bendVel.length = bendNow.length;
        bendVel.fill(0);
      } else {
        for (let i = 0; i < bendNow.length; i += 1) {
          if (!held.has(i) && !settling.has(i)) bendNow[i] = L.offsets[i] ?? 0;
        }
      }
      const was = c;
      c = buildCourse(w, h, L.shape, bendNow);
      // Keep the sentence where it was along the river, as a share of it.
      if (was && was.total > 0) head = (head / was.total) * c.total;
      else head = readingHead(c, length);
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const p = riverPaths(c);
      const e = els.current;
      e.water?.setAttribute("d", p.water);
      e.bankA?.setAttribute("d", p.bankA);
      e.bankB?.setAttribute("d", p.bankB);
      e.contourA?.setAttribute("d", p.contourA);
      e.contourB?.setAttribute("d", p.contourB);
      placeLabel(e.pool, c.pool, -1);
      placeLabel(e.narrow, c.narrow, 1);
      placeHandles();
      paint();
    };

    const placeHandles = () => {
      if (!c) return;
      for (let i = 0; i < c.bx.length; i += 1) {
        const hd = handleEls.current[i];
        if (!hd) continue;
        hd.style.left = `${r2(c.bx[i] ?? 0)}px`;
        hd.style.top = `${r2(c.by[i] ?? 0)}px`;
      }
    };

    /** A place name beside the river, on whichever side has room. */
    const placeLabel = (
      el: SVGTextElement | null,
      s: number,
      prefer: number,
    ) => {
      if (!el || !c) return;
      const spot = labelSpot(c, s, prefer, w, h, el.textContent ?? "");
      el.setAttribute("x", String(spot.x));
      el.setAttribute("y", String(spot.y));
      el.style.opacity = spot.ok ? "" : "0";
    };

    const paint = () => {
      if (!c || !visible.current) return;
      placeLetters(c, head, advances, flow.eddy, clock, placed, probe);
      const lettersNow = letterEls.current;
      for (let i = 0; i < placed.length; i += 1) {
        const el = lettersNow[i];
        const p = placed[i];
        if (!el || !p) continue;
        el.setAttribute(
          "transform",
          `translate(${r2(p.x)} ${r2(p.y)}) rotate(${r2(p.angle)})`,
        );
      }
      if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
    };

    /** Set when a settling bend has moved, so the frame redraws the course. */
    let reshaped = false;

    const step = (dt: number): boolean => {
      const L = live.current;
      if (!c) return false;
      let moving = false;
      // The bends a hand let go of settle into the map on the snap spring.
      if (settling.size) {
        const S = springs.snap;
        for (const i of settling) {
          const target = clamp(bendNow[i] ?? 0, -1, 1);
          const a =
            (S.stiffness * (target - (bendNow[i] ?? 0)) -
              S.damping * (bendVel[i] ?? 0)) /
            S.mass;
          bendVel[i] = (bendVel[i] ?? 0) + a * dt;
          const next = (bendNow[i] ?? 0) + (bendVel[i] ?? 0) * dt;
          if (
            Math.abs(next - target) < 0.0005 &&
            Math.abs(bendVel[i] ?? 0) < 0.01
          ) {
            bendNow[i] = target;
            bendVel[i] = 0;
            settling.delete(i);
          } else {
            bendNow[i] = next;
          }
        }
        reshaped = true;
        moving = true;
      }
      const stop = L.paused || (reading && L.hoverToRead);
      const D = springs.drift;
      const target = stop ? 0 : 1;
      const av =
        (D.stiffness * (target - flow.v) - D.damping * flow.dv) / D.mass;
      flow.dv += av * dt;
      flow.v += flow.dv * dt;
      const ae =
        (D.stiffness * (target - flow.eddy) - D.damping * flow.de) / D.mass;
      flow.de += ae * dt;
      flow.eddy += flow.de * dt;
      if (
        Math.abs(flow.v - target) < 0.001 &&
        Math.abs(flow.dv) < 0.001 &&
        Math.abs(flow.eddy - target) < 0.001 &&
        Math.abs(flow.de) < 0.001
      ) {
        flow.v = target;
        flow.dv = 0;
        flow.eddy = target;
        flow.de = 0;
      } else moving = true;
      if (flow.v > 0.0005) {
        // Continuity: the current runs quicker where the river is narrow.
        at(c, head - length / 2, probe);
        const speed =
          clamp(L.flowSpeed, 0, 400) *
          clamp(c.mean / Math.max(1, probe.w), 0.45, 2.4);
        head += speed * flow.v * dt;
        clock += dt * flow.v;
        const loop = c.total + length + c.total * 0.12;
        if (head - length > c.total + 8) head -= loop - length;
        moving = true;
      }
      say(L.paused ? "paused" : stop ? "reading" : "flowing");
      return moving;
    };

    const tick = (now: number) => {
      raf = 0;
      if (disposed || !visible.current || live.current.hidden || !c) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let moving = false;
      if (live.current.motionSafe) {
        carry += dt;
        let k = 0;
        while (carry >= STEP && k < 8) {
          carry -= STEP;
          k += 1;
          moving = step(STEP) || moving;
        }
        if (k === 8) carry = 0;
        if (k === 0) moving = true;
      } else {
        flow.v = 0;
        flow.eddy = 0;
        head = readingHead(c, length);
        say(live.current.paused ? "paused" : "flowing");
      }
      if (reshaped) {
        reshaped = false;
        c = buildCourse(w, h, live.current.shape, bendNow);
        const p = riverPaths(c);
        const e = els.current;
        e.water?.setAttribute("d", p.water);
        e.bankA?.setAttribute("d", p.bankA);
        e.bankB?.setAttribute("d", p.bankB);
        e.contourA?.setAttribute("d", p.contourA);
        e.contourB?.setAttribute("d", p.contourB);
        placeHandles();
      }
      paint();
      if (moving) raf = window.requestAnimationFrame(tick);
      else last = 0;
    };

    const kick = () => {
      if (disposed || raf || !visible.current || live.current.hidden) return;
      raf = window.requestAnimationFrame(tick);
    };

    api.current = {
      rebuild: () => {
        rebuild();
        kick();
      },
      kick,
      measure: () => {
        measure();
        paint();
      },
      setBend: (i, value) => {
        held.add(i);
        settling.delete(i);
        bendNow[i] = value;
        bendVel[i] = 0;
        rebuild();
        kick();
      },
      settleBend: (i, velocity) => {
        held.delete(i);
        if (!live.current.motionSafe) {
          bendNow[i] = clamp(bendNow[i] ?? 0, -1, 1);
          rebuild();
          return;
        }
        bendVel[i] = velocity;
        settling.add(i);
        kick();
      },
      hover: (x, y) => {
        if (!c) return;
        let near = false;
        for (const p of placed) {
          if (Math.hypot(p.x - x, p.y - y) < 20) {
            near = true;
            break;
          }
        }
        if (near !== reading) {
          reading = near;
          kick();
        }
      },
      leave: () => {
        if (reading) {
          reading = false;
          kick();
        }
      },
    };

    measure();
    rebuild();
    void document.fonts?.ready.then(() => {
      if (disposed) return;
      measure();
      paint();
    });
    setRoom(root.clientWidth || NOMINAL);
    const sizer = new ResizeObserver(() => {
      setRoom(root.clientWidth || NOMINAL);
      if (root.clientWidth !== w) rebuild();
      kick();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        paint();
        kick();
      }
    });
    watcher.observe(root);
    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
      api.current = null;
    };
  }, [h]);

  // Anything that reshapes the river redraws it; a pause or a hand wakes the flow.
  React.useEffect(() => {
    api.current?.rebuild();
  }, [meander, width, narrows, n, seed, offsetsKey, motionSafe, fitted]);
  React.useEffect(() => {
    api.current?.measure();
    api.current?.kick();
  }, [glyphs, isPaused, hidden, flowSpeed, hoverToRead]);

  const commitCourse = (next: number[]) => {
    if (course === undefined) setOwn(next);
    onCourseChange?.(next);
  };

  const togglePause = () => {
    const next = !isPaused;
    if (paused === undefined) setOwnPaused(next);
    onPausedChange?.(next);
    setSaid(next ? "Current held." : "Current flowing.");
  };

  // The drag: the bend nearest the press follows the finger up and down.
  const dragBend = React.useRef({ i: -1, from: 0, amp: 1 });
  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: ({ event }) => {
      const root = rootRef.current;
      if (!root) return;
      const box = root.getBoundingClientRect();
      const x = event.clientX - box.left;
      const w = root.clientWidth || NOMINAL;
      // Bends sit at even steps across the map; pick the nearest by x.
      const k = bendsFor(w, n);
      const i = clamp(Math.round(((x / w - 0.04) / 0.92) * k - 0.5), 0, k - 1);
      dragBend.current = {
        i,
        from: offsets[i] ?? 0,
        amp: buildCourse(w, h, shape, offsets).amp || 1,
      };
    },
    onMove: ({ offset }) => {
      const d = dragBend.current;
      if (d.i < 0) return;
      const raw = d.from + offset.y / d.amp;
      const v =
        raw > 1
          ? 1 + rubberband(raw - 1, 1)
          : raw < -1
            ? -1 + rubberband(raw + 1, 1)
            : raw;
      api.current?.setBend(d.i, v);
    },
    onEnd: ({ offset, velocity }) => {
      const d = dragBend.current;
      if (d.i < 0) return;
      const raw = clamp(d.from + offset.y / d.amp, -1, 1);
      api.current?.settleBend(d.i, velocity.y / d.amp);
      const next = [...offsets];
      next[d.i] = Number(raw.toFixed(3));
      commitCourse(next);
      dragBend.current.i = -1;
    },
    onCancel: () => {
      const d = dragBend.current;
      if (d.i >= 0) api.current?.settleBend(d.i, 0);
      dragBend.current.i = -1;
    },
  });

  const onBendKey =
    (i: number) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const now = offsets[i] ?? 0;
      const by = event.shiftKey ? 0.25 : 0.1;
      // The slider reads north as up: Up moves a bend north, Home sends it
      // to the south edge (the minimum), End to the north.
      let next: number;
      switch (event.key) {
        case "ArrowUp":
        case "ArrowRight":
          next = now - by;
          break;
        case "ArrowDown":
        case "ArrowLeft":
          next = now + by;
          break;
        case "PageUp":
          next = now - 0.25;
          break;
        case "PageDown":
          next = now + 0.25;
          break;
        case "Home":
          next = 1;
          break;
        case "End":
          next = -1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const out = [...offsets];
      out[i] = Number(clamp(next, -1, 1).toFixed(3));
      commitCourse(out);
    };

  const { c: c0, paths, placed: placed0, poolAt, narrowAt } = first;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="map"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={0}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (event.pointerType === "touch") return;
        const root = rootRef.current;
        if (!root) return;
        const box = root.getBoundingClientRect();
        api.current?.hover(event.clientX - box.left, event.clientY - box.top);
      }}
      onPointerLeave={() => api.current?.leave()}
      onKeyDown={(event) => {
        if (event.key !== " " || event.repeat) return;
        event.preventDefault();
        togglePause();
      }}
      className={cn(
        "group/river-script relative w-full overflow-clip rounded-[inherit] outline-none select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-default" : "cursor-ns-resize touch-pan-x",
        className,
      )}
      style={{ height: h }}
    >
      <p className="sr-only">{sentence}</p>
      <svg
        ref={svgRef}
        aria-hidden
        viewBox={`0 0 ${NOMINAL} ${h}`}
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <g className="stroke-hairline" strokeWidth={1}>
          {Array.from({ length: 16 }, (_, i) => (
            <line key={`v${i}`} x1={i * 64} x2={i * 64} y1={0} y2={800} />
          ))}
          {Array.from({ length: 13 }, (_, i) => (
            <line key={`h${i}`} y1={i * 64} y2={i * 64} x1={0} x2={1200} />
          ))}
        </g>
        <g
          fill="none"
          strokeWidth={1}
          strokeDasharray="1 4"
          strokeLinecap="round"
          style={{ stroke: bankColor }}
          opacity={0.45}
        >
          <path
            ref={(node) => {
              els.current.contourA = node;
            }}
            d={paths.contourA}
          />
          <path
            ref={(node) => {
              els.current.contourB = node;
            }}
            d={paths.contourB}
          />
        </g>
        <path
          ref={(node) => {
            els.current.water = node;
          }}
          d={paths.water}
          style={{ fill: waterColor }}
        />
        <g
          fill="none"
          strokeWidth={1.1}
          strokeLinejoin="round"
          style={{ stroke: bankColor }}
        >
          <path
            ref={(node) => {
              els.current.bankA = node;
            }}
            d={paths.bankA}
          />
          <path
            ref={(node) => {
              els.current.bankB = node;
            }}
            d={paths.bankB}
          />
        </g>
        <g
          className="fill-ink-3 font-mono text-[9px] tracking-[0.14em] uppercase"
          textAnchor="middle"
        >
          <text
            ref={(node) => {
              els.current.pool = node;
            }}
            x={poolAt.x}
            y={poolAt.y}
            style={{ opacity: poolAt.ok ? undefined : 0 }}
          >
            {places[0]}
          </text>
          <text
            ref={(node) => {
              els.current.narrow = node;
            }}
            x={narrowAt.x}
            y={narrowAt.y}
            style={{ opacity: narrowAt.ok ? undefined : 0 }}
          >
            {places[1]}
          </text>
        </g>
        <g className="fill-current">
          {glyphs.map((g, i) => {
            const p = placed0[i];
            return (
              <text
                key={i}
                ref={(node) => {
                  letterEls.current[i] = node;
                }}
                textAnchor="middle"
                dominantBaseline="central"
                transform={
                  p
                    ? `translate(${r2(p.x)} ${r2(p.y)}) rotate(${r2(p.angle)})`
                    : undefined
                }
                style={{ whiteSpace: "pre" }}
              >
                {g}
              </text>
            );
          })}
        </g>
      </svg>
      {/* North, top right. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-2.5 right-3 flex flex-col items-center gap-0.5 font-mono text-[9px] text-ink-3"
      >
        <span>N</span>
        <svg viewBox="0 0 8 12" className="h-3 w-2" fill="currentColor">
          <path d="M4 0 L8 12 L4 9 L0 12 Z" />
        </svg>
      </div>
      {Array.from({ length: fitted }, (_, i) => (
        <div
          key={i}
          ref={(node) => {
            handleEls.current[i] = node;
          }}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Bend ${i + 1} of ${fitted}`}
          aria-orientation="vertical"
          aria-valuemin={-100}
          aria-valuemax={100}
          aria-valuenow={Math.round(-(offsets[i] ?? 0) * 100) || 0}
          aria-valuetext={`Bend ${i + 1} of ${fitted}, ${Math.abs(Math.round((offsets[i] ?? 0) * 100))} percent ${(offsets[i] ?? 0) <= 0 ? "north" : "south"}`}
          aria-disabled={disabled || undefined}
          onKeyDown={onBendKey(i)}
          className={cn(
            "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition-opacity duration-200 outline-none",
            "group-hover/river-script:opacity-100 focus-visible:opacity-100",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
          )}
          style={{
            left: `${r2(((c0.bx[i] ?? NOMINAL / 2) * 100) / NOMINAL)}%`,
            top: r2(c0.by[i] ?? h / 2),
          }}
        >
          <span className="size-2 rounded-full border border-ink-3 bg-card" />
        </div>
      ))}
      <p id={hintId} className="sr-only">
        Space holds and frees the current. Each bend is a slider: Up and Down
        move it north and south. Drag the river to re-route it.
      </p>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
