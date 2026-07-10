"use client";

import * as React from "react";

import { useMotionValue, useMotionValueEvent } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type WallSeg = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Relative wall height. @default 1 */
  h?: number;
};

export type BlueprintRiseProps = {
  /** Wall segments — endpoints in 0..1 plan coordinates. */
  walls: WallSeg[];
  /** Room labels, floor-plane positions in 0..1 plan coordinates. */
  labels?: { id: string; x: number; y: number; text: string }[];
  /** Scroll travel, in stage heights. @default 3 */
  journey?: number;
  /** Stage height in px. @default 300 */
  height?: number;
  /** Fires with rise progress 0..1, deduped to steps of 0.05. */
  onRise?: (progress: number) => void;
  className?: string;
  "aria-label"?: string;
};

/** Reduced motion holds the visual model at a fixed mid-rise pose. */
const REST_P = 0.6;
/** Fixed viewBox — the SVG scales to its container via w-full. */
const VIEW_W = 640;
/** Horizontal margin the sheared plan must clear at every progress, px. */
const MARGIN_X = 40;
const PAD_Y = 40;
/** Full wall height at P=1, screen px. */
const WALL_H = 92;
/** Y-axis compression at P=1 (1 = no compression, flat plan). */
const OBLIQUE_Y_SCALE = 0.55;
/** Isometric x-shear strength at P=1 — depth (py) pushes x by this fraction of plan width. */
const OBLIQUE_SHEAR = 0.32;
/** Extra headroom reserved above the plan so risen walls never clip the viewBox top. */
const RISE_HEADROOM = WALL_H + 8;
/**
 * Plan width sized so the full isometric shear at P=1 (span = planeW·(1 +
 * OBLIQUE_SHEAR)) still clears MARGIN_X on both sides of the viewBox.
 */
const PLANE_W = (VIEW_W - MARGIN_X * 2) / (1 + OBLIQUE_SHEAR);
/**
 * The x offset of plan-x=0 at P=0. At P=1 the deepest-back corner (py=0)
 * shears left by half the shear span, so this base is pushed right by that
 * same amount — the sheared plan then sits centered between the margins at
 * every progress instead of drifting off the left or right edge.
 */
const BASE_X = MARGIN_X + (PLANE_W * OBLIQUE_SHEAR) / 2;

/** A screen-space point. */
type Pt = { x: number; y: number };

/**
 * Projects a plan point (px, py in 0..1) to viewBox space at rise progress P.
 * At P=0 this is a true top-down plan: sx = BASE_X + px·PLANE_W, sy =
 * PAD_Y + py·planeH. As P grows the plane tilts to a 3/4 oblique: the y axis
 * compresses (rooms behind read as "further") and an isometric x-shear keyed
 * off py pushes deeper points sideways, so depth reads as displacement
 * rather than perspective — pure JS, no CSS 3D, so it stays Safari-proof.
 */
function project(px: number, py: number, p: number, planeH: number): Pt {
  const yScale = mapRange(p, 0, 1, 1, OBLIQUE_Y_SCALE);
  const shear = mapRange(p, 0, 1, 0, OBLIQUE_SHEAR);
  const sx = BASE_X + px * PLANE_W + (py - 0.5) * shear * PLANE_W;
  const sy = PAD_Y + RISE_HEADROOM * p + py * planeH * yScale;
  return { x: sx, y: sy };
}

/** Lifts a projected floor point straight up by the wall's screen rise. */
function riseAt(pt: Pt, p: number, h: number): Pt {
  return { x: pt.x, y: pt.y - p * h * WALL_H };
}

const fmt = (n: number): string => n.toFixed(2);

type LaidWall = {
  id: string;
  floorA: Pt;
  floorB: Pt;
  topA: Pt;
  topB: Pt;
  h: number;
};

