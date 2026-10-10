"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PlasmaRibbonColor = "cobalt" | "ember" | "jade" | "orchid";

export type PlasmaRibbonProps = {
  /** The content on top of the ribbon: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How wide the ribbon is, px. @default 72 */
  thickness?: number;
  /** The halo around the ribbon, 0 (none) to 1 (a wide soft bloom). @default 0.6 */
  glow?: number;
  /** A named colour, or any CSS colour. @default "cobalt" */
  color?: PlasmaRibbonColor | (string & {});
  /** How high the gentle wave runs, 0 (flat) to 1 (a quarter of the box). @default 0.4 */
  amplitude?: number;
  /** The wave's length, px. @default 560 */
  wavelength?: number;
  /** How fast the wave travels and the plasma flows, 0 (still) to 2. @default 0.6 */
  speed?: number;
  /** How many sparks fray off its edges, 0 (none) to 1. @default 0.5 */
  sparks?: number;
  /** How much fine twisting filament runs along the core, 0 (smooth) to 1. @default 0.6 */
  filaments?: number;
  /** The pointer and keyboard focus pull the wave to their height, and a press whips it. @default true */
  interactive?: boolean;
  /** How hard the hand pulls the ribbon and how sharp a whip is, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** Hold the ribbon still; the hand still pulls it. @default false */
  paused?: boolean;
  /** Seeds the filaments, the sparks and the wave's phase. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) pulling the ribbon. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Pigments at fixed lightness, so the ribbon is the same plasma on a dark
 * field and a pale one. Cobalt takes the accent token's hue.
 */
const COLORS: Record<PlasmaRibbonColor, string> = {
  cobalt: "oklch(from var(--accent) 0.66 0.18 h)",
  ember: "oklch(0.72 0.16 50)",
  jade: "oklch(0.76 0.13 168)",
  orchid: "oklch(0.68 0.17 322)",
};

const RENDER_SCALE = 0.75;
/** The string is integrated at a fixed 120 Hz whatever the display does. */
const STEP = 1 / 120;
const NODES = 64;
/**
 * The string's local restoring spring is the drift spring (ζ 1): a pulled
 * stretch settles home without ringing, while tension carries the pull along
 * the ribbon as a travelling wave.
 */
const DRIFT = springs.drift;
const K_HOME = DRIFT.stiffness / DRIFT.mass;
const DAMP = DRIFT.damping / DRIFT.mass;
/** The hand's pull, s⁻² at full strength, and a whip's impulse, s⁻¹. */
const PULL = 260;
const WHIP = 16;
/** A composed moment for the still ribbon. */
const STILL_TIME = 11;

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

/** Any CSS colour, as linear RGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = lin(d[0] ?? 0);
    out[at + 1] = lin(d[1] ?? 0);
    out[at + 2] = lin(d[2] ?? 0);
  };
}

/** A focus this soon after a press or a lift inside came from the hand, ms. */
const PRESS_FOCUS_MS = 1000;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,video[controls],audio[controls],[role='button'],[role='link'],[role='slider'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='menuitem'],[role='option'],[role='combobox'],[role='spinbutton'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform float u_thick;
uniform float u_glow;
uniform float u_sparks;
uniform float u_fil;
uniform float u_dark;
uniform float u_seed;
uniform vec3 u_color;
uniform vec3 u_bg;
uniform vec4 u_line[16];
uniform vec2 u_burst;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}
${GLSL_SRGB}

float node(int i) {
  i = clamp(i, 0, 63);
  vec4 v = u_line[i >> 2];
  int c = i & 3;
  return c == 0 ? v.x : c == 1 ? v.y : c == 2 ? v.z : v.w;
}

void main() {
  float W = u_res.x / u_px;
  float H = u_res.y / u_px;
  vec2 px = v_uv * vec2(W, H);
  float t = u_time;

  // The centreline through the string's nodes (Catmull-Rom), and its slope.
  float fi = clamp(px.x / W, 0.0, 1.0) * 63.0;
  int i = int(min(floor(fi), 62.0));
  float f = fi - float(i);
  float p0 = node(i - 1);
  float p1 = node(i);
  float p2 = node(i + 1);
  float p3 = node(i + 2);
  float f2 = f * f;
  float f3 = f2 * f;
  float yc = 0.5 * ((2.0 * p1) + (-p0 + p2) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * f3);
  float dyf = 0.5 * ((-p0 + p2) + 2.0 * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f + 3.0 * (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * f2);
  float slope = dyf * 63.0 / W;
  float across = (px.y - yc) / sqrt(1.0 + slope * slope);
  float hw = u_thick * 0.5;
  float v = across / hw;
  float av = abs(v);
  float s = px.x / max(hw * 2.4, 24.0);
  float flow = t * 1.15;

  // The plasma: twisting filaments flowing along a soft body, a hot core,
  // edges frayed by noise.
  float n1 = kx_noise(vec2(s * 1.3 - flow, v * 0.9 + u_seed));
  float n2 = kx_noise(vec2(s * 3.1 - flow * 1.7, v * 1.8 - t * 0.21 + u_seed));
  float strand = 0.5 + 0.5 * sin((v * 2.6 + n1 * 2.3 + n2 * 0.9) * 3.14159265);
  strand = pow(strand, mix(1.0, 5.0, u_fil));
  // The edge breathes slowly along the ribbon, and fibres peel off it.
  float side = v < 0.0 ? -1.0 : 1.0;
  float edge = 0.9 + 0.24 * kx_noise(vec2(s * 2.2 - flow * 1.4, side * 4.0 + u_seed));
  float body = 1.0 - smoothstep(edge - 0.38, edge, av);
  float core = exp(-v * v * 14.0);
  float plasma = body * mix(0.62, 0.25 + 1.05 * strand, u_fil) * (0.7 + 0.45 * n1);
  float wn = kx_noise(vec2(s * 1.6 - flow * 1.9, av * 1.6 + side * 3.0 + u_seed));
  float fib = abs(fract(av * 2.4 + wn * 2.8 - flow * 0.12) - 0.5) * 2.0;
  float patchy = smoothstep(0.42, 0.78, kx_noise(vec2(s * 2.6 - flow * 2.2, side * 7.0 + u_seed)));
  float fibre = pow(1.0 - fib, 16.0) * patchy * smoothstep(edge + 0.7, edge, av) * smoothstep(edge - 0.3, edge + 0.05, av);
  plasma += fibre * (0.25 + 0.6 * u_fil) * (0.5 + n2);

  // The halo, in px beyond the body.
  float reach = 6.0 + 54.0 * u_glow;
  float out_ = max(av - 0.45, 0.0) * hw;
  float halo = u_glow * exp(-out_ * out_ / (reach * reach)) * 0.55;

  // A whip's flash, near where it struck: it feeds the sparks and lights the
  // core and halo, so it shows with no sparks and under reduced motion too.
  float flash = u_burst.y * exp(-pow((px.x - u_burst.x) / 140.0, 2.0));
  halo *= 1.0 + 0.6 * flash;

  // Sparks fray off both edges: seeded cells along the ribbon, each spark
  // leaving the edge, flickering and dying as it goes.
  float spark = 0.0;
  if (av < 1.0 + (34.0 + hw * 0.8) / hw && u_sparks > 0.001) {
    float cw = 11.0;
    float col = floor(px.x / cw);
    float density = clamp(u_sparks * 0.55 + flash * 0.9, 0.0, 1.0);
    for (int j = -1; j <= 1; j++) {
      for (int k = 0; k < 3; k++) {
        vec2 id = vec2(col + float(j), float(k) * 7.31 + u_seed);
        float h = kx_hash(id);
        if (h > density) continue;
        float h2 = kx_hash(id + 3.7);
        float h3 = kx_hash(id + 9.1);
        float rate = 0.35 + 0.7 * h2;
        float life = fract(t * rate * 0.8 + h3);
        float side = h2 < 0.5 ? -1.0 : 1.0;
        float sx = (col + float(j) + 0.15 + 0.7 * kx_hash(id + 5.3)) * cw + life * 14.0;
        float sy = yc + side * (hw * 0.88 + life * (hw * 0.55 + 30.0) * (0.6 + 0.6 * h3));
        vec2 d = px - vec2(sx, sy);
        float fade = (1.0 - life) * (1.0 - life) * smoothstep(0.0, 0.06, life);
        float flicker = 0.65 + 0.35 * sin(t * 23.0 * (0.5 + h) + h3 * 40.0);
        spark += exp(-dot(d, d) * 0.9) * fade * flicker * (1.0 + flash);
      }
    }
  }

  // A dark field: the light adds, tone-mapped, and the core runs white-hot.
  vec3 field = mix(u_bg, u_bg * 0.7 + u_color * 0.02, u_dark);
  vec3 lightAdd = u_color * (plasma * 1.25 + halo + spark * 1.4) + mix(u_color, vec3(1.0), 0.7) * core * body * (0.42 + 0.4 * flash);
  vec3 darkCol = field + (1.0 - exp(-lightAdd * 1.5)) * (1.0 - field * 0.5);
  // A pale field: the ribbon is ink, its core a paler line inside it.
  vec3 ink = pow(u_color, vec3(1.25));
  vec3 paleField = mix(u_bg, u_color, 0.04);
  vec3 lightCol = mix(paleField, mix(paleField, ink, 0.3), clamp(halo * 1.1, 0.0, 1.0));
  lightCol = mix(lightCol, ink, clamp(plasma * 1.05, 0.0, 1.0));
  lightCol = mix(lightCol, mix(ink, vec3(1.0), 0.55), clamp(core * body * (0.6 + 0.3 * flash), 0.0, 1.0));
  lightCol = mix(lightCol, ink * 0.85, clamp(spark, 0.0, 1.0));
  vec3 col = mix(lightCol, darkCol, u_dark);

  col = kx_linearToSrgb(max(col, vec3(0.0)));
  col += (kx_hash(gl_FragCoord.xy + 0.71) - 0.5) / 255.0;
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
  thickness: number;
  glow: number;
  colorKey: string;
  amplitude: number;
  wavelength: number;
  speed: number;
  sparks: number;
  filaments: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  whip: (x: number, y: number, strength: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let carry = 0;
  let disposed = false;
  let failed = false;
  let active = false;
  let dark = 1;
  const read = rgbReader();
  /** The ribbon's colour and the page's, linear RGB. */
  const colours = new Float32Array(6);
  /** The string: each node's disturbance from the ambient wave, its velocity, the drawn centreline. */
  const disp = new Float32Array(NODES);
  const vel = new Float32Array(NODES);
  const line = new Float32Array(NODES);
  const size = { w: 0, h: 0 };
  const sim = { t: STILL_TIME, phase: 0 };
  const hand = {
    x: 0,
    y: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };
  const burst = { x: 0, amount: 0, v: 0, charge: 0 };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
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

  /** The ambient travelling wave at node i, px from the rest line. */
  const ambient = (i: number, t: number) => {
    const c = cfg;
    if (!c) return 0;
    const x = (i / (NODES - 1)) * size.w;
    const k = (Math.PI * 2) / clamp(c.wavelength, 120, 4000);
    const amp = clamp(c.amplitude, 0, 1) * size.h * 0.25;
    const w = t * 1.6;
    return (
      amp *
      (0.66 * Math.sin(k * x - w + sim.phase) +
        0.34 * Math.sin(k * 2.13 * x - w * 1.37 + sim.phase * 2.7))
    );
  };

  /** The centreline the hand asks for at node i: its own height, kept inside the box. */
  const handTarget = (i: number, t: number) => {
    const c = cfg;
    if (!c) return 0;
    const half = clamp(c.thickness, 8, 400) / 2;
    const y = clamp(hand.y, half, Math.max(half, size.h - half));
    return y - size.h / 2 - ambient(i, t);
  };

  /** Where each node sits in the hand's reach, 0 to 1. */
  const reachOf = (i: number, sigma: number) => {
    const x = (i / (NODES - 1)) * size.w;
    const d = (x - hand.x) / sigma;
    return Math.exp(-0.5 * d * d);
  };

  const rebuildLine = () => {
    const c = cfg;
    if (!c) return;
    const t = c.motionSafe ? sim.t : STILL_TIME;
    for (let i = 0; i < NODES; i += 1) {
      line[i] = size.h / 2 + ambient(i, t) + (disp[i] ?? 0);
    }
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    p.program.set({
      u_res: [canvas.width, canvas.height],
      u_px: canvas.width / Math.max(1, size.w),
      u_thick: clamp(c.thickness, 8, 400),
      u_glow: clamp(c.glow, 0, 1),
      u_sparks: clamp(c.sparks, 0, 1),
      u_fil: clamp(c.filaments, 0, 1),
      u_dark: dark,
      u_seed: (Math.abs(Math.round(c.seed)) % 89) * 1.37 + 0.5,
      u_color: colours.subarray(0, 3),
      u_bg: colours.subarray(3, 6),
    });
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    rebuildLine();
    program.use();
    gl.uniform1f(u.u_time ?? null, c.motionSafe ? sim.t : STILL_TIME);
    gl.uniform4fv(u.u_line ?? null, line);
    gl.uniform2f(u.u_burst ?? null, burst.x, burst.amount);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** One fixed step of the string and the hand. Returns the largest motion left. */
  const integrate = (h: number): number => {
    const c = cfg;
    if (!c) return 0;
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    hand.amountV +=
      ((DRIFT.stiffness * (want - hand.amount) - DRIFT.damping * hand.amountV) /
        DRIFT.mass) *
      h;
    hand.amount += hand.amountV * h;
    burst.v +=
      ((DRIFT.stiffness * (burst.charge - burst.amount) -
        DRIFT.damping * burst.v) /
        DRIFT.mass) *
      h;
    burst.amount += burst.v * h;
    burst.charge *= Math.exp(-h / 0.4);
    // Tension carries a pull along the ribbon at about two thirds of its
    // width a second, whatever the width, so the wave reads the same on a
    // phone card as on a hero.
    const dx = size.w / (NODES - 1);
    const speed = size.w * 0.68;
    const tension = (speed * speed) / (dx * dx);
    const sigma = size.w * 0.1 + 40;
    const pull = PULL * hand.amount;
    let most = 0;
    for (let i = 0; i < NODES; i += 1) {
      const d = disp[i] ?? 0;
      const left = disp[i > 0 ? i - 1 : 0] ?? d;
      const right = disp[i < NODES - 1 ? i + 1 : NODES - 1] ?? d;
      let a =
        tension * (left - 2 * d + right) - K_HOME * d - DAMP * (vel[i] ?? 0);
      if (pull > 0.01)
        a += pull * reachOf(i, sigma) * (handTarget(i, sim.t) - d);
      vel[i] = (vel[i] ?? 0) + a * h;
    }
    for (let i = 0; i < NODES; i += 1) {
      const nd = (disp[i] ?? 0) + (vel[i] ?? 0) * h;
      disp[i] = nd;
      // Motion is speed; a held bend under a resting hand is not motion,
      // but a bend with no hand left is still on its way home.
      const m =
        Math.abs(vel[i] ?? 0) * 0.05 +
        (hand.amount === 0 ? Math.abs(nd) * 0.2 : 0);
      if (m > most) most = m;
    }
    return most;
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    carry += dt;
    let most = 0;
    let steps = 0;
    while (carry >= STEP && steps < 8) {
      carry -= STEP;
      steps += 1;
      most = Math.max(most, integrate(STEP));
    }
    if (steps === 8) carry = 0;
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    const arriving =
      Math.abs(want - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = want;
      hand.amountV = 0;
    }
    const bursting =
      burst.charge > 0.002 || burst.amount > 0.002 || Math.abs(burst.v) > 0.01;
    if (!bursting) {
      burst.amount = 0;
      burst.v = 0;
      burst.charge = 0;
    }
    // A tenth of a pixel of string is nothing anyone can see.
    const settled = most < 0.02;
    if (settled) {
      vel.fill(0);
      if (hand.amount === 0) disp.fill(0);
    }
    return moving || !settled || arriving || bursting;
  };

  /** Reduced motion: the ribbon takes the hand's settled shape at once. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    vel.fill(0);
    const amount = hand.present && c.interactive ? 1 : 0;
    const sigma = size.w * 0.14 + 50;
    for (let i = 0; i < NODES; i += 1) {
      disp[i] =
        amount > 0
          ? clamp(c.pointerStrength, 0, 1) *
            reachOf(i, sigma) *
            handTarget(i, STILL_TIME)
          : 0;
    }
  };

  const fadeStill = (dt: number): boolean => {
    burst.amount = Math.max(0, burst.amount - dt / durations.page);
    return burst.amount > 0;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (
      disposed ||
      !visible.current ||
      document.hidden ||
      !c ||
      !gpu ||
      gpu.lost
    ) {
      last = 0;
      return;
    }
    // Flowing alone, the ribbon is smooth at thirty frames a second; the
    // hand and a whip get every frame.
    const calm =
      !hand.present &&
      hand.amount === 0 &&
      burst.amount === 0 &&
      Math.abs(vel[NODES >> 1] ?? 0) < 0.5;
    if (calm && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : fadeStill(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (
      disposed ||
      frame ||
      !visible.current ||
      document.hidden ||
      !gpu ||
      gpu.lost
    )
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 2; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const lum =
      0.2126 * (colours[3] ?? 0) +
      0.7152 * (colours[4] ?? 0) +
      0.0722 * (colours[5] ?? 0);
    dark = clamp((0.3 - lum) / 0.22, 0, 1);
    statics();
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    resizeGL(p.gl, canvas, {
      dprCap: clamp(c.dpr, 0.5, 2),
      renderScale: RENDER_SCALE,
    });
    statics();
    draw();
    kick();
  };

  const startGpu = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was || was.seed !== next.seed) {
        sim.phase = lcg(next.seed * 13 + 5)() * Math.PI * 2;
      }
      if (failed) return;
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS still ribbon stays, and nothing retries.
          failed = true;
          root.setAttribute("data-fallback", "");
          return;
        }
        detach = onContextLoss(
          canvas,
          () => {
            if (gpu) gpu.lost = true;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            root.removeAttribute("data-live");
          },
          () => {
            gpu = null;
            if (!disposed) startGpu();
          },
        );
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) {
        burst.charge = 0;
        burst.v = 0;
        place();
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    handTo(x, y, source) {
      const c = cfg;
      // A still stand-in has no hand to report.
      if (!c?.interactive || failed || !gpu || gpu.lost) return;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (!c.motionSafe) place();
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) place();
      kick();
    },
    whip(x, y, strength) {
      const c = cfg;
      if (!c?.interactive || !gpu) return;
      const power = clamp(c.pointerStrength, 0, 1) * strength;
      hand.x = x;
      hand.y = y;
      burst.x = x;
      if (c.motionSafe) {
        // A sharp impulse toward the press height, narrow, so a crest and a
        // trough run out both ways; the sparks there burst on the drift spring.
        const sigma = 26 + size.w * 0.03;
        for (let i = 0; i < NODES; i += 1) {
          const target = handTarget(i, sim.t);
          vel[i] =
            (vel[i] ?? 0) +
            WHIP * power * reachOf(i, sigma) * (target - (disp[i] ?? 0));
        }
        burst.charge = Math.min(1.5, burst.charge + 0.5 + 0.7 * power);
        burst.v += 9 * power;
      } else {
        burst.amount = 0.5 + 0.5 * power;
      }
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

/**
 * A background with a single ribbon of plasma crossing it on a gentle wave,
 * with the content on top in its own layer. The ribbon glows at its core —
 * white-hot on a dark page, a paler line in the ink on a pale one — carries
 * long twisting filaments that flow along it, frays at its edges, and sheds
 * sparks that leave both edges, flicker and die, inside a soft halo.
 *
 * Its centreline is a small string, integrated at 120 Hz: an ambient
 * travelling wave plus a disturbance that tension carries along the ribbon
 * and a local restoring spring with the drift constants brings home without
 * ringing. The pointer pulls the string toward its own height where it is,
 * and the pull travels outward, so the far ends follow late; a press whips
 * it — a sharp impulse toward the press height that runs out both ways as a
 * crest and a trough — and the sparks there burst. Keyboard focus on a
 * control inside lifts the ribbon to that control with a softer whip. Thirty
 * frames a second while it only flows, every frame while the hand works;
 * nothing off screen or in a hidden page. Without WebGL2 a CSS still ribbon
 * stands in; under reduced motion one still frame is drawn, the ribbon takes
 * the hand's settled shape at once, and a whip is a flash of the sparks that
 * fades.
 */
export function PlasmaRibbon({
  children,
  thickness = 72,
  glow = 0.6,
  color = "cobalt",
  amplitude = 0.4,
  wavelength = 560,
  speed = 0.6,
  sparks = 0.5,
  filaments = 0.6,
  interactive = true,
  pointerStrength = 0.7,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: PlasmaRibbonProps) {
  const motionSafe = useMotionSafe();
  const paint = COLORS[color as PlasmaRibbonColor] ?? color;
  const paints = [paint, "var(--background)"];
  const colorKey = paint;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    thickness,
    glow,
    colorKey,
    amplitude,
    wavelength,
    speed,
    sparks,
    filaments,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
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
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  /** When the hand last pressed or lifted inside, so the focus it causes is not taken for the keyboard. */
  const pressedAt = React.useRef(-Infinity);

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
    pressedAt.current = performance.now();
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit))
      engine.current?.whip(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    // A tap focuses its target after the finger lifts.
    pressedAt.current = performance.now();
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    // A text field shows a focus ring even when clicked; a press is not the keyboard.
    if (performance.now() - pressedAt.current < PRESS_FOCUS_MS) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.whip(at.x, at.y, 0.5);
  };

  // A key pressed inside means the next focus is the keyboard's, however
  // recently the hand pressed.
  const onKeyDown = () => {
    pressedAt.current = -Infinity;
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDownCapture={onKeyDown}
      className={cn(
        // Nothing is dragged here; the page keeps its vertical scroll on touch.
        "group/plasma-ribbon relative isolate h-full w-full touch-pan-y overflow-clip bg-background",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/plasma-ribbon:opacity-0"
        style={standIn(paint, thickness, glow)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((p, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: p }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: a straight band of the colour across the middle
 * with a paler core and a soft halo.
 */
function standIn(
  paint: string,
  thickness: number,
  glow: number,
): React.CSSProperties {
  const half = Math.round(clamp(thickness, 8, 400) / 2);
  const reach = Math.round(6 + 54 * clamp(glow, 0, 1));
  const tint = (n: number) =>
    `color-mix(in oklab, ${paint} ${n}%, var(--background))`;
  const core = `color-mix(in oklab, ${paint} 45%, white)`;
  return {
    backgroundImage: `linear-gradient(to bottom, transparent calc(50% - ${half + reach}px), ${tint(18)} calc(50% - ${half}px), ${tint(78)} calc(50% - ${Math.round(half * 0.6)}px), ${core} 50%, ${tint(78)} calc(50% + ${Math.round(half * 0.6)}px), ${tint(18)} calc(50% + ${half}px), transparent calc(50% + ${half + reach}px))`,
  };
}
