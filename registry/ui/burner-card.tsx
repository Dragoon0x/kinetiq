"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

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

export type BurnerCardIgnite = "inView" | "mount" | "none";

export type BurnerCardProps = {
  /** The card's content. */
  children?: React.ReactNode;
  /** The resting flame's height above the card's edge, px. The roar reaches `flameHeight × roar`, and the headroom above the card is kept for it. @default 26 */
  flameHeight?: number;
  /** The gas flame's hue in degrees, at fixed lightness: 255 is town gas blue, 200 cyan, 290 violet, 150 a copper green. @default 255 */
  hue?: number;
  /** How restless the flame is, 0 (a steady laboratory flame) to 1 (a nervous, dancing one). @default 0.5 */
  flutter?: number;
  /** How much taller the flame stands with the valve open, as a multiple of `flameHeight`, 1 to 3. @default 1.9 */
  roar?: number;
  /** Hold the valve open (true) or low (false) whatever the pointer does. Leave undefined for hover and focus to drive it. */
  active?: boolean;
  /** Fires when hover, focus or a touch opens or closes the valve, with the new state. */
  onActiveChange?: (active: boolean) => void;
  /** Hover, keyboard focus inside the card and a touch press open the valve. @default true */
  interactive?: boolean;
  /** Distance between the burner's ports, px: smaller is a finer, denser row of jets. @default 14 */
  jetSpacing?: number;
  /** The soft glow over the burner, 0 to 1. @default 0.6 */
  glow?: number;
  /** How much the hot air above the flame wobbles, 0 to 1. @default 0.5 */
  shimmer?: number;
  /** When the burner lights: the first time it is seen, at mount, or already lit. @default "inView" */
  ignite?: BurnerCardIgnite;
  /** Make the card itself a tab stop, for cards with nothing focusable inside. Name it with `label`. @default false */
  focusable?: boolean;
  /** Names the card when it is `focusable`. */
  label?: string;
  /** Hold the flicker still; the valve still opens and closes. @default false */
  paused?: boolean;
  /** Seeds each jet's own flicker. @default 1 */
  seed?: number;
  /** Cap on the canvas's pixel ratio, at most 2 (the soft flame never draws above 1.25). @default 2 */
  dpr?: number;
  /** Classes for the root (width, margins). */
  className?: string;
  /** Classes for the card box (padding, background). */
  cardClassName?: string;
};

/** How far below the card's top edge the burner line sits, px: the ports are hidden behind it. */
const BURY = 4;
/** The canvas runs on behind the card this far, so the flame's roots are drawn. */
const UNDER = 12;
/** A low flame needs no more than thirty frames a second. */
const CALM_FRAME = 31;
const STEP = 1 / 240;
/** The ignition runs the length of the burner in this long, s. */
const IGNITION = 0.42;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** OKLCH → linear sRGB, written into `out` at `at`. The flame is mixed in linear light. */
function oklchLinear(
  L: number,
  C: number,
  hue: number,
  out: Float32Array,
  at: number,
) {
  const h = (hue * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  out[at] = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1);
  out[at + 1] = clamp(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    0,
    1,
  );
  out[at + 2] = clamp(
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    0,
    1,
  );
}

/** The page's background luminance, by painting one pixel of whatever colour the carrier resolved to. */
function lumaReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): number => {
    if (!ctx) return 0;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return (
      (0.2126 * (d[0] ?? 0) + 0.7152 * (d[1] ?? 0) + 0.0722 * (d[2] ?? 0)) / 255
    );
  };
}

/** The headroom kept above the card: the roar at full height with room for its shimmer. */
const headroomOf = (flameHeight: number, roar: number) =>
  Math.round(clamp(flameHeight, 6, 96) * clamp(roar, 1, 3) * 1.12 + 16);

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_time;
uniform float u_base;
uniform vec2 u_span;
uniform float u_spacing;
uniform float u_height;
uniform float u_flutter;
uniform float u_glow;
uniform float u_shimmer;
uniform float u_heat;
uniform float u_front;
uniform float u_light;
uniform float u_seed;
uniform vec3 u_core;
uniform vec3 u_mantle;
uniform vec3 u_halo;
in vec2 v_uv;
out vec4 outColor;

${GLSL_NOISE}

