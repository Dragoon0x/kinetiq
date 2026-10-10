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

export type ColorFoldPalette = "cobalt" | "clay" | "sea" | "dusk";

export type ColorFoldProps = {
  /** The content on top of the ribbons: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many ribbons of colour lie across the frame, 2 to 8. @default 5 */
  bands?: number;
  /** How deeply the ribbons bend, 0 (straight) to 1 (deep rolling bends). @default 0.55 */
  curve?: number;
  /** A named palette, or 2 to 8 CSS colours of your own, one per ribbon in turn. @default "cobalt" */
  palette?: ColorFoldPalette | readonly string[];
  /** A ribbon's width as a share of its spacing, 0.6 to 1.6: past 1 they overlap and fold over each other. @default 1.3 */
  width?: number;
  /** How far the ribbons turn over along their length, 0 (flat) to 1 (turning right over). @default 0.5 */
  twist?: number;
  /** The tilt of the whole stack, degrees, −30 to 30. @default -8 */
  angle?: number;
  /** How fast the bends travel, 0 (still) to 2. @default 0.5 */
  speed?: number;
  /** How dark a ribbon's shadow falls on the ones beneath it, 0 to 1. @default 0.5 */
  shadow?: number;
  /** A soft light along the flat of each ribbon, 0 to 1. @default 0.4 */
  sheen?: number;
  /** A whisper of grain that also hides banding, 0 to 1. @default 0.2 */
  grain?: number;
  /** The pointer and keyboard focus part the ribbons, and a press throws a fold along them. @default true */
  interactive?: boolean;
  /** How far the hand parts the ribbons and how hard a press folds them, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the ribbons still; the hand still parts and folds them. @default false */
  paused?: boolean;
  /** Seeds every bend, twist and weave, so two folds never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) parting the ribbons. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Pigments at fixed lightness, so a ribbon is the same paint on a light page and a dark one. */
const PALETTES: Record<ColorFoldPalette, readonly string[]> = {
  cobalt: [
    "oklch(from var(--accent) 0.42 c h)",
    "oklch(from var(--accent-bright) 0.62 c h)",
    "oklch(from var(--signal) 0.76 calc(c * 0.7) h)",
    "oklch(from var(--accent-bright) 0.86 calc(c * 0.28) calc(h - 40))",
    "oklch(from var(--accent) 0.52 calc(c * 0.8) calc(h + 38))",
  ],
  clay: [
    "oklch(0.56 0.12 40)",
    "oklch(0.82 0.07 78)",
    "oklch(0.62 0.06 150)",
    "oklch(0.42 0.06 250)",
    "oklch(0.7 0.11 58)",
  ],
  sea: [
    "oklch(0.44 0.08 242)",
    "oklch(0.62 0.09 212)",
    "oklch(0.8 0.07 182)",
    "oklch(0.91 0.04 150)",
    "oklch(0.54 0.07 196)",
  ],
  dusk: [
    "oklch(0.42 0.1 300)",
    "oklch(0.63 0.13 342)",
    "oklch(0.79 0.1 42)",
    "oklch(0.89 0.06 82)",
    "oklch(0.52 0.1 320)",
  ],
};

/** The page that shows where a ribbon pinches to its crease. */
const GROUND = "color-mix(in oklab, var(--background) 92%, var(--foreground))";
const MAX_BANDS = 8;
const PULSES = 3;
/** A fold runs out from the press at this speed, px/s, and fades over this long, s. */
const FOLD_SPEED = 320;
const FOLD_LIFE = 2.4;
const STEP = 1 / 120;
/** The hand's place follows on glide, its presence on drift: the ribbons ease apart. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;

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
uniform int u_bands;
uniform int u_colours;
uniform float u_curve;
uniform float u_width;
uniform float u_twist;
uniform float u_shadow;
uniform float u_sheen;
uniform float u_grain;
uniform float u_angle;
uniform vec3 u_col[${MAX_BANDS}];
uniform vec3 u_ground;
uniform vec3 u_hand;
uniform float u_radius;
uniform vec4 u_pulse[${PULSES}];
uniform float u_seed;
uniform float u_frame;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void main() {
  vec2 p = v_uv * u_size;
  vec2 c = u_size * 0.5;
  float ca = cos(u_angle);
  float sa = sin(u_angle);
  mat2 toBand = mat2(ca, -sa, sa, ca);
  vec2 q = toBand * (p - c);
  vec2 hq = toBand * (u_hand.xy - c);
  float span = abs(sa) * u_size.x + abs(ca) * u_size.y;
  float along = abs(ca) * u_size.x + abs(sa) * u_size.y;
  float n = float(u_bands);
  float S = span * 1.04 / n;
  float k1 = 6.2831853 / max(along * 1.1, 200.0);
  float aa = 0.6 + 0.6 / u_px;

  float yc[${MAX_BANDS}];
  float hw[${MAX_BANDS}];
  float cs[${MAX_BANDS}];
  float dp[${MAX_BANDS}];
  int order[${MAX_BANDS}];

  for (int i = 0; i < ${MAX_BANDS}; i++) {
    order[i] = i;
    yc[i] = 0.0; hw[i] = 0.0; cs[i] = 1.0; dp[i] = 0.0;
    if (i >= u_bands) continue;
    float fi = float(i);
    float h1 = hash(vec2(fi, u_seed));
    float h2 = hash(vec2(fi + 7.0, u_seed));
    float h3 = hash(vec2(fi + 13.0, u_seed));
    float h4 = hash(vec2(fi + 19.0, u_seed));
    float h5 = hash(vec2(fi + 29.0, u_seed));
    float base = (fi + 0.5) * S - span * 0.52;
    float ka = k1 * (0.8 + 0.5 * h1);
    float kb = ka * (1.9 + 0.4 * h2);
    float t = u_time;
    float amp = u_curve * S * 1.5;
    float y = base + amp * (0.62 * sin(ka * q.x + t * (0.22 + 0.16 * h3) + 6.2831853 * h4)
                          + 0.38 * sin(kb * q.x - t * (0.14 + 0.1 * h5) + 6.2831853 * h2));
    // The hand parts the ribbons: those above it bow up, those below bow down.
    float r2 = u_radius * u_radius;
    float hx = q.x - hq.x;
    float hy = base - hq.y;
    float g = exp(-(hx * hx + hy * hy * 0.6) / r2);
    y += u_hand.z * S * 0.9 * g * (base >= hq.y ? 1.0 : -1.0);
    // Folds: rings that leave a press and turn every ribbon over as they pass.
    float fold = 0.0;
    for (int j = 0; j < ${PULSES}; j++) {
      vec4 pu = u_pulse[j];
      if (pu.w <= 0.0) continue;
      vec2 pq = toBand * (pu.xy - c);
      float d = length(vec2(q.x - pq.x, base - pq.y));
      float front = (d - ${FOLD_SPEED.toFixed(1)} * pu.z) / 70.0;
      float e = exp(-front * front) * exp(-pu.z / 0.9) * pu.w;
      fold += e;
      y -= e * S * 0.22;
    }
    float phase = u_twist * 4.0 * sin(k1 * (0.45 + 0.4 * h5) * q.x + t * 0.11 + 6.2831853 * h3);
    float tw = cos(phase + 3.14159265 * fold);
    yc[i] = y;
    cs[i] = tw;
    hw[i] = u_width * S * 0.5 * (0.1 + 0.9 * abs(tw));
    // A ribbon that has turned over lies behind its neighbours, and the
    // change happens at its crease, where it is thinnest: so the ribbons
    // plait over and under one another with no seam where the order swaps.
    dp[i] = fi + 1.1 * (smoothstep(-0.12, 0.12, tw) * 2.0 - 1.0);
  }

  // Back to front, by the depth each ribbon has at this x.
  for (int i = 0; i < ${MAX_BANDS}; i++) {
    if (i >= u_bands) break;
    for (int j = i + 1; j < ${MAX_BANDS}; j++) {
      if (j >= u_bands) break;
      if (dp[order[j]] < dp[order[i]]) {
        int tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }
    }
  }

  vec3 col = u_ground * (0.96 + 0.04 * v_uv.y);
  // Light from the upper left: shadows fall down and to the right.
  vec2 off = toBand * vec2(5.0, 9.0);
  for (int a = 0; a < ${MAX_BANDS}; a++) {
    if (a >= u_bands) break;
    int i = order[a];
    float y = yc[i];
    float w = hw[i];
    float dist = q.y - y;
    float cover = 1.0 - smoothstep(w - aa, w + aa, abs(dist));
    float sd = abs(dist - off.y);
    float sh = 1.0 - smoothstep(w - 14.0, w + 14.0, sd);
    col *= 1.0 - u_shadow * 0.42 * sh * (1.0 - cover);
    vec3 front = u_col[i % u_colours];
    vec3 next = u_col[(i + 1) % u_colours];
    float tw = cs[i];
    vec3 paint = tw >= 0.0 ? front : mix(front, next, 0.3) * 0.8;
    float across = clamp(dist / max(w, 0.5), -1.0, 1.0);
    // A ribbon turning edge-on darkens; its upper side catches the light.
    paint *= 0.72 + 0.28 * abs(tw);
    paint *= 1.0 - 0.1 * across;
    paint *= 1.0 - 0.12 * smoothstep(0.72, 1.0, abs(across));
    float lift = (across + 0.35) / 0.24;
    float spec = exp(-lift * lift) * u_sheen * 0.32 * tw * tw;
    paint += (vec3(1.0) - paint) * spec;
    col = mix(col, paint, cover);
  }

  float noise = hash(gl_FragCoord.xy + vec2(u_frame * 17.0, u_frame * 31.0));
  col += (noise - 0.5) * u_grain * 0.05;
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
  bands: number;
  curve: number;
  paletteKey: string;
  colours: number;
  width: number;
  twist: number;
  angle: number;
  speed: number;
  shadow: number;
  sheen: number;
  grain: number;
  interactive: boolean;
  strength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  fold: (x: number, y: number, strength: number) => void;
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
  let frames = 0;
  const read = rgbReader();
  const colours = new Float32Array(MAX_BANDS * 3);
  const ground = new Float32Array(3);
  const pulses = new Float32Array(PULSES * 4);
  const size = { w: 0, h: 0 };
  const sim = { t: 0 };
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

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

  /** Uniforms that change only with the look, the layout or the theme. */
  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform2f(u.u_size ?? null, size.w, size.h);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1i(u.u_bands ?? null, clamp(Math.round(c.bands), 2, MAX_BANDS));
    gl.uniform1i(u.u_colours ?? null, clamp(c.colours, 1, MAX_BANDS));
    gl.uniform1f(u.u_curve ?? null, clamp(c.curve, 0, 1));
    gl.uniform1f(u.u_width ?? null, clamp(c.width, 0.6, 1.6));
    gl.uniform1f(u.u_twist ?? null, clamp(c.twist, 0, 1));
    gl.uniform1f(u.u_shadow ?? null, clamp(c.shadow, 0, 1));
    gl.uniform1f(u.u_sheen ?? null, clamp(c.sheen, 0, 1));
    gl.uniform1f(u.u_grain ?? null, clamp(c.grain, 0, 1));
    gl.uniform1f(u.u_angle ?? null, (clamp(c.angle, -30, 30) * Math.PI) / 180);
    gl.uniform1f(
      u.u_radius ?? null,
      Math.max(40, Math.min(size.w, size.h) * 0.55),
    );
    gl.uniform1f(u.u_seed ?? null, (lcg(c.seed)() * 97) % 97);
    gl.uniform3fv(u.u_col ?? null, colours);
    gl.uniform3f(
      u.u_ground ?? null,
      ground[0] ?? 0,
      ground[1] ?? 0,
      ground[2] ?? 0,
    );
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    // Reduced motion holds one composed moment, the same every visit.
    gl.uniform1f(u.u_time ?? null, c.motionSafe ? sim.t : 23);
    gl.uniform3f(u.u_hand ?? null, hand.px, hand.py, hand.amount);
    gl.uniform4fv(u.u_pulse ?? null, pulses);
    gl.uniform1f(u.u_frame ?? null, c.motionSafe ? frames % 64 : 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    frames += 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances time, the hand and the folds. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const want = hand.present && c.interactive ? clamp(c.strength, 0, 1) : 0;
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
      hand.amountV +=
        ((DRIFT.stiffness * (want - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount += hand.amountV * h;
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
    const arriving =
      Math.abs(want - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = want;
      hand.amountV = 0;
    }
    let folding = false;
    for (let j = 0; j < PULSES; j += 1) {
      if ((pulses[j * 4 + 3] ?? 0) <= 0) continue;
      const age = (pulses[j * 4 + 2] ?? 0) + dt;
      if (age > FOLD_LIFE) {
        pulses[j * 4 + 3] = 0;
        continue;
      }
      pulses[j * 4 + 2] = age;
      folding = true;
    }
    return moving || (handMoving && hand.amount > 0.001) || arriving || folding;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Drifting alone, the paint moves slowly enough for thirty frames a
    // second; the hand and a fold get every frame.
    const calm = !hand.present && hand.amount === 0 && !anyPulse();
    if (calm && last && now - drawnAt < 31) {
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

  const anyPulse = () => {
    for (let j = 0; j < PULSES; j += 1) {
      if ((pulses[j * 4 + 3] ?? 0) > 0) return true;
    }
    return false;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    read(kids[0] ? getComputedStyle(kids[0]).color : "black", ground, 0);
    const count = cfg?.colours ?? 1;
    for (let i = 0; i < MAX_BANDS; i += 1) {
      const el = kids[1 + (i % count)];
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

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS still frame stays, and nothing retries.
          failed = true;
          root.setAttribute("data-fallback", "");
          return;
        }
        sim.t = lcg(next.seed * 5 + 2)() * 40;
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
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) {
        hand.px = hand.x;
        hand.py = hand.y;
        hand.amount = hand.present ? clamp(next.strength, 0, 1) : 0;
        hand.amountV = 0;
        pulses.fill(0);
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
      if (!hand.present || hand.amount < 0.01) {
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
      if (c && !c.motionSafe) {
        // Reduced motion: the ribbons part exactly where the hand is.
        hand.px = x;
        hand.py = y;
        hand.amount = clamp(c.strength, 0, 1);
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) hand.amount = 0;
      kick();
    },
    fold(x, y, strength) {
      const c = cfg;
      if (!c || !c.motionSafe) return;
      // A free slot, or else the oldest fold gives way.
      let pick = 0;
      let oldest = -1;
      for (let j = 0; j < PULSES; j += 1) {
        if ((pulses[j * 4 + 3] ?? 0) <= 0) {
          pick = j;
          oldest = Infinity;
          break;
        }
        const age = pulses[j * 4 + 2] ?? 0;
        if (age > oldest) {
          oldest = age;
          pick = j;
        }
      }
      pulses[pick * 4] = x;
      pulses[pick * 4 + 1] = y;
      pulses[pick * 4 + 2] = 0;
      pulses[pick * 4 + 3] = clamp(c.strength, 0, 1) * strength;
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
 * A background of ribbons of paint folded round one another, with the
 * content on top in its own layer. Each ribbon's centreline bends in two slow
 * travelling waves, so the bends roll across the frame; the ribbons are
 * wider than their spacing and their stacking order changes along their
 * length, so neighbours plait over and under each other, and each one turns
 * over as it goes — pinching to a crease where it is edge-on and showing its
 * darker back where it has turned. Every ribbon casts a soft shadow on what
 * lies beneath it, its upper side catches the light and a sheen runs along
 * its flat.
 *
 * The pointer is a hand in the paint: the ribbons part around it, its place
 * following on glide and its presence arriving on drift. A press throws a
 * fold — a ring that leaves the press and turns every ribbon right over as it
 * passes, lifting it a little, and fades in a second or two. Keyboard focus
 * on a control inside parts the ribbons there and throws a softer fold. One
 * WebGL2 pass; thirty frames a second while it only drifts, every frame for
 * the hand and folds, only on screen in a visible page. Without WebGL2 a CSS
 * still frame of the palette stands in; under reduced motion one composed
 * moment is held and the hand parts the ribbons exactly where it is.
 */
export function ColorFold({
  children,
  bands = 5,
  curve = 0.55,
  palette = "cobalt",
  width = 1.3,
  twist = 0.5,
  angle = -8,
  speed = 0.5,
  shadow = 0.5,
  sheen = 0.4,
  grain = 0.2,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: ColorFoldProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(() => {
    const list =
      typeof palette === "string"
        ? (PALETTES[palette as ColorFoldPalette] ?? PALETTES.cobalt)
        : palette.length >= 2
          ? palette.slice(0, MAX_BANDS)
          : PALETTES.cobalt;
    return list;
  }, [palette]);
  const paletteKey = paints.join("|");
  const count = clamp(Math.round(bands), 2, MAX_BANDS);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    bands: count,
    curve,
    paletteKey,
    colours: paints.length,
    width,
    twist,
    angle,
    speed,
    shadow,
    sheen,
    grain,
    interactive,
    strength: pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
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
    // A press on a control is the control's; only the paint folds.
    if (!hit || !rootRef.current?.contains(hit)) {
      engine.current?.fold(at.x, at.y, 1);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
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
    engine.current?.fold(at.x, at.y, 0.6);
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
        // A sideways drag works the paint on touch; an upright one scrolls.
        "group/color-fold relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/color-fold:opacity-0"
        style={standIn(paints, count, angle)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[GROUND, ...paints].map((paint, i) => (
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
 * browser without WebGL2: the ribbons as straight bands across the stack's
 * tilt, each with a soft shadow under its lower edge.
 */
function standIn(
  paints: readonly string[],
  count: number,
  angle: number,
): React.CSSProperties {
  const stops: string[] = [];
  const share = 100 / count;
  for (let i = 0; i < count; i += 1) {
    const paint = paints[i % paints.length] ?? GROUND;
    const from = Math.round(i * share * 100) / 100;
    const to = Math.round((i + 1) * share * 100) / 100;
    const edge = Math.round((to - Math.min(4, share * 0.18)) * 100) / 100;
    stops.push(
      `${paint} ${from}%`,
      `${paint} ${edge}%`,
      `color-mix(in oklab, ${paint} 72%, black) ${to}%`,
    );
  }
  return {
    backgroundColor: GROUND,
    backgroundImage: `linear-gradient(${Math.round(180 + clamp(angle, -30, 30))}deg, ${stops.join(", ")})`,
  };
}
