"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HalftoneWakeArt = "ridges" | "tide" | "orbit";
export type HalftoneWakeShape = "round" | "square" | "line";

export type HalftoneWakeProps = {
  /** The image to print. It must be readable across origins (CORS); the generated art is used without it or when it fails. */
  src?: string;
  /** The generated artwork printed when there is no image. @default "ridges" */
  art?: HalftoneWakeArt;
  /** What the image shows: the plate's accessible name. @default a description of the art */
  alt?: string;
  /** The screen's cell size, px (4 to 32). @default 10 */
  cell?: number;
  /** The screen's angle, degrees: 45 is the classic black screen. @default 45 */
  angle?: number;
  /** How long the wake takes to recede, s. @default 2.4 */
  linger?: number;
  /** The dot: round, square, or a line screen whose thickness follows the tone. @default "round" */
  shape?: HalftoneWakeShape;
  /** The ink. @default "var(--foreground)" */
  ink?: string;
  /** Paper behind the dots; the page shows through when unset. Dark ink on light paper prints shadows, light ink on dark paper prints highlights. */
  paper?: string;
  /** The dot size where nothing has passed, 0 to 1: 0 hides the image until it is printed. @default 0.18 */
  rest?: number;
  /** The width of the pointer's wake, px. @default 112 */
  brush?: number;
  /** The plate's tone curve, 0 (flat) to 1 (punchy). @default 0.5 */
  contrast?: number;
  /** Scrolling the page sweeps a band of ink down across the plate. @default true */
  scroll?: boolean;
  /** One sweep across the plate the first time it comes into view. @default true */
  intro?: boolean;
  /** The generated art's variation. @default 3 */
  seed?: number;
  /** The pointer, the scroll and the keys print; false leaves the plate at rest and out of the tab order. @default true */
  interactive?: boolean;
  /** Freeze the plate as it is. @default false */
  paused?: boolean;
  /** The highest device pixel ratio drawn, capped at 2. @default 2 */
  dpr?: number;
  /** Fires with the share of the plate printed, 0 to 1, whenever it moves by a whole percent. */
  onCoverageChange?: (printed: number) => void;
  /** Size the plate here. @default "aspect-[2/1] w-full" */
  className?: string;
};

const ALT: Record<HalftoneWakeArt, string> = {
  ridges: "A low sun behind layered mountain ridges, printed in halftone",
  tide: "A moon over the sea with its glitter path, printed in halftone",
  orbit: "A ringed planet lit from one side, printed in halftone",
};

/** Dot sizes go to the GPU as bytes; this headroom keeps a spring's overshoot. */
const HEADROOM = 1.25;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = [number, number, number];

/** Any CSS colour to 0–1 rgb and alpha, through a 1×1 canvas. */
function readColour(colour: string): [number, number, number, number] {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [0, 0, 0, 1];
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  const a = (d[3] ?? 0) / 255;
  if (a <= 0) return [0, 0, 0, 0];
  return [
    (d[0] ?? 0) / 255 / a,
    (d[1] ?? 0) / 255 / a,
    (d[2] ?? 0) / 255 / a,
    a,
  ];
}

const luma = (c: Rgb | [number, number, number, number]) =>
  0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// ---------------------------------------------------------------- the art

