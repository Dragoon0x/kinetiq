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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LotusBeadsProps = {
  /** How many beads sit on the leaf at the start, 3 to 14. @default 7 */
  beads?: number;
  /** Surface tension, 0 (soft, flat beads that reach for each other from far off) to 1 (tight, round beads that hold apart until they touch). @default 0.6 */
  tension?: number;
  /** How much colour the water carries, 0 (clear) to 1 (deeply tinted). @default 0.2 */
  tint?: number;
  /** Play the beads' sounds: a blup as two merge, a higher one as a bead splits. @default false */
  sound?: boolean;
  /** How soon a rolling bead stops, 0 (it glides on and on) to 1 (it stops short). @default 0.35 */
  friction?: number;
  /** How fast a throw must be to split a bead into droplets, in px a second, 500 to 3000. @default 1100 */
  splitSpeed?: number;
  /** The leaf's colour: a pigment at a fixed lightness, so it reads the same in both themes. @default "oklch(from var(--success) 0.58 calc(c * 0.62) h)" */
  leafColor?: string;
  /** The colour the water takes on as `tint` rises. @default "var(--accent-bright)" */
  waterColor?: string;
  /** Where the light comes from, in degrees: 0 from the right, 90 from below, 225 from the upper left. @default 225 */
  lightAngle?: number;
  /** Beads can be dragged, thrown and rolled with the keys. @default true */
  interactive?: boolean;
  /** Shows the leaf but takes no input. @default false */
  disabled?: boolean;
  /** Seeds where the beads sit and how big they are. @default 7 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when two beads merge, with how many beads are left. */
  onMerge?: (beads: number) => void;
  /** Fires when a bead splits, with how many droplets it made. */
  onSplit?: (pieces: number) => void;
  /** Fires whenever the number of beads changes, with the new count. */
  onBeadsChange?: (beads: number) => void;
  /** Names the group of beads for assistive technology. @default "Water beads" */
  label?: string;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const MAX = 24;
const STEP = 1 / 120;
/** The box size the bead radii are drawn for; they scale with the box. */
const REF = 208;
const MIN_R = 4.5;
const RECOIL_ZETA =
  springs.recoil.damping /
  (2 * Math.sqrt(springs.recoil.stiffness * springs.recoil.mass));

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const toUnit = (byte: number) => byte / 255;

/** A small seeded generator: the same leaf for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Seed = { fx: number; fy: number; r: number };

/** Where the beads start: seeded places, kept apart, radii at the reference size. */
function layoutOf(count: number, seed: number, aspect = 1.55): Seed[] {
  const rand = lcg(seed * 31 + count);
  const out: Seed[] = [];
  for (let n = 0; n < count; n += 1) {
    const r = 9 + rand() * 12 * (n === 0 ? 1.2 : 1);
    let best: Seed | null = null;
    let bestGap = -Infinity;
    for (let tryN = 0; tryN < 24; tryN += 1) {
      const fx = 0.1 + rand() * 0.8;
      const fy = 0.14 + rand() * 0.72;
      let gap = Infinity;
      for (const o of out) {
        const dx = (fx - o.fx) * REF * aspect;
        const dy = (fy - o.fy) * REF;
        gap = Math.min(gap, Math.hypot(dx, dy) - r - o.r);
      }
      if (gap > bestGap) {
        bestGap = gap;
        best = { fx, fy, r };
      }
      if (gap > 26) break;
    }
    if (best) out.push(best);
  }
  return out;
}

type Bead = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Squash: how far the bead is pressed along its axis, and how fast. */
  wob: number;
  wobV: number;
  /** The axis it stretches along, and how far (a neck, or its speed). */
  ax: number;
  ay: number;
  stretch: number;
  /** Seconds before a fresh droplet may merge again. */
  cool: number;
};

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform int u_count;
uniform vec4 u_beads[24];
uniform vec4 u_shape[24];
uniform float u_k;
uniform float u_dome;
uniform vec2 u_light;
uniform float u_tint;
uniform float u_scale;
uniform float u_px;
uniform vec3 u_leaf;
uniform vec3 u_water;

// The beads as one smooth field: each a circle stretched toward its neck or
// its motion and squashed by its wobble, joined by a polynomial smooth-min.
// rad is the local radius, weighted toward the nearest beads.
float field(vec2 p, out float rad) {
  float d = 1e5;
  float wsum = 0.0;
  float rsum = 0.0;
  for (int i = 0; i < 24; i++) {
    if (i >= u_count) break;
    vec4 b = u_beads[i];
    vec4 s = u_shape[i];
    vec2 ax = s.xy;
    vec2 q = p - b.xy - ax * (s.z * b.z * 0.45);
    float st = 1.0 + s.z + b.w;
    float along = dot(q, ax) / st;
    float across = dot(q, vec2(-ax.y, ax.x)) * sqrt(st);
    float di = length(vec2(along, across)) - b.z;
    float h = clamp(0.5 + 0.5 * (d - di) / u_k, 0.0, 1.0);
    d = mix(d, di, h) - u_k * h * (1.0 - h);
    float w = exp(-max(di, 0.0) / max(b.z * 0.35, 1.0));
    wsum += w;
    rsum += w * b.z;
  }
  rad = wsum > 0.0 ? rsum / wsum : 1.0;
  return d;
}

