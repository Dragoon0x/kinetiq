"use client";

import * as React from "react";

import { Pause } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BeadworkMotif = "wave" | "tide" | "bloom";

export type BeadworkLoomProps = {
  /** The picture woven in when there is no `src`: slow diagonal bands, a seascape with a low sun, or a turning flower. @default "tide" */
  motif?: BeadworkMotif;
  /** An image or video to weave instead of the motif (videos by file extension: mp4, webm, ogv, mov). */
  src?: string;
  /** The bead box, up to six CSS colours from dark to light-and-warm; motifs are painted from it. @default six pigments from the tokens */
  colors?: string[];
  /** Every bead takes the nearest colour in the bead box, as a real beadwork chart would. @default false */
  snap?: boolean;
  /** A bead's height, px (6 to 16). @default 10 */
  beadSize?: number;
  /** How glassy the beads are: the strength of each bead's own round highlight, 0 to 1. @default 0.6 */
  sheen?: number;
  /** The gap between columns where the warp threads show, px (0.5 to 5). @default 2 */
  spacing?: number;
  /** How fast the picture moves, 0 to 1. @default 0.4 */
  speed?: number;
  /** How taut the warp is, 0 (loose, long ripples) to 1 (taut, quick ones). @default 0.5 */
  tension?: number;
  /** Whether the picture plays (controlled). */
  playing?: boolean;
  /** Whether the picture starts playing when uncontrolled. @default true */
  defaultPlaying?: boolean;
  /** Fires from the tap or key that played or paused the picture. */
  onPlayingChange?: (playing: boolean) => void;
  /** The warp threads, any CSS colour. @default from the ink token */
  threadColor?: string;
  /** The loom's beams, any CSS colour. @default a wood tone from the warn token */
  frameColor?: string;
  /** Dragging tugs the warp; a mouse lifts the sheen where it hovers. @default true */
  interactive?: boolean;
  /** Seeds each bead's small differences of tone and size. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The panel's accessible name; say what is woven. @default "Beadwork panel" */
  label?: string;
  /** No tugging and no play or pause. @default false */
  disabled?: boolean;
  /** Sizes the loom; it fills its parent by default. */
  className?: string;
};

const MOTIFS: BeadworkMotif[] = ["wave", "tide", "bloom"];
const BEAM = 10;
const GAP = 6;
const MAX_COLS = 160;
const MAX_ROWS = 72;
const STEP = 1 / 240;
const PICTURE_FRAME = 33;
const RENDER_SCALE = 0.75;

const DEFAULT_COLORS = [
  "oklch(from var(--accent) 0.34 0.1 h)",
  "oklch(from var(--accent) 0.54 0.12 calc(h - 34))",
  "oklch(from var(--signal) 0.78 0.08 calc(h + 30))",
  "oklch(from var(--warn) 0.93 0.035 h)",
  "oklch(from var(--warn) 0.82 0.14 h)",
  "oklch(from var(--danger) 0.62 0.16 h)",
];

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_aa;
uniform vec2 u_origin;
uniform vec2 u_pitch;
uniform vec2 u_grid;
uniform vec2 u_half;
uniform float u_radius;
uniform sampler2D u_offsets;
uniform sampler2D u_media;
uniform bool u_useMedia;
uniform vec4 u_mediaFit;
uniform int u_motif;
uniform float u_time;
uniform vec3 u_palette[6];
uniform float u_count;
uniform bool u_snap;
uniform float u_sheen;
uniform vec3 u_backing;
uniform vec3 u_thread;
uniform vec3 u_wood;
uniform float u_threadW;
uniform float u_beam;
uniform vec3 u_pointer;
uniform float u_seed;
in vec2 v_uv;
out vec4 o_color;

float hash(vec2 p) { return fract(sin(dot(p + u_seed * 0.731, vec2(127.1, 311.7))) * 43758.5453); }

vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * (u_count - 1.0);
  float i = floor(x);
  vec3 a = u_palette[0];
  vec3 b = u_palette[0];
  for (int k = 0; k < 6; k += 1) {
    if (float(k) == i) a = u_palette[k];
    if (float(k) == min(i + 1.0, u_count - 1.0)) b = u_palette[k];
  }
  return mix(a, b, smoothstep(0.0, 1.0, x - i));
}