float jitter(float n) { return fract(sin(n * 91.3458 + u_seed * 17.17) * 47453.5453); }

void main() {
  vec2 p = v_uv * u_size;
  float above = u_base - p.y;
  float span = max(1.0, u_span.y - u_span.x);
  float count = max(1.0, floor(span / max(4.0, u_spacing)));
  float pitch = span / count;
  float t = u_time;

  // The hot air: a turbulent field rising off the flame. It wobbles the
  // glow and bends the flame tips a pixel or two sideways — refraction —
  // as cells of warmer air drift up through it.
  float rising = above - t * 34.0;
  float cell = kx_fbm(vec2(p.x * 0.034 + u_seed, rising * 0.05)) - 0.5;
  float airTop = u_height * 2.2 + 12.0;
  float air = smoothstep(-2.0, u_height * 0.4, above) * (1.0 - smoothstep(airTop * 0.35, airTop, above));
  float wobble = u_shimmer * air * (0.45 + 0.9 * u_heat);
  float px = p.x + cell * wobble * 7.0;

  float inner = 0.0;
  float outer = 0.0;
  float idx = floor((px - u_span.x) / pitch);
  for (int k = -1; k <= 1; k++) {
    float i = idx + float(k);
    if (i < 0.0 || i >= count) continue;
    float jx = u_span.x + (i + 0.5) * pitch;
    float since = u_front - jx;
    float lit = clamp(since / 26.0, 0.0, 1.0);
    if (lit <= 0.0) continue;
    // A jet flares as it catches, then settles to the row.
    float pop = 1.0 + 0.6 * exp(-max(since, 0.0) / 46.0);
    float r = jitter(i);
    float n = kx_noise(vec2(i * 1.37 + r * 9.0, t * (2.6 + 2.6 * u_heat)));
    float H = u_height * lit * pop * (1.0 + u_flutter * 0.44 * (n - 0.5) * 2.0) * (0.9 + 0.2 * r);
    if (H < 1.0) continue;
    float v = above / H;
    if (v < -0.3 || v > 1.15) continue;
    float vv = clamp(v, 0.0, 1.0);
    // The tip sways most: the root is held by the port, the tip by nothing.
    float sway = (kx_fbm(vec2(i * 2.3 + above * 0.05, t * 1.7 + r * 4.0)) - 0.5) * u_flutter * (4.0 + 0.3 * H) * vv * vv;
    float dx = abs(px - jx - sway);
    float w0 = pitch * (0.36 + 0.08 * u_heat);
    // The mantle: a teardrop, full at the port and tapering to a point.
    float wo = w0 * pow(max(1.0 - vv, 0.0), 0.62) * (0.72 + 0.5 * smoothstep(0.0, 0.2, vv));
    float o = (1.0 - smoothstep(wo * 0.4, wo + 0.8, dx)) * smoothstep(-0.25, 0.04, v) * (1.0 - smoothstep(0.7, 1.05, v));
    // The core: a short, sharp cone in the throat, the hottest blue.
    float vi = above / (H * 0.36);
    float wi = w0 * 0.52 * pow(max(1.0 - clamp(vi, 0.0, 1.0), 0.0), 0.9);
    float c = (1.0 - smoothstep(wi * 0.2, wi + 0.6, dx)) * smoothstep(-0.4, 0.02, vi) * (1.0 - smoothstep(0.72, 1.0, vi));
    outer = max(outer, o * (0.78 + 0.22 * lit));
    inner = max(inner, c);
  }

  float edge = smoothstep(u_span.x - 12.0, u_span.x + 34.0, p.x) * (1.0 - smoothstep(u_span.y - 34.0, u_span.y + 12.0, p.x));
  float caught = clamp((u_front - p.x + 90.0) / 140.0, 0.0, 1.0);
  float g = exp(-max(above, 0.0) / (u_height * 0.72 + 6.0)) * smoothstep(-8.0, 3.0, above) * edge * caught;
  // The glow is gone well before the top of the headroom: no box shows.
  g *= u_glow * (0.42 + 0.78 * u_heat) * (1.0 + cell * wobble * 2.4) * mix(1.0, 0.5, u_light) * smoothstep(0.0, u_size.y * 0.55, p.y);
  // Where a warm cell bends the light toward the eye the air brightens.
  float shine = max(cell, 0.0) * max(cell, 0.0) * wobble * 0.9 * edge * caught * exp(-max(above, 0.0) / (u_height * 1.4 + 10.0));

  vec3 light = u_mantle * outer * mix(0.9, 0.62, u_light) + u_core * inner * 1.25 + u_halo * (g * 0.6 + shine);
  light *= 0.82 + 0.4 * clamp(u_heat, 0.0, 1.2);
  vec3 s = pow(clamp(light, 0.0, 1.0), vec3(1.0 / 2.2));
  float a = max(max(s.r, s.g), s.b);
  // Nothing hard-cuts at the top of the headroom.
  float top = smoothstep(0.0, 12.0, p.y);
  outColor = vec4(s * top, a * top);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  flameHeight: number;
  hue: number;
  flutter: number;
  roar: number;
  jetSpacing: number;
  glow: number;
  shimmer: number;
  ignite: BurnerCardIgnite;
  up: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readTheme: () => void;
  seen: (inView: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  card: HTMLDivElement,
  carrier: HTMLElement,
  visible: { current: boolean },
  heat: MotionValue<number>,
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let failed = false;
  let light = 0;
  let time = 3.7;
  let igniting = false;
  let lit = false;
  let front = 0;
  const luma = lumaReader();
  const colours = new Float32Array(9);
  const size = { w: 0, h: 0, x0: 0, x1: 0, base: 0 };
  /** The valve, 0 (low) to 1 (open), on a spring: snap up for the roar, drift down. */
  const valve = { x: 0, v: 0, target: 0 };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    gpu = { gl, program, tri, lost: false };
    return true;
  };

  const releaseGpu = () => {
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
    const h = c.hue;
    // Pigment: the same flame whatever the page, a little deeper on paper
    // so its white-hot core still reads against white.
    oklchLinear(light ? 0.86 : 0.93, light ? 0.1 : 0.07, h, colours, 0);
    oklchLinear(light ? 0.56 : 0.62, 0.2, h, colours, 3);
    oklchLinear(0.7, 0.15, h, colours, 6);
    p.program.set({
      u_size: [size.w, size.h],
      u_base: size.base,
      u_span: [size.x0, size.x1],
      u_spacing: clamp(c.jetSpacing, 5, 40),
      u_flutter: clamp(c.flutter, 0, 1),
      u_glow: clamp(c.glow, 0, 1),
      u_shimmer: clamp(c.shimmer, 0, 1),
      u_light: light,
      u_seed: c.seed % 97,
      u_core: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_mantle: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
      u_halo: [colours[6] ?? 0, colours[7] ?? 0, colours[8] ?? 0],
    });
  };

  const heightOf = (c: Config) =>
    clamp(c.flameHeight, 6, 96) *
    (1 + (clamp(c.roar, 1, 3) - 1) * Math.max(0, valve.x));

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    program.set({
      u_time: time,
      u_height: heightOf(c),
      u_heat: Math.max(0, valve.x),
      u_front: lit ? front : -1e4,
    });
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused) {
      // A wider-open valve pushes more gas: the flicker quickens with it.
      time += dt * (1 + 1.4 * Math.max(0, valve.x));
      moving = true;
    }
    if (igniting) {
      front += ((size.x1 - size.x0 + 120) / IGNITION) * dt;
      if (front > size.x1 + 400) {
        igniting = false;
        front = 1e4;
      }
      moving = true;
    }
    const k = valve.target > valve.x ? springs.snap : springs.drift;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      valve.v +=
        ((k.stiffness * (valve.target - valve.x) - k.damping * valve.v) /
          k.mass) *
        h;
      valve.x += valve.v * h;
    }
    if (
      Math.abs(valve.target - valve.x) < 0.0005 &&
      Math.abs(valve.v) < 0.005
    ) {
      valve.x = valve.target;
      valve.v = 0;
    } else moving = true;
    heat.set(Math.round(clamp(valve.x, 0, 1.2) * 1000) / 1000);
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const calm = valve.v === 0 && valve.x === valve.target && !igniting;
    if (calm && last && now - drawnAt < CALM_FRAME) {
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

  const igniteNow = () => {
    const c = cfg;
    if (!c || lit) return;
    lit = true;
    if (!c.motionSafe || c.ignite === "none") {
      front = 1e4;
      return;
    }
    igniting = true;
    front = size.x0 - 30;
  };

  /** Reduced motion: the valve is where it is asked to be, at once. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    valve.x = valve.target;
    valve.v = 0;
    igniting = false;
    if (lit) front = 1e4;
    heat.set(clamp(valve.x, 0, 1));
  };

  const readTheme = () => {
    light = luma(getComputedStyle(carrier).color) > 0.5 ? 1 : 0;
    statics();
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    const radius =
      Number.parseFloat(getComputedStyle(card).borderTopLeftRadius) || 16;
    const cardTop =
      card.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
    size.w = w;
    size.h = h;
    size.x0 = Math.min(w / 2 - 4, radius + 6);
    size.x1 = Math.max(w / 2 + 4, w - radius - 6);
    size.base = cardTop + BURY;
    resizeGL(p.gl, canvas, { dprCap: clamp(Math.min(c.dpr, 1.25), 0.5, 2) });
    statics();
    draw();
    kick();
  };

  const startGpu = () => {
    if (!build()) return false;
    readTheme();
    resize();
    return true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) {
        // The CSS flame cannot roar, but the card's edge still catches the light.
        heat.set(next.up ? 1 : 0);
        return;
      }
      valve.target = next.up ? 1 : 0;
      if (!gpu) {
        valve.x = valve.target;
        if (!startGpu()) {
          // No WebGL2: the CSS still stays, and nothing retries.
          failed = true;
          root.setAttribute("data-fallback", "");
          heat.set(valve.x);
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
            if (!disposed && startGpu()) kick();
          },
        );
        if (next.ignite !== "inView") igniteNow();
        if (!next.motionSafe) place();
        draw();
        kick();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr || was.flameHeight !== next.flameHeight) {
        resize();
      }
      statics();
      if (!next.motionSafe) place();
      draw();
      kick();
    },
    resize,
    readTheme() {
      readTheme();
      draw();
    },
    seen(inView) {
      if (!cfg || !gpu) return;
      if (inView) {
        igniteNow();
        if (!cfg.motionSafe) place();
        draw();
        kick();
      }
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
      releaseGpu();
    },
  };
}

/**
 * A content card with a gas flame breathing behind its top edge: a row of
 * small jets, each a short white-blue inner cone inside a taller translucent
 * blue mantle, under a soft glow, with the hot air above them visibly
 * wobbling. Hover, keyboard focus inside the card or a touch press turns the
 * valve up: the flame roars past its full height on the snap spring's one
 * overshoot and settles taller and brighter, flickering faster, while the
 * card's top edge catches its light; leaving turns it down on drift to a low,
 * steady flicker. The first time it is seen the burner lights from one end to
 * the other, each jet popping alight as the front reaches it.
 *
 * One WebGL2 pass per frame at a soft pixel ratio; the loop runs only while
 * on screen and the tab is visible, slows to thirty frames a second while
 * the flame is low, and stops when paused or under reduced motion, where a
 * still flame is drawn and redrawn tall when the valve opens. Without WebGL2
 * a CSS flame stands in.
 */
export function BurnerCard({
  children,
  flameHeight = 26,
  hue = 255,
  flutter = 0.5,
  roar = 1.9,
  active,
  onActiveChange,
  interactive = true,
  jetSpacing = 14,
  glow = 0.6,
  shimmer = 0.5,
  ignite = "inView",
  focusable = false,
  label,
  paused = false,
  seed = 1,
  dpr = 2,
  className,
  cardClassName,
}: BurnerCardProps) {
  const motionSafe = useMotionSafe();
  const headroom = headroomOf(flameHeight, roar);
  const [engaged, setEngaged] = React.useState(false);
  const up = active ?? (interactive && engaged);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const inputs = React.useRef({ hover: false, focus: false, touch: false });

  const heat = useMotionValue(0);
  const rim = useTransform(
    heat,
    (h) => Math.round(clamp(h, 0, 1) * 900) / 1000,
  );
  const wash = useTransform(
    heat,
    (h) => Math.round((0.18 + 0.5 * clamp(h, 0, 1)) * 1000) / 1000,
  );

  const config: Config = {
    flameHeight,
    hue,
    flutter,
    roar,
    jetSpacing,
    glow,
    shimmer,
    ignite,
    up,
    paused,
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
    const card = cardRef.current;
    const carrier = carrierRef.current;
    if (!root || !canvas || !card || !carrier) return;
    const e = createEngine(root, canvas, card, carrier, visible, heat);
    engine.current = e;
    e.configure(latest.current);
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
  }, [heat]);

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
      { threshold: 0.25 },
    );
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  /** Reports a change of the pointer's or the keyboard's hold on the valve from the event that made it. */
  const update = (key: "hover" | "focus" | "touch", on: boolean) => {
    if (!interactive) return;
    inputs.current[key] = on;
    const next =
      inputs.current.hover || inputs.current.focus || inputs.current.touch;
    if (next === engaged) return;
    setEngaged(next);
    onActiveChange?.(next);
  };

  // The stand-in is the designed still: lit when the burner starts lit (or
  // cannot be animated), dark until the ignition when it lights on view.
  const waitsToLight = ignite !== "none" && motionSafe;
  const flame = {
    core: `oklch(0.93 0.07 ${hue})`,
    mantle: `oklch(0.62 0.2 ${hue} / 0.85)`,
    halo: `oklch(0.7 0.15 ${hue})`,
  };
  const fh = Math.round(clamp(flameHeight, 6, 96));
  const pitch = Math.round(clamp(jetSpacing, 5, 40));

  return (
    <div
      ref={bindRoot}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") update("hover", true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") update("hover", false);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") update("touch", true);
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") update("touch", false);
      }}
      onPointerCancel={(event) => {
        if (event.pointerType === "touch") update("touch", false);
      }}
      onFocus={(event) => {
        const el = event.target;
        if (el instanceof Element && el.matches(":focus-visible")) {
          update("focus", true);
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && rootRef.current?.contains(next)) return;
        update("focus", false);
      }}
      className={cn("group/burner-card relative isolate w-full", className)}
      style={{ paddingTop: headroom }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 overflow-clip"
        style={{ height: headroom + UNDER }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-500 group-data-live/burner-card:opacity-0",
            waitsToLight &&
              "opacity-0 group-data-fallback/burner-card:opacity-100",
          )}
        >
          <div
            className="absolute inset-x-4"
            style={{
              bottom: UNDER - BURY,
              height: Math.round(fh * 1.9),
              backgroundImage: `radial-gradient(60% 100% at 50% 100%, color-mix(in oklab, ${flame.halo} 34%, transparent), transparent 75%)`,
            }}
          />
          <div
            className="absolute inset-x-[22px]"
            style={{
              bottom: UNDER - BURY,
              height: fh,
              backgroundImage: [
                `radial-gradient(42% 100% at 50% 100%, ${flame.core} 0, ${flame.core} 45%, transparent 70%)`,
                `radial-gradient(40% 100% at 50% 100%, ${flame.mantle} 0, color-mix(in oklab, ${flame.mantle} 60%, transparent) 62%, transparent 100%)`,
              ].join(", "),
              backgroundSize: `${pitch}px ${Math.round(fh * 0.42)}px, ${pitch}px ${fh}px`,
              backgroundPosition: "center bottom",
              backgroundRepeat: "repeat-x",
            }}
          />
        </div>
      </div>
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readTheme()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: "var(--background)" }}
      />
      <div
        ref={cardRef}
        role={focusable ? "group" : undefined}
        aria-label={focusable ? label : undefined}
        tabIndex={focusable ? 0 : undefined}
        className={cn(
          "relative z-10 overflow-clip rounded-4 border border-hairline-strong bg-card p-5 text-card-foreground shadow-[0_10px_30px_-12px_color-mix(in_oklab,black_35%,transparent)]",
          focusable &&
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          cardClassName,
        )}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            opacity: rim,
            backgroundImage: `linear-gradient(90deg, transparent, ${flame.halo} 20%, ${flame.core} 50%, ${flame.halo} 80%, transparent)`,
          }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-16"
          style={{
            opacity: wash,
            backgroundImage: `radial-gradient(70% 100% at 50% 0, color-mix(in oklab, ${flame.halo} 16%, transparent), transparent)`,
          }}
        />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
