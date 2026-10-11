"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type InterlaceScheme = "rows" | "grid" | "scan";
export type InterlaceTrigger = "inView" | "mount" | "button" | "manual";

export type InterlaceLoadProps = {
  /** The picture to load. Without one, a lake valley at first light is drawn in code. */
  src?: string;
  /** What the picture shows. @default "A lake valley at first light" */
  alt?: string;
  /** How the passes arrive: interlaced rows, a halving grid, or a coarse-to-fine scan. @default "grid" */
  scheme?: InterlaceScheme;
  /** How many passes, 3 to 7; the first is coarser the more there are. @default 7 */
  passes?: number;
  /** How fast the data arrives, as a multiple of a 3.2 s load. @default 1 */
  speed?: number;
  /** What starts the load: being half in view, mounting, a Load button, or the `play` prop alone. @default "inView" */
  trigger?: InterlaceTrigger;
  /** Starts the load when it turns true and clears back to waiting when it turns false; overrides `trigger`. */
  play?: boolean;
  /** A wait before the first pass, in ms. @default 200 */
  delay?: number;
  /** The faint scan line the data arrives behind. @default true */
  scanLine?: boolean;
  /** A small Load again button once the picture has landed. @default true */
  replayButton?: boolean;
  /** Fires as each pass begins, from 1. */
  onPassChange?: (pass: number, total: number) => void;
  /** Fires when the last pass lands. */
  onComplete?: () => void;
  /** A caption laid over the lower left of the picture. */
  caption?: React.ReactNode;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the frame; it fills its parent by default. */
  className?: string;
};

type Block = readonly [number, number];

/** Block sizes per pass, coarsest first; the last is always the sharp picture. */
function scheduleOf(scheme: InterlaceScheme, passes: number): Block[] {
  const p = Math.round(Math.min(7, Math.max(3, passes)));
  if (scheme === "grid") {
    // Width halves, then height: (8,8) (4,8) (4,4) (2,4) (2,2) (1,2) (1,1).
    const up: Block[] = [[1, 1]];
    while (up.length < p) {
      const [bx, by] = up[up.length - 1] ?? [1, 1];
      up.push(bx === by ? [bx, by * 2] : [by, by]);
    }
    return up.reverse();
  }
  return Array.from({ length: p }, (_, i) => {
    const b = 2 ** (p - 1 - i);
    return (scheme === "rows" ? [1, b] : [b, b]) as Block;
  });
}

/** How much of the load each pass carries: finer passes bring more data. */
function weightsOf(scheme: InterlaceScheme, blocks: Block[]): number[] {
  const raw = blocks.map(([bx, by], i) => {
    const area = 1 / (bx * by);
    if (scheme === "scan" || i === 0) return area;
    const [px, py] = blocks[i - 1] ?? [bx, by];
    return Math.max(area - 1 / (px * py), area * 0.5);
  });
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((v) => v / sum);
}

const BASE_SECONDS = 3.2;
const MIN_PASS = 0.26;
const BETWEEN = 0.12;
const LAND = 0.36;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The scene's pigments: token hues at fixed lightness, the same in either theme. */
const INK = {
  skyTop: "oklch(from var(--accent) 0.46 0.09 calc(h - 12))",
  skyMid: "oklch(from var(--danger) 0.78 0.06 calc(h + 10))",
  skyLow: "oklch(from var(--warn) 0.92 0.06 calc(h - 10))",
  sun: "oklch(from var(--warn) 0.98 0.04 h)",
  far: "oklch(from var(--accent) 0.68 0.045 calc(h + 56))",
  mid: "oklch(from var(--accent) 0.46 0.06 calc(h + 34))",
  near: "oklch(from var(--accent) 0.28 0.05 calc(h + 44))",
  pine: "oklch(from var(--success) 0.2 0.04 calc(h + 20))",
  lake: "oklch(from var(--accent) 0.36 0.07 calc(h - 20))",
  mist: "oklch(from var(--warn) 0.97 0.02 h)",
} as const;

type Ink = Record<keyof typeof INK, string>;

