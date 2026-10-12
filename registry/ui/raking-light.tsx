"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  bindScreen,
  createFramebuffer,
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
  GLSL_NOISE,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type Framebuffer,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RakingLightSubject = "canvas" | "paper" | "tablet";

export type RakingLightReading = {
  /** Where the light comes from, degrees clockwise from the top of the box. */
  azimuth: number;
  /** How high the light stands above the surface, in degrees. */
  elevation: number;
  /** Whether a hand (pointer, finger or keyboard) is holding the lamp. */
  held: boolean;
};

export type RakingLightProps = {
  /** The object on the table, drawn in code: an oil sketch, a sheet of embossed paper or a clay tablet. @default "canvas" */
  subject?: RakingLightSubject;
  /** Your own photograph to relight instead (it must be readable across origins). Its height comes from `depthSrc`, or from its brightness. */
  src?: string;
  /** A depth map for `src`, white for high, black for low. */
  depthSrc?: string;
  /** What the image shows, for assistive technology. Each subject has its own description by default. */
  alt?: string;
  /** The words pressed around the paper's blind-stamp. @default "COLD PRESSED · MADE BY HAND · NO. 14 ·" */
  inscription?: string;
  /** The raking angle: how many degrees above the surface the light skims when it lies at the edge, 2 to 40. @default 12 */
  elevation?: number;
  /** How tall the surface's ridges stand, 0 (flat print) to 1 (deep relief). @default 0.6 */
  relief?: number;
  /** The light's colour, 0 (cool north daylight) to 1 (warm tungsten); the shadows fill with the other. @default 0.55 */
  warmth?: number;
  /** The lamp's size, 0 (a pin-point with crisp shadows) to 1 (a softbox with soft ones). @default 0.35 */
  softness?: number;
  /** How much the surface glints where it faces the light, 0 (matte) to 1. @default 0.4 */
  gloss?: number;
  /** Controlled: the direction the resting light comes from, degrees clockwise from the top. */
  azimuth?: number;
  /** The resting direction when uncontrolled. @default 290 */
  defaultAzimuth?: number;
  /** Fires when a click, a tap or the arrow keys set the light down in a new direction, in whole degrees. */
  onAzimuthChange?: (azimuth: number) => void;
  /** Fires as the hand moves the lamp, with the light it is asking for, in whole degrees. */
  onLightChange?: (light: RakingLightReading) => void;
  /** The light comes down from overhead to its raking angle the first time the object is seen. @default true */
  intro?: boolean;
  /** Show a small lamp where the light comes from while it is held. @default true */
  showLamp?: boolean;
  /** The pointer and the keyboard move the lamp. @default true */
  interactive?: boolean;
  /** Seeds the brushstrokes, the paper's fibres and the wedges in the clay. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The accessible name of the lamp control. @default "Lamp" */
  label?: string;
  /** Sizes and shapes the box. @default "h-56 w-full" */
  className?: string;
};

