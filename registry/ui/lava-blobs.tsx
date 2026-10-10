"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LavaBlobsPalette = "amber" | "rose" | "cobalt" | "moss";

export type LavaBlobsProps = {
  /** Content laid over the lamp, such as a headline. It keeps every click, focus and key. */
  children?: React.ReactNode;
  /** How many blobs of wax, 3 to 10. @default 6 */
  count?: number;
  /** How fast the wax lives: 0.25 is a slow evening, 2 a lamp left on all day. @default 1 */
  speed?: number;
  /** The wax: a named set from the theme tokens, or your own [cool wax, hot wax, liquid tint] CSS colours. @default "amber" */
  colors?: LavaBlobsPalette | readonly string[];
  /** Blob size relative to the column, 0.6 to 1.4. @default 1 */
  size?: number;
  /** How hard the base heats the wax, 0 to 1: more heat keeps more of it aloft. @default 0.5 */
  heat?: number;
  /** The glossy specular and rim light on the wax, 0 to 1. @default 0.6 */
  gloss?: number;
  /** The wax's inner glow and the coil's light in the liquid, 0 to 1. @default 0.5 */
  glow?: number;
  /** How strongly the pointer's own blob draws wax toward it, 0 to 1. @default 0.6 */
  pull?: number;
  /** The pointer blob's radius, in px. @default 30 */
  handSize?: number;
  /** The pointer adds its blob; a press grips nearby wax and a release throws it. @default true */
  interactive?: boolean;
  /** Keyboard focus on a control inside sends the pointer blob there; Enter or Space grips. @default true */
  followFocus?: boolean;
  /** Hold the wax still and stop the frame loop. @default false */
  paused?: boolean;
  /** Seed for the sizes, the starting composition and the wander. @default 5 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when a press (or Enter/Space on a control inside) grips wax, and again when it lets go. */
  onGripChange?: (gripped: boolean) => void;
  /** Classes for the box. Give it a height; children are laid out inside it. */
  className?: string;
};

const PALETTES: Record<LavaBlobsPalette, readonly [string, string, string]> = {
  // Wax is pigment: hue and chroma from a token at a fixed lightness, so it
  // reads the same on a light page and a dark one.
  amber: [
    "oklch(from var(--danger) 0.6 0.19 h)",
    "oklch(from var(--warn) 0.87 0.15 h)",
    "oklch(from var(--warn) 0.62 0.1 h)",
  ],
  rose: [
    "oklch(from var(--danger) 0.52 0.17 350)",
    "oklch(from var(--danger) 0.82 0.11 20)",
    "oklch(from var(--danger) 0.6 0.08 340)",
  ],
  cobalt: [
    "oklch(from var(--accent-bright) 0.48 0.2 h)",
    "oklch(from var(--signal) 0.86 0.12 h)",
    "oklch(from var(--accent-bright) 0.58 0.1 h)",
  ],
  moss: [
    "oklch(from var(--success) 0.5 0.12 h)",
    "oklch(from var(--warn) 0.88 0.13 h)",
    "oklch(from var(--success) 0.6 0.07 h)",
  ],
};

const MAX = 10;
const KERNELS = MAX + 1;
/** Where a lone kernel crosses the threshold, as a fraction of its reach. */
const EDGE = 0.562;
const THRESHOLD = 0.32;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_blobs[${KERNELS}];
uniform int u_count;
uniform vec3 u_pool;
uniform vec3 u_cool;
uniform vec3 u_hot;
uniform vec3 u_tint;
uniform vec3 u_base;
uniform vec3 u_shine;
uniform float u_gloss;
uniform float u_glow;
uniform float u_dark;
in vec2 v_uv;
out vec4 o_color;

