"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PlayParachuteProps = {
  /** How many silk panels make the canopy, 4 to 24. @default 12 */
  panels?: number;
  /** Panel colours, cycled round the canopy; any CSS colours. @default four token pigments */
  colors?: string[];
  /** How high waves and a throw lift the silk, 0 to 1. @default 0.6 */
  billow?: number;
  /** The satin highlight on every crest, 0 (matte cotton) to 1 (bright silk). @default 0.6 */
  sheen?: number;
  /** How taut the silk is, 0 (slow, lazy waves) to 1 (quick ones). @default 0.5 */
  tension?: number;
  /** How quickly waves and the dome die away, 0 (they roll on) to 1 (they stop soon). @default 0.5 */
  settle?: number;
  /** The view's height above the ground, in degrees: 20 (low and long) to 70 (from above). @default 30 */
  tilt?: number;
  /** Handles round the rim, 4 to 16: the stops the keyboard moves between. @default 8 */
  handles?: number;
  /** A small ball rolls on the silk. @default true */
  ball?: boolean;
  /** The ball's colour, any CSS colour. @default "oklch(from var(--warn) 0.95 0.03 h)" */
  ballColor?: string;
  /** What throws a soft billow by itself: coming into view, mounting, or nothing. @default "inView" */
  trigger?: "inView" | "mount" | "manual";
  /** Fires when the visitor throws the canopy up. */
  onThrow?: () => void;
  /** Fires when the visitor lifts an edge, with the handle's index (0 is nearest the viewer, counting to the right). */
  onLift?: (handle: number) => void;
  /** Hold the silk where it is. @default false */
  paused?: boolean;
  /** Seeds where the ball starts. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The canopy's accessible name. @default "Play parachute" */
  label?: string;
  /** Play the swish of the silk for the visitor's own throws and lifts. @default false */
  sound?: boolean;
  /** Shows the canopy but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box; the canopy fits inside it. @default "h-52 w-full" */
  className?: string;
};

const DEFAULT_COLORS = [
  "oklch(from var(--danger) 0.66 0.18 h)",
  "oklch(from var(--warn) 0.85 0.14 h)",
  "oklch(from var(--success) 0.7 0.14 h)",
  "oklch(from var(--accent-bright) 0.62 0.16 h)",
];
const DEFAULT_BALL = "oklch(from var(--warn) 0.95 0.03 h)";
const DOT = "var(--ink-3)";
const RING = "var(--ring)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

const RINGS = 14;
/** Grid spokes per silk panel: enough for each panel to puff between seams. */
const SPP = 6;
/** The centre hole's radius, a share of the canopy's. */
const HOLE = 0.09;
const SHADE_LEVELS = 24;
const SPEC_LEVELS = 12;
/** Held at the hem, the silk sags into a shallow bowl, in canopy radii. */
const SAG = 0.11;
/** How far each panel puffs up between its seams. */
const PUFF = 0.04;
/** The ground lies below the hands that hold the hem. */
const GROUND = -0.22;
/** How far a lifted edge can go, in canopy radii; the box reserves room for it. */
const LIFT_MAX = 0.32;

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
  return (colour: string): [number, number, number, number] => {
    if (!ctx) return [0.8, 0.4, 0.4, 1];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [
      (d[0] ?? 0) / 255,
      (d[1] ?? 0) / 255,
      (d[2] ?? 0) / 255,
      (d[3] ?? 255) / 255,
    ];
  };
}

const rgba = (c: RGB, a = 1) =>
  `rgb(${Math.round(clamp01(c[0]) * 255)} ${Math.round(clamp01(c[1]) * 255)} ${Math.round(clamp01(c[2]) * 255)} / ${Math.round(clamp01(a) * 1000) / 1000})`;

/** One calibration spring integrated by hand, so the field and the hem share a clock. */
type Spring = { stiffness: number; damping: number; mass: number };
const stepSpring = (
  s: Spring,
  x: number,
  v: number,
  target: number,
  dt: number,
): [number, number] => {
  const a = (-s.stiffness * (x - target) - s.damping * v) / s.mass;
  const nv = v + a * dt;
  return [x + nv * dt, nv];
};

/** A clock position, as people say it round a parachute: 12 is the far side. */
const clockOf = (theta: number) => {
  const hours = Math.round(((Math.PI / 2 - theta) / TAU) * 12 + 12) % 12;
  return hours === 0 ? 12 : hours;
};

