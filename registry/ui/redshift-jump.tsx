"use client";

import * as React from "react";

import { motion } from "motion/react";

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
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RedshiftJumpDestination = {
  /** The destination's name, shown on its card. */
  name: string;
  /** One short line under the name. */
  detail?: string;
};

export type RedshiftJumpPhase = "idle" | "charging" | "peak" | "jumping";

export type RedshiftJumpProps = {
  /** Top speed as a fraction of light's, 0.9 to 0.999: the higher, the tighter the ring. @default 0.99 */
  velocity?: number;
  /** How strongly the Doppler shift colours and dims the stars, 0 (aberration only) to 2 (vivid). @default 1 */
  shift?: number;
  /** How many stars fill the sky, 0.2 to 1. @default 0.6 */
  density?: number;
  /** Where the drive can take you, in order; the last jump wraps to the first. */
  destinations?: RedshiftJumpDestination[];
  /** Controlled destination: an index into `destinations`. */
  value?: number;
  /** Initial destination when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the jump that arrived somewhere, with the new index. */
  onValueChange?: (index: number) => void;
  /** Fires as the drive moves between idle, charging, at the peak and jumping. */
  onPhaseChange?: (phase: RedshiftJumpPhase) => void;
  /** How long a held press takes to reach top speed, ms, 600 to 4000. @default 1600 */
  charge?: number;
  /** How long the stars streak while the speed changes, 0 (points) to 1 (long trails). @default 0.6 */
  streaks?: number;
  /** How far the heading leans toward the pointer while idle, 0 to 1. @default 0.5 */
  aim?: number;
  /** Show the destination's name card over the window's lower edge. @default true */
  card?: boolean;
  /** The window's accessible name; the destination is added to it. @default "Jump drive" */
  label?: string;
  /** Play rising tones as the drive charges and jumps. Off unless asked for. @default false */
  sound?: boolean;
  /** Hold the drive: presses do nothing. @default false */
  paused?: boolean;
  /** Seeds every destination's sky. @default 11 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The window's button is disabled. @default false */
  disabled?: boolean;
  /** Sizes the window. @default "h-56 w-full" */
  className?: string;
};

export const defaultRedshiftDestinations: RedshiftJumpDestination[] = [
  { name: "Waylight Reach", detail: "4.2 light-years · Basin arm" },
  { name: "Fieldline Deep", detail: "11.8 light-years · Outer drift" },
  { name: "Coldbrook Drift", detail: "7.1 light-years · Gauge lane" },
  { name: "Basin Verge", detail: "2.6 light-years · Home shelf" },
  { name: "Fernworks Spur", detail: "19.4 light-years · Far spur" },
];

/** The sky is fixed art: deep space reads the same on any page. */
const SKY = [
  "oklch(0.2 0.04 272)",
  "oklch(0.1 0.022 268)",
  "oklch(from var(--accent-bright) 0.42 0.09 calc(h + 30))",
  "oklch(from var(--warn) 0.92 0.05 calc(h - 10))",
];

