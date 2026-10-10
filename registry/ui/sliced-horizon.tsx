"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HorizonPalette = "dusk" | "lagoon" | "ember" | "cobalt";

export type SlicedHorizonProps = {
  /** The content above the poster: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many horizontal strips the scene is cut into, 6 to 28. @default 14 */
  slices?: number;
  /** How far the strips slide sideways, 0 (in register) to 1. @default 0.5 */
  offset?: number;
  /** The scene's colours: a preset, or six CSS colours — sky top, sky low, sun top, sun bottom, sea top, sea deep. @default "dusk" */
  palette?: HorizonPalette | readonly string[];
  /** The cut between strips, in CSS px. @default 2 */
  gap?: number;
  /** Where the horizon lies, as a fraction of the height, 0.3 to 0.85. @default 0.62 */
  horizon?: number;
  /** How large the sun is, 0 to 1. @default 0.55 */
  sun?: number;
  /** Where the sun stands across the scene, as a fraction of the width. @default 0.5 */
  sunX?: number;
  /** How fast the wave runs down the strips, 0 to 2; 0 holds them still. @default 1 */
  speed?: number;
  /** How many crests of the wave run through the stack at once, 0.5 to 3. @default 1.2 */
  waves?: number;
  /** Print each strip's sky as one flat colour, like screen-printed bands. @default false */
  banded?: boolean;
  /** How long a resting pointer waits before the strips pull into register, in ms. @default 320 */
  restDelay?: number;
  /** The hand riffles the strips, and resting brings them into register. @default true */
  interactive?: boolean;
  /** How hard a moving hand shoves the strips near it, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Picks the glitter on the sea: the same seed lays the same light. @default 1 */
  seed?: number;
  /** Holds the wave still; the hand still riffles and aligns the strips. @default false */
  paused?: boolean;
  /** Show the poster in register first, then let the strips break loose from the top, the first time it is seen. @default true */
  intro?: boolean;
  /** The highest device pixel ratio the poster is drawn at, never above 2. @default 2 */
  dpr?: number;
  /** Fires when the strips come into register (true), from a resting hand or keyboard focus, and when they start to drift again (false). */
  onAlignChange?: (aligned: boolean) => void;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
  /** Classes for the content layer above the poster. */
  contentClassName?: string;
};

/**
 * Six colours each: sky top, sky low, sun top, sun bottom, sea top, sea
 * deep. The deepest two lean into the page, so the poster sits in either
 * theme; the sun and the glow are fixed pigments. Cobalt is built from the
 * theme's accent.
 */
const PALETTES: Record<HorizonPalette, readonly string[]> = {
  dusk: [
    "color-mix(in oklab, oklch(0.36 0.09 295) 80%, var(--background))",
    "oklch(0.74 0.13 40)",
    "oklch(0.94 0.11 95)",
    "oklch(0.66 0.2 20)",
    "oklch(0.44 0.09 290)",
    "color-mix(in oklab, oklch(0.24 0.06 280) 80%, var(--background))",
  ],
  lagoon: [
    "color-mix(in oklab, oklch(0.42 0.07 235) 80%, var(--background))",
    "oklch(0.82 0.09 195)",
    "oklch(0.97 0.06 110)",
    "oklch(0.78 0.13 160)",
    "oklch(0.52 0.08 215)",
    "color-mix(in oklab, oklch(0.28 0.05 235) 80%, var(--background))",
  ],
  ember: [
    "color-mix(in oklab, oklch(0.3 0.06 25) 80%, var(--background))",
    "oklch(0.68 0.16 45)",
    "oklch(0.93 0.12 88)",
    "oklch(0.62 0.21 30)",
    "oklch(0.4 0.09 30)",
    "color-mix(in oklab, oklch(0.2 0.04 25) 80%, var(--background))",
  ],
  cobalt: [
    "color-mix(in oklab, var(--accent) 35%, var(--background))",
    "color-mix(in oklab, var(--accent-bright) 55%, var(--background))",
    "color-mix(in oklab, var(--foreground) 85%, var(--accent-bright))",
    "var(--accent-bright)",
    "color-mix(in oklab, var(--accent) 45%, var(--background))",
    "color-mix(in oklab, var(--accent) 20%, var(--background))",
  ],
};

