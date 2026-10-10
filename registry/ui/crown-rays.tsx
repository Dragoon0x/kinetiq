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

export type CrownRaysProps = {
  /** The content under the rays: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many rays fan down from the source, 4 to 24. @default 12 */
  rays?: number;
  /** How thick the air is, 0 (clean blades of light) to 1 (soft, broken, glowing). @default 0.5 */
  haze?: number;
  /** The light's colour, any CSS colour; it is taken at a fixed light lightness so both themes read it the same. @default "var(--warn)" */
  color?: string;
  /** Where the source rests along the top, 0 (left) to 1 (right). @default 0.5 */
  origin?: number;
  /** How wide the crown fans, degrees, 40 to 160. @default 110 */
  spread?: number;
  /** How far down the frame the rays reach, 0 (short) to 1 (all the way). @default 0.7 */
  length?: number;
  /** How bright the rays burn, 0 to 1.5. @default 1 */
  intensity?: number;
  /** How far the crown turns and how deeply each ray breathes, 0 to 1. @default 0.5 */
  sway?: number;
  /** How fast the crown turns, breathes and the haze drifts, 0 (still) to 2. @default 1 */
  speed?: number;
  /** The pointer and keyboard focus move the source, and a press sends a pulse down the rays. @default true */
  interactive?: boolean;
  /** How far the source follows the hand and how bright a pulse is, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** Hold the crown still; the hand still moves the source. @default false */
  paused?: boolean;
  /** Seeds the rays and the haze, so two crowns never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) moving the source. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press (or keyboard focus) sends a pulse down the rays. */
  onPulse?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Rays are soft by nature: half the capped pixel ratio, scaled up by the browser. */
const RENDER_SCALE = 0.5;
const STEP = 1 / 120;
const CALM_FRAME = 31;
/** The pulse's front takes this long to run down the frame, on the enter easing. */
const PULSE = 0.6;
/** A pulse's push into the drift spring: peaks near 1 a tenth of a second in. */
const SURGE = 26;
const DRIFT = springs.drift;
/** Ambient time for a still frame: a seeded moment, not the first. */
const STILL = 24;
const [E1, E2, E3, E4] = easings.enter;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The house enter curve as a function, for the pulse's tween. */
function enterEase(t: number): number {
  // Solve the cubic bezier for x by a few Newton steps; t is already 0–1.
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

/** The light as a pigment at a fixed lightness, and its near-white core. */
const lightOf = (c: string) => `oklch(from ${c} 0.8 calc(c * 0.9) h)`;
const coreOf = (c: string) => `oklch(from ${c} 0.97 calc(c * 0.22) h)`;

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_col;
uniform vec3 u_core;
uniform vec2 u_source;
uniform float u_rays;
uniform float u_spread;
uniform float u_length;
uniform float u_intensity;
uniform float u_haze;
uniform float u_sway;
uniform vec2 u_pulse;
uniform float u_surge;
uniform vec2 u_seed;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = turn * p * 2.03 + 5.3;
    a *= 0.5;
  }
  return s / 0.9375;
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

void main() {
  vec2 size = u_res / u_px;
  vec2 p = v_uv * size;
  float t = u_time;
  vec2 d = p - u_source;
  float r = length(d);
  // 0 straight down, positive toward the right.
  float a = atan(d.x, d.y);
  float r0 = max(-u_source.y, 1.0);
  float n = max(u_rays, 1.0);
  float spacing = u_spread / n;
  // The crown turns as a pendulum of about one ray's spacing.
  float turn = u_sway * spacing * 1.1 * sin(t * 0.16 + u_seed.x);
  float haze = u_haze * (1.0 - 0.5 * clamp(u_surge, 0.0, 1.0));

  float blades = 0.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    if (fi >= n) break;
    float h1 = hash(vec2(fi, u_seed.x));
    float h2 = hash(vec2(fi + 31.0, u_seed.y));
    float h3 = hash(vec2(fi + 67.0, u_seed.x + u_seed.y));
    float at = u_spread * ((fi + 0.5) / n - 0.5) + (h1 - 0.5) * spacing * 0.7 + turn * (0.7 + 0.6 * h2);
    float w = spacing * (0.07 + 0.3 * h2 * h2) * (1.0 + 0.35 * haze);
    // Each ray breathes on its own slow period.
    float breathe = 1.0 - u_sway * 0.42 * (0.5 + 0.5 * sin(t * (0.22 + 0.3 * h1) + h3 * 6.2831));
    float x = (a - at) / w;
    blades += (0.22 + 0.78 * h3 * h3) * breathe * exp(-x * x);
  }
  float fan = smoothstep(u_spread * 0.5 + spacing, u_spread * 0.5 - spacing * 0.3, abs(a));
  blades *= fan;

  // Haze breaks the rays into shafts along their length and scatters some
  // of their light into the air between them.
  float hz = fbm(vec2(a * 6.0, r / 70.0 - t * 0.2) + u_seed);
  float shafts = blades * mix(1.0, 0.15 + 1.75 * hz * hz, haze);
  float h = size.y;
  float reach = h * (0.35 + 1.3 * u_length);
  float fall = exp(-max(r - r0, 0.0) / reach);
  float air = exp(-max(r - r0, 0.0) / (h * 0.7)) * fan * (0.03 + 0.16 * haze) * (0.6 + 0.4 * hz);

  // The pulse: a bright front leaving the source, strongest near the press.
  float pulse = 0.0;
  if (u_pulse.x >= 0.0 && u_pulse.x < 1.0) {
    float front = r0 + u_pulse.x * h * 1.5;
    float band = (r - front) / (h * 0.14);
    float off = (a - u_pulse.y) / 0.45;
    float aim = 0.45 + 0.55 * exp(-off * off);
    pulse = exp(-band * band) * (1.0 - u_pulse.x) * aim;
  }
  float boost = 1.0 + 0.55 * u_surge;
  float glow = (shafts * fall * 0.55 + air) * u_intensity * boost + pulse * blades * 0.8 + pulse * 0.12 * fan;
  float nearSource = exp(-max(r - r0, 0.0) / (h * 0.22));
  float core = shafts * nearSource * 0.45 * u_intensity * boost + pulse * blades * 0.35;

  vec3 L = lin(u_col);
  vec3 C = lin(u_core);
  vec3 night = lin(u_bg) * 0.74 + L * 0.004;
  vec3 dusk = lin(mix(mix(u_bg, u_fg, 0.2), u_col, 0.04));
  vec3 ground = mix(night, dusk, u_light);
  // The bottom of the frame sits a shade deeper, under the light.
  ground *= 1.0 - 0.12 * smoothstep(0.35, 1.0, v_uv.y);
  vec3 dark = 1.0 - (1.0 - ground) * exp(-(L * glow + C * core));
  // In daylight the rays colour the pale ground rather than brighten it,
  vec3 day = mix(ground, L * 1.1, clamp(glow * 1.35, 0.0, 0.88));
  // and the rays still lift toward white where they are strong.
  day = 1.0 - (1.0 - day) * exp(-C * (core * 1.8 + glow * 0.6));
  vec3 col = mix(dark, day, u_light);
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
  rays: number;
  haze: number;
  origin: number;
  spread: number;
  length: number;
  intensity: number;
  sway: number;
  speed: number;
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
  /** A pulse down the rays toward (x, y); `hold` matters only under reduced motion. */
  pulse: (x: number, y: number, strength: number, hold: boolean) => void;
  letGo: () => void;
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
  let disposed = false;
  let failed = false;
  let active = false;
  const read = rgbReader();
  const colours = new Float32Array(12);
  const size = { w: 0, h: 0 };
  let light = 0;
  const sim = { t: STILL };
  const hand = {
    x: 0,
    y: 0,
    present: false,
    source: null as Source | null,
  };
  /** The source's place along the top, px, on the drift spring. */
  const source = { x: Number.NaN, v: 0 };
  const surge = { x: 0, v: 0, held: false };
  /** Seconds since the pulse left the source, and its aim. */
  const front = { age: PULSE, aim: 0 };

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

  const restX = (c: Config) => clamp(c.origin, 0, 1) * size.w;
  const sourceY = () => -size.h * 0.32;
  const sourceFor = (c: Config) => {
    const rest = restX(c);
    if (!hand.present || !c.interactive) return rest;
    return rest + (hand.x - rest) * clamp(c.pointerStrength, 0, 1);
  };
  /** A narrow box fans a little tighter, so its rays do not crowd. */
  const spreadOf = (c: Config) =>
    clamp(c.spread, 20, 170) *
    (Math.PI / 180) *
    (0.85 + 0.15 * clamp(size.w / 600, 0, 1));

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const rand = lcg(c.seed * 19 + 13);
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_light ?? null, light);
    gl.uniform1f(u.u_rays ?? null, Math.round(clamp(c.rays, 1, 24)));
    gl.uniform1f(u.u_spread ?? null, spreadOf(c));
    gl.uniform1f(u.u_length ?? null, clamp(c.length, 0, 1));
    gl.uniform1f(u.u_intensity ?? null, clamp(c.intensity, 0, 2));
    gl.uniform1f(u.u_haze ?? null, clamp(c.haze, 0, 1));
    gl.uniform1f(u.u_sway ?? null, clamp(c.sway, 0, 1));
    gl.uniform2f(u.u_seed ?? null, rand() * 9, rand() * 9);
    const names = ["u_bg", "u_fg", "u_col", "u_core"];
    for (let i = 0; i < 4; i += 1) {
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
    if (Number.isNaN(source.x)) source.x = sourceFor(c);
    program.use();
    gl.uniform1f(u.u_time ?? null, sim.t);
    gl.uniform2f(u.u_source ?? null, source.x, sourceY());
    gl.uniform1f(u.u_surge ?? null, Math.max(0, surge.x));
    gl.uniform2f(
      u.u_pulse ?? null,
      front.age < PULSE && c.motionSafe ? enterEase(front.age / PULSE) : -1,
      front.aim,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    if (front.age < PULSE) {
      front.age += dt;
      moving = true;
    }
    const want = sourceFor(c);
    if (Number.isNaN(source.x)) source.x = want;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      // The source is heavy: it follows on drift, and the crown swings.
      source.v +=
        ((DRIFT.stiffness * (want - source.x) - DRIFT.damping * source.v) /
          DRIFT.mass) *
        h;
      source.x += source.v * h;
      surge.v +=
        ((-DRIFT.stiffness * surge.x - DRIFT.damping * surge.v) / DRIFT.mass) *
        h;
      surge.x += surge.v * h;
    }
    const following = Math.abs(want - source.x) > 0.1 || Math.abs(source.v) > 1;
    if (!following) {
      source.x = want;
      source.v = 0;
    }
    const surging = Math.abs(surge.x) > 0.002 || Math.abs(surge.v) > 0.02;
    if (!surging) {
      surge.x = 0;
      surge.v = 0;
    }
    return moving || following || surging;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const calm =
      !hand.present &&
      source.v === 0 &&
      surge.x === 0 &&
      surge.v === 0 &&
      front.age >= PULSE;
    if (calm && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : false;
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: the source stands exactly where the hand puts it. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    source.x = sourceFor(c);
    source.v = 0;
    surge.x = surge.held ? 0.6 : 0;
    surge.v = 0;
    front.age = PULSE;
    sim.t = STILL;
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
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
    const first = size.w < 1;
    size.w = w;
    size.h = h;
    if (first) source.x = sourceFor(c);
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
      if (!c.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    handAway(src) {
      if (hand.source !== src) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    pulse(x, y, strength, hold) {
      const c = cfg;
      if (!c || !c.interactive) return;
      c.onPulse();
      if (!c.motionSafe) {
        // Still frames: the crown is brighter for as long as the press.
        surge.held = hold;
        place();
        draw();
        return;
      }
      // The front is aimed at the press, seen from where the source is.
      front.aim = Math.atan2(x - source.x, y - sourceY());
      front.age = 0;
      surge.v +=
        SURGE * clamp(strength, 0, 1) * (0.4 + 0.6 * c.pointerStrength);
      kick();
    },
    letGo() {
      if (!surge.held) return;
      surge.held = false;
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
      }
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
 * A background of volumetric rays fanning down from a source just above the
 * frame, through a soft haze: seeded rays of their own widths and
 * brightness, the crown turning slowly as a pendulum and every ray
 * breathing on its own period, so it never repeats. The haze drifts in ray
 * space, breaking the rays into shafts and scattering light into the air
 * between them; near the source the light burns toward white.
 *
 * The source follows the hand along the top on the drift spring, so the
 * crown swings with weight. A press on the bare background breaks the
 * light: a bright front leaves the source and runs down the rays on the
 * enter easing, strongest toward the press, while a critically damped
 * drift-spring impulse brightens the crown and thins the haze for a moment.
 * Keyboard focus on a control inside moves the source over it with a softer
 * pulse. One fullscreen WebGL2 draw at half the capped pixel ratio, 30
 * frames a second while it drifts, nothing off screen or in a hidden page.
 * Without WebGL2 a CSS still frame stands in; under reduced motion one still
 * crown is drawn and the source lands where the hand puts it.
 */
export function CrownRays({
  children,
  rays = 12,
  haze = 0.5,
  color = "var(--warn)",
  origin = 0.5,
  spread = 110,
  length = 0.7,
  intensity = 1,
  sway = 0.5,
  speed = 1,
  interactive = true,
  pointerStrength = 0.7,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onPulse,
  className,
}: CrownRaysProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "var(--foreground)",
      lightOf(color),
      coreOf(color),
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
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    colorKey: color,
    rays,
    haze,
    origin,
    spread,
    length,
    intensity,
    sway,
    speed,
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
    const listening = unlisten;
    return () => {
      listening.current?.();
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

  const letGo = () => {
    unlisten.current?.();
    engine.current?.letGo();
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
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.pulse(at.x, at.y, 1, true);
    unlisten.current?.();
    const id = event.pointerId;
    const end = (e: PointerEvent) => {
      if (e.pointerId === id) letGo();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    unlisten.current = () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      unlisten.current = null;
    };
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    letGo();
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
    engine.current?.pulse(at.x, at.y, 0.5, false);
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
        // A sideways finger moves the source on touch; an upright one scrolls.
        "group/crown-rays relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/crown-rays:opacity-0"
        style={standIn(paints, origin, spread, rays, seed)}
      />
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

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the crown as a conic fan of seeded soft rays from
 * above the frame, over a glow near the top.
 */
function standIn(
  paints: readonly string[],
  origin: number,
  spread: number,
  rays: number,
  seed: number,
): React.CSSProperties {
  const rand = lcg(seed * 3 + 1);
  const n = clamp(Math.round(rays), 1, 24);
  const fan = clamp(spread, 20, 170);
  const x = Math.round(clamp(origin, 0, 1) * 1000) / 10;
  const glow = paints[2] ?? "white";
  const ray = `color-mix(in oklab, ${glow} 34%, transparent)`;
  const stops: string[] = [];
  const step = fan / n;
  for (let i = 0; i < n; i += 1) {
    const at = Math.round((i + 0.5 + (rand() - 0.5) * 0.6) * step * 10) / 10;
    const w = Math.round(step * (0.18 + 0.2 * rand()) * 10) / 10;
    stops.push(
      `transparent ${Math.round((at - w) * 10) / 10}deg`,
      `${ray} ${at}deg`,
      `transparent ${Math.round((at + w) * 10) / 10}deg`,
    );
  }
  return {
    backgroundColor:
      "color-mix(in oklab, var(--background) 90%, var(--foreground))",
    backgroundImage: [
      `radial-gradient(ellipse 60% 70% at ${x}% -20%, color-mix(in oklab, ${glow} 30%, transparent) 0, transparent 70%)`,
      `conic-gradient(from ${Math.round(180 - fan / 2)}deg at ${x}% -30%, ${stops.join(", ")}, transparent ${fan}deg)`,
    ].join(", "),
  };
}