vec3 motif(vec2 uv, float aspect, float t) {
  vec2 q = vec2(uv.x * aspect, uv.y);
  if (u_motif == 0) {
    float v = 0.5 + 0.5 * sin(q.x * 2.3 + q.y * 2.8 - t * 0.8 + 0.9 * sin(q.y * 3.1 - q.x * 0.7 + t * 0.35));
    float w = 0.5 + 0.5 * sin(q.x * 1.1 - q.y * 4.2 + t * 0.5);
    return ramp(mix(v, w, 0.32));
  }
  if (u_motif == 1) {
    float horizon = 0.47;
    vec2 sun = vec2(aspect * 0.62, horizon - 0.15);
    float ds = length((q - sun) * vec2(1.0, 1.15));
    if (uv.y < horizon) {
      float h = uv.y / horizon;
      vec3 sky = mix(ramp(0.3), ramp(0.6), smoothstep(0.0, 1.0, h));
      sky = mix(sky, ramp(0.86), exp(-ds * ds * 9.0) * 0.75);
      float disc = 1.0 - smoothstep(0.095, 0.11, ds);
      return mix(sky, ramp(0.79), disc);
    }
    float depth = (uv.y - horizon) / (1.0 - horizon);
    vec3 sea = mix(ramp(0.24), ramp(0.02), smoothstep(0.0, 1.0, depth));
    float swell = sin(16.0 * log(uv.y - horizon + 0.03) - t * 1.3 + sin(q.x * 5.0 + t * 0.3) * 0.7);
    sea = mix(sea, ramp(0.5), smoothstep(0.55, 0.95, swell) * (0.35 + 0.4 * (1.0 - depth)));
    float column = exp(-pow((q.x - sun.x) / (0.05 + 0.2 * depth), 2.0));
    return mix(sea, ramp(0.84), column * smoothstep(0.1, 0.9, swell * 0.5 + 0.5) * 0.85);
  }
  vec2 c = q - vec2(aspect * 0.5, 0.5);
  float r = length(c);
  float a = atan(c.y, c.x);
  float petals = 0.5 + 0.5 * cos(7.0 * a + sin(r * 6.0 - t * 0.4) * 0.6 + t * 0.15);
  float edge = 0.27 + 0.11 * petals * (0.86 + 0.14 * sin(t * 0.7));
  vec3 ground = mix(ramp(0.06), ramp(0.24), smoothstep(0.0, 0.9, r));
  ground = mix(ground, ramp(0.36), smoothstep(0.75, 1.0, 0.5 + 0.5 * sin(r * 26.0 - t * 0.9)) * 0.25);
  vec3 petal = mix(ramp(0.82), ramp(1.0), smoothstep(0.05, edge, r));
  vec3 col = mix(ground, petal, 1.0 - smoothstep(edge - 0.012, edge + 0.012, r));
  return mix(col, ramp(0.62), 1.0 - smoothstep(0.06, 0.075, r));
}

vec3 source(vec2 uv) {
  if (u_useMedia) {
    vec2 m = u_mediaFit.xy + uv * u_mediaFit.zw;
    return texture(u_media, m).rgb;
  }
  return motif(uv, (u_grid.x * u_pitch.x) / (u_grid.y * u_pitch.y), u_time);
}

vec4 cellData(ivec2 c) {
  ivec2 k = clamp(c, ivec2(0), ivec2(u_grid) - 1);
  return texelFetch(u_offsets, k, 0);
}

