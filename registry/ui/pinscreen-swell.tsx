"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFramebuffer,
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  type Framebuffer,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PinscreenSwellProps = {
  /** Distance between pins, CSS px, 5 to 16. @default 9 */
  pitch?: number;
  /** How far the pins travel: the strength of the relief, 0 to 1. @default 0.6 */
  depth?: number;
  /** Where the light comes from, degrees clockwise from the top: 315 is the upper left. @default 315 */
  light?: number;
  /** How high the swell rolling underneath lifts the pins, 0 (flat) to 1. @default 0.5 */
  waves?: number;
  /** How fast the swell rolls, 0 to 1. @default 0.4 */
  speed?: number;
  /** The size of the swell's waves, 0.5 (choppy) to 2 (long). @default 1 */
  scale?: number;
  /** The radius of the impression a pressed pointer leaves, in pins, 1 to 6. @default 2.5 */
  brush?: number;
  /** The radius of the dent a click pushes in, in pins, 2 to 12. @default 6 */
  dent?: number;
  /** Seconds for an impression to relax back, 0.5 to 10. @default 3 */
  relax?: number;
  /** The pins' steel; any CSS colour. @default a steel pigment */
  pinColor?: string;
  /** The face plate's colour; any CSS colour. @default a dark plate pigment */
  plateColor?: string;
  /** Pressing, clicking and keys leave impressions. @default true */
  interactive?: boolean;
  /** Fires when a click or key pushes in a dent, with its pin column and row. */
  onDent?: (col: number, row: number) => void;
  /** The pin screen's accessible name. @default "Pin screen" */
  label?: string;
  /** Hold the swell still; impressions still relax. @default false */
  paused?: boolean;
  /** Seeds the swell. @default 1 */
  seed?: number;
  /** Cap on the canvas's pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Classes for the root; give it a height. */
  className?: string;
};

const PIN = "oklch(0.82 0.012 250)";
const PLATE = "oklch(0.25 0.012 250)";
const MAX_DENTS = 10;
/** Waves only need thirty frames a second; a hand gets every frame. */
const CALM_FRAME = 31;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const HEIGHT_FRAGMENT = `
uniform vec2 u_grid;
uniform float u_time;
uniform float u_waves;
uniform float u_scale;
uniform float u_seed;
uniform sampler2D u_imp;
out vec4 outColor;

${GLSL_NOISE}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 c = vec2(cell);
  vec2 q = c / (11.0 * u_scale);
  // A long swell bent by noise, and two slow noise fields crossing it.
  float swell = sin(dot(c, vec2(0.12, 0.05)) / u_scale - u_time * 0.9 + kx_noise(q * 0.7 + u_seed) * 2.6);
  float n1 = kx_noise(q + vec2(u_time * 0.32, u_time * 0.1) + u_seed) * 2.0 - 1.0;
  float n2 = kx_noise(q * 1.9 - vec2(u_time * 0.2, -u_time * 0.27) + 17.0 + u_seed) * 2.0 - 1.0;
  float h = u_waves * (0.5 * swell + 0.4 * n1 + 0.22 * n2) * 1.1;
  h += texelFetch(u_imp, cell, 0).r;
  outColor = vec4(clamp(h * 0.5 + 0.5, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

const SHADE_FRAGMENT = `
uniform vec2 u_size;
uniform float u_dpr;
uniform float u_pitch;
uniform vec2 u_origin;
uniform vec2 u_grid;
uniform float u_depth;
uniform vec2 u_light;
uniform vec3 u_pin;
uniform vec3 u_plate;
uniform sampler2D u_height;
out vec4 outColor;

${GLSL_SRGB}

