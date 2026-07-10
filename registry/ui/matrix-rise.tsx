"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type MatrixRiseProps = {
  /** Values, one row per entry — a rectangular r×c grid. */
  data: number[][];
  /** Row labels, top to bottom. */
  rowLabels?: string[];
  /** Column labels, left to right. */
  colLabels?: string[];
  /** Controlled risen state. */
  risen?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultRisen?: boolean;
  /** Fires the new state whenever the toggle changes it. */
  onToggle?: (risen: boolean) => void;
  /** Stage height in px. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** Iso cell width, view-space px — bars share this footprint. */
const CELL = 40;
/** Max bar rise (screen px) at the top of the value range. */
const BAR_H = 88;
/** Fixed layout width the flat grid and iso stage both scale from via w-full. */
const VIEW_W = 480;
/** Stage padding so risen bars and labels never clip the frame. */
const PAD = 28;
/** Bar hue — one accent hue shaded across roof/left/right faces. */
const HUE = 262;

type Cell = {
  row: number;
  col: number;
  value: number;
  /** Value normalized 0..1 across the whole matrix. */
  t: number;
};

/** Flattens the matrix into cells carrying their normalized value. */
function layCells(data: number[][]): { cells: Cell[]; min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    for (const value of row) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 0;
  }
  const cells: Cell[] = [];
  for (let r = 0; r < data.length; r += 1) {
    const row = data[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c += 1) {
      const value = row[c];
      if (value === undefined) continue;
      cells.push({ row: r, col: c, value, t: mapRange(value, min, max, 0, 1) });
    }
  }
  return { cells, min, max };
}