const DEG = Math.PI / 180;
/** The highest the hand can lift the lamp: nearly overhead, never flat on. */
const OVERHEAD = 80;
/** The lamp's track as a share of the box's half extents: the rim it rests on. */
const RIM = 0.9;
/** Fixed physics step: the springs integrate at 120 Hz whatever the display does. */
const STEP = 1 / 120;
const KEY_ORBIT = 15;
const KEY_PAGE = 45;
const KEY_LIFT = 0.1;
/** How far round the intro swings the light before it settles, degrees. */
const INTRO_SWING = 50;
/** Relief in CSS px at full `relief`, per subject, for a 208px-tall box. */
const RELIEF_PX = { canvas: 7, paper: 5.5, tablet: 8, photo: 6 } as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const wrap = (deg: number) => ((deg % 360) + 360) % 360;
/** The shortest signed turn from a to b, degrees. */
const turn = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/** A small seeded generator: the same object for the same seed. */
function lcg(seed: number) {
  let s =
    (Math.imul(Math.round(seed * 9973) | 0, 2654435761) ^ 0x2545f491) >>> 0 ||
    1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
type Rand = () => number;

/**
 * Each subject's pigments. They are objects, not text: every colour holds a
 * fixed lightness and chroma and takes only its hue from a token, so the
 * painting, the paper and the clay are the same in either theme.
 */
const PIGMENTS: Record<RakingLightSubject | "photo", readonly string[]> = {
  canvas: [
    "oklch(from var(--warn) 0.9 0.025 h)",
    "oklch(from var(--accent) 0.63 0.05 calc(h - 22))",
    "oklch(from var(--accent) 0.85 0.028 calc(h - 34))",
    "oklch(from var(--warn) 0.95 0.03 calc(h - 4))",
    "oklch(from var(--signal) 0.5 0.04 calc(h + 34))",
    "oklch(from var(--warn) 0.76 0.075 calc(h - 6))",
    "oklch(from var(--signal) 0.57 0.05 calc(h - 44))",
    "oklch(from var(--danger) 0.47 0.05 calc(h + 28))",
    "oklch(from var(--warn) 0.93 0.1 calc(h + 2))",
  ],
  paper: [
    "oklch(from var(--warn) 0.95 0.016 h)",
    "oklch(from var(--warn) 0.86 0.03 calc(h - 6))",
  ],
  tablet: [
    "oklch(from var(--danger) 0.6 0.06 calc(h + 34))",
    "oklch(from var(--danger) 0.43 0.06 calc(h + 26))",
    "oklch(from var(--warn) 0.76 0.06 calc(h - 18))",
  ],
  photo: [],
};
/** The lamp's two colours: north daylight and tungsten. */
const COOL = "oklch(from var(--accent) 0.97 0.035 h)";
const WARM = "oklch(from var(--warn) 0.93 0.09 calc(h - 10))";

const ALT: Record<RakingLightSubject, string> = {
  canvas:
    "Oil sketch of a low sun over hills and a ploughed field, painted in thick strokes",
  paper:
    "Sheet of cotton paper with a plate mark, a blind-embossed fern and a round blind-stamp",
  tablet: "Clay tablet with ruled rows of wedge-shaped impressions",
};

const SIDES = [
  "the top",
  "the upper right",
  "the right",
  "the lower right",
  "the bottom",
  "the lower left",
  "the left",
  "the upper left",
] as const;

/** Where the light comes from, in words a person would say. */
export function rakingSide(azimuth: number): string {
  return SIDES[Math.round(wrap(azimuth) / 45) % 8] ?? "the left";
}

type RGB = readonly [number, number, number];

const rgb = (c: RGB, k = 1) =>
  `rgb(${clamp(Math.round(c[0] * k), 0, 255)} ${clamp(Math.round(c[1] * k), 0, 255)} ${clamp(Math.round(c[2] * k), 0, 255)})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

type Ctx = CanvasRenderingContext2D;

type Stroke = {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  bend: number;
  color: RGB;
  /** How much paint the brush carries: the stroke's height. */
  load: number;
};

/**
 * One brushstroke: a body of paint the width of the brush, then bristle by
 * bristle on top of it — each bristle drags its own streak of colour into
 * the colour map and its own ridge into the height map (red channel, added),
 * the outer bristles pushing up the tallest ridges and every other one
 * leaving a shallow groove, the ends staggered so the stroke feathers out;
 * where the brush lifts, the paint it was pushing stays as a pile.
 */
function brush(a: Ctx, m: Ctx, s: Stroke, rand: Rand) {
  const cos = Math.cos(s.angle);
  const sin = Math.sin(s.angle);
  const n = clamp(Math.round(s.width / 2.6), 4, 10);
  const SEG = 8;
  const line = (t0: number, t1: number, off: number) => {
    const path = new Path2D();
    for (let k = 0; k <= SEG; k += 1) {
      const t = t0 + ((t1 - t0) * k) / SEG;
      const along = t * s.length;
      const sway = s.bend * Math.sin(Math.PI * t) * s.length;
      const spread = 0.9 + 0.12 * Math.sin(Math.PI * t);
      const across = sway + off * spread;
      const x = s.x + cos * along - sin * across;
      const y = s.y + sin * along + cos * across;
      if (k === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    return path;
  };
  // The body's height swells in from nothing and thins toward the lift: a
  // body that ended in a step would throw a hard line of shadow at the start
  // of every stroke.
  const body = line(0.05, 0.9, 0);
  a.strokeStyle = rgb(s.color);
  a.lineWidth = s.width * 0.86;
  a.stroke(body);
  const x1 = s.x + cos * s.length;
  const y1 = s.y + sin * s.length;
  const swell = m.createLinearGradient(s.x, s.y, x1, y1);
  const full = Math.round(s.load * 34);
  swell.addColorStop(0, "rgb(0 0 0)");
  swell.addColorStop(0.22, `rgb(${full} 0 0)`);
  swell.addColorStop(0.8, `rgb(${full} 0 0)`);
  swell.addColorStop(1, `rgb(${Math.round(full * 0.4)} 0 0)`);
  m.strokeStyle = swell;
  m.lineWidth = s.width * 0.84;
  m.stroke(body);
  for (let j = 0; j < n; j += 1) {
    const u = j / (n - 1) - 0.5;
    const off = (u + ((rand() - 0.5) * 0.5) / n) * s.width;
    const edge = Math.abs(u) * 2;
    const path = line(
      rand() * 0.06 + edge * 0.05,
      1 - rand() * 0.2 * (0.3 + edge),
      off,
    );
    const lw = (s.width / n) * (1.3 + rand() * 0.5);
    a.strokeStyle = rgb(s.color, 0.94 + rand() * 0.12);
    a.lineWidth = lw;
    a.stroke(path);
    const groove = j % 2 === 0 ? 1 : 0.8;
    const hv = s.load * (0.35 + 0.65 * edge * edge) * (0.75 + rand() * 0.3);
    const ridge = Math.round(hv * groove * 34);
    const rise = m.createLinearGradient(s.x, s.y, x1, y1);
    rise.addColorStop(0, "rgb(0 0 0)");
    rise.addColorStop(0.14, `rgb(${ridge} 0 0)`);
    rise.addColorStop(1, `rgb(${ridge} 0 0)`);
    m.strokeStyle = rise;
    m.lineWidth = lw * 0.8;
    m.stroke(path);
  }
  const ex = s.x + cos * s.length * 0.95;
  const ey = s.y + sin * s.length * 0.95;
  const r = s.width * 0.5;
  const pile = m.createRadialGradient(ex, ey, 0, ex, ey, r);
  pile.addColorStop(0, `rgb(${Math.round(s.load * 30)} 0 0)`);
  pile.addColorStop(1, "rgb(0 0 0)");
  m.fillStyle = pile;
  m.fillRect(ex - r, ey - r, r * 2, r * 2);
}

/**
 * An oil sketch: a low sun over a line of hills and a ploughed field, laid
 * in on a toned underpainting with a few hundred loaded strokes — the sky
 * in long horizontals, clouds in short thick curls, the hills along their
 * slopes, the furrows running to a vanishing point.
 */
function drawCanvas(
  a: Ctx,
  m: Ctx,
  w: number,
  h: number,
  pal: RGB[],
  rand: Rand,
) {
  const [
    gesso,
    skyHigh,
    skyLow,
    cloud,
    hill,
    fieldLight,
    fieldDark,
    earth,
    sun,
  ] = pal as [RGB, RGB, RGB, RGB, RGB, RGB, RGB, RGB, RGB];
  const bw = clamp(h * 0.068, 6, 30);
  const L = bw * 4.6;
  const horizon = h * 0.5;
  const p1 = rand() * 6.28;
  const p2 = rand() * 6.28;
  const ridge = (x: number) =>
    h *
    (0.47 -
      0.075 * (0.5 + 0.5 * Math.sin((x / w) * 5.3 + p1)) -
      0.03 * Math.sin((x / w) * 12.7 + p2));

  // The underpainting: thin, flat colour that shows between the strokes.
  const under = a.createLinearGradient(0, 0, 0, h);
  under.addColorStop(0, rgb(skyHigh));
  under.addColorStop(0.46, rgb(skyLow));
  under.addColorStop(0.52, rgb(hill));
  under.addColorStop(0.62, rgb(mix(fieldDark, fieldLight, 0.5)));
  under.addColorStop(1, rgb(earth));
  a.fillStyle = under;
  a.fillRect(0, 0, w, h);
  a.globalAlpha = 0.35;
  a.fillStyle = rgb(gesso);
  a.fillRect(0, 0, w, h);
  a.globalAlpha = 0.94;

  const sunX = w * 0.17 + rand() * w * 0.06;
  const sunY = h * 0.3;
  const glow = a.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.35);
  glow.addColorStop(0, rgb(mix(sun, skyLow, 0.2)));
  glow.addColorStop(1, rgb(skyLow, 1));
  a.globalAlpha = 0.5;
  a.fillStyle = glow;
  a.fillRect(0, 0, w, h * 0.55);
  a.globalAlpha = 0.94;

  // Sky: long, nearly level strokes, darker toward the top.
  for (let y = -bw * 0.3; y < horizon + bw; y += bw * 0.78) {
    for (
      let x = -L * 0.4 - rand() * L * 0.4;
      x < w;
      x += L * (0.55 + rand() * 0.2)
    ) {
      const near = Math.hypot(x + L * 0.4 - sunX, y - sunY) / (h * 0.5);
      const tone = mix(skyHigh, skyLow, clamp01(y / horizon) ** 0.8);
      brush(
        a,
        m,
        {
          x,
          y: y + (rand() - 0.5) * bw * 0.5,
          angle: (rand() - 0.5) * 0.14,
          length: L * (0.8 + rand() * 0.5),
          width: bw * (0.8 + rand() * 0.4),
          bend: (rand() - 0.5) * 0.08,
          color: mix(sun, tone, clamp01(near * 1.3)),
          load: 0.5 + rand() * 0.2,
        },
        rand,
      );
    }
  }
  // Clouds: two or three banks of short, heavily loaded curls.
  const banks = 2 + Math.floor(rand() * 2);
  for (let c = 0; c < banks; c += 1) {
    const cx = w * (0.38 + 0.55 * ((c + rand() * 0.6) / banks));
    const cy = h * (0.1 + rand() * 0.18);
    const count = 7 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i += 1) {
      const t = rand() * Math.PI * 2;
      brush(
        a,
        m,
        {
          x: cx + Math.cos(t) * w * 0.07 * rand() - L * 0.25,
          y: cy + Math.sin(t) * h * 0.05 * rand(),
          angle: (rand() - 0.5) * 0.5,
          length: L * (0.35 + rand() * 0.3),
          width: bw * (0.9 + rand() * 0.5),
          bend: (rand() - 0.5) * 0.3,
          color: mix(cloud, skyLow, rand() * 0.35),
          load: 0.85 + rand() * 0.3,
        },
        rand,
      );
    }
  }
  // The sun: a thick dab of a few short, crossing strokes, the highest paint.
  for (let i = 0; i < 6; i += 1) {
    const t = rand() * Math.PI;
    const rr = bw * 0.25 * rand();
    brush(
      a,
      m,
      {
        x: sunX + Math.cos(t * 2) * rr - Math.cos(t) * bw * 0.45,
        y: sunY + Math.sin(t * 2) * rr - Math.sin(t) * bw * 0.45,
        angle: t,
        length: bw * (0.8 + rand() * 0.3),
        width: bw * (0.8 + rand() * 0.2),
        bend: (rand() - 0.5) * 0.3,
        color: mix(sun, cloud, rand() * 0.35),
        load: 1.2,
      },
      rand,
    );
  }
  // Hills: strokes laid along the slope, bluer at the top edge.
  for (let row = 0; row < 4; row += 1) {
    for (let x = -L * 0.5 + rand() * L * 0.3; x < w; x += L * 0.42) {
      const y0 = ridge(x) + row * bw * 0.7 + (rand() - 0.5) * bw * 0.3;
      const slope = Math.atan2(ridge(x + L * 0.6) - ridge(x), L * 0.6);
      brush(
        a,
        m,
        {
          x,
          y: y0,
          angle: slope + (rand() - 0.5) * 0.12,
          length: L * (0.55 + rand() * 0.3),
          width: bw * (0.75 + rand() * 0.3),
          bend: (rand() - 0.5) * 0.1,
          color: mix(hill, fieldDark, row / 5 + rand() * 0.1),
          load: 0.6 + rand() * 0.2,
        },
        rand,
      );
    }
  }
  // The field: furrows running to a vanishing point, wider toward the eye,
  // in bands of ochre, green and earth.
  const vx = w * (0.55 + rand() * 0.1);
  const vy = horizon;
  for (let y = h * 0.6; y < h + bw * 2;) {
    const depth = clamp01((y - h * 0.6) / (h * 0.4));
    const wide = bw * (0.7 + 0.8 * depth);
    for (
      let x = -wide * 2 - rand() * wide * 2;
      x < w + wide;
      x += wide * (2.1 + rand() * 0.8)
    ) {
      const angle = Math.atan2(y - vy, x - vx);
      const furrow = Math.floor(Math.atan2(x - vx, y - vy) / 0.12);
      const band = ((furrow % 3) + 3) % 3;
      const tones = [fieldLight, fieldDark, earth] as const;
      const tone = mix(
        tones[band] ?? fieldLight,
        tones[(band + 1) % 3] ?? earth,
        rand() * 0.35,
      );
      brush(
        a,
        m,
        {
          x: x - Math.cos(angle) * L * 0.3,
          y: y - Math.sin(angle) * L * 0.3,
          angle,
          length: L * (0.55 + 0.6 * depth) * (0.8 + rand() * 0.4),
          width: wide,
          bend: (rand() - 0.5) * 0.06,
          color: mix(tone, gesso, rand() * 0.12),
          load: 0.7 + rand() * 0.25,
        },
        rand,
      );
    }
    y += wide * 0.62;
  }
  a.globalAlpha = 1;
}

/**
 * A fern frond as one raised shape: a curved stem and pairs of narrow
 * leaflets that shorten toward the tip and the base, drawn into whatever
 * channel the caller's fill style names.
 */
function fern(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  reach: number,
  pairs: number,
) {
  const mx = (x0 + x1) / 2 + (y1 - y0) * 0.12;
  const my = (y0 + y1) / 2 - (x1 - x0) * 0.12;
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * x0 + 2 * u * t * mx + t * t * x1,
      y: u * u * y0 + 2 * u * t * my + t * t * y1,
      dx: 2 * u * (mx - x0) + 2 * t * (x1 - mx),
      dy: 2 * u * (my - y0) + 2 * t * (y1 - my),
    };
  };
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(mx, my, x1, y1);
  c.lineWidth = Math.max(1.2, reach * 0.07);
  c.lineCap = "round";
  c.stroke();
  for (let i = 1; i <= pairs; i += 1) {
    const t = i / (pairs + 1);
    const p = at(t);
    const len = Math.hypot(p.dx, p.dy) || 1;
    const tx = p.dx / len;
    const ty = p.dy / len;
    const size = reach * (1 - t) ** 0.85 * Math.min(1, 0.4 + t * 3.2);
    const spread = 1.05 - 0.35 * t;
    for (const side of [-1, 1]) {
      const ang = Math.atan2(ty, tx) + side * spread;
      const qx = p.x + Math.cos(ang) * size;
      const qy = p.y + Math.sin(ang) * size;
      const nx = -Math.sin(ang) * size * 0.24;
      const ny = Math.cos(ang) * size * 0.24;
      const hx = p.x + Math.cos(ang) * size * 0.5;
      const hy = p.y + Math.sin(ang) * size * 0.5;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.quadraticCurveTo(hx + nx, hy + ny, qx, qy);
      c.quadraticCurveTo(hx - nx, hy - ny, p.x, p.y);
      c.fill();
    }
  }
}

/**
 * A sheet of cotton paper, nearly blank to the eye: an etching's plate mark
 * pressed into it (blue: down), a fern blind-embossed inside the plate and a
 * round blind-stamp with its inscription beside it (green: up), and loose
 * fibres in the sheet (red). Only a low light finds any of it.
 */
function drawPaper(
  a: Ctx,
  m: Ctx,
  w: number,
  h: number,
  pal: RGB[],
  rand: Rand,
  inscription: string,
) {
  const [paper, shade] = pal as [RGB, RGB];
  a.fillStyle = rgb(paper);
  a.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.2 + rand() * 0.5) * Math.max(w, h) * 0.4;
    const g = a.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgb(shade));
    g.addColorStop(1, rgb(paper));
    a.globalAlpha = 0.08 + rand() * 0.08;
    a.fillStyle = g;
    a.fillRect(x - r, y - r, r * 2, r * 2);
  }
  a.globalAlpha = 0.5;
  a.fillStyle = rgb(shade, 0.8);
  for (let i = 0; i < 18; i += 1) {
    a.beginPath();
    a.ellipse(
      rand() * w,
      rand() * h,
      0.4 + rand() * 0.9,
      0.3 + rand() * 0.5,
      rand() * 3,
      0,
      Math.PI * 2,
    );
    a.fill();
  }
  a.globalAlpha = 1;

  // Fibres.
  m.lineCap = "round";
  m.strokeStyle = "rgb(30 0 0)";
  m.lineWidth = Math.max(0.7, h / 360);
  const fibres = Math.round((w * h) / 520);
  for (let i = 0; i < fibres; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const ang = rand() * Math.PI;
    const len = 6 + rand() * 22;
    const bend = (rand() - 0.5) * len * 0.5;
    m.beginPath();
    m.moveTo(x, y);
    m.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend,
      y + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend,
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len,
    );
    m.stroke();
  }

  // The plate mark and the blind-stamp share the sheet by its own aspect.
  const sealR = Math.min(h * 0.34, w * 0.2);
  const sealX = w - Math.max(w * 0.05, h * 0.08) - sealR * 1.08;
  const sealY = h * 0.5;
  const left = Math.max(w * 0.05, 8);
  const right = sealX - sealR * 1.38;
  const top = h * 0.13;
  const bottom = h * 0.87;
  m.fillStyle = "rgb(0 0 255)";
  m.beginPath();
  m.rect(left, top, Math.max(8, right - left), bottom - top);
  m.fill();

  m.fillStyle = "rgb(0 255 0)";
  m.strokeStyle = "rgb(0 255 0)";
  const pw = right - left;
  const ph = bottom - top;
  const span = Math.min(pw, ph);
  fern(
    m,
    left + pw * 0.1,
    bottom - ph * 0.14,
    right - pw * 0.08,
    top + ph * (pw > ph * 1.6 ? 0.3 : 0.14),
    span * 0.36,
    Math.round(clamp(Math.hypot(pw, ph) / (span * 0.11), 9, 22)),
  );

  m.lineWidth = sealR * 0.06;
  m.beginPath();
  m.arc(sealX, sealY, sealR * 0.93, 0, Math.PI * 2);
  m.stroke();
  m.lineWidth = sealR * 0.035;
  m.beginPath();
  m.arc(sealX, sealY, sealR * 0.6, 0, Math.PI * 2);
  m.stroke();
  const words = Array.from(inscription.toUpperCase());
  const ringR = sealR * 0.765;
  const size = Math.min(
    sealR * 0.2,
    (Math.PI * 2 * ringR) / Math.max(1, words.length * 0.74),
  );
  m.font = `600 ${Math.max(4, size).toFixed(1)}px serif`;
  m.textAlign = "center";
  m.textBaseline = "middle";
  words.forEach((ch, i) => {
    const t = -Math.PI / 2 + (i / words.length) * Math.PI * 2;
    m.save();
    m.translate(sealX + Math.cos(t) * ringR, sealY + Math.sin(t) * ringR);
    m.rotate(t + Math.PI / 2);
    m.fillText(ch, 0, 0);
    m.restore();
  });
  fern(
    m,
    sealX - sealR * 0.28,
    sealY + sealR * 0.36,
    sealX + sealR * 0.22,
    sealY - sealR * 0.38,
    sealR * 0.2,
    6,
  );
}

/**
 * A clay tablet seen close: scored rulings and, between them, signs pressed
 * with a square stylus — every wedge a deep triangular head that shallows to
 * its point and trails a thin tail — plus a hairline crack (blue: down). The
 * clay's mottle and scorch go into the colour.
 */
function drawTablet(
  a: Ctx,
  m: Ctx,
  w: number,
  h: number,
  pal: RGB[],
  rand: Rand,
) {
  const [clay, dark, light] = pal as [RGB, RGB, RGB];
  a.fillStyle = rgb(clay);
  a.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.15 + rand() * 0.45) * Math.max(w, h) * 0.35;
    const g = a.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() < 0.55 ? dark : light;
    g.addColorStop(0, rgb(tone));
    g.addColorStop(1, rgb(clay));
    a.globalAlpha = 0.1 + rand() * 0.14;
    a.fillStyle = g;
    a.fillRect(x - r, y - r, r * 2, r * 2);
  }
  a.globalAlpha = 1;

  const rowH = clamp(h / 4.4, 20, 70);
  const margin = rowH * 0.4;
  const rows = Math.max(1, Math.floor((h - margin * 2) / rowH));
  const y0 = (h - rows * rowH) / 2;
  m.lineCap = "round";
  m.strokeStyle = "rgb(0 0 190)";
  m.lineWidth = Math.max(1.1, rowH * 0.035);
  for (let r = 0; r <= rows; r += 1) {
    const y = y0 + r * rowH;
    m.beginPath();
    for (let x = margin * 0.5; x <= w - margin * 0.5; x += 12) {
      const yy =
        y + Math.sin(x * 0.013 + r) * rowH * 0.03 + (rand() - 0.5) * 0.6;
      if (x === margin * 0.5) m.moveTo(x, yy);
      else m.lineTo(x, yy);
    }
    m.stroke();
  }

  const wedge = (
    x: number,
    y: number,
    s: number,
    angle: number,
    depth: number,
    tail = true,
  ) => {
    m.save();
    m.translate(x, y);
    m.rotate(angle);
    const g = m.createLinearGradient(0, 0, s * 0.85, 0);
    g.addColorStop(0, `rgba(0, 0, 255, ${depth.toFixed(3)})`);
    g.addColorStop(1, `rgba(0, 0, 255, ${(depth * 0.3).toFixed(3)})`);
    m.fillStyle = g;
    m.beginPath();
    m.moveTo(0, -s * 0.36);
    m.lineTo(s * 0.88, 0);
    m.lineTo(0, s * 0.36);
    m.closePath();
    m.fill();
    if (tail) {
      m.strokeStyle = `rgba(0, 0, 255, ${(depth * 0.6).toFixed(3)})`;
      m.lineWidth = Math.max(1, s * 0.11);
      m.beginPath();
      m.moveTo(s * 0.55, 0);
      m.lineTo(s * 1.75, 0);
      m.stroke();
    }
    m.restore();
  };

  const s = rowH * 0.42;
  for (let r = 0; r < rows; r += 1) {
    const cy = y0 + r * rowH + rowH / 2;
    let x = margin + rand() * s;
    while (x < w - margin - s * 1.6) {
      const kind = Math.floor(rand() * 8);
      const d = 0.75 + rand() * 0.25;
      let width = s * 1.9;
      if (kind === 0) wedge(x, cy, s, 0, d);
      else if (kind === 1) {
        wedge(x, cy - s * 0.42, s * 0.9, 0, d);
        wedge(x, cy + s * 0.42, s * 0.9, 0, d);
      } else if (kind === 2) {
        wedge(x + s * 0.3, cy - s * 0.9, s, Math.PI / 2, d);
        width = s * 0.9;
      } else if (kind === 3) {
        for (let i = 0; i < 3; i += 1)
          wedge(
            x + s * 0.3 + i * s * 0.55,
            cy - s * 0.9,
            s * 0.9,
            Math.PI / 2,
            d,
          );
        width = s * 1.9;
      } else if (kind === 4) {
        wedge(x, cy - s * 0.2, s, 0, d);
        wedge(x + s * 1.2, cy - s * 0.95, s * 0.85, Math.PI / 2, d);
        width = s * 1.95;
      } else if (kind === 5) {
        wedge(x, cy - s * 0.7, s, Math.PI / 4, d);
        width = s * 1.6;
      } else if (kind === 6) {
        wedge(x + s * 0.8, cy, s * 0.9, Math.PI * 0.82, d, false);
        width = s * 1.1;
      } else {
        wedge(x + s * 0.8, cy - s * 0.32, s * 0.8, Math.PI * 0.82, d, false);
        wedge(x + s * 0.8, cy + s * 0.32, s * 0.8, Math.PI * 0.82, d, false);
        width = s * 1.1;
      }
      x += width + s * (0.35 + rand() * 0.5);
    }
  }

  // A hairline crack from one edge, with one branch.
  m.strokeStyle = "rgb(0 0 220)";
  m.lineWidth = Math.max(1, h / 260);
  let cx = w * (0.62 + rand() * 0.3);
  let cy = 0;
  m.beginPath();
  m.moveTo(cx, cy);
  const branchAt = 3 + Math.floor(rand() * 3);
  let bx = cx;
  let by = cy;
  for (let i = 0; i < 9; i += 1) {
    cx += (rand() - 0.55) * h * 0.06;
    cy += h * (0.03 + rand() * 0.03);
    m.lineTo(cx, cy);
    if (i === branchAt) {
      bx = cx;
      by = cy;
    }
  }
  m.stroke();
  m.beginPath();
  m.moveTo(bx, by);
  for (let i = 0; i < 4; i += 1) {
    bx += h * (0.03 + rand() * 0.03);
    by += (rand() - 0.3) * h * 0.04;
    m.lineTo(bx, by);
  }
  m.stroke();
}

/** Draws an image to fill the box, cropped to its own aspect. */
function cover(c: Ctx, img: HTMLImageElement, w: number, h: number) {
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const k = Math.max(w / iw, h / ih);
  c.drawImage(img, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
}

/**
 * The bake: the drawn maps in, one surface out — height (r), cavity (g) and
 * gloss (b) — with each subject's fine grain (canvas weave, paper tooth and
 * laid lines, clay grit) added here, where noise is cheap, and the masks
 * softened so a raised edge has a shoulder rather than a cliff.
 */
const BAKE = /* glsl */ `
in vec2 v_uv;
out vec4 o_surface;
uniform sampler2D u_mask;
uniform vec2 u_size;
uniform int u_mode;
uniform float u_seed;
${GLSL_NOISE}
${GLSL_LUMA}

vec4 tap(vec2 uv) { return texture(u_mask, uv); }

// A soft disc of taps r px across: the centre, a ring of six at half the
// radius and a ring of six at the radius, turned half a step.
vec4 soft(vec2 uv, float r) {
  vec2 px = r / u_size;
  vec4 sum = tap(uv) * 0.16;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472;
    sum += tap(uv + vec2(cos(a), sin(a)) * px * 0.5) * 0.08;
    sum += tap(uv + vec2(cos(a + 0.5236), sin(a + 0.5236)) * px) * 0.06;
  }
  return sum;
}

