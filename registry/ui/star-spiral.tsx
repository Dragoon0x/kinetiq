"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type StarTilt = {
  /** The turn about the upright axis, whole degrees, right positive. */
  x: number;
  /** The inclination, whole degrees: 0 face on, 90 edge on. */
  y: number;
};

export type StarSpiralProps = {
  /** The content in front of the galaxy: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many arms the density wave raises, 1 to 6. @default 2 */
  arms?: number;
  /** How many stars make the galaxy, 300 to 3000; dust adds three tenths more. @default 1400 */
  stars?: number;
  /** The disk's resting inclination in degrees, 0 (face on) to 80 (nearly edge on). @default 55 */
  tilt?: number;
  /** How fast the disk turns, 0 (still) to 3. @default 1 */
  speed?: number;
  /** How tightly the arms wind, 0 (open) to 1 (tight). @default 0.5 */
  twist?: number;
  /** The galaxy's size against the box, 0.4 to 1.4. @default 1 */
  size?: number;
  /** Where the core sits across the box, 0 to 1; narrow boxes pull it toward the middle. @default 0.5 */
  originX?: number;
  /** Where the core sits down the box, 0 to 1. @default 0.5 */
  originY?: number;
  /** How bright the bulge glows, 0 to 1. @default 0.6 */
  core?: number;
  /** How heavy the dust lanes along the arms are, 0 (none) to 1. @default 0.5 */
  dust?: number;
  /** The young stars' colour along the arms, any CSS colour. @default "var(--accent-bright)" */
  color?: string;
  /** The old stars' and the bulge's colour, any CSS colour. @default "var(--warn)" */
  coreColor?: string;
  /** A drag tilts the plane, a tap sends a ring of new stars out, and keyboard focus inside tilts toward the control. @default true */
  interactive?: boolean;
  /** How far a drag tilts the plane and how bright a ring burns, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** Hold the disk still; a drag still tilts it. @default false */
  paused?: boolean;
  /** Seeds every star's orbit and the moment the galaxy starts from. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the plane's tilt changes by a whole degree, from a drag, keyboard focus or the swing back. */
  onTiltChange?: (tilt: StarTilt) => void;
  /** Fires when a drag or keyboard focus starts (true) or stops (false) tilting the plane. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a tap (or keyboard focus) sends a ring of star formation out from the core. */
  onRing?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const CALM_FRAME = 31;
const TAU = Math.PI * 2;
/** The rotation curve: flat at the rim, soft in the core. A rim star circles in about two minutes at speed 1. */
const V_FLAT = 0.055;
const CORE_R = 0.12;
/** The arm pattern turns slower than the stars that stream through it. */
const PATTERN = 0.022;
/** How far each orbit bulges into its lobes: the crowding that draws the arms. */
const LOBE = 0.2;
/** The ring of star formation crosses the disk in this long, on the enter easing. */
const RING = 1.4;
/** A reduced-motion ring is one still brightening, cleared after this long. */
const STILL_RING = 600;
/** A tap's push into the core flare: peaks near 1 a tenth of a second in. */
const FLARE = 27;
const MAX_INCL = (85 * Math.PI) / 180;
const MAX_YAW = (62 * Math.PI) / 180;
const DRIFT = springs.drift;
const STEP = 1 / 120;
const [E1, E2, E3, E4] = easings.enter;

const OLD = 0;
const YOUNG = 1;
const BULGE = 2;
const DUST = 3;
const SKIP = 255;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const deg = (rad: number) => Math.round((rad * 180) / Math.PI);

/** The house enter curve as a function, for the ring's travel. */
function enterEase(t: number): number {
  let u = t;
  for (let i = 0; i < 5; i += 1) {
    const x =
      3 * (1 - u) * (1 - u) * u * E1 + 3 * (1 - u) * u * u * E3 + u * u * u;
    const dx =
      3 * (1 - u) * (1 - u) * E1 +
      6 * (1 - u) * u * (E3 - E1) +
      3 * u * u * (1 - E3);
    if (Math.abs(dx) < 1e-6) break;
    u = clamp(u - (x - t) / dx, 0, 1);
  }
  return 3 * (1 - u) * (1 - u) * u * E2 + 3 * (1 - u) * u * u * E4 + u * u * u;
}

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as 0–255 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Uint8ClampedArray, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = d[0] ?? 0;
    out[at + 1] = d[1] ?? 0;
    out[at + 2] = d[2] ?? 0;
  };
}

