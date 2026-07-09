"use client";

import * as React from "react";

import { animate, useMotionValue, useMotionValueEvent } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Logical SVG space; the plate scales to fill the stage via viewBox. */
const VIEW_W = 300;
const VIEW_H = 200;
/**
 * Seed sites are jittered within their grid cell, but kept off the very edge so
 * every cell owns a sliver of the frame rather than degenerating to a line.
 */
const SITE_INSET = 0.16;
/**
 * Peak outward travel of the shard nearest the tap, in viewBox units. Farther
 * shards scale this down by their intensity falloff so the fracture localizes.
 */
const BURST = 46;
/** Falloff radius (viewBox units): shards past this barely move — the crack localizes. */
const FALLOFF = 150;
/** Peak spin of a flung shard, in degrees; each shard picks a signed fraction. */
const MAX_SPIN = 40;
/** Reduced-motion tap highlight lifetime, in ms. */
const HIGHLIGHT_MS = 150;

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/**
 * djb2 over a small integer tuple, folded to [0, 1). Every seed-site jitter
 * derives from this — deterministic and SSR-safe, so there is no Math.random
 * anywhere near render and server/client geometry always agree.
 */
const djb2 = (a: number, b: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  // Bare djb2 stays nearly affine in sequential inputs — finish with a full
  // two-round avalanche so neighbouring grid indices decorrelate.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

type Point = { x: number; y: number };

type Cell = {
  /** Convex hull of this site's Voronoi region, in viewBox units. */
  polygon: Point[];
  /** Area centroid — the transform origin and the radial direction anchor. */
  centroid: Point;
};

/**
 * Clip a convex polygon against one half-plane (Sutherland–Hodgman). The plane
 * is the perpendicular bisector between a site and one neighbour; we keep the
 * side containing the site. `inside` tests the signed distance to the bisector.
 */
const clipHalfPlane = (
  polygon: Point[],
  inside: (p: Point) => number,
): Point[] => {
  const out: Point[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const curr = polygon[i];
    const prev = polygon[(i + n - 1) % n];
    if (!curr || !prev) continue;
    const dCurr = inside(curr);
    const dPrev = inside(prev);
    const currIn = dCurr >= 0;
    const prevIn = dPrev >= 0;
    if (currIn !== prevIn) {
      // Segment crosses the plane — emit the intersection point.
      const t = dPrev / (dPrev - dCurr);
      out.push({
        x: prev.x + t * (curr.x - prev.x),
        y: prev.y + t * (curr.y - prev.y),
      });
    }
    if (currIn) out.push(curr);
  }
  return out;
};

/** Signed area (shoelace) — magnitude for the centroid, sign for winding. */
const polygonCentroid = (polygon: Point[]): Point => {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (!a || !b) continue;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    // Degenerate sliver — fall back to the vertex average so we never divide
    // by ~0 and fling a shard to infinity.
    let sx = 0;
    let sy = 0;
    for (const p of polygon) {
      sx += p.x;
      sy += p.y;
    }
    const count = polygon.length || 1;
    return { x: sx / count, y: sy / count };
  }
  const factor = 1 / (3 * area);
  return { x: cx * factor, y: cy * factor };
};

const pointsAttr = (polygon: Point[]): string =>
  polygon.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

/**
 * Lay out `count` seed sites on a loose grid, jittered within each cell by a
 * djb2 hash so they read as scattered glass, not a lattice — then build a real
 * Voronoi diagram by clipping the viewBox rectangle against the perpendicular
 * bisector between each site and every other site. Pure, deterministic, and
 * memoized: no measurement, no per-frame work.
 */
