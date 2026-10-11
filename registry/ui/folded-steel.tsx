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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type FoldedSteelReveal = "inView" | "mount" | "none";

export type FoldedSteelProps = {
  /** How far the billet is twisted, in turns along the bar, −3 to 3 (controlled). */
  twist?: number;
  /** The twist it starts with when uncontrolled. @default 0.75 */
  defaultTwist?: number;
  /** Fires from the drag release, key or quench that changed the twist, rounded to 0.05 turn. */
  onTwistChange?: (twist: number) => void;
  /** How deeply the layers are pressed into waves and ladder rungs, 0 to 1 (controlled). */
  fold?: number;
  /** The fold it starts with when uncontrolled. @default 0.2 */
  defaultFold?: number;
  /** Fires from the drag release, key or quench that changed the fold, rounded to 0.05. */
  onFoldChange?: (fold: number) => void;
  /** How many layers were welded into the billet, 8 to 64. @default 24 */
  layers?: number;
  /** How deep the acid bit: 0 is a polished blank, 1 dark sunk layers with a crystalline grain. @default 0.6 */
  etch?: number;
  /** How many ladder rungs a full fold presses along the bar, 3 to 14. @default 7 */
  rungs?: number;
  /** The brushed sheen under the light, 0 to 1. @default 0.7 */
  sheen?: number;
  /** The nickel-bright layers, any CSS colour. @default a cool steel from the tokens */
  brightColor?: string;
  /** The etched carbon layers, any CSS colour. @default a deep blued grey from the tokens */
  darkColor?: string;
  /** The light's colour on the brushed surface, any CSS colour. @default a cool white */
  sheenColor?: string;
  /** When the etch first comes up: the first time it is seen, at mount, or already etched. @default "inView" */
  reveal?: FoldedSteelReveal;
  /** Fires when a double click or Enter quenches the bar back to straight layers. */
  onQuench?: () => void;
  /** The light follows the pointer, and drags twist and fold. @default true */
  interactive?: boolean;
  /** The bar's accessible name. @default "Pattern-welded steel bar" */
  label?: string;
  /** Seeds the hand-forged wobble in the layers. @default 7 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** No twisting, folding or quenching. @default false */
  disabled?: boolean;
  /** Sizes the piece; the bar fills it less a small margin. It is 144px tall by default. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const snap05 = (v: number) => Math.round(v * 20) / 20;
const TWIST_MAX = 3;
const TWIST_MIN = -TWIST_MAX;
/** Dragging the bar's full length twists it this many turns. */
const TURNS_PER_LENGTH = 1.5;
const STEP = 1 / 240;
const REVEAL_MS = 1100;
const QUENCH_MS = 700;
const MARGIN = 12;

/** The bar inside a box: full width less a margin, a little room under it for its shadow. */
function barRect(w: number, h: number) {
  const bh = clamp(h - 2 * MARGIN - 6, 30, 120);
  const top = Math.round((h - bh) / 2 - 3);
  return {
    x0: MARGIN,
    y0: top,
    x1: Math.max(MARGIN + 40, w - MARGIN),
    y1: top + bh,
    radius: Math.round(clamp(bh * 0.12, 4, 12)),
  };
}

const FRAGMENT = `
uniform vec2 u_size;
uniform vec4 u_bar;
uniform float u_radius;
uniform float u_layers;
uniform float u_twist;
uniform float u_fold;
uniform float u_rungs;
uniform float u_etch;
uniform float u_sheen;
uniform vec2 u_light;
uniform vec3 u_quench;
uniform float u_reveal;
uniform float u_seed;
uniform vec3 u_bright;
uniform vec3 u_dark;
uniform vec3 u_tint;
uniform vec3 u_temper;
in vec2 v_uv;
out vec4 outColor;

${GLSL_NOISE}

void main() {
  vec2 p = v_uv * u_size;
  vec2 c = (u_bar.xy + u_bar.zw) * 0.5;
  vec2 hs = (u_bar.zw - u_bar.xy) * 0.5;
  vec2 q = abs(p - c) - (hs - u_radius);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
  float inside = 1.0 - smoothstep(-0.6, 0.6, d);

  // A soft contact shadow under the bar, inside the canvas.
  float below = clamp((p.y - c.y) / hs.y, 0.0, 2.0);
  float shadow = exp(-max(d, 0.0) / 5.0) * smoothstep(0.2, 1.0, below) * 0.28;
  if (inside <= 0.0) {
    outColor = vec4(0.0, 0.0, 0.0, shadow);
    return;
  }

  float s = (p.x - u_bar.x) / max(1.0, u_bar.z - u_bar.x);
  float t = (p.y - c.y) / hs.y;

  // Where the surface came from in the billet: twisted about its long axis
  // by phi, ground at a depth that wanders a little along the bar.
  float z = 0.2 + 0.09 * (kx_fbm(vec2(s * 3.1 + u_seed, 2.7)) - 0.5);
  float phi = 6.2831853 * u_twist * (s - 0.5);
  float h = t * cos(phi) + z * sin(phi) * 2.2;

  // The fold: a press that starts as a gentle wave and, deeper, cuts
  // narrow rungs across the bar — ladders.
  float wave = sin(6.2831853 * u_rungs * s + u_seed);
  float g = fract(u_rungs * s + 0.25 + u_seed * 0.01) - 0.5;
  float rung = exp(-g * g / mix(0.08, 0.004, u_fold));
  float press = mix(wave * 0.5, rung, smoothstep(0.15, 0.9, u_fold));
  h += u_fold * 0.55 * press * (0.75 + 0.25 * cos(t * 1.4));

  // Hand forging: no layer is quite straight or quite even.
  h += 0.13 * (kx_fbm(vec2(s * 2.6, t * 1.1) + u_seed) - 0.5);
  h += 0.035 * (kx_noise(vec2(s * 11.0, t * 3.0) + u_seed * 1.7) - 0.5);
  float layer = h * u_layers * 0.5;
  layer += 0.16 * (kx_noise(vec2(s * 19.0, h * 7.0) + u_seed) - 0.5);
  float fw = max(fwidth(layer), 1e-4);
  float tri = abs(fract(layer) - 0.5) * 2.0;
  float bright = smoothstep(0.58 - fw * 1.5, 0.58 + fw * 1.5, tri);
  // No two layers came out of the forge quite the same shade.
  float which = floor(layer + 0.5);
  float shade = fract(sin(which * 78.233 + u_seed) * 43758.5453) - 0.5;

  // The acid comes up along the bar as the reveal front passes.
  float bit = smoothstep(u_reveal * 1.12 - 0.12, u_reveal * 1.12 - 0.02, s);
  // Before the acid, the polished blank still shows its layers faintly.
  float etch = u_etch * (0.18 + 0.82 * (1.0 - bit));
  vec3 dark = mix(u_bright * 0.9, u_dark, etch);
  float grain = (kx_noise(p * 0.85 + u_seed) - 0.5) * 0.24 * etch * (1.0 - bright);
  vec3 col = mix(dark * (1.0 + shade * 0.3 * etch), u_bright * (1.0 + shade * 0.08), bright) * (1.0 + grain);

  // Etched relief: the dark layers sit lower, so every boundary catches a
  // hairline of light on one side and shade on the other.
  float relief = (1.0 - bright) * etch;
  vec2 grad = vec2(dFdx(relief), dFdy(relief));
  vec2 toLight = normalize(u_light - p + vec2(0.0, -40.0));
  col *= 1.0 - 0.9 * dot(grad, toLight);

  // A slightly crowned, polished face reflects the room: a soft bright
  // band of window above the middle, a darker floor below, drifting along.
  float room = smoothstep(-0.95, -0.35, t) * (1.0 - smoothstep(-0.35, 0.25, t));
  float drift = kx_fbm(vec2(s * 1.6 + u_seed, 0.3));
  col *= 0.8 + 0.22 * room * (0.6 + 0.8 * drift) - 0.1 * smoothstep(0.2, 1.0, t);

  // Brushed sheen: streaks along the bar, lit in a broad band under the light.
  float streak = kx_noise(vec2(p.x * 0.012, p.y * 1.4 + u_seed)) * 0.6 + kx_noise(vec2(p.x * 0.05, p.y * 3.3)) * 0.4;
  float ly = clamp((u_light.y - c.y) / hs.y, -1.6, 1.6) * 0.55;
  float band = exp(-pow((p.x - u_light.x) / (hs.x * 0.42 + 30.0), 2.0)) * exp(-pow(t - ly, 2.0) / 0.9);
  col += u_tint * u_sheen * band * (0.25 + 0.5 * streak) * (0.45 + 0.55 * bright);
  col += u_tint * u_sheen * 0.05 * streak;

  // The chamfers: a lit upper edge with a crisp line, a shaded lower one.
  float bevel = smoothstep(-3.5, 0.0, d);
  col = mix(col, t < 0.0 ? col * 1.22 + 0.04 : col * 0.58, bevel * 0.75);
  float line = (1.0 - smoothstep(0.0, 1.1, abs(d + 1.3))) * smoothstep(0.1, -0.5, t);
  col += u_tint * line * 0.35;

  // The quench: a cool temper flash running out from where it was struck.
  float dq = abs(p.x - u_quench.x) - u_quench.y;
  float flash = exp(-dq * dq / 420.0) * u_quench.z;
  col = mix(col, u_temper, flash * 0.55);
  col += u_tint * flash * 0.15;

  col = clamp(col, 0.0, 1.0);
  float a = inside;
  outColor = vec4(col * a, a + shadow * (1.0 - a));
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  layers: number;
  etch: number;
  rungs: number;
  sheen: number;
  reveal: FoldedSteelReveal;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  seen: (inView: boolean) => void;
  wake: () => void;
  /** Sends twist and fold to targets on a spring; velocities per second, or null to keep. */
  springTo: (
    twist: number,
    fold: number,
    velocity: { twist: number; fold: number } | null,
    kind: "glide" | "snap" | "drift",
  ) => void;
  /** Holds twist and fold where the finger has them. */
  hold: (twist: number, fold: number) => void;
  /** Puts twist and fold somewhere at once, before the first frame. */
  place: (twist: number, fold: number) => void;
  /** Moves the light to a point in the box, or home. */
  light: (x: number | null, y: number | null) => void;
  quench: (x: number) => void;
  values: () => { twist: number; fold: number };
  bar: () => { x0: number; x1: number; y0: number; y1: number };
  dispose: () => void;
};

type Spring = { stiffness: number; damping: number; mass: number };

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let w = 0;
  let h = 0;
  let rect = barRect(1, 1);
  const colours = new Float32Array(12);

  // Twist and fold, each a spring; the light, a spring in two axes.
  const tw = { x: 0, v: 0, target: 0 };
  const fo = { x: 0, v: 0, target: 0 };
  let spring: Spring = springs.glide;
  let holding = false;
  const li = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, home: true };
  let revealAt = -1;
  let revealed = 0;
  let quenchAt = -1;
  let quenchX = 0;
  let quenchState = { radius: 0, strength: 0 };

  const reader = (() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c.getContext("2d", { willReadFrequently: true });
  })();
  const rgb = (colour: string, out: Float32Array, at: number) => {
    if (!reader) return;
    reader.clearRect(0, 0, 1, 1);
    reader.fillStyle = "rgb(128, 128, 128)";
    reader.fillStyle = colour;
    reader.fillRect(0, 0, 1, 1);
    const d = reader.getImageData(0, 0, 1, 1).data;
    out[at] = (d[0] ?? 0) / 255;
    out[at + 1] = (d[1] ?? 0) / 255;
    out[at + 2] = (d[2] ?? 0) / 255;
  };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    gpu = {
      gl,
      program,
      tri: createFullscreenTriangle(gl, program),
      lost: false,
    };
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.tri.dispose();
    g.program.dispose();
  };

  const homeLight = () => {
    li.tx = rect.x0 + (rect.x1 - rect.x0) * 0.3;
    li.ty = rect.y0 - 30;
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    p.program.set({
      u_size: [w, h],
      u_bar: [rect.x0, rect.y0, rect.x1, rect.y1],
      u_radius: rect.radius,
      u_layers: clamp(Math.round(c.layers), 8, 64),
      u_rungs: clamp(c.rungs, 3, 14),
      u_etch: clamp(c.etch, 0, 1),
      u_sheen: clamp(c.sheen, 0, 1),
      u_seed: (c.seed % 97) * 0.37,
      u_bright: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_dark: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
      u_tint: [colours[6] ?? 0, colours[7] ?? 0, colours[8] ?? 0],
      u_temper: [colours[9] ?? 0, colours[10] ?? 0, colours[11] ?? 0],
    });
  };

  const draw = () => {
    const p = gpu;
    if (!p || p.lost || !visible.current || w < 1) return;
    p.program.set({
      u_twist: tw.x,
      u_fold: clamp(fo.x, -0.2, 1.2),
      u_light: [li.x, li.y],
      u_reveal: revealed,
      u_quench: [quenchX, quenchState.radius, quenchState.strength],
    });
    const { gl } = p;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const springStep = (
    sv: { x: number; v: number; target: number },
    k: Spring,
    dt: number,
  ) => {
    const n = Math.max(1, Math.ceil(dt / STEP));
    const hh = dt / n;
    for (let i = 0; i < n; i += 1) {
      sv.v +=
        ((k.stiffness * (sv.target - sv.x) - k.damping * sv.v) / k.mass) * hh;
      sv.x += sv.v * hh;
    }
    if (Math.abs(sv.target - sv.x) < 0.0005 && Math.abs(sv.v) < 0.002) {
      sv.x = sv.target;
      sv.v = 0;
      return false;
    }
    return true;
  };

  const step = (dt: number, now: number): boolean => {
    let moving = false;
    if (!holding) {
      if (springStep(tw, spring, dt)) moving = true;
      if (springStep(fo, spring, dt)) moving = true;
    }
    // The light rides glide's constants in both axes.
    const k = springs.glide;
    const n = Math.max(1, Math.ceil(dt / STEP));
    const hh = dt / n;
    for (let i = 0; i < n; i += 1) {
      li.vx +=
        ((k.stiffness * (li.tx - li.x) - k.damping * li.vx) / k.mass) * hh;
      li.vy +=
        ((k.stiffness * (li.ty - li.y) - k.damping * li.vy) / k.mass) * hh;
      li.x += li.vx * hh;
      li.y += li.vy * hh;
    }
    if (
      Math.abs(li.tx - li.x) < 0.1 &&
      Math.abs(li.ty - li.y) < 0.1 &&
      Math.abs(li.vx) + Math.abs(li.vy) < 0.5
    ) {
      li.x = li.tx;
      li.y = li.ty;
      li.vx = 0;
      li.vy = 0;
    } else moving = true;
    if (revealAt >= 0) {
      const t = clamp((now - revealAt) / REVEAL_MS, 0, 1);
      // Fast arrival, soft landing: the acid bites quickly, then slows.
      revealed = 1 - Math.pow(1 - t, 3);
      if (t >= 1) revealAt = -1;
      else moving = true;
    }
    if (quenchAt >= 0) {
      const t = clamp((now - quenchAt) / QUENCH_MS, 0, 1);
      quenchState = {
        radius: t * (rect.x1 - rect.x0) * 1.05,
        strength: (1 - t) * (1 - t),
      };
      if (t >= 1) {
        quenchAt = -1;
        quenchState = { radius: 0, strength: 0 };
      } else moving = true;
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !gpu || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt, now);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: everything is where it is asked to be, at once. */
  const place = () => {
    tw.x = tw.target;
    tw.v = 0;
    fo.x = fo.target;
    fo.v = 0;
    li.x = li.tx;
    li.y = li.ty;
    li.vx = 0;
    li.vy = 0;
    revealAt = -1;
    revealed = 1;
    quenchAt = -1;
    quenchState = { radius: 0, strength: 0 };
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
      const el = kids[i];
      if (el) rgb(getComputedStyle(el).color, colours, i * 3);
    }
    statics();
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const nw = canvas.clientWidth;
    const nh = canvas.clientHeight;
    if (nw < 1 || nh < 1) return;
    w = nw;
    h = nh;
    rect = barRect(w, h);
    if (li.home) {
      homeLight();
      li.x = li.tx;
      li.y = li.ty;
    }
    resizeGL(p.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
    statics();
    draw();
    kick();
  };

  const start = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  let detach: () => void = () => {};

  const beginReveal = () => {
    const c = cfg;
    if (!c || revealed >= 1 || revealAt >= 0) return;
    if (!c.motionSafe || c.reveal === "none") {
      revealed = 1;
      return;
    }
    revealAt = performance.now();
    // The starting twist winds in behind the acid.
    spring = springs.drift;
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!start()) {
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
            if (!disposed && start()) kick();
          },
        );
        if (next.reveal === "none" || !next.motionSafe) revealed = 1;
        else if (next.reveal === "mount") beginReveal();
        if (!next.motionSafe) place();
        draw();
        kick();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey) readColours();
      statics();
      if (!next.motionSafe) place();
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    seen(inView) {
      if (!inView || !cfg) return;
      if (cfg.reveal === "inView") beginReveal();
      if (!cfg.motionSafe) place();
      draw();
      kick();
    },
    wake() {
      draw();
      kick();
    },
    springTo(twist, fold, velocity, kind) {
      holding = false;
      tw.target = twist;
      fo.target = fold;
      if (velocity) {
        tw.v = velocity.twist;
        fo.v = velocity.fold;
      }
      spring =
        kind === "snap"
          ? springs.snap
          : kind === "drift"
            ? springs.drift
            : springs.glide;
      if (cfg && !cfg.motionSafe) place();
      kick();
    },
    place(twist, fold) {
      tw.x = tw.target = twist;
      fo.x = fo.target = fold;
      tw.v = 0;
      fo.v = 0;
    },
    hold(twist, fold) {
      holding = true;
      tw.x = twist;
      fo.x = fold;
      tw.v = 0;
      fo.v = 0;
      if (cfg && !cfg.motionSafe) {
        tw.target = twist;
        fo.target = fold;
      }
      draw();
      kick();
    },
    light(x, y) {
      if (x === null || y === null) {
        li.home = true;
        homeLight();
      } else {
        li.home = false;
        li.tx = x;
        li.ty = y;
      }
      if (cfg && !cfg.motionSafe) {
        li.x = li.tx;
        li.y = li.ty;
        draw();
      }
      kick();
    },
    quench(x) {
      quenchX = x;
      if (cfg?.motionSafe) quenchAt = performance.now();
      kick();
    },
    values: () => ({ twist: tw.x, fold: fo.x }),
    bar: () => ({ x0: rect.x0, x1: rect.x1, y0: rect.y0, y1: rect.y1 }),
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };
}

export type FoldedSteelPattern =
  "straight" | "waves" | "ladder" | "twist" | "rose";

/** The name a smith would give the pattern a twist and a fold make. */
export function foldedSteelPattern(
  twist: number,
  fold: number,
): FoldedSteelPattern {
  const t = Math.abs(twist);
  if (t < 0.15 && fold < 0.08) return "straight";
  if (t < 0.15) return fold < 0.45 ? "waves" : "ladder";
  if (t > 1.6 || (t > 0.6 && fold > 0.45)) return "rose";
  return "twist";
}

const describe = (twist: number, fold: number) =>
  `Twisted ${Math.abs(twist).toFixed(2)} turns${twist < 0 ? " anticlockwise" : ""}, folded ${Math.round(fold * 100)}%, ${foldedSteelPattern(twist, fold)} pattern`;

/**
 * A polished bar of pattern-welded steel drawn per pixel in WebGL2. Each pixel
 * works out which layer of the billet it was ground from: the billet is
 * twisted about its long axis, so its layers come up as chevrons and, twisted
 * hard, as roses; a fold presses them into waves that deepen into ladder
 * rungs; a hand-forged wobble keeps every layer a little uneven. Etch sinks the
 * dark layers with a matte grain and a hairline of relief at every boundary,
 * and a cool brushed sheen follows the pointer on the glide spring.
 *
 * Drag across the bar to twist it and up or down to fold it, 1:1; a release
 * projects the throw and glides there. A double click (or Enter) quenches it:
 * a temper flash runs out from the strike and the layers relax straight on
 * the drift spring. The first time it is seen the etch comes up along it.
 * It is a `role="slider"` for the twist; ↑/↓ fold. Under reduced motion every
 * change lands at once, with no sweep and no flash. Without WebGL2 a still bar
 * stands in.
 */
export function FoldedSteel({
  twist,
  defaultTwist = 0.75,
  onTwistChange,
  fold,
  defaultFold = 0.2,
  onFoldChange,
  layers = 24,
  etch = 0.6,
  rungs = 7,
  sheen = 0.7,
  brightColor = "oklch(from var(--ink-3) 0.8 0.01 h)",
  darkColor = "oklch(from var(--ink-3) 0.29 0.016 h)",
  sheenColor = "oklch(from var(--accent) 0.97 0.025 h)",
  reveal = "inView",
  onQuench,
  interactive = true,
  label = "Pattern-welded steel bar",
  seed = 7,
  dpr = 2,
  disabled = false,
  className,
}: FoldedSteelProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const [ownTwist, setOwnTwist] = React.useState(() =>
    clamp(defaultTwist, -TWIST_MAX, TWIST_MAX),
  );
  const [ownFold, setOwnFold] = React.useState(() => clamp(defaultFold, 0, 1));
  const curTwist = snap05(clamp(twist ?? ownTwist, -TWIST_MAX, TWIST_MAX));
  const curFold = snap05(clamp(fold ?? ownFold, 0, 1));
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const shown = React.useRef({ twist: curTwist, fold: curFold });
  const grab = React.useRef({ twist: 0, fold: 0, w: 1, h: 1 });

  const config: Config = {
    layers,
    etch,
    rungs,
    sheen,
    reveal,
    seed,
    dpr,
    motionSafe,
    colorKey: `${brightColor}|${darkColor}|${sheenColor}`,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
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
    const first = latest.current;
    // The bar starts straight when its etch is still to come up, and winds
    // to its twist behind the acid; otherwise it is simply where it is.
    const waits = first.reveal !== "none" && first.motionSafe;
    e.place(waits ? 0 : shown.current.twist, waits ? 0 : shown.current.fold);
    e.configure(first);
    e.springTo(shown.current.twist, shown.current.fold, null, "drift");
    if (visible.current) e.seen(true);
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
    };
  }, []);

  // A host (or a tweak) that moves the values gets the same move a key would.
  React.useEffect(() => {
    const s = shown.current;
    if (s.twist === curTwist && s.fold === curFold) return;
    shown.current = { twist: curTwist, fold: curFold };
    engine.current?.springTo(curTwist, curFold, null, "snap");
  }, [curTwist, curFold]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        engine.current?.seen(visible.current);
      },
      { threshold: 0.3 },
    );
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /** Lands twist and fold and reports what changed, from the gesture or key that chose it. */
  const commit = (
    nextTwist: number,
    nextFold: number,
    velocity: { twist: number; fold: number } | null,
    kind: "glide" | "snap" | "drift",
  ) => {
    const t = snap05(clamp(nextTwist, -TWIST_MAX, TWIST_MAX));
    const f = snap05(clamp(nextFold, 0, 1));
    const landTwist = twist === undefined ? t : curTwist;
    const landFold = fold === undefined ? f : curFold;
    if (twist === undefined) setOwnTwist(t);
    if (fold === undefined) setOwnFold(f);
    shown.current = { twist: landTwist, fold: landFold };
    // Controlled values go back to where the host says; when it takes the
    // change, the effect above carries the bar on before a frame is drawn.
    engine.current?.springTo(landTwist, landFold, velocity, kind);
    if (t !== curTwist) onTwistChange?.(t);
    if (f !== curFold) onFoldChange?.(f);
  };

  const quench = (clientX: number | null) => {
    if (disabled) return;
    const e = engine.current;
    const root = rootRef.current;
    if (!e || !root) return;
    const b = e.bar();
    const x =
      clientX === null
        ? (b.x0 + b.x1) / 2
        : clientX - root.getBoundingClientRect().left;
    e.quench(clamp(x, b.x0, b.x1));
    commit(0, 0, null, "drift");
    onQuench?.();
    setSaid((s) => ({ n: s.n + 1, text: "Quenched: straight layers." }));
  };

  const drag = useDrag({
    threshold: 3,
    disabled: disabled || !interactive,
    onStart: () => {
      const e = engine.current;
      if (!e) return;
      const v = e.values();
      const b = e.bar();
      grab.current = {
        twist: v.twist,
        fold: v.fold,
        w: Math.max(40, b.x1 - b.x0),
        h: Math.max(20, b.y1 - b.y0),
      };
    },
    onMove: ({ offset }) => {
      const g = grab.current;
      const t = rubberClamp(
        g.twist + (offset.x / g.w) * TURNS_PER_LENGTH,
        -TWIST_MAX,
        TWIST_MAX,
        1,
      );
      const f = rubberClamp(g.fold + offset.y / (g.h * 1.6), 0, 1, 0.4);
      engine.current?.hold(r2(t * 1000) / 1000, r2(f * 1000) / 1000);
    },
    onEnd: ({ velocity }) => {
      const e = engine.current;
      if (!e) return;
      const g = grab.current;
      const v = e.values();
      const vt = (velocity.x / g.w) * TURNS_PER_LENGTH;
      const vf = velocity.y / (g.h * 1.6);
      commit(
        project(v.twist, vt, 0.993),
        project(v.fold, vf, 0.99),
        { twist: clamp(vt, -12, 12), fold: clamp(vf, -6, 6) },
        "glide",
      );
    },
    onCancel: () => engine.current?.springTo(curTwist, curFold, null, "glide"),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const from = shown.current;
    const big = event.shiftKey ? 4 : 1;
    let t = from.twist;
    let f = from.fold;
    switch (event.key) {
      case "ArrowRight":
        t += 0.25 * big;
        break;
      case "ArrowLeft":
        t -= 0.25 * big;
        break;
      case "ArrowUp":
        f += 0.1;
        break;
      case "ArrowDown":
        f -= 0.1;
        break;
      case "PageUp":
        t += 1;
        break;
      case "PageDown":
        t -= 1;
        break;
      case "Home":
        t = -TWIST_MAX;
        break;
      case "End":
        t = TWIST_MAX;
        break;
      case "Enter":
        event.preventDefault();
        quench(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    commit(t, f, null, "snap");
  };

  const n = clamp(Math.round(layers), 8, 64);
  const period = r2(200 / n);
  const etchPct = Math.round(clamp(etch, 0, 1) * 100);
  const stillDark = `color-mix(in oklab, ${darkColor} ${etchPct}%, ${brightColor})`;

  return (
    <div
      ref={bindRoot}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-describedby={`${uid}-hint`}
      aria-valuemin={TWIST_MIN}
      aria-valuemax={TWIST_MAX}
      aria-valuenow={curTwist}
      aria-valuetext={describe(curTwist, curFold)}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      onDoubleClick={(event) => quench(event.clientX)}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (!interactive || event.pointerType === "touch") return;
        const r = event.currentTarget.getBoundingClientRect();
        engine.current?.light(event.clientX - r.left, event.clientY - r.top);
      }}
      onPointerLeave={() => engine.current?.light(null, null)}
      className={cn(
        "group/folded-steel relative isolate h-36 w-full touch-none rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed"
          : interactive
            ? "cursor-grab active:cursor-grabbing"
            : "",
        className,
      )}
    >
      {/* The still: the server's frame, the first paint and the no-WebGL bar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-1/2 h-[calc(100%-30px)] max-h-30 -translate-y-1/2 overflow-hidden rounded-2 transition-opacity duration-300 group-data-live/folded-steel:opacity-0"
        style={{
          backgroundColor: brightColor,
          backgroundImage: [
            `linear-gradient(100deg, transparent 18%, color-mix(in oklab, ${sheenColor} 38%, transparent) 32%, transparent 48%)`,
            `linear-gradient(180deg, color-mix(in oklab, white 18%, transparent), transparent 30%, color-mix(in oklab, black 22%, transparent))`,
            `repeating-linear-gradient(180deg, ${brightColor} 0 ${r2(period * 0.44)}%, ${stillDark} ${r2(period * 0.44)}% ${period}%)`,
          ].join(", "),
          boxShadow:
            "0 4px 10px -6px color-mix(in oklab, black 45%, transparent)",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/folded-steel:opacity-100"
      />
      <span id={`${uid}-hint`} className="sr-only">
        Drag across the bar to twist it and up or down to fold it, or use the
        arrow keys. Double click or press Enter to quench it straight.
      </span>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden"
      >
        {[
          brightColor,
          darkColor,
          sheenColor,
          "oklch(from var(--accent) 0.74 0.11 h)",
        ].map((colour, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: colour }}
          />
        ))}
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
