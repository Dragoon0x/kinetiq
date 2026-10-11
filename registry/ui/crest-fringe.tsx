"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type CrestFringeProps = {
  /** Content in the tank's air above the water: a hero line, a caption. It stays fully interactive. */
  children?: React.ReactNode;
  /** How many crests stand across the tank, 1 (long rollers) to 6 (a choppy train). @default 3 */
  waves?: number;
  /** How far each crest splits the light, 0 (one white edge) to 1 (a wide rainbow fan). @default 0.55 */
  dispersion?: number;
  /** How fast the waves roll, 0 (still water) to 1 (brisk). @default 0.35 */
  speed?: number;
  /** How tall the waves stand, 0 to 1. @default 0.5 */
  swell?: number;
  /** How much of the tank is water, 0.25 to 0.8. @default 0.5 */
  level?: number;
  /** The lamp's angle behind the tank, degrees from −30 (below) to 30 (above) (controlled). */
  lightAngle?: number;
  /** The lamp's starting angle when uncontrolled. @default 8 */
  defaultLightAngle?: number;
  /** Fires from the hover, tap, drag or key that moved the lamp, with whole degrees. */
  onLightAngleChange?: (degrees: number) => void;
  /** A hovering mouse or pen sets the lamp's height; a finger taps it there. @default true */
  followPointer?: boolean;
  /** How strongly the lamp lights the tank from behind, 0 to 1. @default 0.6 */
  glow?: number;
  /** The water, any CSS colour; it deepens toward the floor. @default a blue from the accent token, light or dusk by theme */
  waterColor?: string;
  /** The backlit air above the water, any CSS colour. @default a pale (light) or night (dark) tint of the accent token */
  airColor?: string;
  /** The lamp's light, any CSS colour. @default a near-white from the accent hue */
  lightColor?: string;
  /** Hold the waves where they are. @default false */
  paused?: boolean;
  /** Seeds the phase of the two wave trains. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The lamp control's accessible name. @default "Lamp height" */
  label?: string;
  /** The lamp does not move. @default false */
  disabled?: boolean;
  /** Sizes the tank; it fills its parent by default. */
  className?: string;
};

const TAU = Math.PI * 2;
const MAX_ANGLE = 30;
const MIN_ANGLE = -30;
/** How far the second wave train's crests stand apart, as a ratio of the first's. */
const RATIO = 1.73;
/** The Stokes harmonic: crests peaked, troughs long. */
const STOKES = 0.28;
const RENDER_SCALE = 0.75;
const CALM_FRAME = 31;
const RAIL_INSET = 16;
const KNOB_H = 22;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_time;
uniform float u_k1;
uniform float u_w1;
uniform float u_amp;
uniform float u_level;
uniform float u_disp;
uniform float u_slopeL;
uniform float u_slopeMax;
uniform float u_lampY;
uniform float u_glow;
uniform float u_phase;
uniform float u_gain;
uniform vec3 u_air;
uniform vec3 u_water;
uniform vec3 u_deep;
uniform vec3 u_light;
uniform vec3 u_spec[7];
in vec2 v_uv;
out vec4 o_color;

const float STOKES = ${STOKES.toFixed(2)};
const float RATIO = ${RATIO.toFixed(2)};

// The surface at x: height (px, y down), slope and curvature, analytic.
vec3 surface(float x) {
  float th = u_k1 * x - u_w1 * u_time + u_phase;
  float c1 = cos(th);
  float c2 = cos(2.0 * th);
  float y = -u_amp * (c1 + STOKES * c2);
  float dy = u_amp * u_k1 * (sin(th) + 2.0 * STOKES * sin(2.0 * th));
  float ddy = u_amp * u_k1 * u_k1 * (c1 + 4.0 * STOKES * c2);
  // A second, shorter train at its own (slower) phase speed, as deep water does.
  float k2 = u_k1 * RATIO;
  float th2 = k2 * x - u_w1 * sqrt(RATIO) * u_time + u_phase * 2.3 + 1.7;
  float a2 = u_amp * 0.2;
  y -= a2 * cos(th2);
  dy += a2 * k2 * sin(th2);
  ddy += a2 * k2 * k2 * cos(th2);
  // The meniscus climbs each glass wall.
  y -= 3.0 * (exp(-x / 5.0) + exp(-(u_res.x - x) / 5.0));
  return vec3(u_level + y, dy, ddy);
}

