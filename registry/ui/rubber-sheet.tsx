"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Logical SVG space; the mesh scales to fill the stage via viewBox. */
const VIEW_W = 100;
const VIEW_H = 100;
/** Inset the rest grid from the viewBox edge so pinned corners have margin. */
const MARGIN = 6;
/**
 * Falloff radius in viewBox units — how far the pull reaches from the grab
 * point. Wide enough that a mid-sheet grab tents most of the membrane.
 */
const FALLOFF = 34;
/** Pointer travel (px) before a press becomes a pull — protects taps/clicks. */
const DRAG_THRESHOLD = 3;
/**
 * Cap on pull magnitude (viewBox units per axis) so a fast drag can't fling a
 * vertex through its neighbours and invert the sheet.
 */
const PULL_CLAMP = 46;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Vertex = {
  /** Rest position in viewBox units. */
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  engaged: boolean;
};

export type RubberSheetProps = {
  /** Mesh columns, clamped to [4, 16]. */
  columns?: number;
  /** Mesh rows, clamped to [3, 14]. */
  rows?: number;
  className?: string;
  "aria-label"?: string;
  /** Stage height in px. */
  height?: number;
};

/**
 * A taut elastic membrane you grab and pull. The surface stretches toward the
 * pointer with a smooth Gaussian falloff — vertices near the grab travel most,
 * the pinned border barely at all — tracking your finger 1:1. On release the
 * whole sheet fires home on the `recoil` spring, ringing through equilibrium
 * twice before it settles. Re-grab mid-ring to catch it and pull again.
 *
 * One `pullX`/`pullY` pair drives every vertex; the mesh paths are rewritten
 * imperatively from those values, so the ripple costs no React renders.
 * Reduced motion: the mesh stays flat, dragging still deforms 1:1 for direct
 * manipulation, but release snaps back to flat instantly with no ring.
 */
