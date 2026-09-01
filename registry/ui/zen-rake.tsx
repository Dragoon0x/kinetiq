"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Bed geometry, in px. */
const BED_W = 320;
const BED_H = 200;
/** Minimum pointer travel before a new path point is recorded. */
const MIN_STEP = 6;
/** Arrow-key step for the virtual rake head, in px. */
const KEY_STEP = 10;
/** Perpendicular offsets for the comb's three teeth, in px. */
const TOOTH_OFFSETS = [-7, 0, 7] as const;
/** How long a settled stroke sits before it starts healing. */
const HEAL_DELAY_MS = 6000;
/** How long the natural heal fade takes once it starts. */
const HEAL_FADE_S = 3;
/** Strokes kept at once — the oldest is dropped the instant a new one exceeds this. */
const MAX_STROKES = 6;
/** Faint horizontal hairlines that give the sand its only texture. */
const HAIRLINE_ROWS = [44, 92, 140, 168] as const;

const SAND = "color-mix(in oklab, var(--warning, #b45309) 18%, var(--card))";
const GROOVE = "color-mix(in oklab, var(--warning, #b45309) 6%, var(--card))";
const STONE_FILL = "color-mix(in oklab, var(--ink-3) 42%, var(--card))";
const STONE_EDGE = "color-mix(in oklab, var(--ink-3) 60%, transparent)";
const STONE_SHADOW = "color-mix(in oklab, var(--ink) 22%, transparent)";

type Point = { x: number; y: number };

type Stroke = {
  id: number;
  points: Point[];
  /** True once this stroke's fade is underway (natural heal or a "smooth" sweep). */
  healing: boolean;
  /** Stagger delay applied only by the "smooth the sand" sweep. */
  fadeDelay: number;
  /** True for the sweep's quick fade; false for the slow natural heal. */
  quick: boolean;
};

/** Two stones, fixed in the bed — no collision, they just sit above the grooves. */
const STONES = [
  { cx: 68, cy: 142, rx: 24, ry: 14 },
  { cx: 244, cy: 54, rx: 16, ry: 10 },
] as const;

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** Replaces a stroke by id via a pure updater, bailing to the same array if nothing changed. */
function mapStrokeAt(
  current: Stroke[],
  id: number,
  updater: (stroke: Stroke) => Stroke,
): Stroke[] {
  const index = current.findIndex((stroke) => stroke.id === id);
  if (index === -1) return current;
  const target = current[index];
  if (!target) return current;
  const updated = updater(target);
  if (updated === target) return current;
  const next = current.slice();
  next[index] = updated;
  return next;
}

/** Drops a stroke by id, bailing to the same array reference if it is already gone. */
function dropStroke(current: Stroke[], id: number): Stroke[] {
  const next = current.filter((stroke) => stroke.id !== id);
  return next.length === current.length ? current : next;
}

/**
 * Builds the three comb-tooth polylines for a stroke: each point is offset
 * along its local normal (from a central difference of its neighbours), so
 * the teeth curve together through every turn instead of reading as three
 * independent zig-zags.
 */
