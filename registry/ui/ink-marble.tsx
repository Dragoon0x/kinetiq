"use client";

import * as React from "react";

import { animate, type AnimationPlaybackControls } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type InkMarblePalette = "ocean" | "ember" | "moss";

export type InkMarbleProps = {
  /** The content on top of the paper: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many bands of ink float across the sheet, 4 to 10. @default 6 */
  bands?: number;
  /** The tool, 0 to 1: a single stylus at 0, a fine comb of nine tines at 1. @default 0.5 */
  comb?: number;
  /** The four inks on the bath. @default "ocean" */
  palette?: InkMarblePalette;
  /** The paper's accessible name, for the keyboard's way in. @default "Marbled paper" */
  label?: string;
  /** A stroke of the comb began (true) or ended (false), from the pointer or keys that made it. */
  onCombChange?: (combing: boolean) => void;
  /** The ink still drifts; it cannot be combed. */
  disabled?: boolean;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
};

type Rgb = readonly [number, number, number];
type Pt = { x: number; y: number };

type Sheet = {
  w: number;
  h: number;
  dpr: number;
  /** Cells across and down; each is CELL CSS px. */
  gw: number;
  gh: number;
  /** Where each cell's ink came from, in CSS px. Identity is a fresh sheet. */
  mx: Float32Array;
  my: Float32Array;
  /** The old map while a comb step resamples it. */
  tx: Float32Array;
  ty: Float32Array;
  /** Each cell's position down the bands this frame, in source px. */
  along: Float32Array;
  /** Per-row and per-column sway, in cells, rebuilt each frame. */
  swayX: Float32Array;
  swayY: Float32Array;
  image: ImageData;
  off: HTMLCanvasElement;
  /** The furthest any cell's ink has been pulled, in px. */
  pulled: number;
};

type Bands = {
  /**
   * RGB per quarter pixel down one repeat of the bands, prefiltered at
   * five widths (about 1, 2, 4, 8 and 16 px), so a cell that covers many
   * pixels of source shows their average instead of a stair-step.
   */
  levels: Uint8Array[];
  length: number;
  /** The bands' gentle waviness across the sheet, per px of source x. */
  wave: Float32Array;
};

/** Pigments at fixed lightness: ink is ink in either theme. */
const INKS: Record<
  InkMarblePalette,
  readonly [string, string, string, string]
> = {
  ocean: [
    "oklch(0.4 0.1 250)",
    "oklch(0.63 0.085 205)",
    "oklch(0.86 0.045 85)",
    "oklch(0.53 0.06 255)",
  ],
  ember: [
    "oklch(0.42 0.13 25)",
    "oklch(0.68 0.15 48)",
    "oklch(0.83 0.11 85)",
    "oklch(0.4 0.08 350)",
  ],
  moss: [
    "oklch(0.4 0.07 150)",
    "oklch(0.6 0.09 122)",
    "oklch(0.85 0.07 105)",
    "oklch(0.46 0.05 65)",
  ],
};

/**
 * The inks live on the canvas element as its own colours, mixed a little
 * into the page so the sheet sits in its theme, and are read back from its
 * computed style. Mixes are in oklab, which keeps each ink's hue.
 */
function colours(inks: readonly string[]): React.CSSProperties {
  const ink = (i: number) =>
    `color-mix(in oklab, ${inks[i] ?? "gray"} 86%, var(--background))`;
  return {
    color: ink(0),
    borderTopColor: ink(1),
    borderRightColor: ink(2),
    borderBottomColor: ink(3),
    borderLeftColor:
      "color-mix(in oklab, var(--background) 88%, var(--foreground))",
    outlineColor: "var(--foreground)",
    backgroundColor: ink(0),
  };
}

/** What stands in for the sheet before the canvas has painted it. */
const standIn = (c: React.CSSProperties) =>
  `repeating-linear-gradient(180deg, ${String(c.color)} 0 18px, ${String(c.borderLeftColor)} 18px 20px, ${String(c.borderTopColor)} 20px 38px, ${String(c.borderLeftColor)} 38px 40px, ${String(c.borderRightColor)} 40px 58px, ${String(c.borderLeftColor)} 58px 60px, ${String(c.borderBottomColor)} 60px 78px, ${String(c.borderLeftColor)} 78px 80px)`;