void main() {
  vec2 p = v_uv * u_size;
  float h = 0.5;
  float cav = 0.0;
  float gloss = 0.1;
  if (u_mode == 0) {
    // Oil on canvas: paint height is the bristle layers, eased so a thick
    // pile flattens out; the weave shows where the paint is thin.
    float paint = soft(v_uv, 1.0).r * 255.0 / 70.0;
    float wide = soft(v_uv, 7.0).r * 255.0 / 70.0;
    float hp = 1.0 - exp(-paint * 0.6);
    float hw = 1.0 - exp(-wide * 0.6);
    float tw = max(2.6, u_size.y / 115.0);
    vec2 q = p / tw;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float warp = sqrt(max(0.0, 1.0 - 4.0 * f.x * f.x));
    float weft = sqrt(max(0.0, 1.0 - 4.0 * f.y * f.y));
    float weave = mod(cell.x + cell.y, 2.0) < 0.5
      ? warp * (0.7 + 0.3 * cos(f.y * 3.1416))
      : weft * (0.7 + 0.3 * cos(f.x * 3.1416));
    weave *= 0.8 + 0.4 * kx_noise(cell * 0.7 + u_seed);
    float bare = 1.0 - smoothstep(0.05, 0.6, hp);
    h = 0.06 + hp * 0.84 + weave * (0.014 + 0.09 * bare);
    cav = clamp((hw - hp) * 2.2, 0.0, 1.0);
    gloss = 0.08 + 0.85 * smoothstep(0.05, 0.35, hp);
  } else if (u_mode == 1) {
    // Cotton paper: streaky fibre and tooth, laid and chain lines from the
    // mould, all pressed flatter inside the plate mark; the emboss and the
    // stamp stand up, the plate's floor sits down behind a soft bevel.
    float fib = soft(v_uv, 0.7).r * 255.0 / 30.0;
    float hf = 1.0 - exp(-fib * 0.7);
    vec4 m1 = soft(v_uv, 1.3);
    vec4 m3 = soft(v_uv, 3.4);
    float plate = m1.b;
    float a = u_seed * 2.4;
    vec2 rp = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
    float streak = kx_fbm(rp * vec2(0.035, 0.4) + u_seed) - 0.5;
    float tooth = kx_noise(p * 0.55 + u_seed * 3.0) - 0.5;
    float press = mix(1.0, 0.4, plate);
    float laid = 0.5 + 0.5 * sin(p.y * 6.2832 / max(2.4, u_size.y / 85.0));
    float chainW = max(40.0, u_size.x / 9.0);
    float cx = abs(fract(p.x / chainW + 0.31) - 0.5) * chainW;
    float chain = exp(-cx * cx / 3.0);
    float emb = m1.g * 0.42 + m3.g * 0.2;
    h = 0.4
      + (streak * 0.08 + tooth * 0.025 + hf * 0.05 + laid * 0.014 + chain * 0.022) * press
      - plate * 0.15 + max(m3.b - m1.b, 0.0) * 0.04 + emb;
    cav = clamp(0.4 - streak * 2.0 - tooth, 0.0, 1.0) * 0.3 * press;
    gloss = 0.05 + 0.12 * plate + 0.18 * clamp(m1.g * 2.0, 0.0, 1.0);
  } else if (u_mode == 2) {
    // Clay: a low dome falling away to rounded edges, grit and pits, the
    // impressions pressed down with the displaced clay heaped round them.
    vec4 m1 = soft(v_uv, 0.9);
    vec4 m4 = soft(v_uv, 3.8);
    float imp = m1.b;
    float lip = max(m4.b - m1.b, 0.0);
    float grit = (kx_fbm(p / 9.0 + u_seed) - 0.5) * 0.09
      + (kx_noise(p / 1.7 - u_seed) - 0.5) * 0.03;
    vec2 pc = floor(p / 11.0);
    vec2 pf = fract(p / 11.0) - 0.5;
    vec2 po = vec2(kx_hash(pc + 3.1), kx_hash(pc + 7.7)) - 0.5;
    vec2 pd = pf - po * 0.6;
    float pit = kx_hash(pc + u_seed) > 0.93 ? exp(-dot(pd, pd) * 140.0) : 0.0;
    float edge = min(min(p.x, u_size.x - p.x), min(p.y, u_size.y - p.y));
    float bevel = smoothstep(0.0, u_size.y * 0.1, edge);
    vec2 c = (v_uv - 0.5) * vec2(1.0, 1.6);
    float dome = 0.07 * (1.0 - dot(c, c) * 2.0);
    h = (0.62 + dome + grit - imp * 0.42 + lip * 0.14 - pit * 0.08) * mix(0.5, 1.0, bevel);
    cav = clamp(m4.b * 1.1 + pit, 0.0, 1.0);
    gloss = 0.08 + 0.3 * smoothstep(0.64, 0.72, h);
  } else {
    // A photograph: its depth map, or its brightness standing in for one.
    vec4 m1 = soft(v_uv, 1.0);
    vec4 m6 = soft(v_uv, 6.0);
    h = u_mode == 3 ? kx_luma(m1.rgb) : m1.r;
    float hw = u_mode == 3 ? kx_luma(m6.rgb) : m6.r;
    cav = clamp((hw - h) * 2.0, 0.0, 1.0);
    gloss = 0.25;
  }
  o_surface = vec4(clamp(h, 0.0, 1.0), cav, gloss, 1.0);
}
`;

/**
 * The light: a normal from the height's slope, the shadow marched through the
 * height field toward the lamp (its length really is height over the tangent
 * of the elevation, its penumbra the lamp's angular size), a filmic response
 * that holds the flat surface at a mid tone whatever the angle — the way a
 * photographer opens up for a raking light — a key and a complementary fill,
 * cavity, a glint where the surface is glossy, and a fall-off across the box
 * away from the lamp's side.
 */
const LIGHT = /* glsl */ `
in vec2 v_uv;
out vec4 o_color;
uniform sampler2D u_surface;
uniform sampler2D u_albedo;
uniform vec2 u_res;
uniform vec2 u_texel;
uniform vec3 u_L;
uniform float u_relief;
uniform float u_soft;
uniform float u_gloss;
uniform float u_k;
uniform float u_fall;
uniform float u_dirt;
uniform vec3 u_key;
uniform vec3 u_fill;
${GLSL_SRGB}

