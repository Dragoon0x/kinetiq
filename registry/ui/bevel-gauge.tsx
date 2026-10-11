"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BevelGaugeScale = "degrees" | "pitch" | "radians" | "grads";
export type BevelGaugeInk = "cobalt" | "graphite" | "carmine" | "signal";

export type BevelGaugeProps = {
  /** The measured angle in degrees, 0 to 180, when controlled. */
  value?: number;
  /** The angle drawn at first when uncontrolled, degrees. @default 30 */
  defaultValue?: number;
  /** Fires from the drag or the key that changed the angle, with the new angle in degrees. */
  onValueChange?: (degrees: number) => void;
  /** Fires when a measurement is set down: the pointer lifts, or a key turns the arm. */
  onMeasure?: (degrees: number) => void;
  /** The detent spacing in degrees; 0 turns snapping off. @default 15 */
  snapAngle?: number;
  /** How close to a detent the blade must come to catch it, degrees. @default 3 */
  snapTolerance?: number;
  /** The graduations and the readout: degrees, roof pitch in 12, radians or gradians. @default "degrees" */
  scale?: BevelGaugeScale;
  /** The ink the dimension and the protractor are drawn in: a named ink or any CSS colour. @default "cobalt" */
  ink?: BevelGaugeInk | (string & {});
  /** Decimals in the readout (radians add two). @default 1 */
  precision?: number;
  /** The protractor's radius, px; three quarters of it on a small box. @default 56 */
  radius?: number;
  /** The longest the blade opens, px. @default 220 */
  reach?: number;
  /** Tick marks and numbers on the protractor. @default true */
  graduations?: boolean;
  /** Where the bevel sits before the first press, as fractions of the box. @default [0.3, 0.72] */
  pivot?: [number, number];
  /** What is being measured: a plan, a drawing, a photograph. Drawn under the gauge. */
  children?: React.ReactNode;
  /** Pressing and dragging measures. @default true */
  interactive?: boolean;
  /** Nothing measures and the keys do nothing. @default false */
  disabled?: boolean;
  /** A tick as the blade catches each detent. Off unless asked for. @default false */
  sound?: boolean;
  /** The gauge's accessible name. @default "Angle" */
  label?: string;
  /** Sizes the measuring surface. @default "h-56 w-full" */
  className?: string;
};

const INKS: Record<BevelGaugeInk, string> = {
  cobalt: "var(--accent-bright)",
  graphite: "var(--ink-2)",
  carmine: "var(--danger)",
  signal: "var(--signal)",
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/** The closed blade's length, and the shortest it opens to, px. */
const MIN_LEN = 30;
/** Keeps the pivot this far inside the box, px. */
const MARGIN = 12;
const LABELS = 13;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** An angle folded into (−π, π]. */
const wrap = (a: number) => {
  let x = a % TAU;
  if (x <= -Math.PI) x += TAU;
  if (x > Math.PI) x -= TAU;
  return x;
};

/** A point at math angle `a` (y up) and radius `r` from the pivot, in screen px (y down). */
const at = (a: number, r: number) =>
  [r2(Math.cos(a) * r), r2(-Math.sin(a) * r)] as const;
const pt = (p: readonly [number, number]) => `${p[0]} ${p[1]}`;

/** An arc path between two math angles at radius r, the short way through `sweep`. */
function arc(a0: number, a1: number, r: number): string {
  if (Math.abs(a1 - a0) < 1e-4) return "";
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  // y is flipped, so increasing math angle runs counter-clockwise on screen.
  const sweep = a1 > a0 ? 0 : 1;
  return `M ${pt(at(a0, r))} A ${r2(r)} ${r2(r)} 0 ${large} ${sweep} ${pt(at(a1, r))}`;
}

type Graduation = { deg: number; major: boolean; label?: string };

/** Every scale's marks, in degrees from the stock: minor, major, and the labelled ones. */
function graduationsOf(scale: BevelGaugeScale): Graduation[] {
  const out: Graduation[] = [];
  if (scale === "degrees") {
    for (let d = 0; d <= 180; d += 5) {
      out.push({
        deg: d,
        major: d % 15 === 0,
        label: d % 30 === 0 ? String(d) : undefined,
      });
    }
  } else if (scale === "grads") {
    for (let g = 0; g <= 200; g += 5) {
      out.push({
        deg: (g * 180) / 200,
        major: g % 25 === 0,
        label: g % 50 === 0 ? String(g) : undefined,
      });
    }
  } else if (scale === "radians") {
    const names = ["0", "π/6", "π/3", "π/2", "2π/3", "5π/6", "π"];
    for (let d = 0; d <= 180; d += 5) {
      out.push({
        deg: d,
        major: d % 15 === 0,
        label: d % 30 === 0 ? names[d / 30] : undefined,
      });
    }
  } else {
    // Roof pitch, rise in a run of 12, mirrored past the vertical.
    const rises = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 24, 36];
    const labelled = new Set([3, 6, 9, 12, 24]);
    out.push({ deg: 0, major: true, label: "0" });
    for (const k of rises) {
      const d = Math.atan(k / 12) / DEG;
      const major = labelled.has(k);
      out.push({ deg: d, major, label: major ? String(k) : undefined });
      out.push({ deg: 180 - d, major, label: major ? String(k) : undefined });
    }
    out.push({ deg: 90, major: true });
    out.push({ deg: 180, major: true, label: "0" });
    out.sort((a, b) => a.deg - b.deg);
  }
  return out;
}

