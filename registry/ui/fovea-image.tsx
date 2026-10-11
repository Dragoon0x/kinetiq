"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FoveaImageRest = "sharp" | "coarse";
export type FoveaImageFit = "cover" | "contain";

export type FoveaImageGaze = {
  /** Across the picture, 0 (left) to 1 (right). */
  x: number;
  /** Down the picture, 0 (top) to 1 (bottom). */
  y: number;
};

export type FoveaImageProps = {
  /** The picture's URL. Without it a harbour at dusk is drawn in code. */
  src?: string;
  /** Describes the picture; it is the figure's accessible name. @default "Coldbrook harbour at dusk: boats coming in past a striped lighthouse, the waterfront lit" */
  alt?: string;
  /** The coarse field's block size, px. @default 20 */
  blockSize?: number;
  /** The crisp centre's radius, px. @default 48 */
  fovea?: number;
  /** How many rings of resolution lie between the crisp centre and the coarse field, 1 to 4: each halves the block. @default 2 */
  steps?: number;
  /** Each ring's width as a share of the fovea, 0.2 to 2. @default 0.7 */
  ring?: number;
  /** How long the eye waits before it jumps to where the pointer went, ms. @default 70 */
  lag?: number;
  /** What the picture is with no one looking: sharp all over, or coarse all over. @default "sharp" */
  rest?: FoveaImageRest;
  /** On first view the eye glances round the picture — three fixations — before it settles. @default true */
  intro?: boolean;
  /** A seam between coarse blocks, px, for a tiled look. @default 0 */
  gap?: number;
  /** Fill the box (cropping) or fit inside it. @default "cover" */
  fit?: FoveaImageFit;
  /** A caption laid over the foot of the picture. */
  caption?: React.ReactNode;
  /** Fires when the eye settles on a new point (fractions of the picture), and with null when it stops looking. */
  onGazeChange?: (gaze: FoveaImageGaze | null) => void;
  /** Show the picture at rest and take no input. @default false */
  disabled?: boolean;
  /** Hold everything where it is: no intro, no saccades. @default false */
  paused?: boolean;
  /** Seeds the drawn harbour. @default 4 */
  seed?: number;
  /** Cap on the canvas's pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the box; the picture fills it. @default "h-full w-full" */
  className?: string;
};

/** The drawn picture's size: wide, so a phone's crop still holds the town. */
const PAINT_W = 1600;
const PAINT_H = 640;
const STEP = 1 / 240;
const KEY_STEP = 24;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Coldbrook harbour at dusk, painted in fine detail — lit windows a few
 * pixels wide, a sign, rigging, a striped lighthouse, broken reflections —
 * because detail is what the eye's sharp spot finds.
 */