// The surface was rendered into a framebuffer, whose rows run bottom-up.
vec4 S(vec2 uv) { return texture(u_surface, vec2(uv.x, 1.0 - uv.y)); }
float H(vec2 uv) { return S(uv).r; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = v_uv;
  vec4 s = S(uv);
  float h = s.r;
  vec2 tx = u_texel;
  float dx = H(uv + vec2(tx.x, 0.0)) - H(uv - vec2(tx.x, 0.0));
  float dy = H(uv + vec2(0.0, tx.y)) - H(uv - vec2(0.0, tx.y));
  vec2 span = u_res * tx;
  vec2 g = vec2(dx / (2.0 * span.x), dy / (2.0 * span.y)) * u_relief;
  vec3 N = normalize(vec3(-g, 1.0));
  vec3 L = u_L;
  float ndl = dot(N, L);

  vec2 p = uv * u_res;
  float flatLen = length(L.xy);
  vec2 d = L.xy / max(flatLen, 1e-4);
  float tanE = L.z / max(flatLen, 1e-3);
  float z0 = h * u_relief;
  float reach = min(u_relief * (1.0 - h) / max(tanE, 1e-3), 0.6 * length(u_res));
  float t = 0.5 + hash(gl_FragCoord.xy) * 0.7;
  float shade = 1.0;
  for (int i = 0; i < 34; i++) {
    if (t > reach) break;
    vec2 q = (p + d * t) / u_res;
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) break;
    float clear = z0 + t * tanE - H(q) * u_relief;
    shade = min(shade, clamp(0.5 + clear / (t * u_soft + 0.04), 0.0, 1.0));
    t = t * 1.17 + 0.45;
  }
  shade = shade * shade * (3.0 - 2.0 * shade);

  vec2 n = (uv - 0.5) * 2.0;
  float side = clamp(dot(n, d) * 0.7, -1.0, 1.0);
  float fall = mix(1.0, mix(0.74, 1.1, 0.5 + 0.5 * side), u_fall);

  vec3 albedo = kx_srgbToLinear(texture(u_albedo, uv).rgb);
  float cav = s.g;
  albedo *= 1.0 - cav * u_dirt;
  float lit = (1.0 - exp(-max(ndl, 0.0) * u_k)) * 1.32;
  vec3 color = albedo * (u_key * lit * shade * fall + u_fill * (0.2 + 0.08 * N.z) * (1.0 - cav * 0.5));
  vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));
  float glossy = s.b * u_gloss;
  float spec = pow(max(dot(N, Hv), 0.0), mix(16.0, 90.0, glossy)) * glossy * shade * step(0.0, ndl);
  // Glints belong to the raking angles, where they catch the ridge tops; a
  // lamp near overhead would otherwise glare off every flat at once.
  color += u_key * spec * 0.55 * smoothstep(0.9, 0.45, L.z);
  float vig = length(n * vec2(1.0, 0.85));
  color *= 1.0 - 0.14 * smoothstep(0.7, 1.45, vig);
  vec3 outc = kx_linearToSrgb(clamp(color, 0.0, 1.0));
  outc += (hash(gl_FragCoord.yx + 3.7) - 0.5) / 255.0;
  o_color = vec4(outc, 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  bake: Program;
  light: Program;
  bakeTri: FullscreenTriangle;
  lightTri: FullscreenTriangle;
  mask: WebGLTexture | null;
  albedo: WebGLTexture | null;
  surface: Framebuffer | null;
  lost: boolean;
};