const SKY_FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec3 u_in;
uniform vec3 u_out;
uniform vec3 u_neb;
uniform vec3 u_bow;
uniform float u_beta;
uniform float u_scale;
uniform float u_shift;
uniform float u_flash;
uniform float u_flashR;
uniform float u_pulse;
uniform vec2 u_aim;
uniform float u_seed;
in vec2 v_uv;
out vec4 o_color;
${GLSL_NOISE}
void main() {
  vec2 p = v_uv * u_res;
  vec2 c = u_res * 0.5 - u_aim * u_scale;
  float r = length(p - c);
  float t = clamp(r / (0.62 * length(u_res)), 0.0, 1.0);
  vec3 col = mix(u_in, u_out, smoothstep(0.0, 1.0, t));
  // A faint nebula, the noise turned off the pixel grid so it never bands.
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p / 230.0;
  float n = kx_fbm(q + vec2(u_seed * 1.37, u_seed * 0.71));
  col += u_neb * pow(n, 3.0) * 0.4;
  float b = u_beta;
  float bow = 0.0;
  float rr = 0.0;
  if (b > 0.2) {
    float g = inversesqrt(max(1e-5, 1.0 - b * b));
    float th = acos(clamp((1.0 - 1.0 / g) / b, -1.0, 1.0));
    rr = th * u_scale;
    float w = 3.0 + 36.0 * (1.0 - b);
    bow = exp(-pow((r - rr) / w, 2.0)) * smoothstep(0.6, 0.995, b) * min(u_shift, 1.0);
    col += u_bow * bow * (0.22 + 0.12 * u_pulse);
    // Ahead the sky's own glow is blueshifted, behind it reddens.
    col += vec3(0.05, 0.09, 0.2) * smoothstep(rr, 0.0, r) * smoothstep(0.5, 0.99, b) * u_shift;
    col += vec3(0.06, 0.012, 0.01) * smoothstep(rr * 1.8, rr * 3.2, r) * smoothstep(0.5, 0.99, b) * u_shift;
  }
  // The jump: a white front leaving the ring.
  float front = rr + u_flashR * length(u_res);
  float f = u_flash * (1.0 - smoothstep(front - 40.0, front + 40.0, r));
  col = mix(col, vec3(1.0), clamp(f, 0.0, 1.0));
  o_color = vec4(col, 1.0);
}
`;

const STAR_VERTEX = /* glsl */ `
in vec2 a_corner;
in vec4 a_star;
uniform vec2 u_res;
uniform float u_beta;
uniform float u_lag;
uniform float u_shift;
uniform float u_scale;
uniform vec2 u_aim;
uniform float u_flash;
out vec3 v_col;
out vec2 v_local;
out float v_half;
out float v_r;
out float v_gain;

vec2 sky(float cosT, float phi, float beta, out float delta) {
  float ct = (cosT + beta) / (1.0 + beta * cosT);
  float theta = acos(clamp(ct, -1.0, 1.0));
  float gamma = inversesqrt(max(1e-6, 1.0 - beta * beta));
  delta = 1.0 / (gamma * (1.0 - beta * ct));
  return vec2(cos(phi), sin(phi)) * theta;
}

// A blackbody's colour by its temperature, K.
vec3 blackbody(float k) {
  float t = clamp(k, 1000.0, 40000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.2929 * pow(t - 60.0, -0.1332), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.3901 * log(t) - 0.6318, 0.0, 1.0) : clamp(1.1299 * pow(t - 60.0, -0.0755), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432 * log(t - 10.0) - 1.1963, 0.0, 1.0));
  return vec3(r, g, b);
}

void main() {
  float d1;
  float d0;
  vec2 c = u_res * 0.5;
  vec2 p1 = c + (sky(a_star.x, a_star.y, u_beta, d1) - u_aim) * u_scale;
  vec2 p0 = c + (sky(a_star.x, a_star.y, u_lag, d0) - u_aim) * u_scale;
  // A blueshifted blackbody is a hotter blackbody: colour from δT.
  float de = pow(d1, u_shift);
  float temp = a_star.w * 10000.0 * de;
  // Only light that stays in the visible band is seen: far ahead it has
  // gone ultraviolet, far behind infrared, and what is left, where the
  // Doppler factor is near one, is the ring. At rest every star is in band.
  float ld = log(max(d1, 1e-4)) * u_shift;
  float visible = exp(-ld * ld / 0.9);
  float gain = a_star.z * min(pow(de, 1.2), 3.0) * visible;
  float r = (0.7 + 1.9 * a_star.z) * (0.85 + 0.15 * min(gain, 3.0));
  vec2 dir = p1 - p0;
  float len = length(dir);
  vec2 u = len > 0.25 ? dir / len : vec2(1.0, 0.0);
  vec2 n = vec2(-u.y, u.x);
  float half_ = len * 0.5;
  vec2 mid = (p0 + p1) * 0.5;
  vec2 local = vec2(a_corner.x * (half_ + r * 2.0), a_corner.y * r * 2.0);
  vec2 pos = mid + u * local.x + n * local.y;
  gl_Position = vec4(pos / u_res * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  v_col = blackbody(temp) * (1.0 - u_flash);
  v_local = local;
  v_half = half_;
  v_r = r;
  // A streak spreads the same light along its length.
  v_gain = gain / (1.0 + half_ / max(r, 0.5) * 0.6);
}
`;

const STAR_FRAGMENT = /* glsl */ `
in vec3 v_col;
in vec2 v_local;
in float v_half;
in float v_r;
in float v_gain;
out vec4 o_color;
void main() {
  float dx = max(abs(v_local.x) - v_half, 0.0);
  float d = length(vec2(dx, v_local.y)) / max(v_r, 0.3);
  float a = exp(-d * d * 1.8) * v_gain;
  if (a < 0.002) discard;
  o_color = vec4(v_col * a, 1.0);
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const MAX_STARS = 4000;

/** A destination's sky, deterministic from its seed. */
function makeStars(seed: number, count: number, out: Float32Array) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x6a09e667) >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    out[i * 4] = rand() * 2 - 1;
    out[i * 4 + 1] = rand() * Math.PI * 2;
    out[i * 4 + 2] = 0.08 + 0.92 * Math.pow(rand(), 3.2);
    out[i * 4 + 3] = 0.3 + 0.9 * Math.pow(rand(), 1.6);
  }
}

