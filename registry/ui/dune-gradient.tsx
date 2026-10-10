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
import { cascade, distances, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DunePalette = "amber" | "rose" | "sage" | "cobalt";

export type DuneGradientProps = {
  /** The content above the dunes: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many bands of dunes are stacked from the horizon down, 2 to 8. @default 5 */
  layers?: number;
  /** The colours, far to near: a preset, or your own list of 2 to 5 CSS colours. @default "amber" */
  palette?: DunePalette | readonly string[];
  /** How fast the dunes travel and reshape, 0 to 2; 0 holds them still. @default 1 */
  drift?: number;
  /** The air the far dunes fade into, as a CSS colour. @default "var(--background)" */
  haze?: string;
  /** How tall the dunes stand, 0 to 1. @default 0.5 */
  relief?: number;
  /** How brightly the light catches each crest, 0 to 1. @default 0.6 */
  crest?: number;
  /** How much sand grain sits over the colour, 0 to 1. @default 0.35 */
  grain?: number;
  /** How soft the edges between bands are, 0 (cut) to 1 (airbrushed). @default 0.35 */
  softness?: number;
  /** A press sends a gust that lifts sand off the crests. @default true */
  gust?: boolean;
  /** The landscape leans with the hand (and keyboard focus inside). @default true */
  interactive?: boolean;
  /** How far the layers lean with the hand, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Picks the landscape: the same seed lays the same dunes. @default 1 */
  seed?: number;
  /** Holds the dunes still; the hand still leans them. @default false */
  paused?: boolean;
  /** Lay the dunes back to front the first time the background is seen. @default true */
  intro?: boolean;
  /** The highest device pixel ratio the dunes render at, never above 2. @default 2 */
  dpr?: number;
  /** Fires when a press sends a gust across the crests. */
  onGust?: () => void;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
  /** Classes for the content layer above the dunes. */
  contentClassName?: string;
};

/**
 * Pigments at fixed lightness, far to near, each a little deeper and warmer
 * than the one behind it; the far ones dissolve into `haze`, which is the
 * page's own colour, so the landscape sits in either theme. Cobalt is built
 * from the theme's accent.
 */
const PALETTES: Record<DunePalette, readonly string[]> = {
  amber: [
    "oklch(0.86 0.06 80)",
    "oklch(0.76 0.11 62)",
    "oklch(0.62 0.13 45)",
    "oklch(0.46 0.11 35)",
  ],
  rose: [
    "oklch(0.86 0.04 30)",
    "oklch(0.74 0.08 18)",
    "oklch(0.6 0.1 0)",
    "oklch(0.45 0.09 340)",
  ],
  sage: [
    "oklch(0.88 0.035 115)",
    "oklch(0.76 0.06 130)",
    "oklch(0.62 0.07 150)",
    "oklch(0.46 0.06 170)",
  ],
  cobalt: [
    "color-mix(in oklab, var(--accent-bright) 30%, var(--background))",
    "color-mix(in oklab, var(--accent-bright) 62%, var(--background))",
    "var(--accent-bright)",
    "color-mix(in oklab, var(--accent) 72%, black)",
  ],
};

const MAX_LAYERS = 8;
const MAX_STOPS = 5;
/** Fixed sub-step for the springs, so a long frame never destabilises them. */
const STEP = 1 / 240;
const PIXEL_BUDGET = 2_400_000;
/** How long a gust lifts sand, in seconds. */
const GUST_LIFE = 1.6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The props a background leaves to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Rgb = readonly [number, number, number];
type SpringConfig = { stiffness: number; damping: number; mass: number };
type Axis = { x: number; v: number };

/** One semi-implicit Euler step of a spring toward `to`. */
function stepSpring(a: Axis, to: number, s: SpringConfig, dt: number) {
  const acc = (-s.stiffness * (a.x - to) - s.damping * a.v) / s.mass;
  a.v += acc * dt;
  a.x += a.v * dt;
}

/** Settles a spring that is within `eps` of its target and barely moving. */
function rest(a: Axis, to: number, eps: number): boolean {
  if (Math.abs(a.x - to) < eps && Math.abs(a.v) < eps * 8) {
    a.x = to;
    a.v = 0;
    return true;
  }
  return false;
}

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
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
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

type Lab = [number, number, number];

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055;

/** sRGB bytes to oklab, where mixes toward the page keep their hue. */
function toLab(rgb: Rgb): Lab {
  const r = toLinear(rgb[0] / 255);
  const g = toLinear(rgb[1] / 255);
  const b = toLinear(rgb[2] / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** oklab to sRGB in 0..1, written into `out` at `at`. */
function fromLab([L, A, B]: Lab, out: Float32Array, at: number) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  out[at] = clamp(
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    0,
    1,
  );
  out[at + 1] = clamp(
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    0,
    1,
  );
  out[at + 2] = clamp(
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    0,
    1,
  );
}

const mixLab = (a: Lab, b: Lab, t: number): Lab => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * The landscape, one fragment pass, composited back to front. Every length
 * is in CSS px, so a dune is the same size at any DPR. A ridge is a leaning
 * profile — a short steep lee face rising to a sharp crest, then a long
 * windward slope down to a rounded trough — plus a second harmonic whose
 * phase wanders and a slow noise on crest heights, so no two dunes match.
 * Each layer's colours (body, shade, light) are mixed on the CPU in oklab.
 */
const FRAGMENT = `
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_size;
uniform float u_dpr;
uniform float u_time;
uniform int u_layers;
uniform vec3 u_body[${MAX_LAYERS}];
uniform vec3 u_shade[${MAX_LAYERS}];
uniform vec3 u_lite[${MAX_LAYERS}];
uniform vec3 u_skyTop;
uniform vec3 u_skyLow;
uniform vec3 u_sand;
uniform float u_crest;
uniform float u_grain;
uniform float u_soft;
uniform float u_relief;
uniform vec2 u_par;
uniform float u_rise[${MAX_LAYERS}];
uniform vec4 u_gust;
uniform float u_still;
uniform float u_seed;

${GLSL_NOISE}

// 0 in the trough, 1 at the crest: a steep rise, a sharp top, a long fall.
float dune(float u) {
  float f = fract(u);
  float t = f < 0.3 ? f / 0.3 : (1.0 - f) / 0.7;
  return t * t * (1.6 - 0.6 * t);
}

// The ridge of layer i at x, in px from the top.
float ridgeAt(float fi, float k, float x) {
  float h1 = kx_hash(vec2(fi * 1.7, u_seed));
  float h2 = kx_hash(vec2(fi * 2.3 + 7.0, u_seed));
  float wl = mix(210.0, 470.0, k) * (0.85 + 0.3 * h2);
  float speed = mix(3.0, 15.0, k) * (0.8 + 0.4 * h1);
  float sx = x + u_time * speed + u_par.x * mix(3.0, 30.0, k) + h1 * 997.0;
  float u = sx / wl;
  float shape = 0.76 * dune(u) + 0.24 * dune(u * 2.13 + h2 + u_time * 0.03);
  float swell = 0.6 + 0.6 * kx_noise(vec2(u * 0.43, fi * 3.1 + u_seed));
  float amp = u_relief * mix(0.16, 0.34, k) * u_size.y * swell + 2.0;
  float base = mix(0.4, 0.94, k) * u_size.y + u_par.y * mix(1.0, 8.0, k);
  return base - amp * shape;
}

void main() {
  vec2 px = v_uv * u_size;
  float x = px.x;
  float y = px.y;
  float n = float(u_layers);

  vec3 col = mix(u_skyTop, u_skyLow, smoothstep(0.0, 0.62, v_uv.y));

  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    if (i >= u_layers) break;
    float fi = float(i);
    float k = n > 1.0 ? fi / (n - 1.0) : 1.0;
    float rise = u_rise[i];
    float lift = (1.0 - rise) * ${distances.shift}.0;
    float r = ridgeAt(fi, k, x) + lift;
    float dy = y - r;
    // The face's slope, read over a span that widens below the crest, so the
    // light is crisp along the ridge and blends softly down the face.
    float w = 1.5 + max(dy, 0.0) * 0.9;
    float slope = (ridgeAt(fi, k, x + w) - ridgeAt(fi, k, x - w)) / (2.0 * w);
    float soft = mix(0.5, 7.0, u_soft) * mix(1.25, 0.8, k);
    // Before the dunes are laid they wait faint and low: a designed first
    // frame, never a blank sky.
    float a = smoothstep(-soft, soft, dy) * (0.3 + 0.7 * rise);

    // The low sun is on the right, the side the wind comes from: windward
    // slopes (falling to the right) take the light, steep lee faces sit in
    // a cool shade, most strongly just under the crest.
    float band = mix(0.12, 0.26, k) * u_size.y;
    float near = exp(-max(dy, 0.0) / (band * 0.55));
    float sunlit = smoothstep(-0.02, 0.22, slope);
    float lee = smoothstep(0.02, -0.4, slope);
    vec3 c = u_body[i];
    c = mix(c, u_shade[i], lee * 0.8 * near + smoothstep(0.0, band * 1.4, dy) * 0.3);
    c = mix(c, u_lite[i], sunlit * 0.16 * near);
    float hl = exp(-max(dy, 0.0) / (1.2 + 2.4 * u_soft)) * u_crest;
    // The gust's front brightens each crest as it passes over it.
    float gdist = length(vec2(x - u_gust.x, (r - u_gust.y) * 0.6));
    float gfront = u_gust.z * 540.0;
    float flare = u_gust.w * (1.0 - u_still) * exp(-pow((gdist - gfront) / 70.0, 2.0));
    hl = min(1.0, hl * (1.0 + 2.2 * flare) + flare * 0.5 * exp(-max(dy, 0.0) / 6.0));
    c = mix(c, u_lite[i], hl * (0.25 + 0.55 * sunlit));
    col = mix(col, c, a);

    // Spindrift: sand torn off the crests, streaming downwind over the lee
    // faces in soft wisps, inside the gust's front as it runs outward.
    if (u_gust.w > 0.002) {
      float above = -dy;
      float age = u_gust.z;
      float front = mix(gfront, 1e5, u_still);
      float reach = smoothstep(front, front - 180.0, gdist);
      float leeSide = smoothstep(0.02, -0.25, (ridgeAt(fi, k, x + 2.0) - r) / 2.0);
      float plume = exp(-max(above, 0.0) / (6.0 + 12.0 * k)) * smoothstep(-1.5, 2.5, above);
      float blow = mix(age * 150.0, 0.0, u_still);
      float climb = mix(age * 9.0, 0.0, u_still);
      float wisp = kx_noise(vec2((x + blow) * 0.028, (above - climb) * 0.11 + fi * 4.3));
      wisp *= kx_noise(vec2((x + blow) * 0.07 + 3.0, (above - climb) * 0.2 + fi));
      float sand = reach * plume * leeSide * smoothstep(0.1, 0.42, wisp) * u_gust.w * rise;
      col = mix(col, u_sand, clamp(sand, 0.0, 1.0) * 0.85);
    }
  }

  vec2 g = floor(gl_FragCoord.xy / u_dpr);
  col += (kx_hash(g + u_seed * 13.0) - 0.5) * u_grain * 0.09;
  outColor = vec4(col, 1.0);
}
`;

type Api = {
  refresh: () => void;
  recolor: () => void;
  local: (clientX: number, clientY: number) => { x: number; y: number };
  aim: (x: number, y: number, source: "pointer" | "focus") => void;
  away: (source: "pointer" | "focus" | null) => void;
  blow: (x: number, y: number) => void;
};

/**
 * A background of colour laid in drifting dunes: soft-edged bands stacked
 * from the horizon down, each a leaning ridge with a long windward slope and
 * a short lee face, lit from a low sun on the left with a fine highlight on
 * every crest and a little sand grain over everything. Far bands dissolve
 * into the page colour, near ones carry the palette's deepest tone, and each
 * travels sideways at its own pace while its shape slowly changes.
 *
 * The hand leans the landscape — the layers part by depth on the drift
 * spring, near ones most — and a press sends a gust from the finger: a front
 * runs outward and lifts sand off every crest it crosses, streaming
 * downwind. The first time it is seen the dunes are laid back to front, each
 * rising a few pixels into place on the glide spring. Keyboard focus on
 * content inside the background leans it toward the focused element.
 *
 * WebGL2, one fragment pass; it renders only while on screen, in a visible
 * page, and moving. Without WebGL2 (or after a lost context) a static
 * gradient of the same bands stands in. Under reduced motion the landscape
 * stands still and a gust is a haze along the crests that fades.
 */
export function DuneGradient({
  children,
  layers = 5,
  palette = "amber",
  drift = 1,
  haze = "var(--background)",
  relief = 0.5,
  crest = 0.6,
  grain = 0.35,
  softness = 0.35,
  gust = true,
  interactive = true,
  pointerStrength = 0.6,
  seed = 1,
  paused = false,
  intro = true,
  dpr = 2,
  onGust,
  className,
  contentClassName,
}: DuneGradientProps) {
  const motionSafe = useMotionSafe();
  const count = clamp(Math.round(layers), 2, MAX_LAYERS);
  const preset =
    typeof palette === "string"
      ? (PALETTES[palette] ?? PALETTES.amber)
      : palette;
  const stops = (preset.length >= 2 ? preset : PALETTES.amber).slice(
    0,
    MAX_STOPS,
  );
  // The carriers: the stops, then the haze.
  const carried = [...stops, haze];

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const api = React.useRef<Api | null>(null);

  const latest = React.useRef({
    count,
    drift,
    relief,
    crest,
    grain,
    softness,
    gust,
    interactive,
    pointerStrength,
    seed,
    paused,
    intro,
    dpr,
    motionSafe,
    stopCount: stops.length,
    onGust,
  });
  React.useEffect(() => {
    latest.current = {
      count,
      drift,
      relief,
      crest,
      grain,
      softness,
      gust,
      interactive,
      pointerStrength,
      seed,
      paused,
      intro,
      dpr,
      motionSafe,
      stopCount: stops.length,
      onGust,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    let gl: GLContext | null = null;
    let program: Program | null = null;
    let tri: FullscreenTriangle | null = null;
    let raf = 0;
    let last = 0;
    let visible = true;
    let dirty = true;
    let disposed = false;
    let size = { w: 0, h: 0, dpr: 1 };
    const L0 = latest.current;
    let time = ((Math.abs(L0.seed) * 0.6180339) % 1) * 40;
    let introState: "waiting" | "running" | "done" = "waiting";
    let introClock = 0;
    const startRise = L0.intro && L0.motionSafe ? 0 : 1;
    const rise: Axis[] = Array.from({ length: MAX_LAYERS }, () => ({
      x: startRise,
      v: 0,
    }));
    const riseOut = new Float32Array(MAX_LAYERS);
    const par = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, tx: 0, ty: 0 };
    let leaning: "pointer" | "focus" | null = null;
    const gustState = { x: 0, y: 0, age: 99, strength: 0 };
    const body = new Float32Array(MAX_LAYERS * 3);
    const shade = new Float32Array(MAX_LAYERS * 3);
    const lite = new Float32Array(MAX_LAYERS * 3);
    const skyTop = new Float32Array(3);
    const skyLow = new Float32Array(3);
    const sand = new Float32Array(3);
    let stopLabs: Lab[] = [];
    let hazeLab: Lab = [0, 0, 0];
    const read = rgbReader();

    /** Each layer's body, shade and light, from the stops and the haze. */
    const layOut = () => {
      const n = latest.current.count;
      const labs = stopLabs.length ? stopLabs : [hazeLab];
      const first = labs[0] ?? hazeLab;
      // The sky low down glows with the warmer second stop; far dunes take
      // that colour, as distant things take the colour of the air.
      const horizon = mixLab(hazeLab, labs[1] ?? first, 0.5);
      for (let i = 0; i < MAX_LAYERS; i += 1) {
        const k = n > 1 ? Math.min(1, i / (n - 1)) : 1;
        const f = k * (labs.length - 1);
        const j = Math.floor(f);
        const a = labs[j] ?? hazeLab;
        const b = labs[Math.min(labs.length - 1, j + 1)] ?? a;
        const pigment = mixLab(a, b, f - j);
        const tone = mixLab(pigment, horizon, (1 - k) * 0.55);
        const dark: Lab = [
          tone[0] * 0.78,
          tone[1] * 0.85,
          tone[2] * 0.7 - 0.012,
        ];
        const light: Lab = [
          tone[0] + (1 - tone[0]) * 0.42,
          tone[1] * 0.75,
          tone[2] * 0.8 + 0.006,
        ];
        fromLab(tone, body, i * 3);
        fromLab(dark, shade, i * 3);
        fromLab(light, lite, i * 3);
      }
      fromLab(mixLab(hazeLab, first, 0.1), skyTop, 0);
      fromLab(horizon, skyLow, 0);
      fromLab(
        [first[0] + (1 - first[0]) * 0.5, first[1] * 0.6, first[2] * 0.6],
        sand,
        0,
      );
    };

    const recolor = () => {
      const nodes = carrierRefs.current;
      const n = latest.current.stopCount;
      const labs: Lab[] = [];
      for (let i = 0; i < n; i += 1) {
        const node = nodes[i];
        if (node) labs.push(toLab(read(getComputedStyle(node).color)));
      }
      stopLabs = labs;
      const hazeNode = nodes[n];
      if (hazeNode) hazeLab = toLab(read(getComputedStyle(hazeNode).color));
      layOut();
    };

    const init = (): boolean => {
      gl = createGL(canvas, { alpha: false, antialias: false });
      if (!gl || gl.isContextLost()) return false;
      program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      tri = createFullscreenTriangle(gl, program);
      return true;
    };

    const release = () => {
      tri?.dispose();
      program?.dispose();
      tri = null;
      program = null;
    };

    const draw = () => {
      if (!gl || !program || !tri || gl.isContextLost()) return;
      if (!visible) {
        dirty = true;
        return;
      }
      dirty = false;
      const L = latest.current;
      for (let i = 0; i < MAX_LAYERS; i += 1)
        riseOut[i] = clamp(rise[i]?.x ?? 1, 0, 1.2);
      const strength = clamp(L.pointerStrength, 0, 1);
      const gustOn = gustState.strength * Math.exp(-gustState.age * 1.7);
      program.set({
        u_size: [size.w, size.h],
        u_dpr: size.dpr,
        u_time: time,
        u_layers: L.count,
        u_body: body,
        u_shade: shade,
        u_lite: lite,
        u_skyTop: skyTop,
        u_skyLow: skyLow,
        u_sand: sand,
        u_crest: clamp(L.crest, 0, 1),
        u_grain: clamp(L.grain, 0, 1),
        u_soft: clamp(L.softness, 0, 1),
        u_relief: clamp(L.relief, 0, 1),
        u_par: [par.x.x * strength, par.y.x * strength],
        u_rise: riseOut,
        u_gust: [gustState.x, gustState.y, gustState.age, gustOn],
        u_still: L.motionSafe ? 0 : 1,
        u_seed: (Math.abs(L.seed) % 97) * 1.37,
      });
      tri.draw();
      if (!root.hasAttribute("data-painted"))
        root.setAttribute("data-painted", "");
    };

    const resize = () => {
      if (!gl || gl.isContextLost()) return;
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 1 || h < 1) return;
      const cap = clamp(latest.current.dpr, 0.5, 2);
      const budget = Math.sqrt(PIXEL_BUDGET / (w * h));
      const result = resizeGL(gl, canvas, {
        dprCap: Math.min(cap, Math.max(0.5, budget)),
      });
      size = { w, h, dpr: result.width / w };
      draw();
    };

    const beginIntro = () => {
      const L = latest.current;
      if (L.intro && L.motionSafe && program) {
        introState = "running";
        introClock = 0;
        for (const r of rise) {
          r.x = 0;
          r.v = 0;
        }
      } else {
        introState = "done";
        for (const r of rise) {
          r.x = 1;
          r.v = 0;
        }
      }
    };

    /** Advances everything that moves; true while anything still does. */
    const advance = (dt: number): boolean => {
      const L = latest.current;
      let busy = false;
      if (!L.paused && L.drift > 0) {
        time += dt * clamp(L.drift, 0, 2);
        busy = true;
      }
      if (introState === "running") introClock += dt;
      // Back to front: each layer starts its rise one cascade step after
      // the one behind it.
      const stagger = cascade(L.count);
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(STEP, left);
        left -= h;
        stepSpring(par.x, par.tx, springs.drift, h);
        stepSpring(par.y, par.ty, springs.drift, h);
        if (introState === "running") {
          for (let i = 0; i < MAX_LAYERS; i += 1) {
            const r = rise[i];
            if (r && introClock >= i * stagger)
              stepSpring(r, 1, springs.glide, h);
          }
        }
      }
      if (!(rest(par.x, par.tx, 0.0015) && rest(par.y, par.ty, 0.0015)))
        busy = true;
      if (introState === "running") {
        let settled = true;
        for (const r of rise) if (!rest(r, 1, 0.002)) settled = false;
        if (settled) introState = "done";
        else busy = true;
      }
      if (gustState.age < GUST_LIFE) {
        gustState.age += dt;
        busy = true;
      }
      return busy;
    };

    /** Reduced motion: the dunes stand where they rest; a gust only fades. */
    const place = (dt: number): boolean => {
      par.x.x = 0;
      par.y.x = 0;
      par.x.v = 0;
      par.y.v = 0;
      for (const r of rise) {
        r.x = 1;
        r.v = 0;
      }
      introState = "done";
      if (gustState.age < GUST_LIFE) {
        gustState.age += dt;
        return true;
      }
      return false;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden || !program) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const busy = latest.current.motionSafe ? advance(dt) : place(dt);
      draw();
      if (busy) raf = window.requestAnimationFrame(frame);
      else last = 0;
    };

    const kick = () => {
      if (raf || disposed) return;
      if (!visible || document.hidden) {
        dirty = true;
        return;
      }
      raf = window.requestAnimationFrame(frame);
    };

    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    };

    recolor();
    if (init()) resize();
    else root.setAttribute("data-static", "");

    const detachLoss = onContextLoss(
      canvas,
      () => {
        stop();
        release();
        root.removeAttribute("data-painted");
        root.setAttribute("data-static", "");
      },
      () => {
        if (disposed) return;
        if (init()) {
          root.removeAttribute("data-static");
          resize();
          kick();
        }
      },
    );

    const sizer = new ResizeObserver(() => resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (!visible) return;
      if (introState === "waiting") beginIntro();
      if (dirty) draw();
      kick();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const local = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect();
      return {
        x: clientX - rect.left - root.clientLeft,
        y: clientY - rect.top - root.clientTop,
      };
    };

    api.current = {
      refresh: () => {
        layOut();
        resize();
        kick();
      },
      recolor: () => {
        recolor();
        draw();
      },
      local,
      aim: (x, y, source) => {
        if (size.w < 1 || size.h < 1) return;
        leaning = source;
        // The hand's place across the box, -1 to 1; the shader turns it
        // into a lean by depth.
        par.tx = clamp((x / size.w) * 2 - 1, -1, 1);
        par.ty = clamp((y / size.h) * 2 - 1, -1, 1);
        if (!latest.current.motionSafe) {
          par.tx = 0;
          par.ty = 0;
        }
        kick();
      },
      away: (source) => {
        if (source && leaning !== source) return;
        leaning = null;
        par.tx = 0;
        par.ty = 0;
        kick();
      },
      blow: (x, y) => {
        gustState.x = x;
        gustState.y = y;
        gustState.age = 0;
        gustState.strength = 1;
        latest.current.onGust?.();
        kick();
      },
    };

    return () => {
      disposed = true;
      stop();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      detachLoss();
      release();
      api.current = null;
    };
  }, []);

  // Everything but the colours is a uniform: a change draws the next frame.
  React.useEffect(() => {
    api.current?.refresh();
  }, [
    count,
    drift,
    relief,
    crest,
    grain,
    softness,
    pointerStrength,
    seed,
    paused,
    dpr,
    motionSafe,
  ]);

  // A hand that is switched off lets go.
  React.useEffect(() => {
    if (!interactive) api.current?.away(null);
  }, [interactive]);

  // A new theme or palette changes the carriers' colours; their 1 ms colour
  // transition says when, and the uniforms are read again from them. A
  // palette with a different number of stops re-reads at once.
  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current?.recolor();
    });
  };
  React.useEffect(() => {
    api.current?.recolor();
  }, [stops.length]);
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive || event.pointerType === "touch") return;
    const at = a.local(event.clientX, event.clientY);
    a.aim(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive || !gust) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // Pressing a button in the content is the button's business.
    if (hit && rootRef.current?.contains(hit)) return;
    const at = a.local(event.clientX, event.clientY);
    a.blow(at.x, at.y);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    api.current?.away("pointer");
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const a = api.current;
    const target = event.target;
    if (!a || !interactive || !(target instanceof Element)) return;
    if (!target.matches(":focus-visible")) return;
    const rect = target.getBoundingClientRect();
    const at = a.local(rect.left + rect.width / 2, rect.top + rect.height / 2);
    a.aim(at.x, at.y, "focus");
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    api.current?.away("focus");
  };

  // What stands in before the dunes are drawn, or for good without WebGL2:
  // the same bands as hard-edged stripes under a sky.
  const edges = Array.from({ length: count + 1 }, (_, i) =>
    i === count
      ? 100
      : Math.round((0.34 + (0.52 * i) / Math.max(1, count - 1)) * 100) - 6,
  );
  const bands = Array.from({ length: count }, (_, i) => {
    const k = count > 1 ? i / (count - 1) : 1;
    const stop =
      stops[Math.min(stops.length - 1, Math.round(k * (stops.length - 1)))];
    return `${stop} ${edges[i]}%, ${stop} ${edges[i + 1]}%`;
  });
  const standIn = `linear-gradient(180deg, color-mix(in oklab, ${haze} 84%, ${stops[0]}) 0%, color-mix(in oklab, ${stops[0]} 60%, ${haze}) ${edges[0]}%, ${bands.join(", ")})`;

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "group/dune-gradient relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{ backgroundImage: standIn }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-painted/dune-gradient:opacity-100"
        />
        {carried.map((colour, i) => (
          <span
            key={i}
            ref={(node) => {
              carrierRefs.current[i] = node;
            }}
            onTransitionEnd={onColors}
            className="absolute size-px opacity-0 transition-colors duration-1"
            style={{ color: colour }}
          />
        ))}
      </div>
      <div className={cn("relative z-10 size-full", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
