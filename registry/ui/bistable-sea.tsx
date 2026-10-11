"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BistableSeaDither = "floyd" | "atkinson";

export type BistableSeaProps = {
  /** Partial refreshes a second, 0.25 to 3: how often the sea steps on. @default 1 */
  refresh?: number;
  /** How much of each old frame a refresh leaves behind, 0 (clean) to 1 (heavy ghosts). @default 0.5 */
  ghosting?: number;
  /** How big the swell runs, 0 (glassy) to 1 (heavy). @default 0.55 */
  swell?: number;
  /** Controlled bearing the display faces, in degrees: 0 north, 90 east. */
  value?: number;
  /** Initial bearing when uncontrolled. @default 200 */
  defaultValue?: number;
  /** Fires from the drag or key that turned the display, with the new bearing. */
  onValueChange?: (bearing: number) => void;
  /** Fires as each refresh lands on the panel. */
  onRefresh?: (kind: "partial" | "full") => void;
  /** Partial refreshes between full ones, which flash and clear every ghost; 0 never. @default 6 */
  fullEvery?: number;
  /** How many bands a partial refresh rolls down the panel in, 3 to 16. @default 8 */
  bands?: number;
  /** The error-diffusion kernel: smooth Floyd–Steinberg or crisp, lighter Atkinson. @default "floyd" */
  dither?: BistableSeaDither;
  /** CSS px per e-paper pixel, 1 to 4. @default 2 */
  dot?: number;
  /** Wind chop on top of the swell, 0 to 1. @default 0.35 */
  chop?: number;
  /** How far the device tilts toward the pointer, 0 to 1. @default 0.6 */
  tilt?: number;
  /** Show the readout strip at the top of the paper. @default true */
  caption?: boolean;
  /** The paper's colour, any CSS colour. @default a warm light grey */
  paperColor?: string;
  /** The ink's colour, any CSS colour. @default a soft black */
  inkColor?: string;
  /** The display's accessible name. @default "Swell display" */
  label?: string;
  /** The pointer tilts and turns the display. Keys still turn it. @default true */
  interactive?: boolean;
  /** Stop refreshing: the panel keeps its last frame. @default false */
  paused?: boolean;
  /** Seeds the sea's phases and the clouds. @default 4 */
  seed?: number;
  /** The display stops answering (it stays focusable and says so). @default false */
  disabled?: boolean;
  /** Sizes the device; its height follows from a 3:2 aspect. @default "w-72" */
  className?: string;
};

const PAPER = "oklch(from var(--warn) 0.93 0.012 h)";
const INK = "oklch(from var(--ink-3) 0.24 0.012 h)";

const POINTS = [
  ["N", "north"],
  ["NNE", "north-northeast"],
  ["NE", "northeast"],
  ["ENE", "east-northeast"],
  ["E", "east"],
  ["ESE", "east-southeast"],
  ["SE", "southeast"],
  ["SSE", "south-southeast"],
  ["S", "south"],
  ["SSW", "south-southwest"],
  ["SW", "southwest"],
  ["WSW", "west-southwest"],
  ["W", "west"],
  ["WNW", "west-northwest"],
  ["NW", "northwest"],
  ["NNW", "north-northwest"],
] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const wrap = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;
const r2 = (v: number) => Math.round(v * 100) / 100;
const point = (deg: number) =>
  POINTS[Math.round(wrap(deg) / 22.5) % 16] ?? POINTS[0];
const swellMetres = (swell: number) =>
  (0.4 + 2.8 * clamp(swell, 0, 1)).toFixed(1);

