"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type GrainMeshPalette = "poster" | "harbor" | "orchard" | "dusk";

export type GrainMeshProps = {
  /** The content on top of the print: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many colour points (inks) make the mesh, 4 to 6. @default 5 */
  points?: number;
  /** How the ink is printed, 0 (a smooth gradient) to 1 (a fully grained riso screen). @default 0.55 */
  grain?: number;
  /** A named set of inks, or four to six CSS colours of your own. @default "poster" */
  palette?: GrainMeshPalette | readonly string[];
  /** How fast the points drift on their orbits, 0 (still) to 2. @default 0.6 */
  drift?: number;
  /** How far each ink spreads into its neighbours, 0 (tight pools) to 1 (wide washes). @default 0.45 */
  softness?: number;
  /** The size of a grain, CSS px, 1 to 4. @default 1.5 */
  grainSize?: number;
  /** How far the inks sit out of register, px, 0 to 4. @default 1.2 */
  misregister?: number;
  /** The paper's fibres and tooth, 0 (smooth stock) to 1. @default 0.5 */
  paper?: number;
  /** The pointer leans the nearest ink toward it, a drag pulls it, and keyboard focus draws it in. @default true */
  interactive?: boolean;
  /** How far the nearest ink leans toward a hovering hand, 0 to 1. @default 0.5 */
  pointerStrength?: number;
  /** Hold the points still; the hand still pulls them. @default false */
  paused?: boolean;
  /** Seeds the points' homes, orbits, grain and register, so two prints never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) working the print. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a drag picks up an ink (its index) and when it lets go (null). */
  onGrab?: (index: number | null) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Spot inks at fixed lightness: an ink is the same ink on any paper. The
 * poster set's blue takes the accent token's hue.
 */
const PALETTES: Record<GrainMeshPalette, readonly string[]> = {
  poster: [
    "oklch(0.71 0.16 4)",
    "oklch(0.9 0.13 98)",
    "oklch(0.69 0.1 196)",
    "oklch(from var(--accent) 0.52 0.15 h)",
    "oklch(0.76 0.14 52)",
    "oklch(0.57 0.12 305)",
  ],
  harbor: [
    "oklch(0.42 0.09 255)",
    "oklch(0.72 0.09 205)",
    "oklch(0.89 0.06 86)",
    "oklch(0.71 0.13 32)",
    "oklch(0.86 0.07 170)",
    "oklch(0.6 0.05 245)",
  ],
  orchard: [
    "oklch(0.63 0.12 140)",
    "oklch(0.61 0.17 28)",
    "oklch(0.89 0.12 108)",
    "oklch(0.46 0.1 335)",
    "oklch(0.8 0.11 66)",
    "oklch(0.76 0.1 126)",
  ],
  dusk: [
    "oklch(0.44 0.1 290)",
    "oklch(0.71 0.13 350)",
    "oklch(0.83 0.1 60)",
    "oklch(0.56 0.12 262)",
    "oklch(0.9 0.05 82)",
    "oklch(0.63 0.1 320)",
  ],
};

/** The stock: the page with a little cream in it, so it reads as paper in either theme. */
const PAPER = "color-mix(in oklab, var(--background) 90%, oklch(0.88 0.04 82))";

/** Full resolution: the grain is the point, and it must land on whole pixels. */
const RENDER_SCALE = 1;
const STEP = 1 / 120;
const MAX = 6;
/** A hovering hand's lean follows glide; a release lands on recoil, a jolt on snap. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const RECOIL = springs.recoil;
const SNAP = springs.snap;
const FLICK = springs.flick;
/** A composed moment for the still print. */
const STILL_TIME = 29;

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

/** Any CSS colour, as linear RGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = lin(d[0] ?? 0);
    out[at + 1] = lin(d[1] ?? 0);
    out[at + 2] = lin(d[2] ?? 0);
  };
}

/** A focus this soon after a press or a lift inside came from the hand, ms. */
const PRESS_FOCUS_MS = 1000;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,video[controls],audio[controls],[role='button'],[role='link'],[role='slider'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='menuitem'],[role='option'],[role='combobox'],[role='spinbutton'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform int u_count;
uniform float u_grain;
uniform float u_gsize;
uniform float u_paperTex;
uniform float u_dark;
uniform float u_seed;
uniform vec3 u_paper;
uniform vec3 u_ink[6];
uniform vec4 u_pts[6];
uniform vec2 u_mis[6];
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}
${GLSL_SRGB}

void main() {
  float W = u_res.x / u_px;
  float H = u_res.y / u_px;
  vec2 px = v_uv * vec2(W, H);

  // Each ink's share of this spot: a Gaussian reach, normalised.
  float total = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= u_count) break;
    vec2 d = px - u_pts[i].xy;
    total += exp(-dot(d, d) / (2.0 * u_pts[i].z * u_pts[i].z));
  }
  total = max(total, 1e-6);

  vec3 light = u_paper;
  vec3 screen = vec3(1.0) - u_paper;
  for (int i = 0; i < 6; i++) {
    if (i >= u_count) break;
    // The ink's own drum sits slightly out of register.
    vec2 d = px + u_mis[i] - u_pts[i].xy;
    float share = exp(-dot(d, d) / (2.0 * u_pts[i].z * u_pts[i].z)) / total;
    float density = clamp(share * 1.22, 0.0, 1.0);
    // A stochastic screen fixed to the paper: fine grain with clumps.
    // Rounded grains with a sparkle of single pixels, not a square dither.
    vec2 o = vec2(float(i) * 37.7, float(i) * 11.3) + u_seed;
    vec2 g = px / u_gsize + o;
    float threshold = 0.56 * kx_noise(g) + 0.3 * kx_hash(floor(g * 1.6)) + 0.14 * kx_noise(g * 0.3);
    float cover = mix(density, step(threshold, density), u_grain);
    // Riso inks overprint: multiplied on light stock, screened on dark.
    light *= mix(vec3(1.0), u_ink[i], cover);
    screen *= mix(vec3(1.0), vec3(1.0) - u_ink[i], cover);
  }
  vec3 col = mix(light, vec3(1.0) - screen, u_dark);

  // The stock: long fibres across, and tooth.
  float fibre = kx_noise(vec2(px.x * 0.06, px.y * 0.85) + u_seed) - 0.5;
  float tooth = kx_hash(floor(px) + 0.5 + u_seed) - 0.5;
  col *= 1.0 + u_paperTex * (fibre * 0.07 + tooth * 0.05);

  col = kx_linearToSrgb(clamp(col, 0.0, 1.0));
  col += (kx_hash(gl_FragCoord.xy + 0.29) - 0.5) / 255.0;
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
  points: number;
  grain: number;
  paletteKey: string;
  drift: number;
  softness: number;
  grainSize: number;
  misregister: number;
  paper: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onGrab: (index: number | null) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  grab: (x: number, y: number) => void;
  pull: (x: number, y: number, dx: number, dy: number) => void;
  drop: (vx: number, vy: number) => void;
  pluck: (x: number, y: number) => void;
  dispose: () => void;
};

