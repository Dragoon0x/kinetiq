"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  bindScreen,
  createFramebuffer,
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  onContextLoss,
  resizeGL,
  type Framebuffer,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TubeGlowColors = "aurora" | "ember" | "lagoon" | "mono";

export type TubeGlowProps = {
  /** The content in front of the tube: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How far the glass bulges, 0 (flat) to 1 (a deep old tube). @default 0.5 */
  curve?: number;
  /** How dark the gaps between scanlines are, 0 to 1. @default 0.5 */
  scanlines?: number;
  /** A named palette, or your own four CSS colours from darkest to brightest. @default "aurora" */
  colors?: TubeGlowColors | readonly string[];
  /** How strongly the phosphor stripes show, 0 to 1. @default 0.35 */
  mask?: number;
  /** How much bright colour blooms and breathes, 0 to 1. @default 0.5 */
  bloom?: number;
  /** How bright the rolling sync bar is, 0 (none) to 1. @default 0.4 */
  roll?: number;
  /** How fast the colour field shifts, 0 (held) to 3. @default 1 */
  speed?: number;
  /** Scanline pitch, in px (2 to 8). @default 3 */
  pitch?: number;
  /** How bright the reflection on the glass is, 0 to 1. @default 0.5 */
  glare?: number;
  /** The pointer and keyboard focus lean the tube's curve toward them. @default true */
  interactive?: boolean;
  /** How far the curve leans toward the pointer, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** A press on the tube (not on a control) degausses it: the colour swirls and rings down. @default true */
  pulse?: boolean;
  /** The tube warms up the first time it comes into view. @default true */
  intro?: boolean;
  /** Hold the field, the bar and the breath still; the pointer can still lean the curve. @default false */
  paused?: boolean;
  /** Seeds the colour field, so two tubes never show the same picture. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) leaning the curve. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Four stops from shadow to highlight. A lit tube looks the same by day or by
 * night, so these are pigments at fixed lightness, not page colours.
 */
const PALETTES: Record<
  TubeGlowColors,
  readonly [string, string, string, string]
> = {
  aurora: [
    "oklch(0.3 0.08 268)",
    "oklch(0.52 0.15 285)",
    "oklch(0.72 0.13 195)",
    "oklch(0.88 0.12 152)",
  ],
  ember: [
    "oklch(0.3 0.07 28)",
    "oklch(0.55 0.16 30)",
    "oklch(0.74 0.15 58)",
    "oklch(0.9 0.1 92)",
  ],
  lagoon: [
    "oklch(0.3 0.06 232)",
    "oklch(0.52 0.12 222)",
    "oklch(0.72 0.1 196)",
    "oklch(0.9 0.06 172)",
  ],
  mono: [
    "color-mix(in oklab, var(--accent) 34%, black)",
    "var(--accent)",
    "var(--accent-bright)",
    "color-mix(in oklab, var(--accent-bright) 40%, white)",
  ],
};

/** The bezel is the page; the tube's rim is the page in shadow. */
const BEZEL = [
  "var(--background)",
  "color-mix(in oklab, var(--background) 42%, black)",
] as const;

function paletteOf(
  colors: TubeGlowColors | readonly string[],
): readonly [string, string, string, string] {
  if (typeof colors === "string")
    return PALETTES[colors as TubeGlowColors] ?? PALETTES.aurora;
  const a = colors[0] ?? PALETTES.aurora[0];
  const b = colors[1] ?? a;
  const c = colors[2] ?? b;
  return [a, b, c, colors[3] ?? c];
}

/** Fixed physics step: the springs integrate at 120 Hz whatever the display does. */
const STEP = 1 / 120;
/** A degauss rings down over this long, s. */
const DEGAUSS = 0.9;
/** The recoil spring, from the calibration set, as a decay rate and a ringing frequency. */
const DECAY = springs.recoil.damping / (2 * springs.recoil.mass);
const RINGING = Math.sqrt(
  springs.recoil.stiffness / springs.recoil.mass - DECAY * DECAY,
);
/** The keyboard's degauss is a softer one than a press. */
const FOCUS_PULSE = 0.55;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FIELD = /* glsl */ `
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_time;
uniform float u_seed;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec4 u_degauss;
${GLSL_NOISE}

float fbm3(vec2 p) {
  return 0.55 * kx_noise(p) + 0.3 * kx_noise(p * 2.03 + 3.1) + 0.15 * kx_noise(p * 4.1 + 7.7);
}

void main() {
  vec2 px = v_uv * u_res;
  // The degauss: the picture swirls about where the coil was touched.
  vec2 dp = px - u_degauss.xy;
  float ang = u_degauss.z * exp(-length(dp) / max(u_degauss.w, 1.0));
  float cs = cos(ang);
  float sn = sin(ang);
  px = u_degauss.xy + mat2(cs, -sn, sn, cs) * dp;
  vec2 p = px / max(u_res.x, u_res.y) * 3.2 + u_seed;
  float t = u_time * 0.06;
  // Domain-warped noise: soft colour that folds slowly into itself.
  vec2 w = vec2(fbm3(p + vec2(0.0, t)), fbm3(p + vec2(5.2, 1.3) - t));
  float n = fbm3(p + 1.25 * w + vec2(0.6 * t, -0.4 * t));
  n = smoothstep(0.18, 0.82, n);
  vec3 c = n < 0.4 ? mix(u_c0, u_c1, n / 0.4)
    : n < 0.72 ? mix(u_c1, u_c2, (n - 0.4) / 0.32)
    : mix(u_c2, u_c3, (n - 0.72) / 0.28);
  o_color = vec4(c, 1.0);
}
`;

const TUBE = /* glsl */ `
in vec2 v_uv;
out vec4 o_color;
uniform sampler2D u_field;
uniform vec2 u_res;
uniform float u_dpr;
uniform float u_time;
uniform float u_curve;
uniform vec2 u_lean;
uniform float u_scan;
uniform float u_pitch;
uniform float u_mask;
uniform float u_bloom;
uniform float u_breath;
uniform float u_roll;
uniform float u_glare;
uniform float u_power;
uniform float u_split;
uniform vec3 u_bezel;
uniform vec3 u_rim;

float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 pic(vec2 q) {
  return texture(u_field, vec2(q.x, 1.0 - q.y)).rgb;
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

void main() {
  // Barrel distortion about a centre that leans toward the hand: each edge
  // bows by the same share of its own length, as on a tube.
  vec2 c = vec2(0.5) + u_lean;
  vec2 d = (v_uv - c) * 2.0;
  float k = 0.015 + 0.085 * u_curve;
  vec2 q = c + (v_uv - c) * (1.0 + k * dot(d, d));

  vec2 qpx = q * u_res;
  float corner = min(u_res.x, u_res.y) * (0.06 + 0.08 * u_curve);
  float sd = sdRoundBox(qpx - u_res * 0.5, u_res * 0.5 - 2.0, corner);
  float aa = 1.0 / u_dpr;
  float inside = 1.0 - smoothstep(-aa, aa, sd);

  // The rolling sync bar: a soft brighter band that drifts down and nudges
  // the picture sideways as it passes.
  float barY = fract(q.y - u_time * 0.045);
  float bar = exp(-pow((barY - 0.5) / 0.07, 2.0)) * u_roll;
  vec2 qs = q + vec2(bar * 0.0035, 0.0);

  // Convergence: the guns part when the tube is degaussed.
  vec2 sp = vec2(u_split / u_res.x, 0.0);
  vec3 col = vec3(pic(qs - sp).r, pic(qs).g, pic(qs + sp).b);

  // Bloom: the picture's light spread round itself, breathing slowly.
  float r = (0.006 + 0.01 * u_bloom) * (1.0 + 0.35 * u_breath);
  vec2 rr = vec2(r * u_res.y / u_res.x, r);
  vec3 halo = (pic(qs + vec2(rr.x, 0.0)) + pic(qs - vec2(rr.x, 0.0)) +
               pic(qs + vec2(0.0, rr.y)) + pic(qs - vec2(0.0, rr.y)) +
               pic(qs + rr * 0.7) + pic(qs - rr * 0.7)) / 6.0;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += halo * halo * u_bloom * (0.55 + 0.25 * u_breath);
  col *= 1.0 + bar * 0.12;

  // Scanlines follow the curved picture. Bright light widens the beam, so
  // the gaps close where it is bright; they fade before they could alias.
  float ph = qpx.y / u_pitch;
  float beam = 0.5 + 0.5 * cos(6.2831853 * ph);
  float shape = pow(beam, mix(1.8, 0.35, clamp(lum * 1.3, 0.0, 1.0)));
  float fade = 1.0 - smoothstep(0.32, 0.55, fwidth(ph));
  col *= mix(1.0, 0.18 + 0.82 * shape, u_scan * 0.85 * fade);

  // The aperture grille, in screen space: one CSS px per colour.
  float stripe = mod(floor(gl_FragCoord.x / u_dpr), 3.0);
  vec3 triad = stripe < 0.5 ? vec3(1.0, 0.45, 0.45) : stripe < 1.5 ? vec3(0.45, 1.0, 0.45) : vec3(0.45, 0.45, 1.0);
  col *= mix(vec3(1.0), triad * 1.32, u_mask * 0.55);

  // Warm-up, and the phosphor's falloff into the dark rim at the edge.
  col *= u_power;
  float edge = smoothstep(-min(u_res.x, u_res.y) * 0.11, 0.0, sd);
  col = mix(col, u_rim, edge * edge * 0.8);

  // A soft reflection on the glass, sliding against the lean.
  vec2 g = (v_uv - (vec2(0.27, 0.2) - u_lean * 1.6)) * vec2(1.0, u_res.y / u_res.x * 2.2);
  col += vec3(1.0) * exp(-dot(g, g) * 14.0) * u_glare * 0.16;
  // A faint highlight along the top of the curved glass.
  col += vec3(1.0) * smoothstep(-6.0, 0.0, sd) * (1.0 - smoothstep(0.0, 1.0, v_uv.y * 3.0)) * u_glare * 0.05;

  col += (grain(gl_FragCoord.xy) - 0.5) * (3.0 / 255.0);
  o_color = vec4(mix(u_bezel, col, inside), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  field: Program;
  tube: Program;
  fieldTri: FullscreenTriangle;
  tubeTri: FullscreenTriangle;
  fbo: Framebuffer | null;
  lost: boolean;
};

type Sim = {
  t: number;
  last: number;
  carry: number;
  /** The warm-up: how much of its light the picture has. */
  rise: number;
  riseV: number;
  riseTo: number;
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
  focus: { x: number; y: number } | null;
  /** The degauss: where, how hard, and how long ago; strength 0 when idle. */
  dx: number;
  dy: number;
  dAge: number;
  dStrength: number;
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
 * A slowly shifting colour field seen through a curved picture tube, as a
 * background, with the content in front of it and perfectly crisp. The field
 * is domain-warped noise through a four-stop ramp; the tube bows it with
 * barrel distortion into a rounded picture that falls into a dark phosphor
 * rim and the page around it, laid with fine scanlines that close where the
 * light is bright, an aperture grille, a slowly breathing bloom, a rolling
 * sync bar and a soft reflection on the glass.
 *
 * The curve leans toward the pointer (springs.glide for where, springs.drift
 * for how much) while the reflection slides the other way, and a press
 * degausses the tube: the colour swirls round the press and the guns part,
 * ringing down on the recoil spring. It is decoration: `aria-hidden`, never
 * a focus stop, never in the way of a click; keyboard focus on a control
 * inside leans the curve toward it and degausses softly. Two WebGL2 passes
 * (the field at half resolution), drawn only while on screen, in a visible
 * page and while something moves. Under reduced motion the tube is a still
 * picture, centred, with no roll, breath or degauss.
 */
export function TubeGlow({
  children,
  curve = 0.5,
  scanlines = 0.5,
  colors = "aurora",
  mask = 0.35,
  bloom = 0.5,
  roll = 0.4,
  speed = 1,
  pitch = 3,
  glare = 0.5,
  interactive = true,
  pointerStrength = 0.6,
  pulse = true,
  intro = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: TubeGlowProps) {
  const motionSafe = useMotionSafe();
  const paints = [...paletteOf(colors), ...BEZEL] as const;
  const paintKey = paints.join("|");

  const k = {
    curve: clamp01(curve),
    scanlines: clamp01(scanlines),
    mask: clamp01(mask),
    bloom: clamp01(bloom),
    roll: clamp01(roll),
    speed: clamp(speed, 0, 3),
    pitch: clamp(pitch, 2, 8),
    glare: clamp01(glare),
    strength: clamp01(pointerStrength),
    pulse,
    intro,
    paused,
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const box = React.useRef<Size | null>(null);
  const colour = React.useRef(new Float32Array(18));
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
    dx: 0,
    dy: 0,
    dAge: 0,
    dStrength: 0,
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
    for (let i = 0; i < 6; i += 1) {
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
    box.current = {
      w: r.width / r.dpr,
      h: r.height / r.dpr,
      bw: r.width,
      bh: r.height,
      dpr: r.dpr,
    };
    // The field is soft; half resolution carries it, and the tube's fine
    // detail is drawn at full resolution over it.
    const fw = Math.max(1, Math.ceil(r.width / 2));
    const fh = Math.max(1, Math.ceil(r.height / 2));
    if (!g.fbo || g.fbo.width !== fw || g.fbo.height !== fh) {
      g.fbo?.dispose();
      g.fbo = createFramebuffer(g.gl, fw, fh);
    }
  };

  /** One frame, from the sim as it stands. Uniforms go straight to their locations: nothing is allocated. */
  const draw = () => {
    const g = gpu.current;
    const sz = box.current;
    if (!g || g.lost || !sz || !g.fbo || !visible.current) return;
    const { gl } = g;
    const s = sim.current;
    const pal = colour.current;
    // The degauss rings down on the recoil spring: two visible wobbles,
    // then still.
    const a = s.dStrength
      ? s.dStrength *
        Math.exp(-DECAY * s.dAge) *
        Math.cos(RINGING * s.dAge) *
        Math.min(1, s.dAge * 30)
      : 0;
    const reach = Math.max(sz.w, sz.h) * 0.45;

    g.fbo.bind();
    let u = g.field.uniforms;
    g.field.use();
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_time ?? null, s.t);
    gl.uniform1f(u.u_seed ?? null, (k.seed % 61) * 1.913);
    gl.uniform3f(u.u_c0 ?? null, pal[0] ?? 0, pal[1] ?? 0, pal[2] ?? 0);
    gl.uniform3f(u.u_c1 ?? null, pal[3] ?? 0, pal[4] ?? 0, pal[5] ?? 0);
    gl.uniform3f(u.u_c2 ?? null, pal[6] ?? 0, pal[7] ?? 0, pal[8] ?? 0);
    gl.uniform3f(u.u_c3 ?? null, pal[9] ?? 1, pal[10] ?? 1, pal[11] ?? 1);
    gl.uniform4f(u.u_degauss ?? null, s.dx, s.dy, a * 2.4, reach);
    g.fieldTri.draw();

    bindScreen(gl);
    u = g.tube.uniforms;
    g.tube.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.fbo.texture);
    gl.uniform1i(u.u_field ?? null, 0);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_dpr ?? null, sz.dpr);
    gl.uniform1f(u.u_time ?? null, s.t);
    gl.uniform1f(u.u_curve ?? null, k.curve);
    // The lean: toward the hand, a fraction of the way, as much as it is there.
    const lean = 0.16 * k.strength * s.level;
    gl.uniform2f(
      u.u_lean ?? null,
      sz.w > 0 ? (s.x / sz.w - 0.5) * lean : 0,
      sz.h > 0 ? (s.y / sz.h - 0.5) * lean : 0,
    );
    gl.uniform1f(u.u_scan ?? null, k.scanlines);
    gl.uniform1f(u.u_pitch ?? null, k.pitch);
    gl.uniform1f(u.u_mask ?? null, k.mask);
    // Warming up, the bloom starts high and settles as the picture comes in.
    gl.uniform1f(u.u_bloom ?? null, k.bloom * (1 + (1 - s.rise) * 1.5));
    gl.uniform1f(
      u.u_breath ?? null,
      k.motionSafe ? Math.sin(s.t * 0.8 + k.seed) : 0,
    );
    gl.uniform1f(u.u_roll ?? null, k.motionSafe ? k.roll : 0);
    gl.uniform1f(u.u_glare ?? null, k.glare);
    gl.uniform1f(u.u_power ?? null, 0.12 + 0.88 * s.rise);
    gl.uniform1f(u.u_split ?? null, Math.abs(a) * 10);
    gl.uniform3f(u.u_bezel ?? null, pal[12] ?? 0, pal[13] ?? 0, pal[14] ?? 0);
    gl.uniform3f(u.u_rim ?? null, pal[15] ?? 0, pal[16] ?? 0, pal[17] ?? 0);
    g.tubeTri.draw();
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Advances the field and the springs by dt; says whether anything still moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const target = s.on ? 1 : 0;
    if (!k.motionSafe) {
      // A still tube, centred: the hand leans nothing.
      s.x = s.tx;
      s.y = s.ty;
      s.vx = 0;
      s.vy = 0;
      s.level = 0;
      s.levelV = 0;
      s.rise = 1;
      s.riseV = 0;
      s.dStrength = 0;
      return false;
    }
    const running = !k.paused && k.speed > 0;
    if (running) s.t += dt * k.speed;
    const G = springs.glide;
    const D = springs.drift;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      const ax = (-G.stiffness * (s.x - s.tx) - G.damping * s.vx) / G.mass;
      const ay = (-G.stiffness * (s.y - s.ty) - G.damping * s.vy) / G.mass;
      s.vx += ax * STEP;
      s.vy += ay * STEP;
      s.x += s.vx * STEP;
      s.y += s.vy * STEP;
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
    let ringing = false;
    if (s.dStrength > 0) {
      s.dAge += dt;
      if (s.dAge > DEGAUSS) s.dStrength = 0;
      else ringing = true;
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
      running ||
      ringing ||
      (handMoving && s.level > 0.001) ||
      levelMoving ||
      rising
    );
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    const g = gpu.current;
    if (!visible.current || document.hidden || !g || g.lost) {
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

  /** The first sighting: the tube warms up. */
  const arrive = () => {
    if (arrived.current) return;
    arrived.current = true;
    const s = sim.current;
    if (k.intro && k.motionSafe) {
      s.rise = 0;
      s.riseV = 0;
    }
    s.riseTo = 1;
    kick();
  };

  /** A degauss at (x, y): the field swirls there and rings down. */
  const degauss = (x: number, y: number, strength: number) => {
    if (!k.pulse || !k.motionSafe) return;
    const s = sim.current;
    s.dx = x;
    s.dy = y;
    s.dAge = 0;
    s.dStrength = strength;
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
      const field = createProgram(gl, FULLSCREEN_VERTEX, FIELD);
      const tube = createProgram(gl, FULLSCREEN_VERTEX, TUBE);
      if (!field || !tube) {
        field?.dispose();
        tube?.dispose();
        return false;
      }
      gpu.current = {
        gl,
        field,
        tube,
        fieldTri: createFullscreenTriangle(gl, field),
        tubeTri: createFullscreenTriangle(gl, tube),
        fbo: null,
        lost: false,
      };
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
        g.fbo?.dispose();
        g.fieldTri.dispose();
        g.tubeTri.dispose();
        g.field.dispose();
        g.tube.dispose();
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
    k.curve,
    k.scanlines,
    k.mask,
    k.bloom,
    k.roll,
    k.speed,
    k.pitch,
    k.glare,
    k.strength,
    k.seed,
    paused,
    motionSafe,
  ]);

  // Switching the hand off lets the curve settle, and says so.
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

  /** The hand goes to (x, y); arriving from nowhere, the lean starts there. */
  const handTo = (x: number, y: number, source: "pointer" | "focus") => {
    const s = sim.current;
    if (s.level < 0.01) {
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

  /** The pointer leaves: the curve leans back to a focused control, or settles. */
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
    if (!hit || !rootRef.current?.contains(hit)) degauss(at.x, at.y, 1);
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
    degauss(at.x, at.y, FOCUS_PULSE);
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
        "group/tube-glow relative isolate h-full w-full touch-manipulation overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/tube-glow:invisible group-data-live/tube-glow:opacity-0"
        style={standIn(paints, k.pitch, k.scanlines)}
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
 * browser without WebGL2: the field's colours in soft pools, scanlines over
 * them, and the dark rim of the tube.
 */
function standIn(
  paints: readonly string[],
  pitch: number,
  scanlines: number,
): React.CSSProperties {
  const [c0, c1, c2, c3, , rim] = paints;
  const p = Math.round(pitch * 100) / 100;
  const dark = Math.round(scanlines * 42);
  return {
    backgroundColor: c0,
    backgroundImage: [
      `repeating-linear-gradient(180deg, transparent 0 ${p / 2}px, color-mix(in oklab, black ${dark}%, transparent) ${p / 2}px ${p}px)`,
      `radial-gradient(ellipse 120% 110% at 50% 50%, transparent 58%, color-mix(in oklab, ${rim} 85%, transparent) 100%)`,
      `radial-gradient(ellipse 45% 70% at 30% 40%, ${c3}, transparent 70%)`,
      `radial-gradient(ellipse 50% 80% at 70% 60%, ${c2}, transparent 72%)`,
      `radial-gradient(ellipse 80% 100% at 50% 50%, ${c1}, transparent 80%)`,
    ].join(", "),
  };
}