type Config = {
  panels: number;
  billow: number;
  sheen: number;
  tension: number;
  settle: number;
  tilt: number;
  handles: number;
  ball: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
  trigger: "inView" | "mount" | "manual";
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (v: boolean) => void;
  /** The handle nearest a point in the box, or -1 when the point is far from the rim. */
  handleAt: (x: number, y: number) => number;
  /** The rim angle under a point in the box. */
  angleAt: (x: number, y: number) => number;
  hover: (handle: number) => void;
  select: (handle: number) => void;
  grab: (theta: number) => void;
  hold: (theta: number, lift: number) => void;
  /** Lets go of a held edge; the hem drops with the release velocity (radii per second). */
  release: (velocity: number) => void;
  /** Screen pixels per canopy radius of height at the rim. */
  liftScale: () => number;
  /** Screen pixels per canopy radius across the box. */
  radius: () => number;
  pulse: (handle: number, direction: 1 | -1) => void;
  thrown: (strength: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement,
  opening: React.RefObject<() => void>,
): Engine {
  const ctx = canvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let visible = false;
  let triggered = false;

  // Colours.
  let panelRGB: RGB[] = [[0.9, 0.4, 0.4]];
  let ballRGB: RGB = [0.97, 0.95, 0.9];
  let dotRGB: RGB = [0.5, 0.5, 0.55];
  let ringRGB: RGB = [0.3, 0.4, 0.9];
  /** fillStyle per panel colour × light level × sheen level, built once. */
  let table: string[] = [];
  let handleStyle: string[] = [];
  let ground: HTMLCanvasElement | null = null;
  let shadow: HTMLCanvasElement | null = null;
  let ballSprite: HTMLCanvasElement | null = null;

  // The field.
  let NS = 48;
  let N = RINGS * NS;
  let h = new Float32Array(N);
  let v = new Float32Array(N);
  let sx = new Float32Array(N);
  let sy = new Float32Array(N);
  let depth = new Float32Array(N);
  let wx = new Float32Array(N);
  let wy = new Float32Array(N);
  let wz = new Float32Array(N);
  let nx = new Float32Array(N);
  let ny = new Float32Array(N);
  let nz = new Float32Array(N);
  /** The silk's resting drape: the bowl and the puff of each panel. */
  let base = new Float32Array(N);
  let quadDepth = new Float32Array(0);
  let order = new Uint16Array(0);
  let quadStyle = new Uint16Array(0);
  let cosT = new Float32Array(NS);
  let sinT = new Float32Array(NS);
  let rimLift = new Float32Array(NS);
  const rho = new Float32Array(RINGS);
  const domeProfile = new Float32Array(RINGS);
  for (let i = 0; i < RINGS; i += 1) {
    const r = HOLE + ((1 - HOLE) * i) / (RINGS - 1);
    rho[i] = r;
    const t = (r - HOLE) / (1 - HOLE);
    domeProfile[i] = Math.pow(Math.cos((t * Math.PI) / 2), 1.25);
  }

  // Handles: each lift is a spring the hand pulls.
  let HN = 8;
  let hLift = new Float32Array(HN);
  let hVel = new Float32Array(HN);
  let hTarget = new Float32Array(HN);
  let hRelease = new Float64Array(HN);
  let hGlow = new Float32Array(HN);
  let hovered = -1;
  let selected = -1;
  let selAngle = 0;
  let selVel = 0;
  // The held edge.
  let held = false;
  let dragTheta = 0;
  let dragLift = 0;
  let dragVel = 0;
  // The dome.
  let dome = 0;
  let domeVel = 0;
  let domeGlow = 0;
  /** Under reduced motion the canopy rests gently domed, so it still reads as silk with air under it. */
  let rest = 0;
  // The ball, in canopy radii; z is its height above the ground.
  let bx = 0.3;
  let by = -0.2;
  let bvx = 0;
  let bvy = 0;
  let bz = 0;
  let bvz = 0;
  let lastSurface = 0;
  let ballReady = false;

  // Projection.
  let R = 100;
  let cx = 0;
  let cy = 0;
  let sinE = 0.5;
  let cosE = 0.87;
  let clock = 0;

  const liftScale = () => lerp(0.14, 0.42, clamp01(cfg?.billow ?? 0.6));
  const domeMax = () => lerp(0.22, 0.62, clamp01(cfg?.billow ?? 0.6));

  const handleTheta = (k: number) => -Math.PI / 2 + (k / HN) * TAU;
  const nearest = (theta: number) =>
    ((Math.round(((theta + Math.PI / 2) / TAU) * HN) % HN) + HN) % HN;

  /**
   * The resting drape: a fuller canopy (more billow) hangs in a deeper bowl
   * with rounder panels; a taut one lies flatter.
   */
  const drape = () => {
    const b = clamp01(cfg?.billow ?? 0.6);
    const sag = SAG * lerp(0.55, 1.35, b);
    const puff = PUFF * lerp(0.45, 1.6, b);
    for (let i = 0; i < RINGS; i += 1) {
      const t = ((rho[i] ?? 1) - HOLE) / (1 - HOLE);
      for (let j = 0; j < NS; j += 1) {
        const f = (j % SPP) / SPP;
        base[i * NS + j] =
          -sag * (1 - t * t) + puff * Math.sin(f * Math.PI) * Math.pow(t, 0.7);
      }
    }
  };

  const alloc = (panels: number) => {
    NS = clamp(Math.round(panels), 4, 24) * SPP;
    N = RINGS * NS;
    h = new Float32Array(N);
    v = new Float32Array(N);
    sx = new Float32Array(N);
    sy = new Float32Array(N);
    depth = new Float32Array(N);
    wx = new Float32Array(N);
    wy = new Float32Array(N);
    wz = new Float32Array(N);
    nx = new Float32Array(N);
    ny = new Float32Array(N);
    nz = new Float32Array(N);
    base = new Float32Array(N);
    drape();
    const quads = (RINGS - 1) * NS;
    quadDepth = new Float32Array(quads);
    order = new Uint16Array(quads);
    quadStyle = new Uint16Array(quads);
    for (let q = 0; q < quads; q += 1) order[q] = q;
    cosT = new Float32Array(NS);
    sinT = new Float32Array(NS);
    rimLift = new Float32Array(NS);
    for (let j = 0; j < NS; j += 1) {
      // Panels are offset half a panel so a seam never sits dead centre.
      const a = (j / NS) * TAU - Math.PI / 2 + Math.PI / (NS / SPP);
      cosT[j] = Math.cos(a);
      sinT[j] = Math.sin(a);
    }
  };

  const allocHandles = (count: number) => {
    HN = clamp(Math.round(count), 4, 16);
    hLift = new Float32Array(HN);
    hVel = new Float32Array(HN);
    hTarget = new Float32Array(HN);
    hRelease = new Float64Array(HN);
    hGlow = new Float32Array(HN);
    if (selected >= HN) selected = HN - 1;
  };

  const buildTable = () => {
    table = [];
    const sheen = clamp01(cfg?.sheen ?? 0.6);
    for (const base of panelRGB) {
      for (let s = 0; s < SHADE_LEVELS; s += 1) {
        const shade = lerp(0.34, 1.14, s / (SHADE_LEVELS - 1));
        for (let p = 0; p < SPEC_LEVELS; p += 1) {
          const spec = (p / (SPEC_LEVELS - 1)) * sheen * 0.8;
          // Silk darkens toward a deeper shade of itself, never toward grey,
          // and the sheen is the light's own colour laid over it.
          const c: RGB = [
            base[0] * shade + (1 - base[0] * shade) * spec,
            base[1] * shade + (1 - base[1] * shade) * spec,
            base[2] * shade + (1 - base[2] * shade) * spec,
          ];
          table.push(rgba(c, 1));
        }
      }
    }
    handleStyle = panelRGB.map((c) =>
      rgba([c[0] * 0.6, c[1] * 0.6, c[2] * 0.6], 1),
    );
  };

  const readColours = () => {
    const kids = carriers.children;
    const at = (i: number): RGB | null => {
      const el = kids[i];
      if (!el) return null;
      const c = read(getComputedStyle(el).color);
      return [c[0], c[1], c[2]];
    };
    dotRGB = at(0) ?? dotRGB;
    ringRGB = at(1) ?? ringRGB;
    ballRGB = at(2) ?? ballRGB;
    panelRGB = [];
    for (let i = 3; i < kids.length; i += 1) {
      const c = at(i);
      if (c) panelRGB.push(c);
    }
    if (panelRGB.length === 0) panelRGB.push([0.9, 0.4, 0.4]);
    buildTable();
    ground = null;
    ballSprite = null;
    draw();
  };

  /** Fits the canopy, its dome and a lifted edge inside the box. */
  const fit = () => {
    const c = cfg;
    const E = (clamp(c?.tilt ?? 30, 20, 70) * Math.PI) / 180;
    sinE = Math.sin(E);
    cosE = Math.cos(E);
    const above = Math.max(sinE + LIFT_MAX * cosE, domeMax() * cosE + 0.08);
    const below = sinE + -GROUND * cosE + 0.05;
    const pad = 8;
    R = Math.max(
      20,
      Math.min((W - pad * 2) * 0.46, (H - pad * 2) / (above + below)),
    );
    cx = W / 2;
    cy = pad + above * R + (H - pad * 2 - (above + below) * R) / 2;
  };

  /** A world point in canopy radii to the box, with a mild perspective. */
  const project = (
    x: number,
    y: number,
    z: number,
    out: Float32Array,
    k: number,
  ) => {
    const d = y * cosE - z * sinE;
    const p = 4 / (4 + d * 0.9);
    sx[k] = cx + x * R * p;
    sy[k] = cy - (y * sinE + z * cosE) * R * p;
    out[k] = d;
  };

  const buildGround = () => {
    if (W < 1 || H < 1) return;
    const g = document.createElement("canvas");
    g.width = Math.round(W * dpr);
    g.height = Math.round(H * dpr);
    const gc = g.getContext("2d");
    if (gc) {
      gc.setTransform(dpr, 0, 0, dpr, 0, 0);
      // A dotted ground in perspective, fading with distance, so the canopy
      // stands on something and the wide box is never empty.
      const step = 0.22;
      for (let gy = -1.6; gy <= 5; gy += step) {
        for (let gx = -8; gx <= 8; gx += step) {
          const d = gy * cosE - GROUND * sinE;
          const p = 4 / (4 + d * 0.9);
          if (p <= 0) continue;
          const px = cx + gx * R * p;
          const py = cy - (gy * sinE + GROUND * cosE) * R * p;
          if (px < -2 || px > W + 2 || py < -2 || py > H + 2) continue;
          const fade =
            clamp01(1 - (gy + 1.6) / 6.2) * clamp01(1 - Math.abs(gx) / 8);
          gc.fillStyle = rgba(dotRGB, 0.12 + 0.3 * fade);
          const s = 0.6 + 0.9 * p;
          gc.fillRect(px - s / 2, py - s / 2, s, s);
        }
      }
    }
    ground = g;
    const sh = document.createElement("canvas");
    sh.width = 128;
    sh.height = 128;
    const shc = sh.getContext("2d");
    if (shc) {
      const grad = shc.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgb(0 0 0 / 0.32)");
      grad.addColorStop(0.7, "rgb(0 0 0 / 0.16)");
      grad.addColorStop(1, "rgb(0 0 0 / 0)");
      shc.fillStyle = grad;
      shc.fillRect(0, 0, 128, 128);
    }
    shadow = sh;
  };

  const buildBall = () => {
    const s = document.createElement("canvas");
    s.width = 64;
    s.height = 64;
    const g = s.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(24, 22, 2, 32, 32, 31);
      grad.addColorStop(0, rgba([1, 1, 1], 1));
      grad.addColorStop(0.35, rgba(ballRGB, 1));
      grad.addColorStop(
        1,
        rgba([ballRGB[0] * 0.55, ballRGB[1] * 0.55, ballRGB[2] * 0.6], 1),
      );
      g.fillStyle = grad;
      g.beginPath();
      g.arc(32, 32, 31, 0, TAU);
      g.fill();
    }
    ballSprite = s;
  };

  const measure = () => {
    const w = root.clientWidth;
    const hh = root.clientHeight;
    if (w < 1 || hh < 1) return;
    const next = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    W = w;
    H = hh;
    dpr = next;
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    fit();
    ground = null;
  };

  /** The height of the silk at a node, field plus dome, in canopy radii. */
  const nodeZ = (i: number, j: number) =>
    (h[i * NS + j] ?? 0) +
    (base[i * NS + j] ?? 0) +
    (dome + rest) * domeMax() * (domeProfile[i] ?? 0);

  /** The silk's height under a point on the ground, by bilinear lookup in the polar grid. */
  const surfaceAt = (x: number, y: number) => {
    const r = Math.hypot(x, y);
    const shrink = 1 - 0.12 * clamp01(dome + rest) * r;
    const rr =
      clamp((r / Math.max(0.5, shrink) - HOLE) / (1 - HOLE), 0, 1) *
      (RINGS - 1);
    const i0 = Math.min(RINGS - 2, Math.floor(rr));
    const fi = rr - i0;
    let a = Math.atan2(y, x) + Math.PI / 2 - Math.PI / (NS / SPP);
    a = ((a % TAU) + TAU) % TAU;
    const jj = (a / TAU) * NS;
    const j0 = Math.floor(jj) % NS;
    const j1 = (j0 + 1) % NS;
    const fj = jj - Math.floor(jj);
    const z00 = nodeZ(i0, j0);
    const z01 = nodeZ(i0, j1);
    const z10 = nodeZ(i0 + 1, j0);
    const z11 = nodeZ(i0 + 1, j1);
    return lerp(lerp(z00, z01, fj), lerp(z10, z11, fj), fi);
  };

  const placeBall = () => {
    const r = lcg(cfg?.seed ?? 3);
    const a = r() * TAU;
    const d = 0.3 + r() * 0.35;
    bx = Math.cos(a) * d;
    by = Math.sin(a) * d;
    bvx = 0;
    bvy = 0;
    bz = surfaceAt(bx, by);
    bvz = 0;
    lastSurface = bz;
    ballReady = true;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    // Handles: a lift pulls toward its target on snap, a release drops on
    // recoil — the hem slapping down twice before it lies still.
    const now = clock;
    for (let k = 0; k < HN; k += 1) {
      if ((hTarget[k] ?? 0) !== 0 && now >= (hRelease[k] ?? 0)) hTarget[k] = 0;
      const spring = (hTarget[k] ?? 0) !== 0 ? springs.snap : springs.recoil;
      hGlow[k] = Math.max(0, (hGlow[k] ?? 0) - dt / 0.6);
      let x = hLift[k] ?? 0;
      let vv = hVel[k] ?? 0;
      const sub = 4;
      for (let s = 0; s < sub; s += 1) {
        [x, vv] = stepSpring(spring, x, vv, hTarget[k] ?? 0, dt / sub);
      }
      hLift[k] = x;
      hVel[k] = vv;
    }
    if (!held) {
      let x = dragLift;
      let vv = dragVel;
      for (let s = 0; s < 4; s += 1) {
        [x, vv] = stepSpring(springs.recoil, x, vv, 0, dt / 4);
      }
      dragLift = x;
      dragVel = vv;
    }
    if (selected >= 0) {
      // The focus ring travels the shorter way round on snap.
      let target = handleTheta(selected);
      while (target - selAngle > Math.PI) target -= TAU;
      while (target - selAngle < -Math.PI) target += TAU;
      let x = selAngle;
      let vv = selVel;
      for (let s = 0; s < 4; s += 1) {
        [x, vv] = stepSpring(springs.snap, x, vv, target, dt / 4);
      }
      selAngle = x;
      selVel = vv;
    }
    domeGlow = Math.max(0, domeGlow - dt / 0.9);

    // The dome: thrown up against the silk's weight, it falls back slowly on
    // the air trapped under it, dipping once under before it lies flat.
    const rising = domeVel > 0;
    const k = rising ? 26 : 7;
    const damp = rising ? 1.2 : lerp(2.2, 4.2, clamp01(c.settle));
    domeVel += (-k * dome - damp * domeVel) * dt;
    dome += domeVel * dt;

    // The rim follows the hands.
    const sigma = Math.max(0.22, (TAU / HN) * 0.42);
    const lift = liftScale();
    for (let j = 0; j < NS; j += 1) {
      const a = Math.atan2(sinT[j] ?? 0, cosT[j] ?? 0);
      let sum = 0;
      for (let q = 0; q < HN; q += 1) {
        let d = a - handleTheta(q);
        d = Math.atan2(Math.sin(d), Math.cos(d));
        sum +=
          (hLift[q] ?? 0) * lift * Math.exp(-(d * d) / (2 * sigma * sigma));
      }
      if (dragLift !== 0) {
        // A hand holds a good stretch of hem, not a point.
        let d = a - dragTheta;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        sum += dragLift * Math.exp(-(d * d) / (2 * 0.45 * 0.45));
      }
      rimLift[j] = sum;
    }

    // The wave equation on a polar grid, a few substeps for stability.
    const c2 = lerp(1, 5, clamp01(c.tension));
    const fieldDamp = lerp(0.9, 3.2, clamp01(c.settle));
    const dr = (1 - HOLE) / (RINGS - 1);
    const dth = TAU / NS;
    const sub = Math.max(1, Math.ceil(dt / 0.01));
    const sdt = dt / sub;
    for (let s = 0; s < sub; s += 1) {
      const rim = (RINGS - 1) * NS;
      for (let j = 0; j < NS; j += 1) h[rim + j] = rimLift[j] ?? 0;
      for (let i = 0; i < RINGS - 1; i += 1) {
        const r = rho[i] ?? 1;
        const arc = Math.max(r * dth, dr * 0.6);
        const inv2 = 1 / (arc * arc);
        // Waves running in toward the hole would focus there; the silk is
        // doubled and bound round the hole, so it soaks them up instead.
        const t = i / (RINGS - 1);
        const decay = Math.exp(-fieldDamp * (1 + 3 * (1 - t) ** 3) * sdt);
        for (let j = 0; j < NS; j += 1) {
          const k0 = i * NS + j;
          const hc = h[k0] ?? 0;
          const up = h[k0 + NS] ?? 0;
          const down = i === 0 ? up : (h[k0 - NS] ?? 0);
          const left = h[i * NS + ((j + NS - 1) % NS)] ?? 0;
          const right = h[i * NS + ((j + 1) % NS)] ?? 0;
          const lap =
            (up - 2 * hc + down) / (dr * dr) +
            (i === 0 ? 0 : (up - down) / (2 * dr * r)) +
            (left - 2 * hc + right) * inv2;
          v[k0] = ((v[k0] ?? 0) + c2 * lap * sdt) * decay;
        }
      }
      for (let k0 = 0; k0 < (RINGS - 1) * NS; k0 += 1) {
        h[k0] = clamp((h[k0] ?? 0) + (v[k0] ?? 0) * sdt, -0.45, 0.45);
      }
      // Near the hole every spoke meets its neighbours: the inner rings are
      // pulled toward their own mean so the binding stays round.
      for (let i = 0; i < 3; i += 1) {
        let mean = 0;
        for (let j = 0; j < NS; j += 1) mean += h[i * NS + j] ?? 0;
        mean /= NS;
        const pull = i === 0 ? 0.5 : i === 1 ? 0.25 : 0.1;
        for (let j = 0; j < NS; j += 1) {
          const k0 = i * NS + j;
          h[k0] = lerp(h[k0] ?? 0, mean, pull);
        }
      }
    }

    // The ball rolls down the silk's slope, is carried up by a rising
    // surface, and flies when the surface stops faster than it can.
    if (c.ball) {
      if (!ballReady) placeBall();
      const e = 0.035;
      const zs = surfaceAt(bx, by);
      const gx = (surfaceAt(bx + e, by) - surfaceAt(bx - e, by)) / (2 * e);
      const gy = (surfaceAt(bx, by + e) - surfaceAt(bx, by - e)) / (2 * e);
      const vs = (zs - lastSurface) / Math.max(dt, 1e-3);
      lastSurface = zs;
      const g = 4.6;
      if (bz <= zs + 1e-4) {
        bz = zs;
        if (bvz < vs) {
          const impact = vs - bvz;
          // Carried by the silk, the ball leaves it no faster than a small
          // toss: a hard throw lifts it, it never leaves the box.
          bvz = Math.min(1.5, impact > 0.5 ? vs + impact * 0.3 : vs);
        }
        bvx += (-g * gx - 1.1 * bvx) * dt;
        bvy += (-g * gy - 1.1 * bvy) * dt;
      } else {
        bvz -= g * dt;
        bvx *= Math.exp(-0.2 * dt);
        bvy *= Math.exp(-0.2 * dt);
      }
      bz += bvz * dt;
      if (bz < zs) bz = zs;
      bx += bvx * dt;
      by += bvy * dt;
      const r = Math.hypot(bx, by);
      const limit = 0.84 * (1 - 0.12 * clamp01(dome));
      if (r > limit) {
        const nx = bx / r;
        const ny = by / r;
        const out = bvx * nx + bvy * ny;
        if (out > 0) {
          bvx -= 1.6 * out * nx;
          bvy -= 1.6 * out * ny;
        }
        bx = nx * limit;
        by = ny * limit;
      }
    }
  };

  /** Whether anything is still moving. */
  const busy = () => {
    if (held) return true;
    if (Math.abs(dome) > 0.002 || Math.abs(domeVel) > 0.004) return true;
    if (Math.abs(dragLift) > 0.001 || Math.abs(dragVel) > 0.004) return true;
    if (domeGlow > 0) return true;
    for (let k = 0; k < HN; k += 1) {
      if (Math.abs(hLift[k] ?? 0) > 0.001 || Math.abs(hVel[k] ?? 0) > 0.004)
        return true;
      if ((hTarget[k] ?? 0) !== 0 || (hGlow[k] ?? 0) > 0) return true;
    }
    if (selected >= 0 && Math.abs(selVel) > 0.002) return true;
    let energy = 0;
    for (let k0 = 0; k0 < N; k0 += 1) {
      const vv = v[k0] ?? 0;
      energy += vv * vv + (h[k0] ?? 0) * (h[k0] ?? 0) * 0.2;
    }
    if (energy > 2e-6 * N) return true;
    if (cfg?.ball && Math.hypot(bvx, bvy, bvz) > 0.006) return true;
    return false;
  };

  function draw() {
    const c = cfg;
    if (!ctx || !c || W < 1 || H < 1 || table.length === 0) return;
    if (!ground) buildGround();
    if (!ballSprite) buildBall();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (ground) ctx.drawImage(ground, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const still = !c.motionSafe;
    const shrinkK = 0.12 * clamp01(dome + rest);

    // Shadow on the ground below the hands: tight and dark while the silk
    // hangs low, wide and soft when it is thrown up.
    if (shadow) {
      const lifted = clamp01(dome + rest);
      const rx = R * (1.02 + 0.16 * lifted);
      const ry = rx * sinE;
      const d = -GROUND * sinE;
      const p = 4 / (4 + -d * 0.9);
      const gx = cx + R * (0.06 + 0.1 * lifted) * p;
      const gy = cy - (-0.04 * sinE + GROUND * cosE) * R * p;
      ctx.globalAlpha = lerp(0.85, 0.5, lifted);
      ctx.drawImage(shadow, gx - rx, gy - ry, rx * 2, ry * 2);
      ctx.globalAlpha = 1;
    }

    // Vertices.
    const dm = domeMax();
    for (let i = 0; i < RINGS; i += 1) {
      const r0 = rho[i] ?? 1;
      const r = r0 * (1 - shrinkK * r0);
      const prof = domeProfile[i] ?? 0;
      for (let j = 0; j < NS; j += 1) {
        const k0 = i * NS + j;
        const x = r * (cosT[j] ?? 0);
        const y = r * (sinT[j] ?? 0);
        const z = (h[k0] ?? 0) + (base[k0] ?? 0) + (dome + rest) * dm * prof;
        wx[k0] = x;
        wy[k0] = y;
        wz[k0] = z;
        project(x, y, z, depth, k0);
      }
    }
    // Vertex normals from the neighbours on both sides, so light falls
    // smoothly across a panel instead of facet by facet.
    for (let i = 0; i < RINGS; i += 1) {
      const iu = Math.min(RINGS - 1, i + 1);
      const id = Math.max(0, i - 1);
      for (let j = 0; j < NS; j += 1) {
        const k0 = i * NS + j;
        const kr = i * NS + ((j + 1) % NS);
        const kl = i * NS + ((j + NS - 1) % NS);
        const ku = iu * NS + j;
        const kd = id * NS + j;
        const ax = (wx[ku] ?? 0) - (wx[kd] ?? 0);
        const ay = (wy[ku] ?? 0) - (wy[kd] ?? 0);
        const az = (wz[ku] ?? 0) - (wz[kd] ?? 0);
        const bx2 = (wx[kr] ?? 0) - (wx[kl] ?? 0);
        const by2 = (wy[kr] ?? 0) - (wy[kl] ?? 0);
        const bz2 = (wz[kr] ?? 0) - (wz[kl] ?? 0);
        let x = ay * bz2 - az * by2;
        let y = az * bx2 - ax * bz2;
        let z = ax * by2 - ay * bx2;
        const l = Math.hypot(x, y, z) || 1;
        if (z < 0) {
          x = -x;
          y = -y;
          z = -z;
        }
        nx[k0] = x / l;
        ny[k0] = y / l;
        nz[k0] = z / l;
      }
    }

    // Light from the upper left and a little in front; the eye from the view.
    const lx = -0.48;
    const ly = -0.38;
    const lz = 0.79;
    let hx = lx;
    let hy = ly - cosE;
    let hz = lz + sinE;
    const hl = Math.hypot(hx, hy, hz) || 1;
    hx /= hl;
    hy /= hl;
    hz /= hl;
    const sheen = clamp01(c.sheen);
    const expo = lerp(6, 30, sheen);
    const colours = panelRGB.length;
    const quads = (RINGS - 1) * NS;
    for (let q = 0; q < quads; q += 1) {
      const i = Math.floor(q / NS);
      const j = q % NS;
      const j1 = (j + 1) % NS;
      const a = i * NS + j;
      const b = (i + 1) * NS + j;
      const cc = (i + 1) * NS + j1;
      const d = i * NS + j1;
      quadDepth[q] =
        ((depth[a] ?? 0) +
          (depth[b] ?? 0) +
          (depth[cc] ?? 0) +
          (depth[d] ?? 0)) *
        0.25;
      let mx = (nx[a] ?? 0) + (nx[b] ?? 0) + (nx[cc] ?? 0) + (nx[d] ?? 0);
      let my = (ny[a] ?? 0) + (ny[b] ?? 0) + (ny[cc] ?? 0) + (ny[d] ?? 0);
      let mz = (nz[a] ?? 0) + (nz[b] ?? 0) + (nz[cc] ?? 0) + (nz[d] ?? 0);
      const ml = Math.hypot(mx, my, mz) || 1;
      mx /= ml;
      my /= ml;
      mz /= ml;
      const diffuse = Math.max(0, mx * lx + my * ly + mz * lz);
      // Silk shines along its weave: the radial thread direction against the
      // half vector gives a long satin highlight, plus a little gloss.
      let tx = (wx[b] ?? 0) - (wx[a] ?? 0) + (wx[cc] ?? 0) - (wx[d] ?? 0);
      let ty = (wy[b] ?? 0) - (wy[a] ?? 0) + (wy[cc] ?? 0) - (wy[d] ?? 0);
      let tz = (wz[b] ?? 0) - (wz[a] ?? 0) + (wz[cc] ?? 0) - (wz[d] ?? 0);
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      const th = tx * hx + ty * hy + tz * hz;
      const aniso = Math.pow(Math.max(0, 1 - th * th), expo * 0.5);
      const gloss = Math.pow(
        Math.max(0, mx * hx + my * hy + mz * hz),
        expo * 2,
      );
      let spec = clamp01(aniso * 0.5 + gloss * 0.75);
      let shade = 0.34 + 0.74 * diffuse;
      if (still) {
        const glowAll = domeGlow * 0.25;
        let near = 0;
        for (let k = 0; k < HN; k += 1) {
          const g = hGlow[k] ?? 0;
          if (g <= 0) continue;
          let dd = Math.atan2(sinT[j] ?? 0, cosT[j] ?? 0) - handleTheta(k);
          dd = Math.atan2(Math.sin(dd), Math.cos(dd));
          near = Math.max(
            near,
            g * Math.exp(-(dd * dd) / 0.18) * ((rho[i] ?? 0) * 0.8 + 0.2),
          );
        }
        shade += glowAll + near * 0.25;
        spec = clamp01(spec + near * 0.4 + glowAll);
      }
      const sl = clamp(
        Math.round(((shade - 0.34) / 0.8) * (SHADE_LEVELS - 1)),
        0,
        SHADE_LEVELS - 1,
      );
      const pl = clamp(
        Math.round(spec * (SPEC_LEVELS - 1)),
        0,
        SPEC_LEVELS - 1,
      );
      const panel = Math.floor(j / SPP) % colours;
      quadStyle[q] = (panel * SHADE_LEVELS + sl) * SPEC_LEVELS + pl;
    }
    // Far to near; insertion sort on last frame's order is nearly free.
    for (let q = 1; q < quads; q += 1) {
      const cur = order[q] ?? 0;
      const dcur = quadDepth[cur] ?? 0;
      let p = q - 1;
      while (p >= 0 && (quadDepth[order[p] ?? 0] ?? 0) < dcur) {
        order[p + 1] = order[p] ?? 0;
        p -= 1;
      }
      order[p + 1] = cur;
    }
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.7;
    for (let n = 0; n < quads; n += 1) {
      const q = order[n] ?? 0;
      const i = Math.floor(q / NS);
      const j = q % NS;
      const j1 = (j + 1) % NS;
      const a = i * NS + j;
      const b = (i + 1) * NS + j;
      const cc = (i + 1) * NS + j1;
      const d = i * NS + j1;
      const style = table[quadStyle[q] ?? 0] ?? "";
      ctx.fillStyle = style;
      ctx.strokeStyle = style;
      ctx.beginPath();
      ctx.moveTo(sx[a] ?? 0, sy[a] ?? 0);
      ctx.lineTo(sx[b] ?? 0, sy[b] ?? 0);
      ctx.lineTo(sx[cc] ?? 0, sy[cc] ?? 0);
      ctx.lineTo(sx[d] ?? 0, sy[d] ?? 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Seams, the hem and the hole's binding.
    ctx.strokeStyle = "rgb(0 0 0 / 0.16)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let j = 0; j < NS; j += SPP) {
      ctx.moveTo(sx[j] ?? 0, sy[j] ?? 0);
      for (let i = 1; i < RINGS; i += 1) {
        ctx.lineTo(sx[i * NS + j] ?? 0, sy[i * NS + j] ?? 0);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = "rgb(0 0 0 / 0.22)";
    ctx.lineWidth = 1.4;
    for (const ring of [0, RINGS - 1]) {
      ctx.beginPath();
      for (let j = 0; j <= NS; j += 1) {
        const k0 = ring * NS + (j % NS);
        if (j === 0) ctx.moveTo(sx[k0] ?? 0, sy[k0] ?? 0);
        else ctx.lineTo(sx[k0] ?? 0, sy[k0] ?? 0);
      }
      ctx.stroke();
    }

    // Handles: small loops just outside the hem.
    const rimR = 1 - shrinkK;
    for (let k = 0; k < HN; k += 1) {
      const a = handleTheta(k);
      let sum = 0;
      for (let q = 0; q < HN; q += 1) {
        let dd = a - handleTheta(q);
        dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        const sigma = Math.max(0.22, (TAU / HN) * 0.42);
        sum +=
          (hLift[q] ?? 0) *
          liftScale() *
          Math.exp(-(dd * dd) / (2 * sigma * sigma));
      }
      const x = Math.cos(a) * (rimR + 0.05);
      const y = Math.sin(a) * (rimR + 0.05);
      const d = y * cosE - sum * sinE;
      const p = 4 / (4 + d * 0.9);
      const px = cx + x * R * p;
      const py = cy - (y * sinE + sum * cosE) * R * p;
      const spoke =
        ((Math.round(((a + Math.PI / 2 - Math.PI / (NS / SPP)) / TAU) * NS) %
          NS) +
          NS) %
        NS;
      const panel = Math.floor(spoke / SPP) % colours;
      ctx.strokeStyle = handleStyle[panel] ?? "rgb(0 0 0 / 0.4)";
      ctx.lineWidth = k === hovered ? 2 : 1.4;
      ctx.beginPath();
      ctx.ellipse(
        px,
        py,
        Math.max(2, R * 0.035),
        Math.max(1.5, R * 0.035 * sinE + 1),
        0,
        0,
        TAU,
      );
      ctx.stroke();
    }
    if (selected >= 0) {
      const a = selAngle;
      const x = Math.cos(a) * (rimR + 0.05);
      const y = Math.sin(a) * (rimR + 0.05);
      const p = 4 / (4 + y * cosE * 0.9);
      const px = cx + x * R * p;
      const py = cy - y * sinE * R * p;
      ctx.strokeStyle = rgba(ringRGB, 1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        px,
        py,
        Math.max(6, R * 0.085),
        Math.max(4, R * 0.085 * sinE + 2),
        0,
        0,
        TAU,
      );
      ctx.stroke();
    }

    // The ball and its shadow on the silk.
    if (c.ball && ballReady && ballSprite) {
      const zs = surfaceAt(bx, by);
      const shrinkB = 1 - shrinkK * Math.hypot(bx, by);
      const gx = bx * shrinkB;
      const gy = by * shrinkB;
      const rb = 0.055;
      const ds = gy * cosE - zs * sinE;
      const ps = 4 / (4 + ds * 0.9);
      const air = Math.max(0, bz - zs);
      ctx.fillStyle = `rgb(0 0 0 / ${Math.round(clamp01(0.28 - air * 0.5) * 1000) / 1000})`;
      ctx.beginPath();
      ctx.ellipse(
        cx + (gx + 0.02 + air * 0.25) * R * ps,
        cy - (gy * sinE + zs * cosE) * R * ps,
        rb * R * ps * (1 + air),
        rb * R * ps * sinE * (1 + air),
        0,
        0,
        TAU,
      );
      ctx.fill();
      const zb = bz + rb;
      const db = gy * cosE - zb * sinE;
      const pb = 4 / (4 + db * 0.9);
      const bxp = cx + gx * R * pb;
      const byp = cy - (gy * sinE + zb * cosE) * R * pb;
      const rr = rb * R * pb;
      ctx.drawImage(ballSprite, bxp - rr, byp - rr, rr * 2, rr * 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  const tick = (time: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible || document.hidden || c.paused) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.04, (time - last) / 1000) : 1 / 60;
    last = time;
    if (c.motionSafe) step(dt);
    else {
      // Reduced motion: only the feedback glows fade.
      clock += dt;
      domeGlow = Math.max(0, domeGlow - dt / 0.9);
      for (let k = 0; k < HN; k += 1)
        hGlow[k] = Math.max(0, (hGlow[k] ?? 0) - dt / 0.6);
      if (selected >= 0) {
        selAngle = handleTheta(selected);
        selVel = 0;
      }
    }
    draw();
    const more = c.motionSafe
      ? busy()
      : domeGlow > 0 || hGlow.some((g) => g > 0);
    if (more) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  function kick() {
    if (disposed || frame || !visible || document.hidden || cfg?.paused) return;
    frame = window.requestAnimationFrame(tick);
  }

  const reset = () => {
    h.fill(0);
    v.fill(0);
    hLift.fill(0);
    hVel.fill(0);
    hTarget.fill(0);
    dome = 0;
    domeVel = 0;
    dragLift = 0;
    dragVel = 0;
    ballReady = false;
  };

  alloc(12);

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) return;
      if (!was || was.panels !== next.panels) {
        alloc(next.panels);
        reset();
      }
      if (!was || was.handles !== next.handles) allocHandles(next.handles);
      if (!was || was.dpr !== next.dpr) measure();
      if (!was || was.tilt !== next.tilt || was.billow !== next.billow) {
        fit();
        drape();
        ground = null;
      }
      if (!was || was.seed !== next.seed || was.ball !== next.ball)
        ballReady = false;
      if (was && was.motionSafe !== next.motionSafe) reset();
      rest = next.motionSafe ? 0 : 0.28;
      if (!was || was.colourKey !== next.colourKey) readColours();
      else if (was.sheen !== next.sheen) buildTable();
      if (!was && next.trigger === "mount" && !triggered) {
        triggered = true;
        opening.current?.();
      }
      draw();
      kick();
    },
    resize() {
      measure();
      draw();
      kick();
    },
    readColours,
    setVisible(vis) {
      visible = vis;
      if (vis) {
        measure();
        draw();
        if (cfg?.trigger === "inView" && !triggered) {
          triggered = true;
          opening.current?.();
        }
        kick();
      }
    },
    handleAt(x, y) {
      const gx = (x - cx) / R;
      const gy = (cy - y) / (R * sinE);
      const r = Math.hypot(gx, gy);
      if (r < 0.62 || r > 1.4) return -1;
      const a = Math.atan2(gy, gx);
      let best = -1;
      let bestD = Infinity;
      for (let k = 0; k < HN; k += 1) {
        let d = a - handleTheta(k);
        d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      return best;
    },
    angleAt(x, y) {
      return Math.atan2((cy - y) / (R * sinE), (x - cx) / R);
    },
    hover(k) {
      if (hovered === k) return;
      hovered = k;
      draw();
    },
    select(k) {
      const was = selected;
      selected = k < 0 ? -1 : clamp(k, 0, HN - 1);
      if (was < 0 && selected >= 0) {
        selAngle = handleTheta(selected);
        selVel = 0;
      }
      draw();
      kick();
    },
    grab(theta) {
      held = true;
      dragTheta = theta;
      dragVel = 0;
      kick();
    },
    hold(theta, liftTo) {
      if (!cfg?.motionSafe) {
        // No travel: the edge under the hand lights instead.
        hGlow[nearest(theta)] = 1;
        kick();
        return;
      }
      dragTheta = theta;
      dragLift = liftTo;
      kick();
    },
    release(velocity) {
      held = false;
      dragVel = velocity;
      if (!cfg?.motionSafe) {
        dragLift = 0;
        dragVel = 0;
      }
      kick();
    },
    liftScale: () => R * cosE,
    radius: () => R,
    pulse(k, direction) {
      const c = cfg;
      if (!c || k < 0 || k >= HN) return;
      if (!c.motionSafe) {
        hGlow[k] = 1;
        kick();
        return;
      }
      // A hand flicks the edge: up on snap, held a moment, let go on recoil.
      hTarget[k] = direction;
      hRelease[k] = clock + 0.24;
      kick();
    },
    thrown(strength) {
      const c = cfg;
      if (!c) return;
      if (!c.motionSafe) {
        domeGlow = 1;
        kick();
        return;
      }
      domeVel += 5.2 * clamp(strength, 0, 1.5);
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      ground = null;
      shadow = null;
      ballSprite = null;
    },
  };
}

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * A playground parachute seen from above at an angle, lying on a dotted
 * ground: bright silk panels round a small centre hole, seams, a hem and
 * handle loops. The canopy is a height field running the wave equation on a
 * polar grid, its rim held by the handles. Press near the rim and drag, and
 * the hem rises 1:1 under the finger and slides round with it; shake it and
 * waves roll inward and round, every crest catching a satin sheen that runs
 * along the weave; let go and the hem drops on the recoil spring with the
 * hand's velocity. A tap throws the whole canopy up into a dome, which falls
 * back slowly on the air trapped under it. A small ball rolls down the
 * silk's slopes and is tossed by a throw.
 *
 * Canvas 2D, with a colour table built once and a loop that runs only while
 * the silk moves. The canopy is a button: Left and Right move round the
 * handles (the ring follows on the snap spring), Up lifts that edge and Down
 * pulls it, Enter or Space throws. Under reduced motion it rests gently domed
 * and every lift or throw is shown as light on the silk, without travel.
 */
export function PlayParachute({
  panels = 12,
  colors = DEFAULT_COLORS,
  billow = 0.6,
  sheen = 0.6,
  tension = 0.5,
  settle = 0.5,
  tilt = 30,
  handles = 8,
  ball = true,
  ballColor = DEFAULT_BALL,
  trigger = "inView",
  onThrow,
  onLift,
  paused = false,
  seed = 3,
  dpr = 2,
  label = "Play parachute",
  sound = false,
  disabled = false,
  className,
}: PlayParachuteProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [selected, setSelected] = React.useState(0);
  const [focused, setFocused] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const grip = React.useRef({ scale: 100, theta: 0, radius: 100 });

  const handleCount = clamp(Math.round(handles), 4, 16);
  const config: Config = {
    panels,
    billow,
    sheen,
    tension,
    settle,
    tilt,
    handles: handleCount,
    ball,
    paused,
    seed,
    dpr,
    motionSafe,
    colourKey: [ballColor, ...colors].join("|"),
    trigger,
  };
  const latest = React.useRef(config);
  const opening = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    opening.current = () => {
      if (!disabled) engine.current?.thrown(0.55);
    };
  });

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, opening);
    engine.current = e;
    e.configure(latest.current);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      e.setVisible(Boolean(entry?.isIntersecting));
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) e.resize();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // The keyboard's ring shows only while the canopy has focus.
  React.useEffect(() => {
    engine.current?.select(focused ? Math.min(selected, handleCount - 1) : -1);
  }, [focused, selected, handleCount]);

  const local = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const handleName = (k: number) =>
    `${clockOf(-Math.PI / 2 + (k / handleCount) * TAU)} o'clock`;

  const doThrow = (pan = 0) => {
    if (disabled) return;
    engine.current?.thrown(1);
    audio.play("swish", {
      pitch: 0.7 + 0.3 * clamp01(billow),
      gain: 0.55,
      pan,
    });
    say(motionSafe ? "Thrown up; the canopy is settling." : "Thrown up.");
    onThrow?.();
  };

  const doPulse = (k: number, direction: 1 | -1) => {
    if (disabled) return;
    engine.current?.pulse(k, direction);
    audio.play("swish", {
      pitch: direction > 0 ? 1.15 : 0.85,
      gain: 0.3,
      pan: Number(
        (Math.cos(-Math.PI / 2 + (k / handleCount) * TAU) * 0.5).toFixed(3),
      ),
    });
    say(
      `${direction > 0 ? "Lifted" : "Pulled down"} the edge at ${handleName(k)}.`,
    );
    onLift?.(k);
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ point }) => {
      const e = engine.current;
      if (!e) return;
      const at = local(point.x, point.y);
      const theta = e.angleAt(at.x, at.y);
      grip.current = { scale: e.liftScale(), theta, radius: e.radius() };
      e.grab(theta);
    },
    onMove: ({ offset }) => {
      const e = engine.current;
      if (!e) return;
      // 1:1: the hem's screen height follows the finger's, and a sideways
      // move slides the hold round the rim by the same distance.
      const { theta, radius, scale } = grip.current;
      const along = theta - (offset.x / Math.max(1, radius)) * Math.sin(theta);
      const raw = -offset.y / Math.max(1, scale);
      const lift =
        raw > LIFT_MAX
          ? LIFT_MAX + (raw - LIFT_MAX) * 0.15
          : Math.max(-0.2, raw);
      e.hold(along, Math.min(LIFT_MAX * 1.15, lift));
    },
    onEnd: ({ velocity, offset, point }) => {
      const e = engine.current;
      if (!e) return;
      const vel = -velocity.y / Math.max(1, grip.current.scale);
      e.release(clamp(vel, -6, 6));
      const g = grip.current;
      const theta =
        g.theta - (offset.x / Math.max(1, g.radius)) * Math.sin(g.theta);
      const k =
        ((Math.round(((theta + Math.PI / 2) / TAU) * handleCount) %
          handleCount) +
          handleCount) %
        handleCount;
      if (Math.abs(vel) > 1.2) {
        const r = rootRef.current?.getBoundingClientRect();
        audio.play("swish", {
          pitch: 1,
          gain: clamp(Math.abs(vel) / 8, 0.15, 0.5),
          pan: r
            ? Number((((point.x - r.left) / r.width) * 1.2 - 0.6).toFixed(3))
            : 0,
        });
      }
      say(`Shook the edge at ${handleName(k)}.`);
      onLift?.(k);
    },
    onCancel: () => engine.current?.release(0),
    onTap: (event) => {
      const r = rootRef.current?.getBoundingClientRect();
      const pan = r
        ? Number((((event.clientX - r.left) / r.width) * 1.2 - 0.6).toFixed(3))
        : 0;
      doThrow(pan);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!focused) setFocused(true);
    const k = Math.min(selected, handleCount - 1);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSelected((k + 1) % handleCount);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSelected((k - 1 + handleCount) % handleCount);
    } else if (event.key === "Home") {
      event.preventDefault();
      setSelected(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setSelected(handleCount - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!event.repeat || motionSafe) doPulse(k, 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!event.repeat || motionSafe) doPulse(k, -1);
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate h-52 w-full overflow-clip select-none",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <button
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          // The handle ring is the keyboard's cursor: a click focuses the
          // canopy too, and must not light it.
          setFocused(event.currentTarget.matches(":focus-visible"));
        }}
        onBlur={() => setFocused(false)}
        onClick={(event) => {
          if (event.detail === 0) doThrow();
        }}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (event.pointerType === "touch") return;
          const at = local(event.clientX, event.clientY);
          engine.current?.hover(engine.current.handleAt(at.x, at.y));
        }}
        onPointerLeave={() => engine.current?.hover(-1)}
        onPointerDown={drag.onPointerDown}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onLostPointerCapture={drag.onLostPointerCapture}
        className={cn(
          "absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing disabled:cursor-default",
          FOCUS_RING,
        )}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[DOT, RING, ballColor, ...colors].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <span id={hintId} className="sr-only">
        Handle at {handleName(Math.min(selected, handleCount - 1))}. Left and
        Right move round the handles, Up lifts that edge, Down pulls it down,
        Enter or Space throws the canopy up.
      </span>
      <span aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