function paintHarbour(seed: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PAINT_W;
  canvas.height = PAINT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rand = rng(seed * 7919 + 17);
  const W = PAINT_W;
  const H = PAINT_H;
  const horizon = H * 0.6;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "rgb(28, 34, 76)");
  sky.addColorStop(0.45, "rgb(88, 68, 118)");
  sky.addColorStop(0.82, "rgb(226, 126, 94)");
  sky.addColorStop(1, "rgb(250, 188, 122)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);

  for (let i = 0; i < 70; i += 1) {
    ctx.fillStyle = `rgba(255, 246, 230, ${(0.25 + rand() * 0.6).toFixed(2)})`;
    const s = rand() < 0.15 ? 2 : 1.2;
    ctx.fillRect(rand() * W, rand() * horizon * 0.42, s, s);
  }

  const sunX = W * 0.71;
  const glow = ctx.createRadialGradient(
    sunX,
    horizon - 8,
    6,
    sunX,
    horizon - 8,
    340,
  );
  glow.addColorStop(0, "rgba(255, 220, 150, 0.95)");
  glow.addColorStop(0.25, "rgba(255, 170, 110, 0.45)");
  glow.addColorStop(1, "rgba(255, 150, 110, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, horizon);
  ctx.fillStyle = "rgb(255, 226, 164)";
  ctx.beginPath();
  ctx.arc(sunX, horizon - 6, 30, Math.PI, 0);
  ctx.fill();

  // Long clouds lit from below.
  for (let i = 0; i < 7; i += 1) {
    const y = horizon * (0.25 + rand() * 0.45);
    const x = rand() * W;
    const w = 160 + rand() * 340;
    ctx.fillStyle = `rgba(255, ${Math.round(150 + rand() * 50)}, 130, ${(0.18 + rand() * 0.2).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, 3 + rand() * 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Gulls.
  ctx.strokeStyle = "rgba(40, 32, 60, 0.8)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i += 1) {
    const gx = W * (0.3 + rand() * 0.35);
    const gy = horizon * (0.2 + rand() * 0.3);
    const s = 5 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(gx - s, gy - s * 0.4);
    ctx.quadraticCurveTo(gx - s * 0.4, gy - s * 0.6, gx, gy);
    ctx.quadraticCurveTo(gx + s * 0.4, gy - s * 0.6, gx + s, gy - s * 0.4);
    ctx.stroke();
  }

  // Hills, far then near.
  const hills = (
    base: number,
    height: number,
    colour: string,
    rough: number,
  ) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, horizon + 2);
    let y = base;
    for (let x = 0; x <= W; x += 10) {
      y = clamp(y + (rand() - 0.5) * rough, base - height, base);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, horizon + 2);
    ctx.closePath();
    ctx.fill();
  };
  hills(horizon - 30, 70, "rgb(74, 58, 100)", 14);
  hills(horizon - 8, 40, "rgb(52, 42, 78)", 9);

  // The sea.
  const sea = ctx.createLinearGradient(0, horizon, 0, H);
  sea.addColorStop(0, "rgb(104, 74, 112)");
  sea.addColorStop(1, "rgb(20, 24, 52)");
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, W, H - horizon);

  // The waterfront: a quay, two rows of houses, a church, lit windows.
  const quayEnd = W * 0.6;
  const lit: [number, number][] = [];
  for (let row = 0; row < 2; row += 1) {
    let x = W * 0.02;
    while (x < quayEnd - 30) {
      const w = 26 + rand() * 34;
      const h = (row === 0 ? 52 : 34) + rand() * 30;
      const base = horizon + (row === 0 ? -14 : 4);
      const tone = 70 + rand() * 50;
      ctx.fillStyle = `rgb(${Math.round(tone + 30)}, ${Math.round(tone * 0.7)}, ${Math.round(tone + 10)})`;
      ctx.fillRect(x, base - h, w, h);
      ctx.fillStyle = `rgb(${Math.round(tone * 0.6)}, ${Math.round(tone * 0.45)}, ${Math.round(tone * 0.7)})`;
      ctx.beginPath();
      ctx.moveTo(x - 2, base - h);
      ctx.lineTo(x + w / 2, base - h - 10 - rand() * 10);
      ctx.lineTo(x + w + 2, base - h);
      ctx.closePath();
      ctx.fill();
      for (let wy = base - h + 8; wy < base - 8; wy += 10) {
        for (let wx = x + 5; wx < x + w - 6; wx += 8) {
          const on = rand() < 0.42;
          ctx.fillStyle = on ? "rgb(255, 214, 140)" : "rgba(30, 24, 46, 0.7)";
          ctx.fillRect(wx, wy, 3, 4);
          if (on && row === 1 && rand() < 0.5) lit.push([wx, wy]);
        }
      }
      x += w + 2 + rand() * 6;
    }
  }
  // The church, its spire and a clock.
  const cx = W * 0.27;
  ctx.fillStyle = "rgb(96, 74, 104)";
  ctx.fillRect(cx - 14, horizon - 120, 28, 110);
  ctx.beginPath();
  ctx.moveTo(cx - 16, horizon - 120);
  ctx.lineTo(cx, horizon - 196);
  ctx.lineTo(cx + 16, horizon - 120);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgb(246, 232, 200)";
  ctx.beginPath();
  ctx.arc(cx, horizon - 100, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgb(60, 44, 70)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, horizon - 100);
  ctx.lineTo(cx, horizon - 105);
  ctx.moveTo(cx, horizon - 100);
  ctx.lineTo(cx + 4, horizon - 99);
  ctx.stroke();

  // The quay and the fish company's sign.
  ctx.fillStyle = "rgb(38, 30, 54)";
  ctx.fillRect(0, horizon + 2, quayEnd, 12);
  for (let x = 20; x < quayEnd; x += 46) ctx.fillRect(x, horizon - 4, 5, 8);
  ctx.fillStyle = "rgb(70, 52, 72)";
  ctx.fillRect(W * 0.42, horizon - 58, 150, 60);
  ctx.fillStyle = "rgb(244, 226, 190)";
  ctx.font = "bold 13px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText("COLDBROOK FISH CO.", W * 0.42 + 8, horizon - 46);
  ctx.fillStyle = "rgb(255, 214, 140)";
  for (let i = 0; i < 5; i += 1)
    ctx.fillRect(W * 0.42 + 10 + i * 28, horizon - 30, 14, 18);

  // The lighthouse on its rock, with its beam.
  const lx = W * 0.86;
  ctx.fillStyle = "rgb(40, 32, 52)";
  ctx.beginPath();
  ctx.moveTo(lx - 70, horizon + 10);
  ctx.quadraticCurveTo(lx - 30, horizon - 30, lx + 10, horizon - 24);
  ctx.quadraticCurveTo(lx + 60, horizon - 20, lx + 90, horizon + 10);
  ctx.closePath();
  ctx.fill();
  const top = horizon - 170;
  for (let i = 0; i < 6; i += 1) {
    ctx.fillStyle = i % 2 ? "rgb(178, 60, 54)" : "rgb(236, 230, 216)";
    const y0 = top + 20 + i * 24;
    const inset = (i * 24) / 150;
    ctx.fillRect(lx - 12 - inset * 6, y0, 24 + inset * 12, 24);
  }
  ctx.fillStyle = "rgb(60, 50, 64)";
  ctx.fillRect(lx - 16, top + 12, 32, 8);
  const lamp = ctx.createRadialGradient(lx, top, 1, lx, top, 26);
  lamp.addColorStop(0, "rgba(255, 246, 200, 1)");
  lamp.addColorStop(1, "rgba(255, 230, 160, 0)");
  ctx.fillStyle = lamp;
  ctx.fillRect(lx - 26, top - 26, 52, 52);
  const beam = ctx.createLinearGradient(lx, top, lx - 460, top);
  beam.addColorStop(0, "rgba(255, 240, 190, 0.22)");
  beam.addColorStop(1, "rgba(255, 240, 190, 0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(lx, top);
  ctx.lineTo(lx - 460, top - 80);
  ctx.lineTo(lx - 460, top + 34);
  ctx.closePath();
  ctx.fill();

  // The sun broken on the water, the windows' reflections, ripples.
  for (let i = 0; i < 44; i += 1) {
    const t = i / 43;
    const y = horizon + 14 + (H - horizon - 16) * t;
    const w = 16 + 120 * t * (0.4 + rand());
    ctx.fillStyle = `rgba(255, ${Math.round(206 - 60 * t)}, ${Math.round(140 - 40 * t)}, ${(0.8 - 0.6 * t).toFixed(2)})`;
    ctx.fillRect(sunX - w / 2 + (rand() - 0.5) * 30, y, w, 1.5 + t * 2.5);
  }
  for (const [wx] of lit) {
    ctx.fillStyle = "rgba(255, 210, 140, 0.35)";
    for (let k = 0; k < 6; k += 1) {
      ctx.fillRect(
        wx - 1 + (rand() - 0.5) * 3,
        horizon + 18 + k * 7,
        4 + rand() * 3,
        2,
      );
    }
  }
  ctx.strokeStyle = "rgba(255, 196, 170, 0.13)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 140; i += 1) {
    const y = horizon + 16 + rand() * (H - horizon - 16);
    const x = rand() * W;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14 + rand() * 50, y);
    ctx.stroke();
  }

  // Boats coming in: hulls with a stripe, cabins, masts, rigging, a flag.
  for (let i = 0; i < 6; i += 1) {
    const depth = i / 5;
    const s = 0.55 + depth * 0.9;
    const bx = W * (0.08 + rand() * 0.84);
    const by = horizon + 30 + depth * (H - horizon - 90);
    const len = 90 * s;
    ctx.fillStyle = "rgb(22, 20, 36)";
    ctx.beginPath();
    ctx.moveTo(bx - len / 2, by);
    ctx.lineTo(bx + len / 2, by);
    ctx.lineTo(bx + len / 2 - 10 * s, by + 14 * s);
    ctx.lineTo(bx - len / 2 + 6 * s, by + 14 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = i % 2 ? "rgb(170, 64, 56)" : "rgb(60, 110, 140)";
    ctx.fillRect(bx - len / 2 + 4 * s, by + 3 * s, len - 12 * s, 2.5 * s);
    ctx.fillStyle = "rgb(214, 204, 186)";
    ctx.fillRect(bx - 14 * s, by - 14 * s, 26 * s, 14 * s);
    ctx.fillStyle = "rgb(255, 214, 140)";
    ctx.fillRect(bx - 10 * s, by - 10 * s, 5 * s, 4 * s);
    ctx.fillRect(bx - 2 * s, by - 10 * s, 5 * s, 4 * s);
    ctx.strokeStyle = "rgb(30, 26, 44)";
    ctx.lineWidth = Math.max(1, 1.8 * s);
    const mastX = bx + 18 * s;
    const mastTop = by - 70 * s;
    ctx.beginPath();
    ctx.moveTo(mastX, by);
    ctx.lineTo(mastX, mastTop);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(mastX, mastTop);
    ctx.lineTo(bx - len / 2 + 4, by);
    ctx.moveTo(mastX, mastTop);
    ctx.lineTo(bx + len / 2 - 2, by);
    ctx.stroke();
    ctx.fillStyle = "rgb(214, 70, 60)";
    ctx.beginPath();
    ctx.moveTo(mastX, mastTop);
    ctx.lineTo(mastX + 10 * s, mastTop + 3 * s);
    ctx.lineTo(mastX, mastTop + 6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 210, 140, 0.25)";
    ctx.fillRect(bx - 10 * s, by + 16 * s, 3 * s, 12 * s);
  }
  return canvas;
}

const FRAGMENT = `
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform vec4 u_crop;
uniform vec2 u_gaze;
uniform float u_radius;
uniform float u_ring;
uniform float u_steps;
uniform float u_block;
uniform float u_open;
uniform float u_gap;
uniform float u_texel;
in vec2 v_uv;
out vec4 outColor;

vec2 cropOf(vec2 p) { return u_crop.xy + (p / u_size) * u_crop.zw; }

void main() {
  vec2 p = v_uv * u_size;
  vec2 mid = u_size * 0.5;
  // The coarsest level first; a block whose centre lies inside its ring's
  // radius gives way to the next finer level, so ring edges step in blocks.
  float level = u_steps;
  float b = u_block;
  vec2 cell = p;
  for (int i = 0; i < 5; i++) {
    if (level < 0.5) break;
    float size = u_block * pow(0.5, u_steps - level);
    vec2 c = (floor((p - mid) / size) + 0.5) * size + mid;
    float reach = u_radius + (level - 1.0) * u_ring + u_open;
    if (distance(c, u_gaze) > reach) {
      b = size;
      cell = c;
      break;
    }
    level -= 1.0;
  }
  vec2 uv = level < 0.5 ? cropOf(p) : cropOf(cell);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    outColor = vec4(0.0);
    return;
  }
  vec3 col;
  if (level < 0.5) {
    col = texture(u_tex, uv).rgb;
  } else {
    // The block's own average: the mip level as wide as the block.
    col = textureLod(u_tex, uv, log2(max(1.0, b * u_texel))).rgb;
    if (u_gap > 0.0) {
      vec2 f = mod(p - mid, b);
      float seam = max(step(f.x, u_gap), step(f.y, u_gap));
      col = mix(col, col * 0.78, seam * smoothstep(3.0, 6.0, b));
    }
  }
  outColor = vec4(col, 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  tex: WebGLTexture | null;
  lost: boolean;
};

type Config = {
  blockSize: number;
  fovea: number;
  steps: number;
  ring: number;
  lag: number;
  rest: FoveaImageRest;
  intro: boolean;
  gap: number;
  fit: FoveaImageFit;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
  source: HTMLCanvasElement | HTMLImageElement | null;
  sourceKey: string;
  onGaze: (gaze: FoveaImageGaze | null) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  seen: (inView: boolean) => void;
  look: (x: number, y: number, immediate: boolean) => void;
  nudge: (dx: number, dy: number) => void;
  rest: (sharp?: boolean) => void;
  looking: () => boolean;
  wake: () => void;
  dispose: () => void;
};

type Spring = { x: number; v: number; target: number };

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let flat: CanvasRenderingContext2D | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let failed = false;
  let engaged = false;
  let introDone = false;
  let introTimers: number[] = [];
  let lagTimer = 0;
  let pending: { x: number; y: number } | null = null;
  let uploaded = "";
  const size = { w: 0, h: 0 };
  const gx: Spring = { x: 0, v: 0, target: 0 };
  const gy: Spring = { x: 0, v: 0, target: 0 };
  /** How far the sharp area reaches past the rings, px: large is sharp all over, negative coarse all over. */
  const open: Spring = { x: 1e4, v: 0, target: 1e4 };

  const diag = () => Math.hypot(size.w, size.h) + 40;
  const restOpen = (c: Config) =>
    c.rest === "coarse"
      ? -(c.fovea + c.ring * c.fovea * c.steps + c.blockSize * 2)
      : diag();

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    gpu = { gl, program, tri, tex: null, lost: false };
    uploaded = "";
    return true;
  };

  const releaseGpu = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    if (g.tex) g.gl.deleteTexture(g.tex);
    g.tri.dispose();
    g.program.dispose();
  };

  const sourceSize = (s: HTMLCanvasElement | HTMLImageElement) =>
    s instanceof HTMLImageElement
      ? { w: s.naturalWidth, h: s.naturalHeight }
      : { w: s.width, h: s.height };

  /**
   * Where the box looks into the picture, in texture space, and how many
   * texels span one px. Contain reaches past the picture's edges, which the
   * shader leaves clear.
   */
  const crop = (c: Config) => {
    const src = c.source ? sourceSize(c.source) : { w: PAINT_W, h: PAINT_H };
    const sx = size.w / Math.max(1, src.w);
    const sy = size.h / Math.max(1, src.h);
    const k = c.fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
    const fw = size.w / Math.max(1, src.w * k);
    const fh = size.h / Math.max(1, src.h * k);
    return {
      rect: [(1 - fw) / 2, (1 - fh) / 2, fw, fh] as const,
      texel: 1 / k,
    };
  };

  const upload = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !c.source || uploaded === c.sourceKey) return;
    const { gl } = p;
    try {
      p.tex = uploadTexture(gl, c.source, { linear: true }, p.tex);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR,
      );
      uploaded = c.sourceKey;
    } catch {
      // A picture from another origin without permission cannot be read:
      // it is shown as it is, sharp.
      fallBack();
    }
  };

  const drawFlat = () => {
    const c = cfg;
    if (!c || !c.source || size.w < 1) return;
    if (!flat) flat = canvas.getContext("2d");
    if (!flat) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.max(1, Math.round(size.w * dpr));
    canvas.height = Math.max(1, Math.round(size.h * dpr));
    const s = sourceSize(c.source);
    const k =
      c.fit === "cover"
        ? Math.max(canvas.width / s.w, canvas.height / s.h)
        : Math.min(canvas.width / s.w, canvas.height / s.h);
    const w = s.w * k;
    const h = s.h * k;
    flat.clearRect(0, 0, canvas.width, canvas.height);
    flat.drawImage(
      c.source,
      (canvas.width - w) / 2,
      (canvas.height - h) / 2,
      w,
      h,
    );
    root.setAttribute("data-live", "");
  };

  const fallBack = () => {
    failed = true;
    releaseGpu();
    root.setAttribute("data-fallback", "");
    drawFlat();
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    upload();
    if (!p.tex || uploaded !== c.sourceKey) return;
    const { gl, program } = p;
    const z = crop(c);
    program.texture("u_tex", p.tex, 0);
    program.set({
      u_size: [size.w, size.h],
      u_crop: [z.rect[0], z.rect[1], z.rect[2], z.rect[3]],
      u_gaze: [gx.x, gy.x],
      u_radius: clamp(c.fovea, 4, 400),
      u_ring: clamp(c.ring, 0.2, 2) * clamp(c.fovea, 4, 400),
      u_steps: clamp(Math.round(c.steps), 1, 4),
      u_block: clamp(c.blockSize, 2, 120),
      u_open: open.x,
      u_gap: clamp(c.gap, 0, 6),
      u_texel: z.texel,
    });
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const integrate = (
    s: Spring,
    k: { stiffness: number; damping: number; mass: number },
    dt: number,
    eps: number,
  ) => {
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      s.v += ((k.stiffness * (s.target - s.x) - k.damping * s.v) / k.mass) * h;
      s.x += s.v * h;
    }
    if (Math.abs(s.target - s.x) < eps && Math.abs(s.v) < eps * 10) {
      s.x = s.target;
      s.v = 0;
      return false;
    }
    return true;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    // A saccade lands with the snap spring's one overshoot; the field opens
    // slowly (drift) and closes in quickly (glide).
    const a = integrate(gx, springs.snap, dt, 0.05);
    const b = integrate(gy, springs.snap, dt, 0.05);
    const o = integrate(
      open,
      open.target > open.x ? springs.drift : springs.glide,
      dt,
      0.5,
    );
    draw();
    if (a || b || o) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Without motion every spring is where it is going. */
  const settleNow = () => {
    for (const s of [gx, gy, open]) {
      s.x = s.target;
      s.v = 0;
    }
  };

  const report = (on: boolean) => {
    const c = cfg;
    if (!c) return;
    c.onGaze(
      on && size.w > 0
        ? {
            x: r3(clamp(gx.target / size.w, 0, 1)),
            y: r3(clamp(gy.target / size.h, 0, 1)),
          }
        : null,
    );
  };

  const aim = (x: number, y: number) => {
    gx.target = clamp(x, 0, size.w);
    gy.target = clamp(y, 0, size.h);
    report(true);
    if (!cfg?.motionSafe) settleNow();
    draw();
    kick();
  };

  const stopIntro = () => {
    for (const t of introTimers) window.clearTimeout(t);
    introTimers = [];
  };

  const runIntro = () => {
    const c = cfg;
    if (
      !c ||
      introDone ||
      engaged ||
      !c.intro ||
      !c.motionSafe ||
      c.paused ||
      size.w < 1 ||
      !gpu?.tex ||
      uploaded !== c.sourceKey
    ) {
      return;
    }
    introDone = true;
    // Three fixations, saccade to saccade, then the field opens.
    const points: [number, number][] = [
      [0.34, 0.5],
      [0.62, 0.44],
      [0.86, 0.36],
    ];
    const at = (fx: number, fy: number) => {
      gx.target = fx * size.w;
      gy.target = fy * size.h;
    };
    const first = points[0] as [number, number];
    at(first[0], first[1]);
    gx.x = gx.target;
    gy.x = gy.target;
    open.x = 0;
    open.target = 0;
    points.slice(1).forEach(([fx, fy], i) => {
      introTimers.push(
        window.setTimeout(
          () => {
            at(fx, fy);
            kick();
          },
          520 * (i + 1),
        ),
      );
    });
    introTimers.push(
      window.setTimeout(
        () => {
          if (!engaged && cfg) open.target = restOpen(cfg);
          kick();
        },
        520 * points.length + 120,
      ),
    );
    draw();
    kick();
  };

  const resize = () => {
    const c = cfg;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1 || !c) return;
    const first = size.w < 1;
    size.w = w;
    size.h = h;
    if (first) {
      gx.x = gx.target = w / 2;
      gy.x = gy.target = h / 2;
      open.x = open.target = restOpen(c);
    } else if (!engaged && open.target > 0) {
      open.target = restOpen(c);
      if (!c.motionSafe || open.x > 0) open.x = Math.max(open.x, 0);
    }
    if (failed) {
      drawFlat();
      return;
    }
    const p = gpu;
    if (!p || p.lost) return;
    resizeGL(p.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
    draw();
    kick();
  };

  const look = (x: number, y: number, immediate: boolean) => {
    const c = cfg;
    if (!c || c.paused) return;
    stopIntro();
    if (!engaged) {
      engaged = true;
      // The eye arrives where the pointer came in, and the field closes in on it.
      gx.target = gx.x = clamp(x, 0, size.w);
      gy.target = gy.x = clamp(y, 0, size.h);
      gx.v = gy.v = 0;
      open.target = 0;
      if (!c.motionSafe) settleNow();
      report(true);
      draw();
      kick();
      return;
    }
    if (immediate || c.lag <= 0) {
      aim(x, y);
      return;
    }
    // A move smaller than a quarter block is not worth a saccade.
    if (
      Math.hypot(x - gx.target, y - gy.target) < Math.max(3, c.blockSize * 0.25)
    ) {
      return;
    }
    pending = { x, y };
    if (lagTimer) return;
    lagTimer = window.setTimeout(() => {
      lagTimer = 0;
      const at = pending;
      pending = null;
      if (at && engaged) aim(at.x, at.y);
    }, c.lag);
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) {
        if (!was || was.sourceKey !== next.sourceKey || was.fit !== next.fit)
          drawFlat();
        return;
      }
      if (!gpu) {
        if (!build()) {
          fallBack();
          return;
        }
        detach = onContextLoss(
          canvas,
          () => {
            if (gpu) gpu.lost = true;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
          },
          () => {
            gpu = null;
            if (!disposed && build()) {
              resize();
              kick();
            }
          },
        );
        resize();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.sourceKey !== next.sourceKey) {
        draw();
        if (visible.current) runIntro();
      }
      if (
        !engaged &&
        (was.rest !== next.rest ||
          was.fovea !== next.fovea ||
          was.steps !== next.steps ||
          was.ring !== next.ring ||
          was.blockSize !== next.blockSize)
      ) {
        open.target = restOpen(next);
      }
      if (!next.motionSafe || next.paused) {
        stopIntro();
        if (!next.motionSafe) settleNow();
      }
      draw();
      kick();
    },
    resize,
    seen(inView) {
      if (!cfg) return;
      if (inView) {
        draw();
        runIntro();
        kick();
      }
    },
    look,
    nudge(dx, dy) {
      const c = cfg;
      if (!c || c.paused) return;
      if (!engaged) {
        // Looking starts from the middle of the picture.
        look(size.w / 2, size.h / 2, true);
        return;
      }
      aim(gx.target + dx, gy.target + dy);
    },
    rest(sharp = false) {
      const c = cfg;
      window.clearTimeout(lagTimer);
      lagTimer = 0;
      pending = null;
      if (!c) return;
      stopIntro();
      const was = engaged;
      engaged = false;
      open.target = sharp ? diag() : restOpen(c);
      if (!c.motionSafe) settleNow();
      if (was) report(false);
      draw();
      kick();
    },
    looking: () => engaged,
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      stopIntro();
      window.clearTimeout(lagTimer);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      releaseGpu();
    },
  };
}