/** What a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** Young stars and the bulge as light (dark theme) and as ink (light theme): pigment at a fixed lightness. */
const lightOf = (c: string, l: number, k: number) =>
  `oklch(from ${c} ${l} calc(c * ${k}) h)`;

type Config = {
  arms: number;
  stars: number;
  tilt: number;
  speed: number;
  twist: number;
  size: number;
  originX: number;
  originY: number;
  core: number;
  dust: number;
  paletteKey: string;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onTilt: (tilt: StarTilt) => void;
  onActive: (active: boolean) => void;
  onRing: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  grab: () => void;
  dragBy: (dx: number, dy: number) => void;
  letGo: (vx: number, vy: number) => void;
  lean: (x: number, y: number) => void;
  unlean: () => void;
  ring: (strength: number) => void;
  dispose: () => void;
};

type Spring = { x: number; v: number };

/** Draw styles for one theme, built once per colour read, never per frame. */
type Ink = {
  additive: boolean;
  old: string[];
  young: string[];
  bulge: string[];
  bg: string;
};

const OLD_SIZE = [1, 1, 1.4];
const YOUNG_SIZE = [1, 1.2, 1.6, 2.2];
const BULGE_SIZE = [1, 1.4];

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let active = false;
  let ringTimer = 0;
  const read = rgbReader();
  const rgb = new Uint8ClampedArray(18);
  const size = { w: 0, h: 0, dpr: 1 };
  let ink: Ink | null = null;

  // The galaxy: one orbit per star, in typed arrays sized to the count.
  let count = 0;
  let pop = new Uint8Array(0);
  let orbit = new Float32Array(0);
  let phase = new Float32Array(0);
  let height = new Float32Array(0);
  let omega = new Float32Array(0);
  let shine = new Float32Array(0);
  let sx = new Float32Array(0);
  let sy = new Float32Array(0);
  let lvl = new Uint8Array(0);
  let built = "";

  /** The arm pattern's turn, radians. */
  const sim = { pattern: 0 };
  const incl: Spring = { x: 0, v: 0 };
  const yaw: Spring = { x: 0, v: 0 };
  const flare: Spring = { x: 0, v: 0 };
  const drag = { on: false, startI: 0, startJ: 0 };
  const lean = { on: false, i: 0, j: 0 };
  const ring = { age: RING, strength: 0, still: false };
  const reported = { x: 9999, y: 9999 };

  // Sprites, painted once per colour read.
  const glow = document.createElement("canvas");
  const bulgeGlow = document.createElement("canvas");
  const spark = document.createElement("canvas");
  glow.width = 64;
  glow.height = 64;
  bulgeGlow.width = 64;
  bulgeGlow.height = 64;
  spark.width = 16;
  spark.height = 16;
  const mote = document.createElement("canvas");
  mote.width = 16;
  mote.height = 16;

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const restIncl = (c: Config) => (clamp(c.tilt, 0, 80) * Math.PI) / 180;
  /** Radians of tilt per pixel of drag: half the box's height is about a radian. */
  const sensitivity = (c: Config) =>
    (0.35 + 0.9 * clamp(c.pointerStrength, 0, 1)) / Math.max(160, size.h);

  const report = () => {
    const c = cfg;
    if (!c) return;
    const x = deg(yaw.x);
    const y = deg(incl.x);
    if (x === reported.x && y === reported.y) return;
    reported.x = x;
    reported.y = y;
    c.onTilt({ x, y });
  };

  /** Seeds the stars: a bulge, an old disk, young stars and dust, each on its own orbit. */
  const populate = (c: Config) => {
    const n = clamp(Math.round(c.stars), 300, 3000);
    const dustN = Math.round(n * 0.3);
    const key = `${n}:${c.seed}`;
    if (key === built) return;
    built = key;
    count = n + dustN;
    pop = new Uint8Array(count);
    orbit = new Float32Array(count);
    phase = new Float32Array(count);
    height = new Float32Array(count);
    omega = new Float32Array(count);
    shine = new Float32Array(count);
    sx = new Float32Array(count);
    sy = new Float32Array(count);
    lvl = new Uint8Array(count);
    const rand = lcg(c.seed * 53 + 11);
    const gauss = () => {
      const u = Math.max(rand(), 1e-6);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
    };
    for (let k = 0; k < count; k += 1) {
      const u = rand();
      let kind = OLD;
      let a: number;
      let z: number;
      let p = rand() * TAU;
      if (k >= n) {
        kind = DUST;
        a = 0.12 + Math.sqrt(rand()) * 0.82;
        z = gauss() * 0.005;
      } else if (u < 0.08) {
        // The bulge is a round swarm, so it keeps its height edge on.
        kind = BULGE;
        const gx = gauss() * 0.075;
        const gy = gauss() * 0.075;
        a = Math.hypot(gx, gy) + 0.004;
        p = Math.atan2(gy, gx);
        z = gauss() * 0.06;
      } else if (u < 0.44) {
        kind = YOUNG;
        a = 0.12 + rand() * 0.86;
        z = gauss() * 0.01;
      } else {
        a = Math.min(1.05, -Math.log(1 - rand() * 0.95) * 0.36 + 0.03);
        z = gauss() * (0.018 + 0.03 * (1 - a));
      }
      pop[k] = kind;
      orbit[k] = a;
      phase[k] = p;
      height[k] = z;
      omega[k] =
        kind === BULGE
          ? V_FLAT / CORE_R
          : V_FLAT / Math.sqrt(a * a + CORE_R * CORE_R);
      shine[k] = rand();
    }
    // A seeded moment in the galaxy's turning, so every first frame matches.
    const t = 20 + rand() * 200;
    for (let k = 0; k < count; k += 1)
      phase[k] = ((phase[k] ?? 0) + (omega[k] ?? 0) * t) % TAU;
    sim.pattern = (t * PATTERN) % TAU;
  };

  const rgba = (at: number, a: number, mixWith = -1, f = 0) => {
    let r = rgb[at] ?? 0;
    let g = rgb[at + 1] ?? 0;
    let b = rgb[at + 2] ?? 0;
    if (mixWith >= 0) {
      r += ((rgb[mixWith] ?? 0) - r) * f;
      g += ((rgb[mixWith + 1] ?? 0) - g) * f;
      b += ((rgb[mixWith + 2] ?? 0) - b) * f;
    }
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
  };

  const paintSprite = (
    sprite: HTMLCanvasElement,
    stops: readonly [number, string][],
  ) => {
    const g = sprite.getContext("2d");
    if (!g) return;
    const s = sprite.width / 2;
    g.clearRect(0, 0, sprite.width, sprite.height);
    const grad = g.createRadialGradient(s, s, 0, s, s, s);
    for (const [at, colour] of stops) grad.addColorStop(at, colour);
    g.fillStyle = grad;
    g.fillRect(0, 0, sprite.width, sprite.height);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 6; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, rgb, i * 3);
    }
    const lum =
      (0.2126 * (rgb[0] ?? 0) +
        0.7152 * (rgb[1] ?? 0) +
        0.0722 * (rgb[2] ?? 0)) /
      255;
    // Carriers: 0 page, 1 text, 2 young light, 3 young ink, 4 old light, 5 old ink.
    if (lum < 0.5) {
      ink = {
        additive: true,
        old: [0.2, 0.38, 0.7].map((a) => rgba(3, a, 12, 0.45)),
        young: [0.32, 0.55, 0.8, 1].map((a) => rgba(6, a)),
        bulge: [0.45, 0.8].map((a) => rgba(12, a, 3, 0.25)),
        bg: rgba(0, 1),
      };
      paintSprite(glow, [
        [0, rgba(12, 0.16, 3, 0.4)],
        [0.5, rgba(12, 0.05, 3, 0.4)],
        [1, rgba(12, 0)],
      ]);
      paintSprite(bulgeGlow, [
        [0, rgba(12, 0.95, 3, 0.5)],
        [0.22, rgba(12, 0.45)],
        [1, rgba(12, 0)],
      ]);
      paintSprite(spark, [
        [0, rgba(6, 0.9, 3, 0.5)],
        [0.35, rgba(6, 0.3)],
        [1, rgba(6, 0)],
      ]);
    } else {
      // A negative plate: ink stars on paper, the dust as paper showing through.
      ink = {
        additive: false,
        old: [0.22, 0.4, 0.65].map((a) => rgba(3, a, 15, 0.35)),
        young: [0.3, 0.5, 0.72, 0.9].map((a) => rgba(9, a)),
        bulge: [0.35, 0.6].map((a) => rgba(15, a, 3, 0.3)),
        bg: rgba(0, 1),
      };
      paintSprite(glow, [
        [0, rgba(15, 0.1, 3, 0.5)],
        [0.5, rgba(15, 0.03, 3, 0.5)],
        [1, rgba(15, 0)],
      ]);
      paintSprite(bulgeGlow, [
        [0, rgba(15, 0.7, 3, 0.4)],
        [0.25, rgba(15, 0.25)],
        [1, rgba(15, 0)],
      ]);
      paintSprite(spark, [
        [0, rgba(9, 0.7)],
        [0.35, rgba(9, 0.2)],
        [1, rgba(9, 0)],
      ]);
    }
    // Dust is the page itself showing through: dark lanes on the night
    // sky, pale ones on the plate.
    paintSprite(mote, [
      [0, rgba(0, 0.9)],
      [0.5, rgba(0, 0.45)],
      [1, rgba(0, 0)],
    ]);
  };

  /** One batch: every star of a kind at one level, as one path and one fill. */
  const batch = (
    g: CanvasRenderingContext2D,
    kind: number,
    level: number,
    style: string,
    px: number,
  ) => {
    const s = px / size.dpr;
    const half = s / 2;
    g.fillStyle = style;
    g.beginPath();
    for (let k = 0; k < count; k += 1) {
      if (pop[k] !== kind || lvl[k] !== level) continue;
      g.rect((sx[k] ?? 0) - half, (sy[k] ?? 0) - half, s, s);
    }
    g.fill();
  };

  const draw = () => {
    const c = cfg;
    const g = ctx;
    const look = ink;
    if (!c || !g || !look || !visible.current || size.w < 1) return;
    const narrow = clamp((size.w - 320) / 440, 0, 1);
    const cx = (0.5 + (clamp(c.originX, 0, 1) - 0.5) * narrow) * size.w;
    const cy = clamp(c.originY, 0, 1) * size.h;
    const rest = restIncl(c);
    const R =
      clamp(c.size, 0.4, 1.4) *
      Math.min(0.44 * size.w, (0.42 * size.h) / Math.max(Math.cos(rest), 0.3));
    const cosI = Math.cos(incl.x);
    const sinI = Math.sin(incl.x);
    const cosJ = Math.cos(yaw.x);
    const sinJ = Math.sin(yaw.x);
    const m = clamp(Math.round(c.arms), 1, 6);
    const wind = 1.2 + clamp(c.twist, 0, 1) * 3.6;
    const dustOn = clamp(c.dust, 0, 1);
    // Near edge on, every mote along the line of sight joins the lane.
    const edge = clamp((Math.abs(sinI) - 0.85) / 0.14, 0, 1);
    const f = clamp(ring.age / RING, 0, 1);
    const ringOn = ring.still || f < 1;
    const ringR = ring.still ? 0.55 : enterEase(f) * 1.15;
    const ringK = ring.still ? ring.strength : ring.strength * (1 - f * 0.6);

    for (let k = 0; k < count; k += 1) {
      const kind = pop[k] ?? OLD;
      const a = orbit[k] ?? 0;
      const p = phase[k] ?? 0;
      let r = a;
      let ridge = 0;
      let lane = 0;
      if (kind !== BULGE) {
        // Orbits bulge into m lobes that twist with radius; where
        // neighbouring orbits crowd, the arms stand.
        const psi = m * (p - wind * a - sim.pattern);
        const s = Math.sin(psi);
        r = a * (1 + LOBE * Math.cos(psi));
        ridge = 0.5 - 0.5 * s;
        if (kind === DUST) lane = 0.5 - 0.5 * Math.sin(psi - 0.55);
      }
      const x = r * Math.cos(p);
      const y = r * Math.sin(p);
      const z = height[k] ?? 0;
      const y1 = y * cosI - z * sinI;
      const z1 = y * sinI + z * cosI;
      sx[k] = cx + (x * cosJ + z1 * sinJ) * R;
      sy[k] = cy + y1 * R;
      const lit = shine[k] ?? 0;
      let boost = 0;
      if (ringOn) {
        const d = (a - ringR) / 0.07;
        boost = ringK * Math.exp(-d * d);
      }
      let level: number;
      if (kind === OLD) {
        // Old stars crowd into the arms too, and shine a little brighter there.
        level = lit < 0.62 ? 0 : lit < 0.92 ? 1 : 2;
        if (boost > 0.35 || ridge > 0.8) level = Math.min(2, level + 1);
      } else if (kind === YOUNG) {
        const r3 = ridge * ridge * ridge;
        const b = r3 * (0.45 + 0.55 * lit) + boost * 1.2;
        level = b < 0.1 ? SKIP : b < 0.28 ? 0 : b < 0.5 ? 1 : b < 0.75 ? 2 : 3;
      } else if (kind === BULGE) {
        level = lit < 0.7 ? 0 : 1;
      } else {
        // Edge on, the dust on the near half of the disk crosses in front
        // of the bulge: the lane sits just off the centre line.
        const near = z1 * Math.sign(sinI || 1) > 0 ? 1 : 0;
        const d =
          (lane * lane * lane * (1 - edge) + edge * near) *
          dustOn *
          1.9 *
          (a < 0.9 ? 1 : 0);
        level = d < 0.22 ? SKIP : d < 0.45 ? 0 : 1;
      }
      lvl[k] = level;
    }

    const w = size.w;
    const h = size.h;
    g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = look.bg;
    g.fillRect(0, 0, w, h);
    if (look.additive) g.globalCompositeOperation = "lighter";
    // The disk's own light, then the bulge, flattened by the tilt.
    const rx = R * Math.max(Math.abs(cosJ), 0.08) * 1.15;
    const ry = R * Math.max(Math.abs(cosI), 0.06) * 1.15;
    g.drawImage(glow, cx - rx, cy - ry, rx * 2, ry * 2);
    const bloom = 1 + 0.7 * Math.max(flare.x, 0);
    const br = R * 0.3 * bloom;
    const bry = br * (1 - 0.35 * (1 - Math.abs(cosI)));
    g.globalAlpha = clamp(c.core, 0, 1) * (0.75 + 0.25 * Math.min(flare.x, 1));
    g.drawImage(bulgeGlow, cx - br, cy - bry, br * 2, bry * 2);
    g.globalAlpha = 1;

    for (let l = 0; l < 3; l += 1)
      batch(g, OLD, l, look.old[l] ?? "", OLD_SIZE[l] ?? 1);
    for (let l = 0; l < 2; l += 1)
      batch(g, BULGE, l, look.bulge[l] ?? "", BULGE_SIZE[l] ?? 1);
    for (let l = 0; l < 4; l += 1)
      batch(g, YOUNG, l, look.young[l] ?? "", YOUNG_SIZE[l] ?? 1);
    // The brightest young stars get a soft halo.
    const sp = 7;
    for (let k = 0; k < count; k += 1) {
      if (pop[k] !== YOUNG || lvl[k] !== 3 || (shine[k] ?? 0) < 0.7) continue;
      g.drawImage(spark, (sx[k] ?? 0) - sp / 2, (sy[k] ?? 0) - sp / 2, sp, sp);
    }
    g.globalCompositeOperation = "source-over";
    if (dustOn > 0) {
      // Soft motes, drawn out along the lane as the disk turns edge on.
      const stretch = 1 + 1.5 * edge;
      for (let k = 0; k < count; k += 1) {
        const l = lvl[k];
        if (pop[k] !== DUST || l === SKIP) continue;
        const s = l === 1 ? 6 : 4;
        g.globalAlpha = l === 1 ? 0.85 : 0.5;
        g.drawImage(
          mote,
          (sx[k] ?? 0) - (s * stretch) / 2,
          (sy[k] ?? 0) - s / 2,
          s * stretch,
          s,
        );
      }
      g.globalAlpha = 1;
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const settle = (s: Spring, to: number, h: number) => {
    s.v +=
      ((DRIFT.stiffness * (to - s.x) - DRIFT.damping * s.v) / DRIFT.mass) * h;
    s.x += s.v * h;
  };
  const rested = (s: Spring, to: number, eps: number) => {
    if (Math.abs(to - s.x) < eps && Math.abs(s.v) < eps * 10) {
      s.x = to;
      s.v = 0;
      return true;
    }
    return false;
  };

  const tiltTarget = (c: Config) =>
    lean.on ? { i: lean.i, j: lean.j } : { i: restIncl(c), j: 0 };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      const t = dt * clamp(c.speed, 0, 3);
      for (let k = 0; k < count; k += 1)
        phase[k] = ((phase[k] ?? 0) + (omega[k] ?? 0) * t) % TAU;
      sim.pattern = (sim.pattern + PATTERN * t) % TAU;
      moving = true;
    }
    const to = tiltTarget(c);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      if (!drag.on) {
        settle(incl, to.i, h);
        settle(yaw, to.j, h);
      }
      settle(flare, 0, h);
    }
    if (drag.on) moving = true;
    else if (!(rested(incl, to.i, 0.0005) && rested(yaw, to.j, 0.0005)))
      moving = true;
    if (!rested(flare, 0, 0.002)) moving = true;
    if (ring.age < RING) {
      ring.age += dt;
      moving = true;
    }
    report();
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !ctx) {
      last = 0;
      return;
    }
    const busy =
      drag.on ||
      incl.v !== 0 ||
      yaw.v !== 0 ||
      flare.v !== 0 ||
      ring.age < RING;
    if (c.motionSafe && !busy && last && now - drawnAt < CALM_FRAME) {
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
    if (disposed || frame || !visible.current || document.hidden || !ctx)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion has no swing: the plane is wherever it should be. */
  const place = (c: Config) => {
    if (drag.on) return;
    const to = tiltTarget(c);
    incl.x = to.i;
    incl.v = 0;
    yaw.x = to.j;
    yaw.v = 0;
    report();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    size.dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * size.dpr);
    canvas.height = Math.round(h * size.dpr);
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        ctx = canvas.getContext("2d");
        if (!ctx) {
          root.setAttribute("data-fallback", "");
          return;
        }
        populate(next);
        incl.x = restIncl(next);
        readColours();
        resize();
        report();
        return;
      }
      if (!was) return;
      populate(next);
      if (was.paletteKey !== next.paletteKey) readColours();
      if (was.dpr !== next.dpr) resize();
      if (!next.interactive) {
        if (lean.on) lean.on = false;
        if (drag.on) drag.on = false;
        setActive(false);
      }
      if (!next.motionSafe) place(next);
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
    grab() {
      const c = cfg;
      if (!c || !c.interactive) return;
      drag.on = true;
      drag.startI = incl.x;
      drag.startJ = yaw.x;
      incl.v = 0;
      yaw.v = 0;
      setActive(true);
      if (c.motionSafe) kick();
    },
    dragBy(dx, dy) {
      const c = cfg;
      if (!c || !drag.on) return;
      // The plane follows the hand 1:1 and resists past edge on.
      const k = sensitivity(c);
      incl.x = rubberClamp(drag.startI + dy * k, -MAX_INCL, MAX_INCL, 0.6);
      yaw.x = rubberClamp(drag.startJ + dx * k, -MAX_YAW, MAX_YAW, 0.6);
      report();
      if (c.motionSafe) kick();
      else draw();
    },
    letGo(vx, vy) {
      const c = cfg;
      if (!c || !drag.on) return;
      drag.on = false;
      if (!lean.on) setActive(false);
      if (!c.motionSafe) {
        place(c);
        draw();
        return;
      }
      // The swing back takes the release velocity, so a flick carries on.
      const k = sensitivity(c);
      incl.v = vy * k;
      yaw.v = vx * k;
      kick();
    },
    lean(x, y) {
      const c = cfg;
      if (!c || !c.interactive || size.w < 1) return;
      const narrow = clamp((size.w - 320) / 440, 0, 1);
      const cx = (0.5 + (clamp(c.originX, 0, 1) - 0.5) * narrow) * size.w;
      const cy = clamp(c.originY, 0, 1) * size.h;
      const reach = Math.max(size.h * 0.5, 1);
      lean.on = true;
      lean.j = clamp(((x - cx) / reach) * 0.25, -0.35, 0.35);
      lean.i = clamp(restIncl(c) + ((y - cy) / reach) * 0.3, 0, MAX_INCL);
      setActive(true);
      if (c.motionSafe) kick();
      else {
        place(c);
        draw();
      }
    },
    unlean() {
      const c = cfg;
      if (!c || !lean.on) return;
      lean.on = false;
      if (!drag.on) setActive(false);
      if (c.motionSafe) kick();
      else {
        place(c);
        draw();
      }
    },
    ring(strength) {
      const c = cfg;
      if (!c || !c.interactive || size.w < 1) return;
      const k = clamp(strength, 0, 1) * (0.5 + 0.5 * c.pointerStrength);
      c.onRing();
      ring.strength = k;
      if (!c.motionSafe) {
        // One still brightening at mid-disk, cleared on a timer.
        ring.still = true;
        draw();
        window.clearTimeout(ringTimer);
        ringTimer = window.setTimeout(() => {
          ring.still = false;
          draw();
        }, STILL_RING);
        return;
      }
      ring.still = false;
      ring.age = 0;
      flare.v += FLARE * k;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(ringTimer);
    },
  };
}