float heightAt(vec2 p) {
  float rad;
  float f = field(p, rad);
  float inside = clamp(-f, 0.0, rad);
  // Low tension lets a bead slump: a flatter dome under the same outline.
  return sqrt(max(0.0, rad * rad - (rad - inside) * (rad - inside))) * u_dome;
}

// The leaf: veins fanning from a hub below the frame, a finer net between
// them, wax papillae that glint, and a broad waxy sheen.
vec3 leafAt(vec2 p) {
  vec2 hub = vec2(u_res.x * 0.38, u_res.y * 1.45);
  vec2 q = p - hub;
  float ang = atan(q.y, q.x);
  float dist = length(q);
  float spacing = 0.16;
  float a = ang / spacing + 0.35 * kx_noise(vec2(dist * 0.01, 3.0));
  float vein = abs(fract(a) - 0.5) * spacing * dist;
  float veinLine = 1.0 - smoothstep(0.6, 2.2 * u_scale, vein);
  float net = kx_noise(p / (14.0 * u_scale));
  float netLine = 1.0 - smoothstep(0.0, 0.06, abs(net - 0.5));
  vec2 cell = p / (5.5 * u_scale);
  vec2 g = fract(cell) - 0.5;
  float jitter = kx_noise(floor(cell) * 1.7);
  float dotP = 1.0 - smoothstep(0.12, 0.22, length(g + (jitter - 0.5) * 0.3));
  vec3 base = u_leaf * (0.86 + 0.18 * kx_fbm(p / (60.0 * u_scale)));
  base = mix(base, base * 1.22 + 0.04, veinLine * 0.55);
  base = mix(base, base * 0.9, netLine * 0.35);
  base += vec3(0.06) * dotP;
  // The leaf's surface turns gently, so its wax catches a broad sheen.
  vec2 uv = p / u_res - 0.5;
  float sheen = exp(-dot(uv - vec2(-0.18, -0.22), uv - vec2(-0.18, -0.22)) * 5.0);
  return base + sheen * 0.07;
}