/** Draws the generated plate as greys: only its tone is ever read. */
function drawArt(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  art: HalftoneWakeArt,
  seed: number,
) {
  const rand = lcg(seed * 977 + 31);
  const grey = (l: number) => {
    const v = Math.round(clamp01(l) * 255);
    return `rgb(${v}, ${v}, ${v})`;
  };
  const m = Math.min(W, H);
  if (art === "ridges") {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, grey(0.48));
    sky.addColorStop(0.55, grey(0.86));
    sky.addColorStop(1, grey(0.82));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const sx = W * 0.66;
    const sy = H * 0.44;
    const halo = ctx.createRadialGradient(sx, sy, m * 0.08, sx, sy, m * 0.42);
    halo.addColorStop(0, grey(1));
    halo.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = grey(1);
    ctx.beginPath();
    ctx.arc(sx, sy, m * 0.1, 0, Math.PI * 2);
    ctx.fill();
    const layers = [
      { base: 0.5, amp: 0.1, tone: 0.72 },
      { base: 0.6, amp: 0.09, tone: 0.52 },
      { base: 0.71, amp: 0.07, tone: 0.32 },
      { base: 0.84, amp: 0.05, tone: 0.12 },
    ];
    for (const layer of layers) {
      const f1 = 1.5 + rand() * 2.5;
      const f2 = 5 + rand() * 6;
      const p1 = rand() * 6.28;
      const p2 = rand() * 6.28;
      ctx.fillStyle = grey(layer.tone);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 2) {
        const u = x / W;
        const y =
          layer.base +
          layer.amp * Math.sin(u * f1 * Math.PI + p1) * 0.7 +
          layer.amp * 0.3 * Math.sin(u * f2 * Math.PI + p2) -
          layer.amp * 0.5 * Math.abs(Math.sin(u * f1 * 1.7 + p2));
        ctx.lineTo(x, y * H);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  if (art === "tide") {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    sky.addColorStop(0, grey(0.14));
    sky.addColorStop(1, grey(0.42));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const mx = W * 0.3;
    const my = H * 0.3;
    const r = m * 0.13;
    const glow = ctx.createRadialGradient(mx, my, r, mx, my, r * 3.2);
    glow.addColorStop(0, grey(0.62));
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = grey(0.97);
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = grey(0.84);
    for (let i = 0; i < 6; i += 1) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r * 0.7;
      ctx.beginPath();
      ctx.arc(
        mx + Math.cos(a) * d,
        my + Math.sin(a) * d,
        r * (0.08 + rand() * 0.14),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    const horizon = H * 0.6;
    ctx.fillStyle = grey(0.16);
    ctx.fillRect(0, horizon, W, H - horizon);
    ctx.strokeStyle = grey(0.36);
    for (let y = horizon + 3; y < H; y += 4 + ((y - horizon) / H) * 10) {
      ctx.lineWidth = 1 + ((y - horizon) / H) * 3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const yy = y + Math.sin(x * 0.05 + y) * (1 + (y - horizon) * 0.03);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // The glitter path: bright dashes widening toward the shore.
    ctx.fillStyle = grey(0.92);
    for (let i = 0; i < 90; i += 1) {
      const t = rand();
      const y = horizon + t * (H - horizon);
      const spread = r * (0.4 + t * 1.6);
      const x = mx + (rand() - 0.5) * 2 * spread;
      ctx.fillRect(x, y, 3 + rand() * 10 * (0.4 + t), 1.5 + t * 2);
    }
    return;
  }
  ctx.fillStyle = grey(0.08);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = grey(0.9);
  for (let i = 0; i < 70; i += 1) {
    const s = rand() < 0.15 ? 2.2 : 1.2;
    ctx.fillRect(rand() * W, rand() * H, s, s);
  }
  const px = W * 0.56;
  const py = H * 0.54;
  const r = m * 0.3;
  const ring = (front: boolean) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.32);
    ctx.strokeStyle = grey(0.78);
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      r * 1.85,
      r * 0.36,
      0,
      front ? 0 : Math.PI,
      front ? Math.PI : Math.PI * 2,
    );
    ctx.stroke();
    ctx.strokeStyle = grey(0.5);
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      r * 1.5,
      r * 0.29,
      0,
      front ? 0 : Math.PI,
      front ? Math.PI : Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  };
  ring(false);
  const body = ctx.createRadialGradient(
    px - r * 0.45,
    py - r * 0.45,
    r * 0.05,
    px,
    py,
    r * 1.05,
  );
  body.addColorStop(0, grey(0.98));
  body.addColorStop(0.55, grey(0.6));
  body.addColorStop(1, grey(0.1));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
  ring(true);
}

/** Reads the art (or the image) as a tone map at a modest resolution. */
function toneMap(
  w: number,
  h: number,
  art: HalftoneWakeArt,
  seed: number,
  image: HTMLImageElement | null,
): { W: number; H: number; lum: Float32Array } | null {
  const W = 320;
  const H = Math.max(8, Math.round((W * h) / Math.max(w, 1)));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  if (image) {
    const k = Math.max(W / image.naturalWidth, H / image.naturalHeight);
    const iw = image.naturalWidth * k;
    const ih = image.naturalHeight * k;
    ctx.drawImage(image, (W - iw) / 2, (H - ih) / 2, iw, ih);
  } else {
    drawArt(ctx, W, H, art, seed);
  }
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    // A cross-origin image without CORS cannot be read: print the art.
    if (!image) return null;
    return toneMap(w, h, art, seed, null);
  }
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    lum[i] =
      (0.2126 * (data[i * 4] ?? 0) +
        0.7152 * (data[i * 4 + 1] ?? 0) +
        0.0722 * (data[i * 4 + 2] ?? 0)) /
      255;
  }
  return { W, H, lum };
}

