"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CatseyeMarbleRibbon = "ember" | "lagoon" | "moss" | "ink";

export type CatseyeMarbleProps = {
  /** The ribbon's colourway. @default "ember" */
  ribbon?: CatseyeMarbleRibbon;
  /** Up to three CSS colours, one per vane, that replace `ribbon`. */
  colors?: string[];
  /** How glossy the glass is: the reflection's strength and the highlight's sharpness, 0 to 1. @default 0.6 */
  gloss?: number;
  /** Rolling friction, 0 (a slick table that lets it run) to 1 (felt that stops it quickly). @default 0.4 */
  roll?: number;
  /** The marble's diameter, px; never more than 36% of the tray's shorter side. @default 64 */
  size?: number;
  /** How far the vanes turn from one pole to the other, 0 (flat) to 1 (a turn and a half). @default 0.5 */
  twist?: number;
  /** The glass's colour, any CSS colour; the thicker the glass, the more it shows. @default nearly clear */
  tint?: string;
  /** The tray's felt, any CSS colour. @default a shade of the theme's raised surface */
  table?: string;
  /** Where the marble starts, as fractions of the tray. @default { x: 0.42, y: 0.5 } */
  defaultPosition?: { x: number; y: number };
  /** Any change rolls the marble back to where it started. */
  resetKey?: string | number;
  /** Fires when the marble starts rolling from rest. */
  onRoll?: () => void;
  /** Fires when the marble comes to rest, with where (fractions of the tray). */
  onRest?: (position: { x: number; y: number }) => void;
  /** Fires when the marble hits the tray's wall, with its speed into the wall, px/s. */
  onBounce?: (speed: number) => void;
  /** Dragging and the keys roll it. @default true */
  interactive?: boolean;
  /** A soft clack off the tray's wall. Off unless asked for. @default false */
  sound?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The tray's accessible name. @default "Glass marble" */
  label?: string;
  /** Nothing rolls it. @default false */
  disabled?: boolean;
  /** Sizes the tray. @default "h-56 w-full" */
  className?: string;
};

