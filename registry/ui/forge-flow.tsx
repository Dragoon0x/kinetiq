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

export type ForgeFlowProps = {
  /** The content above the metal: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** The temperature, 0 to 1: how much melt shows and how bright the currents run. @default 0.6 */
  heat?: number;
  /** How much of the surface the cooling crust covers, 0 to 1, and how thick its plates read. @default 0.55 */
  crust?: number;
  /** How fast the metal flows, 0 to 2; 0 holds it still while the glow and the hand still work. @default 1 */
  flow?: number;
  /** The four colours, as CSS colours: crust, ember, molten, white heat. @default theme-aware crust, then three fixed pigments */
  colors?: readonly string[];
  /** The size of the currents and the crust's plates, 0.5 to 2. @default 1 */
  scale?: number;
  /** How strongly the heat glow breathes, 0 to 1. @default 0.5 */
  pulse?: number;
  /** The heading of the flow in degrees: 0 runs rightward, positive turns clockwise. @default -18 */
  direction?: number;
  /** The hand heats the metal under it and a press stokes it. @default true */
  interactive?: boolean;
  /** How hot the hand runs and how wide it opens the crust, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** The size of the hand's heat, in CSS px. @default 90 */
  radius?: number;
  /** Picks the surface: the same seed draws the same currents and plates. @default 1 */
  seed?: number;
  /** Holds the flow and the glow still; the hand still heats. @default false */
  paused?: boolean;
  /** Pour the surface molten and let it cool into its crust the first time it is seen. @default true */
  intro?: boolean;
  /** The highest device pixel ratio the surface renders at, never above 2. @default 1.5 */
  dpr?: number;
  /** Fires once the crust has set after the pour — at once when there is no pour (intro off, reduced motion). */
  onIntroEnd?: () => void;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
  /** Classes for the content layer above the metal. */
  contentClassName?: string;
};

/**
 * The crust is the page's own colour leaning toward a warm iron, so it is
 * near-black slag on a dark page and a mid-tone bronze on a light one, where
 * the whole surface reads as a warm metal gradient rather than a hole in the
 * page. Ember and molten are pigments leaning a little into the page; white
 * heat is the same everywhere.
 */
const DEFAULT_COLORS = [
  "color-mix(in oklab, var(--background) 55%, oklch(0.3 0.06 50))",
  "color-mix(in oklab, oklch(0.5 0.18 32) 88%, var(--background))",
  "color-mix(in oklab, oklch(0.74 0.17 55) 92%, var(--background))",
  "oklch(0.95 0.07 92)",
] as const;

/** One flow cycle per this many seconds at flow 1: about 20 px/s of travel. */
const FLOW_RATE = 0.2;
/** Fixed sub-step for the springs, so a long frame never destabilises them. */
const STEP = 1 / 240;
/** Above this many backing-store pixels the surface renders softer instead of slower. */
const PIXEL_BUDGET = 1_400_000;
const TRAIL = 5;

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

/**
 * The melt, one fragment pass. Coordinates are CSS px so plates keep their
 * size at any DPR. Two copies of the material are advected along the flow
 * at staggered phases of a cycle and cross-faded, each weighted to zero at
 * its own reset, so the metal moves forever without its texture stretching;
 * the phase is offset by a slow noise so cracks refresh in drifts across the
 * surface rather than all at once.
 */
