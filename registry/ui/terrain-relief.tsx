"use client";

import * as React from "react";

import { animate, useMotionValue, useMotionValueEvent } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { mapRange, wrapAngle } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** viewBox is fixed; the SVG scales to its container width via w-full. */
const VIEW_W = 400;
/** Horizontal footprint scale — px per unit of centred grid coordinate. */
const SCALE = 15;
/** Oblique tabletop tilt applied to the rotated z (depth) before projecting to screen y. */
const TILT = 0.5;
/** px of screen lift per normalized elevation unit (0..1). */
const LIFT = 64;
/** Default resting yaw (degrees) — a three-quarter oblique view of the survey. */
const DEFAULT_YAW = 34;
/** Pointer px of horizontal travel per degree of yaw. */
const PX_PER_DEG = 1.6;
/** Keyboard nudge, degrees. */
const KEY_STEP = 15;
/** Pointer travel before a press counts as a rotate drag — protects taps/clicks. */
const DRAG_THRESHOLD = 3;
/** Node hit-target radii, viewBox units — the visible dot and its larger hover/tap area. */
const NODE_R = 2.4;
const NODE_HIT_R = 9;

export type TerrainProbe = { row: number; col: number; value: number };

export type TerrainReliefProps = {
  /** data[row][col] = elevation, any real range — normalized internally. */
  data: number[][];
  /** Fires on hover/focus of a node with its original-units elevation, and on leave with null. */
  onProbe?: (probe: TerrainProbe | null) => void;
  /** Plotted height in px. The width is fluid; the viewBox is fixed. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** A grid node's position after centring, elevation normalizing, and yaw rotation. */
type Node = {
  row: number;
  col: number;
  /** Elevation normalized to 0..1 across the grid. */
  norm: number;
  /** Original-units elevation, surfaced to onProbe. */
  value: number;
  /** Rotated depth (screen-space "into the scene") — drives paint order and far-fade. */
  depth: number;
  sx: number;
  sy: number;
};

/** One drawable back-to-front polyline (a mesh row or column) plus its paint-order depth. */
type Strand = {
  key: string;
  d: string;
  /** Mean depth of the strand's nodes — sorted back (negative) to front (positive). */
  depth: number;
  /** Mean normalized elevation — drives the wire tint. */
  meanNorm: number;
};

/** Two dusk wire tints, legible on both surface themes — deep at low elevation, bright at high. */
const WIRE_LOW = "oklch(0.5 0.09 262)";
const WIRE_HIGH = "oklch(0.72 0.15 262)";

/** min/max via a plain loop — guards a flat or empty grid rather than dividing by zero span. */
function elevationExtent(data: number[][]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    for (const v of row) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 };
  return { min, max };
}

