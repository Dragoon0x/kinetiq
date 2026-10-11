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
import { createVelocityTracker, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type AgatePalette = "lace" | "carnelian" | "moss" | "botswana";

export type AgateSliceProps = {
  /** The stone's bands. @default "carnelian" */
  palette?: AgatePalette;
  /** Your own five band colours, CSS, pale to deep; overrides `palette`. */
  colors?: string[];
  /** How much light the clear bands let through, 0 (opaque stone) to 1 (glowing). @default 0.6 */
  translucency?: number;
  /** How fast new bands grow from the core, 0 (one every 9 s) to 1 (one every 1.6 s). @default 0.35 */
  pace?: number;
  /** How many bands fit across the slice, 0 (broad) to 1 (fine). @default 0.5 */
  bands?: number;
  /** How thick the rough rind is, 0 to 1. @default 0.4 */
  rind?: number;
  /** How large the quartz core is, 0 to 1. @default 0.45 */
  core?: number;
  /** The rind, any CSS colour. @default a stone brown from the warn token */
  rindColor?: string;
  /** The slice's turn in degrees (controlled). */
  angle?: number;
  /** The starting turn when uncontrolled. @default 0 */
  defaultAngle?: number;
  /** Fires when a drag, throw or key leaves the slice at a new turn, in whole degrees 0 to 359. */
  onAngleChange?: (degrees: number) => void;
  /** The pointer moves the lamp behind the slice. @default true */
  followPointer?: boolean;
  /** Hold the bands still. @default false */
  paused?: boolean;
  /** Seeds the nodule's outline and every band. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The slice's accessible name. @default "Agate slice" */
  label?: string;
  /** No turning. @default false */
  disabled?: boolean;
  /** Sizes the piece; the slice centres in it as a square. */
  className?: string;
};

const PALETTES: Record<AgatePalette, string[]> = {
  lace: [
    "oklch(from var(--accent) 0.95 0.015 h)",
    "oklch(from var(--accent) 0.8 0.06 h)",
    "oklch(from var(--accent) 0.62 0.1 h)",
    "oklch(from var(--accent) 0.88 0.03 calc(h - 25))",
    "oklch(from var(--accent) 0.45 0.08 h)",
  ],
  carnelian: [
    "oklch(from var(--warn) 0.93 0.035 h)",
    "oklch(from var(--danger) 0.66 0.15 calc(h + 18))",
    "oklch(from var(--danger) 0.55 0.16 calc(h + 8))",
    "oklch(from var(--warn) 0.8 0.11 calc(h - 18))",
    "oklch(from var(--danger) 0.42 0.12 h)",
  ],
  moss: [
    "oklch(from var(--success) 0.93 0.03 h)",
    "oklch(from var(--success) 0.64 0.1 h)",
    "oklch(from var(--success) 0.46 0.09 calc(h + 12))",
    "oklch(from var(--warn) 0.84 0.06 h)",
    "oklch(from var(--success) 0.32 0.05 h)",
  ],
  botswana: [
    "oklch(from var(--warn) 0.94 0.018 h)",
    "oklch(from var(--danger) 0.72 0.055 calc(h + 12))",
    "oklch(from var(--warn) 0.6 0.03 calc(h - 20))",
    "oklch(from var(--danger) 0.84 0.04 h)",
    "oklch(from var(--accent) 0.44 0.025 h)",
  ],
};

const TAU = Math.PI * 2;
const RENDER_SCALE = 0.75;
const GROW_FRAME = 33;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_R;
uniform float u_angle;
uniform float u_time;
uniform vec2 u_light;
uniform float u_trans;
uniform float u_density;
uniform float u_rind;
uniform float u_core;
uniform vec3 u_pal[5];
uniform vec3 u_rindCol;
uniform vec3 u_lamp;
uniform float u_seed;
uniform float u_dark;
uniform float u_aa;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

float h1(float k, float salt) { return fract(sin(k * 12.9898 + salt * 78.233 + u_seed * 3.17) * 43758.5453); }

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// The nodule's outline: noise sampled round a circle, so it closes seamlessly.
float outline(vec2 dir) {
  float e = 1.0
    - 0.13 * kx_noise(dir * 1.2 + u_seed)
    - 0.07 * kx_noise(dir * 2.7 + u_seed * 1.7)
    - 0.02 * kx_noise(dir * 7.0 + u_seed * 2.3);
  // A nodule is rarely round: shorter across a seeded long axis.
  vec2 axis = vec2(cos(u_seed * 2.1), sin(u_seed * 2.1));
  float along = dot(dir, axis);
  return e * (1.0 - 0.1 * (1.0 - along * along));
}

vec3 band(float k) {
  float pick = h1(k, 1.0);
  vec3 c = pick < 0.2 ? u_pal[0] : pick < 0.4 ? u_pal[1] : pick < 0.6 ? u_pal[2] : pick < 0.8 ? u_pal[3] : u_pal[4];
  return c;
}

void main() {
  vec2 px = v_uv * u_res - u_res * 0.5;
  vec2 p = rot(px, -u_angle) / u_R;
  float r = length(p);
  vec2 dir = r > 1e-4 ? p / r : vec2(1.0, 0.0);
  float edge = outline(dir);
  float aaR = u_aa / u_R;

  // Bands follow the outline inward: each one a warped, scaled copy of it.
  vec2 w = p
    + 0.08 * vec2(kx_noise(p * 2.2 + u_seed), kx_noise(p * 2.2 + u_seed + 7.3)) - 0.04
    + 0.025 * vec2(kx_noise(p * 6.0 - u_seed), kx_noise(p * 6.0 - u_seed + 3.1)) - 0.0125;
  float rw = length(w);
  float s = rw / outline(rw > 1e-4 ? w / rw : vec2(1.0, 0.0));
  float rindStart = 1.0 - mix(0.05, 0.16, u_rind);
  float coreS = mix(0.07, 0.26, u_core);
  float lightAmt = exp(-dot(px - u_light, px - u_light) / (2.0 * pow(u_R * 0.75, 2.0)));

  vec3 col;
  float translucent = 0.0;
  if (s < coreS) {
    // The druse: quartz crystals round a hollow, glinting as the lamp crosses them.
    vec2 q = p * 16.0;
    vec2 cell = floor(q);
    float best = 9.0;
    float second = 9.0;
    vec2 bestId = vec2(0.0);
    for (int j = -1; j <= 1; j += 1) {
      for (int i = -1; i <= 1; i += 1) {
        vec2 id = cell + vec2(float(i), float(j));
        vec2 at = id + vec2(kx_hash(id + u_seed), kx_hash(id + u_seed + 3.1));
        float d = length(q - at);
        if (d < best) { second = best; best = d; bestId = id; }
        else if (d < second) { second = d; }
      }
    }
    float facet = kx_hash(bestId + 9.1);
    float glint = pow(max(0.0, cos(facet * 6.2831 + dot(normalize(u_light + 1e-3), vec2(0.8, 0.6)) * 3.0)), 24.0);
    // Crystals point into the pocket: deeper toward its irregular middle.
    float depth = smoothstep(0.0, coreS, s + 0.08 * kx_noise(p * 9.0 + u_seed));
    vec3 quartz = mix(u_pal[0], vec3(1.0), 0.3);
    col = quartz * (0.55 + 0.4 * facet) * mix(0.62, 1.0, depth);
    col *= 0.82 + 0.18 * smoothstep(0.0, 0.08, second - best);
    col += vec3(1.0) * glint * 0.85;
    translucent = 0.8;
  } else if (s < rindStart) {
    float N = mix(9.0, 26.0, u_density);
    float u = (s - coreS) * N;
    // Uneven widths, as real banding is: broad bands beside hairlines.
    u += 1.1 * kx_noise(vec2(u * 0.45, u_seed * 0.7));
    u -= u_time;
    float k = floor(u);
    float f = u - k;
    // Young bands, near the core, are soft and glowing; they sharpen as they travel out.
    float age = smoothstep(coreS, coreS + 0.35, s);
    // Never sharper than a pixel: the edge is at least one pixel of band wide.
    float px1 = fwidth(u) * 1.2;
    float ew = max(mix(0.38, 0.05, age), px1);
    vec3 here = band(k);
    vec3 next = band(k + 1.0);
    vec3 prev = band(k - 1.0);
    col = here;
    col = mix(col, next, smoothstep(1.0 - ew, 1.0, f) * 0.5);
    col = mix(col, prev, smoothstep(ew, 0.0, f) * 0.5);
    // Fine laminations inside a band, faded out where they would alias.
    float m = floor(h1(k, 2.0) * 6.0) * 2.0 + 1.0;
    float fine = (0.5 + 0.5 * sin(f * 3.14159 * m)) * (1.0 - smoothstep(0.12, 0.3, px1 * m));
    col *= 0.86 + 0.14 * fine;
    float db = min(f, 1.0 - f);
    col *= 1.0 - 0.18 * exp(-pow(db / max(px1, ew * 0.25), 2.0)) * age;
    translucent = h1(k, 3.0) > 0.45 ? 0.9 : 0.25;
    // Chalcedony: the clear bands read milky, paler than the coloured ones.
    col = mix(col, mix(u_pal[0], vec3(1.0), 0.2), translucent > 0.5 ? 0.38 : 0.0);
    // Crystallising: a new band glows as it forms.
    col += here * (1.0 - age) * 0.35;
    // Hardening into the rind.
    float hard = smoothstep(rindStart - 0.14, rindStart, s);
    float grain = kx_noise(p * 38.0 + u_seed) * 0.5 + kx_noise(p * 9.0 - u_seed) * 0.5;
    col = mix(col, u_rindCol * (0.8 + 0.3 * grain), hard * 0.55);
    translucent *= 1.0 - hard;
  } else {
    float grain = kx_noise(p * 42.0 + u_seed) * 0.55 + kx_noise(p * 11.0 - u_seed) * 0.45;
    col = u_rindCol * (0.7 + 0.45 * grain);
    translucent = 0.0;
  }

  // Backlit: clear bands near the lamp glow, opaque ones take a little.
  float t = translucent * u_trans;
  vec3 lit = col * (0.48 + 0.2 * (1.0 - u_trans) + t * lightAmt * 1.5);
  lit += mix(col, u_lamp, 0.35) * t * lightAmt * 0.35;
  // A polished face: a broad soft sheen high on the left.
  vec2 sp = px / u_R - vec2(-0.38, -0.46);
  lit += vec3(1.0) * exp(-dot(sp, sp) * 3.5) * 0.08;
  // The bevel: a dark lip and a thin bright line on the lamp's side.
  float lip = smoothstep(edge - 0.04, edge, r);
  lit *= 1.0 - 0.28 * lip;
  float facing = max(0.0, dot(dir, normalize(rot(u_light, -u_angle) + 1e-3)));
  lit += vec3(1.0) * exp(-pow((edge - 0.012 - r) / 0.008, 2.0)) * 0.25 * facing;

  float inside = 1.0 - smoothstep(edge - aaR, edge + aaR, r);
  // Outside: a soft shadow below, and the lamp spilling round the edge.
  vec2 so = rot(px - vec2(u_R * 0.03, u_R * 0.07), -u_angle) / u_R;
  float sr = length(so);
  float sEdge = outline(sr > 1e-4 ? so / sr : vec2(1.0, 0.0));
  float shadow = (1.0 - smoothstep(sEdge - 0.02, sEdge + 0.14, sr)) * mix(0.22, 0.42, u_dark);
  float spill = lightAmt * exp(-max(0.0, r - edge) / 0.07) * 0.3 * u_trans;
  vec4 outside = vec4(u_lamp * spill, shadow + spill * 0.5);
  vec4 slab = vec4(clamp(lit, 0.0, 1.0), 1.0);
  o_color = slab * inside + outside * (1.0 - inside);
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const wrapDeg = (d: number) => ((Math.round(d) % 360) + 360) % 360;
const wrapRad = (a: number) => a - TAU * Math.round(a / TAU);

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
  colorKey: string;
  translucency: number;
  pace: number;
  bands: number;
  rind: number;
  core: number;
  seed: number;
  dpr: number;
  paused: boolean;
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
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  /** The lamp toward a point (client coordinates), or home with null. */
  lamp: (x: number | null, y: number | null) => void;
  /** Nudges the lamp by a share of the radius. */
  nudgeLamp: (dx: number, dy: number) => void;
  /** The drag takes the slice: it follows the hand. */
  hold: () => void;
  /** Turns the held slice by radians. */
  turn: (radians: number) => void;
  /** Lets it go with a spin (rad/s); returns where it will rest, radians. */
  release: (spin: number) => number;
  /** Glides to an angle in radians (the nearest way round), or jumps there. */
  glideTo: (radians: number, jump?: boolean) => void;
  angle: () => number;
  dispose: () => void;
};

function createEngine(
  box: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  onRest: (radians: number) => void,
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let growth = 0;
  const size = { w: 0, h: 0 };
  const read = rgbReader();
  // five bands, rind, lamp, page
  const colours = new Float32Array(24);
  let dark = 1;
  // The lamp (px from the centre), eased on the drift spring toward its aim.
  const lampAt = { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0 };
  // The turn: angle, spin, and a glide target when a key or host set one.
  let angle = 0;
  let spin = 0;
  let held = false;
  let glide: number | null = null;
  let coasting = false;

  const rest = () => {
    const R = Math.min(size.w, size.h) / 2;
    return { x: -0.35 * R, y: -0.42 * R };
  };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
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

  const radius = () => (Math.min(size.w, size.h) / 2) * 0.86;

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    p.program.set({
      u_res: [size.w, size.h],
      u_R: radius(),
      u_trans: clamp(c.translucency, 0, 1),
      u_density: clamp(c.bands, 0, 1),
      u_rind: clamp(c.rind, 0, 1),
      u_core: clamp(c.core, 0, 1),
      u_pal: colours.subarray(0, 15),
      u_rindCol: [colours[15] ?? 0.4, colours[16] ?? 0.3, colours[17] ?? 0.2],
      u_lamp: [colours[18] ?? 1, colours[19] ?? 0.97, colours[20] ?? 0.9],
      u_seed: (Math.round(c.seed) % 97) * 1.37 + 0.5,
      u_dark: dark,
      u_aa: 1.1,
    });
  };

  const draw = () => {
    const p = gpu;
    if (!cfg || !p || p.lost || size.w < 1) return;
    p.program.set({
      u_angle: r3(angle),
      u_time: r3(growth),
      u_light: [lampAt.x, lampAt.y],
    });
    p.gl.viewport(0, 0, canvas.width, canvas.height);
    p.gl.clearColor(0, 0, 0, 0);
    p.gl.clear(p.gl.COLOR_BUFFER_BIT);
    p.tri.draw();
    if (!box.hasAttribute("data-live")) box.setAttribute("data-live", "");
  };

  const growing = () => {
    const c = cfg;
    return Boolean(c && c.motionSafe && !c.paused && c.pace > 0);
  };
  const lampMoving = () =>
    Math.abs(lampAt.x - lampAt.ax) > 0.2 ||
    Math.abs(lampAt.y - lampAt.ay) > 0.2 ||
    Math.abs(lampAt.vx) + Math.abs(lampAt.vy) > 0.5;
  const turning = () => held || coasting || glide !== null;

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    if (growing()) growth += dt / lerp(9, 1.6, clamp(c.pace, 0, 1));
    const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / sub;
    for (let k = 0; k < sub; k += 1) {
      // The lamp lags the hand softly: the drift spring.
      const kk = springs.drift.stiffness / springs.drift.mass;
      const cc = springs.drift.damping / springs.drift.mass;
      lampAt.vx += (-kk * (lampAt.x - lampAt.ax) - cc * lampAt.vx) * h;
      lampAt.vy += (-kk * (lampAt.y - lampAt.ay) - cc * lampAt.vy) * h;
      lampAt.x += lampAt.vx * h;
      lampAt.y += lampAt.vy * h;
      if (glide !== null) {
        const gk = springs.glide.stiffness / springs.glide.mass;
        const gc = springs.glide.damping / springs.glide.mass;
        spin += (-gk * (angle - glide) - gc * spin) * h;
        angle += spin * h;
      } else if (coasting) {
        // A thrown slice coasts on friction to where `project` said it would.
        spin *= Math.exp(-h / 0.45);
        angle += spin * h;
      }
    }
    if (
      glide !== null &&
      Math.abs(angle - glide) < 0.0005 &&
      Math.abs(spin) < 0.002
    ) {
      angle = glide;
      spin = 0;
      glide = null;
      onRest(angle);
    }
    if (coasting && Math.abs(spin) < 0.02) {
      spin = 0;
      coasting = false;
      onRest(angle);
    }
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !cfg || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const busy = lampMoving() || turning();
    // Only the bands growing: thirty frames a second is plenty for stone.
    if (!busy && last && now - drawnAt < GROW_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    step(dt);
    draw();
    if (growing() || lampMoving() || turning())
      frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!growing() && !lampMoving() && !turning()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 8; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    dark =
      0.2126 * (colours[21] ?? 0) +
        0.7152 * (colours[22] ?? 0) +
        0.0722 * (colours[23] ?? 0) <
      0.5
        ? 1
        : 0;
    statics();
  };

  const resize = () => {
    const c = cfg;
    size.w = box.clientWidth;
    size.h = box.clientHeight;
    const r = rest();
    if (lampAt.ax === 0 && lampAt.ay === 0) {
      lampAt.ax = r.x;
      lampAt.ay = r.y;
      lampAt.x = r.x;
      lampAt.y = r.y;
    }
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1 || size.h < 1) return;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    resizeGL(p.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? RENDER_SCALE : 1,
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

  const aim = (x: number, y: number) => {
    lampAt.ax = x;
    lampAt.ay = y;
    if (!cfg?.motionSafe) {
      lampAt.x = x;
      lampAt.y = y;
      lampAt.vx = 0;
      lampAt.vy = 0;
    }
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        // A seeded moment in the growth, so the first frame is a composed one.
        growth = 3.3 + (Math.round(next.seed) % 5) * 0.37;
      }
      if (failed) return;
      if (!gpu) {
        if (!start()) {
          failed = true;
          box.setAttribute("data-fallback", "");
          return;
        }
        detach = onContextLoss(
          canvas,
          () => {
            if (gpu) gpu.lost = true;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            box.removeAttribute("data-live");
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
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
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
    lamp(x, y) {
      if (x === null || y === null) {
        const r = rest();
        aim(r.x, r.y);
        return;
      }
      const b = box.getBoundingClientRect();
      const R = radius();
      const lx = clamp(x - (b.left + b.width / 2), -R * 1.2, R * 1.2);
      const ly = clamp(y - (b.top + b.height / 2), -R * 1.2, R * 1.2);
      aim(lx, ly);
    },
    nudgeLamp(dx, dy) {
      const R = radius();
      aim(
        clamp(lampAt.ax + dx * R, -R * 1.2, R * 1.2),
        clamp(lampAt.ay + dy * R, -R * 1.2, R * 1.2),
      );
    },
    hold() {
      held = true;
      coasting = false;
      glide = null;
      spin = 0;
      kick();
    },
    turn(radians) {
      angle += radians;
      if (!frame) draw();
    },
    release(throwSpin) {
      held = false;
      if (!cfg?.motionSafe || Math.abs(throwSpin) < 0.3) {
        spin = 0;
        coasting = false;
        onRest(angle);
        draw();
        return angle;
      }
      spin = clamp(throwSpin, -14, 14);
      coasting = true;
      kick();
      // Where friction will bring it to rest: ω·τ beyond here.
      return angle + spin * 0.45;
    },
    glideTo(radians, jump = false) {
      // The nearest way round to the same angle.
      const target = angle + wrapRad(radians - angle);
      coasting = false;
      held = false;
      if (jump) {
        angle = target;
        spin = 0;
        glide = null;
        draw();
        return;
      }
      if (!cfg?.motionSafe) {
        angle = target;
        spin = 0;
        glide = null;
        onRest(angle);
        draw();
        return;
      }
      glide = target;
      kick();
    },
    angle: () => angle,
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
      box.removeAttribute("data-live");
    },
  };
}

/**
 * A thin polished slice of banded agate held up to the light, drawn in one
 * WebGL2 pass. Its outline is an irregular nodule; inside, bands follow the
 * outline inward as warped, scaled copies of it — opaque coloured layers,
 * translucent chalcedony that glows, fine laminations — round a small druse
 * of quartz whose facets glint as the lamp crosses them.
 *
 * New bands crystallise outward from the core one after another in a slow
 * loop: each is born soft and glowing, sharpens into a crisp edge as it
 * travels out, and near the outline hardens into the rough rind. The lamp
 * behind the slice follows the pointer on the springs.drift constants, so the
 * clear bands near it brighten and the far ones dim. A drag turns the slice
 * 1:1 and a throw coasts on friction; it is a slider of the angle — arrows
 * turn it 15° on springs.glide, Page keys 45°, Home back to 0, and
 * Shift+arrows move the lamp. Under reduced motion the bands hold still and
 * turns are instant.
 */
export function AgateSlice({
  palette = "carnelian",
  colors,
  translucency = 0.6,
  pace = 0.35,
  bands = 0.5,
  rind = 0.4,
  core = 0.45,
  rindColor = "oklch(from var(--warn) 0.46 0.045 calc(h - 15))",
  angle,
  defaultAngle = 0,
  onAngleChange,
  followPointer = true,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Agate slice",
  disabled = false,
  className,
}: AgateSliceProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const pal = (
    colors && colors.length > 0
      ? colors
      : (PALETTES[palette] ?? PALETTES.carnelian)
  ).slice(0, 5);
  while (pal.length < 5) pal.push(pal[pal.length - 1] ?? "currentColor");
  const lampColor = "oklch(from var(--warn) 0.98 0.03 h)";

  const [own, setOwn] = React.useState(() => wrapDeg(defaultAngle));
  const shown = wrapDeg(angle ?? own);

  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const grip = React.useRef({
    angle: 0,
    tracker: createVelocityTracker(90),
    total: 0,
  });

  const config: Config = {
    colorKey: `${pal.join("|")}|${rindColor}`,
    translucency,
    pace,
    bands,
    rind,
    core,
    seed,
    dpr,
    paused,
    motionSafe,
  };
  const latest = React.useRef({
    config,
    angle: shown,
    controlled: angle !== undefined,
    onAngleChange,
  });

  /** A turn has come to rest: report it, from the gesture that made it. */
  const settle = React.useCallback((radians: number) => {
    const deg = wrapDeg((radians * 180) / Math.PI);
    const L = latest.current;
    if (deg === L.angle) return;
    if (!L.controlled) setOwn(deg);
    L.onAngleChange?.(deg);
  }, []);

  React.useEffect(() => {
    latest.current = {
      config,
      angle: shown,
      controlled: angle !== undefined,
      onAngleChange,
    };
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!box || !canvas || !carriers) return;
    const e = createEngine(box, canvas, carriers, visible, (r) => settle(r));
    engine.current = e;
    e.configure(latest.current.config);
    e.glideTo((latest.current.angle * Math.PI) / 180, true);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(box);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) e.wake();
    });
    watcher.observe(box);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [settle]);

  // A host (or a key) that changes the angle: the slice glides there.
  const placed = React.useRef(shown);
  React.useEffect(() => {
    if (placed.current === shown) return;
    placed.current = shown;
    const e = engine.current;
    if (!e) return;
    const now = wrapDeg((e.angle() * 180) / Math.PI);
    if (now !== shown) e.glideTo((shown * Math.PI) / 180);
  }, [shown]);

  const centre = () => {
    const b = boxRef.current?.getBoundingClientRect();
    return b
      ? { x: b.left + b.width / 2, y: b.top + b.height / 2 }
      : { x: 0, y: 0 };
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      const c = centre();
      const g = grip.current;
      g.angle = Math.atan2(point.y - c.y, point.x - c.x);
      g.total = 0;
      g.tracker.reset();
      g.tracker.push(0, 0, performance.now());
      engine.current?.hold();
    },
    onMove: ({ point }) => {
      const c = centre();
      const g = grip.current;
      const a = Math.atan2(point.y - c.y, point.x - c.x);
      const d = wrapRad(a - g.angle);
      g.angle = a;
      g.total += d;
      g.tracker.push(g.total, 0, performance.now());
      engine.current?.turn(d);
    },
    onEnd: () => {
      const v = grip.current.tracker.velocity().x;
      engine.current?.release(v);
    },
    onCancel: () => engine.current?.release(0),
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const e = engine.current;
    if (event.shiftKey && event.key.startsWith("Arrow")) {
      event.preventDefault();
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-0.25, 0],
        ArrowRight: [0.25, 0],
        ArrowUp: [0, -0.25],
        ArrowDown: [0, 0.25],
      };
      const m = d[event.key];
      if (m) e?.nudgeLamp(m[0], m[1]);
      return;
    }
    const steps: Record<string, number> = {
      ArrowRight: 15,
      ArrowUp: 15,
      ArrowLeft: -15,
      ArrowDown: -15,
      PageUp: 45,
      PageDown: -45,
    };
    let next: number | null = null;
    if (event.key in steps) next = shown + (steps[event.key] ?? 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 359;
    if (next === null) return;
    event.preventDefault();
    const deg = wrapDeg(next);
    if (deg === shown) return;
    if (angle === undefined) setOwn(deg);
    onAngleChange?.(deg);
  };

  // The server's frame, and the still without WebGL2: banded rings in a nodule.
  const stops = [0, 1, 2, 3, 4, 2, 0, 3, 1, 4];
  const ring = stops
    .map((k, i) => `${pal[k]} ${i * 5}% ${i * 5 + 4}%`)
    .join(", ");
  const blob = "47% 53% 44% 56% / 52% 45% 55% 48%";

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center",
        className,
      )}
      style={{ containerType: "size" }}
      onPointerMove={(event) => {
        if (!followPointer || event.pointerType === "touch") return;
        engine.current?.lamp(event.clientX, event.clientY);
      }}
      onPointerLeave={() => {
        if (followPointer) engine.current?.lamp(null, null);
      }}
    >
      <div
        ref={boxRef}
        className="group/agate-slice relative"
        style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[9%] group-data-live/agate-slice:hidden"
          style={{
            borderRadius: blob,
            transform: `rotate(${shown}deg)`,
            backgroundImage: `radial-gradient(circle at 50% 50%, oklch(0.97 0.01 80) 0 5%, ${pal[0]} 9%, transparent 12%), repeating-radial-gradient(circle at 50% 50%, ${ring})`,
            boxShadow: `inset 0 0 0 ${Math.round(4 + rind * 8)}px ${rindColor}, 0 6px 16px oklch(0.2 0.02 60 / 0.3)`,
          }}
        />
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-describedby={hintId}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={shown}
          aria-valuetext={`Turned ${shown} ${shown === 1 ? "degree" : "degrees"}`}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onFocus={(event) => {
            // Keyboard focus brings the lamp in behind the core.
            if (event.currentTarget.matches(":focus-visible")) {
              const c = centre();
              engine.current?.lamp(c.x - 8, c.y - 10);
            }
          }}
          onBlur={() => engine.current?.lamp(null, null)}
          {...drag}
          className={cn(
            "absolute inset-[7%] touch-none rounded-full",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
        />
        <span
          ref={carriersRef}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden"
        >
          {[...pal, rindColor, lampColor, "var(--background)"].map((c, i) => (
            <span
              key={i}
              className="transition-colors duration-1"
              style={{ color: c }}
            />
          ))}
        </span>
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys turn the slice 15 degrees, Page keys 45, Home back to 0;
        Shift and the arrows move the lamp behind it. Drag to turn it by hand.
      </p>
    </div>
  );
}
