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

export type NightVeilTone = "indigo" | "plum" | "teal" | "ember";

export type NightVeilProps = {
  /** The content on top of the veil: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The faint colour under the veil: a named tone or any CSS colour. @default "indigo" */
  tone?: NightVeilTone | (string & {});
  /** How much the veil moves, 0 (a still image) to 1 (clearly flowing). @default 0.35 */
  motion?: number;
  /** How far the edges close in, 0 (none) to 1 (a deep vignette). @default 0.55 */
  vignette?: number;
  /** How deep the veil's slow breath runs, 0 (none) to 1. @default 0.5 */
  breath?: number;
  /** One full breath, in milliseconds. @default 9000 */
  breathDuration?: number;
  /** Layers of veil over one another, 2 to 4. @default 3 */
  layers?: number;
  /** The size of the broadest wisps, px. @default 420 */
  scale?: number;
  /** A whisper of film grain that also hides banding, 0 to 1. @default 0.3 */
  grain?: number;
  /** The pointer and keyboard focus lift light under the veil, and a press takes a deep breath. @default true */
  interactive?: boolean;
  /** How much light the hand lifts and how far a breath parts the veil, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the hand's light reaches, px. @default 220 */
  radius?: number;
  /** Hold the veil still; the hand still lifts the light. @default false */
  paused?: boolean;
  /** Seeds the veil, so two never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) lifting the light. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a deep breath is drawn (true) and when it is let out (false). */
  onBreathChange?: (inhaling: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Undertones as pigments at a fixed lightness, so the tint is the same tint
 * in either theme; indigo is the theme's own accent, quietened.
 */
const TONES: Record<NightVeilTone, string> = {
  indigo: "oklch(from var(--accent) 0.56 calc(c * 0.55) h)",
  plum: "oklch(0.56 0.1 330)",
  teal: "oklch(0.6 0.075 205)",
  ember: "oklch(0.62 0.11 48)",
};

/** The image is soft by nature: half the capped pixel ratio, scaled up by the browser. */
const RENDER_SCALE = 0.5;
const STEP = 1 / 120;
/** Drifting alone, 24 frames a second is plenty for something this slow. */
const CALM_FRAME = 41;
/** A breath is drawn for at least one beat, however short the press. */
const BEAT = 450;
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

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
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

/** What a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform float u_breathe;
uniform float u_layers;
uniform float u_scale;
uniform float u_vignette;
uniform float u_grain;
uniform float u_frame;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_tone;
uniform vec4 u_hand;
uniform float u_inhale;
uniform vec2 u_seed;
in vec2 v_uv;
out vec4 outColor;

// A sine-free hash: stays even when the clock has run for hours.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Four octaves, each turned so no grid ever lines up.
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = turn * p * 2.03 + vec2(11.7, 4.3);
    amp *= 0.5;
  }
  return sum / 0.9375;
}

void main() {
  vec2 size = u_res / u_px;
  vec2 css = v_uv * size;
  vec2 mid = size * 0.5;
  // The breath swells the whole veil about its middle by a hair.
  vec2 p = (css - mid) * (1.0 - 0.015 * u_breathe) + mid;
  float t = u_time;

  vec2 toHand = css - u_hand.xy;
  float d = length(toHand) / u_hand.w;
  float lift = exp(-d * d * 1.6) * u_hand.z;
  float reach = 1.0 + 0.8 * u_inhale;
  float part = exp(-(d * d) / (reach * reach) * 1.2);
  float parting = part * (0.22 * u_hand.z + 0.78 * u_inhale);

  float veil = 0.0;
  float broad = 0.5;
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    if (fi >= u_layers) break;
    float k = 1.0 / (u_scale * pow(0.56, fi));
    float heading = 0.35 + fi * 0.9 + u_seed.x;
    vec2 dir = vec2(cos(heading), sin(heading));
    // Each layer is stretched along its own heading, so the finer ones read
    // as drawn-out gauze rather than cloud.
    vec2 r = p + dir * t * (6.0 + 5.0 * fi);
    vec2 along = vec2(dot(r, dir), dot(r, vec2(-dir.y, dir.x)));
    vec2 q = along * k * vec2(1.0 / (1.0 + fi * 0.8), 1.0) + u_seed * (1.0 + fi);
    // A slow field bends each layer, so wisps curl rather than slide.
    vec2 bend = vec2(noise(q * 0.45 + t * 0.021), noise(q * 0.45 + vec2(4.1, 7.3) - t * 0.017));
    float f = fbm(q + (bend - 0.5) * 1.6);
    float lo = 0.42 - 0.06 * u_breathe;
    float w;
    if (i == 0) {
      broad = f;
      w = smoothstep(lo, lo + 0.3, f);
    } else {
      float ridge = 1.0 - abs(2.0 * f - 1.0);
      w = pow(max(ridge, 0.0), 3.0) * smoothstep(0.25, 0.7, f + 0.1 * u_breathe);
    }
    float weight = i == 0 ? 1.0 : 0.75 / (1.0 + (fi - 1.0) * 0.5);
    veil += w * weight;
    total += weight;
  }
  veil = clamp(veil / max(total, 1e-3) * 1.35, 0.0, 1.0);
  veil *= 1.0 - 0.72 * parting;

  float edge = length((v_uv - 0.5) * vec2(1.0, 0.86)) * 1.42;
  float vig = smoothstep(0.3, 1.1, edge) * u_vignette * (1.0 - 0.3 * u_inhale);
  float pool = smoothstep(0.1, 1.0, v_uv.y) * (0.45 + 0.55 * broad);
  float glow = lift * (1.0 + 0.6 * u_inhale);

  // Night: a near-black ground, the undertone pooling low and in the thick
  // veil, wisps of pale light, the hand's light caught in them from beneath.
  vec3 night = u_bg * 0.8 + u_tone * 0.025;
  night += u_tone * 0.2 * pool;
  vec3 wisp = mix(u_fg, u_tone, 0.5);
  night = mix(night, wisp, veil * (0.17 + 0.05 * u_breathe));
  night += mix(u_tone, u_fg, 0.5) * glow * (0.07 + 0.26 * veil);
  night *= 1.0 - vig * 0.72;

  // Day: the same veil as a pale mist over a soft grey-tinted ground, the
  // hand clearing it toward paper white.
  vec3 ground = mix(mix(u_bg, u_fg, 0.13), u_tone, 0.09);
  vec3 day = mix(ground, u_tone, 0.17 * pool);
  vec3 mist = mix(u_bg, vec3(1.0), 0.85);
  day = mix(day, mist, veil * (0.72 + 0.1 * u_breathe));
  day = mix(day, mix(vec3(1.0), u_tone, 0.04), clamp(glow * 0.6, 0.0, 1.0));
  day = mix(day, mix(ground, mix(u_fg, u_tone, 0.5), 0.16), vig * 0.8);

  vec3 col = mix(night, day, u_light);
  float grain = hash(gl_FragCoord.xy + vec2(u_frame * 17.0, u_frame * 31.0)) - 0.5;
  col += grain * u_grain * mix(0.028, 0.02, u_light);
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
  toneKey: string;
  motion: number;
  vignette: number;
  breath: number;
  breathDuration: number;
  layers: number;
  scale: number;
  grain: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onBreath: (inhaling: boolean) => void;
};

type Source = "pointer" | "focus";

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: Source) => void;
  handAway: (source: Source) => void;
  /** A breath drawn: `hold` keeps it in until `exhale()`; otherwise one beat. */
  inhale: (strength: number, hold: boolean) => void;
  exhale: () => void;
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
  const colours = new Float32Array(9);
  const size = { w: 0, h: 0 };
  let light = 0;
  const sim = { clock: 0, breath: 0 };
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
    source: null as Source | null,
  };
  const breath = {
    value: 0,
    v: 0,
    strength: 0,
    held: false,
    until: 0,
    drawn: false,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const setDrawn = (next: boolean) => {
    if (breath.drawn === next) return;
    breath.drawn = next;
    cfg?.onBreath(next);
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

  const radiusOf = (c: Config) =>
    clamp(c.radius, 40, Math.max(40, Math.min(size.w, size.h) * 1.1));

  /** Uniforms that change only with props, size or theme. */
  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const rand = lcg(c.seed * 31 + 7);
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_layers ?? null, Math.round(clamp(c.layers, 2, 4)));
    gl.uniform1f(u.u_scale ?? null, clamp(c.scale, 80, 2400));
    gl.uniform1f(u.u_vignette ?? null, clamp(c.vignette, 0, 1));
    gl.uniform1f(u.u_grain ?? null, clamp(c.grain, 0, 1));
    gl.uniform1f(u.u_light ?? null, light);
    gl.uniform2f(u.u_seed ?? null, rand() * 12, rand() * 12);
    gl.uniform3f(
      u.u_bg ?? null,
      colours[0] ?? 0,
      colours[1] ?? 0,
      colours[2] ?? 0,
    );
    gl.uniform3f(
      u.u_fg ?? null,
      colours[3] ?? 1,
      colours[4] ?? 1,
      colours[5] ?? 1,
    );
    gl.uniform3f(
      u.u_tone ?? null,
      colours[6] ?? 0.4,
      colours[7] ?? 0.4,
      colours[8] ?? 0.7,
    );
  };

  /** The slow ambient breath, -1 to 1 scaled by its depth. */
  const breathe = (c: Config) => {
    const period = Math.max(2, c.breathDuration / 1000);
    return (
      Math.sin((sim.breath / period) * Math.PI * 2) * clamp(c.breath, 0, 1)
    );
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_time ?? null, sim.clock);
    gl.uniform1f(u.u_breathe ?? null, c.motionSafe ? breathe(c) : 0);
    gl.uniform4f(u.u_hand ?? null, hand.px, hand.py, hand.amount, radiusOf(c));
    gl.uniform1f(u.u_inhale ?? null, breath.value);
    gl.uniform1f(u.u_frame ?? null, c.motionSafe ? frames % 64 : 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    frames += 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the veil, the hand and the breath. Returns whether anything still moves. */
  const step = (dt: number, now: number): boolean => {
    const c = cfg;
    if (!c) return false;
    const drifting = !c.paused && c.motion > 0;
    if (drifting) {
      // A breath held in slows the veil, the way the room goes still.
      sim.clock += dt * clamp(c.motion, 0, 1) * (1 - 0.5 * breath.value);
      sim.breath += dt;
    }
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    const inhaling = breath.held || now < breath.until;
    if (!inhaling) setDrawn(false);
    const target = inhaling ? breath.strength : 0;
    // In on the glide spring, out on the slower, heavier drift.
    const lung = target > breath.value ? GLIDE : DRIFT;
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
      breath.v +=
        ((lung.stiffness * (target - breath.value) - lung.damping * breath.v) /
          lung.mass) *
        h;
      breath.value += breath.v * h;
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
    const breathing =
      inhaling ||
      Math.abs(target - breath.value) > 0.002 ||
      Math.abs(breath.v) > 0.01;
    if (!breathing) {
      breath.value = target;
      breath.v = 0;
    }
    return (
      drifting || (handMoving && hand.amount > 0.001) || arriving || breathing
    );
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const calm =
      !hand.present &&
      hand.amount === 0 &&
      breath.value === 0 &&
      !breath.held &&
      now >= breath.until;
    if (calm && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt, now) : false;
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
    for (let i = 0; i < 3; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    // The page decides the recipe: a dark page gets night, a light one mist.
    const lum =
      0.2126 * (colours[0] ?? 0) +
      0.7152 * (colours[1] ?? 0) +
      0.0722 * (colours[2] ?? 0);
    light = lum > 0.5 ? 1 : 0;
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

  /** Reduced motion: the hand and the breath land exactly where they are going. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    hand.px = hand.x;
    hand.py = hand.y;
    hand.vx = 0;
    hand.vy = 0;
    hand.amount =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    hand.amountV = 0;
    breath.value = breath.held ? breath.strength : 0;
    breath.v = 0;
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
      if (was.toneKey !== next.toneKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
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
      if (!c || !c.interactive) return;
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
      if (!c.motionSafe) {
        place();
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
        place();
        draw();
        return;
      }
      kick();
    },
    inhale(strength, hold) {
      const c = cfg;
      if (!c || !c.interactive) return;
      breath.strength = clamp(strength, 0, 1) * (0.4 + 0.6 * c.pointerStrength);
      breath.held = hold;
      breath.until = performance.now() + BEAT;
      setDrawn(true);
      if (!c.motionSafe) {
        // Still frames: a held press shows the parted veil, a beat does not.
        place();
        draw();
        if (!hold) setDrawn(false);
        return;
      }
      kick();
    },
    exhale() {
      if (!breath.held) return;
      breath.held = false;
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
        setDrawn(false);
        return;
      }
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
 * A quiet hero background: a near-black ground with a faint coloured
 * undertone and two to four layers of soft noise veil drifting over it at
 * their own scales and headings, bent by a slow field so the wisps curl, all
 * closed by a soft vignette. On a light page the same recipe is a pale mist.
 * The veil breathes — a slow inhale and exhale that thickens it and swells
 * it by a hair — so a headline sits on something alive but never busy.
 *
 * The pointer lifts a gentle light under the veil, its place following on
 * the glide spring and its presence arriving on drift. A press on the bare
 * background draws a deep breath: in on glide for at least one beat, held
 * while the press is, out on drift — the veil parts around the hand, the
 * light brightens and the edges open. Keyboard focus on a control inside is
 * the hand at that control, with a softer breath. One fullscreen WebGL2 draw
 * at half the capped pixel ratio, 24 frames a second while it only drifts,
 * nothing off screen or in a hidden page. Without WebGL2 a CSS still frame
 * stands in; under reduced motion one still frame is drawn and the hand and
 * the breath land exactly where they are going.
 */
export function NightVeil({
  children,
  tone = "indigo",
  motion = 0.35,
  vignette = 0.55,
  breath = 0.5,
  breathDuration = 9000,
  layers = 3,
  scale = 420,
  grain = 0.3,
  interactive = true,
  pointerStrength = 0.6,
  radius = 220,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onBreathChange,
  className,
}: NightVeilProps) {
  const motionSafe = useMotionSafe();
  const toneColour =
    (TONES as Record<string, string | undefined>)[tone] ?? tone;
  const paints = React.useMemo(
    () => ["var(--background)", "var(--foreground)", toneColour],
    [toneColour],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportActive = React.useRef(onActiveChange);
  const reportBreath = React.useRef(onBreathChange);
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    toneKey: toneColour,
    motion,
    vignette,
    breath,
    breathDuration,
    layers,
    scale,
    grain,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => reportActive.current?.(a),
    onBreath: (b) => reportBreath.current?.(b),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportActive.current = onActiveChange;
    reportBreath.current = onBreathChange;
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
    const listening = unlisten;
    return () => {
      listening.current?.();
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

  const letGo = () => {
    unlisten.current?.();
    engine.current?.exhale();
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
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.inhale(1, true);
    // The breath is let out wherever the press ends, on the veil or not.
    unlisten.current?.();
    const id = event.pointerId;
    const end = (e: PointerEvent) => {
      if (e.pointerId === id) letGo();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    unlisten.current = () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      unlisten.current = null;
    };
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    letGo();
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
    engine.current?.inhale(0.6, false);
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
        // A sideways finger moves the light on touch; an upright one scrolls.
        "group/night-veil relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/night-veil:opacity-0"
        style={standIn(toneColour, seed)}
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
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the undertone pooled low, three seeded soft wisps
 * of the page's ink, and a vignette — the same quiet veil, held still.
 */
function standIn(tone: string, seed: number): React.CSSProperties {
  const rand = lcg(seed * 7 + 3);
  const at = () =>
    `${Math.round(12 + rand() * 76)}% ${Math.round(14 + rand() * 60)}%`;
  const wisp = "color-mix(in oklab, var(--foreground) 9%, transparent)";
  return {
    backgroundColor: `color-mix(in oklab, var(--background) 93%, ${tone})`,
    backgroundImage: [
      "radial-gradient(ellipse 72% 80% at 50% 46%, transparent 52%, color-mix(in oklab, black 18%, transparent) 100%)",
      `radial-gradient(ellipse 46% 38% at ${at()}, ${wisp} 0, transparent 70%)`,
      `radial-gradient(ellipse 38% 30% at ${at()}, ${wisp} 0, transparent 70%)`,
      `radial-gradient(ellipse 30% 26% at ${at()}, ${wisp} 0, transparent 72%)`,
      `radial-gradient(ellipse 90% 60% at 50% 110%, color-mix(in oklab, ${tone} 16%, transparent) 0, transparent 70%)`,
    ].join(", "),
  };
}