float box(vec2 q, vec2 b, float r) {
  vec2 d = abs(q) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

void main() {
  vec2 p = v_uv * u_res;
  vec3 col = u_backing;

  // The beams: two wooden rods, lit from above, with a little grain.
  float beamY = p.y < u_beam ? p.y / u_beam : (p.y > u_res.y - u_beam ? (u_res.y - p.y) / u_beam : -1.0);
  if (beamY >= 0.0) {
    float t = p.y < u_beam ? beamY : 1.0 - beamY;
    float curve = sin(t * 3.14159);
    float grain = 0.92 + 0.08 * sin(p.x * 0.21 + sin(p.x * 0.033 + p.y) * 3.0);
    vec3 wood = u_wood * (0.6 + 0.45 * curve) * grain;
    wood += vec3(0.08) * pow(max(0.0, 1.0 - abs(t - 0.3) * 4.0), 3.0);
    o_color = vec4(clamp(wood, 0.0, 1.0), 1.0);
    return;
  }

  vec2 g = (p - u_origin) / u_pitch - 0.5;
  vec2 d0 = cellData(ivec2(floor(g + 0.5))).xy;
  vec2 g1 = (p - d0 - u_origin) / u_pitch - 0.5;
  ivec2 c1 = ivec2(floor(g1 + 0.5));

  // The warp: a thread on every column boundary, bent with the beads beside it,
  // pinned straight where it meets the beams.
  float tIndex = floor(g1.x + 1.0);
  float rowF = clamp(g1.y, 0.0, u_grid.y - 1.0);
  ivec2 ra = ivec2(int(tIndex) - 1, int(floor(rowF)));
  ivec2 rb = ivec2(int(tIndex), int(floor(rowF)));
  vec2 offA = mix(cellData(ra).xy, cellData(ra + ivec2(0, 1)).xy, fract(rowF));
  vec2 offB = mix(cellData(rb).xy, cellData(rb + ivec2(0, 1)).xy, fract(rowF));
  vec2 off = (offA + offB) * 0.5;
  float inside = smoothstep(-1.5, 0.0, g1.y + 0.5) * smoothstep(-1.5, 0.0, u_grid.y - 0.5 - g1.y);
  float wx = u_origin.x + tIndex * u_pitch.x + off.x * inside;
  float dw = abs(p.x - wx);
  if (tIndex >= 0.0 && tIndex <= u_grid.x) {
    float core = 1.0 - smoothstep(u_threadW * 0.5 - u_aa, u_threadW * 0.5 + u_aa, dw);
    float lit = 0.75 + 0.25 * (1.0 - clamp(dw / max(0.5, u_threadW * 0.5), 0.0, 1.0));
    col = mix(col, u_thread * lit, core);
  }

  // Find the bead over this pixel among the nine around the estimate.
  float best = 1e5;
  float shade = 1e5;
  vec2 bq = vec2(0.0);
  vec2 bHalf = u_half;
  vec4 bData = vec4(0.0);
  ivec2 bCell = ivec2(0);
  for (int j = -1; j <= 1; j += 1) {
    for (int i = -1; i <= 1; i += 1) {
      ivec2 c = c1 + ivec2(i, j);
      if (c.x < 0 || c.y < 0 || c.x >= int(u_grid.x) || c.y >= int(u_grid.y)) continue;
      vec4 data = texelFetch(u_offsets, c, 0);
      vec2 centre = u_origin + (vec2(c) + 0.5) * u_pitch + data.xy;
      float jitter = 1.0 + (hash(vec2(c)) - 0.5) * 0.08;
      vec2 half_ = u_half * jitter;
      vec2 q = p - centre;
      float sd = box(q, half_, u_radius * jitter);
      shade = min(shade, box(q - vec2(0.6, 1.5), half_, u_radius));
      if (sd < best) {
        best = sd;
        bq = q;
        bHalf = half_;
        bData = data;
        bCell = c;
      }
    }
  }
  // Each bead sits in a little shadow of its own on the backing.
  col *= 1.0 - 0.28 * (1.0 - smoothstep(-1.0, 2.5, shade));

  if (best < u_aa) {
    vec2 cell = vec2(bCell);
    vec2 uv = (cell + 0.5) / u_grid;
    vec3 base = source(uv);
    if (u_snap) {
      float nearest = 1e5;
      vec3 pick = base;
      for (int k = 0; k < 6; k += 1) {
        if (float(k) >= u_count) break;
        vec3 e = u_palette[k] - base;
        float dd = dot(e, e * vec3(0.3, 0.59, 0.11));
        if (dd < nearest) {
          nearest = dd;
          pick = u_palette[k];
        }
      }
      base = pick;
    }
    // Real seed beads vary a little, lot to lot.
    base *= 0.94 + 0.12 * hash(cell + 17.0);
    vec2 n2 = bq / bHalf;
    float z = sqrt(max(0.0, 1.0 - dot(n2 * vec2(0.62, 1.0), n2 * vec2(0.62, 1.0))));
    vec3 n = normalize(vec3(n2 * vec2(0.55, 1.0), z + 0.25));
    vec3 L = normalize(vec3(-0.45, -0.6, 0.66));
    float diffuse = max(0.0, dot(n, L));
    vec3 bead = base * (0.5 + 0.55 * diffuse);
    // Light passing through the glass gathers low in the body.
    bead += base * 0.38 * exp(-dot(n2 - vec2(0.12, 0.42), n2 - vec2(0.12, 0.42)) * 3.2);
    bead *= 0.72 + 0.28 * smoothstep(0.0, -2.0, best);
    // The highlight rolls with the bead: a little with its offset, more with its speed.
    vec2 roll = clamp(bData.xy * 0.05 + bData.zw * 0.0035, vec2(-0.36), vec2(0.36));
    vec2 hl = vec2(-0.32, -0.42) + roll;
    float hover = u_pointer.z * exp(-dot((u_origin + (cell + 0.5) * u_pitch) - u_pointer.xy, (u_origin + (cell + 0.5) * u_pitch) - u_pointer.xy) / 3200.0);
    float sheen = clamp(u_sheen + hover * 0.35, 0.0, 1.2);
    float spot = exp(-dot(n2 - hl, n2 - hl) * mix(26.0, 60.0, u_sheen));
    float rim = exp(-dot(n2 - vec2(0.38, 0.5), n2 - vec2(0.38, 0.5)) * 24.0);
    bead += vec3(1.0) * (spot * sheen * 0.95 + rim * sheen * 0.16);
    float edge = 1.0 - smoothstep(-u_aa, u_aa, best);
    col = mix(col, bead, edge);
  }
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = (d[0] ?? 0) / 255;
    out[at + 1] = (d[1] ?? 0) / 255;
    out[at + 2] = (d[2] ?? 0) / 255;
  };
}

const isVideo = (src: string) => /\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(src);

