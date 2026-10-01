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
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PaintNumbersProps = {
  /** What the picture shows. Always its accessible name. */
  alt: string;
  /** The picture's address. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: an inline SVG or an image. */
  children?: React.ReactNode;
  /** Controlled: the picture may show. Uncontrolled, it is ready once it exists and the kit has been painted. */
  ready?: boolean;
  /** 0 to 1: how much of the kit may be painted while not ready. */
  progress?: number;
  /** Fires once the kit has lifted off and the picture is whole. */
  onReady?: () => void;
  /** How fast the kit is printed and painted, 0.5 to 2. @default 1 */
  speed?: number;
  /** How many regions the picture is cut into, 12 to 60. @default 30 */
  regions?: number;
  /** Print the paint numbers in the regions and on the pots. @default true */
  numbers?: boolean;
  /** Play the paint the visitor lays by hand. Off unless asked for. @default false */
  sound?: boolean;
  /** The kit still paints itself; previews and painting by hand are off. */
  disabled?: boolean;
  /** Sizes the box. @default "aspect-[4/3] w-full" */
  className?: string;
};

/** Steps along a brush stroke: a frame only writes the pixels it newly covers. */
const BUCKETS = 24;
/** Clock seconds (at speed 1) for the outline to wipe in, and for painting to begin. */
const OUTLINE = 0.5;
const PAINT_AT = 0.6;
/** Clock seconds to paint a whole kit at speed 1, rinses included. */
const RUN = 3.3;
/** The ceiling on traced pixels: device resolution, capped at 2×, and at this. */
const MOST_PIXELS = 300_000;
/** Seeds are found on a copy this small; only the last assignment is full size. */
const WORK_PIXELS = 12_000;
/** How strongly a region holds its shape against the picture's colours. */
const COMPACT = 0.06;
const NEVER = Number.POSITIVE_INFINITY;
/** A pentatonic step for each paint number: nine paints, one short scale. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** An integer hash as a fraction in [0, 1). Unsigned shifts throughout. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

/** A small seeded generator: the same kit for the same picture, every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------------------------------------------------------- colour */

const LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

/** sRGB bytes to OKLab: the space where "looks alike" is a short distance. */
function toLab(data: Uint8ClampedArray, n: number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let p = 0; p < n; p += 1) {
    const i = p * 4;
    const r = LINEAR[data[i]!]!;
    const g = LINEAR[data[i + 1]!]!;
    const b = LINEAR[data[i + 2]!]!;
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    out[p * 3] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    out[p * 3 + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    out[p * 3 + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  }
  return out;
}

function toRgb(L: number, A: number, B: number): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  const channel = (c: number) => {
    const v = clamp01(c);
    const g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(g * 255);
  };
  return [
    channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    channel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Any CSS colour, resolved by the canvas itself, as bytes. */
function rgbOf(colour: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [128, 128, 128];
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 128, d[1] ?? 128, d[2] ?? 128];
}

/** A 3×3 box blur on three channels: anti-aliased edges stop making specks. */
function blur(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const a = (y * w + Math.max(0, x - 1)) * 3;
      const b = (y * w + x) * 3;
      const c = (y * w + Math.min(w - 1, x + 1)) * 3;
      for (let k = 0; k < 3; k += 1) {
        tmp[b + k] = (src[a + k]! + src[b + k]! + src[c + k]!) / 3;
      }
    }
  }
  for (let y = 0; y < h; y += 1) {
    const up = Math.max(0, y - 1) * w;
    const down = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x += 1) {
      const a = (up + x) * 3;
      const b = (y * w + x) * 3;
      const c = (down + x) * 3;
      for (let k = 0; k < 3; k += 1) {
        out[b + k] = (tmp[a + k]! + tmp[b + k]! + tmp[c + k]!) / 3;
      }
    }
  }
  return out;
}

/** A soft landscape in the ink's hue, for a picture whose pixels cannot be read. */
function field(w: number, h: number, ink: Float32Array): Float32Array {
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / w;
      const v = y / h;
      const t =
        0.5 +
        0.25 * Math.sin(u * 6.1 + v * 2.3) +
        0.25 * Math.sin(v * 7.7 - u * 3.1);
      const p = (y * w + x) * 3;
      out[p] = 0.38 + 0.3 * (1 - v) + 0.24 * t;
      out[p + 1] = ink[1]! * 0.6;
      out[p + 2] = ink[2]! * 0.6;
    }
  }
  return out;
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
 * Reads the picture as it sits in its box, at any resolution asked for. A
 * cross-origin image that taints the canvas reads as nothing, and the kit
 * falls back to the ink.
 */
async function samplerOf(
  host: HTMLElement,
  paper: string,
): Promise<Sampler | null> {
  const box = host.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return null;
  const img = host.querySelector("img");
  const svg = host.querySelector("svg");
  let draw:
    ((ctx: CanvasRenderingContext2D, sx: number, sy: number) => void) | null =
    null;
  if (img && img.complete && img.naturalWidth > 0) {
    const r = img.getBoundingClientRect();
    // The image covers its box: crop the middle of it the same way.
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
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);
    try {
      paint(ctx, width / box.width, height / box.height);
      return ctx.getImageData(0, 0, width, height).data;
    } catch {
      return null;
    }
  };
}

/* ------------------------------------------------------------------ kit */

type Paint = { r: number; g: number; b: number; L: number; regions: number };

type Kit = {
  w: number;
  h: number;
  /** Device pixels per CSS pixel. */
  scale: number;
  count: number;
  /** The region under every pixel. */
  label: Int32Array;
  /** Each region's paint, an index into `palette`. */
  paint: Int32Array;
  /** Paints, lightest first: paint 0 is number 1. */
  palette: Paint[];
  /** Each pixel's distance in to its region's edge, device px, capped at 255. */
  dist: Uint8Array;
  /** 1 on the printed outline. */
  edge: Uint8Array;
  labelX: Float32Array;
  labelY: Float32Array;
  /** The number's size, CSS px. */
  labelSize: Float32Array;
  /** How far along its stroke the number sits, 0 to 1. */
  labelKey: Float32Array;
  /** x0, y0, x1, y1 of each region. */
  box: Int32Array;
  centreX: Float32Array;
  /** Pixels grouped by region, then by step along the stroke. */
  order: Int32Array;
  starts: Int32Array;
  /** Each pixel's streak: paint is laid in strokes, never flat. */
  shade: Int8Array;
  /** Regions in the order they are painted, with their times. */
  sequence: Int32Array;
  planStart: Float32Array;
  planDur: Float32Array;
};

/**
 * Traces a paint-by-numbers kit from the picture: superpixels that follow
 * its edges, made whole, given paints from a small palette of its own
 * colours, a number each where there is most room, and a brush direction.
 */
