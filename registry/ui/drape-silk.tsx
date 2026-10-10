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

export type DrapeSilkProps = {
  /** The content on the silk: a hero line, a product panel, a call to action. */
  children?: React.ReactNode;
  /** About how many folds cross the frame, 2 to 10. @default 5 */
  folds?: number;
  /** How much the silk shines along its folds, 0 (matte) to 1. @default 0.6 */
  sheen?: number;
  /** The silk's dye, any CSS colour. @default "var(--accent)" */
  color?: string;
  /** How deep the folds run, 0 (nearly flat) to 1. @default 0.6 */
  depth?: number;
  /** How plainly the weave shows in the shine, 0 to 1. @default 0.35 */
  weave?: number;
  /** Where the key light comes from, degrees clockwise from the top. @default 315 */
  lightAngle?: number;
  /** How fast the folds drift, 0 (still) to 2. @default 0.5 */
  speed?: number;
  /** The pointer and keyboard focus lift the cloth, and a press lifts and drops it. @default true */
  interactive?: boolean;
  /** How high the hand lifts the cloth, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How wide the lift under the hand is, px. @default 160 */
  radius?: number;
  /** Hold the folds still; the hand still lifts the cloth. @default false */
  paused?: boolean;
  /** Seeds the folds, so two drapes never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) lifting the cloth. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press or keyboard focus takes the cloth up (true) and when it lets it fall (false). */
  onLiftChange?: (lifted: boolean) => void;
  /** Fires when a dropped cloth has come to rest in its new folds. */
  onSettle?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** The weave needs real pixels, so the silk is drawn at the full capped ratio. */
const RENDER_SCALE = 1;
const STEP = 1 / 120;
const CALM_FRAME = 31;
/** The ripple from a drop runs this long, seconds. */
const RIPPLE = 1.2;
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const RECOIL = springs.recoil;

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

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform float u_folds;
uniform float u_depth;
uniform float u_sheen;
uniform float u_weave;
uniform vec2 u_lightDir;
uniform vec3 u_col;
uniform vec3 u_phase;
uniform vec4 u_lift;
uniform vec4 u_ripple;
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
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

const float TAU = 6.2831853;
// The drape hangs a few degrees off vertical.
const vec2 ACROSS = vec2(0.9928, 0.1197);
const vec2 DOWN = vec2(-0.1197, 0.9928);

// Height of the cloth at p (css px), in px, and how taut the hand pulls it.
float height(vec2 p, vec2 size) {
  vec2 q = p / size.x;
  float a = dot(q, ACROSS);
  float b = dot(q, DOWN);
  float t = u_time;
  // A slow meander shifts the folds sideways down their length, so
  // neighbours merge and part instead of running ruled.
  float m = (noise(vec2(b * 1.3 + u_seed.x, t * 0.05 + u_seed.y)) - 0.5) * 1.3 / u_folds
    + (noise(vec2(b * 3.1 - u_seed.y, a * 2.0 + t * 0.04)) - 0.5) * 0.35 / u_folds;
  // Hung from above, the folds fan out a little as they fall.
  float fan = 1.0 + 0.22 * (b - 0.25);
  float aa = (a - 0.5) / fan + 0.5 + m;
  float k = u_folds * TAU;
  float s1 = aa * k + u_phase.x + t * 0.23;
  float h = sin(s1) - 0.18 * sin(2.0 * s1);
  // No two folds run equally deep, and each deepens and eases along its length.
  h *= 0.6 + 0.4 * noise(vec2(aa * u_folds * 0.7 + u_seed.y, b * 1.5 + t * 0.03));
  h += 0.38 * sin((aa * 1.61 + b * 0.18) * k + u_phase.y - t * 0.17);
  h += 0.5 * sin((aa * 0.53 - b * 0.27) * k + u_phase.z + t * 0.12);
  h += 0.2 * sin((q.x * 0.7 + q.y * 1.5) * TAU * 1.3 + u_phase.x * 0.6 - t * 0.08);
  float amp = size.x / u_folds * 0.16 * u_depth;

  vec2 toHand = p - u_lift.xy;
  float g = exp(-dot(toHand, toHand) / (u_lift.w * u_lift.w));
  // Lifted, the cloth goes taut under the hand: its folds flatten there.
  h *= amp * (1.0 - 0.55 * clamp(u_lift.z, 0.0, 1.2) * g);
  h += u_lift.z * u_lift.w * 0.42 * g;

  if (u_ripple.w > 0.0) {
    float r = length(p - u_ripple.xy);
    float front = u_ripple.z * 380.0;
    float x = (r - front) / 34.0;
    h += u_ripple.w * amp * 1.4 * sin(x * TAU * 0.5) * exp(-x * x * 0.35) * exp(-u_ripple.z * 2.4);
  }
  return h;
}

void main() {
  vec2 size = u_res / u_px;
  vec2 p = v_uv * size;
  float e = 1.0;
  float h0 = height(p, size);
  float hx = height(p + vec2(e, 0.0), size);
  float hy = height(p + vec2(0.0, e), size);
  vec2 grad = vec2(hx - h0, hy - h0) / e;
  vec3 N = normalize(vec3(-grad, 1.0));

  // Threads run down the drape; the weft crosses them. In a plain weave
  // they alternate cell by cell, so the shine breaks into a fine cross.
  float pitch = 2.5;
  float pitchPx = pitch * u_px;
  // Thread space: one unit per thread, along the warp and the weft.
  vec2 w = vec2(dot(p, ACROSS), dot(p, DOWN)) / pitch;
  // Over and under, smoothly: +1 where the weft floats on top, -1 the warp.
  float over = sin(w.x * 3.14159) * sin(w.y * 3.14159);
  float shows = u_weave * smoothstep(3.5, 6.0, pitchPx);
  float weft = 0.5 + 0.5 * over;
  vec2 dirT = mix(DOWN, ACROSS, weft * shows * 0.45);
  vec3 T = normalize(vec3(dirT, dot(dirT, grad)));
  T = normalize(T - N * dot(T, N));
  vec3 B = cross(N, T);
  // Each float is a tiny cylinder: lit along its crown.
  float crown = 1.0 - shows * 0.16 * (1.0 - abs(over));

  vec3 L = normalize(vec3(u_lightDir * 0.72, 0.69));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float nl = dot(N, L);
  float diffuse = clamp((nl + 0.4) / 1.4, 0.0, 1.0);
  float hn = max(dot(H, N), 0.05);
  float ht = dot(H, T);
  float hb = dot(H, B);
  // Silk's shine is stretched along its threads: a narrow sharp lobe and
  // a broad coloured one, both sliding along the folds as they move.
  float sharp = exp(-2.0 * ((ht * ht) / 0.5 + (hb * hb) / 0.035) / (1.0 + hn));
  float broad = exp(-2.0 * ((ht * ht) / 1.6 + (hb * hb) / 0.16) / (1.0 + hn));
  // A cool fill from the opposite side keeps the shadow sides alive.
  vec3 F = normalize(vec3(-u_lightDir * 0.6, 0.8));
  float fill = clamp(dot(N, F), 0.0, 1.0);

  vec3 base = lin(u_col);
  float lift = u_lift.z * exp(-dot(p - u_lift.xy, p - u_lift.xy) / (u_lift.w * u_lift.w * 1.8));
  float cavity = 0.7 + 0.3 * smoothstep(-1.0, 1.0, h0 / max(size.x / u_folds * 0.16 * u_depth + 1.0, 1.0));
  vec3 col = base * (0.1 + 0.62 * diffuse) * cavity;
  col += base * vec3(0.9, 0.95, 1.1) * fill * 0.08;
  col += mix(vec3(1.0), base, 0.4) * sharp * u_sheen * 0.5 * crown;
  col += base * broad * u_sheen * 0.75 * crown;
  // A studio pool of light: brighter toward the light, the cloth closer to
  // the hand catching a touch more.
  vec2 c = v_uv - 0.5;
  float pool = 1.0 - 0.32 * smoothstep(0.2, 0.85, length(c * vec2(1.0, 1.3) - u_lightDir * 0.12));
  col *= pool * (1.0 + 0.08 * lift);
  col = col / (1.0 + col * 0.18);
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
  colorKey: string;
  folds: number;
  sheen: number;
  depth: number;
  weave: number;
  lightAngle: number;
  speed: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onLift: (lifted: boolean) => void;
  onSettle: () => void;
};

type Source = "pointer" | "focus";

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: Source) => void;
  handAway: (source: Source) => void;
  /** The cloth is taken up by a press (or keyboard focus), higher than a hover lifts it. */
  grab: (source: Source) => void;
  /** And let fall by the same hand: it drops, ripples and settles into new folds. */
  drop: (source: Source) => void;
  dispose: () => void;
};

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
  const colours = new Float32Array(3);
  const size = { w: 0, h: 0 };
  const sim = { clock: 0 };
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    lift: 0,
    liftV: 0,
    present: false,
    held: false,
    heldBy: null as Source | null,
    /** Falling after a drop: the lift is on the recoil spring until it rests. */
    falling: false,
    source: null as Source | null,
  };
  const ripple = { x: 0, y: 0, age: RIPPLE, strength: 0 };
  /** The three fold trains' phases, each on its own drift spring toward its target. */
  const phase = new Float32Array(3);
  const phaseV = new Float32Array(3);
  const phaseTo = new Float32Array(3);
  let drops = 0;
  let settling = false;

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

  const radiusOf = (c: Config) =>
    clamp(c.radius, 30, Math.max(30, Math.min(size.w, size.h) * 0.6));

  /** How high the hand wants the cloth: a hover, a press, a keyboard's gentler hold. */
  const wantLift = (c: Config) => {
    if (!c.interactive) return 0;
    const s = clamp(c.pointerStrength, 0, 1);
    if (hand.held) return s * (hand.heldBy === "focus" ? 1.1 : 1.8);
    if (!hand.present) return 0;
    return s;
  };

  const seedPhases = (c: Config) => {
    const rand = lcg(c.seed * 13 + 11);
    for (let i = 0; i < 3; i += 1) {
      const v = rand() * Math.PI * 2;
      phase[i] = v;
      phaseTo[i] = v;
      phaseV[i] = 0;
    }
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const rand = lcg(c.seed * 29 + 3);
    const a = (clamp(c.lightAngle, -720, 720) * Math.PI) / 180;
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_folds ?? null, clamp(c.folds, 1, 16));
    gl.uniform1f(u.u_depth ?? null, clamp(c.depth, 0, 1));
    gl.uniform1f(u.u_sheen ?? null, clamp(c.sheen, 0, 1));
    gl.uniform1f(u.u_weave ?? null, clamp(c.weave, 0, 1));
    // Screen y runs down: a light from the top is a direction of -y.
    gl.uniform2f(u.u_lightDir ?? null, Math.sin(a), -Math.cos(a));
    gl.uniform2f(u.u_seed ?? null, rand() * 9, rand() * 9);
    gl.uniform3f(
      u.u_col ?? null,
      colours[0] ?? 0.3,
      colours[1] ?? 0.4,
      colours[2] ?? 0.8,
    );
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_time ?? null, sim.clock);
    gl.uniform3f(
      u.u_phase ?? null,
      phase[0] ?? 0,
      phase[1] ?? 0,
      phase[2] ?? 0,
    );
    gl.uniform4f(u.u_lift ?? null, hand.px, hand.py, hand.lift, radiusOf(c));
    gl.uniform4f(
      u.u_ripple ?? null,
      ripple.x,
      ripple.y,
      ripple.age,
      ripple.age < RIPPLE && c.motionSafe ? ripple.strength : 0,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.clock += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    if (ripple.age < RIPPLE) {
      ripple.age += dt;
      moving = true;
    }
    const want = wantLift(c);
    // Taken up on glide; let fall on recoil, so dropped silk bounces twice
    // and lies still; a hover that leaves lets go on drift.
    const lifting = hand.falling ? RECOIL : want > hand.lift ? GLIDE : DRIFT;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (hand.x - hand.px) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (hand.y - hand.py) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.px += hand.vx * h;
      hand.py += hand.vy * h;
      hand.liftV +=
        ((lifting.stiffness * (want - hand.lift) -
          lifting.damping * hand.liftV) /
          lifting.mass) *
        h;
      hand.lift += hand.liftV * h;
      for (let i = 0; i < 3; i += 1) {
        const x = phase[i] ?? 0;
        const v = phaseV[i] ?? 0;
        const nv =
          v +
          ((DRIFT.stiffness * ((phaseTo[i] ?? 0) - x) - DRIFT.damping * v) /
            DRIFT.mass) *
            h;
        phaseV[i] = nv;
        phase[i] = x + nv * h;
      }
    }
    const handMoving =
      Math.abs(hand.x - hand.px) + Math.abs(hand.y - hand.py) > 0.1 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5;
    if (!handMoving) {
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
    }
    const lifting2 =
      Math.abs(want - hand.lift) > 0.002 || Math.abs(hand.liftV) > 0.01;
    if (!lifting2) {
      hand.lift = want;
      hand.liftV = 0;
      hand.falling = false;
    }
    let folding = false;
    for (let i = 0; i < 3; i += 1) {
      if (
        Math.abs((phaseTo[i] ?? 0) - (phase[i] ?? 0)) > 0.001 ||
        Math.abs(phaseV[i] ?? 0) > 0.002
      ) {
        folding = true;
      } else {
        phase[i] = phaseTo[i] ?? 0;
        phaseV[i] = 0;
      }
    }
    if (settling && !hand.falling && !folding && ripple.age >= RIPPLE) {
      settling = false;
      c.onSettle();
    }
    return (
      moving ||
      (handMoving && hand.lift > 0.001) ||
      lifting2 ||
      folding ||
      settling
    );
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const calm =
      !hand.present && hand.lift === 0 && !settling && ripple.age >= RIPPLE;
    if (calm && last && now - drawnAt < CALM_FRAME) {
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

  /** Reduced motion: the cloth stands exactly where the hand puts it. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    hand.px = hand.x;
    hand.py = hand.y;
    hand.vx = 0;
    hand.vy = 0;
    hand.lift = wantLift(c);
    hand.liftV = 0;
    hand.falling = false;
    ripple.age = RIPPLE;
    for (let i = 0; i < 3; i += 1) {
      phase[i] = phaseTo[i] ?? 0;
      phaseV[i] = 0;
    }
  };

  const readColours = () => {
    const el = carriers.children[0];
    if (el) read(getComputedStyle(el).color, colours, 0);
    statics();
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
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
      if (!was || was.seed !== next.seed) seedPhases(next);
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
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (!next.interactive && (hand.present || hand.held)) {
        hand.present = false;
        hand.held = false;
        hand.heldBy = null;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) place();
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
    handTo(x, y, source) {
      const c = cfg;
      if (!c || !c.interactive) return;
      if (!hand.present || hand.lift < 0.01) {
        hand.px = x;
        hand.py = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (!c.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    grab(source) {
      const c = cfg;
      if (!c || !c.interactive) return;
      if (hand.held) return;
      hand.held = true;
      hand.heldBy = source;
      hand.falling = false;
      c.onLift(true);
      if (!c.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    drop(source) {
      const c = cfg;
      if (!c || !hand.held || hand.heldBy !== source) return;
      hand.held = false;
      hand.heldBy = null;
      c.onLift(false);
      if (!c.motionSafe) {
        place();
        draw();
        c.onSettle();
        return;
      }
      hand.falling = true;
      ripple.x = hand.px;
      ripple.y = hand.py;
      ripple.age = 0;
      ripple.strength = clamp(hand.lift, 0, 1.6);
      // The cloth lands in new folds: each train shifts by a seeded amount.
      drops += 1;
      const rand = lcg(c.seed * 97 + drops * 7919);
      for (let i = 0; i < 3; i += 1) {
        phaseTo[i] = (phaseTo[i] ?? 0) + (rand() - 0.5) * 2.4;
      }
      settling = true;
      kick();
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
 * A background of silk filling the box: long hanging folds a few degrees
 * off vertical, meandering so neighbours merge and part, drifting slowly.
 * A soft key light rakes across them and a cool fill keeps the shadows
 * alive; the shine is anisotropic, stretched along the threads, so it slides
 * along the folds as they move, and a plain weave lives in it at a few pixels'
 * pitch, breaking the shine into a fine cross where the screen can hold it.
 *
 * The hand lifts the cloth: a rise under the pointer that pulls the folds
 * taut there, its place following on the glide spring and its presence on
 * drift. A press on the bare background takes the cloth up higher on glide;
 * let go and it drops on the recoil spring — two small bounces, as dropped
 * silk does — a ripple runs out from where it fell, and the folds shift into
 * a new arrangement on drift; `onSettle` says when it lies still. Keyboard
 * focus on a control inside takes the cloth up gently there, and focus
 * leaving lets it fall the same way. One fullscreen WebGL2
 * draw at the capped pixel ratio, 30 frames a second while it drifts,
 * nothing off screen or in a hidden page. Without WebGL2 a CSS still frame
 * stands in; under reduced motion the cloth stands exactly where the hand
 * puts it, with no bounce, ripple or new folds.
 */
export function DrapeSilk({
  children,
  folds = 5,
  sheen = 0.6,
  color = "var(--accent)",
  depth = 0.6,
  weave = 0.35,
  lightAngle = 315,
  speed = 0.5,
  interactive = true,
  pointerStrength = 0.6,
  radius = 160,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onLiftChange,
  onSettle,
  className,
}: DrapeSilkProps) {
  const motionSafe = useMotionSafe();

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportActive = React.useRef(onActiveChange);
  const reportLift = React.useRef(onLiftChange);
  const reportSettle = React.useRef(onSettle);
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    colorKey: color,
    folds,
    sheen,
    depth,
    weave,
    lightAngle,
    speed,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => reportActive.current?.(a),
    onLift: (l) => reportLift.current?.(l),
    onSettle: () => reportSettle.current?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportActive.current = onActiveChange;
    reportLift.current = onLiftChange;
    reportSettle.current = onSettle;
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

  const letFall = () => {
    unlisten.current?.();
    engine.current?.drop("pointer");
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
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.grab("pointer");
    // The cloth falls wherever the press ends, on the silk or not.
    unlisten.current?.();
    const id = event.pointerId;
    const end = (e: PointerEvent) => {
      if (e.pointerId === id) letFall();
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
    letFall();
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
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
    engine.current?.grab("focus");
  };

  // Focus leaving the silk lets the cloth fall, the same drop a press makes.
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.drop("focus");
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
        // A sideways finger lifts the cloth on touch; an upright one scrolls.
        "group/drape-silk relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/drape-silk:opacity-0"
        style={standIn(color, folds)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span className="transition-colors duration-1" style={{ color }} />
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the dye in soft folds, each a band from shade to
 * a sheen and back, under the same pool of light from the upper left.
 */
function standIn(color: string, folds: number): React.CSSProperties {
  const n = clamp(Math.round(folds), 1, 16);
  const period = Math.round((100 / n) * 100) / 100;
  const half = Math.round(period * 50) / 100;
  const shade = `color-mix(in oklab, ${color} 62%, black)`;
  const sheen = `color-mix(in oklab, ${color} 72%, white)`;
  return {
    backgroundColor: color,
    backgroundImage: [
      "radial-gradient(ellipse 80% 90% at 30% 20%, transparent 40%, color-mix(in oklab, black 24%, transparent) 100%)",
      `repeating-linear-gradient(97deg, ${shade} 0%, ${color} ${Math.round(half * 50) / 100}%, ${sheen} ${half}%, ${color} ${Math.round(half * 150) / 100}%, ${shade} ${period}%)`,
    ].join(", "),
  };
}
