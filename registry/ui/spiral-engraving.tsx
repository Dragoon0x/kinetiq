"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type SpiralEngravingSubject = "moon" | "peak" | "bloom";
export type SpiralEngravingDirection = "inward" | "outward";
export type SpiralEngravingReveal = "inView" | "mount" | "none";
export type SpiralEngravingSpin = "still" | "turning" | "flung";

export type SpiralEngravingProps = {
  /** Distance between neighbouring turns of the line, CSS px, 3 to 10. @default 4 */
  pitch?: number;
  /** How hard the picture's tones are pushed apart, 0.5 (soft) to 2 (stark). @default 1.2 */
  contrast?: number;
  /** The plate's resting spin, turns per minute, 0 to 60: the line flows by one pitch per turn. @default 20 */
  spin?: number;
  /** The picture drawn in code when there is no `src`. @default "moon" */
  subject?: SpiralEngravingSubject;
  /** An image URL to engrave instead (CORS-enabled); the subject stands in while it loads or if it fails. */
  src?: string;
  /** What the picture shows, for assistive technology. @default by subject */
  alt?: string;
  /** The line's colour; any CSS colour. @default "var(--foreground)" */
  ink?: string;
  /** The plate's colour; any CSS colour. @default "var(--card)" */
  paper?: string;
  /** The line's width in the lightest tones, as a share of the pitch, 0 to 0.4: it never breaks. @default 0.08 */
  thin?: number;
  /** The line's width in the darkest tones, as a share of the pitch, 0.5 to 1. @default 0.9 */
  bold?: number;
  /** How quickly a fling slows back to the resting spin: 0 coasts long, 1 stops short. @default 0.5 */
  friction?: number;
  /** Which way the line flows as the plate turns. @default "inward" */
  direction?: SpiralEngravingDirection;
  /** When the line swells from a hairline into the picture: first seen, at mount, or already cut. @default "inView" */
  reveal?: SpiralEngravingReveal;
  /** Fires when the plate comes to rest, settles into its resting spin, or is flung faster. */
  onSpinChange?: (state: SpiralEngravingSpin) => void;
  /** The plate's accessible name (it is a button you can spin). @default "Spin the plate" */
  label?: string;
  /** Hold the plate still; a drag still turns it. @default false */
  paused?: boolean;
  /** No dragging or keys. @default false */
  disabled?: boolean;
  /** Cap on the canvas's pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Classes for the root; it is square, so give it a width. */
  className?: string;
};

const ALTS: Record<SpiralEngravingSubject, string> = {
  moon: "A full moon with dark seas and bright craters, engraved as one spiral line.",
  peak: "A snow peak under a low sun above a still lake, engraved as one spiral line.",
  bloom:
    "An anemone with a dark heart and pale petals, engraved as one spiral line.",
};

const TONE = 512;
const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_dpr;
uniform float u_radius;
uniform float u_pitch;
uniform float u_phase;
uniform float u_contrast;
uniform float u_thin;
uniform float u_bold;
uniform float u_reveal;
uniform float u_invert;
uniform vec3 u_ink;
uniform vec3 u_paper;
uniform sampler2D u_tone;
in vec2 v_uv;
out vec4 outColor;

${GLSL_LUMA}