/** Builds every wall's floor + risen-top corners for one rise progress. */
function layWalls(walls: WallSeg[], p: number, planeH: number): LaidWall[] {
  const laid: LaidWall[] = [];
  for (const w of walls) {
    const h = w.h ?? 1;
    const floorA = project(w.x1, w.y1, p, planeH);
    const floorB = project(w.x2, w.y2, p, planeH);
    laid.push({
      id: w.id,
      floorA,
      floorB,
      topA: riseAt(floorA, p, h),
      topB: riseAt(floorB, p, h),
      h,
    });
  }
  return laid;
}

/** Blueprint floor graticule — a grid tilted by the same projection as the walls. */
function planGrid(p: number, planeH: number, cols: number, rows: number) {
  const lines: { key: string; d: string }[] = [];
  for (let c = 0; c <= cols; c += 1) {
    const x = c / cols;
    const a = project(x, 0, p, planeH);
    const b = project(x, 1, p, planeH);
    lines.push({ key: `v${c}`, d: `M${fmt(a.x)} ${fmt(a.y)} L${fmt(b.x)} ${fmt(b.y)}` });
  }
  for (let r = 0; r <= rows; r += 1) {
    const y = r / rows;
    const a = project(0, y, p, planeH);
    const b = project(1, y, p, planeH);
    lines.push({ key: `h${r}`, d: `M${fmt(a.x)} ${fmt(a.y)} L${fmt(b.x)} ${fmt(b.y)}` });
  }
  return lines;
}

/**
 * A flat blueprint whose walls extrude upward on scroll into a line-art
 * model. Mirrors CraneScroll's scroll-stage idiom — an outer scroll region, a
 * track `journey` stages tall, a `sticky` viewport — but here scroll scrubs a
 * SVG projection instead of a CSS 3D transform: at progress 0 the plan renders
 * true top-down (a real floor plan); as progress climbs toward 1 the same
 * points tilt through `project()` into a 3/4 oblique, and each wall segment's
 * top edge lifts off its floor line by `progress · h · WALL_H`, drawn as a
 * quad between the floor and risen-top edges — the line-art "walls standing
 * up" cue. Everything is pure SVG (no canvas, no preserve-3d), so the whole
 * scene is just path strings recomputed from one progress number.
 *
 * Progress lives in a motion value for the scroll wiring, but the geometry
 * itself is mirrored into React state via `useMotionValueEvent` (an event
 * callback, not a per-frame effect) and recomputed in render — simplest path
 * to state-driven SVG strings without springing the scrub. A mono HUD reads
 * `RISE · NN%` and `onRise` streams the same progress deduped to twentieths.
 *
 * Reduced motion holds a fixed mid-rise 3/4 composition (progress pinned at
 * 0.6) — no scrub, but the readout and `onRise` still track scrollTop.
 */
