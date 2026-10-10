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
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DitherDunesMatrix = "bayer2" | "bayer4" | "bayer8" | "dots";
export type DitherDunesColors = "mono" | "riso" | "sienna" | "tide";

export type DitherDunesProps = {
  /** The content on top of the print: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The threshold pattern every dot is printed through: a 2×2, 4×4 or 8×8 ordered matrix, or a 45° halftone screen of round dots. @default "bayer4" */
  matrix?: DitherDunesMatrix;
  /** The size of one printed dot, in CSS px (snapped to whole device pixels), 1 to 8. @default 2 */
  scale?: number;
  /** A named set of inks, or two or three CSS colours of your own, paper first. @default "riso" */
  colors?: DitherDunesColors | readonly string[];
  /** The distance between dune crests, px, 60 to 600. @default 180 */
  size?: number;
  /** How strongly the slopes are shaded, 0 (flat tone) to 1 (deep relief). @default 0.7 */
  relief?: number;
  /** How far the crest lines bow, split and wander, 0 (straight ranks) to 1. @default 0.5 */
  morph?: number;
  /** How fast the dunes migrate and change shape, 0 (still) to 2. @default 0.5 */
  speed?: number;
  /** The way the wind blows the dunes, degrees: 0 toward the right, 90 down. @default 12 */
  wind?: number;
  /** The pointer and keyboard focus brighten a soft spot, and a press flashes a ring of light. @default true */
  interactive?: boolean;
  /** How bright the spot under the hand is and how strong the flash, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the spot of light reaches, px. @default 120 */
  radius?: number;
  /** Hold the dunes still; the spot and the flash still answer the hand. @default false */
  paused?: boolean;
  /** Seeds the dune field, so two prints never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) lighting the print. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press or keyboard focus pulls a flash across the print. */
  onFlash?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Inks, paper first. Paper is the page leaning toward a tint; every ink is a
 * pigment pulled a fifth of the way toward the page's own ink, so it darkens
 * on a light sheet and lifts on a dark one. Mixes are in oklab, which keeps
 * the hue when a colour is leaned toward black or white.
 */
const INKS: Record<DitherDunesColors, readonly string[]> = {
  mono: [
    "color-mix(in oklab, var(--background) 95%, var(--foreground))",
    "color-mix(in oklab, var(--foreground) 86%, var(--background))",
  ],
  riso: [
    "color-mix(in oklab, var(--background) 90%, oklch(0.86 0.06 82))",
    "color-mix(in oklab, oklch(from var(--accent) 0.5 0.17 h) 82%, var(--foreground))",
    "oklch(0.72 0.17 6)",
  ],
  sienna: [
    "color-mix(in oklab, var(--background) 90%, oklch(0.86 0.07 70))",
    "color-mix(in oklab, oklch(0.47 0.12 38) 82%, var(--foreground))",
    "oklch(0.8 0.12 80)",
  ],
  tide: [
    "color-mix(in oklab, var(--background) 90%, oklch(0.88 0.04 200))",
    "color-mix(in oklab, oklch(0.45 0.09 232) 82%, var(--foreground))",
    "oklch(0.8 0.08 178)",
  ],
};

const MATRIX: Record<DitherDunesMatrix, number> = {
  dots: 0,
  bayer2: 1,
  bayer4: 2,
  bayer8: 3,
};

const STEP = 1 / 120;
/** The spot's place follows on glide; its presence on drift; the swell after a flash on recoil. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const RECOIL = springs.recoil;
/** A flash's ring travels this fast, px/s, and fades with this time constant, s. */
const FLASH_SPEED = 520;
const FLASH_FADE = 0.45;
/** The composed moment the reduced-motion print is drawn at. */
const STILL_TIME = 41;

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

type Rgb = [number, number, number];

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/*
 * One fragment per printed dot: the canvas is the dot grid itself, scaled up
 * by the browser with nearest-neighbour sampling, so a dot is always a whole
 * number of device pixels and the shader never evaluates the same dot twice.
 */
const FRAGMENT = `
uniform vec2 u_grid;
uniform float u_cellPx;
uniform int u_matrix;
uniform int u_layers;
uniform float u_lightSheet;
uniform vec3 u_paper;
uniform vec3 u_ink;
uniform vec3 u_spot;
uniform float u_time;
uniform float u_size;
uniform float u_relief;
uniform float u_morph;
uniform vec2 u_wind;
uniform vec2 u_seed;
uniform vec2 u_box;
uniform vec3 u_hand;
uniform float u_radius;
uniform vec4 u_flash;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

// A transverse dune in profile: a long gentle windward slope up to a sharp
// brink, then a short steep slip face down the lee.
float ridge(float s) {
  float f = fract(s);
  if (f < 0.72) {
    float a = f / 0.72;
    return mix(a, a * a * (3.0 - 2.0 * a), 0.55);
  }
  float b = (f - 0.72) / 0.28;
  return 1.0 - mix(b, b * b * (3.0 - 2.0 * b), 0.4);
}

float height(vec2 p) {
  vec2 nrm = vec2(-u_wind.y, u_wind.x);
  float u = dot(p, u_wind);
  float v = dot(p, nrm);
  float t = u_time;
  float S = u_size;
  // The crests bow and wander across the wind; the bends evolve, so ranks
  // split and rejoin as the field migrates downwind.
  float bend = u_morph * S * (
    0.34 * sin(v / (S * 0.3) + t * 0.23 + u_seed.x) +
    0.15 * sin(v / (S * 0.13) - t * 0.17 + u_seed.y + u / (S * 2.6)) +
    0.9 * (kx_noise(vec2(v / (S * 0.42) + u_seed.y, u / (S * 1.9) + t * 0.05)) - 0.5)
  );
  float s = (u + bend) / S - t * 0.045;
  // Large soft shapes: the dunes swell in some places and die away into
  // flat pans in others.
  float field = kx_noise(p / (S * 3.6) + u_seed * 0.37 + vec2(t * 0.011, -t * 0.007));
  float amp = mix(0.08, 1.0, smoothstep(0.25, 0.75, field));
  return ridge(s) * amp * S * 0.16;
}

float bayer(ivec2 c, int bits) {
  int x = c.x & 7;
  int y = c.y & 7;
  int xy = x ^ y;
  int v;
  if (bits == 1) {
    v = ((xy & 1) << 1) | (y & 1);
    return (float(v) + 0.5) / 4.0;
  }
  if (bits == 2) {
    v = ((xy & 1) << 3) | ((y & 1) << 2) | (xy & 2) | ((y & 2) >> 1);
    return (float(v) + 0.5) / 16.0;
  }
  v = ((xy & 1) << 5) | ((y & 1) << 4) | ((xy & 2) << 2) | ((y & 2) << 1) | ((xy & 4) >> 1) | ((y & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}

// The threshold a dot is printed against: an ordered matrix, or a 45 degree
// halftone screen whose round dots grow from their centres, with a whisper
// of the 4x4 matrix to break ties between cells at the same distance.
float threshold(vec2 cell) {
  if (u_matrix == 0) {
    vec2 q = vec2(cell.x + cell.y, cell.x - cell.y) / 7.0;
    float d = length(fract(q) - 0.5) / 0.7071;
    return clamp((1.0 - d) * 0.94 + bayer(ivec2(cell), 2) * 0.06, 0.01, 0.99);
  }
  return bayer(ivec2(cell), u_matrix);
}

void main() {
  vec2 cell = vec2(floor(gl_FragCoord.x), u_grid.y - 1.0 - floor(gl_FragCoord.y));
  vec2 p = (cell + 0.5) * u_cellPx;
  float e = max(1.0, u_cellPx);
  float h0 = height(p);
  float hx = height(p + vec2(e, 0.0));
  float hy = height(p + vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - h0) / e, -(hy - h0) / e, 1.0));
  vec3 l = normalize(vec3(-0.62, -0.5, 0.6));
  float S = u_size;
  float t = u_time;

  // The key plate: light on the dunes. A light sheet rests mostly paper,
  // a dark one mostly unlit, so the hero reads calm in either theme.
  float light = mix(0.13, 0.8, u_lightSheet) + (dot(n, l) - l.z) * u_relief * 2.6;
  float pools = kx_noise(p / (S * 2.9) + u_seed.yx * 0.53 - vec2(t * 0.006, t * 0.009)) - 0.5;
  light += pools * (u_layers > 1 ? 0.16 : 0.42);
  light += 0.08 * (0.5 - p.y / max(1.0, u_box.y));
  vec2 toHand = p - u_hand.xy;
  float lamp = exp(-dot(toHand, toHand) / (u_radius * u_radius)) * u_hand.z;
  light += lamp * 0.8;
  light = clamp(light, 0.0, 1.0);
  // A dark sheet holds its light back a little more, so the hero stays dark.
  float keyCover = mix(pow(light, 1.5), 1.0 - light, u_lightSheet);

  // The spot plate: large soft shapes of the second ink drifting under the
  // dunes, screened on a shifted grid so its dots sit between the key's.
  float spotCover = 0.0;
  if (u_layers > 1) {
    float blob = kx_noise(p / (S * 3.3) + u_seed * 0.71 + vec2(-t * 0.013, t * 0.008));
    float blob2 = kx_noise(p / (S * 1.7) - u_seed * 0.29 + vec2(t * 0.009, t * 0.012));
    spotCover = mix(0.3, 0.5, u_lightSheet) * smoothstep(0.42, 0.88, blob * 0.75 + blob2 * 0.35);
    spotCover *= 1.0 - u_lightSheet * min(1.0, lamp * 1.6);
  }

  // The flash: a band that prints the plates in negative as it passes, so
  // every dot it crosses flips, whatever the tone underneath.
  if (u_flash.w > 0.001) {
    float ring = (length(p - u_flash.xy) - u_flash.z) / 16.0;
    float flip = min(1.0, u_flash.w * exp(-ring * ring));
    keyCover = mix(keyCover, 1.0 - keyCover, flip);
    spotCover *= 1.0 - flip;
  }

  vec3 col = u_paper;
  if (spotCover > threshold(vec2(cell.y + 3.0, cell.x + 4.0))) col = u_spot;
  if (keyCover > threshold(cell)) col = u_ink;
  outColor = vec4(col, 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  matrix: DitherDunesMatrix;
  scale: number;
  paletteKey: string;
  size: number;
  relief: number;
  morph: number;
  speed: number;
  wind: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onFlash: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  flash: (x: number, y: number, strength: number) => void;
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
  let holdTimer: number | null = null;
  const read = rgbReader();
  const inks = new Float32Array(9);
  let layers = 2;
  let lightSheet = 1;
  const size = { w: 0, h: 0, dpr: 1, cell: 2, cols: 0, rows: 0 };
  const sim = { t: 0, swell: 0, swellV: 0 };
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
  const flare = { x: 0, y: 0, age: 0, strength: 0, live: false, held: 0 };

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

  /** The uniforms that change only with the props, the size or the theme. */
  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.cols < 1) return;
    const { program } = p;
    const rand = lcg(c.seed * 17 + 3);
    const angle = (clamp(c.wind, -360, 360) * Math.PI) / 180;
    program.set({
      u_grid: [size.cols, size.rows],
      u_cellPx: size.cell / size.dpr,
      u_matrix: MATRIX[c.matrix] ?? 2,
      u_layers: layers,
      u_lightSheet: lightSheet,
      u_paper: [inks[0] ?? 0, inks[1] ?? 0, inks[2] ?? 0],
      u_ink: [inks[3] ?? 0, inks[4] ?? 0, inks[5] ?? 0],
      u_spot: [inks[6] ?? 0, inks[7] ?? 0, inks[8] ?? 0],
      u_size: clamp(c.size, 60, 600),
      u_relief: clamp(c.relief, 0, 1),
      u_morph: clamp(c.morph, 0, 1),
      u_wind: [Math.cos(angle), Math.sin(angle)],
      u_seed: [rand() * 40, rand() * 40],
      u_box: [size.w, size.h],
      u_radius: clamp(
        c.radius,
        16,
        Math.max(16, Math.min(size.w, size.h) * 0.6),
      ),
    });
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.cols < 1) return;
    const { gl, program } = p;
    const strength = clamp(c.pointerStrength, 0, 1);
    const still = !c.motionSafe;
    const amount = still
      ? hand.present
        ? strength * (1 + flare.held * 0.6)
        : 0
      : hand.amount * (1 + sim.swell);
    const fading = flare.live
      ? flare.strength * Math.exp(-flare.age / FLASH_FADE)
      : 0;
    program.set({
      u_time: still ? STILL_TIME : sim.t,
      u_hand: [hand.px, hand.py, amount],
      u_flash: [flare.x, flare.y, flare.age * FLASH_SPEED, fading],
    });
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the drift, the hand, the swell and the flash. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
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
      sim.swellV +=
        ((-RECOIL.stiffness * sim.swell - RECOIL.damping * sim.swellV) /
          RECOIL.mass) *
        h;
      sim.swell += sim.swellV * h;
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
    const swelling = Math.abs(sim.swell) > 0.002 || Math.abs(sim.swellV) > 0.02;
    if (!swelling) {
      sim.swell = 0;
      sim.swellV = 0;
    }
    if (flare.live) {
      flare.age += dt;
      const reach = Math.hypot(size.w, size.h) + 60;
      if (
        flare.strength * Math.exp(-flare.age / FLASH_FADE) < 0.01 ||
        flare.age * FLASH_SPEED > reach
      ) {
        flare.live = false;
      }
    }
    return (
      moving ||
      (handMoving && hand.amount > 0.001) ||
      arriving ||
      swelling ||
      flare.live
    );
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Drifting alone, the dunes move slowly enough for thirty frames a
    // second; the hand and a flash get every frame.
    const calm =
      !hand.present &&
      hand.amount === 0 &&
      !flare.live &&
      sim.swell === 0 &&
      sim.swellV === 0;
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

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const found: Rgb[] = [];
    for (let i = 0; i < kids.length && i < 3; i += 1) {
      const el = kids[i];
      if (el) found.push(read(getComputedStyle(el).color));
    }
    const paper = found[0] ?? [1, 1, 1];
    const ink = found[1] ?? [0, 0, 0];
    // The paper decides the theme. On a light sheet the light is paper
    // showing through, so the key ink prints the shade; on a dark sheet the
    // light is the ink itself, so it prints the light — a negative, and the
    // light is still light.
    lightSheet = luma(paper) > luma(ink) ? 1 : 0;
    layers = found.length >= 3 ? 2 : 1;
    inks.set([...paper, ...ink, ...(found[2] ?? ink)]);
    statics();
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    const cell = Math.max(1, Math.round(clamp(c.scale, 1, 8) * dpr));
    const cols = Math.ceil((w * dpr) / cell);
    const rows = Math.ceil((h * dpr) / cell);
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    size.cell = cell;
    size.cols = cols;
    size.rows = rows;
    if (canvas.width !== cols) canvas.width = cols;
    if (canvas.height !== rows) canvas.height = rows;
    // The canvas is exactly the dot grid, a whole number of device pixels
    // per dot; the box clips the last partial row and column.
    canvas.style.width = `${(cols * cell) / dpr}px`;
    canvas.style.height = `${(rows * cell) / dpr}px`;
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
      if (was.dpr !== next.dpr || was.scale !== next.scale) resize();
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
        hand.amount = hand.present ? clamp(next.pointerStrength, 0, 1) : 0;
        sim.swell = 0;
        sim.swellV = 0;
        flare.live = false;
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
        // Reduced motion: the spot lands exactly where the hand is.
        hand.px = x;
        hand.py = y;
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
        hand.amount = 0;
        draw();
        return;
      }
      kick();
    },
    flash(x, y, strength) {
      const c = cfg;
      if (!c || !c.interactive) return;
      const s = clamp(c.pointerStrength, 0, 1) * strength;
      c.onFlash();
      if (!c.motionSafe) {
        // A ring cannot travel here: the spot brightens for a moment and
        // lets go, two still frames.
        flare.held = s;
        draw();
        if (holdTimer !== null) window.clearTimeout(holdTimer);
        holdTimer = window.setTimeout(() => {
          holdTimer = null;
          flare.held = 0;
          draw();
        }, 600);
        return;
      }
      flare.x = x;
      flare.y = y;
      flare.age = 0;
      flare.strength = 0.6 + s * 0.7;
      flare.live = true;
      // The spot swells as the light leaves it, two small bounces on recoil.
      sim.swellV += 9 * s;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      holdTimer = null;
      detach();
      release();
    },
  };
}

/**
 * A background printed like a one-bit risograph sheet: an aerial view of a
 * dune sea whose soft gradients are drawn entirely in two or three flat inks
 * through an ordered dither, with the content on top in its own layer. The
 * dunes are transverse ridges with a long lit windward slope, a sharp brink
 * and a dark slip face; their crests bow, split and rejoin as the field
 * migrates downwind, and large soft shapes swell some dunes and smooth
 * others into flat pans. The key ink prints the relief; a third colour, when
 * given, is a spot plate of large soft shapes drifting under it, screened on
 * a shifted grid as a second drum would print it. Each dot is a whole number
 * of device pixels, through a 2×2, 4×4 or 8×8 ordered matrix or a 45°
 * halftone screen.
 *
 * The pointer is a lamp held over the print: a soft spot brightens under it,
 * its place following on glide and its presence on drift. A press pulls a
 * flash — a ring of light flipping dots as it crosses the sheet — and the
 * spot swells after it on recoil. Keyboard focus on a control inside brings
 * the lamp there with a softer flash. On a dark sheet the key ink prints the
 * light instead of the shade, a negative, so the light is still light.
 * WebGL2, one fragment per dot, thirty frames a second while it only drifts,
 * only on screen in a visible page. Without WebGL2 a CSS print stands in;
 * under reduced motion one still print is drawn and the spot lands exactly
 * where the hand is.
 */
export function DitherDunes({
  children,
  matrix = "bayer4",
  scale = 2,
  colors = "riso",
  size = 180,
  relief = 0.7,
  morph = 0.5,
  speed = 0.5,
  wind = 12,
  interactive = true,
  pointerStrength = 0.6,
  radius = 120,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onFlash,
  className,
}: DitherDunesProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(() => {
    if (typeof colors === "string") return INKS[colors] ?? INKS.riso;
    const list = colors.filter((c) => typeof c === "string" && c.length > 0);
    return list.length >= 2 ? list.slice(0, 3) : INKS.riso;
  }, [colors]);
  const paletteKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onFlash });

  const config: Config = {
    matrix,
    scale,
    paletteKey,
    size,
    relief,
    morph,
    speed,
    wind,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onFlash: () => report.current.onFlash?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onFlash };
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
    if (!hit || !rootRef.current?.contains(hit)) {
      engine.current?.flash(at.x, at.y, 1);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is the lamp held over that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.flash(at.x, at.y, 0.6);
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
        // A sideways drag carries the lamp on touch; an upright one scrolls.
        "group/dither-dunes relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{ backgroundColor: paints[0] }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 size-full [image-rendering:pixelated]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/dither-dunes:opacity-0"
      >
        <StandIn paints={paints} scale={scale} wind={wind} size={size} />
      </div>
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
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still print for the server render, the first paint and any
 * browser without WebGL2: the paper, a wash of the spot ink, and a dot screen
 * of the ink masked into soft dune bands across the wind.
 */
function StandIn({
  paints,
  scale,
  wind,
  size,
}: {
  paints: readonly string[];
  scale: number;
  wind: number;
  size: number;
}) {
  const [paper, ink, spot] = paints;
  const pitch = Math.max(2, Math.round(clamp(scale, 1, 8) * 2));
  const dot = Math.round(pitch * 0.36 * 100) / 100;
  const band = Math.round(clamp(size, 60, 600));
  const across = Math.round(90 + clamp(wind, -360, 360));
  const mask = `repeating-linear-gradient(${across}deg, rgba(0, 0, 0, 0.15) 0, rgba(0, 0, 0, 0.7) ${Math.round(band * 0.7)}px, rgba(0, 0, 0, 0.95) ${Math.round(band * 0.74)}px, rgba(0, 0, 0, 0.15) ${band}px)`;
  return (
    <div className="absolute inset-0" style={{ backgroundColor: paper }}>
      {spot ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(ellipse 60% 80% at 72% 30%, color-mix(in oklab, ${spot} 55%, transparent), transparent 70%)`,
          }}
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle, ${ink} ${dot}px, transparent ${Math.round((dot + 0.6) * 100) / 100}px)`,
          backgroundSize: `${pitch}px ${pitch}px`,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
    </div>
  );
}
