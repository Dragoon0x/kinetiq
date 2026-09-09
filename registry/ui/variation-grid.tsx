"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Variation = {
  id: string;
  /** Drives the procedural picture. */
  seed: number;
  /** Short caption; names the tile. */
  label: string;
};

export type VariationGridProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Exactly four takes. */
  variations: [Variation, Variation, Variation, Variation];
  /** The four pictures are ready and lift their veils together. */
  revealed?: boolean;
  /** The render is in flight: the shimmer sweeps and `aria-busy` is set. */
  generating?: boolean;
  /** Controlled pick by variation id; null while nothing is chosen. */
  value?: string | null;
  /** Initial pick for uncontrolled usage. @default null */
  defaultValue?: string | null;
  onValueChange?: (id: string | null) => void;
  /** Names the grid and its radiogroup for assistive technology. */
  label: string;
  /** Copy on the unfold control. @default "Pick another" */
  pickAnotherLabel?: string;
  className?: string;
};

/**
 * A small integer hash stream: integer ops only, so Node and the browser draw
 * the same picture for the same seed.
 */
function stream(seed: number) {
  let state = (Math.floor(seed) * 0x9e3779b1) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Number(value.toFixed(3));

const TONES = ["fill-cobalt", "fill-success", "fill-warn", "fill-ink"] as const;

type Shape =
  | { kind: "disc"; cx: number; cy: number; r: number; tone: string }
  | { kind: "slab"; x: number; y: number; w: number; h: number; tone: string };

/** A cover composition from a seed: one field, a disc, three slabs. */
function compose(seed: number): { field: string; shapes: Shape[] } {
  const next = stream(seed);
  const tone = () => TONES[Math.floor(next() * TONES.length)] ?? "fill-ink";
  const field = tone();
  // Four draws per shape, always in the same order, so a seed is a picture.
  const draw = (lo: number, hi: number) => round(lo + next() * (hi - lo));
  const shapes: Shape[] = [
    {
      kind: "disc",
      cx: draw(20, 100),
      cy: draw(20, 70),
      r: draw(12, 28),
      tone: tone(),
    },
  ];
  for (let index = 0; index < 3; index += 1) {
    shapes.push({
      kind: "slab",
      x: draw(0, 100),
      y: draw(30, 80),
      w: draw(16, 56),
      h: draw(4, 14),
      tone: tone(),
    });
  }
  return { field, shapes };
}

/** Decorative: the radio it sits in is named by its caption. */
function Picture({ seed }: { seed: number }) {
  const art = React.useMemo(() => compose(seed), [seed]);
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 90"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full bg-surface-0"
    >
      <rect width="120" height="90" className={art.field} fillOpacity={0.18} />
      {art.shapes.map((shape, index) =>
        shape.kind === "disc" ? (
          <circle
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            className={shape.tone}
            fillOpacity={0.85}
          />
        ) : (
          <rect
            key={index}
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            rx="2"
            className={shape.tone}
            fillOpacity={0.7}
          />
        ),
      )}
    </svg>
  );
}

/**
 * Four generated takes that reveal together and let you keep one. While
 * `generating` the tiles sit behind `surface-2` veils crossed by one shimmer
 * band that sweeps the whole grid in phase — a linear repeating tween,
 * because a shimmer is texture — and when `revealed` turns true the four
 * veils lift on one `durations.slow` tween, because the takes are one
 * delivery. Picking lifts the chosen tile two pixels on `snap` with the
 * raised shadow and cobalt hairline while the other three fold away — a
 * `scaleY` to zero from their top edge on the exit ease, never a spring —
 * and leave the flow, so the chosen tile glides on `glide` to span the grid
 * as its hero; a tick draws on `flick` in its caption. Pick another unfolds
 * the three back with a cascaded rise and clears the pick, and the grid's
 * height follows a ResizeObserver on `glide` throughout.
 *
 * The grid is a radiogroup of native buttons with a roving tabindex: Left
 * and Right step, Up and Down jump a row, Home and End go to the corners,
 * Space or Enter picks, Escape on the chosen tile unfolds. Under reduced
 * motion the veils lift on a fast fade, nothing lifts or folds — the others
 * fade out and the chosen tile swaps to its span — and the tick appears
 * without a draw.
 */