void main() {
  vec2 p = v_uv * u_res;
  // Wyvill's kernel, (1 - s^2)^3: finite reach, smooth necks where two
  // reaches overlap, and a gradient we can write down instead of sampling.
  float field = 0.0;
  vec2 grad = vec2(0.0);
  float heat = 0.0;
  for (int i = 0; i < ${KERNELS}; i += 1) {
    if (i >= u_count) break;
    vec4 b = u_blobs[i];
    vec2 d = p - b.xy;
    float rr = b.z * b.z;
    float s2 = dot(d, d) / rr;
    if (s2 >= 1.0) continue;
    float k = 1.0 - s2;
    float w = k * k * k;
    field += w;
    grad += -6.0 * d * k * k / rr;
    heat += w * b.w;
  }
  // The pool of wax on the floor, its surface swaying slowly.
  float surface = u_pool.x + 4.0 * sin(p.x * 0.021 + u_pool.z) + 3.0 * sin(p.x * 0.047 - u_pool.z * 1.3);
  float s = (surface - p.y) / u_pool.y;
  // Below its surface the pool keeps thickening, so it has a slope to light
  // and a core that glows hotter toward the coil.
  float poolW = 1.0 - 0.8 * s;
  vec2 poolG = vec2(0.0, 0.8 / u_pool.y);
  if (s > 0.0) {
    float k = max(1.0 - s * s, 0.0);
    poolW = k * k * k;
    poolG = vec2(0.0, 6.0 * s * k * k / u_pool.y);
  }
  field += poolW;
  grad += poolG;
  heat += poolW * clamp(0.62 - 0.25 * s, 0.5, 0.95);
  float t = field > 0.0001 ? clamp(heat / field, 0.0, 1.0) : 0.0;

  // The liquid: the surface colour washed with the tint, deeper toward the
  // floor, warmed by the coil below and by hot wax nearby.
  float depth = v_uv.y;
  vec3 liquid = mix(u_base, u_tint, mix(0.08, 0.2, depth) * mix(1.0, 1.6, u_dark));
  float coil = exp(-pow((u_res.y - p.y) / (u_res.y * 0.24), 2.0));
  liquid = mix(liquid, u_hot, coil * u_glow * mix(0.16, 0.3, u_dark));
  float near = smoothstep(0.02, ${THRESHOLD}, field);
  vec3 wax = mix(u_cool, u_hot, t);
  liquid = mix(liquid, wax, near * near * t * u_glow * mix(0.22, 0.4, u_dark));
  // Glass: two faint vertical reflections down the column's sides.
  float glass = exp(-pow((v_uv.x - 0.07) / 0.025, 2.0)) * 0.6 + exp(-pow((v_uv.x - 0.94) / 0.012, 2.0)) * 0.35;
  liquid = mix(liquid, u_shine, glass * mix(0.1, 0.06, u_dark));

  // The wax surface: height grows as sqrt(field - threshold), a dome whose
  // slope steepens to the rim, so the normal tilts there and catches light.
  float excess = max(field - ${THRESHOLD}, 0.0);
  vec2 slope = grad * 9.0 / (2.0 * sqrt(excess + 0.015));
  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 light = normalize(vec3(-0.45, -0.6, 0.66));
  float diffuse = clamp(dot(n, light) * 0.5 + 0.5, 0.0, 1.0);
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, halfway), 0.0), 26.0) * u_gloss * 0.55;
  float rim = pow(1.0 - n.z, 3.0) * u_gloss * 0.2;
  // Translucent wax: a deeper skin where it is thin, a core lit from within
  // where it is thick, brighter the hotter it runs.
  float thick = clamp(sqrt(excess) * 1.5, 0.0, 1.0);
  vec3 skin = wax * 0.8;
  vec3 core = mix(wax, u_hot, 0.35 + 0.4 * u_glow);
  vec3 col = mix(skin, core, thick * (0.5 + 0.5 * t));
  col *= 0.84 + 0.26 * diffuse;
  col = mix(col, u_shine, clamp(spec + rim, 0.0, 1.0));

  float aa = max(fwidth(field), 0.0005);
  float inside = smoothstep(${THRESHOLD} - aa, ${THRESHOLD} + aa, field);
  o_color = vec4(mix(liquid, col, inside), 1.0);
}
`;

type Rgb = [number, number, number];

type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  t: number;
  phase: number;
  rate: number;
  /** How readily this blob takes the coil's heat, so blobs fall out of step. */
  eff: number;
  held: boolean;
  ox: number;
  oy: number;
};

type Rest = { fx: number; fy: number; size: number; t: number };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));

const hash = (i: number, seed: number) => {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * The composed still, as fractions of the column: two blobs caught mid-merge
 * high up, one leaving the pool, one sinking, the rest seeded around them.
 * The live lamp starts from exactly here, so the hand-off is seamless.
 */
function restLayout(count: number, seed: number): Rest[] {
  const anchors: Rest[] = [
    { fx: 0.4, fy: 0.3, size: 1.22, t: 0.66 },
    { fx: 0.55, fy: 0.39, size: 0.9, t: 0.6 },
    { fx: 0.3, fy: 0.79, size: 1.05, t: 0.84 },
    { fx: 0.68, fy: 0.6, size: 0.95, t: 0.32 },
    { fx: 0.62, fy: 0.16, size: 0.8, t: 0.4 },
    { fx: 0.24, fy: 0.54, size: 0.78, t: 0.55 },
    { fx: 0.76, fy: 0.82, size: 0.85, t: 0.7 },
    { fx: 0.46, fy: 0.68, size: 0.7, t: 0.42 },
    { fx: 0.28, fy: 0.12, size: 0.72, t: 0.36 },
    { fx: 0.8, fy: 0.36, size: 0.68, t: 0.5 },
  ];
  const n = clamp(Math.round(count), 3, MAX);
  return anchors.slice(0, n).map((a, i) => ({
    fx: r3(clamp(a.fx + (hash(i * 4 + 1, seed) - 0.5) * 0.08, 0.16, 0.84)),
    fy: r3(clamp(a.fy + (hash(i * 4 + 2, seed) - 0.5) * 0.05, 0.1, 0.84)),
    size: r3(a.size * (0.92 + 0.16 * hash(i * 4 + 3, seed))),
    t: a.t,
  }));
}

/** A blob's visible radius in px for a column `w` wide. */
const blobRadius = (w: number, scale: number, size: number) =>
  clamp(w * 0.12, 18, 58) * scale * size;

/** The key light, from the upper left, and its half vector with the eye. */
const LIGHT = (() => {
  const l = Math.hypot(-0.45, -0.6, 0.66);
  return [-0.45 / l, -0.6 / l, 0.66 / l] as const;
})();
const HALF = (() => {
  const x = LIGHT[0];
  const y = LIGHT[1];
  const z = LIGHT[2] + 1;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l] as const;
})();

/** One semi-implicit spring step toward `target`; returns the new velocity. */
function springStep(
  pos: number,
  vel: number,
  target: number,
  spring: { stiffness: number; damping: number; mass: number },
  dt: number,
): number {
  return (
    vel +
    ((spring.stiffness * (target - pos) - spring.damping * vel) / spring.mass) *
      dt
  );
}

/**
 * A tall column of warm liquid in which wax rises and falls. Each blob
 * carries a temperature: the floor heats it, the upper column cools it
 * (faster near the cap, slower for big blobs), and buoyancy follows
 * temperature, so wax swells off the pool, rises, lingers, cools and sinks
 * back. Overlapping blobs pull together, share heat and travel as one mass
 * until their heat parts them. The wax is a metaball field drawn in one
 * WebGL2 pass with soft light — a wrap diffuse, a glossy specular, a rim and
 * an inner glow that follows temperature — over liquid lit by the coil.
 *
 * The pointer adds its own blob, following on springs.glide and swelling in
 * on springs.snap, which draws nearby wax toward it so a sweep drags blobs
 * along. Pressing grips: wax in reach is drawn into one mass that rides the
 * pointer; releasing throws it with the pointer's velocity and it tears
 * back into its blobs. Keyboard focus on a control inside sends the hand
 * there, and Enter or Space on it is a grip pulse. Without WebGL2 a Canvas 2D
 * renderer draws the same field at quarter resolution. Under reduced motion
 * it is one lit still frame; the hand appears where you point, instantly.
 */
export function LavaBlobs({
  children,
  count = 6,
  speed = 1,
  colors = "amber",
  size = 1,
  heat = 0.5,
  gloss = 0.6,
  glow = 0.5,
  pull = 0.6,
  handSize = 30,
  interactive = true,
  followFocus = true,
  paused = false,
  seed = 5,
  dpr = 2,
  onGripChange,
  className,
}: LavaBlobsProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const api = React.useRef<{
    recolour: () => void;
    recount: () => void;
    wake: () => void;
  } | null>(null);

  const palette: readonly string[] =
    typeof colors === "string"
      ? (PALETTES[colors as LavaBlobsPalette] ?? PALETTES.amber)
      : colors.length >= 2
        ? colors
        : PALETTES.amber;
  const cool = palette[0] ?? PALETTES.amber[0];
  const hot = palette[1] ?? PALETTES.amber[1];
  const tint = palette[2] ?? palette[0] ?? PALETTES.amber[2];
  const paletteKey = `${cool}|${hot}|${tint}`;
  const n = clamp(Math.round(count), 3, MAX);
  const scale = clamp(size, 0.6, 1.4);
  const rest = React.useMemo(() => restLayout(n, seed), [n, seed]);

  const params = React.useRef({
    n,
    speed,
    scale,
    heat,
    gloss,
    glow,
    pull,
    handSize,
    interactive,
    followFocus,
    paused,
    dpr,
    motionSafe,
    onGripChange,
    rest,
    cool,
    hot,
    tint,
  });
  React.useEffect(() => {
    params.current = {
      n,
      speed,
      scale,
      heat,
      gloss,
      glow,
      pull,
      handSize,
      interactive,
      followFocus,
      paused,
      dpr,
      motionSafe,
      onGripChange,
      rest,
      cool,
      hot,
      tint,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || failed) return;

    // WebGL2 first; a Canvas 2D renderer of the same field otherwise.
    let gl = createGL(canvas, { alpha: false });
    let program = gl ? createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT) : null;
    let tri = gl && program ? createFullscreenTriangle(gl, program) : null;
    let ctx: CanvasRenderingContext2D | null = null;
    if (!gl || !program || !tri) {
      program?.dispose();
      tri?.dispose();
      gl = null;
      program = null;
      tri = null;
      ctx = canvas.getContext("2d");
      if (!ctx) return;
    }

    const blobData = new Float32Array(KERNELS * 4);
    const bodies: Body[] = Array.from({ length: MAX }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 20,
      t: 0.5,
      phase: 0,
      rate: 0,
      eff: 1,
      held: false,
      ox: 0,
      oy: 0,
    }));
    let live = 0;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let carry = 0;
    let clock = 0;
    let inView = true;
    let lost = false;
    let shown = false;
    let readyFrame = 0;
    let placed = false;
    let pulse = 0;
    let poolPhase = hash(33, seed) * 6;
    const hand = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 0,
      vr: 0,
      tx: 0,
      ty: 0,
      on: false,
      gripping: false,
      touch: false,
      down: false,
    };
    let focusPoint: { x: number; y: number } | null = null;
    let colours = {
      cool: [0.8, 0.3, 0.2] as Rgb,
      hot: [1, 0.85, 0.4] as Rgb,
      tint: [0.8, 0.6, 0.3] as Rgb,
      base: [1, 1, 1] as Rgb,
      shine: [1, 1, 1] as Rgb,
      dark: 0,
    };

    const reader = (() => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.getContext("2d", { willReadFrequently: true });
    })();
    const rgb = (css: string): Rgb => {
      const probe = probeRef.current;
      if (!probe || !reader) return [0.5, 0.5, 0.5];
      probe.style.color = css;
      reader.clearRect(0, 0, 1, 1);
      reader.fillStyle = "rgb(128, 128, 128)";
      reader.fillStyle = getComputedStyle(probe).color;
      reader.fillRect(0, 0, 1, 1);
      const d = reader.getImageData(0, 0, 1, 1).data;
      return [(d[0] ?? 128) / 255, (d[1] ?? 128) / 255, (d[2] ?? 128) / 255];
    };
    const recolour = () => {
      const p = params.current;
      const base = rgb("var(--card)");
      colours = {
        cool: rgb(p.cool),
        hot: rgb(p.hot),
        tint: rgb(p.tint),
        base,
        shine: rgb("var(--primary-foreground)"),
        dark:
          0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2] < 0.5 ? 1 : 0,
      };
    };

    /** Places blobs on the rest composition; new blobs join from the pool. */
    const populate = (fromRest: boolean) => {
      const p = params.current;
      const before = live;
      live = p.n;
      for (let i = 0; i < live; i += 1) {
        const b = bodies[i];
        const r = p.rest[i];
        if (!b || !r) continue;
        b.r = blobRadius(w, p.scale, r.size);
        b.phase = hash(i * 7 + 5, seed) * Math.PI * 2;
        b.rate = 0.3 + 0.4 * hash(i * 7 + 6, seed);
        b.eff = 0.75 + 0.5 * hash(i * 7 + 8, seed);
        if (fromRest || i >= before) {
          const fresh = !fromRest && placed;
          b.x = r.fx * w;
          // A blob added to a running lamp is born cold in the pool.
          b.y = fresh ? h - b.r * 0.6 : r.fy * h;
          b.t = fresh ? 0.3 : r.t;
          b.vx = 0;
          b.vy = 0;
          b.held = false;
        }
      }
      placed = true;
    };

    const rescale = () => {
      const p = params.current;
      for (let i = 0; i < live; i += 1) {
        const b = bodies[i];
        const r = p.rest[i];
        if (b && r) b.r = blobRadius(w, p.scale, r.size);
      }
    };

    /** Rest pose: the composition as authored, the hand where it is asked. */
    const pose = () => {
      const p = params.current;
      for (let i = 0; i < live; i += 1) {
        const b = bodies[i];
        const r = p.rest[i];
        if (!b || !r) continue;
        b.x = r.fx * w;
        b.y = r.fy * h;
        b.t = r.t;
        b.vx = 0;
        b.vy = 0;
        if (hand.gripping && hand.on) {
          const dx = b.x - hand.x;
          const dy = b.y - hand.y;
          if (Math.hypot(dx, dy) < hand.r * 2.6 + b.r * 2) {
            b.x = hand.x + dx * 0.32;
            b.y = hand.y + dy * 0.32;
          }
        }
      }
      hand.x = hand.tx;
      hand.y = hand.ty;
      hand.vx = 0;
      hand.vy = 0;
      hand.r = hand.on ? handRadius() : 0;
    };

    const handRadius = () =>
      Math.max(0, params.current.handSize) * (hand.gripping ? 1.25 : 1);

    const integrate = (dt: number) => {
      const p = params.current;
      const U = 0.12 * h;
      const drag = 2.2;
      const heatRate = 0.5 + 1.2 * clamp(p.heat, 0, 1);
      const lean = clamp(p.pull, 0, 1);
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const step = dt / steps;
      const slow = clamp(p.speed, 0.25, 2);
      let meanR = 0;
      for (let i = 0; i < live; i += 1) meanR += (bodies[i]?.r ?? 20) / live;
      for (let s = 0; s < steps; s += 1) {
        // The lamp's own time runs at `speed`; the hand answers in real time.
        const lt = step * slow;
        clock += lt;
        poolPhase += lt * 0.35;
        // The hand: position on glide, radius in on snap, out on a tween.
        const target = hand.on ? handRadius() : 0;
        if (target > hand.r) {
          hand.vr = springStep(hand.r, hand.vr, target, springs.snap, step);
          hand.r += hand.vr * step;
        } else {
          hand.vr = 0;
          hand.r += (target - hand.r) * (1 - Math.exp(-step / 0.12));
        }
        hand.vx = springStep(hand.x, hand.vx, hand.tx, springs.glide, step);
        hand.vy = springStep(hand.y, hand.vy, hand.ty, springs.glide, step);
        hand.x += hand.vx * step;
        hand.y += hand.vy * step;

        for (let i = 0; i < live; i += 1) {
          const b = bodies[i];
          if (!b) continue;
          const fy = clamp(b.y / h, 0, 1);
          // The coil heats wax resting on the floor, the cap cools wax that
          // reaches it (big blobs hold their heat longer), and the column
          // between barely changes either. Each end also holds on — the pool
          // until a blob is well warmed, the cap until it is well cooled — so
          // wax crosses the whole column instead of idling where it is
          // lukewarm.
          const floor = fy > 0.84;
          const cap = fy < 0.28;
          if (floor) {
            b.t += lt * heatRate * b.eff * (1 - b.t) * ((fy - 0.84) / 0.16);
          }
          const cooling =
            (0.01 + (fy < 0.3 ? (0.7 * (0.3 - fy)) / 0.3 : 0)) *
            (meanR / Math.max(4, b.r));
          b.t -= lt * cooling * b.t;
          b.t = clamp(b.t, 0, 1);
          const neutral = floor ? 0.72 : cap ? 0.3 : 0.5;
          let ax = 0;
          let ay = -(b.t - neutral) * 2 * U * drag;
          // A slow seeded wander, so no blob climbs a plumb line.
          ax += U * 0.6 * Math.sin(clock * b.rate + b.phase);
          // Soft walls, a cap, and the floor the pool rests on.
          const pad = 4;
          if (b.x < b.r + pad) ax += (b.r + pad - b.x) * 30;
          if (b.x > w - b.r - pad) ax -= (b.x - (w - b.r - pad)) * 30;
          if (b.y < b.r * 0.9) ay += (b.r * 0.9 - b.y) * 30;
          if (b.y > h - b.r * 0.55) ay -= (b.y - (h - b.r * 0.55)) * 30;
          // Wax that touches pulls together, shares heat and moves as one.
          for (let j = 0; j < live; j += 1) {
            if (j === i) continue;
            const o = bodies[j];
            if (!o) continue;
            const dx = o.x - b.x;
            const dy = o.y - b.y;
            const d = Math.hypot(dx, dy) || 0.001;
            const reach = (b.r + o.r) * 1.05;
            if (d > reach) continue;
            const touch = 1 - d / reach;
            const core = (b.r + o.r) * 0.62;
            const push = d < core ? ((core - d) / core) * 220 : 0;
            ax += (dx / d) * (touch * 30 - push);
            ay += (dy / d) * (touch * 30 - push);
            b.t += (o.t - b.t) * lt * 0.12 * touch;
            b.vx += (o.vx - b.vx) * lt * 0.4 * touch;
            b.vy += (o.vy - b.vy) * lt * 0.4 * touch;
          }
          if (b.held && hand.on) {
            // Gripped: drawn into a tight cluster that rides the hand.
            b.vx = springStep(
              b.x,
              b.vx,
              hand.x + b.ox * 0.45,
              springs.glide,
              step,
            );
            b.vy = springStep(
              b.y,
              b.vy,
              hand.y + b.oy * 0.45,
              springs.glide,
              step,
            );
            b.x += b.vx * step;
            b.y += b.vy * step;
            b.t += (0.72 - b.t) * step * 1.5;
            continue;
          }
          if (hand.on && hand.r > 1 && lean > 0) {
            const dx = hand.x - b.x;
            const dy = hand.y - b.y;
            const d = Math.hypot(dx, dy) || 0.001;
            const reach = hand.r + b.r + 70;
            if (d < reach) {
              const near = 1 - d / reach;
              ax += (dx / d) * near * 900 * lean;
              ay += (dy / d) * near * 900 * lean;
              // Wax the hand touches is carried along with it.
              const touch = clamp(1 - d / (hand.r + b.r), 0, 1);
              b.vx += (hand.vx - b.vx) * step * 5 * lean * touch;
              b.vy += (hand.vy - b.vy) * step * 5 * lean * touch;
            }
          }
          b.vx += ax * lt;
          b.vy += ay * lt;
          const k = Math.exp(-drag * lt);
          b.vx *= k;
          b.vy *= k;
          b.x += b.vx * step;
          b.y += b.vy * step;
          b.x = clamp(b.x, b.r * 0.4, w - b.r * 0.4);
          b.y = clamp(b.y, b.r * 0.4, h);
        }
      }
    };

    const fill = () => {
      for (let i = 0; i < live; i += 1) {
        const b = bodies[i];
        if (!b) continue;
        blobData[i * 4] = b.x;
        blobData[i * 4 + 1] = b.y;
        blobData[i * 4 + 2] = b.r / EDGE;
        blobData[i * 4 + 3] = b.t;
      }
      const k = live * 4;
      blobData[k] = hand.x;
      blobData[k + 1] = hand.y;
      blobData[k + 2] = Math.max(0.5, hand.r) / EDGE;
      blobData[k + 3] = hand.r > 0.5 ? 0.74 : 0;
    };
    const kernelCount = () => live + (hand.r > 0.5 ? 1 : 0);

    // The fallback renderer: the same field and light, on the CPU, at a
    // quarter of the pixels, scaled up smoothly.
    const small = document.createElement("canvas");
    const smallCtx = ctx ? small.getContext("2d") : null;
    let image: ImageData | null = null;
    const paint2d = () => {
      if (!ctx || !smallCtx) return;
      const cell = 3;
      const cw = Math.max(1, Math.ceil(w / cell));
      const ch = Math.max(1, Math.ceil(h / cell));
      if (small.width !== cw || small.height !== ch || !image) {
        small.width = cw;
        small.height = ch;
        image = smallCtx.createImageData(cw, ch);
      }
      const p = params.current;
      const c = colours;
      const data = image.data;
      const count = kernelCount();
      const surfaceAt = (x: number) =>
        h * 0.9 +
        4 * Math.sin(x * 0.021 + poolPhase) +
        3 * Math.sin(x * 0.047 - poolPhase * 1.3);
      const poolDepth = h * 0.09;
      for (let row = 0; row < ch; row += 1) {
        const y = (row + 0.5) * cell;
        for (let col = 0; col < cw; col += 1) {
          const x = (col + 0.5) * cell;
          let field = 0;
          let gx = 0;
          let gy = 0;
          let heatSum = 0;
          for (let i = 0; i < count; i += 1) {
            const bx = blobData[i * 4] ?? 0;
            const by = blobData[i * 4 + 1] ?? 0;
            const br = blobData[i * 4 + 2] ?? 1;
            const dx = x - bx;
            const dy = y - by;
            const rr = br * br;
            const s2 = (dx * dx + dy * dy) / rr;
            if (s2 >= 1) continue;
            const k = 1 - s2;
            const wgt = k * k * k;
            field += wgt;
            gx += (-6 * dx * k * k) / rr;
            gy += (-6 * dy * k * k) / rr;
            heatSum += wgt * (blobData[i * 4 + 3] ?? 0);
          }
          const sp = (surfaceAt(x) - y) / poolDepth;
          let pw = 1 - 0.8 * sp;
          if (sp > 0) {
            const k = Math.max(1 - sp * sp, 0);
            pw = k * k * k;
            gy += (6 * sp * k * k) / poolDepth;
          } else {
            gy += 0.8 / poolDepth;
          }
          field += pw;
          heatSum += pw * clamp(0.62 - 0.25 * sp, 0.5, 0.95);
          const t = field > 0.0001 ? clamp(heatSum / field, 0, 1) : 0;
          const depth = y / h;
          const mixT = (0.08 + 0.12 * depth) * (c.dark ? 1.6 : 1);
          const coil =
            Math.exp(-Math.pow((h - y) / (h * 0.24), 2)) *
            p.glow *
            (c.dark ? 0.3 : 0.16);
          const near = clamp((field - 0.02) / (THRESHOLD - 0.02), 0, 1);
          const halo = near * near * t * p.glow * (c.dark ? 0.4 : 0.22);
          let lr = 0;
          let lg = 0;
          let lb = 0;
          for (let ch3 = 0; ch3 < 3; ch3 += 1) {
            let v =
              (c.base[ch3] ?? 1) +
              ((c.tint[ch3] ?? 1) - (c.base[ch3] ?? 1)) * mixT;
            v += ((c.hot[ch3] ?? 1) - v) * coil;
            const wax =
              (c.cool[ch3] ?? 0) + ((c.hot[ch3] ?? 0) - (c.cool[ch3] ?? 0)) * t;
            v += (wax - v) * halo;
            if (ch3 === 0) lr = v;
            else if (ch3 === 1) lg = v;
            else lb = v;
          }
          const o = (row * cw + col) * 4;
          // Coverage across the edge from the field's slope, so the scaled-up
          // quarter-resolution image keeps a soft, anti-aliased rim.
          const slopeLen = Math.hypot(gx, gy) * cell;
          const cover = clamp(
            (field - THRESHOLD) / Math.max(slopeLen, 0.0005) + 0.5,
            0,
            1,
          );
          if (cover > 0) {
            const excess = Math.max(field - THRESHOLD, 0);
            const sc = 9 / (2 * Math.sqrt(excess + 0.015));
            let nx = -gx * sc;
            let ny = -gy * sc;
            let nz = 1;
            const len = Math.hypot(nx, ny, nz);
            nx /= len;
            ny /= len;
            nz /= len;
            const diffuse = clamp(
              (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) * 0.5 + 0.5,
              0,
              1,
            );
            const spec =
              Math.pow(
                Math.max(nx * HALF[0] + ny * HALF[1] + nz * HALF[2], 0),
                26,
              ) *
              p.gloss *
              0.55;
            const rim = Math.pow(1 - nz, 3) * p.gloss * 0.2;
            const thick = clamp(Math.sqrt(excess) * 1.5, 0, 1);
            const sh = clamp(spec + rim, 0, 1);
            const lit = thick * (0.5 + 0.5 * t);
            const coreMix = 0.35 + 0.4 * p.glow;
            const shade = (
              cc: number,
              hc: number,
              si: number,
              under: number,
            ) => {
              const wax = cc + (hc - cc) * t;
              const skin = wax * 0.8;
              const core = wax + (hc - wax) * coreMix;
              let v = (skin + (core - skin) * lit) * (0.84 + 0.26 * diffuse);
              v += (si - v) * sh;
              return under + (v - under) * cover;
            };
            lr = shade(c.cool[0], c.hot[0], c.shine[0], lr);
            lg = shade(c.cool[1], c.hot[1], c.shine[1], lg);
            lb = shade(c.cool[2], c.hot[2], c.shine[2], lb);
          }
          data[o] = clamp(lr, 0, 1) * 255;
          data[o + 1] = clamp(lg, 0, 1) * 255;
          data[o + 2] = clamp(lb, 0, 1) * 255;
          data[o + 3] = 255;
        }
      }
      smallCtx.putImageData(image, 0, 0);
      const cap = clamp(p.dpr, 0.5, 2);
      const scaleBy = Math.min(window.devicePixelRatio || 1, cap);
      const bw = Math.max(1, Math.round(w * scaleBy));
      const bh = Math.max(1, Math.round(h * scaleBy));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(small, 0, 0, bw, bh);
    };

    const draw = () => {
      if (lost || w < 1 || h < 1) return;
      fill();
      const p = params.current;
      if (gl && program && tri) {
        if (gl.isContextLost()) return;
        resizeGL(gl, canvas, { dprCap: clamp(p.dpr, 0.5, 2) });
        program.use();
        const loc = program.uniforms;
        const set3 = (name: string, v: Rgb) => {
          const at = loc[name];
          if (at) gl?.uniform3f(at, v[0], v[1], v[2]);
        };
        const set1 = (name: string, v: number) => {
          const at = loc[name];
          if (at) gl?.uniform1f(at, v);
        };
        if (loc.u_res) gl.uniform2f(loc.u_res, w, h);
        if (loc.u_blobs) gl.uniform4fv(loc.u_blobs, blobData);
        if (loc.u_count) gl.uniform1i(loc.u_count, kernelCount());
        if (loc.u_pool) gl.uniform3f(loc.u_pool, h * 0.9, h * 0.09, poolPhase);
        set3("u_cool", colours.cool);
        set3("u_hot", colours.hot);
        set3("u_tint", colours.tint);
        set3("u_base", colours.base);
        set3("u_shine", colours.shine);
        set1("u_gloss", clamp(p.gloss, 0, 1));
        set1("u_glow", clamp(p.glow, 0, 1));
        set1("u_dark", colours.dark);
        tri.draw();
      } else {
        paint2d();
      }
      if (!shown) {
        shown = true;
        readyFrame = requestAnimationFrame(() => setReady(true));
      }
    };

    const canRun = () => {
      const p = params.current;
      return (
        inView &&
        !document.hidden &&
        !p.paused &&
        p.motionSafe &&
        !lost &&
        w > 0
      );
    };
    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      carry += dt;
      // Wax drifts; 30 fps carries it. The hand asks for every frame.
      let lively = hand.on || hand.r > 0.5;
      for (let i = 0; i < live; i += 1) lively = lively || !!bodies[i]?.held;
      if (lively || carry >= 1 / 30) {
        integrate(carry);
        carry = 0;
        draw();
      }
      if (canRun()) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!params.current.motionSafe) {
        pose();
        draw();
        return;
      }
      if (raf || !canRun()) {
        if (!raf) draw();
        return;
      }
      last = performance.now();
      carry = 0;
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const resize = () => {
      const nw = root.clientWidth;
      const nh = root.clientHeight;
      if (nw < 1 || nh < 1) return;
      if (!placed) {
        w = nw;
        h = nh;
        populate(true);
      } else {
        // Carry the wax with the column rather than letting it fall out.
        const sx = nw / w;
        const sy = nh / h;
        for (let i = 0; i < live; i += 1) {
          const b = bodies[i];
          if (!b) continue;
          b.x *= sx;
          b.y *= sy;
        }
        hand.x *= sx;
        hand.y *= sy;
        hand.tx *= sx;
        hand.ty *= sy;
        w = nw;
        h = nh;
        rescale();
      }
      draw();
      wake();
    };

    const local = (clientX: number, clientY: number) => {
      const box = root.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };

    const appear = (x: number, y: number) => {
      if (!hand.on) {
        // The hand is born where it is asked for, never flown in.
        hand.x = x;
        hand.y = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.tx = x;
      hand.ty = y;
      hand.on = true;
    };

    const setGrip = (on: boolean) => {
      if (on === hand.gripping) return;
      hand.gripping = on;
      // A press grips everything in the hand's full reach, even while the
      // hand is still swelling in.
      const reach = Math.max(hand.r, handRadius()) * 2.6;
      for (let i = 0; i < live; i += 1) {
        const b = bodies[i];
        if (!b) continue;
        if (on) {
          const dx = b.x - hand.x;
          const dy = b.y - hand.y;
          if (Math.hypot(dx, dy) < reach + b.r * 1.6) {
            b.held = true;
            b.ox = dx;
            b.oy = dy;
          }
        } else if (b.held) {
          // The throw: the mass leaves with the hand's own velocity.
          b.held = false;
          b.vx += hand.vx * 0.8;
          b.vy += hand.vy * 0.8;
        }
      }
      params.current.onGripChange?.(on);
      wake();
    };

    let over = false;
    const onMove = (event: PointerEvent) => {
      const p = params.current;
      if (!p.interactive) return;
      if (event.pointerType === "touch" && !hand.down) return;
      over = true;
      const pt = local(event.clientX, event.clientY);
      appear(pt.x, pt.y);
      wake();
    };
    const onLeave = () => {
      over = false;
      // A press that leaves keeps its grip until it is let go.
      if (hand.down) return;
      hand.on = focusPoint !== null;
      if (focusPoint) {
        hand.tx = focusPoint.x;
        hand.ty = focusPoint.y;
      }
      wake();
    };
    const release = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      hand.down = false;
      setGrip(false);
      // Let go outside the lamp (or lifted off glass): the hand goes too.
      if (hand.touch || !over) {
        hand.on = focusPoint !== null;
        if (focusPoint) {
          hand.tx = focusPoint.x;
          hand.ty = focusPoint.y;
        }
      }
      wake();
    };
    const onDown = (event: PointerEvent) => {
      const p = params.current;
      if (!p.interactive) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const pt = local(event.clientX, event.clientY);
      hand.down = true;
      hand.touch = event.pointerType === "touch";
      appear(pt.x, pt.y);
      window.clearTimeout(pulse);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
      // Grip from where the hand is, so a press in place takes what it touches.
      if (!p.motionSafe) hand.r = handRadius();
      setGrip(true);
    };
    const onClick = (event: MouseEvent) => {
      // Enter or Space on a control: a click with no pointer behind it.
      if (event.detail !== 0 || !params.current.followFocus) return;
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      const r = el.getBoundingClientRect();
      const pt = local(r.left + r.width / 2, r.top + r.height / 2);
      appear(pt.x, pt.y);
      hand.r = Math.max(hand.r, handRadius() * 0.8);
      window.clearTimeout(pulse);
      setGrip(true);
      pulse = window.setTimeout(() => {
        setGrip(false);
        if (!focusPoint) hand.on = false;
        wake();
      }, 520);
    };
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      if (!el.matches(":focus-visible") || !params.current.followFocus) return;
      const r = el.getBoundingClientRect();
      focusPoint = local(r.left + r.width / 2, r.top + r.height / 2);
      appear(focusPoint.x, focusPoint.y);
      wake();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      focusPoint = null;
      if (!hand.down) hand.on = false;
      wake();
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerenter", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("click", onClick);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const sizer = new ResizeObserver(resize);
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const detach = onContextLoss(canvas, () => {
      lost = true;
      halt();
      // The still comes back and stays: the designed frame without WebGL.
      setReady(false);
      setFailed(true);
    });

    recolour();
    resize();
    api.current = {
      recolour: () => {
        recolour();
        draw();
      },
      recount: () => {
        if (w < 1) return;
        populate(false);
        wake();
      },
      wake: () => {
        rescale();
        if (!params.current.interactive && !focusPoint) {
          hand.on = false;
          if (hand.gripping) setGrip(false);
        }
        wake();
      },
    };

    return () => {
      halt();
      lost = true;
      cancelAnimationFrame(readyFrame);
      window.clearTimeout(pulse);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      detach();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerenter", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("click", onClick);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      tri?.dispose();
      program?.dispose();
      api.current = null;
      setReady(false);
    };
  }, [failed, seed]);

  React.useEffect(() => {
    api.current?.recolour();
  }, [paletteKey]);

  React.useEffect(() => {
    api.current?.recount();
  }, [rest]);

  React.useEffect(() => {
    api.current?.wake();
  }, [
    speed,
    scale,
    heat,
    gloss,
    glow,
    pull,
    handSize,
    interactive,
    followFocus,
    paused,
    dpr,
    motionSafe,
  ]);

  const radius = (s: number) =>
    `calc(clamp(18px, 12cqw, 58px) * ${r3(scale * s)})`;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate touch-manipulation overflow-clip",
        className,
      )}
    >
      {/* The server and the first paint get the same composition as lit
          discs over the liquid; the canvas replaces it on its first frame. */}
      <div
        aria-hidden
        data-still={ready ? undefined : ""}
        className={cn(
          "pointer-events-none absolute inset-0 z-0 transition-opacity",
          ready && "opacity-0",
        )}
        style={{
          containerType: "size",
          transitionDuration: `${Math.round(durations.slow * 1000)}ms`,
          background: [
            `radial-gradient(120% 40% at 50% 104%, color-mix(in oklab, ${hot} ${Math.round(glow * 34)}%, transparent), transparent)`,
            `linear-gradient(to bottom, color-mix(in oklab, var(--card) 90%, ${tint}), color-mix(in oklab, var(--card) 78%, ${tint}))`,
          ].join(", "),
        }}
      >
        <div
          className="absolute -inset-x-[10%] -bottom-[6%] h-[17%] rounded-[50%]"
          style={{
            background: `linear-gradient(to bottom, color-mix(in oklab, ${hot} 70%, ${cool}), ${cool})`,
          }}
        />
        {rest.map((b, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${r3(b.fx * 100)}%`,
              top: `${r3(b.fy * 100)}%`,
              width: `calc(${radius(b.size)} * 2)`,
              height: `calc(${radius(b.size)} * 2)`,
              transform: "translate(-50%, -50%)",
              background: [
                `radial-gradient(circle at 34% 28%, color-mix(in oklab, var(--primary-foreground) ${Math.round(gloss * 60)}%, transparent), transparent 24%)`,
                `radial-gradient(circle at 42% 38%, color-mix(in oklab, ${hot} ${Math.round(b.t * 100)}%, ${cool}), ${cool} 96%)`,
              ].join(", "),
            }}
          />
        ))}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0 size-full",
          failed && "hidden",
        )}
      />
      <div className="relative z-10 size-full">{children}</div>
      {/* Colours are resolved on this probe, inside the component, so a
          themed wrapper's tokens are the ones read. */}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.recolour()}
        className="pointer-events-none absolute size-0 overflow-hidden bg-background text-foreground transition-colors duration-1"
      />
    </div>
  );
}