void main() {
  vec2 p = v_uv * u_res;
  float rad;
  float f = field(p, rad);
  vec2 L = normalize(u_light);
  vec3 L3 = normalize(vec3(-L * 0.75, 0.66));

  // The leaf, with each bead's soft shadow and the bright caustic it
  // focuses into that shadow.
  float rs;
  float fs = field(p - L * rad * 0.42, rs);
  float shadow = 1.0 - smoothstep(-rs * 0.15, rs * 0.25, fs);
  float caustic = smoothstep(-rs * 0.35, -rs * 0.85, fs);
  vec3 leaf = leafAt(p);
  leaf *= 1.0 - 0.32 * shadow;
  leaf += mix(vec3(1.0), u_water, u_tint) * caustic * 0.32;

  vec3 col = leaf;
  float cover = 1.0 - smoothstep(-u_px, u_px, f);
  if (cover > 0.0) {
    float e = 1.0;
    float h0 = heightAt(p);
    float hx = heightAt(p + vec2(e, 0.0));
    float hy = heightAt(p + vec2(0.0, e));
    vec3 n = normalize(vec3(-(hx - h0), -(hy - h0), 1.0));
    // Through the bead: the leaf below, magnified and turned over.
    vec3 under = leafAt(p - n.xy * h0 * 1.15) * 1.08;
    vec3 water = mix(under, under * (0.45 + 0.75 * u_water), u_tint);
    water = mix(water, u_water * 0.55, u_tint * 0.25);
    float edge = pow(1.0 - n.z, 2.2);
    float facing = dot(n.xy, -L) * 0.5 + 0.5;
    vec3 sky = mix(vec3(0.35, 0.4, 0.45), vec3(0.98), facing);
    vec3 body = mix(water, sky, edge * mix(0.25, 0.7, facing));
    body *= 1.0 - edge * (1.0 - facing) * 0.55;
    // Light gathered on the far side, inside the bead.
    float far = smoothstep(0.1, 0.9, dot(normalize(n.xy + 1e-5), L)) * (1.0 - n.z);
    body += mix(vec3(1.0), u_water, u_tint) * far * 0.3;
    vec3 H = normalize(L3 + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 110.0) * 1.5 + pow(max(dot(n, H), 0.0), 14.0) * 0.12;
    body += vec3(spec);
    col = mix(col, body, cover);
  }
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Size = { w: number; h: number; bw: number; bh: number; dpr: number };

type Api = {
  reset: () => void;
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
};

/**
 * Beads of water on a waxy leaf, drawn per pixel in one WebGL2 pass. The leaf
 * has veins fanning from below the frame, a finer net, wax papillae that
 * glint and a broad sheen; the beads are one smooth field, so two that come
 * close join with a neck. Each is shaded as water on a leaf that repels it:
 * the leaf beneath magnified and turned over, a dark rim, a pale reflection
 * on the lit side, a sharp highlight, light gathered on the far side, a soft
 * shadow and the bright caustic it focuses into it.
 *
 * Beads roll with little friction and stay on the leaf. As one nears
 * another it stretches a neck toward it; past the merge distance the two
 * snap into one larger bead (volume and momentum kept) that jiggles on the
 * recoil spring's damping ratio and settles round. A throw faster than
 * `splitSpeed` splits a bead into droplets that fan out and roll apart.
 *
 * Every bead is a real button: Tab moves between them, arrow keys roll the
 * focused one, Enter or Space flicks it so it splits, and focus stays with the
 * bead you rolled through a merge. Under reduced motion drags still follow
 * the finger, but nothing rolls on or wobbles: a bead dropped near another
 * merges at once and a split sets its droplets down around it.
 */
export function LotusBeads({
  beads = 7,
  tension = 0.6,
  tint = 0.2,
  sound = false,
  friction = 0.35,
  splitSpeed = 1100,
  leafColor = "oklch(from var(--success) 0.58 calc(c * 0.62) h)",
  waterColor = "var(--accent-bright)",
  lightAngle = 225,
  interactive = true,
  disabled = false,
  seed = 7,
  dpr = 2,
  onMerge,
  onSplit,
  onBeadsChange,
  label = "Water beads",
  className,
}: LotusBeadsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const count = Math.round(clamp(beads, 3, 14));
  const k = {
    tension: clamp01(tension),
    tint: clamp01(tint),
    friction: clamp01(friction),
    split: clamp(splitSpeed, 500, 3000),
    light: (lightAngle * Math.PI) / 180,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };
  const paints = [leafColor, waterColor];
  const paintKey = paints.join("|");
  const start = React.useMemo(() => layoutOf(count, seed), [count, seed]);

  const [ids, setIds] = React.useState<number[]>(() =>
    start.map((_, i) => i + 1),
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [sizes, setSizes] = React.useState<Record<number, number>>({});

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const buttons = React.useRef(new Map<number, HTMLButtonElement>());
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef({
    leaf: new Float32Array(3),
    water: new Float32Array(3),
  });
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const list = React.useRef<Bead[]>([]);
  const nextId = React.useRef(1);
  const placed = React.useRef(false);
  /** False when the browser has no WebGL2: the still stays and the beads hold. */
  const glReady = React.useRef(true);
  const uploads = React.useRef({
    beads: new Float32Array(MAX * 4),
    shape: new Float32Array(MAX * 4),
  });
  const held = React.useRef<{
    id: number;
    ox: number;
    oy: number;
    lx: number;
    ly: number;
    lt: number;
  } | null>(null);
  const focused = React.useRef<number | null>(null);
  const lastDir = React.useRef({ x: 0.6, y: -0.8 });
  const tally = React.useRef({ merges: 0, splits: 0 });
  const sim = React.useRef({ last: 0, carry: 0 });
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onMerge, onSplit, onBeadsChange, audio });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const scaleOf = () => {
    const sz = size.current;
    const root = rootRef.current;
    const w = sz?.w ?? root?.clientWidth ?? REF;
    const h = sz?.h ?? root?.clientHeight ?? REF;
    return Math.max(0.5, Math.min(w, h) / REF);
  };

  /** Lays the seeded beads on the leaf in px. */
  const place = () => {
    const root = rootRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 16 || h < 16) return;
    const sc = Math.max(0.5, Math.min(w, h) / REF);
    list.current = start.map((s, i) => ({
      id: i + 1,
      x: s.fx * w,
      y: s.fy * h,
      vx: 0,
      vy: 0,
      r: s.r * sc,
      wob: 0,
      wobV: 0,
      ax: 1,
      ay: 0,
      stretch: 0,
      cool: 0,
    }));
    // A narrow box squeezes the seeded places together: ease any beads that
    // would touch apart before the leaf is first seen.
    const beadsNow = list.current;
    for (let pass = 0; pass < 40; pass += 1) {
      let moved = false;
      for (let i = 0; i < beadsNow.length; i += 1) {
        const a = beadsNow[i]!;
        for (let j = i + 1; j < beadsNow.length; j += 1) {
          const b = beadsNow[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const want = a.r + b.r + 8 * sc;
          if (d >= want) continue;
          const push = (want - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
          moved = true;
        }
      }
      for (const b of beadsNow) {
        b.x = clamp(b.x, b.r + 3, w - b.r - 3);
        b.y = clamp(b.y, b.r + 3, h - b.r - 3);
      }
      if (!moved) break;
    }
    nextId.current = start.length + 1;
    placed.current = true;
  };

  const readColours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    const read = (i: number, out: Float32Array) => {
      const span = carriers.children[i];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(128, 128, 128)";
      if (span) ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[0] = toUnit(d[0] ?? 0);
      out[1] = toUnit(d[1] ?? 0);
      out[2] = toUnit(d[2] ?? 0);
    };
    read(0, colour.current.leaf);
    read(1, colour.current.water);
  };

  const resize = () => {
    const root = rootRef.current;
    if (!root) return;
    const g = gpu.current;
    const canvas = canvasRef.current;
    const prev = size.current;
    if (g && !g.lost && canvas) {
      const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
      size.current = {
        w: r.width / r.dpr,
        h: r.height / r.dpr,
        bw: r.width,
        bh: r.height,
        dpr: r.dpr,
      };
    } else {
      size.current = {
        w: root.clientWidth,
        h: root.clientHeight,
        bw: root.clientWidth,
        bh: root.clientHeight,
        dpr: 1,
      };
    }
    const sz = size.current;
    if (!placed.current) place();
    else if (
      prev &&
      (prev.w !== sz.w || prev.h !== sz.h) &&
      prev.w > 0 &&
      prev.h > 0
    ) {
      // Beads keep their place on the leaf and their size relative to it.
      const sc = Math.min(sz.w, sz.h) / Math.max(1, Math.min(prev.w, prev.h));
      for (const b of list.current) {
        b.x = (b.x / prev.w) * sz.w;
        b.y = (b.y / prev.h) * sz.h;
        b.r *= sc;
      }
    }
    placeButtons();
  };

  /** Each bead's button sits over it, sized to it, written straight to the DOM. */
  const placeButtons = () => {
    for (const b of list.current) {
      const el = buttons.current.get(b.id);
      if (!el) continue;
      const d = Math.max(16, b.r * 2 + 4);
      el.style.width = `${r2(d)}px`;
      el.style.height = `${r2(d)}px`;
      el.style.transform = `translate3d(${r2(b.x - d / 2)}px, ${r2(b.y - d / 2)}px, 0)`;
    }
  };

  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    placeButtons();
    if (!g || g.lost || !sz) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const up = uploads.current;
    const beadsNow = list.current;
    const n = Math.min(MAX, beadsNow.length);
    for (let i = 0; i < n; i += 1) {
      const b = beadsNow[i]!;
      up.beads[i * 4] = b.x;
      up.beads[i * 4 + 1] = b.y;
      // Slack water spreads a little wider than its volume's sphere.
      up.beads[i * 4 + 2] = b.r * (1.1 - 0.1 * k.tension);
      up.beads[i * 4 + 3] = b.wob;
      up.shape[i * 4] = b.ax;
      up.shape[i * 4 + 1] = b.ay;
      up.shape[i * 4 + 2] = b.stretch;
      up.shape[i * 4 + 3] = 0;
    }
    const sc = Math.max(0.5, Math.min(sz.w, sz.h) / REF);
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1i(u.u_count ?? null, n);
    gl.uniform4fv(u.u_beads ?? null, up.beads);
    gl.uniform4fv(u.u_shape ?? null, up.shape);
    // Low tension: a wide smooth-min, so necks form from further off.
    gl.uniform1f(u.u_k ?? null, (3 + 10 * (1 - k.tension)) * sc);
    gl.uniform1f(u.u_dome ?? null, 0.5 + 0.45 * k.tension);
    gl.uniform2f(u.u_light ?? null, -Math.cos(k.light), -Math.sin(k.light));
    gl.uniform1f(u.u_tint ?? null, k.tint);
    gl.uniform1f(u.u_scale ?? null, sc);
    gl.uniform1f(u.u_px ?? null, 0.8 / sz.dpr);
    gl.uniform3fv(u.u_leaf ?? null, colour.current.leaf);
    gl.uniform3fv(u.u_water ?? null, colour.current.water);
    tri.draw();
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** The new set of beads, told to React (for the buttons) and to the host. */
  const changed = () => {
    const next = list.current.map((b) => b.id);
    setIds(next);
    const sc = scaleOf();
    const s: Record<number, number> = {};
    for (const b of list.current) s[b.id] = b.r / sc;
    setSizes(s);
    report.current.onBeadsChange?.(next.length);
    return next.length;
  };

  const blup = (pitch: number) => {
    // Only after the visitor has touched the page: a bead that settles into
    // another after a throw still answers the throw.
    const active =
      typeof navigator !== "undefined" &&
      navigator.userActivation?.hasBeenActive;
    if (active) report.current.audio.play("blup", { pitch, gain: 0.6 });
  };

  /** Two beads become one: volume and momentum kept, and a jiggle on recoil. */
  const merge = (a: Bead, b: Bead) => {
    const keepB =
      held.current?.id === b.id ||
      (held.current?.id !== a.id &&
        (focused.current === b.id || (focused.current !== a.id && b.r > a.r)));
    const keep = keepB ? b : a;
    const gone = keepB ? a : b;
    const va = a.r ** 3;
    const vb = b.r ** 3;
    const vol = va + vb;
    const nx = (a.x * va + b.x * vb) / vol;
    const ny = (a.y * va + b.y * vb) / vol;
    const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
    keep.vx = (a.vx * va + b.vx * vb) / vol;
    keep.vy = (a.vy * va + b.vy * vb) / vol;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    keep.ax = dx / d;
    keep.ay = dy / d;
    if (held.current?.id !== keep.id) {
      keep.x = nx;
      keep.y = ny;
    }
    keep.r = Math.cbrt(vol);
    keep.stretch = 0;
    keep.wob = k.motionSafe ? 0.28 : 0;
    keep.wobV = k.motionSafe ? -2 - Math.min(4, rel / 300) : 0;
    list.current = list.current.filter((x) => x !== gone);
    tally.current.merges += 1;
    const left = changed();
    report.current.onMerge?.(left);
    blup(clamp(Math.sqrt(16 / Math.max(4, keep.r / scaleOf())), 0.55, 1.4));
    setSaid((v) => ({
      n: v.n + 1,
      text: `Beads merged. ${left === 1 ? "1 bead" : `${left} beads`}.`,
    }));
  };

  /** A flick: the bead breaks into droplets fanned along the throw. */
  const split = (b: Bead, vx: number, vy: number) => {
    const sc = scaleOf();
    const speed = Math.hypot(vx, vy);
    const room = MAX - list.current.length;
    if (b.r < MIN_R * 2 * sc || room < 1) {
      b.vx = vx;
      b.vy = vy;
      return;
    }
    const pieces = Math.min(
      1 + room,
      clamp(2 + Math.floor((speed - k.split) / 700), 2, 5),
    );
    const rand = lcg(b.id * 97 + tally.current.splits * 13 + 5);
    const shares: number[] = [];
    let sum = 0;
    for (let i = 0; i < pieces; i += 1) {
      const sh = (i === 0 ? 1.4 : 0.5) + rand() * 0.7;
      shares.push(sh);
      sum += sh;
    }
    const vol = b.r ** 3;
    const dir = Math.atan2(vy, vx);
    const along = Math.min(speed, 1800);
    const made: Bead[] = [];
    for (let i = 0; i < pieces; i += 1) {
      const r = Math.max(MIN_R * sc, Math.cbrt((vol * (shares[i] ?? 1)) / sum));
      const spread = (i - (pieces - 1) / 2) * 0.42;
      const a = dir + spread;
      const lead = i === 0 ? 0 : (b.r + r) * 0.55;
      const bead: Bead =
        i === 0
          ? b
          : {
              id: nextId.current++,
              x: 0,
              y: 0,
              vx: 0,
              vy: 0,
              r,
              wob: 0,
              wobV: 0,
              ax: 1,
              ay: 0,
              stretch: 0,
              cool: 0,
            };
      bead.r = r;
      bead.x = b.x + Math.cos(a) * lead;
      bead.y = b.y + Math.sin(a) * lead;
      const fling = k.motionSafe
        ? along * (0.45 + 0.18 * i + rand() * 0.15)
        : 0;
      bead.vx = Math.cos(a) * fling;
      bead.vy = Math.sin(a) * fling;
      bead.cool = 0.55;
      bead.wob = k.motionSafe ? -0.2 : 0;
      bead.wobV = k.motionSafe ? 3 : 0;
      bead.ax = Math.cos(a);
      bead.ay = Math.sin(a);
      if (i > 0) made.push(bead);
    }
    if (!k.motionSafe) {
      // Reduced motion: the droplets are set down round the bead at once.
      made.forEach((m, i) => {
        const a = dir + (i - (made.length - 1) / 2) * 0.9;
        m.x = b.x + Math.cos(a) * (b.r + m.r + 6 * sc);
        m.y = b.y + Math.sin(a) * (b.r + m.r + 6 * sc);
      });
    }
    list.current = [...list.current, ...made];
    tally.current.splits += 1;
    const total = changed();
    report.current.onSplit?.(pieces);
    blup(1.45);
    setSaid((v) => ({
      n: v.n + 1,
      text: `Bead split into ${pieces}. ${total} beads.`,
    }));
  };

  /** One fixed step of the leaf: rolling, walls, attraction, necks, merges, wobble. */
  const step = (dt: number): boolean => {
    const sz = size.current;
    if (!sz) return false;
    const sc = Math.max(0.5, Math.min(sz.w, sz.h) / REF);
    const all = list.current;
    const hold = held.current?.id ?? -1;
    const drag = Math.exp(-(1.1 + 5 * k.friction) * dt);
    const reachK = 0.5 * (1.4 - 0.7 * k.tension);
    const mergeK = 0.95 - 0.25 * k.tension;
    // The wobble rings with the recoil spring's damping ratio; tension
    // sets how quick it is.
    const ws = 300 + 520 * k.tension;
    const wd = 2 * RECOIL_ZETA * Math.sqrt(ws);
    let moving = false;
    for (const b of all) {
      b.stretch = 0;
      b.cool = Math.max(0, b.cool - dt);
    }
    // Pull between near beads, and each one's neck toward its nearest.
    let mergeA: Bead | null = null;
    let mergeB: Bead | null = null;
    for (let i = 0; i < all.length; i += 1) {
      const a = all[i]!;
      for (let j = i + 1; j < all.length; j += 1) {
        const b = all[j]!;
        if (a.cool > 0 || b.cool > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-3;
        const touch = a.r + b.r;
        const reach = touch * reachK;
        const gap = d - touch;
        if (d < touch * mergeK) {
          mergeA = a;
          mergeB = b;
          continue;
        }
        if (gap > reach) continue;
        const near = clamp01(1 - gap / reach);
        const ux = dx / d;
        const uy = dy / d;
        // Beads at rest are pinned by the leaf's wax: only one that moves (or
        // is held) is drawn on toward its neighbour.
        const stirred =
          a.id === hold ||
          b.id === hold ||
          Math.abs(a.vx) + Math.abs(a.vy) + Math.abs(b.vx) + Math.abs(b.vy) >
            4 * sc;
        if (k.motionSafe && stirred) {
          const pull = 900 * sc * near * near * dt;
          const ma = a.r ** 3;
          const mb = b.r ** 3;
          if (a.id !== hold) {
            a.vx += (ux * pull * (2 * mb)) / (ma + mb);
            a.vy += (uy * pull * (2 * mb)) / (ma + mb);
          }
          if (b.id !== hold) {
            b.vx -= (ux * pull * (2 * ma)) / (ma + mb);
            b.vy -= (uy * pull * (2 * ma)) / (ma + mb);
          }
        }
        const neck = 0.42 * near * near;
        if (neck > a.stretch) {
          a.stretch = neck;
          a.ax = ux;
          a.ay = uy;
        }
        if (neck > b.stretch) {
          b.stretch = neck;
          b.ax = -ux;
          b.ay = -uy;
        }
      }
    }
    if (mergeA && mergeB) {
      merge(mergeA, mergeB);
      return true;
    }
    for (const b of all) {
      if (b.id !== hold && k.motionSafe) {
        b.vx *= drag;
        b.vy *= drag;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp < 6 * sc) {
          b.vx = 0;
          b.vy = 0;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // The leaf's edge turns a bead back softly.
        const m = b.r + 3;
        if (b.x < m) {
          b.x = m;
          b.vx = Math.abs(b.vx) * 0.35;
        } else if (b.x > sz.w - m) {
          b.x = sz.w - m;
          b.vx = -Math.abs(b.vx) * 0.35;
        }
        if (b.y < m) {
          b.y = m;
          b.vy = Math.abs(b.vy) * 0.35;
        } else if (b.y > sz.h - m) {
          b.y = sz.h - m;
          b.vy = -Math.abs(b.vy) * 0.35;
        }
        if (sp > 0) moving = true;
      }
      // A rolling bead stretches along its way.
      const speed = Math.hypot(b.vx, b.vy);
      const run = Math.min(0.3, speed / (2600 * sc));
      if (run > b.stretch) {
        b.stretch = run;
        b.ax = b.vx / (speed || 1);
        b.ay = b.vy / (speed || 1);
      }
      if (k.motionSafe) {
        b.wobV += (-ws * b.wob - wd * b.wobV) * dt;
        b.wob += b.wobV * dt;
        if (Math.abs(b.wob) < 1e-4 && Math.abs(b.wobV) < 1e-3) {
          b.wob = 0;
          b.wobV = 0;
        } else moving = true;
      } else {
        b.wob = 0;
        b.wobV = 0;
      }
      if (b.cool > 0) moving = true;
    }
    return moving || held.current !== null;
  };

  const reset = () => {
    placed.current = false;
    held.current = null;
    tally.current = { merges: 0, splits: 0 };
    resize();
    if (placed.current) changed();
    draw();
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (!visible.current || document.hidden || !size.current) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    s.carry += dt;
    let busy = false;
    let steps = 0;
    while (s.carry >= STEP && steps < 10) {
      s.carry -= STEP;
      steps += 1;
      busy = step(STEP) || busy;
    }
    if (steps === 10) s.carry = 0;
    if (steps === 0) busy = true;
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { reset, draw, kick, resize, readColours, tick };
    report.current = { onMerge, onSplit, onBeadsChange, audio };
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas);
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpu.current = { gl, program, tri, lost: false };
      api.current?.readColours();
      api.current?.resize();
      api.current?.draw();
      return true;
    };
    if (!build()) {
      glReady.current = false;
      rootRef.current?.setAttribute("data-fallback", "");
      api.current?.resize();
      return;
    }
    const detach = onContextLoss(
      canvas,
      () => {
        if (gpu.current) gpu.current.lost = true;
        shown.current = false;
        rootRef.current?.removeAttribute("data-live");
      },
      () => {
        gpu.current = null;
        build();
      },
    );
    return () => {
      detach();
      const g = gpu.current;
      gpu.current = null;
      if (g && !g.lost) {
        g.tri.dispose();
        g.program.dispose();
      }
    };
  }, []);

  // A new count or seed lays a fresh leaf, and the host hears its count.
  React.useEffect(() => {
    api.current?.reset();
  }, [start]);

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [k.tension, k.tint, k.friction, k.light, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) return;
      api.current?.draw();
      api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const r = root?.getBoundingClientRect();
    if (!root || !r) return { x: 0, y: 0 };
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const beadAt = (x: number, y: number) => {
    let best: Bead | null = null;
    let bestD = Infinity;
    for (const b of list.current) {
      const d = Math.hypot(b.x - x, b.y - y) - b.r;
      if (d < 8 && d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  };

  const find = (id: number) => list.current.find((b) => b.id === id) ?? null;

  const drag = useDrag({
    threshold: 4,
    disabled: !k.enabled,
    onStart: ({ point, offset, event }) => {
      if (!glReady.current) return;
      // The bead under the press, not under where the finger has got to.
      const down = local(point.x - offset.x, point.y - offset.y);
      const at = local(point.x, point.y);
      const b = beadAt(down.x, down.y);
      if (!b) return;
      held.current = {
        id: b.id,
        ox: at.x - b.x,
        oy: at.y - b.y,
        lx: b.x,
        ly: b.y,
        lt: event.timeStamp,
      };
      b.vx = 0;
      b.vy = 0;
      kick();
    },
    onMove: ({ point, event }) => {
      const h = held.current;
      const sz = size.current;
      if (!h || !sz) return;
      const b = find(h.id);
      if (!b) {
        held.current = null;
        return;
      }
      const at = local(point.x, point.y);
      const m = b.r + 3;
      b.x = clamp(at.x - h.ox, m, sz.w - m);
      b.y = clamp(at.y - h.oy, m, sz.h - m);
      // The held bead's speed, for its stretch, measured from the finger.
      const now = event.timeStamp;
      const dts = Math.max(0.008, (now - h.lt) / 1000);
      b.vx = (b.x - h.lx) / dts;
      b.vy = (b.y - h.ly) / dts;
      h.lx = b.x;
      h.ly = b.y;
      h.lt = now;
      if (!k.motionSafe) {
        b.vx = 0;
        b.vy = 0;
      }
      kick();
    },
    onEnd: ({ velocity }) => {
      const h = held.current;
      held.current = null;
      if (!h) return;
      const b = find(h.id);
      if (!b) return;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > k.split) split(b, velocity.x, velocity.y);
      else if (k.motionSafe) {
        const cap = Math.min(1, 2000 / Math.max(1, speed));
        b.vx = velocity.x * cap;
        b.vy = velocity.y * cap;
      } else {
        b.vx = 0;
        b.vy = 0;
      }
      kick();
    },
    onCancel: () => {
      held.current = null;
      kick();
    },
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      const b = beadAt(at.x, at.y);
      if (!b || !k.motionSafe) return;
      // A poke: the bead quivers and settles.
      b.wobV += 4;
      b.ax = 0;
      b.ay = 1;
      kick();
    },
  });

  const onKeyDown =
    (id: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!k.enabled || !glReady.current) return;
      const b = find(id);
      if (!b) return;
      const sc = scaleOf();
      const dirs: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const dir = dirs[event.key];
      if (dir) {
        event.preventDefault();
        lastDir.current = { x: dir[0], y: dir[1] };
        if (k.motionSafe) {
          const push = (event.shiftKey ? 520 : 280) * sc;
          b.vx += dir[0] * push;
          b.vy += dir[1] * push;
        } else {
          // Reduced motion: one step, no roll.
          const sz = size.current;
          const by = (event.shiftKey ? 36 : 16) * sc;
          const m = b.r + 3;
          b.x = clamp(b.x + dir[0] * by, m, (sz?.w ?? 0) - m);
          b.y = clamp(b.y + dir[1] * by, m, (sz?.h ?? 0) - m);
        }
        kick();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (event.repeat) return;
        const d = lastDir.current;
        const speed = k.split * 1.2;
        split(b, d.x * speed, d.y * speed);
        kick();
      }
    };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  const word = (r: number) => (r < 11 ? "small" : r < 17 ? "medium" : "large");

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (!k.enabled) return;
        drag.onPointerDown(event);
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        "group/lotus-beads relative isolate h-56 w-full overflow-clip",
        k.enabled ? "touch-none" : "touch-auto",
        className,
      )}
    >
      <LeafStill
        layout={start}
        leafColor={leafColor}
        waterColor={waterColor}
        tint={k.tint}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
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
      <div role="group" aria-label={label} className="absolute inset-0">
        {ids.map((id, i) => {
          const seedR = sizes[id] ?? start[id - 1]?.r ?? 14;
          return (
            <button
              key={id}
              type="button"
              ref={(node) => {
                if (node) buttons.current.set(id, node);
                else buttons.current.delete(id);
              }}
              aria-label={`Bead ${i + 1} of ${ids.length}, ${word(seedR)}`}
              aria-describedby={hintId}
              disabled={disabled}
              onKeyDown={onKeyDown(id)}
              onFocus={() => {
                focused.current = id;
              }}
              onBlur={() => {
                if (focused.current === id) focused.current = null;
              }}
              className={cn(
                "absolute top-0 left-0 rounded-full outline-none",
                k.enabled
                  ? "cursor-grab active:cursor-grabbing"
                  : "cursor-default",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            />
          );
        })}
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys roll the bead; Enter or Space flicks it so it splits. Roll
        one into another and they merge.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the leaf with its veins, and each bead as a lit dome with
 * its shadow, placed by percentage so it holds in any box.
 */
function LeafStill({
  layout,
  leafColor,
  waterColor,
  tint,
}: {
  layout: Seed[];
  leafColor: string;
  waterColor: string;
  tint: number;
}) {
  const uid = React.useId();
  const dome = `${uid}-dome`;
  const veins = React.useMemo(() => {
    const out: { x2: number; y2: number }[] = [];
    for (let i = 0; i < 9; i += 1) {
      const a = -Math.PI / 2 + (i - 4) * 0.16;
      out.push({
        x2: r2(38 + Math.cos(a) * 220),
        y2: r2(145 + Math.sin(a) * 220),
      });
    }
    return out;
  }, []);
  const tone = `color-mix(in oklab, ${waterColor} ${Math.round(tint * 50)}%, white)`;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/lotus-beads:opacity-0"
    >
      <defs>
        <radialGradient id={dome} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0%" style={{ stopColor: "white" }} stopOpacity={0.95} />
          <stop offset="18%" style={{ stopColor: tone }} stopOpacity={0.55} />
          <stop
            offset="70%"
            style={{ stopColor: leafColor }}
            stopOpacity={0.2}
          />
          <stop
            offset="100%"
            style={{
              stopColor: `color-mix(in oklab, ${leafColor} 60%, black)`,
            }}
            stopOpacity={0.85}
          />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" style={{ fill: leafColor }} />
      <g
        style={{ stroke: `color-mix(in oklab, ${leafColor} 70%, white)` }}
        strokeWidth={1.2}
        opacity={0.6}
      >
        {veins.map((v, i) => (
          <line key={i} x1="38%" y1="145%" x2={`${v.x2}%`} y2={`${v.y2}%`} />
        ))}
      </g>
      <g
        transform="translate(3 4)"
        style={{ fill: `color-mix(in oklab, ${leafColor} 55%, black)` }}
        opacity={0.35}
      >
        {layout.map((b, i) => (
          <circle
            key={i}
            cx={`${r2(b.fx * 100)}%`}
            cy={`${r2(b.fy * 100)}%`}
            r={r2(b.r)}
          />
        ))}
      </g>
      {layout.map((b, i) => (
        <circle
          key={i}
          cx={`${r2(b.fx * 100)}%`}
          cy={`${r2(b.fy * 100)}%`}
          r={r2(b.r)}
          fill={`url(#${dome})`}
        />
      ))}
    </svg>
  );
}
