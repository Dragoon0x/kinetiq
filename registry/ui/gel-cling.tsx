"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GelClingShape = "star" | "heart" | "flower" | "drop";
export type GelClingTint = "cherry" | "lime" | "sky" | "honey";

export type GelClingProps = {
  /** The surface the decal clings to: a window, a card, a photo. Drawn under the gel. */
  children?: React.ReactNode;
  /** The decal's outline. @default "star" */
  shape?: GelClingShape;
  /** The decal's width, px; held to 60% of the box's smaller side. @default 112 */
  size?: number;
  /** How thick the gel is, 0 to 1: a deeper rim, a longer shadow, a softer, slower wobble. @default 0.5 */
  thickness?: number;
  /** How hard it clings, 0 to 1: how far you pull before it lets go, and how many strings of tack hold on. @default 0.5 */
  tack?: number;
  /** The gel's colour: a named pigment (the same in both themes) or any CSS colour. @default "cherry" */
  tint?: GelClingTint | (string & {});
  /** Strength of the glossy highlight, 0 to 1. @default 0.7 */
  gloss?: number;
  /** How long the gel jiggles after a press or a landing, 0 (dead) to 1 (ringing). @default 0.5 */
  wobble?: number;
  /** Where the decal's centre sits, as [x, y] fractions of the box (controlled). */
  position?: [number, number];
  /** Where it starts when uncontrolled. @default [0.5, 0.5] */
  defaultPosition?: [number, number];
  /** Fires when the decal is stuck down somewhere new, with its centre as fractions (3 dp). */
  onPositionChange?: (position: [number, number]) => void;
  /** Fires while a corner is peeled, with how far it is toward letting go, 0 to 1 (steps of 0.05). */
  onPeel?: (amount: number) => void;
  /** Fires when the decal lets go of the surface. */
  onLift?: () => void;
  /** Fires when it lands and clings again, with where. */
  onStick?: (position: [number, number]) => void;
  /** The decal's accessible name. @default "Gel decal" */
  label?: string;
  /** A gloop when it lets go and when it lands, a plip as each string of tack snaps. Off unless asked for. @default false */
  sound?: boolean;
  /** The decal stays stuck: no press, peel or keys. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes and shapes the surface. @default "h-56 w-full" */
  className?: string;
};

/** Pigments at a fixed lightness, so the gel is the same colour on any page. */
const TINTS: Record<GelClingTint, string> = {
  cherry: "oklch(from var(--danger) 0.63 calc(c * 1.05) h)",
  lime: "oklch(from var(--success) 0.8 calc(c * 1.1) calc(h - 28))",
  sky: "oklch(from var(--accent-bright) 0.72 calc(c * 0.85) calc(h - 32))",
  honey: "oklch(from var(--warn) 0.8 c calc(h - 6))",
};

const N = 72;
const STEP = 1 / 120;
/** Light from the upper left: shadows fall to the lower right. */
const LX = -0.6;
const LY = -0.8;
const MAX_STRINGS = 22;
/** Room kept between the decal and the box's edge, for its focus ring. */
const EDGE = 6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The outline as N points, centred on its box and scaled so its larger half-extent is 1. */
function outline(shape: GelClingShape): { x: Float32Array; y: Float32Array } {
  const x = new Float32Array(N);
  const y = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const t = (i / N) * Math.PI * 2;
    if (shape === "heart") {
      const s = Math.sin(t);
      x[i] = 16 * s * s * s;
      y[i] = -(
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)
      );
    } else if (shape === "drop") {
      // A teardrop: round below, a soft point above.
      const a = t + Math.PI;
      x[i] = 1.12 * Math.sin(a) * Math.pow(Math.abs(Math.sin(a / 2)), 1.1);
      y[i] = -Math.cos(a);
    } else {
      const a = t - Math.PI / 2;
      const r =
        shape === "flower"
          ? 0.76 + 0.24 * Math.cos(6 * t)
          : 0.6 + 0.4 * Math.pow((1 + Math.cos(5 * t)) / 2, 1.5);
      x[i] = Math.cos(a) * r;
      y[i] = Math.sin(a) * r;
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < N; i += 1) {
    minX = Math.min(minX, x[i] ?? 0);
    maxX = Math.max(maxX, x[i] ?? 0);
    minY = Math.min(minY, y[i] ?? 0);
    maxY = Math.max(maxY, y[i] ?? 0);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2 || 1;
  for (let i = 0; i < N; i += 1) {
    x[i] = ((x[i] ?? 0) - cx) / half;
    y[i] = ((y[i] ?? 0) - cy) / half;
  }
  return { x, y };
}

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0.8, 0.2, 0.3];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

const rgba = (c: [number, number, number], a: number) =>
  `rgb(${Math.round(clamp01(c[0]) * 255)} ${Math.round(clamp01(c[1]) * 255)} ${Math.round(clamp01(c[2]) * 255)} / ${Math.round(clamp01(a) * 1000) / 1000})`;
const mix = (
  c: [number, number, number],
  to: number,
  t: number,
): [number, number, number] => [
  lerp(c[0], to, t),
  lerp(c[1], to, t),
  lerp(c[2], to, t),
];

type Mode = "stuck" | "press" | "peel" | "held" | "drop";

type Strand = {
  on: boolean;
  node: number;
  /** 1 on the outline, less for a point under the body. */
  f: number;
  bx: number;
  by: number;
  reach: number;
  /** Seconds since it snapped, or -1 while whole. */
  snapped: number;
  /** Seconds until a let-go snaps it, or -1. */
  due: number;
  /** Where the gel end was at the snap. */
  sx: number;
  sy: number;
  width: number;
};

type Config = {
  shape: GelClingShape;
  size: number;
  thickness: number;
  tack: number;
  gloss: number;
  wobble: number;
  home: [number, number];
  controlled: boolean;
  disabled: boolean;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
};

