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
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpectrumBurstProps = {
  /** The content in front of the burst: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many rays leave the centre, 4 to 36. @default 16 */
  rays?: number;
  /** How far each ray splits into colour toward its tip, 0 (white blades) to 1. @default 0.5 */
  dispersion?: number;
  /** How fast the burst turns and pulses, 0 (still) to 2. @default 1 */
  speed?: number;
  /** Where the burst rests across the box, 0 (left) to 1 (right). @default 0.5 */
  originX?: number;
  /** Where the burst rests down the box, 0 (top) to 1 (bottom). @default 0.42 */
  originY?: number;
  /** How far the rays reach, as a share of the box's diagonal, 0.2 to 1. @default 0.7 */
  length?: number;
  /** How broad each ray is, 0 (a fine blade) to 1 (a wide wedge). @default 0.4 */
  width?: number;
  /** How bright the light is, 0 to 1.5. @default 1 */
  intensity?: number;
  /** How much the rays breathe and ripple in length and brightness, 0 to 1. @default 0.5 */
  pulse?: number;
  /** How bright the faint spectral ring around the burst is, 0 (none) to 1. @default 0.35 */
  halo?: number;
  /** How rich the split colours are, 0 (grey fringes) to 1 (pure spectrum). @default 0.8 */
  saturation?: number;
  /** The centre follows the hand, a press blooms the burst, and keyboard focus inside carries it to the control. @default true */
  interactive?: boolean;
  /** How far toward the hand the centre travels and how hard a press blooms, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** Hold the turning and the pulse still; the hand still carries the centre. @default false */
  paused?: boolean;
  /** Seeds every ray's length, width, brightness and rhythm. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a press (or keyboard focus) blooms the burst. */
  onBurst?: () => void;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) carrying the centre. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Light is soft at its edges: half the capped pixel ratio, scaled up by the browser. */
const RENDER_SCALE = 0.5;
const CALM_FRAME = 31;
/** Radians a second the burst turns at speed 1: a full turn in about three minutes. */
const TURN = 0.035;
/** A press's push into the bloom spring: peaks near 1 on the recoil constants. */
const KICK = 30;
/** The ring a bloom sends out takes this long to cross, on the enter easing. */
const RING = 0.7;
const DRIFT = springs.drift;
const RECOIL = springs.recoil;
const STEP = 1 / 120;
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

/**
 * The seven wavelengths each ray is split into, violet to red, as linear
 * light: a piecewise fit of the visible spectrum, dimmed at its ends, each
 * channel then scaled so the seven sum to white — undispersed, a ray is
 * white light again.
 */
const WAVELENGTHS = [420, 455, 490, 525, 565, 605, 650];
function spectrum(saturation: number, out: Float32Array) {
  const raw = WAVELENGTHS.map((l) => {
    let r = 0;
    let g = 0;
    let b = 0;
    if (l < 440) {
      r = (440 - l) / 60;
      b = 1;
    } else if (l < 490) {
      g = (l - 440) / 50;
      b = 1;
    } else if (l < 510) {
      g = 1;
      b = (510 - l) / 20;
    } else if (l < 580) {
      r = (l - 510) / 70;
      g = 1;
    } else if (l < 645) {
      r = 1;
      g = (645 - l) / 65;
    } else r = 1;
    const fade = l < 430 ? 0.75 : 1;
    return [r, g, b].map((v) => Math.pow(v * fade, 2.2));
  });
  const sum = [0, 1, 2].map((i) =>
    raw.reduce((total, c) => total + (c[i] ?? 0), 0),
  );
  const s = clamp(saturation, 0, 1);
  raw.forEach((c, k) => {
    for (let i = 0; i < 3; i += 1) {
      const pure = (c[i] ?? 0) / Math.max(sum[i] ?? 1, 1e-4);
      out[k * 3 + i] = (1 - s) / 7 + s * pure;
    }
  });
}