/** The loom's lattice: bead size and pitch for a bead height and gap. */
const pitchOf = (beadSize: number, spacing: number) => {
  const h = clamp(beadSize, 6, 16);
  const s = clamp(spacing, 0.5, 5);
  const w = h * 0.86;
  return { w, h, px: w + s, py: h + s * 0.3 };
};

type Config = {
  colorKey: string;
  count: number;
  motif: BeadworkMotif;
  src: string;
  snap: boolean;
  beadSize: number;
  sheen: number;
  spacing: number;
  speed: number;
  tension: number;
  playing: boolean;
  interactive: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  offsets: WebGLTexture;
  media: WebGLTexture;
  lost: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  grab: (x: number, y: number) => void;
  hold: (dx: number, dy: number) => void;
  letGo: () => void;
  tug: (dx: number, dy: number) => void;
  hover: (x: number, y: number, on: boolean) => void;
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
  let failed = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let time = 0;
  let accumulator = 0;
  const size = { w: 0, h: 0, scale: 1 };
  const read = rgbReader();
  // palette (6) then backing, thread, wood
  const colours = new Float32Array(27);
  const palette = new Float32Array(18);
  // The lattice: offset (x, y) and velocity (x, y) per bead, and each bead's grip.
  let cols = 0;
  let rows = 0;
  let pos = new Float32Array(0);
  let vel = new Float32Array(0);
  let grip = new Float32Array(0);
  let upload = new Float32Array(0);
  let moving = false;
  let held = false;
  const hand = { x: 0, y: 0, dx: 0, dy: 0, px: 0, py: 0 };
  const pointer = { x: 0, y: 0, amount: 0, target: 0 };
  const grid = { ox: 0, oy: 0, px: 10, py: 10, w: 8, h: 10 };
  // Media: an image or a looping, muted video, woven in place of the motif.
  let image: HTMLImageElement | null = null;
  let video: HTMLVideoElement | null = null;
  let mediaReady = false;
  let mediaSrc = "";
  const fit = new Float32Array([0, 0, 1, 1]);

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    const offsets = gl.createTexture();
    const media = gl.createTexture();
    if (!offsets || !media) {
      tri.dispose();
      program.dispose();
      return false;
    }
    gpu = { gl, program, tri, offsets, media, lost: false };
    // A one-pixel media texture until something loads.
    gl.bindTexture(gl.TEXTURE_2D, media);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(4),
    );
    // No mipmaps: a plain filter keeps the stand-in texture complete.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.gl.deleteTexture(g.offsets);
    g.gl.deleteTexture(g.media);
    g.tri.dispose();
    g.program.dispose();
  };

  const allocate = () => {
    const c = cfg;
    if (!c) return;
    const p = pitchOf(c.beadSize, c.spacing);
    const innerW = Math.max(0, size.w - 16);
    const innerH = Math.max(0, size.h - 2 * (BEAM + GAP));
    const nc = clamp(Math.floor(innerW / p.px), 1, MAX_COLS);
    const nr = clamp(Math.floor(innerH / p.py), 1, MAX_ROWS);
    grid.px = p.px;
    grid.py = p.py;
    grid.w = p.w;
    grid.h = p.h;
    grid.ox = (size.w - nc * p.px) / 2;
    grid.oy = (size.h - nr * p.py) / 2;
    if (nc === cols && nr === rows) return;
    cols = nc;
    rows = nr;
    pos = new Float32Array(cols * rows * 2);
    vel = new Float32Array(cols * rows * 2);
    grip = new Float32Array(cols * rows);
    upload = new Float32Array(cols * rows * 4);
    moving = false;
    held = false;
    const g = gpu;
    if (g && !g.lost) {
      g.gl.bindTexture(g.gl.TEXTURE_2D, g.offsets);
      g.gl.texImage2D(
        g.gl.TEXTURE_2D,
        0,
        g.gl.RGBA16F,
        cols,
        rows,
        0,
        g.gl.RGBA,
        g.gl.FLOAT,
        upload,
      );
      g.gl.texParameteri(
        g.gl.TEXTURE_2D,
        g.gl.TEXTURE_MIN_FILTER,
        g.gl.NEAREST,
      );
      g.gl.texParameteri(
        g.gl.TEXTURE_2D,
        g.gl.TEXTURE_MAG_FILTER,
        g.gl.NEAREST,
      );
      g.gl.texParameteri(
        g.gl.TEXTURE_2D,
        g.gl.TEXTURE_WRAP_S,
        g.gl.CLAMP_TO_EDGE,
      );
      g.gl.texParameteri(
        g.gl.TEXTURE_2D,
        g.gl.TEXTURE_WRAP_T,
        g.gl.CLAMP_TO_EDGE,
      );
    }
  };

  const pushOffsets = () => {
    const g = gpu;
    if (!g || g.lost || cols < 1) return;
    for (let i = 0; i < cols * rows; i += 1) {
      upload[i * 4] = pos[i * 2] ?? 0;
      upload[i * 4 + 1] = pos[i * 2 + 1] ?? 0;
      upload[i * 4 + 2] = vel[i * 2] ?? 0;
      upload[i * 4 + 3] = vel[i * 2 + 1] ?? 0;
    }
    g.gl.bindTexture(g.gl.TEXTURE_2D, g.offsets);
    g.gl.texSubImage2D(
      g.gl.TEXTURE_2D,
      0,
      0,
      0,
      cols,
      rows,
      g.gl.RGBA,
      g.gl.FLOAT,
      upload,
    );
  };

  const fitMedia = (mw: number, mh: number) => {
    // Cover the woven area: crop the source to the grid's aspect.
    const ga = (cols * grid.px) / Math.max(1, rows * grid.py);
    const ma = mw / Math.max(1, mh);
    if (ma > ga) {
      const sx = ga / ma;
      fit.set([(1 - sx) / 2, 0, sx, 1]);
    } else {
      const sy = ma / ga;
      fit.set([0, (1 - sy) / 2, 1, sy]);
    }
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    p.program.set({
      u_res: [size.w, size.h],
      u_aa: r3(0.7 / size.scale + 0.25),
      u_origin: [grid.ox, grid.oy],
      u_pitch: [grid.px, grid.py],
      u_grid: [cols, rows],
      u_half: [grid.w / 2, grid.h / 2],
      u_radius: grid.h * 0.36,
      u_palette: palette,
      u_count: clamp(c.count, 1, 6),
      u_snap: c.snap,
      u_sheen: clamp(c.sheen, 0, 1),
      u_backing: [colours[18] ?? 0, colours[19] ?? 0, colours[20] ?? 0],
      u_thread: [colours[21] ?? 0, colours[22] ?? 0, colours[23] ?? 0],
      u_wood: [colours[24] ?? 0, colours[25] ?? 0, colours[26] ?? 0],
      u_threadW: clamp(grid.h * 0.11, 1, 2),
      u_beam: BEAM,
      u_seed: (Math.round(c.seed) % 97) + 0.5,
      u_motif: Math.max(0, MOTIFS.indexOf(c.motif)),
      u_useMedia: mediaReady,
      u_mediaFit: fit,
    });
  };

  const draw = () => {
    const p = gpu;
    if (!cfg || !p || p.lost || size.w < 1 || cols < 1) return;
    if (video && mediaReady && video.readyState >= 2) {
      uploadTexture(p.gl, video, { linear: true }, p.media);
    }
    p.program.texture("u_offsets", p.offsets, 0);
    p.program.texture("u_media", p.media, 1);
    p.program.set({
      u_time: r3(time),
      u_pointer: [pointer.x, pointer.y, r3(pointer.amount)],
    });
    p.gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** One step of the warp lattice: springs home (the recoil constants) and to four neighbours. */
  const step = (h: number) => {
    const c = cfg;
    if (!c) return;
    const t = clamp(c.tension, 0, 1);
    const kHome =
      (springs.recoil.stiffness / springs.recoil.mass) * (0.6 + t * 0.9);
    const damp = 2 * 0.53 * Math.sqrt(kHome);
    const kLink = 700 + t * 1700;
    let energy = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = r * cols + col;
        const x = pos[i * 2] ?? 0;
        const y = pos[i * 2 + 1] ?? 0;
        let fx = -kHome * x;
        let fy = -kHome * y;
        // Four links, unrolled: no closure per bead per step.
        if (col > 0) {
          fx += kLink * ((pos[(i - 1) * 2] ?? 0) - x);
          fy += kLink * ((pos[(i - 1) * 2 + 1] ?? 0) - y);
        }
        if (col < cols - 1) {
          fx += kLink * ((pos[(i + 1) * 2] ?? 0) - x);
          fy += kLink * ((pos[(i + 1) * 2 + 1] ?? 0) - y);
        }
        if (r > 0) {
          fx += kLink * ((pos[(i - cols) * 2] ?? 0) - x);
          fy += kLink * ((pos[(i - cols) * 2 + 1] ?? 0) - y);
        }
        if (r < rows - 1) {
          fx += kLink * ((pos[(i + cols) * 2] ?? 0) - x);
          fy += kLink * ((pos[(i + cols) * 2 + 1] ?? 0) - y);
        }
        let vx = (vel[i * 2] ?? 0) + (fx - damp * (vel[i * 2] ?? 0)) * h;
        let vy =
          (vel[i * 2 + 1] ?? 0) + (fy - damp * (vel[i * 2 + 1] ?? 0)) * h;
        let nx = x + vx * h;
        let ny = y + vy * h;
        const w = held ? (grip[i] ?? 0) : 0;
        if (w > 0.002) {
          // The hand holds the warp under it 1:1; its grip fades with distance.
          const tx = nx + (hand.dx * w - nx) * w;
          const ty = ny + (hand.dy * w - ny) * w;
          vx = (tx - x) / h;
          vy = (ty - y) / h;
          nx = tx;
          ny = ty;
        }
        vel[i * 2] = vx;
        vel[i * 2 + 1] = vy;
        pos[i * 2] = nx;
        pos[i * 2 + 1] = ny;
        energy = Math.max(
          energy,
          Math.abs(nx) + Math.abs(ny),
          (Math.abs(vx) + Math.abs(vy)) * 0.02,
        );
      }
    }
    if (!held && energy < 0.02) {
      pos.fill(0);
      vel.fill(0);
      moving = false;
    }
  };

  const picturing = () => {
    const c = cfg;
    return Boolean(c && c.playing && c.motionSafe && (c.speed > 0 || video));
  };
  const hovering = () => Math.abs(pointer.target - pointer.amount) > 0.01;

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const busy = moving || held || hovering();
    // Only the picture moving: thirty frames a second is a soft screen's rate.
    if (!busy && last && now - drawnAt < PICTURE_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    if (picturing()) time += dt * (0.25 + clamp(c.speed, 0, 1) * 1.75);
    pointer.amount += (pointer.target - pointer.amount) * Math.min(1, dt * 9);
    if (moving || held) {
      accumulator = Math.min(accumulator + dt, 0.05);
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
      pushOffsets();
    }
    draw();
    if (picturing() || moving || held || hovering()) {
      frame = window.requestAnimationFrame(tick);
    } else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!picturing() && !moving && !held && !hovering()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const syncVideo = () => {
    const c = cfg;
    if (!video) return;
    const play = Boolean(
      c?.playing &&
      visible.current &&
      !document.hidden &&
      !disposed &&
      c.motionSafe,
    );
    if (play && video.paused) void video.play().catch(() => {});
    else if (!play && !video.paused) video.pause();
  };

  const dropMedia = () => {
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (image) image.src = "";
    video = null;
    image = null;
    mediaReady = false;
  };

  const loadMedia = (src: string) => {
    if (src === mediaSrc) return;
    mediaSrc = src;
    dropMedia();
    statics();
    if (!src) return;
    if (isVideo(src)) {
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.crossOrigin = "anonymous";
      v.preload = "auto";
      v.onloadeddata = () => {
        if (video !== v) return;
        mediaReady = true;
        fitMedia(v.videoWidth, v.videoHeight);
        statics();
        syncVideo();
        draw();
        kick();
      };
      v.onerror = () => {
        if (video === v) dropMedia();
      };
      v.src = src;
      video = v;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      const p = gpu;
      if (image !== img || !p || p.lost) return;
      uploadTexture(p.gl, img, { linear: true }, p.media);
      mediaReady = true;
      fitMedia(img.naturalWidth, img.naturalHeight);
      statics();
      draw();
    };
    img.onerror = () => {
      if (image === img) dropMedia();
    };
    img.src = src;
    image = img;
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 9; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    palette.set(colours.subarray(0, 18));
    statics();
  };

  const resize = () => {
    const c = cfg;
    size.w = root.clientWidth;
    size.h = root.clientHeight;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1 || size.h < 1) return;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    // A dense screen can drop a quarter of its pixels; the edges stay anti-aliased.
    const scale = ratio >= 1.5 ? RENDER_SCALE : 1;
    size.scale =
      resizeGL(p.gl, canvas, { dprCap: cap, renderScale: scale }).dpr * scale;
    allocate();
    if (image && mediaReady) fitMedia(image.naturalWidth, image.naturalHeight);
    if (video && mediaReady) fitMedia(video.videoWidth, video.videoHeight);
    statics();
    pushOffsets();
    draw();
    kick();
  };

  const start = () => {
    if (!build()) return false;
    cols = 0;
    rows = 0;
    readColours();
    resize();
    const src = mediaSrc;
    mediaSrc = "";
    loadMedia(src);
    return true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        // A seeded moment in the picture, so the first frame is a composed one.
        time = 3 + (Math.round(next.seed) % 7) * 0.9;
        mediaSrc = next.src;
      }
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
        syncVideo();
        kick();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.beadSize !== next.beadSize || was.spacing !== next.spacing) {
        allocate();
        pushOffsets();
      }
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (was.src !== next.src) loadMedia(next.src);
      syncVideo();
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      syncVideo();
      draw();
      kick();
    },
    grab(x, y) {
      const c = cfg;
      if (!c || cols < 1) return;
      hand.x = x;
      hand.y = y;
      hand.dx = 0;
      hand.dy = 0;
      hand.px = x;
      hand.py = y;
      // The warp under the finger: a soft patch about six columns wide and seven rows tall.
      for (let r = 0; r < rows; r += 1) {
        for (let col = 0; col < cols; col += 1) {
          const ex = (grid.ox + (col + 0.5) * grid.px - x) / (grid.px * 4.5);
          const ey = (grid.oy + (r + 0.5) * grid.py - y) / (grid.py * 5);
          grip[r * cols + col] = Math.exp(-(ex * ex + ey * ey));
        }
      }
      held = c.motionSafe;
      moving = held;
      kick();
    },
    hold(dx, dy) {
      // Past one pitch the warp resists: the beads never tear apart.
      hand.dx = rubberClamp(dx, -grid.px, grid.px, grid.px * 2);
      hand.dy = rubberClamp(dy, -grid.py, grid.py, grid.py * 2);
      hand.px = hand.x + dx;
      hand.py = hand.y + dy;
      kick();
    },
    letGo() {
      held = false;
      kick();
    },
    tug(dx, dy) {
      const c = cfg;
      if (!c || !c.motionSafe || cols < 1) return;
      const x = hand.px || size.w / 2;
      const y = hand.py || size.h / 2;
      // A quick pull and let go: the warp under the needle is thrown, and the
      // recoil spring brings it back past home.
      for (let r = 0; r < rows; r += 1) {
        for (let col = 0; col < cols; col += 1) {
          const ex = (grid.ox + (col + 0.5) * grid.px - x) / (grid.px * 4.5);
          const ey = (grid.oy + (r + 0.5) * grid.py - y) / (grid.py * 5);
          const w = Math.exp(-ex * ex - ey * ey);
          const i = r * cols + col;
          vel[i * 2] = (vel[i * 2] ?? 0) + dx * grid.px * 16 * w;
          vel[i * 2 + 1] = (vel[i * 2 + 1] ?? 0) + dy * grid.py * 16 * w;
        }
      }
      moving = true;
      kick();
    },
    hover(x, y, on) {
      pointer.x = x;
      pointer.y = y;
      pointer.target = on && cfg?.interactive ? 1 : 0;
      // The needle follows the pointer, so the keyboard tugs where it last was.
      if (on) {
        hand.px = x;
        hand.py = y;
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      dropMedia();
      detach();
      release();
      root.removeAttribute("data-live");
    },
  };
}