/** Fixed sub-step for the springs, so a long frame never destabilises them. */
const STEP = 1 / 240;
const MAX_SLICES = 28;
/** A tap on a touch screen holds the strips in register this long. */
const TOUCH_HOLD = 1800;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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

const css = (c: Rgb, a = 1) =>
  `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.round(clamp(a, 0, 1) * 1000) / 1000})`;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

type Strip = {
  /** The hand's shove, px. */
  shove: Axis;
  /** How much of the wave this strip shows: 0 in register, 1 drifting. */
  drift: Axis;
  goal: number;
  /** Seconds before this strip starts toward its goal. */
  wait: number;
  aligning: boolean;
};

type Api = {
  refresh: (repaint: boolean) => void;
  recolor: () => void;
  local: (clientX: number, clientY: number) => { x: number; y: number };
  move: (x: number, y: number, at: number) => void;
  align: (y: number, hold: number | null) => void;
  release: () => void;
};

/**
 * A background that is a sunset poster cut into horizontal strips: a sky
 * running down into a warm glow, a sun standing on the horizon with its lower
 * edge cut by it, and a sea with a path of glitter, painted once and drawn
 * strip by strip, each slid sideways by a wave that runs down the stack, so
 * the sun breaks into offset bars.
 *
 * Moving the hand riffles the strips near it in the direction of travel,
 * each on its own spring with the snap constants. When the hand comes to
 * rest the strips pull into register one after another, radiating out from
 * the hand's strip in a cascade — each on the snap spring, one crisp
 * overshoot through alignment — and the sun is whole; moving again lets the
 * wave back in on the drift spring. The first time it is seen the poster
 * arrives in register, exactly as the server drew it, and the strips break
 * loose one after another from the top as the wave rolls in. Keyboard focus
 * on content inside brings the strips into register.
 *
 * Canvas 2D: the scene is cached, so a frame is one image draw per strip;
 * the loop runs only on screen, in a visible page, and while the wave runs or
 * a strip moves, and stops once everything is in register. Under reduced
 * motion the poster is still, its sun broken at a designed phase, and resting
 * or focus aligns it at once.
 */
