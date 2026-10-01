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
import { durations, easings } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SketchPaintPencil = "hb" | "4b";

export type SketchPaintProps = {
  /** What the picture shows. Exposed the whole time, while it is painted and after. */
  alt: string;
  /** The image to paint. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: any element that fills its box. */
  children?: React.ReactNode;
  /**
   * Controlled: whether the picture is ready. Uncontrolled, an image is ready
   * once it has loaded (or failed), and children at once — the painting
   * itself is then the minimum run.
   */
  ready?: boolean;
  /** How much of the picture has arrived, 0 to 1. Until ready, the painting holds at that stage. */
  progress?: number;
  /** Fires once per painting, when the picture has resolved through the paint. */
  onReady?: () => void;
  /** How fast the sketch, the washes and the drying run, 0.5 to 2. @default 1 */
  speed?: number;
  /** How wet the paper is, 0 (tight, precise washes) to 1 (loose washes with soft, wandering edges that overrun the pencil). @default 0.5 */
  wash?: number;
  /** The lead: a fine light HB line, or a soft dark 4B with heavy shading. @default "hb" */
  pencil?: SketchPaintPencil;
  /** Play the brush on the paper while the visitor paints. Off unless asked for. @default false */
  sound?: boolean;
  /** It still paints itself; the brush does nothing. */
  disabled?: boolean;
  /** Sizes the box. @default "aspect-[4/3] w-full" */
  className?: string;
};

type Phase = "painting" | "resolving" | "done";

/** The sheet's regions, in columns and rows; each blooms as one wash. */
const COLS = 4;
const ROWS = 3;
const REGIONS = COLS * ROWS;
/** Seconds of the whole schedule at speed 1. */
const BASE = 3.6;
/** Where on the schedule the sketch is drawn, and where the washes open. */
const SKETCHED = 0.2;
const FIRST_WASH = 0.14;
const LAST_WASH = 0.66;
/** Seconds a bloom takes to spread, and a brush mark to soak in, at speed 1. */
const SPREAD = 0.9;
const SOAK = 0.25;
/** Brush marks kept for redrawing the sheet after a resize. */
const MOST_DABS = 600;
/** Where an indeterminate painting waits while its picture is not ready. */
const LATENT = 0.8;

// Fixed art, the same in both themes: cold-pressed paper, the tide line a
// wash leaves where it dried, and the wet brush.
const PAPER = "oklch(0.975 0.008 85)";
const TIDE = "oklch(0.46 0.05 60";
const BRUSH =
  "inset 0 0 0 1.5px oklch(0.3 0.03 260 / 0.45), inset 0 0 10px oklch(0.55 0.08 230 / 0.25)";
/** Seeded fractal noise for the paper's tooth, drawn once and tiled. */
const TOOTH =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='t' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.45' numOctaves='3' seed='8' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 0 0.2 -0.6 0 0 0 0.3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23t)'/%3E%3C/svg%3E\")";
/** Watercolour lays tone in steps: the posterise behind the washes' banding. */
const STEPS = "0.06 0.2 0.34 0.48 0.62 0.76 0.88 1";

type Lead = {
  /** How strongly an edge reads: the Sobel kernels' divisor (lower is stronger). */
  divisor: number;
  /** Paper to graphite across edge strength, 0 to 1. */
  table: string;
  /** How much of the shadows is hatched, 0 to 1. */
  shade: number;
  /** Graphite at full pressure, as RGB shares. */
  graphite: readonly [number, number, number];
  /** How much the paper's tooth breaks the line, 0 to 1. */
  tooth: number;
  /** A soft lead spreads a little. */
  soften: number;
};

