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
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ReadoutSkewProps = {
  /** How long the band takes to read the frame top to bottom, in ms, 200 to 2000. Slower readout, stronger bends. @default 600 */
  readout?: number;
  /** How many strips the sensor reads at once, 1 to 4: the bends repeat strip by strip with a seam between. @default 1 */
  bands?: number;
  /** How far each row's moment is pushed, 0 (no distortion: every row now) to 2 (twice the honest skew). @default 1 */
  skew?: number;
  /** How fast the propeller turns, in revolutions a second, 0 to 6. @default 2.4 */
  spin?: number;
  /** How many blades the propeller has, 2 to 6. @default 3 */
  blades?: number;
  /** The puck's place along its track, 0 to 1, when you control it; pair with `onValueChange`. */
  value?: number;
  /** Where the puck starts when uncontrolled, 0 to 1. @default 0.3 */
  defaultValue?: number;
  /** Fires from the drag, click or key that moved the puck, with where it will come to rest, 0 to 1. */
  onValueChange?: (value: number) => void;
  /** How bright the scan band's roll of light is, 0 to 1. @default 0.6 */
  glow?: number;
  /** The propeller's colour, any CSS colour; resolved on the element so it follows the theme. @default "var(--foreground)" */
  bladeColor?: string;
  /** The puck's colour: a pigment at a fixed lightness. @default "oklch(from var(--accent-bright) 0.66 c h)" */
  puckColor?: string;
  /** The scan band's colour. @default "var(--signal)" */
  bandColor?: string;
  /** Show the viewfinder's corner marks and readout label. @default true */
  hud?: boolean;
  /** Content above the scene: a caption, a heading, a call to action. */
  children?: React.ReactNode;
  /** The puck can be dragged, thrown and moved with the keys. @default true */
  interactive?: boolean;
  /** Hold the band and the propeller where they are; the puck still answers. @default false */
  paused?: boolean;
  /** Names the puck's slider for assistive technology. @default "Puck" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Shows the scene but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const HISTORY = 256;
const HZ = 60;
const STEP = 1 / 120;
const TAU = Math.PI * 2;
/** Under reduced motion the frame is one capture: the band and the clock stop here. */
const STILL_PHASE = 0.62;
const STILL_TIME = 0.37;
/** How much speed a sliding puck keeps per second, and how much it keeps off a stop. */
const FRICTION = 3.2;
const RESTITUTION = 0.5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const toLinear = (byte: number) => byte / 255;

const FRAGMENT = /* glsl */ `
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform float u_phase;
uniform float u_period;
uniform float u_bands;
uniform float u_skew;
uniform float u_spin;
uniform float u_blades;
uniform vec3 u_hub;
uniform vec4 u_puck;
uniform vec4 u_hist[64];
uniform float u_floor;
uniform vec3 u_cBlade;
uniform vec3 u_cPuck;
uniform vec3 u_cBand;
uniform vec3 u_cInk;
uniform float u_dark;
uniform float u_glow;

// Where the puck was, \`back\` samples (at 60 Hz) before the newest one.
float puckAt(float back) {
  float j = clamp(255.0 - back, 0.0, 255.0);
  float j0 = floor(j);
  int i0 = int(j0);
  int i1 = min(i0 + 1, 255);
  float a = u_hist[i0 >> 2][i0 & 3];
  float b = u_hist[i1 >> 2][i1 & 3];
  return mix(a, b, j - j0);
}

void over(inout vec4 dst, vec3 c, float a) {
  dst.rgb = c * a + dst.rgb * (1.0 - a);
  dst.a = a + dst.a * (1.0 - a);
}

void main() {
  vec2 p = v_uv * u_res;
  // The readout: every row was read when the band last crossed it, and
  // shows the scene at that moment.
  float stripH = u_res.y / u_bands;
  float yl = mod(p.y, stripH);
  float bl = u_phase * stripH;
  float ageF = fract((bl - yl) / stripH);
  float ts = u_time - ageF * u_period * u_skew;
  // The oldest rows have faded a touch, so the scan's direction reads.
  float fresh = 1.0 - 0.14 * ageF;

  vec4 col = vec4(0.0);

  // The studio: a faint dot grid above a floor line. Static, so it never bends.
  vec2 g = mod(p, 24.0) - 12.0;
  float dots = (1.0 - smoothstep(0.55, 0.55 + u_px * 1.5, length(g))) * step(p.y, u_floor - 6.0);
  over(col, u_cInk, dots * 0.16);
  float floorLine = 1.0 - smoothstep(0.0, u_px * 1.2, abs(p.y - u_floor) - 0.5);
  over(col, u_cInk, floorLine * 0.32);

  // The puck, at its row's moment.
  float halfW = u_puck.x;
  float top = u_puck.y;
  float bot = u_puck.z;
  float X = puckAt((u_puck.w - ts) * 60.0);
  float sx = (p.x - X) / (halfW * 2.2);
  float sy0 = (p.y - u_floor - 1.0) / 2.6;
  float shadow = exp(-sx * sx - sy0 * sy0);
  over(col, u_cInk, shadow * 0.28);
  vec2 c = vec2(X, clamp(p.y, top + halfW, bot - halfW));
  float dp = length(p - c) - halfW;
  float puck = 1.0 - smoothstep(-u_px, u_px, dp);
  if (puck > 0.0) {
    float sy = (p.y - top) / max(bot - top, 1.0);
    float stripe = step(0.55, fract(sy * 7.0 + 0.2)) * step(0.12, sy) * step(sy, 0.88);
    float edge = clamp((p.x - X) / halfW, -1.0, 1.0);
    vec3 face = mix(u_cPuck, u_cPuck * 0.7, stripe * 0.8);
    face = mix(face, vec3(1.0), 0.22 * smoothstep(0.2, -0.9, edge));
    face *= 1.0 - 0.18 * smoothstep(0.3, 1.0, edge);
    over(col, face * fresh, puck);
  }

  // The propeller, at its row's moment: the blades bend into petals.
  vec2 q = p - u_hub.xy;
  float r = length(q);
  float R = u_hub.z;
  float t = r / R;
  float seg = 6.2831853 / u_blades;
  float ang = atan(q.y, q.x) - 6.2831853 * u_spin * ts;
  float sweep = 0.32 * t * t;
  float local = mod(ang - sweep + 0.5 * seg, seg) - 0.5 * seg;
  float width = R * (0.028 + 0.12 * sin(3.14159 * pow(clamp(t, 0.0, 1.0), 0.7)) * (1.0 - 0.3 * t));
  float d = max(abs(local) * r - width, r - R);
  float blade = 1.0 - smoothstep(-u_px, u_px, d);
  if (blade > 0.0) {
    float side = clamp(local * r / max(width, 1.0), -1.0, 1.0);
    vec3 face = mix(u_cBlade, u_cBlade * 0.62 + u_cInk * 0.2, smoothstep(-0.2, 1.0, side) * 0.7);
    over(col, face * fresh, blade);
  }
  float hubR = R * 0.17;
  float hub = 1.0 - smoothstep(-u_px, u_px, r - hubR);
  over(col, mix(u_cBlade, u_cInk, 0.35), hub);
  float ring = 1.0 - smoothstep(0.0, u_px * 1.5, abs(r - hubR * 0.62) - 0.6);
  over(col, mix(u_cBlade, vec3(1.0), 0.35), ring * hub * 0.6);

  // The band: a soft roll of light with a crisp core line, and a faint
  // wake over the rows it has just read.
  float dy = yl - bl;
  dy -= stripH * floor(dy / stripH + 0.5);
  float sigma = 5.0 + 9.0 * u_glow;
  float soft = exp(-dy * dy / (2.0 * sigma * sigma));
  float core = 1.0 - smoothstep(0.0, u_px * 1.4, abs(dy) - 0.45);
  float wake = exp(-ageF * 10.0) * step(0.0, -dy + 0.5);
  float light = u_glow * (0.24 * soft + 0.55 * core + 0.06 * wake);
  if (u_dark > 0.5) {
    col.rgb += u_cBand * light;
    col.a = max(col.a, min(1.0, light));
  } else {
    over(col, u_cBand, min(1.0, light * 0.9));
  }
  o_color = vec4(clamp(col.rgb, 0.0, 1.0), clamp(col.a, 0.0, 1.0));
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Geo = {
  w: number;
  h: number;
  bw: number;
  bh: number;
  dpr: number;
  R: number;
  hx: number;
  hy: number;
  floor: number;
  pw: number;
  top: number;
  bot: number;
  x0: number;
  x1: number;
};

type Spring = { stiffness: number; damping: number; mass: number };

type Sim = {
  last: number;
  carry: number;
  /** The scene's clock and the band's place in its sweep, 0 to 1. */
  t: number;
  phase: number;
  /** The puck's place along the track (0–1, past the ends while dragged) and speed (per s). */
  u: number;
  v: number;
  mode: "rest" | "drag" | "coast" | "spring";
  target: number;
  spring: Spring;
  /** Scene time of the newest history sample, the ring of x in px, and its head. */
  histT: number;
  /** The puck's x at the end of the last frame, so samples between frames are interpolated. */
  prevX: number;
  ring: Float32Array;
  head: number;
  upload: Float32Array;
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
  goTo: (u: number, spring: Spring, velocity?: number) => void;
};

/** Content controls the scene must leave alone. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

/** The scene's layout in a box: the propeller to the right, the puck's track to the left. */
function layout(w: number, h: number) {
  const R = Math.max(24, Math.min(h * 0.38, w * 0.22));
  const hx = w - R - Math.max(14, w * 0.05);
  const hy = h * 0.45;
  const floor = Math.round(h * 0.84);
  const pw = clamp(w * 0.022, 9, 16);
  const half = h * 0.27;
  const bot = floor - 2;
  const top = bot - half * 2;
  const x0 = Math.max(16, w * 0.06) + pw;
  const x1 = Math.max(x0 + 24, hx - R - 18 - pw);
  return { R, hx, hy, floor, pw, top, bot, x0, x1 };
}

/**
 * Where a sliding puck comes to rest: the same integrator the frames use,
 * friction and bounces off the stops, run ahead at the fixed step.
 */
function landing(u: number, v: number): number {
  let x = u;
  let s = v;
  for (let i = 0; i < 2400 && Math.abs(s) > 0.004; i += 1) {
    s *= Math.exp(-FRICTION * STEP);
    x += s * STEP;
    if (x < 0) {
      x = 0;
      s = -s * RESTITUTION;
    } else if (x > 1) {
      x = 1;
      s = -s * RESTITUTION;
    }
  }
  return clamp01(x);
}

/**
 * A small studio seen through a rolling-shutter camera, drawn per pixel in
 * one WebGL2 pass on a transparent canvas. A band sweeps down the frame every
 * `readout` ms and each row shows the scene as it was the last time the band
 * crossed it, so the picture is a living capture: fresh above the band,
 * still the last sweep's below, the band itself a soft roll of light.
 *
 * Everything is sampled at its row's own moment. The propeller's blades bend
 * into curved petals and break into islands, and the petals re-form every
 * sweep. The puck's position is kept for the last four seconds at 60 Hz, so
 * a fast drag leans it, a zig-zag makes it wobble like jelly, and a throw
 * that lands against a stop shows the bounce as a ripple down its stripes.
 * The dot grid, the floor and the hub never move, so they never bend.
 *
 * The puck is a real slider. A drag follows 1:1 and rubber-bands past the
 * ends; a release slides on with friction and bounces off the stops, and the
 * value is where it will rest. A click on the track and the keys send it on
 * the snap spring — quick enough to lean. Under reduced motion the band and
 * the clock stop: the frame is one still capture whose rows keep their ages,
 * so the petals still show, and the puck moves straight to each new place.
 */
export function ReadoutSkew({
  readout = 600,
  bands = 1,
  skew = 1,
  spin = 2.4,
  blades = 3,
  value,
  defaultValue = 0.3,
  onValueChange,
  glow = 0.6,
  bladeColor = "var(--foreground)",
  puckColor = "oklch(from var(--accent-bright) 0.66 c h)",
  bandColor = "var(--signal)",
  hud = true,
  children,
  interactive = true,
  paused = false,
  label = "Puck",
  dpr = 2,
  disabled = false,
  className,
}: ReadoutSkewProps) {
  const motionSafe = useMotionSafe();
  const [own, setOwn] = React.useState(() => clamp01(defaultValue));
  const current = clamp01(value ?? own);
  const k = {
    period: clamp(readout, 200, 2000) / 1000,
    bands: Math.round(clamp(bands, 1, 4)),
    skew: clamp(skew, 0, 2),
    spin: clamp(spin, 0, 6),
    blades: Math.round(clamp(blades, 2, 6)),
    glow: clamp01(glow),
    paused,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };
  const paints = [
    bladeColor,
    puckColor,
    bandColor,
    "var(--ink-3)",
    "var(--background)",
  ];
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const thumbRef = React.useRef<HTMLDivElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const geo = React.useRef<Geo | null>(null);
  const colour = React.useRef({
    blade: new Float32Array(3),
    puck: new Float32Array(3),
    band: new Float32Array(3),
    ink: new Float32Array(3),
    dark: 0,
  });
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const sim = React.useRef<Sim>({
    last: 0,
    carry: 0,
    t: STILL_TIME,
    phase: STILL_PHASE,
    u: clamp01(value ?? defaultValue),
    v: 0,
    mode: "rest",
    target: clamp01(value ?? defaultValue),
    spring: springs.snap,
    histT: 0,
    prevX: 0,
    ring: new Float32Array(HISTORY),
    head: 0,
    upload: new Float32Array(HISTORY),
  });
  const grab = React.useRef({ on: false, from: 0 });
  const host = React.useRef({
    controlled: value !== undefined,
    value: current,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onValueChange);
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
    const read = (i: number, out: Float32Array | null) => {
      const span = carriers.children[i];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(128, 128, 128)";
      if (span) ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      const rgb = [
        toLinear(d[0] ?? 0),
        toLinear(d[1] ?? 0),
        toLinear(d[2] ?? 0),
      ];
      if (out) {
        out[0] = rgb[0] ?? 0;
        out[1] = rgb[1] ?? 0;
        out[2] = rgb[2] ?? 0;
      }
      return rgb;
    };
    const c = colour.current;
    read(0, c.blade);
    read(1, c.puck);
    read(2, c.band);
    read(3, c.ink);
    const page = read(4, null);
    const lum =
      0.2126 * (page[0] ?? 0) +
      0.7152 * (page[1] ?? 0) +
      0.0722 * (page[2] ?? 0);
    c.dark = lum < 0.45 ? 1 : 0;
  };

  /** The puck's x in px for a place along the track. */
  const pxOf = (u: number) => {
    const g = geo.current;
    if (!g) return 0;
    return g.x0 + (g.x1 - g.x0) * u;
  };

  /** Fills the whole history with where the puck is now: no lean. */
  const settleHistory = () => {
    const s = sim.current;
    s.ring.fill(pxOf(s.u));
    s.histT = s.t;
    s.prevX = pxOf(s.u);
  };

  const placeThumb = () => {
    const g = geo.current;
    const el = thumbRef.current;
    if (!g || !el) return;
    const x = pxOf(clamp(sim.current.u, -0.08, 1.08));
    el.style.transform = `translate3d(${r3(x - g.pw - 4)}px, 0, 0)`;
  };

  const resize = () => {
    const root = rootRef.current;
    if (!root) return;
    // Without a context the layout still places the slider over the puck.
    let w = root.clientWidth;
    let h = root.clientHeight;
    let bw = w;
    let bh = h;
    let ratio = 1;
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (g && !g.lost && canvas) {
      const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
      w = r.width / r.dpr;
      h = r.height / r.dpr;
      bw = r.width;
      bh = r.height;
      ratio = r.dpr;
    }
    if (w < 8 || h < 8) return;
    geo.current = { w, h, bw, bh, dpr: ratio, ...layout(w, h) };
    const el = thumbRef.current;
    const at = geo.current;
    if (el) {
      el.style.top = `${r3(at.top - 4)}px`;
      el.style.width = `${r3(at.pw * 2 + 8)}px`;
      el.style.height = `${r3(at.bot - at.top + 8)}px`;
    }
    settleHistory();
    placeThumb();
  };

  const draw = () => {
    const g = gpu.current;
    const sz = geo.current;
    if (!g || g.lost || !sz) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const c = colour.current;
    // Unroll the ring, oldest first, for the shader's history.
    for (let i = 0; i < HISTORY; i += 1) {
      s.upload[i] = s.ring[(s.head + i) % HISTORY]!;
    }
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_px ?? null, 0.8 / sz.dpr);
    gl.uniform1f(u.u_time ?? null, s.t);
    gl.uniform1f(u.u_phase ?? null, s.phase);
    gl.uniform1f(u.u_period ?? null, k.period);
    gl.uniform1f(u.u_bands ?? null, k.bands);
    gl.uniform1f(u.u_skew ?? null, k.skew);
    gl.uniform1f(u.u_spin ?? null, k.spin);
    gl.uniform1f(u.u_blades ?? null, k.blades);
    gl.uniform3f(u.u_hub ?? null, sz.hx, sz.hy, sz.R);
    gl.uniform4f(u.u_puck ?? null, sz.pw, sz.top, sz.bot, s.histT);
    gl.uniform4fv(u.u_hist ?? null, s.upload);
    gl.uniform1f(u.u_floor ?? null, sz.floor);
    gl.uniform3fv(u.u_cBlade ?? null, c.blade);
    gl.uniform3fv(u.u_cPuck ?? null, c.puck);
    gl.uniform3fv(u.u_cBand ?? null, c.band);
    gl.uniform3fv(u.u_cInk ?? null, c.ink);
    gl.uniform1f(u.u_dark ?? null, c.dark);
    gl.uniform1f(u.u_glow ?? null, k.glow);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    tri.draw();
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Steps the puck at the fixed rate; true while it still moves. */
  const stepPuck = (): boolean => {
    const s = sim.current;
    if (s.mode === "drag" || s.mode === "rest") return s.mode === "drag";
    if (s.mode === "coast") {
      s.v *= Math.exp(-FRICTION * STEP);
      s.u += s.v * STEP;
      if (s.u < 0) {
        s.u = 0;
        s.v = -s.v * RESTITUTION;
      } else if (s.u > 1) {
        s.u = 1;
        s.v = -s.v * RESTITUTION;
      }
      if (Math.abs(s.v) <= 0.004) {
        s.v = 0;
        s.mode = "rest";
        // A host that kept the old value gets its puck back.
        const held = host.current;
        if (held.controlled && Math.abs(s.u - held.value) > 1e-3) {
          api.current?.goTo(held.value, springs.snap);
        }
        return false;
      }
      return true;
    }
    const sp = s.spring;
    s.v +=
      ((-sp.stiffness * (s.u - s.target) - sp.damping * s.v) / sp.mass) * STEP;
    s.u += s.v * STEP;
    // The track's stops are hard: an overshoot presses against them.
    if (s.u < 0 || s.u > 1) {
      s.u = clamp01(s.u);
      if ((s.u === 0 && s.v < 0) || (s.u === 1 && s.v > 0)) s.v = -s.v * 0.2;
    }
    if (Math.abs(s.u - s.target) < 1e-4 && Math.abs(s.v) < 1e-3) {
      s.u = s.target;
      s.v = 0;
      s.mode = "rest";
      return false;
    }
    return true;
  };

  /** Advances the clock, the band, the puck and its history; true while anything moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const running = !k.paused;
    if (running) {
      s.t += dt;
      s.phase = (s.phase + dt / k.period) % 1;
    }
    s.carry += dt;
    let steps = 0;
    let moving = s.mode !== "rest";
    while (s.carry >= STEP && steps < 12) {
      s.carry -= STEP;
      steps += 1;
      moving = stepPuck() || moving;
    }
    if (steps === 12) s.carry = 0;
    // History at 60 Hz on the scene's clock. Paused, the clock stops, so the
    // newest sample simply tracks the puck: it moves without leaning.
    // A slow frame still leaves a smooth history: the samples it owes are
    // spread along the way from where the puck was to where it is.
    const x = pxOf(s.u);
    if (running) {
      let pushed = 0;
      const t0 = s.t - dt;
      while (s.histT + 1 / HZ <= s.t && pushed < HISTORY) {
        s.histT += 1 / HZ;
        const f = dt > 1e-6 ? clamp01((s.histT - t0) / dt) : 1;
        s.ring[s.head] = s.prevX + (x - s.prevX) * f;
        s.head = (s.head + 1) % HISTORY;
        pushed += 1;
      }
      if (pushed === HISTORY) s.histT = s.t;
    } else {
      s.ring.fill(x);
      s.histT = s.t;
    }
    s.prevX = x;
    placeThumb();
    return running || moving;
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
      s.t = STILL_TIME;
      s.phase = STILL_PHASE;
      s.u = s.mode === "drag" ? s.u : s.target;
      s.v = 0;
      if (s.mode !== "drag") s.mode = "rest";
      settleHistory();
      placeThumb();
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

  /** Sends the puck to `u` on a spring, carrying any speed it has. */
  const goTo = (u: number, spring: Spring, velocity?: number) => {
    const s = sim.current;
    s.target = clamp01(u);
    s.spring = spring;
    if (velocity !== undefined) s.v = velocity;
    s.mode = "spring";
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick, goTo };
    report.current = onValueChange;
    host.current = { controlled: value !== undefined, value: current };
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
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

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  // A host's new value, or a reset: the puck goes there on snap unless it
  // is already on its way.
  React.useEffect(() => {
    const s = sim.current;
    if (grab.current.on) return;
    if (Math.abs(s.target - current) < 1e-3 && s.mode !== "rest") return;
    if (Math.abs(s.u - current) < 1e-4 && s.mode === "rest") {
      s.target = current;
      return;
    }
    api.current?.goTo(current, springs.snap);
  }, [current]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [k.period, k.bands, k.skew, k.spin, k.blades, k.glow, paused, motionSafe]);

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

  /** A new resting place from the visitor: held here unless the host holds it. */
  const commit = (next: number) => {
    const v = Math.round(clamp01(next) * 1000) / 1000;
    sim.current.target = v;
    if (Math.abs(v - current) < 1e-4) return;
    if (value === undefined) setOwn(v);
    report.current?.(v);
  };

  const local = (clientX: number) => {
    const root = rootRef.current;
    const r = root?.getBoundingClientRect();
    if (!root || !r) return 0;
    return clientX - r.left - root.clientLeft;
  };

  const uOf = (x: number) => {
    const g = geo.current;
    if (!g) return 0;
    return (x - g.x0) / Math.max(1, g.x1 - g.x0);
  };

  const onPuck = (clientX: number, clientY: number) => {
    const g = geo.current;
    const root = rootRef.current;
    if (!g || !root) return false;
    const r = root.getBoundingClientRect();
    const x = clientX - r.left - root.clientLeft;
    const y = clientY - r.top - root.clientTop;
    return (
      Math.abs(x - pxOf(sim.current.u)) <= g.pw + 10 &&
      y >= g.top - 10 &&
      y <= g.bot + 10
    );
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: !k.enabled,
    onStart: () => {
      if (!grab.current.on) return;
      const s = sim.current;
      s.mode = "drag";
      s.v = 0;
      grab.current.from = s.u;
      kick();
    },
    onMove: ({ offset }) => {
      if (!grab.current.on) return;
      const g = geo.current;
      if (!g) return;
      const s = sim.current;
      const span = Math.max(1, g.x1 - g.x0);
      const raw = grab.current.from + offset.x / span;
      s.u =
        raw < 0
          ? rubberband(raw, 1)
          : raw > 1
            ? 1 + rubberband(raw - 1, 1)
            : raw;
      if (!k.motionSafe) {
        settleHistory();
        placeThumb();
      }
      kick();
    },
    onEnd: ({ velocity }) => {
      if (!grab.current.on) return;
      grab.current.on = false;
      const g = geo.current;
      const s = sim.current;
      const span = Math.max(1, (g?.x1 ?? 1) - (g?.x0 ?? 0));
      const vu = clamp(velocity.x / span, -12, 12);
      if (!k.motionSafe) {
        s.mode = "rest";
        s.u = clamp01(s.u);
        commit(s.u);
        kick();
        return;
      }
      if (s.u < 0 || s.u > 1) {
        // Released past a stop: back onto the track on glide.
        const end = s.u < 0 ? 0 : 1;
        commit(end);
        goTo(end, springs.glide, vu);
        return;
      }
      // A throw slides on with friction and bounces off the stops; the
      // value is where it will rest, worked out now from the same steps.
      s.v = vu;
      s.mode = "coast";
      commit(landing(s.u, vu));
      kick();
    },
    onCancel: () => {
      if (!grab.current.on) return;
      grab.current.on = false;
      goTo(clamp01(sim.current.u), springs.glide);
    },
    onTap: (event) => {
      grab.current.on = false;
      const g = geo.current;
      if (!g) return;
      const x = local(event.clientX);
      // A press on the propeller is not a place on the track.
      if (x > g.hx - g.R * 0.7) return;
      const u = clamp01(uOf(x));
      commit(u);
      if (k.motionSafe) goTo(u, springs.snap);
      else kick();
    },
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!k.enabled) return;
    const steps: Record<string, number> = {
      ArrowRight: 0.05,
      ArrowUp: 0.05,
      ArrowLeft: -0.05,
      ArrowDown: -0.05,
      PageUp: 0.25,
      PageDown: -0.25,
    };
    const by = steps[event.key];
    let next: number | null = null;
    if (by !== undefined) next = clamp01(sim.current.target + by);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    if (next === null) return;
    event.preventDefault();
    commit(next);
    if (k.motionSafe) goTo(next, springs.snap);
    else kick();
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  const percent = Math.round(current * 100);

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (!k.enabled || fromContent(event.target)) return;
        grab.current.on = onPuck(event.clientX, event.clientY);
        drag.onPointerDown(event);
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        "group/readout-skew @container relative isolate h-56 w-full overflow-clip",
        k.enabled ? "cursor-pointer touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <SkewStill
        blades={k.blades}
        spin={k.spin}
        period={k.period}
        skew={k.skew}
        bands={k.bands}
        value={current}
        bladeColor={bladeColor}
        puckColor={puckColor}
        bandColor={bandColor}
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
      {hud ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2.5 font-mono text-[10px] leading-none tracking-[0.08em] text-ink-3 uppercase"
        >
          <span className="absolute top-0 left-0 size-3 border-t border-l border-ink-3/70" />
          <span className="absolute top-0 right-0 size-3 border-t border-r border-ink-3/70" />
          <span className="absolute bottom-0 left-0 size-3 border-b border-l border-ink-3/70" />
          <span className="absolute right-0 bottom-0 size-3 border-r border-b border-ink-3/70" />
          <span className="absolute top-1.5 left-5 flex items-center gap-1.5">
            <span className="size-1.5 shrink-0 rounded-full bg-danger" />
            <span className="hidden @min-[22rem]:inline">roll</span>
            <span className="tabular-nums">
              {Math.round(k.period * 1000)} ms
            </span>
            <span className="hidden @min-[22rem]:inline">
              · {k.bands === 1 ? "1 band" : `${k.bands} bands`}
            </span>
          </span>
        </div>
      ) : null}
      <div
        ref={thumbRef}
        role="slider"
        tabIndex={k.enabled ? 0 : -1}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent} percent along the track`}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute top-0 left-0 z-0 rounded-full outline-none",
          k.enabled ? "cursor-grab active:cursor-grabbing" : "cursor-default",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
    </div>
  );
}