function buildKit(
  sample: Sampler | null,
  cssW: number,
  cssH: number,
  dpr: number,
  wanted: number,
  ink: Float32Array,
): Kit {
  const scale = Math.max(
    0.5,
    Math.min(2, dpr, Math.sqrt(MOST_PIXELS / (cssW * cssH))),
  );
  const w = Math.max(16, Math.round(cssW * scale));
  const h = Math.max(16, Math.round(cssH * scale));
  const n = w * h;
  const raw = sample ? sample(w, h) : null;
  const colour = blur(raw ? toLab(raw, n) : field(w, h, ink), w, h);

  // Seeds are found on a small copy; clustering is the slow part and only
  // has to find the regions, not draw them.
  const f = Math.max(1, Math.round(Math.sqrt(n / WORK_PIXELS)));
  const ww = Math.max(4, Math.floor(w / f));
  const wh = Math.max(4, Math.floor(h / f));
  const small = new Float32Array(ww * wh * 3);
  for (let y = 0; y < wh; y += 1) {
    for (let x = 0; x < ww; x += 1) {
      let L = 0;
      let A = 0;
      let B = 0;
      for (let dy = 0; dy < f; dy += 1) {
        for (let dx = 0; dx < f; dx += 1) {
          const q = ((y * f + dy) * w + x * f + dx) * 3;
          L += colour[q]!;
          A += colour[q + 1]!;
          B += colour[q + 2]!;
        }
      }
      const q = (y * ww + x) * 3;
      small[q] = L / (f * f);
      small[q + 1] = A / (f * f);
      small[q + 2] = B / (f * f);
    }
  }

  const want = Math.max(4, Math.min(80, Math.round(wanted)));
  const nx = Math.max(1, Math.round(Math.sqrt((want * ww) / wh)));
  const ny = Math.max(1, Math.round(want / nx));
  const k = nx * ny;
  const S = Math.sqrt((ww * wh) / k);
  const seeds = new Float32Array(k * 5);
  const rand = lcg(0x5eed1207 + want);
  const at = (x: number, y: number) =>
    (Math.min(wh - 1, Math.max(0, Math.round(y))) * ww +
      Math.min(ww - 1, Math.max(0, Math.round(x)))) *
    3;
  const grad = (x: number, y: number) => {
    const a = at(x - 1, y);
    const b = at(x + 1, y);
    const c = at(x, y - 1);
    const d = at(x, y + 1);
    let g = 0;
    for (let i = 0; i < 3; i += 1) {
      g +=
        (small[b + i]! - small[a + i]!) ** 2 +
        (small[d + i]! - small[c + i]!) ** 2;
    }
    return g;
  };
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      let x =
        ((i + 0.5 + (j % 2 ? 0.2 : -0.2) + (rand() - 0.5) * 0.24) * ww) / nx;
      let y = ((j + 0.5 + (rand() - 0.5) * 0.24) * wh) / ny;
      x = Math.min(ww - 1, Math.max(0, x));
      y = Math.min(wh - 1, Math.max(0, y));
      // Off an edge: a seed on a border would straddle two regions.
      let bx = Math.round(x);
      let by = Math.round(y);
      let bg = grad(bx, by);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const g = grad(bx + dx, by + dy);
          if (g < bg) {
            bg = g;
            bx += dx;
            by += dy;
          }
        }
      }
      const q = at(bx, by);
      const s = (j * nx + i) * 5;
      seeds[s] = Math.min(ww - 1, Math.max(0, bx));
      seeds[s + 1] = Math.min(wh - 1, Math.max(0, by));
      seeds[s + 2] = small[q]!;
      seeds[s + 3] = small[q + 1]!;
      seeds[s + 4] = small[q + 2]!;
    }
  }

  const m2 = (COMPACT * COMPACT) / (S * S);
  const own = new Int32Array(ww * wh);
  const best = new Float32Array(ww * wh);
  const sums = new Float64Array(k * 6);
  for (let it = 0; it < 8; it += 1) {
    best.fill(NEVER);
    own.fill(-1);
    for (let s = 0; s < k; s += 1) {
      const sx = seeds[s * 5]!;
      const sy = seeds[s * 5 + 1]!;
      const x0 = Math.max(0, Math.floor(sx - 2 * S));
      const x1 = Math.min(ww - 1, Math.ceil(sx + 2 * S));
      const y0 = Math.max(0, Math.floor(sy - 2 * S));
      const y1 = Math.min(wh - 1, Math.ceil(sy + 2 * S));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const q = y * ww + x;
          const dL = small[q * 3]! - seeds[s * 5 + 2]!;
          const dA = small[q * 3 + 1]! - seeds[s * 5 + 3]!;
          const dB = small[q * 3 + 2]! - seeds[s * 5 + 4]!;
          const d =
            dL * dL + dA * dA + dB * dB + ((x - sx) ** 2 + (y - sy) ** 2) * m2;
          if (d < best[q]!) {
            best[q] = d;
            own[q] = s;
          }
        }
      }
    }
    sums.fill(0);
    for (let y = 0; y < wh; y += 1) {
      for (let x = 0; x < ww; x += 1) {
        const q = y * ww + x;
        const s = own[q]!;
        if (s < 0) continue;
        sums[s * 6] = sums[s * 6]! + x;
        sums[s * 6 + 1] = sums[s * 6 + 1]! + y;
        sums[s * 6 + 2] = sums[s * 6 + 2]! + small[q * 3]!;
        sums[s * 6 + 3] = sums[s * 6 + 3]! + small[q * 3 + 1]!;
        sums[s * 6 + 4] = sums[s * 6 + 4]! + small[q * 3 + 2]!;
        sums[s * 6 + 5] = sums[s * 6 + 5]! + 1;
      }
    }
    for (let s = 0; s < k; s += 1) {
      const c = sums[s * 6 + 5]!;
      if (c <= 0) continue;
      for (let i = 0; i < 5; i += 1) seeds[s * 5 + i] = sums[s * 6 + i]! / c;
    }
  }

  // The last assignment at full size, so borders follow the picture to the
  // device pixel.
  const fx = w / ww;
  const fy = h / wh;
  const SD = S * fx;
  const m2d = (COMPACT * COMPACT) / (SD * SD);
  let label = new Int32Array(n).fill(-1);
  const bestD = new Float32Array(n).fill(NEVER);
  for (let s = 0; s < k; s += 1) {
    const sx = (seeds[s * 5]! + 0.5) * fx - 0.5;
    const sy = (seeds[s * 5 + 1]! + 0.5) * fy - 0.5;
    const x0 = Math.max(0, Math.floor(sx - 2 * SD));
    const x1 = Math.min(w - 1, Math.ceil(sx + 2 * SD));
    const y0 = Math.max(0, Math.floor(sy - 2 * SD));
    const y1 = Math.min(h - 1, Math.ceil(sy + 2 * SD));
    const sL = seeds[s * 5 + 2]!;
    const sA = seeds[s * 5 + 3]!;
    const sB = seeds[s * 5 + 4]!;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const p = y * w + x;
        const dL = colour[p * 3]! - sL;
        const dA = colour[p * 3 + 1]! - sA;
        const dB = colour[p * 3 + 2]! - sB;
        const d =
          dL * dL + dA * dA + dB * dB + ((x - sx) ** 2 + (y - sy) ** 2) * m2d;
        if (d < bestD[p]!) {
          bestD[p] = d;
          label[p] = s;
        }
      }
    }
  }
  let carry = 0;
  for (let p = 0; p < n; p += 1) {
    if (label[p]! >= 0) {
      carry = label[p]!;
      break;
    }
  }
  for (let p = 0; p < n; p += 1) {
    if (label[p]! < 0) label[p] = carry;
    else carry = label[p]!;
  }

  // Whole regions: a region's stray fragments, and any speck, join the
  // region beside them.
  const comp = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const compLabel: number[] = [];
  const compSize: number[] = [];
  const compNext: number[] = [];
  for (let p = 0; p < n; p += 1) {
    if (comp[p]! >= 0) continue;
    const c = compLabel.length;
    const l = label[p]!;
    let head = 0;
    let tail = 0;
    let next = -1;
    queue[tail++] = p;
    comp[p] = c;
    while (head < tail) {
      const q = queue[head++]!;
      const x = q % w;
      const around = [
        x > 0 ? q - 1 : -1,
        x < w - 1 ? q + 1 : -1,
        q >= w ? q - w : -1,
        q + w < n ? q + w : -1,
      ];
      for (const r of around) {
        if (r < 0) continue;
        if (label[r] === l) {
          if (comp[r]! < 0) {
            comp[r] = c;
            queue[tail++] = r;
          }
        } else if (next < 0) {
          next = r;
        }
      }
    }
    compLabel.push(l);
    compSize.push(tail);
    compNext.push(next);
  }
  const minArea = Math.max(6, Math.round(SD * SD * 0.12));
  const biggest = new Map<number, number>();
  compLabel.forEach((l, c) => {
    const b = biggest.get(l);
    if (b === undefined || compSize[c]! > compSize[b]!) biggest.set(l, c);
  });
  const keep = compLabel.map(
    (l, c) => biggest.get(l) === c && compSize[c]! >= minArea,
  );
  const target = compLabel.map((_, c) => c);
  compLabel.forEach((_, c) => {
    if (keep[c]) return;
    let t = c;
    for (let hop = 0; hop < 12; hop += 1) {
      const nb = compNext[t]!;
      if (nb < 0) break;
      t = comp[nb]!;
      if (keep[t]) break;
    }
    if (keep[t]) target[c] = t;
    else keep[c] = true;
  });
  const id = new Int32Array(compLabel.length).fill(-1);
  let count = 0;
  compLabel.forEach((_, c) => {
    if (keep[c]) id[c] = count++;
  });
  const relabel = new Int32Array(n);
  for (let p = 0; p < n; p += 1) {
    const c = comp[p]!;
    relabel[p] = id[keep[c] ? c : target[c]!]!;
  }
  label = relabel;

  // Each region's size, colour, extent and middle.
  const area = new Float64Array(count);
  const mean = new Float64Array(count * 3);
  const box = new Int32Array(count * 4);
  const sumX = new Float64Array(count);
  const sumY = new Float64Array(count);
  for (let r = 0; r < count; r += 1) {
    box[r * 4] = w;
    box[r * 4 + 1] = h;
    box[r * 4 + 2] = -1;
    box[r * 4 + 3] = -1;
  }
  for (let p = 0; p < n; p += 1) {
    const r = label[p]!;
    const x = p % w;
    const y = (p - x) / w;
    area[r] = area[r]! + 1;
    mean[r * 3] = mean[r * 3]! + colour[p * 3]!;
    mean[r * 3 + 1] = mean[r * 3 + 1]! + colour[p * 3 + 1]!;
    mean[r * 3 + 2] = mean[r * 3 + 2]! + colour[p * 3 + 2]!;
    sumX[r] = sumX[r]! + x;
    sumY[r] = sumY[r]! + y;
    if (x < box[r * 4]!) box[r * 4] = x;
    if (y < box[r * 4 + 1]!) box[r * 4 + 1] = y;
    if (x > box[r * 4 + 2]!) box[r * 4 + 2] = x;
    if (y > box[r * 4 + 3]!) box[r * 4 + 3] = y;
  }
  for (let r = 0; r < count; r += 1) {
    const a = Math.max(1, area[r]!);
    for (let i = 0; i < 3; i += 1) mean[r * 3 + i] = mean[r * 3 + i]! / a;
  }

  // The palette: the regions' colours, clustered, weighted by area.
  const P = Math.min(
    count,
    Math.max(4, Math.min(9, Math.round(count / 5) + 2)),
  );
  const centres: number[][] = [];
  let first = 0;
  for (let r = 1; r < count; r += 1) if (area[r]! > area[first]!) first = r;
  centres.push([mean[first * 3]!, mean[first * 3 + 1]!, mean[first * 3 + 2]!]);
  const d2 = (r: number, c: number[]) =>
    (mean[r * 3]! - c[0]!) ** 2 +
    (mean[r * 3 + 1]! - c[1]!) ** 2 +
    (mean[r * 3 + 2]! - c[2]!) ** 2;
  while (centres.length < P) {
    let far = 0;
    let farD = -1;
    for (let r = 0; r < count; r += 1) {
      let near = NEVER;
      for (const c of centres) near = Math.min(near, d2(r, c));
      const score = near * Math.sqrt(area[r]!);
      if (score > farD) {
        farD = score;
        far = r;
      }
    }
    centres.push([mean[far * 3]!, mean[far * 3 + 1]!, mean[far * 3 + 2]!]);
  }
  const which = new Int32Array(count);
  for (let it = 0; it < 12; it += 1) {
    for (let r = 0; r < count; r += 1) {
      let bi = 0;
      let bd = NEVER;
      centres.forEach((c, i) => {
        const d = d2(r, c);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      which[r] = bi;
    }
    centres.forEach((c, i) => {
      let wsum = 0;
      const acc = [0, 0, 0];
      for (let r = 0; r < count; r += 1) {
        if (which[r] !== i) continue;
        wsum += area[r]!;
        for (let j = 0; j < 3; j += 1)
          acc[j] = acc[j]! + mean[r * 3 + j]! * area[r]!;
      }
      if (wsum > 0) for (let j = 0; j < 3; j += 1) c[j] = acc[j]! / wsum;
    });
  }
  const used = centres
    .map((c, i) => ({ c, i, n: 0 }))
    .map((e) => {
      for (let r = 0; r < count; r += 1) if (which[r] === e.i) e.n += 1;
      return e;
    })
    .filter((e) => e.n > 0)
    .sort((a, b) => b.c[0]! - a.c[0]!);
  const rank = new Map(used.map((e, i) => [e.i, i]));
  const paint = new Int32Array(count);
  for (let r = 0; r < count; r += 1) paint[r] = rank.get(which[r]!) ?? 0;
  const palette: Paint[] = used.map((e) => {
    const [r, g, b] = toRgb(e.c[0]!, e.c[1]!, e.c[2]!);
    return { r, g, b, L: e.c[0]!, regions: e.n };
  });

  // Where each number goes: the point with most room around it.
  const dt = new Float32Array(n);
  for (let p = 0; p < n; p += 1) {
    const x = p % w;
    const l = label[p]!;
    const onEdge =
      x === 0 ||
      x === w - 1 ||
      p < w ||
      p >= n - w ||
      label[p - 1] !== l ||
      label[p + 1] !== l ||
      label[p - w] !== l ||
      label[p + w] !== l;
    dt[p] = onEdge ? 1 : 1e9;
  }
  const DIAG = Math.SQRT2;
  for (let y = 1; y < h; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      dt[p] = Math.min(
        dt[p]!,
        dt[p - 1]! + 1,
        dt[p - w]! + 1,
        dt[p - w - 1]! + DIAG,
        dt[p - w + 1]! + DIAG,
      );
    }
  }
  for (let y = h - 2; y >= 0; y -= 1) {
    for (let x = w - 2; x >= 1; x -= 1) {
      const p = y * w + x;
      dt[p] = Math.min(
        dt[p]!,
        dt[p + 1]! + 1,
        dt[p + w]! + 1,
        dt[p + w + 1]! + DIAG,
        dt[p + w - 1]! + DIAG,
      );
    }
  }
  const dist = new Uint8Array(n);
  const labelX = new Float32Array(count);
  const labelY = new Float32Array(count);
  const room = new Float32Array(count);
  for (let p = 0; p < n; p += 1) {
    const d = dt[p]!;
    dist[p] = Math.min(255, Math.round(d));
    const r = label[p]!;
    if (d > room[r]!) {
      room[r] = d;
      const x = p % w;
      labelX[r] = x + 0.5;
      labelY[r] = (p - x) / w + 0.5;
    }
  }
  const labelSize = new Float32Array(count);
  for (let r = 0; r < count; r += 1) {
    labelSize[r] = Math.min(12, Math.max(6.5, (room[r]! / scale) * 0.9));
  }

  // Strokes: each region is painted along its own direction, with a
  // bristled front and streaks along it.
  const cosA = new Float32Array(count);
  const sinA = new Float32Array(count);
  const lo = new Float32Array(count).fill(NEVER);
  const hi = new Float32Array(count).fill(-NEVER);
  const turn = lcg(0x0b5e55ed + count);
  for (let r = 0; r < count; r += 1) {
    let a = (turn() - 0.5) * 1.1;
    if (turn() < 0.25) a += Math.PI / 2;
    cosA[r] = Math.cos(a);
    sinA[r] = Math.sin(a);
  }
  for (let p = 0; p < n; p += 1) {
    const r = label[p]!;
    const x = p % w;
    const y = (p - x) / w;
    const pr = x * cosA[r]! + y * sinA[r]!;
    if (pr < lo[r]!) lo[r] = pr;
    if (pr > hi[r]!) hi[r] = pr;
  }
  const bucket = new Uint8Array(n);
  const shade = new Int8Array(n);
  const tally = new Int32Array(count * BUCKETS + 1);
  const labelKey = new Float32Array(count);
  for (let p = 0; p < n; p += 1) {
    const r = label[p]!;
    const x = p % w;
    const y = (p - x) / w;
    const pr = x * cosA[r]! + y * sinA[r]!;
    const across = -x * sinA[r]! + y * cosA[r]!;
    const bristle = hash01(Math.floor(across / (1.8 * scale)) * 131 + r * 7919);
    const key = clamp01(
      (pr - lo[r]!) / (hi[r]! - lo[r]! + 1e-3) + (bristle - 0.5) * 0.07,
    );
    const b = Math.min(BUCKETS - 1, Math.floor(key * BUCKETS));
    bucket[p] = b;
    tally[r * BUCKETS + b + 1] = tally[r * BUCKETS + b + 1]! + 1;
    shade[p] = Math.round(
      (hash01(Math.floor(across / (2.6 * scale)) * 977 + r * 31) - 0.5) * 16,
    );
  }
  for (let r = 0; r < count; r += 1) {
    const lx = Math.floor(labelX[r]!);
    const ly = Math.floor(labelY[r]!);
    const pr = lx * cosA[r]! + ly * sinA[r]!;
    labelKey[r] = clamp01((pr - lo[r]!) / (hi[r]! - lo[r]! + 1e-3));
  }
  const starts = new Int32Array(count * BUCKETS + 1);
  for (let i = 1; i <= count * BUCKETS; i += 1) {
    starts[i] = starts[i - 1]! + tally[i]!;
  }
  const cursor = starts.slice();
  const order = new Int32Array(n);
  for (let p = 0; p < n; p += 1) {
    const slot = label[p]! * BUCKETS + bucket[p]!;
    order[cursor[slot]!] = p;
    cursor[slot] = cursor[slot]! + 1;
  }

  const edge = new Uint8Array(n);
  const thick = scale >= 1.5;
  for (let p = 0; p < n; p += 1) {
    const x = p % w;
    const l = label[p]!;
    if (x < w - 1 && label[p + 1] !== l) {
      edge[p] = 1;
      if (thick) edge[p + 1] = 1;
    }
    if (p + w < n && label[p + w] !== l) {
      edge[p] = 1;
      if (thick) edge[p + w] = 1;
    }
  }

  // The order a hand would paint it: number by number, and within a number
  // in three bands, back and forth.
  const centreX = new Float32Array(count);
  const ids = Array.from({ length: count }, (_, r) => r);
  const band = (r: number) =>
    Math.min(2, Math.floor((sumY[r]! / Math.max(1, area[r]!) / h) * 3));
  for (let r = 0; r < count; r += 1) {
    centreX[r] = sumX[r]! / Math.max(1, area[r]!) / w;
  }
  ids.sort((a, b) => {
    if (paint[a] !== paint[b]) return paint[a]! - paint[b]!;
    const ba = band(a);
    const bb = band(b);
    if (ba !== bb) return ba - bb;
    return ba % 2 ? centreX[b]! - centreX[a]! : centreX[a]! - centreX[b]!;
  });
  const sequence = Int32Array.from(ids);
  const planStart = new Float32Array(count);
  const planDur = new Float32Array(count);
  let t = 0;
  let end = 0;
  ids.forEach((r, i) => {
    if (i > 0 && paint[r] !== paint[ids[i - 1]!]) t += 0.14;
    const d = 0.14 + 0.55 * Math.sqrt(area[r]! / n);
    planStart[i] = t;
    planDur[i] = d;
    end = Math.max(end, t + d);
    t += d * 0.6;
  });
  const fit = RUN / Math.max(0.1, end);
  for (let i = 0; i < count; i += 1) {
    planStart[i] = planStart[i]! * fit;
    planDur[i] = Math.max(0.07, planDur[i]! * fit);
  }

  return {
    w,
    h,
    scale,
    count,
    label,
    paint,
    palette,
    dist,
    edge,
    labelX,
    labelY,
    labelSize,
    labelKey,
    box,
    centreX,
    order,
    starts,
    shade,
    sequence,
    planStart,
    planDur,
  };
}