/** A token's hue and chroma at a fixed lightness: the same glass on a light page and a dark one. */
const pig = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} ${turn ? `calc(h + ${turn})` : "h"})`;

const RIBBONS: Record<CatseyeMarbleRibbon, [string, string, string]> = {
  ember: [
    pig("--warn", 0.72, 0.17, -28),
    pig("--danger", 0.58, 0.2),
    pig("--warn", 0.87, 0.13),
  ],
  lagoon: [
    pig("--accent", 0.52, 0.2),
    pig("--signal", 0.72, 0.13),
    pig("--accent", 0.82, 0.08, -40),
  ],
  moss: [
    pig("--success", 0.58, 0.15),
    pig("--warn", 0.84, 0.15, 18),
    pig("--signal", 0.46, 0.08),
  ],
  ink: [
    pig("--ink", 0.24, 0.02),
    "oklch(0.97 0.005 90)",
    pig("--accent", 0.55, 0.2),
  ],
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct3 = (v: number) => `${Number((v * 100).toFixed(3))}%`;

/** The tray's inner wall, px. */
const WALL = 9;
/** The glass's restitution off the wall. */
const BOUNCE = 0.62;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec2 u_pos;
uniform float u_r;
uniform mat3 u_rot;
uniform vec3 u_ribbon[3];
uniform vec3 u_table;
uniform vec3 u_room;
uniform vec3 u_tint;
uniform float u_gloss;
uniform float u_twist;
uniform float u_wall;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

// World: x right, y up, z toward the viewer; the table is z = 0. The light
// stands up and to the top left.
const vec3 LIGHT = vec3(-0.46, 0.62, 0.64);

vec2 toWorld(vec2 screen) { return vec2(screen.x, -screen.y); }
vec2 toScreen(vec2 world) { return vec2(world.x, -world.y); }

vec3 caustic() {
  return clamp((u_ribbon[0] + u_ribbon[1] + u_ribbon[2]) / 3.0 * 0.5 + 0.55, 0.0, 1.0);
}

// The felt, its wall, the marble's shadow and the light it gathers. Seen
// through the glass the felt under the ball is lit: the ball focuses light
// onto it, so the shadow is left out there.
vec3 tray(vec2 p, float shaded) {
  vec3 col = u_table * (1.0 + (kx_noise(p * 0.9) - 0.5) * 0.05 + (kx_noise(p * 0.21) - 0.5) * 0.04);
  float e = min(min(p.x, p.y), min(u_res.x - p.x, u_res.y - p.y));
  float wall = smoothstep(0.0, u_wall, e);
  col *= mix(0.72, 1.0, wall);
  // The bottom and right walls face the light.
  float lit = smoothstep(u_res.y - u_wall, u_res.y, p.y) + smoothstep(u_res.x - u_wall, u_res.x, p.x);
  col += (1.0 - wall) * clamp(lit, 0.0, 1.0) * 0.08;
  vec3 L = normalize(LIGHT);
  vec2 away = toScreen(-L.xy / L.z) * u_r;
  vec2 sc = u_pos + away * 0.55;
  vec2 ds = (p - sc) / vec2(1.0, 0.92);
  float shadow = 1.0 - smoothstep(u_r * 0.45, u_r * 1.35, length(ds));
  float contact = 1.0 - smoothstep(0.0, u_r * 0.55, length(p - u_pos - away * 0.12));
  col *= 1.0 - (0.34 * shadow + 0.28 * contact) * shaded;
  col *= 1.0 + 0.12 * (1.0 - shaded);
  vec2 cc = u_pos + away * 0.72;
  float k = exp(-dot(p - cc, p - cc) / (u_r * u_r * 0.075));
  col += k * 0.5 * caustic() * u_gloss * 0.6 + k * 0.18;
  return col;
}

vec3 room(vec3 dir) {
  vec3 L = normalize(LIGHT);
  float up = smoothstep(-0.15, 0.7, dir.z);
  vec3 col = mix(u_table * 0.9, u_room, up);
  float box = smoothstep(0.8, 0.94, dot(dir, L));
  col += box * mix(0.45, 1.2, u_gloss);
  col += smoothstep(0.2, 0.95, dot(dir, L)) * 0.14;
  return col;
}

void main() {
  vec2 p = v_uv * u_res;
  vec3 base = tray(p, 1.0);
  vec2 d = p - u_pos;
  float dist = length(d);
  if (dist > u_r + 1.0) {
    o_color = vec4(clamp(base, 0.0, 1.0), 1.0);
    return;
  }
  float r = u_r;
  vec2 dw = toWorld(d);
  float z = sqrt(max(r * r - dot(dw, dw), 0.0));
  vec3 S = vec3(dw, z);
  vec3 n = S / r;
  vec3 V = vec3(0.0, 0.0, -1.0);
  vec3 L = normalize(LIGHT);

  // Into the glass, across it, out the far side and down onto the felt.
  vec3 T = refract(V, n, 1.0 / 1.5);
  float tExit = -2.0 * dot(S, T);
  vec3 E = S + T * tExit;
  vec3 nE = E / r;
  vec3 T2 = refract(T, -nE, 1.5);
  vec3 behind;
  if (dot(T2, T2) < 0.001) {
    behind = room(reflect(T, -nE)) * 0.7;
  } else if (T2.z < -0.001) {
    float s = -(r + E.z) / T2.z;
    vec2 hit = toScreen(E.xy + T2.xy * s) + u_pos;
    behind = tray(hit, 0.0);
  } else {
    behind = room(T2);
  }
  float path = tExit / (2.0 * r);
  behind *= mix(vec3(1.0), u_tint, clamp(path * 1.2, 0.0, 1.0));

  // The ribbon: three helicoid vanes about the marble's own axis, found by
  // the sign change of each vane's signed distance between march steps, so a
  // vane thinner than a step is never stepped over.
  mat3 toLocal = transpose(u_rot);
  vec3 acc = vec3(0.0);
  float alpha = 0.0;
  float prev[3];
  vec3 qPrev = vec3(0.0);
  const int STEPS = 40;
  for (int i = 0; i <= STEPS; i += 1) {
    float t = tExit * float(i) / float(STEPS);
    vec3 q = toLocal * ((S + T * t) / r);
    for (int k = 0; k < 3; k += 1) {
      float a = float(k) * 2.0944 + u_twist * q.z;
      float f = q.y * cos(a) - q.x * sin(a);
      if (i > 0 && alpha < 0.97 && sign(f) != sign(prev[k])) {
        // Where between the two steps the ray crossed the vane.
        vec3 qc = mix(qPrev, q, prev[k] / (prev[k] - f));
        float ac = float(k) * 2.0944 + u_twist * qc.z;
        vec2 dir = vec2(cos(ac), sin(ac));
        float rr = length(qc.xy);
        // Each vane is a leaf: widest at the equator, closing to the axis
        // at the poles, well inside the glass.
        float zz = clamp(1.0 - qc.z * qc.z, 0.0, 1.0);
        float reach = 0.54 * sqrt(zz) * (0.3 + 0.7 * zz);
        float ragged = reach * (0.86 + 0.14 * kx_noise(vec2(qc.z * 7.0, float(k) * 5.0)));
        if (dot(qc.xy, dir) > 0.0 && rr < ragged + 0.012) {
          vec3 c = u_ribbon[k];
          vec3 nw = u_rot * vec3(-dir.y, dir.x, 0.0);
          float shade = 0.6 + 0.45 * abs(dot(nw, L));
          float edge = smoothstep(0.7, 1.0, rr / max(ragged, 0.001));
          c = mix(c * shade, vec3(1.0), edge * 0.12);
          c += pow(abs(dot(reflect(T, nw), L)), 24.0) * 0.3 * u_gloss;
          float a2 = 0.88 * (1.0 - smoothstep(ragged - 0.012, ragged + 0.012, rr));
          acc += (1.0 - alpha) * a2 * c;
          alpha += (1.0 - alpha) * a2;
        }
      }
      prev[k] = f;
    }
    qPrev = q;
  }
  vec3 inside = acc + (1.0 - alpha) * behind;
  // Light focused through the ball brightens the far inside edge.
  vec2 far = dw / r + L.xy * 0.55;
  inside += exp(-dot(far, far) / 0.07) * 0.22 * (1.0 - alpha);

  float cosi = clamp(n.z, 0.0, 1.0);
  float F = (0.04 + 0.96 * pow(1.0 - cosi, 5.0)) * mix(0.35, 1.0, u_gloss);
  vec3 R = reflect(V, n);
  vec3 col = mix(inside, room(R), F);
  float spec = pow(max(dot(R, L), 0.0), mix(40.0, 700.0, u_gloss));
  col += spec * mix(0.35, 1.7, u_gloss);
  col *= 1.0 - 0.18 * pow(1.0 - cosi, 3.0);
  // A thin rim of the room round the edge, so dark glass still reads as glass.
  col += pow(1.0 - cosi, 2.5) * 0.34 * u_room;

  float cover = 1.0 - smoothstep(r - 1.1, r + 0.2, dist);
  o_color = vec4(clamp(mix(base, col, cover), 0.0, 1.0), 1.0);
}
`;

