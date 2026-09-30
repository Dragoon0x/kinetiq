"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MeasureLinePoint = readonly [number, number];

export type MeasureLineSegment = {
  id: string;
  /** Start, in drawing units. */
  a: MeasureLinePoint;
  /** End, in drawing units. */
  b: MeasureLinePoint;
};

export type MeasureLineUnits = "m" | "cm" | "ft";

export type MeasureLineProps = {
  /** The sheet's width in drawing units (millimetres on paper, say). */
  width: number;
  /** The sheet's height in drawing units. */
  height: number;
  /** The plan: SVG elements in drawing units, drawn under the lines. */
  children?: React.ReactNode;
  /** Points the ends snap to — wall corners, door jambs — in drawing units. */
  corners?: readonly MeasureLinePoint[];
  /** The plan's accessible name. */
  label: string;
  /** Controlled lines. */
  value?: readonly MeasureLineSegment[];
  /** Initial lines when uncontrolled. @default [] */
  defaultValue?: readonly MeasureLineSegment[];
  /** Fires from the drag, key or tap that changed the lines. */
  onValueChange?: (lines: MeasureLineSegment[]) => void;
  /** How lengths read: metres, centimetres, or feet and inches. @default "m" */
  units?: MeasureLineUnits;
  /** Ends catch corners and the ends of other lines. @default true */
  snap?: boolean;
  /** The drawing's scale, 1:n: one drawing unit is n real ones. @default 50 */
  scale?: number;
  /** Keep every line (six at most), or let each new one replace the last. @default true */
  keep?: boolean;
  /** Play the ratchet and the snaps. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = { x: number; y: number };
type Mode = "idle" | "draft" | "live";
type TickSet = { minor: number; every: number };

/** Minor tick spacing in real millimetres, and how many make a long tick. */
const METRIC: readonly TickSet[] = [
  { minor: 100, every: 10 },
  { minor: 250, every: 4 },
  { minor: 500, every: 2 },
  { minor: 1000, every: 5 },
  { minor: 2000, every: 5 },
  { minor: 5000, every: 2 },
];
const IMPERIAL: readonly TickSet[] = [
  { minor: 152.4, every: 2 },
  { minor: 304.8, every: 5 },
  { minor: 609.6, every: 5 },
  { minor: 1524, every: 2 },
  { minor: 3048, every: 5 },
];
const GRID_METRIC = [500, 1000, 2000, 5000];
const GRID_IMPERIAL = [304.8, 609.6, 1524, 3048];

/** Lines kept at most; the oldest goes first. */
const MOST = 6;
/** Snap reach, in screen px. */
const REACH = 14;
/** A release shorter than this, in screen px, was a tap. */
const SHORTEST = 6;
/** Before the sheet is measured: px per drawing unit at 528px across 240. */
const FALLBACK_K = 2.2;

const EMPTY: readonly MeasureLineSegment[] = [];
const EMPTY_CORNERS: readonly MeasureLinePoint[] = [];
/**
 * Room for a kept label's remove mark, in px. The line in hand reserves it
 * too, so its label sits exactly where the kept one will.
 */
const LABEL_EXTRA = 14;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const pt = (p: MeasureLinePoint): Pt => ({ x: p[0], y: p[1] });

const pick = <T,>(list: readonly T[], ok: (item: T) => boolean): T =>
  list.find(ok) ?? (list[list.length - 1] as T);

function ticksFor(units: MeasureLineUnits, scale: number, k: number) {
  return pick(
    units === "ft" ? IMPERIAL : METRIC,
    (t) => (t.minor / scale) * k >= 7,
  );
}

function gridFor(units: MeasureLineUnits, scale: number, k: number) {
  return pick(
    units === "ft" ? GRID_IMPERIAL : GRID_METRIC,
    (g) => (g / scale) * k >= 16,
  );
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** A real length, in millimetres, as the label prints it. */
export function formatMeasure(mm: number, units: MeasureLineUnits): string {
  if (units === "cm") return `${Math.round(mm / 10)} cm`;
  if (units === "ft") {
    const inches = Math.round(mm / 25.4);
    return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
  }
  return `${(mm / 1000).toFixed(2)} m`;
}

/** The same length as a sentence says it. */
function spoken(mm: number, units: MeasureLineUnits): string {
  if (units === "cm")
    return plural(Math.round(mm / 10), "centimetre", "centimetres");
  if (units === "ft") {
    const inches = Math.round(mm / 25.4);
    return `${plural(Math.floor(inches / 12), "foot", "feet")} ${plural(inches % 12, "inch", "inches")}`;
  }
  const m = (mm / 1000).toFixed(2);
  return `${m} ${m === "1.00" ? "metre" : "metres"}`;
}

/** A line's real length in millimetres, at a drawing scale of 1:`scale`. */
export function measureLength(
  segment: MeasureLineSegment,
  scale: number,
): number {
  return dist(pt(segment.a), pt(segment.b)) * scale;
}

type Frame = {
  k: number;
  W: number;
  H: number;
  scale: number;
  units: MeasureLineUnits;
  minorDu: number;
  every: number;
};

type Geometry = {
  line: string;
  ticks: string;
  bars: string;
  /** The label's centre, as percentages of the sheet. */
  left: string;
  top: string;
  text: string;
  /** The side of the line the label prefers: the one facing up. */
  prefer: 1 | -1;
};

/**
 * Everything one dimension line draws, from its two ends. Shared by the line
 * under the finger (fed from motion values every frame) and the lines already
 * kept (fed from state), so a line never changes shape when it is let go.
 */
function geometry(
  a: Pt,
  b: Pt,
  side: number | null,
  f: Frame,
  extraPx = 0,
): Geometry {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const ux = length > 1e-6 ? dx / length : 1;
  const uy = length > 1e-6 ? dy / length : 0;
  const nx = -uy;
  const ny = ux;
  const px = (v: number) => v / f.k;
  const s = (p: Pt) => `${r2(p.x)} ${r2(p.y)}`;

  const tickParts: string[] = [];
  if (f.minorDu > 0) {
    const count = Math.min(400, Math.floor((length - px(1)) / f.minorDu));
    for (let i = 1; i <= count; i += 1) {
      const h = px(i % f.every === 0 ? 5 : 2.5);
      const cx = a.x + ux * f.minorDu * i;
      const cy = a.y + uy * f.minorDu * i;
      tickParts.push(
        `M ${s({ x: cx - nx * h, y: cy - ny * h })} L ${s({ x: cx + nx * h, y: cy + ny * h })}`,
      );
    }
  }
  const bar = px(6);
  const bars = [a, b]
    .map(
      (p) =>
        `M ${s({ x: p.x - nx * bar, y: p.y - ny * bar })} L ${s({ x: p.x + nx * bar, y: p.y + ny * bar })}`,
    )
    .join(" ");

  const text = formatMeasure(length * f.scale, f.units);
  const lw = px(text.length * 6.6 + 14 + extraPx);
  const lh = px(20);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const reach = (Math.abs(nx) * lw + Math.abs(ny) * lh) / 2 + px(5);
  const at = (k: number) => ({
    x: mid.x + nx * reach * k,
    y: mid.y + ny * reach * k,
  });
  const fits = (p: Pt) =>
    p.x - lw / 2 >= 0 &&
    p.x + lw / 2 <= f.W &&
    p.y - lh / 2 >= 0 &&
    p.y + lh / 2 <= f.H;
  let prefer: 1 | -1 = ny < -1e-3 || (Math.abs(ny) <= 1e-3 && nx > 0) ? 1 : -1;
  if (!fits(at(prefer)) && fits(at(-prefer))) prefer = prefer === 1 ? -1 : 1;
  const spot = at(side ?? prefer);
  const x = clamp(spot.x, lw / 2 + px(2), f.W - lw / 2 - px(2));
  const y = clamp(spot.y, lh / 2 + px(2), f.H - lh / 2 - px(2));

  return {
    line: `M ${s(a)} L ${s(b)}`,
    ticks: tickParts.join(" "),
    bars,
    left: `${r3((x / f.W) * 100)}%`,
    top: `${r3((y / f.H) * 100)}%`,
    text,
    prefer,
  };
}

/** What changed between two line lists, as one sentence. */
function describe(
  before: readonly MeasureLineSegment[],
  after: readonly MeasureLineSegment[],
  scale: number,
  units: MeasureLineUnits,
): string {
  const last = after[after.length - 1];
  if (
    last &&
    (after.length > before.length || last.id !== before[before.length - 1]?.id)
  ) {
    if (!before.some((l) => l.id === last.id)) {
      return `Line ${after.length}, ${spoken(measureLength(last, scale), units)}.`;
    }
  }
  if (after.length < before.length) {
    const gone = before.findIndex((l) => !after.some((m) => m.id === l.id));
    return gone >= 0 ? `Removed line ${gone + 1}.` : "";
  }
  const changed = after.findIndex((l, i) => l !== before[i]);
  const line = after[changed];
  return line
    ? `Line ${changed + 1}, ${spoken(measureLength(line, scale), units)}.`
    : "";
}

/**
 * A plan you measure by dragging. The finger draws a dimension line — end
 * bars, a ruler of ticks, and a length label in real units that stays
 * upright at any angle and hops over the line on a snap spring when the line
 * swings through vertical. The end follows 1:1, rubber-bands past the sheet
 * and springs back inside with the release velocity; ends catch corners and
 * the ends of other lines. As the line pays out, every tick it crosses
 * ratchets, rising in pitch with the length, and a catch snaps.
 *
 * The keyboard draws the same lines: arrows walk a cursor corner to corner
 * (or tick by tick), Enter anchors a line, arrows carry its end with the same
 * ratchet, Enter finishes — and after any line, the arrows adjust its last
 * point. Under reduced motion drawing stays 1:1 and every spring becomes a
 * jump; the sounds and the numbers are unchanged.
 */
export function MeasureLine({
  width,
  height,
  children,
  corners = EMPTY_CORNERS,
  label,
  value,
  defaultValue = EMPTY,
  onValueChange,
  units = "m",
  snap = true,
  scale = 50,
  keep = true,
  sound = false,
  disabled = false,
  className,
}: MeasureLineProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const ratio = Math.max(1, scale);

  const [own, setOwn] =
    React.useState<readonly MeasureLineSegment[]>(defaultValue);
  const lines = value ?? own;

  const [k, setK] = React.useState(FALLBACK_K);
  const ticks = ticksFor(units, ratio, k);
  const frame: Frame = {
    k,
    W,
    H,
    scale: ratio,
    units,
    minorDu: ticks.minor / ratio,
    every: ticks.every,
  };

  const [dragging, setDragging] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("idle");
  const [liveId, setLiveId] = React.useState<string | null>(null);
  const [kbd, setKbd] = React.useState(false);
  const [caught, setCaught] = React.useState<Pt | null>(null);
  const [hover, setHover] = React.useState<Pt | null>(null);
  const [cursor, setCursor] = React.useState<Pt>(() => {
    const first = corners[0];
    return first ? pt(first) : { x: W / 2, y: H / 2 };
  });
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seen, setSeen] = React.useState(lines);
  if (seen !== lines) {
    setSeen(lines);
    const text = describe(seen, lines, ratio, units);
    if (text) setSaid({ n: said.n + 1, text });
  }

  const liveLine =
    mode === "live" ? lines.find((l) => l.id === liveId) : undefined;
  // The host took the live line away (or refused it): nothing is live.
  if (mode === "live" && !liveLine && !dragging) {
    setMode("idle");
    setLiveId(null);
  }
  const showLive = dragging || mode === "draft" || Boolean(liveLine);

  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const rect = React.useRef({ left: 0, top: 0, width: 1, height: 1 });
  const count = React.useRef(0);
  const asked = React.useRef<readonly MeasureLineSegment[] | undefined>(
    undefined,
  );
  const catchRef = React.useRef<string | null>(null);
  const sideTarget = React.useRef<1 | -1>(-1);
  const draftA = React.useRef<Pt>({ x: 0, y: 0 });
  const ratchet = React.useRef(false);
  const tickIndex = React.useRef(0);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const cursorAnims = React.useRef<AnimationPlaybackControls[]>([]);

  const ax = useMotionValue(0);
  const ay = useMotionValue(0);
  const bx = useMotionValue(0);
  const by = useMotionValue(0);
  const side = useMotionValue(-1);
  const cx = useMotionValue(cursor.x);
  const cy = useMotionValue(cursor.y);

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
  }, []);
  React.useEffect(
    () => () => {
      halt();
      for (const c of cursorAnims.current) c.stop();
    },
    [halt],
  );

  // The sheet's px per drawing unit, bound to the svg when it arrives.
  const observer = React.useRef<ResizeObserver | null>(null);
  const bindSvg = React.useCallback(
    (node: SVGSVGElement | null) => {
      svgRef.current = node;
      observer.current?.disconnect();
      observer.current = null;
      if (!node) return;
      const read = () => {
        const w = node.getBoundingClientRect().width;
        if (w > 0) setK(r3(w / W));
      };
      read();
      observer.current = new ResizeObserver(read);
      observer.current.observe(node);
    },
    [W],
  );

  const latest = React.useRef({ frame, audio, lines });
  React.useEffect(() => {
    latest.current = { frame, audio, lines };
  });

  // The ratchet: every tick the length crosses, whatever moved the end.
  React.useEffect(() => {
    const read = () => {
      const f = latest.current.frame;
      const length = Math.hypot(bx.get() - ax.get(), by.get() - ay.get());
      return Math.floor(length / f.minorDu + 1e-6);
    };
    const onChange = () => {
      const index = read();
      const was = tickIndex.current;
      if (index === was) return;
      tickIndex.current = index;
      if (!ratchet.current) return;
      const { frame: f, audio: out } = latest.current;
      const major = Math.floor(index / f.every) !== Math.floor(was / f.every);
      const mm = index * f.minorDu * f.scale;
      const svg = svgRef.current;
      const r = svg?.getBoundingClientRect();
      out.play("detent", {
        pitch: r2(0.8 + Math.min(1.2, (mm / 1000) * 0.12)),
        gain: major ? 0.5 : 0.28,
        pan: r ? panFrom(r.left + (bx.get() / f.W) * r.width, svg) : 0,
      });
    };
    const off = [ax, ay, bx, by].map((v) => v.on("change", onChange));
    return () => off.forEach((u) => u());
  }, [ax, ay, bx, by]);

  // A controlled host that refused a change: the live end goes back to
  // where the host says it is.
  React.useEffect(() => {
    if (asked.current === undefined) return;
    const was = asked.current;
    asked.current = undefined;
    if (was === lines || !liveLine) return;
    halt();
    bx.set(liveLine.b[0]);
    by.set(liveLine.b[1]);
  });

  const commit = (next: MeasureLineSegment[]) => {
    if (value === undefined) setOwn(next);
    else {
      asked.current = next;
      bump();
    }
    onValueChange?.(next);
  };

  /** Moves both ends without a sound: a new line starting, not one growing. */
  const place = (a: Pt, b: Pt) => {
    const on = ratchet.current;
    ratchet.current = false;
    ax.set(r2(a.x));
    ay.set(r2(a.y));
    bx.set(r2(b.x));
    by.set(r2(b.y));
    tickIndex.current = Math.floor(dist(a, b) / frame.minorDu + 1e-6);
    ratchet.current = on;
  };

  /** Keeps the label on its side, hopping over the line when "up" flips. */
  const aimLabel = (instant = false) => {
    const g = geometry(
      { x: ax.get(), y: ay.get() },
      { x: bx.get(), y: by.get() },
      null,
      frame,
      LABEL_EXTRA,
    );
    if (!instant && g.prefer === sideTarget.current) return;
    sideTarget.current = g.prefer;
    if (instant || !motionSafe) side.set(g.prefer);
    else running.current.push(animate(side, g.prefer, springs.snap));
  };

  const inBox = (p: Pt): Pt => ({ x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) });

  /** Every point an end can catch: corners, and the ends of other lines. */
  const targets = (skip: string | null): Pt[] => {
    const out = corners.map(pt);
    for (const l of lines) {
      if (l.id === skip) continue;
      out.push(pt(l.a), pt(l.b));
    }
    return out;
  };

  const nearest = (p: Pt, skip: string | null): Pt | null => {
    if (!snap) return null;
    let best: Pt | null = null;
    let bestD = REACH / k;
    for (const t of targets(skip)) {
      const d = dist(p, t);
      if (d <= bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  };

  const sameSpot = (a: Pt | null, b: Pt | null) =>
    a !== null && b !== null && dist(a, b) < 1e-3;

  const panAt = (x: number) => {
    const svg = svgRef.current;
    const r = svg?.getBoundingClientRect();
    return r ? panFrom(r.left + (x / W) * r.width, svg) : 0;
  };

  const toDu = (x: number, y: number): Pt => {
    const r = rect.current;
    return {
      x: ((x - r.left) / r.width) * W,
      y: ((y - r.top) / r.height) * H,
    };
  };

  const measure = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width < 1) return false;
    rect.current = {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    };
    return true;
  };

  /** Where the finger puts the end: a catch, or rubber-banded past the edge. */
  const follow = (x: number, y: number) => {
    const raw = toDu(x, y);
    const hit = nearest(inBox(raw), null);
    if (hit && dist(hit, raw) <= REACH / k) {
      const key = `${hit.x},${hit.y}`;
      if (catchRef.current !== key) {
        catchRef.current = key;
        setCaught(hit);
        audio.play("snap", { gain: 0.45, pan: panAt(hit.x) });
      }
      bx.set(r2(hit.x));
      by.set(r2(hit.y));
    } else {
      if (catchRef.current !== null) {
        catchRef.current = null;
        setCaught(null);
      }
      const give = 24 / k;
      bx.set(r2(rubberClamp(raw.x, 0, W, give)));
      by.set(r2(rubberClamp(raw.y, 0, H, give)));
    }
    aimLabel();
  };

  const drag = useDrag({
    disabled,
    onStart: ({ point, offset }) => {
      if (!measure()) return;
      halt();
      const pressed = inBox(toDu(point.x - offset.x, point.y - offset.y));
      const hit = nearest(pressed, null);
      const a = hit ?? pressed;
      place(a, a);
      ratchet.current = true;
      catchRef.current = null;
      if (hit) audio.play("snap", { gain: 0.45, pan: panAt(a.x) });
      setCaught(null);
      setHover(null);
      setDragging(true);
      setMode("idle");
      setLiveId(null);
      setKbd(false);
      aimLabel(true);
      follow(point.x, point.y);
    },
    onMove: ({ point }) => follow(point.x, point.y),
    onEnd: ({ velocity }) => {
      setDragging(false);
      setCaught(null);
      catchRef.current = null;
      const a = { x: ax.get(), y: ay.get() };
      const b = { x: bx.get(), y: by.get() };
      if (dist(a, b) * k < SHORTEST) {
        ratchet.current = false;
        return;
      }
      const end = inBox(b);
      if (end.x !== b.x || end.y !== b.y) {
        // Let go past the edge: the end springs back onto the sheet.
        if (motionSafe) {
          running.current.push(
            animate(bx, r2(end.x), {
              ...springs.snap,
              velocity: velocity.x / k,
            }),
            animate(by, r2(end.y), {
              ...springs.snap,
              velocity: velocity.y / k,
            }),
          );
        } else {
          bx.set(r2(end.x));
          by.set(r2(end.y));
        }
      }
      count.current += 1;
      const segment: MeasureLineSegment = {
        id: `${uid}-${count.current}`,
        a: [r2(a.x), r2(a.y)],
        b: [r2(end.x), r2(end.y)],
      };
      commit(keep ? [...lines, segment].slice(-MOST) : [segment]);
      setMode("live");
      setLiveId(segment.id);
      setCursor(end);
      cx.set(r2(end.x));
      cy.set(r2(end.y));
    },
    onCancel: () => {
      setDragging(false);
      setCaught(null);
      ratchet.current = false;
    },
    onTap: () => {
      if (mode !== "idle") {
        setMode("idle");
        setLiveId(null);
      }
    },
  });

  const remove = (id: string) => {
    const index = lines.findIndex((l) => l.id === id);
    if (index < 0) return;
    const gone = lines[index] as MeasureLineSegment;
    commit(lines.filter((l) => l.id !== id));
    if (id === liveId) {
      setMode("idle");
      setLiveId(null);
    }
    audio.play("swish", {
      pitch: 0.7,
      gain: 0.3,
      pan: panAt((gone.a[0] + gone.b[0]) / 2),
    });
  };

  /** The next catch in the arrow's direction, within a 60° cone. */
  const toward = (from: Pt, dir: Pt, skip: string | null): Pt | null => {
    let best: Pt | null = null;
    let score = Infinity;
    for (const t of targets(skip)) {
      const vx = t.x - from.x;
      const vy = t.y - from.y;
      const d = Math.hypot(vx, vy);
      if (d < 0.5 / k) continue;
      const cos = (vx * dir.x + vy * dir.y) / d;
      if (cos < 0.5) continue;
      const s = d * (2 - cos);
      if (s < score) {
        score = s;
        best = t;
      }
    }
    return best;
  };

  const moveCursor = (to: Pt) => {
    setCursor(to);
    for (const c of cursorAnims.current) c.stop();
    if (motionSafe) {
      cursorAnims.current = [
        animate(cx, r2(to.x), springs.flick),
        animate(cy, r2(to.y), springs.flick),
      ];
    } else {
      cx.set(r2(to.x));
      cy.set(r2(to.y));
    }
  };

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const where = (p: Pt, at: boolean) =>
    `${at ? "At a corner, " : "Cursor "}${spoken(p.x * ratio, units)} from the left, ${spoken(p.y * ratio, units)} from the top.`;

  const step = (dir: Pt, big: boolean) => {
    const live = mode === "live" ? liveLine : undefined;
    const from =
      mode === "draft"
        ? { x: bx.get(), y: by.get() }
        : live
          ? pt(live.b)
          : cursor;
    const hit = snap ? toward(from, dir, live?.id ?? null) : null;
    const size = big ? frame.minorDu * frame.every : frame.minorDu;
    const to =
      hit ?? inBox({ x: from.x + dir.x * size, y: from.y + dir.y * size });
    const land = { x: r2(to.x), y: r2(to.y) };
    moveCursor(land);

    if (mode === "idle") {
      audio.play(hit ? "snap" : "tick", {
        gain: hit ? 0.45 : 0.2,
        pan: panAt(land.x),
      });
      say(where(land, Boolean(hit)));
      return;
    }

    // The end travels there, so the ratchet counts every tick it passes.
    halt();
    ratchet.current = true;
    const landed = () => {
      aimLabel();
      if (hit) audio.play("snap", { gain: 0.45, pan: panAt(land.x) });
    };
    if (motionSafe) {
      let done = 0;
      const both = () => {
        done += 1;
        if (done === 2) landed();
      };
      // The label follows the end while it travels, not only on arrival.
      running.current.push(
        animate(bx, land.x, {
          ...springs.flick,
          onUpdate: () => aimLabel(),
          onComplete: both,
        }),
        animate(by, land.y, { ...springs.flick, onComplete: both }),
      );
    } else {
      bx.set(land.x);
      by.set(land.y);
      landed();
    }

    if (mode === "draft") {
      const a = draftA.current;
      if (dist(a, land) < 1e-3) return;
      count.current += 1;
      const segment: MeasureLineSegment = {
        id: `${uid}-${count.current}`,
        a: [r2(a.x), r2(a.y)],
        b: [land.x, land.y],
      };
      commit(keep ? [...lines, segment].slice(-MOST) : [segment]);
      setMode("live");
      setLiveId(segment.id);
    } else if (live) {
      commit(
        lines.map((l) =>
          l.id === live.id ? { ...l, b: [land.x, land.y] as const } : l,
        ),
      );
    }
  };

  const enter = () => {
    if (mode === "idle") {
      halt();
      draftA.current = cursor;
      place(cursor, cursor);
      aimLabel(true);
      setMode("draft");
      setLiveId(null);
      audio.play("tick", { gain: 0.3, pan: panAt(cursor.x) });
      say(
        "Line started. Arrow keys carry its end; Enter finishes, Escape discards it.",
      );
      return;
    }
    if (mode === "draft") {
      setMode("idle");
      say("Nothing measured.");
      return;
    }
    setMode("idle");
    setLiveId(null);
    if (liveLine) moveCursor(pt(liveLine.b));
    say("Done. Enter starts the next line here.");
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const arrows: Record<string, Pt> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const dir = arrows[event.key];
    if (dir) {
      event.preventDefault();
      setKbd(true);
      step(dir, event.shiftKey);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      setKbd(true);
      enter();
      return;
    }
    if (event.key === "Escape") {
      // Claimed only when there is a line in hand; otherwise the key is left
      // for whatever holds the plan.
      if (mode === "idle") return;
      event.preventDefault();
      if (mode === "draft") say("Line discarded.");
      else say("Done.");
      setMode("idle");
      setLiveId(null);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      const last = lines[lines.length - 1];
      if (!last) return;
      event.preventDefault();
      remove(last.id);
    }
  };

  // The line in hand, every frame, from its four motion values.
  const live = useTransform(
    [ax, ay, bx, by, side] as MotionValue<number>[],
    ([x1, y1, x2, y2, s]) =>
      geometry(
        { x: x1 as number, y: y1 as number },
        { x: x2 as number, y: y2 as number },
        s as number,
        frame,
        LABEL_EXTRA,
      ),
  );
  const liveLineD = useTransform(live, (g) => g.line);
  const liveTicks = useTransform(live, (g) => g.ticks);
  const liveBars = useTransform(live, (g) => g.bars);
  const liveLeft = useTransform(live, (g) => g.left);
  const liveTop = useTransform(live, (g) => g.top);
  const liveText = useTransform(live, (g) => g.text);
  const dotR = r2(2.5 / k);

  const cursorPath = useTransform(
    [cx, cy] as MotionValue<number>[],
    ([x, y]) => {
      const px = x as number;
      const py = y as number;
      const inner = 9 / k;
      const outer = 14 / k;
      return [
        `M ${r2(px - outer)} ${r2(py)} L ${r2(px - inner)} ${r2(py)}`,
        `M ${r2(px + inner)} ${r2(py)} L ${r2(px + outer)} ${r2(py)}`,
        `M ${r2(px)} ${r2(py - outer)} L ${r2(px)} ${r2(py - inner)}`,
        `M ${r2(px)} ${r2(py + inner)} L ${r2(px)} ${r2(py + outer)}`,
      ].join(" ");
    },
  );

  const gridStep = gridFor(units, ratio, k) / ratio;
  const grid = React.useMemo(() => {
    const minor: string[] = [];
    const major: string[] = [];
    let i = 0;
    for (let x = 0; x <= W + 1e-6; x += gridStep, i += 1) {
      (i % 5 === 0 ? major : minor).push(`M ${r2(x)} 0 V ${H}`);
    }
    i = 0;
    for (let y = 0; y <= H + 1e-6; y += gridStep, i += 1) {
      (i % 5 === 0 ? major : minor).push(`M 0 ${r2(y)} H ${W}`);
    }
    return { minor: minor.join(" "), major: major.join(" ") };
  }, [W, H, gridStep]);

  const kept = lines.filter((l) => !(showLive && l.id === liveId));
  const showCorners = snap && (dragging || kbd || mode !== "idle");
  const ring = caught ?? (dragging ? null : hover);

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={surfaceRef}
        role="application"
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? undefined : 0}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.target === event.currentTarget) {
            setKbd(event.currentTarget.matches(":focus-visible"));
          }
        }}
        onBlur={() => {
          setKbd(false);
          setHover(null);
        }}
        {...drag}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (dragging || disabled || !snap || event.pointerType !== "mouse") {
            return;
          }
          if (!measure()) return;
          const hit = nearest(toDu(event.clientX, event.clientY), null);
          if (!sameSpot(hit, hover) && (hit || hover)) setHover(hit);
        }}
        onPointerLeave={() => setHover(null)}
        className={cn(
          "relative overflow-clip rounded-3 border border-hairline bg-card outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-crosshair touch-none",
        )}
      >
        <svg
          ref={bindSvg}
          aria-hidden
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
        >
          <path
            d={grid.minor}
            fill="none"
            stroke="var(--grid-minor)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={grid.major}
            fill="none"
            stroke="var(--grid-major)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {children}

          <motion.g
            className="text-ink-3"
            initial={false}
            animate={{ opacity: showCorners ? 0.7 : 0 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {corners.map((c) => (
              <rect
                key={`${c[0]},${c[1]}`}
                x={r2(c[0] - 1.5 / k)}
                y={r2(c[1] - 1.5 / k)}
                width={r2(3 / k)}
                height={r2(3 / k)}
                fill="currentColor"
              />
            ))}
          </motion.g>

          <AnimatePresence initial={false}>
            {kept.map((l) => {
              const g = geometry(pt(l.a), pt(l.b), null, frame, LABEL_EXTRA);
              return (
                <motion.g
                  key={l.id}
                  className="text-foreground"
                  initial={false}
                  animate={{ opacity: dragging && !keep ? 0.35 : 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                >
                  <path
                    d={g.ticks}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.7}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={`${g.line} ${g.bars}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={l.a[0]}
                    cy={l.a[1]}
                    r={dotR}
                    fill="currentColor"
                  />
                  <circle
                    cx={l.b[0]}
                    cy={l.b[1]}
                    r={dotR}
                    fill="currentColor"
                  />
                </motion.g>
              );
            })}
          </AnimatePresence>

          {showLive ? (
            <g className="text-cobalt-bright">
              <motion.path
                d={liveTicks}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.8}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <motion.path
                d={liveLineD}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <motion.path
                d={liveBars}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <motion.circle cx={ax} cy={ay} r={dotR} fill="currentColor" />
              <motion.circle cx={bx} cy={by} r={dotR} fill="currentColor" />
            </g>
          ) : null}

          {ring ? (
            <motion.circle
              key={`${ring.x},${ring.y},${caught ? "caught" : "near"}`}
              cx={ring.x}
              cy={ring.y}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              className="text-cobalt-bright"
              initial={
                motionSafe && caught
                  ? { r: r2(12 / k), opacity: 0 }
                  : { r: r2(6 / k), opacity: 0 }
              }
              animate={{ r: r2(6 / k), opacity: caught ? 1 : 0.6 }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            />
          ) : null}

          {kbd && !disabled ? (
            <g className="text-cobalt-bright">
              <motion.circle
                cx={cx}
                cy={cy}
                r={r2(7 / k)}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <motion.path
                d={cursorPath}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : null}
        </svg>

        <div className="pointer-events-none absolute inset-0">
          <AnimatePresence initial={false}>
            {kept.map((l) => {
              const g = geometry(pt(l.a), pt(l.b), null, frame, LABEL_EXTRA);
              return (
                <motion.div
                  key={l.id}
                  className="absolute"
                  style={{ left: g.left, top: g.top }}
                  initial={false}
                  animate={{ opacity: dragging && !keep ? 0.35 : 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden
                    title={`Remove ${g.text}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (!disabled) remove(l.id);
                    }}
                    className="group/measure-line-label pointer-events-auto flex h-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-1 rounded-2 border border-hairline-strong bg-popover px-1.5 font-mono text-[11px] leading-none whitespace-nowrap text-foreground tabular-nums transition-colors hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed"
                    disabled={disabled}
                  >
                    {g.text}
                    <svg
                      viewBox="0 0 8 8"
                      className="size-2 shrink-0 opacity-40 transition-opacity group-hover/measure-line-label:opacity-100"
                    >
                      <path
                        d="M1 1 L7 7 M7 1 L1 7"
                        stroke="currentColor"
                        strokeWidth={1.4}
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {showLive ? (
            <motion.div
              className="absolute"
              style={{ left: liveLeft, top: liveTop }}
            >
              <motion.span className="flex h-5 -translate-x-1/2 -translate-y-1/2 items-center rounded-2 bg-primary px-1.5 font-mono text-[11px] leading-none whitespace-nowrap text-primary-foreground tabular-nums">
                {liveText}
              </motion.span>
            </motion.div>
          ) : null}
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Drag across the plan to measure. From the keyboard, the arrow keys move
        a cursor between corners; Enter starts a line, the arrows carry its end,
        and Enter finishes it. After a line, the arrows adjust its last point.
        Backspace removes the newest line.
      </p>
      <ul className="sr-only">
        {lines.map((l, i) => (
          <li key={l.id}>
            Line {i + 1}: {spoken(measureLength(l, ratio), units)}
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