type Hooks = {
  peel: (amount: number) => void;
  lift: (by: "pointer" | "key") => void;
  stick: (position: [number, number], moved: boolean) => void;
  sound: (kind: "gloop" | "land" | "blup" | "plip", x: number) => void;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  hover: (x: number, y: number) => void;
  hoverOut: () => void;
  press: (x: number, y: number) => void;
  tap: () => void;
  peelStart: () => void;
  peelMove: (dx: number, dy: number) => void;
  release: () => void;
  keyLift: () => void;
  keyMove: (dx: number, dy: number) => void;
  keyDrop: () => void;
  keySquish: () => void;
  cancel: () => boolean;
  mode: () => Mode;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  button: HTMLButtonElement,
  carrier: HTMLSpanElement,
  visible: React.RefObject<boolean>,
  hooks: React.RefObject<Hooks>,
): Engine {
  const ctx = canvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  let tint: [number, number, number] = [0.85, 0.25, 0.35];
  let W = 0;
  let H = 0;
  let dpr = 1;
  let R = 56;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let disposed = false;
  let ticking = false;
  let wanted = false;
  let shapeKey = "";
  let unit = outline("star");
  const rx = new Float32Array(N);
  const ry = new Float32Array(N);
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const ex = new Float32Array(N);
  const ey = new Float32Array(N);
  const lift = new Float32Array(N);
  const liftV = new Float32Array(N);
  const liftT = new Float32Array(N);
  const stiff = new Float32Array(N);
  const strands: Strand[] = Array.from({ length: MAX_STRINGS }, () => ({
    on: false,
    node: 0,
    f: 1,
    bx: 0,
    by: 0,
    reach: 40,
    snapped: -1,
    due: -1,
    sx: 0,
    sy: 0,
    width: 2,
  }));
  let mode: Mode = "stuck";
  let ax = 0;
  let ay = 0;
  let avx = 0;
  let avy = 0;
  /** Where a keyboard-held decal is heading, and where a peel started. */
  let kx = 0;
  let ky = 0;
  let startX = 0;
  let startY = 0;
  let keyHeld = false;
  /** The grab point, from the decal's centre at rest. */
  let gx = 0;
  let gy = 0;
  let dragX = 0;
  let dragY = 0;
  let peelAmount = 0;
  let peelReported = -1;
  let pressX = 0;
  let pressY = 0;
  let squish = 0;
  let squishV = 0;
  let squishTarget = 0;
  /** The whole decal's lift while it falls back down, and the wet shine after. */
  let fall = 0;
  let fallV = 0;
  let wet = 0;
  let landed = false;
  let glintX = 0;
  let glintY = 0;
  let glintTX = 0;
  let glintTY = 0;
  let arrived = false;
  /** A keyboard peel plays itself: seconds in, or -1. */
  let keyPeel = -1;
  /** A held decal gliding home (Escape, or a host's move) lands by itself. */
  let glideHome = false;
  /** The first-view landing is the component's own: no sound, no callback. */
  let arrivalQuiet = false;
  let squishTimer = 0;
  let rand = lcg(5);

  const k0 = () => lerp(720, 260, clamp01(cfg?.thickness ?? 0.5));
  const zeta = () => {
    const c = cfg;
    if (!c || !c.motionSafe) return 1;
    return (
      lerp(0.95, 0.32, clamp01(c.wobble)) * lerp(1, 0.86, clamp01(c.thickness))
    );
  };
  const reach = () => R * (0.8 + clamp01(cfg?.tack ?? 0.5) * 1.6);

  const readColours = () => {
    tint = read(getComputedStyle(carrier).color);
    draw();
  };

  /** Inside the box with room for the focus ring around the decal. */
  const lo = () => R + EDGE;
  const hiX = () => Math.max(lo(), W - R - EDGE);
  const hiY = () => Math.max(lo(), H - R - EDGE);
  const clampAnchor = () => {
    ax = clamp(ax, lo(), hiX());
    ay = clamp(ay, lo(), hiY());
  };

  const placeButton = () => {
    const s = R * 2;
    button.style.width = `${Math.round(s)}px`;
    button.style.height = `${Math.round(s)}px`;
    button.style.transform = `translate(${Math.round((ax - R) * 10) / 10}px, ${Math.round((ay - R) * 10) / 10}px)`;
  };

  /** Every node straight onto its rest place, nothing moving. */
  const settle = () => {
    for (let i = 0; i < N; i += 1) {
      px[i] = ax + (rx[i] ?? 0);
      py[i] = ay + (ry[i] ?? 0);
      vx[i] = 0;
      vy[i] = 0;
      lift[i] = 0;
      liftV[i] = 0;
      liftT[i] = 0;
    }
  };

  const layout = () => {
    const c = cfg;
    if (!c) return;
    const key = c.shape;
    if (key !== shapeKey) {
      shapeKey = key;
      unit = outline(c.shape);
    }
    const nextR = clamp(c.size, 32, 400) / 2;
    R = Math.max(
      14,
      Math.min(nextR, Math.min(W, H) * 0.3, Math.min(W, H) / 2 - EDGE),
    );
    for (let i = 0; i < N; i += 1) {
      rx[i] = (unit.x[i] ?? 0) * R;
      ry[i] = (unit.y[i] ?? 0) * R;
    }
  };

  const measure = () => {
    const c = cfg;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const first = W === 0;
    const fx = W > 0 ? ax / W : (c?.home[0] ?? 0.5);
    const fy = H > 0 ? ay / H : (c?.home[1] ?? 0.5);
    W = w;
    H = h;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c?.dpr ?? 2, 0.5, 2));
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    layout();
    // The decal keeps its place as a fraction of the box.
    ax = fx * W;
    ay = fy * H;
    clampAnchor();
    if (first || mode === "stuck") settle();
    placeButton();
  };

  const fraction = (): [number, number] => [
    r3(W > 0 ? ax / W : 0.5),
    r3(H > 0 ? ay / H : 0.5),
  ];

  // ---------------------------------------------------------------- strings

  /** Which nodes already carry a string in this peel. */
  const tied = new Uint8Array(N);
  let tieOffset = 0;

  /** A new peel: a fresh, seeded pool. Strings are tied as the front reaches them. */
  const spawnStrands = () => {
    rand = lcg(Math.round(gx * 7 + gy * 13) + 5);
    tieOffset = Math.floor(rand() * 3);
    tied.fill(0);
    for (const s of strands) {
      if (s.snapped < 0) s.on = false;
    }
  };

  /** Ties strings along the peel front, where the gel is just coming away. */
  const growStrands = () => {
    const c = cfg;
    if (!c) return;
    const most = Math.round(lerp(6, MAX_STRINGS, clamp01(c.tack)));
    let live = 0;
    for (const s of strands) if (s.on && s.snapped < 0) live += 1;
    for (let i = tieOffset; i < N && live < most; i += 3) {
      const w = lift[i] ?? 0;
      if (tied[i] || w < 0.1 || w > 0.7) continue;
      const s = strands.find((x) => !x.on);
      if (!s) return;
      tied[i] = 1;
      s.on = true;
      s.node = i;
      s.f = 0.9 + rand() * 0.1;
      s.bx = ax + (rx[i] ?? 0) * s.f;
      s.by = ay + (ry[i] ?? 0) * s.f;
      s.reach = R * lerp(0.35, 0.95, clamp01(c.tack)) * (0.7 + rand() * 0.6);
      s.snapped = -1;
      s.due = -1;
      s.width = lerp(1.4, 3.2, clamp01(c.tack)) * (0.7 + rand() * 0.5);
      live += 1;
    }
  };

  let topX = 0;
  let topY = 0;
  /** Where a string's gel end is: at (or just inside) its node. Written to topX/topY. */
  const strandTop = (s: Strand) => {
    const nx = px[s.node] ?? ax;
    const ny = py[s.node] ?? ay;
    topX = ax + (nx - ax) * s.f;
    topY = ay + (ny - ay) * s.f;
  };

  const snap = (s: Strand) => {
    strandTop(s);
    s.sx = topX;
    s.sy = topY;
    s.snapped = 0;
    hooks.current.sound("plip", s.bx);
  };

  const stepStrands = (h: number) => {
    let live = false;
    for (const s of strands) {
      if (!s.on) continue;
      if (s.snapped >= 0) {
        s.snapped += h;
        if (s.snapped > 1.1) s.on = false;
        else live = true;
        continue;
      }
      live = true;
      if (s.due >= 0) {
        s.due -= h;
        if (s.due <= 0) {
          s.due = -1;
          snap(s);
        }
        continue;
      }
      const lifted = lift[s.node] ?? 0;
      if (lifted < 0.06) {
        // Laid back down before it snapped: it sinks back into the gel.
        if (mode !== "peel") s.on = false;
        continue;
      }
      strandTop(s);
      const len =
        Math.hypot(topX - s.bx, topY - s.by) +
        lifted * R * 0.25 * (0.5 + clamp01(cfg?.thickness ?? 0.5));
      if (len > s.reach) snap(s);
    }
    return live;
  };

  /** Let go: the last strings snap in quick succession. */
  const snapAll = () => {
    let k = 0;
    for (const s of strands) {
      if (!s.on || s.snapped >= 0 || s.due >= 0) continue;
      s.due = 0.001 + 0.03 * k;
      k += 1;
    }
  };

  // ---------------------------------------------------------------- physics

  const peelWeights = () => {
    // The peel front runs from the grab point across the decal as the pull
    // grows: what is behind it is up, what is ahead still clings.
    const front = peelAmount * 1.25;
    for (let i = 0; i < N; i += 1) {
      const d = Math.hypot((rx[i] ?? 0) - gx, (ry[i] ?? 0) - gy) / (2 * R);
      const w = 1 - smooth(front - 0.38, front, d);
      liftT[i] = w;
      const pull = Math.pow(w, 1.3);
      ex[i] = dragX * pull;
      ey[i] = dragY * pull;
    }
  };

  const step = (h: number) => {
    const c = cfg;
    if (!c) return false;
    const motion = c.motionSafe;
    let busy = false;
    const k = k0();
    const z = zeta();
    // Squash of a press, on the gel's own spring.
    if (motion) {
      squishV +=
        (-k * 1.4 * (squish - squishTarget) -
          2 * z * Math.sqrt(k * 1.4) * squishV) *
        h;
      squish += squishV * h;
    } else squish = squishTarget;
    if (Math.abs(squish - squishTarget) > 0.002 || Math.abs(squishV) > 0.02)
      busy = true;
    // Targets.
    if (mode === "peel") {
      peelWeights();
      growStrands();
    } else {
      const sag = mode === "held" ? R * 0.07 * (0.4 + clamp01(c.thickness)) : 0;
      for (let i = 0; i < N; i += 1) {
        const d = Math.hypot((rx[i] ?? 0) - gx, (ry[i] ?? 0) - gy) / (2 * R);
        ex[i] = 0;
        ey[i] = sag * d;
        liftT[i] = mode === "held" ? 1 : 0;
      }
    }
    if (squish > 0.001 || squishTarget > 0) {
      // A press: the gel flows away from the finger and spreads a little.
      for (let i = 0; i < N; i += 1) {
        const dx = (rx[i] ?? 0) - pressX;
        const dy = (ry[i] ?? 0) - pressY;
        const d = Math.hypot(dx, dy) || 1;
        const fall = Math.pow(clamp01(1 - d / (2.2 * R)), 1.4);
        const push = squish * R * (0.07 + 0.07 * clamp01(c.thickness)) * fall;
        ex[i] = (ex[i] ?? 0) + (dx / d) * push + (rx[i] ?? 0) * squish * 0.03;
        ey[i] = (ey[i] ?? 0) + (dy / d) * push + (ry[i] ?? 0) * squish * 0.03;
      }
    }
    // The anchor: 1:1 with the finger while held by a pointer; a keyboard
    // hold follows its target on the snap spring.
    if (mode === "held" && keyHeld) {
      const s = springs.snap;
      if (motion) {
        avx += ((-s.stiffness * (ax - kx) - s.damping * avx) / s.mass) * h;
        avy += ((-s.stiffness * (ay - ky) - s.damping * avy) / s.mass) * h;
        ax += avx * h;
        ay += avy * h;
      } else {
        ax = kx;
        ay = ky;
        avx = 0;
        avy = 0;
      }
      if (Math.hypot(ax - kx, ay - ky) > 0.1 || Math.hypot(avx, avy) > 1)
        busy = true;
      else if (glideHome) {
        glideHome = false;
        drop();
      }
    }
    // A keyboard peel plays itself out from the corner facing the light.
    if (mode === "peel" && keyPeel >= 0) {
      keyPeel += h;
      const u = clamp01(keyPeel / 0.46);
      const e = u * u * (3 - 2 * u);
      // Straight out from its edge, as far as the box allows; the script
      // lets go at its end even where the box is too small for a full pull.
      const len = Math.hypot(gx, gy) || 1;
      const pull = reach() * 1.04 * e;
      dragX =
        rubberClamp(ax + gx + (gx / len) * pull, EDGE, W - EDGE, R) - ax - gx;
      dragY =
        rubberClamp(ay + gy + (gy / len) * pull, EDGE, H - EDGE, R) - ay - gy;
      peelAmount =
        u >= 1 ? 1 : Math.min(0.99, Math.hypot(dragX, dragY) / reach());
      busy = true;
      if (peelAmount >= 1) letGo("key");
    }
    // Nodes: springs to their targets, plus a membrane that keeps the outline smooth.
    const grabR = R * 0.7;
    for (let i = 0; i < N; i += 1) {
      const close = Math.max(
        0,
        1 - Math.hypot((rx[i] ?? 0) - gx, (ry[i] ?? 0) - gy) / grabR,
      );
      stiff[i] = mode === "held" && !keyHeld ? k * (1 + 5 * close) : k;
    }
    for (let i = 0; i < N; i += 1) {
      const a = (i + N - 1) % N;
      const b = (i + 1) % N;
      const tx = ax + (rx[i] ?? 0) + (ex[i] ?? 0);
      const ty = ay + (ry[i] ?? 0) + (ey[i] ?? 0);
      const x = px[i] ?? tx;
      const y = py[i] ?? ty;
      if (mode === "peel" && (liftT[i] ?? 0) > 0.92) {
        // The part in the fingers is under them, 1:1.
        vx[i] = 0;
        vy[i] = 0;
        px[i] = tx;
        py[i] = ty;
        continue;
      }
      const ks = stiff[i] ?? k;
      const damp = 2 * z * Math.sqrt(ks);
      const lapX =
        ((px[a] ?? 0) + (px[b] ?? 0)) / 2 -
        x -
        (((rx[a] ?? 0) + (rx[b] ?? 0)) / 2 - (rx[i] ?? 0));
      const lapY =
        ((py[a] ?? 0) + (py[b] ?? 0)) / 2 -
        y -
        (((ry[a] ?? 0) + (ry[b] ?? 0)) / 2 - (ry[i] ?? 0));
      let nvx =
        (vx[i] ?? 0) + (ks * (tx - x) - damp * (vx[i] ?? 0) + 900 * lapX) * h;
      let nvy =
        (vy[i] ?? 0) + (ks * (ty - y) - damp * (vy[i] ?? 0) + 900 * lapY) * h;
      if (!motion) {
        // Reduced motion: no ring, the gel goes straight where it is asked.
        nvx = (tx - x) / Math.max(h, 0.05);
        nvy = (ty - y) / Math.max(h, 0.05);
      }
      vx[i] = nvx;
      vy[i] = nvy;
      px[i] = x + nvx * h;
      py[i] = y + nvy * h;
      if (
        Math.abs(tx - (px[i] ?? 0)) + Math.abs(ty - (py[i] ?? 0)) > 0.05 ||
        Math.abs(nvx) + Math.abs(nvy) > 0.5
      )
        busy = true;
    }
    // Lift per node, on a quick spring (snap constants scaled to the gel).
    const lk = mode === "stuck" ? springs.recoil.stiffness : 900;
    const lz = mode === "stuck" ? 0.6 : 0.85;
    for (let i = 0; i < N; i += 1) {
      const target = mode === "drop" ? fall : (liftT[i] ?? 0);
      if (!motion) {
        lift[i] = target;
        liftV[i] = 0;
        continue;
      }
      const v =
        (liftV[i] ?? 0) +
        (-lk * ((lift[i] ?? 0) - target) -
          2 * lz * Math.sqrt(lk) * (liftV[i] ?? 0)) *
          h;
      liftV[i] = v;
      lift[i] = Math.max(0, (lift[i] ?? 0) + v * h);
      if (Math.abs((lift[i] ?? 0) - target) > 0.003 || Math.abs(v) > 0.02)
        busy = true;
    }
    // The fall: down on the snap spring, a splat at the touch.
    if (mode === "drop") {
      const s = springs.snap;
      if (motion) {
        fallV += ((-s.stiffness * fall - s.damping * fallV) / s.mass) * h;
        fall = Math.max(0, fall + fallV * h);
      } else fall = Math.max(0, fall - h / 0.12);
      if (!landed && fall < 0.14) {
        landed = true;
        wet = 1;
        if (motion) {
          // The gel spreads as it meets the glass, then pulls back, two bounces.
          const kick = R * 3.6 * (0.6 + 0.6 * clamp01(c.thickness));
          for (let i = 0; i < N; i += 1) {
            const len = Math.hypot(rx[i] ?? 0, ry[i] ?? 0) || 1;
            vx[i] = (vx[i] ?? 0) + ((rx[i] ?? 0) / len) * kick * (len / R);
            vy[i] = (vy[i] ?? 0) + ((ry[i] ?? 0) / len) * kick * (len / R);
          }
        }
        if (!arrivalQuiet) hooks.current.sound("land", ax);
      }
      if (landed && fall < 0.002 && Math.abs(fallV) < 0.05) {
        mode = "stuck";
        fall = 0;
        fallV = 0;
        const at = fraction();
        const moved =
          Math.abs(at[0] - c.home[0]) > 0.0015 ||
          Math.abs(at[1] - c.home[1]) > 0.0015;
        if (!arrivalQuiet) hooks.current.stick(at, moved);
        arrivalQuiet = false;
      }
      busy = true;
    }
    if (wet > 0) {
      wet = Math.max(0, wet - h / 0.55);
      busy = true;
    }
    // Hover glint: the highlight leans a few px toward the pointer.
    if (motion) {
      glintX += (glintTX - glintX) * Math.min(1, h * 9);
      glintY += (glintTY - glintY) * Math.min(1, h * 9);
    } else {
      glintX = glintTX;
      glintY = glintTY;
    }
    if (Math.abs(glintX - glintTX) + Math.abs(glintY - glintTY) > 0.05)
      busy = true;
    if (stepStrands(h)) busy = true;
    return busy;
  };

  // ---------------------------------------------------------------- drawing

  const qx = new Float32Array(N);
  const qy = new Float32Array(N);

  /** Traces the outline through the nodes' midpoints, offset and lifted. */
  const trace = (
    g: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    byLift: number,
    scale = 1,
    cx = 0,
    cy = 0,
    begin = true,
  ) => {
    for (let j = 0; j < N; j += 1) {
      const l = (lift[j] ?? 0) * byLift;
      const x = (px[j] ?? 0) + ox - LX * l;
      const y = (py[j] ?? 0) + oy - LY * l;
      qx[j] = cx + (x - cx) * scale;
      qy[j] = cy + (y - cy) * scale;
    }
    if (begin) g.beginPath();
    g.moveTo(
      ((qx[0] ?? 0) + (qx[1] ?? 0)) / 2,
      ((qy[0] ?? 0) + (qy[1] ?? 0)) / 2,
    );
    for (let i = 1; i <= N; i += 1) {
      const a = i % N;
      const b = (i + 1) % N;
      const x = qx[a] ?? 0;
      const y = qy[a] ?? 0;
      g.quadraticCurveTo(x, y, (x + (qx[b] ?? 0)) / 2, (y + (qy[b] ?? 0)) / 2);
    }
    g.closePath();
  };

  const averageLift = () => {
    let s = 0;
    for (let i = 0; i < N; i += 1) s += lift[i] ?? 0;
    return s / N;
  };

  function draw() {
    const c = cfg;
    if (!ctx || !c || W < 1) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const thick = clamp01(c.thickness);
    const up = averageLift();
    const tpx = 1.2 + thick * 3.2;
    const light = mix(tint, 1, 0.45);
    const deep = mix(tint, 0, 0.38);

    // Beads left on the surface by snapped strings.
    for (const s of strands) {
      if (!s.on || s.snapped < 0.12) continue;
      ctx.fillStyle = rgba(tint, 0.45 * (1 - clamp01((s.snapped - 0.12) / 1)));
      ctx.beginPath();
      ctx.arc(s.bx, s.by, s.width * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // The cast light: a coloured glow through the gel, and a soft dark core,
    // both further off and softer the higher it is.
    const lifted = 1.5 + up * (8 + thick * 10);
    ctx.save();
    ctx.shadowColor = rgba(tint, 0.38);
    ctx.shadowBlur = (4 + up * 16) * dpr;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = rgba(tint, 0.16 + 0.1 * (1 - up));
    trace(ctx, -LX * lifted, -LY * lifted, 0);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.22)";
    ctx.shadowBlur = (2 + up * 12) * dpr;
    ctx.fillStyle = "rgb(0 0 0 / 0.12)";
    trace(ctx, -LX * lifted * 0.7, -LY * lifted * 0.7, 0, 0.97, ax, ay);
    ctx.fill();
    ctx.restore();

    // Strings of tack, from the surface to the gel's underside.
    ctx.lineCap = "round";
    for (const s of strands) {
      if (!s.on) continue;
      if (s.snapped >= 0) {
        topX = s.sx;
        topY = s.sy;
      } else strandTop(s);
      if (s.snapped < 0 && (lift[s.node] ?? 0) < 0.06) continue;
      const len = Math.hypot(topX - s.bx, topY - s.by);
      ctx.strokeStyle = rgba(mix(tint, 1, 0.18), 0.9);
      ctx.fillStyle = rgba(tint, 0.9);
      if (s.snapped < 0) {
        const strain = clamp01(len / s.reach);
        ctx.lineWidth = Math.max(0.8, s.width * (1 - 0.66 * strain));
        const mx = (s.bx + topX) / 2 + (topY - s.by) * 0.08;
        const my = (s.by + topY) / 2 - (topX - s.bx) * 0.08;
        ctx.beginPath();
        ctx.moveTo(s.bx, s.by);
        ctx.quadraticCurveTo(mx, my, topX, topY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.bx, s.by, s.width * 0.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.snapped < 0.12) {
        // Snapped: the surface half whips back into a bead on the glass;
        // the gel half is already lost in the gel.
        const u = clamp01(s.snapped / 0.12);
        const back = (1 - u) * (1 - u) * 0.3;
        ctx.lineWidth = Math.max(0.8, s.width * 0.6 * (1 - u));
        ctx.beginPath();
        ctx.moveTo(s.bx, s.by);
        ctx.lineTo(s.bx + (topX - s.bx) * back, s.by + (topY - s.by) * back);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.bx, s.by, s.width * (0.6 + 0.4 * u), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The side wall: the gel's thickness, showing more as it lifts.
    ctx.fillStyle = rgba(deep, 0.9);
    trace(ctx, -LX * tpx * 0.5, -LY * tpx * 0.5, R * 0.05 * (0.5 + thick));
    ctx.fill();

    // The body.
    const bodyLift = R * 0.12 * (0.5 + thick);
    ctx.fillStyle = rgba(mix(tint, 1, wet * 0.12), 0.84 + thick * 0.1);
    trace(ctx, 0, 0, bodyLift);
    ctx.fill();
    ctx.save();
    ctx.clip();
    // The thick edge: a light rim inside the outline, deeper on the side
    // away from the light, like light bending through a lens.
    const rim = 3 + thick * 7;
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(light, 0.55);
    ctx.lineWidth = rim * 2;
    trace(ctx, 0, 0, bodyLift);
    ctx.stroke();
    ctx.strokeStyle = rgba(deep, 0.42);
    ctx.lineWidth = rim * 1.6;
    trace(ctx, LX * rim * 0.9, LY * rim * 0.9, bodyLift);
    ctx.stroke();
    // Gloss: a soft sheet toward the light and one sharp spark.
    const gloss = clamp01(c.gloss);
    const sx = ax + LX * R * 0.34 + glintX - LX * squish * R * 0.08;
    const sy = ay + LY * R * 0.34 + glintY - LY * squish * R * 0.08;
    // The specular crescent: the body less a copy of itself shifted away
    // from the light, so a band of shine follows the lit edge exactly.
    const shift = rim * (1.5 + squish * 0.8);
    ctx.fillStyle = rgba([1, 1, 1], (0.28 + 0.34 * gloss) * (1 + wet * 0.5));
    trace(ctx, glintX * 0.3, glintY * 0.3, bodyLift, 0.94, sx, sy);
    trace(
      ctx,
      -LX * shift + glintX * 0.3,
      -LY * shift + glintY * 0.3,
      bodyLift,
      0.94,
      sx,
      sy,
      false,
    );
    ctx.fill("evenodd");
    // And a soft sheet over the lit half.
    const sheet = ctx.createLinearGradient(
      ax + LX * R,
      ay + LY * R,
      ax - LX * R * 0.2,
      ay - LY * R * 0.2,
    );
    sheet.addColorStop(0, rgba([1, 1, 1], 0.26 * gloss));
    sheet.addColorStop(1, rgba([1, 1, 1], 0));
    ctx.fillStyle = sheet;
    ctx.fillRect(ax - R * 1.3, ay - R * 1.3, R * 2.6, R * 2.6);
    ctx.fillStyle = rgba([1, 1, 1], 0.85 * gloss);
    ctx.beginPath();
    ctx.ellipse(
      ax + LX * R * 0.5 + glintX * 1.4,
      ay + LY * R * 0.5 + glintY * 1.4,
      R * 0.07 * (1 + squish * 0.4),
      R * 0.045,
      -0.6,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    placeButton();
  }

  // ------------------------------------------------------------------ loop

  const tick = (time: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
    last = time;
    ticking = true;
    wanted = false;
    acc += dt;
    let busy = false;
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      busy = step(STEP) || busy;
      acc -= STEP;
      steps += 1;
    }
    if (steps === 6) acc = 0;
    if (mode !== "stuck" || squishTarget > 0) busy = true;
    draw();
    ticking = false;
    if (busy || wanted) frame = window.requestAnimationFrame(tick);
    else {
      last = 0;
      acc = 0;
    }
  };

  function kick() {
    if (ticking) {
      wanted = true;
      return;
    }
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  }

  const reportPeel = () => {
    const v = Math.round(clamp01(peelAmount) * 20) / 20;
    if (v === peelReported) return;
    peelReported = v;
    hooks.current.peel(v);
  };

  function letGo(by: "pointer" | "key") {
    if (mode !== "peel") return;
    mode = "held";
    keyPeel = -1;
    keyHeld = by === "key";
    snapAll();
    // Re-express the gel around its new centre so nothing jumps: the grab
    // point stays where it is, the stuck side snaps up to it on its springs.
    if (by === "pointer") {
      ax += dragX;
      ay += dragY;
    } else {
      ax += dragX * 0.4;
      ay += dragY * 0.4;
      kx = startX;
      ky = startY;
      avx = 0;
      avy = 0;
    }
    dragX = 0;
    dragY = 0;
    peelAmount = 1;
    reportPeel();
    hooks.current.sound("gloop", ax);
    hooks.current.lift(by);
    kick();
  }

  const drop = () => {
    if (mode !== "held") return;
    clampAnchor();
    mode = "drop";
    keyHeld = false;
    fall = 1;
    fallV = 0;
    landed = false;
    peelAmount = 0;
    peelReported = -1;
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) return;
      if (
        !was ||
        was.dpr !== next.dpr ||
        was.size !== next.size ||
        was.shape !== next.shape
      ) {
        measure();
        if (mode === "stuck") settle();
      }
      if (!was || was.colourKey !== next.colourKey) readColours();
      // A host that moves the decal (or refuses a move) gets a lift, a glide
      // and a landing there.
      if (
        was &&
        mode === "stuck" &&
        W > 0 &&
        (Math.abs(next.home[0] * W - ax) > 1 ||
          Math.abs(next.home[1] * H - ay) > 1) &&
        (next.home[0] !== was.home[0] ||
          next.home[1] !== was.home[1] ||
          next.controlled)
      ) {
        startX = ax;
        startY = ay;
        mode = "held";
        keyHeld = true;
        for (let i = 0; i < N; i += 1) liftT[i] = 1;
        kx = clamp(next.home[0] * W, lo(), hiX());
        ky = clamp(next.home[1] * H, lo(), hiY());
        glideHome = true;
      }
      draw();
      kick();
    },
    resize() {
      measure();
      if (visible.current && !arrived && W > 0) {
        arrived = true;
        // First view: the decal is laid on the glass, a small splat and it clings.
        if (cfg?.motionSafe) {
          settle();
          mode = "drop";
          fall = 1;
          fallV = 0;
          landed = false;
          for (let i = 0; i < N; i += 1) lift[i] = 1;
          arrivalQuiet = true;
        }
      }
      draw();
      kick();
    },
    readColours,
    hover(x, y) {
      const c = cfg;
      if (!c || mode !== "stuck") return;
      const dx = clamp(x - ax, -R * 2, R * 2);
      const dy = clamp(y - ay, -R * 2, R * 2);
      glintTX = r3(dx * 0.05);
      glintTY = r3(dy * 0.05);
      kick();
    },
    press(x, y) {
      const c = cfg;
      if (!c || c.disabled || mode !== "stuck") return;
      pressX = clamp(x - ax, -R, R);
      pressY = clamp(y - ay, -R, R);
      gx = pressX;
      gy = pressY;
      squishTarget = 1;
      startX = ax;
      startY = ay;
      mode = "press";
      kick();
    },
    tap() {
      if (mode !== "press") return;
      squishTarget = 0;
      mode = "stuck";
      hooks.current.sound("blup", ax);
      kick();
    },
    peelStart() {
      if (mode !== "press") return;
      squishTarget = 0;
      mode = "peel";
      dragX = 0;
      dragY = 0;
      peelAmount = 0;
      peelReported = -1;
      spawnStrands();
      kick();
    },
    peelMove(dx, dy) {
      if (mode === "peel") {
        dragX = dx;
        dragY = dy;
        peelAmount = Math.hypot(dx, dy) / reach();
        reportPeel();
        if (peelAmount >= 1) letGo("pointer");
        kick();
      } else if (mode === "held" && !keyHeld) {
        // Held: the grab point stays under the finger, 1:1, and the decal
        // rubber-bands at the box's edges rather than leaving it.
        ax = rubberClamp(startX + dx, lo(), hiX(), R);
        ay = rubberClamp(startY + dy, lo(), hiY(), R);
        kick();
      }
    },
    release() {
      if (mode === "press") {
        squishTarget = 0;
        mode = "stuck";
      } else if (mode === "peel") {
        // Let go too soon: it lies back down and the strings shorten.
        mode = "stuck";
        peelAmount = 0;
        dragX = 0;
        dragY = 0;
        reportPeel();
        hooks.current.sound("blup", ax);
      } else if (mode === "held" && !glideHome) drop();
      kick();
    },
    keyLift() {
      const c = cfg;
      if (!c || c.disabled) return;
      if (mode === "held") {
        drop();
        return;
      }
      if (mode !== "stuck") return;
      startX = ax;
      startY = ay;
      // A thumbnail lifts the edge with the most room to pull it back over,
      // favouring the one facing the light.
      let best = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < N; i += 1) {
        const x = rx[i] ?? 0;
        const y = ry[i] ?? 0;
        const len = Math.hypot(x, y) || 1;
        const ux = x / len;
        const uy = y / len;
        const ex2 = ax + x;
        const ey2 = ay + y;
        const room = Math.min(
          ux > 0.01
            ? (W - EDGE - ex2) / ux
            : ux < -0.01
              ? (EDGE - ex2) / ux
              : 1e4,
          uy > 0.01
            ? (H - EDGE - ey2) / uy
            : uy < -0.01
              ? (EDGE - ey2) / uy
              : 1e4,
        );
        const score =
          Math.min(room, reach() * 1.1) + (x * LX + y * LY) * 0.15 + len * 0.1;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      gx = rx[best] ?? 0;
      gy = ry[best] ?? 0;
      if (!c.motionSafe) {
        mode = "held";
        keyHeld = true;
        kx = ax;
        ky = ay;
        peelAmount = 1;
        hooks.current.sound("gloop", ax);
        hooks.current.lift("key");
        kick();
        return;
      }
      mode = "peel";
      dragX = 0;
      dragY = 0;
      peelAmount = 0;
      keyPeel = 0;
      spawnStrands();
      kick();
    },
    keyMove(dx, dy) {
      if (mode !== "held" || !keyHeld) return;
      kx = clamp(kx + dx, lo(), hiX());
      ky = clamp(ky + dy, lo(), hiY());
      kick();
    },
    keyDrop() {
      if (mode === "held") drop();
    },
    keySquish() {
      const c = cfg;
      if (!c || c.disabled || mode !== "stuck") return;
      pressX = 0;
      pressY = 0;
      squishTarget = 1;
      mode = "press";
      kick();
      window.clearTimeout(squishTimer);
      squishTimer = window.setTimeout(() => {
        if (disposed || mode !== "press") return;
        squishTarget = 0;
        mode = "stuck";
        hooks.current.sound("blup", ax);
        kick();
      }, 140);
    },
    cancel() {
      // Escape: back where it was, lifted, glided and laid down again.
      if (mode === "peel") {
        mode = "stuck";
        keyPeel = -1;
        peelAmount = 0;
        dragX = 0;
        dragY = 0;
        reportPeel();
        kick();
        return true;
      }
      if (mode === "held") {
        keyHeld = true;
        kx = startX;
        ky = startY;
        glideHome = true;
        kick();
        return true;
      }
      return false;
    },
    mode: () => mode,
    hoverOut() {
      glintTX = 0;
      glintTY = 0;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(squishTimer);
    },
  };
}

/**
 * A thick gel window cling on any surface. Press it and it squishes away
 * from the finger and rings back; grab it and peel, and the part in your
 * fingers comes away 1:1 while the rest clings, the peel front running across
 * it as the pull grows, strings of tack stretching between the surface and
 * the lifted gel until each one snaps into two beads. Pull far enough and it
 * lets go — the last strings snap in a run — and hangs from your finger, its
 * far side catching up on its springs; let go and it falls flat, spreads as
 * it meets the surface and pulls back with two small bounces, and clings.
 *
 * The gel is a soft body of 72 nodes drawn on a canvas: a coloured light cast
 * through it, a side wall that shows its thickness, a lens-like rim and a
 * glossy highlight that leans toward the pointer. The decal is a real button:
 * Enter peels it from the corner facing the light, the arrows move it, Enter
 * or Space sticks it down, Escape puts it back. Under reduced motion it moves
 * without ringing, and lifts and lands with a short fade.
 */
export function GelCling({
  children,
  shape = "star",
  size = 112,
  thickness = 0.5,
  tack = 0.5,
  tint = "cherry",
  gloss = 0.7,
  wobble = 0.5,
  position,
  defaultPosition = [0.5, 0.5],
  onPositionChange,
  onPeel,
  onLift,
  onStick,
  label = "Gel decal",
  sound = false,
  disabled = false,
  dpr = 2,
  className,
}: GelClingProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const [own, setOwn] = React.useState<[number, number]>(defaultPosition);
  const home = position ?? own;
  const [lifted, setLifted] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const paint = (TINTS as Record<string, string>)[tint] ?? tint;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const latestProps = React.useRef({
    onPositionChange,
    onPeel,
    onLift,
    onStick,
    audio,
    controlled: position !== undefined,
  });
  const hooks = React.useRef<Hooks>({
    peel: (amount) => latestProps.current.onPeel?.(amount),
    lift: (by) => {
      setLifted(true);
      if (by === "key") {
        setSaid((s) => ({
          n: s.n + 1,
          text: "Lifted. Arrow keys move it; Enter sticks it down; Escape puts it back.",
        }));
      }
      latestProps.current.onLift?.();
    },
    stick: (at, moved) => {
      setLifted(false);
      const p = latestProps.current;
      if (moved) {
        if (!p.controlled) setOwn(at);
        p.onPositionChange?.(at);
      }
      setSaid((s) => ({
        n: s.n + 1,
        text: `Stuck at ${Math.round(at[0] * 100)}% across, ${Math.round(at[1] * 100)}% down.`,
      }));
      p.onStick?.(at);
    },
    sound: (kind, x) => {
      const node = rootRef.current;
      const pan = node
        ? panFrom(node.getBoundingClientRect().left + x, node)
        : 0;
      const a = latestProps.current.audio;
      const register = clamp(112 / Math.max(40, size), 0.7, 1.5);
      if (kind === "gloop")
        a.play("gloop", { pitch: register, pan, gain: 0.55 });
      else if (kind === "land")
        a.play("gloop", { pitch: register * 0.82, pan, gain: 0.62 });
      else if (kind === "blup")
        a.play("blup", { pitch: register * 1.1, pan, gain: 0.4 });
      else a.play("plip", { pitch: 1.2 + ((x * 0.37) % 0.5), pan, gain: 0.22 });
    },
  });

  const config: Config = {
    shape,
    size,
    thickness,
    tack,
    gloss,
    wobble,
    home,
    controlled: position !== undefined,
    disabled,
    dpr,
    motionSafe,
    colourKey: paint,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latestProps.current = {
      onPositionChange,
      onPeel,
      onLift,
      onStick,
      audio,
      controlled: position !== undefined,
    };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const button = buttonRef.current;
    const carrier = carrierRef.current;
    if (!root || !canvas || !button || !carrier) return;
    const e = createEngine(root, canvas, button, carrier, visible, hooks);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.resize();
    });
    watcher.observe(node);
    const onVisibility = () => {
      if (!document.hidden) engine.current?.resize();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: () => engine.current?.peelStart(),
    onMove: ({ offset }) => engine.current?.peelMove(offset.x, offset.y),
    onEnd: () => engine.current?.release(),
    onCancel: () => engine.current?.release(),
    onTap: () => engine.current?.tap(),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const e = engine.current;
    if (disabled || !e) return;
    const by = event.shiftKey ? 32 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const m = moves[event.key];
    if (m) {
      if (e.mode() === "held") {
        event.preventDefault();
        e.keyMove(m[0], m[1]);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) e.keyLift();
    } else if (event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      if (e.mode() === "held") e.keyDrop();
      else e.keySquish();
    } else if (event.key === "Escape") {
      if (e.cancel()) event.preventDefault();
    }
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        const at = local(event.clientX, event.clientY);
        engine.current?.hover(at.x, at.y);
      }}
      onPointerLeave={() => engine.current?.hoverOut()}
      className={cn(
        "group/gel-cling relative isolate h-56 w-full overflow-clip",
        className,
      )}
    >
      <div className="relative size-full">{children}</div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full"
      />
      <button
        ref={buttonRef}
        type="button"
        aria-roledescription="gel decal"
        aria-label={label}
        aria-pressed={lifted}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (engine.current?.mode() === "held") engine.current.keyDrop();
        }}
        onPointerDown={(event) => {
          if (disabled) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          const at = local(event.clientX, event.clientY);
          engine.current?.press(at.x, at.y);
          drag.onPointerDown(event);
        }}
        onPointerMove={drag.onPointerMove}
        onPointerUp={(event) => {
          drag.onPointerUp(event);
          engine.current?.release();
        }}
        onPointerCancel={drag.onPointerCancel}
        onLostPointerCapture={drag.onLostPointerCapture}
        className={cn(
          "absolute top-0 left-0 z-20 touch-none rounded-[32%] outline-none select-none",
          disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ width: Math.round(size), height: Math.round(size) }}
      />
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: paint }}
      />
      <span id={hintId} className="sr-only">
        Press to squish it. Drag a corner to peel it off and drop it anywhere.
        Enter lifts it, the arrow keys move it, Enter or Space sticks it down,
        Escape puts it back.
      </span>
      <span aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
