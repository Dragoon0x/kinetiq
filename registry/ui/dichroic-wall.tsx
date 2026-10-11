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

export type DichroicWallFilm = "prism" | "lagoon" | "orchid" | "frost";

export type DichroicWallProps = {
  /** Content on top of the glass: a headline, a caption card, a call to action. */
  children?: React.ReactNode;
  /** How many tiles fit the wall's shorter side, 3 to 12: fewer rows make larger tiles. @default 5 */
  tiles?: number;
  /** How far a tile's colour swings as the angle you see it from changes, 0 (barely) to 1 (through a whole cycle). @default 0.6 */
  shift?: number;
  /** The grout between tiles, px, 0 to 12. @default 3 */
  gap?: number;
  /** A tile's corner radius, px. @default 3 */
  radius?: number;
  /** How far each tile is set off square in its bed, 0 (a perfect grid) to 1 (visibly hand-laid). @default 0.4 */
  askew?: number;
  /** The coating: a mixed prism, teal and amber, orchid and green, or a pale frost. @default "prism" */
  film?: DichroicWallFilm;
  /** How much light comes through the glass rather than off it, 0 to 1: high shows the transmitted colours, low their complements. @default 0.6 */
  backlight?: number;
  /** How fast a change of angle travels across the wall, in tiles per second. @default 12 */
  waveSpeed?: number;
  /** How bright a click's flash is, 0 (no flash) to 1 (full white). @default 0.85 */
  flash?: number;
  /** The pointer and the keys move where you stand; off, the wall holds its view. @default true */
  interactive?: boolean;
  /** On first sight the eye crosses the wall once, so a wave of colour runs over it. @default true */
  sweep?: boolean;
  /** With no pointer on it, the eye wanders slowly by itself (the wall never rests). @default false */
  drift?: boolean;
  /** Hold the wall still: nothing animates until it is unpaused. @default false */
  paused?: boolean;
  /** Seeds every tile's film, turn and tilt. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The accessible name of the wall's surface. @default "Dichroic glass wall" */
  label?: string;
  /** Fires when a click, Enter or Space flashes the wall. */
  onFlash?: () => void;
  /** No pointer, keys or flash; the wall rests at its centre view. @default false */
  disabled?: boolean;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/* -------------------------------- constants ------------------------------- */

/**
 * The film's optical thickness in µm (centre, and its spread across the
 * wall), and how much colour the pigment carries. Only the hue comes from the
 * interference; lightness and chroma are held, so the wall reads as glass in
 * a room, never as a test pattern.
 */
const FILMS: Record<
  DichroicWallFilm,
  { t: number; spread: number; chroma: number }
> = {
  prism: { t: 0.46, spread: 0.14, chroma: 0.13 },
  lagoon: { t: 0.455, spread: 0.05, chroma: 0.11 },
  orchid: { t: 0.66, spread: 0.05, chroma: 0.12 },
  frost: { t: 0.095, spread: 0.03, chroma: 0.045 },
};

/** The CSS still's colour sweep per film: fixed pigments, so server and client agree. */
const STILL: Record<DichroicWallFilm, readonly string[]> = {
  prism: [
    "oklch(0.78 0.11 300)",
    "oklch(0.86 0.1 85)",
    "oklch(0.76 0.1 235)",
    "oklch(0.8 0.11 340)",
    "oklch(0.84 0.1 150)",
  ],
  lagoon: [
    "oklch(0.8 0.09 215)",
    "oklch(0.86 0.09 75)",
    "oklch(0.78 0.1 200)",
    "oklch(0.84 0.08 60)",
    "oklch(0.8 0.08 225)",
  ],
  orchid: [
    "oklch(0.76 0.11 330)",
    "oklch(0.86 0.1 140)",
    "oklch(0.74 0.12 310)",
    "oklch(0.84 0.09 125)",
    "oklch(0.78 0.1 345)",
  ],
  frost: [
    "oklch(0.9 0.03 230)",
    "oklch(0.92 0.035 80)",
    "oklch(0.88 0.035 250)",
    "oklch(0.93 0.03 95)",
    "oklch(0.9 0.03 220)",
  ],
};

/** Grout, the room the glass reflects, the light behind it, and the flash. */
const GROUT = "color-mix(in oklab, var(--foreground) 13%, var(--background))";
const ROOM = "color-mix(in oklab, var(--background) 42%, white)";
const BACKLIGHT =
  "color-mix(in oklab, oklch(0.97 0.012 85) 90%, var(--background))";
const WHITE = "oklch(0.995 0.004 95)";

/** Eye positions kept for the travelling wave. */
const HISTORY = 48;
/** The flash's white ring crosses this many tiles a second. */
const FLASH_TILES = 46;
/** A flashed tile fades from white over this time constant, s. */
const FLASH_FADE = 0.16;
/** Arrow keys move the eye this fraction of the wall; Shift doubles it. */
const KEY_STEP = 0.125;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

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

/** Content a press belongs to, never the glass. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/* --------------------------------- shader -------------------------------- */

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_scale;
uniform vec2 u_origin;
uniform float u_pitch;
uniform float u_half;
uniform float u_round;
uniform uint u_seed;
uniform float u_askew;
uniform vec3 u_film;
uniform float u_amp;
uniform float u_n;
uniform float u_back;
uniform float u_eyeH;
uniform vec2 u_hist[${HISTORY}];
uniform float u_histDt;
uniform float u_histAge;
uniform float u_waveV;
uniform vec4 u_flash;
uniform float u_flashV;
uniform vec3 u_grout;
uniform vec3 u_room;
uniform vec3 u_light;
uniform vec3 u_white;
in vec2 v_uv;
out vec4 outColor;

// An integer hash, so every GPU lays the same wall for the same seed.
uvec4 pcg4(uvec4 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}

vec4 rand4(ivec2 c) {
  uvec4 h = pcg4(uvec4(uint(c.x + 8192), uint(c.y + 8192), u_seed, 2654435761u));
  return vec4(h) / 4294967295.0;
}

// Value noise over the tile grid, so neighbouring tiles carry related films.
float cellNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 k = f * f * (3.0 - 2.0 * f);
  float a = rand4(ivec2(i) + ivec2(4000, 0)).x;
  float b = rand4(ivec2(i) + ivec2(4001, 0)).x;
  float c = rand4(ivec2(i) + ivec2(4000, 1)).x;
  float d = rand4(ivec2(i) + ivec2(4001, 1)).x;
  return mix(mix(a, b, k.x), mix(c, d, k.x), k.y);
}