type Vec3 = [number, number, number];

type Colours = {
  ribbon: [Vec3, Vec3, Vec3];
  table: Vec3;
  room: Vec3;
  tint: Vec3;
};

type Config = {
  gloss: number;
  roll: number;
  size: number;
  twist: number;
  dpr: number;
  motionSafe: boolean;
  start: { x: number; y: number };
};

type Report = {
  onRoll?: () => void;
  onRest?: (position: { x: number; y: number }) => void;
  onBounce?: (speed: number) => void;
  clack: (gain: number, x: number) => void;
  live: (on: boolean) => void;
  fallback: (on: boolean) => void;
  place: (x: number, y: number, angle: number, radius: number) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  colours: (c: Colours) => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  grab: () => void;
  dragBy: (dx: number, dy: number) => void;
  release: (vx: number, vy: number) => void;
  push: (vx: number, vy: number) => void;
  step: (dx: number, dy: number) => void;
  home: () => void;
  hits: (x: number, y: number) => boolean;
  where: () => { x: number; y: number };
  dispose: () => void;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

/** Any CSS colour as 0–1 rgb, through a 1×1 canvas. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Vec3 => {
    if (!ctx) return [0.5, 0.5, 0.5];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

/**
 * Rolls the orientation by a displacement on the table (world x right, y up,
 * z toward the viewer): rolling without slipping turns the ball about
 * up × direction by distance over radius, so the contact point stays put.
 * The matrix is column-major, local to world.
 */
function rollBy(m: Float32Array, dx: number, dy: number, radius: number) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-4 || radius <= 0) return;
  const ax = -dy / len;
  const ay = dx / len;
  const theta = len / radius;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const t = 1 - c;
  // Rodrigues about (ax, ay, 0).
  const r00 = c + ax * ax * t;
  const r01 = ax * ay * t;
  const r02 = ay * s;
  const r10 = ax * ay * t;
  const r11 = c + ay * ay * t;
  const r12 = -ax * s;
  const r20 = -ay * s;
  const r21 = ax * s;
  const r22 = c;
  for (let col = 0; col < 3; col += 1) {
    const x = m[col * 3] ?? 0;
    const y = m[col * 3 + 1] ?? 0;
    const z = m[col * 3 + 2] ?? 0;
    m[col * 3] = r00 * x + r01 * y + r02 * z;
    m[col * 3 + 1] = r10 * x + r11 * y + r12 * z;
    m[col * 3 + 2] = r20 * x + r21 * y + r22 * z;
  }
}

