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

export type PolarGlowPalette = "polar" | "dusk" | "glacier" | "ember";

export type PolarGlowProps = {
  /** The content on top of the sky: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** A named palette, or 2 or 3 CSS colours of your own, lower edge first. @default "polar" */
  palette?: PolarGlowPalette | readonly string[];
  /** How strongly the curtains show, 0 (barely there) to 1 (vivid, still soft). @default 0.5 */
  intensity?: number;
  /** How fast the curtains drift and fold, 0 (still) to 2. @default 0.6 */
  speed?: number;
  /** How many curtains hang in the sky, 1 to 5. @default 3 */
  curtains?: number;
  /** How far up the frame a curtain's light reaches, 0.2 to 0.9 of its height. @default 0.6 */
  height?: number;
  /** How deeply the curtains fold, 0 (straight arcs) to 1. @default 0.5 */
  fold?: number;
  /** How blurred a curtain's lower edge is, 0 to 1. @default 0.7 */
  softness?: number;
  /** The star field behind, 0 to 1; it shows only on a dark page. @default 0.5 */
  stars?: number;
  /** The pointer and keyboard focus brighten the nearest curtain, and a press sends a surge along it. @default true */
  interactive?: boolean;
  /** How much the hand brightens a curtain and how hard a press surges, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the sky still; the hand still brightens it. @default false */
  paused?: boolean;
  /** Seeds the curtains' folds and the stars. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) brightening a curtain. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Pigments at fixed lightness, lower edge first: the same light on a dark sky and a pale one. */
const PALETTES: Record<PolarGlowPalette, readonly [string, string, string]> = {
  polar: [
    "oklch(from var(--signal) 0.8 calc(c * 0.85) h)",
    "oklch(from var(--signal) 0.74 calc(c * 0.6) calc(h + 32))",
    "oklch(from var(--accent-bright) 0.64 calc(c * 0.8) calc(h + 22))",
  ],
  dusk: ["oklch(0.8 0.1 22)", "oklch(0.71 0.12 342)", "oklch(0.6 0.12 296)"],
  glacier: [
    "oklch(0.86 0.08 194)",
    "oklch(0.76 0.09 220)",
    "oklch(0.62 0.1 256)",
  ],
  ember: ["oklch(0.82 0.11 78)", "oklch(0.71 0.13 42)", "oklch(0.58 0.12 14)"],
};

const GROUND = "var(--background)";
const STAR = "oklch(0.97 0.01 250)";
const MAX = 5;
/** A surge runs out along its curtain this fast, px/s, and fades over this long, s. */
const SURGE_SPEED = 440;
const SURGE_LIFE = 3;
const STEP = 1 / 120;
const GLIDE = springs.glide;
/** Each curtain's light follows its own drift spring, so the hand's light hands over smoothly. */
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
uniform int u_curtains;
uniform float u_intensity;
uniform float u_height;
uniform float u_fold;
uniform float u_soft;
uniform float u_stars;
uniform vec3 u_low;
uniform vec3 u_mid;
uniform vec3 u_high;
uniform vec3 u_ground;
uniform vec3 u_star;
uniform vec4 u_shape[${MAX}];
uniform vec4 u_phase[${MAX}];
uniform float u_boost[${MAX}];
uniform vec4 u_surge[${MAX}];
uniform vec3 u_hand;
uniform float u_still;
uniform float u_frame;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

void main() {
  float H = u_size.y;
  vec2 p = v_uv * u_size;
  float x = p.x / H;
  float y = p.y / H;
  float t = u_time;
  float hx = u_hand.x / H;
  float soft = mix(0.015, 0.1, u_soft);
  vec3 light = vec3(0.0);
  float sum = 0.0;
  for (int k = 0; k < ${MAX}; k++) {
    if (k >= u_curtains) break;
    vec4 sh = u_shape[k];
    vec4 ph = u_phase[k];
    // The lower edge: three slow folds travelling along the curtain.
    float a1 = x * sh.y + t * 0.09 + ph.x;
    float a2 = x * sh.y * 2.4 - t * 0.06 + ph.y;
    float a3 = x * sh.y * 4.7 + t * 0.13 + ph.z;
    float edge = sh.x + u_fold * (0.09 * sin(a1) + 0.05 * sin(a2) + 0.025 * sin(a3));
    float slope = u_fold * (0.09 * sh.y * cos(a1) + 0.12 * sh.y * cos(a2) + 0.1175 * sh.y * cos(a3));
    float d = edge - y;
    float rise = smoothstep(-soft, soft * 0.4, d);
    float fade = exp(-max(d, 0.0) / (u_height * sh.z));
    // A sheet seen edge-on, where it folds toward you, is brighter.
    float folds = 1.0 + 1.1 * clamp(abs(slope) * 2.2, 0.0, 1.0);
    float blotch = 0.5 + 0.5 * kx_noise(vec2(x * 1.3 + t * 0.02 + ph.w, float(k) * 5.3));
    float grain = 1.0 + 0.08 * (kx_noise(vec2(x * 7.0 + t * 0.03, d * 0.7 + float(k) * 3.1)) - 0.5);
    float I = rise * fade * folds * blotch * grain * sh.w;
    // The hand brightens the curtain it is nearest, around itself.
    float hd = (x - hx) / 0.55;
    I *= 1.0 + 1.3 * u_boost[k] * exp(-hd * hd);
    // A surge runs out both ways from a press; under reduced motion the
    // whole curtain brightens and fades instead.
    vec4 su = u_surge[k];
    if (su.z > 0.0) {
      float front = (abs(x - su.x / H) - ${SURGE_SPEED.toFixed(1)} / H * su.y) / 0.2;
      float ring = u_still > 0.5 ? 1.0 : exp(-front * front);
      I *= 1.0 + 2.2 * su.z * ring * exp(-su.y / 1.1);
    }
    vec3 c = mix(u_low, u_mid, smoothstep(0.0, u_height * 0.45, d));
    c = mix(c, u_high, smoothstep(u_height * 0.35, u_height * 1.1, d));
    light += c * I;
    sum += I;
  }
  float lum = dot(u_ground, vec3(0.2126, 0.7152, 0.0722));
  vec3 sky = u_ground * (0.93 + 0.07 * y);
  float a = clamp(sum * u_intensity * 0.5, 0.0, 0.82);
  vec3 col = mix(sky, light / max(sum, 0.0001), a);

  // Stars, on a dark page only: one in some 22 px cells, soft, slowly
  // twinkling, dimmed by the light in front of them and the haze below.
  vec2 cell = floor(p / 22.0);
  vec2 jitter = vec2(kx_hash(cell + 3.1), kx_hash(cell + 7.7));
  float has = step(kx_hash(cell + 11.3), 0.34);
  vec2 star = (cell + 0.15 + 0.7 * jitter) * 22.0;
  float r = 0.45 + 0.65 * kx_hash(cell + 19.1);
  float dist = length(p - star);
  float tw = 0.7 + 0.3 * sin(t * (0.4 + kx_hash(cell + 5.0)) * 2.0 + kx_hash(cell) * 6.28);
  float glow = exp(-dist * dist / (r * r)) * (0.35 + 0.65 * kx_hash(cell + 2.2)) * tw * has;
  float seen = u_stars * pow(1.0 - lum, 3.0) * (1.0 - 0.85 * a) * smoothstep(1.0, 0.55, y);
  col += u_star * glow * seen;

  float n = kx_hash(gl_FragCoord.xy + vec2(u_frame * 17.0, u_frame * 31.0));
  col += (n - 0.5) / 255.0 * 1.5;
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
  paletteKey: string;
  intensity: number;
  speed: number;
  curtains: number;
  height: number;
  fold: number;
  softness: number;
  stars: number;
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
  surge: (strength: number) => void;
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
  /** Low, mid, high, ground, star: RGB 0–1. */
  const colours = new Float32Array(15);
  /** Per curtain: base height, fold frequency, reach, brightness; and four phases. */
  const shape = new Float32Array(MAX * 4);
  const phase = new Float32Array(MAX * 4);
  const boost = new Float32Array(MAX);
  const boostV = new Float32Array(MAX);
  const surges = new Float32Array(MAX * 4);
  const size = { w: 0, h: 0 };
  const sim = { t: 0 };
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  /** The curtains, laid out once per seed: the same sky every visit. */
  const lay = () => {
    const c = cfg;
    if (!c) return;
    const rand = lcg(c.seed * 19 + 4);
    const n = clamp(Math.round(c.curtains), 1, MAX);
    for (let k = 0; k < MAX; k += 1) {
      const depth = n > 1 ? k / (n - 1) : 0.5;
      shape[k * 4] = 0.44 + 0.3 * depth + (rand() - 0.5) * 0.08;
      shape[k * 4 + 1] = 0.8 + 0.6 * rand();
      shape[k * 4 + 2] = 0.55 + 0.35 * rand();
      shape[k * 4 + 3] = 0.65 + 0.35 * rand();
      for (let j = 0; j < 4; j += 1) phase[k * 4 + j] = rand() * Math.PI * 2;
    }
  };

  /** The lower edge of curtain k at x (px), as a share of the height; mirrors the shader. */
  const edgeAt = (k: number, xpx: number) => {
    const c = cfg;
    const H = Math.max(1, size.h);
    const x = xpx / H;
    const t = sim.t;
    const f = shape[k * 4 + 1] ?? 1;
    const fold = clamp(c?.fold ?? 0.5, 0, 1);
    return (
      (shape[k * 4] ?? 0.5) +
      fold *
        (0.09 * Math.sin(x * f + t * 0.09 + (phase[k * 4] ?? 0)) +
          0.05 * Math.sin(x * f * 2.4 - t * 0.06 + (phase[k * 4 + 1] ?? 0)) +
          0.025 * Math.sin(x * f * 4.7 + t * 0.13 + (phase[k * 4 + 2] ?? 0)))
    );
  };

  /** The curtain whose light is nearest the hand. */
  const nearest = () => {
    const c = cfg;
    const n = clamp(Math.round(c?.curtains ?? 3), 1, MAX);
    const H = Math.max(1, size.h);
    const y = hand.py / H;
    const reach = clamp(c?.height ?? 0.6, 0.2, 0.9);
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < n; k += 1) {
      const d = Math.abs(y - (edgeAt(k, hand.px) - reach * 0.2));
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
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
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform2f(u.u_size ?? null, size.w, size.h);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1i(u.u_curtains ?? null, clamp(Math.round(c.curtains), 1, MAX));
    gl.uniform1f(u.u_intensity ?? null, clamp(c.intensity, 0, 1));
    gl.uniform1f(u.u_height ?? null, clamp(c.height, 0.2, 0.9));
    gl.uniform1f(u.u_fold ?? null, clamp(c.fold, 0, 1));
    gl.uniform1f(u.u_soft ?? null, clamp(c.softness, 0, 1));
    gl.uniform1f(u.u_stars ?? null, clamp(c.stars, 0, 1));
    gl.uniform4fv(u.u_shape ?? null, shape);
    gl.uniform4fv(u.u_phase ?? null, phase);
    const names = ["u_low", "u_mid", "u_high", "u_ground", "u_star"];
    names.forEach((name, i) => {
      gl.uniform3f(
        u[name] ?? null,
        colours[i * 3] ?? 0,
        colours[i * 3 + 1] ?? 0,
        colours[i * 3 + 2] ?? 0,
      );
    });
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_time ?? null, sim.t);
    gl.uniform3f(u.u_hand ?? null, hand.px, hand.py, 0);
    gl.uniform1fv(u.u_boost ?? null, boost);
    gl.uniform4fv(u.u_surge ?? null, surges);
    gl.uniform1f(u.u_still ?? null, c.motionSafe ? 0 : 1);
    gl.uniform1f(u.u_frame ?? null, c.motionSafe ? frames % 64 : 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    frames += 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the sky, the hand, each curtain's light and the surges. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const drifting = c.motionSafe && !c.paused && c.speed > 0;
    if (drifting) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    if (c.motionSafe) {
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
      }
    }
    const handMoving =
      c.motionSafe &&
      (Math.abs(hand.x - hand.px) + Math.abs(hand.y - hand.py) > 0.1 ||
        Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5);
    if (!handMoving) {
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
    } else moving = true;
    const n = clamp(Math.round(c.curtains), 1, MAX);
    const lit = hand.present && c.interactive ? nearest() : -1;
    const strength = clamp(c.strength, 0, 1);
    // Reduced motion: the light still comes and goes, as a quick fade.
    const fade = 1 - Math.exp(-dt / 0.15);
    for (let k = 0; k < MAX; k += 1) {
      const want = k === lit && k < n ? strength : 0;
      let b = boost[k] ?? 0;
      let v = boostV[k] ?? 0;
      if (c.motionSafe) {
        for (let s = 0; s < steps; s += 1) {
          v +=
            ((DRIFT.stiffness * (want - b) - DRIFT.damping * v) / DRIFT.mass) *
            h;
          b += v * h;
        }
      } else {
        b += (want - b) * fade;
        v = 0;
      }
      if (Math.abs(want - b) < 0.002 && Math.abs(v) < 0.01) {
        b = want;
        v = 0;
      } else moving = true;
      boost[k] = b;
      boostV[k] = v;
      if ((surges[k * 4 + 2] ?? 0) > 0) {
        const age = (surges[k * 4 + 1] ?? 0) + dt;
        if (age > SURGE_LIFE) surges[k * 4 + 2] = 0;
        else {
          surges[k * 4 + 1] = age;
          moving = true;
        }
      }
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Drifting alone, the sky moves slowly enough for two dozen frames a
    // second; the hand and a surge get every frame.
    let calm = !hand.present;
    for (let k = 0; k < MAX && calm; k += 1) {
      if ((boost[k] ?? 0) !== 0 || (surges[k * 4 + 2] ?? 0) > 0) calm = false;
    }
    if (calm && last && now - drawnAt < 41) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = step(dt);
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
        lay();
        // A composed moment to start from, the same for every visit.
        sim.t = 30 + lcg(next.seed * 3 + 1)() * 60;
        if (!startGpu()) {
          // No WebGL2 here: the CSS still sky stays, and nothing retries.
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
      if (was.seed !== next.seed || was.curtains !== next.curtains) lay();
      if (was.dpr !== next.dpr) resize();
      if (was.paletteKey !== next.paletteKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
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
      if (!hand.present || !c.motionSafe) {
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
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      kick();
    },
    surge(strength) {
      const c = cfg;
      if (!c || !c.interactive) return;
      const k = nearest();
      surges[k * 4] = hand.x;
      surges[k * 4 + 1] = 0;
      surges[k * 4 + 2] = clamp(c.strength, 0, 1) * strength;
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
 * A background of a night sky with an aurora barely there in it, low in
 * contrast so a headline sits on it comfortably, with the content on top in
 * its own layer. Broad, blurred curtains of light hang across the sky: each
 * one's lower edge folds in three slow travelling waves, its light rises from
 * that edge and fades upward, coloured from the palette's lower colour to its
 * upper one, brighter where the sheet folds toward you and patchy along its
 * length — no rays, no hard edges. Behind them a faint field of stars
 * twinkles slowly, dimmed by the light in front of it and shown only on a
 * dark page; on a light page the curtains are a pale wash at dawn.
 *
 * The curtain nearest the pointer brightens around it, each curtain's light
 * following its own drift spring so the light hands over smoothly as the hand
 * moves between them; a press sends a surge along the nearest curtain, a
 * brightening that runs out both ways and fades. Keyboard focus on a control
 * inside brightens the curtain nearest it and sends a softer surge. One WebGL2
 * pass; two dozen frames a second while it only drifts, every frame for the
 * hand, nothing off screen. Without WebGL2 a CSS still sky stands in; under
 * reduced motion one composed moment is held and the hand's light comes and
 * goes as a fade.
 */
export function PolarGlow({
  children,
  palette = "polar",
  intensity = 0.5,
  speed = 0.6,
  curtains = 3,
  height = 0.6,
  fold = 0.5,
  softness = 0.7,
  stars = 0.5,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: PolarGlowProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo<readonly [string, string, string]>(() => {
    if (typeof palette === "string") {
      return PALETTES[palette as PolarGlowPalette] ?? PALETTES.polar;
    }
    const [a, b, c] = palette;
    if (!a || !b) return PALETTES.polar;
    return [a, c ? b : `color-mix(in oklab, ${a} 50%, ${b})`, c ?? b];
  }, [palette]);
  const paletteKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    paletteKey,
    intensity,
    speed,
    curtains,
    height,
    fold,
    softness,
    stars,
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
    // A press on a control is the control's; only the sky surges.
    if (!hit || !rootRef.current?.contains(hit)) engine.current?.surge(1);
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
    engine.current?.surge(0.6);
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
        // A sideways drag works the light on touch; an upright one scrolls.
        "group/polar-glow relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/polar-glow:opacity-0"
        style={standIn(paints, intensity)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[...paints, GROUND, STAR].map((paint, i) => (
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
 * The designed still sky for the server render, the first paint and any
 * browser without WebGL2: soft washes of the palette over the page, and a
 * few stars whose alpha comes from the page's own lightness, so they vanish
 * on a light page.
 */
function standIn(
  paints: readonly [string, string, string],
  intensity: number,
): React.CSSProperties {
  const [low, mid, high] = paints;
  const k = clamp(intensity, 0, 1);
  const share = (n: number) => Math.round(n * (0.4 + 0.9 * k));
  const star = `oklch(from var(--background) 0.97 0.01 250 / calc((1 - l) * 0.6))`;
  return {
    backgroundColor: GROUND,
    backgroundImage: [
      `radial-gradient(ellipse 60% 34% at 30% 66%, color-mix(in oklab, ${low} ${share(34)}%, transparent), transparent 72%)`,
      `radial-gradient(ellipse 52% 30% at 72% 56%, color-mix(in oklab, ${mid} ${share(28)}%, transparent), transparent 74%)`,
      `radial-gradient(ellipse 90% 46% at 50% 30%, color-mix(in oklab, ${high} ${share(18)}%, transparent), transparent 76%)`,
      `radial-gradient(circle at 13px 17px, ${star} 0 0.8px, transparent 1.4px)`,
      `radial-gradient(circle at 61px 44px, ${star} 0 0.6px, transparent 1.2px)`,
    ].join(", "),
    backgroundSize: "100% 100%, 100% 100%, 100% 100%, 97px 61px, 97px 61px",
  };
}
