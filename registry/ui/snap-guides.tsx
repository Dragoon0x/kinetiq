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
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SnapGuidesMode = "edges" | "centres" | "both";

export type SnapGuidesPoint = { x: number; y: number };

/** Where each layer sits, by id, in artboard px from the top-left corner. */
export type SnapGuidesValue = Record<string, SnapGuidesPoint>;

export type SnapGuidesLayer = {
  id: string;
  /** The layer's name: its accessible name and what the announcements call it. */
  label: string;
  /** Size in artboard px. */
  width: number;
  height: number;
  /** What the layer shows. Scaled with the artboard; never receives pointer events. */
  content?: React.ReactNode;
};

export type SnapGuidesChange = {
  id: string;
  x: number;
  y: number;
  /** Labels of the layers it now lines up with, in layer order. */
  alignedWith: string[];
};

export type SnapGuidesProps = {
  layers: SnapGuidesLayer[];
  /** Controlled positions. */
  value?: SnapGuidesValue;
  /** Starting positions when uncontrolled. Missing layers start at 0, 0. */
  defaultValue?: SnapGuidesValue;
  /** Fires from the release or the key that moved a layer, with every position. */
  onValueChange?: (value: SnapGuidesValue, change: SnapGuidesChange) => void;
  /** The artboard's size in artboard px; it scales to fit its box. @default 400 */
  boardWidth?: number;
  /** @default 200 */
  boardHeight?: number;
  /** The artboard's accessible name. @default "Artboard" */
  label?: string;
  /** How close, in artboard px, a line must come before it pulls, 2 to 16. @default 6 */
  snap?: number;
  /** Which lines snap and draw guides. @default "both" */
  guides?: SnapGuidesMode;
  /** Live measurement lines and labels to the nearest neighbours. @default true */
  distances?: boolean;
  /** An 8 px grid the layer's corner snaps to when nothing else is in reach. @default false */
  grid?: boolean;
  /** Tick when an edge finds another. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Axis = "x" | "y";
type LineKind = "edge" | "centre";
type Tone = "centre" | "edge" | "board" | "grid";
type Box = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
type Frame = { x: number; y: number; w: number; h: number };
type Found = { delta: number; key: string; tone: Tone };
type Measure = { d: string; gap: number; lx: number; ly: number };
type Overlay = { guides: string; lines: string; labels: (Measure | null)[] };

const GRID = 8;
/** How long the overlay stays after a nudge, in ms. */
const LINGER = 900;
const EMPTY: Overlay = {
  guides: "",
  lines: "",
  labels: [null, null, null, null],
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const pct = (v: number, of: number) => `${r3((v / of) * 100)}%`;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const TONES: Record<Tone, { pitch: number; gain: number }> = {
  centre: { pitch: 1.25, gain: 0.5 },
  edge: { pitch: 1, gain: 0.5 },
  board: { pitch: 0.85, gain: 0.45 },
  grid: { pitch: 0.7, gain: 0.22 },
};

/** The lines a box offers along one axis, as offsets from its start. */
function linesOf(size: number, mode: SnapGuidesMode) {
  const edges = [
    { off: 0, kind: "edge" as LineKind },
    { off: size, kind: "edge" as LineKind },
  ];
  const centre = [{ off: size / 2, kind: "centre" as LineKind }];
  if (mode === "edges") return edges;
  if (mode === "centres") return centre;
  return [edges[0]!, centre[0]!, edges[1]!];
}

const startOf = (b: Box | Frame, axis: Axis) => (axis === "x" ? b.x : b.y);
const sizeOf = (b: Box | Frame, axis: Axis) => (axis === "x" ? b.w : b.h);

/**
 * The nearest line within `threshold` along one axis, for a box whose start
 * is `pos`. Every line the mode allows on the box is tried against every
 * line the mode allows on the others and on the board; a layer beats the
 * board at an equal distance. A keyboard nudge passes where it started and
 * which way it went, and only a line strictly ahead of that start counts, so
 * a nudge can leave a line it sits on instead of being pulled straight back.
 */
function snapAxis(
  pos: number,
  size: number,
  axis: Axis,
  others: Box[],
  board: number,
  mode: SnapGuidesMode,
  threshold: number,
  grid: boolean,
  from: number | null = null,
  dir = 0,
): Found | null {
  const max = board - size;
  const sources = linesOf(size, mode);
  let best: Found | null = null;
  let bestScore = Infinity;
  const allowed = (next: number) =>
    next >= 0 && next <= max && (from === null || (next - from) * dir > 0);
  const consider = (line: number, kind: LineKind, onBoard: boolean) => {
    for (const s of sources) {
      const delta = line - (pos + s.off);
      if (Math.abs(delta) > threshold || !allowed(pos + delta)) continue;
      const score = Math.abs(delta) + (onBoard ? 0.01 : 0);
      if (score >= bestScore) continue;
      bestScore = score;
      best = {
        delta,
        key: `${s.off}>${line}`,
        tone: onBoard
          ? "board"
          : s.kind === "centre" && kind === "centre"
            ? "centre"
            : "edge",
      };
    }
  };
  for (const o of others) {
    const start = startOf(o, axis);
    for (const t of linesOf(sizeOf(o, axis), mode)) {
      consider(start + t.off, t.kind, false);
    }
  }
  for (const t of linesOf(board, mode)) consider(t.off, t.kind, true);
  if (best || !grid) return best;
  // Nothing to line up with: the corner steps along the grid instead.
  const line =
    from === null
      ? Math.round(pos / GRID) * GRID
      : dir > 0
        ? Math.floor(from / GRID + 1) * GRID
        : Math.ceil(from / GRID - 1) * GRID;
  const delta = line - pos;
  if (Math.abs(delta) > threshold || !allowed(line)) return null;
  return { delta, key: `grid>${line}`, tone: "grid" };
}

/**
 * Every line of the frame that coincides with a line of another layer (or
 * the board's centre) gets one guide, spanning both objects. Returns the
 * guides as one path and the labels of the layers it lines up with.
 */
function guidesFor(
  f: Frame,
  others: Box[],
  board: { w: number; h: number },
  mode: SnapGuidesMode,
) {
  const parts: string[] = [];
  const found = new Set<string>();
  for (const axis of ["x", "y"] as const) {
    const cross: Axis = axis === "x" ? "y" : "x";
    const boardLen = axis === "x" ? board.w : board.h;
    const boardCross = axis === "x" ? board.h : board.w;
    const spans = new Map<number, [number, number]>();
    const add = (at: number, a: number, b: number) => {
      const span = spans.get(at) ?? [
        startOf(f, cross),
        startOf(f, cross) + sizeOf(f, cross),
      ];
      spans.set(at, [Math.min(span[0], a), Math.max(span[1], b)]);
    };
    for (const s of linesOf(sizeOf(f, axis), mode)) {
      const at = startOf(f, axis) + s.off;
      for (const o of others) {
        for (const t of linesOf(sizeOf(o, axis), mode)) {
          if (Math.abs(startOf(o, axis) + t.off - at) >= 0.5) continue;
          add(at, startOf(o, cross), startOf(o, cross) + sizeOf(o, cross));
          found.add(o.id);
        }
      }
      // The board's own edges are where the frame already stops; only its
      // middle is worth drawing.
      for (const t of linesOf(boardLen, mode)) {
        if (t.kind === "centre" && Math.abs(t.off - at) < 0.5) {
          add(at, 0, boardCross);
        }
      }
    }
    for (const [at, [a, b]] of spans) {
      const lo = r2(Math.max(0, a - 4));
      const hi = r2(Math.min(boardCross, b + 4));
      const c = r2(at);
      parts.push(axis === "x" ? `M${c} ${lo}V${hi}` : `M${lo} ${c}H${hi}`);
    }
  }
  return { path: parts.join(""), ids: found };
}

/**
 * The gap to the nearest layer on each side that overlaps the frame on the
 * other axis, or to the board's edge when none does: left, right, up, down.
 */
function measuresFor(
  f: Frame,
  others: Box[],
  board: { w: number; h: number },
): (Measure | null)[] {
  const out: (Measure | null)[] = [];
  for (const side of ["left", "right", "up", "down"] as const) {
    const horizontal = side === "left" || side === "right";
    const axis: Axis = horizontal ? "x" : "y";
    const cross: Axis = horizontal ? "y" : "x";
    const fStart = startOf(f, axis);
    const fEnd = fStart + sizeOf(f, axis);
    const fcA = startOf(f, cross);
    const fcB = fcA + sizeOf(f, cross);
    const before = side === "left" || side === "up";
    let edge = before ? 0 : horizontal ? board.w : board.h;
    let mid = (fcA + fcB) / 2;
    for (const o of others) {
      const oA = startOf(o, cross);
      const oB = oA + sizeOf(o, cross);
      if (oA >= fcB || oB <= fcA) continue;
      const oStart = startOf(o, axis);
      const oEnd = oStart + sizeOf(o, axis);
      if (
        before ? oEnd <= fStart && oEnd > edge : oStart >= fEnd && oStart < edge
      ) {
        edge = before ? oEnd : oStart;
        mid = (Math.max(fcA, oA) + Math.min(fcB, oB)) / 2;
      }
    }
    const from = before ? edge : fEnd;
    const to = before ? fStart : edge;
    const gap = Math.round(to - from);
    if (gap < 1) {
      out.push(null);
      continue;
    }
    const a = r2(from);
    const b = r2(to);
    const m = r2(mid);
    const d = horizontal
      ? `M${a} ${r2(mid - 3)}V${r2(mid + 3)}M${a} ${m}H${b}M${b} ${r2(mid - 3)}V${r2(mid + 3)}`
      : `M${r2(mid - 3)} ${a}H${r2(mid + 3)}M${m} ${a}V${b}M${r2(mid - 3)} ${b}H${r2(mid + 3)}`;
    out.push({
      d,
      gap,
      lx: horizontal ? r2((from + to) / 2) : m,
      ly: horizontal ? m : r2((from + to) / 2),
    });
  }
  return out;
}

const joinList = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

type Api = {
  /** Artboard px per screen px, read from the artboard's rect. */
  scale: () => number;
  snap: (
    id: string,
    axis: Axis,
    pos: number,
    from?: number | null,
    dir?: number,
  ) => Found | null;
  preview: (id: string, frame: Frame, inside: boolean) => void;
  release: () => void;
  /** Focus left a layer: a lingering overlay from the keys goes now. */
  blur: () => void;
  tick: (tone: Tone, clientX: number | null, frame: Frame) => void;
  commit: (id: string, point: SnapGuidesPoint) => void;
  nudge: (id: string, dx: number, dy: number) => void;
  raise: (id: string) => void;
  setDragging: (id: string | null) => void;
};

/**
 * A design canvas whose layers line themselves up. Drag a layer and its
 * edges and centre look for the edges and centres of the other layers and
 * of the artboard; within `snap` px the layer is pulled into line on a quick
 * critically damped spring, a guide is drawn across both objects and a tick
 * sounds. Live labels measure the gap to the nearest neighbour on each side.
 * The layer is 1:1 under the finger when nothing is pulling it, rubber-bands
 * past the artboard's edge and glides back in with its release velocity.
 * Inside, it stays exactly where it was put: layers are placed, not thrown.
 *
 * Every layer is a real button: Tab reaches it, arrow keys nudge it by 1 px
 * and Shift+arrow by 10 with the same snapping and the same tick, and each
 * move is announced. Under reduced motion the snaps land in one step, while
 * the guides, the labels and the ticks still answer, because alignment is
 * information.
 */
export function SnapGuides({
  layers,
  value,
  defaultValue,
  onValueChange,
  boardWidth = 400,
  boardHeight = 200,
  label = "Artboard",
  snap = 6,
  guides = "both",
  distances = true,
  grid = false,
  sound = false,
  disabled = false,
  className,
}: SnapGuidesProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const W = Math.max(1, boardWidth);
  const H = Math.max(1, boardHeight);
  const threshold = clamp(snap, 0, 64);

  const [own, setOwn] = React.useState<SnapGuidesValue>(defaultValue ?? {});
  const positions = value ?? own;
  const [selected, setSelected] = React.useState<string | null>(null);
  const [raised, setRaised] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);
  // What the live region says about the last move. It is written when the
  // move is reported and spoken only while the value holds it, so a move the
  // host refuses is never announced.
  const [said, setSaid] = React.useState<{
    id: string;
    x: number;
    y: number;
    text: string;
  } | null>(null);

  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const overlay = useMotionValue<Overlay>(EMPTY);
  const shown = useMotionValue(0);
  const fade = React.useRef<AnimationPlaybackControls | null>(null);
  const visible = React.useRef(false);
  const linger = React.useRef<number | null>(null);

  const at = (id: string): SnapGuidesPoint => positions[id] ?? { x: 0, y: 0 };
  const boxes = (except: string): Box[] =>
    layers
      .filter((l) => l.id !== except)
      .map((l) => ({
        id: l.id,
        label: l.label,
        x: at(l.id).x,
        y: at(l.id).y,
        w: l.width,
        h: l.height,
      }));

  const show = () => {
    if (linger.current !== null) window.clearTimeout(linger.current);
    linger.current = null;
    if (visible.current) return;
    visible.current = true;
    fade.current?.stop();
    fade.current = animate(shown, 1, {
      duration: durations.blink,
      ease: easings.enter,
    });
  };
  const hide = () => {
    if (linger.current !== null) window.clearTimeout(linger.current);
    linger.current = null;
    if (!visible.current) return;
    visible.current = false;
    fade.current?.stop();
    fade.current = animate(shown, 0, {
      duration: durations.fast,
      ease: easings.exit,
    });
  };

  const draw = (id: string, frame: Frame, inside: boolean) => {
    if (!inside) {
      overlay.set(EMPTY);
      return;
    }
    const others = boxes(id);
    const lines = guidesFor(frame, others, { w: W, h: H }, guides);
    const labels = distances
      ? measuresFor(frame, others, { w: W, h: H })
      : EMPTY.labels;
    overlay.set({
      guides: lines.path,
      lines: labels.map((m) => m?.d ?? "").join(""),
      labels,
    });
  };

  const alignedWith = (id: string, frame: Frame) => {
    const { ids } = guidesFor(frame, boxes(id), { w: W, h: H }, guides);
    return layers.filter((l) => ids.has(l.id)).map((l) => l.label);
  };

  const commit = (id: string, point: SnapGuidesPoint) => {
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;
    const frame = { ...point, w: layer.width, h: layer.height };
    const aligned = alignedWith(id, frame);
    const next = { ...positions, [id]: point };
    if (value === undefined) setOwn(next);
    setSaid({
      id,
      x: point.x,
      y: point.y,
      text: `${layer.label} at ${point.x}, ${point.y}${aligned.length ? `, in line with ${joinList(aligned)}` : ""}.`,
    });
    onValueChange?.(next, { id, x: point.x, y: point.y, alignedWith: aligned });
  };

  const tick = (tone: Tone, clientX: number | null, frame: Frame) => {
    const board = boardRef.current;
    const rect = board?.getBoundingClientRect();
    const x =
      clientX ??
      (rect ? rect.left + ((frame.x + frame.w / 2) / W) * rect.width : 0);
    audio.play("tick", { ...TONES[tone], pan: panFrom(x, board) });
  };

  const raise = (id: string) => setRaised(id);
  const markDragging = (id: string | null) => setDragging(id);

  const nudge = (id: string, dx: number, dy: number) => {
    const layer = layers.find((l) => l.id === id);
    if (!layer || disabled) return;
    const from = at(id);
    const others = boxes(id);
    let x = clamp(from.x + dx, 0, Math.max(0, W - layer.width));
    let y = clamp(from.y + dy, 0, Math.max(0, H - layer.height));
    let found: Found | null = null;
    if (dx !== 0) {
      found = snapAxis(
        x,
        layer.width,
        "x",
        others,
        W,
        guides,
        threshold,
        grid,
        from.x,
        Math.sign(dx),
      );
      if (found) x += found.delta;
    }
    if (dy !== 0) {
      found = snapAxis(
        y,
        layer.height,
        "y",
        others,
        H,
        guides,
        threshold,
        grid,
        from.y,
        Math.sign(dy),
      );
      if (found) y += found.delta;
    }
    x = Math.round(x);
    y = Math.round(y);
    if (x === from.x && y === from.y) return;
    const frame = { x, y, w: layer.width, h: layer.height };
    if (found) tick(found.tone, null, frame);
    setRaised(id);
    draw(id, frame, true);
    show();
    linger.current = window.setTimeout(hide, LINGER);
    commit(id, { x, y });
  };

  const api = React.useRef<Api>({
    scale: () => 1,
    snap: () => null,
    preview: () => {},
    release: () => {},
    blur: () => {},
    tick: () => {},
    commit: () => {},
    nudge: () => {},
    raise: () => {},
    setDragging: () => {},
  });
  React.useEffect(() => {
    api.current = {
      scale: () => {
        const width = boardRef.current?.getBoundingClientRect().width ?? 0;
        return width > 0 ? W / width : 1;
      },
      snap: (id, axis, pos, from = null, dir = 0) => {
        const layer = layers.find((l) => l.id === id);
        if (!layer) return null;
        return axis === "x"
          ? snapAxis(
              pos,
              layer.width,
              "x",
              boxes(id),
              W,
              guides,
              threshold,
              grid,
              from,
              dir,
            )
          : snapAxis(
              pos,
              layer.height,
              "y",
              boxes(id),
              H,
              guides,
              threshold,
              grid,
              from,
              dir,
            );
      },
      preview: (id, frame, inside) => {
        draw(id, frame, inside);
        show();
      },
      release: hide,
      blur: () => {
        if (linger.current !== null) hide();
      },
      tick,
      commit,
      nudge,
      raise,
      setDragging: markDragging,
    };
  });

  // A switch of mode or a toggle mid-linger redraws nothing stale.
  React.useEffect(() => {
    overlay.set(EMPTY);
  }, [guides, distances, grid, overlay]);

  React.useEffect(
    () => () => {
      fade.current?.stop();
      if (linger.current !== null) window.clearTimeout(linger.current);
      linger.current = null;
    },
    [],
  );

  const spoken =
    said && at(said.id).x === said.x && at(said.id).y === said.y
      ? said.text
      : "";
  const guidePath = useTransform(overlay, (o) => o.guides);
  const measurePath = useTransform(overlay, (o) => o.lines);

  return (
    <div
      ref={boardRef}
      role="group"
      aria-label={label}
      aria-roledescription="artboard"
      aria-disabled={disabled || undefined}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setSelected(null);
      }}
      className={cn(
        "relative w-full overflow-clip rounded-1 bg-card [contain:paint] select-none",
        disabled && "opacity-50",
        className,
      )}
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-200",
          grid ? "opacity-100" : "opacity-0",
        )}
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--grid-major) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-major) 1px, transparent 1px)",
          backgroundSize: `${pct(GRID, W)} ${pct(GRID, H)}`,
        }}
      />

      {layers.map((layer) => (
        <LayerView
          key={layer.id}
          layer={layer}
          at={at(layer.id)}
          board={{ w: W, h: H }}
          selected={selected === layer.id || dragging === layer.id}
          raised={raised === layer.id}
          dragging={dragging === layer.id}
          disabled={disabled}
          motionSafe={motionSafe}
          hintId={hintId}
          api={api}
          onSelect={() => {
            setSelected(layer.id);
            setRaised(layer.id);
          }}
        />
      ))}

      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{ opacity: shown }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <motion.path
            d={measurePath}
            fill="none"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-cobalt-bright"
            opacity={0.7}
          />
          <motion.path
            d={guidePath}
            fill="none"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-cobalt-bright"
          />
        </svg>
        {[0, 1, 2, 3].map((i) => (
          <DistanceLabel
            key={i}
            overlay={overlay}
            index={i}
            board={{ w: W, h: H }}
          />
        ))}
      </motion.div>

      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-30 rounded-1 border border-hairline-strong"
      />
      <span id={hintId} className="sr-only">
        Arrow keys move it 1 pixel, Shift and an arrow 10. Edges snap into line.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}