/** Two dusk oklch stops a value ramps between — legible on both themes. */
const rampColor = (t: number): string => {
  const l = mapRange(t, 0, 1, 0.28, 0.78);
  const c = mapRange(t, 0, 1, 0.06, 0.19);
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${HUE})`;
};

/** The three iso faces of a w × (w/2 + depth) box, as clip-path polygons —
 *  the iso-blocks idiom: flat 2D, zero 3D transforms, Safari-proof. */
function isoFaces(w: number, depth: number) {
  const half = w / 2;
  const rim = half / 2;
  const d = Math.max(depth, 0.5);
  return {
    height: rim * 2 + d,
    top: `polygon(${half}px 0, ${w}px ${rim}px, ${half}px ${rim * 2}px, 0 ${rim}px)`,
    left: `polygon(0 ${rim}px, ${half}px ${rim * 2}px, ${half}px ${rim * 2 + d}px, 0 ${rim + d}px)`,
    right: `polygon(${half}px ${rim * 2}px, ${w}px ${rim}px, ${w}px ${rim + d}px, ${half}px ${rim * 2 + d}px)`,
  };
}

type Placed = {
  cell: Cell;
  /** Flat-grid box, view-space px against VIEW_W × plotH. */
  flatLeft: number;
  flatTop: number;
  flatW: number;
  flatH: number;
  /** Iso-city anchor, view-space px against the same VIEW_W. */
  isoX: number;
  isoY: number;
  isoZ: number;
  color: string;
};

/** Lays out every cell's flat-grid box and iso-city anchor from one shared
 *  coordinate space, so the two poses can be springed between directly.
 *  The iso anchor mirrors iso-blocks' projection: col−row sets the x lane,
 *  col+row ladders y so later rows/cols sit lower on screen (and paint in
 *  front, via isoZ) — the standard diamond-grid iso projection. Horizontal
 *  values (`flatLeft`/`flatW`/`isoX`) stay in the fixed VIEW_W coordinate
 *  space; `pctX` below converts them to percentages at render time (the
 *  arc-routes/explode-view technique), so the stage scales fluidly with its
 *  container width — no transform, no measurement. Vertical values stay real
 *  px throughout, already measured against the real `height` prop. */
function place(cells: Cell[], rows: number, cols: number, plotH: number): Placed[] {
  const flatW = VIEW_W / cols;
  const flatH = plotH / rows;
  const isoW = CELL;
  const stageW = (rows + cols) * (isoW / 2);
  const originX = (VIEW_W - stageW) / 2 + ((rows - 1) * isoW) / 2;

  return cells.map((cell) => ({
    cell,
    flatLeft: cell.col * flatW,
    flatTop: cell.row * flatH,
    flatW,
    flatH,
    isoX: originX + ((cell.col - cell.row) * isoW) / 2,
    isoY: ((cell.col + cell.row) * isoW) / 4 + PAD,
    isoZ: cell.row + cell.col,
    color: rampColor(cell.t),
  }));
}

/** VIEW_W-space px → percent of stage width — the arc-routes/explode-view
 *  fluid-scaling technique: every horizontal position/footprint is expressed
 *  as a percentage of the fixed coordinate space, so the stage's own w-full
 *  container does the scaling and nothing overflows at 375px. */
const pctX = (px: number): string => `${(px / VIEW_W) * 100}%`;

/**
 * A heat-grid table that rises into a bar city on toggle. Flat, it is a
 * top-down heatmap: one button per value, filled by a value→color ramp
 * (`mapRange` across two dusk oklch stops on one hue) with hairline seams and
 * optional row/column labels. Risen, the same cells extrude into isometric
 * bars — three clip-path faces of a box apiece, exactly the iso-blocks idiom
 * (flat 2D, zero 3D transforms, Safari-proof) — whose height tracks their
 * value, laid on an iso grid where later rows/columns paint in front.
 *
 * Both poses are computed from one shared layout (`place`), so toggling
 * springs every cell's position, size, and bar height from flat to iso on
 * `springs.glide`, staggered by `cascade(count)` × each cell's `row + col` —
 * a diagonal sweep from the near corner. Declarative `animate` throughout, so
 * there is no per-frame setState; toggling back collapses the same way.
 *
 * Hovering or focusing a cell/bar highlights it and lifts a readout of its
 * row/column label and value. Cells are real buttons in normal tab order.
 * `risen`/`defaultRisen` follow the controlled/uncontrolled convention,
 * `onToggle` fires the new state, and an sr-only polite region announces
 * "Raised"/"Flattened" alongside a static description of the matrix's shape
 * and range. Reduced motion swaps instantly between the flat heatmap and the
 * static iso city with identical callbacks and announcements.
 */
export function MatrixRise({
  data,
  rowLabels = [],
  colLabels = [],
  risen: controlledRisen,
  defaultRisen = false,
  onToggle,
  height = 300,
  className,
  "aria-label": ariaLabel = "Load matrix",
}: MatrixRiseProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolledRisen, setUncontrolledRisen] = React.useState(defaultRisen);
  const isRisen = controlledRisen ?? uncontrolledRisen;

  const [activeKey, setActiveKey] = React.useState<string | null>(null);

  const rows = data.length;
  const cols = data.reduce((max, row) => Math.max(max, row.length), 0);
  const { cells, min, max } = layCells(data);
  const count = cells.length;
  const step = cascade(count);

  const plotH = height - PAD * 2;
  const placed = place(cells, rows, cols, plotH);

  const handleToggle = () => {
    const next = !isRisen;
    if (controlledRisen === undefined) setUncontrolledRisen(next);
    onToggle?.(next);
  };

  const hudText = isRisen ? "VIEW · CITY" : "VIEW · GRID";
  const announcement = isRisen ? "Raised" : "Flattened";
  const description = `A ${rows} by ${cols} load matrix, values from ${min.toFixed(1)} to ${max.toFixed(1)}. ${
    isRisen
      ? "Currently shown as a city of bars whose height tracks each value."
      : "Currently shown as a flat heat grid."
  }`;

  return (
    <div className={cn("w-full", className)}>
      <div
        role="group"
        aria-label={ariaLabel}
        className="border-hairline bg-surface-0 relative w-full overflow-hidden rounded-3 border"
        style={{ height }}
      >
        <p className="sr-only">{description}</p>

        <div className="relative mx-auto h-full" style={{ maxWidth: VIEW_W }}>
          {placed.map((p) => (
            <MatrixCell
              key={`${p.cell.row}-${p.cell.col}`}
              placed={p}
              risen={isRisen}
              motionSafe={motionSafe}
              delay={(p.cell.row + p.cell.col) * step}
              active={activeKey === `${p.cell.row}-${p.cell.col}`}
              rowLabel={rowLabels[p.cell.row]}
              colLabel={colLabels[p.cell.col]}
              onActivate={(key) => setActiveKey(key)}
              onDeactivate={(key) =>
                setActiveKey((cur) => (cur === key ? null : cur))
              }
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-label text-ink-3">{hudText}</p>
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "border-cobalt/50 bg-cobalt-wash text-label text-cobalt cursor-pointer rounded-2 border px-3.5 py-1.5 transition-colors",
            "hover:border-cobalt focus-visible:ring-ring outline-none focus-visible:ring-2",
          )}
        >
          {isRisen ? "FLATTEN" : "RAISE"}
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type MatrixCellProps = {
  placed: Placed;
  risen: boolean;
  motionSafe: boolean;
  /** This cell's slice of the diagonal-sweep cascade, seconds. */
  delay: number;
  active: boolean;
  rowLabel?: string;
  colLabel?: string;
  onActivate: (key: string) => void;
  onDeactivate: (key: string) => void;
};

/**
 * One cell, rendered as a single positioned button whose geometry springs
 * between its flat-grid box and its iso-city bar. Flat, it is a plain tile
 * filled with the ramp color; risen, three absolutely-positioned clip-path
 * spans (top/left/right) draw the bar, with the top face's height following
 * the cell's value. Hovering/focusing lifts a small readout above it.
 */
function MatrixCell({
  placed,
  risen,
  motionSafe,
  delay,
  active,
  rowLabel,
  colLabel,
  onActivate,
  onDeactivate,
}: MatrixCellProps) {
  const key = `${placed.cell.row}-${placed.cell.col}`;
  const barDepth = clamp(placed.cell.t * BAR_H, 4, BAR_H);
  const faces = isoFaces(CELL, barDepth);
  // Ground-level iso box (minimum depth) — the anchor a bar's base sits flush
  // against, so taller values grow the box upward rather than downward.
  const groundFaces = isoFaces(CELL, 0);

  const transition = motionSafe
    ? { ...springs.glide, delay }
    : { duration: 0 };

  // Flat pose: grid box at the cell's table position. Risen pose: iso
  // anchor, with `top` pulled up by exactly the extra height a taller bar
  // adds, so every bar's *base* stays pinned to the same ground line and
  // only its roof climbs — a true extrusion, not a bar sliding in place.
  // `left`/`width` stay percentages in both poses (same unit type springs
  // cleanly, and keeps the stage 375-safe); `top`/`height` stay real px in
  // both poses, already measured against the real `height` prop. Both poses
  // share the same node so the spring animates position + size together on
  // one declarative `animate`.
  const pose = risen
    ? {
        left: pctX(placed.isoX),
        top: placed.isoY - (faces.height - groundFaces.height),
        width: pctX(CELL),
        height: faces.height,
      }
    : {
        left: pctX(placed.flatLeft),
        top: placed.flatTop,
        width: pctX(placed.flatW),
        height: placed.flatH,
      };

  const label = `${rowLabel ?? `Row ${placed.cell.row + 1}`}, ${
    colLabel ?? `Column ${placed.cell.col + 1}`
  }: ${placed.cell.value}`;

  const barTopColor = active ? `oklch(0.78 0.15 ${HUE})` : placed.color;
  const barLeftColor = `oklch(0.3 0.06 ${HUE})`;
  const barRightColor = `oklch(0.22 0.05 ${HUE})`;

  return (
    <motion.button
      type="button"
      aria-label={label}
      onPointerEnter={() => onActivate(key)}
      onPointerLeave={() => onDeactivate(key)}
      onFocus={() => onActivate(key)}
      onBlur={() => onDeactivate(key)}
      initial={false}
      animate={pose}
      transition={transition}
      className="focus-visible:ring-cobalt-bright/60 absolute outline-none focus-visible:ring-2"
      style={{ zIndex: risen ? 10 + placed.isoZ : active ? 20 : 1 }}
    >
      {/* Flat fill — the heat-grid tile. Present at all times so the box
          never looks empty mid-spring; risen bars draw over it. */}
      <motion.span
        aria-hidden
        className="border-hairline/60 absolute inset-0 border"
        initial={false}
        animate={{ background: placed.color, opacity: risen ? 0 : 1 }}
        transition={{ duration: durations.fast }}
      />

      {/* Iso bar — three clip-path faces of a box, the iso-blocks idiom. */}
      <motion.span
        aria-hidden
        className="absolute inset-0"
        initial={false}
        animate={{ background: barTopColor, opacity: risen ? 1 : 0 }}
        transition={{ duration: durations.fast }}
        style={{ clipPath: faces.top }}
      />
      <motion.span
        aria-hidden
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: risen ? 1 : 0 }}
        transition={{ duration: durations.fast }}
        style={{ clipPath: faces.left, background: barLeftColor }}
      />
      <motion.span
        aria-hidden
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: risen ? 1 : 0 }}
        transition={{ duration: durations.fast }}
        style={{ clipPath: faces.right, background: barRightColor }}
      />

      {/* Readout plate — floats above the cell/bar while active. */}
      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: active ? 1 : 0, y: active ? -6 : 0 }}
        transition={{ duration: durations.fast }}
        className="border-hairline bg-surface-0/95 pointer-events-none absolute -top-6 left-1/2 z-30 -translate-x-1/2 rounded-1 border px-1.5 py-0.5 text-center font-mono text-[9px] whitespace-nowrap backdrop-blur-sm"
      >
        <span className="text-ink block">{placed.cell.value}</span>
      </motion.span>
    </motion.button>
  );
}