/** The readout, in the chosen scale. */
function formatAngle(
  deg: number,
  scale: BevelGaugeScale,
  precision: number,
): { short: string; spoken: string } {
  const p = clamp(Math.round(precision), 0, 3);
  if (scale === "radians") {
    const v = ((deg * Math.PI) / 180).toFixed(p + 2);
    return { short: `${v} rad`, spoken: `${v} radians` };
  }
  if (scale === "grads") {
    const v = ((deg * 200) / 180).toFixed(p);
    return { short: `${v} gon`, spoken: `${v} gradians` };
  }
  if (scale === "pitch") {
    const a = Math.min(deg, 180 - deg);
    if (a >= 89.95) return { short: "plumb", spoken: "plumb, vertical" };
    const v = (12 * Math.tan(a * DEG)).toFixed(p);
    return { short: `${v} in 12`, spoken: `${v} in 12 pitch` };
  }
  const v = deg.toFixed(p);
  return { short: `${v}°`, spoken: `${v} degrees` };
}

type Shape = {
  /** The stock's direction (math angle): to the right, or to the left near the right edge. */
  base: number;
  /** The blade's angle from the stock, signed (positive opens upward). */
  theta: number;
  len: number;
  /** Protractor radius. */
  R: number;
  /** The stock sliding out, 0 → 1. */
  stock: number;
  /** The dimension's arc drawn so far, 0 → 1. */
  sweep: number;
  /** The snapped detent in degrees, or null. */
  snapped: number | null;
};

type Anchor = "start" | "middle" | "end";
type Placed = { x: number; y: number; anchor: Anchor };

/**
 * A label set off along a direction: anchored at its near end so it grows
 * away from the lines it names, centred only when the direction is near
 * vertical (and then pushed a little further out).
 */
function place(a: number, r: number): Placed {
  const c = Math.cos(a);
  const anchor: Anchor = c > 0.35 ? "start" : c < -0.35 ? "end" : "middle";
  const p = at(a, anchor === "middle" ? r + 5 : r);
  return { x: p[0], y: p[1], anchor };
}

type Paths = {
  stock: string;
  blade: string;
  edge: string;
  guide: string;
  band: string;
  rim: string;
  minor: string;
  major: string;
  hit: string;
  detents: string;
  extA: string;
  extB: string;
  dim: string;
  heads: string;
  readout: Placed;
  dimLabel: Placed;
  labels: { x: number; y: number; text: string; on: boolean }[];
};