/** The server's still and the frame without WebGL2: the motif as a gradient, seen through a bead tile. */
function stillPicture(motif: BeadworkMotif, c: string[]) {
  const at = (t: number) =>
    c[Math.round(clamp(t, 0, 1) * (c.length - 1))] ?? "transparent";
  if (motif === "wave") {
    return `linear-gradient(115deg, ${at(0)}, ${at(0.2)} 22%, ${at(0.6)} 44%, ${at(0.8)} 58%, ${at(0.4)} 76%, ${at(0.2)})`;
  }
  if (motif === "bloom") {
    return `radial-gradient(closest-side at 50% 50%, ${at(0.6)} 0 14%, ${at(0.8)} 16%, ${at(1)} 52%, ${at(0.2)} 58%, ${at(0)})`;
  }
  return `radial-gradient(20% 34% at 62% 44%, ${at(0.8)} 0 40%, transparent 70%), linear-gradient(to bottom, ${at(0.2)}, ${at(0.6)} 46%, ${at(0.2)} 48%, ${at(0)})`;
}

/**
 * A panel of glass seed beads woven on a loom — beams top and bottom, warp
 * threads between every column — whose beads take their colour from a moving
 * picture, so the beadwork plays like a soft low-resolution screen: a slow
 * wave, a seascape with a low sun and a rolling swell, a turning flower, or
 * any image or video. Every bead is shaded as a little glass barrel with its
 * own round highlight; `snap` limits each to the nearest colour in the bead
 * box, like a real chart.
 *
 * Every bead is also a node on a spring lattice — home on the springs.recoil
 * constants, linked to its four neighbours — so a drag grabs the warp under
 * the finger and holds it 1:1, and letting go sends it back past home in two
 * bounces while the ripple runs along the rows; the beads carry their colour,
 * so the picture bends, and each highlight rolls with its bead. A tap or
 * Space plays and pauses the picture; arrow keys tug the warp at the needle.
 * One WebGL2 pass. Under reduced motion it is a still panel.
 */