void main() {
  vec2 p = v_uv * u_size;
  vec2 d = p - u_size * 0.5;
  float r = length(d);
  float R = u_radius;
  float disc = 1.0 - smoothstep(R - 0.8, R + 0.8, r);
  if (disc <= 0.0) { outColor = vec4(0.0); return; }

  // One Archimedean line: its phase at this pixel, and how far the pixel is
  // from the line's centre, measured across the turns.
  float theta = atan(d.y, d.x);
  float s = r / u_pitch - theta / 6.28318530718 + u_phase;
  float dist = abs(fract(s) - 0.5) * u_pitch;

  // The picture is sampled where the pixel IS, not where the line came from:
  // that is what holds the image still while the line turns through it.
  vec2 tuv = clamp(d / (R * 2.0) + 0.5, 0.0, 1.0);
  float tone = kx_luma(texture(u_tone, tuv).rgb);
  tone = clamp((tone - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  // A light line on dark paper is a white-line engraving: it swells where
  // the picture is light, or the plate would print a negative.
  float dark = mix(1.0 - tone, tone, u_invert);
  // The cut: inside the front the line has swollen into the picture.
  float edge = u_reveal * R * 1.2;
  dark *= 1.0 - smoothstep(edge - R * 0.22, edge, r);

  float hw = 0.5 * u_pitch * mix(u_thin, u_bold, dark);
  hw = max(hw, 0.38 * u_dpr);
  float ink = 1.0 - smoothstep(hw - 0.6, hw + 0.6, dist);
  // The line stops short of the rim, which carries two engraved rings.
  float inner = R - 7.0 * u_dpr;
  ink *= 1.0 - smoothstep(inner - 1.0, inner + 1.0, r);
  float spindle = 1.0 - smoothstep(u_pitch * 0.5 - 0.7, u_pitch * 0.5 + 0.7, r);
  float ring1 = 1.0 - smoothstep(0.55 * u_dpr, 0.55 * u_dpr + 1.0, abs(r - (R - 4.0 * u_dpr)));
  float ring2 = 1.0 - smoothstep(0.35 * u_dpr, 0.35 * u_dpr + 1.0, abs(r - (R - 1.2 * u_dpr)));
  ink = max(max(ink, spindle), max(ring1, ring2 * 0.55));

  vec3 col = mix(u_paper, u_ink, ink);
  outColor = vec4(col * disc, disc);
}
`;

const grey = (v: number) => {
  const c = Math.round(clamp(v, 0, 1) * 255);
  return `rgb(${c} ${c} ${c})`;
};
const greyA = (v: number, a: number) => {
  const c = Math.round(clamp(v, 0, 1) * 255);
  return `rgb(${c} ${c} ${c} / ${a})`;
};

/** The pictures, drawn in greys: a tone map, light is 1 and dark is 0. */
function drawSubject(
  ctx: CanvasRenderingContext2D,
  subject: SpiralEngravingSubject,
) {
  const S = TONE;
  ctx.save();
  ctx.clearRect(0, 0, S, S);
  if (subject === "peak") {
    const sky = ctx.createLinearGradient(0, 0, 0, S * 0.62);
    sky.addColorStop(0, grey(0.8));
    sky.addColorStop(1, grey(0.98));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, S, S);
    const glow = ctx.createRadialGradient(
      S * 0.68,
      S * 0.3,
      0,
      S * 0.68,
      S * 0.3,
      S * 0.2,
    );
    glow.addColorStop(0, grey(1));
    glow.addColorStop(1, greyA(1, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = grey(1);
    ctx.beginPath();
    ctx.arc(S * 0.68, S * 0.3, S * 0.07, 0, TAU);
    ctx.fill();
    const poly = (pts: number[][], fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      pts.forEach(([x = 0, y = 0], i) =>
        i ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S),
      );
      ctx.closePath();
      ctx.fill();
    };
    poly(
      [
        [0, 0.6],
        [0.16, 0.48],
        [0.26, 0.52],
        [0.4, 0.44],
        [0.6, 0.5],
        [0.78, 0.43],
        [1, 0.55],
        [1, 0.64],
        [0, 0.64],
      ],
      grey(0.7),
    );
    poly(
      [
        [0.06, 0.63],
        [0.3, 0.38],
        [0.4, 0.43],
        [0.52, 0.2],
        [0.66, 0.4],
        [0.76, 0.35],
        [0.95, 0.63],
      ],
      grey(0.26),
    );
    poly(
      [
        [0.52, 0.2],
        [0.66, 0.4],
        [0.76, 0.35],
        [0.95, 0.63],
        [0.6, 0.63],
        [0.58, 0.42],
      ],
      grey(0.46),
    );
    poly(
      [
        [0.52, 0.2],
        [0.585, 0.29],
        [0.55, 0.3],
        [0.53, 0.27],
        [0.5, 0.31],
        [0.47, 0.28],
      ],
      grey(0.97),
    );
    poly(
      [
        [0.3, 0.38],
        [0.34, 0.42],
        [0.31, 0.43],
        [0.27, 0.42],
      ],
      grey(0.92),
    );
    const lake = ctx.createLinearGradient(0, S * 0.63, 0, S);
    lake.addColorStop(0, grey(0.72));
    lake.addColorStop(1, grey(0.42));
    ctx.fillStyle = lake;
    ctx.fillRect(0, S * 0.63, S, S * 0.37);
    ctx.globalAlpha = 0.32;
    poly(
      [
        [0.06, 0.63],
        [0.3, 0.86],
        [0.4, 0.82],
        [0.52, 1],
        [0.66, 0.86],
        [0.76, 0.9],
        [0.95, 0.63],
      ],
      grey(0.2),
    );
    ctx.globalAlpha = 1;
    ctx.fillStyle = greyA(1, 0.5);
    for (let i = 0; i < 6; i += 1)
      ctx.fillRect(S * (0.6 + i * 0.03), S * (0.68 + i * 0.035), S * 0.12, 2);
    poly(
      [
        [0, 0.8],
        [0.18, 0.76],
        [0.36, 0.84],
        [0.5, 1],
        [0, 1],
      ],
      grey(0.16),
    );
  } else if (subject === "bloom") {
    const bg = ctx.createRadialGradient(
      S / 2,
      S / 2,
      S * 0.1,
      S / 2,
      S / 2,
      S * 0.6,
    );
    // A shaded ground, so the pale petals stand out against it.
    bg.addColorStop(0, grey(0.34));
    bg.addColorStop(1, grey(0.12));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    const petal = (
      angle: number,
      length: number,
      width: number,
      base: number,
      tip: number,
    ) => {
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.rotate(angle);
      const g = ctx.createLinearGradient(0, 0, length, 0);
      g.addColorStop(0, grey(base));
      g.addColorStop(1, grey(tip));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(
        length * 0.3,
        -width,
        length * 0.95,
        -width * 0.8,
        length,
        0,
      );
      ctx.bezierCurveTo(length * 0.95, width * 0.8, length * 0.3, width, 0, 0);
      ctx.fill();
      ctx.strokeStyle = greyA(0.3, 0.25);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(S * 0.06, 0);
      ctx.lineTo(length * 0.85, 0);
      ctx.stroke();
      ctx.restore();
    };
    for (let i = 0; i < 7; i += 1)
      petal((i / 7) * TAU - 0.4, S * 0.4, S * 0.17, 0.5, 0.95);
    for (let i = 0; i < 7; i += 1)
      petal(((i + 0.5) / 7) * TAU - 0.4, S * 0.3, S * 0.12, 0.64, 1);
    ctx.fillStyle = grey(0.08);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.085, 0, TAU);
    ctx.fill();
    ctx.fillStyle = grey(0.88);
    for (let i = 0; i < 22; i += 1) {
      const a = (i / 22) * TAU;
      const rr = S * (0.1 + (i % 2) * 0.018);
      ctx.beginPath();
      ctx.arc(
        S / 2 + Math.cos(a) * rr,
        S / 2 + Math.sin(a) * rr,
        S * 0.009,
        0,
        TAU,
      );
      ctx.fill();
    }
  } else {
    // A night sky, so the moon stands out as the light in the plate.
    const sky = ctx.createRadialGradient(
      S / 2,
      S / 2,
      S * 0.3,
      S / 2,
      S / 2,
      S * 0.72,
    );
    sky.addColorStop(0, grey(0.42));
    sky.addColorStop(0.45, grey(0.2));
    sky.addColorStop(1, grey(0.1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, S, S);
    const cx = S / 2;
    const cy = S / 2;
    const R = S * 0.33;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    const body = ctx.createRadialGradient(
      cx - R * 0.35,
      cy - R * 0.4,
      R * 0.05,
      cx,
      cy,
      R * 1.02,
    );
    body.addColorStop(0, grey(1));
    body.addColorStop(0.55, grey(0.86));
    body.addColorStop(0.85, grey(0.64));
    body.addColorStop(1, grey(0.42));
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, S, S);
    // The seas: soft dark pools.
    const seas: [number, number, number, number][] = [
      [-0.2, -0.22, 0.28, 0.2],
      [0.18, -0.3, 0.2, 0.15],
      [0.12, 0.06, 0.3, 0.22],
      [-0.32, 0.2, 0.18, 0.26],
      [0.34, 0.34, 0.14, 0.12],
    ];
    ctx.filter = "blur(8px)";
    for (const [x, y, rx, ry] of seas) {
      ctx.fillStyle = greyA(0.1, 0.5);
      ctx.beginPath();
      ctx.ellipse(cx + x * R, cy + y * R, rx * R, ry * R, 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.filter = "none";
    // Craters: a shaded floor and a rim lit on the side away from the sun.
    const craters: [number, number, number][] = [
      [-0.46, -0.52, 0.09],
      [0.42, -0.46, 0.07],
      [-0.08, 0.58, 0.13],
      [0.55, 0.06, 0.08],
      [-0.62, 0.08, 0.06],
      [0.22, 0.46, 0.06],
      [-0.3, -0.04, 0.05],
    ];
    for (const [x, y, rr] of craters) {
      const px = cx + x * R;
      const py = cy + y * R;
      ctx.fillStyle = greyA(0.05, 0.45);
      ctx.beginPath();
      ctx.arc(px, py, rr * R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = greyA(1, 0.9);
      ctx.lineWidth = rr * R * 0.32;
      ctx.beginPath();
      ctx.arc(px, py, rr * R * 0.86, -0.2 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
    }
  }
  ctx.restore();
}

type Config = {
  pitch: number;
  contrast: number;
  spin: number;
  thin: number;
  bold: number;
  friction: number;
  direction: SpiralEngravingDirection;
  reveal: SpiralEngravingReveal;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  texture: WebGLTexture | null;
  lost: boolean;
};

type Engine = {
  configure: (next: Config) => void;
  setTone: (source: HTMLCanvasElement) => void;
  readColours: () => void;
  resize: () => void;
  seen: (inView: boolean) => void;
  wake: () => void;
  grab: (clientX: number, clientY: number) => void;
  turn: (clientX: number, clientY: number) => void;
  drop: () => void;
  flick: (turnsPerSecond: number) => void;
  brake: () => void;
  dispose: () => void;
};

/** A colour string to sRGB 0–1, by painting one pixel of it. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0 0 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: { ink: HTMLElement; paper: HTMLElement },
  visible: { current: boolean },
  report: { current: (state: SpiralEngravingSpin) => void },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let flat: CanvasRenderingContext2D | null = null;
  let failed = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let tone: HTMLCanvasElement | null = null;
  let toneData: Uint8ClampedArray | null = null;
  const read = colourReader();
  let ink: [number, number, number] = [0, 0, 0];
  let paper: [number, number, number] = [1, 1, 1];
  const lum = (c: [number, number, number]) =>
    0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const invert = () => (lum(ink) > lum(paper) ? 1 : 0);

  let phase = 0;
  let omega = 0;
  let reveal = 0;
  let revealing = false;
  let revealed = false;
  let dragging = false;
  let grabAngle = 0;
  let lastAngle = 0;
  const samples: { t: number; p: number }[] = [];
  let state: SpiralEngravingSpin = "still";
  const size = { w: 0, h: 0, ratio: 1 };

  // The 2D stand-in is redrawn only by the hand: it has no resting spin.
  const base = (c: Config) =>
    c.paused || !c.motionSafe || failed
      ? 0
      : (clamp(c.spin, 0, 60) / 60) * (c.direction === "outward" ? -1 : 1);

  const tell = () => {
    const c = cfg;
    if (!c) return;
    const b = base(c);
    const next: SpiralEngravingSpin =
      dragging || Math.abs(omega - b) > 0.12
        ? "flung"
        : Math.abs(omega) > 0.001
          ? "turning"
          : "still";
    if (next === state) return;
    state = next;
    report.current(next);
  };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    gpu = { gl, program, tri, texture: null, lost: false };
    if (tone) gpu.texture = uploadTexture(gl, tone, { linear: true });
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    if (g.texture) g.gl.deleteTexture(g.texture);
    g.tri.dispose();
    g.program.dispose();
  };

  /** No WebGL2: the same line drawn once as a ribbon on a 2D canvas. */
  const drawFlat = (c: Config) => {
    if (!flat || !toneData) return;
    const ratio = size.ratio;
    const w = canvas.width;
    const h = canvas.height;
    flat.setTransform(1, 0, 0, 1, 0, 0);
    flat.clearRect(0, 0, w, h);
    const R = (Math.min(size.w, size.h) / 2 - 1) * ratio;
    const cx = w / 2;
    const cy = h / 2;
    const p = clamp(c.pitch, 3, 10) * ratio;
    flat.fillStyle = `rgb(${paper.map((v) => Math.round(v * 255)).join(" ")})`;
    flat.beginPath();
    flat.arc(cx, cy, R, 0, TAU);
    flat.fill();
    const inkCss = `rgb(${ink.map((v) => Math.round(v * 255)).join(" ")})`;
    const toneAt = (x: number, y: number) => {
      const u = clamp(((x - cx) / (R * 2) + 0.5) * TONE, 0, TONE - 1);
      const v = clamp(((y - cy) / (R * 2) + 0.5) * TONE, 0, TONE - 1);
      const i = (Math.floor(v) * TONE + Math.floor(u)) * 4;
      const l =
        (0.2126 * (toneData?.[i] ?? 255) +
          0.7152 * (toneData?.[i + 1] ?? 255) +
          0.0722 * (toneData?.[i + 2] ?? 255)) /
        255;
      return clamp((l - 0.5) * c.contrast + 0.5, 0, 1);
    };
    const inner: number[] = [];
    const outer: number[] = [];
    const off = (((0.5 - phase) % 1) + 1) % 1;
    const limit = R - 7 * ratio;
    for (let a = 0; ;) {
      const r = p * (a / TAU + off);
      if (r > limit) break;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const x = cx + r * dx;
      const y = cy + r * dy;
      const t = toneAt(x, y);
      const dark = invert() ? t : 1 - t;
      const half = Math.max(
        0.38 * ratio,
        0.5 * p * (c.thin + (c.bold - c.thin) * dark),
      );
      inner.push(cx + (r - half) * dx, cy + (r - half) * dy);
      outer.push(cx + (r + half) * dx, cy + (r + half) * dy);
      a += (1.5 * ratio) / Math.max(r, 4);
    }
    flat.fillStyle = inkCss;
    flat.beginPath();
    for (let i = 0; i < inner.length; i += 2) {
      const x = inner[i] ?? 0;
      const y = inner[i + 1] ?? 0;
      if (i === 0) flat.moveTo(x, y);
      else flat.lineTo(x, y);
    }
    for (let i = outer.length - 2; i >= 0; i -= 2) {
      flat.lineTo(outer[i] ?? 0, outer[i + 1] ?? 0);
    }
    flat.closePath();
    flat.fill();
    flat.strokeStyle = inkCss;
    flat.lineWidth = 1.1 * ratio;
    flat.beginPath();
    flat.arc(cx, cy, R - 4 * ratio, 0, TAU);
    flat.stroke();
  };

  const draw = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    if (failed) {
      drawFlat(c);
      return;
    }
    const g = gpu;
    if (!g || g.lost || !g.texture) return;
    const ratio = size.ratio;
    g.program.set({
      u_size: [canvas.width, canvas.height],
      u_dpr: ratio,
      u_radius: (Math.min(size.w, size.h) / 2 - 1) * ratio,
      u_pitch: clamp(c.pitch, 3, 10) * ratio,
      u_phase: phase % 1,
      u_contrast: clamp(c.contrast, 0.3, 3),
      u_thin: clamp(c.thin, 0, 0.4),
      u_bold: clamp(c.bold, 0.5, 1),
      u_reveal: reveal,
      u_invert: invert(),
      u_ink: ink,
      u_paper: paper,
    });
    g.program.texture("u_tone", g.texture, 0);
    g.gl.viewport(0, 0, canvas.width, canvas.height);
    g.gl.clearColor(0, 0, 0, 0);
    g.gl.clear(g.gl.COLOR_BUFFER_BIT);
    g.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (revealing) {
      reveal = Math.min(1, reveal + dt / 1.1);
      if (reveal >= 1) revealing = false;
      moving = true;
    }
    if (!dragging) {
      const b = base(c);
      const tau = 4 - 3.4 * clamp(c.friction, 0, 1);
      omega = b + (omega - b) * Math.exp(-dt / tau);
      if (Math.abs(omega - b) < 0.0005) omega = b;
      phase = (phase + omega * dt) % 1;
      if (Math.abs(omega) > 0.0001) moving = true;
    } else moving = true;
    tell();
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !cfg || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    // Without WebGL the ribbon is only redrawn while the hand turns it.
    if (!failed || dragging) draw();
    if (moving && !failed) frame = window.requestAnimationFrame(tick);
    else if (failed && dragging) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    ink = read(getComputedStyle(carriers.ink).color);
    paper = read(getComputedStyle(carriers.paper).color);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    if (gpu && !gpu.lost) {
      const out = resizeGL(gpu.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
      size.ratio = out.dpr;
    } else {
      size.ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      canvas.width = Math.max(1, Math.round(w * size.ratio));
      canvas.height = Math.max(1, Math.round(h * size.ratio));
    }
    draw();
  };

  const startGpu = (): boolean => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  const angleAt = (x: number, y: number) => {
    const rect = root.getBoundingClientRect();
    return Math.atan2(
      y - rect.top - rect.height / 2,
      x - rect.left - rect.width / 2,
    );
  };
  /** Near the spindle a hand's angle swings wildly: the lever softens it. */
  const leverAt = (x: number, y: number) => {
    const rect = root.getBoundingClientRect();
    const r = Math.hypot(
      x - rect.left - rect.width / 2,
      y - rect.top - rect.height / 2,
    );
    return clamp(r / (rect.width * 0.18), 0.15, 1);
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        if (!startGpu()) {
          failed = true;
          flat = canvas.getContext("2d");
          readColours();
          resize();
          root.setAttribute("data-live", "");
        } else {
          detach = onContextLoss(
            canvas,
            () => {
              if (gpu) gpu.lost = true;
              if (frame) window.cancelAnimationFrame(frame);
              frame = 0;
            },
            () => {
              gpu = null;
              if (!disposed && startGpu()) kick();
            },
          );
        }
        omega = base(next);
        if (next.reveal === "none" || !next.motionSafe) {
          reveal = 1;
          revealed = true;
        } else if (next.reveal === "mount") {
          revealed = true;
          revealing = true;
        }
      } else if (was.dpr !== next.dpr) resize();
      if (!next.motionSafe) {
        // Reduced motion: no resting spin and no cut, the picture at once.
        reveal = 1;
        revealing = false;
        revealed = true;
        if (!dragging) omega = 0;
      }
      tell();
      draw();
      kick();
    },
    setTone(source) {
      tone = source;
      try {
        toneData =
          source.getContext("2d")?.getImageData(0, 0, TONE, TONE).data ?? null;
      } catch {
        toneData = null;
      }
      const g = gpu;
      if (g && !g.lost) {
        g.texture = uploadTexture(g.gl, source, { linear: true }, g.texture);
      }
      draw();
      kick();
    },
    readColours() {
      readColours();
      draw();
    },
    resize,
    seen(inView) {
      if (!inView || !cfg) return;
      if (!revealed && cfg.reveal === "inView" && cfg.motionSafe) {
        revealed = true;
        revealing = true;
      }
      draw();
      kick();
    },
    wake() {
      draw();
      kick();
    },
    grab(x, y) {
      dragging = true;
      grabAngle = angleAt(x, y);
      lastAngle = grabAngle;
      samples.length = 0;
      samples.push({ t: performance.now(), p: phase });
      tell();
      kick();
    },
    turn(x, y) {
      if (!dragging) return;
      const a = angleAt(x, y);
      let d = a - lastAngle;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      lastAngle = a;
      phase = (((phase + (d / TAU) * leverAt(x, y)) % 1) + 1) % 1;
      const now = performance.now();
      samples.push({ t: now, p: d / TAU });
      while (samples.length > 2 && now - (samples[0]?.t ?? now) > 90)
        samples.shift();
      if (failed) draw();
      kick();
    },
    drop() {
      if (!dragging) return;
      dragging = false;
      const c = cfg;
      if (!c) return;
      if (c.motionSafe && !failed) {
        // The throw: the turn over the last ~90 ms, in turns per second.
        const first = samples[0];
        const lastS = samples[samples.length - 1];
        let sum = 0;
        for (let i = 1; i < samples.length; i += 1) sum += samples[i]?.p ?? 0;
        const span = first && lastS ? (lastS.t - first.t) / 1000 : 0;
        omega = span > 0.012 ? clamp(sum / span, -4, 4) : base(c);
      } else omega = 0;
      tell();
      draw();
      kick();
    },
    flick(tps) {
      const c = cfg;
      if (!c) return;
      if (!c.motionSafe || failed) {
        // A turn by a fixed step instead of a fling.
        phase = (((phase + Math.sign(tps) / 24) % 1) + 1) % 1;
        draw();
        return;
      }
      omega = clamp(omega + tps, -4, 4);
      tell();
      kick();
    },
    brake() {
      const c = cfg;
      if (!c) return;
      omega = base(c);
      tell();
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };
}

/** The uncut plate the server draws: an even hairline spiral, rounded. */
function uncutSpiral(): string {
  const parts: string[] = [];
  const turns = 19;
  const pitch = 94 / turns;
  for (let i = 0; i <= turns * 24; i += 1) {
    const a = (i / 24) * TAU;
    const r = pitch * (i / 24);
    const x = r2(100 + r * Math.cos(a));
    const y = r2(100 + r * Math.sin(a));
    parts.push(`${i ? "L" : "M"} ${x} ${y}`);
  }
  return parts.join(" ");
}
const UNCUT = uncutSpiral();

/**
 * A round plate engraved with one continuous spiral line whose width swells
 * where the picture is dark and thins to a hairline where it is light, like a
 * halftone cut on a turning plate. One WebGL2 pass finds each pixel's place
 * on the spiral and samples the picture at the pixel's own position, so as
 * the plate turns the line flows inward like a vortex while the picture holds
 * perfectly still within it.
 *
 * Drag round the plate and it turns 1:1 under the hand; let go and it keeps
 * the throw's spin, easing back to its resting turn over a time set by
 * `friction`. The first time it is seen the line swells from an even
 * hairline into the picture, a front running out from the spindle. Arrow keys
 * flick it either way, Enter flings it, Home brakes it. Under reduced motion
 * the plate holds still (a drag still turns it, without coasting) and the
 * picture is cut at once. Without WebGL2 the same line is drawn as a ribbon on
 * a 2D canvas.
 */
export function SpiralEngraving({
  pitch = 4,
  contrast = 1.2,
  spin = 20,
  subject = "moon",
  src,
  alt,
  ink = "var(--foreground)",
  paper = "var(--card)",
  thin = 0.08,
  bold = 0.9,
  friction = 0.5,
  direction = "inward",
  reveal = "inView",
  onSpinChange,
  label = "Spin the plate",
  paused = false,
  disabled = false,
  dpr = 2,
  className,
}: SpiralEngravingProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const inkRef = React.useRef<HTMLSpanElement | null>(null);
  const paperRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const [spoken, setSpoken] = React.useState("");

  const config: Config = {
    pitch,
    contrast,
    spin,
    thin,
    bold,
    friction,
    direction,
    reveal,
    paused,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  const report = React.useRef<(state: SpiralEngravingSpin) => void>(() => {});
  React.useEffect(() => {
    report.current = (state) => {
      setSpoken(
        state === "flung"
          ? "Flung."
          : state === "turning"
            ? "Turning."
            : "Still.",
      );
      onSpinChange?.(state);
    };
  });

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const inkNode = inkRef.current;
    const paperNode = paperRef.current;
    if (!root || !canvas || !inkNode || !paperNode) return;
    const e = createEngine(
      root,
      canvas,
      { ink: inkNode, paper: paperNode },
      visible,
      report,
    );
    engine.current = e;
    e.configure(latest.current);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        e.seen(visible.current);
      },
      { threshold: 0.2 },
    );
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      sizer.disconnect();
      watcher.disconnect();
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
    };
  }, []);

  // The tone map: the subject at once, the image when (if) it arrives.
  React.useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const tone = document.createElement("canvas");
    tone.width = TONE;
    tone.height = TONE;
    const ctx = tone.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    drawSubject(ctx, subject);
    e.setTone(tone);
    if (!src) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const s = Math.max(TONE / image.naturalWidth, TONE / image.naturalHeight);
      const w = image.naturalWidth * s;
      const h = image.naturalHeight * s;
      ctx.clearRect(0, 0, TONE, TONE);
      ctx.drawImage(image, (TONE - w) / 2, (TONE - h) / 2, w, h);
      try {
        ctx.getImageData(0, 0, 1, 1);
      } catch {
        // A picture from elsewhere without CORS cannot be read: the subject stays.
        drawSubject(ctx, subject);
      }
      engine.current?.setTone(tone);
    };
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [subject, src]);

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => engine.current?.grab(point.x, point.y),
    onMove: ({ point }) => engine.current?.turn(point.x, point.y),
    onEnd: () => engine.current?.drop(),
    onCancel: () => engine.current?.drop(),
    onTap: () => engine.current?.flick(direction === "outward" ? -0.8 : 0.8),
  });

  const sign = direction === "outward" ? -1 : 1;

  return (
    <div
      ref={rootRef}
      className={cn(
        "group/spiral-engraving relative isolate aspect-square w-full",
        className,
      )}
    >
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={`${uid}-alt ${uid}-hint`}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          if (disabled) return;
          const e = engine.current;
          if (!e) return;
          if (event.key === "ArrowRight" || event.key === "ArrowUp")
            e.flick(0.5 * sign);
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
            e.flick(-0.5 * sign);
          else if (event.key === "Enter" || event.key === " ") {
            if (!event.repeat) e.flick(1.5 * sign);
          } else if (event.key === "Home") e.brake();
          else return;
          event.preventDefault();
        }}
        {...drag}
        className={cn(
          "absolute inset-0 touch-none rounded-full select-none",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          className="absolute inset-0 size-full transition-opacity duration-500 group-data-live/spiral-engraving:opacity-0"
        >
          <circle cx="100" cy="100" r="99.5" style={{ fill: paper }} />
          <path
            d={UNCUT}
            fill="none"
            strokeWidth="0.5"
            style={{ stroke: ink }}
            opacity="0.55"
          />
          <circle
            cx="100"
            cy="100"
            r="96.2"
            fill="none"
            strokeWidth="0.9"
            style={{ stroke: ink }}
          />
          <circle
            cx="100"
            cy="100"
            r="98.8"
            fill="none"
            strokeWidth="0.5"
            opacity="0.55"
            style={{ stroke: ink }}
          />
          <circle cx="100" cy="100" r="2.4" style={{ fill: ink }} />
        </svg>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
      </div>
      <span
        ref={inkRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: ink }}
      />
      <span
        ref={paperRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: paper }}
      />
      <span id={`${uid}-alt`} className="sr-only">
        {alt ?? ALTS[subject] ?? ALTS.moon}
      </span>
      <span id={`${uid}-hint`} className="sr-only">
        Drag round the plate to spin it. Arrow keys flick it either way, Enter
        flings it, Home brakes it.
      </span>
      <span aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
