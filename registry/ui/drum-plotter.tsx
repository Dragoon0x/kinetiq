"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DrumPlotterInk = "red" | "blue" | "green" | "violet";
export type DrumPlotterGrid = "graph" | "ruled" | "dots" | "plain";

export type DrumPlotterSeries = {
  /** Stable id: what `value` and the legend hold. */
  id: string;
  /** Short name, shown in the legend and the readout. */
  label: string;
  /** Unit printed after a reading, e.g. "°C". */
  unit?: string;
  /** Readings played back in a loop at `sampleRate` when no live `reading` is given. */
  samples?: number[];
  /** Bottom of the scale. Defaults to the samples' low point. */
  min?: number;
  /** Top of the scale. Defaults to the samples' high point. */
  max?: number;
  /** Decimals in readouts. @default 1 */
  decimals?: number;
  /** This series' ink, any CSS colour. Defaults to the next ink in the rack. */
  ink?: string;
};

export type DrumPlotterReadout = {
  /** Id of the series whose ink is under the readout. */
  series: string;
  /** The reading there, in the series' units. */
  value: number;
  /** How long ago it was laid, in seconds. */
  secondsAgo: number;
};

export type DrumPlotterProps = {
  /** The series the pen can plot. @default three cold-store series: temperature, humidity and vibration */
  series?: DrumPlotterSeries[];
  /** The series being plotted (controlled), by id. */
  value?: string;
  /** The series plotted first when uncontrolled. @default the first series */
  defaultValue?: string;
  /** Fires from the legend press or key that picked a series, with its id. */
  onValueChange?: (id: string) => void;
  /** Live mode: the pen follows this reading, in the series' units, instead of playing its samples. */
  reading?: number;
  /** Samples per second when playing a series' `samples`. @default 4 */
  sampleRate?: number;
  /** How fast the paper travels across the front of the drum, px per second. @default 36 */
  paperSpeed?: number;
  /** The first ink in the rack — red, blue, green or violet — or any CSS colour; later series take the next inks. @default "red" */
  inkColor?: DrumPlotterInk | (string & {});
  /** The paper: fine graph paper, ruled lines, a dot grid or plain. @default "graph" */
  gridStyle?: DrumPlotterGrid;
  /** How the pen answers a change, 0 (a heavy, slow pen) to 1 (a light, quick one); 0.5 rides the snap spring. @default 0.5 */
  penResponse?: number;
  /** Where the pen sits across the drum's face, 0.55 to 0.9 of its width. @default 0.74 */
  penAt?: number;
  /** Width of the inked line, px. @default 1.6 */
  lineWidth?: number;
  /** Show the series legend and the live value above the drum. @default true */
  legend?: boolean;
  /** Show the value scale beside the drum. @default true */
  scale?: boolean;
  /** Stop the drum; the readout still works. @default false */
  paused?: boolean;
  /** Fires when the hovered or keyboard reading changes, and with null when it hides. */
  onReadout?: (readout: DrumPlotterReadout | null) => void;
  /** The recorder's accessible name. @default "Chart recorder" */
  label?: string;
  /** Highest device pixel ratio the drum is drawn at. @default 2 */
  dpr?: number;
  /** No legend, hover or keys; the drum keeps plotting. @default false */
  disabled?: boolean;
  /** Sizes the recorder; it is 224px tall and full width by default. */
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Default data: a cold store whose compressor cycles every 15 s.      */
/* ------------------------------------------------------------------ */

function hashNoise(i: number, salt: number): number {
  let h =
    Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(salt + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (((h ^ (h >>> 15)) >>> 0) / 4294967295) * 2 - 1;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** 30 s of readings at 4 a second: two compressor cycles and a door opened once. */
const COLD_STORE = (() => {
  const temp: number[] = [];
  const humidity: number[] = [];
  const vibration: number[] = [];
  const warm = 1 - Math.exp(-44 / 26);
  for (let i = 0; i < 120; i += 1) {
    const c = i % 60;
    const running = c >= 44;
    const t = running
      ? 1.3 + 3.25 * Math.exp(-(c - 44) / 4.2)
      : 1.3 + (3.25 * (1 - Math.exp(-c / 26))) / warm;
    const door = i >= 94 && i < 104 ? 0.9 * Math.exp(-(i - 94) / 4) : 0;
    temp.push(r2(t + door + 0.07 * hashNoise(i, 11)));
    const dry = running
      ? -3 * (1 - Math.exp(-(c - 44) / 5))
      : -3 * Math.exp(-c / 9);
    humidity.push(
      r2(
        84 +
          3.4 * Math.sin((2 * Math.PI * i) / 120) +
          1.6 * Math.sin((6 * Math.PI * i) / 120 + 1) +
          dry +
          (door > 0 ? 4 * door : 0) +
          0.3 * hashNoise(i, 23),
      ),
    );
    const hum = running
      ? 4.1 + 1.4 * Math.abs(hashNoise(i, 37)) + 0.6 * Math.sin(i * 2.1)
      : 0.45 + 0.3 * Math.abs(hashNoise(i, 41));
    const slam = i === 94 ? 6.6 : i === 95 ? 3.2 : i === 96 ? 1.3 : 0;
    vibration.push(r2(Math.max(hum, slam)));
  }
  return { temp, humidity, vibration };
})();

/** The cold store the recorder plots by default. */
export const defaultDrumSeries: DrumPlotterSeries[] = [
  {
    id: "temp",
    label: "Temp",
    unit: "°C",
    samples: COLD_STORE.temp,
    min: 0,
    max: 6,
    decimals: 1,
  },
  {
    id: "humidity",
    label: "Humidity",
    unit: "%",
    samples: COLD_STORE.humidity,
    min: 72,
    max: 94,
    decimals: 0,
  },
  {
    id: "vibration",
    label: "Vibration",
    unit: "mm/s",
    samples: COLD_STORE.vibration,
    min: 0,
    max: 8,
    decimals: 1,
  },
];

/* ------------------------------------------------------------------ */
/* Colour: pigments at a fixed lightness so ink reads the same on the  */
/* paper in both themes; the paper dims a little in a dark room.       */
/* ------------------------------------------------------------------ */

const INKS: Record<DrumPlotterInk, string> = {
  red: "oklch(from var(--danger) 0.53 0.19 h)",
  blue: "oklch(from var(--accent) 0.47 0.19 h)",
  green: "oklch(from var(--success) 0.5 0.12 h)",
  violet: "oklch(from var(--accent) 0.47 0.17 calc(h + 48))",
};
const RACK: DrumPlotterInk[] = ["red", "blue", "green", "violet"];
const PAPER =
  "color-mix(in oklab, oklch(from var(--warn) 0.968 0.012 h) 90%, var(--background))";
const GRID = "oklch(from var(--signal) 0.68 0.075 h)";
const METAL = "oklch(from var(--ink-3) 0.88 0.006 h)";
const METAL_DARK = "oklch(from var(--ink-3) 0.44 0.012 h)";
const SHADE = "oklch(from var(--ink-3) 0.16 0.012 h)";

type Palette = {
  paper: string;
  grid: string;
  metal: string;
  metalDark: string;
  shade: string;
  inks: string[];
};

/** The ring buffer of laid ink: one slot per pixel of paper. */
const SLOTS = 4096;
const MASK = SLOTS - 1;
/** Physics sub-step, s: small enough for the stiffest pen. */
const STEP = 1 / 240;
/** Height of each end flange, px. */
const FLANGE = 7;
/** The snap spring's damping ratio, which every pen keeps. */
const SNAP_RATIO =
  springs.snap.damping /
  (2 * Math.sqrt(springs.snap.stiffness * springs.snap.mass));

type Phase = "down" | "up" | "move" | "drop";

type Sim = {
  clock: number;
  paper: number;
  /** Pen position, 0 at the bottom of the series' scale and 1 at the top. */
  u: number;
  uv: number;
  /** Pen lift: 0 on the paper, 1 clear of it, below 0 pressed in. */
  lift: number;
  lv: number;
  phase: Phase;
  phaseAt: number;
  /** Series the pen is plotting, and the one it has been asked for. */
  sid: number;
  pending: number;
  /** The next laid pixel is a touchdown, and blots. */
  touch: boolean;
  /** Pixels of paper still to leave blank (a lift under reduced motion). */
  gap: number;
  lastK: number;
  firstK: number;
};

type Ink = {
  u: Float32Array;
  sid: Int8Array;
  born: Float32Array;
  blot: Uint8Array;
};

type Geometry = {
  w: number;
  h: number;
  dpr: number;
  shade: CanvasGradient | null;
  glint: CanvasGradient | null;
  rail: CanvasGradient | null;
  flangeTop: CanvasGradient | null;
  flangeBottom: CanvasGradient | null;
};

type Look = { x: number | null; key: boolean; ago: number };

type Range = { min: number; max: number };

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const format = (v: number, decimals: number) =>
  v
    .toFixed(decimals)
    .replace(/^-(0\.?0*)$/, "$1")
    .replace(/^-/, "−");

/**
 * Any CSS colour the browser understands — oklch, color-mix, relative
 * colours — as plain `rgb(r g b)`, by painting one pixel: the canvas then
 * only ever sees plain sRGB.
 */
function rgbReader(): (colour: string) => string {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour) => {
    if (!ctx) return "rgb(0 0 0)";
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0 0 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${d[0] ?? 0} ${d[1] ?? 0} ${d[2] ?? 0})`;
  };
}

/** Spring step at unit mass, semi-implicit Euler. */
function springStep(
  x: number,
  v: number,
  to: number,
  k: number,
  c: number,
  m: number,
  h: number,
): [number, number] {
  const a = (k * (to - x) - c * v) / m;
  const nv = v + a * h;
  return [x + nv * h, nv];
}

/**
 * A chart recorder: graph paper wrapped round a drum that turns slowly about
 * a vertical axis, and a pen on a carriage that rides a rail in front of it.
 * The drum is drawn as a real cylinder — every vertical grid line at
 * `cx + R·sin θ` — so squares are square at the front and crowd into shade at
 * both rims. The paper carries the ink left, so the trace is history and the
 * blank paper right of the pen is still to come; the last second of line is
 * wet and dries as it travels.
 *
 * The pen follows the reading on the snap spring's constants, scaled by
 * `penResponse`, so a step is drawn with one small overshoot, as a
 * galvanometer pen draws it. Changing the series lifts the pen on a flick
 * spring, glides the carriage to the new level while the ink changes to the
 * next in the rack, and drops it on the recoil spring — two small bounces —
 * where a blot spreads into the paper.
 *
 * Hover reads the value under the pointer as the paper passes beneath it;
 * the drum is a slider whose arrow keys move the same readout along the trace
 * (Page Up and Down five seconds, Home the oldest ink, End the pen, Escape to
 * hide it). Under reduced motion the drum steps once a second with the pen
 * landing at once, so the record still grows without anything travelling.
 */
export function DrumPlotter({
  series = defaultDrumSeries,
  value,
  defaultValue,
  onValueChange,
  reading,
  sampleRate = 4,
  paperSpeed = 36,
  inkColor = "red",
  gridStyle = "graph",
  penResponse = 0.5,
  penAt = 0.74,
  lineWidth = 1.6,
  legend = true,
  scale = true,
  paused = false,
  onReadout,
  label = "Chart recorder",
  dpr = 2,
  disabled = false,
  className,
}: DrumPlotterProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const list = series.length > 0 ? series : defaultDrumSeries;

  const [own, setOwn] = React.useState<string | undefined>(defaultValue);
  const activeId = value ?? own ?? list[0]?.id ?? "";
  const activeIndex = Math.max(
    0,
    list.findIndex((s) => s.id === activeId),
  );
  const active = list[activeIndex] ?? list[0];

  // The rack: the named ink asked for first, then the others in order. A
  // custom colour leads the rack and the named inks follow it.
  const inks = React.useMemo(() => {
    const named = (RACK as string[]).includes(inkColor);
    const start = named ? RACK.indexOf(inkColor as DrumPlotterInk) : 0;
    const rack = RACK.map((_, i) => INKS[RACK[(start + i) % 4] ?? "red"]);
    const names = RACK.map(
      (_, i) => RACK[(start + i) % 4] ?? "red",
    ) as string[];
    if (!named) {
      rack.unshift(inkColor);
      names.unshift("custom");
    }
    return list.map((s, i) => ({
      css: s.ink ?? rack[i % rack.length] ?? INKS.red,
      name: s.ink ? "its own" : (names[i % names.length] ?? "red"),
    }));
  }, [inkColor, list]);

  const ranges = React.useMemo<Range[]>(
    () =>
      list.map((s) => {
        const data = s.samples ?? [];
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of data) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (!Number.isFinite(lo)) {
          lo = 0;
          hi = 1;
        }
        const pad = (hi - lo || 1) * 0.06;
        const min = s.min ?? r2(lo - pad);
        const max = s.max ?? r2(hi + pad);
        return { min, max: max > min ? max : min + 1 };
      }),
    [list],
  );

  // A series change is announced once, from the render that makes it.
  const [seen, setSeen] = React.useState(activeIndex);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  if (seen !== activeIndex) {
    setSeen(activeIndex);
    setSaid((s) => ({
      n: s.n + 1,
      text: `Plotting ${(active?.label ?? "").toLowerCase()} in ${inks[activeIndex]?.name ?? "red"} ink.`,
    }));
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const drumRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const paletteRef = React.useRef<HTMLSpanElement | null>(null);
  const chipRef = React.useRef<HTMLSpanElement | null>(null);
  const liveRef = React.useRef<HTMLSpanElement | null>(null);
  const shownLive = React.useRef("");
  const bindLive = React.useCallback((node: HTMLSpanElement | null) => {
    liveRef.current = node;
    shownLive.current = "";
  }, []);
  const radioRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const sim = React.useRef<Sim>({
    clock: 0,
    paper: 0,
    u: 0.5,
    uv: 0,
    lift: 0,
    lv: 0,
    phase: "down",
    phaseAt: 0,
    sid: activeIndex,
    pending: activeIndex,
    touch: false,
    gap: 0,
    lastK: 0,
    firstK: 1,
  });
  const ink = React.useRef<Ink | null>(null);
  const geo = React.useRef<Geometry>({
    w: 0,
    h: 0,
    dpr: 1,
    shade: null,
    glint: null,
    rail: null,
    flangeTop: null,
    flangeBottom: null,
  });
  const palette = React.useRef<Palette | null>(null);
  const look = React.useRef<Look>({ x: null, key: false, ago: 0 });
  const visible = React.useRef(false);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const stepTimer = React.useRef<number | null>(null);
  const prefilled = React.useRef(false);
  const shownText = React.useRef({ chip: "" });
  const lastReport = React.useRef<string>("");

  const [keyAgo, setKeyAgo] = React.useState<{ ago: number; text: string }>({
    ago: 0,
    text: "",
  });
  const [maxAgo, setMaxAgo] = React.useState(10);

  const latest = React.useRef({
    list,
    ranges,
    inks,
    reading,
    sampleRate,
    paperSpeed,
    gridStyle,
    penResponse,
    penAt,
    lineWidth,
    paused,
    motionSafe,
    dpr,
    onReadout,
  });
  React.useEffect(() => {
    latest.current = {
      list,
      ranges,
      inks,
      reading,
      sampleRate,
      paperSpeed,
      gridStyle,
      penResponse,
      penAt,
      lineWidth,
      paused,
      motionSafe,
      dpr,
      onReadout,
    };
  });

  /* ----------------------------- the physics ----------------------------- */

  const normOf = (sid: number, v: number) => {
    const r = latest.current.ranges[sid] ?? { min: 0, max: 1 };
    return clamp((v - r.min) / (r.max - r.min), -0.04, 1.04);
  };

  const targetOf = (s: Sim) => {
    const L = latest.current;
    const sr = L.list[s.sid];
    if (!sr) return 0.5;
    if (L.reading !== undefined && s.sid === s.pending) {
      return normOf(s.sid, L.reading);
    }
    const data = sr.samples ?? [];
    const n = data.length;
    if (n === 0) return 0.5;
    const f = s.clock * Math.max(0.1, L.sampleRate);
    const fi = Math.floor(f);
    const i0 = ((fi % n) + n) % n;
    const i1 = (i0 + 1) % n;
    const a = data[i0] ?? 0;
    const b = data[i1] ?? a;
    return normOf(s.sid, a + (b - a) * (f - fi));
  };

  /** Lays ink for the pixels of paper that passed under the pen. */
  const lay = (s: Sim, from: number, u0: number) => {
    const buf = ink.current;
    if (!buf) return;
    const to = s.paper;
    const k1 = Math.floor(to);
    const down = s.lift <= 0.06 && (s.phase === "down" || s.phase === "drop");
    for (let k = s.lastK + 1; k <= k1; k += 1) {
      const f = to > from ? clamp((k - from) / (to - from), 0, 1) : 1;
      const i = k & MASK;
      buf.u[i] = u0 + (s.u - u0) * f;
      let sid = down ? s.sid : -1;
      if (s.gap > 0) {
        s.gap -= 1;
        sid = -1;
      }
      buf.sid[i] = sid;
      buf.born[i] = s.clock;
      buf.blot[i] = 0;
      if (sid >= 0 && s.touch) {
        buf.blot[i] = 1;
        s.touch = false;
      }
    }
    if (k1 > s.lastK) s.lastK = k1;
    if (s.lastK - s.firstK >= SLOTS - 1) s.firstK = s.lastK - SLOTS + 2;
  };

  /** Runs the recorder forward by `dt` seconds. */
  const advance = (dt: number, instant: boolean) => {
    const s = sim.current;
    const L = latest.current;
    const k =
      springs.snap.stiffness *
      Math.pow(2, (clamp(L.penResponse, 0, 1) - 0.5) * 3);
    const c = 2 * SNAP_RATIO * Math.sqrt(k);
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(STEP, left);
      left -= h;
      s.clock += h;
      const from = s.paper;
      const u0 = s.u;
      s.paper += Math.max(0, L.paperSpeed) * h;

      if (instant) {
        if (s.pending !== s.sid) {
          s.sid = s.pending;
          s.gap = 6;
          s.touch = true;
        }
        s.phase = "down";
        s.lift = 0;
        s.lv = 0;
        s.u = targetOf(s);
        s.uv = 0;
      } else {
        // The lift: up on flick, held while the carriage moves, down on recoil.
        if (s.pending !== s.sid && (s.phase === "down" || s.phase === "drop")) {
          s.phase = "up";
          s.phaseAt = s.clock;
        }
        if (s.phase === "up" && s.lift >= 0.85) {
          s.sid = s.pending;
          s.phase = "move";
          s.phaseAt = s.clock;
        }
        if (s.phase === "move" && s.pending !== s.sid) s.sid = s.pending;
        const target = targetOf(s);
        if (
          s.phase === "move" &&
          ((Math.abs(s.u - target) < 0.02 && Math.abs(s.uv) < 0.4) ||
            s.clock - s.phaseAt > 0.5)
        ) {
          s.phase = "drop";
          s.phaseAt = s.clock;
          s.touch = true;
        }
        if (
          s.phase === "drop" &&
          Math.abs(s.lift) < 0.004 &&
          Math.abs(s.lv) < 0.04
        ) {
          s.phase = "down";
        }
        const up = s.phase === "up" || s.phase === "move";
        const spring = up ? springs.flick : springs.recoil;
        [s.lift, s.lv] = springStep(
          s.lift,
          s.lv,
          up ? 1 : 0,
          spring.stiffness,
          spring.damping,
          spring.mass,
          h,
        );
        [s.u, s.uv] = springStep(s.u, s.uv, target, k, c, 1, h);
      }
      lay(s, from, u0);
    }
  };

  /** The history a drum would already hold: the paper is never blank. */
  const prefill = () => {
    const s = sim.current;
    const g = geo.current;
    const L = latest.current;
    if (!ink.current || g.w < 2) return;
    const R = g.w / 2;
    const theta = Math.asin(clamp(2 * L.penAt - 1, -0.95, 0.95));
    const span = R * (theta + Math.PI / 2) + 8;
    const speed = Math.max(4, L.paperSpeed);
    const back = span / speed + 1;
    s.clock = -back;
    s.paper = -span - speed;
    s.lastK = Math.floor(s.paper);
    s.firstK = s.lastK + 1;
    s.u = targetOf(s);
    s.uv = 0;
    advance(back, !latest.current.motionSafe);
  };

  /* ------------------------------- drawing ------------------------------- */

  const reader = React.useRef<((colour: string) => string) | null>(null);

  const readPalette = (): Palette | null => {
    const host = paletteRef.current;
    if (!host) return null;
    if (!reader.current) reader.current = rgbReader();
    const toRgb = reader.current;
    const read = (key: string) => {
      const el = host.querySelector<HTMLElement>(`[data-key="${key}"]`);
      return toRgb(el ? getComputedStyle(el).color : "black");
    };
    return {
      paper: read("paper"),
      grid: read("grid"),
      metal: read("metal"),
      metalDark: read("metal-dark"),
      shade: read("shade"),
      inks: latest.current.inks.map((_, i) => read(`ink-${i}`)),
    };
  };

  /** A palette colour, always `rgb(r g b)`, with an alpha. */
  const alpha = (rgb: string, a: number) => rgb.replace(/\)$/, ` / ${r2(a)})`);

  const buildGradients = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const g = geo.current;
    const p = palette.current;
    if (!ctx || !p || g.w < 2) return;
    const { w, h } = g;
    // Light from the upper left: the drum is lit across its left third and
    // turns into shade at both rims, deeper on the far side.
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, alpha(p.shade, 0.66));
    shade.addColorStop(0.04, alpha(p.shade, 0.4));
    shade.addColorStop(0.12, alpha(p.shade, 0.16));
    shade.addColorStop(0.26, alpha(p.shade, 0.02));
    shade.addColorStop(0.5, alpha(p.shade, 0));
    shade.addColorStop(0.76, alpha(p.shade, 0.06));
    shade.addColorStop(0.9, alpha(p.shade, 0.2));
    shade.addColorStop(0.97, alpha(p.shade, 0.46));
    shade.addColorStop(1, alpha(p.shade, 0.66));
    const glint = ctx.createLinearGradient(0, 0, w, 0);
    glint.addColorStop(0.22, "rgb(255 255 255 / 0)");
    glint.addColorStop(0.32, "rgb(255 255 255 / 0.22)");
    glint.addColorStop(0.36, "rgb(255 255 255 / 0.14)");
    glint.addColorStop(0.46, "rgb(255 255 255 / 0)");
    const railX = penX() + 14;
    const rail = ctx.createLinearGradient(railX - 2, 0, railX + 2, 0);
    rail.addColorStop(0, p.metalDark);
    rail.addColorStop(0.35, p.metal);
    rail.addColorStop(1, p.metalDark);
    const flangeTop = ctx.createLinearGradient(0, 0, 0, FLANGE);
    flangeTop.addColorStop(0, p.metal);
    flangeTop.addColorStop(1, p.metalDark);
    const flangeBottom = ctx.createLinearGradient(0, h - FLANGE, 0, h);
    flangeBottom.addColorStop(0, p.metalDark);
    flangeBottom.addColorStop(0.4, p.metal);
    flangeBottom.addColorStop(1, p.metalDark);
    Object.assign(g, { shade, glint, rail, flangeTop, flangeBottom });
  };

  const penTheta = () =>
    Math.asin(clamp(2 * latest.current.penAt - 1, -0.95, 0.95));
  const penX = () => {
    const g = geo.current;
    return g.w / 2 + (g.w / 2) * Math.sin(penTheta());
  };

  /** Where the readout sits, as an angle on the drum, or null when hidden. */
  const readoutTheta = (): number | null => {
    const lk = look.current;
    const g = geo.current;
    const R = g.w / 2;
    const tp = penTheta();
    const floor = -Math.PI / 2 + 0.14;
    if (lk.key) {
      return Math.max(
        floor,
        tp - (lk.ago * Math.max(1, latest.current.paperSpeed)) / R,
      );
    }
    if (lk.x === null) return null;
    const th = Math.asin(clamp((lk.x - R) / R, -1, 1));
    return clamp(th, floor, tp);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const g = geo.current;
    const p = palette.current;
    const buf = ink.current;
    const s = sim.current;
    const L = latest.current;
    if (!canvas || !ctx || !p || !buf || g.w < 2 || !g.shade) return;
    const { w, h } = g;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const R = w / 2;
    const cx = R;
    const y0 = FLANGE;
    const y1 = h - FLANGE;
    const ph = y1 - y0;
    const cell = ph / 10;
    const pad = cell;
    const yOf = (u: number) => y1 - pad - u * (ph - 2 * pad);
    const tp = penTheta();
    const xp = cx + R * Math.sin(tp);
    const P = s.paper;
    const xAt = (pos: number) => cx + R * Math.sin(tp - (P - pos) / R);
    const pMin = P - R * (tp + Math.PI / 2);
    const pMax = P + R * (Math.PI / 2 - tp);

    // Paper.
    ctx.fillStyle = p.paper;
    ctx.fillRect(0, y0, w, ph);

    // Grid: vertical lines travel with the paper, horizontal ones are fixed.
    const style = L.gridStyle;
    const kFrom = Math.ceil(pMin / cell);
    const kTo = Math.floor(pMax / cell);
    const spacingOk = (x: number) => {
      const c = Math.cos(Math.asin(clamp((x - cx) / R, -1, 1)));
      return cell * c > 2.4;
    };
    if (style === "graph" || style === "ruled") {
      for (const major of [false, true]) {
        ctx.beginPath();
        if (style === "graph") {
          for (let k = kFrom; k <= kTo; k += 1) {
            if ((k % 5 === 0) !== major) continue;
            const x = xAt(k * cell);
            if (!spacingOk(x)) continue;
            ctx.moveTo(Math.round(x * 2) / 2, y0);
            ctx.lineTo(Math.round(x * 2) / 2, y1);
          }
        }
        for (let j = 1; j < 10; j += 1) {
          if ((j % 5 === 0) !== major) continue;
          const y = Math.round((y0 + j * cell) * 2) / 2;
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.strokeStyle = alpha(
          p.grid,
          major ? 0.78 : style === "ruled" ? 0.5 : 0.36,
        );
        ctx.lineWidth = major ? 1 : 0.7;
        ctx.stroke();
      }
    } else if (style === "dots") {
      ctx.fillStyle = alpha(p.grid, 0.8);
      for (let k = kFrom; k <= kTo; k += 1) {
        const x = xAt(k * cell);
        if (!spacingOk(x)) continue;
        for (let j = 1; j < 10; j += 1) {
          const big = k % 5 === 0 && j % 5 === 0;
          const r = big ? 1.5 : 0.85;
          ctx.fillRect(x - r / 2, y0 + j * cell - r / 2, r, r);
        }
      }
    }
    // Time ticks along the bottom edge, on every paper.
    ctx.beginPath();
    for (let k = kFrom; k <= kTo; k += 1) {
      const x = xAt(k * cell);
      if (!spacingOk(x)) continue;
      const len = k % 5 === 0 ? cell * 0.55 : cell * 0.25;
      if (style !== "graph" || k % 5 === 0) {
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y1 - len);
      }
    }
    ctx.strokeStyle = alpha(p.grid, 0.85);
    ctx.lineWidth = 0.9;
    ctx.stroke();
    if (style === "plain") {
      ctx.beginPath();
      ctx.moveTo(0, y0 + 5 * cell);
      ctx.lineTo(w, y0 + 5 * cell);
      ctx.strokeStyle = alpha(p.grid, 0.4);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // The pen's shadow sits on the paper, under the light.
    const yPen = yOf(s.u);
    const lift = Math.max(0, s.lift);
    ctx.fillStyle = alpha(p.shade, 0.26 - lift * 0.1);
    ctx.beginPath();
    ctx.ellipse(
      xp + 1.5 + lift * 3.5,
      yPen + 1.5 + lift * 4,
      2.6 + lift * 2.4,
      2.2 + lift * 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // The ink.
    const kStart = Math.max(s.firstK, Math.ceil(pMin));
    const kEnd = s.lastK;
    const lw = Math.max(0.6, L.lineWidth);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = lw;
    let cur = -2;
    let open = false;
    const flush = () => {
      if (open) ctx.stroke();
      open = false;
    };
    for (let k = kStart; k <= kEnd; k += 1) {
      const i = k & MASK;
      const sid = buf.sid[i] ?? -1;
      if (sid < 0) {
        flush();
        cur = -2;
        continue;
      }
      const x = xAt(k);
      const y = yOf(buf.u[i] ?? 0);
      if (sid !== cur) {
        flush();
        cur = sid;
        ctx.strokeStyle = p.inks[sid] ?? p.inks[0] ?? "black";
        ctx.beginPath();
        ctx.moveTo(x, y);
        open = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    flush();

    // Blots where the pen came down, spreading into the paper.
    for (let k = kStart; k <= kEnd; k += 1) {
      const i = k & MASK;
      if (!buf.blot[i]) continue;
      const sid = buf.sid[i] ?? -1;
      if (sid < 0) continue;
      const age = Math.max(0, s.clock - (buf.born[i] ?? 0));
      const grow = L.motionSafe ? 1 - Math.exp(-age / 0.25) : 1;
      ctx.fillStyle = p.inks[sid] ?? "black";
      ctx.beginPath();
      ctx.arc(
        xAt(k),
        yOf(buf.u[i] ?? 0),
        lw * (0.7 + 0.95 * grow),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Wet ink: the last second of line carries a gloss that dries.
    if (L.motionSafe) {
      ctx.lineWidth = Math.max(0.5, lw * 0.4);
      for (let band = 0; band < 4; band += 1) {
        const ageLo = band * 0.3;
        const ageHi = ageLo + 0.3;
        ctx.beginPath();
        let started = false;
        for (let k = kEnd; k >= kStart; k -= 1) {
          const i = k & MASK;
          const age = s.clock - (buf.born[i] ?? 0);
          if (age > ageHi) break;
          const sid = buf.sid[i] ?? -1;
          if (age < ageLo || sid < 0) {
            started = false;
            continue;
          }
          const x = xAt(k) - lw * 0.15;
          const y = yOf(buf.u[i] ?? 0) - lw * 0.22;
          if (!started) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          started = true;
        }
        ctx.strokeStyle = `rgb(255 255 255 / ${r2(0.42 * (1 - band / 4))})`;
        ctx.stroke();
      }
    }

    // Flanges, with knurl marks turning with the drum.
    ctx.fillStyle = g.flangeTop ?? p.metal;
    ctx.fillRect(0, 0, w, FLANGE);
    ctx.fillStyle = g.flangeBottom ?? p.metal;
    ctx.fillRect(0, h - FLANGE, w, FLANGE);
    ctx.beginPath();
    const knurl = 14;
    for (
      let k = Math.ceil(pMin / knurl);
      k <= Math.floor(pMax / knurl);
      k += 1
    ) {
      const x = xAt(k * knurl);
      if (!spacingOk(x)) continue;
      ctx.moveTo(x, 1.5);
      ctx.lineTo(x, FLANGE - 1.5);
      ctx.moveTo(x, h - FLANGE + 1.5);
      ctx.lineTo(x, h - 1.5);
    }
    ctx.strokeStyle = alpha(p.metalDark, 0.55);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = alpha(p.shade, 0.35);
    ctx.fillRect(0, y0, w, 0.8);
    ctx.fillRect(0, y1 - 0.8, w, 0.8);

    // The cylinder's light and shade over all of it.
    ctx.fillStyle = g.shade;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = g.glint ?? "transparent";
    ctx.fillRect(0, y0, w, ph);

    // The readout: a hairline through the paper and a dot on the ink.
    const th = readoutTheta();
    let report: DrumPlotterReadout | null = null;
    let chipText = "";
    let chipX = 0;
    let chipY = 0;
    if (th !== null) {
      const x = cx + R * Math.sin(th);
      const pos = P - R * (tp - th);
      const k = Math.min(s.lastK, Math.round(pos));
      const i = k & MASK;
      const valid = k >= s.firstK && k <= s.lastK;
      const sid = valid ? (buf.sid[i] ?? -1) : -1;
      ctx.strokeStyle = alpha(p.shade, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, y0);
      ctx.lineTo(Math.round(x) + 0.5, y1);
      ctx.stroke();
      const ago = Math.max(0, (P - pos) / Math.max(1, L.paperSpeed));
      if (sid >= 0) {
        const u = buf.u[i] ?? 0;
        const y = yOf(u);
        ctx.fillStyle = "rgb(255 255 255 / 0.9)";
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.inks[sid] ?? "black";
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        const sr = L.list[sid];
        const rg = L.ranges[sid] ?? { min: 0, max: 1 };
        const v = rg.min + clamp(u, 0, 1) * (rg.max - rg.min);
        const dec = sr?.decimals ?? 1;
        chipText = `${format(v, dec)}${sr?.unit ? ` ${sr.unit}` : ""} · ${ago < 0.05 ? "now" : `${ago.toFixed(1)} s ago`}`;
        chipX = x;
        chipY = y;
        report = {
          series: sr?.id ?? "",
          value: Number(v.toFixed(dec)),
          secondsAgo: Number(ago.toFixed(1)),
        };
      } else {
        chipText =
          ago < 0.05 ? "pen lifted" : `no ink · ${ago.toFixed(1)} s ago`;
        chipX = x;
        chipY = y0 + ph / 2;
      }
    }

    // Rail, carriage and pen, in front of the drum.
    const railX = xp + 14;
    ctx.fillStyle = g.rail ?? p.metal;
    ctx.fillRect(railX - 1.5, 0, 3, h);
    const yTip = yPen - lift * 3.2;
    const xTip = xp - lift * 1.4;
    const sq = s.lift < 0 ? Math.min(1, -s.lift * 6) : 0;
    ctx.fillStyle = p.metal;
    ctx.strokeStyle = alpha(p.shade, 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(railX - 5, yTip - 8.5, 10, 17, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = p.metalDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(railX - 5, yTip);
    ctx.lineTo(xTip + 3.5, yTip);
    ctx.stroke();
    const penInk = p.inks[s.sid] ?? p.inks[0] ?? "black";
    ctx.fillStyle = penInk;
    ctx.strokeStyle = alpha(p.shade, 0.6);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(xTip + 1.5, yTip - 10 - lift * 1.5, 6, 9, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgb(255 255 255 / 0.45)";
    ctx.fillRect(xTip + 2.6, yTip - 9 - lift * 1.5, 1.2, 6);
    ctx.fillStyle = p.metalDark;
    ctx.beginPath();
    ctx.moveTo(xTip + 1.5, yTip - 1.5);
    ctx.lineTo(xTip + 4.5, yTip - 1.5);
    ctx.lineTo(xTip, yTip + 0.6 + sq * 0.6);
    ctx.closePath();
    ctx.fill();

    // DOM text: the chip and the live value, written only when they change.
    const chip = chipRef.current;
    if (chip) {
      if (chipText !== shownText.current.chip) {
        chip.textContent = chipText;
        chip.style.opacity = chipText ? "1" : "0";
        shownText.current.chip = chipText;
      }
      if (chipText) {
        const est = chipText.length * 6.6 + 14;
        const cxp = clamp(chipX, est / 2 + 4, w - est / 2 - 4);
        const above = chipY - 30 > 2;
        const cy = above ? chipY - 28 : chipY + 10;
        chip.style.transform = `translate(${r2(cxp)}px, ${r2(cy)}px) translateX(-50%)`;
      }
    }
    const live = liveRef.current;
    if (live) {
      // The chip belongs to the series asked for; while the pen is still
      // changing over, it has no reading of that series yet.
      const sr = L.list[s.pending];
      const rg = L.ranges[s.pending] ?? { min: 0, max: 1 };
      const text =
        s.sid !== s.pending
          ? "–"
          : L.reading !== undefined
            ? format(L.reading, sr?.decimals ?? 1)
            : format(
                rg.min + clamp(s.u, 0, 1) * (rg.max - rg.min),
                sr?.decimals ?? 1,
              );
      if (text !== shownLive.current) {
        live.textContent = text;
        shownLive.current = text;
      }
    }

    const key = report
      ? `${report.series}|${report.value}|${report.secondsAgo}`
      : "";
    if (key !== lastReport.current) {
      lastReport.current = key;
      L.onReadout?.(report);
    }
  };

  /* ------------------------------ the loop ------------------------------- */

  const tick = (now: number) => {
    frame.current = 0;
    const L = latest.current;
    if (!visible.current || document.hidden || L.paused || !L.motionSafe) {
      last.current = 0;
      draw();
      return;
    }
    const dt = last.current
      ? Math.min(1 / 20, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    advance(dt, false);
    draw();
    frame.current = window.requestAnimationFrame(tick);
  };

  /** Starts whatever should run now: the frame loop, the one-second step, or one frame. */
  const run = () => {
    const L = latest.current;
    const live = visible.current && !document.hidden && !L.paused;
    if (stepTimer.current !== null && (!live || L.motionSafe)) {
      window.clearTimeout(stepTimer.current);
      stepTimer.current = null;
    }
    if (live && L.motionSafe) {
      if (!frame.current) frame.current = window.requestAnimationFrame(tick);
      return;
    }
    if (live && !L.motionSafe && stepTimer.current === null) {
      const step = () => {
        stepTimer.current = window.setTimeout(() => {
          advance(1, true);
          draw();
          step();
        }, 1000);
      };
      step();
    }
    if (!frame.current) frame.current = window.requestAnimationFrame(tick);
  };

  /** One frame now (pointer, key, theme) when the loop is not running. */
  const redraw = () => {
    if (!frame.current) frame.current = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const drum = drumRef.current;
    const canvas = canvasRef.current;
    if (!drum || !canvas) return;
    const w = drum.clientWidth;
    const h = drum.clientHeight;
    if (w < 2 || h < 2) return;
    const ratio = clamp(
      Math.min(latest.current.dpr, window.devicePixelRatio || 1),
      1,
      2,
    );
    const g = geo.current;
    const span = (w / 2) * (penTheta() + Math.PI / 2 - 0.14);
    setMaxAgo(
      Math.max(
        1,
        Math.floor((span / Math.max(1, latest.current.paperSpeed)) * 2) / 2,
      ),
    );
    if (g.w === w && g.h === h && g.dpr === ratio) return;
    g.w = w;
    g.h = h;
    g.dpr = ratio;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    if (!palette.current) palette.current = readPalette();
    buildGradients();
    if (!ink.current) {
      ink.current = {
        u: new Float32Array(SLOTS),
        sid: new Int8Array(SLOTS).fill(-1),
        born: new Float32Array(SLOTS),
        blot: new Uint8Array(SLOTS),
      };
    }
    if (!prefilled.current) {
      prefilled.current = true;
      prefill();
    }
    rootRef.current?.setAttribute("data-painted", "");
    redraw();
  };

  const repaint = () => {
    palette.current = readPalette();
    buildGradients();
    redraw();
  };

  const api = React.useRef({ run, resize, repaint, redraw });
  React.useEffect(() => {
    api.current = { run, resize, repaint, redraw };
  });

  // A series asked for — by the legend or by the host — lifts the pen.
  React.useEffect(() => {
    sim.current.pending = activeIndex;
    api.current.run();
  }, [activeIndex]);

  // Speed, paper, pen and ink changes reach the next frame; a paused or
  // stepping drum draws once to show them.
  React.useEffect(() => {
    api.current.resize();
    api.current.repaint();
    api.current.run();
  }, [paused, motionSafe, gridStyle, penAt, inks, lineWidth, paperSpeed, dpr]);

  React.useEffect(() => {
    const onVisibility = () => api.current.run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const raf = frame;
    const timer = stepTimer;
    return () => {
      if (raf.current) window.cancelAnimationFrame(raf.current);
      raf.current = 0;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  // Size and visibility, bound to the drum when it arrives.
  const bindDrum = React.useCallback((node: HTMLDivElement | null) => {
    drumRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      api.current.run();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  /* ---------------------------- interaction ----------------------------- */

  const pick = (index: number) => {
    const s = list[index];
    if (!s || disabled) return;
    if (value === undefined) setOwn(s.id);
    onValueChange?.(s.id);
  };

  const onRadioKey = (event: React.KeyboardEvent, index: number) => {
    const n = list.length;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % n;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + n) % n;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    if (next < 0) return;
    event.preventDefault();
    const s = list[next];
    if (!s) return;
    radioRefs.current.get(s.id)?.focus();
    pick(next);
  };

  /** The keyboard readout's sentence, frozen at the key press that moved it. */
  const sentence = (ago: number): string => {
    const g = geo.current;
    const buf = ink.current;
    const s = sim.current;
    if (!buf || g.w < 2) return "";
    const R = g.w / 2;
    const pos = s.paper - ago * Math.max(1, paperSpeed);
    const k = Math.min(s.lastK, Math.round(pos));
    const i = k & MASK;
    const sid = k >= s.firstK && k <= s.lastK ? (buf.sid[i] ?? -1) : -1;
    const when = ago < 0.05 ? "now" : `${ago.toFixed(1)} seconds ago`;
    if (sid < 0 || R <= 0) return `No ink, ${when}`;
    const sr = list[sid];
    const rg = ranges[sid] ?? { min: 0, max: 1 };
    const v = rg.min + clamp(buf.u[i] ?? 0, 0, 1) * (rg.max - rg.min);
    return `${sr?.label ?? ""} ${format(v, sr?.decimals ?? 1)}${sr?.unit ? ` ${sr.unit}` : ""}, ${when}`;
  };

  const moveKey = (ago: number) => {
    const next = clamp(Math.round(ago * 10) / 10, 0, maxAgo);
    look.current.key = true;
    look.current.ago = next;
    setKeyAgo({ ago: next, text: sentence(next) });
    redraw();
  };

  const onSliderKey = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const a = look.current.ago;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = a + 0.5;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = a - 0.5;
    else if (event.key === "PageUp") next = a + 5;
    else if (event.key === "PageDown") next = a - 5;
    else if (event.key === "Home") next = maxAgo;
    else if (event.key === "End") next = 0;
    else if (event.key === "Escape" && look.current.key) {
      event.preventDefault();
      look.current.key = false;
      redraw();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    moveKey(next);
  };

  const localX = (clientX: number) => {
    const rect = drumRef.current?.getBoundingClientRect();
    return rect ? clientX - rect.left : null;
  };

  const lo = ranges[activeIndex] ?? { min: 0, max: 1 };
  const dec = active?.decimals ?? 1;
  const initialLive =
    reading !== undefined
      ? format(reading, dec)
      : format(active?.samples?.[0] ?? lo.min, dec);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      className={cn(
        "group/drum-plotter relative flex h-56 w-full flex-col gap-2 text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      {legend ? (
        <div className="flex shrink-0">
          <div
            role="radiogroup"
            aria-label="Series"
            className="flex flex-wrap items-center gap-1"
          >
            {list.map((s, i) => {
              const on = i === activeIndex;
              return (
                <button
                  key={s.id}
                  ref={(node) => {
                    if (node) radioRefs.current.set(s.id, node);
                    else radioRefs.current.delete(s.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${s.label}, ${inks[i]?.name ?? ""} ink`}
                  tabIndex={on ? 0 : -1}
                  disabled={disabled}
                  onClick={() => pick(i)}
                  onKeyDown={(event) => onRadioKey(event, i)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors select-none",
                    FOCUS_RING,
                    on
                      ? "border-hairline-strong bg-surface-2 text-foreground"
                      : "border-transparent text-ink-3 enabled:hover:text-ink-2",
                    disabled && "cursor-not-allowed",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: inks[i]?.css }}
                  />
                  {s.label}
                  {on ? (
                    <span
                      aria-hidden
                      className="inline-flex items-baseline gap-0.5 font-mono text-[10px] text-ink-2 tabular-nums"
                    >
                      <span
                        ref={bindLive}
                        className="inline-block min-w-[4ch] text-right text-foreground"
                      >
                        {initialLive}
                      </span>
                      {s.unit ?? ""}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="relative flex flex-1 basis-0 gap-1.5 overflow-hidden rounded-3 border border-hairline-strong bg-surface-2 p-1.5 shadow-[inset_0_1px_2px_color-mix(in_oklab,black_10%,transparent)]">
        <div
          ref={bindDrum}
          className="relative min-w-0 flex-1 overflow-clip rounded-2 [contain:paint]"
        >
          {/* The drum before the canvas paints: paper, flanges and shade. */}
          <div
            aria-hidden
            className="absolute inset-0 group-data-painted/drum-plotter:hidden"
            style={{
              backgroundColor: PAPER,
              backgroundImage: `linear-gradient(to right, color-mix(in oklab, ${SHADE} 62%, transparent), color-mix(in oklab, ${SHADE} 14%, transparent) 12%, transparent 30%, transparent 70%, color-mix(in oklab, ${SHADE} 20%, transparent) 90%, color-mix(in oklab, ${SHADE} 62%, transparent)), linear-gradient(to bottom, ${METAL_DARK} 0 ${FLANGE}px, transparent ${FLANGE}px calc(100% - ${FLANGE}px), ${METAL_DARK} calc(100% - ${FLANGE}px))`,
            }}
          />
          <canvas
            ref={canvasRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
          />
          <span
            ref={chipRef}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 z-20 rounded-1 border border-hairline-strong bg-popover px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-popover-foreground tabular-nums opacity-0 shadow-[0_2px_8px_color-mix(in_oklab,black_16%,transparent)]"
          />
          <div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={`${active?.label ?? "Trace"} trace`}
            aria-disabled={disabled || undefined}
            aria-valuemin={0}
            aria-valuemax={maxAgo}
            aria-valuenow={keyAgo.ago}
            aria-valuetext={keyAgo.text || "Readout at the pen"}
            aria-describedby={`${uid}-hint`}
            onKeyDown={onSliderKey}
            onFocus={() => {
              if (disabled) return;
              look.current.key = true;
              setKeyAgo({
                ago: look.current.ago,
                text: sentence(look.current.ago),
              });
              redraw();
            }}
            onBlur={() => {
              look.current.key = false;
              redraw();
            }}
            onPointerMove={(event) => {
              if (disabled) return;
              look.current.x = localX(event.clientX);
              redraw();
            }}
            onPointerDown={(event) => {
              if (disabled) return;
              look.current.x = localX(event.clientX);
              redraw();
            }}
            onPointerLeave={() => {
              look.current.x = null;
              redraw();
            }}
            onPointerUp={(event) => {
              if (event.pointerType !== "mouse") {
                look.current.x = null;
                redraw();
              }
            }}
            onPointerCancel={() => {
              look.current.x = null;
              redraw();
            }}
            className={cn(
              "absolute inset-0 z-10 touch-pan-y rounded-2",
              "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled ? "cursor-not-allowed" : "cursor-crosshair",
            )}
          />
        </div>
        {scale ? (
          <div
            aria-hidden
            className="relative w-8 shrink-0 font-mono text-[9px] leading-none text-ink-3 tabular-nums"
          >
            <span className="absolute top-0 left-0 text-[8px] tracking-[0.04em] uppercase">
              {active?.unit ?? ""}
            </span>
            {[0.1, 0.5, 0.9].map((f, j) => (
              <span
                key={f}
                className="absolute left-0 flex -translate-y-1/2 items-center gap-1"
                style={{
                  top: `calc(${FLANGE}px + (100% - ${FLANGE * 2}px) * ${f})`,
                }}
              >
                <span className="h-px w-1.5 bg-hairline-strong" />
                {format(
                  j === 0 ? lo.max : j === 1 ? (lo.min + lo.max) / 2 : lo.min,
                  dec,
                )}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Colour carriers: tokens resolved on this element, re-read on a theme change. */}
      <span
        ref={paletteRef}
        aria-hidden
        onTransitionEnd={() => api.current.repaint()}
        className="pointer-events-none absolute size-0 overflow-hidden opacity-0"
      >
        {(
          [
            ["paper", PAPER],
            ["grid", GRID],
            ["metal", METAL],
            ["metal-dark", METAL_DARK],
            ["shade", SHADE],
            ...inks.map((k, i) => [`ink-${i}`, k.css] as const),
          ] as const
        ).map(([key, colour]) => (
          <span
            key={key}
            data-key={key}
            className="transition-colors duration-1"
            style={{ color: colour }}
          />
        ))}
      </span>

      <p id={`${uid}-hint`} className="sr-only">
        Move over the drum, or use the arrow keys, to read the trace. Page Up
        and Page Down move five seconds, Home the oldest ink, End the pen.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
