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
import { cn } from "@/registry/lib/utils";

export type IrisWatchColor = "cobalt" | "slate" | "hazel" | "moss";
export type IrisWatchWatching = "pointer" | "focus" | null;

export type IrisWatchProps = {
  /** The content on top of the eye: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The iris: a named pigment pair, or any CSS colour (its inner ring is drawn lighter). @default "cobalt" */
  color?: IrisWatchColor | (string & {});
  /** How open the pupil rests, 0 (a pinpoint) to 1 (wide). @default 0.45 */
  dilation?: number;
  /** How keenly the eye follows, 0 (it barely notices) to 1 (it follows within half a second). @default 0.6 */
  tracking?: number;
  /** The iris's size against the box it is fitted to, 0.5 to 1.5. @default 1 */
  size?: number;
  /** How much fine fibre the iris carries, 0 to 1. @default 0.6 */
  detail?: number;
  /** How much the pupil breathes on its own, 0 to 1. @default 0.4 */
  breathe?: number;
  /** About how often it blinks, ms; 0 for never. @default 7000 */
  blink?: number;
  /** The window caught on the cornea, 0 to 1. @default 0.6 */
  glint?: number;
  /** With nobody near, the eye glances about by itself. @default true */
  wander?: boolean;
  /** The pointer and keyboard focus inside draw its gaze, and a press flashes it. @default true */
  interactive?: boolean;
  /** How much the pointer's nearness narrows the pupil and how hard a press flashes it, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** No breathing, wandering or blinking; it still follows the hand. @default false */
  paused?: boolean;
  /** Seeds the fibres, the crypts and the eye's own glances. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the eye starts following the pointer or a focused control, and with null when it lets go. */
  onWatchChange?: (watching: IrisWatchWatching) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Pigment pairs at fixed lightness — the iris's outer colour and the warmer
 * burst round the pupil — so the eye is the same eye on a light page and a
 * dark one.
 */
const COLORS: Record<IrisWatchColor, readonly [string, string]> = {
  cobalt: [
    "oklch(from var(--accent-bright) 0.5 calc(c * 0.72) h)",
    "oklch(from var(--signal) 0.72 calc(c * 0.5) h)",
  ],
  slate: ["oklch(0.5 0.04 238)", "oklch(0.7 0.05 200)"],
  hazel: ["oklch(0.46 0.07 58)", "oklch(0.7 0.1 86)"],
  moss: ["oklch(0.5 0.08 150)", "oklch(0.73 0.08 112)"],
};

/** The pupil and the catchlight are what they are in any theme. */
const DEEP = "oklch(0.14 0.012 260)";
const LIGHT = "oklch(0.98 0.004 260)";
const GROUND = "var(--background)";

/** The eyeball turns this far, rad, at full gaze. */
const MAX_TURN = 0.45;
const STEP = 1 / 120;
/** The flash: the pupil snaps small on a stiff, nearly critical spring and follows the flash's slow fade back. */
const PUPIL = { stiffness: 420, damping: 2 * 0.9 * Math.sqrt(420), mass: 1 };
const FLASH_FADE = 0.9;
/** A blink closes, rests and opens, s. */
const BLINK_CLOSE = 0.11;
const BLINK_REST = 0.04;
const BLINK_OPEN = 0.22;
/** Reduced motion: a pointer that rests this long draws one instant glance, ms. */
const GLANCE_REST = 250;

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

/** Any CSS colour the canvas understands, as sRGB 0–1, by painting one pixel. */
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

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_px;
uniform float u_time;
uniform vec2 u_center;
uniform float u_radius;
uniform vec2 u_gaze;
uniform float u_pupil;
uniform float u_blink;
uniform float u_detail;
uniform float u_glint;
uniform vec3 u_outer;
uniform vec3 u_inner;
uniform vec3 u_deep;
uniform vec3 u_light;
uniform vec3 u_ground;
uniform vec2 u_seed;
uniform float u_frame;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

void main() {
  vec2 p = v_uv * u_size;
  vec2 rel = p - u_center;
  float R = u_radius;
  float aa = 1.0 / (u_px * R);

  // The eyeball turns: the iris slides toward the gaze and foreshortens along it.
  vec2 turn = u_gaze * ${MAX_TURN.toFixed(2)};
  vec2 shift = R * 1.35 * sin(turn);
  vec2 d = rel - shift;
  float gl = length(u_gaze);
  vec2 gdir = gl > 0.0001 ? u_gaze / gl : vec2(1.0, 0.0);
  float fore = cos(gl * ${MAX_TURN.toFixed(2)});
  float a = dot(d, gdir);
  vec2 local = d - a * gdir + gdir * (a / fore);
  float len = length(local);
  float r = len / R;
  vec2 dir = len > 0.0001 ? local / len : vec2(1.0, 0.0);
  float rho = u_pupil;
  // Fibres live between the pupil and the limbus, so a wider pupil bunches them.
  float s = clamp((r - rho) / (1.0 - rho), 0.0, 1.0);
  float t = u_time;

  // Strands: noise sampled round the circle (no seam), drifting along the radius.
  float broad = kx_fbm(dir * 7.0 + vec2(s * 1.6, s * 0.7) + u_seed);
  float fine = kx_noise(dir * 46.0 + vec2(s * 5.0, -s * 3.0) + u_seed * 1.7 + t * 0.015);
  float hair = kx_noise(dir * 130.0 + vec2(s * 11.0, s * 7.0) + u_seed * 2.3);
  float zig = 0.3 + 0.035 * sin(atan(dir.y, dir.x) * 13.0 + broad * 6.0);
  float inner = 1.0 - smoothstep(zig - 0.04, zig + 0.03, s);
  vec3 col = mix(u_outer, u_inner, inner * 0.85);
  col *= 0.62 + 0.62 * broad;
  col *= 1.0 + (fine - 0.5) * (0.25 + 0.35 * u_detail);
  col *= 1.0 + (hair - 0.5) * 0.3 * u_detail;
  // The collarette: a pale zig-zag ring where the inner burst meets the rest.
  float collar = (s - zig) / 0.022;
  col += (u_inner - col) * exp(-collar * collar) * 0.45;
  // Crypts: dark pits between the strands, mid-iris.
  float pit = kx_noise(dir * 15.0 + vec2(s * 3.0, s * 2.0) + u_seed * 3.1);
  col *= 1.0 - 0.34 * smoothstep(0.66, 0.76, pit) * smoothstep(0.22, 0.32, s) * (1.0 - smoothstep(0.7, 0.8, s));
  // Contraction furrows, faint and broken.
  float f1 = (s - 0.7) / 0.012;
  float f2 = (s - 0.81) / 0.01;
  col *= 1.0 - (exp(-f1 * f1) + exp(-f2 * f2)) * 0.22 * smoothstep(0.35, 0.6, broad);
  // The limbus darkens toward the edge.
  col *= mix(1.0, 0.32, smoothstep(0.8, 1.0, s));
  // The pupil's ruff: a thin dark band of pigment at its rim.
  float ruff = (r - rho - 0.012) / 0.012;
  col = mix(col, u_deep * 2.2 + u_outer * 0.15, exp(-ruff * ruff) * 0.7);
  col = mix(u_deep * (0.9 + 0.2 * r / max(rho, 0.01)), col, smoothstep(rho - aa, rho + aa, r));
  // A little light across the dome of the cornea, from the upper left.
  col += 0.05 * (1.0 - r) * max(0.0, dot(-dir, normalize(vec2(0.6, 0.8))));

  // Beyond the limbus the iris gives way to the page, with a soft shadow ring.
  float edge = smoothstep(1.0 - 0.012, 1.0 + 0.008, r);
  vec3 page = u_ground * (1.0 - 0.2 * exp(-(r - 1.0) * 9.0));
  col = mix(col, page, edge);

  // The catchlight: a soft window on the cornea, moving less than the iris
  // does, brightest at its upper-left corner, with a small second spark.
  vec2 cl = (rel - shift * 0.55 - R * vec2(-0.3, -0.34)) / R;
  vec2 box = abs(cl) - vec2(0.062, 0.044);
  float win = length(max(box, 0.0)) + min(max(box.x, box.y), 0.0) - 0.022;
  float catchl = (1.0 - smoothstep(-0.02, 0.016, win)) * (0.55 + 0.45 * clamp(0.5 - (cl.x + cl.y) * 4.0, 0.0, 1.0));
  float dotl = 1.0 - smoothstep(0.0, 0.016, length(cl - vec2(0.17, 0.1)) - 0.008);
  float onEye = 1.0 - smoothstep(0.96, 1.02, r);
  col = mix(col, u_light, clamp(catchl * 0.7 + dotl * 0.35, 0.0, 1.0) * u_glint * onEye);

  // The blink: lids of the page close from top and bottom on an almond.
  float W = R * 2.4;
  float xw = rel.x / W;
  float A = (1.0 - u_blink) * R * 1.3 * sqrt(max(0.0, 1.0 - xw * xw)) + u_blink * -2.0;
  float lid = smoothstep(A - 1.0, A + 1.5, abs(rel.y));
  float crease = (abs(rel.y) - A) / 3.0;
  vec3 lidCol = u_ground * (1.0 - 0.35 * exp(-crease * crease));
  float shade = smoothstep(A - 22.0, A, abs(rel.y)) * (1.0 - lid) * min(u_blink * 4.0, 1.0);
  col *= 1.0 - 0.3 * shade;
  col = mix(col, lidCol, lid);

  float n = kx_hash(gl_FragCoord.xy + vec2(u_frame * 17.0, u_frame * 31.0));
  col += (n - 0.5) / 255.0 * 2.0;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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
  dilation: number;
  tracking: number;
  size: number;
  detail: number;
  breathe: number;
  blink: number;
  glint: number;
  wander: boolean;
  interactive: boolean;
  strength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onWatch: (watching: IrisWatchWatching) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  flash: (strength: number) => void;
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
  let frames = 0;
  let wakeTimer = 0;
  let glanceTimer = 0;
  let watching: IrisWatchWatching = null;
  let rand = lcg(1);
  const read = rgbReader();
  /** Outer, inner, deep, light, ground: RGB 0–1. */
  const colours = new Float32Array(15);
  const size = { w: 0, h: 0, cx: 0, cy: 0, r: 0 };
  const sim = {
    t: 0,
    gx: 0,
    gy: 0,
    gvx: 0,
    gvy: 0,
    tx: 0,
    ty: 0,
    pupil: 0.35,
    pupilV: 0,
    flash: 0,
    blinkAt: -1,
    nextBlink: Infinity,
    nextGlance: 0,
    wx: 0,
    wy: 0,
  };
  const hand = {
    x: 0,
    y: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const report = (next: IrisWatchWatching) => {
    if (watching === next) return;
    watching = next;
    cfg?.onWatch(next);
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

  const basePupil = () => 0.16 + 0.4 * clamp(cfg?.dilation ?? 0.45, 0, 1);

  /** Points the gaze target at the hand, inside the unit disc. */
  const aimAtHand = () => {
    const c = cfg;
    if (!c || size.r < 1) return;
    const keen = 0.25 + 0.75 * clamp(c.tracking, 0, 1);
    let x = (hand.x - size.cx) / (size.r * 1.6);
    let y = (hand.y - size.cy) / (size.r * 1.6);
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    sim.tx = x * keen;
    sim.ty = y * keen;
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const seeds = lcg(c.seed * 13 + 1);
    program.use();
    gl.uniform2f(u.u_size ?? null, size.w, size.h);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform2f(u.u_center ?? null, size.cx, size.cy);
    gl.uniform1f(u.u_radius ?? null, size.r);
    gl.uniform1f(u.u_detail ?? null, clamp(c.detail, 0, 1));
    gl.uniform1f(u.u_glint ?? null, clamp(c.glint, 0, 1));
    gl.uniform2f(u.u_seed ?? null, seeds() * 40, seeds() * 40);
    const names = ["u_outer", "u_inner", "u_deep", "u_light", "u_ground"];
    names.forEach((name, i) => {
      gl.uniform3f(
        u[name] ?? null,
        colours[i * 3] ?? 0,
        colours[i * 3 + 1] ?? 0,
        colours[i * 3 + 2] ?? 0,
      );
    });
  };

  /** The blink's closure, 0 open to 1 shut, at time `now` (s on the eye's clock). */
  const closure = (now: number) => {
    if (sim.blinkAt < 0) return 0;
    const t = now - sim.blinkAt;
    if (t < BLINK_CLOSE) return (t / BLINK_CLOSE) ** 2;
    if (t < BLINK_CLOSE + BLINK_REST) return 1;
    const o = (t - BLINK_CLOSE - BLINK_REST) / BLINK_OPEN;
    if (o >= 1) {
      sim.blinkAt = -1;
      return 0;
    }
    return (1 - o) ** 3;
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_time ?? null, sim.t);
    gl.uniform2f(u.u_gaze ?? null, sim.gx, sim.gy);
    gl.uniform1f(u.u_pupil ?? null, clamp(sim.pupil, 0.08, 0.7));
    gl.uniform1f(
      u.u_blink ?? null,
      c.motionSafe ? Number(closure(sim.t).toFixed(4)) : 0,
    );
    gl.uniform1f(u.u_frame ?? null, c.motionSafe ? frames % 64 : 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    frames += 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the eye. Returns whether anything is still travelling. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    const live = !c.paused;
    if (live) sim.t += dt;
    // Where the gaze is going: the hand, the eye's own glance, or ahead.
    if (hand.present && c.interactive) {
      aimAtHand();
    } else if (live && c.wander) {
      if (sim.t >= sim.nextGlance) {
        const a = rand() * Math.PI * 2;
        const m = 0.08 + rand() * 0.3;
        sim.wx = Math.cos(a) * m;
        sim.wy = Math.sin(a) * m * 0.7;
        sim.nextGlance = sim.t + 1.5 + rand() * 2.5;
      }
      sim.tx = sim.wx;
      sim.ty = sim.wy;
    } else {
      sim.tx = 0;
      sim.ty = 0;
    }
    if (live && c.blink > 0 && sim.blinkAt < 0 && sim.t >= sim.nextBlink) {
      sim.blinkAt = sim.t;
      sim.nextBlink = sim.t + (c.blink / 1000) * (0.6 + 0.8 * rand());
    }
    // Heavy, critically damped: the drift spring's ratio, its stiffness
    // set by how keen the eye is.
    const k =
      springs.drift.stiffness *
      (0.12 + 0.6 * clamp(c.tracking, 0, 1)) *
      (hand.present ? 1 : 0.7);
    const damp = 2 * Math.sqrt(k);
    const near =
      hand.present && c.interactive
        ? Math.exp(
            -((hand.x - size.cx) ** 2 + (hand.y - size.cy) ** 2) /
              Math.max(1, size.r * size.r),
          )
        : 0;
    const strength = clamp(c.strength, 0, 1);
    sim.flash *= Math.exp(-dt / FLASH_FADE);
    if (sim.flash < 0.002) sim.flash = 0;
    const hippus = live
      ? clamp(c.breathe, 0, 1) *
        0.06 *
        (Math.sin(sim.t * 0.8) + 0.6 * Math.sin(sim.t * 1.9 + 1))
      : 0;
    const want =
      basePupil() *
      (1 - 0.22 * near * strength - 0.5 * sim.flash) *
      (1 + hippus);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      sim.gvx += (k * (sim.tx - sim.gx) - damp * sim.gvx) * h;
      sim.gvy += (k * (sim.ty - sim.gy) - damp * sim.gvy) * h;
      sim.gx += sim.gvx * h;
      sim.gy += sim.gvy * h;
      sim.pupilV +=
        ((PUPIL.stiffness * (want - sim.pupil) - PUPIL.damping * sim.pupilV) /
          PUPIL.mass) *
        h;
      sim.pupil += sim.pupilV * h;
    }
    const gazing =
      Math.abs(sim.tx - sim.gx) + Math.abs(sim.ty - sim.gy) > 0.0005 ||
      Math.abs(sim.gvx) + Math.abs(sim.gvy) > 0.002;
    if (!gazing) {
      sim.gx = sim.tx;
      sim.gy = sim.ty;
      sim.gvx = 0;
      sim.gvy = 0;
    }
    const pupilMoving =
      Math.abs(want - sim.pupil) > 0.0005 || Math.abs(sim.pupilV) > 0.002;
    if (!pupilMoving) {
      sim.pupil = want;
      sim.pupilV = 0;
    }
    return gazing || pupilMoving || sim.flash > 0 || sim.blinkAt >= 0;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Breathing alone is slow enough for thirty frames a second; a glance,
    // a flash or a blink gets every frame.
    const busy =
      sim.blinkAt >= 0 ||
      sim.flash > 0 ||
      Math.abs(sim.gvx) + Math.abs(sim.gvy) > 0.01 ||
      Math.abs(sim.tx - sim.gx) + Math.abs(sim.ty - sim.gy) > 0.01;
    if (!busy && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = step(dt);
    draw();
    const breathing = !c.paused && c.breathe > 0;
    if (moving || breathing) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    last = 0;
    // Still, but a glance or a blink is due: one timer, not frames.
    const due = Math.min(
      c.paused || !c.wander || hand.present ? Infinity : sim.nextGlance,
      c.paused || c.blink <= 0 ? Infinity : sim.nextBlink,
    );
    if (due < Infinity) {
      window.clearTimeout(wakeTimer);
      wakeTimer = window.setTimeout(
        () => {
          wakeTimer = 0;
          kick();
        },
        Math.max(16, (due - sim.t) * 1000),
      );
    }
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    const c = cfg;
    if (!c) return;
    if (!c.motionSafe) {
      draw();
      return;
    }
    window.clearTimeout(wakeTimer);
    wakeTimer = 0;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 5; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
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
    size.cx = w / 2;
    size.cy = h / 2;
    size.r = Math.min(w * 0.5, h * 1.2) * clamp(c.size, 0.5, 1.5);
    resizeGL(p.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
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

  /** Reduced motion: the eye glances in one still step, no travel. */
  const glance = () => {
    const c = cfg;
    if (!c) return;
    if (hand.present && c.interactive) {
      aimAtHand();
      sim.gx = sim.tx;
      sim.gy = sim.ty;
    } else {
      sim.gx = 0;
      sim.gy = 0;
    }
    sim.gvx = 0;
    sim.gvy = 0;
    sim.pupil = basePupil();
    sim.pupilV = 0;
    draw();
  };

  const settleStill = () => {
    sim.gx = 0;
    sim.gy = 0;
    sim.gvx = 0;
    sim.gvy = 0;
    sim.flash = 0;
    sim.blinkAt = -1;
    sim.pupil = basePupil();
    sim.pupilV = 0;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        rand = lcg(next.seed * 7 + 3);
        sim.t = 0;
        sim.nextBlink =
          next.blink > 0
            ? (next.blink / 1000) * (0.5 + rand() * 0.5)
            : Infinity;
        sim.nextGlance = 1.2;
        sim.pupil = 0.16 + 0.4 * clamp(next.dilation, 0, 1);
        if (!startGpu()) {
          // No WebGL2 here: the CSS still eye stays, and nothing retries.
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
        if (!next.motionSafe) {
          settleStill();
          draw();
        }
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr || was.size !== next.size) resize();
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (was.seed !== next.seed) rand = lcg(next.seed * 7 + 3);
      if (was.blink !== next.blink) {
        sim.nextBlink =
          next.blink > 0
            ? sim.t + (next.blink / 1000) * (0.6 + 0.8 * rand())
            : Infinity;
      }
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        report(null);
      }
      if (!next.motionSafe) {
        settleStill();
        glance();
        return;
      }
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
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      report(source);
      if (!c.motionSafe) {
        // A glance lands only once the pointer rests; focus lands at once.
        window.clearTimeout(glanceTimer);
        if (source === "focus") glance();
        else
          glanceTimer = window.setTimeout(() => {
            glanceTimer = 0;
            glance();
          }, GLANCE_REST);
        return;
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      report(null);
      const c = cfg;
      if (c && !c.motionSafe) {
        window.clearTimeout(glanceTimer);
        glanceTimer = window.setTimeout(() => {
          glanceTimer = 0;
          glance();
        }, GLANCE_REST);
        return;
      }
      // Back to its own glances from where it was looking.
      sim.wx = sim.gx;
      sim.wy = sim.gy;
      sim.nextGlance = sim.t + 0.8;
      kick();
    },
    flash(strength) {
      const c = cfg;
      if (!c || !c.motionSafe) return;
      sim.flash = Math.min(1, sim.flash + clamp(c.strength, 0, 1) * strength);
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(wakeTimer);
      window.clearTimeout(glanceTimer);
      detach();
      release();
    },
  };
}

/**
 * A background that is one enormous iris, seen so close it fills the box,
 * with the content on top in its own layer. Drawn in one WebGL2 pass round
 * the eye's centre: fibrous strands of colour that run from the pupil to the
 * limbus, a warmer burst inside a zig-zag collarette, dark crypts between
 * the strands, faint contraction furrows, a darkening limbal ring that gives
 * way to the page, a deep pupil with a thin ruff, and a window of light on
 * the cornea that moves less than the iris does. The strands are mapped
 * between pupil and limbus, so when the pupil widens they bunch outward.
 *
 * It watches. The eye turns toward the pointer on a heavy, critically damped
 * spring (the drift spring's ratio, its stiffness set by `tracking`), the
 * iris sliding and foreshortening as the ball turns; the pupil breathes,
 * narrows as the pointer comes near, and a press flashes it — it snaps small
 * on a stiff spring and opens again as the flash fades. It blinks now and
 * then, lids of the page closing on an almond; with nobody near it glances
 * about. Keyboard focus on a control inside draws its gaze to the control.
 * Thirty frames a second while it only breathes, every frame while it moves,
 * nothing off screen. Without WebGL2 a CSS still eye stands in; under reduced
 * motion it holds still and glances to a resting pointer in one instant step.
 */
export function IrisWatch({
  children,
  color = "cobalt",
  dilation = 0.45,
  tracking = 0.6,
  size = 1,
  detail = 0.6,
  breathe = 0.4,
  blink = 7000,
  glint = 0.6,
  wander = true,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onWatchChange,
  className,
}: IrisWatchProps) {
  const motionSafe = useMotionSafe();
  const pair: readonly [string, string] = COLORS[color as IrisWatchColor] ?? [
    color,
    `color-mix(in oklab, ${color} 62%, white)`,
  ];
  const colorKey = pair.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onWatchChange);

  const config: Config = {
    colorKey,
    dilation,
    tracking,
    size,
    detail,
    breathe,
    blink,
    glint,
    wander,
    interactive,
    strength: pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onWatch: (w) => report.current?.(w),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onWatchChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  // The GPU side, bound to the canvas: built once, rebuilt after a lost
  // context, torn down with the component. StrictMode's second run builds
  // again on the same canvas, which hands back the same context.
  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
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

  // Size and sighting, bound to the node when it arrives.
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
    // A press on a control is the control's; only the eye flashes.
    if (!hit || !rootRef.current?.contains(hit)) engine.current?.flash(1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside draws the eye's gaze to it.
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
        // A sideways drag draws the eye on touch; an upright one scrolls.
        "group/iris-watch relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/iris-watch:opacity-0"
        style={standIn(pair, dilation)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[pair[0], pair[1], DEEP, LIGHT, GROUND].map((paint, i) => (
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
 * The designed still eye for the server render, the first paint and any
 * browser without WebGL2: a pupil, a burst, fibres as a repeating conic
 * gradient, and the limbus giving way to the page.
 */
function standIn(
  pair: readonly [string, string],
  dilation: number,
): React.CSSProperties {
  const [outer, inner] = pair;
  const pupil = Math.round((16 + 40 * clamp(dilation, 0, 1)) * 2);
  const burst = Math.round(pupil + (200 - pupil) * 0.32);
  const dark = `color-mix(in oklab, ${outer} 55%, black)`;
  return {
    backgroundColor: GROUND,
    backgroundImage: [
      `radial-gradient(circle closest-side at 50% 50%, ${DEEP} 0 ${pupil}%, transparent ${pupil + 1}%)`,
      `radial-gradient(circle closest-side at 50% 50%, transparent 0 ${burst}%, ${dark} 185%, ${GROUND} 200%)`,
      `radial-gradient(circle closest-side at 50% 50%, ${inner} ${pupil}%, transparent ${burst + 8}%)`,
      `repeating-conic-gradient(from 0deg at 50% 50%, ${outer} 0deg 2deg, ${dark} 2deg 3deg, color-mix(in oklab, ${outer} 80%, ${inner}) 3deg 5deg)`,
    ].join(", "),
  };
}
