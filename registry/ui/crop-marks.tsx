"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/** A frame as fractions (0 to 1) of the picture it sits on. */
export type CropRect = { x: number; y: number; width: number; height: number };
export type CropMarksAspect = "free" | "1:1" | "4:3" | "3:2" | "16:9";
export type CropMarksGrid = "thirds" | "golden" | "quarters" | "none";
export type CropMarksSize = "sm" | "md" | "lg";

export type CropMarksProps = {
  /** Controlled frame, as fractions of the picture. */
  value?: CropRect;
  /** Initial frame when uncontrolled. @default { x: 0.15, y: 0.15, width: 0.7, height: 0.7 } */
  defaultValue?: CropRect;
  /**
   * Fires with the settled frame from the release, key or aspect change that
   * set it, and its size in source units (`sourceSize`, else the picture's px).
   */
  onValueChange?: (
    value: CropRect,
    size: { width: number; height: number },
  ) => void;
  /** A locked width ÷ height, by name or as a number. Shift locks the current one for a drag. @default "free" */
  aspect?: CropMarksAspect | number;
  /** The magnet's reach, in px: edges released this close to a snap line settle onto it. 0 turns it off. @default 10 */
  snap?: number;
  /** The lines it snaps to besides the picture's edges and centre, ticked in the margin. @default "thirds" */
  grid?: CropMarksGrid;
  /** One arrow key's move or resize, as a fraction of the picture. Alt moves ten. @default 0.01 */
  step?: number;
  /** The smallest frame a release leaves, in px. @default 24 */
  minSize?: number;
  /** How dark the picture is outside the frame, 0 to 1. @default 0.5 */
  dim?: number;
  /** The source's size for the W × H readout. @default the picture's own pixels */
  sourceSize?: { width: number; height: number };
  /** The frame's accessible name. @default "Crop frame" */
  label?: string;
  /** The crop marks' colour. @default white, blended by difference so it reads on any picture */
  color?: string;
  /** The snap guides' colour. @default "var(--accent-bright)" */
  guideColor?: string;
  /** Mark length (8, 12 or 16px) and the sheet's margin. @default "md" */
  size?: CropMarksSize;
  /** Tick as the frame settles on a line. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  /** Sizes the sheet. @default "h-[220px] w-full" */
  className?: string;
  /** The picture, filling the area inside the margin. */
  children?: React.ReactNode;
};

type Px = { l: number; t: number; r: number; b: number };
type Zone = "draw" | "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
type Drag = {
  zone: Zone;
  start: Px;
  /** The press, in px inside the picture: where a drawn frame grows from. */
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  shift: boolean;
  alt: boolean;
  cancelled: boolean;
  /** The guides lit last move, as a key, so a new one is heard once. */
  lit: string;
};
type Snapped = { px: Px; xs: number[]; ys: number[] };
type Api = {
  keys: (event: KeyboardEvent) => void;
  reshapeToRatio: () => void;
  drop: () => void;
};