// ---------------------------------------------------------------- the plate

type Plate = {
  w: number;
  h: number;
  cell: number;
  cos: number;
  sin: number;
  i0: number;
  j0: number;
  gw: number;
  gh: number;
  /** Cell centres on screen. */
  px: Float32Array;
  py: Float32Array;
  inside: Uint8Array;
  tone: Float32Array;
  wake: Float32Array;
  size: Float32Array;
  vel: Float32Array;
  bytes: Uint8Array;
  visible: number;
};

function buildPlate(w: number, h: number, cell: number, angle: number): Plate {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hx = w / 2;
  const hy = h / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of [
    [-hx, -hy],
    [hx, -hy],
    [-hx, hy],
    [hx, hy],
  ] as const) {
    const qx = cos * x + sin * y;
    const qy = -sin * x + cos * y;
    minX = Math.min(minX, qx);
    maxX = Math.max(maxX, qx);
    minY = Math.min(minY, qy);
    maxY = Math.max(maxY, qy);
  }
  const i0 = Math.floor(minX / cell) - 1;
  const j0 = Math.floor(minY / cell) - 1;
  const gw = Math.ceil(maxX / cell) + 1 - i0;
  const gh = Math.ceil(maxY / cell) + 1 - j0;
  const n = gw * gh;
  const plate: Plate = {
    w,
    h,
    cell,
    cos,
    sin,
    i0,
    j0,
    gw,
    gh,
    px: new Float32Array(n),
    py: new Float32Array(n),
    inside: new Uint8Array(n),
    tone: new Float32Array(n),
    wake: new Float32Array(n),
    size: new Float32Array(n),
    vel: new Float32Array(n),
    bytes: new Uint8Array(n),
    visible: 0,
  };
  let visible = 0;
  for (let j = 0; j < gh; j += 1) {
    for (let i = 0; i < gw; i += 1) {
      const k = j * gw + i;
      const qx = (i0 + i + 0.5) * cell;
      const qy = (j0 + j + 0.5) * cell;
      const x = hx + cos * qx - sin * qy;
      const y = hy + sin * qx + cos * qy;
      plate.px[k] = x;
      plate.py[k] = y;
      const inside = x > -cell && x < w + cell && y > -cell && y < h + cell;
      plate.inside[k] = inside ? 1 : 0;
      if (x >= 0 && x <= w && y >= 0 && y <= h) visible += 1;
    }
  }
  plate.visible = Math.max(1, visible);
  return plate;
}

/** Each cell's ink from the tone map: which tones print depends on ink against paper. */
function inkPlate(
  plate: Plate,
  map: { W: number; H: number; lum: Float32Array },
  darkInk: boolean,
  contrast: number,
) {
  const k = lerp(0.6, 1.9, clamp01(contrast));
  for (let c = 0; c < plate.gw * plate.gh; c += 1) {
    if (!plate.inside[c]) {
      plate.tone[c] = 0;
      continue;
    }
    const u = clamp01((plate.px[c] ?? 0) / plate.w) * (map.W - 1);
    const v = clamp01((plate.py[c] ?? 0) / plate.h) * (map.H - 1);
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const x1 = Math.min(map.W - 1, x0 + 1);
    const y1 = Math.min(map.H - 1, y0 + 1);
    const fx = u - x0;
    const fy = v - y0;
    const at = (x: number, y: number) => map.lum[y * map.W + x] ?? 0;
    const l = lerp(
      lerp(at(x0, y0), at(x1, y0), fx),
      lerp(at(x0, y1), at(x1, y1), fx),
      fy,
    );
    const ink = darkInk ? 1 - l : l;
    plate.tone[c] = clamp01(0.5 + (ink - 0.5) * k);
  }
}