const FRAGMENT = `
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_size;
uniform float u_time;
uniform float u_clock;
uniform float u_heat;
uniform float u_crust;
uniform float u_scale;
uniform float u_pulse;
uniform vec2 u_dir;
uniform float u_cool;
uniform float u_seed;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec4 u_spots[6];

${GLSL_NOISE}

vec2 kx_hash2(vec2 p) {
  return vec2(kx_hash(p), kx_hash(p + 17.31));
}

// Distances to the nearest and second-nearest plate centre.
vec2 plates(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.12 + 0.76 * kx_hash2(n + g + u_seed * 3.17);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return sqrt(vec2(d1, d2));
}

// A steady heading plus the curl of a slow noise: swirls that never pile up.
vec2 flowAt(vec2 p) {
  const float e = 0.08;
  vec2 q = p * 0.45 + u_seed * 0.37;
  float n = kx_noise(q);
  float nx = kx_noise(q + vec2(e, 0.0));
  float ny = kx_noise(q + vec2(0.0, e));
  vec2 curl = vec2(ny - n, n - nx) / e;
  return u_dir * 0.55 + curl * 0.3;
}

// The heat of the material: a body of fbm and a few bright ridged veins,
// centred on 0.5 with most of the surface within 0.15 to 0.85.
float meltAt(vec2 q) {
  float body = kx_fbm(q * 0.85 + u_seed);
  float vein = 1.0 - abs(2.0 * kx_noise(q * 1.6 + 4.7 + u_seed) - 1.0);
  return (body + vein * vein * vein * 0.5 - 0.67) * 1.6 + 0.5;
}

void main() {
  vec2 px = v_uv * u_size;
  vec2 p = px / (170.0 * u_scale);
  vec2 v = flowAt(p);

  float T = u_time + kx_noise(p * 0.35 + 5.0 + u_seed);
  float ta = fract(T);
  float tb = fract(T + 0.5);
  float wa = 1.0 - abs(2.0 * ta - 1.0);
  vec2 qa = p - v * ta * 0.9 + floor(T) * vec2(0.37, 0.71);
  vec2 qb = p - v * tb * 0.9 + floor(T + 0.5) * vec2(0.61, 0.29) + 9.1;

  float heat = mix(meltAt(qb), meltAt(qa), wa);
  vec2 pa = plates(qa * 2.4);
  vec2 pb = plates(qb * 2.4);
  float edge = mix(pb.y - pb.x, pa.y - pa.x, wa);

  float phase = kx_noise(p * 0.7 + 2.3 + u_seed) * 6.2832;
  heat += u_pulse * 0.12 * sin(u_clock * 0.9 + phase);
  heat += (u_heat - 0.5) * 0.7;

  float hand = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 s = u_spots[i];
    vec2 d = px - s.xy;
    hand += s.w * exp(-dot(d, d) / max(1.0, s.z * s.z));
  }
  heat += hand * 0.9;
  // The pour: the whole surface runs molten, its currents still showing,
  // and the crust closes over it as it cools.
  heat += u_cool * 0.6;

  // Below the threshold the metal has crusted over.
  float thr = mix(0.2, 1.0, u_crust);
  float cover = 1.0 - smoothstep(thr - 0.035, thr + 0.035, heat);
  // The melt is coloured by how far it runs above the crust: dull red at
  // the banks, orange in the stream, white only at the hottest cores.
  float over = heat - thr;
  vec3 melt = mix(u_c1, u_c2, smoothstep(0.0, 0.28, over));
  melt = mix(melt, u_c3, smoothstep(0.38, 0.95, over));
  // A skin on the melt, carried by the flow, so the current is seen moving.
  float skin = mix(kx_noise(qb * vec2(5.0, 2.2)), kx_noise(qa * vec2(5.0, 2.2)), wa);
  melt *= 0.9 + 0.2 * skin;

  // How close a plate is to melting: warm plates crack wide and glow at
  // their rims, cold ones keep hairline cracks.
  float warmth = clamp(1.0 + over / 0.35, 0.0, 1.0);
  float crackW = 0.025 + 0.1 * warmth * warmth;
  float crack = 1.0 - smoothstep(crackW * 0.35, crackW, edge);
  float slag = kx_noise(px / (7.0 * u_scale) + u_seed) * 0.5 + kx_noise(qa * 7.0) * 0.5;
  vec3 crustCol = u_c0 * (0.94 + 0.12 * slag);
  float rim = (1.0 - smoothstep(crackW, crackW + 0.16, edge)) * warmth * warmth * warmth;
  crustCol = mix(crustCol, u_c1, rim * 0.4);
  vec3 crackCol = mix(u_c1 * 0.75, mix(u_c1, u_c2, 0.55), warmth);
  vec3 surface = mix(crustCol, crackCol, crack * (0.4 + 0.6 * warmth));

  outColor = vec4(mix(melt, surface, cover), 1.0);
}
`;

type Hand = {
  x: Axis;
  y: Axis;
  tx: number;
  ty: number;
  heat: Axis;
  size: Axis;
  present: boolean;
  pressed: boolean;
  source: "pointer" | "focus" | null;
  /** The heat's spring: drift for coming and going, recoil while stoking. */
  stoking: boolean;
};