type Lamp = {
  /** The light now: unwrapped direction (deg) and lift (0 at the rim, 1 overhead), with velocities. */
  az: number;
  azV: number;
  lift: number;
  liftV: number;
  carry: number;
  last: number;
  /** Who holds the lamp, and where they put it. */
  held: "pointer" | "touch" | "keyboard" | null;
  handAz: number;
  handLift: number;
  keyLift: number;
  /** The direction the light rests at. */
  rest: number;
};

type Api = {
  bake: () => void;
  draw: () => void;
  kick: () => void;
  tick: (now: number) => void;
  resize: () => void;
  readPalette: () => void;
  seen: () => void;
};

type Images = {
  src: string;
  photo: HTMLImageElement;
  depth: HTMLImageElement | null;
} | null;

/**
 * An object on a light table, relit per pixel by a lamp that lies low at the
 * side of the box so the light skims the surface and every ridge throws a
 * long shadow across the flat beyond it. The object is drawn in code as a
 * colour map and a height map — an oil sketch in loaded brushstrokes, a sheet
 * of cotton paper with a plate mark, an embossed fern and a blind-stamp that
 * all but vanish in flat light, or a clay tablet of wedge impressions — or it
 * is your own photograph with its depth map.
 *
 * The lamp is where the hand is: the pointer's direction from the centre is
 * the light's direction, and its distance from the rim is its height, so
 * moving in toward the middle raises the light and the shadows shorten and
 * flatten away. The direction follows on springs.glide and the height on
 * springs.drift; a click sets the lamp down in that direction (the marker
 * lands on springs.recoil), and leaving lets it sink back to its raking angle.
 * The first time the object is seen the light comes down from overhead to
 * that angle and the relief rises out of a flat picture. The keyboard path is
 * one focus stop: Left and Right orbit the lamp, Up and Down raise and lower
 * it. Under reduced motion the lamp goes straight where it is put.
 */