export function BlueprintRise({
  walls,
  labels = [],
  journey = 3,
  height = 300,
  onRise,
  className,
  "aria-label": ariaLabel = "Blueprint rise",
}: BlueprintRiseProps) {
  const motionSafe = useMotionSafe();
  const progressMv = useMotionValue(0);
  const [progress, setProgress] = React.useState(0);
  const riseStepRef = React.useRef(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const writeProgress = (el: HTMLDivElement) => {
    const range = el.scrollHeight - el.clientHeight;
    progressMv.set(range <= 0 ? 0 : el.scrollTop / range);
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    writeProgress(event.currentTarget);
  };

  // Adopt a browser-restored scrollTop into progress once on mount.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) writeProgress(el);
    // Mount-only adoption of whatever scrollTop the browser restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMotionValueEvent(progressMv, "change", (p) => {
    setProgress(p);
    const step = Math.round(p * 20) / 20;
    if (step !== riseStepRef.current) {
      riseStepRef.current = step;
      onRise?.(step);
    }
  });

  // Visual progress: live scrub when motion-safe, pinned mid-rise otherwise.
  // The readout/HUD below still uses the tracked `progress` state either way.
  const visualP = motionSafe ? progress : REST_P;

  const planeH = height - PAD_Y * 2 - RISE_HEADROOM;

  const laidWalls = layWalls(walls, visualP, planeH);
  const grid = planGrid(visualP, planeH, 8, 6);

  const pct = Math.round(progress * 100);

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      style={{ height }}
      className={cn(
        "border-hairline bg-surface-1 focus-visible:ring-cobalt-bright/40 relative overflow-y-auto overscroll-contain rounded-4 border outline-none focus-visible:ring-2",
        className,
      )}
    >
      <p className="sr-only">
        A floor plan that extrudes into a line-art model as you scroll: walls
        rise from flat plan lines into standing quads viewed from a
        three-quarter angle. The model has now risen to {pct} percent.
      </p>

      {/* The track supplies the scroll travel; the stage stays pinned as it passes. */}
      <div aria-hidden style={{ height: height * journey }}>
        <div className="sticky top-0 overflow-hidden" style={{ height }}>
          <svg
            viewBox={`0 0 ${VIEW_W} ${height}`}
            className="block h-full w-full"
            aria-hidden
          >
            {/* Blueprint wash + frame */}
            <rect
              x={0.5}
              y={0.5}
              width={VIEW_W - 1}
              height={height - 1}
              fill="var(--accent-wash)"
              stroke="var(--hairline)"
            />

            {/* Floor graticule — tilts with the same projection as the walls. */}
            <g style={{ opacity: 0.5 }}>
              {grid.map((line) => (
                <path
                  key={line.key}
                  d={line.d}
                  stroke="var(--hairline-strong)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            {/* Room labels — on the floor plane, fading in as the model rises. */}
            {labels.map((label) => {
              const pos = project(label.x, label.y, visualP, planeH);
              return (
                <text
                  key={label.id}
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  className="fill-ink-3 font-mono"
                  style={{ fontSize: 9, letterSpacing: "0.04em", opacity: 0.3 + visualP * 0.7 }}
                >
                  {label.text}
                </text>
              );
            })}

            {/* Walls: floor line always visible; the risen face + top edge draw
                on top, quad opacity following progress so flat plan (p=0)
                shows bare floor lines and the model reads in at full rise. */}
            <g>
              {laidWalls.map((w) => (
                <g key={w.id}>
                  <line
                    x1={w.floorA.x}
                    y1={w.floorA.y}
                    x2={w.floorB.x}
                    y2={w.floorB.y}
                    stroke="var(--hairline-strong)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                  {visualP > 0.001 ? (
                    <>
                      <polygon
                        points={`${fmt(w.floorA.x)},${fmt(w.floorA.y)} ${fmt(w.floorB.x)},${fmt(w.floorB.y)} ${fmt(w.topB.x)},${fmt(w.topB.y)} ${fmt(w.topA.x)},${fmt(w.topA.y)}`}
                        fill="var(--card)"
                        stroke="var(--accent)"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        style={{ opacity: 0.35 + visualP * 0.4 }}
                      />
                      <line
                        x1={w.topA.x}
                        y1={w.topA.y}
                        x2={w.topB.x}
                        y2={w.topB.y}
                        stroke="var(--accent-bright)"
                        strokeWidth={1.25}
                        vectorEffect="non-scaling-stroke"
                      />
                      <line
                        x1={w.floorA.x}
                        y1={w.floorA.y}
                        x2={w.topA.x}
                        y2={w.topA.y}
                        stroke="var(--accent)"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        style={{ opacity: 0.6 }}
                      />
                      <line
                        x1={w.floorB.x}
                        y1={w.floorB.y}
                        x2={w.topB.x}
                        y2={w.topB.y}
                        stroke="var(--accent)"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        style={{ opacity: 0.6 }}
                      />
                    </>
                  ) : null}
                </g>
              ))}
            </g>
          </svg>

          {/* HUD readout chip */}
          <span
            aria-hidden
            className="border-hairline bg-surface-2 text-ink-2 pointer-events-none absolute right-3 bottom-3 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide"
          >
            RISE &middot; {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}
