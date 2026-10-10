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

export type PaintVortexPalette = "dusk" | "sage" | "clay" | "ink";

export type PaintVortexProps = {
  /** The content on top of the paint: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How tightly the bands wind round the eye, 0 (loose arms) to 1 (a tight coil). @default 0.5 */
  twist?: number;
  /** How fast the bands flow in along the arms, 0 (still) to 2. @default 0.5 */
  speed?: number;
  /** A named palette, or 3 to 6 CSS colours of your own, darkest first. @default "dusk" */
  palette?: PaintVortexPalette | readonly string[];
  /** Colour bands round a full turn, 3 to 12. @default 7 */
  bands?: number;
  /** The felt's block size, px (2 to 16). @default 6 */
  pixel?: number;
  /** How much the blocks felt: fibres, soft edges and mixing where colours meet, 0 to 1. @default 0.5 */
  felt?: number;
  /** How far the arms bend like paint rather than ruled curves, 0 to 1. @default 0.35 */
  warp?: number;
  /** Where the eye rests, as fractions of the box's width and height. @default [0.68, 0.5] */
  origin?: readonly [number, number];
  /** The pointer and keyboard focus pull the eye, and a press stirs the paint. @default true */
  interactive?: boolean;
  /** How far the hand pulls the eye and how hard a press stirs, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the paint still; the hand still pulls and stirs it. @default false */
  paused?: boolean;
  /** Seeds the felt and the bend of the arms. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) pulling the eye. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Dyes at fixed lightness, darkest first, low in chroma: taste over spectacle. */
const PALETTES: Record<PaintVortexPalette, readonly string[]> = {
  dusk: [
    "oklch(0.4 0.06 330)",
    "oklch(0.67 0.07 15)",
    "oklch(0.84 0.05 75)",
    "oklch(0.55 0.04 255)",
    "oklch(0.92 0.025 90)",
  ],
  sage: [
    "oklch(0.4 0.04 155)",
    "oklch(0.63 0.05 140)",
    "oklch(0.81 0.045 115)",
    "oklch(0.56 0.04 70)",
    "oklch(0.91 0.03 95)",
  ],
  clay: [
    "oklch(0.42 0.07 35)",
    "oklch(0.66 0.09 48)",
    "oklch(0.83 0.05 75)",
    "oklch(0.58 0.05 15)",
    "oklch(0.91 0.02 80)",
  ],
  ink: [
    "oklch(from var(--accent) 0.36 calc(c * 0.4) h)",
    "oklch(from var(--accent-bright) 0.62 calc(c * 0.38) h)",
    "oklch(from var(--accent-bright) 0.82 calc(c * 0.18) calc(h - 35))",
    "oklch(from var(--accent) 0.5 calc(c * 0.22) calc(h + 45))",
    "oklch(from var(--accent-bright) 0.93 calc(c * 0.07) h)",
  ],
};

const inPage = (c: string) =>
  `color-mix(in oklab, ${c} 90%, var(--background))`;

const STEP = 1 / 120;
/** The eye's place follows on glide, the pull's presence on drift, and a stir sloshes on recoil. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const STIR = springs.recoil;
/** A full press's stir, into the stir spring's velocity. */
const KICK = 7;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

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

/** The elements a backdrop leaves to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_block;
uniform vec2 u_eye;
uniform float u_unit;
uniform float u_twist;
uniform float u_bands;
uniform float u_flow;
uniform float u_warp;
uniform float u_felt;
uniform vec2 u_seed;
uniform vec3 u_c[6];
uniform int u_count;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

vec3 dye(int i) {
  vec3 c = u_c[0];
  for (int k = 1; k < 6; k++) if (k == i) c = u_c[k];
  return c;
}

void main() {
  vec2 css = v_uv * u_res / u_px;
  vec2 cell = floor(css / u_block);
  vec2 local = css / u_block - cell;
  vec2 centre = (cell + 0.5) * u_block;
  float h1 = kx_hash(cell + u_seed);
  float h2 = kx_hash(cell.yx * 1.31 + u_seed + 7.1);
  float h3 = kx_hash(cell * 0.71 + u_seed.yx + 3.3);

  // The paint at the block's centre: a logarithmic spiral about the eye,
  // its arms bent by a slow noise so they read as paint, not a rose.
  vec2 q = (centre - u_eye) / u_unit;
  vec2 bend = vec2(
    kx_noise(q * 1.4 + u_seed + u_flow * 0.6),
    kx_noise(q * 1.4 + u_seed.yx + 4.0 - u_flow * 0.5)
  ) - 0.5;
  q += bend * u_warp * 0.7;
  float r = length(q);
  float a = atan(q.y, q.x);
  float s = a / 6.2831853 + u_twist * log(r + 0.035) - u_flow;
  // Felt: where two colours meet, blocks of each interleave.
  float band = s * u_bands + (h1 - 0.5) * u_felt * 0.5;
  float idx = mod(floor(band), u_bands);
  int k = int(mod(idx, float(u_count)));
  vec3 col = dye(k);
  // The eye sinks into the darkest dye.
  col = mix(u_c[0] * 0.82, col, smoothstep(0.03, 0.2, r));

  // Each block is a little felt square: its own lightness, a pillowed
  // edge and a few fibres lying across it.
  col *= 1.0 + (h2 - 0.5) * 0.09 * u_felt;
  float edge = min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y));
  col *= 1.0 - u_felt * 0.16 * (1.0 - smoothstep(0.0, 0.24, edge));
  float ang = h3 * 3.1415927;
  float lay = dot(local - 0.5, vec2(cos(ang), sin(ang)));
  float fibre = abs(fract(lay * 2.6 + h1) - 0.5);
  float px = 0.5 / max(1.0, u_block * u_px);
  col += (vec3(1.0) - col) * u_felt * 0.07 * (1.0 - smoothstep(px, px * 3.0, fibre));
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
  twist: number;
  speed: number;
  paletteKey: string;
  count: number;
  bands: number;
  pixel: number;
  felt: number;
  warp: number;
  ox: number;
  oy: number;
  interactive: boolean;
  pointerStrength: number;
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
  stir: (strength: number) => void;
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
  const read = rgbReader();
  const colours = new Float32Array(18);
  const size = { w: 0, h: 0 };
  const sim = { flow: 0, stir: 0, stirV: 0 };
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
    gl.uniform1f(u.u_block ?? null, clamp(c.pixel, 2, 16));
    gl.uniform1f(
      u.u_unit ?? null,
      Math.max(40, Math.min(size.w, size.h) * 0.6),
    );
    gl.uniform1f(u.u_bands ?? null, Math.round(clamp(c.bands, 3, 12)));
    gl.uniform1f(u.u_warp ?? null, clamp(c.warp, 0, 1));
    gl.uniform1f(u.u_felt ?? null, clamp(c.felt, 0, 1));
    gl.uniform2f(u.u_seed ?? null, rand() * 97, rand() * 97);
    gl.uniform3fv(u.u_c ?? null, colours);
    gl.uniform1i(u.u_count ?? null, clamp(c.count, 1, 6));
  };

  /** The eye's resting place, px. */
  const home = () => {
    const c = cfg;
    return {
      x: size.w * clamp(c?.ox ?? 0.68, 0, 1),
      y: size.h * clamp(c?.oy ?? 0.5, 0, 1),
    };
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    const rest = home();
    const pull = clamp(c.pointerStrength, 0, 1) * hand.amount;
    const ex = rest.x + (hand.px - rest.x) * pull;
    const ey = rest.y + (hand.py - rest.y) * pull;
    gl.uniform2f(u.u_eye ?? null, ex, ey);
    const twist = (0.06 + clamp(c.twist, 0, 1) * 1.05) * (1 + sim.stir);
    gl.uniform1f(u.u_twist ?? null, twist);
    gl.uniform1f(u.u_flow ?? null, c.motionSafe ? sim.flow : 0.37);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the flow, the eye and the stir. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const flowing = !c.paused && c.speed > 0;
    if (flowing) {
      sim.flow += dt * clamp(c.speed, 0, 2) * 0.06;
      moving = true;
    }
    const want = hand.present && c.interactive ? 1 : 0;
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
      sim.stirV +=
        ((-STIR.stiffness * sim.stir - STIR.damping * sim.stirV) / STIR.mass) *
        h;
      sim.stir += sim.stirV * h;
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
    const stirring = Math.abs(sim.stir) > 0.001 || Math.abs(sim.stirV) > 0.01;
    if (!stirring) {
      sim.stir = 0;
      sim.stirV = 0;
    }
    return (
      moving || (handMoving && hand.amount > 0.001) || arriving || stirring
    );
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Turning alone, the paint moves slowly enough for thirty frames a
    // second; the hand and a stir get every frame.
    const calm =
      !hand.present && hand.amount === 0 && sim.stir === 0 && sim.stirV === 0;
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
    const c = cfg;
    const kids = carriers.children;
    const n = clamp(c?.count ?? 5, 1, 6);
    for (let i = 0; i < 6; i += 1) {
      const el = kids[Math.min(i, n - 1)];
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
    const first = size.w < 1;
    size.w = w;
    size.h = h;
    if (first) {
      const at = home();
      hand.x = at.x;
      hand.y = at.y;
      hand.px = at.x;
      hand.py = at.y;
    }
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
      if (was.paletteKey !== next.paletteKey || was.count !== next.count)
        readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) {
        hand.px = hand.x;
        hand.py = hand.y;
        hand.amount = hand.present ? 1 : 0;
        sim.stir = 0;
        sim.stirV = 0;
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
      if (!hand.present && hand.amount < 0.01) {
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
        // Reduced motion: the eye lands exactly where the hand pulls it.
        hand.px = x;
        hand.py = y;
        hand.amount = 1;
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
    stir(strength) {
      const c = cfg;
      if (!c || !c.motionSafe || !c.interactive) return;
      // Into the stir spring: the arms wind tight, then slosh back loose
      // past rest and settle in two beats.
      sim.stirV += KICK * clamp(c.pointerStrength, 0, 1) * strength;
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
 * A background of colour bands twisted into a slow spiral and rendered as
 * felt, with the content on top in its own layer. A WebGL2 shader quantises
 * the frame into square blocks and paints each with the paint at its
 * centre: a logarithmic spiral about the eye, its arms bent by a slow noise
 * so they read as paint, flowing gently inward; the very centre sinks into
 * the darkest dye. Each block is felted — its own lightness, a pillowed
 * edge, fibres across it, and where two colours meet, blocks of each
 * interleave.
 *
 * The hand pulls the eye toward it, its place on glide and the pull's
 * presence on drift. A press stirs the paint: an impulse into a twist spring
 * with recoil's constants, so the arms wind tight round the press, slosh
 * back loose past rest and settle in two beats. Keyboard focus on a control
 * inside pulls the eye there with a softer stir. Thirty frames a second
 * while it only turns, every frame while the hand works, nothing off screen
 * or hidden. Without WebGL2 a CSS still of the palette stands in; under
 * reduced motion one still frame is drawn and the eye moves straight to
 * where the hand pulls it.
 */
export function PaintVortex({
  children,
  twist = 0.5,
  speed = 0.5,
  palette = "dusk",
  bands = 7,
  pixel = 6,
  felt = 0.5,
  warp = 0.35,
  origin = [0.68, 0.5],
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: PaintVortexProps) {
  const motionSafe = useMotionSafe();
  const list =
    typeof palette === "string"
      ? (PALETTES[palette as PaintVortexPalette] ?? PALETTES.dusk)
      : palette.length >= 3
        ? palette.slice(0, 6)
        : PALETTES.dusk;
  const paints = list.map(inPage);
  const paletteKey = paints.join("|");
  const ox = clamp(origin[0] ?? 0.68, 0, 1);
  const oy = clamp(origin[1] ?? 0.5, 0, 1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    twist,
    speed,
    paletteKey,
    count: paints.length,
    bands,
    pixel,
    felt,
    warp,
    ox,
    oy,
    interactive,
    pointerStrength,
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
      visible.current = false;
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
    if (!hit || !rootRef.current?.contains(hit)) engine.current?.stir(1);
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
    engine.current?.stir(0.5);
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
        // The hand reads the pointer without holding it: the page scrolls.
        "group/paint-vortex relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/paint-vortex:invisible group-data-live/paint-vortex:opacity-0"
        style={standIn(paints, ox, oy, bands, seed, pixel)}
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
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the palette's bands as wedges round the eye, sinking into
 * the darkest dye at the centre, under the felt's block grid.
 */
function standIn(
  paints: readonly string[],
  ox: number,
  oy: number,
  bands: number,
  seed: number,
  pixel: number,
): React.CSSProperties {
  const n = Math.round(clamp(bands, 3, 12));
  const step = r2(360 / n);
  const stops: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const c = paints[i % paints.length] ?? "gray";
    stops.push(`${c} ${r2(i * step)}deg ${r2((i + 1) * step)}deg`);
  }
  const at = `${Math.round(ox * 100)}% ${Math.round(oy * 100)}%`;
  const turn = Math.round(lcg(seed * 7 + 5)() * 360);
  const block = r2(clamp(pixel, 2, 16));
  const seam = "color-mix(in oklab, black 7%, transparent)";
  return {
    backgroundColor: paints[1],
    backgroundImage: [
      `repeating-linear-gradient(0deg, ${seam} 0 1px, transparent 1px ${block}px)`,
      `repeating-linear-gradient(90deg, ${seam} 0 1px, transparent 1px ${block}px)`,
      `radial-gradient(circle at ${at}, ${paints[0] ?? "gray"} 0, transparent 14%)`,
      `conic-gradient(from ${turn}deg at ${at}, ${stops.join(", ")})`,
    ].join(", "),
  };
}