/** Paints the drawn scene at w × h device px. */
function paintScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ink: Ink,
) {
  const hz = h * 0.6;
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, ink.skyTop);
  sky.addColorStop(0.62, ink.skyMid);
  sky.addColorStop(1, ink.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hz + 1);
  const sx = w * 0.66;
  const sy = hz - h * 0.08;
  const glow = ctx.createRadialGradient(
    sx,
    sy,
    0,
    sx,
    sy,
    Math.max(w, h) * 0.32,
  );
  glow.addColorStop(0, ink.sun);
  glow.addColorStop(0.06, ink.sun);
  glow.addColorStop(0.07, ink.skyLow);
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, hz);
  ctx.globalAlpha = 1;
  // Three ridges, paler with distance; their peaks are spaced by the
  // frame's height so a wide frame shows more mountains, not wider ones.
  const ridge = (
    top: number,
    amp: number,
    seed: number,
    fill: string,
    rough: number,
  ) => {
    ctx.beginPath();
    ctx.moveTo(0, hz + 1);
    for (let x = 0; x <= w; x += Math.max(2, w / 260)) {
      const u = x / h;
      const shape =
        0.5 +
        0.32 * Math.sin(u * 2.3 + seed) +
        0.18 * Math.sin(u * 5.3 + seed * 2.1) +
        rough * Math.sin(u * 17 + seed * 3.3);
      ctx.lineTo(x, top + amp * (1 - clamp(shape)));
    }
    ctx.lineTo(w, hz + 1);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ridge(hz - h * 0.34, h * 0.3, 0.6, ink.far, 0.03);
  ridge(hz - h * 0.2, h * 0.19, 2.2, ink.mid, 0.05);
  ridge(hz - h * 0.08, h * 0.09, 4.1, ink.near, 0.07);
  // Pines along the far shore: fine detail only the last passes resolve.
  ctx.fillStyle = ink.pine;
  const pines = Math.round(w / 7);
  for (let i = 0; i < pines; i += 1) {
    const x = (i + hash(i, 1) * 0.8) * (w / pines);
    if (Math.abs(x - sx) < w * 0.07 && hash(i, 4) > 0.3) continue;
    const tall = h * (0.03 + 0.05 * hash(i, 2));
    const wide = tall * 0.32;
    ctx.beginPath();
    ctx.moveTo(x, hz - tall);
    ctx.lineTo(x + wide, hz + 1);
    ctx.lineTo(x - wide, hz + 1);
    ctx.closePath();
    ctx.fill();
  }
  // The lake mirrors the sky, darker, and breaks the sun into a column.
  const lake = ctx.createLinearGradient(0, hz, 0, h);
  lake.addColorStop(0, ink.skyMid);
  lake.addColorStop(0.18, ink.lake);
  lake.addColorStop(1, ink.near);
  ctx.fillStyle = lake;
  ctx.fillRect(0, hz, w, h - hz);
  const col = ctx.createLinearGradient(sx - w * 0.06, 0, sx + w * 0.06, 0);
  col.addColorStop(0, "rgba(255, 255, 255, 0)");
  col.addColorStop(0.5, ink.sun);
  col.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = col;
  const lines = Math.round((h - hz) / Math.max(2, h / 90));
  for (let i = 0; i < lines; i += 1) {
    const y = hz + 2 + i * ((h - hz) / lines);
    const spread = 0.4 + (i / lines) * 0.9;
    const len = w * 0.12 * spread * (0.5 + hash(i, 6));
    ctx.globalAlpha = 0.75 - (i / lines) * 0.5;
    ctx.fillRect(
      sx - len / 2 + (hash(i, 7) - 0.5) * w * 0.03,
      y,
      len,
      Math.max(1, h / 300),
    );
  }
  ctx.globalAlpha = 1;
  // A band of mist lying on the water.
  const mist = ctx.createLinearGradient(0, hz - h * 0.05, 0, hz + h * 0.05);
  mist.addColorStop(0, "rgba(255, 255, 255, 0)");
  mist.addColorStop(0.5, ink.mist);
  mist.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = mist;
  ctx.fillRect(0, hz - h * 0.05, w, h * 0.1);
  ctx.globalAlpha = 1;
  // Three birds, and reeds in the near water.
  ctx.strokeStyle = ink.near;
  ctx.lineWidth = Math.max(1, h / 260);
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const bx = w * (0.22 + 0.07 * i + hash(i, 8) * 0.03);
    const by = h * (0.16 + 0.05 * hash(i, 9));
    const s = h * 0.012;
    ctx.beginPath();
    ctx.moveTo(bx - s, by - s * 0.4);
    ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.6, bx, by);
    ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.6, bx + s, by - s * 0.4);
    ctx.stroke();
  }
  ctx.strokeStyle = ink.pine;
  for (let i = 0; i < 26; i += 1) {
    const x = w * (0.02 + 0.18 * hash(i, 10));
    const tall = h * (0.08 + 0.14 * hash(i, 11));
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.quadraticCurveTo(
      x + tall * 0.08,
      h - tall * 0.5,
      x + tall * 0.18 * (hash(i, 12) - 0.3),
      h - tall,
    );
    ctx.stroke();
  }
}