/** Everything the gauge draws, from its shape: one pure function for the server and every frame. */
function pathsOf(
  s: Shape,
  grads: Graduation[],
  show: boolean,
  snap = 0,
): Paths {
  const { base, theta, len, R } = s;
  const side = theta < 0 ? -1 : 1;
  const mag = Math.abs(theta);
  const blade = base + theta;
  const normal = base - side * (Math.PI / 2);
  // The stock lies along the reference ray, its body on the far side from the blade.
  const sl = (R * 1.5 + 22) * s.stock;
  const o = at(normal, 9);
  const stock =
    sl > 0.5
      ? `M 0 0 L ${pt(at(base, sl))} L ${r2(at(base, sl)[0] + o[0])} ${r2(at(base, sl)[1] + o[1])} L ${pt(o)} Z`
      : "";
  // The blade is centred on its measuring edge.
  const bn = blade + Math.PI / 2;
  const h = at(bn, 2.5);
  const tip = at(blade, len);
  const bladePath = `M ${r2(h[0])} ${r2(h[1])} L ${r2(tip[0] + h[0])} ${r2(tip[1] + h[1])} L ${r2(tip[0] - h[0])} ${r2(tip[1] - h[1])} L ${r2(-h[0])} ${r2(-h[1])} Z`;
  const edge = `M 0 0 L ${pt(tip)}`;
  const guide = arc(base, base + side * Math.PI, R);
  const band =
    mag > 1e-3
      ? `${arc(base, blade, R)} L ${pt(at(blade, R - 10))} ${arc(blade, base, R - 10).replace(/^M [^A]+/, "")} Z`
      : "";
  const rim = arc(base, blade, R);
  let minor = "";
  let major = "";
  let hit = "";
  const labels: Paths["labels"] = [];
  for (const g of grads) {
    const a = g.deg * DEG;
    const on = a <= mag + 1e-6 && show;
    const dir = base + side * a;
    if (on) {
      const inner = R - (g.major ? 8 : 4);
      const seg = `M ${pt(at(dir, inner))} L ${pt(at(dir, R))} `;
      if (s.snapped !== null && Math.abs(g.deg - s.snapped) < 0.01) {
        hit = `M ${pt(at(dir, R - 13))} L ${pt(at(dir, R + 3))}`;
      } else if (g.major) major += seg;
      else minor += seg;
    }
    if (g.label !== undefined && labels.length < LABELS) {
      const p = at(dir, R + 9);
      labels.push({ x: p[0], y: p[1], text: g.label, on });
    }
  }
  // The detents, as small dots round the guide: where the blade will catch.
  let detents = "";
  if (snap > 0) {
    for (let d = 0; d <= 180 + 1e-6; d += snap) {
      const c = at(base + side * d * DEG, R);
      detents += `M ${r2(c[0] - 1.4)} ${c[1]} a 1.4 1.4 0 1 0 2.8 0 a 1.4 1.4 0 1 0 -2.8 0 `;
    }
  }
  const ext = R + 10;
  const extA = `M ${pt(at(base, 6))} L ${pt(at(base, ext))}`;
  const extB = `M ${pt(at(blade, 6))} L ${pt(at(blade, Math.max(ext, Math.min(len, ext))))}`;
  const Rd = R * 0.78;
  const end = base + theta * clamp(s.sweep, 0, 1);
  const dim = arc(base, end, Rd);
  // Filled arrowheads at both ends, pointing out along the arc.
  let heads = "";
  if (s.sweep > 0.96 && mag > 6 * DEG) {
    const head = (a: number, dirSign: number) => {
      const tipP = at(a, Rd);
      const back = a - dirSign * (7 / Rd);
      const l = at(back, Rd - 2.6);
      const r = at(back, Rd + 2.6);
      return `M ${pt(tipP)} L ${pt(l)} L ${pt(r)} Z `;
    };
    heads = head(base, -side) + head(blade, side);
  }
  const mid = base + theta / 2;
  return {
    stock,
    blade: bladePath,
    edge,
    guide,
    band,
    rim,
    minor,
    major,
    hit,
    detents,
    extA,
    extB,
    dim,
    heads,
    readout: place(mid, R + 24),
    dimLabel: place(mid, Rd + 9),
    labels,
  };
}

type Parts = {
  pivot: SVGSVGElement | null;
  tool: SVGGElement | null;
  fan: SVGGElement | null;
  dimension: SVGGElement | null;
  stock: SVGPathElement | null;
  blade: SVGPathElement | null;
  edge: SVGPathElement | null;
  guide: SVGPathElement | null;
  band: SVGPathElement | null;
  rim: SVGPathElement | null;
  minor: SVGPathElement | null;
  major: SVGPathElement | null;
  hit: SVGPathElement | null;
  detents: SVGPathElement | null;
  extA: SVGPathElement | null;
  extB: SVGPathElement | null;
  dim: SVGPathElement | null;
  heads: SVGPathElement | null;
  readout: SVGTextElement | null;
  dimLabel: SVGTextElement | null;
  labels: (SVGTextElement | null)[];
};

const emptyParts = (): Parts => ({
  pivot: null,
  tool: null,
  fan: null,
  dimension: null,
  stock: null,
  blade: null,
  edge: null,
  guide: null,
  band: null,
  rim: null,
  minor: null,
  major: null,
  hit: null,
  detents: null,
  extA: null,
  extB: null,
  dim: null,
  heads: null,
  readout: null,
  dimLabel: null,
  labels: [],
});

/**
 * A cursor that measures angles: the cursor carries a sliding bevel. Press
 * and drag and the stock slides out from the press point on the flick
 * spring, the blade opens 1:1 under the pointer, and a protractor fans out
 * between them with its graduations ticking in and a live readout. Near a
 * detent (`snapAngle`) the blade catches it on the snap spring with the
 * drag's own angular speed, the mark lights and a tick sounds; pull past and
 * it lets go, catching back up to the finger on flick. Let go and the bevel
 * lifts away, leaving an angular dimension drawn in `ink` whose label lands
 * on the recoil spring; a tap moves the dimension to the tap.
 *
 * The surface is a real slider (0 to 180 degrees): arrows turn the arm a
 * degree, Shift a tenth, Page Up and Page Down jump detents, Home and End go
 * to the ends. Readouts speak degrees, roof pitch in 12, radians or
 * gradians. Under reduced motion nothing springs: the blade follows the
 * pointer, a detent jumps exactly, and the dimension appears without a sweep.
 */