type Api = {
  refresh: () => void;
  recolor: () => void;
  local: (clientX: number, clientY: number) => { x: number; y: number };
  aim: (x: number, y: number, source: "pointer" | "focus") => void;
  away: (source: "pointer" | "focus" | null) => void;
  press: (down: boolean) => void;
};

/**
 * A background of molten metal moving under a cooling crust: a heat field
 * carried along a swirling flow, coloured from ember red through molten
 * orange to white heat, and wherever it cools below a threshold a crust of
 * dark plates closes over it, cracked along borders that glow with the heat
 * beneath and re-heal as the material moves. The glow breathes in patches.
 *
 * The hand is heat: hovering opens the crust under it — the spot follows on
 * the glide spring and warms on the drift spring, leaving a short trail that
 * crusts over behind it — and a press stokes it, the pool heaving open on
 * the recoil spring. The first time it is seen the surface is poured
 * molten, every current running hot, and cools into its crust. Keyboard
 * focus on content inside the background brings the heat to the focused element.
 *
 * WebGL2, one fragment pass; it renders only while on screen, in a visible
 * page, and moving. Colours are read from the component's own element, so
 * they follow the theme. Without WebGL2 (or after a lost context) a static
 * gradient in the same colours stands in. Under reduced motion the surface
 * is a still frame with its crust set; the hand's heat still shows, at once.
 */
