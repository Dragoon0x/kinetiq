"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ForecastGlowPalette = "polar" | "violet" | "teal" | "mono";

export type ForecastGlowProps = {
  /** Hourly activity, one reading per hour from `startHour`, on a 0 to `maxReading` scale. @default defaultForecast */
  forecast?: number[];
  /** The clock hour of the first reading. @default 18 */
  startHour?: number;
  /** Controlled position on the timeline, in hours from the first reading. */
  value?: number;
  /** Initial position when uncontrolled. @default 5 */
  defaultValue?: number;
  /** Fires from the drag or key that moved the timeline, in quarter hours from the first reading. */
  onValueChange?: (value: number) => void;
  /** How bright the glow can get, 0 to 1. @default 0.7 */
  intensity?: number;
  /** How soft the glow is, 0 (soft) to 1 (a haze). @default 0.6 */
  blur?: number;
  /** The glow's colours from quiet to the peak. @default "polar" */
  palette?: ForecastGlowPalette;
  /** Colours of your own: the base of a quiet glow, its middle, and the top at the peak. Overrides `palette`. */
  colors?: [string, string, string];
  /** The top of the reading scale. @default 9 */
  maxReading?: number;
  /** Formats a reading for the readout and assistive technology. @default "Kp 5.3" */
  format?: (reading: number) => string;
  /** Names a reading: quiet, active, strong, storm. */
  describe?: (reading: number) => string;
  /** How fast the curtains drift, 0 (still) to 1. @default 0.5 */
  drift?: number;
  /** A lake under the hills that mirrors the glow. @default true */
  reflection?: boolean;
  /** Hold the curtains still. @default false */
  paused?: boolean;
  /** Seeds the stars, the hills and the curtains. @default 4 */
  seed?: number;
  /** The timeline's accessible name. @default "Forecast hour" */
  label?: string;
  /** Shows the forecast but the timeline takes no input. @default false */
  disabled?: boolean;
  /** Sizes the widget; the timeline takes 56px of it. @default "h-52 w-full" */
  className?: string;
};

/** Tonight, 18:00 to 06:00: a quiet dusk, a storm around midnight, a quiet dawn. */
export const defaultForecast = [
  1.3, 2, 2.7, 3.7, 4.7, 5.7, 6.3, 5.3, 4.3, 3.3, 2.7, 2, 1.7,
];

const PALETTES: Record<ForecastGlowPalette, [string, string, string]> = {
  polar: [
    "oklch(from var(--success) 0.82 0.19 h)",
    "oklch(from var(--success) 0.78 0.15 calc(h - 30))",
    "oklch(from var(--danger) 0.64 0.22 calc(h + 345))",
  ],
  violet: [
    "oklch(from var(--accent-bright) 0.78 0.13 calc(h - 70))",
    "oklch(from var(--accent-bright) 0.7 0.16 calc(h - 20))",
    "oklch(from var(--accent-bright) 0.62 0.21 calc(h + 50))",
  ],
  teal: [
    "oklch(from var(--success) 0.84 0.14 calc(h + 25))",
    "oklch(from var(--accent-bright) 0.76 0.13 calc(h - 40))",
    "oklch(from var(--accent-bright) 0.66 0.17 h)",
  ],
  mono: [
    "color-mix(in oklab, var(--accent-bright) 55%, white)",
    "color-mix(in oklab, var(--accent-bright) 80%, white)",
    "var(--accent-bright)",
  ],
};

// The night is fixed art: dark on a light page and a dark one alike.
const SKY = "color-mix(in oklab, var(--accent) 14%, black)";
const SKY_LOW = "color-mix(in oklab, var(--accent-bright) 22%, black)";
const HILLS = "color-mix(in oklab, var(--accent) 8%, black)";
const LAKE = "color-mix(in oklab, var(--accent) 12%, black)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Number(v.toFixed(3));
const STEP_H = 0.25;
const TIMELINE_H = 56;
/** Where the hills meet the lake, as a share of the scene's height. */
const SHORE = 0.76;