function combTeeth(points: readonly Point[]): string[] {
  if (points.length < 2) return [];
  const normals = points.map((point, index) => {
    const prev = points[index - 1] ?? point;
    const next = points[index + 1] ?? point;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;
    return { nx: -dy / length, ny: dx / length };
  });
  return TOOTH_OFFSETS.map((offset) =>
    points
      .map((point, index) => {
        const normal = normals[index] ?? { nx: 0, ny: 0 };
        const x = point.x + normal.nx * offset;
        const y = point.y + normal.ny * offset;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" "),
  );
}

export type ZenRakeProps = {
  /** Fires once per completed stroke with a running total. */
  onStroke?: (count: number) => void;
  className?: string;
};

/**
 * A sand garden you rake with a three-tooth comb. Drag across the bed — or
 * give it focus and press the arrow keys — and three offset polylines trail
 * the pointer or the virtual rake head, each one rebuilt from the stroke's
 * own local normals so the teeth curve together through turns. A finished
 * stroke rests at full opacity for about six seconds, then dissolves over
 * three more on an `easings.exit` tween, and only the newest six strokes are
 * kept — the oldest is dropped the instant a seventh begins. Two fixed
 * stones sit above the grooves with a soft shadow each; raking straight
 * across one just draws under it, there is no collision to dodge. The
 * "smooth the sand" button clears every current groove at once in a quick
 * fade staggered by `cascade()`, rather than each stroke's slow individual
 * heal.
 * Reduced motion: grooves still appear instantly as you drag or step through
 * arrow keys — that direct manipulation is unchanged — but nothing tweens
 * in, a settled stroke's six-second wait ends in an instant disappearance
 * rather than a fade, and smoothing the sand clears everything at once with
 * no sweep.
 */
export function ZenRake({
  onStroke,
  className,
}: ZenRakeProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  });

  const [strokes, setStrokes] = React.useState<Stroke[]>([]);
  const [raking, setRaking] = React.useState(false);

  const nextIdRef = React.useRef(0);
  const strokeCountRef = React.useRef(0);
  const activeIdRef = React.useRef<number | null>(null);
  const rakeHeadRef = React.useRef<Point>({ x: BED_W / 2, y: BED_H / 2 });
  const bedRectRef = React.useRef<DOMRect | null>(null);
  const healTimers = React.useRef<Map<number, number>>(new Map());

  React.useEffect(() => {
    const timers = healTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const clearHealTimer = (id: number) => {
    const timer = healTimers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      healTimers.current.delete(id);
    }
  };

  const scheduleHeal = (id: number) => {
    clearHealTimer(id);
    const timer = window.setTimeout(() => {
      healTimers.current.delete(id);
      if (!motionSafeRef.current) {
        setStrokes((current) => dropStroke(current, id));
        return;
      }
      setStrokes((current) =>
        mapStrokeAt(current, id, (stroke) =>
          stroke.healing
            ? stroke
            : { ...stroke, healing: true, fadeDelay: 0, quick: false },
        ),
      );
    }, HEAL_DELAY_MS);
    healTimers.current.set(id, timer);
  };

  const removeStroke = (id: number) => {
    setStrokes((current) => dropStroke(current, id));
  };

  const beginStroke = (x: number, y: number) => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    activeIdRef.current = id;
    const stroke: Stroke = {
      id,
      points: [{ x, y }],
      healing: false,
      fadeDelay: 0,
      quick: false,
    };
    setStrokes((current) => [...current, stroke].slice(-MAX_STROKES));
  };

  const extendActiveStroke = (x: number, y: number) => {
    const activeId = activeIdRef.current;
    if (activeId === null) return;
    setStrokes((current) =>
      mapStrokeAt(current, activeId, (stroke) => {
        const last = stroke.points[stroke.points.length - 1];
        if (last && Math.hypot(x - last.x, y - last.y) < MIN_STEP) {
          return stroke;
        }
        return { ...stroke, points: [...stroke.points, { x, y }] };
      }),
    );
  };

  const finishActiveStroke = () => {
    const activeId = activeIdRef.current;
    if (activeId === null) return;
    activeIdRef.current = null;
    setRaking(false);
    strokeCountRef.current += 1;
    onStroke?.(strokeCountRef.current);
    scheduleHeal(activeId);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    // A leftover keyboard-originated stroke (focus never blurred, no lift
    // pressed) is settled first so a fresh drag always starts its own line.
    if (activeIdRef.current !== null) finishActiveStroke();
    const rect = event.currentTarget.getBoundingClientRect();
    bedRectRef.current = rect;
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = clamp(event.clientX - rect.left, 0, BED_W);
    const y = clamp(event.clientY - rect.top, 0, BED_H);
    rakeHeadRef.current = { x, y };
    setRaking(true);
    beginStroke(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = bedRectRef.current;
    if (!rect) return;
    const x = clamp(event.clientX - rect.left, 0, BED_W);
    const y = clamp(event.clientY - rect.top, 0, BED_H);
    rakeHeadRef.current = { x, y };
    extendActiveStroke(x, y);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishActiveStroke();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    const isArrow =
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "ArrowUp" ||
      key === "ArrowDown";
    if (isArrow) {
      event.preventDefault();
      const head = rakeHeadRef.current;
      const dx =
        key === "ArrowLeft" ? -KEY_STEP : key === "ArrowRight" ? KEY_STEP : 0;
      const dy =
        key === "ArrowUp" ? -KEY_STEP : key === "ArrowDown" ? KEY_STEP : 0;
      const x = clamp(head.x + dx, 0, BED_W);
      const y = clamp(head.y + dy, 0, BED_H);
      rakeHeadRef.current = { x, y };
      if (activeIdRef.current === null) {
        setRaking(true);
        beginStroke(x, y);
      } else {
        extendActiveStroke(x, y);
      }
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      finishActiveStroke();
    }
  };

  const handleSmooth = () => {
    activeIdRef.current = null;
    setRaking(false);
    strokes.forEach((stroke) => clearHealTimer(stroke.id));
    if (!motionSafe) {
      setStrokes([]);
      return;
    }
    setStrokes((current) =>
      current.map((stroke, index) => ({
        ...stroke,
        healing: true,
        fadeDelay: index * cascade(current.length),
        quick: true,
      })),
    );
  };

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <button
        type="button"
        aria-label="Rake the sand"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onBlur={finishActiveStroke}
        className={cn(
          "relative block touch-none overflow-hidden rounded-4 border border-hairline outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        )}
        style={{ width: BED_W, height: BED_H, background: SAND }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${BED_W} ${BED_H}`}
          className="absolute inset-0 size-full"
        >
          {/* A few faint hairlines — the sand's only texture, no noise. */}
          <g aria-hidden>
            {HAIRLINE_ROWS.map((y) => (
              <line
                key={y}
                x1={0}
                y1={y}
                x2={BED_W}
                y2={y}
                stroke="var(--hairline)"
                strokeWidth={1}
              />
            ))}
          </g>

          {/* Grooves — each stroke heals (or sweeps away) on its own clock. */}
          <AnimatePresence initial={false}>
            {strokes.map((stroke) => {
              const teeth = combTeeth(stroke.points);
              if (teeth.length === 0) return null;
              const duration = !motionSafe
                ? 0
                : stroke.healing
                  ? stroke.quick
                    ? durations.base
                    : HEAL_FADE_S
                  : durations.base;
              const transition = {
                duration,
                ease: easings.exit,
                delay: stroke.healing ? stroke.fadeDelay : 0,
              };
              return (
                <motion.g
                  key={stroke.id}
                  initial={false}
                  animate={{ opacity: stroke.healing ? 0 : 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  onAnimationComplete={() => {
                    if (stroke.healing) removeStroke(stroke.id);
                  }}
                >
                  {teeth.map((pointsAttr, toothIndex) => (
                    <polyline
                      key={toothIndex}
                      points={pointsAttr}
                      fill="none"
                      stroke={GROOVE}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </motion.g>
              );
            })}
          </AnimatePresence>

          {/* Stones sit above every groove — raking over one just draws under it. */}
          <g aria-hidden>
            {STONES.map((stone) => (
              <g key={`${stone.cx}-${stone.cy}`}>
                <ellipse
                  cx={stone.cx + 2}
                  cy={stone.cy + 3}
                  rx={stone.rx}
                  ry={stone.ry * 0.85}
                  fill={STONE_SHADOW}
                />
                <ellipse
                  cx={stone.cx}
                  cy={stone.cy}
                  rx={stone.rx}
                  ry={stone.ry}
                  fill={STONE_FILL}
                  stroke={STONE_EDGE}
                  strokeWidth={1}
                />
              </g>
            ))}
          </g>
        </svg>
      </button>

      <div
        className="flex items-center justify-between"
        style={{ width: BED_W }}
      >
        <p aria-hidden className="text-label text-ink-3 normal-case">
          {raking ? "…" : "rake it"}
        </p>
        <button
          type="button"
          onClick={handleSmooth}
          className="text-label text-ink-3 normal-case outline-none hover:text-ink-2 hover:underline focus-visible:underline"
        >
          smooth the sand
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {raking ? "Raking the sand." : ""}
      </span>
    </div>
  );
}
