"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type RatioLoopProps = {
  /** The frequency ratio the ribbon traces, "a:b" (controlled). */
  ratio?: string;
  /** The ratio it starts on when uncontrolled. @default "3:2" */
  defaultRatio?: string;
  /** Fires from the chip or key that asked for a new ratio, with that ratio. */
  onRatioChange?: (ratio: string) => void;
  /** The preset ratios the chips and keys step through. @default ["2:1", "3:2", "4:3", "5:3", "5:4"] */
  ratios?: string[];
  /** The ribbon's width, px, 2 to 24. @default 10 */
  width?: number;
  /** How fast the figure turns on its axis, turns a minute, 0 (still) to 12. @default 3 */
  spin?: number;
  /** How often the ribbon twists edge-on along its length, 0 (flat) to 1. @default 0.5 */
  twist?: number;
  /** The tilt of the turning axis toward the eye, degrees, -60 to 60. @default 18 */
  tilt?: number;
  /** How long a thrown orbit coasts, 0 (it stops at once) to 1 (it glides on). @default 0.6 */
  momentum?: number;
  /** How bright the ribbon burns, 0 to 1. @default 0.6 */
  glow?: number;
  /** The ribbon's two colours, round the loop and back. @default ["var(--accent-bright)", "var(--signal)"] */
  colors?: [string, string];
  /** Show the ratio chips under the figure; without them the figure itself takes the keys. @default true */
  showChips?: boolean;
  /** The figure's accessible name. @default "Harmonic figure" */
  label?: string;
  /** Dragging orbits the figure. @default true */
  interactive?: boolean;
  /** Hold the turning still; drags and ratio changes still work. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a drag starts orbiting the figure (true) and when its throw has run out (false). */
  onOrbitChange?: (orbiting: boolean) => void;
  /** The chips and the drag are ignored; the figure still turns. @default false */
  disabled?: boolean;
  /** Sizes the whole piece: the figure fills what the chips leave. @default "h-full w-full" */
  className?: string;
};

const DEFAULT_RATIOS = ["2:1", "3:2", "4:3", "5:3", "5:4"];
/** Samples round the loop: smooth at any size the stage is likely to be. */
const N = 720;
const STEP = 1 / 240;
const CALM_FRAME = 31;
const CAM = 4.5;
/** How far round the loop the retie lags at its far side, as a share of the glide. */
const LAG = 0.45;
/** How far the loop loosens outward while it unties. */
const LOOSEN = 0.14;
const DRAG_RATE = 0.011;
const PHASE_X = 0.7;
const PHASE_Y = 0.2;
/** The figure is fitted to this radius, in curve units: what a turning knot reaches at rest tilt and most of an orbit. */
const EXTENT = 1.6;
const PITCH_LIMIT = 0.75;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** "3:2" → [3, 2]; anything else falls back to 3:2. */
function parse(ratio: string | undefined): [number, number] {
  const m = /^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*$/.exec(ratio ?? "");
  const a = m ? Number(m[1]) : 3;
  const b = m ? Number(m[2]) : 2;
  return [clamp(a || 3, 1, 12), clamp(b || 2, 1, 12)];
}

/**
 * The figure for a ratio: a Lissajous knot with x at a, y at b and depth at
 * a + b (pairwise coprime for every preset, so the loop never passes
 * through itself in space — its crossings are only where it overlaps on
 * screen). Front on it is the a:b figure; as it turns, the depth folds in.
 */