/* ------------------------------------------------------------ component */

type Run = {
  clock: number;
  last: number;
  paintT0: number;
  front: Float32Array;
  start: Float64Array;
  dur: Float64Array;
  drawn: Int16Array;
  covered: Uint8Array;
  image: ImageData | null;
  dirty: [number, number, number, number] | null;
  finished: number;
  ownReady: boolean;
  resolving: boolean;
};

type Colours = {
  ink: [number, number, number];
  label: string;
  accent: string;
  font: string;
  paper: string;
};

type PotInfo = {
  index: number;
  fill: string;
  light: boolean;
  regions: number;
};

type Api = {
  install: (kit: Kit) => void;
  schedule: () => void;
  readyChanged: (ready: boolean) => void;
  fresh: () => void;
  recolour: () => void;
  drawNumbers: () => void;
  drawVeil: () => void;
  kick: () => void;
  hoverAt: (clientX: number, clientY: number) => void;
  pressAt: (clientX: number, clientY: number) => void;
  paintByHand: (paint: number, pan: number) => void;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * An image placeholder that arrives as a paint-by-numbers kit traced from
 * the picture itself. The picture is cut into regions that follow its edges,
 * each with the number of the paint nearest its colour; the outline is
 * printed, and the regions are painted in number order with brush strokes
 * that sweep across them. When the last is painted and the picture is ready,
 * the kit lifts off and the picture resolves through it.
 *
 * Hovering a number, or a paint pot, shows every region of that colour; a
 * press paints them all at once, with a plip for each. The pots are a real
 * toolbar: arrow keys move between colours, focus shows them, Enter paints.
 * Under reduced motion the outline fades in, each region fills at once at
 * its turn, and the resolve is a cross-fade; the kit still paints in order,
 * because how far it has got is the information.
 */
export function PaintNumbers({
  alt,
  src,
  children,
  ready,
  progress,
  onReady,
  speed = 1,
  regions = 30,
  numbers = true,
  sound = false,
  disabled = false,
  className,
}: PaintNumbersProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const wanted = Math.round(Math.max(4, Math.min(80, regions)));
  const spd = Math.max(0.25, Math.min(4, speed));

  // A picture from `src` exists once it has loaded; children exist at once.
  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const loaded = src === undefined || loadedSrc === src;
  const [ownReady, setOwnReady] = React.useState(false);
  const controlled = ready !== undefined;
  const isReady = controlled ? ready : ownReady;
  const [done, setDone] = React.useState(false);
  const [lifting, setLifting] = React.useState(false);
  const [pots, setPots] = React.useState<PotInfo[] | null>(null);
  const [finished, setFinished] = React.useState(0);
  const [hoverHot, setHoverHot] = React.useState<number | null>(null);
  const [focusHot, setFocusHot] = React.useState<number | null>(null);
  const [activePot, setActivePot] = React.useState(0);
  const [size, setSize] = React.useState<{
    w: number;
    h: number;
    dpr: number;
  } | null>(null);
  const [themeTick, setThemeTick] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const hot = disabled || done ? null : (hoverHot ?? focusHot);

  const wipe = useMotionValue(0);
  const linesIn = useMotionValue(0);
  const numbersIn = useMotionValue(0);
  const fade = useMotionValue(0);
  const veilOn = useMotionValue(0);

  const clip = useTransform(wipe, (v) =>
    v >= 1 ? "none" : `polygon(0% 0%, ${r2(v * 200)}% 0%, 0% ${r2(v * 200)}%)`,
  );
  const coverOpacity = useTransform(fade, (v) => r2(1 - clamp01(v / 0.8)));
  const linesOpacity = useTransform(
    [linesIn, fade] as MotionValue<number>[],
    ([a = 0, v = 0]: number[]) => r2(a * (1 - clamp01((v - 0.3) / 0.7))),
  );
  const numbersOpacity = useTransform(
    [numbersIn, fade] as MotionValue<number>[],
    ([a = 0, v = 0]: number[]) => r2(a * (1 - clamp01(v / 0.3))),
  );
  const veilOpacity = useTransform(
    [veilOn, fade] as MotionValue<number>[],
    ([a = 0, v = 0]: number[]) => r2(a * (1 - clamp01(v / 0.3))),
  );
  const potsOpacity = useTransform(fade, (v) => r2(1 - clamp01(v / 0.4)));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pictureRef = React.useRef<HTMLDivElement | null>(null);
  const coverRef = React.useRef<HTMLDivElement | null>(null);
  const paintRef = React.useRef<HTMLCanvasElement | null>(null);
  const linesRef = React.useRef<HTMLCanvasElement | null>(null);
  const veilRef = React.useRef<HTMLCanvasElement | null>(null);
  const numbersRef = React.useRef<HTMLCanvasElement | null>(null);
  const potsRef = React.useRef<HTMLDivElement | null>(null);
  const kit = React.useRef<Kit | null>(null);
  const run = React.useRef<Run | null>(null);
  const colours = React.useRef<Colours | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(true);
  const timers = React.useRef<number[]>([]);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const veilAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const api = React.useRef<Api | null>(null);
  const latest = React.useRef({
    isReady,
    controlled,
    progress,
    spd,
    motionSafe,
    numbers,
    hot,
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
      numbers,
      hot,
      disabled,
      onReady,
    };
  });

  const readColours = (): Colours | null => {
    const lines = linesRef.current;
    const label = numbersRef.current;
    const veil = veilRef.current;
    const cover = coverRef.current;
    if (!lines || !label || !veil || !cover) return null;
    const ls = getComputedStyle(label);
    return {
      ink: rgbOf(getComputedStyle(lines).color),
      label: ls.color,
      accent: getComputedStyle(veil).color,
      font: ls.fontFamily || "monospace",
      paper: getComputedStyle(cover).backgroundColor,
    };
  };

  const size2d = (canvas: HTMLCanvasElement | null, k: Kit) => {
    if (!canvas) return null;
    if (canvas.width !== k.w) canvas.width = k.w;
    if (canvas.height !== k.h) canvas.height = k.h;
    return canvas.getContext("2d");
  };

  const drawLines = () => {
    const k = kit.current;
    const c = colours.current;
    if (!k || !c) return;
    const ctx = size2d(linesRef.current, k);
    if (!ctx) return;
    const image = ctx.createImageData(k.w, k.h);
    const d = image.data;
    const [r, g, b] = c.ink;
    for (let p = 0; p < k.w * k.h; p += 1) {
      if (!k.edge[p]) continue;
      d[p * 4] = r;
      d[p * 4 + 1] = g;
      d[p * 4 + 2] = b;
      d[p * 4 + 3] = 215;
    }
    ctx.putImageData(image, 0, 0);
  };

  const drawNumbers = () => {
    const k = kit.current;
    const s = run.current;
    const c = colours.current;
    if (!k || !s || !c) return;
    const ctx = size2d(numbersRef.current, k);
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, k.w, k.h);
    const L = latest.current;
    if (!L.numbers) return;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let r = 0; r < k.count; r += 1) {
      const p = k.paint[r]!;
      const isHot = L.hot === p;
      if (s.covered[r] && !isHot) continue;
      const px = r2(k.labelSize[r]! * k.scale);
      ctx.font = `${isHot ? 700 : 500} ${px}px ${c.font}`;
      ctx.fillStyle = isHot ? c.accent : c.label;
      ctx.globalAlpha = s.covered[r] ? 0.9 : 0.85;
      ctx.fillText(String(p + 1), k.labelX[r]!, k.labelY[r]! + px * 0.04);
    }
    ctx.globalAlpha = 1;
  };

  const drawVeil = () => {
    const k = kit.current;
    const c = colours.current;
    const L = latest.current;
    const p0 = L.hot;
    veilAnim.current?.stop();
    if (p0 === null || !k || !c) {
      veilAnim.current = animate(veilOn, 0, {
        duration: durations.fast,
        ease: easings.exit,
      });
      return;
    }
    const ctx = size2d(veilRef.current, k);
    if (!ctx) return;
    const image = ctx.createImageData(k.w, k.h);
    const d = image.data;
    const colour = k.palette[p0];
    if (!colour) return;
    const [ir, ig, ib] = c.ink;
    const stripe = Math.max(2, Math.round(3 * k.scale));
    const band = 1.6 * k.scale + 0.5;
    for (let p = 0; p < k.w * k.h; p += 1) {
      if (k.paint[k.label[p]!] !== p0) continue;
      const x = p % k.w;
      const y = (p - x) / k.w;
      const o = p * 4;
      if (k.dist[p]! <= band) {
        d[o] = ir;
        d[o + 1] = ig;
        d[o + 2] = ib;
        d[o + 3] = 255;
      } else {
        // A hatched wash of the paint: where colour 3 goes.
        const on = (x + y) % (stripe * 2) < stripe;
        d[o] = colour.r;
        d[o + 1] = colour.g;
        d[o + 2] = colour.b;
        d[o + 3] = on ? 200 : 90;
      }
    }
    ctx.putImageData(image, 0, 0);
    veilAnim.current = animate(veilOn, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
  };

  const flush = () => {
    const s = run.current;
    const ctx = paintRef.current?.getContext("2d");
    if (!s || !s.image || !s.dirty || !ctx) return;
    const [x0, y0, x1, y1] = s.dirty;
    ctx.putImageData(s.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    s.dirty = null;
  };

  /** Lays a region's paint up to `f` of its stroke: only the new pixels. */
  const paintTo = (r: number, f: number) => {
    const k = kit.current;
    const s = run.current;
    if (!k || !s || !s.image) return false;
    const to = f >= 1 ? BUCKETS : Math.floor(f * BUCKETS);
    const from = s.drawn[r]!;
    let changed = false;
    if (to > from) {
      const c = k.palette[k.paint[r]!];
      const d = s.image.data;
      if (c) {
        const end = k.starts[r * BUCKETS + to]!;
        for (let i = k.starts[r * BUCKETS + from]!; i < end; i += 1) {
          const p = k.order[i]!;
          const o = p * 4;
          const sh = k.shade[p]!;
          d[o] = c.r + sh;
          d[o + 1] = c.g + sh;
          d[o + 2] = c.b + sh;
          d[o + 3] = 255;
        }
      }
      s.drawn[r] = to;
      const b: [number, number, number, number] = [
        k.box[r * 4]!,
        k.box[r * 4 + 1]!,
        k.box[r * 4 + 2]!,
        k.box[r * 4 + 3]!,
      ];
      s.dirty = s.dirty
        ? [
            Math.min(s.dirty[0], b[0]),
            Math.min(s.dirty[1], b[1]),
            Math.max(s.dirty[2], b[2]),
            Math.max(s.dirty[3], b[3]),
          ]
        : b;
    }
    if (!s.covered[r] && f >= k.labelKey[r]!) {
      s.covered[r] = 1;
      changed = true;
    }
    return changed;
  };

  const kick = () => {
    if (frame.current || !kit.current || !run.current) return;
    if (!visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(tick);
  };

  const allowedCount = () => {
    const k = kit.current;
    if (!k) return 0;
    const L = latest.current;
    if (L.isReady) return k.count;
    if (L.progress !== undefined) {
      return Math.floor(clamp01(L.progress) * (k.count - 1) + 1e-6);
    }
    return k.count - 1;
  };

  const schedule = () => {
    const k = kit.current;
    const s = run.current;
    if (!k || !s || s.resolving) return;
    const L = latest.current;
    const allowed = allowedCount();
    let waiting = 0;
    for (let i = 0; i < allowed; i += 1) {
      if (s.start[k.sequence[i]!] === NEVER) waiting += 1;
    }
    if (waiting === 0) {
      settle();
      return;
    }
    // A host that says ready early gets the rest in one quick pass.
    const rush = L.isReady && L.controlled && waiting > 1;
    const step = Math.min(0.05, 0.6 / waiting) * L.spd;
    let slot = s.clock;
    for (let i = 0; i < allowed; i += 1) {
      const r = k.sequence[i]!;
      if (s.start[r] !== NEVER) continue;
      if (rush) {
        s.start[r] = slot;
        s.dur[r] = 0.2 * L.spd;
        slot += step;
      } else {
        const at = Math.max(s.paintT0 + k.planStart[i]!, slot);
        s.start[r] = at;
        s.dur[r] = k.planDur[i]!;
        slot = at + 0.03;
      }
    }
    kick();
  };

  const resolve = () => {
    const s = run.current;
    if (!s || s.resolving) return;
    s.resolving = true;
    setLifting(true);
    if (potsRef.current?.contains(document.activeElement)) {
      pictureRef.current?.focus({ preventScroll: true });
    }
    const L = latest.current;
    anims.current.push(
      animate(fade, 1, {
        duration: L.motionSafe ? durations.page : durations.base,
        ease: easings.enter,
        onComplete: () => {
          setDone(true);
          latest.current.onReady?.();
        },
      }),
    );
  };

  /** After paint lands: is the kit's run over, and may the picture show? */
  const settle = () => {
    const k = kit.current;
    const s = run.current;
    if (!k || !s || s.resolving) return;
    const L = latest.current;
    if (!L.controlled && !s.ownReady) {
      const need = allowedCount();
      let all = need >= k.count - 1;
      for (let i = 0; all && i < need; i += 1) {
        if (s.front[k.sequence[i]!]! < 1) all = false;
      }
      if (all) {
        s.ownReady = true;
        setOwnReady(true);
      }
    }
    if (!L.isReady) return;
    for (let r = 0; r < k.count; r += 1) if (s.front[r]! < 1) return;
    resolve();
  };

  const tick = (now: number) => {
    frame.current = 0;
    const k = kit.current;
    const s = run.current;
    if (!k || !s || s.resolving) return;
    if (!visible.current || document.hidden) {
      s.last = 0;
      return;
    }
    const L = latest.current;
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 0;
    s.last = now;
    s.clock += dt * L.spd;
    if (L.motionSafe) {
      wipe.set(clamp01(s.clock / OUTLINE));
      linesIn.set(1);
    } else {
      wipe.set(1);
      linesIn.set(clamp01(s.clock / 0.3));
    }
    numbersIn.set(clamp01((s.clock - 0.2) / 0.35));

    let active = s.clock < PAINT_AT;
    let numbersDirty = false;
    let landed = false;
    for (let i = 0; i < k.count; i += 1) {
      const r = k.sequence[i]!;
      const at = s.start[r]!;
      if (at === NEVER || s.front[r]! >= 1) continue;
      active = true;
      if (s.clock < at) continue;
      const f = L.motionSafe ? Math.min(1, (s.clock - at) / s.dur[r]!) : 1;
      if (f <= s.front[r]!) continue;
      if (paintTo(r, f)) numbersDirty = true;
      s.front[r] = f;
      if (f >= 1) landed = true;
    }
    flush();
    if (numbersDirty) drawNumbers();
    if (landed) {
      let mask = 0;
      k.palette.forEach((_, p) => {
        let all = true;
        for (let r = 0; all && r < k.count; r += 1) {
          if (k.paint[r] === p && s.front[r]! < 1) all = false;
        }
        if (all) mask |= 1 << p;
      });
      if (mask !== s.finished) {
        s.finished = mask;
        setFinished(mask);
      }
      settle();
    }
    if (active && !s.resolving) {
      frame.current = window.requestAnimationFrame(tick);
    } else {
      s.last = 0;
    }
  };

  const install = (next: Kit) => {
    const prev = kit.current;
    const before = run.current;
    let kept = 0;
    if (prev && before) {
      while (kept < prev.count && before.front[prev.sequence[kept]!]! >= 1) {
        kept += 1;
      }
      kept = Math.min(
        next.count - 1,
        Math.round((kept * next.count) / prev.count),
      );
    }
    kit.current = next;
    const ctx = size2d(paintRef.current, next);
    const s: Run = {
      clock: before?.clock ?? 0,
      last: 0,
      paintT0: PAINT_AT,
      front: new Float32Array(next.count),
      start: new Float64Array(next.count).fill(NEVER),
      dur: new Float64Array(next.count).fill(1),
      drawn: new Int16Array(next.count),
      covered: new Uint8Array(next.count),
      image: ctx ? ctx.createImageData(next.w, next.h) : null,
      dirty: null,
      finished: 0,
      ownReady: before?.ownReady ?? false,
      // A trace that lands while the kit is lifting off leaves it lifting.
      resolving: before?.resolving ?? false,
    };
    run.current = s;
    if (prev && before) {
      // A new trace of the same kit (a resize, a theme): what was painted
      // stays painted, and the next region is due now.
      s.paintT0 = s.clock - (next.planStart[kept] ?? 0);
      for (let i = 0; i < kept; i += 1) {
        const r = next.sequence[i]!;
        s.start[r] = 0;
        s.dur[r] = 1;
        s.front[r] = 1;
        paintTo(r, 1);
      }
    }
    if (ctx) {
      ctx.clearRect(0, 0, next.w, next.h);
      if (s.image) ctx.putImageData(s.image, 0, 0);
      s.dirty = null;
    }
    colours.current = readColours();
    drawLines();
    drawNumbers();
    size2d(veilRef.current, next);
    if (latest.current.hot !== null) drawVeil();
    setPots(
      next.palette.map((p, index) => ({
        index,
        fill: `rgb(${p.r} ${p.g} ${p.b})`,
        light: p.L > 0.66,
        regions: p.regions,
      })),
    );
    setFinished(0);
    setActivePot((a) => Math.min(a, next.palette.length - 1));
    if (s.resolving) return;
    schedule();
    kick();
  };

  /** A fresh kit from nothing: a new picture, or one sent back to loading. */
  const fresh = () => {
    for (const a of anims.current) a.stop();
    anims.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    if (frame.current) window.cancelAnimationFrame(frame.current);
    frame.current = 0;
    fade.set(0);
    wipe.set(0);
    linesIn.set(0);
    numbersIn.set(0);
    veilOn.set(0);
    setDone(false);
    setLifting(false);
    setOwnReady(false);
    setFinished(0);
    const k = kit.current;
    const s = run.current;
    if (!k || !s) return;
    s.clock = 0;
    s.last = 0;
    s.paintT0 = PAINT_AT;
    s.front.fill(0);
    s.start.fill(NEVER);
    s.drawn.fill(0);
    s.covered.fill(0);
    s.finished = 0;
    s.ownReady = false;
    s.resolving = false;
    s.image?.data.fill(0);
    const ctx = paintRef.current?.getContext("2d");
    ctx?.clearRect(0, 0, k.w, k.h);
    drawNumbers();
    schedule();
    kick();
  };

  const regionAt = (clientX: number, clientY: number) => {
    const k = kit.current;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!k || !rect || rect.width < 1) return null;
    const x = ((clientX - rect.left) / rect.width) * k.w;
    const y = ((clientY - rect.top) / rect.height) * k.h;
    if (x < 0 || y < 0 || x >= k.w || y >= k.h) return null;
    return { k, x, y, r: k.label[Math.floor(y) * k.w + Math.floor(x)]! };
  };

  const hoverAt = (clientX: number, clientY: number) => {
    const at = regionAt(clientX, clientY);
    if (!at || !latest.current.numbers) {
      setHoverHot(null);
      return;
    }
    const { k, x, y } = at;
    let found: number | null = null;
    let near = NEVER;
    for (let r = 0; r < k.count; r += 1) {
      const reach = Math.max(12, k.labelSize[r]! * 1.1) * k.scale;
      const d = (k.labelX[r]! - x) ** 2 + (k.labelY[r]! - y) ** 2;
      if (d < reach * reach && d < near) {
        near = d;
        found = k.paint[r]!;
      }
    }
    setHoverHot(found);
  };

  const paintByHand = (p: number, pan: number) => {
    const k = kit.current;
    const s = run.current;
    const L = latest.current;
    if (!k || !s || s.resolving || L.disabled) return;
    const mine: number[] = [];
    for (let i = 0; i < k.count; i += 1) {
      const r = k.sequence[i]!;
      if (k.paint[r] !== p || s.front[r]! >= 1) continue;
      if (s.start[r] !== NEVER && s.start[r]! <= s.clock) continue;
      mine.push(r);
    }
    const n = k.palette[p]?.regions ?? 0;
    if (mine.length === 0) {
      audio.play("plip", { pitch: 0.7, gain: 0.35, pan });
      setSaid((v) => ({
        n: v.n + 1,
        text: `Colour ${p + 1} is already painted.`,
      }));
      return;
    }
    const pitch = r2(semitones(SCALE[p % SCALE.length] ?? 0));
    mine.forEach((r, i) => {
      s.start[r] = s.clock + i * 0.07 * L.spd;
      s.dur[r] = 0.24 * L.spd;
      const regionPan = r2((k.centreX[r]! * 2 - 1) * 0.6);
      timers.current.push(
        window.setTimeout(
          () => audio.play("plip", { pitch, gain: 0.5, pan: regionPan }),
          i * 70,
        ),
      );
    });
    setSaid((v) => ({
      n: v.n + 1,
      text: `Colour ${p + 1} painted, ${plural(n, "region", "regions")}.`,
    }));
    kick();
  };

  const pressAt = (clientX: number, clientY: number) => {
    const at = regionAt(clientX, clientY);
    if (!at) return;
    paintByHand(at.k.paint[at.r]!, panFrom(clientX, rootRef.current));
  };

  const readyChanged = (now: boolean) => {
    const s = run.current;
    if (now) {
      schedule();
      settle();
    } else if (s && (s.resolving || s.ownReady) && latest.current.controlled) {
      fresh();
    }
  };

  const recolour = () => {
    colours.current = readColours();
    drawLines();
    drawNumbers();
    if (latest.current.hot !== null) drawVeil();
    setThemeTick((t) => t + 1);
  };

  React.useEffect(() => {
    api.current = {
      install,
      schedule,
      readyChanged,
      fresh,
      recolour,
      drawNumbers,
      drawVeil,
      kick,
      hoverAt,
      pressAt,
      paintByHand,
    };
  });

  // The trace: once the picture exists and has a size, and again when the
  // size, the theme's colours or the cut change. A trace that is overtaken
  // is dropped.
  React.useEffect(() => {
    if (!size || !loaded || done) return;
    const host = pictureRef.current;
    const cover = coverRef.current;
    const lines = linesRef.current;
    if (!host || !cover || !lines) return;
    let live = true;
    const paper = getComputedStyle(cover).backgroundColor;
    const ink = toLab(
      Uint8ClampedArray.from([...rgbOf(getComputedStyle(lines).color), 255]),
      1,
    );
    void samplerOf(host, paper).then((sample) => {
      if (!live) return;
      const next = buildKit(sample, size.w, size.h, size.dpr, wanted, ink);
      if (live) api.current?.install(next);
    });
    return () => {
      live = false;
    };
    // The picture's pixels are read again when what they were read at changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, loaded, wanted, themeTick]);

  const shownReady = React.useRef(isReady);
  React.useEffect(() => {
    if (shownReady.current === isReady) return;
    shownReady.current = isReady;
    api.current?.readyChanged(isReady);
  }, [isReady]);

  React.useEffect(() => {
    api.current?.schedule();
  }, [progress]);

  React.useEffect(() => {
    api.current?.drawNumbers();
    api.current?.drawVeil();
  }, [hot, numbers]);

  // A new picture is a new kit, traced from nothing.
  const shownSrc = React.useRef(src);
  React.useEffect(() => {
    if (shownSrc.current === src) return;
    shownSrc.current = src;
    kit.current = null;
    run.current = null;
    api.current?.fresh();
  }, [src]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const running = anims;
    const pending = timers;
    const loop = frame;
    const veil = veilAnim;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      for (const a of running.current) a.stop();
      running.current = [];
      veil.current?.stop();
      for (const t of pending.current) window.clearTimeout(t);
      pending.current = [];
    };
  }, []);

  // Size and presence, bound to the node when it arrives. A resize settles
  // for a moment before the picture is traced again.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    let wait = 0;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const next = {
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        dpr: Math.min(2, window.devicePixelRatio || 1),
      };
      setSize((prev) =>
        prev && prev.w === next.w && prev.h === next.h && prev.dpr === next.dpr
          ? prev
          : next,
      );
    };
    const sizer = new ResizeObserver(() => {
      window.clearTimeout(wait);
      wait = window.setTimeout(measure, 120);
    });
    sizer.observe(node);
    measure();
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      window.clearTimeout(wait);
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // A cached image can finish loading before hydration attaches onLoad.
  const bindImage = React.useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete && src) {
        const loadedNow = src;
        queueMicrotask(() => setLoadedSrc(loadedNow));
      }
    },
    [src],
  );

  // A new theme changes the tokens the kit is printed in; the 1ms colour
  // transition on the outline says when.
  const recolourSoon = React.useRef(0);
  const onColours = () => {
    if (recolourSoon.current) return;
    recolourSoon.current = window.requestAnimationFrame(() => {
      recolourSoon.current = 0;
      api.current?.recolour();
    });
  };
  React.useEffect(() => {
    const soon = recolourSoon;
    return () => {
      if (soon.current) window.cancelAnimationFrame(soon.current);
      soon.current = 0;
    };
  }, []);

  const onPotsKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = pots?.length ?? 0;
    if (count === 0) return;
    let next = activePot;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (activePot + 1) % count;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (activePot - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActivePot(next);
    potsRef.current
      ?.querySelector<HTMLButtonElement>(`[data-pot="${next}"]`)
      ?.focus();
  };

  const interactive = !done && !disabled && pots !== null;

  return (
    <div
      ref={bindRoot}
      aria-busy={!done}
      className={cn(
        "relative isolate aspect-[4/3] w-full overflow-clip rounded-3 bg-card select-none",
        className,
      )}
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

      <div
        aria-hidden
        inert
        className={cn(
          "pointer-events-none absolute inset-0",
          done && "invisible",
        )}
      >
        <motion.div
          ref={coverRef}
          className="absolute inset-0 bg-card"
          style={{ opacity: coverOpacity }}
        />
        <motion.canvas
          ref={paintRef}
          className="absolute inset-0 size-full"
          style={{ opacity: coverOpacity }}
        />
        <motion.canvas
          ref={linesRef}
          onTransitionEnd={onColours}
          className="absolute inset-0 size-full text-ink-3 transition-colors duration-1"
          style={{ opacity: linesOpacity, clipPath: clip }}
        />
        <motion.canvas
          ref={veilRef}
          className="absolute inset-0 size-full text-cobalt"
          style={{ opacity: veilOpacity }}
        />
        <motion.canvas
          ref={numbersRef}
          className="absolute inset-0 size-full font-mono text-ink-2"
          style={{ opacity: numbersOpacity }}
        />
      </div>

      {interactive ? (
        <div
          aria-hidden
          onPointerMove={(event) => {
            if (event.pointerType === "mouse") {
              api.current?.hoverAt(event.clientX, event.clientY);
            }
          }}
          onPointerLeave={() => setHoverHot(null)}
          onClick={(event) =>
            api.current?.pressAt(event.clientX, event.clientY)
          }
          className="absolute inset-0 cursor-pointer"
        />
      ) : null}

      {pots && !done ? (
        <motion.div
          ref={potsRef}
          role="toolbar"
          aria-label="Paint by number"
          aria-describedby={hintId}
          inert={lifting || undefined}
          onKeyDown={onPotsKey}
          onFocus={(event) => {
            const i = Number(
              (event.target as HTMLElement).getAttribute("data-pot"),
            );
            if (Number.isFinite(i)) {
              setActivePot(i);
              setFocusHot(i);
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setFocusHot(null);
            }
          }}
          className="absolute bottom-2 left-2 flex max-w-[calc(100%-16px)] flex-wrap items-center gap-0.5 rounded-4 border border-hairline bg-card/90 p-[3px] shadow-sm"
          style={{ opacity: potsOpacity }}
        >
          {pots.map((pot) => {
            const isDone = (finished & (1 << pot.index)) !== 0;
            const ink = pot.light
              ? "oklch(0.24 0.02 258)"
              : "oklch(0.98 0.004 258)";
            return (
              <button
                key={pot.index}
                type="button"
                data-pot={pot.index}
                tabIndex={pot.index === activePot ? 0 : -1}
                disabled={disabled}
                aria-label={`Colour ${pot.index + 1}, ${plural(pot.regions, "region", "regions")}${isDone ? ", painted" : ""}`}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setHoverHot(pot.index);
                }}
                onPointerLeave={() => setHoverHot(null)}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  api.current?.paintByHand(
                    pot.index,
                    panFrom(rect.left + rect.width / 2, rootRef.current),
                  );
                }}
                className={cn(
                  "relative flex size-4 shrink-0 items-center justify-center rounded-full font-mono text-[8px] leading-none font-semibold tabular-nums outline-none",
                  "shadow-[inset_0_0_0_1px_color-mix(in_oklab,black_22%,transparent)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  "enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
                  hot === pot.index &&
                    "ring-2 ring-cobalt-bright ring-offset-1 ring-offset-card",
                )}
                style={{ backgroundColor: pot.fill, color: ink }}
              >
                {isDone ? (
                  <svg
                    aria-hidden
                    viewBox="0 0 10 10"
                    className="size-2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 5.2 4.1 7.3 8 2.8" />
                  </svg>
                ) : numbers ? (
                  pot.index + 1
                ) : null}
              </button>
            );
          })}
        </motion.div>
      ) : null}

      <p id={hintId} className="sr-only">
        Focus or hover a colour to see where it goes; press it to paint it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