type Frame = {
  w: number;
  h: number;
  dpr: number;
  /** The picture at device resolution. */
  source: HTMLCanvasElement;
  /** Each pass's picture at its block resolution, one small canvas per pass. */
  levels: HTMLCanvasElement[];
  blocks: Block[];
};

type Run = {
  /** -1 waiting; 0…n-1 loading that pass; n landing; n+1 done. */
  pass: number;
  /** Seconds into the current pass (or the gap before it, when negative). */
  t: number;
  durations: number[];
};

/**
 * An image that loads the way old progressive images did. Coarse blocks
 * arrive first, then each pass fills the gaps at a finer resolution behind a
 * faint scan line that runs down the frame — the picture above the line at
 * the new resolution, below it still at the last — with the freshly arrived
 * rows briefly brighter, until the last pass lands the sharp picture with a
 * small settle. The scheme is interlaced rows, a halving grid (seven passes
 * at most, width then height) or a coarse-to-fine averaged scan.
 *
 * It starts when it is half in view, on mount, from a Load button, or from
 * the `play` prop, and offers Load again once it has landed. Canvas 2D: every
 * pass's picture is a small canvas made once per size and scaled up without
 * smoothing, so a frame is two draws, a glow band and a line. The loop runs
 * only while loading, freezes off screen or in a hidden tab, and stops when
 * done. Under reduced motion there is no line: each pass appears whole on a
 * short cross-fade, because the passes are the information.
 */