function hash(seed: number, i: number): number {
  let h =
    Math.imul((seed | 0) + 0x3c6ef372, 374761393) ^ Math.imul(i + 1, 668265263);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const lattice = (seed: number, a: number, b: number) =>
  hash(seed, (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0);

function noise2(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = lattice(seed, ix, iy);
  const b = lattice(seed, ix + 1, iy);
  const c = lattice(seed, ix, iy + 1);
  const d = lattice(seed, ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ── the sea, rendered to luminance at e-paper resolution ──

type Scene = {
  heading: number;
  pitch: number;
  swell: number;
  chop: number;
  seed: number;
  time: number;
};

/**
 * Wave trains in the world: the bearing they travel toward, their length in
 * units of the eye's height above the water, and their share of the height.
 * The swell runs in from the southwest; the chop rides across it.
 */
const TRAINS = [
  { bearing: 45, length: 5.2, height: 1, chop: false },
  { bearing: 70, length: 3.1, height: 0.5, chop: false },
  { bearing: 15, length: 1.15, height: 0.16, chop: true },
  { bearing: 115, length: 0.72, height: 0.1, chop: true },
];
const SUN_BEARING = 222;
const SUN_ELEVATION = 0.12;

function renderSea(out: Float32Array, cols: number, rows: number, s: Scene) {
  const head = (s.heading * Math.PI) / 180;
  const horizon = rows * (0.34 - s.pitch * 0.1);
  const f = cols / (2 * Math.tan(0.62));
  const cx = cols / 2;
  // The sun is fixed in the world; turning moves it across the sky.
  let az = ((SUN_BEARING - s.heading + 540) % 360) - 180;
  az = (az * Math.PI) / 180;
  const sunVis = Math.abs(az) < 1.3;
  const sunX = cx + f * Math.tan(clamp(az, -1.3, 1.3));
  const sunY = horizon - f * Math.tan(SUN_ELEVATION);
  const sunR = Math.max(2, f * 0.05);
  // A low sun rakes the water from its side even when it is out of view.
  const sd = {
    x: Math.sin(az) * Math.cos(SUN_ELEVATION),
    y: Math.sin(SUN_ELEVATION),
    z: Math.cos(az) * Math.cos(SUN_ELEVATION),
  };
  const amp = 0.04 + 0.16 * clamp(s.swell, 0, 1);
  const chopAmp = 0.3 + 1.2 * clamp(s.chop, 0, 1);
  const trains = TRAINS.map((t, i) => {
    const rel = ((t.bearing - s.heading) * Math.PI) / 180;
    const k = (Math.PI * 2) / t.length;
    return {
      dx: Math.sin(rel),
      dz: Math.cos(rel),
      k,
      a: amp * t.height * (t.chop ? chopAmp : 1) * Math.sqrt(t.length / 5.2),
      w: Math.sqrt(9.8 * k) * 0.55,
      p: hash(s.seed, i + 3) * Math.PI * 2,
    };
  });
  let total = 0;
  for (const t of trains) total += t.a;
  for (let y = 0; y < rows; y += 1) {
    const dy = y + 0.5 - horizon;
    for (let x = 0; x < cols; x += 1) {
      let L: number;
      if (dy < 0.5) {
        // Sky: pale at the horizon, a little deeper overhead, cloud bands.
        const e = Math.max(0, -dy) / f;
        L = 0.95 - 0.3 * Math.pow(Math.min(1, e / 0.5), 0.8);
        const worldAz = (x - cx) / f + head;
        const cloud = noise2(worldAz * 2.2, e * 9, s.seed);
        const streak = noise2(worldAz * 0.9 + 7, e * 26, s.seed + 9);
        if (cloud > 0.55) L -= (cloud - 0.55) * 0.9 * (0.5 + streak);
        if (sunVis) {
          const d = Math.hypot(x + 0.5 - sunX, y + 0.5 - sunY);
          if (d < sunR) L = 1;
          else L += 0.22 * Math.exp(-(d - sunR) / (sunR * 2.2));
        }
      } else {
        // Sea: where the ray through this pixel meets the water.
        const z = f / dy;
        const xw = ((x + 0.5 - cx) * z) / f;
        let h = 0;
        let hx = 0;
        let hz = 0;
        for (const t of trains) {
          const ph = t.k * (t.dx * xw + t.dz * z) - t.w * s.time + t.p;
          const sn = Math.sin(ph);
          const cs = Math.cos(ph);
          h += t.a * sn;
          hx += t.a * t.k * t.dx * cs;
          hz += t.a * t.k * t.dz * cs;
        }
        let nx = -hx;
        let ny = 1;
        let nz = -hz;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const vl = Math.hypot(xw, 1, z);
        const vx = xw / vl;
        const vy = -1 / vl;
        const vz = z / vl;
        const vn = vx * nx + vy * ny + vz * nz;
        const rx = vx - 2 * vn * nx;
        const ry = vy - 2 * vn * ny;
        const rz = vz - 2 * vn * nz;
        const fres = 0.02 + 0.98 * Math.pow(1 + Math.min(0, vn), 5);
        const skyL = 0.92 - 0.3 * Math.min(1, Math.max(0, ry) / 0.5);
        // Faces turned to the sun catch it; the backs of the waves go dark.
        const facing = nx * sd.x + ny * sd.y + nz * sd.z;
        L = 0.24 + fres * skyL * 0.55 + clamp(facing * 2.8, -0.26, 0.46);
        L += 0.18 * (h / Math.max(1e-3, total));
        if (sunVis) {
          const sp = Math.max(0, rx * sd.x + ry * sd.y + rz * sd.z);
          L += Math.pow(sp, 220) * 2.4;
        }
        // Foam where a crest stands tall and steep.
        if (total > 0 && h / total > 0.6 && Math.hypot(hx, hz) > 0.32)
          L = Math.max(L, 0.94);
        // Distance haze toward the horizon.
        const haze = clamp((z - 9) / 34, 0, 1);
        L = L + (0.86 - L) * haze * haze;
      }
      // E-paper has two states: push the midtones apart before dithering.
      out[y * cols + x] = clamp((L - 0.5) * 1.15 + 0.5, 0, 1);
    }
  }
}

/** Error diffusion to one bit; serpentine Floyd–Steinberg or Atkinson. */
function ditherTo(
  gray: Float32Array,
  work: Float32Array,
  bits: Uint8Array,
  cols: number,
  rows: number,
  kind: BistableSeaDither,
) {
  work.set(gray.subarray(0, cols * rows));
  for (let y = 0; y < rows; y += 1) {
    const ltr = kind === "atkinson" || y % 2 === 0;
    for (let i = 0; i < cols; i += 1) {
      const x = ltr ? i : cols - 1 - i;
      const at = y * cols + x;
      // A non-finite input would poison every pixel the error reaches.
      const raw = work[at] ?? 0;
      const old = Number.isFinite(raw) ? raw : 0.5;
      const bit = old >= 0.5 ? 1 : 0;
      bits[at] = bit;
      const err = old - bit;
      const put = (dx: number, dy: number, k: number) => {
        const nx = x + (ltr ? dx : -dx);
        const ny = y + dy;
        if (nx < 0 || nx >= cols || ny >= rows) return;
        const j = ny * cols + nx;
        work[j] = (work[j] ?? 0) + err * k;
      };
      if (kind === "atkinson") {
        const e = 1 / 8;
        put(1, 0, e);
        put(2, 0, e);
        put(-1, 1, e);
        put(0, 1, e);
        put(1, 1, e);
        put(0, 2, e);
      } else {
        put(1, 0, 7 / 16);
        put(-1, 1, 3 / 16);
        put(0, 1, 5 / 16);
        put(1, 1, 1 / 16);
      }
    }
  }
}

// ── the panel's driver ──

type Config = {
  refresh: number;
  ghosting: number;
  swell: number;
  chop: number;
  fullEvery: number;
  bands: number;
  dither: BistableSeaDither;
  dot: number;
  paused: boolean;
  seed: number;
  heading: number;
  motionSafe: boolean;
  colorKey: string;
};

type Panel = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  soon: () => void;
  dispose: () => void;
};

function createPanel(
  host: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  events: { current: { refresh: (kind: "partial" | "full") => void } },
): Panel {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let cols = 0;
  let rows = 0;
  let gray = new Float32Array(0);
  let work = new Float32Array(0);
  let target = new Uint8Array(0);
  let shown = new Float32Array(0);
  let before = new Float32Array(0);
  let image: ImageData | null = null;
  let pixels: Uint32Array | null = null;
  const lut = new Uint32Array(256);
  let timer = 0;
  let dueAt = 0;
  let busy = false;
  let pending = false;
  let partials = 0;
  let time = 0;
  let disposed = false;
  let drawnHeading = NaN;
  let firstFrame = true;
  const reader = document.createElement("canvas");
  reader.width = 1;
  reader.height = 1;
  const readCtx = reader.getContext("2d", { willReadFrequently: true });

  const rgb = (colour: string) => {
    if (!readCtx) return [0, 0, 0] as const;
    readCtx.clearRect(0, 0, 1, 1);
    readCtx.fillStyle = "rgb(0, 0, 0)";
    readCtx.fillStyle = colour;
    readCtx.fillRect(0, 0, 1, 1);
    const d = readCtx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] as const;
  };

  const readColours = () => {
    const kids = carriers.children;
    const paper = kids[0]
      ? rgb(getComputedStyle(kids[0]).color)
      : ([235, 232, 224] as const);
    const ink = kids[1]
      ? rgb(getComputedStyle(kids[1]).color)
      : ([40, 40, 44] as const);
    for (let i = 0; i < 256; i += 1) {
      const t = i / 255;
      const r = Math.round(ink[0] + (paper[0] - ink[0]) * t);
      const g = Math.round(ink[1] + (paper[1] - ink[1]) * t);
      const b = Math.round(ink[2] + (paper[2] - ink[2]) * t);
      // ImageData is RGBA in memory: little-endian 32-bit words read ABGR.
      lut[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
  };

  const put = () => {
    if (!ctx || !image || !pixels) return;
    const n = cols * rows;
    for (let i = 0; i < n; i += 1) {
      const v = shown[i] ?? 1;
      pixels[i] = lut[Math.round(clamp(v, 0, 1) * 255)] ?? 0;
    }
    ctx.putImageData(image, 0, 0);
  };

  const compose = () => {
    const c = cfg;
    if (!c || cols < 1) return;
    renderSea(gray, cols, rows, {
      heading: c.heading,
      pitch: 0,
      swell: c.swell,
      chop: c.chop,
      seed: Math.round(c.seed),
      time,
    });
    ditherTo(gray, work, target, cols, rows, c.dither);
    drawnHeading = c.heading;
  };

  // Real ghosts are faint: at most a quarter of the old state lingers.
  const residue = () => clamp(cfg?.ghosting ?? 0.5, 0, 1) * 0.26;

  const halt = () => {
    window.clearTimeout(timer);
    timer = 0;
    busy = false;
  };

  const running = () => {
    const c = cfg;
    return Boolean(
      c &&
      c.motionSafe &&
      !c.paused &&
      visible.current &&
      !document.hidden &&
      cols > 0,
    );
  };

  /** Lands the new frame clean: every ghost gone. */
  const clean = () => {
    for (let i = 0; i < cols * rows; i += 1) shown[i] = target[i] ?? 1;
  };

  /** One timer at a time; it forgets itself as it fires, so a stale id never blocks a wake. */
  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer);
    dueAt = performance.now() + ms;
    timer = window.setTimeout(() => {
      timer = 0;
      fn();
    }, ms);
  };
  const schedule = (ms: number) => later(update, ms);

  /** One refresh, partial or full, driven as the panel would drive it. */
  const update = () => {
    timer = 0;
    const c = cfg;
    if (disposed || !c || !running()) {
      busy = false;
      return;
    }
    busy = true;
    pending = false;
    time += 1 / clamp(c.refresh, 0.25, 3);
    compose();
    const full = c.fullEvery > 0 && partials >= c.fullEvery;
    const n = cols * rows;
    const done = (kind: "partial" | "full") => {
      busy = false;
      events.current.refresh(kind);
      if (!running()) return;
      schedule(
        pending
          ? 60
          : Math.round(1000 / clamp(c.refresh, 0.25, 3)) -
              (kind === "full" ? 300 : 280),
      );
    };
    if (full) {
      // Inverse, blank paper, then the clean frame: two flashes, no more.
      partials = 0;
      for (let i = 0; i < n; i += 1) shown[i] = 1 - (target[i] ?? 1);
      put();
      later(() => {
        shown.fill(1);
        put();
        later(() => {
          clean();
          put();
          done("full");
        }, 90);
      }, 120);
      return;
    }
    partials += 1;
    const count = Math.round(clamp(c.bands, 3, 16));
    const g = residue();
    let band = 0;
    const tick = () => {
      // Band `band` flips its changed pixels through their inverse; the band
      // before it lands, keeping a little of what it was.
      const land = band - 1;
      if (land >= 0) {
        const y0 = Math.floor((land * rows) / count);
        const y1 = Math.floor(((land + 1) * rows) / count);
        for (let i = y0 * cols; i < y1 * cols; i += 1) {
          const t = target[i] ?? 1;
          const was = before[i] ?? t;
          if (Math.round(was) !== t) shown[i] = t + (was - t) * g;
          else shown[i] = t + (was - t) * 0.86;
        }
      }
      if (band < count) {
        const y0 = Math.floor((band * rows) / count);
        const y1 = Math.floor(((band + 1) * rows) / count);
        for (let i = y0 * cols; i < y1 * cols; i += 1) {
          const t = target[i] ?? 1;
          const was = shown[i] ?? t;
          before[i] = was;
          if (Math.round(was) !== t) shown[i] = 1 - t;
        }
      }
      put();
      band += 1;
      if (band <= count) later(tick, 32);
      else done("partial");
    };
    tick();
  };

  /** Draws the panel once, for reduced motion, a pause or a first frame. */
  const still = () => {
    const c = cfg;
    if (!c || cols < 1) return;
    const g = firstFrame ? 0 : residue();
    for (let i = 0; i < cols * rows; i += 1) before[i] = shown[i] ?? 1;
    compose();
    for (let i = 0; i < cols * rows; i += 1) {
      const t = target[i] ?? 1;
      const was = before[i] ?? t;
      shown[i] =
        Math.round(was) !== t ? t + (was - t) * g : t + (was - t) * g * 0.5;
    }
    firstFrame = false;
    put();
    host.setAttribute("data-live", "");
  };

  const kick = (ms: number) => {
    if (!running()) return;
    if (busy) {
      pending = true;
      return;
    }
    // A refresh already due sooner stands: a moving hand never postpones it.
    if (timer && dueAt > performance.now() && dueAt <= performance.now() + ms)
      return;
    schedule(ms);
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const dot = clamp(c.dot, 1, 4);
    const nc = Math.max(8, Math.floor(host.clientWidth / dot));
    const nr = Math.max(6, Math.floor(host.clientHeight / dot));
    if (nc === cols && nr === rows) return;
    halt();
    cols = nc;
    rows = nr;
    canvas.width = cols;
    canvas.height = rows;
    canvas.style.width = `${cols * dot}px`;
    canvas.style.height = `${rows * dot}px`;
    gray = new Float32Array(cols * rows);
    work = new Float32Array(cols * rows);
    target = new Uint8Array(cols * rows);
    shown = new Float32Array(cols * rows).fill(1);
    before = new Float32Array(cols * rows).fill(1);
    image = ctx.createImageData(cols, rows);
    pixels = new Uint32Array(image.data.buffer);
    firstFrame = true;
    still();
    kick(Math.round(1000 / clamp(c.refresh, 0.25, 3)));
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        readColours();
        resize();
        return;
      }
      if (was.colorKey !== next.colorKey) {
        readColours();
        put();
      }
      if (was.dot !== next.dot) resize();
      const look =
        was.swell !== next.swell ||
        was.chop !== next.chop ||
        was.dither !== next.dither ||
        was.seed !== next.seed ||
        next.heading !== drawnHeading;
      if (!next.motionSafe || next.paused) {
        halt();
        if (look || was.motionSafe !== next.motionSafe) still();
        return;
      }
      // Input asks for a fast partial, as a reader does under a finger.
      if (look) kick(120);
      else if (!busy && !timer)
        kick(Math.round(1000 / clamp(next.refresh, 0.25, 3)));
    },
    resize,
    readColours() {
      readColours();
      put();
    },
    wake() {
      const c = cfg;
      if (!c) return;
      if (!running()) {
        halt();
        return;
      }
      if (!busy && !timer) kick(200);
    },
    soon() {
      kick(120);
    },
    dispose() {
      disposed = true;
      halt();
      host.removeAttribute("data-live");
    },
  };
}

