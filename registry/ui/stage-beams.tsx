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
import { cascade, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StageBeamsPalette = "house" | "ice" | "ember" | "mono";

export type StageBeamsProps = {
  /** The content in front of the rig: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many beams the rig throws, 2 to 12; they work in mirrored pairs, so odd counts round up. @default 6 */
  beams?: number;
  /** How thick the haze is, 0 (clean air: faint, crisp blades) to 1 (thick, textured shafts). @default 0.55 */
  haze?: number;
  /** A named palette, or up to three CSS colours given to the pairs in turn. @default "house" */
  colors?: StageBeamsPalette | readonly string[];
  /** How fast the beams sway and the haze drifts, 0 (still) to 2. @default 1 */
  speed?: number;
  /** Each beam's width, degrees, 2 to 12. @default 5 */
  spread?: number;
  /** How bright the beams burn, 0 to 1.5. @default 1 */
  intensity?: number;
  /** How many motes glint in the beams, 0 to 1. @default 0.5 */
  motes?: number;
  /** How much light pools on the floor at each fixture, 0 to 1. @default 0.6 */
  floor?: number;
  /** Milliseconds between the lighting desk's cues, 2000 to 12000. @default 4800 */
  cue?: number;
  /** The pointer takes the nearest beam, keyboard focus the nearest pair, and a press brings every beam onto it. @default true */
  interactive?: boolean;
  /** How far a beam leaves its cue for the hand and how bright the hit is, 0 to 1. @default 0.8 */
  pointerStrength?: number;
  /** Hold the show: no cues, no sway, no drifting haze. The hand still directs the beams. @default false */
  paused?: boolean;
  /** Seeds the order of the looks, the haze and the motes. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the desk runs a new cue, with its number in the show (1 up). */
  onCue?: (index: number) => void;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) directing a beam. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press brings every beam onto it (true) and when the press ends and the desk takes them back (false). */
  onHit?: (hitting: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Beams and haze are soft: half the capped pixel ratio, scaled up by the browser. */
const RENDER_SCALE = 0.5;
const STEP = 1 / 120;
const CALM_FRAME = 31;
const MAX_BEAMS = 12;
const LOOKS = 6;
/** The sway riding on every look: amplitude in radians and seconds a swing at speed 1. */
const SWAY = (4.5 * Math.PI) / 180;
const SWAY_PERIOD = 7.5;
/** A hit's push into the flare spring: peaks near 1 a tenth of a second in. */
const FLARE = 26;
const MAX_AIM = (72 * Math.PI) / 180;
const DEG = Math.PI / 180;

type SpringSet = { stiffness: number; damping: number; mass: number };
/** Heavy heads run the show; a follow spot is a hand on a lighter yoke; a hit lands crisp. */
const SHOW: SpringSet = springs.drift;
const FOLLOW: SpringSet = springs.glide;
const HIT: SpringSet = springs.snap;

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

const PALETTES: Record<StageBeamsPalette, readonly string[]> = {
  house: ["var(--accent-bright)", "var(--warn)"],
  ice: ["var(--signal)", "var(--accent-bright)"],
  ember: ["var(--warn)", "var(--danger)"],
  mono: ["var(--foreground)"],
};

/** A palette as one string, so a new array of the same colours is the same palette. */
const paletteKeyOf = (colors: StageBeamsPalette | readonly string[]) =>
  typeof colors === "string" ? colors : `custom:${colors.join("|")}`;

const paletteOf = (key: string): readonly string[] => {
  if (!key.startsWith("custom:"))
    return PALETTES[key as StageBeamsPalette] ?? PALETTES.house;
  const list = key.slice(7).split("|").filter(Boolean);
  return list.length ? list.slice(0, 3) : PALETTES.house;
};

/** Light in the air at a fixed lightness; a gel's deeper pigment for a pale page. */
const lightOf = (c: string) => `oklch(from ${c} 0.82 calc(c * 0.85) h)`;
const gelOf = (c: string) => `oklch(from ${c} 0.62 calc(c * 0.9) h)`;

/** Fixture positions across the bottom edge, as fractions of the width. */
function fixtures(n: number, narrow: boolean): number[] {
  const margin = narrow ? 0.1 : 0.06;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1)
    out.push(margin + ((1 - 2 * margin) * (i + 0.5)) / n);
  return out;
}

/**
 * One look of the show: each beam's angle from straight up (positive toward
 * the right), for fixture i of n at fraction x across a box of aspect w/h.
 * Pairs mirror, so the rig always reads as choreographed.
 */
function lookAngle(
  look: number,
  i: number,
  n: number,
  xs: readonly number[],
  aspect: number,
): number {
  const pairs = n / 2;
  const left = i < pairs;
  const pair = left ? i : n - 1 - i;
  // 0 at the outermost pair, 1 at the innermost.
  const inward = pairs > 1 ? pair / (pairs - 1) : 1;
  const side = left ? -1 : 1;
  const x = xs[i] ?? 0.5;
  const aimAt = (tx: number, ty: number) =>
    Math.atan2((tx - x) * aspect, 1 - ty);
  switch (look) {
    case 0:
      // Fan: the outer pairs lean out the furthest.
      return side * (8 + 26 * (1 - inward)) * DEG;
    case 1:
      // Cross: each pair meets its partner over the centre, the inner pairs
      // higher, so the rig draws a stack of X shapes.
      return aimAt(0.5, 0.42 - 0.3 * inward);
    case 2:
      // Up: straight to the roof, barely splayed.
      return side * 2.5 * (1 - inward) * DEG;
    case 3:
      // Lean: the whole rig to one side, the outer beams a little more.
      return (16 + 6 * (1 - inward)) * DEG;
    case 4:
      // Gather: every beam on one point high above the stage.
      return aimAt(0.5, -0.9);
    default:
      // Wave: pairs alternate in and out.
      return side * (pair % 2 === 0 ? 20 : -6) * DEG;
  }
}

/** The order the desk runs its looks, seeded; the first look is always the fan. */
function showOrder(seed: number): number[] {
  const rand = lcg(seed * 13 + 5);
  const rest = [1, 2, 3, 4, 5];
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = rest[i] ?? 1;
    rest[i] = rest[j] ?? 1;
    rest[j] = a;
  }
  return [0, ...rest];
}

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec4 u_beam[12];
uniform vec3 u_air[12];
uniform vec3 u_gel[12];
uniform float u_n;
uniform float u_width;
uniform float u_haze;
uniform float u_motes;
uniform float u_floor;
uniform float u_flare;
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
  for (int i = 0; i < 3; i++) {
    s += a * noise(p);
    p = turn * p * 2.07 + 3.1;
    a *= 0.5;
  }
  return s / 0.875;
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

