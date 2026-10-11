"use client";

import * as React from "react";

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
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type NacreousSkyProps = {
  /** Content over the sky: a hero line, a caption. It stays fully interactive. */
  children?: React.ReactNode;
  /** Where the sun rests behind the clouds, in degrees from −60 (left) to 60 (right). The pointer moves it from here. @default 0 */
  sunAngle?: number;
  /** Fires from the hover, drag or key that moved the sun, with whole degrees. */
  onSunAngleChange?: (degrees: number) => void;
  /** How thin the clouds are, 0 (heavy veils) to 1 (gossamer, with more edge to colour). @default 0.55 */
  thinness?: number;
  /** How strong the iridescent colour is, 0 (pearl-white) to 1 (vivid pastel). @default 0.55 */
  saturation?: number;
  /** How fast the clouds drift, 0 (still) to 1 (a brisk high wind). @default 0.3 */
  speed?: number;
  /** How much of the sky the clouds cover, 0 to 1. @default 0.55 */
  coverage?: number;
  /** A hovering mouse or pen moves the sun; a finger drags along the rail or taps. @default true */
  followPointer?: boolean;
  /** When the pointer leaves, the sun drifts back to `sunAngle`. @default true */
  returnOnLeave?: boolean;
  /** The sky's top and horizon, CSS colours. @default pale dusk tints (light) or a deep twilight (dark) from the tokens */
  skyColors?: [string, string];
  /** The sun's light, any CSS colour. @default a warm near-white from the warn hue */
  sunColor?: string;
  /** Hold the clouds where they are. @default false */
  paused?: boolean;
  /** Seeds the clouds' shapes. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The sun control's accessible name. @default "Sun position" */
  label?: string;
  /** The sun does not move. @default false */
  disabled?: boolean;
  /** Sizes the sky; it fills its parent by default. */
  className?: string;
};

const MAX_ANGLE = 60;
const MIN_ANGLE = -60;
/** How far across the frame the sun's arc reaches, as a share of the width either side of the middle. */
const REACH = 0.42;
const CALM_FRAME = 31;

const DEFAULT_SKY: [string, string] = [
  "light-dark(oklch(from var(--accent) 0.86 0.05 calc(h - 20)), oklch(from var(--accent) 0.24 0.07 h))",
  "light-dark(oklch(from var(--warn) 0.93 0.045 calc(h - 30)), oklch(from var(--warn) 0.4 0.055 calc(h - 40)))",
];
const DEFAULT_SUN = "oklch(from var(--warn) 0.97 0.05 calc(h - 10))";

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_sun;
uniform float u_thin;
uniform float u_sat;
uniform float u_cover;
uniform float u_seed;
uniform float u_dark;
uniform vec3 u_top;
uniform vec3 u_horizon;
uniform vec3 u_sunCol;
uniform vec3 u_shade;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

