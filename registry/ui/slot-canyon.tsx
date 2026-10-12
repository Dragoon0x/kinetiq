"use client";

import * as React from "react";

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
import { cn } from "@/registry/lib/utils";

export type SlotCanyonProps = {
  /** Content over the flight: a hero line, a call to action. It stays fully interactive. */
  children?: React.ReactNode;
  /** How fast you fly, 0 (hanging still) to 1 (a fast run). @default 0.35 */
  speed?: number;
  /** How wide the slot is, 0.6 (a squeeze) to 1.4 (a wider passage). @default 1 */
  width?: number;
  /** Sunlight through the crack, 0 (none) to 1 (many bright shafts). @default 0.6 */
  shafts?: number;
  /** How far the pointer steers, 0 to 1. @default 0.7 */
  steer?: number;
  /** How much the canyon banks and twists with the steer, 0 to 1. @default 0.6 */
  twist?: number;
  /** Dust hanging in the shafts, 0 to 1. @default 0.5 */
  dust?: number;
  /** How strongly the rock is banded, 0 (plain) to 1 (bold strata). @default 0.6 */
  strata?: number;
  /** The lit rock, the shade, and the sky, as CSS colours. @default sandstone pigments from the warn, danger and accent tokens */
  colors?: [string, string, string];
  /** Controlled: the flight holds where it is. */
  paused?: boolean;
  /** Initial pause when uncontrolled. @default false */
  defaultPaused?: boolean;
  /** Fires from the Space key that paused or resumed the flight. */
  onPausedChange?: (paused: boolean) => void;
  /** Seeds the canyon's course and its cracks. @default 2 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The scene's accessible name. @default "Slot canyon flight" */
  label?: string;
  /** No steering or keys. @default false */
  disabled?: boolean;
  /** Sizes the scene; it fills its parent by default. */
  className?: string;
};

const DEFAULT_COLORS: [string, string, string] = [
  "oklch(from var(--danger) 0.64 0.14 calc(h + 28))",
  "oklch(from var(--accent) 0.24 0.06 calc(h + 50))",
  "oklch(from var(--warn) 0.96 0.05 calc(h - 20))",
];
const BAND = "oklch(from var(--warn) 0.82 0.09 calc(h - 22))";
const SUN = "oklch(from var(--warn) 0.97 0.07 calc(h - 8))";

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_ro;
uniform vec3 u_cr;
uniform vec3 u_cu;
uniform vec3 u_cf;
uniform float u_width;
uniform float u_shafts;
uniform float u_dust;
uniform float u_strata;
uniform float u_seed;
uniform vec3 u_rock;
uniform vec3 u_band;
uniform vec3 u_shade;
uniform vec3 u_sky;
uniform vec3 u_sun;
uniform float u_focal;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

const float FLOOR = -1.5;
const float TOP = 3.6;

float centre(float z) { return 0.9 * sin(z * 0.3 + u_seed) + 0.5 * sin(z * 0.67 + 1.7 + u_seed * 1.3); }
// The slot winds differently near the floor and near the top.
float lean(float y, float z) { return 0.24 * sin(y * 0.7 + z * 0.33 + u_seed) + 0.1 * sin(y * 1.6 - z * 0.47); }
float opening(float z) { return smoothstep(0.38, 0.66, kx_noise(vec2(z * 0.34 + u_seed * 3.0, 3.1))); }

float halfWidth(float y, float z) {
  float h = clamp((y - FLOOR) / (TOP - FLOOR), 0.0, 1.0);
  float w = mix(0.95, 0.18, smoothstep(0.3, 1.0, h));
  // Flowing flutes carved along the walls.
  w += 0.06 * sin(y * 5.0 + z * 0.6 + 1.3 * sin(z * 0.8)) * (1.0 - h * 0.5);
  w += 0.12 * (kx_noise(vec2(z * 0.45, y * 0.9)) - 0.5);
  // Where the crack opens, the light gets in.
  w += 0.22 * opening(z) * smoothstep(0.7, 1.0, h);
  return w * u_width;
}