const starCount = (density: number) =>
  Math.round(clamp(density, 0.2, 1) * MAX_STARS);
const seedFor = (seed: number, index: number) =>
  (Math.round(seed) * 7919 + index * 104729) | 0;

type Config = {
  velocity: number;
  shift: number;
  density: number;
  charge: number;
  streaks: number;
  aim: number;
  paused: boolean;
  dpr: number;
  starSeed: number;
  motionSafe: boolean;
  colorKey: string;
};

type Events = {
  phase: (p: RedshiftJumpPhase) => void;
  jump: () => void;
  tone: (pitch: number, gain: number) => void;
  speed: (beta: number) => void;
};

type Gpu = {
  gl: GLContext;
  sky: Program;
  stars: Program;
  tri: FullscreenTriangle;
  vao: WebGLVertexArrayObject;
  corners: WebGLBuffer;
  instances: WebGLBuffer;
  lost: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  ok: () => boolean;
  press: () => void;
  release: () => void;
  abort: () => void;
  autopilot: () => void;
  aim: (x: number, y: number, on: boolean) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  events: { current: Events },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let detach: () => void = () => {};
  const size = { w: 0, h: 0 };
  const colours = new Float32Array(12);
  const reader = document.createElement("canvas");
  reader.width = 1;
  reader.height = 1;
  const readCtx = reader.getContext("2d", { willReadFrequently: true });
  const data = new Float32Array(MAX_STARS * 4);
  let built = { seed: NaN, count: 0 };

  // The drive: rapidity, its recent history (for the streaks), the phase.
  let w = 0;
  let phase: RedshiftJumpPhase = "idle";
  let holding = false;
  let auto = false;
  let jumpT = 0;
  let jumpW = 0;
  let clock = 0;
  let pulse = 0;
  let crossed = false;
  const histW = new Float32Array(32);
  const histT = new Float32Array(32);
  let histHead = 0;
  const aimNow = { x: 0, y: 0 };
  const aimTo = { x: 0, y: 0 };

  const wMax = () => Math.atanh(clamp(cfg?.velocity ?? 0.99, 0.5, 0.999));
  const rate = () => wMax() / (clamp(cfg?.charge ?? 1600, 600, 4000) / 1000);

  const setPhase = (p: RedshiftJumpPhase) => {
    if (p === phase) return;
    phase = p;
    root.setAttribute("data-phase", p);
    events.current.phase(p);
  };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const sky = createProgram(gl, FULLSCREEN_VERTEX, SKY_FRAGMENT);
    const stars = createProgram(gl, STAR_VERTEX, STAR_FRAGMENT);
    if (!sky || !stars) {
      sky?.dispose();
      stars?.dispose();
      return false;
    }
    const tri = createFullscreenTriangle(gl, sky);
    const vao = gl.createVertexArray();
    const corners = gl.createBuffer();
    const instances = gl.createBuffer();
    if (!vao || !corners || !instances) return false;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const ac = stars.attributes.a_corner;
    if (ac !== undefined) {
      gl.enableVertexAttribArray(ac);
      gl.vertexAttribPointer(ac, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    const as = stars.attributes.a_star;
    if (as !== undefined) {
      gl.enableVertexAttribArray(as);
      gl.vertexAttribPointer(as, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(as, 1);
    }
    gl.bindVertexArray(null);
    gpu = { gl, sky, stars, tri, vao, corners, instances, lost: false };
    built = { seed: NaN, count: 0 };
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.tri.dispose();
    g.sky.dispose();
    g.stars.dispose();
    g.gl.deleteVertexArray(g.vao);
    g.gl.deleteBuffer(g.corners);
    g.gl.deleteBuffer(g.instances);
  };

  const upload = () => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost) return;
    const count = starCount(c.density);
    if (built.seed === c.starSeed && built.count === count) return;
    makeStars(c.starSeed, count, data);
    g.gl.bindBuffer(g.gl.ARRAY_BUFFER, g.instances);
    g.gl.bufferSubData(g.gl.ARRAY_BUFFER, 0, data, 0, count * 4);
    built = { seed: c.starSeed, count };
  };

  /** Rapidity a moment ago, for the streaks' tails. */
  const wAgo = (ago: number) => {
    let pick = w;
    for (let k = 1; k <= histW.length; k += 1) {
      const i = (histHead - k + histW.length) % histW.length;
      pick = histW[i] ?? w;
      if ((histT[i] ?? 0) <= clock - ago) break;
    }
    return pick;
  };

  const draw = () => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost || size.w < 1 || size.h < 1) return;
    upload();
    const gl = g.gl;
    const beta = Math.tanh(w);
    const lag = Math.tanh(wAgo(0.03 + 0.14 * clamp(c.streaks, 0, 1)));
    const scale = 0.42 * Math.min(size.w, 2 * size.h);
    const flashT = phase === "jumping" ? clock - jumpT : 1;
    const flash =
      phase === "jumping"
        ? flashT < 0.09
          ? flashT / 0.09
          : Math.exp(-(flashT - 0.09) / 0.12)
        : 0;
    const flashR = phase === "jumping" ? Math.min(1, flashT / 0.09) : 0;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    g.sky.set({
      u_res: [size.w, size.h],
      u_in: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_out: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
      u_neb: [colours[6] ?? 0, colours[7] ?? 0, colours[8] ?? 0],
      u_bow: [colours[9] ?? 1, colours[10] ?? 1, colours[11] ?? 1],
      u_beta: beta,
      u_scale: scale,
      u_shift: clamp(c.shift, 0, 2),
      u_flash: flash,
      u_flashR: flashR,
      u_pulse: pulse,
      u_aim: [aimNow.x, aimNow.y],
      u_seed: (Math.abs(c.starSeed) % 97) * 0.13,
    });
    g.tri.draw();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    g.stars.set({
      u_res: [size.w, size.h],
      u_beta: beta,
      u_lag: lag,
      u_shift: clamp(c.shift, 0, 2),
      u_scale: scale,
      u_aim: [aimNow.x, aimNow.y],
      u_flash: flash,
    });
    gl.bindVertexArray(g.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, built.count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    const top = wMax();
    if (phase === "jumping") {
      // Out of the jump on a critically damped curve with the glide
      // spring's natural frequency: the stars stream back to their places.
      const t = clock - jumpT - 0.09;
      if (t > 0) {
        const lambda = Math.sqrt(springs.glide.stiffness / springs.glide.mass);
        w = jumpW * (1 + lambda * t) * Math.exp(-lambda * t);
      }
      if (t > 0.65) {
        w = 0;
        setPhase("idle");
      }
    } else if (holding || auto) {
      if (phase === "idle") setPhase("charging");
      w = Math.min(top, w + rate() * dt);
      const beta = Math.tanh(w);
      if (!crossed && beta > 0.6) {
        crossed = true;
        events.current.tone(1, 0.3);
      }
      if (w >= top * 0.995) {
        if (phase !== "peak") {
          setPhase("peak");
          events.current.tone(1.28, 0.36);
        }
        pulse = 0.5 + 0.5 * Math.sin(clock * 5.2);
        if (auto && clock - jumpT > 0.35) jump();
      } else {
        if (phase !== "charging") setPhase("charging");
        jumpT = clock;
      }
    } else if (w > 0) {
      // Spinning down: twice as fast as it charged.
      w = Math.max(0, w - rate() * 2 * dt);
      pulse = 0;
      if (w === 0) setPhase("idle");
    }
    histW[histHead] = w;
    histT[histHead] = clock;
    histHead = (histHead + 1) % histW.length;
    // The heading eases on the drift spring's time scale.
    const k =
      1 -
      Math.exp(
        -dt * Math.sqrt(springs.drift.stiffness / springs.drift.mass) * 0.5,
      );
    aimNow.x += (aimTo.x - aimNow.x) * k;
    aimNow.y += (aimTo.y - aimNow.y) * k;
    events.current.speed(Math.tanh(w));
  };

  const jump = () => {
    holding = false;
    auto = false;
    crossed = false;
    jumpW = w;
    jumpT = clock;
    pulse = 0;
    setPhase("jumping");
    events.current.tone(1.6, 0.5);
    // Under the flash the sky is reseeded for the next destination.
    window.setTimeout(() => {
      if (!disposed) events.current.jump();
    }, 80);
  };

  const moving = () => {
    const c = cfg;
    if (!c || !c.motionSafe) return false;
    if (holding || auto || w > 0 || phase !== "idle") return true;
    return (
      Math.abs(aimTo.x - aimNow.x) > 1e-4 || Math.abs(aimTo.y - aimNow.y) > 1e-4
    );
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden || !gpu) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    draw();
    if (moving()) frame = window.requestAnimationFrame(tick);
    else {
      last = 0;
      events.current.speed(0);
    }
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    if (!moving()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
      const el = kids[i];
      if (!el || !readCtx) continue;
      readCtx.clearRect(0, 0, 1, 1);
      readCtx.fillStyle = "rgb(0, 0, 0)";
      readCtx.fillStyle = getComputedStyle(el).color;
      readCtx.fillRect(0, 0, 1, 1);
      const d = readCtx.getImageData(0, 0, 1, 1).data;
      colours[i * 3] = (d[0] ?? 0) / 255;
      colours[i * 3 + 1] = (d[1] ?? 0) / 255;
      colours[i * 3 + 2] = (d[2] ?? 0) / 255;
    }
  };

  const resize = () => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost) return;
    const w0 = root.clientWidth;
    const h0 = root.clientHeight;
    if (w0 < 1 || h0 < 1) return;
    size.w = w0;
    size.h = h0;
    resizeGL(g.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
    draw();
    kick();
  };

  const start = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!next.motionSafe) {
        // The chart is the reduced-motion design: the window shows it.
        holding = false;
        auto = false;
        w = 0;
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        root.removeAttribute("data-live");
        if (phase === "jumping" || phase === "charging" || phase === "peak")
          phase = "idle";
        return;
      }
      if (!gpu) {
        if (!start()) {
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
            if (!disposed && start()) kick();
          },
        );
        kick();
        return;
      }
      if (was && was.dpr !== next.dpr) resize();
      if (was && was.colorKey !== next.colorKey) readColours();
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
    ok: () => !failed && Boolean(cfg?.motionSafe),
    press() {
      const c = cfg;
      if (!c || c.paused || phase === "jumping") return;
      if (!holding) events.current.tone(0.8, 0.3);
      holding = true;
      crossed = Math.tanh(w) > 0.6;
      if (phase === "idle") setPhase("charging");
      kick();
    },
    release() {
      if (!holding) return;
      holding = false;
      // Let go at the peak and it jumps; early, and it spins down quietly.
      if (phase === "peak") jump();
      else setPhase("idle");
      kick();
    },
    abort() {
      holding = false;
      auto = false;
      if (phase === "charging" || phase === "peak") setPhase("idle");
      kick();
    },
    autopilot() {
      const c = cfg;
      if (!c || c.paused || phase === "jumping") return;
      auto = true;
      events.current.tone(0.8, 0.3);
      if (phase === "idle") setPhase("charging");
      kick();
    },
    aim(x, y, on) {
      const c = cfg;
      if (!c) return;
      const k = clamp(c.aim, 0, 1) * 0.07;
      aimTo.x = on && size.w > 0 ? (x / size.w - 0.5) * 2 * k : 0;
      aimTo.y = on && size.h > 0 ? (y / size.h - 0.5) * 2 * k * 0.6 : 0;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
      root.removeAttribute("data-live");
    },
  };
}