function DistanceLabel({
  overlay,
  index,
  board,
}: {
  overlay: MotionValue<Overlay>;
  index: number;
  board: { w: number; h: number };
}) {
  const left = useTransform(overlay, (o) => {
    const m = o.labels[index];
    return m ? pct(m.lx, board.w) : "0%";
  });
  const top = useTransform(overlay, (o) => {
    const m = o.labels[index];
    return m ? pct(m.ly, board.h) : "0%";
  });
  const opacity = useTransform(overlay, (o) => (o.labels[index] ? 1 : 0));
  const text = useTransform(overlay, (o) => String(o.labels[index]?.gap ?? ""));
  return (
    <motion.span
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-1 bg-cobalt px-1 font-mono text-[10px] leading-4 text-primary-foreground tabular-nums"
      style={{ left, top, opacity }}
    >
      {text}
    </motion.span>
  );
}

function LayerView({
  layer,
  at,
  board,
  selected,
  raised,
  dragging,
  disabled,
  motionSafe,
  hintId,
  api,
  onSelect,
}: {
  layer: SnapGuidesLayer;
  at: SnapGuidesPoint;
  board: { w: number; h: number };
  selected: boolean;
  raised: boolean;
  dragging: boolean;
  disabled: boolean;
  motionSafe: boolean;
  hintId: string;
  api: React.RefObject<Api>;
  onSelect: () => void;
}) {
  const posId = React.useId();
  const x = useMotionValue(at.x);
  const y = useMotionValue(at.y);
  const running = React.useRef<Record<Axis, AnimationPlaybackControls | null>>({
    x: null,
    y: null,
  });
  // Where the layer is heading at rest; the host's value is compared to it.
  const goal = React.useRef<SnapGuidesPoint>(at);
  const held = React.useRef(false);
  const aborted = React.useRef(false);
  const start = React.useRef<SnapGuidesPoint>(at);
  const scale = React.useRef(1);
  const keys = React.useRef<Record<Axis, string | null>>({ x: null, y: null });
  const chasing = React.useRef<Record<Axis, boolean>>({ x: false, y: false });
  const last = React.useRef<{ x: number; y: number; inside: boolean }>({
    x: at.x,
    y: at.y,
    inside: true,
  });
  const detach = React.useRef<(() => void) | null>(null);
  const [released, setReleased] = React.useState(0);

  const w = layer.width;
  const h = layer.height;
  const maxX = Math.max(0, board.w - w);
  const maxY = Math.max(0, board.h - h);

  const stop = (axis: Axis) => {
    running.current[axis]?.stop();
    running.current[axis] = null;
  };
  const mv = (axis: Axis) => (axis === "x" ? x : y);

  /** Moves one axis to rest: a flick for a nudge, a glide for a longer trip. */
  const travel = React.useCallback(
    (axis: Axis, to: number, velocity?: number) => {
      running.current[axis]?.stop();
      running.current[axis] = null;
      const value = axis === "x" ? x : y;
      if (!motionSafe) {
        value.set(to);
        return;
      }
      const far = Math.abs(value.get() - to) > 16 || velocity !== undefined;
      running.current[axis] = animate(value, to, {
        ...(far ? springs.glide : springs.flick),
        velocity: velocity ?? value.getVelocity(),
      });
    },
    [motionSafe, x, y],
  );

  // The host's value (or our own commit) is where the layer rests. After a
  // release the counter re-runs this once the host has had its say: if it
  // refused the move, the layer glides back to the place it still holds.
  React.useEffect(() => {
    if (held.current) return;
    if (goal.current.x === at.x && goal.current.y === at.y) return;
    goal.current = { x: at.x, y: at.y };
    travel("x", at.x);
    travel("y", at.y);
  }, [at.x, at.y, released, travel]);

  React.useEffect(
    () => () => {
      running.current.x?.stop();
      running.current.y?.stop();
      detach.current?.();
      detach.current = null;
    },
    [],
  );

  /**
   * One axis per frame of the drag. A new snap (or letting go of one) gets a
   * quick critically damped spring from the current velocity, so the edge
   * visibly travels the last few px to its line; while it holds, the target
   * does not move. Once free, the spring chases the finger until it has
   * caught up, and from then on the layer is 1:1 again.
   */
  const follow = (axis: Axis, target: number, key: string | null) => {
    const value = mv(axis);
    const before = keys.current[axis];
    keys.current[axis] = key;
    if (!motionSafe) {
      stop(axis);
      value.set(target);
      return;
    }
    const spring = () => {
      stop(axis);
      running.current[axis] = animate(value, target, {
        ...springs.flick,
        velocity: value.getVelocity(),
      });
    };
    if (key !== before) {
      chasing.current[axis] = true;
      spring();
      return;
    }
    if (key !== null) return;
    if (chasing.current[axis] && Math.abs(value.get() - target) > 0.5) {
      spring();
      return;
    }
    chasing.current[axis] = false;
    stop(axis);
    value.set(target);
  };

  const putBack = () => {
    held.current = false;
    detach.current?.();
    detach.current = null;
    keys.current = { x: null, y: null };
    api.current.release();
    api.current.setDragging(null);
    goal.current = { x: at.x, y: at.y };
    travel("x", at.x);
    travel("y", at.y);
  };

  const drag = useDrag({
    disabled,
    onStart: () => {
      const k = api.current;
      aborted.current = false;
      held.current = true;
      stop("x");
      stop("y");
      start.current = { x: x.get(), y: y.get() };
      scale.current = k.scale();
      keys.current = { x: null, y: null };
      chasing.current = { x: false, y: false };
      k.raise(layer.id);
      k.setDragging(layer.id);
      onSelect();
      // Escape puts the layer back; it is claimed so the stage stays open.
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || !held.current) return;
        event.preventDefault();
        aborted.current = true;
        putBack();
      };
      document.addEventListener("keydown", onKey);
      detach.current = () => document.removeEventListener("keydown", onKey);
    },
    onMove: ({ offset, point }) => {
      if (aborted.current || !held.current) return;
      const k = api.current;
      const s = scale.current;
      const rawX = Math.round(start.current.x + offset.x * s);
      const rawY = Math.round(start.current.y + offset.y * s);
      const inX = rawX >= 0 && rawX <= maxX;
      const inY = rawY >= 0 && rawY <= maxY;
      // Out past the edge nothing snaps: the board's own edge would yank it
      // back in mid-pull. It rubber-bands instead.
      const fx = inX ? k.snap(layer.id, "x", rawX) : null;
      const fy = inY ? k.snap(layer.id, "y", rawY) : null;
      const tx = inX
        ? rawX + (fx?.delta ?? 0)
        : r2(rubberClamp(rawX, 0, maxX, w));
      const ty = inY
        ? rawY + (fy?.delta ?? 0)
        : r2(rubberClamp(rawY, 0, maxY, h));
      const newX = fx !== null && fx.key !== keys.current.x;
      const newY = fy !== null && fy.key !== keys.current.y;
      follow("x", tx, fx?.key ?? null);
      follow("y", ty, fy?.key ?? null);
      last.current = { x: tx, y: ty, inside: inX && inY };
      const frame = { x: tx, y: ty, w, h };
      if (newX && fx) k.tick(fx.tone, point.x, frame);
      else if (newY && fy) k.tick(fy.tone, point.x, frame);
      k.preview(layer.id, frame, inX && inY);
    },
    onEnd: ({ velocity }) => {
      if (aborted.current || !held.current) return;
      const k = api.current;
      held.current = false;
      detach.current?.();
      detach.current = null;
      const final = {
        x: clamp(Math.round(last.current.x), 0, maxX),
        y: clamp(Math.round(last.current.y), 0, maxY),
      };
      if (!last.current.inside) {
        // Back inside on a glide that carries the throw, in artboard px/s.
        const s = scale.current;
        travel("x", final.x, velocity.x * s);
        travel("y", final.y, velocity.y * s);
      } else {
        // A centre line can sit on a half pixel; the layer rests on a whole
        // one. Any snap still in flight keeps going if it is already there.
        if (Math.abs(last.current.x - final.x) > 0.01) travel("x", final.x);
        if (Math.abs(last.current.y - final.y) > 0.01) travel("y", final.y);
      }
      goal.current = final;
      keys.current = { x: null, y: null };
      k.release();
      k.setDragging(null);
      k.commit(layer.id, final);
      setReleased((n) => n + 1);
    },
    onCancel: () => {
      if (!aborted.current && held.current) putBack();
    },
    onTap: () => {
      api.current.raise(layer.id);
      onSelect();
    },
  });

  const left = useTransform(x, (v) => pct(v, board.w));
  const top = useTransform(y, (v) => pct(v, board.h));

  return (
    <motion.button
      type="button"
      aria-roledescription="layer"
      aria-label={layer.label}
      aria-describedby={`${posId} ${hintId}`}
      disabled={disabled}
      onFocus={onSelect}
      onBlur={() => {
        if (!held.current) api.current.blur();
      }}
      onKeyDown={(event) => {
        if (event.altKey || event.metaKey || event.ctrlKey) return;
        const step = event.shiftKey ? 10 : 1;
        const move: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const d = move[event.key];
        if (!d) return;
        event.preventDefault();
        api.current.nudge(layer.id, d[0], d[1]);
      }}
      {...drag}
      className={cn(
        "group/snap-guides absolute block touch-none outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed"
          : dragging
            ? "cursor-grabbing"
            : "cursor-grab",
      )}
      style={{
        left,
        top,
        width: pct(w, board.w),
        height: pct(h, board.h),
        zIndex: dragging ? 12 : raised ? 11 : 1,
      }}
    >
      <span className="pointer-events-none absolute inset-0 block">
        {layer.content}
      </span>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-px border transition-colors",
          selected
            ? "border-cobalt-bright"
            : "border-transparent group-hover/snap-guides:border-cobalt-bright/50",
        )}
      >
        {selected
          ? (
              [
                "-top-1 -left-1",
                "-top-1 -right-1",
                "-bottom-1 -left-1",
                "-bottom-1 -right-1",
              ] as const
            ).map((spot) => (
              <span
                key={spot}
                className={cn(
                  "absolute size-1.5 border border-cobalt-bright bg-card",
                  spot,
                )}
              />
            ))
          : null}
      </span>
      <span id={posId} className="sr-only">
        {`at ${at.x}, ${at.y}`}
      </span>
    </motion.button>
  );
}
