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

export type RippleLatticeColor = "ink" | "cobalt" | "signal" | "rose";

export type RippleLatticeProps = {
  /** The content on top of the grid: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The distance between grid lines, px, 8 to 96. @default 24 */
  spacing?: number;
  /** How hard a ripple pushes the lines, 0 (not at all) to 1 (hard enough that the crests just begin to fold). @default 0.6 */
  strength?: number;
  /** The lines' colour: a named one, or any CSS colour. @default "cobalt" */
  color?: RippleLatticeColor | (string & {});
  /** The lines' width, px. @default 1 */
  lineWidth?: number;
  /** The distance between the wavelets in a ripple, px; longer waves also push farther. @default 56 */
  wavelength?: number;
  /** How fast a ripple spreads, px per second. @default 260 */
  speed?: number;
  /** How long a ripple lasts, seconds: its amplitude's time constant. @default 1.1 */
  decay?: number;
  /** How much the lines thicken and brighten at the crests, 0 to 1. @default 0.7 */
  crest?: number;
  /** Soft drops falling on the grid by themselves, 0 (none: the grid rests flat) to 1. @default 0.3 */
  drizzle?: number;
  /** A moving pointer leaves a wake of small ripples. @default true */
  trail?: boolean;
  /** The pointer and keyboard focus ripple the grid. @default true */
  interactive?: boolean;
  /** Stop the drizzle; the hand still ripples the grid. @default false */
  paused?: boolean;
  /** Seeds where the drizzle falls, so two grids never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) rippling the grid. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press or keyboard focus drops a ripple, with where it fell in px from the box's top left. */
  onRipple?: (x: number, y: number) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const COLORS: Record<RippleLatticeColor, string> = {
  ink: "var(--foreground)",
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  rose: "oklch(0.66 0.16 12)",
};

/** At most this many ripples sum at once; the SVG fallback takes the strongest dozen. */
const MAX_RIPPLES = 32;
const MAX_SVG_RIPPLES = 12;
/** A press lands like a stone: a second, softer ring follows it out. */
const ECHO_DELAY = 0.14;
const ECHO_AMP = 0.5;
/** The resting lines' opacity; the crests rise from here to full. */
const BASE_ALPHA = 0.26;
/** Reduced motion: the still ring a press draws fades over this long, s. */
const STILL_FADE = 0.8;
/**
 * Where a press lands the mat dents in and bounces back on recoil — two
 * visible bounces, the stone's landing — while its ring spreads out.
 */
const RECOIL = springs.recoil;
const DENT_KICK = 20;
const STEP = 1 / 120;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = [number, number, number];

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
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/*
 * Each pixel asks where it came from: the lattice is sampled at the pixel's
 * position minus the ripples' push, which for these amplitudes is close to
 * the true inverse of the push and costs one pass.
 */
const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_spacing;
uniform vec2 u_origin;
uniform float u_lineWidth;
uniform float u_wavelength;
uniform float u_speed;
uniform float u_reach;
uniform float u_crest;
uniform float u_base;
uniform vec3 u_bg;
uniform vec3 u_line;
uniform vec3 u_hi;
uniform int u_count;
uniform vec4 u_rip[${MAX_RIPPLES}];
uniform vec4 u_dent;
in vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_px;
  vec2 push = vec2(0.0);
  float crest = 0.0;
  float k = 6.2831853 / u_wavelength;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= u_count) break;
    vec4 r = u_rip[i];
    vec2 q = p - r.xy;
    float dist = length(q);
    // Ahead of the front the packet is short; behind it a train of
    // wavelets trails off, as on water.
    float s = dist - r.z * u_speed;
    float w = s > 0.0 ? s / (0.45 * u_wavelength) : s / (1.7 * u_wavelength);
    float wave = cos(s * k) * exp(-w * w);
    float amp = r.w * inversesqrt(1.0 + dist / (2.0 * u_wavelength));
    amp *= smoothstep(0.0, 0.6 * u_wavelength, dist);
    push += (q / max(dist, 0.001)) * wave * amp;
    crest += max(0.0, wave) * amp;
  }
  // The dent pulls the cells toward the press, and past rest pushes them out.
  vec2 dq = p - u_dent.xy;
  float dd = length(dq) / u_dent.w;
  float dentF = u_dent.z * dd * exp(-dd * dd) * 2.33;
  push -= (dq / max(length(dq), 0.001)) * dentF;
  crest += abs(dentF) * 0.6;
  vec2 g = (p - push * u_reach - u_origin) / u_spacing;
  vec2 f = abs(fract(g + 0.5) - 0.5) * u_spacing;
  vec2 aa = max(fwidth(g) * u_spacing, vec2(0.5 / u_px));
  float lift = clamp(crest * u_crest * 1.5, 0.0, 1.0);
  float halfWidth = u_lineWidth * 0.5 * (1.0 + lift * 0.7);
  vec2 cov = 1.0 - smoothstep(vec2(halfWidth) - aa * 0.5, vec2(halfWidth) + aa * 0.5, f);
  // A hairline thinner than a pixel keeps its weight as coverage.
  cov *= min(1.0, (2.0 * halfWidth) / max(aa.x, aa.y) + 0.35);
  float line = max(cov.x, cov.y);
  float alpha = line * (u_base + (1.0 - u_base) * lift);
  vec3 col = mix(u_line, u_hi, lift);
  outColor = vec4(mix(u_bg, col, alpha), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Ripple = { x: number; y: number; born: number; amp: number };

type Config = {
  spacing: number;
  strength: number;
  paintKey: string;
  lineWidth: number;
  wavelength: number;
  speed: number;
  decay: number;
  crest: number;
  drizzle: number;
  trail: boolean;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onRipple: (x: number, y: number) => void;
};

type Svg = {
  rest: SVGRectElement;
  body: SVGPathElement;
  crest: SVGPathElement;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (
    x: number,
    y: number,
    at: number,
    source: "pointer" | "focus",
  ) => void;
  handAway: (source: "pointer" | "focus") => void;
  drop: (x: number, y: number, amp: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  svg: Svg,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let fallback = false;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let active = false;
  let rand = lcg(1);
  const read = rgbReader();
  const colours = new Float32Array(9);
  const size = { w: 0, h: 0 };
  const sim = { t: 0, nextDrop: 0 };
  const dent = { x: 0, y: 0, v: 0, at: 0 };
  const ripples: Ripple[] = [];
  const uploads = new Float32Array(MAX_RIPPLES * 4);
  let live = 0;
  const hand = {
    x: 0,
    y: 0,
    at: 0,
    travel: 0,
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

  const spacingOf = (c: Config) => clamp(c.spacing, 8, 96);
  const wavelengthOf = (c: Config) => clamp(c.wavelength, 12, 400);
  const speedOf = (c: Config) => clamp(c.speed, 20, 2000);
  const decayOf = (c: Config) => clamp(c.decay, 0.1, 6);
  /**
   * The largest push. It is tied to the wavelength so the lines bend and
   * never fold: the push changes by at most about its own size over a
   * wavelength's sixth, which keeps each pixel's inverse map single-valued
   * until strength nears 1.
   */
  const reachOf = (c: Config) =>
    clamp(c.strength, 0, 1) *
    Math.min(spacingOf(c) * 0.9, (1.25 * wavelengthOf(c)) / (Math.PI * 2));
  const dentRadiusOf = (c: Config) =>
    Math.max(spacingOf(c) * 2.2, wavelengthOf(c) * 0.9);
  /** The lattice is centred: the box's middle falls in the middle of a cell. */
  const originOf = (c: Config) => {
    const sp = spacingOf(c);
    return [size.w / 2 + sp / 2, size.h / 2 + sp / 2] as const;
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const [ox, oy] = originOf(c);
    p.program.set({
      u_res: [canvas.width, canvas.height],
      u_px: canvas.width / Math.max(1, size.w),
      u_spacing: spacingOf(c),
      u_origin: [ox, oy],
      u_lineWidth: clamp(c.lineWidth, 0.25, 6),
      u_wavelength: wavelengthOf(c),
      u_speed: speedOf(c),
      u_reach: reachOf(c),
      u_crest: clamp(c.crest, 0, 1),
      u_base: BASE_ALPHA,
      u_bg: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_line: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
      u_hi: [colours[6] ?? 0, colours[7] ?? 0, colours[8] ?? 0],
    });
  };

  /** Ripple ages and amplitudes now; drops the spent ones. Returns how many remain. */
  const gather = (): number => {
    const c = cfg;
    if (!c) return 0;
    const decay = decayOf(c);
    const reach = Math.hypot(size.w, size.h) + 3 * wavelengthOf(c);
    const still = !c.motionSafe;
    let n = 0;
    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const r = ripples[i];
      if (!r) continue;
      const age = sim.t - r.born;
      if (age < 0) continue;
      const amp = still
        ? r.amp * Math.max(0, 1 - age / STILL_FADE)
        : r.amp * Math.exp(-age / decay);
      const front = still ? 0 : age * speedOf(c);
      if (amp < 0.01 || front > reach) {
        ripples.splice(i, 1);
        continue;
      }
      if (n >= MAX_RIPPLES) continue;
      // Reduced motion freezes the ring a wavelength and a half out.
      const shownAge = still ? (1.5 * wavelengthOf(c)) / speedOf(c) : age;
      uploads[n * 4] = r.x;
      uploads[n * 4 + 1] = r.y;
      uploads[n * 4 + 2] = shownAge;
      uploads[n * 4 + 3] = amp;
      n += 1;
    }
    live = n;
    return ripples.length;
  };

  /** The forward push on a lattice point, for the SVG: the shader's sum, on the CPU. */
  const pushAt = (
    x: number,
    y: number,
    count: number,
    out: { x: number; y: number; crest: number },
  ) => {
    const c = cfg;
    out.x = 0;
    out.y = 0;
    out.crest = 0;
    if (!c) return;
    const lam = wavelengthOf(c);
    const k = (Math.PI * 2) / lam;
    const sp = speedOf(c);
    for (let i = 0; i < count; i += 1) {
      const rx = uploads[i * 4] ?? 0;
      const ry = uploads[i * 4 + 1] ?? 0;
      const age = uploads[i * 4 + 2] ?? 0;
      const amp0 = uploads[i * 4 + 3] ?? 0;
      const qx = x - rx;
      const qy = y - ry;
      const dist = Math.hypot(qx, qy);
      const s = dist - age * sp;
      const w = s > 0 ? s / (0.45 * lam) : s / (1.7 * lam);
      const wave = Math.cos(s * k) * Math.exp(-w * w);
      const t = clamp(dist / (0.6 * lam), 0, 1);
      const amp =
        (amp0 / Math.sqrt(1 + dist / (2 * lam))) * t * t * (3 - 2 * t);
      const inv = 1 / Math.max(dist, 0.001);
      out.x += qx * inv * wave * amp;
      out.y += qy * inv * wave * amp;
      out.crest += Math.max(0, wave) * amp;
    }
    if (dent.at !== 0) {
      const qx = x - dent.x;
      const qy = y - dent.y;
      const dist = Math.hypot(qx, qy);
      const dd = dist / dentRadiusOf(c);
      const f = dent.at * dd * Math.exp(-dd * dd) * 2.33;
      const inv = 1 / Math.max(dist, 0.001);
      out.x -= qx * inv * f;
      out.y -= qy * inv * f;
      out.crest += Math.abs(f) * 0.6;
    }
  };

  const point = { x: 0, y: 0, crest: 0 };

  /** The SVG fallback: the pattern at rest, two rebuilt paths while rippling. */
  const drawSvg = () => {
    const c = cfg;
    if (!c || !visible.current || size.w < 1) return;
    if (live === 0 && dent.at === 0) {
      svg.rest.style.visibility = "";
      svg.body.setAttribute("d", "");
      svg.crest.setAttribute("d", "");
      return;
    }
    const count = Math.min(live, MAX_SVG_RIPPLES);
    const sp = spacingOf(c);
    const reach = reachOf(c);
    const [ox, oy] = originOf(c);
    const stepPx = 6;
    const body: string[] = [];
    const crest: string[] = [];
    const lift = clamp(c.crest, 0, 1) * 1.5;
    const trace = (vertical: boolean, at: number, span: number) => {
      let crestOpen = false;
      for (let s = -sp; s <= span + sp; s += stepPx) {
        const x = vertical ? at : s;
        const y = vertical ? s : at;
        pushAt(x, y, count, point);
        const px = r1(x + point.x * reach);
        const py = r1(y + point.y * reach);
        body.push(`${s === -sp ? "M" : "L"}${px} ${py}`);
        if (point.crest * lift > 0.3) {
          crest.push(`${crestOpen ? "L" : "M"}${px} ${py}`);
          crestOpen = true;
        } else crestOpen = false;
      }
    };
    const first = (o: number) => o - Math.ceil(o / sp) * sp;
    for (let x = first(ox); x <= size.w + sp; x += sp) trace(true, x, size.h);
    for (let y = first(oy); y <= size.h + sp; y += sp) trace(false, y, size.w);
    svg.rest.style.visibility = "hidden";
    svg.body.setAttribute("d", body.join(""));
    svg.crest.setAttribute("d", crest.join(""));
  };

  const draw = () => {
    const c = cfg;
    if (!c || !visible.current || size.w < 1) return;
    if (fallback) {
      drawSvg();
      return;
    }
    const p = gpu;
    if (!p || p.lost) return;
    p.program.set({
      u_count: live,
      u_rip: uploads,
      u_dent: [dent.x, dent.y, dent.at, dentRadiusOf(c)],
    });
    p.gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const add = (x: number, y: number, amp: number, delay = 0) => {
    const r: Ripple = { x, y, born: sim.t + delay, amp: clamp(amp, 0, 1.2) };
    if (ripples.length < MAX_RIPPLES * 2) {
      ripples.push(r);
      return;
    }
    // Full: the faintest gives way.
    let weakest = 0;
    let least = Infinity;
    const decay = cfg ? decayOf(cfg) : 1;
    ripples.forEach((q, i) => {
      const a = q.amp * Math.exp(-(sim.t - q.born) / decay);
      if (a < least) {
        least = a;
        weakest = i;
      }
    });
    ripples[weakest] = r;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    sim.t += dt;
    const drizzle = clamp(c.drizzle, 0, 1);
    const raining = c.motionSafe && !c.paused && drizzle > 0;
    if (raining && sim.t >= sim.nextDrop) {
      add(rand() * size.w, rand() * size.h, 0.22 + 0.26 * rand());
      sim.nextDrop = sim.t + -Math.log(1 - rand() * 0.98) / (drizzle * 1.6);
    }
    const denting = settleDent(dt);
    const pending = gather();
    draw();
    if (pending > 0 || raining || denting) {
      frame = window.requestAnimationFrame(tick);
    } else last = 0;
  };

  /** Steps the dent's recoil spring; false once it has come to rest. */
  const settleDent = (dt: number): boolean => {
    if (dent.at === 0 && dent.v === 0) return false;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      dent.v +=
        ((-RECOIL.stiffness * dent.at - RECOIL.damping * dent.v) /
          RECOIL.mass) *
        h;
      dent.at = clamp(dent.at + dent.v * h, -1, 1);
    }
    if (Math.abs(dent.at) < 0.002 && Math.abs(dent.v) < 0.02) {
      dent.at = 0;
      dent.v = 0;
      return false;
    }
    return true;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!gpu && !fallback) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 3; i += 1) {
      const el = kids[i];
      if (!el) continue;
      const rgb = read(getComputedStyle(el).color);
      colours[i * 3] = rgb[0];
      colours[i * 3 + 1] = rgb[1];
      colours[i * 3 + 2] = rgb[2];
    }
    statics();
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    const p = gpu;
    if (p && !p.lost) {
      resizeGL(p.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
      statics();
    }
    gather();
    draw();
    kick();
  };

  const startGpu = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  const toFallback = () => {
    fallback = true;
    root.setAttribute("data-fallback", "");
    root.removeAttribute("data-live");
    resize();
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        rand = lcg(next.seed * 13 + 5);
        sim.nextDrop = 0.6;
        if (!startGpu()) {
          // No WebGL2: the SVG lattice stays, and ripples rebuild its lines.
          toFallback();
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
            if (!disposed && !startGpu()) toFallback();
          },
        );
        return;
      }
      if (was.seed !== next.seed) rand = lcg(next.seed * 13 + 5);
      if (was.dpr !== next.dpr) resize();
      if (was.paintKey !== next.paintKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (was.motionSafe !== next.motionSafe) {
        ripples.length = 0;
        dent.at = 0;
        dent.v = 0;
      }
      gather();
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      gather();
      draw();
      kick();
    },
    handTo(x, y, at, source) {
      const c = cfg;
      if (!c) return;
      const was = hand.present && hand.source === source;
      const moved = was ? Math.hypot(x - hand.x, y - hand.y) : 0;
      const dt = was ? Math.max(0.008, (at - hand.at) / 1000) : 0;
      hand.x = x;
      hand.y = y;
      hand.at = at;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (!c.motionSafe || !c.trail || source !== "pointer" || !was) return;
      // A wake: one small ripple every cell and a half of travel, as strong
      // as the hand is quick.
      hand.travel += moved;
      if (hand.travel >= spacingOf(c) * 1.5) {
        hand.travel = 0;
        add(x, y, 0.16 + 0.42 * clamp(moved / dt / 900, 0, 1));
        kick();
      }
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      hand.travel = 0;
      setActive(false);
    },
    drop(x, y, amp) {
      const c = cfg;
      if (!c || !c.interactive) return;
      c.onRipple(Math.round(x), Math.round(y));
      if (!c.motionSafe) {
        // One still ring, fading where it stands.
        ripples.length = 0;
        add(x, y, amp);
        gather();
        draw();
        kick();
        return;
      }
      add(x, y, amp);
      add(x, y, amp * ECHO_AMP, ECHO_DELAY);
      dent.x = x;
      dent.y = y;
      dent.v += DENT_KICK * amp;
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
 * A background that is a fine square lattice of hairlines, centred in the
 * box, with the content on top in its own layer. Ripples push the lines: each
 * is a wave packet spreading from where it fell — a leading crest and a
 * short train of wavelets behind it — whose amplitude decays with age and
 * spreads with distance. Up to thirty-two sum as vectors, so rings crossing
 * each other interfere into a moiré of pinched and stretched cells, and the
 * lines thicken and brighten where a crest pushes through.
 *
 * A moving pointer leaves a wake of small ripples, as strong as it is quick;
 * a press drops a stone: the mat dents in under it and bounces back twice on
 * the recoil spring while a full ring spreads out with a softer echo behind
 * it. Keyboard focus on a control inside drops one from that control. A gentle
 * drizzle keeps the grid alive untouched; without it the grid rests flat and
 * nothing runs. WebGL2, one pass; the server renders the lattice at rest as
 * an SVG pattern, and without WebGL2 that SVG stays and its lines are rebuilt
 * from the same ripples. Under reduced motion nothing spreads: a press draws
 * one still ring that fades where it stands.
 */
export function RippleLattice({
  children,
  spacing = 24,
  strength = 0.6,
  color = "cobalt",
  lineWidth = 1,
  wavelength = 56,
  speed = 260,
  decay = 1.1,
  crest = 0.7,
  drizzle = 0.3,
  trail = true,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onRipple,
  className,
}: RippleLatticeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const patternId = `ripple-lattice-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const line = Object.prototype.hasOwnProperty.call(COLORS, color)
    ? COLORS[color as RippleLatticeColor]
    : String(color);
  const paints = React.useMemo(
    () => [
      `color-mix(in oklab, var(--background) 96%, ${line})`,
      line,
      `color-mix(in oklab, ${line} 62%, var(--foreground))`,
    ],
    [line],
  );
  const paintKey = paints.join("|");
  const sp = clamp(spacing, 8, 96);
  const lw = clamp(lineWidth, 0.25, 6);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const restRef = React.useRef<SVGRectElement | null>(null);
  const bodyRef = React.useRef<SVGPathElement | null>(null);
  const crestRef = React.useRef<SVGPathElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onRipple });

  const config: Config = {
    spacing,
    strength,
    paintKey,
    lineWidth,
    wavelength,
    speed,
    decay,
    crest,
    drizzle,
    trail,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onRipple: (x, y) => report.current.onRipple?.(x, y),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onRipple };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    const rest = restRef.current;
    const body = bodyRef.current;
    const crestPath = crestRef.current;
    if (!root || !canvas || !carriers || !rest || !body || !crestPath) return;
    const e = createEngine(
      root,
      canvas,
      carriers,
      { rest, body, crest: crestPath },
      visible,
    );
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
    engine.current?.handTo(at.x, at.y, event.timeStamp, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, event.timeStamp, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit)) {
      engine.current?.drop(at.x, at.y, 1);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside drops a ripple from that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, event.timeStamp, "focus");
    engine.current?.drop(at.x, at.y, 0.8);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  const half = Math.round((sp / 2) * 100) / 100;

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
        // A sideways drag ripples the grid on touch; an upright one scrolls.
        "group/ripple-lattice relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{ backgroundColor: paints[0] }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-200 group-data-live/ripple-lattice:opacity-100"
      />
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full group-data-live/ripple-lattice:invisible"
        style={{ color: paints[1] }}
      >
        <defs>
          <pattern
            id={patternId}
            x="50%"
            y="50%"
            width={sp}
            height={sp}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M${half} 0V${sp}M0 ${half}H${sp}`}
              fill="none"
              stroke="currentColor"
              strokeOpacity={BASE_ALPHA}
              strokeWidth={lw}
            />
          </pattern>
        </defs>
        <rect
          ref={restRef}
          width="100%"
          height="100%"
          fill={`url(#${patternId})`}
        />
        <path
          ref={bodyRef}
          fill="none"
          stroke="currentColor"
          strokeOpacity={BASE_ALPHA}
          strokeWidth={lw}
        />
        <path
          ref={crestRef}
          fill="none"
          stroke={paints[2]}
          strokeOpacity={0.8}
          strokeWidth={lw * 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
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