export function ForgeFlow({
  children,
  heat = 0.6,
  crust = 0.55,
  flow = 1,
  colors,
  scale = 1,
  pulse = 0.5,
  direction = -18,
  interactive = true,
  pointerStrength = 0.7,
  radius = 90,
  seed = 1,
  paused = false,
  intro = true,
  dpr = 1.5,
  onIntroEnd,
  className,
  contentClassName,
}: ForgeFlowProps) {
  const motionSafe = useMotionSafe();
  const palette = [0, 1, 2, 3].map(
    (i) => colors?.[i] ?? DEFAULT_COLORS[i] ?? "gray",
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const api = React.useRef<Api | null>(null);
  const unlisten = React.useRef<(() => void) | null>(null);

  const latest = React.useRef({
    heat,
    crust,
    flow,
    scale,
    pulse,
    direction,
    interactive,
    pointerStrength,
    radius,
    seed,
    paused,
    intro,
    dpr,
    motionSafe,
    onIntroEnd,
  });
  React.useEffect(() => {
    latest.current = {
      heat,
      crust,
      flow,
      scale,
      pulse,
      direction,
      interactive,
      pointerStrength,
      radius,
      seed,
      paused,
      intro,
      dpr,
      motionSafe,
      onIntroEnd,
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
    let size = { w: 0, h: 0 };
    const L0 = latest.current;
    // Each seed starts somewhere else in the flow, and a still frame is
    // always this same moment.
    let time = ((Math.abs(L0.seed) * 0.6180339) % 1) * 7 + 2;
    let clock = 0;
    let introState: "waiting" | "running" | "done" = "waiting";
    const cool: Axis = { x: L0.intro && L0.motionSafe ? 1 : 0, v: 0 };
    const hand: Hand = {
      x: { x: 0, v: 0 },
      y: { x: 0, v: 0 },
      tx: 0,
      ty: 0,
      heat: { x: 0, v: 0 },
      size: { x: 1, v: 0 },
      present: false,
      pressed: false,
      source: null,
      stoking: false,
    };
    /** Earlier hand positions: x, y, radius, strength — and their ages. */
    const trail = new Float32Array(TRAIL * 4);
    const ages = new Float32Array(TRAIL).fill(99);
    let trailHead = 0;
    const spots = new Float32Array(24);
    const colours = [
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3),
    ];
    const read = rgbReader();

    const recolor = () => {
      carrierRefs.current.forEach((node, i) => {
        if (!node) return;
        const [r, g, b] = read(getComputedStyle(node).color);
        const c = colours[i];
        if (!c) return;
        c[0] = r / 255;
        c[1] = g / 255;
        c[2] = b / 255;
      });
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
      const strength = clamp(L.pointerStrength, 0, 1);
      const reach = Math.max(8, L.radius);
      spots.fill(0);
      spots[0] = hand.x.x;
      spots[1] = hand.y.x;
      spots[2] = reach * hand.size.x;
      spots[3] = hand.heat.x * strength;
      for (let i = 0; i < TRAIL; i += 1) {
        const age = ages[i] ?? 99;
        const o = (i + 1) * 4;
        spots[o] = trail[i * 4] ?? 0;
        spots[o + 1] = trail[i * 4 + 1] ?? 0;
        spots[o + 2] = trail[i * 4 + 2] ?? 0;
        spots[o + 3] =
          (trail[i * 4 + 3] ?? 0) * strength * 0.7 * Math.exp(-age / 0.35);
      }
      const angle = (L.direction * Math.PI) / 180;
      program.set({
        u_size: [size.w, size.h],
        u_time: time,
        u_clock: clock,
        u_heat: clamp(L.heat, 0, 1),
        u_crust: clamp(L.crust, 0, 1),
        u_scale: clamp(L.scale, 0.5, 2),
        u_pulse: clamp(L.pulse, 0, 1),
        u_dir: [Math.cos(angle), Math.sin(angle)],
        u_cool: clamp(cool.x, 0, 1.2),
        u_seed: (Math.abs(L.seed) % 97) * 1.31,
        u_c0: colours[0] ?? [0, 0, 0],
        u_c1: colours[1] ?? [0, 0, 0],
        u_c2: colours[2] ?? [0, 0, 0],
        u_c3: colours[3] ?? [0, 0, 0],
        u_spots: spots,
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
      size = { w, h };
      const cap = clamp(latest.current.dpr, 0.5, 2);
      const budget = Math.sqrt(PIXEL_BUDGET / (w * h));
      resizeGL(gl, canvas, { dprCap: Math.min(cap, Math.max(0.5, budget)) });
      draw();
    };

    const beginIntro = () => {
      const L = latest.current;
      // Without a surface to pour, the crust is simply set.
      if (L.intro && L.motionSafe && program) {
        introState = "running";
        cool.x = 1;
        cool.v = 0;
      } else {
        introState = "done";
        cool.x = 0;
        cool.v = 0;
        L.onIntroEnd?.();
      }
    };

    /** Advances everything that moves; true while anything still does. */
    const advance = (dt: number): boolean => {
      const L = latest.current;
      let busy = false;
      if (!L.paused) {
        time += dt * clamp(L.flow, 0, 2) * FLOW_RATE;
        clock += dt;
        if (L.flow > 0 || L.pulse > 0) busy = true;
      }
      const target = hand.present ? (hand.pressed ? 1.7 : 1) : 0;
      const grow = hand.pressed ? 1.35 : 1;
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(STEP, left);
        left -= h;
        stepSpring(hand.x, hand.tx, springs.glide, h);
        stepSpring(hand.y, hand.ty, springs.glide, h);
        stepSpring(
          hand.heat,
          target,
          hand.stoking ? springs.recoil : springs.drift,
          h,
        );
        stepSpring(hand.size, grow, springs.recoil, h);
        if (introState === "running") stepSpring(cool, 0, springs.drift, h);
      }
      const settledX = rest(hand.x, hand.tx, 0.3);
      const settledY = rest(hand.y, hand.ty, 0.3);
      const settledHeat = rest(hand.heat, target, 0.002);
      const settledSize = rest(hand.size, grow, 0.002);
      if (settledHeat) hand.stoking = false;
      if (!(settledX && settledY && settledHeat && settledSize)) busy = true;
      if (introState === "running") {
        if (rest(cool, 0, 0.002)) {
          introState = "done";
          L.onIntroEnd?.();
        } else busy = true;
      }
      // The hand leaves heat behind it; the crust closes over each mark.
      for (let i = 0; i < TRAIL; i += 1) {
        const age = (ages[i] ?? 99) + dt;
        ages[i] = age;
        if (age < 2) busy = true;
      }
      if (hand.heat.x > 0.05) {
        const lx = trail[((trailHead + TRAIL - 1) % TRAIL) * 4] ?? -1e4;
        const ly = trail[((trailHead + TRAIL - 1) % TRAIL) * 4 + 1] ?? -1e4;
        const reach = Math.max(8, L.radius) * hand.size.x;
        if (Math.hypot(hand.x.x - lx, hand.y.x - ly) > reach * 0.3) {
          const o = trailHead * 4;
          trail[o] = hand.x.x;
          trail[o + 1] = hand.y.x;
          trail[o + 2] = reach;
          trail[o + 3] = hand.heat.x;
          ages[trailHead] = 0;
          trailHead = (trailHead + 1) % TRAIL;
        }
      }
      return busy;
    };

    /** Reduced motion: everything stands where it is going. */
    const place = () => {
      hand.x.x = hand.tx;
      hand.y.x = hand.ty;
      hand.x.v = 0;
      hand.y.v = 0;
      hand.heat.x = hand.present ? (hand.pressed ? 1.7 : 1) : 0;
      hand.heat.v = 0;
      hand.size.x = 1;
      hand.size.v = 0;
      ages.fill(99);
      if (introState === "running") {
        introState = "done";
        latest.current.onIntroEnd?.();
      }
      cool.x = 0;
      cool.v = 0;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden || !program) {
        last = 0;
        return;
      }
      if (!latest.current.motionSafe) {
        place();
        draw();
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const busy = advance(dt);
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
        if (introState === "running") {
          introState = "done";
          cool.x = 0;
          latest.current.onIntroEnd?.();
        }
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
        if (!latest.current.motionSafe) stop();
        resize();
        kick();
      },
      recolor: () => {
        recolor();
        draw();
      },
      local,
      aim: (x, y, source) => {
        // A hand arriving from nowhere starts where it lands.
        if (!hand.present && hand.heat.x < 0.02) {
          hand.x.x = x;
          hand.y.x = y;
          hand.x.v = 0;
          hand.y.v = 0;
        }
        hand.tx = x;
        hand.ty = y;
        hand.present = true;
        hand.source = source;
        kick();
      },
      away: (source) => {
        if (source && hand.source !== source) return;
        hand.present = false;
        hand.pressed = false;
        hand.source = null;
        kick();
      },
      press: (down) => {
        if (hand.pressed === down) return;
        hand.pressed = down;
        hand.stoking = true;
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
    heat,
    crust,
    flow,
    scale,
    pulse,
    direction,
    pointerStrength,
    radius,
    seed,
    paused,
    dpr,
    motionSafe,
  ]);

  // A hand that is switched off lets go.
  React.useEffect(() => {
    if (!interactive) api.current?.away(null);
  }, [interactive]);

  React.useEffect(
    () => () => {
      unlisten.current?.();
    },
    [],
  );

  // A new theme or palette changes the carriers' colours; their 1 ms colour
  // transition says when, and the uniforms are read again from them.
  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current?.recolor();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive) return;
    // A finger heats only while it is down; hovering is for mice and pens.
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = a.local(event.clientX, event.clientY);
    a.aim(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = a.local(event.clientX, event.clientY);
    a.aim(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // Pressing a button in the content is the button's business.
    if (hit && rootRef.current?.contains(hit)) return;
    a.press(true);
    unlisten.current?.();
    const id = event.pointerId;
    const touch = event.pointerType === "touch";
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      unlisten.current?.();
      api.current?.press(false);
      if (touch) api.current?.away("pointer");
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    unlisten.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      unlisten.current = null;
    };
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

  // What stands in for the surface before it is drawn, or for good without
  // WebGL2: the crust over two pools, and above it, while a pour is due,
  // the molten pour, which cools away once the surface is known static.
  const crustStandIn = `radial-gradient(34% 52% at 74% 34%, ${palette[3]} 0%, ${palette[2]} 34%, ${palette[1]} 62%, transparent 100%), radial-gradient(30% 46% at 22% 26%, ${palette[2]} 0%, ${palette[1]} 55%, transparent 100%), radial-gradient(26% 40% at 48% 88%, ${palette[1]} 0%, transparent 100%), linear-gradient(${palette[0]}, ${palette[0]})`;
  const pourStandIn = `radial-gradient(70% 110% at 38% 62%, ${palette[3]} 0%, ${palette[2]} 42%, ${palette[1]} 100%)`;

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "group/forge-flow relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{ backgroundImage: crustStandIn }}
        />
        {intro ? (
          <div
            className="absolute inset-0 transition-opacity duration-1000 group-data-static/forge-flow:opacity-0"
            style={{ backgroundImage: pourStandIn }}
          />
        ) : null}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-painted/forge-flow:opacity-100"
        />
        {palette.map((colour, i) => (
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