export function RakingLight({
  subject = "canvas",
  src,
  depthSrc,
  alt,
  inscription = "COLD PRESSED · MADE BY HAND · NO. 14 ·",
  elevation = 12,
  relief = 0.6,
  warmth = 0.55,
  softness = 0.35,
  gloss = 0.4,
  azimuth,
  defaultAzimuth = 290,
  onAzimuthChange,
  onLightChange,
  intro = true,
  showLamp = true,
  interactive = true,
  seed = 1,
  dpr = 2,
  label = "Lamp",
  className,
}: RakingLightProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [ownAz, setOwnAz] = React.useState(() => wrap(defaultAzimuth));
  const restAz = wrap(azimuth ?? ownAz);
  const [said, setSaid] = React.useState("");

  const k = {
    subject,
    elevation: clamp(elevation, 2, 40),
    relief: clamp01(relief),
    warmth: clamp01(warmth),
    softness: clamp01(softness),
    gloss: clamp01(gloss),
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    inscription,
  };
  const pigments = PIGMENTS[subject] ?? PIGMENTS.canvas;
  const paints = [...pigments, COOL, WARM];
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const sheets = React.useRef<{
    a: HTMLCanvasElement;
    m: HTMLCanvasElement;
  } | null>(null);
  const palette = React.useRef<RGB[]>([]);
  const baked = React.useRef("");
  const bakeTimer = React.useRef(0);
  const images = React.useRef<Images>(null);
  const [photoKey, setPhotoKey] = React.useState("");
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const introPending = React.useRef(intro);
  const shownLive = React.useRef(false);
  const reported = React.useRef("");
  const sayTimer = React.useRef(0);
  const downAt = React.useRef<{ x: number; y: number; id: number } | null>(
    null,
  );
  const lamp = React.useRef<Lamp>({
    az: restAz,
    azV: 0,
    lift: 0,
    liftV: 0,
    carry: 0,
    last: 0,
    held: null,
    handAz: restAz,
    handLift: 0,
    keyLift: 0,
    rest: restAz,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onAzimuthChange, onLightChange });

  // The marker: where the light comes from, projected onto the table.
  const markX = useMotionValue(0);
  const markY = useMotionValue(0);
  const markScale = useMotionValue(1);
  const markGlow = useMotionValue(0.6);

  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const elevationAt = (lift: number) =>
    k.elevation + (OVERHEAD - k.elevation) * Math.pow(clamp01(lift), 1.5);

  const readPalette = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    const out: RGB[] = [];
    for (const span of Array.from(carriers.children)) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out.push([d[0] ?? 0, d[1] ?? 0, d[2] ?? 0]);
    }
    const before = palette.current.map((c) => c.join(",")).join(";");
    palette.current = out;
    if (out.map((c) => c.join(",")).join(";") !== before) baked.current = "";
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    resizeGL(g.gl, canvas, { dprCap: k.dpr });
  };

  /** Draws the object's maps for the box as it is now and bakes the surface; skipped when nothing it depends on changed. */
  const bake = () => {
    const g = gpu.current;
    const root = rootRef.current;
    if (!g || g.lost || !root || !visible.current) return;
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    if (cw < 2 || ch < 2) return;
    const scale = clamp(Math.min(window.devicePixelRatio || 1, k.dpr), 1, 1.5);
    const w = Math.min(2048, Math.round(cw * scale));
    const h = Math.min(2048, Math.round(ch * scale));
    const pics = images.current;
    const mode = pics
      ? pics.depth
        ? 4
        : 3
      : k.subject === "paper"
        ? 1
        : k.subject === "tablet"
          ? 2
          : 0;
    const pal = palette.current;
    const key = [
      mode,
      k.subject,
      k.seed,
      k.inscription,
      w,
      h,
      pics?.src ?? "",
      pal.map((c) => c.join(",")).join(";"),
    ].join("|");
    if (key === baked.current) return;
    if (!sheets.current) {
      sheets.current = {
        a: document.createElement("canvas"),
        m: document.createElement("canvas"),
      };
    }
    const { a: sheetA, m: sheetM } = sheets.current;
    sheetA.width = w;
    sheetA.height = h;
    sheetM.width = w;
    sheetM.height = h;
    const a = sheetA.getContext("2d");
    const m = sheetM.getContext("2d");
    if (!a || !m) return;
    a.lineCap = "round";
    a.lineJoin = "round";
    m.lineCap = "round";
    m.lineJoin = "round";
    m.globalCompositeOperation = "source-over";
    m.fillStyle = "rgb(0 0 0)";
    m.fillRect(0, 0, w, h);
    // Height marks add up, channel by channel: thick paint over thick paint
    // stands taller, and the three masks never bleed into each other.
    m.globalCompositeOperation = "lighter";
    const rand = lcg(k.seed);
    const fallback: RGB = [200, 196, 188];
    const colours = PIGMENTS[k.subject].map((_, i) => pal[i] ?? fallback);
    if (pics) {
      cover(a, pics.photo, w, h);
      m.globalCompositeOperation = "source-over";
      cover(m, pics.depth ?? pics.photo, w, h);
    } else if (k.subject === "paper") {
      drawPaper(a, m, w, h, colours, rand, k.inscription);
    } else if (k.subject === "tablet") {
      drawTablet(a, m, w, h, colours, rand);
    } else {
      drawCanvas(a, m, w, h, colours, rand);
    }
    const gl = g.gl;
    try {
      g.albedo = uploadTexture(gl, sheetA, { linear: true }, g.albedo);
      g.mask = uploadTexture(gl, sheetM, { linear: true }, g.mask);
    } catch {
      // A photograph from another origin without permission taints the
      // sheet; the table falls back to the drawn subject.
      if (pics) {
        images.current = null;
        baked.current = "";
        bake();
      }
      return;
    }
    if (!g.surface || g.surface.width !== w || g.surface.height !== h) {
      g.surface?.dispose();
      g.surface = createFramebuffer(gl, w, h, true);
    }
    g.surface.bind();
    g.bake.use();
    const u = g.bake.uniforms;
    gl.uniform2f(u.u_size ?? null, w, h);
    gl.uniform1i(u.u_mode ?? null, mode);
    gl.uniform1f(u.u_seed ?? null, (lcg(k.seed * 3 + 1)() * 97) % 31);
    g.bake.texture("u_mask", g.mask, 0);
    g.bakeTri.draw();
    bindScreen(gl);
    baked.current = key;
  };

  /** Writes the marker's place from the light as it is now. */
  const placeMark = () => {
    const root = rootRef.current;
    if (!root) return;
    const l = lamp.current;
    const w = root.clientWidth;
    const h = root.clientHeight;
    const r = RIM * (1 - clamp01(l.lift));
    const a = l.az * DEG;
    markX.set(r2(w / 2 + Math.sin(a) * r * (w / 2)));
    markY.set(r2(h / 2 - Math.cos(a) * r * (h / 2)));
  };

  /** One frame of the light as it stands; nothing is allocated. */
  const draw = () => {
    const g = gpu.current;
    const root = rootRef.current;
    if (!g || g.lost || !g.surface || !g.albedo || !root || !visible.current)
      return;
    const gl = g.gl;
    const l = lamp.current;
    const el = elevationAt(l.lift) * DEG;
    const az = l.az * DEG;
    const cosE = Math.cos(el);
    const pal = palette.current;
    const n = PIGMENTS[k.subject].length;
    const cool = pal[n] ?? [235, 240, 255];
    const warm = pal[n + 1] ?? [255, 228, 190];
    const lin = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const t = k.warmth;
    const kr = lin(cool[0] + (warm[0] - cool[0]) * t);
    const kg = lin(cool[1] + (warm[1] - cool[1]) * t);
    const kb = lin(cool[2] + (warm[2] - cool[2]) * t);
    // The fill is the sky the key is not: the other end of the warmth,
    // greyed so it tints the shadows rather than painting them.
    const fr = lin(warm[0] + (cool[0] - warm[0]) * t) * 0.6 + 0.3;
    const fg = lin(warm[1] + (cool[1] - warm[1]) * t) * 0.6 + 0.3;
    const fb = lin(warm[2] + (cool[2] - warm[2]) * t) * 0.6 + 0.3;
    const pics = images.current;
    const kind = pics ? "photo" : k.subject;
    const relief =
      k.relief *
      RELIEF_PX[kind] *
      Math.sqrt(Math.max(0.4, root.clientHeight / 208));
    const lift = clamp01(l.lift);
    const sz = g.surface;
    bindScreen(gl);
    const p = g.light;
    p.use();
    const u = p.uniforms;
    gl.uniform2f(u.u_res ?? null, root.clientWidth, root.clientHeight);
    gl.uniform2f(u.u_texel ?? null, 1 / sz.width, 1 / sz.height);
    gl.uniform3f(
      u.u_L ?? null,
      Math.sin(az) * cosE,
      -Math.cos(az) * cosE,
      Math.sin(el),
    );
    gl.uniform1f(u.u_relief ?? null, relief);
    gl.uniform1f(u.u_soft ?? null, 0.02 + k.softness * 0.3);
    gl.uniform1f(u.u_gloss ?? null, k.gloss * 1.6);
    gl.uniform1f(u.u_k ?? null, 1.05 / Math.max(Math.sin(el), 0.05));
    gl.uniform1f(u.u_fall ?? null, 1 - lift * lift * (3 - 2 * lift));
    gl.uniform1f(
      u.u_dirt ?? null,
      kind === "tablet" ? 0.3 : kind === "canvas" ? 0.2 : 0.12,
    );
    gl.uniform3f(u.u_key ?? null, kr, kg, kb);
    gl.uniform3f(u.u_fill ?? null, fr * 0.9, fg * 0.9, fb * 0.9);
    p.texture("u_surface", sz.texture, 0);
    p.texture("u_albedo", g.albedo, 1);
    g.lightTri.draw();
    placeMark();
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!shownLive.current) {
      shownLive.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Where the light wants to be: the hand's lamp, or resting at the rim. */
  const targets = () => {
    const l = lamp.current;
    if (l.held) return { az: l.az + turn(l.az, l.handAz), lift: l.handLift };
    return { az: l.az + turn(l.az, l.rest), lift: 0 };
  };

  /** Steps the light's two springs by dt; says whether it still moves. */
  const advance = (dt: number): boolean => {
    const l = lamp.current;
    const goal = targets();
    if (!k.motionSafe) {
      l.az = wrap(goal.az);
      l.lift = goal.lift;
      l.azV = 0;
      l.liftV = 0;
      return false;
    }
    // Direction on glide: a lamp on an arm swings round without overshoot.
    // Height on drift: it rises and settles slowly, the way a lamp is raised.
    const G = springs.glide;
    const D = springs.drift;
    l.carry += dt;
    let steps = 0;
    while (l.carry >= STEP && steps < 10) {
      l.carry -= STEP;
      steps += 1;
      const aa = (-G.stiffness * (l.az - goal.az) - G.damping * l.azV) / G.mass;
      l.azV += aa * STEP;
      l.az += l.azV * STEP;
      const al =
        (-D.stiffness * (l.lift - goal.lift) - D.damping * l.liftV) / D.mass;
      l.liftV += al * STEP;
      l.lift += l.liftV * STEP;
    }
    if (steps === 10) l.carry = 0;
    const turning = Math.abs(l.az - goal.az) > 0.05 || Math.abs(l.azV) > 0.3;
    const rising =
      Math.abs(l.lift - goal.lift) > 0.0008 || Math.abs(l.liftV) > 0.004;
    if (!turning) {
      l.az = wrap(goal.az);
      l.azV = 0;
    }
    if (!rising) {
      l.lift = goal.lift;
      l.liftV = 0;
    }
    return turning || rising;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const l = lamp.current;
    if (
      !visible.current ||
      document.hidden ||
      !gpu.current ||
      gpu.current.lost
    ) {
      l.last = 0;
      return;
    }
    const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 1 / 60;
    l.last = now;
    const moving = advance(dt);
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else l.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** First sight: bake, then either the light comes down or it is simply there. */
  const seen = () => {
    bake();
    const l = lamp.current;
    if (introPending.current && baked.current) {
      introPending.current = false;
      if (k.motionSafe && !l.held) {
        l.az = l.rest - INTRO_SWING;
        l.azV = 0;
        l.lift = 1;
        l.liftV = 0;
      }
    }
    draw();
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { bake, draw, kick, tick, resize, readPalette, seen };
    report.current = { onAzimuthChange, onLightChange };
  });

  // The GPU side, bound to the canvas: built, rebuilt after a lost context,
  // torn down with the component. StrictMode's second run builds again on
  // the same context, which the browser hands back unchanged.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const bakeProgram = createProgram(gl, FULLSCREEN_VERTEX, BAKE);
      const lightProgram = createProgram(gl, FULLSCREEN_VERTEX, LIGHT);
      if (!bakeProgram || !lightProgram) {
        bakeProgram?.dispose();
        lightProgram?.dispose();
        return false;
      }
      gpu.current = {
        gl,
        bake: bakeProgram,
        light: lightProgram,
        bakeTri: createFullscreenTriangle(gl, bakeProgram),
        lightTri: createFullscreenTriangle(gl, lightProgram),
        mask: null,
        albedo: null,
        surface: null,
        lost: false,
      };
      baked.current = "";
      api.current?.readPalette();
      api.current?.resize();
      if (visible.current) api.current?.seen();
      return true;
    };
    if (!build()) {
      rootRef.current?.setAttribute("data-fallback", "");
      return;
    }
    const detach = onContextLoss(
      canvas,
      () => {
        if (gpu.current) gpu.current.lost = true;
        shownLive.current = false;
        rootRef.current?.removeAttribute("data-live");
      },
      () => {
        gpu.current = null;
        build();
      },
    );
    return () => {
      detach();
      const g = gpu.current;
      gpu.current = null;
      if (g && !g.lost) {
        g.bakeTri.dispose();
        g.lightTri.dispose();
        g.bake.dispose();
        g.light.dispose();
        g.surface?.dispose();
        if (g.mask) g.gl.deleteTexture(g.mask);
        if (g.albedo) g.gl.deleteTexture(g.albedo);
      }
      shownLive.current = false;
    };
  }, []);

  // A photograph to relight: loaded once per source, readable across origins
  // or not used at all.
  React.useEffect(() => {
    if (!src) {
      if (images.current) {
        images.current = null;
        baked.current = "";
        api.current?.bake();
        api.current?.draw();
      }
      return;
    }
    let cancelled = false;
    const load = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("image"));
        img.src = url;
      });
    Promise.all([
      load(src),
      depthSrc ? load(depthSrc).catch(() => null) : Promise.resolve(null),
    ])
      .then(([photo, depth]) => {
        if (cancelled) return;
        images.current = { src: `${src}|${depthSrc ?? ""}`, photo, depth };
        setPhotoKey(`${src}|${depthSrc ?? ""}`);
      })
      .catch(() => {
        if (cancelled) return;
        images.current = null;
        setPhotoKey("");
      });
    return () => {
      cancelled = true;
    };
  }, [src, depthSrc]);

  React.useEffect(() => {
    api.current?.readPalette();
    api.current?.bake();
    api.current?.draw();
  }, [paintKey]);

  // Anything that changes the object itself: bake again and draw.
  React.useEffect(() => {
    api.current?.bake();
    api.current?.draw();
  }, [subject, seed, inscription, photoKey]);

  React.useEffect(() => {
    api.current?.resize();
    baked.current = "";
    api.current?.bake();
    api.current?.draw();
  }, [k.dpr]);

  // Anything that changes only the light: one frame.
  React.useEffect(() => {
    api.current?.draw();
  }, [k.elevation, k.relief, k.warmth, k.softness, k.gloss]);

  // A resting direction from the host (or a commit) carries the light round.
  React.useEffect(() => {
    const l = lamp.current;
    if (l.rest === restAz) return;
    l.rest = restAz;
    if (!l.held) {
      if (!motionSafe) api.current?.draw();
      api.current?.kick();
    }
  }, [restAz, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    const bakeLater = bakeTimer;
    const sayLater = sayTimer;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      window.clearTimeout(bakeLater.current);
      window.clearTimeout(sayLater.current);
    };
  }, []);

  // Size and sighting, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    let first = true;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.draw();
      if (first) {
        first = false;
        return;
      }
      // A box that is being resized bakes once it stops; until then the old
      // surface stretches to fit, which reads as the same object.
      window.clearTimeout(bakeTimer.current);
      bakeTimer.current = window.setTimeout(() => {
        api.current?.bake();
        api.current?.draw();
      }, 140);
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) api.current?.seen();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /** Tells the host what the hand is asking for, once per whole-degree change. */
  const tell = () => {
    const l = lamp.current;
    const azimuthNow = Math.round(wrap(l.held ? l.handAz : l.rest)) % 360;
    const elevationNow = Math.round(elevationAt(l.held ? l.handLift : 0));
    const reading = {
      azimuth: azimuthNow,
      elevation: elevationNow,
      held: l.held !== null,
    };
    const key = `${reading.azimuth}|${reading.elevation}|${reading.held}`;
    if (key === reported.current) return;
    reported.current = key;
    report.current.onLightChange?.(reading);
  };

  /** Sets the light down facing `az`: the new resting direction. */
  const commit = (az: number) => {
    const next = Math.round(wrap(az)) % 360;
    if (azimuth === undefined) setOwnAz(next);
    if (next !== Math.round(restAz) % 360)
      report.current.onAzimuthChange?.(next);
    lamp.current.rest = azimuth === undefined ? next : lamp.current.rest;
    // The marker lands: two small bounces, a lamp set down on a table.
    if (motionSafe) {
      markScale.jump(1.5);
      animate(markScale, 1, springs.recoil);
      markGlow.jump(1);
      animate(markGlow, 0.6, { duration: durations.page, ease: easings.enter });
    }
  };

  const handFrom = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return null;
    const r = root.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = ((clientY - r.top) / r.height) * 2 - 1;
    const dist = Math.hypot(nx, ny);
    const l = lamp.current;
    return {
      az: dist < 0.02 ? wrap(l.handAz) : wrap(Math.atan2(nx, -ny) / DEG),
      lift: clamp01(1 - dist / RIM),
    };
  };

  const take = (
    source: "pointer" | "touch" | "keyboard",
    az: number,
    lift: number,
  ) => {
    const l = lamp.current;
    l.held = source;
    l.handAz = az;
    l.handLift = lift;
    rootRef.current?.setAttribute("data-held", "");
    if (!k.motionSafe) {
      advance(0);
      api.current?.draw();
    }
    kick();
    tell();
  };

  const release = (source: "pointer" | "touch" | "keyboard") => {
    const l = lamp.current;
    if (l.held !== source) return;
    l.held = null;
    rootRef.current?.removeAttribute("data-held");
    if (!k.motionSafe) {
      advance(0);
      api.current?.draw();
    }
    kick();
    tell();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && lamp.current.held !== "touch") return;
    const hand = handFrom(event.clientX, event.clientY);
    if (!hand) return;
    take(
      event.pointerType === "touch" ? "touch" : "pointer",
      hand.az,
      hand.lift,
    );
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    downAt.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
    };
    const hand = handFrom(event.clientX, event.clientY);
    if (!hand) return;
    take(
      event.pointerType === "touch" ? "touch" : "pointer",
      hand.az,
      hand.lift,
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const down = downAt.current;
    downAt.current = null;
    if (!down || down.id !== event.pointerId) return;
    const hand = handFrom(event.clientX, event.clientY);
    if (event.pointerType === "touch") {
      // A finger has no hover: wherever it lifts, the lamp is set down.
      if (hand) commit(hand.az);
      release("touch");
      return;
    }
    // A click (not a drag that selected or wandered) sets the lamp down.
    if (
      hand &&
      Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6
    ) {
      commit(hand.az);
    }
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    downAt.current = null;
    release(event.pointerType === "touch" ? "touch" : "pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") release("pointer");
  };

  /** Freezes a sentence for the live region once the keys have settled. */
  const sayLight = (az: number, lift: number) => {
    window.clearTimeout(sayTimer.current);
    const sentence = `Light from ${rakingSide(az)}, ${Math.round(elevationAt(lift))} degrees above the surface.`;
    sayTimer.current = window.setTimeout(() => setSaid(sentence), 350);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const l = lamp.current;
    let az = l.held === "keyboard" ? l.handAz : restAz;
    let lift = l.keyLift;
    switch (event.key) {
      case "ArrowRight":
        az += KEY_ORBIT;
        break;
      case "ArrowLeft":
        az -= KEY_ORBIT;
        break;
      case "PageUp":
        az += KEY_PAGE;
        break;
      case "PageDown":
        az -= KEY_PAGE;
        break;
      case "ArrowUp":
        lift = clamp01(Math.round((lift + KEY_LIFT) * 10) / 10);
        break;
      case "ArrowDown":
        lift = clamp01(Math.round((lift - KEY_LIFT) * 10) / 10);
        break;
      case "Home":
        lift = 0;
        break;
      case "End":
        lift = 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    az = wrap(az);
    l.keyLift = lift;
    if (Math.round(az) % 360 !== Math.round(restAz) % 360) commit(az);
    take("keyboard", az, lift);
    sayLight(az, lift);
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (!event.currentTarget.matches(":focus-visible")) return;
    const l = lamp.current;
    take("keyboard", restAz, l.keyLift);
  };

  const onBlur = () => {
    lamp.current.keyLift = 0;
    release("keyboard");
  };

  const onColour = () => {
    api.current?.readPalette();
    api.current?.bake();
    api.current?.draw();
  };

  const description =
    alt ?? (src ? "Relit photograph" : (ALT[subject] ?? ALT.canvas));
  const keyTint = `color-mix(in oklab, ${WARM} ${Math.round(k.warmth * 100)}%, ${COOL})`;

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      className={cn(
        // A sideways finger moves the lamp; an upright swipe scrolls the page.
        "group/raking-light relative isolate h-56 w-full touch-pan-y overflow-clip select-none",
        interactive && "cursor-crosshair",
        className,
      )}
      style={{ backgroundColor: pigments[0] ?? "var(--muted)" }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={description}
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/raking-light:invisible group-data-live/raking-light:opacity-0"
        style={standIn(subject, pigments, restAz)}
      />
      {showLamp && interactive ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 size-0 opacity-0 transition-opacity duration-240 group-data-held/raking-light:opacity-100"
          style={{ x: markX, y: markY }}
        >
          <motion.span
            className="absolute -top-4 -left-4 size-8 rounded-full"
            style={{
              backgroundImage: `radial-gradient(closest-side, color-mix(in oklab, ${keyTint} 70%, transparent), transparent)`,
              opacity: markGlow,
              scale: markScale,
            }}
          />
          <motion.span
            className="absolute -top-1 -left-1 size-2 rounded-full shadow-[0_0_0_1px_color-mix(in_oklab,black_35%,transparent)]"
            style={{ backgroundColor: keyTint, scale: markScale }}
          />
        </motion.div>
      ) : null}
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColour}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
          <span
            key={`${subject}-${i}`}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      {interactive ? (
        <>
          <div
            role="application"
            aria-roledescription="lamp"
            tabIndex={0}
            aria-label={label}
            aria-describedby={hintId}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            className="absolute inset-0 rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <p id={hintId} className="sr-only">
            Left and Right orbit the light round the object, Up and Down raise
            and lower it, Home lays it low and End lifts it overhead.
          </p>
          <p className="sr-only" aria-live="polite">
            {said}
          </p>
        </>
      ) : null}
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: each object's colours as soft bands, washed with a light
 * from its resting side.
 */