float heightAt(ivec2 c) {
  ivec2 g = ivec2(u_grid) - 1;
  return texelFetch(u_height, clamp(c, ivec2(0), g), 0).r * 2.0 - 1.0;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y) / u_dpr;
  vec2 g = (p - u_origin) / u_pitch;
  ivec2 cell = ivec2(floor(g));
  vec2 local = fract(g) - 0.5;
  bool inside = cell.x >= 0 && cell.y >= 0 && float(cell.x) < u_grid.x && float(cell.y) < u_grid.y;
  float h = inside ? heightAt(cell) * u_depth : 0.0;

  vec3 L = normalize(vec3(u_light * 0.77, 0.64));
  vec3 pin = kx_srgbToLinear(u_pin);
  vec3 plate = kx_srgbToLinear(u_plate);

  // The relief: each pin's tilt from its neighbours' heights.
  float gx = heightAt(cell + ivec2(1, 0)) - heightAt(cell - ivec2(1, 0));
  float gy = heightAt(cell + ivec2(0, 1)) - heightAt(cell - ivec2(0, 1));
  vec2 slope = vec2(gx, gy) * u_depth * 4.2;

  // A pushed-forward pin is nearer, so it reads a touch larger.
  float rad = 0.36 * (1.0 + 0.24 * h);
  vec2 dl = local / rad;
  float d = length(dl);
  float edge = 1.2 / (rad * u_pitch * u_dpr);
  float head = inside ? 1.0 - smoothstep(1.0 - edge, 1.0 + edge, d) : 0.0;
  float z = sqrt(max(0.0, 1.0 - min(d * d, 1.0)));
  vec3 n = normalize(vec3(dl * 1.05 - slope, z + 0.08));

  // Pins pushed back sit deep in their holes; a raised neighbour toward
  // the light throws a short shadow across them.
  float occlusion = mix(0.2, 1.08, smoothstep(-0.8, 0.5, h));
  ivec2 toward = cell + ivec2(round(u_light.x), round(u_light.y));
  float shade = 1.0 - 0.5 * clamp((heightAt(toward) * u_depth - h) * 2.4, 0.0, 1.0);

  float diffuse = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 52.0);
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float sky = smoothstep(0.1, 0.9, -r.y) * 0.3 + 0.06;
  vec3 steel = pin * (0.1 + 0.85 * diffuse * shade) * occlusion + pin * sky * occlusion + vec3(spec * 0.9 * shade);

  // The plate: dark holes round each pin, their far wall catching light.
  float hole = smoothstep(1.0, 1.32, d);
  float lip = max(dot(-normalize(local + 1e-4), u_light), 0.0) * (1.0 - smoothstep(1.0, 1.5, d)) * 0.25;
  vec3 face = plate * (mix(0.25, 1.0, hole) + lip) * (0.9 + 0.1 * dot(L, vec3(0.0, 0.0, 1.0)));

  vec3 col = mix(face, steel, head);
  outColor = vec4(kx_linearToSrgb(clamp(col, 0.0, 1.0)), 1.0);
}
`;

type Config = {
  pitch: number;
  depth: number;
  light: number;
  waves: number;
  speed: number;
  scale: number;
  brush: number;
  dent: number;
  relax: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Gpu = {
  gl: GLContext;
  heights: Program;
  shade: Program;
  triH: FullscreenTriangle;
  triS: FullscreenTriangle;
  fbo: Framebuffer | null;
  imp: WebGLTexture | null;
  lost: boolean;
};

type Dent = {
  col: number;
  row: number;
  r: number;
  x: number;
  v: number;
  age: number;
  live: boolean;
};

type Engine = {
  configure: (next: Config) => void;
  readColours: () => void;
  resize: () => void;
  seen: (inView: boolean) => void;
  wake: () => void;
  hover: (x: number, y: number) => void;
  leave: () => void;
  press: (x: number, y: number) => void;
  pressTo: (x: number, y: number) => void;
  lift: () => void;
  dentAt: (x: number, y: number) => [number, number];
  cursor: (dx: number, dy: number, pressing: boolean) => void;
  cursorDent: () => [number, number];
  showCursor: (on: boolean) => void;
  dispose: () => void;
};

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
  ring: HTMLDivElement,
  carriers: { pin: HTMLElement; plate: HTMLElement },
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let busyUntil = 0;
  const read = colourReader();
  let pin: [number, number, number] = [0.8, 0.8, 0.8];
  let plate: [number, number, number] = [0.2, 0.2, 0.2];

  const grid = { cols: 0, rows: 0, ox: 0, oy: 0, w: 0, h: 0, ratio: 1 };
  let trail = new Float32Array(0);
  let scratch = new Float32Array(0);
  let total = new Float32Array(0);
  let trailLive = false;
  let time = 3.7;
  const dents: Dent[] = Array.from({ length: MAX_DENTS }, () => ({
    col: 0,
    row: 0,
    r: 0,
    x: 0,
    v: 0,
    age: 0,
    live: false,
  }));
  let nextDent = 0;
  const touch = { x: 0, y: 0, tx: 0, ty: 0, amt: 0, target: 0 };
  let pressing = false;
  let pressAt = { x: 0, y: 0 };
  const cur = { x: 0, y: 0, shown: false };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) return false;
    const heights = createProgram(gl, FULLSCREEN_VERTEX, HEIGHT_FRAGMENT);
    const shade = createProgram(gl, FULLSCREEN_VERTEX, SHADE_FRAGMENT);
    if (!heights || !shade) {
      heights?.dispose();
      shade?.dispose();
      return false;
    }
    gpu = {
      gl,
      heights,
      shade,
      triH: createFullscreenTriangle(gl, heights),
      triS: createFullscreenTriangle(gl, shade),
      fbo: null,
      imp: null,
      lost: false,
    };
    return true;
  };

  const freeGrid = () => {
    const g = gpu;
    if (!g || g.lost) return;
    g.fbo?.dispose();
    g.fbo = null;
    if (g.imp) g.gl.deleteTexture(g.imp);
    g.imp = null;
  };

  const release = () => {
    const g = gpu;
    if (!g) return;
    freeGrid();
    gpu = null;
    if (g.lost) return;
    g.triH.dispose();
    g.triS.dispose();
    g.heights.dispose();
    g.shade.dispose();
  };

  /** A grid's worth of GPU storage: the height target and the impression map. */
  const allocate = () => {
    const g = gpu;
    if (!g || g.lost || grid.cols < 1 || grid.rows < 1) return;
    freeGrid();
    const { gl } = g;
    g.fbo = createFramebuffer(gl, grid.cols, grid.rows, true);
    const tex = gl.createTexture();
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      grid.cols,
      grid.rows,
      0,
      gl.RED,
      gl.FLOAT,
      total,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    g.imp = tex;
  };

  const profile = (d: number, r: number) =>
    d >= r ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / r);

  /** The press: pins under the brush pushed in, never deeper than the press. */
  const stamp = (x: number, y: number, c: Config) => {
    const p = clamp(c.pitch, 5, 16);
    const col = (x - grid.ox) / p - 0.5;
    const row = (y - grid.oy) / p - 0.5;
    const r = clamp(c.brush, 1, 6);
    const c0 = Math.max(0, Math.floor(col - r));
    const c1 = Math.min(grid.cols - 1, Math.ceil(col + r));
    const r0 = Math.max(0, Math.floor(row - r));
    const r1 = Math.min(grid.rows - 1, Math.ceil(row + r));
    for (let j = r0; j <= r1; j += 1) {
      for (let i = c0; i <= c1; i += 1) {
        const f = profile(Math.hypot(i - col, j - row), r);
        if (f <= 0) continue;
        const k = j * grid.cols + i;
        trail[k] = Math.min(trail[k] ?? 0, -0.72 * f);
      }
    }
    trailLive = true;
  };

  const stampLine = (x0: number, y0: number, x1: number, y1: number) => {
    const c = cfg;
    if (!c) return;
    const p = clamp(c.pitch, 5, 16);
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (p * 0.5)));
    for (let i = 1; i <= n; i += 1) {
      stamp(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
    }
  };

  const addDent = (x: number, y: number): [number, number] => {
    const c = cfg;
    if (!c) return [0, 0];
    const p = clamp(c.pitch, 5, 16);
    const col = (x - grid.ox) / p - 0.5;
    const row = (y - grid.oy) / p - 0.5;
    const d = dents[nextDent];
    nextDent = (nextDent + 1) % MAX_DENTS;
    if (d) {
      d.col = col;
      d.row = row;
      d.r = clamp(c.dent, 2, 12);
      d.x = c.motionSafe ? 0 : 1;
      d.v = 0;
      d.age = 0;
      d.live = true;
    }
    busyUntil = performance.now() + 900;
    kick();
    return [
      Math.round(clamp(col, 0, grid.cols - 1)) + 1,
      Math.round(clamp(row, 0, grid.rows - 1)) + 1,
    ];
  };

  /** Advances the impressions; returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (c.motionSafe && !c.paused && c.waves > 0) {
      time += dt * (0.25 + 1.6 * clamp(c.speed, 0, 1));
      moving = true;
    }
    const n = grid.cols * grid.rows;
    // The trail relaxes and softens: a decay and a light diffusion.
    if (trailLive) {
      const keep = Math.exp(-dt / clamp(c.relax, 0.5, 10));
      const blur = Math.min(1, dt * 4) * 0.22;
      let peak = 0;
      for (let j = 0; j < grid.rows; j += 1) {
        for (let i = 0; i < grid.cols; i += 1) {
          const k = j * grid.cols + i;
          const v = trail[k] ?? 0;
          const l = i > 0 ? (trail[k - 1] ?? 0) : v;
          const r = i < grid.cols - 1 ? (trail[k + 1] ?? 0) : v;
          const u = j > 0 ? (trail[k - grid.cols] ?? 0) : v;
          const d = j < grid.rows - 1 ? (trail[k + grid.cols] ?? 0) : v;
          const next = (v + blur * ((l + r + u + d) / 4 - v)) * keep;
          scratch[k] = next;
          peak = Math.max(peak, Math.abs(next));
        }
      }
      const swap = trail;
      trail = scratch;
      scratch = swap;
      if (peak < 0.003 && !pressing) {
        trail.fill(0);
        trailLive = false;
      } else moving = true;
    }
    if (trail.length === n) total.set(trail);
    // The gentle touch under a hovering pointer, eased after it.
    touch.amt += (touch.target - touch.amt) * (1 - Math.exp(-dt * 10));
    touch.x += (touch.tx - touch.x) * (1 - Math.exp(-dt * 18));
    touch.y += (touch.ty - touch.y) * (1 - Math.exp(-dt * 18));
    if (
      Math.abs(touch.target - touch.amt) > 0.002 ||
      Math.hypot(touch.tx - touch.x, touch.ty - touch.y) > 0.2
    ) {
      moving = true;
    } else touch.amt = touch.target;
    const p = clamp(c.pitch, 5, 16);
    if (touch.amt > 0.002) {
      const col = (touch.x - grid.ox) / p - 0.5;
      const row = (touch.y - grid.oy) / p - 0.5;
      const r = clamp(c.brush, 1, 6) * 1.2;
      const c0 = Math.max(0, Math.floor(col - r));
      const c1 = Math.min(grid.cols - 1, Math.ceil(col + r));
      const r0 = Math.max(0, Math.floor(row - r));
      const r1 = Math.min(grid.rows - 1, Math.ceil(row + r));
      for (let j = r0; j <= r1; j += 1) {
        for (let i = c0; i <= c1; i += 1) {
          const k = j * grid.cols + i;
          const f = profile(Math.hypot(i - col, j - row), r);
          total[k] = Math.min(total[k] ?? 0, -0.24 * touch.amt * f);
        }
      }
    }
    // The dents: pushed in on the recoil spring, then relaxing away.
    const R = springs.recoil;
    for (const d of dents) {
      if (!d.live) continue;
      d.age += dt;
      if (c.motionSafe) {
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let s = 0; s < steps; s += 1) {
          d.v += ((-R.stiffness * (d.x - 1) - R.damping * d.v) / R.mass) * h;
          d.x += d.v * h;
        }
      } else d.x = 1;
      const fade = Math.exp(
        -Math.max(0, d.age - 0.35) / clamp(c.relax, 0.5, 10),
      );
      if (fade < 0.004) {
        d.live = false;
        continue;
      }
      moving = true;
      const amp = d.x * fade;
      const reach = d.r * 1.45;
      const c0 = Math.max(0, Math.floor(d.col - reach));
      const c1 = Math.min(grid.cols - 1, Math.ceil(d.col + reach));
      const r0 = Math.max(0, Math.floor(d.row - reach));
      const r1 = Math.min(grid.rows - 1, Math.ceil(d.row + reach));
      for (let j = r0; j <= r1; j += 1) {
        for (let i = c0; i <= c1; i += 1) {
          const k = j * grid.cols + i;
          const dist = Math.hypot(i - d.col, j - d.row);
          // A deep round dent with a faint ring of pins risen round it.
          const bowl = -1.05 * profile(dist, d.r);
          const rim =
            0.16 * Math.exp(-(((dist - d.r * 1.05) / (d.r * 0.3)) ** 2));
          total[k] = (total[k] ?? 0) + amp * (bowl + rim);
        }
      }
    }
    return moving;
  };

  const draw = () => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost || !g.fbo || !g.imp || grid.cols < 1) return;
    const { gl } = g;
    gl.bindTexture(gl.TEXTURE_2D, g.imp);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      grid.cols,
      grid.rows,
      gl.RED,
      gl.FLOAT,
      total,
    );
    g.fbo.bind();
    g.heights.set({
      u_grid: [grid.cols, grid.rows],
      u_time: time,
      u_waves: clamp(c.waves, 0, 1),
      u_scale: clamp(c.scale, 0.5, 2),
      u_seed: (c.seed % 53) * 1.37,
    });
    g.heights.texture("u_imp", g.imp, 0);
    g.triH.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const a = (c.light * Math.PI) / 180;
    g.shade.set({
      u_size: [canvas.width, canvas.height],
      u_dpr: grid.ratio,
      u_pitch: clamp(c.pitch, 5, 16),
      u_origin: [grid.ox, grid.oy],
      u_grid: [grid.cols, grid.rows],
      u_depth: clamp(c.depth, 0, 1),
      u_light: [Math.sin(a), -Math.cos(a)],
      u_pin: pin,
      u_plate: plate,
    });
    g.shade.texture("u_height", g.fbo.texture, 0);
    g.triS.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden || !gpu) {
      last = 0;
      return;
    }
    const busy = pressing || now < busyUntil;
    if (!busy && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = step(dt);
    draw();
    if (moving || pressing) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  function kick() {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  }

  const readColours = () => {
    pin = read(getComputedStyle(carriers.pin).color);
    plate = read(getComputedStyle(carriers.plate).color);
  };

  const placeRing = () => {
    const c = cfg;
    const size = c ? clamp(c.dent, 2, 12) * clamp(c.pitch, 5, 16) * 2 : 40;
    ring.style.width = `${Math.round(size)}px`;
    ring.style.height = `${Math.round(size)}px`;
    ring.style.transform = `translate(${Math.round(cur.x - size / 2)}px, ${Math.round(cur.y - size / 2)}px)`;
    ring.style.opacity = cur.shown ? "1" : "0";
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const p = clamp(c.pitch, 5, 16);
    const cols = Math.max(1, Math.floor(w / p));
    const rows = Math.max(1, Math.floor(h / p));
    if (cols !== grid.cols || rows !== grid.rows) {
      grid.cols = cols;
      grid.rows = rows;
      trail = new Float32Array(cols * rows);
      scratch = new Float32Array(cols * rows);
      total = new Float32Array(cols * rows);
      trailLive = false;
      for (const d of dents) d.live = false;
      allocate();
    }
    grid.w = w;
    grid.h = h;
    grid.ox = (w - cols * p) / 2;
    grid.oy = (h - rows * p) / 2;
    if (!cur.shown) {
      cur.x = w / 2;
      cur.y = h / 2;
    }
    cur.x = clamp(cur.x, 0, w);
    cur.y = clamp(cur.y, 0, h);
    placeRing();
    const g = gpu;
    if (g && !g.lost) {
      grid.ratio = resizeGL(g.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) }).dpr;
    }
    step(0);
    draw();
    kick();
  };

  const startGpu = (): boolean => {
    if (!build()) return false;
    readColours();
    grid.cols = 0;
    resize();
    return true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!was) {
        if (!startGpu()) {
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
            if (!disposed && startGpu()) kick();
          },
        );
        return;
      }
      if (was.pitch !== next.pitch || was.dpr !== next.dpr) resize();
      if (!next.motionSafe) time = 3.7;
      placeRing();
      step(0);
      draw();
      kick();
    },
    readColours() {
      readColours();
      draw();
    },
    resize,
    seen(inView) {
      if (inView) {
        draw();
        kick();
      }
    },
    wake() {
      draw();
      kick();
    },
    hover(x, y) {
      touch.tx = x;
      touch.ty = y;
      if (touch.target === 0) {
        touch.x = x;
        touch.y = y;
      }
      touch.target = 1;
      kick();
    },
    leave() {
      touch.target = 0;
      kick();
    },
    press(x, y) {
      const c = cfg;
      if (!c) return;
      pressing = true;
      pressAt = { x, y };
      touch.target = 0;
      stamp(x, y, c);
      kick();
    },
    pressTo(x, y) {
      if (!pressing) return;
      stampLine(pressAt.x, pressAt.y, x, y);
      pressAt = { x, y };
      kick();
    },
    lift() {
      pressing = false;
      busyUntil = performance.now() + 400;
      kick();
    },
    dentAt: (x, y) => addDent(x, y),
    cursor(dx, dy, press) {
      const c = cfg;
      if (!c) return;
      const p = clamp(c.pitch, 5, 16) * 2;
      const x0 = cur.x;
      const y0 = cur.y;
      cur.x = clamp(cur.x + dx * p, 0, grid.w);
      cur.y = clamp(cur.y + dy * p, 0, grid.h);
      cur.shown = true;
      placeRing();
      if (press) {
        stampLine(x0, y0, cur.x, cur.y);
        busyUntil = performance.now() + 400;
      }
      kick();
    },
    cursorDent: () => addDent(cur.x, cur.y),
    showCursor(on) {
      cur.shown = on;
      placeRing();
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
 * A pin-art toy seen face-on: a dense grid of steel pin heads in a dark face
 * plate, each shaded by how far it is pushed through, while soft swells roll
 * underneath so the field reads as a slowly rippling relief. Pressing with
 * the pointer leaves an impression of your path that relaxes and softens
 * over `relax` seconds; a click pushes in a deep round dent on the recoil
 * spring — the pins bounce back twice as they settle — with a faint ring of
 * pins risen round it; a hovering pointer only touches the pins lightly.
 *
 * Two WebGL2 passes: one texel per pin for the heights (the swell plus the
 * impression map), then each pixel draws its pin as a lit steel dome tilted
 * by its neighbours, with occlusion for pins pushed back and short shadows
 * from raised ones. Arrow keys move a press cursor, Shift with an arrow drags
 * an impression, Enter or Space pushes a dent. Under reduced motion the swell
 * holds still and dents go in without the bounce. Without WebGL2 a CSS pin
 * grid stands in.
 */
export function PinscreenSwell({
  pitch = 9,
  depth = 0.6,
  light = 315,
  waves = 0.5,
  speed = 0.4,
  scale = 1,
  brush = 2.5,
  dent = 6,
  relax = 3,
  pinColor = PIN,
  plateColor = PLATE,
  interactive = true,
  onDent,
  label = "Pin screen",
  paused = false,
  seed = 1,
  dpr = 2,
  className,
}: PinscreenSwellProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const ringRef = React.useRef<HTMLDivElement | null>(null);
  const pinRef = React.useRef<HTMLSpanElement | null>(null);
  const plateRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const config: Config = {
    pitch,
    depth,
    light,
    waves,
    speed,
    scale,
    brush,
    dent,
    relax,
    interactive,
    paused,
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
    const ring = ringRef.current;
    const pinNode = pinRef.current;
    const plateNode = plateRef.current;
    if (!root || !canvas || !ring || !pinNode || !plateNode) return;
    const e = createEngine(
      root,
      canvas,
      ring,
      { pin: pinNode, plate: plateNode },
      visible,
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
      { threshold: 0.1 },
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
      root.removeAttribute("data-fallback");
    };
  }, []);

  const local = (x: number, y: number): [number, number] => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? [x - rect.left, y - rect.top] : [0, 0];
  };

  const announce = (col: number, row: number) => {
    setSaid((s) => ({
      n: s.n + 1,
      text: `Dent at column ${col}, row ${row}.`,
    }));
    onDent?.(col, row);
  };

  const drag = useDrag({
    threshold: 4,
    disabled: !interactive,
    onStart: ({ point, offset }) => {
      const [x, y] = local(point.x - offset.x, point.y - offset.y);
      engine.current?.press(x, y);
      const [x2, y2] = local(point.x, point.y);
      engine.current?.pressTo(x2, y2);
    },
    onMove: ({ point }) => {
      const [x, y] = local(point.x, point.y);
      engine.current?.pressTo(x, y);
    },
    onEnd: () => engine.current?.lift(),
    onCancel: () => engine.current?.lift(),
    onTap: (event) => {
      const e = engine.current;
      if (!e) return;
      const [x, y] = local(event.clientX, event.clientY);
      const [col, row] = e.dentAt(x, y);
      announce(col, row);
    },
  });

  const pitchPx = Math.round(clamp(pitch, 5, 16) * 100) / 100;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="pin screen"
      aria-label={label}
      aria-describedby={interactive ? `${uid}-hint` : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(event) => {
        const e = engine.current;
        if (!interactive || !e) return;
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        const move = moves[event.key];
        if (move) {
          event.preventDefault();
          e.cursor(move[0], move[1], event.shiftKey);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (event.repeat) return;
          e.showCursor(true);
          const [col, row] = e.cursorDent();
          announce(col, row);
        }
      }}
      onFocus={(event) => {
        if (
          event.target === event.currentTarget &&
          event.currentTarget.matches(":focus-visible")
        ) {
          engine.current?.showCursor(true);
        }
      }}
      onBlur={() => engine.current?.showCursor(false)}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (!interactive || event.pointerType === "touch") return;
        const [x, y] = local(event.clientX, event.clientY);
        engine.current?.hover(x, y);
      }}
      onPointerLeave={() => engine.current?.leave()}
      className={cn(
        "group/pinscreen-swell relative isolate touch-none overflow-clip select-none",
        interactive && "cursor-crosshair",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{
        backgroundColor: plateColor,
        backgroundImage: `radial-gradient(circle at 40% 36%, color-mix(in oklab, ${pinColor} 70%, white) 0, ${pinColor} 16%, color-mix(in oklab, ${pinColor} 55%, black) 33%, color-mix(in oklab, ${plateColor} 50%, black) 37%, transparent 45%)`,
        backgroundSize: `${pitchPx}px ${pitchPx}px`,
        backgroundPosition: "center",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/pinscreen-swell:opacity-100"
      />
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 rounded-full border-2 border-ring opacity-0 transition-opacity duration-150"
      />
      <span
        ref={pinRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: pinColor }}
      />
      <span
        ref={plateRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: plateColor }}
      />
      {interactive ? (
        <span id={`${uid}-hint`} className="sr-only">
          Arrow keys move the press, Shift with an arrow drags an impression,
          Enter or Space pushes a dent.
        </span>
      ) : null}
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