void main() {
  vec2 p = v_uv * u_res;
  vec3 s = surface(p.x);
  float d = p.y - s.x;
  float H = u_res.y;
  float lamp = exp(-pow((p.y - u_lampY) / (H * 0.42), 2.0)) * u_glow;

  vec3 col;
  if (d < 0.0) {
    col = mix(u_air, u_light, lamp * 0.46);
  } else {
    float depth = clamp(d / max(1.0, H - u_level + u_amp), 0.0, 1.0);
    col = mix(u_water, u_deep, smoothstep(0.0, 1.0, depth));
    col += u_light * lamp * 0.16;
  }

  // The prism: seven wavelengths, each brightest where the surface slope meets
  // the lamp at that colour's own angle, so the spectrum lies along the wave;
  // each also falls into the water along its own refracted ray.
  float focusMax = u_amp * u_k1 * u_k1 * (1.0 + 4.0 * STOKES) + 1e-5;
  float width = u_slopeMax * 0.17 + 1e-4;
  float dd = max(d, 0.0);
  vec3 fringe = vec3(0.0);
  for (int j = 0; j < 7; j += 1) {
    float t = float(j) / 3.0 - 1.0;
    float sj = u_slopeL + u_disp * t * u_slopeMax * 0.55;
    float slant = u_slopeL * 0.5 + u_disp * t * 0.16;
    vec3 e = surface(p.x - dd * slant);
    float lit = exp(-pow((e.y - sj) / width, 2.0));
    // Convex crests focus the light; troughs only glint.
    float focus = 0.4 + 0.6 * smoothstep(-focusMax * 0.2, focusMax * 0.7, e.z);
    float de = p.y - e.x;
    float band = exp(-pow((de - 2.0 - t * u_disp * 1.6) / (1.1 + u_disp * 0.9), 2.0));
    float plume = de > 0.0 ? exp(-de / (H * 0.28)) * 0.22 : 0.0;
    float above = de < 0.0 ? exp(de / 2.2) * 0.25 : 0.0;
    fringe += u_spec[j] * lit * focus * (band * 1.4 + plume + above);
  }
  col += fringe * u_gain * (0.55 + 0.45 * u_glow);

  // The surface seen edge-on: a thin silver line.
  col = mix(col, u_light, exp(-d * d / 0.8) * 0.5);
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Seven wavelengths, red to violet, scaled so the seven sum to white. */
const SPECTRUM = (() => {
  const raw = [
    [1, 0.1, 0.06],
    [1, 0.45, 0.02],
    [0.95, 0.86, 0.06],
    [0.18, 1, 0.3],
    [0.02, 0.76, 1],
    [0.12, 0.32, 1],
    [0.58, 0.08, 1],
  ];
  const sum = [0, 0, 0];
  for (const c of raw) {
    for (let k = 0; k < 3; k += 1) sum[k] = (sum[k] ?? 0) + (c[k] ?? 0);
  }
  const out = new Float32Array(21);
  raw.forEach((c, j) => {
    for (let k = 0; k < 3; k += 1) out[j * 3 + k] = (c[k] ?? 0) / (sum[k] ?? 1);
  });
  return out;
})();

/** The still's spectrum, as oklch hues: fixed art, the same in both themes. */
const SPECTRUM_HUES = [27, 55, 96, 150, 205, 262, 305];

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
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

/** The wave's phase offset and the lamp's height in the box, shared by the shader and the still. */
const phaseOf = (seed: number) => hash(Math.round(seed), 7) * TAU;
const lampShare = (angle: number) =>
  0.5 - (clamp(angle, -MAX_ANGLE, MAX_ANGLE) / MAX_ANGLE) * 0.42;

type Config = {
  colorKey: string;
  waves: number;
  dispersion: number;
  speed: number;
  swell: number;
  level: number;
  glow: number;
  seed: number;
  dpr: number;
  paused: boolean;
  motionSafe: boolean;
  angle: number;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  /** Points the lamp at an angle (degrees); it eases there unless motion is reduced. */
  aim: (degrees: number) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  /** The angle a point's height asks for, from client y. */
  angleAt: (clientY: number) => number;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  knob: { current: HTMLElement | null },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let time = 0;
  const size = { w: 0, h: 0 };
  const read = rgbReader();
  // air, water, deep, light
  const colours = new Float32Array(12);
  let gain = 1;
  // The lamp: shown angle and its velocity, eased toward `aimAt` on the glide spring.
  let aimAt = 0;
  let shown = 0;
  let speed = 0;
  let aimed = false;

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

  const geometry = () => {
    const c = cfg;
    const w = Math.max(1, size.w);
    const h = Math.max(1, size.h);
    const waves = clamp(Math.round(c?.waves ?? 3), 1, 6);
    // A narrow tank keeps its crests from turning into spikes.
    const amp = Math.max(
      0.5,
      clamp(c?.swell ?? 0.5, 0, 1) * h * 0.085 * clamp(w / 700, 0.62, 1),
    );
    const k1 = (TAU * waves) / w;
    const slopeMax = amp * k1 * (1 + 2 * STOKES) + amp * 0.2 * k1 * RATIO;
    // Deep water: ω = √(gk), with g scaled to the tank so every size keeps one rhythm.
    const w1 = Math.sqrt(k1 * 40 * (w / 760));
    return {
      w,
      h,
      amp,
      k1,
      slopeMax,
      w1,
      level: h * (1 - clamp(c?.level ?? 0.5, 0.25, 0.8)),
    };
  };

  // The knob rides the eased angle through a custom property its `top`
  // reads; the server's markup carries the target angle in a fallback, so
  // the first paint already has the knob in place.
  const placeKnob = () => {
    knob.current?.style.setProperty("--lamp", String(r1(shown)));
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const g = geometry();
    p.program.set({
      u_res: [g.w, g.h],
      u_k1: g.k1,
      u_w1: g.w1,
      u_amp: g.amp,
      u_level: g.level,
      u_disp: clamp(c.dispersion, 0, 1),
      u_slopeMax: g.slopeMax,
      u_glow: clamp(c.glow, 0, 1),
      u_phase: phaseOf(c.seed),
      u_gain: gain,
      u_air: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_water: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
      u_deep: [colours[6] ?? 0, colours[7] ?? 0, colours[8] ?? 0],
      u_light: [colours[9] ?? 1, colours[10] ?? 1, colours[11] ?? 1],
      u_spec: SPECTRUM,
    });
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    placeKnob();
    if (!c || !p || p.lost || size.w < 1) return;
    const g = geometry();
    p.program.set({
      u_time: r3(time),
      u_slopeL: (shown / MAX_ANGLE) * g.slopeMax * 0.78,
      u_lampY: g.h * lampShare(shown),
    });
    p.gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const easing = () => Math.abs(aimAt - shown) > 0.01 || Math.abs(speed) > 0.01;
  const rolling = () => {
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
    const lamp = easing();
    // Only the waves rolling: thirty frames a second is plenty for a swell.
    if (!lamp && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    if (rolling()) time += dt * clamp(c.speed, 0, 1) * 2.2;
    if (lamp) {
      // The glide spring's own constants, sub-stepped so it is stable at any rate.
      const k = springs.glide.stiffness / springs.glide.mass;
      const damp = springs.glide.damping / springs.glide.mass;
      const steps = Math.ceil(dt / (1 / 240));
      for (let i = 0; i < steps; i += 1) {
        const h = dt / steps;
        speed += (-k * (shown - aimAt) - damp * speed) * h;
        shown += speed * h;
      }
      if (!easing()) {
        shown = aimAt;
        speed = 0;
      }
    }
    draw();
    if (rolling() || easing()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!rolling() && !easing()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    // Light pages get a stronger fringe: it adds onto lighter water, where it shows less.
    const lum =
      0.2126 * (colours[0] ?? 0) +
      0.7152 * (colours[1] ?? 0) +
      0.0722 * (colours[2] ?? 0);
    gain = lum > 0.5 ? 1.35 : 1.15;
    statics();
  };

  const resize = () => {
    const c = cfg;
    size.w = root.clientWidth;
    size.h = root.clientHeight;
    placeKnob();
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1 || size.h < 1) return;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    resizeGL(p.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? RENDER_SCALE : 1,
    });
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

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!aimed) {
        aimed = true;
        aimAt = next.angle;
        shown = next.angle;
        // A seeded phase per instance so two tanks side by side do not march in step.
        time = hash(Math.round(next.seed), 3) * 12;
      }
      if (next.angle !== aimAt) {
        aimAt = next.angle;
        if (!next.motionSafe) {
          shown = aimAt;
          speed = 0;
        }
      }
      if (failed) {
        shown = aimAt;
        placeKnob();
        return;
      }
      if (!gpu) {
        if (!start()) {
          // No WebGL2: the server's still stays, and nothing retries.
          failed = true;
          root.setAttribute("data-fallback", "");
          shown = aimAt;
          placeKnob();
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
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      draw();
      kick();
    },
    aim(degrees) {
      aimAt = clamp(degrees, -MAX_ANGLE, MAX_ANGLE);
      if (!cfg?.motionSafe || failed) {
        shown = aimAt;
        speed = 0;
        draw();
        return;
      }
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
    angleAt(clientY) {
      const r = root.getBoundingClientRect();
      const span = Math.max(1, r.height - 2 * RAIL_INSET);
      const t = (clientY - r.top - RAIL_INSET) / span;
      return clamp(MAX_ANGLE - t * 2 * MAX_ANGLE, -MAX_ANGLE, MAX_ANGLE);
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

/** The surface at x for the server's still, in a 1000 × 1000 box stretched over the tank. */
function stillSurface(
  x: number,
  waves: number,
  swell: number,
  level: number,
  phase: number,
) {
  const k1 = (TAU * waves) / 1000;
  const amp = clamp(swell, 0, 1) * 85;
  const th = k1 * x + phase;
  const k2 = k1 * RATIO;
  const th2 = k2 * x + phase * 2.3 + 1.7;
  return (
    1000 * (1 - clamp(level, 0.25, 0.8)) -
    amp * (Math.cos(th) + STOKES * Math.cos(2 * th)) -
    amp * 0.2 * Math.cos(th2)
  );
}

const describe = (deg: number) =>
  deg === 0
    ? "Lamp level with the water"
    : `Lamp ${Math.abs(deg)} ${Math.abs(deg) === 1 ? "degree" : "degrees"} ${deg > 0 ? "above" : "below"} level`;

/**
 * A glass tank seen side-on, a slow train of soft waves inside, lit from
 * behind by a broad white lamp. Where each crest curves it acts as a prism:
 * seven wavelengths are each brightest where the surface slope meets the lamp
 * at that colour's own angle, so the edge of every wave splits into a thin
 * spectrum that runs along the wave rather than across it, and each colour
 * drops a faint plume into the water along its own refracted ray — a small
 * rainbow fan under every crest. With `dispersion` at 0 the seven coincide
 * into one white meniscus line.
 *
 * The lamp's height is the light's angle and the component's value. A
 * hovering mouse sets it (a finger taps it), eased on the springs.glide
 * constants so the fringes slide along every wave from the back slope over
 * the crest to the front; the lamp rail on the right wall is a real slider
 * (arrows, Page keys, Home and End). One WebGL2 pass, run only on screen and
 * while something moves; a gradient still stands in without WebGL2. Under
 * reduced motion the waves hold still and the lamp moves at once.
 */
export function CrestFringe({
  children,
  waves = 3,
  dispersion = 0.55,
  speed = 0.35,
  swell = 0.5,
  level = 0.5,
  lightAngle,
  defaultLightAngle = 8,
  onLightAngleChange,
  followPointer = true,
  glow = 0.6,
  waterColor = "light-dark(oklch(from var(--accent) 0.6 0.075 calc(h - 28)), oklch(from var(--accent) 0.3 0.06 calc(h - 28)))",
  airColor = "light-dark(oklch(from var(--accent) 0.955 0.012 h), oklch(from var(--accent) 0.19 0.03 h))",
  lightColor = "light-dark(oklch(from var(--accent) 0.995 0.008 h), oklch(from var(--accent) 0.96 0.025 h))",
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Lamp height",
  disabled = false,
  className,
}: CrestFringeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const airId = `${uid}-air`;
  const waterId = `${uid}-water`;
  const specId = `${uid}-spec`;

  const [own, setOwn] = React.useState(() =>
    Math.round(clamp(defaultLightAngle, -MAX_ANGLE, MAX_ANGLE)),
  );
  const angle = Math.round(clamp(lightAngle ?? own, -MAX_ANGLE, MAX_ANGLE));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const railDrag = React.useRef(false);
  const tap = React.useRef<{ x: number; y: number; id: number } | null>(null);
  const knobRef = React.useRef<HTMLDivElement | null>(null);

  // Darker, same hue: the floor of the tank in either theme.
  const deep = `oklch(from ${waterColor} calc(l * 0.6) c h)`;
  const config: Config = {
    colorKey: `${airColor}|${waterColor}|${lightColor}`,
    waves,
    dispersion,
    speed,
    swell,
    level,
    glow,
    seed,
    dpr,
    paused,
    motionSafe,
    angle,
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
    const e = createEngine(root, canvas, carriers, visible, knobRef);
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

  /** Moves the lamp and reports whole degrees, from the gesture that moved it. */
  const setAngle = (degrees: number) => {
    if (disabled) return;
    const next = clamp(degrees, -MAX_ANGLE, MAX_ANGLE);
    engine.current?.aim(next);
    const whole = Math.round(next);
    if (whole === angle) return;
    if (lightAngle === undefined) setOwn(whole);
    onLightAngleChange?.(whole);
  };

  const rail = useDrag({
    axis: "y",
    threshold: 2,
    disabled,
    onStart: () => {
      railDrag.current = true;
    },
    onMove: ({ point }) => {
      const e = engine.current;
      if (e) setAngle(e.angleAt(point.y));
    },
    onEnd: () => {
      railDrag.current = false;
    },
    onCancel: () => {
      railDrag.current = false;
    },
    onTap: (event) => {
      const e = engine.current;
      if (e) setAngle(e.angleAt(event.clientY));
    },
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const step: Record<string, number> = {
      ArrowUp: 2,
      ArrowRight: 2,
      ArrowDown: -2,
      ArrowLeft: -2,
      PageUp: 10,
      PageDown: -10,
    };
    let next: number | null = null;
    if (event.key in step) next = angle + (step[event.key] ?? 0);
    else if (event.key === "Home") next = -MAX_ANGLE;
    else if (event.key === "End") next = MAX_ANGLE;
    if (next === null) return;
    event.preventDefault();
    setAngle(next);
  };

  // The server's frame, and the still without WebGL2: the same waves at rest.
  const phase = phaseOf(seed);
  const n = clamp(Math.round(waves), 1, 6);
  const points: string[] = [];
  for (let x = 0; x <= 1000; x += 10) {
    points.push(`${x} ${r1(stillSurface(x, n, swell, level, phase))}`);
  }
  const surfacePath = `M ${points.join(" L ")}`;
  const waterPath = `${surfacePath} L 1000 1000 L 0 1000 Z`;
  const crests: string[] = [];
  const k1 = (TAU * n) / 1000;
  for (let i = -1; i <= n + 1; i += 1) {
    // Crests sit where the fundamental's phase is a whole turn.
    const cx = (TAU * i - phase) / k1;
    if (cx < 20 || cx > 980) continue;
    const seg: string[] = [];
    const half = 1000 / n / 5;
    for (let x = cx - half; x <= cx + half + 0.01; x += half / 6) {
      seg.push(`${r1(x)} ${r1(stillSurface(x, n, swell, level, phase) + 14)}`);
    }
    crests.push(`M ${seg.join(" L ")}`);
  }
  const lampAt = r1(lampShare(angle) * 100);

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (!followPointer || disabled || railDrag.current) return;
        if (event.pointerType === "touch") return;
        const e = engine.current;
        if (e) setAngle(e.angleAt(event.clientY));
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        tap.current = {
          x: event.clientX,
          y: event.clientY,
          id: event.pointerId,
        };
      }}
      onPointerUp={(event) => {
        const t = tap.current;
        tap.current = null;
        if (
          !t ||
          t.id !== event.pointerId ||
          !followPointer ||
          railDrag.current
        )
          return;
        if (Math.hypot(event.clientX - t.x, event.clientY - t.y) > 10) return;
        const e = engine.current;
        if (e) setAngle(e.angleAt(event.clientY));
      }}
      className={cn(
        "group/crest-fringe relative isolate h-full w-full overflow-clip rounded-3 [contain:paint] select-none",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full group-data-live/crest-fringe:hidden"
      >
        <defs>
          <linearGradient id={airId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={airColor} />
            <stop
              offset={r3(clamp(lampAt / 100, 0.05, 0.95))}
              stopColor={`color-mix(in oklab, ${airColor} ${Math.round(100 - glow * 55)}%, ${lightColor})`}
            />
            <stop offset="1" stopColor={airColor} />
          </linearGradient>
          <linearGradient id={waterId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={waterColor} />
            <stop offset="1" stopColor={deep} />
          </linearGradient>
          <linearGradient id={specId} x1="0" x2="1" y1="0" y2="0">
            {SPECTRUM_HUES.map((hue, j) => (
              <stop
                key={hue}
                offset={r3(j / 6)}
                stopColor={`oklch(0.8 0.15 ${hue})`}
                stopOpacity={r3(0.35 + clamp(dispersion, 0, 1) * 0.55)}
              />
            ))}
          </linearGradient>
        </defs>
        <rect width="1000" height="1000" fill={`url(#${airId})`} />
        <path d={waterPath} fill={`url(#${waterId})`} />
        {crests.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={`url(#${specId})`}
            strokeWidth={2.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={surfacePath}
          fill="none"
          stroke={lightColor}
          strokeOpacity={0.7}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-500 group-data-live/crest-fringe:opacity-100"
      />
      {/* The tank's glass: a rim, a heavy base, two upright reflections. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 rounded-3 border border-hairline-strong" />
        <div
          className="absolute inset-x-0 bottom-0 h-2"
          style={{
            backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${lightColor} 26%, transparent), color-mix(in oklab, ${deep} 60%, transparent))`,
          }}
        />
        <div
          className="absolute top-3 bottom-4 left-2 w-px"
          style={{
            backgroundColor: `color-mix(in oklab, ${lightColor} 34%, transparent)`,
          }}
        />
        <div
          className="absolute top-3 bottom-4 left-3.5 w-0.5 rounded-full"
          style={{
            backgroundColor: `color-mix(in oklab, ${lightColor} 12%, transparent)`,
          }}
        />
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[airColor, waterColor, deep, lightColor].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
      <div
        {...rail}
        className={cn(
          "absolute inset-y-0 right-0 z-20 w-7 touch-none",
          disabled ? "cursor-not-allowed" : "cursor-ns-resize",
        )}
      >
        <div
          aria-hidden
          className="absolute left-1/2 w-px -translate-x-1/2 rounded-full"
          style={{
            top: RAIL_INSET,
            bottom: RAIL_INSET,
            backgroundColor: `color-mix(in oklab, ${lightColor} 40%, transparent)`,
          }}
        />
        <div
          ref={knobRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-describedby={hintId}
          aria-orientation="vertical"
          aria-valuemin={MIN_ANGLE}
          aria-valuemax={MAX_ANGLE}
          aria-valuenow={angle}
          aria-valuetext={describe(angle)}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute left-1/2 -ml-[7px] flex w-[14px] items-center justify-center rounded-full border border-hairline-strong",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled && "opacity-50",
          )}
          style={{
            ["--lamp-at" as string]: angle,
            top: `calc(${RAIL_INSET}px + (${MAX_ANGLE} - var(--lamp, var(--lamp-at))) / ${2 * MAX_ANGLE} * (100% - ${2 * RAIL_INSET}px) - ${KNOB_H / 2}px)`,
            height: KNOB_H,
            backgroundColor: lightColor,
            boxShadow: `0 0 ${r1(6 + glow * 10)}px color-mix(in oklab, ${lightColor} ${Math.round(40 + glow * 40)}%, transparent)`,
          }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{
              backgroundColor: `color-mix(in oklab, ${waterColor} 70%, ${lightColor})`,
            }}
          />
        </div>
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys raise and lower the lamp behind the tank; the colour fringes
        slide along the waves to follow it.
      </p>
    </div>
  );
}