/**
 * A slim e-paper display showing an open-sea swell under a low sun, rendered
 * at e-paper resolution as a real perspective ocean — four wave trains, sky
 * Fresnel, a sun-glitter path, foam on steep crests, cloud bands — and
 * error-diffused to pure ink and paper. It refreshes like e-paper rather than
 * video: each step of the sea rolls down the panel in bands, changed pixels
 * flipping through their inverse before they land and keeping a ghost of
 * what they were; every few partials a full refresh flashes inverse, blanks
 * and lands clean.
 *
 * The pointer tilts the device toward it on the glide spring with a sheen
 * across the glass and leans the view; a horizontal drag turns the bearing
 * 1:1, and the sea turns in rolling bands. The device is a slider: arrows
 * turn it 15° (Shift 45°), Page keys 45°, Home faces north, each turn kicking
 * the device into a small tilt that settles on glide. No animation loop: a
 * timer drives the refreshes. Under reduced motion one still frame, re-drawn
 * once per turn with the old frame's ghost left in it.
 */
export function BistableSea({
  refresh = 1,
  ghosting = 0.5,
  swell = 0.55,
  value,
  defaultValue = 200,
  onValueChange,
  onRefresh,
  fullEvery = 6,
  bands = 8,
  dither = "floyd",
  dot = 2,
  chop = 0.35,
  tilt = 0.6,
  caption = true,
  paperColor = PAPER,
  inkColor = INK,
  label = "Swell display",
  interactive = true,
  paused = false,
  seed = 4,
  disabled = false,
  className,
}: BistableSeaProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const [own, setOwn] = React.useState(() => wrap(defaultValue));
  const bearing = wrap(value ?? own);
  const [lean, setLean] = React.useState(0);
  const [shownBearing, setShownBearing] = React.useState(bearing);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const panel = React.useRef<Panel | null>(null);
  const visible = React.useRef(false);
  const dragFrom = React.useRef(0);
  const dragging = React.useRef(false);
  const live = !disabled;
  const heading = wrap(bearing + lean);

  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const kick = useMotionValue(0);
  const springX = useSpring(tiltX, springs.glide);
  const springY = useSpring(tiltY, springs.glide);
  const rotateY = useTransform([springY, kick], ([a, b]) =>
    r2((a as number) + (b as number)),
  );
  const rotateX = useTransform(springX, (v) => r2(v));
  const sheen = useTransform(rotateY, (v) => `${r2(50 - v * 6)}% 50%`);

  const config: Config = {
    refresh,
    ghosting,
    swell,
    chop,
    fullEvery: Math.max(0, Math.round(fullEvery)),
    bands,
    dither,
    dot,
    paused,
    seed,
    heading,
    motionSafe,
    colorKey: `${paperColor}|${inkColor}`,
  };
  const latest = React.useRef(config);
  const events = React.useRef({
    refresh: (kind: "partial" | "full") => {
      void kind;
    },
  });

  React.useLayoutEffect(() => {
    latest.current = config;
    events.current = {
      refresh: (kind) => {
        // The readout is part of the paper: it changes when the top band lands.
        setShownBearing(latest.current.heading);
        onRefresh?.(kind);
      },
    };
  });

  React.useEffect(() => {
    panel.current?.configure(latest.current);
  });

  React.useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!host || !canvas || !carriers) return;
    const p = createPanel(host, canvas, carriers, visible, events);
    panel.current = p;
    p.configure(latest.current);
    return () => {
      p.dispose();
      if (panel.current === p) panel.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => panel.current?.wake();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindHost = React.useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => panel.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      panel.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const commit = (next: number) => {
    const v = wrap(next);
    if (v === bearing) return;
    if (value === undefined) setOwn(v);
    onValueChange?.(v);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: !live || !interactive,
    onStart: () => {
      dragging.current = true;
      dragFrom.current = bearing;
      setLean(0);
    },
    onMove: ({ offset }) => {
      // 1:1 under the finger: 0.6° of bearing for every pixel dragged.
      commit(dragFrom.current - offset.x * 0.6);
    },
    onEnd: () => {
      dragging.current = false;
    },
    onCancel: () => {
      dragging.current = false;
    },
  });

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (!live || !interactive || event.pointerType === "touch") return;
    const r = event.currentTarget.getBoundingClientRect();
    const nx = clamp(((event.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const ny = clamp(((event.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    const k = clamp(tilt, 0, 1);
    if (motionSafe) {
      tiltY.set(r2(nx * 9 * k));
      tiltX.set(r2(-ny * 7 * k));
    }
    if (!dragging.current) {
      const next = Math.round(nx * 25 * k);
      if (next !== lean) setLean(next);
    }
  };

  const onPointerLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
    if (lean !== 0) setLean(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!live) return;
    const big = event.shiftKey ? 45 : 15;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = bearing + big;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = bearing - big;
    else if (event.key === "PageUp") next = bearing + 45;
    else if (event.key === "PageDown") next = bearing - 45;
    else if (event.key === "Home") next = 0;
    if (next === null) return;
    event.preventDefault();
    const dir = Math.sign(wrap(next) - bearing) || 1;
    commit(next);
    // The device kicks toward the turn and settles back on glide.
    if (motionSafe) animate(kick, 0, { ...springs.glide, velocity: dir * 90 });
  };

  const [short, long] = point(bearing);
  // Paused or reduced, the panel redraws at once, so the readout does too.
  const captionBearing = motionSafe && !paused ? shownBearing : heading;
  const [shownShort] = point(captionBearing);
  const metres = swellMetres(swell);

  return (
    <div
      className={cn(
        "group/bistable-sea relative w-72 [perspective:900px]",
        className,
      )}
    >
      <motion.div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={bearing}
        aria-valuetext={`Facing ${long}, ${bearing}°, swell ${metres} metres`}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        {...drag}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        style={{ rotateX, rotateY }}
        className={cn(
          "relative flex aspect-[3/2] w-full touch-pan-y flex-col rounded-4 border border-hairline-strong bg-surface-2 px-2.5 pt-2.5 pb-4 shadow-[0_1px_2px_oklch(0_0_0/0.12),0_8px_24px_-12px_oklch(0_0_0/0.35)] select-none",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-ew-resize",
        )}
      >
        <div
          className="relative flex grow basis-0 flex-col overflow-hidden rounded-1 shadow-[inset_0_0_0_1px_oklch(0_0_0/0.08)]"
          style={{ backgroundColor: paperColor }}
        >
          {caption ? (
            <div
              className="flex shrink-0 items-center justify-between gap-2 px-1.5 pt-1 pb-0.5 font-mono text-[9px] leading-none tracking-[0.06em] uppercase"
              style={{ color: inkColor }}
            >
              <span className="truncate">
                {shownShort} {captionBearing}°
              </span>
              <span className="shrink-0 tabular-nums">
                Swell {metres} m · 11 s
              </span>
            </div>
          ) : null}
          <div
            ref={bindHost}
            className="group/bistable-sea-panel relative grow basis-0 overflow-hidden"
          >
            <svg
              aria-hidden
              viewBox="0 0 120 70"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full group-data-live/bistable-sea-panel:hidden"
            >
              <defs>
                <pattern
                  id={`${uid}-dots`}
                  width="2"
                  height="2"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="1" height="1" style={{ fill: inkColor }} />
                </pattern>
                <pattern
                  id={`${uid}-dense`}
                  width="2"
                  height="2"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="2" height="1" style={{ fill: inkColor }} />
                  <rect width="1" height="2" style={{ fill: inkColor }} />
                </pattern>
              </defs>
              <rect
                x="0"
                y="0"
                width="120"
                height="25"
                fill={`url(#${uid}-dots)`}
                opacity={0.35}
              />
              <circle cx="88" cy="18" r="4" style={{ fill: paperColor }} />
              <rect
                x="0"
                y="25"
                width="120"
                height="45"
                fill={`url(#${uid}-dense)`}
              />
              <rect
                x="0"
                y="25"
                width="120"
                height="8"
                fill={`url(#${uid}-dots)`}
              />
            </svg>
            <canvas
              ref={canvasRef}
              aria-hidden
              className="absolute top-1/2 left-1/2 -translate-1/2 [image-rendering:pixelated]"
            />
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/bistable-sea:opacity-100"
              style={{
                backgroundImage:
                  "linear-gradient(105deg, transparent 35%, oklch(1 0 0 / 0.16) 48%, transparent 60%)",
                backgroundSize: "220% 100%",
                backgroundPosition: sheen,
              }}
            />
          </div>
        </div>
        <span
          aria-hidden
          className="absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-hairline-strong"
        />
      </motion.div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => panel.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span
          className="transition-colors duration-1"
          style={{ color: paperColor }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: inkColor }}
        />
      </span>
      <p id={hintId} className="sr-only">
        Left and Right turn the display 15 degrees, Shift or Page keys 45, Home
        faces north. Drag sideways to turn it by hand. Facing {short}.
      </p>
    </div>
  );
}