void main() {
  vec2 size = u_res / u_px;
  vec2 p = v_uv * size;
  float h = size.y;
  float t = u_time;

  // Haze rolls up and sideways through the hall; thinner at the top.
  float hz = fbm(p / (h * 0.42) + vec2(t * 0.03, t * 0.06) + u_seed);
  float hz2 = fbm(p / (h * 0.16) + vec2(-t * 0.05, t * 0.11) + u_seed.yx);
  float air = mix(1.0, 0.25 + 1.5 * hz * (0.6 + 0.4 * hz2), u_haze * (1.0 - 0.6 * u_flare));
  float seen = (0.3 + 0.7 * u_haze) * air;

  float tanw = tan(u_width);
  vec3 lightAir = vec3(0.0);
  vec3 absorb = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= u_n) break;
    vec4 b = u_beam[i];
    vec2 dir = vec2(sin(b.z), -cos(b.z));
    vec2 v = p - b.xy;
    float along = dot(v, dir);
    float perp = abs(v.x * dir.y - v.y * dir.x);
    float radius = max(along, 0.0) * tanw + 3.0;
    float x = perp / radius;
    // A soft cone with a brighter core, fading with distance from the lens.
    float cone = exp(-x * x * 2.4) * (0.65 + 0.35 * exp(-x * x * 9.0));
    float fall = exp(-max(along, 0.0) / (h * 1.15)) * smoothstep(-4.0, 10.0, along);
    float val = cone * fall * b.w;
    // The pool of light on the floor and the lens itself.
    float r = length(v);
    float pool = exp(-r / (h * 0.16)) * u_floor * 0.55 * b.w;
    float lens = exp(-r / 5.0) * 1.2 * b.w;
    lightAir += lin(u_air[i]) * (val * seen + pool + lens);
    absorb += (1.0 - lin(u_gel[i])) * (val * seen * 0.9 + pool * 0.7 + lens * 0.4);
    total += val;
  }

  // Motes: one hashed speck per cell, drifting up, seen only inside a beam.
  vec2 mq = p / 17.0 + vec2(t * 0.05, t * 0.16) + u_seed * 7.0;
  vec2 cell = floor(mq);
  vec2 jitter = vec2(hash(cell), hash(cell + 19.7)) - 0.5;
  vec2 f = fract(mq) - 0.5 - jitter * 0.7;
  float present = step(hash(cell + 4.3), u_motes * 0.55);
  float twinkle = 0.55 + 0.45 * sin(t * 2.3 + hash(cell + 8.1) * 6.2831);
  float mote = smoothstep(0.11, 0.0, length(f)) * present * twinkle * min(total * 2.2, 1.6);

  vec3 bg = lin(u_bg);
  vec3 fg = lin(u_fg);
  float boost = 1.0 + 0.8 * u_flare;

  // Night: a dark hall, deeper at the top; light added in the air.
  vec3 hall = bg * mix(0.62, 0.9, v_uv.y) + fg * 0.002;
  vec3 night = 1.0 - (1.0 - hall) * exp(-(lightAir * 0.9 * boost + vec3(mote) * 0.9));

  // Day: the beams are gels laid over a pale hall, taking out what they do not pass.
  vec3 room = mix(bg, fg, 0.03 * (1.0 - v_uv.y));
  vec3 day = room * exp(-absorb * 1.9 * boost);
  day = mix(day, bg * 0.82 + fg * 0.0, clamp(mote * 0.5, 0.0, 0.5));

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
  paletteKey: string;
  paletteSize: number;
  beams: number;
  haze: number;
  speed: number;
  spread: number;
  intensity: number;
  motes: number;
  floor: number;
  cue: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onCue: (index: number) => void;
  onActive: (active: boolean) => void;
  onHit: (hitting: boolean) => void;
};

