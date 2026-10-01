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
import {
  rubberband,
  useDrag,
  type DragInfo,
} from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EtchRevealFrame = "red" | "teal" | "ink";

export type EtchRevealProps = {
  /** What the picture shows. Always its accessible name. */
  alt: string;
  /** The picture's address. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: an inline SVG or an image. */
  children?: React.ReactNode;
  /** Controlled: the picture may show. Uncontrolled, it is ready once it exists and the line is drawn. */
  ready?: boolean;
  /** 0 to 1: how much of the line may be drawn while not ready. */
  progress?: number;
  /** Fires once the screen has resolved into the picture. */
  onReady?: () => void;
  /** How fast the stylus draws by itself, 0.5 to 2. @default 1 */
  speed?: number;
  /** The toy's colour. @default "teal" */
  frame?: EtchRevealFrame;
  /** The stylus's line, 1 to 3 px. @default 2 */
  line?: number;
  /** The screen's width over its height. @default 2 */
  ratio?: number;
  /** Play the stylus scraping and the powder rushing. Off unless asked for. @default false */
  sound?: boolean;
  /** The toy still draws and resolves; knobs and shaking are off. */
  disabled?: boolean;
  /** Sizes the toy. @default "w-full" */
  className?: string;
};

/** Fixed pigments: a toy is the same toy in either theme. */
const FRAMES: Record<EtchRevealFrame, string> = {
  red: "oklch(0.56 0.2 27)",
  teal: "oklch(0.57 0.1 195)",
  ink: "oklch(0.31 0.035 262)",
};
const POWDER = "oklch(0.86 0.006 250)";
const GRAPHITE = "oklch(0.36 0.012 250)";
const IVORY = "oklch(0.97 0.006 90)";

/** How far the stylus moves for a degree of knob, px. */
const PX_PER_DEG = 0.55;
/** The stylus's own pace while it traces, px per second at speed 1. */
const PACE = 420;
/** A visitor's turn pauses the tracing this long, ms. */
const PAUSE = 1500;
/** The shake's travel: rubber-banded inside the root's own padding. */
const SHAKE = 12;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** An integer hash as a fraction in [0, 1). Unsigned shifts throughout. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

/* --------------------------------------------------------------- reading */

type Sampler = (width: number, height: number) => Uint8ClampedArray | null;

const STYLE_KEYS = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "stop-color",
  "stop-opacity",
  "visibility",
];

/**
 * An inline SVG as an image: cloned with every node's computed colours
 * written onto it, because a data URI cannot see the page's tokens or
 * classes, then loaded from that URI.
 */