// ── the chart: the server's frame, the reduced-motion design, the fallback ──

const CHART_W = 760;
const CHART_H = 208;

function chartStars(seed: number, density: number) {
  const count = starCount(density);
  const raw = new Float32Array(count * 4);
  makeStars(seed, count, raw);
  const scale = 0.42 * Math.min(CHART_W, 2 * CHART_H);
  const out: { x: number; y: number; r: number; tone: 0 | 1 | 2 }[] = [];
  for (let i = 0; i < count && out.length < 240; i += 1) {
    const b = raw[i * 4 + 2] ?? 0;
    if (b < 0.16) continue;
    const theta = Math.acos(clamp(raw[i * 4] ?? 0, -1, 1));
    const phi = raw[i * 4 + 1] ?? 0;
    const x = CHART_W / 2 + Math.cos(phi) * theta * scale;
    const y = CHART_H / 2 + Math.sin(phi) * theta * scale;
    if (x < -4 || x > CHART_W + 4 || y < -4 || y > CHART_H + 4) continue;
    const t = raw[i * 4 + 3] ?? 0.5;
    out.push({
      x: r2(x),
      y: r2(y),
      r: r2(0.5 + 1.6 * b),
      tone: t > 0.75 ? 0 : t > 0.45 ? 1 : 2,
    });
  }
  return { stars: out, scale };
}