/** A soft disc of wake along a segment, so a fast sweep never leaves gaps. */
function stampSegment(
  plate: Plate,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
) {
  const r = Math.max(4, radius);
  const minX = Math.min(ax, bx) - r;
  const maxX = Math.max(ax, bx) + r;
  const minY = Math.min(ay, by) - r;
  const maxY = Math.max(ay, by) + r;
  const hx = plate.w / 2;
  const hy = plate.h / 2;
  let lo = Infinity;
  let hi = -Infinity;
  let loJ = Infinity;
  let hiJ = -Infinity;
  for (const [x, y] of [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ] as const) {
    const qx = (plate.cos * (x - hx) + plate.sin * (y - hy)) / plate.cell;
    const qy = (-plate.sin * (x - hx) + plate.cos * (y - hy)) / plate.cell;
    lo = Math.min(lo, qx);
    hi = Math.max(hi, qx);
    loJ = Math.min(loJ, qy);
    hiJ = Math.max(hiJ, qy);
  }
  const iA = clamp(Math.floor(lo) - plate.i0 - 1, 0, plate.gw - 1);
  const iB = clamp(Math.ceil(hi) - plate.i0 + 1, 0, plate.gw - 1);
  const jA = clamp(Math.floor(loJ) - plate.j0 - 1, 0, plate.gh - 1);
  const jB = clamp(Math.ceil(hiJ) - plate.j0 + 1, 0, plate.gh - 1);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  for (let j = jA; j <= jB; j += 1) {
    for (let i = iA; i <= iB; i += 1) {
      const k = j * plate.gw + i;
      if (!plate.inside[k]) continue;
      const x = plate.px[k] ?? 0;
      const y = plate.py[k] ?? 0;
      const t = len2 > 0 ? clamp01(((x - ax) * dx + (y - ay) * dy) / len2) : 0;
      const ex = x - (ax + dx * t);
      const ey = y - (ay + dy * t);
      const d2 = (ex * ex + ey * ey) / (r * r);
      if (d2 >= 1) continue;
      const v = (1 - d2) * (1 - d2);
      if (v > (plate.wake[k] ?? 0)) plate.wake[k] = v;
    }
  }
}

/** A soft band of wake across the plate, between two positions along x or y. */
function stampBand(plate: Plate, axis: "x" | "y", from: number, to: number) {
  const soft = 28;
  const lo = Math.min(from, to) - soft;
  const hi = Math.max(from, to) + soft;
  const pos = axis === "x" ? plate.px : plate.py;
  for (let k = 0; k < plate.gw * plate.gh; k += 1) {
    if (!plate.inside[k]) continue;
    const p = pos[k] ?? 0;
    if (p < lo || p > hi) continue;
    const edge = Math.min(p - lo, hi - p) / soft;
    const v = smooth(edge);
    if (v > (plate.wake[k] ?? 0)) plate.wake[k] = v;
  }
}

/**
 * Advances the wake and every dot's spring; packs the sizes for drawing.
 * Returns whether anything is still moving.
 */
function advance(
  plate: Plate,
  dt: number,
  linger: number,
  rest: number,
  shape: HalftoneWakeShape,
  still: boolean,
): boolean {
  const fade = dt / Math.max(0.1, linger);
  const base = clamp01(rest);
  const K = springs.snap.stiffness;
  const C = springs.snap.damping;
  const steps = still ? 0 : Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = steps ? dt / steps : 0;
  let moving = false;
  for (let k = 0; k < plate.gw * plate.gh; k += 1) {
    if (!plate.inside[k]) continue;
    let wake = plate.wake[k] ?? 0;
    if (wake > 0) {
      wake = Math.max(0, wake - fade);
      plate.wake[k] = wake;
      moving = true;
    }
    const target = still ? 1 : base + (1 - base) * smooth(wake);
    let s = plate.size[k] ?? 0;
    let v = plate.vel[k] ?? 0;
    if (still) {
      s = target;
      v = 0;
    } else {
      for (let i = 0; i < steps; i += 1) {
        v += (K * (target - s) - C * v) * h;
        s += v * h;
      }
      if (Math.abs(target - s) < 0.002 && Math.abs(v) < 0.02) {
        s = target;
        v = 0;
      } else moving = true;
    }
    plate.size[k] = s;
    plate.vel[k] = v;
    const tone = plate.tone[k] ?? 0;
    const ink = shape === "line" ? tone : Math.sqrt(tone);
    plate.bytes[k] = clamp(
      Math.round(((Math.max(0, s) * ink) / HEADROOM) * 255),
      0,
      255,
    );
  }
  return moving;
}

/** The share of the plate printed: cells on screen at least half up. */
function coverage(plate: Plate) {
  let up = 0;
  for (let k = 0; k < plate.gw * plate.gh; k += 1) {
    const x = plate.px[k] ?? 0;
    const y = plate.py[k] ?? 0;
    if (x < 0 || x > plate.w || y < 0 || y > plate.h) continue;
    if ((plate.size[k] ?? 0) >= 0.5) up += 1;
  }
  return up / plate.visible;
}

// ---------------------------------------------------------------- rendering