function svgImage(
  svg: SVGSVGElement,
  width: number,
  height: number,
): Promise<HTMLImageElement | null> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const to = [clone, ...Array.from(clone.querySelectorAll("*"))];
  from.forEach((node, i) => {
    const copy = to[i];
    if (!copy) return;
    const style = getComputedStyle(node);
    copy.setAttribute(
      "style",
      STYLE_KEYS.map((k) => `${k}:${style.getPropertyValue(k)}`).join(";"),
    );
    copy.removeAttribute("class");
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(Math.max(1, Math.round(width))));
  clone.setAttribute("height", String(Math.max(1, Math.round(height))));
  const xml = new XMLSerializer().serializeToString(clone);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

/**
 * Reads the picture as it sits in its box. A cross-origin image that taints
 * the canvas reads as nothing, and a doodle stands in.
 */
async function samplerOf(host: HTMLElement): Promise<Sampler | null> {
  const box = host.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return null;
  const img = host.querySelector("img");
  const svg = host.querySelector("svg");
  let draw:
    ((ctx: CanvasRenderingContext2D, sx: number, sy: number) => void) | null =
    null;
  if (img && img.complete && img.naturalWidth > 0) {
    const r = img.getBoundingClientRect();
    const k = Math.max(
      r.width / img.naturalWidth,
      r.height / img.naturalHeight,
    );
    const cw = r.width / k;
    const ch = r.height / k;
    draw = (ctx, sx, sy) =>
      ctx.drawImage(
        img,
        (img.naturalWidth - cw) / 2,
        (img.naturalHeight - ch) / 2,
        cw,
        ch,
        (r.left - box.left) * sx,
        (r.top - box.top) * sy,
        r.width * sx,
        r.height * sy,
      );
  } else if (svg) {
    const r = svg.getBoundingClientRect();
    const picture = await svgImage(svg, r.width, r.height);
    if (!picture) return null;
    draw = (ctx, sx, sy) =>
      ctx.drawImage(
        picture,
        (r.left - box.left) * sx,
        (r.top - box.top) * sy,
        r.width * sx,
        r.height * sy,
      );
  }
  if (!draw) return null;
  const paint = draw;
  return (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    try {
      paint(ctx, width / box.width, height / box.height);
      return ctx.getImageData(0, 0, width, height).data;
    } catch {
      return null;
    }
  };
}

/* ----------------------------------------------------------------- trace */

type Pt = [number, number];

const lengthOf = (pts: Pt[]) => {
  let d = 0;
  for (let i = 1; i < pts.length; i += 1) {
    d += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  }
  return d;
};

/** Douglas–Peucker: the fewest points within `eps` of the line. */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a]!;
    const [bx, by] = pts[b]!;
    const len = Math.hypot(bx - ax, by - ay) || 1e-6;
    let far = -1;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = pts[i]!;
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > far) {
        far = d;
        at = i;
      }
    }
    if (far > eps && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Contours where a grid of values crosses `t`, by marching squares, joined
 * into polylines.
 */
function contours(f: Float32Array, w: number, h: number, t: number): Pt[][] {
  const segs: [Pt, Pt][] = [];
  const at = (x: number, y: number) => f[y * w + x]!;
  for (let y = 0; y < h - 1; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      const a = at(x, y);
      const b = at(x + 1, y);
      const c = at(x + 1, y + 1);
      const d = at(x, y + 1);
      const code =
        (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const lerp = (p: number, q: number) => (t - p) / (q - p || 1e-6);
      const top: Pt = [x + lerp(a, b), y];
      const right: Pt = [x + 1, y + lerp(b, c)];
      const bottom: Pt = [x + lerp(d, c), y + 1];
      const left: Pt = [x, y + lerp(a, d)];
      const centre = (a + b + c + d) / 4 > t;
      switch (code) {
        case 1:
        case 14:
          segs.push([left, bottom]);
          break;
        case 2:
        case 13:
          segs.push([bottom, right]);
          break;
        case 3:
        case 12:
          segs.push([left, right]);
          break;
        case 4:
        case 11:
          segs.push([top, right]);
          break;
        case 6:
        case 9:
          segs.push([top, bottom]);
          break;
        case 7:
        case 8:
          segs.push([left, top]);
          break;
        case 5:
          if (centre) segs.push([left, top], [bottom, right]);
          else segs.push([left, bottom], [top, right]);
          break;
        case 10:
          if (centre) segs.push([left, bottom], [top, right]);
          else segs.push([left, top], [bottom, right]);
          break;
      }
    }
  }
  const key = (p: Pt) =>
    `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const ends = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of s) {
      const k = key(p);
      const list = ends.get(k);
      if (list) list.push(i);
      else ends.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines: Pt[][] = [];
  const grow = (line: Pt[], forward: boolean) => {
    for (;;) {
      const tip = forward ? line[line.length - 1]! : line[0]!;
      const next = (ends.get(key(tip)) ?? []).find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const [p, q] = segs[next]!;
      const other = key(p) === key(tip) ? q : p;
      if (forward) line.push(other);
      else line.unshift(other);
    }
  };
  segs.forEach((s, i) => {
    if (used[i]) return;
    used[i] = 1;
    const line: Pt[] = [s[0], s[1]];
    grow(line, true);
    grow(line, false);
    lines.push(line);
  });
  return lines;
}

/**
 * One continuous line through the picture's contours: tones found by
 * clustering its lightness, contours at the steps between them, each drawn
 * once, simplified, and visited nearest-first from the pen, joined by
 * straight runs because a stylus never lifts. In the screen's own units,
 * 0 to 1.
 */
function traceLine(sample: Sampler | null, aspect: number, seed: number): Pt[] {
  const ww = 180;
  const wh = Math.max(24, Math.round(ww / Math.max(0.5, aspect)));
  const data = sample?.(ww, wh) ?? null;
  let lines: Pt[][] = [];
  if (data) {
    // Lightness and the two colour axes, so a yellow sun on a pale sky still
    // has an edge, each smoothed once.
    const fields = [
      new Float32Array(ww * wh),
      new Float32Array(ww * wh),
      new Float32Array(ww * wh),
    ];
    for (let p = 0; p < ww * wh; p += 1) {
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const r = lin(data[p * 4]!);
      const g = lin(data[p * 4 + 1]!);
      const b = lin(data[p * 4 + 2]!);
      const l = Math.cbrt(
        0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
      );
      const m = Math.cbrt(
        0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
      );
      const s = Math.cbrt(
        0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
      );
      fields[0]![p] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
      fields[1]![p] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
      fields[2]![p] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    }
    const smooth = (f: Float32Array) => {
      const out = new Float32Array(f.length);
      for (let y = 0; y < wh; y += 1) {
        for (let x = 0; x < ww; x += 1) {
          let sum = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= ww || yy >= wh) continue;
              sum += f[yy * ww + xx]!;
              n += 1;
            }
          }
          out[y * ww + x] = sum / n;
        }
      }
      return out;
    };
    // Tones from each field's own values: thresholds between clusters.
    const levels = (f: Float32Array, k: number) => {
      const sorted = Float32Array.from(f).sort();
      const centres = Array.from(
        { length: k },
        (_, i) =>
          sorted[Math.floor(((i + 0.5) / k) * (sorted.length - 1))] ?? 0,
      );
      for (let it = 0; it < 10; it += 1) {
        const sum = new Float64Array(k);
        const cnt = new Float64Array(k);
        for (let p = 0; p < f.length; p += 1) {
          let best = 0;
          for (let j = 1; j < k; j += 1) {
            if (
              Math.abs(f[p]! - centres[j]!) < Math.abs(f[p]! - centres[best]!)
            ) {
              best = j;
            }
          }
          sum[best] = sum[best]! + f[p]!;
          cnt[best] = cnt[best]! + 1;
        }
        for (let j = 0; j < k; j += 1) {
          if (cnt[j]) centres[j] = sum[j]! / cnt[j]!;
        }
      }
      centres.sort((a, b) => a - b);
      const out: number[] = [];
      for (let j = 0; j < k - 1; j += 1) {
        out.push((centres[j]! + centres[j + 1]!) / 2);
      }
      return out;
    };
    // Only where the picture really changes: a soft gradient (a sky) crosses
    // thresholds too, and those crossings are not edges.
    const edges = (f: Float32Array, k: number, strong: number, gap: number) => {
      const grad = (x: number, y: number) => {
        const xi = Math.min(ww - 2, Math.max(1, Math.round(x)));
        const yi = Math.min(wh - 2, Math.max(1, Math.round(y)));
        const gx = f[yi * ww + xi + 1]! - f[yi * ww + xi - 1]!;
        const gy = f[(yi + 1) * ww + xi]! - f[(yi - 1) * ww + xi]!;
        return Math.hypot(gx, gy) / 2;
      };
      const ts = levels(f, k);
      for (let j = 0; j < ts.length; j += 1) {
        if (j > 0 && ts[j]! - ts[j - 1]! < gap) continue;
        for (const c of contours(f, ww, wh, ts[j]!)) {
          let run: Pt[] = [];
          for (const p of c) {
            if (grad(p[0], p[1]) >= strong) run.push(p);
            else {
              if (run.length >= 3) lines.push(run);
              run = [];
            }
          }
          if (run.length >= 3) lines.push(run);
        }
      }
    };
    edges(smooth(fields[0]!), 6, 0.012, 0.03);
    edges(smooth(fields[2]!), 4, 0.006, 0.02);
    edges(smooth(fields[1]!), 3, 0.006, 0.02);
  } else {
    // A doodle for a picture whose pixels cannot be read: a sun and hills.
    const sun: Pt[] = [];
    for (let i = 0; i <= 28; i += 1) {
      const a = (i / 28) * Math.PI * 2;
      sun.push([
        ww * 0.74 + Math.cos(a) * wh * 0.13,
        wh * 0.3 + Math.sin(a) * wh * 0.13,
      ]);
    }
    const hill = (base: number, amp: number, k: number): Pt[] =>
      Array.from({ length: 41 }, (_, i) => [
        (i / 40) * (ww - 1),
        wh * base - Math.sin((i / 40) * Math.PI * k + (seed % 7)) * wh * amp,
      ]);
    lines = [sun, hill(0.62, 0.12, 2.2), hill(0.78, 0.06, 3.4)];
  }

  // Each edge once: where two tones meet at one edge, the second contour
  // there is dropped point by point.
  lines.sort((a, b) => b.length - a.length);
  const cell = 1.5;
  const seen = new Set<string>();
  const near = (p: Pt) => {
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (seen.has(`${cx + dx},${cy + dy}`)) return true;
      }
    }
    return false;
  };
  const kept: Pt[][] = [];
  for (const line of lines) {
    let run: Pt[] = [];
    const fresh: Pt[] = [];
    const flush = () => {
      if (run.length >= 3) kept.push(run);
      run = [];
    };
    for (const p of line) {
      if (near(p)) flush();
      else {
        run.push(p);
        fresh.push(p);
      }
    }
    flush();
    for (const p of fresh) {
      seen.add(`${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`);
    }
  }
  let pieces = kept
    .map((l) => simplify(l, 0.6))
    .filter((l) => lengthOf(l) >= 7)
    .sort((a, b) => lengthOf(b) - lengthOf(a));
  const cap = 7 * (ww + wh);
  let total = 0;
  pieces = pieces.filter((l) => {
    total += lengthOf(l);
    return total <= cap;
  });

  // Nearest first from the pen, entering each line at its nearer end, or at
  // its nearest point when it is a loop.
  const out: Pt[] = [];
  let pen: Pt = [0, 0];
  const left = [...pieces];
  while (left.length) {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    let bestAt = 0;
    let bestRev = false;
    left.forEach((l, i) => {
      const a = l[0]!;
      const b = l[l.length - 1]!;
      const closed = Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.2;
      if (closed) {
        l.forEach((p, j) => {
          const d = Math.hypot(p[0] - pen[0], p[1] - pen[1]);
          if (d < bestD) {
            bestD = d;
            best = i;
            bestAt = j;
            bestRev = false;
          }
        });
      } else {
        const da = Math.hypot(a[0] - pen[0], a[1] - pen[1]);
        const db = Math.hypot(b[0] - pen[0], b[1] - pen[1]);
        if (da < bestD) {
          bestD = da;
          best = i;
          bestAt = 0;
          bestRev = false;
        }
        if (db < bestD) {
          bestD = db;
          best = i;
          bestAt = 0;
          bestRev = true;
        }
      }
    });
    let l = left.splice(best, 1)[0]!;
    if (bestAt > 0) l = [...l.slice(bestAt), ...l.slice(1, bestAt + 1)];
    if (bestRev) l = [...l].reverse();
    out.push(...l);
    pen = l[l.length - 1]!;
  }
  return out.map(([x, y]) => [x / (ww - 1), y / (wh - 1)]);
}

/* ------------------------------------------------------------- the knobs */

function Knob() {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return {
      x1: r2(20 + Math.cos(a) * 15.5),
      y1: r2(20 + Math.sin(a) * 15.5),
      x2: r2(20 + Math.cos(a) * 18.6),
      y2: r2(20 + Math.sin(a) * 18.6),
    };
  });
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="block size-full">
      <circle
        cx="20"
        cy="20"
        r="19.2"
        style={{
          fill: IVORY,
          stroke: "color-mix(in oklab, black 22%, transparent)",
        }}
        strokeWidth="0.8"
      />
      <g
        strokeWidth="1"
        strokeLinecap="round"
        style={{ stroke: "color-mix(in oklab, black 14%, transparent)" }}
      >
        {ticks.map((t, i) => (
          <line key={i} {...t} />
        ))}
      </g>
      <circle
        cx="20"
        cy="20"
        r="12"
        style={{ fill: "color-mix(in oklab, oklch(0.97 0.006 90) 90%, black)" }}
      />
      <circle
        cx="20"
        cy="20"
        r="12"
        fill="none"
        strokeWidth="0.8"
        style={{ stroke: "color-mix(in oklab, white 70%, transparent)" }}
      />
      <rect
        x="19.1"
        y="9"
        width="1.8"
        height="6"
        rx="0.9"
        style={{ fill: "color-mix(in oklab, black 30%, transparent)" }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------- component */

type Stroke = { pts: number[]; alpha: number };

type Api = {
  kick: () => void;
  readyChanged: (ready: boolean) => void;
  resize: () => void;
  install: (path: Pt[]) => void;
  redraw: () => void;
};

/**
 * An image placeholder that is a drawing toy: a coloured frame, a powder
 * screen and two knobs. While the picture loads, one continuous line traced
 * from its own contours is drawn across the screen, the knobs turning with
 * the stylus — the left one across, the right one up and down — and when it
 * is done and the picture is ready the screen resolves into the picture.
 *
 * Turning a knob (drag round it, or arrow keys — they are real sliders)
 * draws by hand, and the tracing waits for you. Dragging the frame side to
 * side shakes it: each stroke knocks powder back over the line until the
 * screen is clear, and the Shake plate does the same from the keyboard.
 * Under reduced motion the line appears in still steps, the knobs jump, and
 * the frame never moves; shaking still clears the screen.
 */
export function EtchReveal({
  alt,
  src,
  children,
  ready,
  progress,
  onReady,
  speed = 1,
  frame = "teal",
  line = 2,
  ratio = 2,
  sound = false,
  disabled = false,
  className,
}: EtchRevealProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const spd = Math.max(0.25, Math.min(4, speed));
  const width = Math.max(1, Math.min(3, line));
  const aspect = Math.max(0.5, Math.min(4, ratio));
  const body = FRAMES[frame] ?? FRAMES.red;

  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const loaded = src === undefined || loadedSrc === src;
  const [ownReady, setOwnReady] = React.useState(false);
  const controlled = ready !== undefined;
  const isReady = controlled ? ready : ownReady && loaded;
  const [done, setDone] = React.useState(false);
  const [pos, setPos] = React.useState({ u: 0, v: 0 });
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const shake = useMotionValue(0);
  const tilt = useTransform(shake, (x) => r2(x * 0.1));
  const leftTurn = useMotionValue(0);
  const rightTurn = useMotionValue(0);
  const resolveT = useMotionValue(0);
  const powderOpacity = useTransform(resolveT, (v) => r2(1 - v));
  const fadeOut = useMotionValue(1);
  const lineOpacity = useTransform(
    [resolveT, fadeOut] as MotionValue<number>[],
    ([v = 0, f = 1]: number[]) => r2((1 - v) * f),
  );
  const stylusX = useMotionValue(0);
  const stylusY = useMotionValue(0);
  const stylusOn = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const screenRef = React.useRef<HTMLDivElement | null>(null);
  const pictureRef = React.useRef<HTMLDivElement | null>(null);
  const powderRef = React.useRef<HTMLCanvasElement | null>(null);
  const handRef = React.useRef<HTMLCanvasElement | null>(null);
  const leftRef = React.useRef<HTMLDivElement | null>(null);
  const rightRef = React.useRef<HTMLDivElement | null>(null);
  const frameLoop = React.useRef(0);
  const visible = React.useRef(true);
  const scratch = React.useRef<LoopHandle | null>(null);
  const whir = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef(0);
  const resume = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const st = React.useRef({
    w: 0,
    h: 0,
    dpr: 1,
    // The stylus, in screen px.
    sx: 0,
    sy: 0,
    clock: 0,
    last: 0,
    // The traced line: points 0 to 1, cumulative lengths in px, and how far
    // the stylus has run along it.
    path: null as Pt[] | null,
    cum: [] as number[],
    total: 0,
    s: 0,
    // A straight run back to the path after the visitor moved the stylus.
    link: null as { from: Pt; to: Pt; len: number; t: number } | null,
    lastHand: -1e9,
    shown: -1,
    powder: [] as Stroke[],
    hand: [] as Stroke[],
    ownReady: false,
    resolving: false,
    shakes: 0,
    knob: null as null | {
      axis: "x" | "y";
      cx: number;
      cy: number;
      px: number;
      py: number;
      t: number;
    },
    dir: 0,
    run: 0,
    lastX: 0,
    lastT: 0,
  });
  const latest = React.useRef({
    isReady,
    controlled,
    progress,
    spd,
    motionSafe,
    width,
    disabled,
    onReady,
  });
  React.useEffect(() => {
    latest.current = {
      isReady,
      controlled,
      progress,
      spd,
      motionSafe,
      width,
      disabled,
      onReady,
    };
  });

  /* ---------------------------------------------------------- drawing */

  const ctxOf = (canvas: HTMLCanvasElement | null) => {
    const s = st.current;
    if (!canvas || s.w < 1) return null;
    const cw = Math.round(s.w * s.dpr);
    const ch = Math.round(s.h * s.dpr);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Graphite is a fixed pigment: no style read per stroke.
    ctx.strokeStyle = GRAPHITE;
    ctx.lineWidth = latest.current.width;
    return ctx;
  };

  /** A stretch of line, in screen px, onto the layer it belongs to. */
  const stroke = (
    layer: "powder" | "hand",
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ) => {
    const s = st.current;
    const ctx = ctxOf(layer === "powder" ? powderRef.current : handRef.current);
    if (!ctx) return;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 + 0.01, y1);
    ctx.stroke();
    const list = layer === "powder" ? s.powder : s.hand;
    const last = list[list.length - 1];
    const ux0 = r2((x0 / s.w) * 1000) / 1000;
    const uy0 = r2((y0 / s.h) * 1000) / 1000;
    const ux1 = r2((x1 / s.w) * 1000) / 1000;
    const uy1 = r2((y1 / s.h) * 1000) / 1000;
    if (
      last &&
      last.alpha === 1 &&
      last.pts[last.pts.length - 2] === ux0 &&
      last.pts[last.pts.length - 1] === uy0
    ) {
      last.pts.push(ux1, uy1);
    } else {
      list.push({ pts: [ux0, uy0, ux1, uy1], alpha: 1 });
    }
  };

  /** Everything drawn so far, again: after a resize or a theme. */
  const redraw = () => {
    const s = st.current;
    for (const [layer, list] of [
      [powderRef.current, s.powder],
      [handRef.current, s.hand],
    ] as const) {
      const ctx = ctxOf(layer);
      if (!ctx) continue;
      ctx.clearRect(0, 0, s.w, s.h);
      for (const k of list) {
        ctx.globalAlpha = k.alpha;
        ctx.beginPath();
        for (let i = 0; i < k.pts.length; i += 2) {
          const x = k.pts[i]! * s.w;
          const y = k.pts[i + 1]! * s.h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  };

  /** Knocks powder back over the line: about half of it, unevenly. */
  const erase = () => {
    const s = st.current;
    for (const canvas of [powderRef.current, handRef.current]) {
      const ctx = ctxOf(canvas);
      if (!ctx) continue;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      const n = s.shakes * 977;
      for (let y = 0; y < s.h; y += 6) {
        for (let x = 0; x < s.w; x += 6) {
          ctx.globalAlpha = 0.35 + 0.45 * hash01(n + x * 31 + y * 7919);
          ctx.fillRect(x, y, 6, 6);
        }
      }
      ctx.restore();
    }
    for (const k of [...s.powder, ...s.hand]) k.alpha *= 0.45;
  };

  const placeStylus = (x: number, y: number) => {
    const s = st.current;
    s.sx = x;
    s.sy = y;
    stylusX.set(r2(x));
    stylusY.set(r2(y));
    leftTurn.set(r2(x / PX_PER_DEG));
    rightTurn.set(r2(-y / PX_PER_DEG));
  };

  /* ------------------------------------------------------- the tracing */

  const pointAt = (d: number): Pt => {
    const s = st.current;
    const path = s.path;
    if (!path || path.length === 0) return [s.sx, s.sy];
    let lo = 0;
    let hi = s.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s.cum[mid]! < d) lo = mid;
      else hi = mid;
    }
    const a = path[lo]!;
    const b = path[hi] ?? a;
    const span = s.cum[hi]! - s.cum[lo]! || 1;
    const t = clamp01((d - s.cum[lo]!) / span);
    return [(a[0] + (b[0] - a[0]) * t) * s.w, (a[1] + (b[1] - a[1]) * t) * s.h];
  };

  const measurePath = () => {
    const s = st.current;
    const path = s.path;
    s.cum = [0];
    s.total = 0;
    if (!path) return;
    for (let i = 1; i < path.length; i += 1) {
      s.total += Math.hypot(
        (path[i]![0] - path[i - 1]![0]) * s.w,
        (path[i]![1] - path[i - 1]![1]) * s.h,
      );
      s.cum.push(s.total);
    }
  };

  /** The run along the path from `a` to `b` px, as points. */
  const along = (a: number, b: number): Pt[] => {
    const s = st.current;
    const path = s.path;
    if (!path) return [];
    const out: Pt[] = [pointAt(a)];
    for (let i = 0; i < s.cum.length; i += 1) {
      const c = s.cum[i]!;
      if (c > a && c < b) {
        out.push([path[i]![0] * s.w, path[i]![1] * s.h]);
      }
    }
    out.push(pointAt(b));
    return out;
  };

  const resolve = () => {
    const s = st.current;
    if (s.resolving) return;
    s.resolving = true;
    stylusOn.set(0);
    setPos({ u: r2(s.sx / Math.max(1, s.w)), v: r2(s.sy / Math.max(1, s.h)) });
    const L = latest.current;
    anims.current.push(
      animate(resolveT, 1, {
        duration: L.motionSafe
          ? durations.page / Math.sqrt(L.spd)
          : durations.base,
        ease: easings.enter,
        onComplete: () => {
          setDone(true);
          latest.current.onReady?.();
        },
      }),
    );
  };

  const tick = (now: number) => {
    frameLoop.current = 0;
    const s = st.current;
    const L = latest.current;
    if (s.resolving || !s.path || s.w < 1) return;
    if (!visible.current || document.hidden) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 0;
    s.last = now;
    // The visitor has the knobs: the tracing waits, and is kicked again a
    // moment after they let go.
    if (s.knob || now - s.lastHand < PAUSE) {
      s.last = 0;
      if (!s.knob) resumeLater(PAUSE - (now - s.lastHand));
      return;
    }
    s.clock += dt * L.spd;
    // A long line runs faster, so any picture draws in roughly the same time.
    const pace = Math.min(PACE * 2.6, Math.max(PACE * 0.7, s.total / 4));
    const limit = L.isReady
      ? s.total
      : L.progress !== undefined
        ? clamp01(L.progress) * s.total * 0.97
        : L.controlled
          ? s.total * 0.985
          : s.total;
    let speed = pace;
    if (L.isReady && L.controlled) speed = pace * 3;
    else if (!L.isReady && L.controlled && s.s > s.total * 0.85) {
      // Waiting on the host: the stylus slows as it nears the end, and
      // creeps on without ever finishing.
      speed = pace * Math.max(0.04, (limit - s.s) / (limit - s.total * 0.85));
    }
    let budget = speed * dt * L.spd;
    let moved = false;
    // First the straight run back to the path, if the visitor moved it.
    if (s.link && budget > 0) {
      const k = s.link;
      const step = Math.min(budget, k.len * (1 - k.t));
      const t1 = k.len > 0 ? k.t + step / k.len : 1;
      const x0 = k.from[0] + (k.to[0] - k.from[0]) * k.t;
      const y0 = k.from[1] + (k.to[1] - k.from[1]) * k.t;
      const x1 = k.from[0] + (k.to[0] - k.from[0]) * t1;
      const y1 = k.from[1] + (k.to[1] - k.from[1]) * t1;
      stroke("powder", x0, y0, x1, y1);
      placeStylus(x1, y1);
      k.t = t1;
      budget -= step;
      moved = true;
      if (k.t >= 1 - 1e-6) s.link = null;
    }
    if (!s.link && budget > 0 && s.s < limit) {
      const next = Math.min(limit, s.s + budget);
      if (L.motionSafe) {
        const pts = along(s.s, next);
        for (let i = 1; i < pts.length; i += 1) {
          stroke(
            "powder",
            pts[i - 1]![0],
            pts[i - 1]![1],
            pts[i]![0],
            pts[i]![1],
          );
        }
        const end = pts[pts.length - 1];
        if (end) placeStylus(end[0], end[1]);
      } else {
        // Still steps: the line appears a sixth at a time.
        const step = Math.floor((next / Math.max(1, s.total)) * 6 + 1e-6);
        if (step !== s.shown) {
          const from = (Math.max(0, s.shown) / 6) * s.total;
          const to = Math.min(next, (step / 6) * s.total);
          const pts = along(from, to);
          for (let i = 1; i < pts.length; i += 1) {
            stroke(
              "powder",
              pts[i - 1]![0],
              pts[i - 1]![1],
              pts[i]![0],
              pts[i]![1],
            );
          }
          const end = pts[pts.length - 1];
          if (end) placeStylus(end[0], end[1]);
          s.shown = step;
        }
      }
      s.s = next;
      moved = true;
    }
    stylusOn.set(moved && L.motionSafe ? 1 : 0);
    if (!L.controlled && !s.ownReady && s.s >= s.total - 0.5) {
      s.ownReady = true;
      setOwnReady(true);
    }
    if (L.isReady && s.s >= s.total - 0.5 && !s.link) {
      resolve();
      return;
    }
    // Runs while there is line left to draw; waiting on a host that holds
    // the end back, it creeps on, so it keeps running while on screen.
    if (s.link || s.s < limit - 0.01 || (L.isReady && s.s < s.total)) {
      frameLoop.current = window.requestAnimationFrame(tick);
    } else {
      s.last = 0;
    }
  };

  /** The tracing picks up again once the visitor has left the knobs alone. */
  const resumeLater = (ms: number) => {
    window.clearTimeout(resume.current);
    resume.current = window.setTimeout(
      () => api.current.kick(),
      Math.max(16, ms + 20),
    );
  };

  const kick = () => {
    const s = st.current;
    if (frameLoop.current || s.resolving || !s.path || s.w < 1) return;
    if (!visible.current || document.hidden) return;
    frameLoop.current = window.requestAnimationFrame(tick);
  };

  const install = (path: Pt[]) => {
    const s = st.current;
    s.path =
      path.length > 1
        ? path
        : [
            [0, 0],
            [1, 1],
          ];
    measurePath();
    const first = s.path[0]!;
    if (s.s === 0 && s.powder.length === 0) {
      placeStylus(first[0] * s.w, first[1] * s.h);
    }
    kick();
  };

  /** A clean screen. Before the picture shows, the toy traces it again. */
  const clearAll = () => {
    const s = st.current;
    s.powder = [];
    s.hand = [];
    s.shakes = 0;
    for (const canvas of [powderRef.current, handRef.current]) {
      const ctx = ctxOf(canvas);
      ctx?.clearRect(0, 0, s.w, s.h);
    }
    if (!s.resolving && s.path) {
      s.s = 0;
      s.shown = -1;
      const start = pointAt(0);
      s.link = {
        from: [s.sx, s.sy],
        to: start,
        len: Math.hypot(start[0] - s.sx, start[1] - s.sy),
        t: 0,
      };
    }
    setSaid((v) => ({ n: v.n + 1, text: "Screen cleared." }));
    kick();
  };

  const shakeOnce = () => {
    const s = st.current;
    if (s.powder.length === 0 && s.hand.length === 0) return;
    s.shakes += 1;
    erase();
    if (s.shakes >= 4) clearAll();
  };

  /* ---------------------------------------------------------- by hand */

  const quiet = () => {
    window.clearTimeout(hush.current);
    scratch.current?.stop();
    scratch.current = null;
  };

  const voice = (speedPx: number) => {
    const s = st.current;
    const rect = screenRef.current?.getBoundingClientRect();
    if (!scratch.current) {
      scratch.current = audio.start("scratch", { pitch: 1, gain: 0 });
    }
    scratch.current.set({
      pitch: r2(0.8 + Math.min(1.4, speedPx / 300)),
      gain: r2(Math.min(0.55, 0.12 + speedPx / 600)),
      pan: rect ? panFrom(rect.left + s.sx, screenRef.current) : 0,
    });
    window.clearTimeout(hush.current);
    hush.current = window.setTimeout(
      () => scratch.current?.set({ gain: 0 }),
      90,
    );
  };

  /** The visitor moves the stylus by `dx`, `dy` px: a line, by hand. */
  const nudge = (dx: number, dy: number, at: number) => {
    const s = st.current;
    if (s.w < 1 || latest.current.disabled) return 0;
    const x = Math.min(s.w, Math.max(0, s.sx + dx));
    const y = Math.min(s.h, Math.max(0, s.sy + dy));
    const moved = Math.hypot(x - s.sx, y - s.sy);
    if (moved > 0.05) {
      stroke(s.resolving ? "hand" : "powder", s.sx, s.sy, x, y);
      placeStylus(x, y);
      s.lastHand = at;
      s.link = null;
      if (latest.current.motionSafe) {
        stylusOn.set(1);
      }
    }
    return moved;
  };

  /** After the visitor lets go, the tracing finds its way back to its path. */
  const rejoin = () => {
    const s = st.current;
    setPos({ u: r2(s.sx / Math.max(1, s.w)), v: r2(s.sy / Math.max(1, s.h)) });
    if (s.resolving || !s.path) return;
    const to = pointAt(s.s);
    s.link = {
      from: [s.sx, s.sy],
      to,
      len: Math.hypot(to[0] - s.sx, to[1] - s.sy),
      t: 0,
    };
    resumeLater(PAUSE);
  };

  const knobStart = (axis: "x" | "y", info: DragInfo) => {
    const s = st.current;
    const el = axis === "x" ? leftRef.current : rightRef.current;
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    s.knob = {
      axis,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      px: info.point.x - info.offset.x,
      py: info.point.y - info.offset.y,
      t: info.event.timeStamp,
    };
  };

  const knobMove = (axis: "x" | "y", info: DragInfo) => {
    const s = st.current;
    const k = s.knob;
    if (!k) return;
    const rx = k.px - k.cx;
    const ry = k.py - k.cy;
    const mx = info.point.x - k.px;
    const my = info.point.y - k.py;
    // The tangential part of the pointer's travel turns the knob.
    const turn =
      ((rx * my - ry * mx) / Math.max(144, rx * rx + ry * ry)) *
      (180 / Math.PI);
    const px = turn * PX_PER_DEG;
    const moved = nudge(
      axis === "x" ? px : 0,
      axis === "y" ? -px : 0,
      info.event.timeStamp,
    );
    const dt = Math.max(8, info.event.timeStamp - k.t);
    voice((moved / dt) * 1000);
    // Against a stop the knob still gives a little, and springs back.
    if (moved < Math.abs(px) * 0.5) {
      const mv = axis === "x" ? leftTurn : rightTurn;
      const rest = axis === "x" ? s.sx / PX_PER_DEG : -s.sy / PX_PER_DEG;
      const over = mv.get() - rest + turn * (axis === "x" ? 1 : -1);
      mv.set(r2(rest + rubberband(over, 30)));
    }
    k.px = info.point.x;
    k.py = info.point.y;
    k.t = info.event.timeStamp;
  };

  const knobEnd = () => {
    st.current.knob = null;
    quiet();
    settleKnobs();
    rejoin();
  };

  const settleKnobs = () => {
    const s = st.current;
    const L = latest.current;
    const toL = r2(s.sx / PX_PER_DEG);
    const toR = r2(-s.sy / PX_PER_DEG);
    if (L.motionSafe) {
      anims.current.push(animate(leftTurn, toL, springs.snap));
      anims.current.push(animate(rightTurn, toR, springs.snap));
    } else {
      leftTurn.set(toL);
      rightTurn.set(toR);
    }
  };

  const leftDrag = useDrag({
    threshold: 2,
    disabled,
    onStart: (info) => knobStart("x", info),
    onMove: (info) => knobMove("x", info),
    onEnd: () => knobEnd(),
    onCancel: () => knobEnd(),
  });
  const rightDrag = useDrag({
    threshold: 2,
    disabled,
    onStart: (info) => knobStart("y", info),
    onMove: (info) => knobMove("y", info),
    onEnd: () => knobEnd(),
    onCancel: () => knobEnd(),
  });

  const onKnobKey = (
    axis: "x" | "y",
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const s = st.current;
    if (disabled || s.w < 1) return;
    const dim = axis === "x" ? s.w : s.h;
    const step = Math.max(3, dim * 0.02) * (event.shiftKey ? 5 : 1);
    const cur = axis === "x" ? s.sx : s.sy;
    // Up and right raise the value; for the vertical knob, up is up.
    const sign = axis === "x" ? 1 : -1;
    let to: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        to = cur + sign * step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        to = cur - sign * step;
        break;
      case "PageUp":
        to = cur + sign * dim * 0.1;
        break;
      case "PageDown":
        to = cur - sign * dim * 0.1;
        break;
      case "Home":
        to = axis === "x" ? 0 : dim;
        break;
      case "End":
        to = axis === "x" ? dim : 0;
        break;
      default:
        return;
    }
    event.preventDefault();
    const d = to - cur;
    const moved = nudge(
      axis === "x" ? d : 0,
      axis === "y" ? d : 0,
      event.timeStamp,
    );
    voice(Math.min(600, moved * 12));
    setPos({ u: r2(s.sx / Math.max(1, s.w)), v: r2(s.sy / Math.max(1, s.h)) });
  };

  const onKnobKeyUp = () => {
    quiet();
    rejoin();
  };

  /* ---------------------------------------------------------- shaking */

  const shakeDrag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: (info) => {
      const s = st.current;
      s.dir = 0;
      s.run = 0;
      s.lastX = info.point.x;
      s.lastT = info.event.timeStamp;
      anims.current.forEach((a) => a.stop());
      anims.current = [];
      whir.current?.stop();
      whir.current = audio.start("whir", { pitch: 0.8, gain: 0 });
    },
    onMove: (info) => {
      const s = st.current;
      const L = latest.current;
      if (L.motionSafe) shake.set(r2(rubberband(info.offset.x, SHAKE)));
      const dx = info.point.x - s.lastX;
      const dt = Math.max(8, info.event.timeStamp - s.lastT);
      const v = (Math.abs(dx) / dt) * 1000;
      const dir = Math.sign(dx);
      if (dir !== 0 && s.dir !== 0 && dir !== s.dir && s.run >= 6) {
        // A reversal after a real stroke: one shake.
        shakeOnce();
        s.run = 0;
      }
      if (dir !== 0) {
        if (dir !== s.dir) s.run = 0;
        s.dir = dir;
        s.run += Math.abs(dx);
      }
      whir.current?.set({
        pitch: r2(0.7 + Math.min(1.6, v / 900)),
        gain: r2(Math.min(0.7, v / 1400)),
        pan: panFrom(info.point.x, rootRef.current),
      });
      s.lastX = info.point.x;
      s.lastT = info.event.timeStamp;
    },
    onEnd: (info) => {
      whir.current?.stop();
      whir.current = null;
      if (st.current.run >= 6) shakeOnce();
      settleFrame(info.velocity.x * 0.2);
    },
    onCancel: () => {
      whir.current?.stop();
      whir.current = null;
      settleFrame(0);
    },
  });

  const settleFrame = (velocity: number) => {
    if (!latest.current.motionSafe) {
      shake.set(0);
      return;
    }
    anims.current.push(animate(shake, 0, { ...springs.snap, velocity }));
  };

  /** The keyboard's shake: four strokes on a tween, clearing as they go. */
  const shakeByKey = () => {
    const s = st.current;
    if (disabled) return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    whir.current?.stop();
    whir.current = audio.start("whir", { pitch: 1.2, gain: 0.5 });
    const stop = () => {
      whir.current?.stop();
      whir.current = null;
    };
    if (!latest.current.motionSafe) {
      anims.current.push(
        animate(fadeOut, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: () => {
            clearAll();
            fadeOut.set(1);
            stop();
          },
        }),
      );
      return;
    }
    anims.current.push(
      animate(shake, [0, -10, 9, -8, 7, -5, 3, 0], {
        duration: 0.8,
        ease: "easeInOut",
      }),
    );
    for (const at of [110, 290, 470, 650]) {
      timers.current.push(window.setTimeout(shakeOnce, at));
    }
    timers.current.push(
      window.setTimeout(() => {
        stop();
        if (s.powder.length || s.hand.length) clearAll();
      }, 820),
    );
  };

  /* --------------------------------------------------------- plumbing */

  const resize = () => {
    const screen = screenRef.current;
    if (!screen) return;
    const w = screen.clientWidth;
    const h = screen.clientHeight;
    if (w < 1 || h < 1) return;
    const s = st.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === s.w && h === s.h && dpr === s.dpr) return;
    const was = { w: s.w, h: s.h };
    s.w = w;
    s.h = h;
    s.dpr = dpr;
    if (was.w > 0) {
      s.sx = (s.sx / was.w) * w;
      s.sy = (s.sy / was.h) * h;
      const done = s.total > 0 ? s.s / s.total : 0;
      measurePath();
      s.s = done * s.total;
      placeStylus(s.sx, s.sy);
    } else {
      measurePath();
    }
    redraw();
    kick();
  };

  const readyChanged = (now: boolean) => {
    if (now) {
      kick();
      return;
    }
    const s = st.current;
    if (!s.resolving || !latest.current.controlled) return;
    // Sent back to loading: fresh powder, and the toy draws again.
    for (const a of anims.current) a.stop();
    anims.current = [];
    resolveT.set(0);
    s.resolving = false;
    s.ownReady = false;
    s.powder = [];
    s.s = 0;
    s.shown = -1;
    setDone(false);
    setOwnReady(false);
    redraw();
    kick();
  };

  const api = React.useRef<Api>({
    kick,
    readyChanged,
    resize,
    install,
    redraw,
  });
  React.useEffect(() => {
    api.current = { kick, readyChanged, resize, install, redraw };
  });

  // The trace: once the picture exists and the screen has a size.
  const [measured, setMeasured] = React.useState(false);
  React.useEffect(() => {
    if (!loaded || !measured) return;
    const host = pictureRef.current;
    if (!host) return;
    let live = true;
    void samplerOf(host).then((sample) => {
      if (!live) return;
      const rect = host.getBoundingClientRect();
      const path = traceLine(
        sample,
        rect.width / Math.max(1, rect.height),
        uid.length,
      );
      if (live) api.current.install(path);
    });
    return () => {
      live = false;
    };
  }, [loaded, measured, uid]);

  const shownReady = React.useRef(isReady);
  React.useEffect(() => {
    if (shownReady.current === isReady) return;
    shownReady.current = isReady;
    api.current.readyChanged(isReady);
  }, [isReady]);

  React.useEffect(() => {
    api.current.kick();
  }, [progress]);

  // A new line width redraws what is there at that width.
  React.useEffect(() => {
    if (st.current.w > 0) api.current.redraw();
  }, [width]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        scratch.current?.stop();
        scratch.current = null;
        whir.current?.stop();
        whir.current = null;
      } else {
        api.current.kick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frameLoop;
    const running = anims;
    const pending = timers;
    const scraping = scratch;
    const rushing = whir;
    const hushing = hush;
    const resuming = resume;
    return () => {
      window.clearTimeout(resuming.current);
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      for (const a of running.current) a.stop();
      running.current = [];
      for (const t of pending.current) window.clearTimeout(t);
      pending.current = [];
      window.clearTimeout(hushing.current);
      scraping.current?.stop();
      scraping.current = null;
      rushing.current?.stop();
      rushing.current = null;
    };
  }, []);

  const bindScreen = React.useCallback((node: HTMLDivElement | null) => {
    screenRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current.resize();
      setMeasured(true);
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) api.current.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindImage = React.useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete && src) {
        const loadedNow = src;
        queueMicrotask(() => setLoadedSrc(loadedNow));
      }
    },
    [src],
  );

  const stylusLeft = useTransform(stylusX, (x) => r2(x - 2));
  const stylusTop = useTransform(stylusY, (y) => r2(y - 2));
  const across = Math.round(pos.u * 100);
  const up = Math.round((1 - pos.v) * 100);

  return (
    <div
      ref={rootRef}
      aria-busy={!done}
      className={cn("relative w-full px-3 py-1.5 select-none", className)}
    >
      <motion.div
        {...shakeDrag}
        className={cn(
          "relative w-full touch-pan-y rounded-[clamp(12px,4%,20px)]",
          "px-[clamp(10px,4%,20px)] pt-[clamp(14px,5.5%,26px)] pb-[calc(clamp(28px,11%,44px)+clamp(8px,2.5%,14px))]",
          disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          x: shake,
          rotate: tilt,
          backgroundColor: body,
          boxShadow:
            "inset 0 2px 0 color-mix(in oklab, white 24%, transparent), inset 0 -3px 0 color-mix(in oklab, black 26%, transparent), 0 2px 6px -3px color-mix(in oklab, black 55%, transparent)",
        }}
      >
        <div
          ref={bindScreen}
          className="relative w-full overflow-clip rounded-[clamp(6px,2.5%,12px)] shadow-[inset_0_2px_5px_color-mix(in_oklab,black_35%,transparent)]"
          style={{ aspectRatio: aspect, backgroundColor: POWDER }}
        >
          <div
            ref={pictureRef}
            role={src === undefined ? "img" : undefined}
            aria-label={src === undefined ? alt : undefined}
            tabIndex={-1}
            className="absolute inset-0 outline-none [&>img]:size-full [&>svg]:block [&>svg]:size-full"
          >
            {src !== undefined ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={bindImage}
                src={src}
                alt={alt}
                draggable={false}
                onLoad={() => setLoadedSrc(src)}
                onError={() => setLoadedSrc(src)}
                className="size-full object-cover"
              />
            ) : (
              children
            )}
          </div>
          <motion.div
            aria-hidden
            className={cn("absolute inset-0", done && "hidden")}
            style={{
              opacity: powderOpacity,
              backgroundColor: POWDER,
              backgroundImage:
                "radial-gradient(120% 90% at 30% 20%, color-mix(in oklab, white 30%, transparent), transparent 60%)",
            }}
          />
          <motion.canvas
            ref={powderRef}
            aria-hidden
            className={cn("absolute inset-0 size-full", done && "hidden")}
            style={{ opacity: lineOpacity }}
          />
          <motion.canvas
            ref={handRef}
            aria-hidden
            className="absolute inset-0 size-full"
            style={{ opacity: fadeOut }}
          />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 size-1 rounded-full"
            style={{
              x: stylusLeft,
              y: stylusTop,
              opacity: stylusOn,
              backgroundColor: GRAPHITE,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,color-mix(in_oklab,white_10%,transparent),transparent_38%)]"
          />
        </div>
        <div className="absolute inset-x-[clamp(8px,3%,16px)] bottom-[5px] flex items-center justify-between gap-2">
          {(["x", "y"] as const).map((axis) => {
            const isX = axis === "x";
            const drag = isX ? leftDrag : rightDrag;
            const knobEl = (
              <motion.div
                key={axis}
                ref={isX ? leftRef : rightRef}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-label={isX ? "Across" : "Up and down"}
                aria-orientation={isX ? "horizontal" : "vertical"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={isX ? across : up}
                aria-valuetext={isX ? `${across}% across` : `${up}% up`}
                aria-describedby={hintId}
                aria-disabled={disabled || undefined}
                {...drag}
                onPointerDown={(event) => {
                  // A knob is not the frame: turning it must not shake the toy.
                  event.stopPropagation();
                  drag.onPointerDown(event);
                }}
                onKeyDown={(event) => onKnobKey(axis, event)}
                onKeyUp={onKnobKeyUp}
                onBlur={() => quiet()}
                className={cn(
                  "relative aspect-square w-[clamp(28px,11.8%,46px)] shrink-0 touch-none rounded-full outline-none",
                  isX ? "order-0" : "order-2",
                  "shadow-[0_2px_4px_color-mix(in_oklab,black_35%,transparent)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  disabled
                    ? "cursor-not-allowed"
                    : "cursor-grab active:cursor-grabbing",
                )}
                style={{ rotate: isX ? leftTurn : rightTurn }}
              >
                <Knob />
              </motion.div>
            );
            return knobEl;
          })}
          <button
            type="button"
            disabled={disabled}
            aria-label="Shake the screen clear"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={shakeByKey}
            className={cn(
              "order-1 inline-flex h-6 shrink-0 items-center rounded-full px-2.5 font-mono text-[9px] tracking-[0.12em] text-white/85 uppercase outline-none",
              "shadow-[inset_0_1px_0_color-mix(in_oklab,white_18%,transparent),inset_0_-1px_0_color-mix(in_oklab,black_30%,transparent)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "enabled:cursor-pointer enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-60",
            )}
            style={{
              backgroundColor: `color-mix(in oklab, ${body} 78%, black)`,
            }}
          >
            Shake
          </button>
        </div>
      </motion.div>
      <p id={hintId} className="sr-only">
        Turn to draw. Arrow keys turn it a step.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