/**
 * A picture drawn coarse, in square blocks, everywhere except where you
 * look: under the pointer it sharpens in steps — a crisp centre, rings of
 * middle resolution each halving the block, then the coarse field — and each
 * block shows the average of the picture beneath it. The sharp spot follows
 * the pointer as an eye does: it waits a moment, then jumps on the snap
 * spring, whose one overshoot is the small glissade a real saccade ends with.
 * Entering closes the field in onto your gaze on glide; leaving opens it out
 * on drift until the picture is sharp all over. On first view the eye glances
 * round the picture before it settles.
 *
 * The figure is one image to assistive technology, named by `alt`. Keyboard
 * focus shows it sharp; the arrow keys then look around it and Escape stops
 * looking. One WebGL2 pass over a mipmapped texture, drawn only while
 * something moves; without WebGL2 the picture is shown sharp. Under reduced
 * motion the spot jumps straight to the pointer and the field swaps at once.
 */
export function FoveaImage({
  src,
  alt = "Coldbrook harbour at dusk: boats coming in past a striped lighthouse, the waterfront lit",
  blockSize = 20,
  fovea = 48,
  steps = 2,
  ring = 0.7,
  lag = 70,
  rest = "sharp",
  intro = true,
  gap = 0,
  fit = "cover",
  caption,
  onGazeChange,
  disabled = false,
  paused = false,
  seed = 4,
  dpr = 2,
  className,
}: FoveaImageProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const inside = React.useRef(false);
  const gazeRef = React.useRef(onGazeChange);
  const [source, setSource] = React.useState<{
    key: string;
    image: HTMLCanvasElement | HTMLImageElement;
  } | null>(null);

  React.useEffect(() => {
    gazeRef.current = onGazeChange;
  });

  // The picture: an image loaded once, or the harbour painted once per seed.
  React.useEffect(() => {
    let live = true;
    if (src) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        if (live) setSource({ key: `src:${src}`, image: img });
      };
      img.src = src;
    } else {
      // Painting is synchronous but kept off the commit: the next frame.
      const frame = window.requestAnimationFrame(() => {
        if (live) setSource({ key: `seed:${seed}`, image: paintHarbour(seed) });
      });
      return () => {
        live = false;
        window.cancelAnimationFrame(frame);
      };
    }
    return () => {
      live = false;
    };
  }, [src, seed]);

  const config: Config = {
    blockSize,
    fovea,
    steps,
    ring,
    lag,
    rest,
    intro,
    gap,
    fit,
    paused,
    dpr,
    motionSafe,
    source: source?.image ?? null,
    sourceKey: source?.key ?? "",
    onGaze: (g) => gazeRef.current?.(g),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const e = createEngine(root, canvas, visible);
    engine.current = e;
    e.configure(latest.current);
    if (visible.current) e.seen(true);
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        engine.current?.seen(visible.current);
      },
      { threshold: 0.3 },
    );
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (event: React.PointerEvent) => {
    const r = event.currentTarget.getBoundingClientRect();
    return [event.clientX - r.left, event.clientY - r.top] as const;
  };

  return (
    <figure
      ref={bindRoot}
      className={cn(
        "group/fovea-image relative isolate m-0 h-full w-full overflow-clip rounded-3 bg-[linear-gradient(to_bottom,oklch(0.32_0.07_285),oklch(0.62_0.12_40)_58%,oklch(0.3_0.06_290)_62%,oklch(0.2_0.04_270))]",
        className,
      )}
    >
      <div
        role="img"
        aria-label={alt}
        tabIndex={disabled ? -1 : 0}
        onPointerEnter={(event) => {
          if (disabled || event.pointerType === "touch") return;
          inside.current = true;
          const [x, y] = local(event);
          engine.current?.look(x, y, true);
        }}
        onPointerMove={(event) => {
          if (disabled) return;
          if (event.pointerType === "touch" && event.buttons === 0) return;
          const [x, y] = local(event);
          engine.current?.look(x, y, false);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          inside.current = false;
          engine.current?.rest();
        }}
        onPointerDown={(event) => {
          if (disabled || event.pointerType !== "touch") return;
          const [x, y] = local(event);
          engine.current?.look(x, y, true);
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "touch") engine.current?.rest();
        }}
        onPointerCancel={() => engine.current?.rest()}
        onFocus={(event) => {
          // Keyboard focus shows the whole picture sharp; a click keeps looking.
          if (event.currentTarget.matches(":focus-visible")) {
            engine.current?.rest(true);
          }
        }}
        onBlur={() => {
          if (!inside.current) engine.current?.rest();
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const n = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-n, 0],
            ArrowRight: [n, 0],
            ArrowUp: [0, -n],
            ArrowDown: [0, n],
          };
          const move = moves[event.key];
          if (move) {
            event.preventDefault();
            engine.current?.nudge(move[0], move[1]);
            return;
          }
          if (event.key === "Escape" && engine.current?.looking()) {
            event.preventDefault();
            engine.current.rest(true);
          }
        }}
        className={cn(
          "absolute inset-0 touch-pan-y outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-default" : "cursor-crosshair",
        )}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/fovea-image:opacity-100"
        />
      </div>
      {caption ? (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,color-mix(in_oklab,black_55%,transparent),transparent)] px-4 pt-8 pb-3 text-xs font-medium text-[oklch(0.97_0.006_90)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