/** CSS px per cell of the map and of the drawn sheet. */
const CELL = 2;
/** Prefiltered band tables, finest first. */
const LEVELS = 5;
/** The ink relaxes back to its bands with this time constant, in seconds. */
const RELAX = 7;
/** Reduced motion: the marks halve in still steps this far apart, in ms. */
const SETTLE_STEP = 1600;
const KEY_STEP = 24;
const PASS = 0.8;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const mod = (v: number, m: number) => ((v % m) + m) % m;

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same bands every time. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

/**
 * The bands, laid out once: seeded widths around the mean, the four inks in
 * turn, a vein of paper at every boundary, and a one-pixel blur so the
 * edges are smooth when the sheet is scaled up.
 */
function layBands(
  count: number,
  period: number,
  width: number,
  inks: readonly Rgb[],
  vein: Rgb,
  seed: number,
): Bands {
  const rand = seeded(seed);
  const n = clamp(Math.round(count), 2, 16);
  const sizes: number[] = [];
  for (let k = 0; k < n; k += 1) sizes.push(0.65 + 0.7 * rand());
  const total = sizes.reduce((a, b) => a + b, 0);
  const edges = [0];
  for (const s of sizes) {
    edges.push((edges[edges.length - 1] ?? 0) + (s / total) * period);
  }
  const start = Math.floor(rand() * 4);
  const veinHalf = clamp((period / n) * 0.035, 0.6, 1.3);
  const length = Math.max(8, Math.round(period * 4));
  const hard = new Float32Array(length * 3);
  let band = 0;
  for (let e = 0; e < length; e += 1) {
    const y = ((e + 0.5) / length) * period;
    while (band < n - 1 && y >= (edges[band + 1] ?? period)) band += 1;
    const top = edges[band] ?? 0;
    const bottom = edges[band + 1] ?? period;
    const near = Math.min(y - top, bottom - y);
    const c =
      near < veinHalf ? vein : (inks[(band + start) % 4] ?? inks[0] ?? vein);
    hard[e * 3] = c[0];
    hard[e * 3 + 1] = c[1];
    hard[e * 3 + 2] = c[2];
  }
  // Box filters by running sums round the repeat, one per footprint.
  const sums = new Float64Array((length + 1) * 3);
  for (let e = 0; e < length; e += 1) {
    for (let c = 0; c < 3; c += 1) {
      sums[(e + 1) * 3 + c] = (sums[e * 3 + c] ?? 0) + (hard[e * 3 + c] ?? 0);
    }
  }
  const total3 = [0, 1, 2].map((c) => sums[length * 3 + c] ?? 0);
  /** The sum of entries [0, e) for any e, wrapping round the repeat. */
  const upTo = (e: number, c: number) => {
    const turns = Math.floor(e / length);
    const rest = e - turns * length;
    return turns * (total3[c] ?? 0) + (sums[rest * 3 + c] ?? 0);
  };
  const levels: Uint8Array[] = [];
  for (let l = 0; l < LEVELS; l += 1) {
    const reach = 2 << l;
    const span = reach * 2 + 1;
    const table = new Uint8Array(length * 3);
    for (let e = 0; e < length; e += 1) {
      for (let c = 0; c < 3; c += 1) {
        const sum =
          upTo(e + reach + 1 + length, c) - upTo(e - reach + length, c);
        table[e * 3 + c] = Math.round(sum / span);
      }
    }
    levels.push(table);
  }
  // The bands are not ruled: two slow waves across, whole cycles over the
  // sheet's width so the pattern meets itself where ink wraps round.
  const wide = Math.max(1, Math.round(width));
  const wave = new Float32Array(wide);
  const amp = period / n;
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  for (let x = 0; x < wide; x += 1) {
    const u = (x / wide) * Math.PI * 2;
    wave[x] = amp * (0.22 * Math.sin(u + p1) + 0.09 * Math.sin(3 * u + p2));
  }
  return { levels, length, wave };
}

/** The props a backdrop must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Api = {
  resize: () => void;
  paint: () => void;
  kick: () => void;
};

type Hand = {
  x: number;
  y: number;
  present: boolean;
  combing: boolean;
  source: "pointer" | "key" | null;
  /** The keyboard's comb shows firmly; a hovering one faintly. */
  ring: boolean;
  /** The way the comb last travelled: its tines stand across it. */
  dx: number;
  dy: number;
};