type RGB = [number, number, number];

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
  return (colour: string): RGB => {
    if (!ctx) return [0.4, 0.9, 0.6];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

/**
 * The forecast at a fractional hour, by monotone cubic interpolation, so the
 * curve through the readings never overshoots them.
 */
export function forecastAt(forecast: number[], hour: number): number {
  const n = forecast.length;
  if (n === 0) return 0;
  if (n === 1) return forecast[0] ?? 0;
  const x = clamp(hour, 0, n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const t = x - i;
  const y0 = forecast[i] ?? 0;
  const y1 = forecast[i + 1] ?? 0;
  const slope = (k: number) => {
    const a = (forecast[k] ?? 0) - (forecast[k - 1] ?? forecast[k] ?? 0);
    const b = (forecast[k + 1] ?? forecast[k] ?? 0) - (forecast[k] ?? 0);
    if (k === 0) return b;
    if (k === n - 1) return a;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const m0 = slope(i);
  const m1 = slope(i + 1);
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * m1
  );
}

const describeDefault = (reading: number) =>
  reading < 2
    ? "quiet"
    : reading < 4
      ? "active"
      : reading < 6
        ? "strong"
        : "storm";
const formatDefault = (reading: number) => `Kp ${reading.toFixed(1)}`;
const clockText = (hour: number) => {
  const minutes = ((Math.round(hour * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

type Config = {
  intensity: number;
  blur: number;
  drift: number;
  reflection: boolean;
  paused: boolean;
  seed: number;
  motionSafe: boolean;
  colourKey: string;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (v: boolean) => void;
  /** The strength the sky should move toward, 0 to 1. */
  aim: (strength: number) => void;
  dispose: () => void;
};

function createEngine(
  box: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement,
): Engine {
  const ctx = canvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  let W = 0;
  let H = 0;
  let cols = 0;
  let rows = 0;
  let image: ImageData | null = null;
  let colI = new Float32Array(0);
  let frame = 0;
  let last = 0;
  let lastDraw = 0;
  let clock = 40;
  let disposed = false;
  let visible = false;
  let low: RGB = [0.3, 0.9, 0.6];
  let mid: RGB = [0.3, 0.8, 0.7];
  let peak: RGB = [0.9, 0.3, 0.4];
  // The sky's strength follows the timeline on the drift spring's constants.
  let strength = -1;
  let strengthVel = 0;
  let goal = 0;
  let curtains: {
    at: number;
    width: number;
    gain: number;
    phase: number;
    rate: number;
  }[] = [];

  const readColours = () => {
    const kids = carriers.children;
    const at = (i: number, fallback: RGB): RGB => {
      const el = kids[i];
      return el ? read(getComputedStyle(el).color) : fallback;
    };
    low = at(0, low);
    mid = at(1, mid);
    peak = at(2, peak);
    paint();
  };

  const seedCurtains = () => {
    const r = lcg((cfg?.seed ?? 4) * 7 + 1);
    curtains = Array.from({ length: 4 }, (_, i) => ({
      at: 0.12 + (i / 3) * 0.76 + (r() - 0.5) * 0.12,
      width: 0.1 + r() * 0.12,
      gain: 0.6 + r() * 0.5,
      phase: r() * Math.PI * 2,
      rate: 0.5 + r(),
    }));
  };

  const measure = () => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (w < 1 || h < 1) return;
    W = w;
    H = h;
    const b = clamp01(cfg?.blur ?? 0.6);
    // The buffer is small on purpose: the browser scales it up, and the blur
    // finishes it, so the glow is soft by construction.
    const nextCols = clamp(Math.round(W / lerp(4, 9, b)), 36, 200);
    const nextRows = clamp(Math.round((nextCols * H) / W), 12, 90);
    if (nextCols !== cols || nextRows !== rows || !image) {
      cols = nextCols;
      rows = nextRows;
      canvas.width = cols;
      canvas.height = rows;
      image = ctx ? ctx.createImageData(cols, rows) : null;
      colI = new Float32Array(cols);
    }
    canvas.style.filter = `blur(${(lerp(2, 13, b) * Math.sqrt(W / 720)).toFixed(2)}px)`;
  };

  function paint() {
    const c = cfg;
    if (!ctx || !c || !image || cols < 1) return;
    const s = clamp01(strength < 0 ? goal : strength);
    const data = image.data;
    const horizon = Math.round(rows * SHORE);
    // The glow's lower edge sits just under the ridge line, so the hills
    // cut it and it seems to rise from behind them.
    const base = rows * (SHORE - 0.13);
    const height = lerp(0.4, 1.05, s) * base;
    const gain = clamp01(c.intensity) * (0.35 + 1.1 * Math.pow(s, 1.1));
    // How far down the peak colour reaches: only the very top on a quiet
    // night, half the glow at the peak.
    const redFrom = lerp(0.95, 0.35, Math.pow(s, 1.4));
    const t = clock;
    for (let x = 0; x < cols; x += 1) {
      const u = x / cols;
      let sum = 0;
      for (const k of curtains) {
        const centre = k.at + 0.07 * Math.sin(t * 0.05 * k.rate + k.phase);
        const d = (u - centre) / k.width;
        sum += k.gain * Math.exp(-d * d);
      }
      // Gentle folds and faint rays inside the curtains.
      const fold =
        0.75 +
        0.25 * Math.sin(u * 19 + t * 0.21) * Math.sin(u * 7.3 - t * 0.13);
      colI[x] = Math.min(1.4, sum) * fold;
    }
    for (let y = 0; y < rows; y += 1) {
      const lake = y >= horizon;
      if (lake && !c.reflection) {
        for (let x = 0; x < cols; x += 1) data[(y * cols + x) * 4 + 3] = 0;
        continue;
      }
      // The lake mirrors the sky above the shore, squeezed and dimmer.
      const sy = lake ? horizon - (y - horizon) * 1.7 : y;
      const d = (base - sy) / Math.max(1, height);
      let v = 0;
      if (d > -0.04) {
        const rise = clamp01((d + 0.04) / 0.1);
        v =
          rise *
          Math.exp(-Math.max(0, d) * 2.4) *
          (d > 1 ? Math.max(0, 1 - (d - 1) * 3) : 1);
      }
      const colourT = clamp01((d - redFrom) / Math.max(0.05, 1 - redFrom));
      const lowT = clamp01(d / 0.5);
      const r0 = lerp(low[0], mid[0], lowT);
      const g0 = lerp(low[1], mid[1], lowT);
      const b0 = lerp(low[2], mid[2], lowT);
      const cr = lerp(r0, peak[0], colourT);
      const cg = lerp(g0, peak[1], colourT);
      const cb = lerp(b0, peak[2], colourT);
      const dim = lake ? 0.42 : 1;
      const shift = lake ? Math.sin(y * 1.3 + t * 0.9) * 1.2 : 0;
      for (let x = 0; x < cols; x += 1) {
        const xi = clamp(Math.round(x + shift), 0, cols - 1);
        // Light saturates rather than clips: a soft knee toward full.
        const a = 1 - Math.exp(-v * (colI[xi] ?? 0) * gain * dim * 2.2);
        const o = (y * cols + x) * 4;
        data[o] = Math.round(cr * 255);
        data[o + 1] = Math.round(cg * 255);
        data[o + 2] = Math.round(cb * 255);
        data[o + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  const tick = (time: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
    last = time;
    const drifting = c.motionSafe && !c.paused && c.drift > 0;
    if (drifting) clock += dt * lerp(0.2, 2.2, clamp01(c.drift));
    let moving = false;
    if (strength < 0) strength = goal;
    if (c.motionSafe) {
      const { stiffness, damping, mass } = springs.drift;
      const steps = Math.max(1, Math.ceil(dt / 0.004));
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        strengthVel +=
          ((-stiffness * (strength - goal) - damping * strengthVel) / mass) * h;
        strength += strengthVel * h;
      }
      moving =
        Math.abs(strength - goal) > 0.0005 || Math.abs(strengthVel) > 0.001;
      if (!moving) {
        strength = goal;
        strengthVel = 0;
      }
    } else {
      // Reduced motion: a short ease, no spring.
      strength += (goal - strength) * Math.min(1, dt / 0.06);
      moving = Math.abs(strength - goal) > 0.002;
      if (!moving) strength = goal;
    }
    // Drifting curtains are slow: 30 frames a second is plenty for them.
    if (moving || time - lastDraw > 32) {
      lastDraw = time;
      paint();
    }
    if (moving || drifting) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  function kick() {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  }

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) return;
      if (!was || was.seed !== next.seed) seedCurtains();
      if (!was || was.blur !== next.blur) measure();
      if (!was || was.colourKey !== next.colourKey) readColours();
      paint();
      kick();
    },
    resize() {
      measure();
      paint();
      kick();
    },
    readColours,
    setVisible(v) {
      visible = v;
      if (v) {
        measure();
        paint();
        kick();
      }
    },
    aim(s) {
      goal = clamp01(s);
      if (strength < 0) {
        strength = goal;
        paint();
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      image = null;
    },
  };
}

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Readout text that rides a motion value: no re-render per frame. */
function Live({
  value,
  className,
}: {
  value: MotionValue<string>;
  className?: string;
}) {
  return <motion.span className={className}>{value}</motion.span>;
}

/**
 * A soft, heavily blurred aurora over dark hills and a still lake, whose
 * strength follows an hourly activity forecast. The glow is computed per
 * pixel into a small buffer and left to the browser to scale and blur, so it
 * is soft by construction: a few slow curtains with gentle folds, rising off
 * a lower edge and fading upward, mirrored dimmer in the lake.
 *
 * The timeline beneath is a slider through the night. Dragging moves 1:1
 * and a release projects the throw and glides to a quarter hour on
 * springs.glide with the release velocity; the sky follows on the drift
 * spring's constants, so it answers softly: brighter, taller, and shifting
 * from its quiet colour toward its peak colour as the reading climbs. The
 * hour and the reading ride the playhead in the readout above. Arrow keys
 * step a quarter hour, Shift and Page keys an hour, Home and End the ends.
 * Under reduced motion the curtains are still and the sky eases quickly to
 * each new reading.
 */
export function ForecastGlow({
  forecast = defaultForecast,
  startHour = 18,
  value,
  defaultValue = 5,
  onValueChange,
  intensity = 0.7,
  blur = 0.6,
  palette = "polar",
  colors,
  maxReading = 9,
  format = formatDefault,
  describe = describeDefault,
  drift = 0.5,
  reflection = true,
  paused = false,
  seed = 4,
  label = "Forecast hour",
  disabled = false,
  className,
}: ForecastGlowProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const span = Math.max(0, forecast.length - 1);
  const top = Math.max(1e-6, maxReading);
  const [own, setOwn] = React.useState(() => clamp(defaultValue, 0, span));
  const current = clamp(value ?? own, 0, span);
  const tones = colors ?? PALETTES[palette] ?? PALETTES.polar;

  const sceneRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const position = useMotionValue(current);
  const glide = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const dragFrom = React.useRef(0);
  const reported = React.useRef(current);

  const config: Config = {
    intensity,
    blur,
    drift,
    reflection,
    paused,
    seed,
    motionSafe,
    colourKey: tones.join("|"),
  };
  const latest = React.useRef(config);
  const data = React.useRef({ forecast, top });

  React.useEffect(() => {
    latest.current = config;
    data.current = { forecast, top };
    engine.current?.configure(config);
    engine.current?.aim(forecastAt(forecast, position.get()) / top);
  });

  React.useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!scene || !canvas || !carriers) return;
    const e = createEngine(scene, canvas, carriers);
    engine.current = e;
    e.configure(latest.current);
    e.aim(forecastAt(data.current.forecast, position.get()) / data.current.top);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(scene);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      e.setVisible(Boolean(entry?.isIntersecting));
    });
    watcher.observe(scene);
    const onVisibility = () => {
      if (!document.hidden) e.resize();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = position.on("change", (n) =>
      e.aim(forecastAt(data.current.forecast, n) / data.current.top),
    );
    return () => {
      unsubscribe();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [position]);

  // Where the running glide is heading: a host answering with the same
  // value must not restart it and throw away the release velocity.
  const heading = React.useRef<number | null>(null);
  const settleTo = React.useCallback(
    (to: number, velocity = 0) => {
      glide.current?.stop();
      heading.current = to;
      if (!motionSafe) {
        position.jump(to);
        return;
      }
      glide.current = animate(position, to, { ...springs.glide, velocity });
    },
    [motionSafe, position],
  );

  React.useEffect(() => {
    if (dragging.current) return;
    if (heading.current !== null && Math.abs(heading.current - current) < 1e-6)
      return;
    if (Math.abs(position.get() - current) > 1e-3) settleTo(current);
  }, [current, settleTo, position]);

  React.useEffect(() => () => glide.current?.stop(), []);

  const commit = (h: number, velocity = 0) => {
    const snapped = clamp(Math.round(h / STEP_H) * STEP_H, 0, span);
    settleTo(snapped, velocity);
    if (value === undefined) setOwn(snapped);
    if (snapped !== reported.current) {
      reported.current = snapped;
      onValueChange?.(snapped);
    }
  };

  const width = () => trackRef.current?.getBoundingClientRect().width ?? 1;

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      glide.current?.stop();
      dragFrom.current = position.get();
    },
    onMove: ({ offset }) => {
      const perPx = span / Math.max(1, width());
      const raw = dragFrom.current + offset.x * perPx;
      position.set(r3(rubberClamp(raw, 0, span, Math.max(1, span) * 0.2)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const perPx = span / Math.max(1, width());
      commit(
        project(position.get(), velocity.x * perPx, 0.99),
        velocity.x * perPx,
      );
    },
    onCancel: () => {
      dragging.current = false;
      settleTo(current);
    },
    onTap: (event) => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r) return;
      commit(((event.clientX - r.left) / Math.max(1, r.width)) * span);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 1 : STEP_H;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = current + step;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = current - step;
    else if (event.key === "PageUp") next = current + 1;
    else if (event.key === "PageDown") next = current - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = span;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const playhead = useTransform(
    position,
    (h) => `${(span > 0 ? (clamp(h, 0, span) / span) * 100 : 0).toFixed(3)}%`,
  );
  const hourText = useTransform(position, (h) =>
    clockText(startHour + clamp(h, 0, span)),
  );
  const readingText = useTransform(position, (h) =>
    format(forecastAt(forecast, h)),
  );
  const reading = forecastAt(forecast, current);
  const word = describe(reading);
  const words = Array.from(
    new Set(["quiet", "active", "strong", "storm", word]),
  );
  const peakIndex = forecast.reduce(
    (best, v, i) => (v > (forecast[best] ?? -Infinity) ? i : best),
    0,
  );
  const valueText = `${clockText(startHour + current)}, ${format(reading)}, ${word}`;
  const hours = forecast.length;

  // Stars: fixed, seeded, rounded — the server draws the same sky.
  const stars = React.useMemo(() => {
    const r = lcg(seed * 13 + 2);
    return Array.from({ length: 34 }, () => ({
      x: r3(r() * 100),
      y: r3(Math.pow(r(), 1.3) * SHORE * 82),
      s: r3(0.5 + r() * r() * 1.1),
      o: r3(0.25 + r() * 0.6),
    }));
  }, [seed]);

  // Hills with a fringe of pines, in a 1000 × 100 box stretched to the width.
  const hills = React.useMemo(() => {
    const r = lcg(seed * 29 + 11);
    const pts: string[] = ["M 0 100", "L 0 64"];
    let x = 0;
    while (x < 1000) {
      const step = 14 + r() * 26;
      const ridge = 56 + 10 * Math.sin(x / 140 + seed) + 6 * Math.sin(x / 47);
      if (r() < 0.55) {
        // A pine: a narrow spire on the ridge.
        const w = 5 + r() * 6;
        const h = 6 + r() * 10;
        pts.push(
          `L ${r3(x)} ${r3(ridge)}`,
          `L ${r3(x + w / 2)} ${r3(ridge - h)}`,
          `L ${r3(x + w)} ${r3(ridge)}`,
        );
        x += w;
      }
      x += step;
      pts.push(
        `L ${r3(Math.min(1000, x))} ${r3(56 + 10 * Math.sin(x / 140 + seed) + 6 * Math.sin(x / 47))}`,
      );
    }
    pts.push("L 1000 100 Z");
    return pts.join(" ");
  }, [seed]);

  return (
    <div
      className={cn(
        "relative isolate flex h-52 w-full flex-col overflow-clip rounded-3 select-none",
        className,
      )}
      style={
        {
          backgroundColor: HILLS,
          "--fg-ink": "color-mix(in oklab, var(--accent-bright) 8%, white)",
          "--fg-faint":
            "color-mix(in oklab, var(--accent-bright) 35%, white 55%)",
          "--fg-low": tones[0],
          "--fg-peak": tones[2],
        } as React.CSSProperties
      }
    >
      <div
        ref={sceneRef}
        role="img"
        aria-label={`Aurora forecast at ${clockText(startHour + current)}: ${format(reading)}, ${word}.`}
        className="relative flex-1 overflow-clip"
        style={{
          backgroundColor: SKY,
          backgroundImage: `linear-gradient(180deg, color-mix(in oklab, ${SKY}, black 30%) 0%, ${SKY} 45%, ${SKY_LOW} ${SHORE * 100}%, ${LAKE} ${SHORE * 100}%, color-mix(in oklab, ${LAKE}, black 35%) 100%)`,
        }}
      >
        {stars.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute rounded-full bg-(--fg-ink)"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.s,
              height: s.s,
              opacity: s.o,
            }}
          />
        ))}
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full mix-blend-screen"
          style={{ imageRendering: "auto" }}
        />
        <svg
          aria-hidden
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          className="absolute inset-x-0 w-full"
          style={{ top: `${(SHORE - 0.22) * 100}%`, height: "22%" }}
        >
          <path d={hills} style={{ fill: HILLS }} />
        </svg>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 p-3"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <Live
              value={hourText}
              className="font-mono text-lg leading-none text-(--fg-ink) tabular-nums"
            />
            <span className="flex items-baseline gap-1.5 font-mono text-[10px] tracking-[0.06em] text-(--fg-faint) uppercase tabular-nums">
              <Live value={readingText} />
              <span className="grid">
                {words.map((w) => (
                  <span
                    key={w}
                    className={cn(
                      "col-start-1 row-start-1 transition-opacity",
                      motionSafe ? "duration-300" : "duration-150",
                      w === word ? "opacity-100" : "opacity-0",
                    )}
                  >
                    · {w}
                  </span>
                ))}
              </span>
            </span>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-(--fg-faint) uppercase">
            <span className="size-1.5 rounded-full bg-(--fg-peak)" />
            peak {clockText(startHour + peakIndex)}
          </span>
        </div>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={Math.round(span * 60)}
        aria-valuenow={Math.round(current * 60)}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "@container relative mx-3 shrink-0 cursor-ew-resize touch-pan-y rounded-2",
          disabled && "cursor-default opacity-60",
          FOCUS_RING,
        )}
        style={{ height: TIMELINE_H }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-2 flex h-6 items-end gap-px"
        >
          {forecast.map((v, i) => {
            const t = clamp01(v / top);
            return (
              <span
                key={i}
                className="min-w-0 flex-1 rounded-t-[2px]"
                style={{
                  height: `${Math.max(8, Math.round(t * 100))}%`,
                  backgroundColor: `color-mix(in oklab, var(--fg-low), var(--fg-peak) ${Math.round(clamp01((t - 0.25) / 0.6) * 100)}%)`,
                  opacity: Number((0.35 + 0.5 * t).toFixed(3)),
                }}
              />
            );
          })}
        </div>
        <div
          aria-hidden
          className="absolute inset-x-0 top-8 h-px bg-(--fg-faint) opacity-40"
        />
        {Array.from({ length: hours }, (_, i) => {
          const left = `${hours > 1 ? ((i / (hours - 1)) * 100).toFixed(3) : "0"}%`;
          const edge =
            i === 0
              ? "translate-x-0"
              : i === hours - 1
                ? "-translate-x-full"
                : "-translate-x-1/2";
          return (
            <span
              key={i}
              aria-hidden
              className={cn(
                "absolute top-10 font-mono text-[10px] leading-none text-(--fg-faint) tabular-nums",
                edge,
                i % 2 === 1 && i !== hours - 1
                  ? "hidden @[30rem]:block"
                  : "block",
              )}
              style={{ left }}
            >
              {String(Math.round((startHour + i) % 24)).padStart(2, "0")}
            </span>
          );
        })}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-1 h-8 w-0"
          style={{ left: playhead }}
        >
          <span className="absolute top-0 left-[-0.5px] h-full w-px bg-(--fg-ink)" />
          <span className="absolute top-[-3px] left-[-4px] size-2 rounded-full bg-(--fg-ink)" />
        </motion.span>
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {tones.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <span id={hintId} className="sr-only">
        Left and Right move a quarter hour, Shift or Page Up and Page Down an
        hour, Home and End to the first and last hour.
      </span>
    </div>
  );
}