/**
 * A background of a spiral galaxy built the way density waves are: every
 * star rides its own closed orbit, each orbit bulging into `arms` lobes that
 * twist with radius, so the arms stand where neighbouring orbits crowd while
 * every star keeps streaming through them. The rotation is differential —
 * the core turns visibly faster than the rim — and the arm pattern turns
 * slower still. Old stars fill the disk, young ones light up only along the
 * arm ridges, a round bulge glows at the centre, and dust rides the leading
 * edge of each arm, becoming the dark lane through the disk when it is seen
 * edge on. In the light theme it prints as a negative plate: ink stars on
 * paper.
 *
 * A drag tilts the plane 1:1 under the hand, rubber-banding past edge on;
 * on release it swings back to its resting tilt on springs with the
 * `springs.drift` constants, taking the release velocity, so a flick carries
 * on and then rights itself. A tap sends a ring of star formation out from
 * the core on the enter easing, the core flaring on a drift-spring impulse
 * first; keyboard focus on a control inside tilts the plane toward it and
 * sends a softer ring. Canvas 2D, stars batched into a handful of fills,
 * 30 frames a second while it only turns, nothing off screen or in a hidden
 * page. Under reduced motion the galaxy is still; a drag sets the tilt
 * exactly and release returns it at once, and a tap brightens a still ring.
 */