const SIZES: Record<CropMarksSize, { arm: number; margin: number }> = {
  sm: { arm: 8, margin: 14 },
  md: { arm: 12, margin: 18 },
  lg: { arm: 16, margin: 24 },
};
/** Between a corner and its marks, like the gap a printer leaves off the trim. */
const GAP = 3;
/** The marks reach this much further while the frame is in the hand. */
const STRETCH = 1.25;
const GRID_LINES: Record<CropMarksGrid, number[]> = {
  thirds: [1 / 3, 2 / 3],
  golden: [0.382, 0.618],
  quarters: [0.25, 0.75],
  none: [],
};
const RATIOS: Record<Exclude<CropMarksAspect, "free">, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
};
const DEFAULT_RECT: CropRect = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };
const POOL = 5;
const CURSORS: Record<Zone, string> = {
  draw: "crosshair",
  move: "move",
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const pct = (v: number) => `${r3(v * 100)}%`;

const ratioOf = (aspect: CropMarksAspect | number): number | null => {
  if (typeof aspect === "number") return aspect > 0 ? aspect : null;
  if (aspect === "free") return null;
  return RATIOS[aspect] ?? null;
};

const sidesOf = (zone: Zone) => ({
  n: zone === "n" || zone === "nw" || zone === "ne",
  s: zone === "s" || zone === "sw" || zone === "se",
  w: zone === "w" || zone === "nw" || zone === "sw",
  e: zone === "e" || zone === "ne" || zone === "se",
});

const sameRect = (a: CropRect, b: CropRect) =>
  Math.abs(a.x - b.x) < 1e-4 &&
  Math.abs(a.y - b.y) < 1e-4 &&
  Math.abs(a.width - b.width) < 1e-4 &&
  Math.abs(a.height - b.height) < 1e-4;

const cleanRect = (r: CropRect): CropRect => {
  const width = clamp(r.width, 0.001, 1);
  const height = clamp(r.height, 0.001, 1);
  return {
    x: r4(clamp(r.x, 0, 1 - width)),
    y: r4(clamp(r.y, 0, 1 - height)),
    width: r4(width),
    height: r4(height),
  };
};

/** Where the press landed: a corner, an edge, inside, or the picture to draw on. */
function zoneAt(x: number, y: number, p: Px, touch: boolean): Zone {
  const corner = touch ? 20 : 14;
  const edge = touch ? 12 : 8;
  const near = (ax: number, ay: number) => Math.hypot(x - ax, y - ay) <= corner;
  if (near(p.l, p.t)) return "nw";
  if (near(p.r, p.t)) return "ne";
  if (near(p.l, p.b)) return "sw";
  if (near(p.r, p.b)) return "se";
  const inX = x > p.l - edge && x < p.r + edge;
  const inY = y > p.t - edge && y < p.b + edge;
  if (inY && Math.abs(x - p.l) <= edge) return "w";
  if (inY && Math.abs(x - p.r) <= edge) return "e";
  if (inX && Math.abs(y - p.t) <= edge) return "n";
  if (inX && Math.abs(y - p.b) <= edge) return "s";
  if (x > p.l && x < p.r && y > p.t && y < p.b) return "move";
  return "draw";
}

/**
 * The frame under the hand, from where the drag began and how far it has
 * gone: 1:1, rubber-banded past the picture's edge, the aspect kept when
 * locked (anchored at the opposite corner, or the centre with Alt).
 */
function shape(
  d: Drag,
  W: number,
  H: number,
  ratio: number | null,
  minPx: number,
): Px {
  const s = d.start;
  if (d.zone === "move") {
    const w = s.r - s.l;
    const h = s.b - s.t;
    const over = (v: number, lo: number, hi: number, dim: number) =>
      v < lo
        ? lo + rubberband(v - lo, dim)
        : v > hi
          ? hi + rubberband(v - hi, dim)
          : v;
    const l = over(s.l + d.dx, 0, W - w, W);
    const t = over(s.t + d.dy, 0, H - h, H);
    return { l, t, r: l + w, b: t + h };
  }
  if (d.zone === "draw") {
    const px = clamp(d.ax + d.dx, 0, W);
    const py = clamp(d.ay + d.dy, 0, H);
    let hw = px - d.ax;
    let hh = py - d.ay;
    if (ratio) {
      const aw = Math.abs(hw);
      const ah = Math.abs(hh);
      if (aw / Math.max(ah, 1e-6) > ratio)
        hh = (hh < 0 ? -1 : 1) * (aw / ratio);
      else hw = (hw < 0 ? -1 : 1) * ah * ratio;
    }
    if (d.alt) {
      return {
        l: d.ax - Math.abs(hw),
        r: d.ax + Math.abs(hw),
        t: d.ay - Math.abs(hh),
        b: d.ay + Math.abs(hh),
      };
    }
    return {
      l: Math.min(d.ax, d.ax + hw),
      r: Math.max(d.ax, d.ax + hw),
      t: Math.min(d.ay, d.ay + hh),
      b: Math.max(d.ay, d.ay + hh),
    };
  }
  const side = sidesOf(d.zone);
  let { l, t, r, b } = s;
  if (side.w) {
    l = s.l + d.dx;
    if (d.alt) r = s.r - d.dx;
  }
  if (side.e) {
    r = s.r + d.dx;
    if (d.alt) l = s.l - d.dx;
  }
  if (side.n) {
    t = s.t + d.dy;
    if (d.alt) b = s.b - d.dy;
  }
  if (side.s) {
    b = s.b + d.dy;
    if (d.alt) t = s.t - d.dy;
  }
  const cx = (s.l + s.r) / 2;
  const cy = (s.t + s.b) / 2;
  // An edge never passes its partner: the frame holds at the smallest size.
  if (r - l < minPx) {
    if (d.alt) [l, r] = [cx - minPx / 2, cx + minPx / 2];
    else if (side.w) l = r - minPx;
    else r = l + minPx;
  }
  if (b - t < minPx) {
    if (d.alt) [t, b] = [cy - minPx / 2, cy + minPx / 2];
    else if (side.n) t = b - minPx;
    else b = t + minPx;
  }
  if (ratio) {
    let w = r - l;
    let h = b - t;
    const both = (side.w || side.e) && (side.n || side.s);
    if (both) {
      if (w / h > ratio) h = w / ratio;
      else w = h * ratio;
    } else if (side.w || side.e) h = w / ratio;
    else w = h * ratio;
    if (d.alt || !(side.w || side.e)) [l, r] = [cx - w / 2, cx + w / 2];
    else if (side.w) l = r - w;
    else r = l + w;
    if (d.alt || !(side.n || side.s)) [t, b] = [cy - h / 2, cy + h / 2];
    else if (side.n) t = b - h;
    else b = t + h;
  }
  const band = (v: number, lo: number, hi: number, dim: number) =>
    v < lo
      ? lo + rubberband(v - lo, dim)
      : v > hi
        ? hi + rubberband(v - hi, dim)
        : v;
  return {
    l: band(l, 0, W, W),
    r: band(r, 0, W, W),
    t: band(t, 0, H, H),
    b: band(b, 0, H, H),
  };
}

/** Back inside the picture, at least `minPx`, at the ratio — keeping the anchored side. */
function contain(
  p: Px,
  zone: Zone,
  d: Drag | null,
  W: number,
  H: number,
  ratio: number | null,
  minPx: number,
): Px {
  if (zone === "move") {
    const w = Math.min(p.r - p.l, W);
    const h = Math.min(p.b - p.t, H);
    const l = clamp(p.l, 0, W - w);
    const t = clamp(p.t, 0, H - h);
    return { l, t, r: l + w, b: t + h };
  }
  const l0 = clamp(p.l, 0, W);
  const r0 = clamp(p.r, 0, W);
  const t0 = clamp(p.t, 0, H);
  const b0 = clamp(p.b, 0, H);
  const minW = Math.min(minPx, W);
  const minH = Math.min(minPx, H);
  let w = Math.max(r0 - l0, minW);
  let h = Math.max(b0 - t0, minH);
  if (ratio) {
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
    if (w < minW) [w, h] = [minW, minW / ratio];
    if (h < minH) [w, h] = [minH * ratio, minH];
    if (w > W) [w, h] = [W, W / ratio];
    if (h > H) [w, h] = [H * ratio, H];
  }
  const side =
    zone === "draw" && d
      ? {
          w: Math.abs(l0 - d.ax) > Math.abs(r0 - d.ax),
          e: Math.abs(r0 - d.ax) >= Math.abs(l0 - d.ax),
          n: Math.abs(t0 - d.ay) > Math.abs(b0 - d.ay),
          s: Math.abs(b0 - d.ay) >= Math.abs(t0 - d.ay),
        }
      : sidesOf(zone);
  const alt = d?.alt ?? false;
  let l: number;
  if (alt || side.w === side.e) l = (l0 + r0) / 2 - w / 2;
  else l = side.w ? r0 - w : l0;
  let t: number;
  if (alt || side.n === side.s) t = (t0 + b0) / 2 - h / 2;
  else t = side.n ? b0 - h : t0;
  l = clamp(l, 0, W - w);
  t = clamp(t, 0, H - h);
  return { l, t, r: l + w, b: t + h };
}

/**
 * The magnet. Moving, the frame shifts so its nearest edge or centre lands
 * on a line; resizing, each moving edge lands on its own; with a locked
 * ratio the frame scales about its anchor to the nearest line instead, so
 * the ratio survives. Returns the lines it now sits on.
 */
function magnet(
  p: Px,
  zone: Zone,
  d: Drag | null,
  lines: number[],
  W: number,
  H: number,
  radius: number,
  ratio: number | null,
  minPx: number,
): Snapped {
  const touching = (q: Px) => {
    const xs: number[] = [];
    const ys: number[] = [];
    lines.forEach((f, i) => {
      const x = f * W;
      const y = f * H;
      const cx = (q.l + q.r) / 2;
      const cy = (q.t + q.b) / 2;
      const onX = [q.l, q.r, ...(zone === "move" ? [cx] : [])];
      const onY = [q.t, q.b, ...(zone === "move" ? [cy] : [])];
      if (onX.some((v) => Math.abs(v - x) < 0.5)) xs.push(i);
      if (onY.some((v) => Math.abs(v - y) < 0.5)) ys.push(i);
    });
    return { xs, ys };
  };
  if (radius <= 0) return { px: p, xs: [], ys: [] };
  const best = (positions: number[], size: number) => {
    let found = { d: radius + 1e-6, delta: 0, hit: false };
    for (const pos of positions) {
      for (const f of lines) {
        const delta = f * size - pos;
        if (Math.abs(delta) < found.d) {
          found = { d: Math.abs(delta), delta, hit: true };
        }
      }
    }
    return found;
  };
  if (zone === "move") {
    const bx = best([p.l, (p.l + p.r) / 2, p.r], W);
    const by = best([p.t, (p.t + p.b) / 2, p.b], H);
    const q = {
      l: p.l + bx.delta,
      r: p.r + bx.delta,
      t: p.t + by.delta,
      b: p.b + by.delta,
    };
    if (q.l < -0.5 || q.r > W + 0.5) [q.l, q.r] = [p.l, p.r];
    if (q.t < -0.5 || q.b > H + 0.5) [q.t, q.b] = [p.t, p.b];
    return { px: q, ...touching(q) };
  }
  const side =
    zone === "draw" ? { n: true, s: true, w: true, e: true } : sidesOf(zone);
  if (!ratio) {
    const q = { ...p };
    const edge = (key: keyof Px, pos: number, size: number) => {
      const b = best([pos], size);
      if (!b.hit) return;
      const next = { ...q, [key]: pos + b.delta };
      if (next.r - next.l >= minPx - 0.5 && next.b - next.t >= minPx - 0.5) {
        q[key] = pos + b.delta;
      }
    };
    if (side.w) edge("l", q.l, W);
    if (side.e) edge("r", q.r, W);
    if (side.n) edge("t", q.t, H);
    if (side.s) edge("b", q.b, H);
    return { px: q, ...touching(q) };
  }
  // Locked: scale about the anchor so one moving edge lands on its line.
  const alt = d?.alt ?? false;
  const drawSide =
    zone === "draw" && d
      ? {
          w: Math.abs(p.l - d.ax) > Math.abs(p.r - d.ax),
          n: Math.abs(p.t - d.ay) > Math.abs(p.b - d.ay),
        }
      : null;
  const ax = alt
    ? (p.l + p.r) / 2
    : drawSide
      ? drawSide.w
        ? p.r
        : p.l
      : side.w && !side.e
        ? p.r
        : side.e && !side.w
          ? p.l
          : (p.l + p.r) / 2;
  const ay = alt
    ? (p.t + p.b) / 2
    : drawSide
      ? drawSide.n
        ? p.b
        : p.t
      : side.n && !side.s
        ? p.b
        : side.s && !side.n
          ? p.t
          : (p.t + p.b) / 2;
  let pick: { d: number; k: number } = { d: radius + 1e-6, k: 1 };
  const tryEdge = (pos: number, anchor: number, size: number) => {
    if (Math.abs(pos - anchor) < 1) return;
    for (const f of lines) {
      const delta = f * size - pos;
      if (Math.abs(delta) >= pick.d) continue;
      const k = (f * size - anchor) / (pos - anchor);
      if (k <= 0) continue;
      const q = {
        l: ax + (p.l - ax) * k,
        r: ax + (p.r - ax) * k,
        t: ay + (p.t - ay) * k,
        b: ay + (p.b - ay) * k,
      };
      const fits =
        q.l >= -0.5 && q.t >= -0.5 && q.r <= W + 0.5 && q.b <= H + 0.5;
      const big = q.r - q.l >= minPx - 0.5 && q.b - q.t >= minPx - 0.5;
      if (fits && big) pick = { d: Math.abs(delta), k };
    }
  };
  for (const pos of [p.l, p.r]) tryEdge(pos, ax, W);
  for (const pos of [p.t, p.b]) tryEdge(pos, ay, H);
  const k = pick.k;
  const q = {
    l: ax + (p.l - ax) * k,
    r: ax + (p.r - ax) * k,
    t: ay + (p.t - ay) * k,
    b: ay + (p.b - ay) * k,
  };
  return { px: q, ...touching(q) };
}

const describe = (r: CropRect) =>
  `Frame ${Math.round(r.width * 100)}% wide and ${Math.round(r.height * 100)}% tall, ${Math.round(r.x * 100)}% from the left and ${Math.round(r.y * 100)}% from the top`;

/**
 * A selection frame laid out like a print sheet. The picture sits inset on
 * the sheet's margin; the frame over it is marked the way a printer marks a
 * trim — two short arms off each corner continuing its edges past a small
 * gap, and a centre mark off each edge — and the picture outside it is
 * dimmed. Ruler ticks in the margin show the lines it snaps to.
 *
 * Press on the picture and drag to draw a new frame from that point; drag
 * inside to move it, on a corner or an edge to resize it. Shift keeps the
 * aspect, Alt works from the centre. The hand is never pulled: while you
 * drag, every snap line within `snap` px of an edge only lights up. On
 * release the frame settles onto the lit lines on the snap spring — one
 * crisp overshoot — the marks, stretched while it was held, draw back in on
 * the same spring, and each line it caught flashes and fades with a tick.
 *
 * The frame is a focusable group: arrow keys move it, Shift with an arrow
 * resizes it, Alt moves ten steps, Home centres it, and a key that would
 * cross a snap line stops on it first. Under reduced motion the hand still
 * draws 1:1 and the frame lands on its lines at once, without the spring.
 */
export function CropMarks({
  value,
  defaultValue = DEFAULT_RECT,
  onValueChange,
  aspect = "free",
  snap = 10,
  grid = "thirds",
  step = 0.01,
  minSize = 24,
  dim = 0.5,
  sourceSize,
  label = "Crop frame",
  color,
  guideColor = "var(--accent-bright)",
  size = "md",
  sound = false,
  disabled = false,
  className,
  children,
}: CropMarksProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const geo = SIZES[size] ?? SIZES.md;
  const ratio = ratioOf(aspect);
  const radius = Math.max(0, snap);
  const lines = React.useMemo(
    () =>
      [0, 0.5, 1, ...(GRID_LINES[grid] ?? [])]
        .sort((a, b) => a - b)
        .slice(0, POOL),
    [grid],
  );

  const [own, setOwn] = React.useState(() => cleanRect(defaultValue));
  const [check, setCheck] = React.useState(0);
  const [active, setActive] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [spoken, setSpoken] = React.useState("");
  const controlled = value !== undefined;
  const current = controlled ? cleanRect(value) : own;

  const fx = useMotionValue(current.x);
  const fy = useMotionValue(current.y);
  const fw = useMotionValue(current.width);
  const fh = useMotionValue(current.height);
  const arm = useMotionValue(geo.arm);
  const boxW = useMotionValue(0);
  const boxH = useMotionValue(0);
  const chip = useMotionValue(0);
  const [guides] = React.useState(() => ({
    x: Array.from({ length: POOL }, () => motionValue(0)),
    y: Array.from({ length: POOL }, () => motionValue(0)),
  }));

  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const box = React.useRef({ w: 0, h: 0 });
  const drag = React.useRef<Drag | null>(null);
  const shown = React.useRef<CropRect>(current);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const api = React.useRef<Api | null>(null);
  const measured = React.useRef(false);
  const [ready, setReady] = React.useState(false);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };
  const halt = (key: string) => {
    running.current.get(key)?.stop();
    running.current.delete(key);
  };

  const pxOf = (): Px => {
    const { w, h } = box.current;
    return {
      l: fx.get() * w,
      t: fy.get() * h,
      r: (fx.get() + fw.get()) * w,
      b: (fy.get() + fh.get()) * h,
    };
  };
  const rectOf = (p: Px): CropRect => {
    const { w, h } = box.current;
    return cleanRect({
      x: p.l / w,
      y: p.t / h,
      width: (p.r - p.l) / w,
      height: (p.b - p.t) / h,
    });
  };
  const write = (p: Px) => {
    const { w, h } = box.current;
    if (w <= 0 || h <= 0) return;
    for (const k of ["x", "y", "w", "h"]) halt(k);
    fx.set(r4(p.l / w));
    fy.set(r4(p.t / h));
    fw.set(r4((p.r - p.l) / w));
    fh.set(r4((p.b - p.t) / h));
  };

  /** The frame goes to a rect: the house snap from the hand, glide from a host. */
  const settleTo = (
    to: CropRect,
    how: "snap" | "glide" | "instant",
    velocity: { x: number; y: number } = { x: 0, y: 0 },
  ) => {
    const pairs: [string, MotionValue<number>, number, number][] = [
      ["x", fx, to.x, velocity.x],
      ["y", fy, to.y, velocity.y],
      ["w", fw, to.width, 0],
      ["h", fh, to.height, 0],
    ];
    for (const [key, mv, target, v] of pairs) {
      if (how === "instant" || !motionSafe) {
        halt(key);
        mv.jump(target);
        continue;
      }
      const spring = how === "snap" ? springs.snap : springs.glide;
      run(key, animate(mv, target, { ...spring, velocity: v }));
    }
  };

  const flash = (xs: number[], ys: number[]) => {
    const pools: [string, MotionValue<number>[], number[]][] = [
      ["x", guides.x, xs],
      ["y", guides.y, ys],
    ];
    for (const [axis, pool, caught] of pools) {
      pool.forEach((g, i) => {
        const key = `guide-${axis}${i}`;
        if (caught.includes(i)) {
          g.jump(0.95);
          run(
            key,
            animate(g, 0, {
              duration: durations.page,
              delay: motionSafe ? 0.12 : 0,
              ease: easings.enter,
            }),
          );
        } else if (g.get() > 0) {
          run(
            key,
            animate(g, 0, { duration: durations.fast, ease: easings.exit }),
          );
        }
      });
    }
    const heard = [...xs.map((i) => lines[i]), ...ys.map((i) => lines[i])];
    heard.forEach((f, n) => {
      const pitch = f === 0.5 ? 1.2 : f === 0 || f === 1 ? 0.85 : 1;
      timers.current.push(
        window.setTimeout(
          () => audio.play("tick", { pitch, gain: 0.5 }),
          n * 45,
        ),
      );
    });
  };

  const commit = (next: CropRect) => {
    const clean = cleanRect(next);
    shown.current = clean;
    if (sameRect(clean, current)) return;
    setSpoken(describe(clean));
    if (!controlled) setOwn(clean);
    const { w, h } = box.current;
    onValueChange?.(clean, {
      width: Math.round(clean.width * (sourceSize?.width ?? w)),
      height: Math.round(clean.height * (sourceSize?.height ?? h)),
    });
    // A controlled host answers on its own schedule; once it has had its
    // turn, a host that refused gets its own frame back.
    if (controlled) React.startTransition(() => setCheck((c) => c + 1));
  };

  const lightGuides = (d: Drag, p: Px) => {
    const { w, h } = box.current;
    const hint = magnet(p, d.zone, d, lines, w, h, radius, ratio, minSize);
    const key = `${hint.xs.join(",")}|${hint.ys.join(",")}`;
    guides.x.forEach((g, i) => g.set(hint.xs.includes(i) ? 0.38 : 0));
    guides.y.forEach((g, i) => g.set(hint.ys.includes(i) ? 0.38 : 0));
    if (key !== d.lit && (hint.xs.length || hint.ys.length)) {
      audio.play("tick", { pitch: 1.4, gain: 0.18 });
    }
    d.lit = key;
  };

  const reshape = () => {
    const d = drag.current;
    if (!d || d.cancelled) return;
    const { w, h } = box.current;
    const locked =
      ratio ??
      (d.shift
        ? (d.start.r - d.start.l) / Math.max(1, d.start.b - d.start.t)
        : null);
    const p = shape(d, w, h, locked, minSize);
    write(p);
    lightGuides(d, p);
  };

  const endDrag = (velocity: { x: number; y: number }) => {
    const d = drag.current;
    drag.current = null;
    setActive(false);
    if (!d || d.cancelled) return;
    const { w, h } = box.current;
    const locked =
      ratio ??
      (d.shift
        ? (d.start.r - d.start.l) / Math.max(1, d.start.b - d.start.t)
        : null);
    const inside = contain(pxOf(), d.zone, d, w, h, locked, minSize);
    const snapped = magnet(
      inside,
      d.zone,
      d,
      lines,
      w,
      h,
      radius,
      locked,
      minSize,
    );
    const target = rectOf(snapped.px);
    settleTo(
      target,
      "snap",
      d.zone === "move"
        ? { x: r3(velocity.x / w), y: r3(velocity.y / h) }
        : undefined,
    );
    if (motionSafe) run("arm", animate(arm, geo.arm, springs.snap));
    else arm.jump(geo.arm);
    flash(snapped.xs, snapped.ys);
    commit(target);
  };

  const cancelDrag = () => {
    const d = drag.current;
    if (!d || d.cancelled) return;
    d.cancelled = true;
    setActive(false);
    for (const g of [...guides.x, ...guides.y]) g.set(0);
    settleTo(rectOf(d.start), "glide");
    if (motionSafe) run("arm", animate(arm, geo.arm, springs.glide));
    else arm.jump(geo.arm);
  };

  const gesture = useDrag({
    threshold: 3,
    disabled,
    onStart: () => {
      const d = drag.current;
      if (!d) return;
      d.start = pxOf();
      setActive(true);
      if (d.zone === "draw") {
        // The old frame is let go of; the new one grows out of the press.
        write({ l: d.ax, t: d.ay, r: d.ax, b: d.ay });
      }
      if (motionSafe)
        run("arm", animate(arm, geo.arm * STRETCH, springs.flick));
    },
    onMove: ({ offset, event }) => {
      const d = drag.current;
      if (!d || d.cancelled) return;
      d.dx = offset.x;
      d.dy = offset.y;
      d.shift = event.shiftKey;
      d.alt = event.altKey;
      reshape();
    },
    onEnd: ({ velocity }) => endDrag(velocity),
    onCancel: () => {
      cancelDrag();
      drag.current = null;
    },
    onTap: () => {
      drag.current = null;
      frameRef.current?.focus({ preventScroll: true });
    },
  });

  const local = (event: React.PointerEvent) => {
    const r = areaRef.current?.getBoundingClientRect();
    return r
      ? { x: event.clientX - r.left, y: event.clientY - r.top }
      : { x: 0, y: 0 };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || box.current.w <= 0) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event);
    const p = pxOf();
    drag.current = {
      zone: zoneAt(at.x, at.y, p, event.pointerType !== "mouse"),
      start: p,
      ax: clamp(at.x, 0, box.current.w),
      ay: clamp(at.y, 0, box.current.h),
      dx: 0,
      dy: 0,
      shift: event.shiftKey,
      alt: event.altKey,
      cancelled: false,
      lit: "",
    };
    gesture.onPointerDown(event);
  };

  const onHover = (event: React.PointerEvent<HTMLDivElement>) => {
    gesture.onPointerMove(event);
    const area = areaRef.current;
    if (!area || drag.current || event.pointerType !== "mouse") return;
    const at = local(event);
    area.style.cursor = disabled
      ? "default"
      : CURSORS[zoneAt(at.x, at.y, pxOf(), false)];
  };

  /** One key: move or resize by a step, stopping on any snap line it would cross. */
  const onKey = (event: KeyboardEvent) => {
    if (disabled) return;
    const { w, h } = box.current;
    if (w <= 0 || h <= 0) return;
    if (event.key === "Home") {
      event.preventDefault();
      const r = shown.current;
      const target = cleanRect({
        ...r,
        x: (1 - r.width) / 2,
        y: (1 - r.height) / 2,
      });
      settleTo(target, "glide");
      flash([lines.indexOf(0.5)], [lines.indexOf(0.5)]);
      commit(target);
      return;
    }
    const dir =
      event.key === "ArrowLeft"
        ? [-1, 0]
        : event.key === "ArrowRight"
          ? [1, 0]
          : event.key === "ArrowUp"
            ? [0, -1]
            : event.key === "ArrowDown"
              ? [0, 1]
              : null;
    if (!dir) return;
    event.preventDefault();
    const [sx = 0, sy = 0] = dir;
    const amount = step * (event.altKey ? 10 : 1);
    const r = shown.current;
    // The first snap line between here and there, for the given edge offsets.
    const detent = (from: number, to: number, offsets: number[]) => {
      if (radius <= 0) return { at: to, line: -1 };
      let best = { at: to, line: -1, d: Infinity };
      lines.forEach((f, i) => {
        for (const off of offsets) {
          const a = from + off;
          const b = to + off;
          const crosses = (a < f - 1e-4 && b >= f) || (a > f + 1e-4 && b <= f);
          if (crosses && Math.abs(f - a) < best.d) {
            best = { at: f - off, line: i, d: Math.abs(f - a) };
          }
        }
      });
      return best;
    };
    let next: CropRect = r;
    const xs: number[] = [];
    const ys: number[] = [];
    if (event.shiftKey) {
      const minW = minSize / w;
      const minH = minSize / h;
      if (sx !== 0) {
        const want = clamp(r.x + r.width + sx * amount, r.x + minW, 1);
        const stop = detent(r.x + r.width, want, [0]);
        let width = stop.at - r.x;
        let height = r.height;
        if (ratio) height = (width * w) / (ratio * h);
        if (r.y + height > 1) {
          height = 1 - r.y;
          if (ratio) width = (height * h * ratio) / w;
        }
        next = { ...r, width, height };
        if (stop.line >= 0) xs.push(stop.line);
      } else {
        const want = clamp(r.y + r.height + sy * amount, r.y + minH, 1);
        const stop = detent(r.y + r.height, want, [0]);
        let height = stop.at - r.y;
        let width = r.width;
        if (ratio) width = (height * h * ratio) / w;
        if (r.x + width > 1) {
          width = 1 - r.x;
          if (ratio) height = (width * w) / (ratio * h);
        }
        next = { ...r, width, height };
        if (stop.line >= 0) ys.push(stop.line);
      }
    } else if (sx !== 0) {
      const want = clamp(r.x + sx * amount, 0, 1 - r.width);
      const stop = detent(r.x, want, [0, r.width / 2, r.width]);
      next = { ...r, x: stop.at };
      if (stop.line >= 0) xs.push(stop.line);
    } else {
      const want = clamp(r.y + sy * amount, 0, 1 - r.height);
      const stop = detent(r.y, want, [0, r.height / 2, r.height]);
      next = { ...r, y: stop.at };
      if (stop.line >= 0) ys.push(stop.line);
    }
    const target = cleanRect(next);
    if (sameRect(target, r)) return;
    settleTo(target, "snap");
    if (xs.length || ys.length) flash(xs, ys);
    commit(target);
  };

  /**
   * A new locked aspect reshapes the frame about its centre at about the
   * same area; the first measure applies it at once rather than gliding.
   */
  const reshapeToRatio = () => {
    const { w, h } = box.current;
    if (!ratio || w <= 0 || h <= 0) return;
    const r = shown.current;
    const pw = r.width * w;
    const ph = r.height * h;
    if (Math.abs(pw / ph - ratio) < 0.01) return;
    let nw = Math.sqrt(pw * ph * ratio);
    let nh = nw / ratio;
    const fit = Math.min(1, w / nw, h / nh);
    nw *= fit;
    nh *= fit;
    const cx = (r.x + r.width / 2) * w;
    const cy = (r.y + r.height / 2) * h;
    const target = cleanRect({
      x: clamp(cx - nw / 2, 0, w - nw) / w,
      y: clamp(cy - nh / 2, 0, h - nh) / h,
      width: nw / w,
      height: nh / h,
    });
    settleTo(target, measured.current ? "glide" : "instant");
    measured.current = true;
    commit(target);
  };

  React.useEffect(() => {
    api.current = { keys: onKey, reshapeToRatio, drop: cancelDrag };
  });

  // What the host says the frame is. A drag in hand wins until it lets go.
  React.useEffect(() => {
    if (drag.current) return;
    if (sameRect(shown.current, current)) return;
    shown.current = current;
    settleTo(current, "glide");
    // Only the rect's numbers matter, not the object's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.x, current.y, current.width, current.height, check]);

  // The ratio, or the first measure of the picture, reshapes the frame.
  React.useEffect(() => {
    if (ready) api.current?.reshapeToRatio();
  }, [ratio, ready]);

  // Escape lets go of a drag wherever focus is; Shift and Alt pressed
  // mid-drag reshape it at once.
  React.useEffect(() => {
    if (!active) return;
    const onDown = (event: KeyboardEvent) => {
      const d = drag.current;
      if (!d) return;
      if (event.key === "Escape") {
        event.preventDefault();
        cancelDrag();
        return;
      }
      if (event.key === "Shift" || event.key === "Alt") {
        d.shift = event.shiftKey;
        d.alt = event.altKey;
        reshape();
      }
    };
    const onUp = (event: KeyboardEvent) => {
      const d = drag.current;
      if (!d || (event.key !== "Shift" && event.key !== "Alt")) return;
      d.shift = event.shiftKey;
      d.alt = event.altKey;
      reshape();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
    // Bound for the life of one drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  React.useEffect(() => {
    arm.jump(geo.arm);
  }, [arm, geo.arm]);

  React.useEffect(() => {
    for (const g of [...guides.x, ...guides.y]) g.jump(0);
  }, [guides, lines]);

  React.useEffect(() => {
    const target = focused || active ? 1 : 0;
    if (!motionSafe) {
      chip.jump(target);
      return;
    }
    const c = animate(chip, target, {
      duration: durations.fast,
      ease: target ? easings.enter : easings.exit,
    });
    return () => c.stop();
  }, [active, focused, chip, motionSafe]);

  React.useEffect(() => {
    if (disabled) api.current?.drop();
  }, [disabled]);

  React.useEffect(() => {
    const anims = running.current;
    const pending = timers;
    return () => {
      for (const c of anims.values()) c.stop();
      anims.clear();
      for (const t of pending.current) window.clearTimeout(t);
      pending.current = [];
    };
  }, []);

  const bindArea = React.useCallback(
    (node: HTMLDivElement | null) => {
      areaRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const w = node.clientWidth;
        const h = node.clientHeight;
        if (w <= 0 || h <= 0) return;
        box.current = { w, h };
        boxW.set(w);
        boxH.set(h);
        setReady(true);
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [boxW, boxH],
  );

  const left = useTransform(fx, pct);
  const top = useTransform(fy, pct);
  const width = useTransform(fw, pct);
  const height = useTransform(fh, pct);
  const armShort = useTransform(arm, (a) => r3(a * 0.55));
  const sw = sourceSize?.width;
  const sh = sourceSize?.height;
  const readout = useTransform(
    [fw, fh, boxW, boxH] as MotionValue<number>[],
    ([w = 0, h = 0, bw = 0, bh = 0]: number[]) =>
      `${Math.round(w * (sw ?? bw))} × ${Math.round(h * (sh ?? bh))}`,
  );
  const chipOpacity = useTransform(
    [chip, fw, boxW] as MotionValue<number>[],
    ([c = 0, w = 0, bw = 0]: number[]) => (w * bw >= 96 ? r3(c) : 0),
  );

  const shade = `color-mix(in oklab, black ${Math.round(clamp(dim, 0, 1) * 100)}%, transparent)`;
  const markStyle = color ? { color } : undefined;
  const reach = `calc(100% + ${GAP}px)`;

  return (
    <div
      className={cn(
        "relative isolate h-[220px] w-full overflow-clip rounded-3 border border-hairline bg-surface-1",
        disabled && "opacity-50",
        className,
      )}
      style={{ padding: geo.margin }}
    >
      <span id={hintId} className="sr-only">
        Drag on the picture to draw a frame. Arrow keys move the frame, Shift
        with an arrow resizes it, Home centres it.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>

      {/* Ruler ticks in the margin at every snap line, the centre longer. */}
      <div
        aria-hidden
        className="pointer-events-none absolute text-ink-3/70"
        style={{ inset: geo.margin }}
      >
        {lines.map((f) => {
          const long = f === 0.5 ? 6 : 4;
          return (
            <React.Fragment key={f}>
              <span
                className="absolute w-px bg-current"
                style={{
                  left: pct(f),
                  bottom: "calc(100% + 2px)",
                  height: long,
                }}
              />
              <span
                className="absolute w-px bg-current"
                style={{ left: pct(f), top: "calc(100% + 2px)", height: long }}
              />
              <span
                className="absolute h-px bg-current"
                style={{ top: pct(f), right: "calc(100% + 2px)", width: long }}
              />
              <span
                className="absolute h-px bg-current"
                style={{ top: pct(f), left: "calc(100% + 2px)", width: long }}
              />
            </React.Fragment>
          );
        })}
      </div>

      <div
        ref={bindArea}
        onPointerDown={onPointerDown}
        onPointerMove={onHover}
        onPointerUp={gesture.onPointerUp}
        onPointerCancel={gesture.onPointerCancel}
        onLostPointerCapture={gesture.onLostPointerCapture}
        className={cn(
          "relative size-full touch-none select-none",
          disabled ? "cursor-not-allowed" : "cursor-crosshair",
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-1 bg-surface-2">
          {children}
          <motion.div
            aria-hidden
            className="absolute"
            style={{
              left,
              top,
              width,
              height,
              boxShadow: `0 0 0 9999px ${shade}`,
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ color: guideColor }}
          >
            {lines.map((f, i) => (
              <React.Fragment key={f}>
                <motion.span
                  className="absolute inset-y-0 w-px bg-current"
                  style={{
                    left: `calc(${pct(f)} - ${f === 1 ? 1 : f === 0 ? 0 : 0.5}px)`,
                    opacity: guides.x[i],
                  }}
                />
                <motion.span
                  className="absolute inset-x-0 h-px bg-current"
                  style={{
                    top: `calc(${pct(f)} - ${f === 1 ? 1 : f === 0 ? 0 : 0.5}px)`,
                    opacity: guides.y[i],
                  }}
                />
              </React.Fragment>
            ))}
          </div>
        </div>

        <motion.div
          ref={frameRef}
          role="group"
          aria-roledescription="crop frame"
          aria-label={label}
          aria-describedby={hintId}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(event) => api.current?.keys(event.nativeEvent)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            "absolute outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
          style={{ left, top, width, height }}
        >
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0",
              !color && "text-white mix-blend-difference",
            )}
            style={markStyle}
          >
            <span className="absolute inset-0 border border-current opacity-60" />
            {/* Corner arms: each continues an edge outward past the gap. */}
            <motion.span
              className="absolute top-0 h-px bg-current"
              style={{ right: reach, width: arm }}
            />
            <motion.span
              className="absolute left-0 w-px bg-current"
              style={{ bottom: reach, height: arm }}
            />
            <motion.span
              className="absolute top-0 h-px bg-current"
              style={{ left: reach, width: arm }}
            />
            <motion.span
              className="absolute right-0 w-px bg-current"
              style={{ bottom: reach, height: arm }}
            />
            <motion.span
              className="absolute bottom-0 h-px bg-current"
              style={{ right: reach, width: arm }}
            />
            <motion.span
              className="absolute left-0 w-px bg-current"
              style={{ top: reach, height: arm }}
            />
            <motion.span
              className="absolute bottom-0 h-px bg-current"
              style={{ left: reach, width: arm }}
            />
            <motion.span
              className="absolute right-0 w-px bg-current"
              style={{ top: reach, height: arm }}
            />
            {/* Centre marks off each edge. */}
            <motion.span
              className="absolute left-1/2 w-px bg-current"
              style={{ bottom: reach, height: armShort }}
            />
            <motion.span
              className="absolute left-1/2 w-px bg-current"
              style={{ top: reach, height: armShort }}
            />
            <motion.span
              className="absolute top-1/2 h-px bg-current"
              style={{ right: reach, width: armShort }}
            />
            <motion.span
              className="absolute top-1/2 h-px bg-current"
              style={{ left: reach, width: armShort }}
            />
          </div>
          <motion.span
            aria-hidden
            className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-1 border border-hairline bg-popover/90 px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground tabular-nums"
            style={{ opacity: chipOpacity }}
          >
            {readout}
          </motion.span>
        </motion.div>
      </div>
    </div>
  );
}
