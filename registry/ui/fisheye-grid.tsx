"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type FisheyeCell = {
  id: string;
  label: string;
  node?: React.ReactNode;
};

export type FisheyeGridProps = {
  /** The tile roster, in reading and tab order. */
  cells: FisheyeCell[];
  /** Grid columns. @default ceil(sqrt(cells.length)) */
  columns?: number;
  /** Fires the id nearest the lens, `null` once it leaves the grid. Deduped. */
  onFocusCell?: (id: string | null) => void;
  /** Reach of the bulge, in px. @default 110 */
  lensRadius?: number;
  /** Peak scale-up at the lens center, as extra scale (1 + strength). @default 0.6 */
  strength?: number;
  /** Stage height, px. @default 300 */
  height?: number;
  className?: string;
  /** Accessible name for the grid. */
  "aria-label"?: string;
};

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/** Outward spread at the lens center, as a fraction of `lensRadius`. */
const SPREAD_FRACTION = 0.55;

/**
 * Reads `(pointer:fine)` as an external store — no setState-in-effect,
 * SSR-safe. Coarse pointers (touch) and the server both resolve to `false`.
 */
function subscribeFine(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia("(pointer:fine)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getFineSnapshot(): boolean {
  return window.matchMedia("(pointer:fine)").matches;
}

function getFineServerSnapshot(): boolean {
  return false;
}

/** True only on devices whose primary pointer is fine (a mouse-like cursor). */
function usePointerFine(): boolean {
  return React.useSyncExternalStore(
    subscribeFine,
    getFineSnapshot,
    getFineServerSnapshot,
  );
}

type CellLayout = { cx: number; cy: number };

/**
 * A draggable magnifier that bulges a content grid under a radial fisheye
 * lens. The lens center lives in exactly two motion values, `lensX`/`lensY`;
 * every tile derives its own scale and radial displacement from that shared
 * pair via `useTransform` in a per-cell child (`FisheyeTile`) — nothing is
 * written per pointer-move except those two values, so the whole field moves
 * on cheap, uncomposited-render motion-value math.
 *
 * FISHEYE — a tile's distance `d` from the lens center drives a cosine
 * falloff inside `lensRadius`: it scales up toward `1 + strength` at the
 * center and tapers to identity at the rim, while a radial displacement
 * pushes it further outward from the center (classic 2D fisheye spreading),
 * scaled by the same falloff so magnified neighbours part instead of
 * overlapping. zIndex rises with scale so the peak tile sits on top.
 *
 * FOLLOW — on a fine pointer the lens glides to the cursor on
 * `springs.glide`. On a coarse/touch pointer the lens is a draggable puck:
 * it only moves while a pointer is captured and dragging. Arrow keys always
 * move the lens by one cell, wherever focus sits.
 *
 * FOCUS — a `useMotionValueEvent` on the *display* lens values recomputes
 * the nearest tile on every settle and commits it (deduped) to
 * `onFocusCell`, mirroring the house controlled/uncontrolled announce
 * pattern — never a per-frame setState.
 *
 * Reduced motion drops the glide and the radial spreading entirely: arrows
 * (or a click) move a discrete focused tile that scales up in place
 * instantly. `onFocusCell` still fires on every change, same semantics.
 */
export function FisheyeGrid({
  cells,
  columns,
  onFocusCell,
  lensRadius = 110,
  strength = 0.6,
  height = 300,
  className,
  "aria-label": ariaLabel = "Fisheye grid",
}: FisheyeGridProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();

  const count = cells.length;
  const cols = Math.max(1, columns ?? Math.ceil(Math.sqrt(Math.max(count, 1))));
  const rows = Math.max(1, Math.ceil(count / cols));

  const stageRef = React.useRef<HTMLDivElement>(null);
  const dragIdRef = React.useRef<number | null>(null);
  const [stageSize, setStageSize] = React.useState({ width: 0, height: 0 });

  // Measure the stage once mounted, re-center on resize. The write is
  // deduped so the observer can never loop.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize((prev) =>
        Math.abs(prev.width - rect.width) < 1 &&
        Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, []);

  // Every tile's static center, in stage px — pure arithmetic off the grid
  // geometry, so no per-tile ref/measure is needed.
  const layout: CellLayout[] = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layout.push({
      cx: ((col + 0.5) / cols) * stageSize.width,
      cy: ((row + 0.5) / rows) * stageSize.height,
    });
  }

  // Raw target (jumps in RM) and its glide-sprung display value (motion path).
  const targetX = useMotionValue(stageSize.width / 2);
  const targetY = useMotionValue(stageSize.height / 2);
  const springX = useSpring(targetX, GLIDE);
  const springY = useSpring(targetY, GLIDE);
  const lensX = motionSafe ? springX : targetX;
  const lensY = motionSafe ? springY : targetY;

  // Re-seat the lens at center whenever the stage first gets a size.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current || stageSize.width === 0) return;
    seededRef.current = true;
    targetX.jump(stageSize.width / 2);
    targetY.jump(stageSize.height / 2);
  }, [stageSize, targetX, targetY]);

  const onFocusCellRef = React.useRef(onFocusCell);
  React.useEffect(() => {
    onFocusCellRef.current = onFocusCell;
  });

  const focusedRef = React.useRef<string | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);

  // Nearest-cell recompute, driven off the *display* lens values (never a
  // per-frame handler write) — deduped commit, same shape as the house
  // controlled/uncontrolled announce idiom.
  const commitNearest = (x: number, y: number) => {
    if (count === 0) {
      if (focusedRef.current !== null) {
        focusedRef.current = null;
        setFocusedId(null);
        onFocusCellRef.current?.(null);
      }
      return;
    }
    let nearestIndex = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < layout.length; i += 1) {
      const cell = layout[i];
      if (!cell) continue;
      const d = Math.hypot(cell.cx - x, cell.cy - y);
      if (d < best) {
        best = d;
        nearestIndex = i;
      }
    }
    const nearest = cells[nearestIndex];
    const nextId = nearest ? nearest.id : null;
    if (nextId !== focusedRef.current) {
      focusedRef.current = nextId;
      setFocusedId(nextId);
      onFocusCellRef.current?.(nextId);
    }
  };

  useMotionValueEvent(lensX, "change", (x) => commitNearest(x, lensY.get()));
  useMotionValueEvent(lensY, "change", (y) => commitNearest(lensX.get(), y));

  const follow = motionSafe && pointerFine;

  const steer = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    targetX.set(clamp(clientX - rect.left, 0, rect.width));
    targetY.set(clamp(clientY - rect.top, 0, rect.height));
  };

  const jumpTo = (x: number, y: number) => {
    if (motionSafe) {
      targetX.set(x);
      targetY.set(y);
    } else {
      targetX.jump(x);
      targetY.jump(y);
    }
  };

  // Keyboard: move the lens by one cell pitch in the arrow's direction.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0 || stageSize.width === 0) return;
    const pitchX = stageSize.width / cols;
    const pitchY = stageSize.height / rows;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case "ArrowLeft":
        dx = -pitchX;
        break;
      case "ArrowRight":
        dx = pitchX;
        break;
      case "ArrowUp":
        dy = -pitchY;
        break;
      case "ArrowDown":
        dy = pitchY;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nx = clamp(targetX.get() + dx, 0, stageSize.width);
    const ny = clamp(targetY.get() + dy, 0, stageSize.height);
    jumpTo(nx, ny);
  };

  // Touch/coarse: the lens is a draggable puck — it only moves while a
  // pointer is captured and dragging, never on hover.
  const handlePuckPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    steer(event.clientX, event.clientY);
  };
  const handlePuckPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragIdRef.current !== event.pointerId) return;
    steer(event.clientX, event.clientY);
  };
  const endPuckDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragIdRef.current !== event.pointerId) return;
    dragIdRef.current = null;
  };

  const focusedCell = cells.find((cell) => cell.id === focusedId) ?? null;
  const focusedLabel = focusedCell?.label ?? null;

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={stageRef}
        role="group"
        tabIndex={0}
        aria-label={`${ariaLabel}, use arrow keys to move the lens`}
        onPointerMove={follow ? (e) => steer(e.clientX, e.clientY) : undefined}
        onKeyDown={handleKeyDown}
        style={{ height }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 relative touch-none overflow-hidden rounded-3 border outline-none focus-visible:ring-2"
      >
        <div
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          className="relative grid h-full w-full gap-2 p-2"
        >
          {cells.map((cell, i) => {
            const cellLayout = layout[i] ?? { cx: 0, cy: 0 };
            return (
              <FisheyeTile
                key={cell.id}
                cell={cell}
                cx={cellLayout.cx}
                cy={cellLayout.cy}
                lensX={lensX}
                lensY={lensY}
                lensRadius={lensRadius}
                strength={strength}
                motionSafe={motionSafe}
                focused={cell.id === focusedId}
                onActivate={() => {
                  const target = layout[i];
                  if (target) jumpTo(target.cx, target.cy);
                }}
              />
            );
          })}
        </div>

        {/* Coarse/touch only: an invisible drag surface for the puck, layered
            above the tiles so a drag never lands as a tile click. Reduced
            motion on a fine pointer must still reach tile clicks directly,
            so this never renders for that case. */}
        {!pointerFine ? (
          <div
            aria-hidden
            onPointerDown={handlePuckPointerDown}
            onPointerMove={handlePuckPointerMove}
            onPointerUp={endPuckDrag}
            onPointerCancel={endPuckDrag}
            className="absolute inset-0 z-20 cursor-grab touch-none active:cursor-grabbing"
          />
        ) : null}

        <span className="text-label text-cobalt-bright bg-surface-0/70 pointer-events-none absolute top-2 right-2 z-30 rounded-1 px-1.5 py-0.5 backdrop-blur-sm">
          LENS · {focusedLabel ?? "NONE"}
        </span>

        <span role="status" aria-live="polite" className="sr-only">
          {focusedLabel ? `Lens over ${focusedLabel}` : "Lens off the grid"}
        </span>
      </div>
    </div>
  );
}