export function SlicedHorizon({
  children,
  slices = 14,
  offset = 0.5,
  palette = "dusk",
  gap = 2,
  horizon = 0.62,
  sun = 0.55,
  sunX = 0.5,
  speed = 1,
  waves = 1.2,
  banded = false,
  restDelay = 320,
  interactive = true,
  pointerStrength = 0.6,
  seed = 1,
  paused = false,
  intro = true,
  dpr = 2,
  onAlignChange,
  className,
  contentClassName,
}: SlicedHorizonProps) {
  const motionSafe = useMotionSafe();
  const count = clamp(Math.round(slices), 6, MAX_SLICES);
  const preset =
    typeof palette === "string"
      ? (PALETTES[palette] ?? PALETTES.dusk)
      : palette;
  const colours = [0, 1, 2, 3, 4, 5].map(
    (i) => preset[i] ?? PALETTES.dusk[i] ?? "gray",
  );
  const horizonAt = clamp(horizon, 0.3, 0.85);
  const sunAt = clamp(sunX, 0.1, 0.9);
  const sunSize = clamp(sun, 0, 1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const gapRef = React.useRef<HTMLSpanElement | null>(null);
  const api = React.useRef<Api | null>(null);

  const latest = React.useRef({
    count,
    offset,
    gap,
    horizonAt,
    sunSize,
    sunAt,
    speed,
    waves,
    banded,
    restDelay,
    interactive,
    pointerStrength,
    seed,
    paused,
    intro,
    dpr,
    motionSafe,
    onAlignChange,
  });
  React.useEffect(() => {
    latest.current = {
      count,
      offset,
      gap,
      horizonAt,
      sunSize,
      sunAt,
      speed,
      waves,
      banded,
      restDelay,
      interactive,
      pointerStrength,
      seed,
      paused,
      intro,
      dpr,
      motionSafe,
      onAlignChange,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (!root || !canvas || !ctx) return;

    const scene = document.createElement("canvas");
    const sctx = scene.getContext("2d");
    let raf = 0;
    let last = 0;
    let visible = true;
    let dirty = true;
    let disposed = false;
    let size = { w: 0, h: 0, dpr: 1, pad: 0 };
    let ink: Rgb[] = [];
    let gapInk: Rgb = [255, 255, 255];
    const L0 = latest.current;
    // A still frame is always this same moment of the wave.
    let time = ((Math.abs(L0.seed) * 0.6180339) % 1) * 3 + 0.4;
    let introState: "waiting" | "running" | "done" = "waiting";
    let introClock = 0;
    let aligned = false;
    let restTimer: number | null = null;
    let holdTimer: number | null = null;
    const hand = { x: 0, y: 0, at: 0, row: 0, present: false };
    // With an intro the poster arrives in register, as the server drew it,
    // and the strips break loose once it is seen.
    const startDrift = L0.intro && L0.motionSafe ? 0 : 1;
    const strips: Strip[] = Array.from({ length: MAX_SLICES }, () => ({
      shove: { x: 0, v: 0 },
      drift: { x: startDrift, v: 0 },
      goal: startDrift,
      wait: 0,
      aligning: false,
    }));
    const read = rgbReader();

    const recolor = () => {
      ink = carrierRefs.current.map((node) =>
        node ? read(getComputedStyle(node).color) : ([128, 128, 128] as const),
      );
      if (gapRef.current) gapInk = read(getComputedStyle(gapRef.current).color);
    };

    /** The scene, painted once into a canvas wider than the box. */
    const paint = () => {
      const { w, h, dpr: d, pad } = size;
      if (!sctx || w < 1 || h < 1) return;
      const L = latest.current;
      const [skyTop, skyLow, sunTop, sunLow, seaTop, seaDeep] = [
        0, 1, 2, 3, 4, 5,
      ].map((i) => ink[i] ?? ([128, 128, 128] as Rgb)) as [
        Rgb,
        Rgb,
        Rgb,
        Rgb,
        Rgb,
        Rgb,
      ];
      scene.width = Math.round((w + pad * 2) * d);
      scene.height = Math.round(h * d);
      sctx.setTransform(d, 0, 0, d, 0, 0);
      const W = w + pad * 2;
      const hy = h * L.horizonAt;
      // The sky, flat per strip when banded.
      if (L.banded) {
        const n = L.count;
        for (let i = 0; i < n; i += 1) {
          const y0 = (i * h) / n;
          const y1 = ((i + 1) * h) / n;
          const mid = Math.min(hy, (y0 + y1) / 2);
          const t = clamp(mid / hy, 0, 1);
          const c =
            t < 0.55
              ? mixRgb(skyTop, mixRgb(skyTop, skyLow, 0.45), t / 0.55)
              : mixRgb(mixRgb(skyTop, skyLow, 0.45), skyLow, (t - 0.55) / 0.45);
          sctx.fillStyle = css(c);
          sctx.fillRect(0, y0, W, Math.min(hy, y1) - y0 + 0.5);
        }
      } else {
        const sky = sctx.createLinearGradient(0, 0, 0, hy);
        sky.addColorStop(0, css(skyTop));
        sky.addColorStop(0.55, css(mixRgb(skyTop, skyLow, 0.45)));
        sky.addColorStop(1, css(skyLow));
        sctx.fillStyle = sky;
        sctx.fillRect(0, 0, W, hy + 1);
      }
      // The sun, its glow, and the horizon cutting its lower edge.
      const R = lerp(0.12, 0.42, L.sunSize) * Math.min(h, w * 0.6);
      const sx = pad + w * L.sunAt;
      const sy = hy - R * 0.28;
      const halo = sctx.createRadialGradient(sx, sy, R * 0.6, sx, sy, R * 2.6);
      halo.addColorStop(0, css(sunTop, 0.32));
      halo.addColorStop(1, css(sunTop, 0));
      sctx.fillStyle = halo;
      sctx.fillRect(0, 0, W, hy);
      const disc = sctx.createLinearGradient(0, sy - R, 0, sy + R);
      disc.addColorStop(0, css(sunTop));
      disc.addColorStop(1, css(sunLow));
      sctx.fillStyle = disc;
      sctx.beginPath();
      sctx.arc(sx, sy, R, 0, Math.PI * 2);
      sctx.fill();
      // The sea, and the path of glitter under the sun.
      const sea = sctx.createLinearGradient(0, hy, 0, h);
      sea.addColorStop(0, css(seaTop));
      sea.addColorStop(1, css(seaDeep));
      sctx.fillStyle = sea;
      sctx.fillRect(0, hy, W, h - hy);
      sctx.fillStyle = css(mixRgb(skyLow, sunTop, 0.5), 0.7);
      sctx.fillRect(0, hy - 0.5, W, 1);
      let s =
        Math.imul(Math.abs(Math.round(L.seed)) + 11, 2654435761) >>> 0 || 1;
      const rand = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
      const rows = Math.max(6, Math.round((h - hy) / 5));
      for (let k = 0; k < rows; k += 1) {
        const t = k / rows;
        const y = hy + 3 + Math.pow(t, 1.35) * (h - hy - 4);
        const reach = R * lerp(0.9, 2.1, t);
        const dashes = 1 + Math.floor(rand() * 3);
        for (let q = 0; q < dashes; q += 1) {
          const len = R * lerp(0.75, 0.25, t) * (0.4 + rand() * 0.8);
          const x = sx + (rand() - 0.5) * reach;
          sctx.fillStyle = css(
            mixRgb(sunTop, sunLow, t * 0.6),
            lerp(0.75, 0.2, t),
          );
          sctx.fillRect(x - len / 2, y, len, lerp(1.2, 2.2, t));
        }
      }
    };

    const draw = () => {
      const { w, h, dpr: d, pad } = size;
      if (w < 1 || h < 1 || !scene.width) return;
      if (!visible) {
        dirty = true;
        return;
      }
      dirty = false;
      const L = latest.current;
      const n = L.count;
      const amp = clamp(L.offset, 0, 1) * Math.min(64, w * 0.12);
      const phase = time * 0.16 * Math.PI * 2;
      const step = (Math.PI * 2 * clamp(L.waves, 0.5, 3)) / n;
      const H = canvas.height;
      const W = canvas.width;
      const cut = Math.round(Math.max(0, L.gap) * d);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = css(gapInk);
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < n; i += 1) {
        const strip = strips[i];
        if (!strip) continue;
        const y0 = Math.round((i * H) / n) + (i > 0 ? cut : 0);
        const y1 = Math.round(((i + 1) * H) / n);
        if (y1 <= y0) continue;
        const off =
          amp * strip.drift.x * Math.sin(phase - i * step) + strip.shove.x;
        const sx = (pad - clamp(off, -pad, pad)) * d;
        ctx.drawImage(scene, sx, y0, W, y1 - y0, 0, y0, W, y1 - y0);
      }
      root.setAttribute("data-painted", "");
    };

    const tell = (now: boolean) => {
      if (aligned === now) return;
      aligned = now;
      latest.current.onAlignChange?.(now);
    };

    /** Every strip toward register (0) or the wave (1), from row outward. */
    const steer = (goal: number, row: number) => {
      const L = latest.current;
      const n = L.count;
      const stagger = cascade(n);
      for (let i = 0; i < MAX_SLICES; i += 1) {
        const strip = strips[i];
        if (!strip) continue;
        strip.goal = goal;
        strip.aligning = goal === 0;
        strip.wait = Math.abs(i - row) * stagger * (goal === 0 ? 1 : 0.5);
        if (!L.motionSafe) {
          strip.drift.x = goal;
          strip.drift.v = 0;
          strip.wait = 0;
        }
      }
    };

    /** Advances the wave and every strip's springs; true while anything moves. */
    const advance = (dt: number): boolean => {
      const L = latest.current;
      let busy = false;
      const n = L.count;
      if (introState === "running") {
        introClock += dt;
        busy = true;
        // A beat in register, then the strips break loose from the top.
        if (introClock > durations.base) {
          introState = "done";
          if (!aligned) steer(1, 0);
        }
      }
      let settledAll = true;
      for (let i = 0; i < MAX_SLICES; i += 1) {
        const strip = strips[i];
        if (!strip) continue;
        if (strip.wait > 0) {
          strip.wait -= dt;
          settledAll = false;
          continue;
        }
        let left = dt;
        while (left > 1e-6) {
          const h = Math.min(STEP, left);
          left -= h;
          stepSpring(strip.shove, 0, springs.snap, h);
          stepSpring(
            strip.drift,
            strip.goal,
            strip.aligning ? springs.snap : springs.drift,
            h,
          );
        }
        const still =
          rest(strip.shove, 0, 0.05) && rest(strip.drift, strip.goal, 0.002);
        if (!still) settledAll = false;
      }
      if (!settledAll) busy = true;
      let waving = false;
      for (let i = 0; i < n; i += 1) {
        if ((strips[i]?.drift.x ?? 0) > 0.001) waving = true;
      }
      if (waving && !L.paused && L.speed > 0 && L.offset > 0) {
        time += dt * clamp(L.speed, 0, 2);
        busy = true;
      }
      return busy;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) {
        last = 0;
        return;
      }
      if (!latest.current.motionSafe) {
        if (introState === "running") {
          introState = "done";
          if (!aligned) steer(1, 0);
        }
        for (const strip of strips) {
          strip.shove.x = 0;
          strip.shove.v = 0;
          strip.drift.x = strip.goal;
          strip.drift.v = 0;
          strip.wait = 0;
        }
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

    const clearTimers = () => {
      if (restTimer !== null) window.clearTimeout(restTimer);
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      restTimer = null;
      holdTimer = null;
    };

    const resize = (force = false) => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 1 || h < 1) return;
      const L = latest.current;
      const d = Math.min(2, Math.max(0.5, L.dpr), window.devicePixelRatio || 1);
      if (!force && size.w === w && size.h === h && size.dpr === d) return;
      size = { w, h, dpr: d, pad: Math.ceil(Math.min(64, w * 0.12) + 28) };
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
      paint();
      draw();
    };

    recolor();
    resize(true);

    const sizer = new ResizeObserver(() => resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (!visible) return;
      if (introState === "waiting") {
        const L = latest.current;
        if (L.intro && L.motionSafe) {
          introState = "running";
          introClock = 0;
        } else {
          introState = "done";
          if (!aligned) steer(1, 0);
        }
      }
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

    const rowAt = (y: number) =>
      clamp(
        Math.floor((y / Math.max(1, size.h)) * latest.current.count),
        0,
        latest.current.count - 1,
      );

    api.current = {
      refresh: (repaint) => {
        if (!latest.current.motionSafe) stop();
        if (repaint) resize(true);
        else draw();
        kick();
      },
      recolor: () => {
        recolor();
        paint();
        draw();
      },
      local,
      move: (x, y, at) => {
        const L = latest.current;
        const dt = hand.at ? Math.max(8, at - hand.at) / 1000 : 0;
        const vx = dt > 0 && hand.present ? (x - hand.x) / dt : 0;
        hand.x = x;
        hand.y = y;
        hand.at = at;
        hand.present = true;
        hand.row = rowAt(y);
        // Moving: the strips near the hand are riffled the way it goes,
        // and the wave comes back in.
        if (L.motionSafe && introState !== "running") {
          const k = clamp(L.pointerStrength, 0, 1);
          for (let d = -2; d <= 2; d += 1) {
            const strip = strips[hand.row + d];
            if (!strip) continue;
            strip.shove.v +=
              clamp(vx, -2400, 2400) * 0.3 * k * Math.exp(-d * d * 0.6);
          }
        }
        if (introState !== "running") {
          if (aligned || strips.some((s) => s.goal === 0)) steer(1, hand.row);
          tell(false);
        }
        clearTimers();
        restTimer = window.setTimeout(
          () => {
            restTimer = null;
            if (!hand.present) return;
            steer(0, hand.row);
            tell(true);
            kick();
          },
          Math.max(0, latest.current.restDelay),
        );
        kick();
      },
      align: (y, hold) => {
        clearTimers();
        hand.row = rowAt(y);
        steer(0, hand.row);
        tell(true);
        if (hold !== null) {
          holdTimer = window.setTimeout(() => {
            holdTimer = null;
            steer(1, hand.row);
            tell(false);
            kick();
          }, hold);
        }
        kick();
      },
      release: () => {
        clearTimers();
        hand.present = false;
        hand.at = 0;
        if (introState !== "running") steer(1, hand.row);
        tell(false);
        kick();
      },
    };

    return () => {
      disposed = true;
      stop();
      clearTimers();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, []);

  // The scene is painted again for a new shape (and, when banded, for a new
  // count of strips); the rest is read each frame.
  const bands = banded ? count : 0;
  React.useEffect(() => {
    api.current?.refresh(true);
  }, [horizonAt, sunSize, sunAt, bands, seed, dpr]);
  React.useEffect(() => {
    api.current?.refresh(false);
  }, [count, offset, gap, speed, waves, paused, motionSafe]);

  // A hand that is switched off lets go.
  React.useEffect(() => {
    if (!interactive) api.current?.release();
  }, [interactive]);

  // A new theme or palette changes the carriers' colours; their 1 ms colour
  // transition says when, and the scene is painted again from them.
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
    if (!a || !interactive || event.pointerType === "touch") return;
    const at = a.local(event.clientX, event.clientY);
    a.move(at.x, at.y, event.timeStamp);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive || event.pointerType !== "touch") return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // Tapping a button in the content is the button's business.
    if (hit && rootRef.current?.contains(hit)) return;
    const at = a.local(event.clientX, event.clientY);
    a.align(at.y, TOUCH_HOLD);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    api.current?.release();
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const a = api.current;
    const target = event.target;
    if (!a || !interactive || !(target instanceof Element)) return;
    if (!target.matches(":focus-visible")) return;
    const rect = target.getBoundingClientRect();
    const at = a.local(rect.left + rect.width / 2, rect.top + rect.height / 2);
    a.align(at.y, null);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    api.current?.release();
  };

  // The poster as the server draws it, in register: sky, sun, sea, and the
  // cuts between strips in the page colour.
  const [skyTop, skyLow, sunTop, sunLow, seaTop, seaDeep] = colours;
  const horizonPct = Math.round(horizonAt * 1000) / 10;
  const sunPct = Math.round(lerp(12, 42, sunSize) * 10) / 10;
  const cuts = `repeating-linear-gradient(180deg, transparent 0, transparent calc(${Math.round(10000 / count) / 100}% - ${Math.max(0, gap)}px), var(--background) calc(${Math.round(10000 / count) / 100}% - ${Math.max(0, gap)}px), var(--background) ${Math.round(10000 / count) / 100}%)`;

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "group/sliced-horizon relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 transition-opacity duration-300 group-data-painted/sliced-horizon:opacity-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(180deg, ${skyTop} 0%, color-mix(in oklab, ${skyTop} 55%, ${skyLow}) ${Math.round(horizonPct * 0.55)}%, ${skyLow} ${horizonPct}%)`,
            }}
          />
          <div
            className="absolute aspect-square -translate-x-1/2 rounded-full"
            style={{
              left: `${Math.round(sunAt * 1000) / 10}%`,
              top: `${Math.round((horizonPct - sunPct * 1.28) * 10) / 10}%`,
              height: `${Math.round(sunPct * 2 * 10) / 10}%`,
              backgroundImage: `linear-gradient(180deg, ${sunTop}, ${sunLow})`,
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              top: `${horizonPct}%`,
              backgroundImage: `linear-gradient(180deg, ${seaTop}, ${seaDeep})`,
            }}
          />
          <div className="absolute inset-0" style={{ backgroundImage: cuts }} />
        </div>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-painted/sliced-horizon:opacity-100"
        />
        {colours.map((colour, i) => (
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
        <span
          ref={gapRef}
          onTransitionEnd={onColors}
          className="absolute size-px text-background opacity-0 transition-colors duration-1"
        />
      </div>
      <div className={cn("relative z-10 size-full", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