function figure(a: number, b: number, out: Float32Array) {
  const c = a + b;
  for (let i = 0; i < N; i += 1) {
    const t = (i / N) * Math.PI * 2;
    out[i * 3] = Math.sin(a * t + PHASE_X);
    out[i * 3 + 1] = Math.sin(b * t + PHASE_Y);
    out[i * 3 + 2] = Math.sin(c * t);
  }
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

const glowOf = (c: string) => `oklch(from ${c} 0.8 calc(c * 0.95) h)`;
const inkOf = (c: string) => `oklch(from ${c} 0.56 c h)`;

const VERTEX = `
in vec2 a_pos;
in vec3 a_data;
uniform vec2 u_size;
out float v_across;
out float v_shade;
out float v_hue;
void main() {
  v_across = a_data.x;
  v_shade = a_data.y;
  v_hue = a_data.z;
  gl_Position = vec4(a_pos.x / u_size.x * 2.0 - 1.0, 1.0 - a_pos.y / u_size.y * 2.0, 0.0, 1.0);
}
`;

const FRAGMENT = `
in float v_across;
in float v_shade;
in float v_hue;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform float u_light;
uniform float u_glow;
out vec4 outColor;
void main() {
  float x = abs(v_across);
  float edge = smoothstep(1.0, 0.5, x);
  float core = exp(-x * x * 7.0);
  vec3 col = mix(u_c0, u_c1, v_hue);
  float a;
  if (u_light > 0.5) {
    a = edge * v_shade * (0.32 + 0.4 * u_glow) + core * 0.18 * v_shade;
  } else {
    a = edge * v_shade * (0.34 + 0.46 * u_glow);
    col = mix(col, vec3(1.0), core * 0.45 * u_glow);
    a += core * v_shade * 0.25 * u_glow;
  }
  outColor = vec4(col * a, a);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  lost: boolean;
};

type Config = {
  ratio: string;
  colorKey: string;
  width: number;
  spin: number;
  twist: number;
  tilt: number;
  momentum: number;
  glow: number;
  interactive: boolean;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
  onOrbit: (orbiting: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  grab: () => void;
  orbit: (dx: number, dy: number) => void;
  throw: (vx: number, vy: number) => void;
  dispose: () => void;
};

function createEngine(
  stage: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let failed = false;
  let light = 0;
  let fadeTimer: number | null = null;
  const read = rgbReader();
  const colours = new Float32Array(6);
  const size = { w: 0, h: 0 };
  /** The loop as it was when the retie began, the figure it is going to, and the samples drawn. */
  const from = new Float32Array(N * 3);
  const to = new Float32Array(N * 3);
  const now = new Float32Array(N * 3);
  const screen = new Float32Array((N + 1) * 3);
  const verts = new Float32Array((N + 1) * 2 * 5);
  const widths = new Float32Array(N);
  const faces = new Float32Array(N);
  let shown = "";
  /** The retie's glide, 0 → 1. */
  const tie = { x: 1, v: 0 };
  const view = { yaw: 0, pitch: 0, vy: 0, vp: 0, held: false, coasting: false };
  let orbiting = false;

  const build = (): boolean => {
    const gl = createGL(canvas, {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    });
    if (!gl) return false;
    const program = createProgram(gl, VERTEX, FRAGMENT);
    if (!program) return false;
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) {
      program.dispose();
      return false;
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW);
    const pos = program.attributes.a_pos;
    const data = program.attributes.a_data;
    if (pos !== undefined) {
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 20, 0);
    }
    if (data !== undefined) {
      gl.enableVertexAttribArray(data);
      gl.vertexAttribPointer(data, 3, gl.FLOAT, false, 20, 8);
    }
    gl.bindVertexArray(null);
    gpu = { gl, program, vao, buffer, lost: false };
    return true;
  };

  const releaseGpu = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.gl.deleteVertexArray(g.vao);
    g.gl.deleteBuffer(g.buffer);
    g.program.dispose();
  };

  const setOrbiting = (next: boolean) => {
    if (orbiting === next) return;
    orbiting = next;
    cfg?.onOrbit(next);
  };

  /** The samples where the ribbon is now: each one partway between the two figures. */
  const blend = () => {
    const s = tie.x;
    for (let i = 0; i < N; i += 1) {
      const t = (i / N) * Math.PI * 2;
      // The retie starts at one point and runs both ways round the loop.
      const lag = (LAG * (1 - Math.cos(t))) / 2;
      const m0 = clamp((s - lag) / (1 - LAG), 0, 1);
      const m = m0 * m0 * (3 - 2 * m0);
      const loose = 1 + LOOSEN * Math.sin(Math.PI * m);
      const o = i * 3;
      for (let k = 0; k < 3; k += 1) {
        const f = from[o + k] ?? 0;
        now[o + k] = (f + ((to[o + k] ?? 0) - f) * m) * loose;
      }
    }
  };

  const geometry = () => {
    const c = cfg;
    if (!c) return;
    blend();
    const pitch = (clamp(c.tilt, -60, 60) * Math.PI) / 180 + view.pitch;
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const half = Math.min(size.w, size.h) / 2;
    const width = clamp(c.width, 2, 24);
    const scale = Math.max(4, (half - 4 - width * 0.6) / EXTENT);
    const cx = size.w / 2;
    const cyy = size.h / 2;
    for (let i = 0; i <= N; i += 1) {
      const o = (i % N) * 3;
      const x0 = now[o] ?? 0;
      const y0 = now[o + 1] ?? 0;
      const z0 = now[o + 2] ?? 0;
      // Turn about the upright axis, then tip toward the eye.
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      const y2 = y0 * cp - z1 * sp;
      const z2 = y0 * sp + z1 * cp;
      const s = CAM / (CAM - z2);
      screen[i * 3] = cx + x1 * s * scale;
      screen[i * 3 + 1] = cyy - y2 * s * scale;
      screen[i * 3 + 2] = z2;
    }
    const k = Math.round(clamp(c.twist, 0, 1) * 6);
    // The width each sample wants, held under the turn's own radius: a
    // ribbon wider than its bend would fold over itself into spikes.
    for (let i = 0; i < N; i += 1) {
      const a = ((i - 3 + N) % N) * 3;
      const b = ((i + 3) % N) * 3;
      const o = i * 3;
      const ax = screen[a] ?? 0;
      const ay = screen[a + 1] ?? 0;
      const bx = screen[o] ?? 0;
      const by = screen[o + 1] ?? 0;
      const cx2 = screen[b] ?? 0;
      const cy2 = screen[b + 1] ?? 0;
      const ab = Math.hypot(bx - ax, by - ay);
      const bc = Math.hypot(cx2 - bx, cy2 - by);
      const ca = Math.hypot(ax - cx2, ay - cy2);
      const area = Math.abs((bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax));
      const radius = area > 1e-6 ? (ab * bc * ca) / (2 * area) : 1e6;
      const t = (i / N) * Math.PI * 2;
      const z = screen[o + 2] ?? 0;
      const persp = CAM / (CAM - z);
      // Whole half-twists, so the ribbon meets itself where the loop closes.
      const phase = (k * t) / 2 + 0.6 * Math.sin(t + view.yaw);
      const face = Math.abs(Math.cos(phase));
      widths[i] = Math.min(
        (width / 2) * persp * (0.28 + 0.72 * face),
        Math.max(0.6, radius * 0.8),
      );
      faces[i] = face;
    }
    for (let i = 0; i <= N; i += 1) {
      const a = ((i - 2 + N) % N) * 3;
      const b = ((i + 2) % N) * 3;
      let tx = (screen[b] ?? 0) - (screen[a] ?? 0);
      let ty = (screen[b + 1] ?? 0) - (screen[a + 1] ?? 0);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const j = i % N;
      const t = (i / N) * Math.PI * 2;
      const z = screen[i * 3 + 2] ?? 0;
      // A short running minimum, so a pinch narrows the ribbon smoothly.
      const hw = Math.min(
        widths[j] ?? 0,
        ((widths[(j + 1) % N] ?? 0) + (widths[(j - 1 + N) % N] ?? 0)) * 0.5 +
          0.4,
      );
      const face = faces[j] ?? 1;
      const depth = 0.42 + 0.58 * clamp((z + 1.5) / 3, 0, 1);
      const shade = depth * (0.6 + 0.4 * face);
      const hue = 0.5 - 0.5 * Math.cos(t);
      const px = screen[i * 3] ?? 0;
      const py = screen[i * 3 + 1] ?? 0;
      const v = i * 10;
      verts[v] = px - ty * hw;
      verts[v + 1] = py + tx * hw;
      verts[v + 2] = -1;
      verts[v + 3] = shade;
      verts[v + 4] = hue;
      verts[v + 5] = px + ty * hw;
      verts[v + 6] = py - tx * hw;
      verts[v + 7] = 1;
      verts[v + 8] = shade;
      verts[v + 9] = hue;
    }
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    geometry();
    program.set({
      u_size: [size.w, size.h],
      u_light: light,
      u_glow: clamp(c.glow, 0, 1),
      u_c0: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_c1: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
    });
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    // Light adds where the ribbon crosses itself; on a pale page ink lays over ink.
    if (light) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(p.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, p.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, (N + 1) * 2);
    gl.bindVertexArray(null);
    if (!stage.hasAttribute("data-live")) stage.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const spinning = !c.paused && c.spin > 0;
    if (spinning && !view.held) {
      view.yaw =
        (view.yaw + ((clamp(c.spin, 0, 12) * Math.PI * 2) / 60) * dt) %
        (Math.PI * 2);
      moving = true;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const glide = springs.glide;
    const drift = springs.drift;
    for (let i = 0; i < steps; i += 1) {
      if (tie.x < 1 || Math.abs(tie.v) > 0) {
        tie.v +=
          ((glide.stiffness * (1 - tie.x) - glide.damping * tie.v) /
            glide.mass) *
          h;
        tie.x += tie.v * h;
      }
      if (!view.held) {
        view.yaw += view.vy * h;
        view.pitch += view.vp * h;
        const tau = 0.2 + 1.4 * clamp(c.momentum, 0, 1);
        const keep = Math.exp(-h / tau);
        view.vy *= keep;
        view.vp *= keep;
        // Once the throw has mostly run out, the tilt drifts home.
        if (Math.abs(view.vp) < 0.4) {
          view.vp +=
            ((-drift.stiffness * view.pitch - drift.damping * view.vp) /
              drift.mass) *
            h;
        }
      }
    }
    if (Math.abs(1 - tie.x) < 0.0005 && Math.abs(tie.v) < 0.005) {
      tie.x = 1;
      tie.v = 0;
    } else moving = true;
    if (!view.held) {
      const coasting =
        Math.abs(view.vy) > 0.02 ||
        Math.abs(view.vp) > 0.02 ||
        Math.abs(view.pitch) > 0.002;
      if (coasting) moving = true;
      else {
        view.vy = 0;
        view.vp = 0;
        view.pitch = 0;
        if (view.coasting) {
          view.coasting = false;
          setOrbiting(false);
        }
      }
    }
    return moving || view.held;
  };

  const tick = (t: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Only the slow turn left: thirty frames a second is plenty.
    const calm =
      !view.held &&
      !view.coasting &&
      tie.x === 1 &&
      view.vy === 0 &&
      view.vp === 0;
    if (calm && last && t - last < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
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

  /** A new ratio: the loop as drawn becomes the start, the new figure the end. */
  const retie = (ratio: string) => {
    const c = cfg;
    if (!c) return;
    const [a, b] = parse(ratio);
    if (!shown) {
      figure(a, b, to);
      from.set(to);
      tie.x = 1;
      tie.v = 0;
      shown = ratio;
      return;
    }
    if (ratio === shown) return;
    shown = ratio;
    blend();
    from.set(now);
    figure(a, b, to);
    if (!c.motionSafe) {
      // Reduced motion: a short dip in opacity, and the new figure drawn still.
      canvas.style.opacity = "0";
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(
        () => {
          fadeTimer = null;
          tie.x = 1;
          tie.v = 0;
          from.set(to);
          canvas.style.opacity = "";
          draw();
        },
        Math.round(durations.fast * 1000),
      );
      return;
    }
    tie.x = 0;
    tie.v = 0;
    kick();
  };

  const readColours = () => {
    const kids = carriers.children;
    const bg = new Float32Array(3);
    const first = kids[0];
    if (first) read(getComputedStyle(first).color, bg, 0);
    const lum =
      0.2126 * (bg[0] ?? 0) + 0.7152 * (bg[1] ?? 0) + 0.0722 * (bg[2] ?? 0);
    light = lum > 0.5 ? 1 : 0;
    for (let i = 0; i < 2; i += 1) {
      const el = kids[1 + i + (light ? 2 : 0)];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    resizeGL(p.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
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
      retie(next.ratio);
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2: the SVG still stays, and nothing retries.
          failed = true;
          stage.setAttribute("data-fallback", "");
          return;
        }
        detach = onContextLoss(
          canvas,
          () => {
            if (gpu) gpu.lost = true;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            stage.removeAttribute("data-live");
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
      if (!next.motionSafe) {
        tie.x = 1;
        tie.v = 0;
        from.set(to);
        view.vy = 0;
        view.vp = 0;
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
    grab() {
      view.held = true;
      view.vy = 0;
      view.vp = 0;
      view.coasting = false;
      setOrbiting(true);
      kick();
    },
    orbit(dx, dy) {
      view.yaw += dx * DRAG_RATE;
      view.pitch = clamp(
        view.pitch + dy * DRAG_RATE,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
      if (!cfg?.motionSafe) {
        draw();
        return;
      }
      kick();
    },
    throw(vx, vy) {
      view.held = false;
      const c = cfg;
      if (!c || !c.motionSafe) {
        // Reduced motion: the figure stays where it was let go.
        view.vy = 0;
        view.vp = 0;
        setOrbiting(false);
        draw();
        return;
      }
      view.vy = clamp(vx * DRAG_RATE, -12, 12);
      view.vp = clamp(vy * DRAG_RATE, -12, 12);
      view.coasting = true;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
      fadeTimer = null;
      detach();
      releaseGpu();
    },
  };
}

/** The ratio as words, for the live region and the chips' names. */
const spoken = (ratio: string) => {
  const [a, b] = parse(ratio);
  return `${a} to ${b}`;
};

/**
 * A translucent ribbon tracing a closed harmonic figure in 3D — a
 * Lissajous knot at the ratio a:b, its depth at a + b — turning slowly on
 * its upright axis, so the depth folds into the outline. The ribbon is
 * one WebGL2 triangle strip whose width is set across the projected curve,
 * scaled by perspective and a seamless twist; light adds where it crosses
 * or folds over itself, so every crossing burns brighter (on a light page
 * the pigment deepens instead).
 *
 * Changing the ratio — by prop, by the chips, by the keys — reties the
 * ribbon without ever breaking it: every sample travels from where it is to
 * the new figure on the glide spring, the change starting at one point and
 * running both ways round the loop while the loop loosens and pulls in. A
 * drag orbits it 1:1 and a throw coasts on with momentum before the tilt
 * drifts home. The chips are a radiogroup; arrow keys step through the
 * presets. Under reduced motion the figure holds still and a new ratio
 * crossfades in.
 */
export function RatioLoop({
  ratio,
  defaultRatio = "3:2",
  onRatioChange,
  ratios = DEFAULT_RATIOS,
  width = 10,
  spin = 3,
  twist = 0.5,
  tilt = 18,
  momentum = 0.6,
  glow = 0.6,
  colors = ["var(--accent-bright)", "var(--signal)"],
  showChips = true,
  label = "Harmonic figure",
  interactive = true,
  paused = false,
  dpr = 2,
  onOrbitChange,
  disabled = false,
  className,
}: RatioLoopProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const [own, setOwn] = React.useState(defaultRatio);
  const current = ratio ?? own;
  const presets = ratios.length > 0 ? ratios : DEFAULT_RATIOS;
  const [c0, c1] = colors;
  const paints = React.useMemo(
    () => ["var(--background)", glowOf(c0), glowOf(c1), inkOf(c0), inkOf(c1)],
    [c0, c1],
  );

  // The sentence is frozen from the new ratio in the render that changes it.
  const [prev, setPrev] = React.useState(current);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  if (current !== prev) {
    setPrev(current);
    setSaid((s) => ({ n: s.n + 1, text: `Ratio ${spoken(current)}` }));
  }

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const reportOrbit = React.useRef(onOrbitChange);

  const config: Config = {
    ratio: current,
    colorKey: paints.join("|"),
    width,
    spin,
    twist,
    tilt,
    momentum,
    glow,
    interactive,
    paused,
    dpr,
    motionSafe,
    onOrbit: (o) => reportOrbit.current?.(o),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportOrbit.current = onOrbitChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!stage || !canvas || !carriers) return;
    const e = createEngine(stage, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    if (visible.current) e.wake();
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

  const bindStage = React.useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
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

  const choose = (next: string) => {
    if (disabled || next === current) return;
    if (ratio === undefined) setOwn(next);
    onRatioChange?.(next);
  };

  const stepBy = (delta: number | "first" | "last") => {
    const at = Math.max(0, presets.indexOf(current));
    const to =
      delta === "first"
        ? 0
        : delta === "last"
          ? presets.length - 1
          : (at + delta + presets.length) % presets.length;
    const next = presets[to];
    if (next === undefined) return null;
    choose(next);
    return next;
  };

  const keyStep = (event: React.KeyboardEvent): string | null | undefined => {
    const map: Record<string, number | "first" | "last"> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: "first",
      End: "last",
    };
    const delta = map[event.key];
    if (delta === undefined) return undefined;
    event.preventDefault();
    return stepBy(delta);
  };

  const live = interactive && !disabled;
  const drag = useDrag({
    threshold: 3,
    disabled: !live,
    onStart: () => engine.current?.grab(),
    onMove: ({ delta }) => engine.current?.orbit(delta.x, delta.y),
    onEnd: ({ velocity }) => engine.current?.throw(velocity.x, velocity.y),
    onCancel: () => engine.current?.throw(0, 0),
  });

  const still = React.useMemo(
    () => standIn(current, tilt, width, uid),
    [current, tilt, width, uid],
  );
  const figureFocusable = !showChips;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center gap-2",
        className,
      )}
    >
      <div
        ref={bindStage}
        role={figureFocusable ? "slider" : "img"}
        tabIndex={figureFocusable && !disabled ? 0 : undefined}
        aria-label={
          figureFocusable ? label : `${label}, ratio ${spoken(current)}`
        }
        aria-valuemin={figureFocusable ? 1 : undefined}
        aria-valuemax={figureFocusable ? presets.length : undefined}
        aria-valuenow={
          figureFocusable
            ? Math.max(0, presets.indexOf(current)) + 1
            : undefined
        }
        aria-valuetext={
          figureFocusable ? `Ratio ${spoken(current)}` : undefined
        }
        aria-disabled={figureFocusable && disabled ? true : undefined}
        onKeyDown={figureFocusable ? (event) => void keyStep(event) : undefined}
        {...drag}
        className={cn(
          // A box of its own when the parent gives no height; the rest of the parent when it does.
          "group/ratio-loop relative isolate w-full min-w-0 flex-[1_1_10rem] overflow-clip rounded-3",
          "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          live ? "cursor-grab touch-none active:cursor-grabbing" : "touch-auto",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          preserveAspectRatio="xMidYMid meet"
          className="pointer-events-none absolute inset-0 size-full group-data-live/ratio-loop:hidden"
        >
          <defs>
            <linearGradient id={still.gradient} x1="0" y1="0" x2="1" y2="1">
              <stop
                offset="0"
                style={{ stopColor: `oklch(from ${c0} 0.68 c h)` }}
              />
              <stop
                offset="1"
                style={{ stopColor: `oklch(from ${c1} 0.68 c h)` }}
              />
            </linearGradient>
          </defs>
          <path
            d={still.d}
            fill="none"
            stroke={`url(#${still.gradient})`}
            strokeWidth={still.stroke}
            strokeLinejoin="round"
            opacity={0.35}
          />
          <path
            d={still.d}
            fill="none"
            stroke={`url(#${still.gradient})`}
            strokeWidth={1}
            opacity={0.9}
          />
        </svg>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full transition-opacity duration-150"
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
      </div>
      {showChips ? (
        <div
          role="radiogroup"
          aria-label="Frequency ratio"
          aria-disabled={disabled || undefined}
          className="flex shrink-0 flex-wrap items-center justify-center gap-1.5"
        >
          {presets.map((r) => {
            const on = r === current;
            return (
              <motion.button
                key={r}
                type="button"
                data-ratio={r}
                role="radio"
                aria-checked={on}
                aria-label={`Ratio ${spoken(r)}`}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                whileTap={motionSafe && !disabled ? { scale: 0.94 } : undefined}
                transition={springs.flick}
                onClick={() => choose(r)}
                onKeyDown={(event) => {
                  const group = event.currentTarget.parentElement;
                  const next = keyStep(event);
                  if (!next || !group) return;
                  // Focus follows the checked chip, as in any radio group.
                  for (const chip of group.querySelectorAll<HTMLElement>(
                    "[data-ratio]",
                  )) {
                    if (chip.dataset.ratio === next) chip.focus();
                  }
                }}
                className={cn(
                  "relative inline-flex h-7 items-center justify-center rounded-full px-2.5 font-mono text-[11px] tabular-nums transition-colors",
                  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  on
                    ? "text-cobalt-bright"
                    : "text-ink-2 hover:text-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-chip`}
                    aria-hidden
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                    className="absolute inset-0 rounded-full border border-cobalt-bright/40 bg-cobalt-wash"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full border border-hairline"
                  />
                )}
                <span className="relative">{r}</span>
              </motion.button>
            );
          })}
        </div>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the same figure from the resting view as a soft
 * band under a hairline, in the ribbon's two colours.
 */
function standIn(ratio: string, tilt: number, width: number, uid: string) {
  const [a, b] = parse(ratio);
  const pts = new Float32Array(N * 3);
  figure(a, b, pts);
  const pitch = (clamp(tilt, -60, 60) * Math.PI) / 180;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const scale = (100 - 8) / EXTENT;
  let d = "";
  for (let i = 0; i <= 240; i += 1) {
    const o = ((i * 3) % 720) * 3;
    const x = pts[o] ?? 0;
    const y = pts[o + 1] ?? 0;
    const z = pts[o + 2] ?? 0;
    const y2 = y * cp - z * sp;
    const z2 = y * sp + z * cp;
    const s = CAM / (CAM - z2);
    d += `${i === 0 ? "M" : "L"}${r2(100 + x * s * scale)} ${r2(100 - y2 * s * scale)}`;
  }
  return {
    d: `${d}Z`,
    stroke: r2(clamp(width, 2, 24) * 0.8),
    gradient: `rl${uid.replace(/[^a-zA-Z0-9]/g, "")}`,
  };
}