type Source = "pointer" | "focus";

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: Source) => void;
  handAway: (source: Source) => void;
  hit: (x: number, y: number) => void;
  letGo: () => void;
  dispose: () => void;
};

/** Each beam's state: its angle on a spring, which yoke it is on, and how much of the sway it rides. */
type Head = {
  a: Float32Array;
  v: Float32Array;
  mode: Uint8Array;
  sway: Float32Array;
  /** Sim time when this head leaves for the current cue. */
  leave: Float32Array;
  /** The look it is heading for. */
  look: Uint8Array;
};

const MODE_SHOW = 0;
const MODE_FOLLOW = 1;
const MODE_HIT = 2;

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
  /** bg, fg, then up to three air colours and three gels. */
  const colours = new Float32Array(24);
  const beamData = new Float32Array(MAX_BEAMS * 4);
  const airData = new Float32Array(MAX_BEAMS * 3);
  const gelData = new Float32Array(MAX_BEAMS * 3);
  const size = { w: 0, h: 0 };
  let light = 0;
  let xs: number[] = [];
  let order: number[] = showOrder(1);
  const head: Head = {
    a: new Float32Array(MAX_BEAMS),
    v: new Float32Array(MAX_BEAMS),
    mode: new Uint8Array(MAX_BEAMS),
    sway: new Float32Array(MAX_BEAMS).fill(1),
    leave: new Float32Array(MAX_BEAMS),
    look: new Uint8Array(MAX_BEAMS),
  };
  /** Show clock (s), the cue clock (s since the last cue), and which cue in the order. */
  const sim = { t: 0, sinceCue: 0, step: 0, count: 1 };
  const hand = {
    x: 0,
    y: 0,
    present: false,
    source: null as Source | null,
    pressed: false,
    px: 0,
    py: 0,
  };
  const flare = { x: 0, v: 0, held: false };
  /** Which beams the hand holds: the pointer's one, or focus's pair. */
  const held = new Int8Array([-1, -1]);

  const countOf = (c: Config) =>
    clamp(Math.ceil(clamp(c.beams, 2, MAX_BEAMS) / 2) * 2, 2, MAX_BEAMS);

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

  const layout = (c: Config) => {
    xs = fixtures(countOf(c), size.w > 0 && size.w < 420);
  };

  const aspect = () => (size.h > 0 ? size.w / size.h : 3);
  const sway = (i: number, n: number) => {
    const pairs = n / 2;
    const left = i < pairs;
    const pair = left ? i : n - 1 - i;
    const phase = pair * 1.1 + (order[0] ?? 0) * 0.7;
    const s = Math.sin((sim.t * Math.PI * 2) / SWAY_PERIOD + phase);
    return (left ? 1 : -1) * s * SWAY;
  };
  /** The angle that points fixture i at a spot in the box. */
  const aimAt = (i: number, x: number, y: number) => {
    const fx = (xs[i] ?? 0.5) * size.w;
    const fy = size.h + 6;
    return clamp(Math.atan2(x - fx, fy - y), -MAX_AIM, MAX_AIM);
  };
  const nearest = (x: number, n: number) => {
    let best = 0;
    let gap = Infinity;
    for (let i = 0; i < n; i += 1) {
      const d = Math.abs((xs[i] ?? 0) * size.w - x);
      if (d < gap) {
        gap = d;
        best = i;
      }
    }
    return best;
  };

  /** Where head i wants to be now (its spring's target, without the sway). */
  const targetOf = (c: Config, i: number, n: number) => {
    const mode = head.mode[i] ?? MODE_SHOW;
    if (mode === MODE_HIT) return aimAt(i, hand.px, hand.py);
    const base = lookAngle(head.look[i] ?? 0, i, n, xs, aspect());
    if (mode === MODE_FOLLOW) {
      const aim = aimAt(i, hand.x, hand.y);
      return base + (aim - base) * clamp(c.pointerStrength, 0, 1);
    }
    return base;
  };

  const assignModes = (c: Config) => {
    const n = countOf(c);
    held[0] = -1;
    held[1] = -1;
    if (hand.present && c.interactive && !hand.pressed) {
      const k = nearest(hand.x, n);
      held[0] = k;
      // Keyboard focus takes the pair, so the two cross at the control.
      if (hand.source === "focus") held[1] = n - 1 - k;
    }
    for (let i = 0; i < n; i += 1) {
      head.mode[i] = hand.pressed
        ? MODE_HIT
        : i === held[0] || i === held[1]
          ? MODE_FOLLOW
          : MODE_SHOW;
    }
  };

  /** A new cue: the pairs leave one after another, from the centre outward. */
  const runCue = (c: Config, first: boolean) => {
    const n = countOf(c);
    const pairs = n / 2;
    if (!first) {
      sim.step = (sim.step + 1) % LOOKS;
      sim.count += 1;
      c.onCue(sim.count);
    }
    const look = order[sim.step] ?? 0;
    const gap = cascade(pairs);
    for (let i = 0; i < n; i += 1) {
      const pair = i < pairs ? i : n - 1 - i;
      head.look[i] = look;
      head.leave[i] = sim.t + (pairs - 1 - pair) * gap;
    }
    sim.sinceCue = 0;
  };

  /** Snap every head to its look: the first frame, a reduced-motion frame. */
  const place = (c: Config) => {
    const n = countOf(c);
    assignModes(c);
    for (let i = 0; i < n; i += 1) {
      head.a[i] = targetOf(c, i, n);
      head.v[i] = 0;
      head.sway[i] = c.motionSafe && head.mode[i] === MODE_SHOW ? 1 : 0;
    }
    flare.x = c.motionSafe ? flare.x : flare.held ? 0.7 : 0;
    flare.v = c.motionSafe ? flare.v : 0;
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const rand = lcg(c.seed * 17 + 3);
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_light ?? null, light);
    gl.uniform3f(
      u.u_bg ?? null,
      colours[0] ?? 0,
      colours[1] ?? 0,
      colours[2] ?? 0,
    );
    gl.uniform3f(
      u.u_fg ?? null,
      colours[3] ?? 0,
      colours[4] ?? 0,
      colours[5] ?? 0,
    );
    const n = countOf(c);
    const m = Math.max(1, Math.min(3, c.paletteSize));
    for (let i = 0; i < n; i += 1) {
      const pair = i < n / 2 ? i : n - 1 - i;
      const k = pair % m;
      for (let j = 0; j < 3; j += 1) {
        airData[i * 3 + j] = colours[6 + k * 3 + j] ?? 1;
        gelData[i * 3 + j] = colours[15 + k * 3 + j] ?? 1;
      }
    }
    gl.uniform3fv(u.u_air ?? null, airData);
    gl.uniform3fv(u.u_gel ?? null, gelData);
    gl.uniform1f(u.u_n ?? null, n);
    gl.uniform1f(u.u_width ?? null, clamp(c.spread, 2, 12) * 0.5 * DEG);
    gl.uniform1f(u.u_haze ?? null, clamp(c.haze, 0, 1));
    gl.uniform1f(u.u_motes ?? null, clamp(c.motes, 0, 1));
    gl.uniform1f(u.u_floor ?? null, clamp(c.floor, 0, 1));
    gl.uniform2f(u.u_seed ?? null, rand() * 9, rand() * 9);
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const n = countOf(c);
    const power = clamp(c.intensity, 0, 1.5);
    for (let i = 0; i < n; i += 1) {
      const swing = c.motionSafe ? sway(i, n) * (head.sway[i] ?? 0) : 0;
      beamData[i * 4] = (xs[i] ?? 0.5) * size.w;
      beamData[i * 4 + 1] = size.h + 6;
      beamData[i * 4 + 2] = (head.a[i] ?? 0) + swing;
      beamData[i * 4 + 3] = power * (head.mode[i] === MODE_FOLLOW ? 1.18 : 1);
    }
    program.use();
    gl.uniform4fv(u.u_beam ?? null, beamData);
    gl.uniform1f(u.u_time ?? null, sim.t);
    gl.uniform1f(u.u_flare ?? null, clamp(flare.x, 0, 1.4));
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    const n = countOf(c);
    let moving = false;
    const running = !c.paused && c.speed > 0;
    if (running) {
      sim.t += dt * clamp(c.speed, 0, 2);
      sim.sinceCue += dt;
      if (sim.sinceCue * 1000 >= clamp(c.cue, 2000, 12000)) runCue(c, false);
      moving = true;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    let travelling = false;
    for (let i = 0; i < n; i += 1) {
      const mode = head.mode[i] ?? MODE_SHOW;
      // A head waits for its turn in the cascade before it leaves.
      if (mode === MODE_SHOW && sim.t < (head.leave[i] ?? 0)) {
        travelling = true;
        continue;
      }
      const to = targetOf(c, i, n);
      const k = mode === MODE_HIT ? HIT : mode === MODE_FOLLOW ? FOLLOW : SHOW;
      let a = head.a[i] ?? 0;
      let v = head.v[i] ?? 0;
      for (let s = 0; s < steps; s += 1) {
        v += ((k.stiffness * (to - a) - k.damping * v) / k.mass) * h;
        a += v * h;
      }
      if (Math.abs(to - a) < 0.0004 && Math.abs(v) < 0.004) {
        a = to;
        v = 0;
      } else travelling = true;
      head.a[i] = a;
      head.v[i] = v;
      // The sway fades out under a hand and back in when the head rejoins.
      const want = mode === MODE_SHOW ? 1 : 0;
      const sw = head.sway[i] ?? 0;
      const next = sw + (want - sw) * (1 - Math.exp(-dt / 0.35));
      head.sway[i] = Math.abs(want - next) < 0.002 ? want : next;
      if (head.sway[i] !== want) travelling = true;
    }
    for (let s = 0; s < steps; s += 1) {
      const to = flare.held ? 0.55 : 0;
      flare.v +=
        ((SHOW.stiffness * (to - flare.x) - SHOW.damping * flare.v) /
          SHOW.mass) *
        h;
      flare.x += flare.v * h;
    }
    const flaring =
      Math.abs(flare.x - (flare.held ? 0.55 : 0)) > 0.002 ||
      Math.abs(flare.v) > 0.02;
    if (!flaring) {
      flare.x = flare.held ? 0.55 : 0;
      flare.v = 0;
    }
    return moving || travelling || flaring;
  };

  const busy = () => {
    if (flare.v !== 0) return true;
    for (let i = 0; i < MAX_BEAMS; i += 1) if (head.v[i] !== 0) return true;
    return false;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    if (c.motionSafe && !busy() && last && now - drawnAt < CALM_FRAME) {
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

  /** The hand changed: who follows it, and (reduced motion) where everything lands. */
  const rehome = () => {
    const c = cfg;
    if (!c) return;
    assignModes(c);
    if (!c.motionSafe) {
      place(c);
      draw();
      return;
    }
    kick();
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 8; i += 1) {
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
    layout(c);
    if (first) place(c);
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

  /** A fresh show: the seeded order, the first look, every head on it. */
  const restart = (c: Config) => {
    order = showOrder(c.seed);
    sim.step = 0;
    sim.count = 1;
    sim.sinceCue = 0;
    const rand = lcg(c.seed * 29 + 11);
    sim.t = rand() * SWAY_PERIOD;
    runCue(c, true);
    for (let i = 0; i < MAX_BEAMS; i += 1) head.leave[i] = 0;
    if (size.w > 0) {
      layout(c);
      place(c);
    }
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!was) restart(next);
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
      if (was.seed !== next.seed) restart(next);
      if (countOf(was) !== countOf(next)) {
        layout(next);
        assignModes(next);
        // New fixtures join the show where it stands.
        runCue(next, true);
        for (let i = 0; i < MAX_BEAMS; i += 1) head.leave[i] = 0;
        place(next);
      }
      if (was.paletteKey !== next.paletteKey) readColours();
      else statics();
      if (!next.interactive && (hand.present || hand.pressed)) {
        if (hand.pressed) next.onHit(false);
        hand.present = false;
        hand.pressed = false;
        hand.source = null;
        flare.held = false;
        setActive(false);
        assignModes(next);
      }
      if (!next.motionSafe) place(next);
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
      rehome();
    },
    handAway(src) {
      if (hand.source !== src) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      rehome();
    },
    hit(x, y) {
      const c = cfg;
      if (!c || !c.interactive) return;
      const was = hand.pressed;
      hand.pressed = true;
      hand.px = x;
      hand.py = y;
      flare.held = true;
      if (!was) c.onHit(true);
      if (c.motionSafe) {
        flare.v += FLARE * (0.4 + 0.6 * clamp(c.pointerStrength, 0, 1));
      }
      rehome();
    },
    letGo() {
      if (!hand.pressed) return;
      hand.pressed = false;
      flare.held = false;
      cfg?.onHit(false);
      rehome();
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
 * A background of a lighting rig along the bottom edge throwing narrow
 * volumetric beams up through haze, the beams working in mirrored pairs: a
 * desk runs the show, and every cue the pairs leave one after another from
 * the centre outward for the next look — a fan, a stack of X shapes over the
 * centre, straight up, a lean, a gather high above — on springs with the
 * `springs.drift` constants, a slow sway riding on every look. Haze drifts
 * through the hall and is what makes the light visible, motes glint only
 * where a beam passes, and light pools on the floor at every fixture.
 *
 * The beam nearest the pointer leaves the show and follows the hand on
 * `springs.glide`, like a follow spot. A press on the bare background brings
 * every beam onto it on `springs.snap` — one crisp overshoot — and the rig
 * flares on a drift-spring impulse, holding while the press does; keyboard
 * focus on a control inside puts the nearest pair on it, crossing there. One
 * fullscreen WebGL2 draw at half the capped pixel ratio, 30 frames a second
 * while the show sways, nothing off screen or in a hidden page. Without
 * WebGL2 a CSS still frame of the first look stands in; under reduced motion
 * the rig holds its first look and lands wherever the hand sends it at once.
 */
export function StageBeams({
  children,
  beams = 6,
  haze = 0.55,
  colors = "house",
  speed = 1,
  spread = 5,
  intensity = 1,
  motes = 0.5,
  floor = 0.6,
  cue = 4800,
  interactive = true,
  pointerStrength = 0.8,
  paused = false,
  seed = 1,
  dpr = 2,
  onCue,
  onActiveChange,
  onHit,
  className,
}: StageBeamsProps) {
  const motionSafe = useMotionSafe();
  const paletteKey = paletteKeyOf(colors);
  const palette = React.useMemo(() => paletteOf(paletteKey), [paletteKey]);
  const paints = React.useMemo(() => {
    const air = [0, 1, 2].map((i) =>
      lightOf(palette[i] ?? palette[0] ?? "var(--foreground)"),
    );
    const gel = [0, 1, 2].map((i) =>
      gelOf(palette[i] ?? palette[0] ?? "var(--foreground)"),
    );
    return ["var(--background)", "var(--foreground)", ...air, ...gel];
  }, [palette]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportCue = React.useRef(onCue);
  const reportActive = React.useRef(onActiveChange);
  const reportHit = React.useRef(onHit);
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    paletteKey,
    paletteSize: palette.length,
    beams,
    haze,
    speed,
    spread,
    intensity,
    motes,
    floor,
    cue,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onCue: (i) => reportCue.current?.(i),
    onActive: (a) => reportActive.current?.(a),
    onHit: (h) => reportHit.current?.(h),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportCue.current = onCue;
    reportActive.current = onActiveChange;
    reportHit.current = onHit;
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
    // A press on a control is the control's; only the bare stage is a hit.
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.hit(at.x, at.y);
    // The rig holds the hit until the press ends, wherever it ends.
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

  // Keyboard focus on a control inside is a follow spot's mark.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
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
        // A finger directs a beam as it moves across; an upright swipe is
        // the page's.
        "group/stage-beams relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/stage-beams:opacity-0"
        style={standIn(paints, beams, palette.length, seed)}
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
 * browser without WebGL2: the rig on its first look, each beam a soft conic
 * wedge from its fixture, over a pool of light at the floor.
 */
function standIn(
  paints: readonly string[],
  beams: number,
  paletteSize: number,
  seed: number,
): React.CSSProperties {
  const n = clamp(Math.ceil(clamp(beams, 2, MAX_BEAMS) / 2) * 2, 2, MAX_BEAMS);
  const xs = fixtures(n, false);
  const look = showOrder(seed)[0] ?? 0;
  const m = Math.max(1, Math.min(3, paletteSize));
  const layers: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const pair = i < n / 2 ? i : n - 1 - i;
    const tint = paints[2 + (pair % m)] ?? "white";
    const a = (lookAngle(look, i, n, xs, 3.2) * 180) / Math.PI;
    const x = Math.round((xs[i] ?? 0.5) * 1000) / 10;
    const from = Math.round((a - 3) * 10) / 10;
    layers.push(
      `conic-gradient(from ${from}deg at ${x}% 103%, color-mix(in oklab, ${tint} 26%, transparent) 0deg, color-mix(in oklab, ${tint} 34%, transparent) 3deg, color-mix(in oklab, ${tint} 26%, transparent) 6deg, transparent 6deg)`,
      `radial-gradient(ellipse 9% 18% at ${x}% 100%, color-mix(in oklab, ${tint} 45%, transparent), transparent)`,
    );
  }
  return {
    backgroundColor:
      "color-mix(in oklab, var(--background) 94%, var(--foreground))",
    backgroundImage: [
      "linear-gradient(to bottom, color-mix(in oklab, var(--background) 80%, transparent) 0%, transparent 70%)",
      ...layers,
    ].join(", "),
  };
}
