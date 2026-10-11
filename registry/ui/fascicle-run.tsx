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
import { cn } from "@/registry/lib/utils";

export type FascicleRunProps = {
  /** How many fibres line the bundle, across all its layers, 8 to 48. @default 24 */
  strands?: number;
  /** How fast the flight cruises, 0 (hovering) to 2. @default 1 */
  speed?: number;
  /** How often signals race along each fibre, 0 (a rare pulse) to 1 (a busy bundle). @default 0.5 */
  pulse?: number;
  /** How many times faster the flight goes while a press is held, 1 to 6. @default 3 */
  boost?: number;
  /** How much the bundle bends, 0 (dead straight) to 1. @default 0.5 */
  curve?: number;
  /** How often a side branch opens and fibres peel away into it, 0 (never) to 1 (often). @default 0.5 */
  branches?: number;
  /** How far the pointer steers the camera within the bundle, 0 to 1. @default 0.6 */
  steer?: number;
  /** The fibres' colour, any CSS colour; resolved on the element so it follows the theme. @default "var(--accent-bright)" */
  fiberColor?: string;
  /** The signals' colour. @default "var(--signal)" */
  pulseColor?: string;
  /** Content above the flight: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The pointer steers and a held press speeds up; the keys do both. @default true */
  interactive?: boolean;
  /** Hold the flight and the signals where they are; steering still answers. @default false */
  paused?: boolean;
  /** Names the flight for assistive technology. @default "Nerve bundle flight" */
  label?: string;
  /** Seeds the fibres' places, the signals and the branches, so two bundles never match. @default 5 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the visitor's hold speeds the flight up (true) or lets it ease back (false). */
  onBoostChange?: (boosting: boolean) => void;
  /** Shows the flight but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const STEP = 1 / 120;
/** World units a second at speed 1; the bundle's radius is 1. */
const CRUISE = 4;
/** The steering disc: how far off the axis the camera may go. */
const REACH = 0.34;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

const toUnit = (byte: number) => byte / 255;
const fract = (v: number) => v - Math.floor(v);

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_time;
uniform float u_z;
uniform vec2 u_cam;
uniform float u_roll;
uniform float u_fov;
uniform float u_strands;
uniform float u_pulse;
uniform float u_branch;
uniform float u_curve;
uniform float u_seed;
uniform float u_streak;
uniform float u_px;
uniform vec3 u_fiber;
uniform vec3 u_pulseC;
uniform vec3 u_bg;
uniform float u_dark;

const float TAU = 6.2831853;

float hash1(float n) { return fract(sin(n * 12.9898 + u_seed * 78.233) * 43758.5453); }

// The bundle's centreline: slow, incommensurate swings, so it never repeats.
vec2 path(float z) {
  return u_curve * vec2(
    1.1 * sin(z * 0.12 + 1.3) + 0.45 * sin(z * 0.29 + u_seed),
    0.75 * cos(z * 0.15 + 0.4 * u_seed) + 0.3 * sin(z * 0.37 + 2.0));
}

float wrapA(float a) { return a - TAU * floor(a / TAU + 0.5); }

// Where the ray meets a shell of radius rho: depth along the view, refined
// twice against the bending centreline.
float shellDepth(vec2 eye, vec2 dir, float rho) {
  float dd = max(dot(dir, dir), 1e-8);
  vec2 o = eye - path(u_z);
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    float od = dot(o, dir);
    float c = dot(o, o) - rho * rho;
    // Past the bend the camera's line leaves this layer's tube: that ray
    // sees only fog.
    if (c >= 0.0) return 60.0;
    float root = sqrt(od * od - dd * c);
    // The far root, in whichever form does not cancel.
    s = od <= 0.0 ? (-od + root) / dd : -c / (od + root);
    s = min(s, 60.0);
    o = eye - path(u_z + s);
  }
  return s;
}