export function BevelGauge({
  value,
  defaultValue = 30,
  onValueChange,
  onMeasure,
  snapAngle = 15,
  snapTolerance = 3,
  scale = "degrees",
  ink = "cobalt",
  precision = 1,
  radius = 56,
  reach = 220,
  graduations = true,
  pivot = [0.3, 0.72],
  children,
  interactive = true,
  disabled = false,
  sound = false,
  label = "Angle",
  className,
}: BevelGaugeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const live = interactive && !disabled;
  const inkColour = INKS[ink as BevelGaugeInk] ?? ink;

  const [own, setOwn] = React.useState(() => clamp(defaultValue, 0, 180));
  const current = clamp(value ?? own, 0, 180);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cursorRef = React.useRef<SVGSVGElement | null>(null);
  const parts = React.useRef<Parts>(emptyParts());
  const box = React.useRef({ w: 0, h: 0 });
  const [small, setSmall] = React.useState(false);

  // Geometry in motion values: the pivot as fractions of the box, the angle
  // signed in radians, and the show/hide of the tool, fan and dimension.
  const fx = useMotionValue(clamp(pivot[0], 0, 1));
  const fy = useMotionValue(clamp(pivot[1], 0, 1));
  const theta = useMotionValue(current * DEG);
  const len = useMotionValue(Math.max(MIN_LEN, radius * 1.9));
  const stock = useMotionValue(0);
  const toolO = useMotionValue(0);
  const fanO = useMotionValue(0);
  const dimO = useMotionValue(1);
  const sweep = useMotionValue(1);
  const lab = useMotionValue(1);
  const baseRef = React.useRef(pivot[0] > 0.62 ? Math.PI : 0);
  const snappedRef = React.useRef<number | null>(null);

  const R = r2(radius * (small ? 0.75 : 1));
  const grads = React.useMemo(() => graduationsOf(scale), [scale]);
  const settings = React.useRef({
    R,
    grads,
    graduations,
    scale,
    precision,
    snapAngle,
  });
  React.useEffect(() => {
    settings.current = { R, grads, graduations, scale, precision, snapAngle };
  });

  // The server's frame and the first client frame: the default dimension.
  const [first] = React.useState(() => {
    const shape: Shape = {
      base: pivot[0] > 0.62 ? Math.PI : 0,
      theta: clamp(value ?? defaultValue, 0, 180) * DEG,
      len: Math.max(MIN_LEN, radius * 1.9),
      R: radius,
      stock: 0,
      sweep: 1,
      snapped: null,
    };
    return {
      paths: pathsOf(shape, graduationsOf(scale), graduations, snapAngle),
      text: formatAngle(clamp(value ?? defaultValue, 0, 180), scale, precision)
        .short,
      x: `${r2(clamp(pivot[0], 0, 1) * 100)}%`,
      y: `${r2(clamp(pivot[1], 0, 1) * 100)}%`,
    };
  });

  const paint = React.useCallback(() => {
    const p = parts.current;
    const set = settings.current;
    const th = theta.get();
    const deg = Math.abs(th) / DEG;
    const shape: Shape = {
      base: baseRef.current,
      theta: th,
      len: len.get(),
      R: set.R,
      stock: stock.get(),
      sweep: sweep.get(),
      snapped: snappedRef.current,
    };
    const d = pathsOf(shape, set.grads, set.graduations, set.snapAngle);
    const attr = (el: SVGElement | null, name: string, v: string) => {
      if (el && el.getAttribute(name) !== v) el.setAttribute(name, v);
    };
    attr(p.pivot, "x", `${r2(fx.get() * 100)}%`);
    attr(p.pivot, "y", `${r2(fy.get() * 100)}%`);
    attr(p.stock, "d", d.stock);
    attr(p.blade, "d", d.blade);
    attr(p.edge, "d", d.edge);
    attr(p.guide, "d", d.guide);
    attr(p.band, "d", d.band);
    attr(p.rim, "d", d.rim);
    attr(p.minor, "d", d.minor);
    attr(p.major, "d", d.major);
    attr(p.hit, "d", d.hit);
    attr(p.detents, "d", d.detents);
    attr(p.extA, "d", d.extA);
    attr(p.extB, "d", d.extB);
    attr(p.dim, "d", d.dim);
    attr(p.heads, "d", d.heads);
    const text = formatAngle(
      snappedRef.current ?? deg,
      set.scale,
      set.precision,
    ).short;
    if (p.readout) {
      attr(p.readout, "x", String(d.readout.x));
      attr(p.readout, "y", String(d.readout.y));
      attr(p.readout, "text-anchor", d.readout.anchor);
      if (p.readout.textContent !== text) p.readout.textContent = text;
    }
    if (p.dimLabel) {
      attr(p.dimLabel, "x", String(d.dimLabel.x));
      attr(p.dimLabel, "y", String(d.dimLabel.y));
      attr(p.dimLabel, "text-anchor", d.dimLabel.anchor);
      if (p.dimLabel.textContent !== text) p.dimLabel.textContent = text;
      const k = r2(lab.get());
      p.dimLabel.style.transform = k === 1 ? "" : `scale(${k})`;
    }
    p.labels.forEach((el, i) => {
      if (!el) return;
      const l = d.labels[i];
      if (!l) {
        el.style.opacity = "0";
        return;
      }
      attr(el, "x", String(l.x));
      attr(el, "y", String(l.y));
      if (el.textContent !== l.text) el.textContent = l.text;
      el.style.opacity = l.on ? "1" : "0";
    });
    if (p.tool) p.tool.style.opacity = String(r2(toolO.get()));
    if (p.fan) p.fan.style.opacity = String(r2(fanO.get()));
    if (p.dimension) p.dimension.style.opacity = String(r2(dimO.get()));
  }, [fanO, dimO, fx, fy, lab, len, stock, sweep, theta, toolO]);

  // Every motion value change repaints once, after motion's batch for the frame.
  React.useEffect(() => {
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        paint();
      });
    };
    const values: MotionValue<number>[] = [
      fx,
      fy,
      theta,
      len,
      stock,
      toolO,
      fanO,
      dimO,
      sweep,
      lab,
    ];
    const offs = values.map((v) => v.on("change", schedule));
    paint();
    return () => {
      for (const off of offs) off();
    };
  }, [paint, fx, fy, theta, len, stock, toolO, fanO, dimO, sweep, lab]);

  // A scale, size or graduation change repaints with what is already drawn.
  React.useEffect(() => {
    paint();
  }, [paint, R, grads, graduations, scale, precision, snapAngle]);

  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const catching = React.useRef<AnimationPlaybackControls | null>(null);
  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    catching.current?.stop();
    catching.current = null;
  }, []);
  React.useEffect(() => halt, [halt]);

  const tween = (mv: MotionValue<number>, to: number, d = durations.fast) =>
    animate(mv, to, { duration: d, ease: easings.enter });

  // Reported values are rounded to the readout, so a host never sees 29.999.
  const reported = React.useRef(current);
  const report = (deg: number) => {
    const p = Math.pow(10, clamp(Math.round(precision), 0, 3) + 1);
    const v = clamp(Math.round(deg * p) / p, 0, 180);
    if (v === reported.current) return v;
    reported.current = v;
    if (value === undefined) setOwn(v);
    onValueChange?.(v);
    return v;
  };

  // A host that changes `value` turns the arm there on the snap spring.
  React.useEffect(() => {
    if (value === undefined) return;
    const v = clamp(value, 0, 180);
    if (Math.abs(v - reported.current) < 1e-6) return;
    reported.current = v;
    const side = theta.get() < 0 ? -1 : 1;
    const target = side * v * DEG;
    snappedRef.current = null;
    if (motionSafe) running.current.push(animate(theta, target, springs.snap));
    else theta.set(target);
  }, [value, motionSafe, theta]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      box.current = { w: node.clientWidth, h: node.clientHeight };
      setSmall(node.clientWidth < 360 || node.clientHeight < 200);
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0, w: 1, h: 1 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
      w: Math.max(1, root.clientWidth),
      h: Math.max(1, root.clientHeight),
    };
  };

  /** The drag's angle and length from the pivot, in the stock's frame. */
  const reading = (clientX: number, clientY: number) => {
    const l = local(clientX, clientY);
    const dx = l.x - fx.get() * l.w;
    const dy = l.y - fy.get() * l.h;
    const raw = wrap(Math.atan2(-dy, dx) - baseRef.current);
    return { raw, dist: Math.hypot(dx, dy), box: l };
  };

  const press = React.useRef<{
    prevTheta: number;
    prevX: number;
    prevY: number;
    lastRaw: number;
    lastT: number;
    vel: number;
  } | null>(null);

  const showTool = () => {
    halt();
    snappedRef.current = null;
    if (motionSafe) {
      stock.jump(0);
      running.current = [
        animate(stock, 1, springs.flick),
        tween(toolO, 1),
        tween(fanO, 1),
        animate(dimO, 0, {
          duration: durations.fast * 0.6,
          ease: easings.exit,
        }),
      ];
    } else {
      stock.set(1);
      running.current = [tween(toolO, 1), tween(fanO, 1), tween(dimO, 0)];
    }
  };

  const setDown = (deg: number, announce: boolean) => {
    halt();
    if (motionSafe) {
      sweep.jump(0);
      lab.jump(0.9);
      running.current = [
        animate(toolO, 0, {
          duration: durations.fast * 0.8,
          ease: easings.exit,
        }),
        animate(fanO, 0, {
          duration: durations.fast * 0.8,
          ease: easings.exit,
        }),
        tween(dimO, 1),
        animate(sweep, 1, { duration: durations.base, ease: easings.enter }),
        animate(lab, 1, springs.recoil),
      ];
    } else {
      sweep.set(1);
      lab.set(1);
      running.current = [tween(toolO, 0), tween(fanO, 0), tween(dimO, 1)];
    }
    onMeasure?.(deg);
    if (announce) {
      const words = formatAngle(deg, scale, precision).spoken;
      setSaid((s) => ({ n: s.n + 1, text: `Measured ${words}.` }));
    }
  };

  const tick = (deg: number, clientX?: number) => {
    const pan = clientX !== undefined ? panFrom(clientX, rootRef.current) : 0;
    audio.play("tick", { pitch: 0.8 + (deg / 180) * 0.6, pan, gain: 0.5 });
  };

  const drag = useDrag({
    threshold: 3,
    disabled: !live,
    onStart: ({ point, event }) => {
      const p = press.current;
      if (!p) return;
      const r = reading(point.x, point.y);
      p.lastRaw = r.raw;
      p.lastT = event.timeStamp;
    },
    onMove: ({ point, event }) => {
      const p = press.current;
      if (!p) return;
      const r = reading(point.x, point.y);
      const now = event.timeStamp;
      const dt = Math.max(1, now - p.lastT) / 1000;
      // Angular speed over the last move, smoothed, for the detent's spring.
      p.vel = p.vel * 0.6 + (wrap(r.raw - p.lastRaw) / dt) * 0.4;
      p.lastRaw = r.raw;
      p.lastT = now;
      const room = Math.hypot(r.box.w, r.box.h);
      len.set(r2(clamp(r.dist, MIN_LEN, Math.min(reach, room))));
      const mag = Math.abs(r.raw) / DEG;
      const side = r.raw < 0 ? -1 : 1;
      let snap: number | null = null;
      if (snapAngle > 0) {
        const k = clamp(Math.round(mag / snapAngle) * snapAngle, 0, 180);
        if (Math.abs(mag - k) <= snapTolerance) snap = k;
      }
      const was = snappedRef.current;
      if (snap !== null) {
        if (was !== snap) {
          snappedRef.current = snap;
          catching.current?.stop();
          catching.current = null;
          const target = side * snap * DEG;
          if (motionSafe) {
            catching.current = animate(theta, target, {
              ...springs.snap,
              velocity: p.vel,
            });
          } else theta.set(target);
          tick(snap, point.x);
        }
        report(snap);
        return;
      }
      snappedRef.current = null;
      if (was !== null && motionSafe) {
        // Out of the detent: catch back up to the finger, then hold 1:1.
        catching.current = animate(theta, r.raw, springs.flick);
      } else if (catching.current && motionSafe) {
        catching.current = animate(theta, r.raw, springs.flick);
      } else {
        theta.set(r.raw);
      }
      report(mag);
    },
    onEnd: () => {
      const v = snappedRef.current ?? Math.abs(theta.get()) / DEG;
      press.current = null;
      setDown(report(v), true);
    },
    onCancel: () => {
      const v = snappedRef.current ?? Math.abs(theta.get()) / DEG;
      press.current = null;
      setDown(report(v), false);
    },
    onTap: () => {
      // A tap moves the dimension here, keeping its angle.
      const p = press.current;
      press.current = null;
      if (!p) return;
      halt();
      theta.jump(p.prevTheta);
      len.jump(Math.max(MIN_LEN, radius * 1.9));
      setDown(Math.abs(p.prevTheta) / DEG, true);
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const l = local(event.clientX, event.clientY);
    const px = clamp(l.x, MARGIN, l.w - MARGIN) / l.w;
    const py = clamp(l.y, MARGIN, l.h - MARGIN) / l.h;
    press.current = {
      prevTheta: theta.get(),
      prevX: fx.get(),
      prevY: fy.get(),
      lastRaw: 0,
      lastT: event.timeStamp,
      vel: 0,
    };
    baseRef.current = px > 0.62 ? Math.PI : 0;
    fx.set(r2(px * 10000) / 10000);
    fy.set(r2(py * 10000) / 10000);
    theta.jump(0);
    len.jump(MIN_LEN);
    showTool();
    if (cursorRef.current) cursorRef.current.style.opacity = "0";
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    const c = cursorRef.current;
    if (!c || !live || event.pointerType === "touch") return;
    const l = local(event.clientX, event.clientY);
    c.style.transform = `translate(${r2(l.x + 10)}px, ${r2(l.y + 10)}px)`;
    if (!press.current) c.style.opacity = "1";
  };

  const turnTo = (deg: number) => {
    const v = clamp(Math.round(deg * 10) / 10, 0, 180);
    const before = Math.abs(theta.get()) / DEG;
    halt();
    snappedRef.current = null;
    const side = theta.get() < 0 ? -1 : 1;
    const target = side * v * DEG;
    // A key sets the dimension down at once, ending anything in flight.
    toolO.jump(0);
    fanO.jump(0);
    dimO.jump(1);
    sweep.jump(1);
    lab.jump(1);
    if (motionSafe) running.current = [animate(theta, target, springs.snap)];
    else theta.set(target);
    if (snapAngle > 0) {
      const crossed =
        Math.floor(Math.min(before, v) / snapAngle) !==
          Math.floor(Math.max(before, v) / snapAngle) ||
        Math.abs(v / snapAngle - Math.round(v / snapAngle)) < 1e-6;
      if (crossed) tick(v);
    }
    const r = report(v);
    onMeasure?.(r);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!live) return;
    const step = event.shiftKey ? 0.1 : 1;
    const v = current;
    const detent = snapAngle > 0 ? snapAngle : 15;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = v + step;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = v - step;
    else if (event.key === "PageUp")
      next = (Math.floor(v / detent + 1e-6) + 1) * detent;
    else if (event.key === "PageDown")
      next = (Math.ceil(v / detent - 1e-6) - 1) * detent;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 180;
    if (next === null) return;
    event.preventDefault();
    if (cursorRef.current) cursorRef.current.style.opacity = "0";
    turnTo(next);
  };

  // A changed detent spacing or scale shows itself: the protractor fans in
  // over the drawn dimension for a moment, detents and all, then folds away.
  const previewed = React.useRef({ snapAngle, scale, graduations });
  const previewTimer = React.useRef(0);
  React.useEffect(() => {
    const was = previewed.current;
    if (
      was.snapAngle === snapAngle &&
      was.scale === scale &&
      was.graduations === graduations
    ) {
      return;
    }
    previewed.current = { snapAngle, scale, graduations };
    if (press.current) return;
    // The drawn dimension steps back while the scale is shown over it.
    const show = [
      animate(fanO, 1, { duration: durations.fast, ease: easings.enter }),
      animate(dimO, 0.3, { duration: durations.fast, ease: easings.enter }),
    ];
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => {
      if (!press.current) {
        animate(fanO, 0, { duration: durations.base, ease: easings.exit });
        animate(dimO, 1, { duration: durations.base, ease: easings.enter });
      }
    }, 1100);
    return () => {
      for (const c of show) c.stop();
    };
  }, [snapAngle, scale, graduations, fanO, dimO]);
  React.useEffect(() => () => window.clearTimeout(previewTimer.current), []);

  const words = formatAngle(current, scale, precision);
  const { paths } = first;

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={() => {
        if (cursorRef.current) cursorRef.current.style.opacity = "0";
      }}
      className={cn(
        "group/bevel-gauge relative isolate h-56 w-full overflow-clip select-none",
        live ? "cursor-crosshair touch-none" : "touch-auto",
        className,
      )}
    >
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={live ? hintId : undefined}
        aria-valuemin={0}
        aria-valuemax={180}
        aria-valuenow={current}
        aria-valuetext={words.spoken}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 z-0 rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full">
        {children}
      </div>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible"
        style={{ color: inkColour }}
      >
        <svg
          ref={(n) => {
            parts.current.pivot = n;
          }}
          x={first.x}
          y={first.y}
          className="overflow-visible"
        >
          <g
            ref={(n) => {
              parts.current.fan = n;
            }}
            style={{ opacity: 0 }}
          >
            <path
              ref={(n) => {
                parts.current.guide = n;
              }}
              d={paths.guide}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.28}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <path
              ref={(n) => {
                parts.current.band = n;
              }}
              d={paths.band}
              fill="currentColor"
              fillOpacity={0.1}
            />
            <path
              ref={(n) => {
                parts.current.rim = n;
              }}
              d={paths.rim}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.25}
            />
            <path
              ref={(n) => {
                parts.current.minor = n;
              }}
              d={paths.minor}
              stroke="currentColor"
              strokeOpacity={0.55}
              strokeWidth={0.75}
            />
            <path
              ref={(n) => {
                parts.current.major = n;
              }}
              d={paths.major}
              stroke="currentColor"
              strokeWidth={1}
            />
            <path
              ref={(n) => {
                parts.current.hit = n;
              }}
              d={paths.hit}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <path
              ref={(n) => {
                parts.current.detents = n;
              }}
              d={paths.detents}
              fill="currentColor"
              fillOpacity={0.7}
            />
            {Array.from({ length: LABELS }, (_, i) => (
              <text
                key={i}
                ref={(n) => {
                  parts.current.labels[i] = n;
                }}
                x={paths.labels[i]?.x ?? 0}
                y={paths.labels[i]?.y ?? 0}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-current font-mono text-[8px] tabular-nums"
                style={{ opacity: 0 }}
              >
                {paths.labels[i]?.text ?? ""}
              </text>
            ))}
          </g>
          <g
            ref={(n) => {
              parts.current.dimension = n;
            }}
          >
            <path
              ref={(n) => {
                parts.current.extA = n;
              }}
              d={paths.extA}
              stroke="currentColor"
              strokeOpacity={0.6}
              strokeWidth={1}
            />
            <path
              ref={(n) => {
                parts.current.extB = n;
              }}
              d={paths.extB}
              stroke="currentColor"
              strokeOpacity={0.6}
              strokeWidth={1}
            />
            <path
              ref={(n) => {
                parts.current.dim = n;
              }}
              d={paths.dim}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.25}
            />
            <path
              ref={(n) => {
                parts.current.heads = n;
              }}
              d={paths.heads}
              fill="currentColor"
            />
            <circle r={2} fill="currentColor" />
            <text
              ref={(n) => {
                parts.current.dimLabel = n;
              }}
              x={paths.dimLabel.x}
              y={paths.dimLabel.y}
              textAnchor={paths.dimLabel.anchor}
              dominantBaseline="central"
              className="fill-current stroke-card font-mono text-[11px] font-medium tabular-nums [paint-order:stroke]"
              strokeWidth={4}
              strokeLinejoin="round"
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            >
              {first.text}
            </text>
          </g>
          <g
            ref={(n) => {
              parts.current.tool = n;
            }}
            style={{ opacity: 0 }}
          >
            <path
              ref={(n) => {
                parts.current.stock = n;
              }}
              d={paths.stock}
              className="fill-[color-mix(in_oklab,var(--ink-2)_22%,var(--card))] stroke-hairline-strong"
              strokeWidth={1}
              strokeLinejoin="round"
            />
            <path
              ref={(n) => {
                parts.current.blade = n;
              }}
              d={paths.blade}
              className="fill-[color-mix(in_oklab,var(--ink-2)_12%,var(--card))] stroke-ink-3"
              strokeWidth={0.75}
              strokeLinejoin="round"
            />
            <path
              ref={(n) => {
                parts.current.edge = n;
              }}
              d={paths.edge}
              stroke="currentColor"
              strokeWidth={1}
            />
            <circle
              r={5.5}
              className="fill-[color-mix(in_oklab,var(--ink-2)_40%,var(--card))] stroke-ink-3"
              strokeWidth={0.75}
            />
            <path
              d="M -2.5 0 L 2.5 0"
              className="stroke-card"
              strokeWidth={1}
            />
            {/* The live readout travels with the tool, not the protractor. */}
            <text
              ref={(n) => {
                parts.current.readout = n;
              }}
              x={paths.readout.x}
              y={paths.readout.y}
              textAnchor={paths.readout.anchor}
              dominantBaseline="central"
              className="fill-current stroke-card font-mono text-[11px] font-medium tabular-nums [paint-order:stroke]"
              strokeWidth={4}
              strokeLinejoin="round"
            >
              {first.text}
            </text>
          </g>
        </svg>
      </svg>
      {live ? (
        <svg
          ref={cursorRef}
          aria-hidden
          width={22}
          height={16}
          viewBox="0 0 22 16"
          className="pointer-events-none absolute top-0 left-0 z-30 opacity-0 transition-opacity duration-150"
        >
          {/* The folded bevel the cursor carries. */}
          <rect
            x={1}
            y={10}
            width={18}
            height={4.5}
            rx={1}
            className="fill-[color-mix(in_oklab,var(--ink-2)_22%,var(--card))] stroke-ink-3"
            strokeWidth={0.75}
          />
          <path
            d="M 3 11 L 19.5 4.5 L 20.3 6.3 L 3.8 12.8 Z"
            className="fill-[color-mix(in_oklab,var(--ink-2)_12%,var(--card))] stroke-ink-3"
            strokeWidth={0.75}
          />
          <circle cx={3.4} cy={12} r={1.6} className="fill-ink-3" />
        </svg>
      ) : null}
      {live ? (
        <p id={hintId} className="sr-only">
          Press and drag to measure an angle. Arrow keys turn the arm by a
          degree, Shift by a tenth; Page Up and Page Down jump to the next
          detent.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
