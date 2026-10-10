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

export type AetherSwirlPalette = "cobalt" | "dusk" | "ember" | "lagoon";

export type AetherSwirlProps = {
  /** The content on top of the colour: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How deeply the colour folds through itself, 0 (soft clouds) to 1 (tight marbling). @default 0.6 */
  warp?: number;
  /** How fast it drifts, 0 (still) to 2. @default 0.5 */
  speed?: number;
  /** A named palette, or four CSS colours of your own, darkest first. @default "cobalt" */
  palette?: AetherSwirlPalette | readonly string[];
  /** The size of a swirl, px. @default 340 */
  scale?: number;
  /** How much fine structure the folds carry, 0 to 1. @default 0.6 */
  detail?: number;
  /** Fine filaments along the folds, 0 (none) to 1. @default 0.4 */
  veins?: number;
  /** Light on the surface, like oil, 0 to 1. @default 0.4 */
  sheen?: number;
  /** A whisper of film grain that also hides banding, 0 to 1. @default 0.25 */
  grain?: number;
  /** The pointer and keyboard focus deepen the folds, and a press winds the colour round. @default true */
  interactive?: boolean;
  /** How much the hand deepens the folds and how hard a press winds them, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the hand reaches, px. @default 200 */
  radius?: number;
  /** Hold the colour still; the hand still folds it. @default false */
  paused?: boolean;
  /** Seeds the pattern, so two swirls never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) folding the colour. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Pigments at fixed lightness, darkest first; each sits 14 % into the page so the swirl belongs to its theme. */
const PALETTES: Record<AetherSwirlPalette, readonly string[]> = {
  cobalt: [
    "oklch(from var(--accent) 0.32 calc(c * 0.8) h)",
    "oklch(from var(--accent-bright) 0.56 c h)",
    "oklch(from var(--accent-bright) 0.72 calc(c * 0.55) calc(h + 38))",
    "oklch(from var(--accent-bright) 0.94 calc(c * 0.12) calc(h - 20))",
  ],
  dusk: [
    "oklch(0.32 0.08 292)",
    "oklch(0.58 0.14 332)",
    "oklch(0.79 0.11 42)",
    "oklch(0.92 0.05 82)",
  ],
  ember: [
    "oklch(0.3 0.08 22)",
    "oklch(0.56 0.16 32)",
    "oklch(0.77 0.14 62)",
    "oklch(0.93 0.06 92)",
  ],
  lagoon: [
    "oklch(0.3 0.06 222)",
    "oklch(0.55 0.1 202)",
    "oklch(0.79 0.1 172)",
    "oklch(0.94 0.04 122)",
  ],
};

const inPage = (c: string) =>
  `color-mix(in oklab, ${c} 86%, var(--background))`;

/** The browser draws the canvas a third smaller and scales it up: the image is soft by nature. */
const RENDER_SCALE = 0.66;
const STEP = 1 / 120;
/** The hand's place follows on glide, its presence and the fold on drift. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/** A press's fold, rad/s into the twist spring at full strength. */
const FOLD = 9;

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
uniform vec2 u_res;
uniform float u_px;
uniform float u_scale;
uniform float u_time;
uniform float u_warp;
uniform int u_octaves;
uniform float u_veins;
uniform float u_sheen;
uniform float u_grain;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_hand;
uniform float u_radius;
uniform float u_twist;
uniform vec2 u_seed;
uniform float u_frame;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float total = 0.0;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    if (i >= u_octaves) break;
    sum += amp * kx_noise(p);
    total += amp;
    p = turn * p * 2.03 + vec2(17.1, 9.4);
    amp *= 0.5;
  }
  return sum / total;
}

vec3 ramp(float x) {
  x = clamp(x, 0.0, 1.0) * 3.0;
  vec3 c = mix(u_c0, u_c1, smoothstep(0.0, 1.0, x));
  c = mix(c, u_c2, smoothstep(1.0, 2.0, x));
  return mix(c, u_c3, smoothstep(2.0, 3.0, x));
}

