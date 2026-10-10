"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GlowOrbPalette = "aurora" | "accent" | "ember" | "lagoon";

export type GlowOrbProps = {
  /** The content on top of the light: a headline, a line, a call to action. */
  children?: React.ReactNode;
  /** The orb's diameter, as a share of the box's short side, 0.2 to 0.9. @default 0.6 */
  size?: number;
  /** A named palette, or four CSS colours of your own, darkest first. @default "aurora" */
  palette?: GlowOrbPalette | readonly string[];
  /** How deeply the orb breathes, 0 (still) to 1: how much it swells and brightens on each breath. @default 0.5 */
  breath?: number;
  /** One whole breath, in and out, ms. @default 7000 */
  breathDuration?: number;
  /** How fast the colour flows over its surface, 0 (still) to 2. @default 0.6 */
  speed?: number;
  /** How much structure the surface carries, 0 (smooth) to 1 (fine). @default 0.55 */
  detail?: number;
  /** How wide and bright the halo is, 0 to 1. @default 0.6 */
  halo?: number;
  /** How far the halo leans toward the pointer, 0 (not at all) to 1. @default 0.6 */
  lean?: number;
  /** The orb's centre across the box, 0 (left) to 1 (right). @default 0.5 */
  x?: number;
  /** The orb's centre down the box, 0 (top) to 1 (bottom). @default 0.5 */
  y?: number;
  /** A whisper of grain that also hides banding, 0 to 1. @default 0.2 */
  grain?: number;
  /** The pointer and keyboard focus lean the halo, and a press draws a deep breath. @default true */
  interactive?: boolean;
  /** Hold the orb still mid-breath; the hand still leans it. @default false */
  paused?: boolean;
  /** Seeds the surface, so two orbs never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) leaning the halo. */
  onActiveChange?: (active: boolean) => void;
  /** Fires as each breath turns: true when it starts to breathe in, false when it starts to breathe out. */
  onBreathChange?: (inhaling: boolean) => void;
  /** Fires when a press draws a deep breath (true) and when it is let out (false). */
  onDeepBreath?: (drawn: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Pigments at fixed lightness, darkest first; each sits a tenth into the page so the light belongs to its theme. */
const PALETTES: Record<GlowOrbPalette, readonly string[]> = {
  aurora: [
    "oklch(0.45 0.12 285)",
    "oklch(0.63 0.14 235)",
    "oklch(0.79 0.12 178)",
    "oklch(0.94 0.05 125)",
  ],
  accent: [
    "oklch(from var(--accent) 0.4 c h)",
    "oklch(from var(--accent-bright) 0.6 c h)",
    "oklch(from var(--accent-bright) 0.78 calc(c * 0.6) calc(h + 30))",
    "oklch(from var(--accent-bright) 0.95 calc(c * 0.15) h)",
  ],
  ember: [
    "oklch(0.42 0.13 22)",
    "oklch(0.61 0.17 36)",
    "oklch(0.79 0.14 66)",
    "oklch(0.95 0.05 92)",
  ],
  lagoon: [
    "oklch(0.4 0.08 232)",
    "oklch(0.6 0.1 206)",
    "oklch(0.8 0.1 172)",
    "oklch(0.95 0.04 132)",
  ],
};

const inPage = (c: string) =>
  `color-mix(in oklab, ${c} 90%, var(--background))`;

/** The browser draws the canvas smaller and scales it up: the orb is soft by nature. */
const RENDER_SCALE = 0.6;
const STEP = 1 / 120;
/** The halo's lean follows on glide and arrives on drift; a deep breath is drawn on glide and let out on drift. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/** A deep breath holds at least one beat, ms. */
const BEAT = 450;
/** The ring a let-out breath sends through the halo, s. */
const RING = 0.9;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = (d[0] ?? 0) / 255;
    out[at + 1] = (d[1] ?? 0) / 255;
    out[at + 2] = (d[2] ?? 0) / 255;
  };
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** How far into one breath the orb is, 0 to 1: a slower inhale and a quicker exhale. */
const breathAt = (phase: number) => {
  const p = phase - Math.floor(phase);
  return p < 0.55
    ? 0.5 - 0.5 * Math.cos((Math.PI * p) / 0.55)
    : 0.5 + 0.5 * Math.cos((Math.PI * (p - 0.55)) / 0.45);
};

const FRAGMENT = `
uniform vec2 u_size;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_bright;
uniform float u_time;
uniform vec2 u_flow;
uniform vec3 u_lean;
uniform float u_halo;
uniform int u_octaves;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_bg;
uniform float u_day;
uniform vec2 u_ring;
uniform float u_grain;
uniform float u_frame;
uniform vec2 u_seed;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float total = 0.0;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    if (i >= u_octaves) break;
    sum += amp * kx_noise(p);
    total += amp;
    p = turn * p * 2.03 + vec2(11.3, 7.9);
    amp *= 0.5;
  }
  return sum / total;
}

vec3 ramp(float x) {
  x = clamp(x, 0.0, 1.0) * 3.0;
  vec3 c = mix(u_c0, u_c1, smoothstep(0.0, 1.0, x));
  c = mix(c, u_c2, smoothstep(1.0, 2.0, x));
  return mix(c, u_c3, smoothstep(2.0, 3.0, x));
}

void main() {
  vec2 p = v_uv * u_size;
  vec2 d = (p - u_center) / u_radius;
  float r = length(d);

  // The surface: noise on the sphere's own normal, blended over three
  // planes so it wraps without a seam and turns like a lit globe of gas.
  float z = sqrt(max(0.0, 1.0 - min(r * r, 1.0)));
  vec3 n = vec3(d, z);
  float t = u_time;
  float ca = cos(t * 0.11);
  float sa = sin(t * 0.11);
  n = vec3(ca * n.x + sa * n.z, n.y, -sa * n.x + ca * n.z);
  vec3 wgt = abs(n) + 0.001;
  wgt /= wgt.x + wgt.y + wgt.z;
  vec2 o = u_seed + u_flow;
  float f =
    fbm(n.xy * 1.25 + o + vec2(t * 0.05, -t * 0.03)) * wgt.z +
    fbm(n.yz * 1.25 + o.yx + vec2(-t * 0.04, t * 0.05)) * wgt.x +
    fbm(n.zx * 1.25 + o * 1.3 + vec2(t * 0.03, t * 0.04)) * wgt.y;
  // Bright at the core, cooler toward the limb.
  float core = exp(-r * r * 2.4);
  float x = 0.34 + 0.5 * smoothstep(0.2, 0.8, f);
  vec3 body = ramp(mix(x, 1.0, core * 0.7) * (0.6 + 0.4 * (1.0 - r * 0.5)));
  body *= u_bright;
  float limb = smoothstep(1.04, 0.55, r);

  // The halo leans toward the hand: its centre and its strength.
  vec2 hc = u_center + u_lean.xy;
  float hd = length(p - hc) / u_radius;
  float reach = 0.7 + 1.6 * u_halo;
  float glow = exp(-max(0.0, hd - 0.55) / reach) * (0.25 + 0.75 * u_halo);
  vec2 toward = normalize(u_lean.xy + vec2(0.0001));
  glow *= 1.0 + 0.35 * u_lean.z * max(0.0, dot(normalize(p - u_center + vec2(0.0001)), toward));
  vec3 haloC = mix(u_c1, u_c2, 0.45);
  float rim = exp(-pow((r - 1.05) / 0.08, 2.0)) * 0.1;
  float ring = u_ring.y * exp(-pow((length(p - u_center) - u_ring.x) / (u_radius * 0.09), 2.0));

  // On a dark page the orb is light added to the ground; on a light page the
  // same recipe tints the paper, so it reads as light in both.
  vec3 night = u_bg + haloC * glow * 0.55 + u_c3 * (rim + ring * 0.5) * 0.8;
  night = mix(night, body, limb);
  vec3 paper = mix(u_bg, haloC, clamp(glow * 0.6, 0.0, 1.0));
  paper = mix(paper, u_c2, clamp((rim + ring * 0.6) * 0.8, 0.0, 1.0));
  paper = mix(paper, body, limb);
  vec3 col = mix(night, paper, u_day);
  float noise = kx_hash(gl_FragCoord.xy + vec2(u_frame * 17.0, u_frame * 31.0));
  col += (noise - 0.5) * u_grain * 0.04;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  size: number;
  colorKey: string;
  breath: number;
  breathDuration: number;
  speed: number;
  detail: number;
  halo: number;
  lean: number;
  x: number;
  y: number;
  grain: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onBreath: (inhaling: boolean) => void;
  onDeep: (drawn: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  deep: (on: boolean, amount: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  css: { orb: HTMLElement; halo: HTMLElement },
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let failed = false;
  let active = false;
  let frames = 0;
  let inhaling: boolean | null = null;
  let deepOn = false;
  let deepAmount = 1;
  let deepSince = 0;
  let letOut = 0;
  let cssBreath: Animation | null = null;
  const read = rgbReader();
  /** c0..c3, page */
  const colours = new Float32Array(15);
  const size = { w: 0, h: 0 };
  let day = 0;
  const seedAt = { x: 0, y: 0 };
  const sim = {
    t: 0,
    phase: 0,
    deep: 0,
    deepV: 0,
    ring: -1,
  };
  const hand = {
    x: 0,
    y: 0,
    lx: 0,
    ly: 0,
    lvx: 0,
    lvy: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const radiusOf = (c: Config) =>
    (clamp(c.size, 0.2, 0.9) * Math.min(size.w, size.h)) / 2;
  const centreOf = (c: Config) => ({
    x: clamp(c.x, 0, 1) * size.w,
    y: clamp(c.y, 0, 1) * size.h,
  });

  /** Where the halo wants to lean: toward the hand, at most a third of a radius. */
  const leanTarget = (c: Config) => {
    if (!hand.present || !c.interactive) return { x: 0, y: 0 };
    const R = radiusOf(c);
    const o = centreOf(c);
    const dx = hand.x - o.x;
    const dy = hand.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = clamp(c.lean, 0, 1) * 0.32 * R * Math.min(1, d / (R * 2));
    return { x: (dx / d) * k, y: (dy / d) * k };
  };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    gpu = { gl, program, tri, lost: false };
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.tri.dispose();
    g.program.dispose();
  };

  /** Without WebGL2 the CSS orb breathes by itself, on screen and only when motion is welcome. */
  const cssBreathe = () => {
    const c = cfg;
    const want =
      (failed || Boolean(gpu?.lost)) &&
      c !== null &&
      c.motionSafe &&
      !c.paused &&
      visible.current &&
      !document.hidden &&
      clamp(c.breath, 0, 1) > 0;
    if (!want) {
      cssBreath?.pause();
      return;
    }
    if (!cssBreath) {
      const k = clamp(c.breath, 0, 1);
      cssBreath = css.orb.animate(
        [
          { transform: "scale(1)", opacity: 0.92 },
          {
            transform: `scale(${(1 + 0.09 * k).toFixed(3)})`,
            opacity: 1,
          },
        ],
        {
          duration: clamp(c.breathDuration, 2000, 30000) / 2,
          iterations: Infinity,
          direction: "alternate",
          easing: "ease-in-out",
        },
      );
    }
    cssBreath.play();
  };

  const cssLean = () => {
    const c = cfg;
    if (!c || !(failed || gpu?.lost)) return;
    const l = leanTarget(c);
    css.halo.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px)`;
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform2f(u.u_size ?? null, size.w, size.h);
    gl.uniform1f(u.u_halo ?? null, clamp(c.halo, 0, 1));
    gl.uniform1i(
      u.u_octaves ?? null,
      2 + Math.round(clamp(c.detail, 0, 1) * 4),
    );
    gl.uniform1f(u.u_grain ?? null, clamp(c.grain, 0, 1));
    gl.uniform1f(u.u_day ?? null, day);
    gl.uniform2f(u.u_seed ?? null, seedAt.x, seedAt.y);
    const names = ["u_c0", "u_c1", "u_c2", "u_c3", "u_bg"];
    for (let i = 0; i < 5; i += 1) {
      gl.uniform3f(
        u[names[i] ?? "u_c0"] ?? null,
        colours[i * 3] ?? 0,
        colours[i * 3 + 1] ?? 0,
        colours[i * 3 + 2] ?? 0,
      );
    }
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const k = clamp(c.breath, 0, 1);
    const b = breathAt(sim.phase);
    const R = radiusOf(c);
    const o = centreOf(c);
    program.use();
    gl.uniform2f(u.u_center ?? null, o.x, o.y);
    gl.uniform1f(
      u.u_radius ?? null,
      Math.max(4, R * (1 + 0.09 * k * b + 0.12 * sim.deep)),
    );
    gl.uniform1f(u.u_bright ?? null, 1 + 0.22 * k * b + 0.25 * sim.deep);
    gl.uniform1f(u.u_time ?? null, sim.t);
    // The surface drifts toward the hand's side, as if turning to look.
    gl.uniform2f(
      u.u_flow ?? null,
      R > 0 ? (hand.lx / R) * 0.35 : 0,
      R > 0 ? (hand.ly / R) * 0.35 : 0,
    );
    gl.uniform3f(u.u_lean ?? null, hand.lx, hand.ly, hand.amount);
    const ringAge = sim.ring;
    gl.uniform2f(
      u.u_ring ?? null,
      ringAge >= 0 ? R * (1.05 + 1.6 * (ringAge / RING)) : 0,
      ringAge >= 0 ? 0.6 * (1 - ringAge / RING) * (1 - ringAge / RING) : 0,
    );
    gl.uniform1f(u.u_frame ?? null, c.motionSafe ? frames % 64 : 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    frames += 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the breath, the flow, the lean and a deep breath. Returns whether anything still moves. */
  const step = (dt: number, now: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused) {
      const b = breathAt(sim.phase);
      sim.phase += dt / (clamp(c.breathDuration, 2000, 30000) / 1000);
      // Each inhale quickens the flow a touch.
      sim.t += dt * clamp(c.speed, 0, 2) * (0.8 + 0.4 * b);
      if (clamp(c.breath, 0, 1) > 0 || c.speed > 0) moving = true;
      const p = sim.phase - Math.floor(sim.phase);
      const nowIn = p < 0.55;
      if (inhaling !== nowIn && clamp(c.breath, 0, 1) > 0) {
        inhaling = nowIn;
        c.onBreath(nowIn);
      }
    }
    const want = hand.present && c.interactive ? 1 : 0;
    const lean = leanTarget(c);
    // A deep breath holds at least a beat, however short the press.
    const held = deepOn || now - deepSince < BEAT;
    const deepWant = held && deepSince > 0 ? deepAmount : 0;
    const deepSpring = deepWant > sim.deep ? GLIDE : DRIFT;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      hand.lvx +=
        ((GLIDE.stiffness * (lean.x - hand.lx) - GLIDE.damping * hand.lvx) /
          GLIDE.mass) *
        h;
      hand.lvy +=
        ((GLIDE.stiffness * (lean.y - hand.ly) - GLIDE.damping * hand.lvy) /
          GLIDE.mass) *
        h;
      hand.lx += hand.lvx * h;
      hand.ly += hand.lvy * h;
      hand.amountV +=
        ((DRIFT.stiffness * (want - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount += hand.amountV * h;
      sim.deepV +=
        ((deepSpring.stiffness * (deepWant - sim.deep) -
          deepSpring.damping * sim.deepV) /
          deepSpring.mass) *
        h;
      sim.deep += sim.deepV * h;
    }
    const leaning =
      Math.abs(lean.x - hand.lx) + Math.abs(lean.y - hand.ly) > 0.1 ||
      Math.abs(hand.lvx) + Math.abs(hand.lvy) > 0.5;
    if (!leaning) {
      hand.lx = lean.x;
      hand.ly = lean.y;
      hand.lvx = 0;
      hand.lvy = 0;
    }
    const arriving =
      Math.abs(want - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = want;
      hand.amountV = 0;
    }
    const drawing =
      Math.abs(deepWant - sim.deep) > 0.002 || Math.abs(sim.deepV) > 0.01;
    if (!drawing) {
      sim.deep = deepWant;
      sim.deepV = 0;
    }
    if (!held && deepSince > 0 && letOut === 0) {
      // Let out: a ring leaves the limb as the breath goes.
      letOut = now;
      sim.ring = 0;
    }
    if (sim.ring >= 0) {
      sim.ring += dt;
      if (sim.ring > RING) sim.ring = -1;
    }
    if (!held && deepSince > 0 && !drawing && sim.ring < 0) {
      deepSince = 0;
      letOut = 0;
      c.onDeep(false);
    }
    return moving || leaning || arriving || drawing || sim.ring >= 0 || held;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Only breathing, the orb is slow enough for thirty frames a second; the
    // hand and a deep breath get every frame.
    const calm =
      !hand.present &&
      hand.amount === 0 &&
      sim.deep === 0 &&
      sim.ring < 0 &&
      deepSince === 0;
    if (calm && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt, now) : false;
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: the lean lands where the hand is, and a deep breath is a still swap. */
  const still = () => {
    const c = cfg;
    if (!c || c.motionSafe) return;
    const l = leanTarget(c);
    hand.lx = l.x;
    hand.ly = l.y;
    hand.lvx = 0;
    hand.lvy = 0;
    hand.amount = hand.present && c.interactive ? 1 : 0;
    hand.amountV = 0;
    sim.deep = deepOn ? deepAmount : 0;
    sim.deepV = 0;
    sim.ring = -1;
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 5; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const page =
      0.2126 * (colours[12] ?? 0) +
      0.7152 * (colours[13] ?? 0) +
      0.0722 * (colours[14] ?? 0);
    day = page > 0.5 ? 1 : 0;
    statics();
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    if (!c || !p || p.lost) {
      cssLean();
      return;
    }
    resizeGL(p.gl, canvas, {
      dprCap: clamp(c.dpr, 0.5, 2),
      renderScale: RENDER_SCALE,
    });
    statics();
    draw();
    kick();
  };

  const placeAt = (c: Config) => {
    const rand = lcg(c.seed * 29 + 3);
    seedAt.x = rand() * 40;
    seedAt.y = rand() * 40;
    // A still frame sits mid-breath, a little in.
    sim.phase = 0.3;
    sim.t = 5 + rand() * 30;
  };

  const startGpu = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  const answer = () => {
    still();
    cssLean();
    draw();
    kick();
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was || was.seed !== next.seed) placeAt(next);
      if (
        was &&
        cssBreath &&
        (was.breath !== next.breath ||
          was.breathDuration !== next.breathDuration)
      ) {
        cssBreath.cancel();
        cssBreath = null;
      }
      if (failed) {
        resize();
        cssBreathe();
        cssLean();
        return;
      }
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS orb stays, breathes and leans.
          failed = true;
          root.setAttribute("data-fallback", "");
          resize();
          cssBreathe();
          return;
        }
        detach = onContextLoss(
          canvas,
          () => {
            if (gpu) gpu.lost = true;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            root.removeAttribute("data-live");
            cssBreathe();
          },
          () => {
            gpu = null;
            cssBreath?.cancel();
            cssBreath = null;
            css.halo.style.transform = "";
            if (!disposed) startGpu();
          },
        );
        answer();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr || was.size !== next.size) resize();
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      answer();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      cssBreathe();
      draw();
      kick();
    },
    handTo(x, y, source) {
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      answer();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      answer();
    },
    deep(on, amount) {
      const c = cfg;
      if (!c) return;
      if (on) {
        if (!deepOn && deepSince === 0) c.onDeep(true);
        deepOn = true;
        deepAmount = amount;
        deepSince = performance.now();
        letOut = 0;
      } else {
        deepOn = false;
        if (!c.motionSafe) {
          deepSince = 0;
          c.onDeep(false);
        }
      }
      answer();
    },
    dispose() {
      disposed = true;
      cssBreath?.cancel();
      cssBreath = null;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };
}

