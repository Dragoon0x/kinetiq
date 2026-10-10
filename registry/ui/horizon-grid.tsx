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
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HorizonGridProps = {
  /** The content above the floor: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How fast the camera travels over the floor, 0 (still) to 3. @default 1 */
  speed?: number;
  /** How many grid lines span the near edge of the frame, 6 to 30. @default 14 */
  density?: number;
  /** The light's colour, any CSS colour; taken at a fixed lightness so both themes read it the same. @default "var(--accent-bright)" */
  color?: string;
  /** Where the horizon rests, as a fraction of the height from the top, 0.2 to 0.7. @default 0.5 */
  horizon?: number;
  /** How strong the breathing glow on the horizon is, 0 to 1. @default 0.6 */
  glow?: number;
  /** How bright the band of light sweeping the floor is, 0 (none) to 1. @default 0.6 */
  sweep?: number;
  /** How soon the far grid fades into the horizon haze, 0 (clear to the edge) to 1 (close). @default 0.5 */
  fog?: number;
  /** The grid lines' width, CSS px, 0.5 to 2. @default 1 */
  lineWidth?: number;
  /** The pointer and keyboard focus lean the camera, and a press opens a ring of light on the floor. @default true */
  interactive?: boolean;
  /** How far the camera leans toward the hand and how bright a ring is, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the travel, the sweep and the breath still; the hand still leans the camera. @default false */
  paused?: boolean;
  /** Seeds where the grid and the band start, so two floors never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) leaning the camera. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press (or keyboard focus) opens a ring of light on the floor. */
  onPulse?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Lines need resolution; the glow does not. Three quarters of the capped ratio is the balance. */
const RENDER_SCALE = 0.75;
const STEP = 1 / 120;
const CALM_FRAME = 31;
/** Cells a second at speed 1: the walk of someone crossing a plain at dusk. */
const TRAVEL = 0.55;
/** One pass of the band across the floor, seconds at speed 1. */
const SWEEP_PASS = 11;
/** The horizon glow's breath, seconds at speed 1. */
const BREATH = 9;
/** The ring takes this long to open, on the enter easing. */
const RING = 1.2;
/** How far the ring opens at most, in cells. */
const RING_REACH = 7;
/** A press's push into the travel spring: peaks near 1 a tenth of a second in. */
const SURGE = 26;
const DRIFT = springs.drift;
const MAX_ROLL = (5 * Math.PI) / 180;
const MAX_YAW = (9 * Math.PI) / 180;
const [E1, E2, E3, E4] = easings.enter;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The house enter curve as a function, for the ring's tween. */
function enterEase(t: number): number {
  let u = t;
  for (let i = 0; i < 5; i += 1) {
    const x =
      3 * (1 - u) * (1 - u) * u * E1 + 3 * (1 - u) * u * u * E3 + u * u * u;
    const dx =
      3 * (1 - u) * (1 - u) * E1 +
      6 * (1 - u) * u * (E3 - E1) +
      3 * u * u * (1 - E3);
    if (Math.abs(dx) < 1e-6) break;
    u = clamp(u - (x - t) / dx, 0, 1);
  }
  return 3 * (1 - u) * (1 - u) * u * E2 + 3 * (1 - u) * u * u * E4 + u * u * u;
}

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
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

/** What a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** The light as a pigment at a fixed lightness, its near-white core, and a deep ink of it for a pale page. */
const lightOf = (c: string) => `oklch(from ${c} 0.8 calc(c * 0.9) h)`;
const coreOf = (c: string) => `oklch(from ${c} 0.96 calc(c * 0.25) h)`;
const inkOf = (c: string) => `oklch(from ${c} 0.5 calc(c * 0.75) h)`;

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_col;
uniform vec3 u_core;
uniform vec3 u_ink;
uniform vec2 u_vp;
uniform float u_roll;
uniform float u_yaw;
uniform float u_focal;
uniform float u_cell;
uniform float u_travel;
uniform float u_band;
uniform float u_bandW;
uniform float u_sweep;
uniform float u_glow;
uniform float u_breath;
uniform float u_fog;
uniform float u_tnear;
uniform float u_line;
uniform vec4 u_ring;
uniform float u_ringW;
in vec2 v_uv;
out vec4 outColor;

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

// A grid line along one axis, anti-aliased by the coordinate's own screen
// derivative, and faded out before its cells crowd under a few pixels.
float gridLine(float coord, float px) {
  float fw = max(fwidth(coord), 1e-5);
  float d = abs(fract(coord + 0.5) - 0.5) / fw;
  float w = max(px, 1.0);
  float a = clamp(0.5 * w - d + 0.5, 0.0, 1.0) * min(px, 1.0);
  return a * (1.0 - smoothstep(0.16, 0.5, fw));
}

void main() {
  vec2 size = u_res / u_px;
  vec2 p = v_uv * size;
  vec2 d = p - u_vp;
  float cr = cos(u_roll);
  float sr = sin(u_roll);
  // Screen space turned by the camera's bank, about the vanishing point.
  vec2 q = vec2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y);
  float u = q.x / u_focal;
  float v = q.y / u_focal;
  float floorMask = smoothstep(-0.6, 0.6, q.y);
  float t = 1.0 / max(v, 0.0012);
  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  float X = (u * cy + sy) * t;
  float Z = (cy - u * sy) * t;

  float lw = u_line * u_px;
  float gx = X / u_cell;
  float gz = (Z + u_travel) / u_cell;
  float lines = max(gridLine(gx, lw), gridLine(gz, lw));
  float major = max(gridLine(gx * 0.25, lw * 1.15), gridLine(gz * 0.25, lw * 1.15));
  lines *= 0.55 + 0.45 * major;

  // The far floor goes into the haze of the horizon.
  float far = 1.0 - exp(-max(t - u_tnear, 0.0) / u_fog);

  // The band lies diagonally on the floor, so it too runs to the horizon.
  float s = (X - u_band - Z * 0.32) / u_bandW;
  float band = exp(-s * s) * u_sweep * (1.0 - 0.75 * far);

  vec2 rr = vec2(X - u_ring.x, Z - u_ring.y);
  float rd = length(rr);
  float rk = (rd - u_ring.z) / u_ringW;
  // The ring is a soft band of light on the floor with a bright edge, the
  // floor inside it faintly lit, the lines it crosses catching it.
  float ringAmt = u_ring.w * (1.0 - 0.6 * far);
  float ringBand = exp(-rk * rk);
  float ringEdge = exp(-rk * rk * 7.0);
  float ring = ringAmt * ringBand;

  float lineLight = lines * (1.0 - far) * (0.42 + 1.5 * band + 3.4 * ring);
  float wash = band * 0.14 + ringAmt * (0.16 * ringBand + 0.42 * ringEdge + 0.06 * step(rd, u_ring.z));

  // The glow sits on the horizon: tall and soft above it, short below.
  float above = max(-q.y, 0.0);
  float sx = q.x / (size.x * 0.62);
  float spreadX = exp(-sx * sx);
  float tall = size.y * (0.11 + 0.05 * u_breath);
  float glowSky = exp(-above / tall) * spreadX;
  float glowAmt = u_glow * (0.72 + 0.28 * u_breath);
  float hairline = exp(-abs(q.y) / 1.1) * 0.5 * spreadX;

  vec3 L = lin(u_col);
  vec3 C = lin(u_core);
  vec3 bg = lin(u_bg);
  vec3 fg = lin(u_fg);

  // Night: a deep sky over a darker floor, and the light added to both.
  float depth = smoothstep(0.0, max(u_vp.y, 1.0), p.y);
  vec3 skyN = bg * mix(0.78, 1.0, depth);
  vec3 floorN = bg * 0.72 + fg * 0.004;
  vec3 hazeN = bg + L * glowAmt * 0.16;
  vec3 groundN = mix(skyN, mix(floorN, hazeN, far), floorMask);
  float lightN = glowAmt * (glowSky * 0.55 * (1.0 - floorMask) + far * floorMask * 0.35 + hairline * 0.6);
  vec3 lineCol = mix(fg * 0.5, L, 0.65);
  vec3 lit = L * (lightN + wash * floorMask) + lineCol * lineLight * floorMask
    + C * (lines * (band * 0.9 + ring * 1.8) * (1.0 - far) + ringAmt * ringEdge * 0.45) * floorMask
    + L * ringAmt * (0.3 * ringBand + 0.6 * ringEdge) * floorMask;
  vec3 night = 1.0 - (1.0 - groundN) * exp(-lit);

  // Day: a pale sky, the floor a breath darker, the grid drawn in ink and
  // the light laid down as a tint.
  vec3 skyD = bg;
  vec3 floorD = mix(bg, fg, 0.035);
  vec3 groundD = mix(skyD, mix(floorD, mix(bg, L, 0.1 * glowAmt), far), floorMask);
  vec3 day = mix(groundD, L, clamp(glowAmt * (glowSky * 0.55 * (1.0 - floorMask) + hairline * 0.5 + far * floorMask * 0.3), 0.0, 0.7));
  day = mix(day, L, clamp(wash * 1.6 * floorMask, 0.0, 0.6));
  vec3 ink = lin(u_ink);
  float inkAmt = clamp(lines * (1.0 - far * 0.85) * (0.52 + 1.1 * band + 2.4 * ring) * floorMask, 0.0, 0.9);
  day = mix(day, ink, inkAmt);

  vec3 col = mix(night, day, u_light);
  outColor = vec4(srgb(col), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  colorKey: string;
  speed: number;
  density: number;
  horizon: number;
  glow: number;
  sweep: number;
  fog: number;
  lineWidth: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onPulse: () => void;
};

type Source = "pointer" | "focus";

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: Source) => void;
  handAway: (source: Source) => void;
  pulse: (x: number, y: number, strength: number) => void;
  dispose: () => void;
};