export function StarSpiral({
  children,
  arms = 2,
  stars = 1400,
  tilt = 55,
  speed = 1,
  twist = 0.5,
  size = 1,
  originX = 0.5,
  originY = 0.5,
  core = 0.6,
  dust = 0.5,
  color = "var(--accent-bright)",
  coreColor = "var(--warn)",
  interactive = true,
  pointerStrength = 0.7,
  paused = false,
  seed = 1,
  dpr = 2,
  onTiltChange,
  onActiveChange,
  onRing,
  className,
}: StarSpiralProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "var(--foreground)",
      lightOf(color, 0.82, 0.9),
      lightOf(color, 0.5, 1),
      lightOf(coreColor, 0.86, 0.6),
      lightOf(coreColor, 0.5, 0.8),
    ],
    [color, coreColor],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportTilt = React.useRef(onTiltChange);
  const reportActive = React.useRef(onActiveChange);
  const reportRing = React.useRef(onRing);
  const [dragging, setDragging] = React.useState(false);

  const config: Config = {
    arms,
    stars,
    tilt,
    speed,
    twist,
    size,
    originX,
    originY,
    core,
    dust,
    paletteKey: `${color}|${coreColor}`,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onTilt: (t) => reportTilt.current?.(t),
    onActive: (a) => reportActive.current?.(a),
    onRing: () => reportRing.current?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportTilt.current = onTiltChange;
    reportActive.current = onActiveChange;
    reportRing.current = onRing;
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

  const drag = useDrag({
    disabled: !interactive,
    onStart: () => {
      setDragging(true);
      engine.current?.grab();
    },
    onMove: (info) => engine.current?.dragBy(info.offset.x, info.offset.y),
    onEnd: (info) => {
      setDragging(false);
      engine.current?.letGo(info.velocity.x, info.velocity.y);
    },
    onCancel: () => {
      setDragging(false);
      engine.current?.letGo(0, 0);
    },
    onTap: () => engine.current?.ring(1),
  });

  // A press on a control is the control's: it never tilts or rings.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (hit && rootRef.current?.contains(hit)) return;
    drag.onPointerDown(event);
  };

  // Keyboard focus on a control inside tilts the plane toward it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    const root = rootRef.current;
    if (!root || !(el instanceof Element) || !el.matches(":focus-visible"))
      return;
    const r = el.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    engine.current?.lean(
      r.left + r.width / 2 - box.left - root.clientLeft,
      r.top + r.height / 2 - box.top - root.clientTop,
    );
    engine.current?.ring(0.55);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.unlean();
  };

  return (
    <div
      ref={bindRoot}
      {...drag}
      onPointerDown={onPointerDown}
      onFocus={onFocus}
      onBlur={onBlur}
      data-dragging={dragging ? "" : undefined}
      className={cn(
        // A sideways drag tilts the plane; an upright swipe is the page's.
        "group/star-spiral relative isolate h-full w-full touch-pan-y overflow-clip bg-background data-dragging:cursor-grabbing data-dragging:select-none",
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
        className="pointer-events-none absolute inset-0 overflow-clip transition-opacity group-data-live/star-spiral:opacity-0"
        style={{
          transitionDuration: `${Math.round(durations.slow * 1000)}ms`,
        }}
      >
        <div
          className="absolute aspect-square h-[300%] -translate-1/2"
          style={standIn(
            paints,
            arms,
            tilt,
            twist,
            size,
            originX,
            originY,
            core,
            seed,
          )}
        />
      </div>
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

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * The designed still frame for the server render and the first paint: the
 * disk's glow and the bulge flattened by the tilt, with seeded stars laid
 * along the arms as small points of light. It is drawn on a square three
 * box-heights across, centred on the core, so the galaxy keeps its shape on
 * any width.
 */
function standIn(
  paints: readonly string[],
  arms: number,
  tilt: number,
  twist: number,
  size: number,
  originX: number,
  originY: number,
  core: number,
  seed: number,
): React.CSSProperties {
  const rand = lcg(seed * 7 + 5);
  const m = clamp(Math.round(arms), 1, 6);
  const inc = (clamp(tilt, 0, 80) * Math.PI) / 180;
  const flat = Math.max(Math.cos(inc), 0.1);
  // The disk's radius in box heights, as on the canvas for a wide box.
  const rh = clamp(size, 0.4, 1.4) * (0.42 / Math.max(Math.cos(inc), 0.3));
  const wind = 1.2 + clamp(twist, 0, 1) * 3.6;
  const at = (dx: number, dy: number) =>
    `${pct(0.5 + dx / 3)} ${pct(0.5 + dy / 3)}`;
  const dots: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    const a = 0.16 + rand() * 0.8;
    const arm = Math.floor(rand() * m);
    const p = (arm * Math.PI * 2) / m + wind * a + (rand() - 0.5) * 0.35;
    const tint = i % 3 === 0 ? paints[3] : paints[1];
    const s = Math.round((0.7 + rand() * 0.8) * 10) / 10;
    dots.push(
      `radial-gradient(circle at ${at(a * Math.cos(p) * rh, a * Math.sin(p) * rh * flat)}, color-mix(in oklab, ${tint} 70%, transparent) 0, transparent ${s}px)`,
    );
  }
  const glow = `color-mix(in oklab, ${paints[4]} ${Math.round(clamp(core, 0, 1) * 60)}%, transparent)`;
  const br = rh * 0.3;
  return {
    left: pct(clamp(originX, 0, 1)),
    top: pct(clamp(originY, 0, 1)),
    backgroundImage: [
      ...dots,
      `radial-gradient(ellipse ${pct(br / 3)} ${pct((br * (0.65 + 0.35 * flat)) / 3)} at 50% 50%, ${glow}, transparent)`,
      `radial-gradient(ellipse ${pct((rh * 1.1) / 3)} ${pct((rh * 1.1 * flat) / 3)} at 50% 50%, color-mix(in oklab, var(--foreground) 7%, transparent), transparent)`,
    ].join(", "),
  };
}
