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
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OilFilmProps = {
  /** The content on top of the film: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How thick the oil lies, 0 (a breath of film: deep, dark colour) to 1 (a thick slick: washed pearl). @default 0.45 */
  thickness?: number;
  /** How far the film is wound into spiral arms, 0 (loose clouds) to 1 (tight whorls). @default 0.5 */
  swirl?: number;
  /** How much colour the light carries, 0 (pearl and grey) to 1 (full interference colour). @default 0.7 */
  saturation?: number;
  /** How fast the film drifts and winds, 0 (still) to 2. @default 0.5 */
  speed?: number;
  /** The size of one patch of colour, px. @default 360 */
  scale?: number;
  /** A broad soft reflection of the sky across the wet surface, 0 to 1. @default 0.45 */
  sheen?: number;
  /** The wet ground under the oil. @default a dark pigment in the page's hue */
  ground?: string;
  /** A whisper of grain that also hides banding, 0 to 1. @default 0.25 */
  grain?: number;
  /** How long a stir or a touch takes to settle back into the film, ms. @default 5200 */
  settle?: number;
  /** The pointer stirs the film and a press touches it; keyboard focus inside touches it too. @default true */
  interactive?: boolean;
  /** How hard the hand stirs, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far a stir reaches and how wide a touch's ring spreads, px. @default 140 */
  radius?: number;
  /** Hold the film still; the hand still stirs and touches it. @default false */
  paused?: boolean;
  /** Seeds the film, so two puddles never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) stirring the film. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press or keyboard focus touches the film, with the point in the box's own px. */
  onTouchFilm?: (x: number, y: number) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * The ground is pigment at a fixed lightness in the page's hue, so the puddle
 * is the same puddle in either theme; the light it reflects is a pale tint of
 * the accent.
 */
const GROUND = "oklch(from var(--background) calc(0.17 + l * 0.07) 0.025 h)";
const SKY = "oklch(from var(--accent-bright) 0.95 calc(c * 0.12) h)";

/** The browser draws the canvas smaller and scales it up: the film is soft by nature. */
const RENDER_SCALE = 0.6;
const STEP = 1 / 120;
/** A touch's ring spreads on glide. */
const GLIDE = springs.glide;
/** Live vortices (in pairs) and touches. */
const VORTICES = 16;
const TOUCHES = 4;

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

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_scale;
uniform float u_time;
uniform float u_thick;
uniform float u_swirl;
uniform float u_sat;
uniform float u_sheen;
uniform float u_grain;
uniform float u_frame;
uniform vec2 u_seed;
uniform vec2 u_eye0;
uniform vec2 u_eye1;
uniform vec3 u_ground;
uniform vec3 u_sky;
uniform vec4 u_vortex[${VORTICES}];
uniform vec4 u_touch[${TOUCHES}];
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

const float PI = 3.14159265;

vec2 turn(vec2 d, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * d.x - s * d.y, s * d.x + c * d.y);
}

// The light a film of thickness d (nm) reflects, as linear RGB: two waves,
// one from the top of the oil (with a half-wave flip) and one from beneath,
// summed at nine wavelengths and weighted toward red, green and blue. The
// thinnest film cancels to black; past a micron the orders overlap and the
// colour washes out to pearl, which the coherence term models.
vec3 interference(float d) {
  vec3 acc = vec3(0.0);
  vec3 norm = vec3(0.0);
  float coherence = exp(-pow(d / 1500.0, 2.0));
  for (int i = 0; i < 9; i++) {
    float lam = 400.0 + 40.0 * float(i);
    float phase = 4.0 * PI * 1.47 * d / lam;
    float r = 0.5 - 0.48 * coherence * cos(phase);
    vec3 cmf = vec3(
      exp(-pow((lam - 600.0) / 48.0, 2.0)) + 0.25 * exp(-pow((lam - 425.0) / 26.0, 2.0)),
      exp(-pow((lam - 545.0) / 46.0, 2.0)),
      exp(-pow((lam - 452.0) / 34.0, 2.0))
    );
    acc += cmf * r;
    norm += cmf;
  }
  return acc / norm * 2.0;
}