// One veil of high cloud: stretched along the wind and warped so its edges fray.
float veil(vec2 p, vec2 stretch, float t, float off) {
  vec2 q = p * stretch + vec2(t, 0.0) + off;
  vec2 w = vec2(kx_fbm(q * 0.7 + 1.3), kx_fbm(q * 0.7 + 7.1));
  return kx_fbm(q + (w - 0.5) * 1.5);
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(v_uv.x * aspect, 1.0 - v_uv.y);
  vec3 sky = mix(u_horizon, u_top, smoothstep(-0.05, 1.05, p.y));
  vec2 dv = p - u_sun;
  float theta = length(dv * vec2(1.0, 1.15));
  // The hidden sun warms the sky around it; no disc is ever drawn.
  sky += u_sunCol * (exp(-theta * theta / 0.035) * mix(0.3, 0.5, u_dark) + exp(-theta / 0.45) * mix(0.08, 0.16, u_dark));

  vec2 sp = p;
  sp.x += sp.y * 0.55;
  float n1 = veil(sp, vec2(1.1, 3.4), u_time * 0.05, u_seed);
  float n2 = veil(sp + vec2(3.7, 1.9), vec2(2.4, 6.5), u_time * 0.085, u_seed * 1.7);
  float cov = mix(0.64, 0.42, u_cover);
  float d1 = smoothstep(cov, cov + 0.22, n1);
  float d2 = smoothstep(cov + 0.04, cov + 0.2, n2) * 0.75;
  float D = clamp(max(d1, d2) + d1 * d2 * 0.3, 0.0, 1.0);

  // Thin cloud: density between a lower and an upper bound that thinness widens.
  float mid = 0.28 + 0.28 * u_thin;
  float hi = 0.58 + 0.4 * u_thin;
  float thin = smoothstep(0.02, mid, D) * (1.0 - smoothstep(mid, hi, D));
  float opacity = D * (0.95 - 0.45 * u_thin);

  // Lit from behind: a silver lining near the sun, a soft shade away from it.
  float nearSun = exp(-theta / 0.32);
  vec3 lit = mix(u_shade, vec3(0.99) + u_sunCol * 0.04, clamp(nearSun * (1.25 - D * 0.6), 0.0, 1.0));
  vec3 col = mix(sky, mix(sky, lit, 0.88), opacity);

  // Diffraction: cyclic pastel bands by angular distance from the sun over a
  // droplet size that wanders across the cloud, so the colour lies in soft
  // contours round the sun and along every thinning edge.
  float size = 0.7 + 0.6 * kx_noise(p * 1.2 + vec2(u_time * 0.02, 0.0) + u_seed);
  float phase = theta / (0.19 * size) + D * 0.35;
  vec3 band = 0.5 + 0.5 * cos(6.28318 * (phase + vec3(0.0, 0.36, 0.68)));
  vec3 pastel = mix(vec3(1.0), band, 0.3 + 0.6 * u_sat) * (1.0 - 0.18 * u_dark);
  float reach = exp(-theta / (0.36 + 0.26 * u_thin)) * smoothstep(0.03, 0.12, theta);
  float irid = thin * reach * (0.5 + 0.65 * u_sat);
  col = mix(col, col * 0.4 + pastel * 0.78, clamp(irid, 0.0, 1.0));

  col += (kx_hash(v_uv * u_res + fract(u_time)) - 0.5) / 255.0;
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

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

/** The sun's place across the frame (0–1) and its height (0 bottom, 1 top) for an angle. */
const sunShare = (degrees: number) =>
  0.5 + (REACH * clamp(degrees, MIN_ANGLE, MAX_ANGLE)) / MAX_ANGLE;
const sunHeight = (degrees: number) =>
  0.52 + 0.2 * Math.cos((clamp(degrees, MIN_ANGLE, MAX_ANGLE) * Math.PI) / 180);

type Config = {
  colorKey: string;
  thinness: number;
  saturation: number;
  speed: number;
  coverage: number;
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
  aim: (degrees: number, home?: boolean) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
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
  // top, horizon, sun, shade
  const colours = new Float32Array(12);
  let dark = 0;
  // The sun: shown angle and its velocity, eased toward `aimAt`.
  let aimAt = 0;
  let shown = 0;
  let speed = 0;
  let homing = false;
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

  const placeKnob = () => {
    knob.current?.style.setProperty("--sun", String(r1(shown)));
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    p.program.set({
      u_res: [Math.max(1, size.w), Math.max(1, size.h)],
      u_thin: clamp(c.thinness, 0, 1),
      u_sat: clamp(c.saturation, 0, 1),
      u_cover: clamp(c.coverage, 0, 1),
      u_seed: (Math.round(c.seed) % 53) * 1.37 + 0.5,
      u_dark: dark,
      u_top: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_horizon: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
      u_sunCol: [colours[6] ?? 1, colours[7] ?? 1, colours[8] ?? 1],
      u_shade: [colours[9] ?? 0.5, colours[10] ?? 0.5, colours[11] ?? 0.5],
    });
  };

  const draw = () => {
    const p = gpu;
    placeKnob();
    if (!cfg || !p || p.lost || size.w < 1) return;
    const aspect = size.w / Math.max(1, size.h);
    p.program.set({
      u_time: r3(time),
      u_sun: [r3(sunShare(shown) * aspect), r3(sunHeight(shown))],
    });
    p.gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const easing = () => Math.abs(aimAt - shown) > 0.01 || Math.abs(speed) > 0.01;
  const drifting = () => {
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
    const moving = easing();
    // Drifting cloud alone is fine at thirty frames a second.
    if (!moving && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    if (drifting()) time += dt * (0.15 + 1.6 * clamp(c.speed, 0, 1));
    if (moving) {
      // Glide's constants following the hand; drift's when the sun goes home.
      const spring = homing ? springs.drift : springs.glide;
      const k = spring.stiffness / spring.mass;
      const damp = spring.damping / spring.mass;
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
    if (drifting() || easing()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!drifting() && !easing()) {
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
    const lum =
      0.2126 * (colours[0] ?? 0) +
      0.7152 * (colours[1] ?? 0) +
      0.0722 * (colours[2] ?? 0);
    dark = clamp((0.45 - lum) / 0.25, 0, 1);
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
    // Soft cloud loses nothing at a lower render scale.
    resizeGL(p.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? 0.5 : 0.75,
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
        time = hash(Math.round(next.seed), 3) * 40;
      }
      if (failed) {
        placeKnob();
        return;
      }
      if (!gpu) {
        if (!start()) {
          // No WebGL2: the server's still stays, and nothing retries.
          failed = true;
          root.setAttribute("data-fallback", "");
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
    aim(degrees, home = false) {
      aimAt = clamp(degrees, MIN_ANGLE, MAX_ANGLE);
      homing = home;
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

const describe = (deg: number) =>
  deg === 0
    ? "Sun at the centre"
    : `Sun ${Math.abs(deg)} ${Math.abs(deg) === 1 ? "degree" : "degrees"} ${deg > 0 ? "right" : "left"} of centre`;

/** The server's clouds: soft veils as blurred ellipses in a 1000 × 300 box. */
function stillVeils(seed: number, coverage: number) {
  const s = Math.round(seed);
  const n = 5 + Math.round(clamp(coverage, 0, 1) * 5);
  return Array.from({ length: n }, (_, i) => ({
    cx: r1(hash(s, i * 4 + 1) * 1100 - 50),
    cy: r1(40 + hash(s, i * 4 + 2) * 190),
    rx: r1(140 + hash(s, i * 4 + 3) * 220),
    ry: r1(10 + hash(s, i * 4 + 4) * 22),
  }));
}

/**
 * A pale dusk sky crossed by thin, high clouds that drift slowly sideways in
 * two veils, drawn per pixel in one WebGL2 pass, with the sun hidden behind
 * them. Wherever a cloud thins near the sun its edge diffracts into soft
 * iridescent bands — rose, green, blue and rose again — laid as contours of
 * angular distance from the sun over a droplet size that wanders across the
 * cloud, while the denser cloud near the sun takes a silver lining.
 *
 * Moving the pointer moves the sun along its arc behind the clouds, eased on
 * the springs.glide constants, so the colour slides along every edge; when the
 * pointer leaves, the sun drifts home to `sunAngle` on springs.drift. The sun
 * marker on the rail at the foot is a real slider (arrows, Page keys, Home and
 * End). The loop runs only on screen and while something moves; under reduced
 * motion it is one still frame, and an SVG still stands in without WebGL2.
 */
export function NacreousSky({
  children,
  sunAngle = 0,
  onSunAngleChange,
  thinness = 0.55,
  saturation = 0.55,
  speed = 0.3,
  coverage = 0.55,
  followPointer = true,
  returnOnLeave = true,
  skyColors = DEFAULT_SKY,
  sunColor = DEFAULT_SUN,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Sun position",
  disabled = false,
  className,
}: NacreousSkyProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const skyId = `${uid}-sky`;
  const iridId = `${uid}-irid`;
  const blurId = `${uid}-blur`;

  const rest = Math.round(clamp(sunAngle, MIN_ANGLE, MAX_ANGLE));
  // The sun's place is the component's own; a new resting angle moves it there.
  const [angle, setAngle] = React.useState(rest);
  const [restSeen, setRestSeen] = React.useState(rest);
  if (rest !== restSeen) {
    setRestSeen(rest);
    setAngle(rest);
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const knobRef = React.useRef<HTMLDivElement | null>(null);
  const railDrag = React.useRef(false);

  const [top, horizon] = skyColors;
  // The cloud's shaded side: a pale lilac on a light page, a dusky violet on a dark one.
  const shade = `light-dark(oklch(from ${top} calc(l + 0.03) calc(c * 0.6) calc(h + 40)), color-mix(in oklab, ${top} 55%, oklch(from ${horizon} calc(l * 0.8) calc(c * 0.6) calc(h + 60))))`;
  const colours = [top, horizon, sunColor, shade];

  const config: Config = {
    colorKey: colours.join("|"),
    thinness,
    saturation,
    speed,
    coverage,
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

  // A new resting angle (or the first frame) points the sun there.
  React.useEffect(() => {
    engine.current?.aim(restSeen, true);
  }, [restSeen]);

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

  /** Moves the sun and reports whole degrees, from the gesture that moved it. */
  const moveSun = (degrees: number, home = false) => {
    if (disabled) return;
    const next = clamp(degrees, MIN_ANGLE, MAX_ANGLE);
    engine.current?.aim(next, home);
    const whole = Math.round(next);
    if (whole === angle) return;
    setAngle(whole);
    onSunAngleChange?.(whole);
  };

  const angleAt = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return 0;
    const r = root.getBoundingClientRect();
    const t = (clientX - r.left) / Math.max(1, r.width);
    return clamp(((t - 0.5) / REACH) * MAX_ANGLE, MIN_ANGLE, MAX_ANGLE);
  };

  const rail = useDrag({
    axis: "x",
    threshold: 2,
    disabled,
    onStart: () => {
      railDrag.current = true;
    },
    onMove: ({ point }) => moveSun(angleAt(point.x)),
    onEnd: () => {
      railDrag.current = false;
    },
    onCancel: () => {
      railDrag.current = false;
    },
    onTap: (event) => moveSun(angleAt(event.clientX)),
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const step: Record<string, number> = {
      ArrowRight: 3,
      ArrowUp: 3,
      ArrowLeft: -3,
      ArrowDown: -3,
      PageUp: 15,
      PageDown: -15,
    };
    let next: number | null = null;
    if (event.key in step) next = angle + (step[event.key] ?? 0);
    else if (event.key === "Home") next = MIN_ANGLE;
    else if (event.key === "End") next = MAX_ANGLE;
    if (next === null) return;
    event.preventDefault();
    moveSun(next);
  };

  // The server's frame, and the still without WebGL2.
  const veils = stillVeils(seed, coverage);
  const sunX = r1(sunShare(angle) * 1000);
  const sunY = r1((1 - sunHeight(angle)) * 300);
  const sat = clamp(saturation, 0, 1);
  const bandOpacity = r3(0.25 + 0.5 * sat);

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (!followPointer || disabled || railDrag.current) return;
        if (event.pointerType === "touch") return;
        moveSun(angleAt(event.clientX));
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch" || !followPointer) return;
        if (returnOnLeave) moveSun(rest, true);
      }}
      className={cn(
        "group/nacreous-sky relative isolate h-full w-full overflow-clip rounded-3 [contain:paint] select-none",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 1000 300"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 size-full group-data-live/nacreous-sky:hidden"
      >
        <defs>
          <linearGradient id={skyId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={top} />
            <stop offset="1" stopColor={horizon} />
          </linearGradient>
          <radialGradient
            id={iridId}
            gradientUnits="userSpaceOnUse"
            cx={sunX}
            cy={sunY}
            r={360}
          >
            <stop offset="0" stopColor={sunColor} />
            <stop offset="0.12" stopColor="oklch(0.95 0.06 350)" />
            <stop offset="0.22" stopColor="oklch(0.93 0.07 150)" />
            <stop offset="0.32" stopColor="oklch(0.9 0.07 235)" />
            <stop offset="0.44" stopColor="oklch(0.93 0.06 350)" />
            <stop offset="0.6" stopColor="oklch(0.93 0.05 150)" />
            <stop
              offset="1"
              stopColor={`color-mix(in oklab, ${top} 60%, white)`}
            />
          </radialGradient>
          <filter id={blurId} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>
        <rect width="1000" height="300" fill={`url(#${skyId})`} />
        <circle
          cx={sunX}
          cy={sunY}
          r={140}
          fill={sunColor}
          opacity={0.35}
          filter={`url(#${blurId})`}
        />
        <g filter={`url(#${blurId})`} opacity={bandOpacity}>
          {veils.map((v, i) => (
            <ellipse
              key={i}
              cx={v.cx}
              cy={v.cy}
              rx={v.rx}
              ry={v.ry}
              fill={`url(#${iridId})`}
              transform={`rotate(-8 ${v.cx} ${v.cy})`}
            />
          ))}
        </g>
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-500 group-data-live/nacreous-sky:opacity-100"
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
      <span
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: top }}
      />
      <div className="relative z-10 size-full">{children}</div>
      <div
        {...rail}
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 h-7 touch-pan-y",
          disabled ? "cursor-not-allowed" : "cursor-ew-resize",
        )}
      >
        <div
          aria-hidden
          className="absolute top-1/2 h-px -translate-y-1/2 rounded-full"
          style={{
            left: `${r3(50 - REACH * 100)}%`,
            right: `${r3(50 - REACH * 100)}%`,
            backgroundColor:
              "color-mix(in oklab, var(--foreground) 22%, transparent)",
          }}
        />
        <div
          ref={knobRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-describedby={hintId}
          aria-valuemin={MIN_ANGLE}
          aria-valuemax={MAX_ANGLE}
          aria-valuenow={angle}
          aria-valuetext={describe(angle)}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color-mix(in_oklab,var(--foreground)_35%,transparent)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled && "opacity-50",
          )}
          style={{
            ["--sun-at" as string]: angle,
            // The marker sits right under the sun: the same share of the width.
            left: `calc(50% + var(--sun, var(--sun-at)) * ${r3((REACH * 100) / MAX_ANGLE)}%)`,
            backgroundColor: sunColor,
            boxShadow: `0 0 10px 2px color-mix(in oklab, ${sunColor} 70%, transparent)`,
          }}
        />
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys move the sun behind the clouds; the colour at their thin
        edges slides to follow it.
      </p>
    </div>
  );
}