// One shell's fibres at a point (angle a, depth zw): brightness of the
// sheath, the core and the signals on it, and a mask for the branch hole.
vec3 fibres(float a, float zw, float s, float shell, float count, float rho) {
  float twist = (mod(shell, 2.0) < 0.5 ? 1.0 : -1.0) * 0.09;
  float u = (a - twist * zw) / TAU * count;
  float nb = floor(zw / u_branch);
  float zb = (nb + 0.5) * u_branch;
  float dz = zw - zb;
  float hasBranch = step(fract(nb * 0.618034 + u_seed * 0.37), 0.82);
  float ab = TAU * hash1(nb * 1.7 + 3.0);
  float pull = smoothstep(-5.0, 0.0, dz) * (1.0 - smoothstep(0.0, 0.8, dz)) * hasBranch;
  float leave = smoothstep(-1.4, 0.4, dz) * (1.0 - smoothstep(0.6, 4.5, dz)) * hasBranch;
  // A strand narrower than a pixel is widened and dimmed, so far fibres
  // fade into a soft sheen instead of shimmering.
  float pxWorld = s * u_px;
  vec3 acc = vec3(0.0);
  float base = floor(u + 0.5);
  for (int k = -1; k <= 1; k++) {
    float i = mod(base + float(k), count);
    float h = hash1(i + shell * 37.0);
    float h2 = hash1(i * 1.37 + shell * 11.0 + 5.0);
    float ai = TAU * (i + 0.35 * (h - 0.5)) / count + twist * zw
      + 0.22 * sin(zw * 0.45 + h * 6.28);
    float toward = wrapA(ab - ai);
    float member = 1.0 - smoothstep(0.55, 0.8, abs(toward));
    ai += toward * pull * member * 0.85;
    float d = abs(wrapA(a - ai)) * rho;
    float w = 0.024 + 0.026 * h2;
    // Nodes: the fibre narrows at regular gaps along its length.
    float node = abs(fract(zw / 1.6 + h) - 0.5);
    float nodeF = smoothstep(0.0, 0.07, node);
    w *= 0.55 + 0.45 * nodeF;
    float we = max(w, pxWorld * 1.1);
    float dim = w / we;
    float sheath = exp(-(d * d) / (we * we * 4.0)) * dim;
    float core = exp(-(d * d) / (we * we * 0.35)) * dim;
    float gone = 1.0 - leave * member;
    // Signals race along each fibre, its own way and pace; they flare at
    // the nodes they jump between.
    float dir = h2 > 0.5 ? 1.0 : -1.0;
    float spacing = mix(30.0, 5.0, u_pulse);
    float q = fract((zw - dir * (7.0 + 5.0 * h) * u_time) / spacing + h * 3.7) - 0.5;
    float len = (0.55 + u_streak) / spacing;
    float sig = exp(-(q * q) / (len * len)) * (1.0 + 1.2 * (1.0 - nodeF));
    acc += vec3(sheath, core, sig * (core * 1.4 + sheath * 0.6)) * gone;
  }
  return acc;
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 uv = (v_uv - 0.5) * vec2(aspect, -1.0) * 2.0;
  float cr = cos(u_roll);
  float sr = sin(u_roll);
  uv = mat2(cr, -sr, sr, cr) * uv;
  vec2 eye = path(u_z) + u_cam;
  // The camera looks a little down the bend, so the far end stays in view.
  vec2 aim = (path(u_z + 6.0) - eye) / 6.0;
  vec2 dir = uv * u_fov + aim;

  float sWall = shellDepth(eye, dir, 1.0);
  vec2 qWall = eye + dir * sWall - path(u_z + sWall);
  float aWall = atan(qWall.y, qWall.x);
  float zWall = u_z + sWall;
  float fogK = 1.0 - exp(-sWall / 11.0);
  fogK = mix(fogK, 1.0, smoothstep(16.0, 26.0, sWall));

  // The wall: a soft tissue grain running along the bundle.
  // The wall: packed fibrils running along the bundle, under a soft grain.
  // Noise is read round the circle, not along the angle, so it has no seam.
  vec2 ring = vec2(cos(aWall), sin(aWall));
  float grain = kx_fbm(ring * 1.6 + vec2(zWall * 0.35, zWall * 0.21));
  float fibril = 0.5 + 0.5 * sin(aWall * 46.0 + 6.0 * kx_noise(ring * 2.2 + vec2(zWall * 0.3, 0.0)));
  fibril *= 1.0 - smoothstep(4.0, 16.0, sWall);
  vec3 tissueD = mix(u_bg, u_fiber, 0.14) * (0.7 + 0.45 * grain + 0.35 * fibril);
  vec3 tissueL = mix(u_bg, u_fiber, 0.12) * (0.92 + 0.07 * grain - 0.04 * fibril);
  vec3 col = mix(tissueL, tissueD, u_dark);

  // A branch's opening in the wall: a darker lumen with a lit rim.
  float nb = floor(zWall / u_branch);
  float zb = (nb + 0.5) * u_branch;
  float hasBranch = step(fract(nb * 0.618034 + u_seed * 0.37), 0.82);
  float ab = TAU * hash1(nb * 1.7 + 3.0);
  vec2 e2 = vec2(wrapA(aWall - ab) / 0.42, (zWall - zb) / 1.9);
  float e = dot(e2, e2);
  // Far openings are smaller than a few pixels: they fade out with depth.
  float near = 1.0 - smoothstep(14.0, 24.0, sWall);
  float lumen = (1.0 - smoothstep(0.7, 1.0, e)) * hasBranch * near;
  float er = (e - 1.0) / 0.16;
  float rim = exp(-er * er) * hasBranch * near;
  vec3 deep = mix(u_bg * 0.35, u_bg * 0.82, 1.0 - u_dark);
  col = mix(col, deep * (0.6 + 0.4 * e), lumen);

  // The wall's own fibres, then three inner layers in front of it,
  // sparser and more translucent toward the axis.
  float nWall = max(4.0, floor(u_strands * 0.5));
  vec3 fw = fibres(aWall, zWall, sWall, 0.0, nWall, 1.0);
  // Far fibres crowd toward the vanishing point: they hand over to the fog
  // before they are thinner than a pixel.
  float farFade = 1.0 - smoothstep(9.0, 20.0, sWall);
  fw *= farFade;
  float wallLight = (fw.x * 0.35 + fw.y * 0.65) * (1.0 - lumen * 0.85);
  vec3 glowD = col + u_fiber * wallLight * 0.85 + u_fiber * rim * 0.35;
  vec3 glowL = mix(col, u_fiber * 0.78, clamp(wallLight * 0.7 + rim * 0.25, 0.0, 1.0));
  col = mix(glowL, glowD, u_dark);
  col = mix(col, mix(col, u_pulseC, 0.85), clamp(fw.z * (1.0 - lumen), 0.0, 1.0));

  // The far end: a pale haze on a light page, a soft lit glow on a dark one.
  vec3 fogC = mix(u_bg, u_fiber, mix(0.08, 0.3, u_dark)) * mix(1.0, 1.1, u_dark);
  col = mix(col, fogC, fogK);

  for (int j = 1; j <= 3; j++) {
    float rho = 1.0 - 0.15 * float(j);
    float sj = shellDepth(eye, dir, rho);
    vec2 qj = eye + dir * sj - path(u_z + sj);
    float aj = atan(qj.y, qj.x);
    float zj = u_z + sj;
    float nj = max(2.0, floor(u_strands * 0.5 / 3.0 + 0.5));
    vec3 f = fibres(aj, zj, sj, float(j), nj, rho);
    // Fibres right at the lens soften in, far ones fade into the fog.
    float fade = smoothstep(0.3, 2.6, sj) * exp(-sj / 10.0) * (0.75 - 0.12 * float(j));
    float lightJ = (f.x * 0.3 + f.y * 0.7) * fade;
    vec3 litD = col + u_fiber * lightJ;
    vec3 litL = mix(col, u_fiber * 0.7, clamp(lightJ * 0.65, 0.0, 1.0));
    col = mix(litL, litD, u_dark);
    col = mix(col, u_pulseC, clamp(f.z * fade, 0.0, 1.0) * 0.9);
  }

  // The far end glows softly; the frame's edges fall away.
  vec2 vp = uv - ((path(u_z + 30.0) - eye) / 30.0 - aim) / u_fov;
  float centre = exp(-dot(vp, vp) * 3.0);
  col += u_fiber * centre * mix(0.04, 0.18, u_dark);
  float vig = 1.0 - 0.22 * dot(v_uv - 0.5, v_uv - 0.5) * 4.0 * u_dark;
  o_color = vec4(clamp(col * vig, 0.0, 1.0), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Size = { w: number; h: number; bw: number; bh: number; dpr: number };

type Sim = {
  last: number;
  carry: number;
  /** The flight's depth and the signals' clock. */
  z: number;
  t: number;
  /** The camera's offset in the bundle and its spring velocity. */
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  /** The speed multiplier and its spring velocity. */
  m: number;
  mv: number;
};

type Hand = {
  tx: number;
  ty: number;
  boosting: boolean;
  source: "pointer" | "key" | null;
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
};

/** Content controls the flight must leave alone. */
const INTERACTIVE =
  "a[href],button:not([data-fascicle]),input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true']";

/**
 * An endless flight down the inside of a nerve bundle, drawn per pixel in
 * one WebGL2 pass with your content on top. The bundle is a curving tube
 * whose fibres lie on four concentric layers: each pixel's view ray is
 * intersected with every layer (a straight-tube solve refined against the
 * bending centreline), and the layers are laid back to front, the inner ones
 * sparser and more translucent, so steering shows real parallax between them.
 *
 * Fibres are soft translucent strands with a bright core, drifting in slow
 * spirals and narrowing at regular nodes. Signals race along them both ways,
 * flaring at the nodes they jump between. At intervals a branch opens in the
 * wall, a dark lumen with a lit rim, and the fibres nearest it bend toward it
 * and peel away out of the bundle; new ones join after it.
 *
 * The pointer steers the camera across the bundle, following on the drift
 * spring's constants with a gentle bank; a held press speeds the flight up
 * on the same spring, widening the view and stretching the signals into
 * streaks. The keyboard's way in is a button behind your content: arrow keys
 * steer, holding Space or Enter speeds up, Escape recentres. Under reduced
 * motion the flight is one still frame with a branch in view.
 */
export function FascicleRun({
  strands = 24,
  speed = 1,
  pulse = 0.5,
  boost = 3,
  curve = 0.5,
  branches = 0.5,
  steer = 0.6,
  fiberColor = "var(--accent-bright)",
  pulseColor = "var(--signal)",
  children,
  interactive = true,
  paused = false,
  label = "Nerve bundle flight",
  seed = 5,
  dpr = 2,
  onBoostChange,
  disabled = false,
  className,
}: FascicleRunProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const k = {
    strands: Math.round(clamp(strands, 8, 48)),
    speed: clamp(speed, 0, 2),
    pulse: clamp01(pulse),
    boost: clamp(boost, 1, 6),
    curve: clamp01(curve),
    // A branch every 60 world units at 0, every 14 at 1.
    branch: 60 - 46 * clamp01(branches),
    steer: clamp01(steer),
    seed: (Math.abs(Math.round(seed)) % 997) / 97,
    paused,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };
  const paints = [fiberColor, pulseColor, "var(--background)"];
  const paintKey = paints.join("|");

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef({
    fiber: new Float32Array(3),
    pulse: new Float32Array(3),
    bg: new Float32Array(3),
    dark: 1,
  });
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const sim = React.useRef<Sim>({
    last: 0,
    carry: 0,
    z: 0,
    t: 0,
    cx: 0,
    cy: 0,
    vx: 0,
    vy: 0,
    m: 1,
    mv: 0,
  });
  const hand = React.useRef<Hand>({
    tx: 0,
    ty: 0,
    boosting: false,
    source: null,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onBoostChange);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

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
    const c = colour.current;
    read(0, c.fiber);
    read(1, c.pulse);
    read(2, c.bg);
    const lum = 0.2126 * c.bg[0]! + 0.7152 * c.bg[1]! + 0.0722 * c.bg[2]!;
    c.dark = lum < 0.45 ? 1 : 0;
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    // Large boxes render a little under their pixel count; the fibres are
    // soft, so nothing is lost but the cost.
    const area = canvas.clientWidth * canvas.clientHeight;
    const scale = area > 600_000 ? 0.75 : 1;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr, renderScale: scale });
    size.current = {
      w: r.width / (r.dpr * scale),
      h: r.height / (r.dpr * scale),
      bw: r.width,
      bh: r.height,
      dpr: r.dpr * scale,
    };
  };

  /** Where the still frame sits: a branch a few units ahead of the camera. */
  const stillZ = () => {
    const lb = k.branch;
    // The same golden-ratio sequence the shader uses to place branches.
    for (let n = 1; n < 40; n += 1) {
      if (fract(n * 0.618034 + k.seed * 0.37) <= 0.82)
        return (n + 0.5) * lb - 4;
    }
    return lb * 1.5 - 4;
  };

  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    if (!g || g.lost || !sz) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const c = colour.current;
    const z = k.motionSafe ? s.z : stillZ();
    const t = k.motionSafe ? s.t : 1.7;
    const lift = (s.m - 1) / Math.max(0.001, k.boost - 1);
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_time ?? null, t);
    gl.uniform1f(u.u_z ?? null, z);
    gl.uniform2f(u.u_cam ?? null, s.cx, s.cy);
    gl.uniform1f(u.u_roll ?? null, clamp(-s.vx * 0.35, -0.18, 0.18));
    gl.uniform1f(u.u_fov ?? null, 0.62 + 0.14 * clamp01(lift));
    gl.uniform1f(u.u_strands ?? null, k.strands);
    gl.uniform1f(u.u_pulse ?? null, k.pulse);
    gl.uniform1f(u.u_branch ?? null, k.branch);
    gl.uniform1f(u.u_curve ?? null, k.curve);
    gl.uniform1f(u.u_seed ?? null, k.seed);
    gl.uniform1f(u.u_streak ?? null, 0.5 * clamp01(lift) + 0.1 * k.speed);
    gl.uniform1f(u.u_px ?? null, (0.62 * 2) / Math.max(1, sz.bh));
    gl.uniform3fv(u.u_fiber ?? null, c.fiber);
    gl.uniform3fv(u.u_pulseC ?? null, c.pulse);
    gl.uniform3fv(u.u_bg ?? null, c.bg);
    gl.uniform1f(u.u_dark ?? null, c.dark);
    tri.draw();
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Steps the flight and the camera's springs; true while anything moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const hd = hand.current;
    const want = hd.boosting && k.enabled ? k.boost : 1;
    const ds = springs.drift;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      s.vx +=
        ((-ds.stiffness * (s.cx - hd.tx) - ds.damping * s.vx) / ds.mass) * STEP;
      s.vy +=
        ((-ds.stiffness * (s.cy - hd.ty) - ds.damping * s.vy) / ds.mass) * STEP;
      s.cx += s.vx * STEP;
      s.cy += s.vy * STEP;
      s.mv +=
        ((-ds.stiffness * (s.m - want) - ds.damping * s.mv) / ds.mass) * STEP;
      s.m += s.mv * STEP;
    }
    if (steps === 8) s.carry = 0;
    const springing =
      Math.abs(s.cx - hd.tx) + Math.abs(s.cy - hd.ty) > 1e-4 ||
      Math.abs(s.vx) + Math.abs(s.vy) > 1e-4 ||
      Math.abs(s.m - want) > 1e-3 ||
      Math.abs(s.mv) > 1e-3;
    if (!springing) {
      s.cx = hd.tx;
      s.cy = hd.ty;
      s.vx = 0;
      s.vy = 0;
      s.m = want;
      s.mv = 0;
    }
    if (!k.paused) {
      s.z += CRUISE * k.speed * s.m * dt;
      s.t += dt;
    }
    return !k.paused || springing;
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
    if (!k.motionSafe) {
      s.last = 0;
      draw();
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const busy = advance(dt);
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick };
    report.current = onBoostChange;
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
  }, [
    k.strands,
    k.speed,
    k.pulse,
    k.boost,
    k.curve,
    k.branch,
    k.steer,
    k.seed,
    paused,
    motionSafe,
    k.enabled,
  ]);

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

  /** Speeds up or eases back, from the hold that caused it. */
  const setBoost = (on: boolean) => {
    const hd = hand.current;
    if (!k.enabled || !k.motionSafe || hd.boosting === on) return;
    hd.boosting = on;
    report.current?.(on);
    setSaid((v) => ({ n: v.n + 1, text: on ? "Speeding up." : "Cruising." }));
    kick();
  };

  /** Points the camera at a place in the box, in px from its top left. */
  const steerTo = (x: number, y: number, source: "pointer" | "key") => {
    const root = rootRef.current;
    if (!root || !k.enabled || !k.motionSafe) return;
    const w = Math.max(1, root.clientWidth);
    const h = Math.max(1, root.clientHeight);
    const hd = hand.current;
    let tx = (x / w - 0.5) * 2 * REACH * k.steer;
    let ty = -(y / h - 0.5) * 2 * REACH * k.steer;
    const r = Math.hypot(tx, ty);
    const cap = REACH * k.steer;
    if (r > cap && r > 0) {
      tx *= cap / r;
      ty *= cap / r;
    }
    hd.tx = tx;
    hd.ty = ty;
    hd.source = source;
    kick();
  };

  const centre = () => {
    const hd = hand.current;
    hd.tx = 0;
    hd.ty = 0;
    hd.source = null;
    kick();
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const r = root?.getBoundingClientRect();
    if (!root || !r) return { x: 0, y: 0 };
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: !k.enabled,
    onMove: ({ point, event }) => {
      if (event.pointerType === "mouse") return;
      const at = local(point.x, point.y);
      steerTo(at.x, at.y, "pointer");
    },
    onEnd: () => setBoost(false),
    onCancel: () => setBoost(false),
    onTap: () => setBoost(false),
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!k.enabled || !k.motionSafe) return;
    const hd = hand.current;
    const by = (REACH * k.steer) / 3;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, by],
      ArrowDown: [0, -by],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      let tx = hd.tx + move[0];
      let ty = hd.ty + move[1];
      const r = Math.hypot(tx, ty);
      const cap = REACH * k.steer;
      if (r > cap && r > 0) {
        tx *= cap / r;
        ty *= cap / r;
      }
      hd.tx = tx;
      hd.ty = ty;
      hd.source = "key";
      kick();
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) setBoost(true);
      return;
    }
    if (event.key === "Escape" && (hd.tx !== 0 || hd.ty !== 0)) {
      event.preventDefault();
      centre();
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setBoost(false);
    }
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (!k.enabled || fromContent(event.target)) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        drag.onPointerDown(event);
        const at = local(event.clientX, event.clientY);
        steerTo(at.x, at.y, "pointer");
        setBoost(true);
      }}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (event.pointerType !== "mouse" || !k.enabled) return;
        const at = local(event.clientX, event.clientY);
        steerTo(at.x, at.y, "pointer");
      }}
      onPointerUp={(event) => {
        drag.onPointerUp(event);
        setBoost(false);
      }}
      onPointerCancel={(event) => {
        drag.onPointerCancel(event);
        setBoost(false);
      }}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        if (hand.current.source === "pointer") centre();
        setBoost(false);
      }}
      className={cn(
        "group/fascicle-run relative isolate h-56 w-full overflow-clip bg-background",
        k.enabled ? "touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <BundleStill fiberColor={fiberColor} pulseColor={pulseColor} />
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
      <button
        type="button"
        data-fascicle=""
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => setBoost(false)}
        onClick={(event) => event.preventDefault()}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          k.enabled ? "cursor-pointer" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        {motionSafe
          ? "Arrow keys steer within the bundle; hold Space or Enter to speed up; Escape recentres."
          : "Motion is reduced, so the flight holds still."}
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: fibres converging on a soft glow at the far end, drawn
 * with CSS gradients in the theme's own colours.
 */
function BundleStill({
  fiberColor,
  pulseColor,
}: {
  fiberColor: string;
  pulseColor: string;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/fascicle-run:opacity-0"
      style={{
        backgroundImage: [
          `radial-gradient(ellipse 22% 30% at 52% 48%, color-mix(in oklab, ${fiberColor} 30%, transparent), transparent 70%)`,
          `radial-gradient(ellipse 4% 6% at 61% 40%, color-mix(in oklab, ${pulseColor} 70%, transparent), transparent 80%)`,
          `repeating-conic-gradient(from 3deg at 52% 48%, color-mix(in oklab, ${fiberColor} 34%, transparent) 0deg 0.8deg, transparent 2.2deg 13deg)`,
          `radial-gradient(ellipse 80% 90% at 52% 48%, transparent 8%, color-mix(in oklab, ${fiberColor} 10%, var(--background)) 85%)`,
        ].join(", "),
      }}
    />
  );
}