type Spring = { x: number; v: number };

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
  let disposed = false;
  let failed = false;
  let active = false;
  const read = rgbReader();
  const colours = new Float32Array(15);
  const size = { w: 0, h: 0 };
  let light = 0;
  const hand = { x: 0, y: 0, present: false, source: null as Source | null };
  const roll: Spring = { x: 0, v: 0 };
  const yaw: Spring = { x: 0, v: 0 };
  const pitch: Spring = { x: 0, v: 0 };
  const surge: Spring = { x: 0, v: 0 };
  /** Floor travel (mod four cells), the band's phase, the breath's phase. */
  const sim = { travel: 0, band: 0, breath: 0 };
  /** The ring: where on the floor (x, z relative to the camera), its age, and its strength. */
  const ring = { x: 0, z: 0, age: RING, strength: 0, reach: 1 };

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

  /** The camera, from the box: a focal length that scales with the height. */
  const focalOf = () => Math.max(1, size.h * 0.95);
  const restHorizon = (c: Config) => clamp(c.horizon, 0.2, 0.7) * size.h;
  /** Floor units across the near edge, at rest. */
  const nearWidth = (c: Config) =>
    size.w / Math.max(8, size.h - restHorizon(c));
  const cellOf = (c: Config) =>
    nearWidth(c) / clamp(Math.round(c.density), 6, 30);
  /** The floor distance at the bottom edge, at rest. */
  const nearT = (c: Config) => focalOf() / Math.max(8, size.h - restHorizon(c));

  const seedState = (c: Config) => {
    const rand = lcg(c.seed * 31 + 7);
    sim.travel = rand() * 4;
    sim.band = rand();
    sim.breath = rand() * Math.PI * 2;
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_light ?? null, light);
    gl.uniform1f(u.u_focal ?? null, focalOf());
    gl.uniform1f(u.u_cell ?? null, cellOf(c));
    gl.uniform1f(u.u_sweep ?? null, clamp(c.sweep, 0, 1));
    gl.uniform1f(u.u_glow ?? null, clamp(c.glow, 0, 1));
    const tn = nearT(c);
    gl.uniform1f(u.u_tnear ?? null, tn);
    gl.uniform1f(u.u_fog ?? null, tn * (16 - 13 * clamp(c.fog, 0, 1)));
    gl.uniform1f(u.u_line ?? null, clamp(c.lineWidth, 0.5, 2));
    gl.uniform1f(u.u_bandW ?? null, cellOf(c) * 1.6);
    gl.uniform1f(u.u_ringW ?? null, cellOf(c) * 0.75);
    const names = ["u_bg", "u_fg", "u_col", "u_core", "u_ink"];
    for (let i = 0; i < 5; i += 1) {
      gl.uniform3f(
        u[names[i] ?? "u_bg"] ?? null,
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
    const cell = cellOf(c);
    const reach = nearWidth(c) * 0.62;
    // The band swings side to side, easing at each end like a lamp on a
    // slow arm, and starts its pass from a seeded place.
    const bandX = -reach * Math.cos(sim.band * Math.PI * 2);
    const breath = 0.5 + 0.5 * Math.sin(sim.breath);
    const narrow = clamp(size.w / 600, 0.5, 1);
    program.use();
    gl.uniform2f(
      u.u_vp ?? null,
      size.w / 2,
      restHorizon(c) + pitch.x * size.h * 0.12,
    );
    gl.uniform1f(u.u_roll ?? null, roll.x * MAX_ROLL);
    gl.uniform1f(u.u_yaw ?? null, yaw.x * MAX_YAW * narrow);
    gl.uniform1f(u.u_travel ?? null, sim.travel * cell);
    gl.uniform1f(u.u_band ?? null, bandX);
    gl.uniform1f(u.u_breath ?? null, breath);
    const live = ring.age < RING;
    const k = live ? ring.age / RING : 1;
    const radius = c.motionSafe ? enterEase(k) * ring.reach : ring.reach * 0.7;
    const fade = live ? Math.pow(1 - k, 1.5) * ring.strength : 0;
    gl.uniform4f(u.u_ring ?? null, ring.x, ring.z, radius, fade);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Where the camera wants to be: leaning toward the hand, or level. */
  const targets = (c: Config) => {
    if (!hand.present || !c.interactive || size.w < 1) return [0, 0, 0];
    const s = clamp(c.pointerStrength, 0, 1);
    const nx = clamp((hand.x - size.w / 2) / (size.w / 2), -1, 1);
    const ny = clamp((hand.y - size.h / 2) / (size.h / 2), -1, 1);
    // Looking toward a low hand pitches the camera down: the horizon rises.
    return [nx * s, nx * s, -ny * s];
  };

  const stepSpring = (sp: Spring, to: number, h: number) => {
    sp.v +=
      ((DRIFT.stiffness * (to - sp.x) - DRIFT.damping * sp.v) / DRIFT.mass) * h;
    sp.x += sp.v * h;
  };

  const settled = (sp: Spring, to: number) => {
    if (Math.abs(to - sp.x) < 0.0005 && Math.abs(sp.v) < 0.005) {
      sp.x = to;
      sp.v = 0;
      return true;
    }
    return false;
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const [tr = 0, ty = 0, tp = 0] = targets(c);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const rate = c.paused ? 0 : clamp(c.speed, 0, 3);
    for (let s = 0; s < steps; s += 1) {
      stepSpring(roll, tr, h);
      stepSpring(yaw, ty, h);
      stepSpring(pitch, tp, h);
      stepSpring(surge, 0, h);
      if (rate > 0 || surge.x > 0.001) {
        const along = h * TRAVEL * (rate + 2.4 * Math.max(0, surge.x));
        sim.travel = (sim.travel + along) % 4;
        // The ring is on the floor: it comes toward the camera with it.
        ring.z -= along * cellOf(c);
      }
    }
    if (rate > 0) {
      sim.band = (sim.band + (dt * rate) / (SWEEP_PASS * 2)) % 1;
      sim.breath =
        (sim.breath + (dt * rate * Math.PI * 2) / BREATH) % (Math.PI * 2);
      moving = true;
    }
    if (ring.age < RING) {
      ring.age += dt;
      moving = true;
    }
    const still =
      settled(roll, tr) &&
      settled(yaw, ty) &&
      settled(pitch, tp) &&
      settled(surge, 0);
    return moving || !still;
  };

  const springing = () =>
    roll.v !== 0 ||
    yaw.v !== 0 ||
    pitch.v !== 0 ||
    surge.v !== 0 ||
    ring.age < RING;

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    if (c.motionSafe && !springing() && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    let moving: boolean;
    if (c.motionSafe) moving = step(dt);
    else {
      // Reduced motion: only the ring's fade runs, by opacity.
      moving = ring.age < RING;
      if (moving) ring.age += dt;
    }
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: a level camera over a parked floor. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    for (const sp of [roll, yaw, pitch, surge]) {
      sp.x = 0;
      sp.v = 0;
    }
    seedState(c);
    sim.band = 0.08;
    sim.breath = Math.PI / 2;
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 5; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const lum =
      0.2126 * (colours[0] ?? 0) +
      0.7152 * (colours[1] ?? 0) +
      0.0722 * (colours[2] ?? 0);
    light = lum > 0.5 ? 1 : 0;
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
      if (failed) return;
      if (!gpu) {
        if (!was) {
          seedState(next);
          if (!next.motionSafe) place();
        }
        if (!startGpu()) {
          // No WebGL2 here: the CSS still frame stays, and nothing retries.
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
      if (was.seed !== next.seed) seedState(next);
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) place();
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
    handTo(x, y, src) {
      const c = cfg;
      if (!c || !c.interactive) return;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = src;
      setActive(true);
      // Under reduced motion the camera stays level: a lean is travel.
      if (c.motionSafe) kick();
    },
    handAway(src) {
      if (hand.source !== src) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg?.motionSafe) kick();
    },
    pulse(x, y, strength) {
      const c = cfg;
      if (!c || !c.interactive || size.w < 1) return;
      c.onPulse();
      // The floor point under the press, through the camera as it stands;
      // a press in the sky lands on the far floor.
      const vpY = restHorizon(c) + pitch.x * size.h * 0.12;
      const dx = x - size.w / 2;
      const dy = y - vpY;
      const r = roll.x * MAX_ROLL;
      const qx = Math.cos(r) * dx + Math.sin(r) * dy;
      const qy = -Math.sin(r) * dx + Math.cos(r) * dy;
      const f = focalOf();
      const v = Math.max(qy / f, 0.14);
      const t = 1 / v;
      const a = yaw.x * MAX_YAW * clamp(size.w / 600, 0.5, 1);
      const uu = qx / f;
      ring.x = (uu * Math.cos(a) + Math.sin(a)) * t;
      ring.z = (Math.cos(a) - uu * Math.sin(a)) * t;
      // The ring opens to most of its own distance, so a near press stays a
      // ring on the floor rather than a wave that leaves the frame.
      const cell = cellOf(c);
      ring.reach = clamp(t * 0.7, cell * 2.5, cell * RING_REACH);
      ring.age = 0;
      ring.strength = clamp(strength, 0, 1) * (0.45 + 0.55 * c.pointerStrength);
      if (c.motionSafe) surge.v += SURGE * clamp(strength, 0, 1) * 0.6;
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
 * A background of a floor ruled with a fine grid running to the horizon, the
 * camera travelling over it so the grid flows toward you, a soft band of
 * light lying across the floor and sweeping from side to side, and a low glow
 * on the horizon that breathes on a long period. Lines are anti-aliased from
 * their own screen derivatives and fade before they crowd into moiré; the far
 * floor goes into the horizon's haze.
 *
 * The camera leans toward the hand — it banks, turns, and lifts or drops the
 * horizon — on springs with the `springs.drift` constants, and levels the same
 * way when the hand leaves. A press on the bare background opens a ring of
 * light on the floor from the point under it, an ellipse in perspective
 * because it lies on the floor, lighting the lines it crosses, while a
 * critically damped impulse surges the camera forward a few cells. Keyboard
 * focus on a control inside leans toward it and opens a softer ring under it.
 * One fullscreen WebGL2 draw, 30 frames a second while it only travels,
 * nothing off screen or in a hidden page. Without WebGL2 a CSS perspective
 * grid stands in; under reduced motion one still floor is drawn.
 */
export function HorizonGrid({
  children,
  speed = 1,
  density = 14,
  color = "var(--accent-bright)",
  horizon = 0.5,
  glow = 0.6,
  sweep = 0.6,
  fog = 0.5,
  lineWidth = 1,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onPulse,
  className,
}: HorizonGridProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "var(--foreground)",
      lightOf(color),
      coreOf(color),
      inkOf(color),
    ],
    [color],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportActive = React.useRef(onActiveChange);
  const reportPulse = React.useRef(onPulse);

  const config: Config = {
    colorKey: color,
    speed,
    density,
    horizon,
    glow,
    sweep,
    fog,
    lineWidth,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => reportActive.current?.(a),
    onPulse: () => reportPulse.current?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportActive.current = onActiveChange;
    reportPulse.current = onPulse;
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
    // A press on a control is the control's; only the bare floor rings.
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.pulse(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
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
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.pulse(at.x, at.y, 0.55);
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
      className={cn(
        // A finger leans the camera as it moves across; an upright swipe is
        // the page's.
        "group/horizon-grid relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 overflow-clip transition-opacity duration-500 group-data-live/horizon-grid:opacity-0"
        style={skyStandIn(paints, horizon, glow)}
      >
        <div
          className="absolute"
          style={floorStandIn(paints, horizon, density, lineWidth)}
        />
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
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

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: a sky over a darker floor with the glow on the
 * horizon.
 */
function skyStandIn(
  paints: readonly string[],
  horizon: number,
  glow: number,
): React.CSSProperties {
  const h = clamp(horizon, 0.2, 0.7);
  const light = paints[2] ?? "white";
  const g = Math.round(clamp(glow, 0, 1) * 40);
  return {
    backgroundColor: "var(--background)",
    backgroundImage: [
      `radial-gradient(ellipse 70% ${pct(0.22)} at 50% ${pct(h)}, color-mix(in oklab, ${light} ${g}%, transparent), transparent 75%)`,
      `linear-gradient(to bottom, var(--background) 0%, var(--background) ${pct(h)}, color-mix(in oklab, var(--background) 90%, black) ${pct(h)}, color-mix(in oklab, var(--background) 82%, black) 100%)`,
    ].join(", "),
  };
}

/** The floor's grid as a tilted plane of ruled gradients, fading into the horizon. */
function floorStandIn(
  paints: readonly string[],
  horizon: number,
  density: number,
  lineWidth: number,
): React.CSSProperties {
  const h = clamp(horizon, 0.2, 0.7);
  const n = clamp(Math.round(density), 6, 30);
  const line = `color-mix(in oklab, ${paints[2] ?? "white"} 45%, transparent)`;
  const w = Math.round(clamp(lineWidth, 0.5, 2) * 10) / 10;
  // The plane is three widths wide so its narrowed far end still spans the
  // box; square tiles sized so a wide card's near edge holds about the
  // density's count of lines.
  const tile = Math.round(300 / n);
  return {
    left: "-100%",
    width: "300%",
    top: pct(h),
    height: pct((1 - h) * 2.2),
    transformOrigin: "50% 0%",
    transform: "perspective(240px) rotateX(64deg)",
    backgroundImage: `linear-gradient(90deg, ${line} ${w}px, transparent ${w}px), linear-gradient(180deg, ${line} ${w}px, transparent ${w}px)`,
    backgroundSize: `${tile}px ${tile}px`,
    backgroundPosition: "50% 0%",
    maskImage: "linear-gradient(to bottom, transparent, black 30%)",
  };
}
