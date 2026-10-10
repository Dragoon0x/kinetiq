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

export type LouverLightTone = "dawn" | "noon" | "dusk" | "moon";

export type LouverLightProps = {
  /** The content in front of the wall: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** Rows of slats down the wall, 8 to 160: fine louvres or broad blades. @default 40 */
  slats?: number;
  /** The angle the slats rest at, in degrees from flat-on (−80 to 80); it decides where the light lands. @default 20 */
  tilt?: number;
  /** The light's colour: a named light, or any CSS colour. @default "dawn" */
  light?: LouverLightTone | (string & {});
  /** How far the rolling wave turns each slat either side of its rest, in degrees (0 to 90). @default 55 */
  swing?: number;
  /** How fast the wave rolls, 0 (held) to 3. @default 1 */
  speed?: number;
  /** Distance between bands of light, in px. @default 420 */
  wavelength?: number;
  /** The direction the bands travel, in degrees; 0 runs left to right. @default 35 */
  angle?: number;
  /** Each slat's length between mullions, in slat pitches (2 to 40). @default 12 */
  segment?: number;
  /** The slats' paint, any CSS colour. @default a tint of the page toward its text */
  finish?: string;
  /** How bright the glint is where a slat mirrors the light, 0 to 1. @default 0.6 */
  glint?: number;
  /** The pointer and keyboard focus bend the wave. @default true */
  interactive?: boolean;
  /** How far the pointer bends the wave, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** A press on the wall (not on a control) flips the slats over in a ring from it. @default true */
  pulse?: boolean;
  /** The slats open out of a closed wall the first time it comes into view. @default true */
  intro?: boolean;
  /** Hold the wave still; the pointer can still bend it. @default false */
  paused?: boolean;
  /** Seeds the wave's phase and the slats' small irregularities. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) bending the wave. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Light is a pigment of its own: a fixed lightness, so it looks the same in either theme. */
const TONES: Record<LouverLightTone, string> = {
  dawn: "oklch(0.86 0.08 62)",
  noon: "oklch(0.96 0.015 95)",
  dusk: "oklch(0.76 0.11 32)",
  moon: "oklch(0.84 0.05 250)",
};

const FINISH = "color-mix(in oklab, var(--background) 84%, var(--foreground))";

/**
 * The colours the wall is drawn from, as CSS: the paint, its unlit side, its
 * lit side, the glint and the recess behind. Mixed in oklab, which keeps hue
 * when shading toward black or white.
 */
function paintsOf(
  light: string,
  finish: string,
): readonly [string, string, string, string, string] {
  const lamp = TONES[light as LouverLightTone] ?? light;
  return [
    finish,
    `color-mix(in oklab, ${finish} 80%, black)`,
    `color-mix(in oklab, ${finish} 40%, ${lamp})`,
    `color-mix(in oklab, ${lamp} 70%, white)`,
    `color-mix(in oklab, ${finish} 52%, black)`,
  ];
}

/** Fixed physics step: the springs integrate at 120 Hz whatever the display does. */
const STEP = 1 / 120;
/** A flip ring's front travels this fast, px/s. */
const RING_SPEED = 900;
/** How long a slat takes to land its half turn on the recoil spring, s, with margin. */
const LAND = 0.7;
/** The keyboard's flip ring reaches this far, px; a press reaches the whole wall. */
const FOCUS_REACH = 150;
const RINGS = 4;
/**
 * The recoil spring's step response, from the calibration set: its decay
 * rate, its ringing frequency and the sine's share, for the shader.
 */
const DECAY = springs.recoil.damping / (2 * springs.recoil.mass);
const RINGING = Math.sqrt(
  springs.recoil.stiffness / springs.recoil.mass - DECAY * DECAY,
);
/** One full cycle of the wave per this many seconds at speed 1. */
const PERIOD = 7.5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const rad = (deg: number) => (deg * Math.PI) / 180;

/** A small seeded generator: the same wall for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
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
uniform float u_pitch;
uniform float u_seg;
uniform float u_tilt;
uniform float u_swing;
uniform vec4 u_wave;
uniform float u_glint;
uniform float u_seed;
uniform vec3 u_finish;
uniform vec3 u_dark;
uniform vec3 u_lit;
uniform vec3 u_shine;
uniform vec3 u_recess;
uniform vec4 u_hand;
uniform vec4 u_ring[4];

const float PI = 3.14159265359;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// The recoil spring's step response (zeta 0.53): a half turn that lands with
// two small bounces.
float landing(float t) {
  if (t <= 0.0) return 0.0;
  float e = exp(-${DECAY.toFixed(4)} * t);
  return 1.0 - e * (cos(${RINGING.toFixed(4)} * t) + ${(DECAY / RINGING).toFixed(4)} * sin(${RINGING.toFixed(4)} * t));
}

void main() {
  vec2 p = v_uv * u_res;
  float row = floor(p.y / u_pitch);
  float ly = p.y / u_pitch - row - 0.5;
  float col = floor(p.x / u_seg);
  float lx = p.x / u_seg - col;
  // Each slat turns as one rigid blade, so its angle is read at its centre.
  vec2 c = vec2((col + 0.5) * u_seg, (row + 0.5) * u_pitch);
  float jitter = (hash(vec2(col, row) + u_seed) - 0.5) * 0.35;
  float phase = dot(c, u_wave.xy) * u_wave.z - u_wave.w + jitter;
  vec2 dh = c - u_hand.xy;
  phase += u_hand.z * exp(-dot(dh, dh) / (u_hand.w * u_hand.w));
  float theta = u_tilt + u_swing * sin(phase);
  for (int i = 0; i < 4; i++) {
    vec4 r = u_ring[i];
    if (r.w <= 0.0) continue;
    float d = length(c - r.xy);
    if (d > r.w) continue;
    theta += PI * landing(r.z - d / ${RING_SPEED.toFixed(1)});
  }

  float cs = cos(theta);
  float sn = sin(theta);
  // On screen a blade of depth 1.24 pitches shows |cos| of it: turned flat
  // to you the wall is closed, turned edge-on it opens.
  float hh = 0.62 * abs(cs);
  float edge = 0.09 * abs(sn);
  // Tilted face-up, the blade's lower edge comes forward; face-down, its upper.
  float lower = sn * cs > 0.0 ? 1.0 : 0.0;
  float aa = 0.75 / (u_pitch * u_dpr);
  float face = smoothstep(-hh - aa, -hh + aa, ly) * (1.0 - smoothstep(hh - aa, hh + aa, ly));
  float lo = mix(-hh - edge, hh, lower);
  float hi = mix(-hh, hh + edge, lower);
  float rim = smoothstep(lo - aa, lo + aa, ly) * (1.0 - smoothstep(hi - aa, hi + aa, ly)) * (1.0 - face);

  // The face: a slightly curved blade, its normal turning a little along it,
  // and the visible side's normal always toward you.
  float along = hh > 0.001 ? clamp(ly / hh, -1.0, 1.0) : 0.0;
  float bend = theta + along * 0.22;
  vec3 n = vec3(0.0, -sin(bend), cos(bend)) * sign(cs + 1e-4);
  vec3 L = normalize(vec3(0.42 - p.x / u_res.x * 0.6, -0.78, 0.62));
  float lam = clamp((dot(n, L) + 0.2) / 1.2, 0.0, 1.0);
  vec3 R = reflect(-L, n);
  float spec = pow(max(R.z, 0.0), 26.0) * u_glint;
  vec3 faceCol = mix(u_dark, u_lit, lam * lam * (3.0 - 2.0 * lam));
  faceCol = mix(faceCol, u_shine, clamp(spec, 0.0, 0.85));

  // Behind: the recess, in the shade of the blade above.
  float under = smoothstep(-0.5, 0.5, ly);
  vec3 back = mix(u_recess * 0.82, u_recess, under);
  // The blade's own edge, lit when it faces up.
  vec3 rimCol = mix(u_recess, u_finish, lower > 0.5 ? 0.25 : 0.7);

  vec3 colour = back;
  colour = mix(colour, rimCol, rim);
  colour = mix(colour, faceCol, face);
  // Mullions: a hairline gap where one blade ends and the next begins.
  float gap = min(lx, 1.0 - lx) * u_seg * u_dpr;
  colour = mix(colour, u_recess, (1.0 - smoothstep(0.4, 1.4, gap)) * 0.55);
  colour += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o_color = vec4(colour, 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Ring = { x: number; y: number; age: number; reach: number };

type Sim = {
  /** Wave time, s. */
  t: number;
  last: number;
  carry: number;
  /** The intro: how far the slats have opened into the wave. */
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
 * An architectural louvre wall as a background, with the content in front of
 * it in its own layer: rows of fine slats, cut into short blades by thin
 * mullions, each blade turning on its own long axis as a rolling wave passes
 * across the wall. A soft light hangs above and in front; every blade's face
 * brightens as it turns toward it and glints where it mirrors it, so bands of
 * light travel across the wall, and blades turned edge-on open onto a
 * shadowed recess.
 *
 * The pointer bends the wave around itself (springs.glide for where,
 * springs.drift for how much), and a press flips the slats over in a ring
 * that runs out from it, each blade landing its half turn on the recoil
 * spring. It is decoration: `aria-hidden`, never a focus stop, never in the
 * way of a click; keyboard focus landing on a control inside bends the wave
 * there and flips a small ring from it. One WebGL2 fragment pass, drawn only
 * while on screen, in a visible page and while something moves. Under
 * reduced motion the wall stands still with its bands of light, and the
 * pointer bends them directly with no easing.
 */
export function LouverLight({
  children,
  slats = 40,
  tilt = 20,
  light = "dawn",
  swing = 55,
  speed = 1,
  wavelength = 420,
  angle = 35,
  segment = 12,
  finish = FINISH,
  glint = 0.6,
  interactive = true,
  pointerStrength = 0.6,
  pulse = true,
  intro = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: LouverLightProps) {
  const motionSafe = useMotionSafe();
  const paints = paintsOf(light, finish);
  const paintKey = paints.join("|");

  const k = {
    slats: clamp(Math.round(slats), 8, 160),
    tilt: rad(clamp(tilt, -80, 80)),
    swing: rad(clamp(swing, 0, 90)),
    speed: clamp(speed, 0, 3),
    wavelength: clamp(wavelength, 80, 4000),
    angle: rad(angle),
    segment: clamp(segment, 2, 40),
    glint: clamp01(glint),
    strength: clamp01(pointerStrength),
    pulse,
    intro,
    paused,
    seed,
    phase: lcg(seed)() * Math.PI * 2,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef(new Float32Array(15));
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
      reach: 0,
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
    for (let i = 0; i < 5; i += 1) {
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
    if (!g || g.lost || !sz || !visible.current) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const pitch = sz.h / k.slats;
    const reach = clamp(Math.min(sz.w, sz.h) * 0.5, 70, 220);
    const bend = k.strength * s.level * Math.PI * 0.85;
    const rings = ringData.current;
    for (let i = 0; i < RINGS; i += 1) {
      const r = s.rings[i];
      const live = r && r.reach > 0;
      rings[i * 4] = live ? r.x : 0;
      rings[i * 4 + 1] = live ? r.y : 0;
      rings[i * 4 + 2] = live ? r.age : 0;
      rings[i * 4 + 3] = live ? r.reach : 0;
    }
    const pal = colour.current;
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_dpr ?? null, sz.dpr);
    gl.uniform1f(u.u_pitch ?? null, pitch);
    gl.uniform1f(u.u_seg ?? null, pitch * k.segment);
    // The intro opens the wall from closed: rest angle and wave both grow in.
    gl.uniform1f(u.u_tilt ?? null, k.tilt * s.rise);
    gl.uniform1f(u.u_swing ?? null, k.swing * s.rise);
    gl.uniform4f(
      u.u_wave ?? null,
      Math.cos(k.angle),
      Math.sin(k.angle),
      (Math.PI * 2) / k.wavelength,
      s.t * ((Math.PI * 2) / PERIOD) - k.phase,
    );
    gl.uniform1f(u.u_glint ?? null, k.glint);
    gl.uniform1f(u.u_seed ?? null, (k.seed % 97) * 1.37);
    gl.uniform3f(u.u_finish ?? null, pal[0] ?? 0, pal[1] ?? 0, pal[2] ?? 0);
    gl.uniform3f(u.u_dark ?? null, pal[3] ?? 0, pal[4] ?? 0, pal[5] ?? 0);
    gl.uniform3f(u.u_lit ?? null, pal[6] ?? 1, pal[7] ?? 1, pal[8] ?? 1);
    gl.uniform3f(u.u_shine ?? null, pal[9] ?? 1, pal[10] ?? 1, pal[11] ?? 1);
    gl.uniform3f(u.u_recess ?? null, pal[12] ?? 0, pal[13] ?? 0, pal[14] ?? 0);
    gl.uniform4f(u.u_hand ?? null, s.x, s.y, bend, reach);
    gl.uniform4fv(u.u_ring ?? null, rings);
    tri.draw();
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Advances the wave and the springs by dt; says whether anything still moves. */
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
      for (const r of s.rings) r.reach = 0;
      return false;
    }
    const rolling = !k.paused && k.speed > 0 && k.swing > 0;
    if (rolling) s.t += dt * k.speed;
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
    // A ring is done once its front has passed every blade it reaches and
    // the last of them has landed: then each blade is a half turn round,
    // which looks exactly like where it started.
    let rings = false;
    for (const r of s.rings) {
      if (r.reach <= 0) continue;
      r.age += dt;
      if (r.age > r.reach / RING_SPEED + LAND) r.reach = 0;
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
      rolling ||
      (handMoving && s.level > 0.001) ||
      levelMoving ||
      rising ||
      rings
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

  /** The first sighting: the slats open out of a closed wall. */
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
    k.slats,
    k.tilt,
    k.swing,
    k.speed,
    k.wavelength,
    k.angle,
    k.segment,
    k.glint,
    k.strength,
    k.seed,
    paused,
    motionSafe,
  ]);

  // Switching the hand off lets go of the wave, and says so.
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

  /** The hand goes to (x, y); arriving from nowhere, the bend starts there. */
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

  /** The pointer leaves: the bend goes back to a focused control, or eases out. */
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

  const ringAt = (x: number, y: number, reach: number) => {
    if (!k.pulse || !k.motionSafe) return;
    // A free slot, or else the oldest ring gives way.
    const rings = sim.current.rings;
    let pick = 0;
    for (let i = 0; i < rings.length; i += 1) {
      const age = rings[i]?.reach ? (rings[i]?.age ?? 0) : Infinity;
      const best = rings[pick]?.reach ? (rings[pick]?.age ?? 0) : Infinity;
      if (age > best) pick = i;
    }
    const slot = rings[pick];
    if (!slot) return;
    slot.x = x;
    slot.y = y;
    slot.age = 0;
    slot.reach = reach;
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
    const sz = size.current;
    if ((!hit || !rootRef.current?.contains(hit)) && sz) {
      // The whole wall: as far as the farthest corner.
      const far = Math.hypot(
        Math.max(at.x, sz.w - at.x),
        Math.max(at.y, sz.h - at.y),
      );
      ringAt(at.x, at.y, far + 1);
    }
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
    ringAt(at.x, at.y, FOCUS_REACH);
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
        "group/louver-light relative isolate h-full w-full touch-manipulation overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/louver-light:invisible group-data-live/louver-light:opacity-0"
        style={standIn(paints, k.slats)}
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
 * browser without WebGL2: the rows of blades in CSS, a recess under each,
 * and one diagonal band of light across them.
 */
function standIn(
  paints: readonly [string, string, string, string, string],
  slats: number,
): React.CSSProperties {
  const [finish, dark, lit, , recess] = paints;
  return {
    backgroundColor: recess,
    backgroundImage: [
      `linear-gradient(112deg, transparent 22%, color-mix(in oklab, ${lit} 70%, transparent) 42%, transparent 62%)`,
      `repeating-linear-gradient(180deg, ${finish} 0 40%, ${dark} 40% 78%, ${recess} 78% 100%)`,
    ].join(", "),
    backgroundSize: `100% 100%, 100% calc(100% / ${slats})`,
  };
}