export function RubberSheet({
  columns = 9,
  rows = 7,
  className,
  "aria-label": ariaLabel = "Rubber sheet",
  height = 260,
}: RubberSheetProps) {
  const motionSafe = useMotionSafe();
  const stageRef = React.useRef<HTMLDivElement>(null);

  const cols = clamp(Math.round(columns), 4, 16);
  const rowCount = clamp(Math.round(rows), 3, 14);

  // Rest grid: evenly spaced points inset by MARGIN. Deterministic, SSR-safe,
  // and stable for a given cols/rowCount — no randomness, no measurement.
  const grid = React.useMemo(() => {
    const points: Vertex[][] = [];
    const spanX = VIEW_W - MARGIN * 2;
    const spanY = VIEW_H - MARGIN * 2;
    for (let r = 0; r < rowCount; r++) {
      const row: Vertex[] = [];
      const y = MARGIN + (rowCount === 1 ? 0 : (r / (rowCount - 1)) * spanY);
      for (let c = 0; c < cols; c++) {
        const x = MARGIN + (cols === 1 ? 0 : (c / (cols - 1)) * spanX);
        row.push({ x, y });
      }
      points.push(row);
    }
    return points;
  }, [cols, rowCount]);

  // The gesture, as two motion values: pointer displacement from the grab
  // origin, in viewBox units. The recoil spring animates these home; the mesh
  // reads them every frame. Grab origin lives on refs (never read in render).
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const originRef = React.useRef({ x: VIEW_W / 2, y: VIEW_H / 2 });
  // Per-grab Gaussian weights indexed [row][col]. Held on a ref (freely
  // mutable) so the memoized rest grid is never written to. Empty ⇒ flat.
  const weightsRef = React.useRef<number[][]>([]);

  const dragRef = React.useRef<DragState | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate>[]>([]);
  const pxPerUnitRef = React.useRef({ x: VIEW_W / 300, y: VIEW_H / height });

  // Imperative sinks: horizontal + vertical polyline paths, and the apex dot.
  const hPathRef = React.useRef<SVGPathElement>(null);
  const vPathRef = React.useRef<SVGPathElement>(null);
  const apexRef = React.useRef<SVGCircleElement>(null);

  const stopRecoil = React.useCallback(() => {
    for (const controls of controlsRef.current) controls.stop();
    controlsRef.current = [];
  }, []);
  React.useEffect(() => stopRecoil, [stopRecoil]);

  // Weight each vertex for the current grab: a Gaussian of distance to the
  // origin, zeroed on the pinned border. Called once per grab, not per frame.
  const weightForGrab = React.useCallback(
    (ox: number, oy: number) => {
      const weights: number[][] = [];
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        const wRow: number[] = [];
        const pinnedRow = r === 0 || r === grid.length - 1;
        for (let c = 0; c < (row?.length ?? 0); c++) {
          const vertex = row?.[c];
          const pinned = pinnedRow || c === 0 || c === (row?.length ?? 0) - 1;
          if (!vertex || pinned) {
            wRow.push(0);
            continue;
          }
          const dx = vertex.x - ox;
          const dy = vertex.y - oy;
          const d = Math.sqrt(dx * dx + dy * dy) / FALLOFF;
          wRow.push(Math.exp(-(d * d)));
        }
        weights.push(wRow);
      }
      weightsRef.current = weights;
    },
    [grid],
  );

  // Rewrite both mesh paths from the current pull. Runs on every pull frame
  // (drag + recoil) — pure string building, zero React state.
  const renderMesh = React.useCallback(
    (px: number, py: number) => {
      const hNode = hPathRef.current;
      const vNode = vPathRef.current;
      let horizontal = "";
      let vertical = "";

      const weights = weightsRef.current;
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const vertex = row[c];
          if (!vertex) continue;
          const w = weights[r]?.[c] ?? 0;
          const x = vertex.x + px * w;
          const y = vertex.y + py * w;
          horizontal += `${c === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
        }
      }
      // Vertical lines walk column-major across the same displaced vertices.
      const firstRow = grid[0];
      if (firstRow) {
        for (let c = 0; c < firstRow.length; c++) {
          for (let r = 0; r < grid.length; r++) {
            const vertex = grid[r]?.[c];
            if (!vertex) continue;
            const w = weights[r]?.[c] ?? 0;
            const x = vertex.x + px * w;
            const y = vertex.y + py * w;
            vertical += `${r === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
          }
        }
      }

      if (hNode) hNode.setAttribute("d", horizontal);
      if (vNode) vNode.setAttribute("d", vertical);

      const apex = apexRef.current;
      if (apex) {
        apex.setAttribute("cx", (originRef.current.x + px).toFixed(2));
        apex.setAttribute("cy", (originRef.current.y + py).toFixed(2));
      }
    },
    [grid],
  );

  // Subscribe once per axis: any pull change repaints the mesh. Because both
  // reads pull the live value, a single subscription per axis is enough.
  useMotionValueEvent(pullX, "change", (v) => renderMesh(v, pullY.get()));
  useMotionValueEvent(pullY, "change", (v) => renderMesh(pullX.get(), v));

  // Paint the rest state on mount and whenever the grid changes.
  React.useEffect(() => {
    renderMesh(pullX.get(), pullY.get());
  }, [renderMesh, pullX, pullY]);

  // The apex only shows while a grab is live; drive its opacity with a value
  // so drag/release don't re-render the tree.
  const apexActive = useMotionValue(0);
  const apexOpacity = useTransform(apexActive, (v) => v * 0.9);

  const measure = () => {
    const node = stageRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    pxPerUnitRef.current = { x: VIEW_W / rect.width, y: VIEW_H / rect.height };
    return rect;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = measure();
    if (!rect) return;
    // Catch an in-flight recoil so a re-grab starts from where it sits.
    stopRecoil();
    // Grab origin = pointer position mapped into viewBox units, clamped to
    // the inset field so a grab always has membrane around it to tent.
    const ox = clamp(
      ((event.clientX - rect.left) / rect.width) * VIEW_W,
      MARGIN,
      VIEW_W - MARGIN,
    );
    const oy = clamp(
      ((event.clientY - rect.top) / rect.height) * VIEW_H,
      MARGIN,
      VIEW_H - MARGIN,
    );
    originRef.current = { x: ox, y: oy };
    weightForGrab(ox, oy);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      engaged: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.engaged) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.engaged = true;
      apexActive.set(1);
    }
    // Direct manipulation: pointer delta → viewBox units, 1:1 under full and
    // reduced motion alike. Clamp magnitude so the sheet can't invert.
    const scale = pxPerUnitRef.current;
    pullX.set(clamp(dx * scale.x, -PULL_CLAMP, PULL_CLAMP));
    pullY.set(clamp(dy * scale.y, -PULL_CLAMP, PULL_CLAMP));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    apexActive.set(0);
    if (!drag.engaged) return;
    stopRecoil();
    if (motionSafe) {
      // The membrane rings home: recoil's ζ0.53 underdamping gives the two
      // visible overshoots through equilibrium for free, one spring per axis.
      controlsRef.current = [
        animate(pullX, 0, springs.recoil),
        animate(pullY, 0, springs.recoil),
      ];
    } else {
      // Reduced motion: no ring — the sheet returns flat instantly.
      pullX.set(0);
      pullY.set(0);
    }
  };

  return (
    <div
      ref={stageRef}
      role="group"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ height }}
      className={cn(
        "bg-surface-1 relative w-full touch-none overflow-hidden rounded-3 select-none",
        "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* Static pinned frame — the taut edge the membrane hangs from. */}
        <rect
          x={MARGIN}
          y={MARGIN}
          width={VIEW_W - MARGIN * 2}
          height={VIEW_H - MARGIN * 2}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path
          ref={hPathRef}
          fill="none"
          stroke="var(--ink-3)"
          strokeOpacity={0.7}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          ref={vPathRef}
          fill="none"
          stroke="var(--ink-3)"
          strokeOpacity={0.7}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {motionSafe && (
          <motion.circle
            ref={apexRef}
            r={2.4}
            fill="var(--signal)"
            style={{ opacity: apexOpacity }}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
