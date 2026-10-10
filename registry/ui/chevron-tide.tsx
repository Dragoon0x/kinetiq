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
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ChevronTidePattern = "herringbone" | "chevron";
export type ChevronTideColors = "harbour" | "sand" | "slate";

export type ChevronTideProps = {
  /** The content on top of the cloth: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** Width of one chevron column in px; the whole weave grows or tightens with it. @default 28 */
  scale?: number;
  /** Height of the swell, 0 (a flat, still cloth) to 1 (a heavy sea). @default 0.6 */
  swell?: number;
  /** A named palette, or your own CSS colours in order: stripe, alternate stripe, light, shade. @default "harbour" */
  colors?: ChevronTideColors | readonly string[];
  /** Herringbone breaks the twill at every column; chevron runs one unbroken zigzag. @default "herringbone" */
  pattern?: ChevronTidePattern;
  /** Stripes across each column, 2 to 8. @default 4 */
  stripes?: number;
  /** How fast the sea moves, 0 (held) to 3. @default 1 */
  speed?: number;
  /** Distance between crests of the main swell, in px. @default 300 */
  wavelength?: number;
  /** Heading of the main swell in degrees: 0 rolls left to right, 90 rolls down toward you. @default 40 */
  angle?: number;
  /** How brightly the crests catch the light, 0 to 1. @default 0.6 */
  sheen?: number;
  /** The pointer and keyboard focus nudge the swell. @default true */
  interactive?: boolean;
  /** How high the pointer lifts the cloth, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** A press on the cloth (not on a control) sends a ring swell out from it. @default true */
  pulse?: boolean;
  /** The swell rises out of a flat cloth the first time it comes into view. @default true */
  intro?: boolean;
  /** Hold the sea still; the pointer can still nudge it. @default false */
  paused?: boolean;
  /** Seeds the swells' phases and headings, so two cloths never roll in step. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) nudging the swell. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Stripe, alternate stripe, light and shade. Each is mixed with the page in
 * oklab, so the cloth sits in either theme and its shading keeps its hue.
 */
const PRESETS: Record<
  ChevronTideColors,
  readonly [string, string, string, string]
> = {
  harbour: [
    "color-mix(in oklab, var(--accent) 34%, var(--background))",
    "color-mix(in oklab, var(--accent) 13%, var(--background))",
    "color-mix(in oklab, var(--accent-bright) 18%, white)",
    "color-mix(in oklab, color-mix(in oklab, var(--accent) 45%, var(--background)) 62%, black)",
  ],
  sand: [
    "color-mix(in oklab, oklch(0.8 0.07 78) 62%, var(--background))",
    "color-mix(in oklab, oklch(0.8 0.07 78) 26%, var(--background))",
    "color-mix(in oklab, oklch(0.94 0.05 88) 70%, white)",
    "color-mix(in oklab, oklch(0.5 0.07 55) 72%, black)",
  ],
  slate: [
    "color-mix(in oklab, var(--ink-3) 40%, var(--background))",
    "color-mix(in oklab, var(--ink-3) 15%, var(--background))",
    "color-mix(in oklab, var(--ink) 12%, white)",
    "color-mix(in oklab, color-mix(in oklab, var(--ink-3) 50%, var(--background)) 55%, black)",
  ],
};

function paletteOf(
  colors: ChevronTideColors | readonly string[],
): readonly [string, string, string, string] {
  if (typeof colors === "string") return PRESETS[colors] ?? PRESETS.harbour;
  const a = colors[0] ?? PRESETS.harbour[0];
  return [
    a,
    colors[1] ?? `color-mix(in oklab, ${a} 40%, var(--background))`,
    colors[2] ?? `color-mix(in oklab, ${a} 22%, white)`,
    colors[3] ?? `color-mix(in oklab, ${a} 50%, black)`,
  ];
}

/** Fixed physics step: the springs integrate at 120 Hz whatever the display does. */
const STEP = 1 / 120;
/** A ring swell's crest travels this fast, px/s, and fades with this rate, 1/s. */
const RING_SPEED = 520;
const RING_FADE = 1.15;
/** The keyboard's ring is a softer one than a press. */
const FOCUS_PULSE = 0.6;
const RINGS = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** A small seeded generator: the same sea for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The seed's sea: each swell's phase, and how far the second one's heading crosses the first. */
function seaOf(seed: number) {
  const rand = lcg(seed);
  return {
    phase1: rand() * Math.PI * 2,
    phase2: rand() * Math.PI * 2,
    cross: 0.45 + (rand() - 0.5) * 0.35,
  };
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = /* glsl */ `
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_dpr;
uniform float u_time;
uniform float u_scale;
uniform float u_stripes;
uniform float u_amp;
uniform float u_len;
uniform vec4 u_heading;
uniform vec2 u_phase;
uniform float u_herring;
uniform float u_sheen;
uniform vec3 u_a;
uniform vec3 u_b;
uniform vec3 u_lite;
uniform vec3 u_shade;
uniform vec4 u_hand;
uniform vec4 u_ring[4];

const float TAU = 6.28318530718;

float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// The box-filtered square wave of period 2 (0 on [0, 1), 1 on [1, 2)): the
// two stripe colours, averaged over the pixel's footprint so they never shimmer.
float stripe(float x, float w) {
  vec2 a = vec2(x - 0.5 * w, x + 0.5 * w) * 0.5;
  vec2 i = floor(a) + max(fract(a) * 2.0 - 1.0, 0.0);
  return clamp((i.y - i.x) / w, 0.0, 1.0);
}

void main() {
  vec2 p = v_uv * u_res;
  float k1 = TAU / u_len;
  float k2 = k1 * 1.75;
  // Two long-crested swells; the shorter one's crests run slower, by the
  // square root of the length ratio, as they do on deep water.
  float th1 = dot(p, u_heading.xy) * k1 - u_time * 0.62 + u_phase.x;
  float th2 = dot(p, u_heading.zw) * k2 - u_time * 0.62 * 1.3229 + u_phase.y;
  float h = u_amp * (0.74 * sin(th1) + 0.26 * sin(th2));
  // Gerstner: the cloth gathers toward each crest, so crests read sharp and
  // troughs broad.
  float gather = 0.5 * u_amp * cos(th1);

  vec2 dh = p - u_hand.xy;
  float mound = u_hand.z * exp(-dot(dh, dh) / (u_hand.w * u_hand.w));
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 r = u_ring[i];
    if (r.w <= 0.0) continue;
    float x = (length(p - r.xy) - r.z) / 34.0;
    ring += r.w * (exp(-x * x) - 0.45 * exp(-(x + 1.4) * (x + 1.4)));
  }
  float lift = h + mound + ring;
  // Window y runs up and the page's runs down: flip the derivative's sign.
  vec2 grad = vec2(dFdx(lift), -dFdy(lift)) * u_dpr;

  // Where the lifted cloth now is: a row raised by lift shows lift px higher.
  vec2 q = p - u_heading.xy * gather;
  q.y += lift;

  float s = u_scale;
  float col = floor(q.x / s);
  float fx = q.x / s - col;
  float odd = mod(col, 2.0);
  float w = s / u_stripes;
  float zig;
  float slope;
  if (u_herring > 0.5) {
    // Each column runs one way and the next the other, half a stripe out of
    // step: the broken twill of a herringbone.
    zig = mix(fx, 1.0 - fx, odd) * s + odd * 0.5 * w;
    slope = 1.0 - 2.0 * odd;
  } else {
    float t = fract(q.x / (2.0 * s));
    zig = (1.0 - abs(2.0 * t - 1.0)) * s;
    slope = t < 0.5 ? 1.0 : -1.0;
  }
  float band = (q.y + zig) / w;
  // The filter width comes from the pattern's own slope, never from fwidth,
  // so the column seams do not smear into grey.
  float fw = (abs(slope + grad.x) + abs(1.0 + grad.y)) / (w * u_dpr) + 1e-4;
  vec3 base = mix(u_a, u_b, stripe(band, fw));

  float v = fract(band);
  float groove = 1.0 - smoothstep(0.0, 0.07 + fw * 1.2, min(v, 1.0 - v));
  float hw = u_amp > 0.01 ? h / u_amp : 0.0;
  float extra = clamp((mound + ring) / (0.6 * s + 8.0), 0.0, 1.0);
  float crest = max(smoothstep(0.1, 0.95, hw), extra);
  float trough = smoothstep(0.2, 1.0, -hw);

  // The swell's own normal carries the light across the cloth in bands; each
  // stripe's rounded rib adds its section on top, running it from light to
  // shade, a little more where the crest stands it up to the light.
  vec2 across = normalize(vec2(slope, 1.0));
  float tilt = clamp((v - 0.5) * 2.0, -1.0, 1.0);
  vec3 sea = normalize(vec3(-grad * 1.7, 1.0));
  vec3 n = normalize(sea + vec3(across * tilt * (0.16 + 0.24 * crest), 0.0));
  vec3 L = normalize(vec3(-0.35, -0.7, 0.62));
  float rel = (dot(n, L) - L.z) / (1.0 - L.z);
  float faceUp = (dot(sea, L) - L.z) / (1.0 - L.z);

  vec3 c = base;
  c = mix(c, u_shade, clamp(-rel * 0.6 + trough * 0.2, 0.0, 0.46));
  c = mix(
    c,
    u_lite,
    clamp(rel, 0.0, 1.0) * (0.12 + 0.42 * crest) * (0.4 + 0.6 * u_sheen)
  );
  // The sheen comes from the swell alone, so it rolls as one soft band
  // instead of flashing stripe by stripe.
  c = mix(c, u_lite, smoothstep(0.02, 0.5, faceUp) * crest * 0.5 * u_sheen);
  vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, hv), 0.0), 60.0) * u_sheen * crest * 0.6;
  c = mix(c, u_lite, clamp(spec, 0.0, 0.6));
  c = mix(c, u_shade, groove * 0.26);
  if (u_herring > 0.5) {
    float seam = 1.0 - smoothstep(0.0, 0.9, min(fx, 1.0 - fx) * s);
    c = mix(c, u_shade, seam * 0.22);
  }
  // A least-significant-bit of grain keeps the long gradients from banding.
  c += (grain(gl_FragCoord.xy) - 0.5) / 255.0;
  o_color = vec4(c, 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Ring = { x: number; y: number; age: number; strength: number };

type Sim = {
  /** Sea time, s. */
  t: number;
  last: number;
  carry: number;
  /** The intro: the swell's share of its full height. */
  rise: number;
  riseV: number;
  riseTo: number;
  /** The hand: where it is going, where the mound is, and how present. */
  tx: number;
  ty: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  on: boolean;
  level: number;
  levelV: number;
  source: "pointer" | "focus" | null;
  /** The focused control's centre while keyboard focus is inside. */
  focus: { x: number; y: number } | null;
  rings: Ring[];
};

type Size = { w: number; h: number; bw: number; bh: number; dpr: number };

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readPalette: () => void;
  tick: (now: number) => void;
  arrive: () => void;
};

/**
 * A herringbone cloth that rolls like the sea, as a background: the content
 * sits on top in its own layer. Two long swells of different length and
 * heading pass through the weave and every row of chevrons rises and falls
 * with them; each stripe is a rounded rib, so it runs from light to shade
 * across its width, more so at the crest, where a soft sheen gathers, while
 * the troughs settle into shade.
 *
 * The pointer lifts a mound of cloth under it (springs.glide for where,
 * springs.drift for how much), and a press on the cloth sends a ring swell
 * out from that point. It is decoration: `aria-hidden`, never a focus stop,
 * never in the way of a click; keyboard focus landing on a control inside
 * moves the mound there and sends a softer ring. Drawn by one WebGL2
 * fragment pass, only while on screen, in a visible page and while something
 * moves. Under reduced motion it is a still cloth with lit crests, and the
 * pointer's mound is drawn straight under the pointer without easing.
 */
export function ChevronTide({
  children,
  scale = 28,
  swell = 0.6,
  colors = "harbour",
  pattern = "herringbone",
  stripes = 4,
  speed = 1,
  wavelength = 300,
  angle = 40,
  sheen = 0.6,
  interactive = true,
  pointerStrength = 0.6,
  pulse = true,
  intro = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: ChevronTideProps) {
  const motionSafe = useMotionSafe();
  const paints = paletteOf(colors);
  const paintKey = paints.join("|");

  const k = {
    scale: clamp(scale, 10, 80),
    swell: clamp01(swell),
    herring: pattern !== "chevron",
    stripes: clamp(stripes, 2, 8),
    speed: clamp(speed, 0, 3),
    wavelength: clamp(wavelength, 80, 4000),
    angle: (angle * Math.PI) / 180,
    sheen: clamp01(sheen),
    interactive,
    strength: clamp01(pointerStrength),
    pulse,
    intro,
    paused,
    seed,
    ...seaOf(seed),
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef(new Float32Array(12));
  const ringData = React.useRef(new Float32Array(RINGS * 4));
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const arrived = React.useRef(false);
  const active = React.useRef(false);
  /** The canvas has painted, and the stand-in has been told to go. */
  const shown = React.useRef(false);
  const sim = React.useRef<Sim>({
    t: 0,
    last: 0,
    carry: 0,
    rise: 1,
    riseV: 0,
    riseTo: 1,
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    on: false,
    level: 0,
    levelV: 0,
    source: null,
    focus: null,
    rings: Array.from({ length: RINGS }, () => ({
      x: 0,
      y: 0,
      age: 0,
      strength: 0,
    })),
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onActiveChange);
  /** Every frame goes through the latest render's tick, never a stale one. */
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /** Each CSS colour as sRGB floats, read back from its carrier by painting one pixel. */
  const readPalette = () => {
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
    const out = colour.current;
    const spans = carriers.children;
    for (let i = 0; i < 4; i += 1) {
      const span = spans[i];
      if (!span) continue;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[i * 3] = (d[0] ?? 0) / 255;
      out[i * 3 + 1] = (d[1] ?? 0) / 255;
      out[i * 3 + 2] = (d[2] ?? 0) / 255;
    }
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    size.current = {
      w: r.width / r.dpr,
      h: r.height / r.dpr,
      bw: r.width,
      bh: r.height,
      dpr: r.dpr,
    };
  };

  /** One frame, from the sim as it stands. Uniforms go straight to their locations: nothing is allocated. */
  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    if (!g || g.lost || !sz) return;
    if (!visible.current) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const amp = k.swell * (0.55 * k.scale + 6) * s.rise;
    const reach = clamp(Math.min(sz.w, sz.h) * 0.42, 56, 180);
    const lift = k.strength * s.level * (0.55 * k.scale + 10);
    const rings = ringData.current;
    for (let i = 0; i < RINGS; i += 1) {
      const r = s.rings[i];
      const live = r && r.strength > 0;
      rings[i * 4] = live ? r.x : 0;
      rings[i * 4 + 1] = live ? r.y : 0;
      rings[i * 4 + 2] = live ? r.age * RING_SPEED : 0;
      rings[i * 4 + 3] = live
        ? r.strength * (0.6 * k.scale + 8) * Math.exp(-r.age * RING_FADE)
        : 0;
    }
    const pal = colour.current;
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_dpr ?? null, sz.dpr);
    gl.uniform1f(u.u_time ?? null, s.t);
    gl.uniform1f(u.u_scale ?? null, k.scale);
    gl.uniform1f(u.u_stripes ?? null, k.stripes);
    gl.uniform1f(u.u_amp ?? null, amp);
    gl.uniform1f(u.u_len ?? null, k.wavelength);
    gl.uniform4f(
      u.u_heading ?? null,
      Math.cos(k.angle),
      Math.sin(k.angle),
      Math.cos(k.angle + k.cross),
      Math.sin(k.angle + k.cross),
    );
    gl.uniform2f(u.u_phase ?? null, k.phase1, k.phase2);
    gl.uniform1f(u.u_herring ?? null, k.herring ? 1 : 0);
    gl.uniform1f(u.u_sheen ?? null, k.sheen);
    gl.uniform3f(u.u_a ?? null, pal[0] ?? 0, pal[1] ?? 0, pal[2] ?? 0);
    gl.uniform3f(u.u_b ?? null, pal[3] ?? 0, pal[4] ?? 0, pal[5] ?? 0);
    gl.uniform3f(u.u_lite ?? null, pal[6] ?? 1, pal[7] ?? 1, pal[8] ?? 1);
    gl.uniform3f(u.u_shade ?? null, pal[9] ?? 0, pal[10] ?? 0, pal[11] ?? 0);
    gl.uniform4f(u.u_hand ?? null, s.x, s.y, lift, reach);
    gl.uniform4fv(u.u_ring ?? null, rings);
    tri.draw();
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Advances the sea and the springs by dt; says whether anything still moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const target = s.on ? 1 : 0;
    if (!k.motionSafe) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = 0;
      s.vy = 0;
      s.level = target;
      s.levelV = 0;
      s.rise = 1;
      s.riseV = 0;
      for (const r of s.rings) r.strength = 0;
      return false;
    }
    const sea = !k.paused && k.speed > 0 && k.swell > 0;
    if (sea) s.t += dt * k.speed;
    const G = springs.glide;
    const D = springs.drift;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      // Where: the mound trails the hand on the glide spring, so it is
      // pushed along like water rather than pinned to the cursor.
      const ax = (-G.stiffness * (s.x - s.tx) - G.damping * s.vx) / G.mass;
      const ay = (-G.stiffness * (s.y - s.ty) - G.damping * s.vy) / G.mass;
      s.vx += ax * STEP;
      s.vy += ay * STEP;
      s.x += s.vx * STEP;
      s.y += s.vy * STEP;
      // How much: the mound rises and settles on the drift spring.
      const al =
        (-D.stiffness * (s.level - target) - D.damping * s.levelV) / D.mass;
      s.levelV += al * STEP;
      s.level += s.levelV * STEP;
      const ar =
        (-D.stiffness * (s.rise - s.riseTo) - D.damping * s.riseV) / D.mass;
      s.riseV += ar * STEP;
      s.rise += s.riseV * STEP;
    }
    if (steps === 8) s.carry = 0;
    let rings = false;
    for (const r of s.rings) {
      if (r.strength <= 0) continue;
      r.age += dt;
      if (Math.exp(-r.age * RING_FADE) * r.strength < 0.02) r.strength = 0;
      else rings = true;
    }
    const handMoving =
      Math.abs(s.x - s.tx) + Math.abs(s.y - s.ty) > 0.05 ||
      Math.abs(s.vx) + Math.abs(s.vy) > 0.5;
    if (!handMoving) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = 0;
      s.vy = 0;
    }
    const levelMoving =
      Math.abs(s.level - target) > 0.002 || Math.abs(s.levelV) > 0.01;
    if (!levelMoving) {
      s.level = target;
      s.levelV = 0;
    }
    const rising =
      Math.abs(s.rise - s.riseTo) > 0.001 || Math.abs(s.riseV) > 0.005;
    if (!rising) {
      s.rise = s.riseTo;
      s.riseV = 0;
    }
    return (
      sea || (handMoving && s.level > 0.001) || levelMoving || rising || rings
    );
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (
      !visible.current ||
      document.hidden ||
      !gpu.current ||
      gpu.current.lost
    ) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const moving = advance(dt);
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** The first sighting: the swell rises out of a flat cloth. */
  const arrive = () => {
    if (arrived.current) return;
    arrived.current = true;
    const s = sim.current;
    if (k.intro && k.motionSafe && k.swell > 0) {
      s.rise = 0;
      s.riseV = 0;
    }
    s.riseTo = 1;
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readPalette, tick, arrive };
    report.current = onActiveChange;
  });

  // The GPU side, bound to the canvas: built, rebuilt after a lost context,
  // torn down with the component. StrictMode's second run builds again on
  // the same context, which the browser hands back unchanged.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpu.current = { gl, program, tri, lost: false };
      api.current?.readPalette();
      api.current?.resize();
      api.current?.draw();
      api.current?.kick();
      return true;
    };
    if (!build()) {
      rootRef.current?.setAttribute("data-fallback", "");
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

  React.useEffect(() => {
    api.current?.readPalette();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  // Anything that changes the picture: draw it, and run if it now moves.
  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [
    k.scale,
    k.swell,
    k.herring,
    k.stripes,
    k.speed,
    k.wavelength,
    k.angle,
    k.sheen,
    k.strength,
    k.seed,
    paused,
    motionSafe,
  ]);

  // Switching the hand off lets go of the cloth, and says so.
  React.useEffect(() => {
    if (interactive) return;
    const s = sim.current;
    s.on = false;
    s.source = null;
    s.focus = null;
    api.current?.kick();
    if (active.current) {
      active.current = false;
      report.current?.(false);
    }
  }, [interactive]);

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

  // Size and sighting, bound to the node when it arrives.
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
      api.current?.arrive();
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

  const setActive = (next: boolean) => {
    if (active.current === next) return;
    active.current = next;
    report.current?.(next);
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  /** The hand goes to (x, y); arriving from nowhere, the mound starts there. */
  const handTo = (x: number, y: number, source: "pointer" | "focus") => {
    const s = sim.current;
    if (s.level < 0.01 || !k.motionSafe) {
      s.x = x;
      s.y = y;
      s.vx = 0;
      s.vy = 0;
    }
    s.tx = x;
    s.ty = y;
    s.on = true;
    s.source = source;
    setActive(true);
    kick();
  };

  /** The pointer leaves: the mound goes back to a focused control, or settles. */
  const handAway = () => {
    const s = sim.current;
    if (s.focus) {
      handTo(s.focus.x, s.focus.y, "focus");
      return;
    }
    s.on = false;
    s.source = null;
    setActive(false);
    kick();
  };

  const ringAt = (x: number, y: number, strength: number) => {
    if (!k.pulse || !k.motionSafe) return;
    // A free slot, or else the oldest ring gives way.
    const rings = sim.current.rings;
    let pick = 0;
    for (let i = 0; i < rings.length; i += 1) {
      const age = rings[i]?.strength ? (rings[i]?.age ?? 0) : Infinity;
      const best = rings[pick]?.strength ? (rings[pick]?.age ?? 0) : Infinity;
      if (age > best) pick = i;
    }
    const slot = rings[pick];
    if (!slot) return;
    slot.x = x;
    slot.y = y;
    slot.age = 0;
    slot.strength = strength;
    kick();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit)) ringAt(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") handAway();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" && sim.current.source === "pointer")
      handAway();
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    const root = rootRef.current;
    if (!root || !(el instanceof Element) || !el.matches(":focus-visible"))
      return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    sim.current.focus = at;
    handTo(at.x, at.y, "focus");
    ringAt(at.x, at.y, FOCUS_PULSE);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    const s = sim.current;
    s.focus = null;
    if (s.source === "focus") handAway();
  };

  const onColour = () => {
    api.current?.readPalette();
    api.current?.draw();
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
        "group/chevron-tide relative isolate h-full w-full touch-manipulation overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/chevron-tide:invisible group-data-live/chevron-tide:opacity-0"
        style={standIn(paints, k.scale, k.stripes)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColour}
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
 * browser without WebGL2: the same zigzag in CSS gradients, with a soft band
 * of light where a crest would be.
 */
function standIn(
  paints: readonly [string, string, string, string],
  scale: number,
  stripes: number,
): React.CSSProperties {
  const [a, b, lite] = paints;
  const cell = Math.max(6, Math.round((scale / stripes) * 2));
  const half = Math.round(cell / 2);
  return {
    backgroundColor: b,
    backgroundImage: [
      `linear-gradient(172deg, transparent 18%, color-mix(in oklab, ${lite} 38%, transparent) 44%, transparent 68%)`,
      `linear-gradient(135deg, ${a} 25%, transparent 25%)`,
      `linear-gradient(225deg, ${a} 25%, transparent 25%)`,
      `linear-gradient(315deg, ${a} 25%, transparent 25%)`,
      `linear-gradient(45deg, ${a} 25%, transparent 25%)`,
    ].join(", "),
    backgroundSize: `100% 100%, ${cell}px ${cell}px, ${cell}px ${cell}px, ${cell}px ${cell}px, ${cell}px ${cell}px`,
    backgroundPosition: `0 0, -${half}px 0, -${half}px 0, 0 0, 0 0`,
  };
}