const SCREEN_FRAGMENT = /* glsl */ `
precision highp sampler2D;
uniform sampler2D u_size;
uniform vec2 u_res;
uniform vec2 u_rot;
uniform float u_cell;
uniform vec2 u_origin;
uniform vec2 u_grid;
uniform vec3 u_ink;
uniform float u_shape;
in vec2 v_uv;
out vec4 o_color;

float sizeAt(vec2 c) {
  vec2 idx = c - u_origin;
  if (idx.x < 0.0 || idx.y < 0.0 || idx.x >= u_grid.x || idx.y >= u_grid.y) return 0.0;
  return texelFetch(u_size, ivec2(idx), 0).r * ${HEADROOM.toFixed(2)};
}

void main() {
  vec2 p = v_uv * u_res - u_res * 0.5;
  // Into the screen's rotated frame, in cells.
  vec2 q = vec2(u_rot.x * p.x + u_rot.y * p.y, -u_rot.y * p.x + u_rot.x * p.y) / u_cell;
  float aa = max(fwidth(q.x), fwidth(q.y)) * 0.75;
  float cov = 0.0;
  if (u_shape > 1.5) {
    // A line screen: thickness follows the tone along each row.
    float row = floor(q.y);
    float fx = q.x - 0.5;
    float i0 = floor(fx);
    float s = mix(sizeAt(vec2(i0, row)), sizeAt(vec2(i0 + 1.0, row)), fx - i0);
    float half_ = 0.5 * s;
    if (s > 0.004) cov = 1.0 - smoothstep(half_ - aa, half_ + aa, abs(q.y - row - 0.5));
  } else {
    // The four nearest dots, so a dot that outgrows its cell renders whole.
    vec2 base = floor(q - 0.5);
    for (int j = 0; j < 2; j++) {
      for (int i = 0; i < 2; i++) {
        vec2 c = base + vec2(float(i), float(j));
        float s = sizeAt(c);
        if (s < 0.004) continue;
        vec2 d = abs(q - c - 0.5);
        float r = u_shape > 0.5 ? 0.5 * s : 0.7071 * s;
        float dist = u_shape > 0.5 ? max(d.x, d.y) : length(d);
        cov = max(cov, 1.0 - smoothstep(r - aa, r + aa, dist));
      }
    }
  }
  o_color = vec4(u_ink * cov, cov);
}`;

type Gfx = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  tex: WebGLTexture | null;
  size: [number, number];
};

function createGfx(canvas: HTMLCanvasElement): Gfx | null {
  const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const program = createProgram(gl, FULLSCREEN_VERTEX, SCREEN_FRAGMENT);
  if (!program) return null;
  try {
    return {
      gl,
      program,
      tri: createFullscreenTriangle(gl, program),
      tex: null,
      size: [0, 0],
    };
  } catch {
    program.dispose();
    return null;
  }
}

function disposeGfx(g: Gfx) {
  g.tri.dispose();
  g.program.dispose();
  if (g.tex) g.gl.deleteTexture(g.tex);
  g.tex = null;
}

function renderGL(
  g: Gfx,
  canvas: HTMLCanvasElement,
  plate: Plate,
  ink: Rgb,
  shape: HalftoneWakeShape,
  dpr: number,
): boolean {
  const { gl } = g;
  if (gl.isContextLost()) return false;
  resizeGL(gl, canvas, { dprCap: dpr });
  if (!g.tex || g.size[0] !== plate.gw || g.size[1] !== plate.gh) {
    if (g.tex) gl.deleteTexture(g.tex);
    g.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      plate.gw,
      plate.gh,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      plate.bytes,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    g.size = [plate.gw, plate.gh];
  } else {
    gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      plate.gw,
      plate.gh,
      gl.RED,
      gl.UNSIGNED_BYTE,
      plate.bytes,
    );
  }
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  g.program.use();
  g.program.texture("u_size", g.tex, 0);
  g.program.set({
    u_res: [plate.w, plate.h],
    u_rot: [plate.cos, plate.sin],
    u_cell: plate.cell,
    u_origin: [plate.i0, plate.j0],
    u_grid: [plate.gw, plate.gh],
    u_ink: ink,
    u_shape: shape === "round" ? 0 : shape === "square" ? 1 : 2,
  });
  g.tri.draw();
  return true;
}