/** What a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_light;
uniform vec3 u_bg;
uniform vec2 u_centre;
uniform float u_rot;
uniform float u_time;
uniform float u_n;
uniform float u_disp;
uniform float u_len;
uniform float u_width;
uniform float u_int;
uniform float u_pulse;
uniform float u_halo;
uniform float u_seed;
uniform float u_bloom;
uniform vec2 u_ring;
uniform vec3 u_spec[7];
in vec2 v_uv;
out vec4 outColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;

float hash1(float i, float s) {
  vec3 p3 = fract(vec3(i, s, i) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

void main() {
  vec2 size = u_res / u_px;
  float h = size.y;
  vec2 q = (v_uv * size - u_centre) / h;
  float r = length(q);
  float th = atan(q.y, q.x);
  float spacing = TAU / u_n;
  float diag = length(size) / h;
  float bloom = u_bloom;
  float lift = max(bloom, 0.0);
  float disp = u_disp + lift * 0.45;
  // Each wavelength is turned by an angle that grows from nothing at the
  // centre, so the colours overlap into white there and fan apart outward.
  float spread = disp * spacing * 0.34 * smoothstep(0.0, 0.5, r);
  float breath = sin(u_time * 0.85);
  float idx0 = floor((th - u_rot) / spacing + 0.5);

  vec3 E = vec3(0.0);
  // Only the ray under the pixel and its two neighbours can reach it.
  for (int c = -1; c <= 1; c++) {
    float idx = idx0 + float(c);
    float id = mod(idx, u_n);
    float jit = hash1(id, u_seed) - 0.5;
    float hl = hash1(id + 37.0, u_seed);
    float hw = hash1(id + 71.0, u_seed);
    float hb = hash1(id + 113.0, u_seed);
    float ph = hash1(id + 157.0, u_seed) * TAU;
    float pace = 0.5 + hash1(id + 199.0, u_seed);
    float own = sin(u_time * pace + ph);
    float reach = u_len * mix(0.5, 1.0, hl) * diag * (1.0 + u_pulse * (0.08 * breath + 0.22 * own)) * (1.0 + 0.55 * bloom);
    float fall = (1.0 - smoothstep(0.0, max(reach, 0.02), r)) * (0.45 + 0.55 * exp(-r / max(reach * 0.3, 0.01)));
    if (fall <= 0.0) continue;
    float bright = mix(0.4, 1.0, hb * hb) * (1.0 + u_pulse * (0.1 * breath + 0.3 * own)) * (1.0 + 0.5 * lift);
    float w = spacing * mix(0.04, 0.2, u_width) * mix(0.7, 1.3, hw) * (0.6 + 0.4 / (1.0 + r * 3.0));
    float d = th - u_rot - (idx + jit * 0.5) * spacing;
    d = mod(d + PI, TAU) - PI;
    for (int k = 0; k < 7; k++) {
      float a = (d - (float(k) - 3.0) / 3.0 * spread) / w;
      E += u_spec[k] * (bright * fall * exp(-a * a));
    }
  }

  // The halo and the bloom's ring, split the same way: red outside, violet in.
  float haloR = 0.62 * (1.0 + 0.03 * breath * u_pulse);
  float split = 0.3 + disp;
  for (int k = 0; k < 7; k++) {
    float s = (float(k) - 3.0) / 3.0;
    float hr = (r - haloR * (1.0 + s * 0.06 * split)) / 0.01;
    float rr = (r - u_ring.x * (1.0 + s * 0.05 * split)) / 0.018;
    E += u_spec[k] * (u_halo * 0.2 * exp(-hr * hr) + u_ring.y * 1.2 * exp(-rr * rr));
  }
  E += vec3(0.9 * exp(-r / 0.035) + 0.2 * exp(-r / 0.16)) * (1.0 + 0.6 * lift);
  E *= u_int;

  vec3 bg = lin(u_bg);
  // Night: the light adds to the ground and saturates toward white.
  vec3 night = 1.0 - (1.0 - bg) * exp(-E * 1.1);
  // Day: the light lays down as washes — the white of a ray only a faint warm
  // shade, its split edges the colour the page takes from them.
  float Y = dot(E, vec3(0.2126, 0.7152, 0.0722));
  vec3 chroma = max(vec3(Y) - E, 0.0);
  vec3 day = bg * exp(-(Y * vec3(0.1, 0.15, 0.24) + chroma * 3.2));
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
  rays: number;
  dispersion: number;
  speed: number;
  originX: number;
  originY: number;
  length: number;
  width: number;
  intensity: number;
  pulse: number;
  halo: number;
  saturation: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onBurst: () => void;
  onActive: (active: boolean) => void;
};

type Source = "pointer" | "focus";

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, src: Source) => void;
  handAway: (src: Source) => void;
  bloom: (strength: number) => void;
  release: () => void;
  dispose: () => void;
};

type Spring = { x: number; v: number };

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carrier: HTMLElement,
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
  const bgColour = new Float32Array(3);
  const spec = new Float32Array(21);
  const size = { w: 0, h: 0 };
  let light = 0;
  /** The burst's clock (scaled by speed) and its seeded starting turn. */
  const sim = { t: 0, turn: 0 };
  const hand = { x: 0, y: 0, present: false, source: null as Source | null };
  /** The centre, CSS px, on the drift spring. */
  const cx: Spring = { x: 0, v: 0 };
  const cy: Spring = { x: 0, v: 0 };
  /** The bloom, on the recoil spring; negative is the rebound. */
  const bloom: Spring = { x: 0, v: 0 };
  /** The ring a bloom sends out: its age in seconds and strength. */
  const ring = { age: RING, strength: 0 };
  /** Reduced motion: a press holds the bloom's peak until it ends. */
  let held = 0;

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

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const home = (c: Config) => ({
    x: clamp(c.originX, 0, 1) * size.w,
    y: clamp(c.originY, 0, 1) * size.h,
  });
  const target = (c: Config) => {
    const o = home(c);
    if (!hand.present || !c.interactive) return o;
    const k = clamp(c.pointerStrength, 0, 1);
    return { x: o.x + (hand.x - o.x) * k, y: o.y + (hand.y - o.y) * k };
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
    gl.uniform3f(
      u.u_bg ?? null,
      bgColour[0] ?? 0,
      bgColour[1] ?? 0,
      bgColour[2] ?? 0,
    );
    gl.uniform1f(u.u_n ?? null, clamp(Math.round(c.rays), 4, 36));
    gl.uniform1f(u.u_disp ?? null, clamp(c.dispersion, 0, 1));
    gl.uniform1f(u.u_len ?? null, clamp(c.length, 0.2, 1));
    gl.uniform1f(u.u_width ?? null, clamp(c.width, 0, 1));
    gl.uniform1f(u.u_int ?? null, clamp(c.intensity, 0, 1.5));
    gl.uniform1f(u.u_pulse ?? null, clamp(c.pulse, 0, 1));
    gl.uniform1f(u.u_halo ?? null, clamp(c.halo, 0, 1));
    gl.uniform1f(u.u_seed ?? null, (Math.round(c.seed) % 997) + 0.5);
    spectrum(c.saturation, spec);
    gl.uniform3fv(u.u_spec ?? null, spec);
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const reach = Math.hypot(size.w, size.h) / size.h;
    let b: number;
    let ringR: number;
    let ringA: number;
    if (c.motionSafe) {
      b = bloom.x;
      const f = clamp(ring.age / RING, 0, 1);
      ringR = enterEase(f) * reach * 0.55;
      ringA = ring.strength * Math.pow(1 - f, 1.5);
    } else {
      // Reduced motion: the bloom's peak as one still frame while held.
      b = held * 0.8;
      ringR = reach * 0.28;
      ringA = held * 0.6;
    }
    program.use();
    gl.uniform2f(u.u_centre ?? null, cx.x, cy.x);
    gl.uniform1f(u.u_rot ?? null, sim.turn + sim.t * TURN);
    gl.uniform1f(u.u_time ?? null, sim.t);
    gl.uniform1f(u.u_bloom ?? null, b);
    gl.uniform2f(u.u_ring ?? null, ringR, ringA);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const spring = (
    s: Spring,
    to: number,
    k: number,
    d: number,
    m: number,
    h: number,
  ) => {
    s.v += ((k * (to - s.x) - d * s.v) / m) * h;
    s.x += s.v * h;
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const to = target(c);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      spring(cx, to.x, DRIFT.stiffness, DRIFT.damping, DRIFT.mass, h);
      spring(cy, to.y, DRIFT.stiffness, DRIFT.damping, DRIFT.mass, h);
      spring(bloom, 0, RECOIL.stiffness, RECOIL.damping, RECOIL.mass, h);
    }
    const centred =
      Math.abs(to.x - cx.x) + Math.abs(to.y - cy.x) < 0.3 &&
      Math.abs(cx.v) + Math.abs(cy.v) < 0.5;
    if (centred) {
      cx.x = to.x;
      cy.x = to.y;
      cx.v = 0;
      cy.v = 0;
    } else moving = true;
    if (Math.abs(bloom.x) < 0.002 && Math.abs(bloom.v) < 0.02) {
      bloom.x = 0;
      bloom.v = 0;
    } else moving = true;
    if (ring.age < RING) {
      ring.age += dt;
      moving = true;
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const springing =
      cx.v !== 0 || cy.v !== 0 || bloom.v !== 0 || ring.age < RING;
    if (c.motionSafe && !springing && last && now - drawnAt < CALM_FRAME) {
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

  /** Reduced motion has no travel: the centre is wherever it should be. */
  const place = (c: Config) => {
    const to = target(c);
    cx.x = to.x;
    cy.x = to.y;
    cx.v = 0;
    cy.v = 0;
  };

  const restart = (c: Config) => {
    const rand = lcg(c.seed * 41 + 7);
    // A seeded moment, so the still frame and the first frame are one.
    sim.t = 4 + rand() * 30;
    sim.turn = rand() * Math.PI * 2;
    bloom.x = 0;
    bloom.v = 0;
    ring.age = RING;
    place(c);
  };

  const readColours = () => {
    read(getComputedStyle(carrier).color, bgColour, 0);
    const lum =
      0.2126 * (bgColour[0] ?? 0) +
      0.7152 * (bgColour[1] ?? 0) +
      0.0722 * (bgColour[2] ?? 0);
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
    if (first) restart(c);
    else if (!c.motionSafe || (cx.v === 0 && cy.v === 0)) place(c);
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
      if (was.seed !== next.seed || was.motionSafe !== next.motionSafe)
        restart(next);
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) place(next);
      statics();
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
      // Focus holds the centre until it leaves; the pointer waits its turn.
      if (hand.source === "focus" && src === "pointer") return;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = src;
      setActive(true);
      if (c.motionSafe) kick();
      else {
        place(c);
        draw();
      }
    },
    handAway(src) {
      if (hand.source !== src) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      const c = cfg;
      if (!c) return;
      if (c.motionSafe) kick();
      else {
        place(c);
        draw();
      }
    },
    bloom(strength) {
      const c = cfg;
      if (!c || !c.interactive || size.w < 1) return;
      const k = clamp(strength, 0, 1) * (0.45 + 0.55 * c.pointerStrength);
      c.onBurst();
      if (!c.motionSafe) {
        held = k;
        draw();
        return;
      }
      bloom.v += KICK * k;
      ring.age = 0;
      ring.strength = k;
      kick();
    },
    release() {
      if (held === 0) return;
      held = 0;
      draw();
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
 * A background of light bursting from a point in every direction, each ray
 * split by dispersion: summed over seven wavelengths from violet to red,
 * each turned by an angle that grows away from the centre, so the colours
 * overlap into white light at the heart and fan into a spectrum toward each
 * ray's tip — red on one edge, violet on the other. The burst turns slowly
 * and breathes, each seeded ray rippling in length and brightness on its own
 * rhythm, with a soft white core and a faint ring split the same way.
 *
 * The centre follows the hand on springs with the `springs.drift` constants,
 * carried with weight, and returns home when the hand leaves. A press on the
 * bare background blooms the burst on `springs.recoil` — the rays thrown out
 * long and split wide, ringing twice as they settle — while a split ring of
 * light leaves the centre on the enter easing; keyboard focus on a control
 * inside carries the centre to it and blooms softly. One fullscreen WebGL2
 * draw at half the capped pixel ratio, each pixel weighing only the rays
 * that can reach it, 30 frames a second while it only turns, nothing off
 * screen or in a hidden page. Without WebGL2 a CSS still frame stands in;
 * under reduced motion the burst is still and a press shows the bloom's
 * peak while it is held.
 */
export function SpectrumBurst({
  children,
  rays = 16,
  dispersion = 0.5,
  speed = 1,
  originX = 0.5,
  originY = 0.42,
  length = 0.7,
  width = 0.4,
  intensity = 1,
  pulse = 0.5,
  halo = 0.35,
  saturation = 0.8,
  interactive = true,
  pointerStrength = 0.7,
  paused = false,
  seed = 1,
  dpr = 2,
  onBurst,
  onActiveChange,
  className,
}: SpectrumBurstProps) {
  const motionSafe = useMotionSafe();

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportBurst = React.useRef(onBurst);
  const reportActive = React.useRef(onActiveChange);

  const config: Config = {
    rays,
    dispersion,
    speed,
    originX,
    originY,
    length,
    width,
    intensity,
    pulse,
    halo,
    saturation,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onBurst: () => reportBurst.current?.(),
    onActive: (a) => reportActive.current?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportBurst.current = onBurst;
    reportActive.current = onActiveChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carrier = carrierRef.current;
    if (!root || !canvas || !carrier) return;
    const e = createEngine(root, canvas, carrier, visible);
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
    // A press on a control is the control's; only the bare light blooms.
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.bloom(1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    engine.current?.release();
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    engine.current?.release();
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
    // A still frame has no fade to end a soft bloom: there focus only moves
    // the centre.
    if (motionSafe) engine.current?.bloom(0.5);
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
        // A finger carries the light as it moves across; an upright swipe
        // is the page's.
        "group/spectrum-burst relative isolate h-full w-full touch-pan-y overflow-clip bg-background",
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
        className="pointer-events-none absolute inset-0 transition-opacity group-data-live/spectrum-burst:opacity-0"
        style={{ transitionDuration: `${Math.round(durations.slow * 1000)}ms` }}
      >
        <div
          className="absolute inset-0"
          style={raysStandIn(rays, dispersion, originX, originY, seed)}
        />
        <div
          className="absolute inset-0"
          style={coreStandIn(originX, originY, halo)}
        />
      </div>
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden text-background transition-colors duration-1"
      />
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/** The split edges of a ray, violet leading and red trailing, faint enough for both themes. */
const EDGE_VIOLET = "oklch(0.7 0.14 295 / 0.22)";
const EDGE_RED = "oklch(0.72 0.15 35 / 0.22)";

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the rays as a conic burst, each a pale blade with
 * a violet and a red edge, fading out from the centre.
 */
function raysStandIn(
  rays: number,
  dispersion: number,
  originX: number,
  originY: number,
  seed: number,
): React.CSSProperties {
  const n = clamp(Math.round(rays), 4, 36);
  const gap = 360 / n;
  const d = clamp(dispersion, 0, 1);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const blade = "color-mix(in oklab, var(--foreground) 16%, transparent)";
  const edge = r3(gap * (0.05 + 0.08 * d));
  const core = r3(gap * 0.06);
  const from = Math.round(lcg(seed * 41 + 7)() * 360);
  const at = `${pct(clamp(originX, 0, 1))} ${pct(clamp(originY, 0, 1))}`;
  const mask = `radial-gradient(circle at ${at}, black, transparent 70%)`;
  return {
    backgroundImage: `repeating-conic-gradient(from ${from}deg at ${at}, transparent 0deg, ${EDGE_VIOLET} ${r3(edge)}deg, ${blade} ${r3(edge + core)}deg, ${EDGE_RED} ${r3(edge + core * 2)}deg, transparent ${r3(edge * 2 + core * 2)}deg, transparent ${r3(gap)}deg)`,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
}

/** The soft white core and the faint split ring around it. */
function coreStandIn(
  originX: number,
  originY: number,
  halo: number,
): React.CSSProperties {
  const at = `${pct(clamp(originX, 0, 1))} ${pct(clamp(originY, 0, 1))}`;
  const a = (Math.round(clamp(halo, 0, 1) * 30) / 100).toFixed(2);
  return {
    backgroundImage: [
      `radial-gradient(circle at ${at}, color-mix(in oklab, var(--foreground) 30%, transparent), transparent 9%)`,
      `radial-gradient(circle at ${at}, transparent 33%, oklch(0.7 0.14 295 / ${a}) 34%, transparent 35%, oklch(0.72 0.15 35 / ${a}) 36%, transparent 37%)`,
    ].join(", "),
  };
}