export function VariationGrid({
  ref,
  variations,
  revealed = false,
  generating = false,
  value,
  defaultValue = null,
  onValueChange,
  label,
  pickAnotherLabel = "Pick another",
  className,
}: VariationGridProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const picked = isControlled ? value : uncontrolled;
  const chosen = variations.find((take) => take.id === picked) ?? null;

  const [focusIndex, setFocusIndex] = React.useState(0);
  const [unfolded, setUnfolded] = React.useState(false);
  const tileRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const focusAfter = React.useRef<string | null>(null);

  const set = (next: string | null) => {
    if (next === picked) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const pick = (take: Variation) => {
    setUnfolded(false);
    set(take.id);
  };

  const unfold = () => {
    if (!chosen) return;
    focusAfter.current = chosen.id;
    setUnfolded(true);
    set(null);
  };

  // Focus returns to the seat of the tile that was chosen once the others
  // have been re-mounted around it.
  React.useEffect(() => {
    if (picked !== null || !focusAfter.current) return;
    tileRefs.current.get(focusAfter.current)?.focus();
    focusAfter.current = null;
  }, [picked]);

  const focusTile = (index: number) => {
    const clamped = Math.min(variations.length - 1, Math.max(0, index));
    const take = variations[clamped];
    if (!take) return;
    setFocusIndex(clamped);
    tileRefs.current.get(take.id)?.focus();
  };

  const onTileKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "Escape" && chosen) {
      event.preventDefault();
      unfold();
      return;
    }
    if (chosen) return;
    if (event.key === "ArrowRight") focusTile(index + 1);
    else if (event.key === "ArrowLeft") focusTile(index - 1);
    else if (event.key === "ArrowDown") focusTile(index + 2);
    else if (event.key === "ArrowUp") focusTile(index - 2);
    else if (event.key === "Home") focusTile(0);
    else if (event.key === "End") focusTile(variations.length - 1);
    else return;
    event.preventDefault();
  };

  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    // Fires once on observe, so the first height lands without reading layout
    // during render; popped tiles leave the flow, so a pick shrinks the box.
    const observer = new ResizeObserver(() =>
      setMeasured(node.getBoundingClientRect().height),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const gap = cascade(variations.length);
  const fade = { duration: durations.base, ease: easings.enter } as const;
  const shown = chosen ? [chosen] : variations;
  const shimmering = motionSafe && generating && !revealed;

  const announcement = chosen
    ? `Picked ${chosen.label}`
    : unfolded
      ? "All four takes shown"
      : revealed
        ? "Four takes ready"
        : generating
          ? "Rendering four takes"
          : "";

  return (
    <div
      ref={ref}
      className={cn(
        "w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span
          id={labelId}
          className="min-w-0 truncate text-sm font-medium text-foreground"
          title={label}
        >
          {label}
        </span>
      </div>

      <motion.div
        initial={false}
        animate={{ height: measured ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div
          ref={gridRef}
          role="radiogroup"
          aria-labelledby={labelId}
          aria-busy={generating || undefined}
          className="relative grid grid-cols-2 gap-2 p-3"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {shown.map((take) => {
              const index = variations.indexOf(take);
              const isPicked = chosen?.id === take.id;
              return (
                <motion.button
                  key={take.id}
                  ref={(node) => {
                    if (node) tileRefs.current.set(take.id, node);
                    else tileRefs.current.delete(take.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={isPicked}
                  disabled={!revealed}
                  tabIndex={isPicked || index === focusIndex ? 0 : -1}
                  onFocus={() => setFocusIndex(index)}
                  onClick={() => pick(take)}
                  onKeyDown={(event) => onTileKeyDown(event, index)}
                  layout={motionSafe}
                  style={{ originY: 0 }}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0, y: 0 }
                  }
                  animate={{ opacity: 1, y: motionSafe && isPicked ? -2 : 0 }}
                  exit={
                    motionSafe
                      ? {
                          scaleY: 0,
                          opacity: 0,
                          transition: exitFor(durations.slow),
                        }
                      : { opacity: 0, transition: { duration: durations.fast } }
                  }
                  transition={{
                    layout: springs.glide,
                    y: motionSafe ? springs.snap : { duration: 0 },
                    opacity: motionSafe
                      ? { ...fade, delay: index * gap }
                      : { duration: durations.fast },
                  }}
                  className={cn(
                    "flex flex-col overflow-hidden rounded-2 border bg-surface-1 text-left transition-[border-color,box-shadow] outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    "disabled:cursor-default",
                    isPicked
                      ? "col-span-2 border-cobalt-bright shadow-raised"
                      : "border-hairline hover:enabled:border-hairline-strong",
                  )}
                >
                  <span
                    className={cn(
                      "relative block w-full overflow-hidden",
                      isPicked ? "aspect-[8/3]" : "aspect-[4/3]",
                    )}
                  >
                    <Picture seed={take.seed} />
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 bg-surface-2"
                      initial={false}
                      animate={{ opacity: revealed ? 0 : 1 }}
                      transition={{
                        duration: motionSafe ? durations.slow : durations.fast,
                        ease: easings.enter,
                      }}
                    />
                  </span>
                  <span className="flex h-7 items-center gap-1.5 px-2 text-[11px] text-ink-2">
                    <AnimatePresence initial={false}>
                      {isPicked ? (
                        <motion.svg
                          key="tick"
                          viewBox="0 0 16 16"
                          aria-hidden
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-3.5 shrink-0 text-success"
                          exit={{ opacity: 0, transition: { duration: 0 } }}
                        >
                          <motion.path
                            d="M3.5 8.5 6.5 11.5 12.5 4.5"
                            initial={
                              motionSafe
                                ? { pathLength: 0, opacity: 1 }
                                : { pathLength: 1, opacity: 0 }
                            }
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={
                              motionSafe
                                ? springs.flick
                                : { duration: durations.fast }
                            }
                          />
                        </motion.svg>
                      ) : null}
                    </AnimatePresence>
                    <span className="truncate">{take.label}</span>
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>

          {/* One band crosses the whole grid so the four veils shimmer in
              phase: the takes are one delivery, not four. */}
          {shimmering ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-3 left-3 w-1/2 bg-linear-to-r from-surface-2/0 via-ink-3/25 to-surface-2/0"
              initial={{ x: "-100%" }}
              animate={{ x: "300%" }}
              transition={{
                duration: 1.4,
                ease: easings.linear,
                repeat: Infinity,
              }}
            />
          ) : null}
        </div>
      </motion.div>

      <div className="flex h-10 items-center justify-between gap-3 border-t border-hairline px-3">
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {chosen
            ? `${chosen.label} chosen`
            : revealed
              ? "Pick one"
              : generating
                ? "Rendering"
                : "Not rendered"}
        </span>
        {chosen ? (
          <motion.button
            type="button"
            onClick={unfold}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={fade}
            className={cn(
              "flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {pickAnotherLabel}
          </motion.button>
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