/** The same plate in Canvas 2D: one path in the screen's own rotated frame. */
function render2D(
  canvas: HTMLCanvasElement,
  plate: Plate,
  ink: string,
  shape: HalftoneWakeShape,
  dpr: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ratio = Math.min(dpr, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(plate.w * ratio));
  const H = Math.max(1, Math.round(plate.h * ratio));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // Rotate the context into the screen's frame and draw in cell units.
  const c = plate.cell * ratio;
  ctx.setTransform(
    plate.cos * c,
    plate.sin * c,
    -plate.sin * c,
    plate.cos * c,
    (plate.w / 2) * ratio,
    (plate.h / 2) * ratio,
  );
  ctx.fillStyle = ink;
  ctx.beginPath();
  for (let j = 0; j < plate.gh; j += 1) {
    for (let i = 0; i < plate.gw; i += 1) {
      const k = j * plate.gw + i;
      if (!plate.inside[k]) continue;
      const s = ((plate.bytes[k] ?? 0) / 255) * HEADROOM;
      if (s < 0.004) continue;
      const x = plate.i0 + i + 0.5;
      const y = plate.j0 + j + 0.5;
      if (shape === "round") {
        const r = 0.7071 * s;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      } else if (shape === "square") {
        ctx.rect(x - s / 2, y - s / 2, s, s);
      } else {
        ctx.rect(x - 0.5, y - s / 2, 1.02, s);
      }
    }
  }
  ctx.fill();
}

/**
 * A single-ink halftone plate whose image surfaces in the pointer's wake. At
 * rest every dot sits at `rest` of its size, a faint ghost of the picture;
 * where the pointer passes, a soft disc of wake is laid along its path and
 * each dot reached grows on its own spring with the snap constants — popping
 * just past full size before it settles, a print coming up under the hand —
 * then recedes from the trail's oldest end over `linger` seconds. Scrolling
 * the page sweeps a band of ink down across the plate, and the first time it
 * is seen one press runs across it. The screen is a rotated grid of round,
 * square or line dots sized by the image's tone (dark ink prints shadows,
 * light ink prints highlights), drawn by a WebGL2 shader with a Canvas 2D
 * fallback that draws the same sizes.
 *
 * The plate is a focusable image: focus and Enter or Space run the press across
 * the whole of it. Under reduced motion the plate prints fully and holds —
 * every dot at its size, no wake and no springs.
 */