/**
 * A background built to sit behind a headline: one soft orb of light, with
 * the content on top in its own layer. A WebGL2 shader draws a sphere with
 * no hard rim whose surface is a living noise of colour — sampled on the
 * sphere's own normal, so it turns like a lit globe of gas — bright at the
 * core and cooler toward the limb, inside a wide halo. It breathes: a slow
 * inhale and a quicker exhale swell and brighten it on a cycle of
 * `breathDuration`.
 *
 * The halo leans toward the hand, following on glide and arriving on drift,
 * and the surface drifts toward that side as if the orb turned to look. A
 * press draws a deep breath — the orb swells and brightens on glide for at
 * least a beat, then lets it out on drift as a soft ring leaves the limb.
 * Keyboard focus on a control inside leans the halo there and takes a
 * gentler breath. Thirty frames a second while it only breathes; only on
 * screen in a visible page. Without WebGL2 a CSS orb stands in that still
 * breathes and leans, and under reduced motion one still frame is drawn
 * mid-breath and the lean and the deep breath land as instant swaps.
 */
export function GlowOrb({
  children,
  size = 0.6,
  palette = "aurora",
  breath = 0.5,
  breathDuration = 7000,
  speed = 0.6,
  detail = 0.55,
  halo = 0.6,
  lean = 0.6,
  x = 0.5,
  y = 0.5,
  grain = 0.2,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onBreathChange,
  onDeepBreath,
  className,
}: GlowOrbProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(() => {
    const list =
      typeof palette === "string"
        ? (PALETTES[palette as GlowOrbPalette] ?? PALETTES.aurora)
        : palette.length >= 4
          ? palette.slice(0, 4)
          : PALETTES.aurora;
    return list.map(inPage);
  }, [palette]);
  const colorKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const orbRef = React.useRef<HTMLDivElement | null>(null);
  const haloRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onBreathChange, onDeepBreath });
  /** Stops listening for the end of the current press, and lets the breath out. */
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    size,
    colorKey,
    breath,
    breathDuration,
    speed,
    detail,
    halo,
    lean,
    x,
    y,
    grain,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onBreath: (b) => report.current.onBreathChange?.(b),
    onDeep: (d) => report.current.onDeepBreath?.(d),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onBreathChange, onDeepBreath };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    const orb = orbRef.current;
    const glow = haloRef.current;
    if (!root || !canvas || !carriers || !orb || !glow) return;
    const e = createEngine(
      root,
      canvas,
      carriers,
      { orb, halo: glow },
      visible,
    );
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const listening = unlisten;
    return () => listening.current?.();
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      // A hidden page never hears the release: let the breath out now.
      if (document.hidden) unlisten.current?.();
      engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Size and sighting, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A press on a control is the control's; the halo only leans.
    if (hit && rootRef.current?.contains(hit)) return;
    // A second finger takes over from the first.
    unlisten.current?.();
    engine.current?.deep(true, 1);
    const id = event.pointerId;
    const touch = event.pointerType === "touch";
    const done = (e: PointerEvent) => {
      if (e.pointerId === id) unlisten.current?.();
    };
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
    unlisten.current = () => {
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      unlisten.current = null;
      engine.current?.deep(false, 1);
      // A finger that lifts takes the hand with it; a mouse stays.
      if (touch) engine.current?.handAway("pointer");
    };
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside leans the halo there and takes a
  // gentler breath, held for one beat.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    if (unlisten.current) return;
    engine.current?.deep(true, 0.6);
    engine.current?.deep(false, 0.6);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  const [c0, c1, c2, c3] = paints;
  const at = `${Math.round(clamp(x, 0, 1) * 1000) / 10}% ${Math.round(clamp(y, 0, 1) * 1000) / 10}%`;
  const diameter = Math.round(clamp(size, 0.2, 0.9) * 1000) / 10;

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        // A sideways finger leans the light; an upright swipe scrolls the page.
        "group/glow-orb relative isolate h-full w-full touch-pan-y overflow-clip bg-background [-webkit-touch-callout:none]",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      {/* The CSS orb: the server's still frame, and the whole orb without WebGL2. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity group-data-live/glow-orb:opacity-0"
        style={{ transitionDuration: `${durations.slow * 1000}ms` }}
      >
        <div
          ref={haloRef}
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at ${at}, color-mix(in oklab, ${c1 ?? "gray"} 55%, transparent) 0, color-mix(in oklab, ${c2 ?? "gray"} 18%, transparent) 38%, transparent 70%)`,
          }}
        />
        <div
          ref={orbRef}
          className="absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${Math.round(clamp(x, 0, 1) * 1000) / 10}%`,
            top: `${Math.round(clamp(y, 0, 1) * 1000) / 10}%`,
            height: `${diameter}%`,
            backgroundImage: `radial-gradient(circle at 42% 38%, ${c3 ?? "white"} 0, ${c2 ?? "gray"} 28%, ${c1 ?? "gray"} 58%, color-mix(in oklab, ${c0 ?? "gray"} 70%, transparent) 82%, transparent 100%)`,
          }}
        />
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[...paints, "var(--background)"].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}