type FisheyeTileProps = {
  cell: FisheyeCell;
  cx: number;
  cy: number;
  lensX: MotionValue<number>;
  lensY: MotionValue<number>;
  lensRadius: number;
  strength: number;
  motionSafe: boolean;
  focused: boolean;
  onActivate: () => void;
};

/**
 * One grid tile. Its scale and radial (dx, dy) displacement are derived from
 * the shared lens motion values via `useTransform` — this is the only place
 * pointer-move energy turns into a per-tile write, and it is never a
 * setState. Reduced motion skips the derivation: the focused tile scales up
 * in place, everything else rests at identity.
 */
function FisheyeTile({
  cell,
  cx,
  cy,
  lensX,
  lensY,
  lensRadius,
  strength,
  motionSafe,
  focused,
  onActivate,
}: FisheyeTileProps) {
  const falloff = useTransform([lensX, lensY], (values) => {
    const [lx, ly] = values as [number, number];
    const d = Math.hypot(cx - lx, cy - ly);
    if (d >= lensRadius) return 0;
    // Cosine falloff: 1 at the center, 0 at the rim, smooth in between.
    return (Math.cos((d / lensRadius) * Math.PI) + 1) / 2;
  });

  const scale = useTransform(falloff, (f) => 1 + f * strength);

  // Radial push, outward from the lens center, scaled by the same falloff —
  // magnified tiles part instead of overlapping, and settle to zero at rest.
  const dx = useTransform([lensX, falloff], (values) => {
    const [lx, f] = values as [number, number];
    const away = cx - lx;
    if (away === 0 || f === 0) return 0;
    const dir = away / Math.abs(away);
    return dir * f * lensRadius * SPREAD_FRACTION;
  });
  const dy = useTransform([lensY, falloff], (values) => {
    const [ly, f] = values as [number, number];
    const away = cy - ly;
    if (away === 0 || f === 0) return 0;
    const dir = away / Math.abs(away);
    return dir * f * lensRadius * SPREAD_FRACTION;
  });

  // falloff already runs 0..1 — remap straight to a z-index band so the
  // peak tile always lands on top, independent of `strength`.
  const zIndex = useTransform(falloff, (f) => Math.round(mapRange(f, 0, 1, 1, 50)));

  const restScale = focused ? 1 + strength * 0.5 : 1;

  return (
    <motion.button
      type="button"
      onFocus={onActivate}
      onClick={onActivate}
      style={
        motionSafe
          ? { x: dx, y: dy, scale, zIndex }
          : { scale: restScale, zIndex: focused ? 50 : 1 }
      }
      className={cn(
        "border-hairline bg-surface-2 focus-visible:ring-cobalt-bright/50 relative flex min-h-10 items-center justify-center rounded-2 border font-mono text-xs outline-none focus-visible:ring-2",
        !motionSafe && "transition-transform duration-150",
        focused ? "border-cobalt-bright text-cobalt-bright" : "text-ink-2",
      )}
    >
      {cell.node ?? cell.label}
    </motion.button>
  );
}