export function HalftoneWake({
  src,
  art = "ridges",
  alt,
  cell = 10,
  angle = 45,
  linger = 2.4,
  shape = "round",
  ink = "var(--foreground)",
  paper,
  rest = 0.18,
  brush = 112,
  contrast = 0.5,
  scroll = true,
  intro = true,
  seed = 3,
  interactive = true,
  paused = false,
  dpr = 2,
  onCoverageChange,
  className,
}: HalftoneWakeProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const glRef = React.useRef<HTMLCanvasElement | null>(null);
  const flatRef = React.useRef<HTMLCanvasElement | null>(null);
  const plateRef = React.useRef<Plate | null>(null);
  const mapRef = React.useRef<{
    W: number;
    H: number;
    lum: Float32Array;
  } | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const gfxRef = React.useRef<Gfx | null>(null);
  const inkRef = React.useRef<{ css: string; rgb: Rgb; dark: boolean } | null>(
    null,
  );
  const loop = React.useRef({
    raf: 0,
    last: 0,
    seen: false,
    draw: 0,
    introduced: false,
  });
  const motion = React.useRef({
    hover: { x: 0, y: 0, t: 0, on: false },
    band: null as number | null,
    sweep: null as { t: number; from: number } | null,
    printed: -1,
  });
  const api = React.useRef<{
    layout: (force?: boolean) => void;
    wake: () => void;
    sleep: () => void;
    draw: () => void;
    retone: () => void;
    sweep: () => boolean;
    scrolled: () => void;
  } | null>(null);

  const cap = Math.min(2, Math.max(0.5, dpr));
  const size = clamp(cell, 4, 32);
  const live = motionSafe && !paused;

  const readInk = () => {
    const node = glRef.current;
    if (!node) return null;
    const cs = getComputedStyle(node);
    const rgba = readColour(cs.color);
    const paperRgba = readColour(cs.borderTopColor);
    inkRef.current = {
      css: cs.color,
      rgb: [rgba[0], rgba[1], rgba[2]],
      // Transparent paper is read as the page: dark ink means a light page.
      dark: paperRgba[3] > 0 ? luma(rgba) < luma(paperRgba) : luma(rgba) < 0.5,
    };
    return inkRef.current;
  };

  const draw = () => {
    const plate = plateRef.current;
    const inkNow = inkRef.current ?? readInk();
    if (!plate || !inkNow) return;
    const g = gfxRef.current;
    const glNode = glRef.current;
    const flat = flatRef.current;
    // The server's even screen stands in only until a real frame is drawn.
    if (glNode) glNode.style.backgroundImage = "none";
    if (g && glNode && renderGL(g, glNode, plate, inkNow.rgb, shape, cap)) {
      if (flat) flat.style.display = "none";
      return;
    }
    if (flat) {
      flat.style.display = "block";
      render2D(flat, plate, inkNow.css, shape, cap);
    }
  };

  const report = () => {
    const plate = plateRef.current;
    if (!plate || !onCoverageChange) return;
    const printed = Math.round(coverage(plate) * 100);
    if (printed === motion.current.printed) return;
    motion.current.printed = printed;
    onCoverageChange(printed / 100);
  };

  const retone = () => {
    const plate = plateRef.current;
    if (!plate) return;
    const inkNow = inkRef.current ?? readInk();
    if (!inkNow) return;
    if (!mapRef.current) {
      mapRef.current = toneMap(plate.w, plate.h, art, seed, imageRef.current);
    }
    const map = mapRef.current;
    if (!map) return;
    inkPlate(plate, map, inkNow.dark, contrast);
    advance(plate, 0, linger, rest, shape, !motionSafe);
  };

  const layout = (force = false) => {
    const root = rootRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 2 || h < 2) return;
    const old = plateRef.current;
    const same =
      old &&
      old.w === w &&
      old.h === h &&
      old.cell === size &&
      old.cos === Math.cos((angle * Math.PI) / 180);
    if (same && !force) return;
    if (!old || old.w !== w || old.h !== h) mapRef.current = null;
    const plate = buildPlate(w, h, size, angle);
    if (motionSafe) plate.size.fill(clamp01(rest));
    plateRef.current = plate;
    retone();
    draw();
    report();
  };

  const frame = (dt: number) => {
    const plate = plateRef.current;
    if (!plate) return false;
    const m = motion.current;
    let sweeping = false;
    if (m.sweep) {
      const prev = m.sweep.t;
      m.sweep.t = Math.min(1, prev + dt / 0.6);
      const span = plate.w * 1.4;
      const at = (t: number) => -plate.w * 0.2 + span * t;
      stampBand(plate, "x", at(prev), at(m.sweep.t));
      if (m.sweep.t >= 1) m.sweep = null;
      else sweeping = true;
    }
    const moving = advance(plate, dt, linger, rest, shape, false);
    draw();
    report();
    return moving || sweeping;
  };
  const frameRef = React.useRef(frame);

  const sleep = () => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  };

  const wake = () => {
    const l = loop.current;
    if (!live) {
      sleep();
      if (!l.draw) {
        l.draw = window.requestAnimationFrame(() => {
          l.draw = 0;
          api.current?.draw();
        });
      }
      return;
    }
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 1 / 60;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      if (frameRef.current(dt)) l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  };

  const sweep = () => {
    if (!live || !plateRef.current) return false;
    motion.current.sweep = { t: 0, from: 0 };
    wake();
    return true;
  };

  /** Where the scroll band sits for the plate's place in the viewport. */
  const bandAt = () => {
    const root = rootRef.current;
    const plate = plateRef.current;
    if (!root || !plate) return null;
    const rect = root.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const progress = (vh - rect.top) / (vh + rect.height);
    const t = smooth((progress - 0.12) / 0.45);
    return -plate.h * 0.25 + plate.h * 1.5 * t;
  };

  const scrolled = () => {
    const m = motion.current;
    const plate = plateRef.current;
    const next = bandAt();
    if (!plate || next === null) return;
    const prev = m.band;
    m.band = next;
    if (!scroll || !live || !interactive || prev === null) return;
    if (!loop.current.seen || Math.abs(next - prev) < 0.5) return;
    stampBand(plate, "y", prev, next);
    wake();
  };

  React.useEffect(() => {
    frameRef.current = frame;
    api.current = { layout, wake, sleep, draw, retone, sweep, scrolled };
  });

  // A new grid: size, cell or angle.
  React.useEffect(() => {
    api.current?.layout(true);
    api.current?.wake();
  }, [size, angle, motionSafe]);

  // A new tone: art, seed, contrast, or the ink against its paper.
  React.useEffect(() => {
    mapRef.current = null;
    inkRef.current = null;
    api.current?.retone();
    api.current?.draw();
    api.current?.wake();
  }, [art, seed, contrast, ink, paper, shape, rest]);

  React.useEffect(() => {
    api.current?.wake();
  }, [linger, paused]);

  // A new linger shows itself: one press, so how long the wake stays is seen.
  const shownLinger = React.useRef(linger);
  React.useEffect(() => {
    if (shownLinger.current === linger) return;
    shownLinger.current = linger;
    api.current?.sweep();
  }, [linger]);

  // The image, when there is one: loaded with CORS so its pixels can be read.
  React.useEffect(() => {
    imageRef.current = null;
    mapRef.current = null;
    api.current?.retone();
    api.current?.draw();
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      mapRef.current = null;
      api.current?.retone();
      api.current?.draw();
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [src]);

  // WebGL, rebuilt if the context comes back; the 2D plate covers otherwise.
  React.useEffect(() => {
    const canvas = glRef.current;
    if (!canvas) return;
    const setup = () => {
      gfxRef.current = createGfx(canvas);
      api.current?.layout();
      api.current?.draw();
    };
    setup();
    const detach = onContextLoss(
      canvas,
      () => {
        gfxRef.current = null;
        api.current?.draw();
      },
      setup,
    );
    return () => {
      detach();
      const g = gfxRef.current;
      if (g && !g.gl.isContextLost()) disposeGfx(g);
      gfxRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) api.current?.sleep();
      else api.current?.wake();
    };
    const onScroll = () => api.current?.scrolled();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  React.useEffect(() => {
    const l = loop.current;
    return () => {
      if (l.raf) window.cancelAnimationFrame(l.raf);
      if (l.draw) window.cancelAnimationFrame(l.draw);
      l.raf = 0;
      l.draw = 0;
    };
  }, []);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const l = loop.current;
      const sizer = new ResizeObserver(() => {
        api.current?.layout();
        api.current?.wake();
      });
      sizer.observe(node);
      const watcher = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          l.seen = Boolean(entry?.isIntersecting);
          if (l.seen) {
            api.current?.scrolled();
            // The plate introduces itself once, when most of it is in view —
            // not the moment its first row of dots scrolls in.
            if (
              intro &&
              !l.introduced &&
              (entry?.intersectionRatio ?? 0) >= 0.6
            ) {
              l.introduced = api.current?.sweep() ?? false;
            }
            api.current?.wake();
          } else api.current?.sleep();
        },
        { threshold: [0, 0.6] },
      );
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        l.seen = false;
        if (l.raf) window.cancelAnimationFrame(l.raf);
        l.raf = 0;
      };
    },
    [intro],
  );

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !live) return;
    const plate = plateRef.current;
    const at = local(event.clientX, event.clientY);
    if (!plate || !at) return;
    const h = motion.current.hover;
    const fresh = h.on && event.timeStamp - h.t < 120;
    stampSegment(
      plate,
      fresh ? h.x : at.x,
      fresh ? h.y : at.y,
      at.x,
      at.y,
      brush / 2,
    );
    h.x = at.x;
    h.y = at.y;
    h.t = event.timeStamp;
    h.on = true;
    wake();
  };

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate aspect-[2/1] w-full overflow-clip",
        interactive && "touch-pan-y",
        className,
      )}
      style={paper ? { background: paper } : undefined}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerMove}
      onPointerLeave={() => {
        motion.current.hover.on = false;
      }}
    >
      <canvas
        ref={glRef}
        aria-hidden
        onTransitionEnd={() => {
          inkRef.current = null;
          api.current?.retone();
          api.current?.draw();
        }}
        className="pointer-events-none absolute inset-0 block size-full transition-colors duration-1"
        style={{
          color: ink,
          borderTopColor: paper ?? "var(--background)",
          // Before the first frame: the ghost of an even screen.
          backgroundImage: `radial-gradient(circle, color-mix(in oklab, ${ink} 16%, transparent) ${Math.max(0.6, size * 0.12).toFixed(2)}px, transparent ${Math.max(1, size * 0.14).toFixed(2)}px)`,
          backgroundSize: `${size}px ${size}px`,
        }}
      />
      <canvas
        ref={flatRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden size-full"
      />
      <div
        role="img"
        aria-label={alt ?? (src ? "Halftone print" : ALT[art])}
        aria-describedby={interactive ? hintId : undefined}
        tabIndex={interactive ? 0 : -1}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            sweep();
          }
        }}
        onKeyDown={(event) => {
          if (!interactive) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (!event.repeat) sweep();
        }}
        className={cn(
          "absolute inset-0 rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      {interactive ? (
        <p id={hintId} className="sr-only">
          Enter or Space runs the press across the whole image.
        </p>
      ) : null}
    </div>
  );
}