float map(vec3 p) {
  float x = p.x - centre(p.z) - lean(p.y, p.z);
  float walls = halfWidth(p.y, p.z) - abs(x);
  return min(walls * 0.6, p.y - FLOOR);
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.012, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

// Midday sun: it only reaches the floor of a slot when it is nearly overhead.
const vec3 L = vec3(0.07, 1.0, 0.26);

// How much sun reaches q: follow the sun's line up to the top and ask whether
// it leaves through an open stretch of the crack, and isn't walled off halfway.
float beam(vec3 q) {
  vec3 l = normalize(L);
  float k = (TOP - q.y) / l.y;
  vec3 t = q + l * k;
  float dx = abs(t.x - centre(t.z) - lean(TOP, t.z));
  float w = halfWidth(TOP - 0.05, t.z);
  float b = opening(t.z) * (1.0 - smoothstep(w * 0.15, w, dx));
  vec3 m = q + l * k * 0.5;
  b *= smoothstep(-0.05, 0.08, map(m));
  return b * step(q.y, TOP);
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 uv = vec2((v_uv.x - 0.5) * aspect, 0.5 - v_uv.y);
  vec3 rd = normalize(u_cr * uv.x + u_cu * uv.y + u_cf * u_focal);
  vec3 ro = u_ro;
  float t = 0.0;
  float hit = 0.0;
  bool sky = false;
  for (int i = 0; i < 96; i += 1) {
    vec3 p = ro + rd * t;
    if (p.y > TOP + 0.25) { sky = true; break; }
    float d = map(p);
    if (d < 0.0015 * (1.0 + t)) { hit = 1.0; break; }
    t += max(d, 0.004);
    if (t > 34.0) break;
  }
  vec3 col;
  vec3 p = ro + rd * t;
  if (sky) {
    col = u_sky * (1.05 + 0.25 * rd.y);
  } else if (hit > 0.5) {
    vec3 n = normalAt(p);
    float h = clamp((p.y - FLOOR) / (TOP - FLOOR), 0.0, 1.0);
    float warp = 0.6 * sin(p.z * 0.21 + p.y * 0.4) + 0.5 * kx_noise(vec2(p.z * 0.35, p.y * 1.5));
    float bands = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin((p.y * 3.0 + warp) * 3.14159));
    vec3 alb = mix(u_rock, u_band, bands * u_strata);
    alb *= 0.86 + 0.28 * kx_noise(vec2(p.z * 5.0, p.y * 11.0));
    if (p.y < FLOOR + 0.02) alb = mix(u_band, u_rock, 0.35) * (0.9 + 0.2 * kx_noise(p.xz * 6.0));
    // Light bounced down from the crack: warm and bright high up, deepening
    // to a violet-brown low down, and a little less under any overhang.
    float bounce = smoothstep(0.0, 1.0, h);
    float up = clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
    vec3 tint = mix(u_shade * 2.2 + 0.1, vec3(1.25, 0.98, 0.82), bounce);
    col = alb * tint * (0.34 + 0.66 * up) * (0.55 + 0.95 * pow(h, 1.2));
    col += u_sun * alb * beam(p) * max(dot(n, normalize(L)), 0.0) * 1.7 * u_shafts;
  } else {
    col = u_shade * 0.5;
  }
  float far = min(t, 20.0);
  // Far down the slot the light is warm and dim, never black.
  col = mix(col, mix(u_shade, u_rock, 0.4) * 0.8, 1.0 - exp(-far * 0.07));

  // Shafts hanging in the air, and the dust that catches them.
  float vol = 0.0;
  if (u_shafts > 0.001) {
    // Interleaved gradient noise: an even jitter, so the shafts are not grainy.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy + floor(fract(u_time * 3.0) * 7.0), vec2(0.06711056, 0.00583715))));
    float span = min(t, 18.0);
    for (int i = 0; i < 12; i += 1) {
      float s = (float(i) + jitter) / 12.0 * span;
      vec3 q = ro + rd * s;
      float b = beam(q);
      if (b > 0.002) {
        float drift = kx_noise(q.xz * 2.2 + vec2(u_time * 0.12, -u_time * 0.08));
        float glint = pow(kx_noise(q.zy * 15.0 + vec2(u_time * 0.35, 0.0)), 10.0) * 5.0 * u_dust;
        vol += b * ((0.45 + 0.55 * drift) * (0.35 + 0.65 * u_dust) + glint) * exp(-s * 0.07);
      }
    }
    vol *= span / 12.0 * 0.34 * u_shafts;
  }
  col += u_sun * vol;
  col = col / (1.0 + col * 0.18);
  col += (kx_hash(v_uv * u_res + fract(u_time)) - 0.5) / 255.0;
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/* --------------------------------- helpers -------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const seedOf = (seed: number) => (Math.round(seed) % 17) * 0.73 + 0.4;
// The same course as the shader's centre() and lean(), for the camera.
const centreAt = (z: number, s: number) =>
  0.9 * Math.sin(z * 0.3 + s) + 0.5 * Math.sin(z * 0.67 + 1.7 + s * 1.3);
const leanAt = (y: number, z: number, s: number) =>
  0.24 * Math.sin(y * 0.7 + z * 0.33 + s) + 0.1 * Math.sin(y * 1.6 - z * 0.47);

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = (d[0] ?? 0) / 255;
    out[at + 1] = (d[1] ?? 0) / 255;
    out[at + 2] = (d[2] ?? 0) / 255;
  };
}

type Config = {
  speed: number;
  width: number;
  shafts: number;
  steer: number;
  twist: number;
  dust: number;
  strata: number;
  colourKey: string;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  steerTo: (x: number, y: number, home?: boolean) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
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
  let failed = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let z = 0;
  let time = 0;
  let placed = false;
  const read = rgbReader();
  // rock, shade, sky, band, sun
  const colours = new Float32Array(15);
  // The steer, shown and aimed, each with a velocity (springs per axis).
  const steer = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, home: false };
  const ro = new Float32Array(3);
  const cr = new Float32Array(3);
  const cu = new Float32Array(3);
  const cf = new Float32Array(3);

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
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

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.tri.dispose();
    g.program.dispose();
  };

  /** The camera: on the slot's line, looking ahead along it, banked into the steer. */
  const camera = () => {
    const c = cfg;
    if (!c) return;
    const s = seedOf(c.seed);
    const w = clamp(c.width, 0.6, 1.4);
    const sx = steer.x * clamp(c.steer, 0, 1);
    const sy = steer.y * clamp(c.steer, 0, 1);
    const y = -0.5 + sy * 0.4;
    const x = centreAt(z, s) + leanAt(y, z, s) + sx * 0.3 * w;
    ro[0] = x;
    ro[1] = y;
    ro[2] = z;
    const ahead = 2.6;
    const tx = centreAt(z + ahead, s) + leanAt(y, z + ahead, s);
    let fx = tx - x + sx * 0.9;
    let fy = 1.05 + sy * 0.9;
    let fz = ahead;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // Right = up × forward, then up = forward × right.
    let rx = fz;
    let rz = -fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const ux = fy * rz;
    const uy = fz * rx - fx * rz;
    const uz = -fy * rx;
    // Bank into the turn: the steer and the slot's own curvature.
    const curve =
      centreAt(z + ahead * 2, s) - 2 * centreAt(z + ahead, s) + centreAt(z, s);
    const roll = (-sx * 0.42 - curve * 0.5) * clamp(c.twist, 0, 1);
    const cs = Math.cos(roll);
    const sn = Math.sin(roll);
    cr[0] = rx * cs + ux * sn;
    cr[1] = uy * sn;
    cr[2] = rz * cs + uz * sn;
    cu[0] = ux * cs - rx * sn;
    cu[1] = uy * cs;
    cu[2] = uz * cs - rz * sn;
    cf[0] = fx;
    cf[1] = fy;
    cf[2] = fz;
  };

  const statics = () => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost) return;
    g.program.set({
      u_res: [Math.max(1, canvas.width), Math.max(1, canvas.height)],
      u_width: clamp(c.width, 0.6, 1.4),
      u_shafts: clamp(c.shafts, 0, 1),
      u_dust: clamp(c.dust, 0, 1),
      u_strata: clamp(c.strata, 0, 1),
      u_seed: seedOf(c.seed),
      u_rock: [colours[0] ?? 0.8, colours[1] ?? 0.4, colours[2] ?? 0.3],
      u_shade: [colours[3] ?? 0.2, colours[4] ?? 0.1, colours[5] ?? 0.2],
      u_sky: [colours[6] ?? 1, colours[7] ?? 0.95, colours[8] ?? 0.9],
      u_band: [colours[9] ?? 0.9, colours[10] ?? 0.7, colours[11] ?? 0.5],
      u_sun: [colours[12] ?? 1, colours[13] ?? 0.95, colours[14] ?? 0.85],
    });
  };

  const draw = () => {
    const g = gpu;
    if (!cfg || !g || g.lost || canvas.width < 2) return;
    camera();
    const { gl, program } = g;
    const u = program.uniforms;
    gl.useProgram(program.program);
    if (u.u_time) gl.uniform1f(u.u_time, time);
    if (u.u_focal) {
      const aspect = canvas.width / Math.max(1, canvas.height);
      // A wide stage looks through a longer lens, so the slot keeps its depth.
      gl.uniform1f(u.u_focal, clamp(aspect * 0.42, 0.9, 1.45));
    }
    if (u.u_ro) gl.uniform3fv(u.u_ro, ro);
    if (u.u_cr) gl.uniform3fv(u.u_cr, cr);
    if (u.u_cu) gl.uniform3fv(u.u_cu, cu);
    if (u.u_cf) gl.uniform3fv(u.u_cf, cf);
    gl.viewport(0, 0, canvas.width, canvas.height);
    g.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const steering = () =>
    Math.abs(steer.tx - steer.x) > 0.002 ||
    Math.abs(steer.ty - steer.y) > 0.002 ||
    Math.abs(steer.vx) + Math.abs(steer.vy) > 0.004;
  const flying = () => {
    const c = cfg;
    return Boolean(c && c.motionSafe && !c.paused && c.speed > 0);
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (flying()) {
      z += dt * (0.25 + 2.6 * clamp(c.speed, 0, 1));
      time += dt;
    }
    if (steering()) {
      // Glide's constants while the hand steers; drift's when it lets go.
      const sp = steer.home ? springs.drift : springs.glide;
      const k = sp.stiffness / sp.mass;
      const d = sp.damping / sp.mass;
      const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
      for (let i = 0; i < sub; i += 1) {
        const h = dt / sub;
        steer.vx += (k * (steer.tx - steer.x) - d * steer.vx) * h;
        steer.vy += (k * (steer.ty - steer.y) - d * steer.vy) * h;
        steer.x += steer.vx * h;
        steer.y += steer.vy * h;
      }
      if (!steering()) {
        steer.x = steer.tx;
        steer.y = steer.ty;
        steer.vx = 0;
        steer.vy = 0;
      }
    }
    draw();
    if (flying() || steering()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 5; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    statics();
  };

  const resize = () => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost || root.clientWidth < 2 || root.clientHeight < 2)
      return;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    // A raymarch is per pixel: soft light loses nothing at a lower scale.
    resizeGL(g.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? 0.5 : 0.75,
    });
    statics();
    draw();
    kick();
  };

  const start = () => {
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
      if (!placed) {
        placed = true;
        // Start somewhere along the canyon where a crack is open overhead.
        z = 6 + (Math.round(next.seed) % 9) * 7.3;
        time = (Math.round(next.seed) % 5) * 3.1;
      }
      if (failed) return;
      if (!gpu) {
        if (!start()) {
          // No WebGL2: the server's still stays, and nothing retries.
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
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colourKey !== next.colourKey) readColours();
      else statics();
      draw();
      kick();
    },
    steerTo(x, y, home = false) {
      steer.tx = clamp(x, -1, 1);
      steer.ty = clamp(y, -1, 1);
      steer.home = home;
      if (!cfg?.motionSafe || failed) {
        steer.x = steer.tx;
        steer.y = steer.ty;
        steer.vx = 0;
        steer.vy = 0;
        draw();
        return;
      }
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

/** The server's frame, and the still without WebGL2: layered walls, a crack and a shaft. */
function CanyonStill({
  colors,
  uid,
}: {
  colors: [string, string, string];
  uid: string;
}) {
  const [rock, shade, sky] = colors;
  const wall = (side: 1 | -1, depth: number) => {
    const x0 = side === 1 ? 0 : 1000;
    const k = side === 1 ? 1 : -1;
    const inset = 200 + depth * 110;
    const d = [
      `M${x0} -10`,
      `C${x0 + k * (inset - 40)} 60 ${x0 + k * (inset + 30)} 160 ${x0 + k * (inset - 10)} 250`,
      `S${x0 + k * (inset + 20)} 380 ${x0 + k * (inset - 30)} 430`,
      `L${x0} 430 Z`,
    ].join(" ");
    return d;
  };
  return (
    <svg
      aria-hidden
      viewBox="0 0 1000 420"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id={`${uid}-rock`} x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0"
            style={{ stopColor: `color-mix(in oklab, ${rock} 80%, white)` }}
          />
          <stop offset="0.5" style={{ stopColor: rock }} />
          <stop
            offset="1"
            style={{ stopColor: `color-mix(in oklab, ${rock} 30%, ${shade})` }}
          />
        </linearGradient>
        <linearGradient id={`${uid}-shaft`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: sky, stopOpacity: 0.75 }} />
          <stop offset="1" style={{ stopColor: sky, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <rect
        width="1000"
        height="420"
        style={{ fill: `color-mix(in oklab, ${shade} 70%, ${rock})` }}
      />
      <path
        d="M478 -10 C494 18 524 34 502 74 C520 40 506 14 532 -10 Z"
        style={{ fill: sky }}
      />
      <path
        d="M492 0 L520 0 L640 420 L520 420 Z"
        fill={`url(#${uid}-shaft)`}
        opacity="0.45"
      />
      {[2, 1, 0].map((depth) => (
        <g key={depth} opacity={[1, 0.82, 0.64][depth]}>
          <path d={wall(1, depth)} fill={`url(#${uid}-rock)`} />
          <path d={wall(-1, depth)} fill={`url(#${uid}-rock)`} />
        </g>
      ))}
      <clipPath id={`${uid}-walls`}>
        <path d={wall(1, 2)} />
        <path d={wall(-1, 2)} />
      </clipPath>
      {Array.from({ length: 9 }, (_, i) => (
        <path
          key={i}
          clipPath={`url(#${uid}-walls)`}
          d={`M0 ${60 + i * 44} Q500 ${30 + i * 44 + (i % 2) * 30} 1000 ${66 + i * 44}`}
          fill="none"
          style={{
            stroke: `color-mix(in oklab, ${rock} 60%, white)`,
            strokeOpacity: 0.16,
          }}
          strokeWidth="5"
        />
      ))}
    </svg>
  );
}

/**
 * An endless flight down a narrow sandstone slot canyon, raymarched in one
 * WebGL2 pass. The walls are a distance field around a meandering centreline
 * whose sideways lean changes with height, so the slot winds one way at the
 * floor and another near the top and the walls curve smoothly around you;
 * flowing flutes are carved along them and the slot narrows overhead to a
 * thin crack of sky. The rock is banded with strata and glows with light
 * bounced down from the crack — warm high up, violet-brown below — and where
 * the crack opens, sun falls in slanted shafts: a short volumetric march
 * gathers the beam over a drifting dust field, so the shafts hang in the air
 * and the dust glints in them, and a shaft that reaches the floor lights it.
 *
 * The camera flies forward along the slot looking ahead down its tangent.
 * The pointer steers — sideways, and up toward the crack — on the
 * springs.glide constants, banking into the turn so the canyon twists round
 * you, and drifts home on springs.drift when the pointer leaves. Arrow keys
 * steer the same way, Home recentres and Space pauses. The loop runs only
 * while flying or steering, on screen and visible; under reduced motion it is
 * one still frame the keys can still turn.
 */
export function SlotCanyon({
  children,
  speed = 0.35,
  width = 1,
  shafts = 0.6,
  steer = 0.7,
  twist = 0.6,
  dust = 0.5,
  strata = 0.6,
  colors = DEFAULT_COLORS,
  paused,
  defaultPaused = false,
  onPausedChange,
  seed = 2,
  dpr = 2,
  label = "Slot canyon flight",
  disabled = false,
  className,
}: SlotCanyonProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [ownPaused, setOwnPaused] = React.useState(defaultPaused);
  const isPaused = paused ?? ownPaused;
  const [said, setSaid] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const keySteer = React.useRef({ x: 0, y: 0 });

  const [rock, shade, sky] = colors;
  const carried = [rock, shade, sky, BAND, SUN];
  const config: Config = {
    speed,
    width,
    shafts,
    steer,
    twist,
    dust,
    strata,
    colourKey: carried.join("|"),
    paused: isPaused,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
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
      visible.current = Boolean(entries[entries.length - 1]?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const steerFrom = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
    const y = 1 - ((clientY - r.top) / Math.max(1, r.height)) * 2;
    engine.current?.steerTo(x, y);
  };

  const togglePause = () => {
    const next = !isPaused;
    if (paused === undefined) setOwnPaused(next);
    onPausedChange?.(next);
    setSaid(next ? "Flight paused." : "Flying.");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.target !== event.currentTarget) return;
    const k = keySteer.current;
    let moved = true;
    if (event.key === "ArrowLeft") k.x = clamp(k.x - 0.25, -1, 1);
    else if (event.key === "ArrowRight") k.x = clamp(k.x + 0.25, -1, 1);
    else if (event.key === "ArrowUp") k.y = clamp(k.y + 0.25, -1, 1);
    else if (event.key === "ArrowDown") k.y = clamp(k.y - 0.25, -1, 1);
    else if (event.key === "Home") {
      k.x = 0;
      k.y = 0;
    } else moved = false;
    if (moved) {
      event.preventDefault();
      engine.current?.steerTo(k.x, k.y);
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) togglePause();
    }
  };

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="canyon flight"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => {
        if (disabled) return;
        steerFrom(event.clientX, event.clientY);
      }}
      onPointerLeave={() => {
        if (disabled) return;
        const k = keySteer.current;
        engine.current?.steerTo(k.x, k.y, true);
      }}
      className={cn(
        "group/slot-canyon relative isolate h-full w-full touch-pan-y overflow-clip rounded-3 [contain:paint] select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklab, ${shade} 70%, ${rock})` }}
    >
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/slot-canyon:opacity-0">
        <CanyonStill colors={colors} uid={uid} />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-500 group-data-live/slot-canyon:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {carried.map((c, i) => (
          <span key={i} style={{ color: c }} />
        ))}
      </span>
      <span
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: rock }}
      />
      <div className="relative z-10 size-full">{children}</div>
      <p id={hintId} className="sr-only">
        A flight down a narrow sandstone canyon lit from a crack of sky. Move
        the pointer, or use the arrow keys, to steer and look up; Home
        recentres; Space {isPaused ? "resumes" : "pauses"} the flight.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