/** The points' homes, orbits and register, seeded. Homes in fractions of the box. */
function layPoints(seed: number) {
  const rand = lcg(seed * 29 + 17);
  const homes: { x: number; y: number }[] = [];
  // Spread the homes with a little rejection so no two inks pool together.
  for (let i = 0; i < MAX; i += 1) {
    let best = { x: 0.5, y: 0.5 };
    let room = -1;
    for (let tries = 0; tries < 8; tries += 1) {
      const c = { x: 0.08 + rand() * 0.84, y: 0.1 + rand() * 0.8 };
      let near = Infinity;
      for (const h of homes)
        near = Math.min(near, Math.hypot(c.x - h.x, (c.y - h.y) * 0.6));
      if (near > room) {
        room = near;
        best = c;
      }
    }
    homes.push(best);
  }
  return homes.map((h) => ({
    hx: h.x,
    hy: h.y,
    ax: 0.08 + rand() * 0.1,
    ay: 0.1 + rand() * 0.14,
    wx: (0.09 + rand() * 0.1) * (rand() < 0.5 ? -1 : 1),
    wy: 0.07 + rand() * 0.09,
    px: rand() * Math.PI * 2,
    py: rand() * Math.PI * 2,
    reach: 0.85 + rand() * 0.3,
    misAngle: rand() * Math.PI * 2,
    misAmount: 0.4 + rand() * 0.6,
  }));
}

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
  let dark = 0;
  let layout = layPoints(1);
  const read = rgbReader();
  /** Six inks and the paper, linear RGB. */
  const colours = new Float32Array(21);
  const pts = new Float32Array(MAX * 4);
  const mis = new Float32Array(MAX * 2);
  const size = { w: 0, h: 0 };
  const sim = { t: STILL_TIME };
  /** Each point's displacement from its orbit, its velocity, and where it is pulled. */
  const ox = new Float32Array(MAX);
  const oy = new Float32Array(MAX);
  const ovx = new Float32Array(MAX);
  const ovy = new Float32Array(MAX);
  const tx = new Float32Array(MAX);
  const ty = new Float32Array(MAX);
  /** Which spring each point answers to: 0 drift home, 1 glide lean, 2 recoil landing, 3 flick catch. */
  const mode = new Uint8Array(MAX);
  const hand = {
    x: 0,
    y: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
    target: -1,
  };
  const held = { index: -1, catching: false };
  /** The ink thrown home last, landing on recoil: the hover leaves it be and the register jolt stays on it. */
  let landing = -1;
  /** The register jolt of the held ink: px, and its spring. */
  const jolt = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const count = () => clamp(Math.round(cfg?.points ?? 5), 4, MAX);

  const orbit = (i: number) => {
    const p = layout[i];
    if (!p) return { x: 0, y: 0 };
    const t = cfg?.motionSafe ? sim.t : STILL_TIME;
    return {
      x: (p.hx + p.ax * Math.sin(t * p.wx + p.px)) * size.w,
      y: (p.hy + p.ay * Math.sin(t * p.wy + p.py)) * size.h,
    };
  };

  const nearest = (x: number, y: number) => {
    let best = 0;
    let gap = Infinity;
    for (let i = 0; i < count(); i += 1) {
      const o = orbit(i);
      const d = Math.hypot(o.x + (ox[i] ?? 0) - x, o.y + (oy[i] ?? 0) - y);
      if (d < gap) {
        gap = d;
        best = i;
      }
    }
    return { index: best, distance: gap };
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

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    p.program.set({
      u_res: [canvas.width, canvas.height],
      u_px: canvas.width / Math.max(1, size.w),
      u_count: count(),
      u_grain: clamp(c.grain, 0, 1),
      u_gsize: clamp(c.grainSize, 1, 4),
      u_paperTex: clamp(c.paper, 0, 1),
      u_dark: dark,
      u_seed: (Math.abs(Math.round(c.seed)) % 71) * 3.7 + 0.5,
      u_paper: colours.subarray(18, 21),
      u_ink: colours.subarray(0, 18),
    });
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const n = count();
    // An ink's reach follows the room it has: the same print on a phone card
    // as on a hero, never a box of nothing but blends.
    const reach =
      Math.sqrt((size.w * size.h) / n) * (0.28 + 0.5 * clamp(c.softness, 0, 1));
    const shift = clamp(c.misregister, 0, 4);
    // The register slips on the ink in the hand, then on the one landing.
    const joltOn =
      held.index >= 0 ? held.index : landing >= 0 ? landing : hand.target;
    for (let i = 0; i < MAX; i += 1) {
      const l = layout[i];
      const o = orbit(i);
      pts[i * 4] = o.x + (ox[i] ?? 0);
      pts[i * 4 + 1] = o.y + (oy[i] ?? 0);
      pts[i * 4 + 2] = reach * (l?.reach ?? 1);
      pts[i * 4 + 3] = i < n ? 1 : 0;
      const a = l?.misAngle ?? 0;
      const m = shift * (l?.misAmount ?? 0.5);
      const j = i === joltOn;
      mis[i * 2] = Math.cos(a) * m + (j ? jolt.x : 0);
      mis[i * 2 + 1] = Math.sin(a) * m + (j ? jolt.y : 0);
    }
    program.use();
    gl.uniform4fv(u.u_pts ?? null, pts);
    gl.uniform2fv(u.u_mis ?? null, mis);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** The hover lean: the nearest ink leans toward the hand, the rest go home. */
  const aim = () => {
    const c = cfg;
    if (!c) return;
    const n = count();
    const reachPx = Math.min(size.w, size.h) * 0.9;
    for (let i = 0; i < n; i += 1) {
      if (i === held.index) continue;
      // A thrown ink lands on recoil before a hovering hand may lean it again.
      if (i === landing && mode[i] === 2) continue;
      if (hand.present && i === hand.target) {
        const o = orbit(i);
        const dx = hand.x - o.x;
        const dy = hand.y - o.y;
        const pull =
          hand.source === "focus"
            ? 1
            : clamp(c.pointerStrength, 0, 1) *
              Math.exp(-(dx * dx + dy * dy) / (2 * reachPx * reachPx));
        tx[i] = dx * pull;
        ty[i] = dy * pull;
        mode[i] = 1;
      } else {
        tx[i] = 0;
        ty[i] = 0;
        if (mode[i] === 1 || mode[i] === 3) mode[i] = 0;
      }
    }
  };

  /** Advances the orbits and every spring. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.drift > 0) {
      sim.t += dt * clamp(c.drift, 0, 2);
      moving = true;
    }
    aim();
    const n = count();
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      for (let i = 0; i < n; i += 1) {
        if (i === held.index && !held.catching) continue;
        const k =
          mode[i] === 1
            ? GLIDE
            : mode[i] === 2
              ? RECOIL
              : mode[i] === 3
                ? FLICK
                : DRIFT;
        const ax =
          (k.stiffness * ((tx[i] ?? 0) - (ox[i] ?? 0)) -
            k.damping * (ovx[i] ?? 0)) /
          k.mass;
        const ay =
          (k.stiffness * ((ty[i] ?? 0) - (oy[i] ?? 0)) -
            k.damping * (ovy[i] ?? 0)) /
          k.mass;
        ovx[i] = (ovx[i] ?? 0) + ax * h;
        ovy[i] = (ovy[i] ?? 0) + ay * h;
        ox[i] = (ox[i] ?? 0) + (ovx[i] ?? 0) * h;
        oy[i] = (oy[i] ?? 0) + (ovy[i] ?? 0) * h;
      }
      jolt.vx +=
        ((SNAP.stiffness * (jolt.tx - jolt.x) - SNAP.damping * jolt.vx) /
          SNAP.mass) *
        h;
      jolt.vy +=
        ((SNAP.stiffness * (jolt.ty - jolt.y) - SNAP.damping * jolt.vy) /
          SNAP.mass) *
        h;
      jolt.x += jolt.vx * h;
      jolt.y += jolt.vy * h;
    }
    for (let i = 0; i < n; i += 1) {
      const off =
        Math.abs((tx[i] ?? 0) - (ox[i] ?? 0)) +
        Math.abs((ty[i] ?? 0) - (oy[i] ?? 0));
      const speed = Math.abs(ovx[i] ?? 0) + Math.abs(ovy[i] ?? 0);
      if (i === held.index && held.catching && off < 2) held.catching = false;
      if (off < 0.05 && speed < 0.5) {
        ox[i] = tx[i] ?? 0;
        oy[i] = ty[i] ?? 0;
        ovx[i] = 0;
        ovy[i] = 0;
        if (mode[i] === 2) mode[i] = 0;
      } else moving = true;
    }
    const jolting =
      Math.abs(jolt.tx - jolt.x) + Math.abs(jolt.ty - jolt.y) > 0.02 ||
      Math.abs(jolt.vx) + Math.abs(jolt.vy) > 0.1;
    if (!jolting) {
      jolt.x = jolt.tx;
      jolt.y = jolt.ty;
      jolt.vx = 0;
      jolt.vy = 0;
    }
    if (landing >= 0 && mode[landing] !== 2 && !jolting) landing = -1;
    return moving || jolting || held.index >= 0;
  };

  /** Reduced motion: every point stands exactly where it is put. */
  const place = () => {
    aim();
    for (let i = 0; i < MAX; i += 1) {
      if (i === held.index) continue;
      ox[i] = tx[i] ?? 0;
      oy[i] = ty[i] ?? 0;
      ovx[i] = 0;
      ovy[i] = 0;
      mode[i] = 0;
    }
    jolt.x = 0;
    jolt.y = 0;
    jolt.tx = 0;
    jolt.ty = 0;
    landing = -1;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (
      disposed ||
      !visible.current ||
      document.hidden ||
      !c ||
      !gpu ||
      gpu.lost
    ) {
      last = 0;
      return;
    }
    // Drifting alone, a print moves slowly enough for twenty-four frames a
    // second; the hand and the springs get every frame.
    let calm = !hand.present && held.index < 0;
    for (let i = 0; i < MAX && calm; i += 1) {
      if (ovx[i] !== 0 || ovy[i] !== 0 || ox[i] !== 0 || oy[i] !== 0)
        calm = false;
    }
    if (calm && last && now - drawnAt < 41) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    let moving = false;
    if (c.motionSafe) moving = step(dt);
    else place();
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (
      disposed ||
      frame ||
      !visible.current ||
      document.hidden ||
      !gpu ||
      gpu.lost
    )
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 7; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const lum =
      0.2126 * (colours[18] ?? 0) +
      0.7152 * (colours[19] ?? 0) +
      0.0722 * (colours[20] ?? 0);
    dark = clamp((0.3 - lum) / 0.22, 0, 1);
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
      if (!was || was.seed !== next.seed) layout = layPoints(next.seed);
      if (failed) return;
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS print stays, and nothing retries.
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
      if (was.paletteKey !== next.paletteKey) readColours();
      else statics();
      if (!next.interactive) {
        if (held.index >= 0) next.onGrab(null);
        held.index = -1;
        if (hand.present) {
          hand.present = false;
          hand.source = null;
          setActive(false);
        }
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
      // A still stand-in has no hand to report.
      if (!c?.interactive || failed || !gpu || gpu.lost) return;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      if (held.index < 0) hand.target = nearest(x, y).index;
      setActive(true);
      if (!c.motionSafe) {
        place();
        draw();
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source || held.index >= 0) return;
      hand.present = false;
      hand.source = null;
      // Focus lets the ink land home with its two small bounces; a hand that
      // only leaned lets it drift back.
      const t = hand.target;
      if (source === "focus" && t >= 0) mode[t] = 2;
      hand.target = -1;
      setActive(false);
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
      }
      kick();
    },
    grab(x, y) {
      const c = cfg;
      if (!c?.interactive) return;
      const { index } = nearest(x, y);
      held.index = index;
      held.catching = c.motionSafe;
      landing = -1;
      hand.target = index;
      const o = orbit(index);
      tx[index] = x - o.x;
      ty[index] = y - o.y;
      mode[index] = 3;
      if (!c.motionSafe) {
        ox[index] = tx[index] ?? 0;
        oy[index] = ty[index] ?? 0;
      }
      c.onGrab(index);
      kick();
    },
    pull(x, y, dx, dy) {
      const c = cfg;
      const i = held.index;
      if (!c || i < 0) return;
      const o = orbit(i);
      tx[i] = x - o.x;
      ty[i] = y - o.y;
      if (!held.catching) {
        // 1:1 under the finger once caught.
        ox[i] = tx[i] ?? 0;
        oy[i] = ty[i] ?? 0;
        ovx[i] = 0;
        ovy[i] = 0;
      }
      if (c.motionSafe) {
        // The pulled drum slips a little out of register, the way it pulls.
        const len = Math.hypot(dx, dy);
        if (len > 0.5) {
          jolt.tx = (dx / len) * 2.4;
          jolt.ty = (dy / len) * 2.4;
        }
      }
      kick();
    },
    drop(vx, vy) {
      const c = cfg;
      const i = held.index;
      if (!c || i < 0) return;
      held.index = -1;
      held.catching = false;
      tx[i] = 0;
      ty[i] = 0;
      jolt.tx = 0;
      jolt.ty = 0;
      if (c.motionSafe) {
        // Thrown home with the release velocity, landing on recoil.
        ovx[i] = clamp(vx, -4000, 4000);
        ovy[i] = clamp(vy, -4000, 4000);
        mode[i] = 2;
        landing = i;
      } else {
        ox[i] = 0;
        oy[i] = 0;
        ovx[i] = 0;
        ovy[i] = 0;
        mode[i] = 0;
      }
      c.onGrab(null);
      kick();
    },
    pluck(x, y) {
      const c = cfg;
      if (!c?.interactive || !c.motionSafe || held.index >= 0) return;
      // A tap flicks the nearest ink toward it; it lands back on recoil.
      const { index } = nearest(x, y);
      const o = orbit(index);
      const dx = x - (o.x + (ox[index] ?? 0));
      const dy = y - (o.y + (oy[index] ?? 0));
      ovx[index] = (ovx[index] ?? 0) + clamp(dx * 7, -2400, 2400);
      ovy[index] = (ovy[index] ?? 0) + clamp(dy * 7, -2400, 2400);
      if (mode[index] !== 1) mode[index] = 2;
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
 * A background printed rather than rendered: a mesh gradient of four to six
 * colour points, each a spot ink whose share of every spot is a Gaussian
 * reach, laid down drum by drum like a risograph — multiplied on light stock
 * so overprints darken into new colours, screened onto dark stock on a dark
 * page — through a stochastic screen fixed to the paper, so ink lands as
 * grain where it is thin and solid where it is thick. Each drum sits a
 * little out of register, and the stock has fibres and tooth. The points
 * drift on slow orbits; the grain stays put, so the coverage moves through
 * it like a print being re-inked. The content sits on top in its own layer.
 *
 * The nearest ink leans toward a hovering hand on the glide spring. A drag
 * picks it up — it catches the finger on the flick spring and then follows
 * it 1:1, its drum slipping a couple of pixels out of register the way it is
 * pulled — and a release throws it home with the release velocity, landing
 * on the recoil spring with two small bounces while the register snaps
 * back. Keyboard focus on a control inside draws the nearest ink to it;
 * blur lets it land home. Twenty-four frames a second while it only drifts,
 * every frame while the hand works; nothing off screen or in a hidden page.
 * Without WebGL2 a CSS print of the inks under a halftone screen stands in;
 * under reduced motion the print is still, a lean lands at once, and a drop
 * puts the ink straight home.
 */
export function GrainMesh({
  children,
  points = 5,
  grain = 0.55,
  palette = "poster",
  drift = 0.6,
  softness = 0.45,
  grainSize = 1.5,
  misregister = 1.2,
  paper = 0.5,
  interactive = true,
  pointerStrength = 0.5,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onGrab,
  className,
}: GrainMeshProps) {
  const motionSafe = useMotionSafe();
  const inks = React.useMemo(() => {
    const list =
      typeof palette === "string"
        ? (PALETTES[palette] ?? PALETTES.poster)
        : palette.length >= 4
          ? palette.slice(0, MAX)
          : PALETTES.poster;
    // Fewer than six of your own: the set repeats, so every slot has an ink.
    return Array.from(
      { length: MAX },
      (_, i) => list[i % list.length] ?? "gray",
    );
  }, [palette]);
  const paints = [...inks, PAPER];
  const paletteKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);
  const grabbed = React.useRef(onGrab);

  const config: Config = {
    points,
    grain,
    paletteKey,
    drift,
    softness,
    grainSize,
    misregister,
    paper,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
    onGrab: (i) => grabbed.current?.(i),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
    grabbed.current = onGrab;
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

  /** When the hand last pressed or lifted inside, so the focus it causes is not taken for the keyboard. */
  const pressedAt = React.useRef(-Infinity);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const drag = useDrag({
    threshold: 4,
    disabled: !interactive,
    onStart: ({ point, offset }) => {
      const from = local(point.x - offset.x, point.y - offset.y);
      engine.current?.grab(from.x, from.y);
    },
    onMove: ({ point, delta }) => {
      const at = local(point.x, point.y);
      engine.current?.handTo(at.x, at.y, "pointer");
      engine.current?.pull(at.x, at.y, delta.x, delta.y);
    },
    onEnd: ({ velocity, event }) => {
      engine.current?.drop(velocity.x, velocity.y);
      if (event.pointerType === "touch") engine.current?.handAway("pointer");
    },
    onCancel: () => {
      engine.current?.drop(0, 0);
      engine.current?.handAway("pointer");
    },
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      engine.current?.pluck(at.x, at.y);
    },
  });

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pressedAt.current = performance.now();
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // Ink is picked up only from the paper, never from the content's controls.
    if (!hit || !rootRef.current?.contains(hit)) drag.onPointerDown(event);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    // A tap focuses its target after the finger lifts.
    pressedAt.current = performance.now();
    drag.onPointerUp(event);
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // A touch the browser takes back before it became a drag (a pinch, a
  // scroll) still lets the hand go; a drag's own cancel drops the ink first.
  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerCancel(event);
    engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside draws the nearest ink to it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    // A text field shows a focus ring even when clicked; a press is not the keyboard.
    if (performance.now() - pressedAt.current < PRESS_FOCUS_MS) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
  };

  // A key pressed inside means the next focus is the keyboard's, however
  // recently the hand pressed.
  const onKeyDown = () => {
    pressedAt.current = -Infinity;
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
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDownCapture={onKeyDown}
      className={cn(
        // A sideways drag pulls ink on touch; an upright one scrolls the page.
        "group/grain-mesh relative isolate h-full w-full touch-pan-y overflow-clip select-none",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/grain-mesh:opacity-0"
        style={standIn(inks, clamp(Math.round(points), 4, MAX), seed)}
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
      <div className="relative z-10 size-full select-text">{children}</div>
    </div>
  );
}

/**
 * The CSS print for the server render, the first paint and any browser
 * without WebGL2: each ink pooled at its home on the stock, under a fine
 * halftone screen so it still reads as printed.
 */
function standIn(
  inks: readonly string[],
  n: number,
  seed: number,
): React.CSSProperties {
  const homes = layPoints(seed);
  const pools: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const h = homes[i];
    if (!h) continue;
    pools.push(
      `radial-gradient(circle at ${Math.round(h.hx * 100)}% ${Math.round(h.hy * 100)}%, color-mix(in oklab, ${inks[i] ?? "gray"} 92%, transparent) 0, transparent 46%)`,
    );
  }
  const dot =
    "radial-gradient(circle, color-mix(in oklab, var(--foreground) 10%, transparent) 0.6px, transparent 1.3px)";
  return {
    backgroundColor: PAPER,
    backgroundImage: [dot, ...pools].join(", "),
    backgroundSize: ["3px 3px", ...pools.map(() => "100% 100%")].join(", "),
  };
}