/** Projects every grid node at the given yaw, sized against the current viewBox centre. */
function projectNodes(
  data: number[][],
  min: number,
  max: number,
  yawDeg: number,
  cx: number,
  cy: number,
): Node[] {
  const rows = data.length;
  const cols = rows > 0 ? (data[0]?.length ?? 0) : 0;
  const span = max - min;
  const theta = (yawDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const rowMid = (rows - 1) / 2;
  const colMid = (cols - 1) / 2;

  const nodes: Node[] = [];
  for (let r = 0; r < rows; r++) {
    const rowData = data[r];
    if (!rowData) continue;
    for (let c = 0; c < cols; c++) {
      const value = rowData[c];
      if (value === undefined) continue;
      const norm = span === 0 ? 0.5 : (value - min) / span;
      const x = c - colMid;
      const z = r - rowMid;
      const xr = x * cosT + z * sinT;
      const zr = -x * sinT + z * cosT;
      const sx = cx + xr * SCALE;
      const sy = cy + zr * SCALE * TILT - norm * LIFT;
      nodes.push({ row: r, col: c, norm, value, depth: zr, sx, sy });
    }
  }
  return nodes;
}

/** Builds one polyline per row and one per column, each tagged with paint-order depth. */
function buildStrands(nodes: Node[], rows: number, cols: number): Strand[] {
  const strands: Strand[] = [];

  for (let r = 0; r < rows; r++) {
    let d = "";
    let depthSum = 0;
    let normSum = 0;
    let n = 0;
    for (let c = 0; c < cols; c++) {
      const node = nodes[r * cols + c];
      if (!node) continue;
      d += `${n === 0 ? "M" : "L"}${node.sx.toFixed(2)} ${node.sy.toFixed(2)} `;
      depthSum += node.depth;
      normSum += node.norm;
      n += 1;
    }
    if (n > 1) strands.push({ key: `r${r}`, d, depth: depthSum / n, meanNorm: normSum / n });
  }

  for (let c = 0; c < cols; c++) {
    let d = "";
    let depthSum = 0;
    let normSum = 0;
    let n = 0;
    for (let r = 0; r < rows; r++) {
      const node = nodes[r * cols + c];
      if (!node) continue;
      d += `${n === 0 ? "M" : "L"}${node.sx.toFixed(2)} ${node.sy.toFixed(2)} `;
      depthSum += node.depth;
      normSum += node.norm;
      n += 1;
    }
    if (n > 1) strands.push({ key: `c${c}`, d, depth: depthSum / n, meanNorm: normSum / n });
  }

  // Painter's algorithm: back (most negative depth) first, front last, so
  // near wires overdraw far ones exactly where the mesh crosses itself.
  strands.sort((a, b) => a.depth - b.depth);
  return strands;
}

type DragState = { pointerId: number; startX: number; startYaw: number; engaged: boolean };

/**
 * A data heightmap rendered as a rotatable wireframe terrain: pure SVG 2.5D
 * (no canvas, no preserve-3d). Elevations normalize to 0..1 across the grid,
 * centre on the origin, and rotate around the vertical axis by a yaw angle
 * before an oblique projection drops them onto the viewBox — the same
 * tabletop-tilt trick as an isometric map, done by hand with sin/cos. Mesh
 * strands (one polyline per row, one per column) sort back-to-front by
 * rotated depth so the near ridge always overdraws the far one, and a subtle
 * far-fade dims strands leaning away from the viewer.
 *
 * Rotation: horizontal pointer drag over the chart free-spins yaw (wrapped
 * 0..360, so it never runs out of travel); release settles it on a `glide`
 * spring. ArrowLeft/Right nudge 15° at a time and Home returns to the
 * default oblique angle, all through the same slider role.
 *
 * Each node is a small hit target — hovering or focusing one fires `onProbe`
 * with its row, column, and original-units elevation, and lifts a compact
 * mono readout beside it; leaving fires `onProbe(null)`. A peak node (the
 * grid's highest point) stays keyboard-reachable even without a pointer.
 *
 * Reduced motion: the mesh renders once at the default yaw with no drag
 * wiring and no settle spring — a static oblique wireframe. Probing stays
 * fully interactive either way, since it is direct manipulation, not motion.
 */
export function TerrainRelief({
  data,
  onProbe,
  height = 300,
  className,
  "aria-label": ariaLabel = "Terrain relief survey",
}: TerrainReliefProps) {
  const motionSafe = useMotionSafe();
  const dragRef = React.useRef<DragState | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);

  const rows = data.length;
  const cols = rows > 0 ? (data[0]?.length ?? 0) : 0;

  const yawMv = useMotionValue(DEFAULT_YAW);
  const [yaw, setYaw] = React.useState(DEFAULT_YAW);
  useMotionValueEvent(yawMv, "change", (v) => setYaw(wrapAngle(v)));

  // Stop any settle-in-flight on unmount so it never writes to a gone motion value.
  React.useEffect(() => {
    const controls = controlsRef;
    return () => controls.current?.stop();
  }, []);

  const [probe, setProbe] = React.useState<TerrainProbe | null>(null);

  const onProbeRef = React.useRef(onProbe);
  React.useEffect(() => {
    onProbeRef.current = onProbe;
  });

  const emitProbe = (next: TerrainProbe | null) => {
    setProbe(next);
    onProbeRef.current?.(next);
  };

  const { min, max } = elevationExtent(data);
  const cx = VIEW_W / 2;
  const cy = height / 2;
  const drawYaw = motionSafe ? yaw : DEFAULT_YAW;
  const nodes = projectNodes(data, min, max, drawYaw, cx, cy);
  const strands = buildStrands(nodes, rows, cols);
  // Half-diagonal of the centred grid footprint — the real reach of rotated
  // depth, used to scale the far-fade so it visibly varies at any grid size.
  const depthReach = (Math.max(rows, cols) / 2) * SCALE || 1;

  // The peak node stays reachable by keyboard even with no pointer in play.
  let peak: Node | null = null;
  for (const node of nodes) {
    if (peak === null || node.value > peak.value) peak = node;
  }

  /** Drives yaw toward `target` — a settle spring at full motion, an instant
   *  jump under reduced motion (RM never rotates past the default anyway,
   *  since render pins `drawYaw`, but this keeps the motion value coherent
   *  for `aria-valuenow` without ever animating). */
  const settleYaw = (target: number, velocity = 0) => {
    controlsRef.current?.stop();
    if (!motionSafe) {
      yawMv.jump(target);
      return;
    }
    controlsRef.current = animate(yawMv, target, { ...springs.glide, velocity });
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!motionSafe || event.button !== 0) return;
    controlsRef.current?.stop();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startYaw: yawMv.get(),
      engaged: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.engaged && Math.abs(dx) < DRAG_THRESHOLD) return;
    drag.engaged = true;
    yawMv.jump(drag.startYaw + dx / PX_PER_DEG);
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    settleYaw(wrapAngle(yawMv.get()));
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!motionSafe) return;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        settleYaw(yawMv.get() - KEY_STEP);
        return;
      case "ArrowRight":
        event.preventDefault();
        settleYaw(yawMv.get() + KEY_STEP);
        return;
      case "Home":
        event.preventDefault();
        settleYaw(DEFAULT_YAW);
        return;
      default:
        return;
    }
  };

  const summary =
    rows === 0 || cols === 0
      ? `${ariaLabel}: no data`
      : `${ariaLabel}: ${rows}×${cols} grid, elevation ${min.toFixed(1)} to ${max.toFixed(1)}`;

  const hudLine = probe
    ? `ELEV · ${probe.value.toFixed(1)}`
    : peak
      ? `PEAK · ${peak.value.toFixed(1)}`
      : "PEAK · —";

  const probedNode =
    probe && nodes.find((n) => n.row === probe.row && n.col === probe.col);

  if (rows === 0 || cols === 0) {
    return (
      <div
        className={cn(
          "bg-surface-1 border-hairline grid place-items-center rounded-2 border text-xs text-ink-3",
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={summary}
      >
        <span className="sr-only">{summary}</span>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        style={{ height }}
        className={cn(
          "block w-full touch-none overflow-visible select-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
          motionSafe && "cursor-grab active:cursor-grabbing",
        )}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-roledescription="Rotatable terrain relief"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(yaw)}
        aria-valuetext={`Yaw ${Math.round(yaw)} degrees`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      >
        <g>
          {strands.map((strand) => {
            // Far strands (negative depth) fade slightly — a cheap depth cue
            // that keeps the near ridge visually forward without shading.
            const fade = mapRange(strand.depth, -depthReach, depthReach, 0.45, 1);
            return (
              <path
                key={strand.key}
                d={strand.d}
                fill="none"
                stroke={strand.meanNorm > 0.5 ? WIRE_HIGH : WIRE_LOW}
                strokeOpacity={fade}
                strokeWidth={1}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Probe hit targets: a visible node dot plus a larger transparent
              hit area, painted in the same back-to-front order as the mesh. */}
          {nodes.map((node) => {
            const isPeak = peak !== null && node.row === peak.row && node.col === peak.col;
            const isProbed =
              probe !== null && probe.row === node.row && probe.col === node.col;
            return (
              <g key={`n${node.row}-${node.col}`}>
                <circle
                  cx={node.sx}
                  cy={node.sy}
                  r={NODE_HIT_R}
                  fill="transparent"
                  tabIndex={isPeak ? 0 : -1}
                  role="button"
                  aria-label={`Row ${node.row + 1}, column ${node.col + 1}, elevation ${node.value.toFixed(1)}`}
                  className="cursor-pointer outline-none"
                  onPointerEnter={() =>
                    emitProbe({ row: node.row, col: node.col, value: node.value })
                  }
                  onPointerLeave={() => emitProbe(null)}
                  onFocus={() =>
                    emitProbe({ row: node.row, col: node.col, value: node.value })
                  }
                  onBlur={() => emitProbe(null)}
                />
                <circle
                  cx={node.sx}
                  cy={node.sy}
                  r={isProbed ? NODE_R * 1.4 : NODE_R}
                  fill={isProbed ? "var(--accent-bright)" : "var(--card)"}
                  stroke={isProbed ? "var(--accent-bright)" : "var(--hairline-strong)"}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              </g>
            );
          })}
        </g>

        {/* Readout label lifted beside the probed node. */}
        {probedNode && (
          <g pointerEvents="none">
            <text
              x={probedNode.sx}
              y={probedNode.sy - 10}
              textAnchor="middle"
              className="font-mono text-[9px] tabular-nums"
              fill="var(--accent-bright)"
            >
              {probedNode.value.toFixed(1)}
            </text>
          </g>
        )}
      </svg>

      <span role="status" aria-live="polite" className="sr-only">
        {hudLine}
      </span>
      <p className="sr-only">{summary}</p>
    </div>
  );
}