export function BeadworkLoom({
  motif = "tide",
  src,
  colors = DEFAULT_COLORS,
  snap = false,
  beadSize = 10,
  sheen = 0.6,
  spacing = 2,
  speed = 0.4,
  tension = 0.5,
  playing,
  defaultPlaying = true,
  onPlayingChange,
  threadColor = "color-mix(in oklab, var(--ink-3) 70%, var(--warn))",
  frameColor = "oklch(from var(--warn) 0.6 0.075 calc(h - 18))",
  interactive = true,
  seed = 1,
  dpr = 2,
  label = "Beadwork panel",
  disabled = false,
  className,
}: BeadworkLoomProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const isPlaying = playing ?? ownPlaying;
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const box = colors.slice(0, 6);
  const backing = "var(--card)";
  const config: Config = {
    colorKey: `${box.join("|")}|${threadColor}|${frameColor}`,
    count: Math.max(1, box.length),
    motif,
    src: src ?? "",
    snap,
    beadSize,
    sheen,
    spacing,
    speed,
    tension,
    playing: isPlaying,
    interactive: interactive && !disabled,
    seed,
    dpr,
    motionSafe,
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
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    // Hidden or shown, the engine decides: a video pauses, a loop resumes.
    const onVisibility = () => engine.current?.wake();
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
      engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (x: number, y: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return { x: x - (r?.left ?? 0), y: y - (r?.top ?? 0) };
  };

  const toggle = () => {
    if (disabled) return;
    const next = !isPlaying;
    if (playing === undefined) setOwnPlaying(next);
    onPlayingChange?.(next);
    setSaid((v) => ({
      n: v.n + 1,
      text: next ? "Picture playing." : "Picture paused.",
    }));
  };

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || !interactive,
    onStart: ({ point, offset }) => {
      const at = local(point.x - offset.x, point.y - offset.y);
      engine.current?.grab(at.x, at.y);
    },
    onMove: ({ offset }) => engine.current?.hold(offset.x, offset.y),
    onEnd: () => engine.current?.letGo(),
    onCancel: () => engine.current?.letGo(),
    onTap: () => toggle(),
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle();
      return;
    }
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = dir[event.key];
    if (!d || !interactive) return;
    event.preventDefault();
    engine.current?.tug(d[0], d[1]);
  };

  const p = pitchOf(beadSize, spacing);
  const tile = `${r2(p.px)}px ${r2(p.py)}px`;
  const still = stillPicture(motif, box);

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="beadwork"
      aria-label={`${label}, ${src ? "woven from a picture" : `${motif} motif`}`}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      {...drag}
      onPointerMove={(event) => {
        // The drag's own move first, then the hover sheen and the needle.
        drag.onPointerMove(event);
        if (event.pointerType === "touch") return;
        const at = local(event.clientX, event.clientY);
        engine.current?.hover(at.x, at.y, true);
      }}
      onPointerLeave={(event) => {
        const at = local(event.clientX, event.clientY);
        engine.current?.hover(at.x, at.y, false);
      }}
      className={cn(
        "group/beadwork-loom relative isolate h-full w-full overflow-clip rounded-3 border border-hairline-strong [contain:paint] select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed opacity-60"
          : interactive
            ? "cursor-grab touch-none active:cursor-grabbing"
            : "cursor-pointer",
        className,
      )}
      style={{ backgroundColor: backing }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-live/beadwork-loom:hidden"
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            className={cn("absolute inset-x-0", i === 0 ? "top-0" : "bottom-0")}
            style={{
              height: BEAM,
              backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${frameColor} 70%, black), ${frameColor} 45%, color-mix(in oklab, ${frameColor} 75%, black))`,
            }}
          />
        ))}
        <div
          className="absolute inset-x-2"
          style={{
            top: BEAM,
            bottom: BEAM,
            backgroundImage: `linear-gradient(to right, ${threadColor} 0 1px, transparent 1px)`,
            backgroundSize: tile,
            backgroundRepeat: "space",
          }}
        />
        <div
          className="absolute inset-x-2"
          style={{
            top: BEAM + GAP,
            bottom: BEAM + GAP,
            backgroundImage: still,
            maskImage: `radial-gradient(${r2(p.w / 2)}px ${r2(p.h / 2)}px at 50% 50%, black 86%, transparent 100%)`,
            maskSize: tile,
            maskRepeat: "space",
          }}
        />
        <div
          className="absolute inset-x-2"
          style={{
            top: BEAM + GAP,
            bottom: BEAM + GAP,
            backgroundImage: `radial-gradient(${r2(p.w * 0.13)}px ${r2(p.h * 0.11)}px at 34% 29%, oklch(1 0 0 / ${r2(0.25 + sheen * 0.6)}), transparent)`,
            backgroundSize: tile,
            backgroundRepeat: "space",
          }}
        />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/beadwork-loom:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: box[i] ?? box[box.length - 1] ?? "transparent" }}
          />
        ))}
        {[backing, threadColor, frameColor].map((c, i) => (
          <span
            key={`k${i}`}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-[3px] right-2 flex h-4 items-center gap-1 rounded-full px-1.5 font-mono text-[9px] tracking-[0.08em] uppercase transition-opacity duration-200",
          isPlaying ? "opacity-0" : "opacity-100",
        )}
        style={{
          backgroundColor: `color-mix(in oklab, ${frameColor} 55%, black)`,
          color: "oklch(0.97 0.01 80)",
        }}
      >
        <Pause className="size-2.5 shrink-0" strokeWidth={2.5} />
        Paused
      </span>
      <p id={hintId} className="sr-only">
        Space or Enter plays and pauses the picture. Arrow keys tug the warp and
        let it go; drag to tug it by hand.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