/** Gram–Schmidt on the columns, so a thousand small rolls stay a rotation. */
function orthonormalize(m: Float32Array) {
  const ax = [m[0] ?? 1, m[1] ?? 0, m[2] ?? 0];
  let l = Math.hypot(ax[0] ?? 0, ax[1] ?? 0, ax[2] ?? 0) || 1;
  const a = ax.map((v) => v / l);
  const bx = [m[3] ?? 0, m[4] ?? 1, m[5] ?? 0];
  const dot =
    (bx[0] ?? 0) * (a[0] ?? 0) +
    (bx[1] ?? 0) * (a[1] ?? 0) +
    (bx[2] ?? 0) * (a[2] ?? 0);
  const b0 = bx.map((v, i) => v - dot * (a[i] ?? 0));
  l = Math.hypot(b0[0] ?? 0, b0[1] ?? 0, b0[2] ?? 0) || 1;
  const b = b0.map((v) => v / l);
  const c = [
    (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
    (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
    (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
  ];
  m.set([...a, ...b, ...c]);
}

function createMarble(
  root: HTMLDivElement,
  glCanvas: HTMLCanvasElement,
  report: { current: Report },
): Engine {
  let cfg: Config | null = null;
  let colours: Colours | null = null;
  let gpu: Gpu | null = null;
  let width = 0;
  let height = 0;
  let visible = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let painted = false;
  let fallback = false;
  let held = false;
  let resting = true;
  let rolls = 0;
  let homeRun: { stop: () => void } | null = null;
  const ball = { x: 0, y: 0, vx: 0, vy: 0, placed: false };
  // A seeded first orientation, so the ribbon shows its turn at rest.
  const rot = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  rollBy(rot, 0.9, -0.5, 1);
  rollBy(rot, -0.3, 0.8, 1);

  const radius = () => {
    const d = Math.min(cfg?.size ?? 64, Math.min(width, height) * 0.36);
    return Math.max(8, d / 2);
  };

  const setFallback = (on: boolean) => {
    if (on === fallback) return;
    fallback = on;
    report.current.fallback(on);
  };

  const buildGpu = (): boolean => {
    const gl = createGL(glCanvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    gpu = {
      gl,
      program,
      tri: createFullscreenTriangle(gl, program),
      lost: false,
    };
    return true;
  };
  if (!buildGpu()) setFallback(true);

  const detachLoss = onContextLoss(
    glCanvas,
    () => {
      if (gpu) gpu.lost = true;
      setFallback(true);
      request();
    },
    () => {
      gpu = null;
      if (buildGpu()) setFallback(false);
      request();
    },
  );

  const bounds = () => {
    const r = radius();
    return {
      lo: WALL * 0.6 + r,
      hx: width - WALL * 0.6 - r,
      hy: height - WALL * 0.6 - r,
    };
  };

  /** Every move goes through here, so the ribbon always turns with the ball. */
  const moveTo = (x: number, y: number) => {
    const dx = x - ball.x;
    const dy = y - ball.y;
    // Screen y is down; the roll is worked in world y, which is up.
    rollBy(rot, dx, -dy, radius());
    rolls += 1;
    if (rolls % 60 === 0) orthonormalize(rot);
    ball.x = x;
    ball.y = y;
  };

  const placeAtStart = () => {
    if (!cfg || width < 2) return;
    const b = bounds();
    ball.x = clamp(cfg.start.x * width, b.lo, b.hx);
    ball.y = clamp(cfg.start.y * height, b.lo, b.hy);
    ball.vx = 0;
    ball.vy = 0;
    ball.placed = true;
  };

  const physics = (dt: number) => {
    const c = cfg;
    if (!c || held) return;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 0.5) {
      ball.vx = 0;
      ball.vy = 0;
      return;
    }
    // Rolling resistance: a share of the speed and a steady drag, so a
    // felt stops it short and a slick table lets it run on.
    const k = lerp(0.25, 2.4, clamp(c.roll, 0, 1));
    const mu = lerp(18, 420, clamp(c.roll, 0, 1));
    let next = speed * Math.exp(-k * dt) - mu * dt;
    if (next < 3) next = 0;
    ball.vx *= next / speed;
    ball.vy *= next / speed;
    let nx = ball.x + ball.vx * dt;
    let ny = ball.y + ball.vy * dt;
    const b = bounds();
    let hit = 0;
    if (nx < b.lo || nx > b.hx) {
      hit = Math.max(hit, Math.abs(ball.vx));
      nx =
        nx < b.lo ? b.lo + (b.lo - nx) * BOUNCE : b.hx - (nx - b.hx) * BOUNCE;
      ball.vx = -ball.vx * BOUNCE;
      ball.vy *= 0.94;
    }
    if (ny < b.lo || ny > b.hy) {
      hit = Math.max(hit, Math.abs(ball.vy));
      ny =
        ny < b.lo ? b.lo + (b.lo - ny) * BOUNCE : b.hy - (ny - b.hy) * BOUNCE;
      ball.vy = -ball.vy * BOUNCE;
      ball.vx *= 0.94;
    }
    moveTo(clamp(nx, b.lo, b.hx), clamp(ny, b.lo, b.hy));
    if (hit > 40) {
      report.current.onBounce?.(Math.round(hit));
      report.current.clack(Math.min(0.6, 0.08 + hit / 2200), ball.x);
    }
  };

  const draw = (now: number) => {
    frame = 0;
    if (disposed || !visible || !cfg || !colours || width < 2) return;
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    physics(dt);
    const g = gpu;
    if (g && !g.lost && !g.gl.isContextLost() && !fallback) {
      const { gl } = g;
      resizeGL(gl, glCanvas, { dprCap: clamp(cfg.dpr, 0.5, 2) });
      g.program.use();
      g.program.set({
        u_res: [width, height],
        u_pos: [ball.x, ball.y],
        u_r: radius(),
        u_rot: rot,
        u_ribbon: [
          ...colours.ribbon[0],
          ...colours.ribbon[1],
          ...colours.ribbon[2],
        ],
        u_table: colours.table,
        u_room: colours.room,
        u_tint: colours.tint,
        u_gloss: clamp(cfg.gloss, 0, 1),
        u_twist: clamp(cfg.twist, 0, 1) * Math.PI * 1.5,
        u_wall: WALL,
      });
      g.tri.draw();
      if (!painted) {
        painted = true;
        report.current.live(true);
      }
    }
    // The drawn stand-in follows too: the ribbon's angle is where the
    // marble's own x axis points, seen from above.
    report.current.place(
      ball.x,
      ball.y,
      Math.atan2(-(rot[1] ?? 0), rot[0] ?? 1),
      radius(),
    );
    const speed = Math.hypot(ball.vx, ball.vy);
    if (held || speed > 0 || homeRun) {
      if (resting) report.current.onRoll?.();
      resting = false;
      frame = requestAnimationFrame(draw);
    } else {
      last = 0;
      if (!resting) {
        resting = true;
        report.current.onRest?.({
          x: Number((ball.x / width).toFixed(3)),
          y: Number((ball.y / height).toFixed(3)),
        });
      }
    }
  };

  const request = () => {
    if (frame || disposed || !visible) return;
    frame = requestAnimationFrame(draw);
  };

  return {
    configure: (next) => {
      const prev = cfg;
      cfg = next;
      if (!ball.placed) placeAtStart();
      else if (prev && prev.size !== next.size) {
        const b = bounds();
        ball.x = clamp(ball.x, b.lo, b.hx);
        ball.y = clamp(ball.y, b.lo, b.hy);
      }
      request();
    },
    colours: (next) => {
      colours = next;
      request();
    },
    resize: () => {
      const w = Math.max(1, root.clientWidth);
      const h = Math.max(1, root.clientHeight);
      if (w === width && h === height) return;
      const fx = width ? ball.x / width : -1;
      const fy = height ? ball.y / height : -1;
      width = w;
      height = h;
      if (!ball.placed || fx < 0) placeAtStart();
      else {
        const b = bounds();
        ball.x = clamp(fx * w, b.lo, b.hx);
        ball.y = clamp(fy * h, b.lo, b.hy);
      }
      request();
    },
    setVisible: (on) => {
      visible = on;
      if (on) request();
    },
    grab: () => {
      homeRun?.stop();
      homeRun = null;
      held = true;
      ball.vx = 0;
      ball.vy = 0;
      request();
    },
    dragBy: (dx, dy) => {
      const b = bounds();
      moveTo(clamp(ball.x + dx, b.lo, b.hx), clamp(ball.y + dy, b.lo, b.hy));
      request();
    },
    release: (vx, vy) => {
      held = false;
      const motion = cfg?.motionSafe ?? true;
      const cap = 2600;
      const speed = Math.hypot(vx, vy);
      const k = speed > cap ? cap / speed : 1;
      ball.vx = motion ? vx * k : 0;
      ball.vy = motion ? vy * k : 0;
      request();
    },
    push: (vx, vy) => {
      homeRun?.stop();
      homeRun = null;
      ball.vx += vx;
      ball.vy += vy;
      request();
    },
    step: (dx, dy) => {
      const b = bounds();
      moveTo(clamp(ball.x + dx, b.lo, b.hx), clamp(ball.y + dy, b.lo, b.hy));
      resting = false;
      request();
    },
    home: () => {
      if (!cfg) return;
      homeRun?.stop();
      const b = bounds();
      const tx = clamp(cfg.start.x * width, b.lo, b.hx);
      const ty = clamp(cfg.start.y * height, b.lo, b.hy);
      ball.vx = 0;
      ball.vy = 0;
      if (!cfg.motionSafe) {
        moveTo(tx, ty);
        resting = false;
        request();
        return;
      }
      const fx = ball.x;
      const fy = ball.y;
      // Rolled home on the glide spring: the same rolling, carried by a
      // progress value instead of the hand.
      homeRun = animate(0, 1, {
        ...springs.glide,
        onUpdate: (u) => {
          moveTo(fx + (tx - fx) * u, fy + (ty - fy) * u);
          request();
        },
        onComplete: () => {
          homeRun = null;
          request();
        },
      });
      request();
    },
    hits: (x, y) => Math.hypot(x - ball.x, y - ball.y) <= radius() + 6,
    where: () => ({ x: ball.x, y: ball.y }),
    dispose: () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      homeRun?.stop();
      homeRun = null;
      detachLoss();
      const g = gpu;
      gpu = null;
      if (g && !g.lost && !g.gl.isContextLost()) {
        g.tri.dispose();
        g.program.dispose();
      }
    },
  };
}

/**
 * A glass marble lying in a felt tray, ray traced per pixel in one WebGL2
 * pass: the studio reflected by Fresnel with a highlight as sharp as `gloss`,
 * three twisted vanes inside found by marching the refracted ray, the felt
 * seen magnified and flipped through the far side, and on the felt a soft
 * shadow holding a caustic tinted by the ribbon. Drag it and it follows 1:1,
 * its orientation integrated as true rolling so the ribbon turns the way a
 * real marble's does; let go and it coasts on rolling friction (`roll`),
 * bounces off the wall with a soft clack and settles. Arrow keys nudge it
 * with the same physics; Home rolls it back on the glide spring. Under reduced
 * motion a drag still rolls it 1:1 but it stops on release, and the keys step
 * it at once.
 */
export function CatseyeMarble({
  ribbon = "ember",
  colors,
  gloss = 0.6,
  roll = 0.4,
  size = 64,
  twist = 0.5,
  tint = "oklch(from var(--accent-bright) 0.95 0.02 calc(h - 50))",
  table = "color-mix(in oklab, var(--bg-2) 86%, var(--ink-3))",
  defaultPosition = { x: 0.42, y: 0.5 },
  resetKey,
  onRoll,
  onRest,
  onBounce,
  interactive = true,
  sound = false,
  dpr = 2,
  label = "Glass marble",
  disabled = false,
  className,
}: CatseyeMarbleProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const glRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriers = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const pageShown = React.useRef(true);
  const nudged = React.useRef(false);
  const [live, setLive] = React.useState(false);
  const [fallback, setFallback] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const active = interactive && !disabled;
  const vanes: string[] = [...RIBBONS[ribbon]];
  (colors ?? []).slice(0, 3).forEach((c, i) => {
    vanes[i] = c;
  });
  const startX = clamp(defaultPosition.x, 0, 1);
  const startY = clamp(defaultPosition.y, 0, 1);

  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fAngle = useMotionValue(-28);
  const fRadius = useMotionValue(size / 2);
  const fSide = useTransform(fRadius, (r) => r2(r * 2));

  const cfg: Config = {
    gloss,
    roll,
    size,
    twist,
    dpr,
    motionSafe,
    start: { x: startX, y: startY },
  };
  const cfgRef = React.useRef(cfg);
  const report = React.useRef<Report>({
    clack: () => {},
    live: () => {},
    fallback: () => {},
    place: () => {},
  });
  React.useLayoutEffect(() => {
    cfgRef.current = cfg;
    report.current = {
      onRest: (position) => {
        onRest?.(position);
        if (nudged.current) {
          nudged.current = false;
          setSaid((s) => ({ n: s.n + 1, text: "Resting." }));
        }
      },
      onBounce,
      clack: (gain, x) => {
        if (!sound) return;
        // Sound answers the visitor only: never before a press or a key.
        const activated =
          typeof navigator === "undefined" ||
          (
            navigator as Navigator & {
              userActivation?: { hasBeenActive: boolean };
            }
          ).userActivation?.hasBeenActive !== false;
        if (!activated) return;
        const root = rootRef.current;
        const pan = root
          ? panFrom(root.getBoundingClientRect().left + x, root)
          : 0;
        audio.play("clack", { gain, pitch: 1.35 + gain * 0.3, pan });
      },
      live: (on) => setLive(on),
      fallback: (on) => setFallback(on),
      place: (x, y, angle, radius) => {
        const root = rootRef.current;
        if (!root) return;
        fx.set(r2(x - startX * root.clientWidth));
        fy.set(r2(y - startY * root.clientHeight));
        fAngle.set(r2((angle * 180) / Math.PI));
        fRadius.set(r2(radius));
      },
      onRoll,
    };
  });

  const readColours = React.useCallback(() => {
    const host = carriers.current;
    if (!host) return;
    const read = colourReader();
    const kids = Array.from(host.children);
    const at = (i: number): Vec3 => {
      const el = kids[i];
      return read(el ? getComputedStyle(el).color : "rgb(128, 128, 128)");
    };
    engine.current?.colours({
      ribbon: [at(0), at(1), at(2)],
      table: at(3),
      room: at(4),
      tint: at(5),
    });
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = glRef.current;
    if (!root || !canvas) return;
    const e = createMarble(root, canvas, report);
    engine.current = e;
    e.configure(cfgRef.current);
    readColours();
    e.resize();
    e.setVisible(visible.current && pageShown.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [readColours]);

  const cfgKey = JSON.stringify(cfg);
  React.useEffect(() => {
    engine.current?.configure(cfgRef.current);
  }, [cfgKey]);

  const colourKey = `${vanes.join("|")}|${table}|${tint}`;
  React.useEffect(() => {
    readColours();
  }, [colourKey, readColours]);

  const lastReset = React.useRef(resetKey);
  React.useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    engine.current?.home();
  }, [resetKey]);

  React.useEffect(() => {
    const onVisibility = () => {
      pageShown.current = document.visibilityState !== "hidden";
      engine.current?.setVisible(visible.current && pageShown.current);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visible.current && pageShown.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const drag = useDrag({
    threshold: 2,
    disabled: !active,
    onStart: () => engine.current?.grab(),
    onMove: ({ delta }) => engine.current?.dragBy(delta.x, delta.y),
    onEnd: ({ velocity }) => engine.current?.release(velocity.x, velocity.y),
    onCancel: () => engine.current?.release(0, 0),
    onTap: (event) => {
      // A tap on the glass flicks it away from the finger.
      const e = engine.current;
      if (!e) return;
      const at = local(event.clientX, event.clientY);
      if (!e.hits(at.x, at.y)) return;
      const c = e.where();
      const dx = c.x - at.x;
      const dy = c.y - at.y;
      const len = Math.hypot(dx, dy) || 1;
      if (motionSafe) e.push((dx / len) * 300, (dy / len) * 300);
      else e.step((dx / len) * 24, (dy / len) * 24);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!active) return;
    const e = engine.current;
    if (!e) return;
    if (event.key === "Home") {
      event.preventDefault();
      nudged.current = true;
      e.home();
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = dirs[event.key];
    if (!dir) return;
    event.preventDefault();
    nudged.current = true;
    if (motionSafe) {
      const kick = event.shiftKey ? 680 : 340;
      e.push(dir[0] * kick, dir[1] * kick);
    } else {
      const by = event.shiftKey ? 48 : 24;
      e.step(dir[0] * by, dir[1] * by);
    }
  };

  return (
    <div
      ref={bindRoot}
      data-live={live && !fallback ? "" : undefined}
      {...drag}
      className={cn(
        "group/catseye-marble relative isolate h-56 w-full overflow-clip rounded-3 select-none",
        active ? "cursor-grab touch-none active:cursor-grabbing" : "touch-auto",
        className,
      )}
      style={{
        backgroundColor: table,
        boxShadow:
          "inset 0 0 0 1px var(--hairline), inset 5px 7px 12px -6px oklch(0.1 0.02 258 / 0.4), inset -3px -4px 8px -6px oklch(1 0 0 / 0.25)",
      }}
    >
      <canvas
        ref={glRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-200 group-data-live/catseye-marble:opacity-100"
      />
      {/* The marble as the server draws it, and as it rolls without WebGL. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute group-data-live/catseye-marble:hidden"
        style={{ left: pct3(startX), top: pct3(startY), x: fx, y: fy }}
      >
        <motion.div
          className="relative -translate-x-1/2 -translate-y-1/2"
          style={{ width: fSide, height: fSide }}
        >
          <span
            className="absolute inset-0 translate-x-[18%] translate-y-[24%] rounded-full blur-[5px]"
            style={{ backgroundColor: "oklch(0.15 0.02 258 / 0.35)" }}
          />
          <motion.svg
            viewBox="-50 -50 100 100"
            className="absolute inset-0 size-full overflow-visible"
          >
            <defs>
              <radialGradient id={`${uid}-glass`} cx="38%" cy="32%" r="70%">
                <stop offset="0%" stopColor="white" stopOpacity={0.55} />
                <stop offset="45%" stopColor="white" stopOpacity={0.12} />
                <stop offset="100%" stopColor="black" stopOpacity={0.22} />
              </radialGradient>
            </defs>
            <circle r={49} style={{ fill: table }} />
            <motion.g style={{ rotate: fAngle, originX: 0.5, originY: 0.5 }}>
              {vanes.map((c, i) => (
                <path
                  key={i}
                  d="M 0 0 C 12 -10 26 -6 40 -18 C 30 -2 16 4 0 0 Z"
                  transform={`rotate(${i * 120})`}
                  style={{ fill: c }}
                  opacity={0.92}
                />
              ))}
            </motion.g>
            <circle r={49} fill={`url(#${uid}-glass)`} />
            <ellipse
              cx={-17}
              cy={-21}
              rx={9}
              ry={5.5}
              fill="white"
              opacity={0.75}
              transform="rotate(-35 -17 -21)"
            />
          </motion.svg>
        </motion.div>
      </motion.div>
      <button
        type="button"
        aria-label={label}
        aria-describedby={active ? hintId : undefined}
        disabled={!active}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 size-full cursor-[inherit] rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <span
        ref={carriers}
        aria-hidden
        onTransitionEnd={readColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {vanes.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
        <span
          className="transition-colors duration-1"
          style={{ color: table }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: "color-mix(in oklab, var(--background) 80%, white)" }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: tint }}
        />
      </span>
      {active ? (
        <p id={hintId} className="sr-only">
          Drag to roll it. Arrow keys nudge it, Shift harder; Home rolls it
          back.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