/**
 * A background that is a sheet of marbled paper still on the bath: bands of
 * ink floating on the size, with the content on top in its own layer. A
 * drag pulls a comb through the ink — its tines stand across the stroke,
 * from a single stylus to a fine comb of nine — and the ink near each tine
 * goes with it, so a stroke across the bands feathers them into chevrons and
 * a second one back makes them a nonpareil. Left alone the ink relaxes back
 * into its bands over half a minute, and while the sheet is on screen it
 * sways a few pixels on slow currents.
 *
 * The sheet is a map from each 2 px cell to where its ink came from; the
 * comb resamples the map, never the colours, and the bands are looked up
 * through it into one ImageData scaled up smooth. Inks are the canvas's own
 * computed colours, re-read when the theme changes. The keyboard's way in is
 * a transparent button behind the content: arrow keys comb from the hand,
 * Enter or Space combs a full pass across. Under reduced motion nothing
 * sways and the marks settle back in still steps; combing still redraws as
 * the hand moves.
 */
export function InkMarble({
  children,
  bands = 6,
  comb = 0.5,
  palette = "ocean",
  label = "Marbled paper",
  onCombChange,
  disabled = false,
  className,
}: InkMarbleProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const seed = hashText(uid);
  const count = clamp(Math.round(bands), 4, 10);
  const tool = clamp(comb, 0, 1);
  const carriers = colours(INKS[palette] ?? INKS.ocean);

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = React.useRef<HTMLButtonElement | null>(null);
  const sheet = React.useRef<Sheet | null>(null);
  const laid = React.useRef<Bands | null>(null);
  const marker = React.useRef("currentColor");
  const reader = React.useRef<((colour: string) => Rgb) | null>(null);
  const hand = React.useRef<Hand>({
    x: 0,
    y: 0,
    present: false,
    combing: false,
    source: null,
    ring: false,
    dx: 1,
    dy: 0,
  });
  /** Hand positions not yet combed into the ink. */
  const queue = React.useRef<Pt[]>([]);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const clock = React.useRef(0);
  const drawnAt = React.useRef(0);
  const visible = React.useRef(true);
  const dirty = React.useRef(true);
  const settleTimer = React.useRef<number | null>(null);
  const pass = React.useRef<AnimationPlaybackControls | null>(null);
  const lastKey = React.useRef(0);
  /** Stops listening for the pressing pointer's release. */
  const unlisten = React.useRef<(() => void) | null>(null);
  const latest = React.useRef({
    count,
    tool,
    motionSafe,
    disabled,
    onCombChange,
  });
  React.useEffect(() => {
    latest.current = { count, tool, motionSafe, disabled, onCombChange };
  });

  /** The comb for the current tool: how many tines, how far apart, how sharp. */
  const combOf = () => {
    const t = latest.current.tool;
    return {
      tines: 1 + Math.round(t * 8),
      spacing: 26 - 14 * t,
      sigma: 5 - 1.5 * t,
    };
  };

  const layOut = () => {
    const s = sheet.current;
    const canvas = canvasRef.current;
    if (!s || !canvas) return;
    if (!reader.current) reader.current = rgbReader();
    const read = reader.current;
    const style = getComputedStyle(canvas);
    const inks = [
      read(style.color),
      read(style.borderTopColor),
      read(style.borderRightColor),
      read(style.borderBottomColor),
    ];
    marker.current = style.outlineColor;
    laid.current = layBands(
      latest.current.count,
      s.h,
      s.w,
      inks,
      read(style.borderLeftColor),
      seed,
    );
  };

  /** The sheet as it stands: every cell looked up through the map. */
  const draw = () => {
    const s = sheet.current;
    const b = laid.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const offCtx = s?.off.getContext("2d");
    if (!s || !b || !canvas || !ctx || !offCtx) return;
    if (!visible.current) {
      dirty.current = true;
      return;
    }
    dirty.current = false;
    const { gw, gh, mx, my, swayX, swayY, image, dpr } = s;
    const data = image.data;
    const { levels, length, wave } = b;
    const wide = wave.length;
    const along = s.along;
    const swaying = latest.current.motionSafe;
    if (swaying) {
      // Slow currents: whole-sheet sway of a couple of pixels, different
      // across and down, so the ink floats rather than slides.
      const t = clock.current;
      for (let j = 0; j < gh; j += 1) {
        const y = j * CELL;
        swayX[j] =
          (1.6 * Math.sin(y / 61 + t * 0.61) +
            0.9 * Math.sin(y / 23 - t * 0.37 + 1.3)) /
          CELL;
      }
      for (let i = 0; i < gw; i += 1) {
        const x = i * CELL;
        swayY[i] =
          (1.8 * Math.sin(x / 97 - t * 0.53 + 0.4) +
            0.8 * Math.sin(x / 41 + t * 0.29 + 2.1)) /
          CELL;
      }
    }
    for (let j = 0; j < gh; j += 1) {
      const sx0 = swaying ? (swayX[j] ?? 0) : 0;
      for (let i = 0; i < gw; i += 1) {
        const k = j * gw + i;
        let sx: number;
        let sy: number;
        if (swaying) {
          // Bilinear through the map at the swayed spot; past the edge the
          // ink is untouched, so the map is the identity there.
          const qx = i + sx0;
          const qy = j + (swayY[i] ?? 0);
          const fx = Math.floor(qx);
          const fy = Math.floor(qy);
          if (fx < 0 || fy < 0 || fx >= gw - 1 || fy >= gh - 1) {
            sx = (qx + 0.5) * CELL;
            sy = (qy + 0.5) * CELL;
          } else {
            const ax = qx - fx;
            const ay = qy - fy;
            const k00 = fy * gw + fx;
            const k10 = k00 + 1;
            const k01 = k00 + gw;
            const k11 = k01 + 1;
            const top = (mx[k00] ?? 0) * (1 - ax) + (mx[k10] ?? 0) * ax;
            const bot = (mx[k01] ?? 0) * (1 - ax) + (mx[k11] ?? 0) * ax;
            sx = top + (bot - top) * ay;
            const topY = (my[k00] ?? 0) * (1 - ax) + (my[k10] ?? 0) * ax;
            const botY = (my[k01] ?? 0) * (1 - ax) + (my[k11] ?? 0) * ax;
            sy = topY + (botY - topY) * ay;
          }
        } else {
          sx = mx[k] ?? 0;
          sy = my[k] ?? 0;
        }
        along[k] = sy + (wave[mod(Math.floor(sx), wide)] ?? 0);
      }
    }
    // Each cell takes the band colour averaged over the source it covers:
    // where the comb has squeezed many bands into one cell they blend, as
    // ink that fine does, instead of flickering between them.
    for (let j = 0; j < gh; j += 1) {
      for (let i = 0; i < gw; i += 1) {
        const k = j * gw + i;
        const a = along[k] ?? 0;
        const across = Math.abs((along[i < gw - 1 ? k + 1 : k - 1] ?? a) - a);
        const down = Math.abs((along[j < gh - 1 ? k + gw : k - gw] ?? a) - a);
        const reach = Math.max(across, down) / 1.5;
        const level =
          reach <= 1 ? 0 : Math.min(LEVELS - 1.001, Math.log2(reach));
        const l0 = Math.floor(level);
        const f = level - l0;
        const lo = levels[l0] as Uint8Array;
        const hi = (levels[l0 + 1] ?? lo) as Uint8Array;
        const e = mod(Math.floor(a * 4), length) * 3;
        const o = k * 4;
        data[o] = (lo[e] ?? 0) + ((hi[e] ?? 0) - (lo[e] ?? 0)) * f;
        data[o + 1] =
          (lo[e + 1] ?? 0) + ((hi[e + 1] ?? 0) - (lo[e + 1] ?? 0)) * f;
        data[o + 2] =
          (lo[e + 2] ?? 0) + ((hi[e + 2] ?? 0) - (lo[e + 2] ?? 0)) * f;
        data[o + 3] = 255;
      }
    }
    offCtx.putImageData(image, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(s.off, 0, 0, gw, gh, 0, 0, gw * CELL, gh * CELL);

    // The comb, so a stranger knows what is in their hand before pressing.
    const hd = hand.current;
    if (hd.present && !latest.current.disabled) {
      const { tines, spacing } = combOf();
      const nx = -hd.dy;
      const ny = hd.dx;
      const half = ((tines - 1) / 2) * spacing;
      const back = 7;
      ctx.globalAlpha = hd.combing || hd.ring ? 0.85 : 0.4;
      ctx.strokeStyle = marker.current;
      ctx.fillStyle = marker.current;
      ctx.lineWidth = 1.25;
      ctx.lineCap = "round";
      ctx.beginPath();
      const bx = hd.x - hd.dx * back;
      const by = hd.y - hd.dy * back;
      ctx.moveTo(bx - nx * (half + 3), by - ny * (half + 3));
      ctx.lineTo(bx + nx * (half + 3), by + ny * (half + 3));
      for (let t = 0; t < tines; t += 1) {
        const o = t * spacing - half;
        ctx.moveTo(bx + nx * o, by + ny * o);
        ctx.lineTo(hd.x + nx * o, hd.y + ny * o);
      }
      ctx.stroke();
      for (let t = 0; t < tines; t += 1) {
        const o = t * spacing - half;
        ctx.beginPath();
        ctx.arc(hd.x + nx * o, hd.y + ny * o, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    rootRef.current?.setAttribute("data-painted", "");
  };

  /**
   * One short step of the comb, a to b (≤ one cell): the ink near each tine
   * goes along with it. The map is resampled from itself at the displaced
   * spots, so ink is carried, never repainted.
   */
  const combStep = (a: Pt, b: Pt) => {
    const s = sheet.current;
    if (!s) return;
    const { gw, gh, mx, my, tx, ty } = s;
    const ax = a.x / CELL - 0.5;
    const ay = a.y / CELL - 0.5;
    const ddx = (b.x - a.x) / CELL;
    const ddy = (b.y - a.y) / CELL;
    const len = Math.hypot(ddx, ddy);
    if (len < 1e-3) return;
    const mxu = ddx / len;
    const myu = ddy / len;
    const nxu = -myu;
    const nyu = mxu;
    const { tines, spacing, sigma } = combOf();
    const sp = spacing / CELL;
    const sg = sigma / CELL;
    const sg2 = sg * 2.2;
    const inv1 = 1 / (sg * sg);
    const inv2 = 1 / (sg2 * sg2);
    const mid = (tines - 1) / 2;
    const half = mid * sp + 3 * sg2;
    const pad = 3 * sg2 + len;
    const xs = [
      ax + nxu * half,
      ax - nxu * half,
      ax + ddx + nxu * half,
      ax + ddx - nxu * half,
    ];
    const ys = [
      ay + nyu * half,
      ay - nyu * half,
      ay + ddy + nyu * half,
      ay + ddy - nyu * half,
    ];
    const i0 = clamp(Math.floor(Math.min(...xs) - pad), 0, gw - 1);
    const i1 = clamp(Math.ceil(Math.max(...xs) + pad), 0, gw - 1);
    const j0 = clamp(Math.floor(Math.min(...ys) - pad), 0, gh - 1);
    const j1 = clamp(Math.ceil(Math.max(...ys) + pad), 0, gh - 1);
    // The old map, a little wider than the box, for the resample to read.
    const ci0 = Math.max(0, i0 - 2);
    const ci1 = Math.min(gw - 1, i1 + 2);
    const cj0 = Math.max(0, j0 - 2);
    const cj1 = Math.min(gh - 1, j1 + 2);
    for (let j = cj0; j <= cj1; j += 1) {
      const row = j * gw;
      tx.set(mx.subarray(row + ci0, row + ci1 + 1), row + ci0);
      ty.set(my.subarray(row + ci0, row + ci1 + 1), row + ci0);
    }
    let pulled = s.pulled;
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const rx = i - ax;
        const ry = j - ay;
        const t = rx * mxu + ry * myu;
        const o = rx * nxu + ry * nyu;
        const da = t < 0 ? -t : t > len ? t - len : 0;
        const kf = o / sp + mid;
        const k0 = clamp(Math.floor(kf), 0, tines - 1);
        const k1 = Math.min(tines - 1, k0 + 1);
        const d0 = o - (k0 - mid) * sp;
        const a2 = da * da;
        let wgt =
          Math.exp(-(a2 + d0 * d0) * inv1) +
          0.22 * Math.exp(-(a2 + d0 * d0) * inv2);
        if (k1 !== k0) {
          const d1 = o - (k1 - mid) * sp;
          wgt +=
            Math.exp(-(a2 + d1 * d1) * inv1) +
            0.22 * Math.exp(-(a2 + d1 * d1) * inv2);
        }
        if (wgt < 0.002) continue;
        wgt = Math.min(1, wgt);
        const qx = i - ddx * wgt;
        const qy = j - ddy * wgt;
        const fx = Math.floor(qx);
        const fy = Math.floor(qy);
        const k = j * gw + i;
        let sx: number;
        let sy: number;
        if (fx < 0 || fy < 0 || fx >= gw - 1 || fy >= gh - 1) {
          sx = (qx + 0.5) * CELL;
          sy = (qy + 0.5) * CELL;
        } else {
          const ux = qx - fx;
          const uy = qy - fy;
          const k00 = fy * gw + fx;
          const k10 = k00 + 1;
          const k01 = k00 + gw;
          const k11 = k01 + 1;
          const top = (tx[k00] ?? 0) * (1 - ux) + (tx[k10] ?? 0) * ux;
          const bot = (tx[k01] ?? 0) * (1 - ux) + (tx[k11] ?? 0) * ux;
          sx = top + (bot - top) * uy;
          const topY = (ty[k00] ?? 0) * (1 - ux) + (ty[k10] ?? 0) * ux;
          const botY = (ty[k01] ?? 0) * (1 - ux) + (ty[k11] ?? 0) * ux;
          sy = topY + (botY - topY) * uy;
        }
        mx[k] = sx;
        my[k] = sy;
        const off =
          Math.abs(sx - (i + 0.5) * CELL) + Math.abs(sy - (j + 0.5) * CELL);
        if (off > pulled) pulled = off;
      }
    }
    s.pulled = pulled;
  };

  /** Combs the queued hand path into the ink, a cell at a time. */
  const combQueued = (limit: number) => {
    const q = queue.current;
    let steps = 0;
    while (q.length > 1 && steps < limit) {
      const a = q[0] as Pt;
      const b = q[1] as Pt;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 0.01) {
        q.shift();
        continue;
      }
      const run = Math.min(d, CELL);
      const to = {
        x: a.x + ((b.x - a.x) * run) / d,
        y: a.y + ((b.y - a.y) * run) / d,
      };
      combStep(a, to);
      steps += 1;
      if (run >= d - 1e-6) q.shift();
      else q[0] = to;
    }
    return steps;
  };

  /** The ink eases back toward its bands by `share` of the way. */
  const relax = (share: number) => {
    const s = sheet.current;
    if (!s || s.pulled < 0.05) return;
    const { gw, gh, mx, my } = s;
    let pulled = 0;
    for (let j = 0; j < gh; j += 1) {
      const y = (j + 0.5) * CELL;
      for (let i = 0; i < gw; i += 1) {
        const k = j * gw + i;
        const x = (i + 0.5) * CELL;
        const nx = (mx[k] ?? x) + (x - (mx[k] ?? x)) * share;
        const ny = (my[k] ?? y) + (y - (my[k] ?? y)) * share;
        mx[k] = nx;
        my[k] = ny;
        const off = Math.abs(nx - x) + Math.abs(ny - y);
        if (off > pulled) pulled = off;
      }
    }
    if (pulled < 0.05) {
      for (let j = 0; j < gh; j += 1) {
        for (let i = 0; i < gw; i += 1) {
          mx[j * gw + i] = (i + 0.5) * CELL;
          my[j * gw + i] = (j + 0.5) * CELL;
        }
      }
      pulled = 0;
    }
    s.pulled = pulled;
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const safe = latest.current.motionSafe;
    const dt = last.current
      ? Math.min(1 / 20, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    const combed = combQueued(safe ? 160 : 100000);
    if (!safe) {
      draw();
      last.current = 0;
      if (combed > 0 || queue.current.length > 1) scheduleSettle();
      return;
    }
    clock.current += dt;
    relax(1 - Math.exp(-dt / RELAX));
    // At rest the drift is slow enough for thirty frames a second.
    const busy = combed > 0 || hand.current.combing || queue.current.length > 1;
    if (busy || now - drawnAt.current > 31) {
      drawnAt.current = now;
      draw();
    }
    frame.current = window.requestAnimationFrame(tick);
  };

  const kick = () => {
    if (frame.current || !sheet.current) return;
    if (!visible.current || document.hidden) {
      dirty.current = true;
      return;
    }
    frame.current = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: the marks halve in still steps, paused while unseen. */
  const scheduleSettle = () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      const s = sheet.current;
      if (!s || latest.current.motionSafe) return;
      if (hand.current.combing || !visible.current || document.hidden) {
        scheduleSettle();
        return;
      }
      relax(s.pulled < 1 ? 1 : 0.5);
      draw();
      if (s.pulled > 0) scheduleSettle();
    }, SETTLE_STEP);
  };

  const paint = () => {
    layOut();
    draw();
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const was = sheet.current;
    if (was && was.w === w && was.h === h && was.dpr === dpr) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const gw = Math.ceil(w / CELL);
    const gh = Math.ceil(h / CELL);
    const off = document.createElement("canvas");
    off.width = gw;
    off.height = gh;
    const mx = new Float32Array(gw * gh);
    const my = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j += 1) {
      for (let i = 0; i < gw; i += 1) {
        mx[j * gw + i] = (i + 0.5) * CELL;
        my[j * gw + i] = (j + 0.5) * CELL;
      }
    }
    sheet.current = {
      w,
      h,
      dpr,
      gw,
      gh,
      mx,
      my,
      tx: new Float32Array(gw * gh),
      ty: new Float32Array(gw * gh),
      along: new Float32Array(gw * gh),
      swayX: new Float32Array(gh),
      swayY: new Float32Array(gw),
      image: new ImageData(gw, gh),
      off,
      pulled: 0,
    };
    queue.current = [];
    paint();
    kick();
  };

  const api = React.useRef<Api>({ resize, paint, kick });
  React.useEffect(() => {
    api.current = { resize, paint, kick };
  });

  // New bands are laid out; the comb's marks stay where they are.
  React.useEffect(() => {
    api.current.paint();
    api.current.kick();
  }, [count, tool, motionSafe]);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const rect = root?.getBoundingClientRect();
    if (!root || !rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left - root.clientLeft,
      y: clientY - rect.top - root.clientTop,
    };
  };

  const stopPass = () => {
    pass.current?.stop();
    pass.current = null;
  };

  const startStroke = (source: "pointer" | "key") => {
    const hd = hand.current;
    if (hd.combing) return;
    hd.combing = true;
    hd.source = source;
    latest.current.onCombChange?.(true);
  };

  const endStroke = () => {
    const hd = hand.current;
    if (!hd.combing) return;
    hd.combing = false;
    rootRef.current?.removeAttribute("data-pressing");
    kick();
    latest.current.onCombChange?.(false);
  };

  /** The hand travels to (x, y); combing, it pulls the ink with it. */
  const travel = (x: number, y: number) => {
    const hd = hand.current;
    const dx = x - hd.x;
    const dy = y - hd.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.5) {
      hd.dx = dx / d;
      hd.dy = dy / d;
    }
    hd.x = x;
    hd.y = y;
    hd.present = true;
    if (hd.combing) queue.current.push({ x, y });
    kick();
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, offset }) => {
      stopPass();
      const from = local(point.x - offset.x, point.y - offset.y);
      const hd = hand.current;
      hd.x = from.x;
      hd.y = from.y;
      hd.ring = false;
      queue.current = [from];
      startStroke("pointer");
    },
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      travel(at.x, at.y);
    },
    onEnd: ({ event }) => {
      endStroke();
      // A finger that lifts takes the comb with it; a mouse hovers on.
      if (event.pointerType === "touch") hand.current.present = false;
    },
    onCancel: () => {
      endStroke();
      hand.current.present = false;
    },
    onTap: () => {
      rootRef.current?.removeAttribute("data-pressing");
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (hit && hit !== surfaceRef.current && rootRef.current?.contains(hit))
      return;
    rootRef.current?.setAttribute("data-pressing", "");
    drag.onPointerDown(event);
    // A press that never became a stroke still gives text selection back
    // when it ends, wherever it ends.
    unlisten.current?.();
    const id = event.pointerId;
    const release = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      unlisten.current?.();
      if (!hand.current.combing) {
        rootRef.current?.removeAttribute("data-pressing");
      }
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    unlisten.current = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      unlisten.current = null;
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    const hd = hand.current;
    if (hd.combing || disabled || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    hd.source = "pointer";
    hd.ring = false;
    travel(at.x, at.y);
  };

  /** One pass of the comb right across the sheet, through the hand. */
  const fullPass = () => {
    const s = sheet.current;
    if (!s || latest.current.disabled) return;
    stopPass();
    const hd = hand.current;
    if (!hd.present) {
      hd.x = s.w / 2;
      hd.y = s.h / 2;
      hd.present = true;
    }
    const ux = hd.dx;
    const uy = hd.dy;
    // From where the line through the hand enters the sheet to where it
    // leaves it, a little past each edge.
    const tIn = Math.max(
      ux > 0 ? -hd.x / ux : ux < 0 ? (s.w - hd.x) / ux : -Infinity,
      uy > 0 ? -hd.y / uy : uy < 0 ? (s.h - hd.y) / uy : -Infinity,
    );
    const tOut = Math.min(
      ux > 0 ? (s.w - hd.x) / ux : ux < 0 ? -hd.x / ux : Infinity,
      uy > 0 ? (s.h - hd.y) / uy : uy < 0 ? -hd.y / uy : Infinity,
    );
    const from = { x: hd.x + ux * (tIn - 6), y: hd.y + uy * (tIn - 6) };
    const to = { x: hd.x + ux * (tOut + 6), y: hd.y + uy * (tOut + 6) };
    hd.source = "key";
    hd.x = from.x;
    hd.y = from.y;
    queue.current = [from];
    startStroke("key");
    const done = () => {
      pass.current = null;
      endStroke();
      setSaid((v) => ({ n: v.n + 1, text: "Combed across the paper." }));
    };
    if (!latest.current.motionSafe) {
      travel(to.x, to.y);
      done();
      return;
    }
    pass.current = animate(0, 1, {
      duration: PASS,
      ease: easings.linear,
      onUpdate: (t) =>
        travel(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t),
      onComplete: done,
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const s = sheet.current;
    const hd = hand.current;
    if (!s || (hd.combing && hd.source === "pointer")) return;
    const stepBy = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    lastKey.current = event.timeStamp;
    if (move) {
      event.preventDefault();
      stopPass();
      if (!hd.present) {
        hd.x = s.w / 2;
        hd.y = s.h / 2;
        hd.present = true;
      }
      hd.ring = true;
      hd.dx = move[0];
      hd.dy = move[1];
      const x = clamp(hd.x + move[0] * stepBy, 0, s.w);
      const y = clamp(hd.y + move[1] * stepBy, 0, s.h);
      // A held arrow keeps one stroke going; only a fresh one starts the
      // path again from the hand.
      if (!hd.combing) queue.current = [{ x: hd.x, y: hd.y }];
      startStroke("key");
      travel(x, y);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (event.repeat) return;
      hd.ring = true;
      fullPass();
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    lastKey.current = event.timeStamp;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      return;
    }
    if (event.key.startsWith("Arrow") && !pass.current) endStroke();
  };

  const onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    const s = sheet.current;
    if (!s || disabled || !event.currentTarget.matches(":focus-visible"))
      return;
    const hd = hand.current;
    if (!hd.present) {
      hd.x = s.w / 2;
      hd.y = s.h / 2;
    }
    hd.present = true;
    hd.ring = true;
    hd.source = "key";
    kick();
  };

  const onBlur = () => {
    const hd = hand.current;
    if (hd.source !== "key") return;
    stopPass();
    endStroke();
    hd.present = false;
    hd.ring = false;
    kick();
  };

  // A click with no pointer and no key behind it — assistive technology —
  // combs a full pass, the same as Enter.
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 || disabled) return;
    if (event.timeStamp - lastKey.current < 500) return;
    fullPass();
  };

  React.useEffect(() => {
    if (!disabled) return;
    pass.current?.stop();
    pass.current = null;
    const hd = hand.current;
    const was = hd.combing;
    hd.combing = false;
    hd.present = false;
    hd.ring = false;
    rootRef.current?.removeAttribute("data-pressing");
    api.current.kick();
    if (was) latest.current.onCombChange?.(false);
  }, [disabled]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        if (dirty.current) api.current.paint();
        api.current.kick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frame;
    const settle = settleTimer;
    const running = pass;
    const listening = unlisten;
    return () => {
      listening.current?.();
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      if (settle.current !== null) window.clearTimeout(settle.current);
      settle.current = null;
      running.current?.stop();
      running.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        if (dirty.current) api.current.paint();
        api.current.kick();
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // A new theme or palette changes the canvas's colours; the 1ms colour
  // transition says when, and the bands are laid out again from them.
  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current.paint();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        const hd = hand.current;
        if (hd.source === "pointer" && !hd.combing) {
          hd.present = false;
          api.current.kick();
        }
      }}
      className={cn(
        "group/ink-marble relative isolate h-full w-full overflow-clip data-pressing:select-none",
        // The comb travels in any direction; a disabled sheet gives the page
        // its scrolling back.
        disabled ? "touch-auto" : "touch-none",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColors}
        className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        style={carriers}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-painted/ink-marble:hidden"
        style={{ backgroundImage: standIn(carriers) }}
      />
      <div className="relative z-10 size-full">{children}</div>
      <button
        ref={surfaceRef}
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        Drag across the paper to comb the ink; it relaxes by itself. Arrow keys
        comb from where your hand is; Enter or Space combs a full pass.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