function standIn(
  subject: RakingLightSubject,
  p: readonly string[],
  az: number,
): React.CSSProperties {
  const angle = Math.round(wrap(az + 180));
  const wash = `linear-gradient(${angle}deg, color-mix(in oklab, white 16%, transparent), transparent 42%, color-mix(in oklab, black 22%, transparent))`;
  const [
    c0 = "var(--muted)",
    c1 = c0,
    c2 = c1,
    c3 = c2,
    c4 = c3,
    c5 = c4,
    c6 = c5,
    c7 = c6,
  ] = p;
  if (subject === "paper") {
    return {
      backgroundColor: c0,
      backgroundImage: [
        wash,
        `radial-gradient(closest-side, transparent 78%, color-mix(in oklab, ${c1} 50%, transparent) 86%, transparent 94%)`,
      ].join(", "),
      backgroundSize: "100% 100%, 34% 68%",
      backgroundPosition: "0 0, 92% 50%",
      backgroundRepeat: "no-repeat",
    };
  }
  if (subject === "tablet") {
    return {
      backgroundColor: c0,
      backgroundImage: [
        wash,
        `repeating-linear-gradient(180deg, transparent 0 21%, color-mix(in oklab, ${c1} 45%, transparent) 21% 22.5%)`,
        `radial-gradient(120% 90% at 50% 45%, transparent 60%, color-mix(in oklab, ${c1} 60%, transparent))`,
      ].join(", "),
    };
  }
  return {
    backgroundColor: c2,
    backgroundImage: [
      wash,
      `linear-gradient(180deg, ${c1} 0%, ${c2} 44%, ${c4} 50%, ${c4} 56%, color-mix(in oklab, ${c5} 50%, ${c6}) 64%, ${c6} 80%, ${c7} 100%)`,
    ].join(", "),
  };
}
