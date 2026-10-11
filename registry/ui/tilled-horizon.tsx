"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TilledHorizonPalette = "dusk" | "harvest" | "indigo" | "moss";

export type TilledHorizonProps = {
  /** Content laid over the field, in its own layer above it. */
  children?: React.ReactNode;
  /** The furrows' spacing at the near edge, px: small is a fine engraving, large a few broad ribbons. @default 11 */
  spacing?: number;
  /** How much the land rolls, 0 (a flat field) to 1 (steep hills that hide the furrows behind them). @default 0.5 */
  roll?: number;
  /** The two inks the print is pulled in; the paper follows the page. @default "dusk" */
  palette?: TilledHorizonPalette;
  /** Overrides the land's ink, any CSS colour. */
  inkColor?: string;
  /** Overrides the sun's ink, any CSS colour. */
  sunColor?: string;
  /** Overrides the paper, any CSS colour. @default the page's background, warmed */
  paperColor?: string;
  /** How fast the field glides toward you, 0 (still) to 3. @default 1 */
  speed?: number;
  /** Where the horizon sits, as a share of the height from the top, 0.2 to 0.7. @default 0.42 */
  horizon?: number;
  /** The sun's diameter as a share of the height, 0.08 to 0.5. @default 0.24 */
  sunSize?: number;
  /** How strongly the haze stripes the sun and the sky, 0 to 1. @default 0.6 */
  haze?: number;
  /** Where the sun sits along the horizon, 0 (left) to 1 (right) (controlled). */
  sun?: number;
  /** Where the sun starts when uncontrolled. @default 0.62 */
  defaultSun?: number;
  /** Fires when the pointer, a key or focus moves the sun, with its new place rounded to 0.01. */
  onSunChange?: (sun: number) => void;
  /** The pointer over the scene, and focus moving between its children, steer the sun. @default true */
  interactive?: boolean;
  /** Make the scene a tab stop that steers the sun with the arrow keys, for a field with no controls on it. @default false */
  focusable?: boolean;
  /** Names the sun control when `focusable`. @default "Sun position" */
  label?: string;
  /** Hold the field still; the sun still moves. @default false */
  paused?: boolean;
  /** Seeds the hills and the ridge. @default 5 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the scene; it is 256px tall by default. */
  className?: string;
};

type Inks = { ink: string; sun: string };

const PALETTES: Record<TilledHorizonPalette, Inks> = {
  dusk: {
    ink: "color-mix(in oklab, var(--foreground) 70%, oklch(from var(--danger) 0.5 0.14 calc(h - 8)))",
    sun: "oklch(from var(--danger) 0.7 0.16 calc(h + 14))",
  },
  harvest: {
    ink: "color-mix(in oklab, var(--foreground) 68%, oklch(from var(--warn) 0.46 0.09 calc(h - 28)))",
    sun: "oklch(from var(--warn) 0.8 0.15 calc(h - 8))",
  },
  indigo: {
    ink: "color-mix(in oklab, var(--foreground) 62%, oklch(from var(--accent) 0.44 0.15 h))",
    sun: "oklch(from var(--danger) 0.74 0.12 calc(h + 30))",
  },
  moss: {
    ink: "color-mix(in oklab, var(--foreground) 66%, oklch(from var(--success) 0.44 0.08 calc(h - 20)))",
    sun: "oklch(from var(--warn) 0.82 0.12 h)",
  },
};

const PAPER =
  "color-mix(in oklab, var(--background) 88%, oklch(from var(--warn) 0.78 0.08 calc(h - 20)))";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const STEP = 1 / 240;
/** Segments the field can hold per frame (x0, y0, x1, y1, bucket). */
const MAX_SEGS = 16000;
/** Line weight buckets × fade buckets: each is one stroke per frame. */
const WIDTHS = [0.45, 0.8, 1.2, 1.7, 2.3, 3];
const FADES = [0.35, 0.65, 1];

/** The sun's x in the box for a place along the horizon. */
const sunX = (w: number, at: number) => w * (0.08 + 0.84 * clamp(at, 0, 1));

