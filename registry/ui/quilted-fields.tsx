"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type QuiltedFieldsSeason = "spring" | "summer" | "harvest" | "winter";

export type QuiltedFieldsProps = {
  /** Content over the flight: a hero line, a caption. It stays fully interactive. */
  children?: React.ReactNode;
  /** How fast the flight goes, 0 (hovering) to 1 (brisk). @default 0.4 */
  speed?: number;
  /** How high the flight is, 0 (hedge-top) to 1 (high over the quilt). @default 0.35 */
  altitude?: number;
  /** The fields' palette; a change re-dyes the quilt field by field from the horizon in. @default "summer" */
  season?: QuiltedFieldsSeason;
  /** The bank angle in degrees, −18 (left) to 18 (right) (controlled). */
  bank?: number;
  /** The starting bank when uncontrolled. @default 0 */
  defaultBank?: number;
  /** Fires from the hover, drag or key that banked the flight, with whole degrees. */
  onBankChange?: (degrees: number) => void;
  /** A hovering mouse or pen banks the flight; a finger drags sideways. @default true */
  followPointer?: boolean;
  /** Level the wings when the pointer leaves. @default true */
  levelOnLeave?: boolean;
  /** How big the fields are, 0 (small plots) to 1 (broad fields). @default 0.5 */
  fieldSize?: number;
  /** How heavy the hedgerow stitching is, 0 (none) to 1 (thick seams with trees). @default 0.6 */
  hedgerows?: number;
  /** How much the distance fades into the haze, 0 (clear) to 1 (soft). @default 0.5 */
  haze?: number;
  /** Four CSS colours for the fields, overriding the season's own. */
  palette?: string[];
  /** The sky over the horizon, any CSS colour. @default a pale (light) or dusk (dark) tint of the accent token */
  skyColor?: string;
  /** Hold the flight where it is. @default false */
  paused?: boolean;
  /** Seeds the plots, their crops and where the flight starts. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The bank control's accessible name. @default "Bank" */
  label?: string;
  /** The flight cannot be banked. @default false */
  disabled?: boolean;
  /** Sizes the piece; it fills its parent by default. */
  className?: string;
};

const MAX_BANK = 18;
const MIN_BANK = -18;
/** The plots are laid out at an angle to the flight so the quilt runs diagonally. */
const GRID_ANGLE = 0.42;
const SWEEP_END = 1.15;
const SWEEP_TIME = 1.1;

/** Four field colours and the hedge, per season: pigment, the same in both themes. */
const SEASONS: Record<QuiltedFieldsSeason, readonly string[]> = {
  spring: [
    "oklch(0.74 0.13 136)",
    "oklch(0.82 0.11 118)",
    "oklch(0.88 0.14 102)",
    "oklch(0.62 0.06 68)",
    "oklch(0.44 0.08 142)",
  ],
  summer: [
    "oklch(0.64 0.12 140)",
    "oklch(0.8 0.11 92)",
    "oklch(0.72 0.1 124)",
    "oklch(0.68 0.08 300)",
    "oklch(0.4 0.07 146)",
  ],
  harvest: [
    "oklch(0.82 0.12 86)",
    "oklch(0.74 0.12 70)",
    "oklch(0.64 0.08 58)",
    "oklch(0.72 0.09 112)",
    "oklch(0.44 0.06 118)",
  ],
  winter: [
    "oklch(0.92 0.012 240)",
    "oklch(0.8 0.03 100)",
    "oklch(0.64 0.04 62)",
    "oklch(0.86 0.02 200)",
    "oklch(0.38 0.03 150)",
  ],
};

const THREAD = "oklch(0.96 0.03 90)";
const DEFAULT_SKY =
  "light-dark(oklch(from var(--accent) 0.9 0.045 h), oklch(from var(--accent) 0.3 0.06 h))";