vec3 toLab(vec3 c) {
  float l = pow(max(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b, 0.0), 1.0 / 3.0);
  float m = pow(max(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b, 0.0), 1.0 / 3.0);
  float s = pow(max(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}

vec3 fromLab(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// The hue of a spectrum, laid down as a pigment of the given lightness and
// chroma (oklab), in display sRGB.
vec3 pigment(vec3 spectrum, float L, float C) {
  vec3 lab = toLab(spectrum);
  float c = length(lab.yz);
  vec2 dir = c > 1e-4 ? lab.yz / c : vec2(0.0);
  return toSrgb(fromLab(vec3(L, dir * min(C, c * 1.8))));
}

float box(vec2 p, float hs, float r) {
  vec2 q = abs(p) - vec2(hs - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec2 turn(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
}

// Where the eye stood tau seconds ago: the newest sample is now, the rest
// were written every u_histDt.
vec2 eyeAt(float tau) {
  if (tau <= u_histAge) {
    return mix(u_hist[0], u_hist[1], u_histAge > 0.0 ? tau / u_histAge : 0.0);
  }
  float j = min((tau - u_histAge) / u_histDt + 1.0, float(${HISTORY - 1}));
  int i0 = int(floor(j));
  int i1 = min(i0 + 1, ${HISTORY - 1});
  return mix(u_hist[i0], u_hist[i1], fract(j));
}

// Reflectance of a thin film at three wavelengths a channel, averaged, so
// the colours are the soft ones a real coating gives, not three spikes.
vec3 filmR(float t, float cosT) {
  float opd = 6.2831853 * 2.0 * t * cosT;
  vec3 r = cos(opd / vec3(0.60, 0.64, 0.68));
  vec3 g = cos(opd / vec3(0.50, 0.535, 0.57));
  vec3 b = cos(opd / vec3(0.43, 0.46, 0.49));
  vec3 third = vec3(1.0 / 3.0);
  return 0.5 - 0.5 * vec3(dot(r, third), dot(g, third), dot(b, third));
}

struct Tile { vec2 centre; float rot; vec2 tilt; float t; float tone; };

Tile tileAt(ivec2 c) {
  vec4 r = rand4(c);
  Tile tl;
  vec2 jitter = (vec2(fract(r.x * 13.7), fract(r.w * 7.9)) - 0.5) * 1.4 * u_askew;
  tl.centre = u_origin + (vec2(c) + 0.5) * u_pitch + jitter;
  tl.rot = (r.y - 0.5) * 0.15 * u_askew;
  tl.tilt = (r.zw - 0.5) * 0.42 * u_askew;
  float field = cellNoise((vec2(c) + vec2(float(u_seed % 97u))) * 0.21);
  tl.t = u_film.x + (field - 0.5) * u_film.y + (r.x - 0.5) * u_film.y * 0.22;
  tl.tone = (r.w - 0.5) * 0.06;
  return tl;
}

// The glass at point p of a tile: the colour that comes through it, a band
// of the room reflected in its complement that slides as you move, the glint
// of the light above, and a shimmer while the wave of change passes.
vec3 glassAt(Tile tl, vec2 p, vec2 local, out vec3 through) {
  float tau = length(tl.centre - u_hist[0]) / u_waveV;
  vec2 seen = eyeAt(tau);
  vec3 eye = vec3(seen, u_eyeH);
  vec3 V = normalize(eye - vec3(p, 0.0));
  vec3 N = normalize(vec3(tl.tilt, 1.0));
  float cosV = clamp(dot(V, N), 0.0, 1.0);
  float sinV = sqrt(max(0.0, 1.0 - cosV * cosV));
  float s = min(0.985, sinV * u_amp);
  float cosT = sqrt(max(0.0, 1.0 - (s * s) / (u_n * u_n)));
  vec3 R = filmR(tl.t, cosT);
  // On a dark page the glass glows a little less, so it never glares.
  float dark = 1.0 - smoothstep(0.2, 0.7, dot(u_grout, vec3(0.2126, 0.7152, 0.0722)));
  float lum = mix(0.68, 0.83, u_back) - dark * 0.03 + tl.tone;
  through = pigment(1.0 - R, lum, u_film.z) * u_light;
  vec3 col = through;
  float fres = pow(1.0 - cosV, 2.0);
  vec2 q = local / max(u_half, 1.0);
  float band = dot(q, vec2(0.8575, 0.5145)) * 0.8 + V.x * 2.6 + V.y * 1.4 + tl.tilt.x * 5.0;
  float sheen = exp(-band * band / 0.5) * (0.22 + 0.6 * (1.0 - u_back)) * (0.5 + 1.4 * fres);
  vec3 bounce = pigment(R, min(0.94, lum + 0.12), u_film.z * 0.75) * u_room;
  col = mix(col, bounce, clamp(sheen, 0.0, 0.7));
  vec3 L = normalize(vec3(-0.45, -0.7, 0.9));
  vec3 H = normalize(L + V);
  float glint = pow(max(dot(N, H), 0.0), 90.0);
  float surge = length(seen - eyeAt(tau + 0.06)) / max(1.0, u_pitch * 0.9);
  return mix(col, u_white, glint * 0.55 + clamp(surge, 0.0, 1.0) * 0.16);
}

void main() {
  vec2 px = v_uv * u_size;
  ivec2 c = ivec2(floor((px - u_origin) / u_pitch));
  float aa = 0.75 / u_scale;

  Tile tl = tileAt(c);
  vec2 local = turn(px - tl.centre, tl.rot);
  float d = box(local, u_half, u_round);
  float inside = 1.0 - smoothstep(-aa, aa, d);

  vec3 through;
  vec3 glass = glassAt(tl, px, local, through);
  // A fine bevel: the edge toward the light catches it, the far edge darkens.
  vec2 edgeN = abs(local.x) > abs(local.y) ? vec2(sign(local.x), 0.0) : vec2(0.0, sign(local.y));
  float rim = 1.0 - smoothstep(0.0, 2.4, -d);
  float facing = dot(edgeN, vec2(-0.7071, -0.7071));
  glass = mix(glass, u_white, rim * max(facing, 0.0) * 0.45);
  glass = mix(glass, glass * 0.72, rim * max(-facing, 0.0) * 0.5);
  glass *= 0.97 + 0.05 * clamp(-local.y / u_half, -1.0, 1.0);

  // Grout picks up the coloured light of the tiles around it.
  vec3 grout = u_grout;
  if (d > -aa) {
    vec3 spill = vec3(0.0);
    float weight = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        Tile n = tileAt(c + ivec2(x, y));
        vec2 nl = turn(px - n.centre, n.rot);
        float nd = max(box(nl, u_half, u_round), 0.0);
        float w = exp(-nd / max(1.0, u_pitch * 0.14));
        vec3 nThrough;
        glassAt(n, n.centre, vec2(0.0), nThrough);
        spill += nThrough * w;
        weight += w;
      }
    }
    if (weight > 0.0) {
      grout = mix(grout, spill / weight, clamp(weight, 0.0, 1.0) * 0.32 * u_back);
    }
  }

  // The flash: a white ring leaves the click and every tile it passes blooms.
  float fd = length(tl.centre - u_flash.xy);
  float fa = u_flash.z - fd / u_flashV;
  float fl = fa >= 0.0 ? u_flash.w * exp(-fa / ${FLASH_FADE.toFixed(2)}) : 0.0;
  glass = mix(glass, u_white, fl);
  grout = mix(grout, u_white, fl * 0.55);

  outColor = vec4(mix(grout, glass, inside), 1.0);
}
`;

/* --------------------------------- engine -------------------------------- */

type Config = {
  tiles: number;
  gap: number;
  radius: number;
  askew: number;
  shift: number;
  film: DichroicWallFilm;
  backlight: number;
  waveSpeed: number;
  flash: number;
  interactive: boolean;
  sweep: boolean;
  drift: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  disabled: boolean;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Layout = { w: number; h: number; pitch: number; ox: number; oy: number };

type Source = "pointer" | "key" | "focus" | "sweep" | null;

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  seen: () => void;
  eyeTo: (x: number, y: number, source: Exclude<Source, null>) => void;
  nudge: (dx: number, dy: number) => { x: number; y: number } | null;
  home: () => boolean;
  away: (source: Exclude<Source, null>) => void;
  flashAt: (x: number, y: number | null) => void;
  eye: () => { x: number; y: number; w: number; h: number } | null;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  still: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let size: Layout | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let failed = false;
  let swept = false;
  let clock = 0;
  const read = rgbReader();
  /** Grout, room, backlight, white — RGB 0–1. */
  const colours = new Float32Array(12);
  const hist = new Float32Array(HISTORY * 2);
  let histDt = 1 / 30;
  let histAge = 0;
  let histUniform = true;
  const eye = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  let source: Source = null;
  let spring: { stiffness: number; damping: number; mass: number } =
    springs.glide;
  const flash = { x: 0, y: 0, age: 0, strength: 0, on: false, reach: 0 };
  /** The still's hue turn when there is no WebGL, deg. */
  let hue = 0;

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

  const fillHistory = (x: number, y: number) => {
    for (let i = 0; i < HISTORY; i += 1) {
      hist[i * 2] = x;
      hist[i * 2 + 1] = y;
    }
    histAge = 0;
    histUniform = true;
  };

  const layout = (): boolean => {
    const c = cfg;
    if (!c) return false;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return false;
    const rows = clamp(Math.round(c.tiles), 3, 12);
    const pitch = Math.max(8, Math.min(w, h) / rows);
    // One tile sits dead centre, so the cut at every edge is even.
    const kx = Math.ceil((w / 2 - pitch / 2) / pitch);
    const ky = Math.ceil((h / 2 - pitch / 2) / pitch);
    const first = !size;
    const was = size;
    size = {
      w,
      h,
      pitch,
      ox: w / 2 - pitch / 2 - kx * pitch,
      oy: h / 2 - pitch / 2 - ky * pitch,
    };
    // The wave's memory spans the longest trip across the wall.
    const tilesPerSecond = clamp(c.waveSpeed, 2, 80);
    const span = Math.hypot(w, h) / (pitch * tilesPerSecond);
    histDt = clamp(span / (HISTORY - 2), 1 / 60, 0.12);
    still.style.setProperty("--dichroic-pitch", `${r2(pitch)}px`);
    if (first) {
      const startLeft = c.sweep && c.motionSafe && !c.paused && !swept;
      eye.x = startLeft ? w * 0.06 : w / 2;
      eye.y = startLeft ? h * 0.68 : h / 2;
      eye.tx = w / 2;
      eye.ty = h / 2;
      fillHistory(eye.x, eye.y);
    } else if (was && (was.w !== w || was.h !== h)) {
      // A new box keeps the eye at the same place relative to the wall.
      const sx = w / was.w;
      const sy = h / was.h;
      eye.x *= sx;
      eye.y *= sy;
      eye.tx *= sx;
      eye.ty *= sy;
      for (let i = 0; i < HISTORY; i += 1) {
        hist[i * 2] = (hist[i * 2] ?? 0) * sx;
        hist[i * 2 + 1] = (hist[i * 2 + 1] ?? 0) * sy;
      }
    }
    return true;
  };

  const statics = () => {
    const c = cfg;
    const s = size;
    const p = gpu;
    if (!c || !s || !p || p.lost) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const film = FILMS[c.film] ?? FILMS.prism;
    const gap = clamp(c.gap, 0, Math.min(12, s.pitch * 0.3));
    const askew = clamp(c.askew, 0, 1);
    // Turned tiles need room in their bed: the half-size shrinks so the
    // corners of the most-turned one still clear its neighbours.
    const turnRoom = 1 + 0.075 * askew;
    const half = Math.max(2, (s.pitch - gap) / 2 / turnRoom - 0.7 * askew);
    const shift = clamp(c.shift, 0, 1);
    program.use();
    gl.uniform2f(u.u_size ?? null, s.w, s.h);
    gl.uniform1f(u.u_scale ?? null, canvas.width / Math.max(1, s.w));
    gl.uniform2f(u.u_origin ?? null, s.ox, s.oy);
    gl.uniform1f(u.u_pitch ?? null, s.pitch);
    gl.uniform1f(u.u_half ?? null, half);
    gl.uniform1f(u.u_round ?? null, clamp(c.radius, 0, half));
    gl.uniform1ui(u.u_seed ?? null, (Math.round(c.seed) * 2654435761) >>> 0);
    gl.uniform1f(u.u_askew ?? null, askew);
    gl.uniform3f(u.u_film ?? null, film.t, film.spread, film.chroma);
    gl.uniform1f(u.u_amp ?? null, 0.3 + 1.7 * shift);
    gl.uniform1f(u.u_n ?? null, 2.2 - 1.05 * shift);
    gl.uniform1f(u.u_back ?? null, clamp(c.backlight, 0, 1));
    gl.uniform1f(u.u_eyeH ?? null, Math.max(s.w, s.h) * 0.85);
    gl.uniform1f(u.u_histDt ?? null, histDt);
    // Reduced motion: the change arrives everywhere at once.
    gl.uniform1f(
      u.u_waveV ?? null,
      c.motionSafe ? clamp(c.waveSpeed, 2, 80) * s.pitch : 1e9,
    );
    gl.uniform1f(
      u.u_flashV ?? null,
      c.motionSafe ? FLASH_TILES * s.pitch : 1e9,
    );
    gl.uniform3f(
      u.u_grout ?? null,
      colours[0] ?? 0,
      colours[1] ?? 0,
      colours[2] ?? 0,
    );
    gl.uniform3f(
      u.u_room ?? null,
      colours[3] ?? 1,
      colours[4] ?? 1,
      colours[5] ?? 1,
    );
    gl.uniform3f(
      u.u_light ?? null,
      colours[6] ?? 1,
      colours[7] ?? 1,
      colours[8] ?? 1,
    );
    gl.uniform3f(
      u.u_white ?? null,
      colours[9] ?? 1,
      colours[10] ?? 1,
      colours[11] ?? 1,
    );
  };

  const draw = () => {
    const s = size;
    const p = gpu;
    if (!s || !p || p.lost || !visible.current) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    hist[0] = eye.x;
    hist[1] = eye.y;
    gl.uniform2fv(u.u_hist ?? null, hist);
    gl.uniform1f(u.u_histAge ?? null, Math.max(histAge, 1e-4));
    gl.uniform4f(
      u.u_flash ?? null,
      flash.x,
      flash.y,
      flash.on ? flash.age : -1,
      flash.on ? flash.strength : 0,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Moves the eye, its memory and the flash on by dt. Returns whether anything still changes. */
  const step = (dt: number): boolean => {
    const c = cfg;
    const s = size;
    if (!c || !s) return false;
    clock += dt;
    let moving = false;

    const wandering =
      c.drift && c.motionSafe && !c.paused && source === null && !c.disabled;
    if (wandering) {
      eye.tx = s.w * (0.5 + 0.34 * Math.sin(clock * 0.23));
      eye.ty = s.h * (0.5 + 0.28 * Math.sin(clock * 0.31 + 1.3));
      moving = true;
    }

    if (c.motionSafe) {
      const { stiffness, damping, mass } = spring;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        eye.vx +=
          ((-stiffness * (eye.x - eye.tx) - damping * eye.vx) / mass) * h;
        eye.vy +=
          ((-stiffness * (eye.y - eye.ty) - damping * eye.vy) / mass) * h;
        eye.x += eye.vx * h;
        eye.y += eye.vy * h;
      }
    } else {
      // Reduced motion: a short cross-fade of colour, no travel.
      const k = 1 - Math.exp(-dt / 0.06);
      eye.x += (eye.tx - eye.x) * k;
      eye.y += (eye.ty - eye.y) * k;
      eye.vx = 0;
      eye.vy = 0;
    }
    const settled =
      Math.abs(eye.x - eye.tx) < 0.05 &&
      Math.abs(eye.y - eye.ty) < 0.05 &&
      Math.abs(eye.vx) < 0.5 &&
      Math.abs(eye.vy) < 0.5;
    if (settled) {
      eye.x = eye.tx;
      eye.y = eye.ty;
      eye.vx = 0;
      eye.vy = 0;
      if (source === "sweep") source = null;
    } else moving = true;

    // The memory: one sample every histDt, newest first.
    histAge += dt;
    while (histAge >= histDt) {
      histAge -= histDt;
      hist.copyWithin(4, 2, HISTORY * 2 - 2);
      hist[2] = eye.x;
      hist[3] = eye.y;
    }
    if (!histUniform || !settled) {
      let spread = 0;
      for (let i = 1; i < HISTORY; i += 1) {
        spread = Math.max(
          spread,
          Math.abs((hist[i * 2] ?? 0) - eye.x),
          Math.abs((hist[i * 2 + 1] ?? 0) - eye.y),
        );
      }
      histUniform = spread < 0.25;
      if (histUniform && settled) fillHistory(eye.x, eye.y);
      else moving = true;
    }

    if (flash.on) {
      flash.age += dt;
      if (flash.age > flash.reach) flash.on = false;
      else moving = true;
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !gpu || gpu.lost) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = cfg?.paused ? false : step(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!gpu || gpu.lost || !size || cfg?.paused) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < Math.min(kids.length, 4); i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    statics();
  };

  const resize = () => {
    if (!cfg) return;
    if (!layout()) return;
    if (!gpu || gpu.lost) return;
    resizeGL(gpu.gl, canvas, { dprCap: clamp(cfg.dpr, 0.5, 2) });
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

  const engine: Engine = {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) {
        layout();
        return;
      }
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2: the CSS still stays and turns its hue with the eye.
          failed = true;
          root.setAttribute("data-fallback", "");
          layout();
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
      if (was.tiles !== next.tiles || was.dpr !== next.dpr) resize();
      else if (was.waveSpeed !== next.waveSpeed) layout();
      if (was.motionSafe !== next.motionSafe && !next.motionSafe && size) {
        // Reduced motion: no sweep, no wave in flight.
        if (source === "sweep") source = null;
        eye.tx = size.w / 2;
        eye.ty = size.h / 2;
        eye.x = eye.tx;
        eye.y = eye.ty;
        fillHistory(eye.x, eye.y);
      }
      if (next.disabled && size) {
        source = null;
        eye.tx = size.w / 2;
        eye.ty = size.h / 2;
      }
      statics();
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
    seen() {
      const c = cfg;
      const s = size;
      if (!c || !s || swept) return;
      swept = true;
      if (!c.sweep || !c.motionSafe || c.paused || source !== null) return;
      source = "sweep";
      spring = springs.drift;
      eye.tx = s.w / 2;
      eye.ty = s.h / 2;
      kick();
    },
    eyeTo(x, y, from) {
      const s = size;
      if (!s) return;
      source = from;
      swept = true;
      spring = springs.glide;
      eye.tx = clamp(x, 0, s.w);
      eye.ty = clamp(y, 0, s.h);
      if (failed) fallbackHue();
      kick();
    },
    nudge(dx, dy) {
      const s = size;
      if (!s) return null;
      source = "key";
      swept = true;
      spring = springs.glide;
      eye.tx = clamp(eye.tx + dx * s.w, 0, s.w);
      eye.ty = clamp(eye.ty + dy * s.h, 0, s.h);
      if (failed) fallbackHue();
      kick();
      return { x: eye.tx / s.w, y: eye.ty / s.h };
    },
    home() {
      const s = size;
      if (!s) return false;
      const away =
        Math.abs(eye.tx - s.w / 2) > 0.5 || Math.abs(eye.ty - s.h / 2) > 0.5;
      source = null;
      spring = springs.drift;
      eye.tx = s.w / 2;
      eye.ty = s.h / 2;
      if (failed) fallbackHue();
      kick();
      return away;
    },
    away(from) {
      const s = size;
      if (!s || source !== from) return;
      source = null;
      // Let go of the wall: the eye drifts back to stand square to it.
      spring = springs.drift;
      eye.tx = s.w / 2;
      eye.ty = s.h / 2;
      if (failed) fallbackHue();
      kick();
    },
    flashAt(x, y) {
      const c = cfg;
      const s = size;
      if (!c || !s || c.flash <= 0) return;
      flash.x = y === null ? eye.x : x;
      flash.y = y === null ? eye.y : y;
      flash.age = 0;
      flash.strength = clamp(c.flash, 0, 1) * (c.motionSafe ? 1 : 0.75);
      flash.on = true;
      const far = Math.max(
        Math.hypot(flash.x, flash.y),
        Math.hypot(s.w - flash.x, flash.y),
        Math.hypot(flash.x, s.h - flash.y),
        Math.hypot(s.w - flash.x, s.h - flash.y),
      );
      flash.reach =
        (c.motionSafe ? far / (FLASH_TILES * s.pitch) : 0) + FLASH_FADE * 6;
      if (failed || !gpu || gpu.lost) {
        const turn = `hue-rotate(${hue}deg)`;
        still.animate(
          [
            { filter: `${turn} brightness(1.9)` },
            { filter: `${turn} brightness(1)` },
          ],
          { duration: c.motionSafe ? 420 : 240, easing: "ease-out" },
        );
      }
      kick();
    },
    eye() {
      const s = size;
      return s ? { x: eye.tx, y: eye.ty, w: s.w, h: s.h } : null;
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };

  /** Without WebGL the still turns its hue with the eye: one filter on one layer. */
  function fallbackHue() {
    const c = cfg;
    const s = size;
    if (!c || !s) return;
    const shift = clamp(c.shift, 0, 1);
    hue = Math.round(
      ((eye.tx / s.w - 0.5) * 140 + (eye.ty / s.h - 0.5) * 70) * shift,
    );
    still.style.setProperty("--dichroic-hue", `${hue}deg`);
  }

  return engine;
}

/* -------------------------------- component ------------------------------ */

/** Where the eye stands, in words: fine enough that every step is heard. */
const where = (x: number, y: number) => {
  const v = y < 0.4 ? "upper " : y > 0.6 ? "lower " : "";
  const h =
    x < 0.2
      ? "far left"
      : x < 0.42
        ? "left"
        : x > 0.8
          ? "far right"
          : x > 0.58
            ? "right"
            : "";
  if (!v && !h) return "the centre";
  return `the ${v}${h || "middle"}`;
};

/**
 * A wall of dichroic glass tiles: each tile is a thin interference film on
 * glass that passes one colour and reflects its complement, and which colours
 * depends on the angle you see it from. The pointer is where you stand: tiles
 * in front of you are seen straight on, those further off at a growing angle,
 * so the colours slide as you move — and not all at once, because each tile
 * reads where you stood a moment ago in proportion to its distance, so a
 * change rolls across the wall as a wave. Tiles are set slightly askew, each
 * turned and tilted a few degrees, so neighbours never quite match.
 *
 * A click, Enter or Space flashes the wall white for a beat, a ring of light
 * leaving the click. Arrow keys move the eye from a full-surface button under
 * the content, Escape stands you back square. Drawn in one WebGL2 pass; the
 * loop runs only while something moves, on screen, in a visible page. Without
 * WebGL2 a CSS still of the glass turns its hue as you move. Under reduced
 * motion the colours still follow you, but they change everywhere at once and
 * the flash is a short, even brightening.
 */
export function DichroicWall({
  children,
  tiles = 5,
  shift = 0.6,
  gap = 3,
  radius = 3,
  askew = 0.4,
  film = "prism",
  backlight = 0.6,
  waveSpeed = 12,
  flash = 0.85,
  interactive = true,
  sweep = true,
  drift = false,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Dichroic glass wall",
  onFlash,
  disabled = false,
  className,
}: DichroicWallProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const enabled = interactive && !disabled;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const stillRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const [said, setSaid] = React.useState({ text: "", n: 0 });

  const config: Config = {
    tiles,
    gap,
    radius,
    askew,
    shift,
    film,
    backlight,
    waveSpeed,
    flash,
    interactive: enabled,
    sweep,
    drift,
    paused,
    seed,
    dpr,
    motionSafe,
    disabled,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
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
    const still = stillRef.current;
    if (!root || !canvas || !carriers || !still) return;
    const e = createEngine(root, canvas, carriers, still, visible);
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
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (visible.current) {
          engine.current?.wake();
          // Well in view (or a tall wall showing a good stretch): sweep now.
          const shown =
            (entry?.intersectionRatio ?? 0) > 0.35 ||
            (entry?.intersectionRect.height ?? 0) >= 160;
          if (shown) engine.current?.seen();
        }
      },
      { threshold: [0, 0.1, 0.35] },
    );
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

  const say = (text: string) => setSaid((s) => ({ text, n: s.n + 1 }));

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.eyeTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.pointerType !== "touch") return;
    const at = local(event.clientX, event.clientY);
    engine.current?.eyeTo(at.x, at.y, "pointer");
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.away("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.away("pointer");
  };

  // Keyboard focus on a control inside the content: you stand in front of it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const el = event.target;
    if (!(el instanceof HTMLElement) || el.hasAttribute("data-dichroic")) {
      return;
    }
    if (!el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.eyeTo(at.x, at.y, "focus");
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.away("focus");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!enabled) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const k = KEY_STEP * (event.shiftKey ? 2 : 1);
      const at = engine.current?.nudge(move[0] * k, move[1] * k * 1.6);
      if (at && !event.repeat) say(`Viewing from ${where(at.x, at.y)}.`);
      return;
    }
    if (event.key === "Escape") {
      if (engine.current?.home()) {
        event.preventDefault();
        say("Viewing from the centre.");
      }
    }
  };

  // A press anywhere on the glass flashes it — through any content on top
  // that is not itself a control. The surface button's own click (keys,
  // assistive technology) is handled on the button.
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!enabled || event.detail === 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("[data-dichroic]")) return;
    const hit = target.closest(INTERACTIVE);
    if (hit && rootRef.current?.contains(hit)) return;
    const at = local(event.clientX, event.clientY);
    flashed(at.x, at.y);
  };

  const flashed = (x: number, y: number | null) => {
    if (flash <= 0) return;
    engine.current?.flashAt(x, y);
    onFlash?.();
  };

  const filmStops = STILL[film] ?? STILL.prism;
  const rows = clamp(Math.round(tiles), 3, 12);
  const gapPx = clamp(gap, 0, 12);

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
      onClick={onClick}
      className={cn(
        "group/dichroic-wall relative isolate h-full w-full overflow-clip",
        enabled ? "cursor-crosshair touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <div
        ref={stillRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,filter] duration-300 group-data-live/dichroic-wall:opacity-0"
        style={stillStyle(filmStops, rows, gapPx)}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/dichroic-wall:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[GROUT, ROOM, BACKLIGHT, WHITE].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <button
        type="button"
        data-dichroic=""
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (enabled && event.currentTarget.matches(":focus-visible")) {
            const e = engine.current?.eye();
            if (e) engine.current?.eyeTo(e.x, e.y, "key");
          }
        }}
        onBlur={() => engine.current?.away("key")}
        onClick={(event) => {
          if (!enabled) return;
          if (event.detail === 0) {
            // Enter, Space or assistive technology: flash where you stand.
            flashed(0, null);
            say("Flash.");
            return;
          }
          const at = local(event.clientX, event.clientY);
          flashed(at.x, at.y);
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          enabled ? "cursor-crosshair" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        Move across the glass to change the angle you see it from. Arrow keys
        move where you stand, Shift with an arrow moves further, Enter or Space
        flashes the wall, Escape stands you back in the centre.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: grout lines over a soft sweep of the film's
 * colours, one tile centred like the canvas's. Without WebGL it turns its hue
 * with the eye through `--dichroic-hue`.
 */
function stillStyle(
  stops: readonly string[],
  rows: number,
  gap: number,
): React.CSSProperties {
  // Until the box is measured, a nominal 216px wall sets the pitch.
  const pitch = `var(--dichroic-pitch, ${r2(216 / rows)}px)`;
  const half = r2(gap / 2);
  const lines = (deg: number) =>
    `linear-gradient(${deg}deg, ${GROUT} ${half}px, transparent ${half}px, transparent calc(${pitch} - ${half}px), ${GROUT} calc(${pitch} - ${half}px))`;
  const tint = (i: number, share: number) =>
    `color-mix(in oklab, ${stops[i % stops.length] ?? WHITE} ${share}%, ${BACKLIGHT})`;
  return {
    backgroundColor: GROUT,
    backgroundImage: [
      lines(90),
      lines(180),
      `linear-gradient(115deg, ${tint(0, 90)} 0%, ${tint(1, 85)} 24%, ${tint(2, 90)} 46%, ${tint(3, 85)} 70%, ${tint(4, 90)} 100%)`,
    ].join(", "),
    backgroundSize: `${pitch} ${pitch}, ${pitch} ${pitch}, 100% 100%`,
    backgroundPosition: "center, center, 0 0",
    filter: "hue-rotate(var(--dichroic-hue, 0deg))",
  };
}