const LEADS: Record<SketchPaintPencil, Lead> = {
  hb: {
    divisor: 2.4,
    table: "1 0.86 0.55 0.32 0.22",
    shade: 0.22,
    graphite: [0.42, 0.43, 0.46],
    tooth: 0.5,
    soften: 0,
  },
  "4b": {
    divisor: 1.5,
    table: "1 0.62 0.16 0.04 0",
    shade: 0.5,
    graphite: [0.2, 0.2, 0.23],
    tooth: 0.3,
    soften: 0.5,
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Wet paint runs fast, then slows as it reaches its drying edge. */
const spread = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

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

type Region = {
  col: number;
  row: number;
  /** The seeded origin, as shares of the region from its corner. */
  fx: number;
  fy: number;
  /** Phases of the bloom's wandering edge. */
  phases: readonly [number, number, number];
  /** Where on the schedule it opens by itself. */
  at: number;
};

/** The regions in a painter's order: the sky first, top to bottom, a little loosely. */
function regionsOf(seed: number): Region[] {
  const rand = lcg(seed);
  const all = Array.from({ length: REGIONS }, (_, i) => ({
    col: i % COLS,
    row: Math.floor(i / COLS),
    fx: 0.32 + rand() * 0.36,
    fy: 0.32 + rand() * 0.36,
    phases: [rand() * 6.28, rand() * 6.28, rand() * 6.28] as const,
    order: Math.floor(i / COLS) + rand() * 0.9 + (i % COLS) * 0.08,
  }));
  all.sort((a, b) => a.order - b.order);
  return all.map((r, i) => ({
    col: r.col,
    row: r.row,
    fx: r.fx,
    fy: r.fy,
    phases: r.phases,
    at: FIRST_WASH + ((LAST_WASH - FIRST_WASH) * i) / (REGIONS - 1),
  }));
}

type Bloom = {
  opened: number;
  /** The origin, in px. */
  x: number;
  y: number;
  /** The radius erased so far, and (under reduced motion) how much of it. */
  r: number;
  shown: number;
  tide: boolean;
};
type Dab = { x: number; y: number; at: number; r: number };

type Sheet = {
  d: number;
  /** Seconds on the painting's clock, scaled by speed. */
  t: number;
  /** One per region, in painter's order; null until it opens. */
  blooms: (Bloom | null)[];
  dabs: Dab[];
  w: number;
  h: number;
  dpr: number;
  /** Where the brush last touched: the picture resolves from there. */
  lastX: number;
  lastY: number;
};

const freshSheet = (w: number, h: number, dpr: number): Sheet => ({
  d: 0,
  t: 0,
  blooms: new Array<Bloom | null>(REGIONS).fill(null),
  dabs: [],
  w,
  h,
  dpr,
  lastX: w / 2,
  lastY: h / 2,
});

const HIDDEN = "linear-gradient(transparent, transparent)";

type Mark = { x: number; y: number; t: number };

type Api = {
  reset: () => void;
  step: (dt: number) => boolean;
  redraw: () => void;
};

/**
 * An image placeholder that paints its picture in: first a pencil sketch of
 * the picture's own edges, then watercolour washes blooming into its regions,
 * then the picture itself resolving through the paint. Every stage is the
 * real picture: the sketch is an edge-detection filter (Sobel edges broken by
 * the paper's tooth, with hatching in the shadows), the washes a painted
 * simplification of it (wobbled, softened, posterised, lifted toward the
 * paper). A cover of paper over the washes is eaten away region by region in
 * a painter's order by blooms with wandering edges, which run fast and slow
 * as they dry and leave a tide line where they stop.
 *
 * The pointer is a wet brush. Moving a mouse over the paper paints, and so
 * does dragging a finger or pen: every mark soaks the wash through at once,
 * and the first touch in a region opens that region's bloom from the brush's
 * own point. Painting ahead pulls the whole schedule forward, so the picture
 * resolves sooner — from where the brush last touched.
 *
 * The brush is a real button: Enter or Space runs it along the next row
 * still unpainted, with the same marks and the same sound. The clock runs
 * only while painting, on screen, in a visible page. Under reduced motion
 * nothing sweeps or spreads: the sketch and each wash fade in where they
 * belong, and the picture cross-fades in.
 */
export function SketchPaint({
  alt,
  src,
  children,
  ready,
  progress,
  onReady,
  speed = 1,
  wash = 0.5,
  pencil = "hb",
  sound = false,
  disabled = false,
  className,
}: SketchPaintProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const fid = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const pencilId = `sketch-${fid}-pencil`;
  const washId = `sketch-${fid}-wash`;
  const pace = clamp(speed, 0.5, 2);
  const wet = clamp01(wash);
  const lead = LEADS[pencil] ?? LEADS.hb;
  const regions = React.useMemo(() => regionsOf(hash(alt)), [alt]);

  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const loaded = src !== undefined && loadedSrc === src;
  const [phase, setPhase] = React.useState<Phase>("painting");
  const [round, setRound] = React.useState(0);
  const isReady =
    ready ?? (src ? loaded : progress === undefined || progress >= 1);

  // A new image, or a host that takes a finished painting back to not
  // ready, starts a fresh sheet.
  const [seen, setSeen] = React.useState({ src, isReady });
  if (seen.src !== src || seen.isReady !== isReady) {
    setSeen({ src, isReady });
    if (
      seen.src !== src ||
      (seen.isReady && !isReady && phase !== "painting")
    ) {
      setPhase("painting");
      setRound((n) => n + 1);
    }
  }
  const painting = phase === "painting";

  const tone = useMotionValue(0);
  const resolve = useMotionValue(0);
  const brushX = useMotionValue(0);
  const brushY = useMotionValue(0);
  const brushOn = useMotionValue(0);
  const originX = useMotionValue(148);
  const originY = useMotionValue(111);
  const reach = useMotionValue(185);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const coverRef = React.useRef<HTMLCanvasElement | null>(null);
  const pictureRef = React.useRef<HTMLDivElement | null>(null);
  const sheet = React.useRef<Sheet>(freshSheet(296, 222, 1));
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const loop = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef<number | null>(null);
  const hover = React.useRef<Mark | null>(null);
  const stroke = React.useRef<Mark | null>(null);
  const phaseRef = React.useRef<Phase>("painting");
  const resetFor = React.useRef(0);
  const loadedFor = React.useRef<string | null>(null);
  const visible = React.useRef(true);
  const wake = React.useRef<(() => void) | null>(null);
  const refocus = React.useRef(false);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const quiet = () => {
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = null;
    loop.current?.stop();
    loop.current = null;
  };

  /** The bristles follow the brush's speed and hush when it stops. */
  const voice = (pxPerMs: number, clientX: number) => {
    if (!loop.current) {
      loop.current = audio.start("scratch", { pitch: 0.55, gain: 0 });
    }
    const k = Math.min(1, pxPerMs / 1.6);
    loop.current.set({
      pitch: r2(0.5 + 0.35 * k),
      gain: r2(0.12 + 0.33 * k),
      pan: panFrom(clientX, rootRef.current),
    });
    // A brush that stops is silent at once, and its loop is let go.
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = window.setTimeout(quiet, 80);
  };

  const ceiling = () => {
    let top = isReady ? 1 : progress !== undefined ? clamp01(progress) : LATENT;
    // An image that has not arrived has no edges to draw yet.
    if (src && !loaded) top = Math.min(top, 0.1);
    return top;
  };

  const cell = (st: Sheet) => ({ cw: st.w / COLS, ch: st.h / ROWS });
  /** The brush is 18% of the paper's width across; its ring is drawn to match. */
  const brushRadius = (st: Sheet) => Math.max(8, st.w * 0.09);
  /** How far an edge wanders, as a share of the bloom's radius. */
  const wander = 0.05 + 0.13 * wet;

  /** A bloom reaches its region's far corner, and past it as the paper is wet. */
  const fullRadius = (st: Sheet, region: Region, b: Bloom) => {
    const { cw, ch } = cell(st);
    const x0 = region.col * cw;
    const y0 = region.row * ch;
    const far = Math.max(
      Math.hypot(b.x - x0, b.y - y0),
      Math.hypot(b.x - x0 - cw, b.y - y0),
      Math.hypot(b.x - x0, b.y - y0 - ch),
      Math.hypot(b.x - x0 - cw, b.y - y0 - ch),
    );
    return (far + (0.08 + 0.26 * wet) * Math.hypot(cw, ch)) / (1 - wander);
  };

  const blobPath = (
    ctx: CanvasRenderingContext2D,
    b: Bloom,
    region: Region,
    r: number,
  ) => {
    const [p1, p2, p3] = region.phases;
    ctx.beginPath();
    for (let k = 0; k <= 56; k += 1) {
      const a = (k / 56) * Math.PI * 2;
      const rr =
        r *
        (1 +
          wander *
            (0.5 * Math.sin(3 * a + p1) +
              0.3 * Math.sin(5 * a + p2) +
              0.2 * Math.sin(9 * a + p3)));
      const x = b.x + rr * Math.cos(a);
      const y = b.y + rr * Math.sin(a);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  /** Eats the paper cover away in a bloom's shape, with a soft fringe as wet as the paper. */
  const eraseBloom = (
    ctx: CanvasRenderingContext2D,
    b: Bloom,
    region: Region,
    r: number,
    alpha: number,
  ) => {
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 0.35 * alpha;
    blobPath(ctx, b, region, r * (1.02 + 0.08 * wet));
    ctx.fill();
    ctx.globalAlpha = alpha;
    blobPath(ctx, b, region, r);
    ctx.fill();
  };

  const tideLine = (
    ctx: CanvasRenderingContext2D,
    b: Bloom,
    region: Region,
  ) => {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `${TIDE} / ${r3(0.07 + 0.17 * wet)})`;
    ctx.lineWidth = 1.1;
    blobPath(ctx, b, region, b.r * 0.985);
    ctx.stroke();
  };

  const eraseDab = (ctx: CanvasRenderingContext2D, m: Dab, r: number) => {
    const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
    g.addColorStop(0, "black");
    g.addColorStop(0.55, "black");
    g.addColorStop(1, "transparent");
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  const context = () => {
    const ctx = coverRef.current?.getContext("2d");
    if (!ctx) return null;
    const st = sheet.current;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    return ctx;
  };

  /** Lays fresh paper and eats away everything painted so far. */
  const redraw = () => {
    const canvas = coverRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    const st = sheet.current;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, st.w, st.h);
    st.blooms.forEach((b, i) => {
      const region = regions[i];
      if (!b || !region || b.r <= 0) return;
      eraseBloom(ctx, b, region, b.r, b.shown);
      if (b.tide) tideLine(ctx, b, region);
    });
    for (const m of st.dabs) if (m.r > 0) eraseDab(ctx, m, m.r);
    rootRef.current?.setAttribute("data-painted", "");
  };

  /** Opens a region's bloom from a point (px), if it is not open yet. */
  const open = (i: number, x?: number, y?: number) => {
    const st = sheet.current;
    const region = regions[i];
    if (!region || st.blooms[i]) return;
    const { cw, ch } = cell(st);
    st.blooms[i] = {
      opened: st.t,
      x: x ?? (region.col + region.fx) * cw,
      y: y ?? (region.row + region.fy) * ch,
      r: 0,
      shown: 0,
      tide: false,
    };
  };

  /** The brush lays marks from a to b (px, inside the box). */
  const paint = (ax: number, ay: number, bx: number, by: number) => {
    const st = sheet.current;
    if (phaseRef.current !== "painting") return;
    const radius = brushRadius(st);
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / (radius * 0.45)));
    const { cw, ch } = cell(st);
    for (let k = 1; k <= n; k += 1) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      if (x < 0 || y < 0 || x > st.w || y > st.h) continue;
      st.dabs.push({ x, y, at: st.t, r: 0 });
      if (st.dabs.length > MOST_DABS) st.dabs.shift();
      const col = clamp(Math.floor(x / cw), 0, COLS - 1);
      const row = clamp(Math.floor(y / ch), 0, ROWS - 1);
      const i = regions.findIndex((r) => r.col === col && r.row === row);
      if (i !== -1) open(i, x, y);
      st.lastX = x;
      st.lastY = y;
    }
    // Painting ahead pulls the schedule forward to the coverage it reached.
    const opened = st.blooms.filter(Boolean).length;
    const reached = opened > 0 ? (regions[opened - 1]?.at ?? 0) : 0;
    st.d = Math.max(st.d, Math.min(reached, ceiling()));
    wake.current?.();
  };

  const reset = () => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    quiet();
    const st = sheet.current;
    sheet.current = freshSheet(st.w, st.h, st.dpr);
    phaseRef.current = "painting";
    tone.set(0);
    resolve.set(0);
    brushOn.set(0);
    redraw();
  };

  /** Everything is laid and dry: the picture resolves through the paint. */
  const resolveNow = () => {
    if (phaseRef.current !== "painting") return;
    phaseRef.current = "resolving";
    quiet();
    const st = sheet.current;
    const ox = st.lastX;
    const oy = st.lastY;
    originX.set(r2(ox));
    originY.set(r2(oy));
    reach.set(
      r2(
        Math.max(
          Math.hypot(ox, oy),
          Math.hypot(st.w - ox, oy),
          Math.hypot(ox, st.h - oy),
          Math.hypot(st.w - ox, st.h - oy),
        ),
      ),
    );
    setPhase("resolving");
    run(
      "brush",
      animate(brushOn, 0, { duration: durations.fast, ease: easings.exit }),
    );
    run(
      "resolve",
      animate(resolve, 1, {
        duration: motionSafe ? durations.page : durations.base,
        ease: easings.enter,
        onComplete: () => {
          if (phaseRef.current !== "resolving") return;
          phaseRef.current = "done";
          setPhase("done");
          onReady?.();
        },
      }),
    );
  };

  /** One step of the painting: the schedule, the blooms and the marks. */
  const step = (dt: number): boolean => {
    const st = sheet.current;
    st.t += dt * pace;
    const top = ceiling();
    const room = top - st.d;
    if (room > 0) {
      const ease = top >= 1 ? 1 : Math.min(1, room / 0.06);
      st.d = Math.min(top, st.d + ((dt * pace) / BASE) * ease);
    }
    regions.forEach((r, i) => {
      if (st.d >= r.at) open(i);
    });
    tone.set(r3(st.d));

    const ctx = context();
    if (!rootRef.current?.hasAttribute("data-painted")) redraw();
    let settled = true;
    st.blooms.forEach((b, i) => {
      const region = regions[i];
      if (!b || !region) {
        settled = false;
        return;
      }
      const age = (st.t - b.opened) / SPREAD;
      if (age < 1) settled = false;
      const full = fullRadius(st, region, b);
      if (motionSafe) {
        const r = full * spread(age);
        if (ctx && r > b.r + 0.3) {
          eraseBloom(ctx, b, region, r, 1);
          b.r = r;
          b.shown = 1;
        }
      } else {
        // Nothing spreads: the whole wash fades through where it belongs.
        const target = smooth(0, 1, age);
        if (ctx && target > b.shown + 0.01) {
          const a = (target - b.shown) / (1 - b.shown);
          eraseBloom(ctx, b, region, full, a);
          b.shown = target >= 0.99 ? 1 : target;
          b.r = full;
        }
      }
      if (age >= 1 && !b.tide && ctx) {
        b.tide = true;
        tideLine(ctx, b, region);
      }
    });
    const radius = brushRadius(st);
    for (const m of st.dabs) {
      if (m.r >= radius) continue;
      const r = motionSafe
        ? radius * (0.4 + 0.6 * spread((st.t - m.at) / SOAK))
        : radius;
      if (ctx && r > m.r + 0.3) {
        eraseDab(ctx, m, r);
        m.r = r;
      }
      if (r < radius - 0.3) settled = false;
      else m.r = radius;
    }
    if (top >= 1 && st.d >= 1 && settled) {
      resolveNow();
      return false;
    }
    return true;
  };

  // Before paint, not after: the cover's first sizing can arrive between the
  // commit and the passive effects, and must find something to draw with.
  React.useLayoutEffect(() => {
    api.current = { reset, step, redraw };
  });

  // The clock: one frame loop while painting, on screen, in a visible page.
  React.useEffect(() => {
    if (!painting) return;
    if (resetFor.current !== round) {
      resetFor.current = round;
      api.current?.reset();
    }
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = 0;
      if (!visible.current || document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (api.current?.step(dt)) raf = window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf || !visible.current || document.hidden) return;
      last = 0;
      raf = window.requestAnimationFrame(tick);
    };
    wake.current = start;
    start();
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(raf);
      raf = 0;
      wake.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [painting, round]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      if (hush.current !== null) window.clearTimeout(hush.current);
      hush.current = null;
      loop.current?.stop();
      loop.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (painting || !refocus.current) return;
    refocus.current = false;
    pictureRef.current?.focus({ preventScroll: true });
  }, [painting]);

  const bindButton = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node) return;
    return () => {
      if (document.activeElement === node) refocus.current = true;
    };
  }, []);

  // The paper cover is sized to the sheet when it arrives and whenever the
  // sheet changes size; every bloom moves with the paper.
  const bindCover = React.useCallback((node: HTMLCanvasElement | null) => {
    coverRef.current = node;
    // The root's own ref may not be attached yet: a child's ref comes first.
    const root = node?.parentElement;
    if (!node || !root) return;
    const sizer = new ResizeObserver(() => {
      const st = sheet.current;
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 1 || h < 1) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const sx = w / st.w;
      const sy = h / st.h;
      for (const b of st.blooms) {
        if (!b) continue;
        b.x *= sx;
        b.y *= sy;
        b.r *= Math.min(sx, sy);
      }
      for (const m of st.dabs) {
        m.x *= sx;
        m.y *= sy;
      }
      st.lastX *= sx;
      st.lastY *= sy;
      st.w = w;
      st.h = h;
      st.dpr = dpr;
      node.width = Math.round(w * dpr);
      node.height = Math.round(h * dpr);
      api.current?.redraw();
      wake.current?.();
    });
    sizer.observe(root);
    return () => sizer.disconnect();
  }, []);

  // On screen or not, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) wake.current?.();
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const arrived = () => {
    if (!src || loadedFor.current === src) return;
    loadedFor.current = src;
    setLoadedSrc(src);
  };
  // An image that finished loading before hydration never fires onLoad.
  const bindImage = (node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) arrived();
  };

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const showBrush = (x: number, y: number) => {
    brushX.set(r2(x));
    brushY.set(r2(y));
    if (brushOn.get() < 1 && !anims.current.has("brushIn")) {
      run(
        "brushIn",
        animate(brushOn, 1, {
          duration: durations.fast,
          ease: easings.enter,
          onComplete: () => anims.current.delete("brushIn"),
        }),
      );
    }
  };
  const hideBrush = () => {
    anims.current.get("brushIn")?.stop();
    anims.current.delete("brushIn");
    run(
      "brush",
      animate(brushOn, 0, { duration: durations.fast, ease: easings.exit }),
    );
  };

  /** A brush that moved from where it was to (clientX, clientY). */
  const brushTo = (
    from: Mark | null,
    clientX: number,
    clientY: number,
    time: number,
  ): Mark => {
    const at = local(clientX, clientY);
    showBrush(at.x, at.y);
    if (from) {
      const moved = Math.hypot(at.x - from.x, at.y - from.y);
      if (moved < 1) return from;
      paint(from.x, from.y, at.x, at.y);
      voice(moved / Math.max(8, time - from.t), clientX);
    } else {
      paint(at.x, at.y, at.x, at.y);
    }
    return { x: at.x, y: at.y, t: time };
  };

  const drag = useDrag({
    threshold: 2,
    disabled: disabled || !painting,
    onStart: ({ point, offset, event }) => {
      hover.current = null;
      stroke.current = brushTo(
        null,
        point.x - offset.x,
        point.y - offset.y,
        event.timeStamp,
      );
    },
    onMove: ({ point, event }) => {
      stroke.current = brushTo(
        stroke.current,
        point.x,
        point.y,
        event.timeStamp,
      );
    },
    onEnd: () => {
      stroke.current = null;
      quiet();
    },
    onCancel: () => {
      stroke.current = null;
      quiet();
    },
    onTap: (event) => {
      brushTo(null, event.clientX, event.clientY, event.timeStamp);
      // A dab is heard as a touch of the bristles.
      voice(0.8, event.clientX);
    },
  });

  /** The keyboard's stroke: the brush along the next row still unpainted. */
  const sweep = () => {
    if (disabled || phaseRef.current !== "painting") return;
    const st = sheet.current;
    const row =
      Array.from({ length: ROWS }, (_, r) => r).find((r) =>
        regions.some((g, i) => g.row === r && !st.blooms[i]),
      ) ?? 1;
    const y = (row + 0.5) * (st.h / ROWS);
    const rect = rootRef.current?.getBoundingClientRect();
    let prev = { x: 0, y };
    quiet();
    loop.current = audio.start("scratch", { pitch: 0.75, gain: 0.35 });
    const finish = () => {
      quiet();
      hideBrush();
    };
    if (!motionSafe) {
      paint(0, y, st.w, y);
      showBrush(st.w / 2, y);
      hush.current = window.setTimeout(finish, 200);
      return;
    }
    run(
      "sweep",
      animate(0, 1, {
        duration: 0.5,
        ease: easings.move,
        onUpdate: (p) => {
          const x = p * st.w;
          const at = y + Math.sin(p * Math.PI * 3) * brushRadius(st) * 0.4;
          paint(prev.x, prev.y, x, at);
          showBrush(x, at);
          if (rect) {
            loop.current?.set({
              pan: panFrom(rect.left + x, rootRef.current),
            });
          }
          prev = { x, y: at };
        },
        onComplete: finish,
      }),
    );
  };

  const sketchMask = useTransform(tone, (d) => {
    if (!motionSafe) return "none";
    const f = smooth(0, SKETCHED, d);
    if (f >= 1) return "none";
    const front = r2(-30 + 160 * f);
    return `linear-gradient(115deg, black ${r2(front - 25)}%, transparent ${front}%)`;
  });
  const sketchOpacity = useTransform(
    [tone, resolve] as MotionValue<number>[],
    ([d = 0, s = 0]: number[]) =>
      r3((motionSafe ? 1 : smooth(0, SKETCHED, d)) * (1 - s)),
  );
  // The picture opens as one soft bloom from where the brush last touched.
  const pictureMask = useTransform(
    [resolve, originX, originY, reach] as MotionValue<number>[],
    ([k = 0, ox = 0, oy = 0, far = 0]: number[]) => {
      if (!motionSafe || k >= 1) return "none";
      if (k <= 0) return HIDDEN;
      const soft = Math.max(24, far * 0.35);
      const r = (far + soft) * k;
      return `radial-gradient(circle ${r2(r)}px at ${r2(ox)}px ${r2(oy)}px, black ${r2(Math.max(0, r - soft))}px, transparent ${r2(r)}px)`;
    },
  );
  const pictureOpacity = useTransform(resolve, (s) => (motionSafe ? 1 : r3(s)));

  const [g0, g1, g2] = lead.graphite;
  const lift = r2(0.16 + 0.18 * wet);
  const keep = `${r3(1.8 * lead.tooth)} 0 0 0 ${r3(1 - 0.9 * lead.tooth)}`;
  const shadeTable = `${r3(1 - lead.shade)} ${r3(1 - lead.shade * 0.55)} 1 1 1`;

  const copy = (filterId: string) => (
    <div
      className="absolute inset-0 *:size-full"
      style={{ filter: `url(#${filterId})` }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className="block object-cover"
        />
      ) : (
        children
      )}
    </div>
  );

  return (
    <div
      ref={bindRoot}
      aria-busy={phase !== "done"}
      className={cn(
        "group/sketch-paint relative isolate aspect-[4/3] w-full overflow-clip rounded-3 select-none",
        className,
      )}
      style={{ backgroundColor: PAPER }}
    >
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <filter
            id={pencilId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0 0 0 0 1"
              result="lum"
            />
            <feConvolveMatrix
              in="lum"
              order="3"
              kernelMatrix="-1 0 1 -2 0 2 -1 0 1"
              divisor={lead.divisor}
              bias="0.5"
              preserveAlpha="true"
              edgeMode="duplicate"
              result="gx"
            />
            <feConvolveMatrix
              in="lum"
              order="3"
              kernelMatrix="-1 -2 -1 0 0 0 1 2 1"
              divisor={lead.divisor}
              bias="0.5"
              preserveAlpha="true"
              edgeMode="duplicate"
              result="gy"
            />
            <feComponentTransfer in="gx" result="ax">
              <feFuncR type="table" tableValues="1 0 1" />
              <feFuncG type="table" tableValues="1 0 1" />
              <feFuncB type="table" tableValues="1 0 1" />
            </feComponentTransfer>
            <feComponentTransfer in="gy" result="ay">
              <feFuncR type="table" tableValues="1 0 1" />
              <feFuncG type="table" tableValues="1 0 1" />
              <feFuncB type="table" tableValues="1 0 1" />
            </feComponentTransfer>
            <feComposite
              in="ax"
              in2="ay"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="1"
              k4="0"
              result="edges"
            />
            <feComponentTransfer in="edges" result="lines">
              <feFuncR type="table" tableValues={lead.table} />
              <feFuncG type="table" tableValues={lead.table} />
              <feFuncB type="table" tableValues={lead.table} />
              <feFuncA type="linear" slope="0" intercept="1" />
            </feComponentTransfer>
            <feGaussianBlur
              in="lines"
              stdDeviation={lead.soften}
              result="soft"
            />
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.8"
              numOctaves="2"
              seed="5"
              result="grain"
            />
            <feColorMatrix
              in="grain"
              type="matrix"
              values={`${keep} ${keep} ${keep} 0 0 0 0 1`}
              result="keep"
            />
            <feComposite
              in="soft"
              in2="keep"
              operator="arithmetic"
              k1="1"
              k2="0"
              k3="-1"
              k4="1"
              result="broken"
            />
            <feComponentTransfer in="lum" result="shadow">
              <feFuncR type="table" tableValues={shadeTable} />
              <feFuncG type="table" tableValues={shadeTable} />
              <feFuncB type="table" tableValues={shadeTable} />
            </feComponentTransfer>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.02 0.5"
              numOctaves="1"
              seed="3"
              result="streaks"
            />
            <feColorMatrix
              in="streaks"
              type="matrix"
              values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1"
              result="grey"
            />
            <feComponentTransfer in="grey" result="hatch">
              <feFuncR type="linear" slope="-8" intercept="5.16" />
              <feFuncG type="linear" slope="-8" intercept="5.16" />
              <feFuncB type="linear" slope="-8" intercept="5.16" />
              <feFuncA type="linear" slope="0" intercept="1" />
            </feComponentTransfer>
            <feComposite
              in="shadow"
              in2="hatch"
              operator="arithmetic"
              k1="-1"
              k2="1"
              k3="1"
              k4="0"
              result="shading"
            />
            <feBlend in="broken" in2="shading" mode="multiply" result="drawn" />
            <feComponentTransfer in="drawn">
              <feFuncR type="linear" slope={r2(1 - g0)} intercept={g0} />
              <feFuncG type="linear" slope={r2(1 - g1)} intercept={g1} />
              <feFuncB type="linear" slope={r2(1 - g2)} intercept={g2} />
              <feFuncA type="linear" slope="0" intercept="1" />
            </feComponentTransfer>
          </filter>
          <filter
            id={washId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.03"
              numOctaves="2"
              seed="9"
              result="warp"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="warp"
              scale={r2(3 + 12 * wet)}
              xChannelSelector="R"
              yChannelSelector="G"
              result="wobble"
            />
            <feGaussianBlur
              in="wobble"
              stdDeviation={r2(0.6 + 2.2 * wet)}
              result="soft"
            />
            <feComponentTransfer in="soft" result="flat">
              <feFuncR type="discrete" tableValues={STEPS} />
              <feFuncG type="discrete" tableValues={STEPS} />
              <feFuncB type="discrete" tableValues={STEPS} />
            </feComponentTransfer>
            <feComposite
              in="flat"
              in2="soft"
              operator="arithmetic"
              k1="0"
              k2="0.55"
              k3="0.45"
              k4="0"
              result="laid"
            />
            <feComponentTransfer in="laid" result="light">
              <feFuncR type="linear" slope={r2(1 - lift)} intercept={lift} />
              <feFuncG type="linear" slope={r2(1 - lift)} intercept={lift} />
              <feFuncB type="linear" slope={r2(1 - lift)} intercept={lift} />
            </feComponentTransfer>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="1"
              seed="2"
              result="granules"
            />
            <feColorMatrix
              in="granules"
              type="matrix"
              values="0.16 0 0 0 0.88 0.16 0 0 0 0.88 0.16 0 0 0 0.88 0 0 0 0 1"
              result="grit"
            />
            <feBlend in="light" in2="grit" mode="multiply" />
          </filter>
        </defs>
      </svg>

      {phase === "done" ? null : (
        <>
          <div
            aria-hidden
            inert
            className="pointer-events-none invisible absolute inset-0 mix-blend-multiply will-change-transform group-data-painted/sketch-paint:visible"
          >
            {copy(washId)}
          </div>
          <canvas
            ref={bindCover}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-multiply"
            style={{ backgroundImage: TOOTH, backgroundSize: "160px 160px" }}
          />
          <motion.div
            aria-hidden
            inert
            className="pointer-events-none absolute inset-0 mix-blend-multiply will-change-transform"
            style={{ maskImage: sketchMask, opacity: sketchOpacity }}
          >
            {copy(pencilId)}
          </motion.div>
        </>
      )}

      <motion.div
        ref={pictureRef}
        role={src ? undefined : "img"}
        aria-label={src ? undefined : alt}
        tabIndex={-1}
        className="absolute inset-0 rounded-[inherit] outline-none *:size-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        style={{ maskImage: pictureMask, opacity: pictureOpacity }}
      >
        {src ? (
          // A registry component cannot import a framework's image element;
          // the picture is the host's own URL, sized by the box.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={bindImage}
            src={src}
            alt={alt}
            draggable={false}
            onLoad={arrived}
            onError={arrived}
            className="block object-cover"
          />
        ) : (
          children
        )}
      </motion.div>

      {painting ? (
        <>
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 w-[18%]"
            style={{ x: brushX, y: brushY, opacity: brushOn }}
          >
            <span
              className="absolute top-0 left-0 aspect-square w-full -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ boxShadow: BRUSH }}
            />
          </motion.span>
          <button
            ref={bindButton}
            type="button"
            aria-label="Paint ahead"
            aria-describedby={hintId}
            disabled={disabled}
            onClick={(event) => {
              // Pointer painting arrives through the brush. A click with no
              // pointer behind it — Space, Enter, assistive technology —
              // runs the brush along the next row.
              if (event.detail === 0) sweep();
            }}
            {...drag}
            onPointerMove={(event) => {
              drag.onPointerMove(event);
              // A mouse paints by moving over the paper; a press-and-drag
              // goes through the brush's drag above.
              if (
                disabled ||
                event.pointerType !== "mouse" ||
                event.buttons !== 0
              ) {
                return;
              }
              hover.current = brushTo(
                hover.current,
                event.clientX,
                event.clientY,
                event.timeStamp,
              );
            }}
            onPointerLeave={() => {
              hover.current = null;
              if (!stroke.current) {
                quiet();
                hideBrush();
              }
            }}
            className={cn(
              "absolute inset-0 size-full touch-none rounded-[inherit] outline-none select-none [-webkit-touch-callout:none]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled ? "cursor-not-allowed" : "cursor-crosshair",
            )}
          />
        </>
      ) : null}
      <p id={hintId} className="sr-only">
        Move the pointer over the paper to paint ahead, or press Enter to paint
        the next band.
      </p>
    </div>
  );
}