const FRAGMENT = /* glsl */ `
uniform vec2 u_tan;
uniform vec2 u_pos;
uniform float u_heading;
uniform float u_bank;
uniform float u_alt;
uniform float u_pitch;
uniform float u_cell;
uniform float u_hedge;
uniform float u_haze;
uniform float u_sweep;
uniform float u_seed;
uniform float u_dusk;
uniform vec3 u_from[5];
uniform vec3 u_to[5];
uniform vec3 u_sky;
uniform vec3 u_hazeCol;
uniform vec3 u_thread;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

const float GRID_ANGLE = ${GRID_ANGLE.toFixed(2)};

float h21(vec2 p) { return kx_hash(p + u_seed * 17.31); }

vec3 fieldColour(int i, float t) {
  vec3 a = u_from[0];
  vec3 b = u_to[0];
  if (i == 1) { a = u_from[1]; b = u_to[1]; }
  else if (i == 2) { a = u_from[2]; b = u_to[2]; }
  else if (i == 3) { a = u_from[3]; b = u_to[3]; }
  return mix(a, b, t);
}

void main() {
  vec2 ndc = vec2(v_uv.x * 2.0 - 1.0, 1.0 - v_uv.y * 2.0);
  vec2 q = ndc * u_tan;
  // Banking rolls the view about its centre: bank right and the horizon
  // rises on the right, as it does from a cockpit.
  float cb = cos(u_bank);
  float sb = -sin(u_bank);
  q = vec2(cb * q.x - sb * q.y, sb * q.x + cb * q.y);
  float cp = cos(u_pitch);
  float sp = sin(u_pitch);
  vec3 d = vec3(q.x, q.y * sp + cp, q.y * cp - sp);
  float ch = cos(u_heading);
  float sh = sin(u_heading);
  d.xy = vec2(ch * d.x + sh * d.y, -sh * d.x + ch * d.y);

  vec3 col;
  float len = length(d);
  if (d.z > -0.0005) {
    float e = d.z / len;
    col = mix(u_hazeCol, u_sky, smoothstep(0.0, 0.32, e));
  } else {
    float t = u_alt / -d.z;
    vec2 p = u_pos + d.xy * t;
    float ca = cos(GRID_ANGLE);
    float sa = sin(GRID_ANGLE);
    vec2 pr = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);

    // A warped, jittered grid: irregular plots, each split once into strips.
    vec2 g = pr / u_cell;
    vec2 w = vec2(kx_noise(g * 0.37 + 3.1), kx_noise(g * 0.37 + 11.7)) - 0.5;
    g += w * 0.8;
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float hA = h21(cell);
    float hB = h21(cell + 37.0);
    float hC = h21(cell + 71.0);
    bool alongX = hB < 0.5;
    float split = 0.3 + 0.4 * hC;
    float sc = alongX ? f.x : f.y;
    bool cut = hA < 0.62;
    float sub = cut ? step(split, sc) : 0.0;
    float dSplit = cut ? abs(sc - split) : 1.0;
    vec2 fid = cell * 3.0 + vec2(sub, alongX ? 0.0 : 1.0);
    float ex = min(f.x, 1.0 - f.x);
    float ey = min(f.y, 1.0 - f.y);
    float dEdge = min(min(ex, ey), dSplit) * u_cell;
    float along = dSplit < min(ex, ey) ? (alongX ? g.y : g.x) : (ex < ey ? g.y : g.x);

    // The season sweep: far fields re-dye first, each on its own short ease.
    vec2 centre = (cell + 0.5) * u_cell;
    vec2 cw = vec2(ca * centre.x + sa * centre.y, -sa * centre.x + ca * centre.y);
    float ahead = dot(cw - u_pos, vec2(sh, ch));
    float near = clamp(ahead / (u_cell * 12.0), 0.0, 1.0);
    float delay = (1.0 - near) * 0.62 + h21(fid + 29.0) * 0.18;
    float prog = smoothstep(delay, delay + 0.32, u_sweep);

    float hf = h21(fid + 5.0);
    int idx = int(min(3.0, floor(hf * 4.0)));
    vec3 base = fieldColour(idx, prog) * (0.9 + 0.2 * h21(fid + 19.0));

    // The crop's texture, faded by its own screen frequency so it never shimmers.
    float crop = h21(fid + 13.0);
    float ang = h21(fid + 41.0) * 3.14159;
    vec2 dir = vec2(cos(ang), sin(ang));
    float coord = dot(pr, dir);
    float fwc = fwidth(coord);
    float tex = 0.0;
    if (crop < 0.3) {
      tex = sin(coord * 4.488) * 0.09 * (1.0 - smoothstep(0.2, 0.7, fwc));
    } else if (crop < 0.5) {
      tex = sin(coord * 8.976) * 0.07 * (1.0 - smoothstep(0.1, 0.35, fwc));
      tex += (kx_noise(pr * 2.3) - 0.5) * 0.05 * (1.0 - smoothstep(0.2, 0.6, fwc));
    } else if (crop < 0.75) {
      tex = (kx_noise(pr * 1.3) - 0.5) * 0.14 * (1.0 - smoothstep(0.4, 1.4, fwc));
    } else if (crop < 0.9) {
      tex = (kx_noise(pr * 3.1) - 0.5) * 0.05 * (1.0 - smoothstep(0.2, 0.6, fwc));
    } else {
      tex = (kx_fbm(pr * 0.22) - 0.5) * 0.2;
    }
    col = base * (1.0 + tex);
    // Padded like a quilt: each field rises a little toward its middle.
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.32 * u_cell, dEdge);

    // Hedgerows as stitching: a dark seam and a dashed pale thread along it.
    float fwE = max(fwidth(dEdge), 1e-4);
    // A hedge is never a ruled line: its width wanders along the seam.
    float wander = 0.7 + 0.6 * kx_noise(vec2(along * u_cell * 0.45, dot(cell, vec2(3.1, 7.7))));
    float hedgeW = (0.18 + 0.8 * u_hedge) * wander;
    float seam = (1.0 - smoothstep(hedgeW - fwE, hedgeW + fwE, dEdge)) * step(0.01, u_hedge);
    vec3 hedgeCol = mix(u_from[4], u_to[4], prog) * (0.82 + 0.3 * kx_noise(pr * 1.7));
    col = mix(col, hedgeCol, seam);
    // The running stitch sits just off the seam, on the fabric, as a quilter's does.
    float dashCoord = along * u_cell / 1.2;
    float dashFade = 1.0 - smoothstep(0.2, 0.6, fwidth(dashCoord));
    float dash = smoothstep(0.45, 0.52, fract(dashCoord)) * (1.0 - smoothstep(0.88, 0.95, fract(dashCoord)));
    float off = abs(dEdge - hedgeW - 0.32 - 0.1 * u_hedge);
    float threadW = 0.07 + 0.05 * u_hedge;
    float thread = (1.0 - smoothstep(threadW - fwE, threadW + fwE, off)) * dash * dashFade;
    col = mix(col, u_thread * (1.0 - 0.3 * u_dusk), thread * 0.62 * smoothstep(0.05, 0.3, u_hedge));

    // Trees at the plot corners and here and there along the hedges.
    vec2 corner = floor(g + 0.5);
    float hT = h21(corner + 91.0);
    float rT = (0.55 + 0.7 * hT) * (0.35 + 0.65 * u_hedge);
    vec2 dc = (g - corner) * u_cell;
    float seg = floor(along * u_cell / 7.0);
    float hS = h21(vec2(seg, dot(cell, vec2(1.0, 57.0))) + 133.0);
    float alongT = (fract(along * u_cell / 7.0) - 0.5) * 7.0;
    vec2 ds = vec2(alongT, dEdge);
    float tree = 0.0;
    float shade = 0.0;
    if (hT < 0.55) {
      tree = max(tree, 1.0 - smoothstep(rT - fwE, rT + fwE, length(dc)));
      shade = max(shade, 1.0 - smoothstep(rT - fwE, rT + fwE, length(dc - vec2(0.45, -0.35) * rT)));
    }
    if (hS < 0.34) {
      float rr = rT * 0.8;
      tree = max(tree, 1.0 - smoothstep(rr - fwE, rr + fwE, length(ds)));
    }
    tree *= step(0.01, u_hedge);
    shade *= step(0.01, u_hedge);
    col = mix(col, hedgeCol * 0.55, shade * 0.45);
    col = mix(col, hedgeCol * (0.8 + 0.4 * kx_noise(pr * 4.0)), tree);

    // Evening in the dark theme: lower, warmer light.
    col *= mix(1.0, 0.74, u_dusk);
    col += vec3(0.05, 0.025, 0.0) * u_dusk;

    float dist = t * len;
    float reach = u_cell * (3.4 + 7.5 * (1.0 - u_haze));
    float fog = 1.0 - exp(-pow(dist / reach, 1.6));
    col = mix(col, u_hazeCol, clamp(fog, 0.0, 1.0));
  }
  // A faint vignette, to hold the eye in the middle.
  vec2 vv = v_uv - 0.5;
  col *= 1.0 - dot(vv, vv) * 0.22;
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
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
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = (d[0] ?? 0) / 255;
    out[at + 1] = (d[1] ?? 0) / 255;
    out[at + 2] = (d[2] ?? 0) / 255;
  };
}

/** The camera, shared by the shader and the server's still. */
function camera(altitude: number, fieldSize: number) {
  const cell = 16 + 34 * clamp(fieldSize, 0, 1);
  return {
    cell,
    alt: 3 + 30 * Math.pow(clamp(altitude, 0, 1), 1.3),
  };
}

/** The tangent of half the field of view; narrow boxes look a little wider. */
function lens(width: number, height: number) {
  const aspect = Math.max(0.3, width / Math.max(1, height));
  const ty = Math.max(0.36, 0.62 / aspect);
  return { tx: ty * aspect, ty };
}

/** The pitch that puts the horizon 32% down the frame. */
const pitchFor = (ty: number) => Math.atan(0.36 * ty);

type Config = {
  colorKey: string;
  speed: number;
  altitude: number;
  fieldSize: number;
  hedgerows: number;
  haze: number;
  seed: number;
  dpr: number;
  paused: boolean;
  motionSafe: boolean;
  bank: number;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  aim: (degrees: number) => void;
  resize: () => void;
  readColours: (sweep: boolean) => void;
  wake: () => void;
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
  const size = { w: 0, h: 0 };
  const read = rgbReader();
  // from[5], to[5], sky, haze, thread
  const from = new Float32Array(15);
  const to = new Float32Array(15);
  const scratch = new Float32Array(15);
  const sky = new Float32Array(3);
  const hazeCol = new Float32Array(3);
  const thread = new Float32Array(3);
  let dusk = 0;
  let sweep = SWEEP_END;
  let coloured = false;
  // The flight: position, heading, and the bank on the drift spring.
  let px = 0;
  let py = 0;
  let heading = 0;
  let aimAt = 0;
  let shown = 0;
  let spin = 0;
  let placed = false;

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
    if (!c || !p || p.lost) return;
    const cam = camera(c.altitude, c.fieldSize);
    const { tx, ty } = lens(size.w, size.h);
    p.program.set({
      u_tan: [tx, ty],
      u_pitch: pitchFor(ty),
      u_alt: cam.alt,
      u_cell: cam.cell,
      u_hedge: clamp(c.hedgerows, 0, 1),
      u_haze: clamp(c.haze, 0, 1),
      u_seed: (Math.round(c.seed) % 97) + 0.5,
      u_dusk: dusk,
      u_from: from,
      u_to: to,
      u_sky: sky,
      u_hazeCol: hazeCol,
      u_thread: thread,
    });
  };

  const draw = () => {
    const p = gpu;
    if (!cfg || !p || p.lost || size.w < 1) return;
    p.program.set({
      u_pos: [r3(px), r3(py)],
      u_heading: r3(heading),
      u_bank: r3((shown * Math.PI) / 180),
      u_sweep: r3(sweep),
    });
    p.gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const banking = () => Math.abs(aimAt - shown) > 0.02 || Math.abs(spin) > 0.02;
  const sweeping = () => sweep < SWEEP_END;
  const flying = () => {
    const c = cfg;
    return Boolean(c && c.motionSafe && !c.paused && c.speed > 0);
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (banking()) {
      // The drift spring's own constants, sub-stepped so it is stable at any rate.
      const k = springs.drift.stiffness / springs.drift.mass;
      const damp = springs.drift.damping / springs.drift.mass;
      const steps = Math.ceil(dt / (1 / 240));
      for (let i = 0; i < steps; i += 1) {
        const h = dt / steps;
        spin += (-k * (shown - aimAt) - damp * spin) * h;
        shown += spin * h;
      }
      if (!banking()) {
        shown = aimAt;
        spin = 0;
      }
    }
    if (flying()) {
      const v = 6 + 44 * clamp(c.speed, 0, 1);
      // A banked aircraft turns: the heading follows the bank.
      heading += ((shown * Math.PI) / 180) * 0.55 * dt;
      px += Math.sin(heading) * v * dt;
      py += Math.cos(heading) * v * dt;
      if (Math.abs(px) > 1e5 || Math.abs(py) > 1e5) {
        px %= 4096;
        py %= 4096;
      }
    }
    if (sweeping()) sweep = Math.min(SWEEP_END, sweep + dt / SWEEP_TIME);
    draw();
    if (flying() || banking() || sweeping())
      frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!flying() && !banking() && !sweeping()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = (animateSweep: boolean) => {
    const kids = carriers.children;
    const fields = (i: number, out: Float32Array, at: number) => {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, out, at);
    };
    for (let i = 0; i < 5; i += 1) fields(i, scratch, i * 3);
    fields(5, sky, 0);
    fields(6, hazeCol, 0);
    fields(7, thread, 0);
    const changed = scratch.some((v, i) => Math.abs(v - (to[i] ?? 0)) > 0.002);
    if (!coloured || !animateSweep || !cfg?.motionSafe) {
      from.set(scratch);
      to.set(scratch);
      sweep = SWEEP_END;
    } else if (changed) {
      // Whatever is on screen now is where the new dye starts from.
      for (let i = 0; i < 15; i += 1) {
        const a = from[i] ?? 0;
        const b = to[i] ?? 0;
        from[i] = sweep >= SWEEP_END ? b : a + (b - a) * clamp(sweep, 0, 1);
      }
      to.set(scratch);
      sweep = 0;
    }
    coloured = true;
    const lum =
      0.2126 * (sky[0] ?? 0) + 0.7152 * (sky[1] ?? 0) + 0.0722 * (sky[2] ?? 0);
    dusk = clamp((0.5 - lum) / 0.3, 0, 1);
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
    resizeGL(p.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? 0.6 : 1,
    });
    statics();
    draw();
    kick();
  };

  const start = () => {
    if (!build()) return false;
    readColours(false);
    resize();
    return true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!placed) {
        placed = true;
        aimAt = next.bank;
        shown = next.bank;
        const s = Math.round(next.seed);
        px = hash(s, 1) * 2000;
        py = hash(s, 2) * 2000;
        heading = (hash(s, 3) - 0.5) * 0.6;
      }
      if (next.bank !== aimAt) {
        aimAt = next.bank;
        if (!next.motionSafe) {
          shown = aimAt;
          spin = 0;
        }
      }
      if (failed) return;
      if (!gpu) {
        if (!start()) {
          // No WebGL2: the server's still stays, and nothing retries.
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
        kick();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey) readColours(true);
      else statics();
      draw();
      kick();
    },
    aim(degrees) {
      aimAt = clamp(degrees, -MAX_BANK, MAX_BANK);
      if (!cfg?.motionSafe || failed) {
        shown = aimAt;
        spin = 0;
        draw();
        return;
      }
      kick();
    },
    resize,
    readColours(animateSweep) {
      readColours(animateSweep);
      draw();
      kick();
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
      root.removeAttribute("data-live");
    },
  };
}

type Quad = { d: string; fill: number; far: number };

/**
 * The server's frame, and the still without WebGL2: the same camera over an
 * unwarped quilt — strips of seeded widths running to the horizon — drawn as
 * projected quads in a 1000 × 300 box.
 */
function stillQuads(altitude: number, fieldSize: number, seed: number) {
  const { cell, alt } = camera(altitude, fieldSize);
  const { tx, ty } = lens(1000, 300);
  const pitch = pitchFor(ty);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const project = (x: number, y: number) => {
    const zc = y * cp + alt * sp;
    const yc = y * sp - alt * cp;
    return {
      x: r1(((x / (zc * tx) + 1) / 2) * 1000),
      y: r1(((1 - yc / (zc * ty)) / 2) * 300),
    };
  };
  const s = Math.round(seed);
  const quads: Quad[] = [];
  // Column edges of seeded widths, rows of seeded depths.
  const cols: number[] = [];
  let x = -cell * 9;
  for (let i = 0; x < cell * 9; i += 1) {
    cols.push(x);
    x += cell * (0.55 + 0.9 * hash(s, i, 5));
  }
  cols.push(x);
  const rows: number[] = [];
  let y = alt * 0.6;
  for (let j = 0; y < cell * 26; j += 1) {
    rows.push(y);
    y += cell * (0.5 + 0.8 * hash(s, j, 6));
  }
  for (let j = 0; j < rows.length - 1; j += 1) {
    for (let i = 0; i < cols.length - 1; i += 1) {
      const x0 = cols[i] ?? 0;
      const x1 = cols[i + 1] ?? 0;
      const y0 = rows[j] ?? 0;
      const y1 = rows[j + 1] ?? 0;
      const a = project(x0, y0);
      const b = project(x1, y0);
      const c = project(x1, y1);
      const e = project(x0, y1);
      if (Math.max(a.x, b.x) < -200 || Math.min(a.x, b.x) > 1200) continue;
      quads.push({
        d: `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} L ${e.x} ${e.y} Z`,
        fill: Math.floor(hash(s, i * 131 + j, 9) * 4),
        far: r3(clamp(y0 / (cell * 22), 0, 1)),
      });
    }
  }
  return quads;
}

const describe = (deg: number) =>
  deg === 0
    ? "Wings level"
    : `Banking ${Math.abs(deg)} ${Math.abs(deg) === 1 ? "degree" : "degrees"} ${deg > 0 ? "right" : "left"}`;

/**
 * An endless low flight over farmland laid out like a patchwork quilt, drawn
 * per pixel in one WebGL2 pass: irregular plots of furrows, drilled rows,
 * pasture, flowering crops and fallow, each in a seasonal tone and padded a
 * little toward its middle, divided by hedgerows drawn as stitching — a dark
 * seam with a dashed pale thread and round trees at the corners — fading into
 * a soft haze toward the horizon.
 *
 * The pointer banks the flight: the bank eases toward the pointer on the
 * springs.drift constants, the horizon rolls with it and the flight turns, so
 * the quilt sweeps sideways; leaving levels the wings. A new `season` re-dyes
 * the quilt field by field from the horizon in. The bank chip at the foot is a
 * real slider (arrows, Page keys, Home and End). The loop runs only on screen
 * and while something moves; under reduced motion it is one still frame, and a
 * projected-quad still stands in without WebGL2.
 */
export function QuiltedFields({
  children,
  speed = 0.4,
  altitude = 0.35,
  season = "summer",
  bank,
  defaultBank = 0,
  onBankChange,
  followPointer = true,
  levelOnLeave = true,
  fieldSize = 0.5,
  hedgerows = 0.6,
  haze = 0.5,
  palette,
  skyColor = DEFAULT_SKY,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Bank",
  disabled = false,
  className,
}: QuiltedFieldsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const skyId = `${uid}-sky`;
  const hazeId = `${uid}-haze`;

  const [own, setOwn] = React.useState(() =>
    Math.round(clamp(defaultBank, -MAX_BANK, MAX_BANK)),
  );
  const angle = Math.round(clamp(bank ?? own, -MAX_BANK, MAX_BANK));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const fields = (
    palette && palette.length >= 4
      ? palette.slice(0, 4)
      : SEASONS[season].slice(0, 4)
  ) as string[];
  const hedge = SEASONS[season][4] ?? "oklch(0.4 0.07 146)";
  // The haze is the sky with a little of the land in it.
  const hazeColour = `color-mix(in oklab, ${skyColor} 72%, ${fields[1] ?? skyColor})`;
  const colours = [...fields, hedge, skyColor, hazeColour, THREAD];

  const config: Config = {
    colorKey: colours.join("|"),
    speed,
    altitude,
    fieldSize,
    hedgerows,
    haze,
    seed,
    dpr,
    paused,
    motionSafe,
    bank: angle,
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
      visible.current = false;
    };
  }, []);

  /** Banks the flight and reports whole degrees, from the gesture that moved it. */
  const setBank = (degrees: number) => {
    if (disabled) return;
    const next = clamp(degrees, -MAX_BANK, MAX_BANK);
    engine.current?.aim(next);
    const whole = Math.round(next);
    if (whole === angle) return;
    if (bank === undefined) setOwn(whole);
    onBankChange?.(whole);
  };

  const bankAt = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return 0;
    const r = root.getBoundingClientRect();
    const t = (clientX - r.left) / Math.max(1, r.width);
    return clamp((t - 0.5) * 2.1 * MAX_BANK, -MAX_BANK, MAX_BANK);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || !followPointer,
    onMove: ({ point }) => setBank(bankAt(point.x)),
    onEnd: () => {
      if (levelOnLeave) setBank(0);
    },
    onCancel: () => {
      if (levelOnLeave) setBank(0);
    },
    onTap: (event) => {
      if (event.pointerType === "touch") setBank(bankAt(event.clientX));
    },
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const step: Record<string, number> = {
      ArrowRight: 5,
      ArrowUp: 5,
      ArrowLeft: -5,
      ArrowDown: -5,
      PageUp: 10,
      PageDown: -10,
    };
    let next: number | null = null;
    if (event.key in step) next = angle + (step[event.key] ?? 0);
    else if (event.key === "Home") next = -MAX_BANK;
    else if (event.key === "End") next = MAX_BANK;
    if (next === null) return;
    event.preventDefault();
    setBank(next);
  };

  const quads = stillQuads(altitude, fieldSize, seed);

  return (
    <div
      ref={bindRoot}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (!followPointer || disabled || event.pointerType === "touch") return;
        setBank(bankAt(event.clientX));
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch" || !followPointer) return;
        if (levelOnLeave) setBank(0);
      }}
      className={cn(
        "group/quilted-fields relative isolate h-full w-full touch-pan-y overflow-clip rounded-3 [contain:paint] select-none",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 1000 300"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 size-full group-data-live/quilted-fields:hidden"
      >
        <defs>
          <linearGradient id={skyId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={skyColor} />
            <stop offset="1" stopColor={hazeColour} />
          </linearGradient>
          <linearGradient id={hazeId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0.3" stopColor={hazeColour} stopOpacity={1} />
            <stop offset="0.5" stopColor={hazeColour} stopOpacity={0.5} />
            <stop offset="0.8" stopColor={hazeColour} stopOpacity={0} />
          </linearGradient>
        </defs>
        <rect width="1000" height="300" fill={`url(#${skyId})`} />
        {quads.map((q, i) => (
          <path
            key={i}
            d={q.d}
            fill={fields[q.fill] ?? fields[0]}
            stroke={hedge}
            strokeWidth={r3(0.4 + clamp(hedgerows, 0, 1) * 1.6 * (1 - q.far))}
            strokeLinejoin="round"
          />
        ))}
        <rect width="1000" height="300" fill={`url(#${hazeId})`} />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-500 group-data-live/quilted-fields:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {colours.map((c, i) => (
          <span key={i} style={{ color: c }} />
        ))}
      </span>
      {/* The theme sentinel: a 1 ms colour transition reports a theme flip. */}
      <span
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours(false)}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: skyColor }}
      />
      <div className="relative z-10 size-full">{children}</div>
      <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2">
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-describedby={hintId}
          aria-valuemin={MIN_BANK}
          aria-valuemax={MAX_BANK}
          aria-valuenow={angle}
          aria-valuetext={describe(angle)}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          className={cn(
            "flex size-8 items-center justify-center rounded-full border border-hairline-strong bg-card/70 backdrop-blur-sm",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled && "opacity-50",
          )}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-6">
            <circle cx="12" cy="12" r="10.5" className="fill-surface-2" />
            <motion.g
              initial={false}
              animate={{ rotate: -angle }}
              transition={
                motionSafe ? springs.drift : { duration: durations.fast }
              }
              style={{ originX: 0.5, originY: 0.5 }}
            >
              <path
                d="M 1.5 12 A 10.5 10.5 0 0 0 22.5 12 Z"
                className="fill-ink-3"
                fillOpacity={0.45}
              />
              <line
                x1="3"
                x2="21"
                y1="12"
                y2="12"
                className="stroke-foreground"
                strokeWidth={1.2}
              />
            </motion.g>
            <path
              d="M 7 12.5 L 10.5 12.5 L 12 14 L 13.5 12.5 L 17 12.5"
              fill="none"
              className="stroke-signal"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys bank the flight left and right; the fields sweep sideways as
        it turns. Home and End bank fully, and the wings level at zero.
      </p>
    </div>
  );
}