const buildCells = (count: number): Cell[] => {
  // A near-square grid that holds `count` cells with the least waste.
  const columns = Math.max(1, Math.round(Math.sqrt((count * VIEW_W) / VIEW_H)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellW = VIEW_W / columns;
  const cellH = VIEW_H / rows;

  const sites: Point[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const jx = SITE_INSET + djb2(col, row, 1) * (1 - SITE_INSET * 2);
    const jy = SITE_INSET + djb2(col, row, 2) * (1 - SITE_INSET * 2);
    sites.push({
      x: clamp((col + jx) * cellW, 0, VIEW_W),
      y: clamp((row + jy) * cellH, 0, VIEW_H),
    });
  }

  const frame: Point[] = [
    { x: 0, y: 0 },
    { x: VIEW_W, y: 0 },
    { x: VIEW_W, y: VIEW_H },
    { x: 0, y: VIEW_H },
  ];

  const cells: Cell[] = [];
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    if (!site) continue;
    let polygon = frame;
    for (let j = 0; j < sites.length && polygon.length >= 3; j++) {
      if (j === i) continue;
      const other = sites[j];
      if (!other) continue;
      // Perpendicular bisector of (site, other): the set equidistant from both.
      // A point is on the site's side when it is nearer `site` — expressed as a
      // signed linear form so intersections are exact.
      const mx = (site.x + other.x) / 2;
      const my = (site.y + other.y) / 2;
      const nx = site.x - other.x;
      const ny = site.y - other.y;
      polygon = clipHalfPlane(
        polygon,
        (p) => (p.x - mx) * nx + (p.y - my) * ny,
      );
    }
    if (polygon.length < 3) continue;
    cells.push({ polygon, centroid: polygonCentroid(polygon) });
  }
  return cells;
};

export type VoronoiShatterProps = {
  /** Seed sites, i.e. shards. @default 28, clamped to [8, 60]. */
  cells?: number;
  className?: string;
  /** Stage height in px. @default 280 */
  height?: number;
  "aria-label"?: string;
};

/**
 * A Voronoi tessellation that fractures outward from wherever you tap. At rest
 * it reads as a pane of cracked glass — hairline cell seams over a faint wash.
 * On tap the shards nearest the point fly out (translate radially, rotate, and
 * fade), farther shards barely stir, then the whole pane rings home on the
 * `recoil` spring (ζ0.53, two visible bounces) and reseals whole.
 *
 * One `progress` motion value (0→1→0) drives the whole burst: `animate` throws
 * it out on `glide`, then chains a return on `recoil`. Each shard's transform
 * is derived from that value and its own direction/intensity and written
 * imperatively via refs from a `useMotionValueEvent` — the pane never
 * re-renders per frame. The geometry is a real Voronoi diagram computed once
 * from props (deterministic djb2 seeds, SSR-safe), so no measurement is needed.
 *
 * Reduced motion: no shatter — the tessellation stays whole and legible; a tap
 * only flashes the struck shard briefly, then fades.
 */
export function VoronoiShatter({
  cells = 28,
  className,
  height = 280,
  "aria-label": ariaLabel = "Voronoi shatter surface",
}: VoronoiShatterProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const stageRef = React.useRef<HTMLDivElement>(null);

  const count = clamp(Math.round(cells), 8, 60);

  // Real Voronoi geometry, computed once per `count`. Deterministic and pure,
  // so it renders identically on server and client with no measurement.
  const geometry = React.useMemo(() => buildCells(count), [count]);

  // Per-shard motion constants, derived from the cell's own hash so the burst
  // is deterministic and varied. Kept parallel to `geometry` by index.
  const shards = React.useMemo(
    () =>
      geometry.map((cell, i) => {
        // A signed spin and a small travel multiplier, both hashed per shard so
        // no two fly identically — but with zero randomness at runtime.
        const spin = (djb2(i, Math.round(cell.centroid.x), 3) * 2 - 1) * MAX_SPIN;
        const jitter = 0.85 + djb2(i, Math.round(cell.centroid.y), 4) * 0.4;
        return { spin, jitter };
      }),
    [geometry],
  );

  // The single source of truth for the burst: 0 whole → 1 fully flung → 0 home.
  const progress = useMotionValue(0);
  // Tap point in viewBox units. Held on a ref (never read in render) so writing
  // it can't trigger a React pass; the burst reads it per frame.
  const tapRef = React.useRef<Point>({ x: VIEW_W / 2, y: VIEW_H / 2 });
  // Live handles to the two chained animations, stopped on re-tap/unmount.
  const controlsRef = React.useRef<ReturnType<typeof animate>[]>([]);
  // Imperative sinks: one <polygon> per shard, indexed parallel to `geometry`.
  const cellRefs = React.useRef<(SVGPolygonElement | null)[]>([]);
  // Reduced-motion highlight timer, cleared on unmount / re-tap.
  const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const stopBurst = React.useCallback(() => {
    for (const controls of controlsRef.current) controls.stop();
    controlsRef.current = [];
  }, []);

  React.useEffect(
    () => () => {
      stopBurst();
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [stopBurst],
  );

  // Paint every shard for the current `progress`. Runs on each burst frame —
  // pure attribute writes against pre-computed geometry, zero React state.
  const paint = React.useCallback(
    (p: number) => {
      const tap = tapRef.current;
      for (let i = 0; i < geometry.length; i++) {
        const node = cellRefs.current[i];
        const cell = geometry[i];
        const shard = shards[i];
        if (!node || !cell || !shard) continue;

        const dx = cell.centroid.x - tap.x;
        const dy = cell.centroid.y - tap.y;
        const dist = Math.hypot(dx, dy);
        // Near the tap → intensity ~1 (flies far); past the falloff → ~0.
        const intensity = Math.exp(-((dist / FALLOFF) * (dist / FALLOFF)));
        // Radial unit direction; a shard sitting exactly on the tap gets a
        // deterministic nudge so it still participates instead of stalling.
        const len = dist || 1;
        const ux = dist > 0.001 ? dx / len : 0;
        const uy = dist > 0.001 ? dy / len : -1;

        const reach = BURST * intensity * shard.jitter;
        const tx = ux * p * reach;
        const ty = uy * p * reach;
        const rot = p * shard.spin * intensity;

        // Compose as translate ∘ rotate-about-centroid. Naming the rotation
        // centre explicitly (cx,cy) makes the spin pivot on the shard's own
        // centre without depending on `transform-box`, which browsers apply
        // inconsistently to the SVG transform *attribute*.
        node.setAttribute(
          "transform",
          `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${rot.toFixed(2)} ${cell.centroid.x.toFixed(2)} ${cell.centroid.y.toFixed(2)})`,
        );
        // Fade toward the peak of the throw, opaque again as it reseals. The
        // struck cluster thins most; the calm rim barely dims.
        node.style.opacity = String(1 - p * 0.85 * intensity);
      }
    },
    [geometry, shards],
  );

  // One subscription drives the whole pane: any progress change repaints.
  useMotionValueEvent(progress, "change", paint);

  const mapToViewBox = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const node = stageRef.current;
    if (!node) return { x: VIEW_W / 2, y: VIEW_H / 2 };
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0)
      return { x: VIEW_W / 2, y: VIEW_H / 2 };
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * VIEW_W, 0, VIEW_W),
      y: clamp(((event.clientY - rect.top) / rect.height) * VIEW_H, 0, VIEW_H),
    };
  };

  // Reduced motion: no shatter. Briefly light the struck shard, then let it
  // fade — the tessellation stays whole and legible throughout. The lit index
  // is the only React state here; the fill cross-fades via a CSS transition.
  const [highlightIndex, setHighlightIndex] = React.useState(-1);

  const flashStruckCell = React.useCallback(
    (tap: Point) => {
      let nearest = -1;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < geometry.length; i++) {
        const cell = geometry[i];
        if (!cell) continue;
        const d = Math.hypot(cell.centroid.x - tap.x, cell.centroid.y - tap.y);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (nearest < 0) return;
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightIndex(nearest);
      highlightTimerRef.current = setTimeout(
        () => setHighlightIndex(-1),
        HIGHLIGHT_MS,
      );
    },
    [geometry],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const tap = mapToViewBox(event);
    tapRef.current = tap;

    if (!motionSafe) {
      flashStruckCell(tap);
      return;
    }

    // Catch any in-flight burst so a re-tap re-throws from wherever it sits.
    stopBurst();
    // Throw the shards out fast, then ring them home: recoil's ζ0.53
    // underdamping gives the two visible overshoots — the glass snaps whole.
    const out = animate(progress, 1, {
      ...springs.glide,
      velocity: 0,
    });
    controlsRef.current = [out];
    void out.then(() => {
      const back = animate(progress, 0, springs.recoil);
      controlsRef.current = [back];
    });
  };

  return (
    <div
      ref={stageRef}
      role="group"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      style={{ height }}
      className={cn(
        "bg-surface-1 relative w-full touch-none overflow-hidden rounded-3 select-none",
        motionSafe && "cursor-pointer",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        {geometry.map((cell, i) => {
          const lit = motionSafe ? false : i === highlightIndex;
          return (
            <polygon
              key={i}
              ref={(node) => {
                cellRefs.current[i] = node;
              }}
              points={pointsAttr(cell.polygon)}
              fill={lit ? "var(--signal)" : "var(--accent-wash)"}
              fillOpacity={lit ? 0.22 : 0.5}
              stroke={lit ? "var(--signal)" : "var(--hairline-strong)"}
              strokeWidth={1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{
                // Only the reduced-motion highlight animates here — the shatter
                // itself is written imperatively to the transform attribute
                // (rotation pivots on the shard centroid, set explicitly there).
                transition: motionSafe
                  ? undefined
                  : "fill 120ms linear, stroke 120ms linear",
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