void main() {
  vec2 px = v_uv * u_size;

  // Undo the stirs, newest first: each vortex turned the film about its
  // centre, most at the middle; here each turn is taken back to find where
  // this pixel's oil came from.
  vec2 q = px;
  for (int i = 0; i < ${VORTICES}; i++) {
    vec4 v = u_vortex[i];
    if (v.w <= 0.0 || abs(v.z) < 0.001) continue;
    vec2 d = q - v.xy;
    float a = v.z * exp(-dot(d, d) / (v.w * v.w));
    q = v.xy + turn(d, -a);
  }

  // Touches: the oil pulled back from each touch point. Inside the ring the
  // film is thinned to almost nothing; at the rim it bunches up.
  float squeeze = 1.0;
  for (int i = 0; i < ${TOUCHES}; i++) {
    vec4 t = u_touch[i];
    if (t.w <= 0.001 || t.z <= 0.5) continue;
    vec2 d = q - t.xy;
    float r = length(d);
    float ring = t.z * t.w;
    float x = r / max(ring, 1.0);
    float m = x < 1.0 ? mix(0.55, 1.18, x * x * x) : 1.0 + 0.18 * exp(-pow((x - 1.0) / 0.35, 2.0));
    squeeze *= mix(1.0, m, t.w);
    // Pulled back by the ring's width, smoothly: no seam where it ends.
    float from = r * r / (r + ring);
    q = t.xy + (r > 0.001 ? d / r : vec2(0.0)) * from;
  }

  // The film's thickness: noise warped by noise, wound about two slowly
  // wandering eyes into spiral arms.
  vec2 p = q / u_scale;
  float t = u_time;
  for (int e = 0; e < 2; e++) {
    vec2 eye = e == 0 ? u_eye0 : u_eye1;
    vec2 d = p - eye;
    float r = length(d);
    p = eye + turn(d, (e == 0 ? 1.0 : -0.8) * u_swirl * 3.2 / (1.0 + r * 2.4) + t * 0.04);
  }
  p += u_seed;
  vec2 w = vec2(
    kx_fbm(p * 0.7 + vec2(t * 0.021, -t * 0.013)),
    kx_fbm(p * 0.7 + vec2(5.2, 1.3) + vec2(-t * 0.017, t * 0.019))
  );
  p += (w - 0.5) * (0.9 + 1.6 * u_swirl);
  float f = kx_fbm(p * 1.15 + vec2(t * 0.008, 0.0));
  float h = smoothstep(0.1, 0.9, f);
  float mean = 180.0 + 720.0 * u_thick;
  float d = mean * (0.25 + 1.6 * h) * squeeze;

  vec3 film = interference(d);
  float luma = dot(film, vec3(0.2126, 0.7152, 0.0722));
  film = mix(vec3(luma), film, 0.25 + 1.05 * u_sat);
  film = max(film, 0.0);

  // Ground and film: the oil's reflection of the sky lies over the wet ground.
  vec3 col = u_ground * (1.0 - 0.25 * luma) + u_sky * film * 0.2;
  // A broad soft reflection, like a window on a wet road.
  float band = smoothstep(0.25, 0.85, kx_noise(px / (u_scale * 2.2) + u_seed * 0.3 + vec2(t * 0.01, 0.0)));
  float slant = smoothstep(-0.6, 0.6, sin((px.x * 0.6 - px.y) / (u_scale * 1.4) + 0.8));
  col += u_sky * band * slant * u_sheen * 0.1;
  col = mix(col, col * 1.08, u_sheen * 0.4);

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
  thickness: number;
  swirl: number;
  saturation: number;
  speed: number;
  scale: number;
  sheen: number;
  colorKey: string;
  grain: number;
  settle: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onTouch: (x: number, y: number) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (
    x: number,
    y: number,
    at: number,
    source: "pointer" | "focus",
  ) => void;
  handAway: (source: "pointer" | "focus") => void;
  touch: (x: number, y: number, strength: number) => void;
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
  let frames = 0;
  let restTimer = 0;
  /** Whether any stir or touch is still settling. */
  let alive = false;
  const read = rgbReader();
  /** ground, sky */
  const colours = new Float32Array(6);
  const size = { w: 0, h: 0 };
  const sim = { t: 0 };
  /** Per vortex: x, y, strength now, reach now; then its birth strength, birth reach, age (s). */
  const vortex = new Float32Array(VORTICES * 4);
  const vBirth = new Float32Array(VORTICES * 3);
  /** Newest-first upload order. */
  const vortexOut = new Float32Array(VORTICES * 4);
  let vNext = 0;
  /** Per touch: x, y, ring radius (px), amount; then ring velocity, age (s), strength. */
  const touch = new Float32Array(TOUCHES * 4);
  const tState = new Float32Array(TOUCHES * 3);
  let tNext = 0;
  const hand = {
    x: 0,
    y: 0,
    lx: 0,
    ly: 0,
    lt: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };
  const eyes = { x0: 0, y0: 0, x1: 0, y1: 0 };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const reach = (c: Config) =>
    clamp(c.radius, 24, Math.max(24, Math.min(size.w, size.h) * 0.45));

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

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform2f(u.u_size ?? null, size.w, size.h);
    gl.uniform1f(u.u_scale ?? null, clamp(c.scale, 60, 2000));
    gl.uniform1f(u.u_thick ?? null, clamp(c.thickness, 0, 1));
    gl.uniform1f(u.u_swirl ?? null, clamp(c.swirl, 0, 1));
    gl.uniform1f(u.u_sat ?? null, clamp(c.saturation, 0, 1));
    gl.uniform1f(u.u_sheen ?? null, clamp(c.sheen, 0, 1));
    gl.uniform1f(u.u_grain ?? null, clamp(c.grain, 0, 1));
    gl.uniform2f(u.u_seed ?? null, eyes.x0 * 3.1 + 2, eyes.y1 * 2.7 + 5);
    // The two eyes the arms wind round, in film units.
    const k = clamp(c.scale, 60, 2000);
    gl.uniform2f(
      u.u_eye0 ?? null,
      (eyes.x0 * size.w) / k,
      (eyes.y0 * size.h) / k,
    );
    gl.uniform2f(
      u.u_eye1 ?? null,
      (eyes.x1 * size.w) / k,
      (eyes.y1 * size.h) / k,
    );
    gl.uniform3f(
      u.u_ground ?? null,
      colours[0] ?? 0,
      colours[1] ?? 0,
      colours[2] ?? 0,
    );
    gl.uniform3f(
      u.u_sky ?? null,
      colours[3] ?? 1,
      colours[4] ?? 1,
      colours[5] ?? 1,
    );
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_time ?? null, sim.t);
    gl.uniform1f(u.u_frame ?? null, c.motionSafe ? frames % 64 : 0);
    // Newest vortex first: the most recent stir is undone first.
    for (let n = 0; n < VORTICES; n += 1) {
      const from = ((vNext - 1 - n + VORTICES * 2) % VORTICES) * 4;
      for (let k = 0; k < 4; k += 1)
        vortexOut[n * 4 + k] = vortex[from + k] ?? 0;
    }
    if (u.u_vortex) gl.uniform4fv(u.u_vortex, vortexOut);
    if (u.u_touch) gl.uniform4fv(u.u_touch, touch);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    frames += 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Ages the stirs and touches. Returns whether any is still alive. */
  const age = (dt: number, c: Config): boolean => {
    const tau = clamp(c.settle, 300, 30000) / 1000 / 3;
    const R = reach(c);
    let live = false;
    for (let i = 0; i < VORTICES; i += 1) {
      const s0 = vBirth[i * 3] ?? 0;
      if (s0 === 0) continue;
      const a = (vBirth[i * 3 + 2] ?? 0) + dt;
      vBirth[i * 3 + 2] = a;
      // A stir winds in fast and lets go slowly, spreading as it goes.
      const wind = 1 - Math.exp(-a / 0.09);
      const fade = Math.exp(-a / tau);
      const s = s0 * wind * fade;
      vortex[i * 4 + 2] = s;
      vortex[i * 4 + 3] = (vBirth[i * 3 + 1] ?? R) * (1 + 0.7 * (1 - fade));
      if (Math.abs(s) < 0.002 && a > 0.2) {
        vBirth[i * 3] = 0;
        vortex[i * 4 + 2] = 0;
        vortex[i * 4 + 3] = 0;
      } else live = true;
    }
    for (let i = 0; i < TOUCHES; i += 1) {
      const amount0 = tState[i * 3 + 2] ?? 0;
      if (amount0 === 0) continue;
      const a = (tState[i * 3 + 1] ?? 0) + dt;
      tState[i * 3 + 1] = a;
      // The ring spreads on glide; the eye heals once it has spread.
      const target = R * (1 + 0.15 * Math.min(1, a / (tau * 3)));
      let r = touch[i * 4 + 2] ?? 0;
      let v = tState[i * 3] ?? 0;
      const steps = Math.max(1, Math.ceil(dt / STEP));
      const h = dt / steps;
      for (let k = 0; k < steps; k += 1) {
        v +=
          ((GLIDE.stiffness * (target - r) - GLIDE.damping * v) / GLIDE.mass) *
          h;
        r += v * h;
      }
      touch[i * 4 + 2] = r;
      tState[i * 3] = v;
      const heal = Math.exp(-Math.max(0, a - 0.45) / tau);
      touch[i * 4 + 3] = amount0 * heal;
      if (amount0 * heal < 0.004) {
        tState[i * 3 + 2] = 0;
        touch[i * 4 + 3] = 0;
        touch[i * 4 + 2] = 0;
      } else live = true;
    }
    return live;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const drifting = !c.paused && c.speed > 0;
    const busy = active || alive;
    // Drifting alone, the film moves slowly enough for thirty frames a second.
    if (!busy && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    let moving = false;
    if (c.motionSafe) {
      if (drifting) {
        sim.t += dt * clamp(c.speed, 0, 2) * 0.6;
        moving = true;
      }
      alive = age(dt, c);
      if (alive) moving = true;
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

  const clearAll = () => {
    alive = false;
    vBirth.fill(0);
    vortex.fill(0);
    tState.fill(0);
    touch.fill(0);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 2; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
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

  const placeAt = (c: Config) => {
    const rand = lcg(c.seed * 13 + 1);
    eyes.x0 = 0.15 + rand() * 0.3;
    eyes.y0 = 0.2 + rand() * 0.6;
    eyes.x1 = 0.55 + rand() * 0.3;
    eyes.y1 = 0.2 + rand() * 0.6;
    sim.t = 4 + rand() * 40;
  };

  const startGpu = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  /** A vortex pair beside the path, spinning so the oil between goes with the hand. */
  const stir = (x: number, y: number, vx: number, vy: number, c: Config) => {
    const speed = Math.hypot(vx, vy);
    if (speed < 40) return;
    const R = reach(c);
    const ux = vx / speed;
    const uy = vy / speed;
    const nx = -uy;
    const ny = ux;
    const strength =
      Math.min(1, speed / 1600) * 1.5 * clamp(c.pointerStrength, 0, 1);
    for (const side of [1, -1]) {
      const i = vNext;
      vNext = (vNext + 1) % VORTICES;
      vortex[i * 4] = x + nx * R * 0.42 * side;
      vortex[i * 4 + 1] = y + ny * R * 0.42 * side;
      vortex[i * 4 + 2] = 0;
      vortex[i * 4 + 3] = R * 0.55;
      vBirth[i * 3] = strength * side;
      vBirth[i * 3 + 1] = R * 0.55;
      vBirth[i * 3 + 2] = 0;
    }
    alive = true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!was || was.seed !== next.seed) placeAt(next);
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS film stays, and nothing retries.
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
        draw();
        kick();
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
      if (was.motionSafe && !next.motionSafe) clearAll();
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
    handTo(x, y, at, source) {
      const c = cfg;
      if (!c) return;
      const fresh = !hand.present || hand.source !== source;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (fresh) {
        hand.lx = x;
        hand.ly = y;
        hand.lt = at;
        return;
      }
      if (!c.motionSafe) return;
      // A stamp every third of a reach of travel, carrying the hand's speed.
      const dx = x - hand.lx;
      const dy = y - hand.ly;
      const d = Math.hypot(dx, dy);
      if (d < reach(c) * 0.3) return;
      const dt = Math.max(8, at - hand.lt) / 1000;
      stir(x - dx / 2, y - dy / 2, dx / dt, dy / dt, c);
      hand.lx = x;
      hand.ly = y;
      hand.lt = at;
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      kick();
    },
    touch(x, y, strength) {
      const c = cfg;
      if (!c) return;
      c.onTouch(Math.round(x), Math.round(y));
      const i = tNext;
      tNext = (tNext + 1) % TOUCHES;
      touch[i * 4] = x;
      touch[i * 4 + 1] = y;
      if (c.motionSafe) {
        touch[i * 4 + 2] = 1;
        touch[i * 4 + 3] = strength;
        tState[i * 3] = 0;
        tState[i * 3 + 1] = 0;
        tState[i * 3 + 2] = strength;
        alive = true;
        kick();
        return;
      }
      // Reduced motion: the finished ring as one still, then one swap back.
      touch[i * 4 + 2] = reach(c);
      touch[i * 4 + 3] = strength;
      tState[i * 3 + 2] = 0;
      draw();
      window.clearTimeout(restTimer);
      restTimer = window.setTimeout(
        () => {
          touch.fill(0);
          draw();
        },
        clamp(c.settle, 300, 30000),
      );
    },
    dispose() {
      disposed = true;
      window.clearTimeout(restTimer);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };
}

/**
 * A background of oil floating on a dark wet ground, its colour computed from
 * physics, with the content on top in its own layer. A WebGL2 shader builds
 * the film's thickness from noise warped by noise and wound into spiral arms,
 * then turns thickness into colour by thin-film interference — the two
 * reflections summed across nine wavelengths — so the colours fall in the
 * true order of a puddle: black where the film is thinnest, then deep blue,
 * magenta and gold, washing out to pearl where it lies thick.
 *
 * The pointer stirs it: every stretch of travel stamps a vortex pair beside
 * the path, so the oil is carried along the stroke and curls into spirals
 * that spread and soften over `settle`. A press touches the film like a drop
 * of solvent: the oil pulls back from the point in a ring that spreads on
 * glide, the colours racing outward round a dark eye that slowly heals.
 * Keyboard focus on a control inside touches the film behind it. Thirty
 * frames a second while it only drifts; only on screen in a visible page.
 * Without WebGL2 a CSS still of the puddle stands in, and under reduced motion
 * one still frame is drawn and a touch shows its finished ring.
 */
export function OilFilm({
  children,
  thickness = 0.45,
  swirl = 0.5,
  saturation = 0.7,
  speed = 0.5,
  scale = 360,
  sheen = 0.45,
  ground,
  grain = 0.25,
  settle = 5200,
  interactive = true,
  pointerStrength = 0.6,
  radius = 140,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onTouchFilm,
  className,
}: OilFilmProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(() => [ground ?? GROUND, SKY], [ground]);
  const colorKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onTouchFilm });

  const config: Config = {
    thickness,
    swirl,
    saturation,
    speed,
    scale,
    sheen,
    colorKey,
    grain,
    settle,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onTouch: (x, y) => report.current.onTouchFilm?.(x, y),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onTouchFilm };
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

  // Size and sighting, bound to the node when it arrives.
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
    engine.current?.handTo(at.x, at.y, event.timeStamp, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, event.timeStamp, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A press on a control is the control's; only the bare film is touched.
    if (!hit || !rootRef.current?.contains(hit))
      engine.current?.touch(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside touches the film behind it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, event.timeStamp, "focus");
    engine.current?.touch(at.x, at.y, 0.7);
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
        // A sideways finger stirs the film; an upright swipe scrolls the page.
        "group/oil-film relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/oil-film:opacity-0"
        style={standIn(paints[0] ?? GROUND, seed)}
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

/** Interference colours as pigments, for the still frame. */
const POOLS = [
  "oklch(0.78 0.12 85)",
  "oklch(0.55 0.17 330)",
  "oklch(0.5 0.14 255)",
  "oklch(0.74 0.1 165)",
];

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the dark ground with seeded pools of interference
 * colour lying in it.
 */
function standIn(ground: string, seed: number): React.CSSProperties {
  const rand = lcg(seed * 7 + 5);
  const at = () =>
    `${Math.round(8 + rand() * 84)}% ${Math.round(10 + rand() * 80)}%`;
  const pools = POOLS.map(
    (c) =>
      `radial-gradient(ellipse ${Math.round(26 + rand() * 20)}% ${Math.round(40 + rand() * 30)}% at ${at()}, color-mix(in oklab, ${c} 38%, transparent), transparent 72%)`,
  );
  return { backgroundColor: ground, backgroundImage: pools.join(", ") };
}