type Config = {
  spacing: number;
  roll: number;
  speed: number;
  horizon: number;
  sunSize: number;
  haze: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (v: boolean) => void;
  wake: () => void;
  sunTo: (at: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
): Engine {
  const ctx = canvas.getContext("2d");
  const inkLayer = document.createElement("canvas");
  const ink = inkLayer.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let w = 0;
  let h = 0;
  let dprNow = 1;
  let camZ = 0;
  const sun = { x: 0, v: 0, target: 0, at: 0.62 };
  const segs = new Float32Array(MAX_SEGS * 5);
  let segCount = 0;
  let colours = { paper: "white", ink: "black", sun: "orange", haze: "orange" };
  let glow: CanvasGradient | null = null;
  let glowKey = "";
  // Seeded phases for the hills and the ridge.
  let ph = [0, 0, 0, 0, 0, 0];
  const ridge = new Float32Array(97);

  const reader = (() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c.getContext("2d", { willReadFrequently: true });
  })();
  const resolve = (colour: string, alpha = 1) => {
    if (!reader) return "gray";
    reader.clearRect(0, 0, 1, 1);
    reader.fillStyle = "rgb(128, 128, 128)";
    reader.fillStyle = colour;
    reader.fillRect(0, 0, 1, 1);
    const d = reader.getImageData(0, 0, 1, 1).data;
    return `rgba(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0}, ${r2(((d[3] ?? 255) / 255) * alpha)})`;
  };

  const reseed = (seed: number) => {
    let s = Math.imul(seed + 17, 0x9e3779b1) >>> 0 || 1;
    const rand = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    ph = [0, 0, 0, 0, 0, 0].map(() => rand() * Math.PI * 2);
    // A distant ridge: a few soft rises and a ragged hedge on top.
    let a = rand();
    for (let i = 0; i < ridge.length; i += 1) {
      a += (rand() - 0.5) * 0.35;
      a = clamp(a, 0, 1);
      ridge[i] = a;
    }
    for (let pass = 0; pass < 3; pass += 1)
      for (let i = 1; i < ridge.length - 1; i += 1)
        ridge[i] =
          ((ridge[i - 1] ?? 0) + (ridge[i] ?? 0) * 2 + (ridge[i + 1] ?? 0)) / 4;
  };

  /** Ground height (camera heights) at lateral x and depth z. */
  const ground = (x: number, z: number, amp: number) =>
    amp *
    (0.62 *
      Math.sin(
        1.55 * z + 0.9 * Math.sin(0.45 * x + (ph[0] ?? 0)) + (ph[1] ?? 0),
      ) +
      0.28 * Math.sin(0.8 * x + 2.6 * z + (ph[2] ?? 0)) +
      0.12 * Math.sin(2.1 * x - 3.7 * z + (ph[3] ?? 0)));

  /** Builds the furrows for this frame into the segment buffer, near to far per line. */
  const field = () => {
    const c = cfg;
    segCount = 0;
    if (!c) return;
    const hy = h * clamp(c.horizon, 0.2, 0.7);
    const f = h - hy + 12;
    const cx = w / 2;
    const spacePx = clamp(c.spacing, 4, 32);
    const sp = spacePx / f;
    const amp = clamp(c.roll, 0, 1) * 0.42;
    const zFar = (f * sp) / 2.1;
    const reach = w / 2 + 24;
    const kMax = Math.ceil((reach * zFar) / f / sp);
    // Toward the sun, low over the horizon.
    const az = Math.atan2(sun.x - cx, f * 2.2);
    const lx = Math.sin(az) * 0.96;
    const ly = 0.28;
    const lz = Math.cos(az) * 0.96;
    for (let k = -kMax; k <= kMax; k += 1) {
      const x = k * sp;
      const z0 = Math.max(1, (f * Math.abs(x)) / reach);
      if (z0 >= zFar) continue;
      const u0 = 1 / z0;
      const u1 = 1 / zFar;
      const span = f * (u0 - u1);
      const n = Math.max(2, Math.min(60, Math.ceil(span / 5)));
      let prevX = 0;
      let prevY = 0;
      let prevOk = false;
      let horizonMin = Number.POSITIVE_INFINITY;
      for (let i = 0; i <= n; i += 1) {
        const u = u0 + ((u1 - u0) * i) / n;
        const z = 1 / u;
        const zz = z + camZ;
        const g = ground(x, zz, amp);
        const sx = cx + f * x * u;
        const sy = hy + f * (1 - g) * u;
        // A point behind a nearer crest of the same furrow is hidden.
        const seen = sy <= horizonMin + 0.5;
        if (sy < horizonMin) horizonMin = sy;
        if (seen && prevOk && segCount < MAX_SEGS) {
          const e = 0.02;
          const gx = (ground(x + e, zz, amp) - g) / e;
          const gz = (ground(x, zz + e, amp) - g) / e;
          const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
          const lit = (-gx * lx + ly - gz * lz) * inv;
          const shadow = clamp(0.62 - lit * 1.4, 0, 1);
          const gap = f * sp * u;
          const weight =
            clamp(0.32 + 0.085 * gap, 0.4, 2.8) * (0.55 + 0.9 * shadow);
          let wb = 0;
          while (wb < WIDTHS.length - 1 && (WIDTHS[wb] ?? 0) < weight) wb += 1;
          const fade = clamp((gap - 2.1) / 4.5, 0, 1);
          const fb = fade < 0.33 ? 0 : fade < 0.75 ? 1 : 2;
          const o = segCount * 5;
          segs[o] = prevX;
          segs[o + 1] = prevY;
          segs[o + 2] = sx;
          segs[o + 3] = sy;
          segs[o + 4] = wb * FADES.length + fb;
          segCount += 1;
        }
        prevX = sx;
        prevY = sy;
        prevOk = seen;
      }
    }
  };

  const drawSky = (c: Config, hy: number) => {
    if (!ctx) return;
    ctx.fillStyle = colours.paper;
    ctx.fillRect(0, 0, w, h);
    const R = (h * clamp(c.sunSize, 0.08, 0.5)) / 2;
    const sxp = sun.x;
    const syp = hy - R * 0.38;
    const haze = clamp(c.haze, 0, 1);
    // The sun sits behind the land: nothing of the sky is drawn below it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, hy);
    ctx.clip();
    // Haze in the sky: long thin strokes of the sun's ink.
    ctx.globalAlpha = 0.3 + 0.7 * haze;
    ctx.strokeStyle = colours.haze;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const y = Math.round(hy - R * (0.5 + i * 0.42) - i * 3) + 0.5;
      const half = w * (0.18 + 0.06 * ((i * 37 + (cfg?.seed ?? 0)) % 5));
      const mid = sxp + (i % 2 ? 1 : -1) * w * 0.06 * i;
      ctx.moveTo(Math.max(0, mid - half), y);
      ctx.lineTo(Math.min(w, mid + half), y);
    }
    if (haze > 0.05) ctx.stroke();
    ctx.globalAlpha = 1;
    // The sun, striped through its lower half by bands of paper.
    ctx.fillStyle = colours.sun;
    ctx.beginPath();
    ctx.arc(sxp, syp, R, 0, Math.PI * 2);
    ctx.fill();
    if (haze > 0.02) {
      ctx.fillStyle = colours.paper;
      for (let i = 0; i < 6; i += 1) {
        const y = syp - R * 0.05 + R * 0.19 * i;
        const t = R * 0.035 * (1 + i * 1.1) * haze;
        if (y > syp + R) break;
        ctx.fillRect(sxp - R - 1, y, 2 * R + 2, t);
      }
    }
    ctx.restore();
  };

  const drawRidge = (hy: number) => {
    if (!ctx) return;
    const rh = h * 0.05;
    // A distant ridge prints lighter than the near land: one pass of thinned ink.
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = colours.ink;
    ctx.beginPath();
    ctx.moveTo(0, hy + 2);
    const n = ridge.length - 1;
    for (let i = 0; i <= n; i += 1) {
      const x = (w * i) / n;
      const jag = i % 2 ? 0.12 : 0;
      ctx.lineTo(x, hy - rh * ((ridge[i] ?? 0) * 0.8 + 0.2 + jag));
    }
    ctx.lineTo(w, hy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !ink || !c || !visible || w < 2) return;
    const hy = h * clamp(c.horizon, 0.2, 0.7);
    ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
    drawSky(c, hy);
    drawRidge(hy);
    // The field, on its own layer so the sun's glow can be laid on its ink alone.
    field();
    ink.setTransform(dprNow, 0, 0, dprNow, 0, 0);
    ink.globalCompositeOperation = "source-over";
    ink.clearRect(0, 0, w, h);
    ink.strokeStyle = colours.ink;
    ink.lineCap = "round";
    for (let b = 0; b < WIDTHS.length * FADES.length; b += 1) {
      ink.beginPath();
      let any = false;
      for (let i = 0; i < segCount; i += 1) {
        const o = i * 5;
        if (segs[o + 4] !== b) continue;
        ink.moveTo(segs[o] ?? 0, segs[o + 1] ?? 0);
        ink.lineTo(segs[o + 2] ?? 0, segs[o + 3] ?? 0);
        any = true;
      }
      if (!any) continue;
      ink.lineWidth = WIDTHS[Math.floor(b / FADES.length)] ?? 1;
      ink.globalAlpha = FADES[b % FADES.length] ?? 1;
      ink.stroke();
    }
    ink.globalAlpha = 1;
    // The furrows in line with the sun catch its colour.
    const key = `${Math.round(sun.x)}|${w}|${h}|${hy}`;
    if (key !== glowKey || !glow) {
      glowKey = key;
      glow = ink.createRadialGradient(sun.x, hy, 0, sun.x, hy, h * 0.95);
      glow.addColorStop(0, colours.sun);
      glow.addColorStop(0.45, colours.haze);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    }
    ink.globalCompositeOperation = "source-atop";
    ink.save();
    ink.translate(sun.x, hy);
    ink.scale(0.62, 1);
    ink.translate(-sun.x, -hy);
    ink.fillStyle = glow;
    ink.fillRect(sun.x - w / 0.62, hy, (2 * w) / 0.62, h);
    ink.restore();
    ink.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(inkLayer, 0, 0);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (c.motionSafe && !c.paused && c.speed > 0) {
      camZ += clamp(c.speed, 0, 3) * 0.32 * dt;
      if (camZ > 4000) camZ -= 4000;
      moving = true;
    }
    const k = springs.drift;
    const n = Math.max(1, Math.ceil(dt / STEP));
    const hh = dt / n;
    for (let i = 0; i < n; i += 1) {
      sun.v +=
        ((k.stiffness * (sun.target - sun.x) - k.damping * sun.v) / k.mass) *
        hh;
      sun.x += sun.v * hh;
    }
    if (Math.abs(sun.target - sun.x) < 0.05 && Math.abs(sun.v) < 0.2) {
      sun.x = sun.target;
      sun.v = 0;
    } else moving = true;
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden || !ctx) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const css = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "gray";
    };
    const sunCss = css(2);
    colours = {
      paper: resolve(css(0)),
      ink: resolve(css(1)),
      sun: resolve(sunCss),
      haze: resolve(sunCss, 0.45),
    };
    glow = null;
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 2 || nh < 2) return;
    const first = w < 2;
    w = nw;
    h = nh;
    dprNow = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dprNow);
    canvas.height = Math.round(h * dprNow);
    inkLayer.width = canvas.width;
    inkLayer.height = canvas.height;
    sun.target = sunX(w, sun.at);
    if (first || !c.motionSafe) {
      sun.x = sun.target;
      sun.v = 0;
    }
    glow = null;
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx || !ink) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was || was.seed !== next.seed) reseed(next.seed);
      if (!was) {
        readColours();
        resize();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (was.dpr !== next.dpr) resize();
      if (!next.motionSafe) {
        sun.x = sun.target;
        sun.v = 0;
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    setVisible(v) {
      visible = v;
      if (v) {
        draw();
        kick();
      }
    },
    wake() {
      draw();
      kick();
    },
    sunTo(at) {
      sun.at = at;
      sun.target = sunX(w, at);
      if (!cfg?.motionSafe) {
        sun.x = sun.target;
        sun.v = 0;
        draw();
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A ploughed field at dusk, printed in two inks: furrows run away from you as
 * fine wavy lines, rising and falling over rolling hills toward a low sun
 * striped by haze, with a ragged ridge on the horizon. Each furrow is drawn
 * near to far, so a crest hides the furrow behind it; its weight follows the
 * light, thin where the slope faces the sun and heavy where it turns away, and
 * the furrows in line with the sun take its colour. The whole field glides
 * slowly toward you.
 *
 * The pointer over the scene, or focus moving onto a control laid over it,
 * slides the sun along the horizon on the drift spring, and the light rolls
 * across every hill with it. The scene is decoration (`aria-hidden`); its
 * children sit above it and keep every click. With `focusable` it becomes a
 * slider for the sun. Under reduced motion the field is a still print and the
 * sun moves at once.
 */
export function TilledHorizon({
  children,
  spacing = 11,
  roll = 0.5,
  palette = "dusk",
  inkColor,
  sunColor,
  paperColor,
  speed = 1,
  horizon = 0.42,
  sunSize = 0.24,
  haze = 0.6,
  sun,
  defaultSun = 0.62,
  onSunChange,
  interactive = true,
  focusable = false,
  label = "Sun position",
  paused = false,
  seed = 5,
  dpr = 2,
  className,
}: TilledHorizonProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const [own, setOwn] = React.useState(() => clamp(defaultSun, 0, 1));
  const place = Math.round(clamp(sun ?? own, 0, 1) * 100) / 100;
  const inks = PALETTES[palette] ?? PALETTES.dusk;
  const ink = inkColor ?? inks.ink;
  const sunInk = sunColor ?? inks.sun;
  const paper = paperColor ?? PAPER;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const placeRef = React.useRef(place);

  const config: Config = {
    spacing,
    roll,
    speed,
    horizon,
    sunSize,
    haze,
    paused,
    seed,
    dpr,
    motionSafe,
    colorKey: `${ink}|${sunInk}|${paper}`,
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
    const e = createEngine(root, canvas, carriers);
    engine.current = e;
    e.sunTo(placeRef.current);
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
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
  }, []);

  React.useEffect(() => {
    placeRef.current = place;
    engine.current?.sunTo(place);
  }, [place]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visibleRef.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visibleRef.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visibleRef.current = false;
    };
  }, []);

  /** Moves the sun from the pointer, key or focus that asked for it, and reports it. */
  const steer = (next: number) => {
    const at = Math.round(clamp(next, 0, 1) * 100) / 100;
    if (at === placeRef.current && sun === undefined) return;
    if (sun === undefined) setOwn(at);
    if (at !== place) onSunChange?.(at);
  };

  const fromX = (clientX: number) => {
    const el = rootRef.current;
    if (!el) return placeRef.current;
    const r = el.getBoundingClientRect();
    if (r.width < 1) return placeRef.current;
    return ((clientX - r.left) / r.width - 0.08) / 0.84;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!focusable || event.target !== event.currentTarget) return;
    const big = event.shiftKey ? 0.2 : 0.05;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = place + big;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = place - big;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    if (next === null) return;
    event.preventDefault();
    steer(next);
  };

  const pct = Math.round(place * 100);
  const hz = Math.round(clamp(horizon, 0.2, 0.7) * 100);
  const sunPct = r2(clamp(sunSize, 0.08, 0.5) * 100);
  const sunLeft = r2(8 + 84 * place);

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        steer(fromX(event.clientX));
      }}
      onPointerDown={(event) => {
        if (!interactive || event.pointerType !== "touch") return;
        steer(fromX(event.clientX));
      }}
      onFocus={(event) => {
        if (!interactive || event.target === event.currentTarget) return;
        const el = event.target;
        if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
        const r = el.getBoundingClientRect();
        steer(fromX(r.left + r.width / 2));
      }}
      className={cn(
        "group/tilled-horizon relative isolate h-64 w-full overflow-clip",
        className,
      )}
    >
      <div
        role={focusable ? "slider" : undefined}
        tabIndex={focusable ? 0 : undefined}
        aria-hidden={focusable ? undefined : true}
        aria-label={focusable ? label : undefined}
        aria-valuemin={focusable ? 0 : undefined}
        aria-valuemax={focusable ? 100 : undefined}
        aria-valuenow={focusable ? pct : undefined}
        aria-valuetext={focusable ? `Sun ${pct}% along the horizon` : undefined}
        aria-describedby={focusable ? `${uid}-hint` : undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 outline-none",
          focusable &&
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      >
        {/* The still: the server's frame and the first paint. */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/tilled-horizon:opacity-0"
          style={{ backgroundColor: paper }}
        >
          <div
            className="absolute aspect-square rounded-full"
            style={{
              left: `${sunLeft}%`,
              top: `${hz}%`,
              height: `${sunPct}%`,
              transform: "translate(-50%, -62%)",
              backgroundColor: sunInk,
              backgroundImage: `repeating-linear-gradient(180deg, transparent 0 52%, ${paper} 52% 56%, transparent 56% 64%, ${paper} 64% 70%, transparent 70% 78%, ${paper} 78% 86%, transparent 86%)`,
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              top: `${hz}%`,
              backgroundColor: paper,
              backgroundImage: `repeating-conic-gradient(from 90deg at 50% 0%, ${ink} 0deg 0.7deg, transparent 0.7deg 3.2deg)`,
              maskImage:
                "linear-gradient(180deg, transparent, black 30%, black)",
            }}
          />
        </div>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/tilled-horizon:opacity-100"
        />
      </div>
      {focusable ? (
        <span id={`${uid}-hint`} className="sr-only">
          Left and right arrows move the sun along the horizon.
        </span>
      ) : null}
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden"
      >
        {[paper, ink, sunInk].map((colour, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: colour }}
          />
        ))}
      </span>
      {children ? (
        <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
          {children}
        </div>
      ) : null}
    </div>
  );
}