void main() {
  vec2 px = v_uv * u_res / u_px;
  vec2 toHand = px - u_hand.xy;
  float d2 = dot(toHand, toHand) / (u_radius * u_radius);
  float near = exp(-d2) * u_hand.z;
  // The fold: the field turned about the hand, most at its centre.
  float angle = u_twist * exp(-d2 * 0.8);
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 turned = u_hand.xy + mat2(ca, sa, -sa, ca) * toHand;
  vec2 p = turned / u_scale + u_seed;
  float t = u_time;
  float w = u_warp * (1.0 + 1.5 * near);
  vec2 q = vec2(
    fbm(p + t * vec2(0.031, 0.012)),
    fbm(p + vec2(5.2, 1.3) - t * vec2(0.013, 0.027))
  );
  vec2 r = vec2(
    fbm(p + 3.4 * w * q + vec2(1.7, 9.2) + t * 0.11),
    fbm(p + 3.4 * w * q + vec2(8.3, 2.8) - t * 0.09)
  );
  float f = fbm(p + 3.8 * w * r);

  // Marbling: the broad field sets where each colour lies, and bands that
  // follow the folds stripe through it, so the colours are drawn out into
  // one another the way ink is when oil is combed.
  float g = f * 3.0 + r.x * 0.45;
  float band = 0.5 + 0.5 * sin(6.2831853 * g);
  float x = mix(smoothstep(0.18, 0.82, f), band, 0.42);
  vec3 col = ramp(x);
  // The folds carry their own shade: deep where the first field bunches,
  // pale where the second lifts.
  col = mix(col, u_c0, 0.3 * smoothstep(0.3, 0.75, length(q - vec2(0.5)) * 1.7));
  col = mix(col, u_c3, 0.16 * smoothstep(0.6, 0.85, r.y));

  // Veins: hair-fine filaments where one band meets the next, dark on the
  // line and lit along one side, anti-aliased to a pixel.
  float fw = max(fwidth(g), 1e-4);
  float fr = fract(g);
  float dist = min(fr, 1.0 - fr);
  float line = 1.0 - smoothstep(0.0, fw * 1.2, dist);
  float lit = (1.0 - smoothstep(fw, fw * 3.5, fr)) * step(fw * 1.2, fr);
  col = mix(col, u_c0 * 0.8, line * u_veins * 0.34);
  col = mix(col, u_c3, lit * u_veins * 0.18);

  // Sheen: light from the upper left on the fold's slope, like oil.
  vec2 slope = vec2(dFdx(f), -dFdy(f)) * u_scale * u_px;
  vec3 n = normalize(vec3(-slope * 0.32, 1.0));
  vec3 l = normalize(vec3(-0.42, -0.5, 0.76));
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
  col += (vec3(1.0) - col) * spec * u_sheen * 0.32;
  col *= 1.0 - u_sheen * 0.08 * (1.0 - dot(n, l));

  float noise = kx_hash(gl_FragCoord.xy + vec2(u_frame * 17.0, u_frame * 31.0));
  col += (noise - 0.5) * u_grain * 0.045;
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
  warp: number;
  speed: number;
  paletteKey: string;
  scale: number;
  detail: number;
  veins: number;
  sheen: number;
  grain: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
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
  fold: (strength: number) => void;
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
  const colours = new Float32Array(12);
  const size = { w: 0, h: 0 };
  const sim = { t: 0, twist: 0, twistV: 0 };
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
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
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
    const rand = lcg(c.seed * 13 + 1);
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_scale ?? null, clamp(c.scale, 60, 2000));
    gl.uniform1f(u.u_warp ?? null, clamp(c.warp, 0, 1));
    gl.uniform1i(
      u.u_octaves ?? null,
      3 + Math.round(clamp(c.detail, 0, 1) * 3),
    );
    gl.uniform1f(u.u_veins ?? null, clamp(c.veins, 0, 1));
    gl.uniform1f(u.u_sheen ?? null, clamp(c.sheen, 0, 1));
    gl.uniform1f(u.u_grain ?? null, clamp(c.grain, 0, 1));
    gl.uniform1f(
      u.u_radius ?? null,
      clamp(c.radius, 24, Math.max(24, Math.min(size.w, size.h) * 0.6)),
    );
    gl.uniform2f(u.u_seed ?? null, rand() * 9, rand() * 9);
    const names = ["u_c0", "u_c1", "u_c2", "u_c3"];
    for (let i = 0; i < 4; i += 1) {
      gl.uniform3f(
        u[names[i] ?? "u_c0"] ?? null,
        colours[i * 3] ?? 0,
        colours[i * 3 + 1] ?? 0,
        colours[i * 3 + 2] ?? 0,
      );
    }
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    const t = c.motionSafe ? sim.t : 12;
    gl.uniform1f(u.u_time ?? null, t);
    gl.uniform3f(u.u_hand ?? null, hand.px, hand.py, hand.amount);
    gl.uniform1f(u.u_twist ?? null, sim.twist);
    gl.uniform1f(u.u_frame ?? null, c.motionSafe ? frames % 64 : 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    frames += 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances time, the hand and the fold. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const drifting = !c.paused && c.speed > 0;
    if (drifting) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
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
      sim.twistV +=
        ((-DRIFT.stiffness * sim.twist - DRIFT.damping * sim.twistV) /
          DRIFT.mass) *
        h;
      sim.twist += sim.twistV * h;
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
    const folding = Math.abs(sim.twist) > 0.001 || Math.abs(sim.twistV) > 0.01;
    if (!folding) {
      sim.twist = 0;
      sim.twistV = 0;
    }
    return moving || (handMoving && hand.amount > 0.001) || arriving || folding;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Drifting alone, the colour moves slowly enough for thirty frames a
    // second; the hand and a fold get every frame.
    const calm =
      !hand.present && hand.amount === 0 && sim.twist === 0 && sim.twistV === 0;
    if (calm && last && now - drawnAt < 31) {
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

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
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
      if (was.paletteKey !== next.paletteKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) {
        hand.px = hand.x;
        hand.py = hand.y;
        hand.amount = hand.present ? clamp(next.pointerStrength, 0, 1) : 0;
        sim.twist = 0;
        sim.twistV = 0;
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
      if (c && !c.motionSafe) {
        // Reduced motion: the hand's deepening lands exactly where it is.
        hand.px = x;
        hand.py = y;
        hand.amount = clamp(c.pointerStrength, 0, 1);
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) hand.amount = 0;
      kick();
    },
    fold(strength) {
      const c = cfg;
      if (!c || !c.motionSafe) return;
      // The twist spring is critically damped: the colour winds round the
      // hand in about a tenth of a second and lets go over most of one.
      sim.twistV += FOLD * clamp(c.pointerStrength, 0, 1) * strength;
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
 * A background of colour folded through itself, like ink suspended in oil,
 * with the content on top in its own layer. A WebGL2 shader warps noise by
 * noise by noise — each fold displacing the next — and maps the result
 * through four palette colours, then lays fine filaments along the folds and
 * a soft sheen across their slopes, so it reads as a liquid, not a gradient.
 * It drifts slowly, re-folding over tens of seconds.
 *
 * The pointer is a hand in the liquid: the folds deepen under it, its place
 * following on glide and its presence arriving on drift. A press winds the
 * colour round the hand — an angular push into a critically damped twist
 * spring with the drift constants, so it turns in a tenth of a second and
 * unwinds without a wobble. Keyboard focus on a control inside brings the
 * hand there and gives a softer fold. Thirty frames a second while it only
 * drifts, every frame while the hand works; only on screen in a visible page.
 * Without WebGL2 a CSS still frame of the palette stands in, and under
 * reduced motion one still frame is drawn and the hand's deepening lands
 * exactly where it is.
 */
export function AetherSwirl({
  children,
  warp = 0.6,
  speed = 0.5,
  palette = "cobalt",
  scale = 340,
  detail = 0.6,
  veins = 0.4,
  sheen = 0.4,
  grain = 0.25,
  interactive = true,
  pointerStrength = 0.6,
  radius = 200,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: AetherSwirlProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(() => {
    const list =
      typeof palette === "string"
        ? (PALETTES[palette] ?? PALETTES.cobalt)
        : palette.length >= 4
          ? palette.slice(0, 4)
          : PALETTES.cobalt;
    return list.map(inPage);
  }, [palette]);
  const paletteKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    warp,
    speed,
    paletteKey,
    scale,
    detail,
    veins,
    sheen,
    grain,
    interactive,
    pointerStrength,
    radius,
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
    if (!hit || !rootRef.current?.contains(hit)) engine.current?.fold(1);
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
    engine.current?.fold(0.6);
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
        // A sideways drag works the colour on touch; an upright one scrolls.
        "group/aether-swirl relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/aether-swirl:opacity-0"
        style={standIn(paints, seed)}
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
 * browser without WebGL2: the palette pooled in seeded soft blots over its
 * middle colour, with a slow conic turn through them.
 */
function standIn(paints: readonly string[], seed: number): React.CSSProperties {
  const rand = lcg(seed * 7 + 5);
  const at = () =>
    `${Math.round(10 + rand() * 80)}% ${Math.round(10 + rand() * 80)}%`;
  const [c0, c1, c2, c3] = paints;
  return {
    backgroundColor: c1,
    backgroundImage: [
      `radial-gradient(ellipse 50% 70% at ${at()}, ${c3} 0, transparent 70%)`,
      `radial-gradient(ellipse 60% 80% at ${at()}, ${c2} 0, transparent 70%)`,
      `radial-gradient(ellipse 55% 75% at ${at()}, ${c0} 0, transparent 72%)`,
      `conic-gradient(from ${Math.round(rand() * 360)}deg at ${at()}, ${c1}, ${c2}, ${c1}, ${c0}, ${c1})`,
    ].join(", "),
  };
}