const TONES = [
  "oklch(0.9 0.05 250)",
  "oklch(0.96 0.02 95)",
  "oklch(0.86 0.08 60)",
];

/**
 * A window onto a starfield drawn with real relativistic optics. Press and
 * hold (or hold Space or Enter) and the drive's rapidity climbs at constant
 * thrust: the stars bunch toward the direction of travel by aberration and
 * shift blue, the rim thins and reddens, every star streaks by how fast it
 * crosses the sky, and near the top speed the visible sky collapses onto one
 * bright ring where the Doppler factor is one. Let go at the peak and the ring
 * flashes outward to white; under it the sky is reseeded for the next
 * destination and the speed falls away on a critically damped curve with the
 * glide spring's natural frequency, so the new stars stream back to their
 * places while the destination's card rises on springs.glide. Let go early
 * and the drive spins down; Escape aborts.
 *
 * Instanced quads, one per star, and a sky pass in WebGL2; the loop runs only
 * while the drive or the aim is moving. Under reduced motion, and without
 * WebGL2, a static star chart: holding fills a ring and a full ring jumps.
 */
export function RedshiftJump({
  velocity = 0.99,
  shift = 1,
  density = 0.6,
  destinations = defaultRedshiftDestinations,
  value,
  defaultValue = 0,
  onValueChange,
  onPhaseChange,
  charge = 1600,
  streaks = 0.6,
  aim = 0.5,
  card = true,
  label = "Jump drive",
  sound = false,
  paused = false,
  seed = 11,
  dpr = 2,
  disabled = false,
  className,
}: RedshiftJumpProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const list =
    destinations.length > 0 ? destinations : defaultRedshiftDestinations;
  const [own, setOwn] = React.useState(defaultValue);
  const index = clamp(Math.round(value ?? own), 0, list.length - 1);
  const here = list[index] ?? list[0] ?? { name: "" };
  const [phase, setPhase] = React.useState<RedshiftJumpPhase>("idle");
  const [arrivals, setArrivals] = React.useState(0);
  const [spoken, setSpoken] = React.useState("");
  const [chartHold, setChartHold] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const speedRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const lastKey = React.useRef(0);
  const chartTimer = React.useRef(0);
  const chartReady = React.useRef(false);
  const live = !disabled && !paused;

  const config: Config = {
    velocity,
    shift,
    density,
    charge,
    streaks,
    aim,
    paused,
    dpr,
    starSeed: seedFor(seed, index),
    motionSafe,
    colorKey: SKY.join("|"),
  };
  const latest = React.useRef(config);

  const advance = () => {
    const next = (index + 1) % Math.max(1, list.length);
    const name = list[next]?.name ?? "";
    if (value === undefined) setOwn(next);
    setArrivals((n) => n + 1);
    setSpoken(`Arrived at ${name}`);
    onValueChange?.(next);
  };

  const events = React.useRef<Events>({
    phase: () => {},
    jump: () => {},
    tone: () => {},
    speed: () => {},
  });

  React.useLayoutEffect(() => {
    latest.current = config;
    events.current = {
      phase: (p) => {
        setPhase(p);
        onPhaseChange?.(p);
      },
      jump: advance,
      tone: (pitch, gain) => audio.play("rise", { pitch, gain }),
      speed: (beta) => {
        const el = speedRef.current;
        if (el) el.textContent = `${beta.toFixed(3)} c`;
      },
    };
  });

  React.useEffect(() => {
    engine.current?.configure(latest.current);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, events);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      window.clearTimeout(chartTimer.current);
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
      visible.current = false;
    };
  }, []);

  const report = (p: RedshiftJumpPhase) => {
    setPhase(p);
    onPhaseChange?.(p);
  };

  // The chart's own drive: a ring that fills while held, a jump when full.
  const chartPress = () => {
    if (chartHold) return;
    setChartHold(true);
    chartReady.current = false;
    report("charging");
    audio.play("rise", { pitch: 0.8, gain: 0.3 });
    window.clearTimeout(chartTimer.current);
    chartTimer.current = window.setTimeout(
      () => {
        chartReady.current = true;
        report("peak");
        audio.play("rise", { pitch: 1.28, gain: 0.36 });
      },
      clamp(charge, 600, 4000),
    );
  };
  const chartRelease = (abort = false) => {
    if (!chartHold) return;
    window.clearTimeout(chartTimer.current);
    setChartHold(false);
    if (chartReady.current && !abort) {
      chartReady.current = false;
      audio.play("rise", { pitch: 1.6, gain: 0.5 });
      advance();
    }
    report("idle");
  };

  const chartMode = () => !(engine.current?.ok() ?? false);
  const press = () => {
    if (!live) return;
    if (chartMode()) chartPress();
    else engine.current?.press();
  };
  const release = () => {
    if (chartMode()) chartRelease();
    else engine.current?.release();
  };
  const abort = () => {
    if (chartMode()) chartRelease(true);
    else engine.current?.abort();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      lastKey.current = event.timeStamp;
      if (!event.repeat) press();
      return;
    }
    if (event.key === "Escape") {
      if (phase !== "charging" && phase !== "peak") return;
      event.preventDefault();
      abort();
    }
  };
  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    lastKey.current = event.timeStamp;
    release();
  };

  const chart = chartStars(seedFor(seed, index), density);
  const ringR = 15;
  const ringC = r2(Math.PI * 2 * ringR);
  const holdingNow = chartHold;
  const arriving = arrivals > 0;
  const kicker =
    phase === "charging" || phase === "peak"
      ? `Leaving ${here.name}`
      : arriving
        ? "Arrived"
        : "Holding at";

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/redshift-jump relative isolate h-56 w-full overflow-clip bg-[oklch(0.1_0.022_268)] select-none",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/redshift-jump:opacity-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 80% at 50% 50%, oklch(0.2 0.04 272), oklch(0.1 0.022 268))",
        }}
      >
        <g
          fill="none"
          stroke="white"
          strokeOpacity={0.08}
          strokeWidth={0.75}
          vectorEffect="non-scaling-stroke"
        >
          {[15, 30, 45, 60, 75, 90].map((deg) => (
            <circle
              key={deg}
              cx={CHART_W / 2}
              cy={CHART_H / 2}
              r={r2((deg * Math.PI * chart.scale) / 180)}
            />
          ))}
          {[0, 30, 60, 90, 120, 150].map((deg) => {
            const a = (deg * Math.PI) / 180;
            const L = 2.2 * chart.scale;
            return (
              <line
                key={deg}
                x1={r2(CHART_W / 2 - Math.cos(a) * L)}
                y1={r2(CHART_H / 2 - Math.sin(a) * L)}
                x2={r2(CHART_W / 2 + Math.cos(a) * L)}
                y2={r2(CHART_H / 2 + Math.sin(a) * L)}
              />
            );
          })}
        </g>
        <motion.g
          key={index}
          initial={arriving ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.slow, ease: easings.enter }}
        >
          {chart.stars.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              style={{ fill: TONES[s.tone] }}
            />
          ))}
        </motion.g>
        <g stroke="white" strokeOpacity={0.55} strokeWidth={1}>
          <line
            x1={CHART_W / 2 - 7}
            x2={CHART_W / 2 + 7}
            y1={CHART_H / 2}
            y2={CHART_H / 2}
          />
          <line
            x1={CHART_W / 2}
            x2={CHART_W / 2}
            y1={CHART_H / 2 - 7}
            y2={CHART_H / 2 + 7}
          />
        </g>
        <circle
          cx={CHART_W / 2}
          cy={CHART_H / 2}
          r={ringR}
          fill="none"
          stroke="white"
          strokeOpacity={0.9}
          strokeWidth={2}
          strokeDasharray={ringC}
          strokeDashoffset={holdingNow ? 0 : ringC}
          transform={`rotate(-90 ${CHART_W / 2} ${CHART_H / 2})`}
          style={{
            transitionProperty: "stroke-dashoffset",
            transitionTimingFunction: "linear",
            transitionDuration: holdingNow
              ? `${Math.round(clamp(charge, 600, 4000))}ms`
              : "0ms",
          }}
        />
        <text
          x={r2(CHART_W / 2 + (15 * Math.PI * chart.scale) / 180 + 3)}
          y={CHART_H / 2 - 3}
          fill="white"
          fillOpacity={0.35}
          fontSize={9}
          className="font-mono"
        >
          15°
        </text>
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/redshift-jump:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {SKY.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <span
        ref={speedRef}
        aria-hidden
        className="pointer-events-none absolute top-3 left-3 font-mono text-[10px] tracking-[0.08em] text-white/70 tabular-nums opacity-0 transition-opacity duration-200 group-data-[phase=charging]/redshift-jump:opacity-100 group-data-[phase=jumping]/redshift-jump:opacity-100 group-data-[phase=peak]/redshift-jump:opacity-100"
      >
        0.000 c
      </span>
      {card ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center"
        >
          <motion.div
            key={index}
            initial={
              arriving
                ? motionSafe
                  ? { opacity: 0, y: distances.step }
                  : { opacity: 0 }
                : false
            }
            animate={{
              opacity: phase === "charging" || phase === "peak" ? 0.45 : 1,
              y: 0,
            }}
            transition={{
              y: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
            className="flex max-w-full min-w-0 flex-col items-center rounded-2 bg-black/45 px-3 py-1.5 text-center backdrop-blur-sm"
          >
            <span className="font-mono text-[9px] tracking-[0.1em] text-white/60 uppercase">
              {kicker}
            </span>
            <span className="max-w-full truncate text-sm leading-tight font-semibold text-white">
              {here.name}
            </span>
            {here.detail ? (
              <span className="max-w-full truncate font-mono text-[10px] text-white/60">
                {here.detail}
              </span>
            ) : null}
          </motion.div>
        </div>
      ) : null}
      <button
        type="button"
        aria-label={`${label}, at ${here.name}`}
        aria-describedby={live ? hintId : undefined}
        disabled={disabled}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          press();
        }}
        onPointerUp={release}
        onPointerCancel={abort}
        onPointerLeave={(event) => {
          release();
          if (event.pointerType !== "touch") engine.current?.aim(0, 0, false);
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          const r = rootRef.current?.getBoundingClientRect();
          if (r)
            engine.current?.aim(
              event.clientX - r.left,
              event.clientY - r.top,
              true,
            );
        }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onClick={(event) => {
          // A click with no pointer and no key behind it is assistive
          // technology: fly the whole jump on autopilot.
          if (event.detail !== 0 || !live) return;
          if (event.timeStamp - lastKey.current < 400) return;
          if (chartMode()) {
            chartReady.current = true;
            setChartHold(true);
            window.clearTimeout(chartTimer.current);
            chartTimer.current = window.setTimeout(() => {
              chartReady.current = true;
              setChartHold(false);
              advance();
              report("idle");
            }, 300);
          } else engine.current?.autopilot();
        }}
        className={cn(
          "absolute inset-0 size-full cursor-pointer touch-pan-y rounded-[inherit] outline-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-default",
        )}
      />
      {live ? (
        <p id={hintId} className="sr-only">
          Hold Space or Enter to build speed and let go at the peak to jump;
          Escape aborts.
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {spoken}
      </p>
    </div>
  );
}