export function InterlaceLoad({
  src,
  alt = "A lake valley at first light",
  scheme = "grid",
  passes = 7,
  speed = 1,
  trigger = "inView",
  play,
  delay = 200,
  scanLine = true,
  replayButton = true,
  onPassChange,
  onComplete,
  caption,
  dpr = 2,
  className,
}: InterlaceLoadProps) {
  const motionSafe = useMotionSafe();
  const blocks = React.useMemo(
    () => scheduleOf(scheme, passes),
    [scheme, passes],
  );
  const [phase, setPhase] = React.useState<"idle" | "loading" | "done">("idle");
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const frameRef = React.useRef<Frame | null>(null);
  const picture = React.useRef<HTMLImageElement | null>(null);
  const run = React.useRef<Run>({ pass: -1, t: 0, durations: [] });
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const visible = React.useRef(false);
  const started = React.useRef(false);
  const delayTimer = React.useRef<number | null>(null);

  const latest = React.useRef({
    blocks,
    scheme,
    speed,
    motionSafe,
    scanLine,
    onPassChange,
    onComplete,
    dpr,
  });
  React.useEffect(() => {
    latest.current = {
      blocks,
      scheme,
      speed,
      motionSafe,
      scanLine,
      onPassChange,
      onComplete,
      dpr,
    };
  });

  const resolveInk = (): Ink | null => {
    const probe = probeRef.current;
    if (!probe) return null;
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const cx = c.getContext("2d", { willReadFrequently: true });
    const out = {} as Ink;
    for (const key of Object.keys(INK) as (keyof typeof INK)[]) {
      probe.style.color = INK[key];
      const computed = getComputedStyle(probe).color;
      if (cx) {
        cx.clearRect(0, 0, 1, 1);
        cx.fillStyle = "rgb(0, 0, 0)";
        cx.fillStyle = computed;
        cx.fillRect(0, 0, 1, 1);
        const d = cx.getImageData(0, 0, 1, 1).data;
        out[key] = `rgb(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0})`;
      } else out[key] = computed;
    }
    return out;
  };

  /** The picture and every pass's small canvas, for this size. */
  const build = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const l = latest.current;
    const d = Math.min(2, Math.max(0.5, l.dpr), window.devicePixelRatio || 1);
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    const W = canvas.width;
    const H = canvas.height;
    const source = frameRef.current?.source ?? document.createElement("canvas");
    source.width = W;
    source.height = H;
    const s = source.getContext("2d");
    if (!s) return;
    const img = picture.current;
    if (img && img.naturalWidth > 0) {
      const ar = W / H;
      const ir = img.naturalWidth / img.naturalHeight;
      const cw = ir > ar ? img.naturalHeight * ar : img.naturalWidth;
      const ch = ir > ar ? img.naturalHeight : img.naturalWidth / ar;
      s.drawImage(
        img,
        (img.naturalWidth - cw) / 2,
        (img.naturalHeight - ch) / 2,
        cw,
        ch,
        0,
        0,
        W,
        H,
      );
    } else {
      const ink = resolveInk();
      if (!ink) return;
      paintScene(s, W, H, ink);
    }
    // Built finest first, so the scan scheme's averaging can walk one chain
    // of halvings down: each smoothed, so a coarse block is the mean of what
    // it covers rather than one pixel of it. Rows and grid take one pixel
    // per block, as the old schemes did.
    const levels: HTMLCanvasElement[] = new Array<HTMLCanvasElement>(
      l.blocks.length,
    ).fill(source);
    let mip: HTMLCanvasElement = source;
    let mipScale = 1 / d;
    for (let i = l.blocks.length - 1; i >= 0; i -= 1) {
      const [bx, by] = l.blocks[i] ?? [1, 1];
      if (bx === 1 && by === 1) continue;
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.ceil(w / bx));
      c.height = Math.max(1, Math.ceil(h / by));
      const g = c.getContext("2d");
      if (g) {
        if (l.scheme === "scan") {
          while (mipScale * 2 <= bx && mip.width > 2) {
            const half = document.createElement("canvas");
            half.width = Math.max(1, Math.ceil(mip.width / 2));
            half.height = Math.max(1, Math.ceil(mip.height / 2));
            const hg = half.getContext("2d");
            if (!hg) break;
            hg.imageSmoothingEnabled = true;
            hg.imageSmoothingQuality = "high";
            hg.drawImage(mip, 0, 0, half.width, half.height);
            mip = half;
            mipScale *= 2;
          }
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = "high";
          g.drawImage(
            mip,
            0,
            0,
            (c.width * bx) / mipScale,
            (c.height * by) / mipScale,
            0,
            0,
            c.width,
            c.height,
          );
        } else {
          g.imageSmoothingEnabled = false;
          g.drawImage(
            source,
            0,
            0,
            c.width * bx * d,
            c.height * by * d,
            0,
            0,
            c.width,
            c.height,
          );
        }
      }
      levels[i] = c;
    }
    frameRef.current = { w, h, dpr: d, source, levels, blocks: l.blocks };
    draw();
  };

  /** Draws pass `i` (its whole frame, or its rows down to `rows` block rows). */
  const drawLevel = (
    ctx: CanvasRenderingContext2D,
    f: Frame,
    i: number,
    untilY?: number,
  ) => {
    const block = f.blocks[i];
    const level = f.levels[i];
    if (!block || !level) return;
    const [bx, by] = block;
    const d = f.dpr;
    const sharp = bx === 1 && by === 1;
    if (untilY === undefined) {
      if (sharp) ctx.drawImage(f.source, 0, 0);
      else
        ctx.drawImage(
          level,
          0,
          0,
          level.width,
          level.height,
          0,
          0,
          level.width * bx * d,
          level.height * by * d,
        );
      return;
    }
    const rows = Math.min(level.height, Math.floor(untilY / by));
    if (rows <= 0) return;
    if (sharp) {
      const hy = Math.min(f.source.height, Math.round(rows * d));
      ctx.drawImage(
        f.source,
        0,
        0,
        f.source.width,
        hy,
        0,
        0,
        f.source.width,
        hy,
      );
    } else {
      ctx.drawImage(
        level,
        0,
        0,
        level.width,
        rows,
        0,
        0,
        level.width * bx * d,
        rows * by * d,
      );
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const f = frameRef.current;
    if (!canvas || !ctx || !f) return;
    const r = run.current;
    const n = f.blocks.length;
    const d = f.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (r.pass < 0) return;
    if (r.pass >= n) {
      drawLevel(ctx, f, n - 1);
      if (r.pass === n) {
        // The landing: one small lift of light that settles away.
        const k = clamp(r.t / LAND);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.09 * (1 - k) * (1 - k);
        ctx.fillStyle = "rgb(255, 255, 255)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      return;
    }
    const ms = latest.current.motionSafe;
    const dur = r.durations[r.pass] ?? 0.5;
    if (r.pass > 0) drawLevel(ctx, f, r.pass - 1);
    if (r.t < 0) return;
    const k = clamp(r.t / dur);
    if (!ms) {
      // Reduced motion: the pass arrives whole, on a short cross-fade.
      ctx.globalAlpha = clamp(r.t / durations.fast);
      drawLevel(ctx, f, r.pass);
      ctx.globalAlpha = 1;
      return;
    }
    const y = k * f.h;
    drawLevel(ctx, f, r.pass, y);
    if (!latest.current.scanLine) return;
    const yy = y * d;
    // The fresh rows just above the line are briefly brighter.
    const band = Math.min(yy, 26 * d);
    if (band > 1) {
      const lift = ctx.createLinearGradient(0, yy - band, 0, yy);
      lift.addColorStop(0, "rgba(255, 255, 255, 0)");
      lift.addColorStop(1, "rgba(255, 255, 255, 0.14)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = lift;
      ctx.fillRect(0, yy - band, canvas.width, band);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.fillRect(0, Math.round(yy), canvas.width, Math.max(1, Math.round(d)));
    const shade = ctx.createLinearGradient(0, yy, 0, yy + 10 * d);
    shade.addColorStop(0, "rgba(255, 255, 255, 0.16)");
    shade.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, yy, canvas.width, 10 * d);
  };

  const tellPass = (pass: number) => {
    latest.current.onPassChange?.(pass + 1, latest.current.blocks.length);
  };

  const step = (dt: number) => {
    const r = run.current;
    const n = latest.current.blocks.length;
    if (r.pass < 0 || r.pass > n) return false;
    r.t += dt;
    if (r.pass === n) {
      if (r.t >= LAND) {
        r.pass = n + 1;
        setPhase("done");
        setSaid((s) => ({ n: s.n + 1, text: "Image loaded." }));
        latest.current.onComplete?.();
        return false;
      }
      return true;
    }
    const dur = r.durations[r.pass] ?? 0.5;
    const hold = latest.current.motionSafe ? 0 : BETWEEN;
    if (r.t >= dur + hold) {
      r.pass += 1;
      if (r.pass < n) {
        r.t = latest.current.motionSafe ? -BETWEEN : 0;
        tellPass(r.pass);
      } else r.t = 0;
    }
    return true;
  };

  const tick = (now: number) => {
    raf.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const dt = last.current
      ? Math.min(1 / 20, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    const going = step(dt);
    draw();
    if (going) raf.current = window.requestAnimationFrame(tick);
    else last.current = 0;
  };

  const kick = () => {
    if (raf.current) return;
    if (!visible.current || document.hidden) return;
    raf.current = window.requestAnimationFrame(tick);
  };

  const clearDelay = () => {
    if (delayTimer.current !== null) window.clearTimeout(delayTimer.current);
    delayTimer.current = null;
  };

  const begin = (wait: number) => {
    clearDelay();
    started.current = true;
    const l = latest.current;
    const weights = weightsOf(l.scheme, l.blocks);
    const pace = Math.max(0.1, l.speed);
    run.current = {
      pass: -1,
      t: 0,
      durations: weights.map(
        (wt) => Math.max(MIN_PASS, wt * BASE_SECONDS) / pace,
      ),
    };
    setPhase("loading");
    setSaid((s) => ({ n: s.n + 1, text: "Loading image." }));
    draw();
    delayTimer.current = window.setTimeout(
      () => {
        delayTimer.current = null;
        run.current.pass = 0;
        run.current.t = 0;
        tellPass(0);
        kick();
      },
      Math.max(0, wait),
    );
  };

  const reset = () => {
    clearDelay();
    started.current = false;
    run.current = { pass: -1, t: 0, durations: [] };
    setPhase("idle");
    draw();
  };

  const api = React.useRef({ build, draw, kick, begin, reset });
  React.useEffect(() => {
    api.current = { build, draw, kick, begin, reset };
  });

  // A new schedule rebuilds the passes; a new pixel ratio only redraws.
  const phaseRef = React.useRef(phase);
  React.useEffect(() => {
    phaseRef.current = phase;
  });
  React.useEffect(() => {
    if (phaseRef.current === "done") run.current.pass = blocks.length + 1;
    api.current.build();
  }, [blocks, scheme, dpr]);

  // A picture that has started arriving arrives again on a new scheme, pass
  // count or speed, so the change is seen rather than waiting for a replay.
  const schedule = `${scheme}:${blocks.length}:${speed}`;
  const shownSchedule = React.useRef(schedule);
  React.useEffect(() => {
    if (shownSchedule.current === schedule) return;
    shownSchedule.current = schedule;
    if (phaseRef.current !== "idle") api.current.begin(0);
  }, [schedule]);

  React.useEffect(() => {
    if (!src) {
      picture.current = null;
      api.current.build();
      return;
    }
    let live = true;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!live) return;
      picture.current = img;
      api.current.build();
    };
    img.src = src;
    return () => {
      live = false;
      img.onload = null;
    };
  }, [src]);

  // The play prop: true starts a load (once per turn), false clears it.
  React.useEffect(() => {
    if (play === undefined) return;
    if (play) {
      if (!started.current) api.current.begin(delay);
    } else api.current.reset();
  }, [play, delay]);

  React.useEffect(() => {
    if (play !== undefined || trigger !== "mount") return;
    if (!started.current) api.current.begin(delay);
  }, [trigger, play, delay]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = raf;
    const wait = delayTimer;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      if (wait.current !== null) window.clearTimeout(wait.current);
      wait.current = null;
      // A load cut short by an unmount starts over when the frame returns.
      started.current = false;
    };
  }, []);

  const watch = React.useRef({ trigger, play, delay });
  React.useEffect(() => {
    watch.current = { trigger, play, delay };
  });

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current.build());
    sizer.observe(node);
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (!visible.current) return;
        const wt = watch.current;
        if (
          wt.play === undefined &&
          wt.trigger === "inView" &&
          !started.current &&
          ((entry?.intersectionRatio ?? 0) >= 0.45 ||
            (entry?.intersectionRect.height ?? 0) >= window.innerHeight * 0.4)
        ) {
          api.current.begin(wt.delay);
        }
        api.current.kick();
      },
      { threshold: [0, 0.5] },
    );
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const showButton =
    phase === "idle" && play === undefined && trigger === "button";

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/interlace-load relative isolate h-full w-full overflow-clip rounded-3 bg-surface-2 [contain:paint]",
        className,
      )}
    >
      <div
        role="img"
        aria-label={alt}
        aria-busy={phase === "loading" || undefined}
        className="absolute inset-0"
      >
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, var(--hairline) 0 1px, transparent 1px 9px)",
          }}
        >
          {showButton ? null : (
            <span className="rounded-2 border border-hairline bg-card/80 px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {phase === "idle" ? "image · waiting" : "image · receiving"}
            </span>
          )}
        </div>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
      </div>
      <span ref={probeRef} aria-hidden className="hidden" />
      {caption ? (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)]">
          {caption}
        </div>
      ) : null}
      {showButton ? (
        <button
          type="button"
          onClick={() => api.current.begin(0)}
          className="absolute top-1/2 left-1/2 inline-flex h-8 -translate-x-1/2 -translate-y-1/2 items-center rounded-2 border border-hairline-strong bg-card px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Load image
        </button>
      ) : null}
      {replayButton && phase === "done" ? (
        <motion.button
          type="button"
          aria-label="Load the image again"
          onClick={() => api.current.begin(0)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.base, ease: easings.enter }}
          className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-2 border border-hairline bg-card/85 text-ink-2 transition-colors outline-none hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <RotateCcw aria-hidden className="size-4 shrink-0" />
        </motion.button>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