const STILL_ROWS = 64;

/**
 * The puck's centre for the still, in container units: the same track the
 * live layout uses (it starts past the left margin and ends short of the
 * propeller), with the box's height taken as a typical 224 px.
 */
const puckLeft = (u: number) => {
  const pw = "clamp(9px, 2.2cqw, 16px)";
  const x0 = `(max(16px, 6cqw) + ${pw})`;
  const x1 = `(100cqw - 2 * min(85px, 22cqw) - max(14px, 5cqw) - 18px - ${pw})`;
  return `calc(${x0} + (${x1} - ${x0}) * ${r3(u)})`;
};

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the same capture traced row by row in JS. Each row is read
 * at its own moment; where it crosses a blade it gives an interval, and the
 * intervals of neighbouring rows join into the bent petals. The puck stands
 * at its place and the band holds where the reduced-motion frame stops it.
 */
function SkewStill({
  blades,
  spin,
  period,
  skew,
  bands,
  value,
  bladeColor,
  puckColor,
  bandColor,
}: {
  blades: number;
  spin: number;
  period: number;
  skew: number;
  bands: number;
  value: number;
  bladeColor: string;
  puckColor: string;
  bandColor: string;
}) {
  const petals = React.useMemo(() => {
    // The still's box: the hub at 0.45 of the height, R at 0.38 of it.
    const boxH = 1 / 0.38;
    const hubY = boxH * 0.45;
    const strip = 1 / bands;
    const out: string[] = [];
    for (let b = 0; b < blades; b += 1) {
      let run: { y: number; l: number; r: number }[] = [];
      const flush = () => {
        if (run.length > 1) {
          const left = run.map((p) => `${r3(p.l)} ${r3(p.y)}`);
          const right = run
            .slice()
            .reverse()
            .map((p) => `${r3(p.r)} ${r3(p.y)}`);
          out.push(`M${left.join("L")}L${right.join("L")}Z`);
        }
        run = [];
      };
      for (let j = 0; j < STILL_ROWS; j += 1) {
        const y = -1 + (2 * (j + 0.5)) / STILL_ROWS;
        const frac = (hubY + y) / boxH;
        const yl = ((frac % strip) + strip) % strip;
        const age = ((((STILL_PHASE * strip - yl) / strip) % 1) + 1) % 1;
        const ts = STILL_TIME - age * period * skew;
        const th = TAU * spin * ts + (b * TAU) / blades;
        // The blade's centreline sweeps back toward its tip; find where it
        // crosses this row by a few fixed-point steps.
        let along = Math.abs(Math.sin(th)) > 0.04 ? y / Math.sin(th) : -1;
        for (let n = 0; n < 4 && along > 0; n += 1) {
          const sn = Math.sin(th + 0.32 * along * along);
          along = Math.abs(sn) > 0.04 ? y / sn : -1;
        }
        if (along < 0.17 || along > 1) {
          flush();
          continue;
        }
        const t = along;
        const dir = th + 0.32 * t * t;
        const s = Math.sin(dir);
        const width =
          0.028 + 0.12 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - 0.3 * t);
        const half = Math.min(0.5, width / Math.abs(s));
        const x = along * Math.cos(dir);
        const reach = Math.sqrt(Math.max(0, 1 - y * y));
        const l = Math.max(-reach, x - half);
        const r = Math.min(reach, x + half);
        if (r <= l) {
          flush();
          continue;
        }
        run.push({ y, l, r });
      }
      flush();
    }
    return out.join("");
  }, [blades, spin, period, skew, bands]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/readout-skew:opacity-0"
    >
      <svg
        viewBox="-1 -1 2 2"
        overflow="visible"
        className="absolute top-[calc(45%-min(38%,22cqw))] right-[max(14px,5cqw)] aspect-square h-[calc(2*min(38%,22cqw))]"
      >
        <path d={petals} style={{ fill: bladeColor }} />
        <circle r={0.17} style={{ fill: bladeColor }} opacity={0.8} />
      </svg>
      <div
        className="absolute top-[30%] h-[54%] w-[calc(2*clamp(9px,2.2cqw,16px))] -translate-x-1/2 rounded-full"
        style={{ left: puckLeft(value), backgroundColor: puckColor }}
      />
      <div className="absolute inset-x-0 top-[84%] h-px bg-ink-3/30" />
      <div
        className="absolute inset-x-0 top-[62%] h-px opacity-70"
        style={{
          backgroundColor: bandColor,
          boxShadow: `0 0 10px 2px ${bandColor}`,
        }}
      />
    </div>
  );
}
