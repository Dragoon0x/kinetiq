"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RingAsset = {
  /** Stable identity — the segment's colour and its animation follow it. */
  id: string;
  label: string;
  /** Amount held. Non-positive assets are dropped from the ring. */
  value: number;
};

export type HoldingsRingProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The mix, clockwise from twelve o'clock. */
  assets: RingAsset[];
  /** Controlled selection; null reads the total. */
  value?: string | null;
  /** Initial selection for uncontrolled usage. @default null */
  defaultValue?: string | null;
  onValueChange?: (id: string | null) => void;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Visible group heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  /** Caption over the hub figure while nothing is selected. @default "Total" */
  totalLabel?: string;
  /** Segment stroke width in the 120-unit viewBox. @default 13 */
  thickness?: number;
  className?: string;
  "aria-label"?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const defaultFormat = (value: number) => currency.format(value);

const VIEW = 120;
const CENTER = VIEW / 2;
/** Radial travel of a lifted segment, in viewBox units. */
const LIFT = 4;
/** Extra stroke a lifted segment takes on, in viewBox units. */
const SWELL = 2;
/** Fraction of the circumference left blank between two segments. */
const GAP = 0.008;
/** Milliseconds the draw-in cascade owns before updates run undelayed. */
const ENTER_WINDOW = 620;

/**
 * Stroke and dot classes are paired so a legend entry and its arc can never
 * drift apart. Six tones cycle; the phosphor signal is allowed here because an
 * allocation is live data rather than decoration.
 */
const TONES = [
  { stroke: "text-cobalt-bright", dot: "bg-cobalt-bright" },
  { stroke: "text-signal", dot: "bg-signal" },
  { stroke: "text-warn", dot: "bg-warn" },
  { stroke: "text-success", dot: "bg-success" },
  { stroke: "text-cobalt", dot: "bg-cobalt" },
  { stroke: "text-ink-2", dot: "bg-ink-2" },
] as const;

type Segment = RingAsset & {
  share: number;
  start: number;
  tone: (typeof TONES)[number];
};

/**
 * An allocation ring that re-proportions rather than redraws. Each asset is one
 * stroked circle whose `pathLength` is its share and whose `pathOffset` is its
 * start on the rim, so changing the mix animates two numbers on `glide` — the
 * whole ring settles as one body over 450ms instead of five paths racing. On
 * mount the segments draw from nothing on a `cascade()`, and a removed asset
 * shrinks away on the exit ease, because an exit never springs.
 *
 * Pointing at a segment lifts it along its own mid angle on `snap` and thickens
 * it, dimming the rest, while the hub cross-fades to that asset's name, amount
 * and share — a whole reading swapping, which is why it fades rather than
 * counting. The SVG is decorative: the legend beneath it is a real radiogroup
 * with a roving tabindex, so every lift the pointer can do has a key that does
 * it too, and Escape hands the hub back to the total.
 */
export function HoldingsRing({
  ref,
  assets,
  value,
  defaultValue = null,
  onValueChange,
  format = defaultFormat,
  label,
  totalLabel = "Total",
  thickness = 13,
  className,
  "aria-label": ariaLabel,
}: HoldingsRingProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const selected = isControlled ? value : uncontrolled;

  const [hovered, setHovered] = React.useState<string | null>(null);
  // The cascade owns the first frames only; after its window every change is a
  // re-proportioning, which must move at once rather than queue behind a stagger.
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    // setState lives in the timer callback, never in the effect body.
    const timer = window.setTimeout(() => setEntered(true), ENTER_WINDOW);
    return () => window.clearTimeout(timer);
  }, []);

  const { segments, total } = React.useMemo(() => {
    let sum = 0;
    for (const asset of assets) if (asset.value > 0) sum += asset.value;
    let acc = 0;
    const list: Segment[] = [];
    assets.forEach((asset, index) => {
      if (asset.value <= 0) return;
      const share = sum > 0 ? asset.value / sum : 0;
      list.push({
        ...asset,
        share,
        start: acc,
        // Keyed off the caller's order, so appending an asset never recolours
        // the ones already on the rim.
        tone: TONES[index % TONES.length]!,
      });
      acc += share;
    });
    return { segments: list, total: sum };
  }, [assets]);

  const activeId = hovered ?? selected;
  const active = segments.find((segment) => segment.id === activeId) ?? null;
  const selectedIndex = segments.findIndex(
    (segment) => segment.id === selected,
  );
  const focusIndex = selectedIndex < 0 ? 0 : selectedIndex;

  // A lifted segment travels LIFT outward and swells by SWELL, so the rim has
  // to sit far enough in that neither can be clipped by the viewBox — an SVG
  // root hides its overflow, and the clip would land on exactly the segment the
  // viewer is pointing at.
  const radius = Math.max(1, CENTER - thickness / 2 - SWELL / 2 - LIFT - 0.5);
  const stagger = cascade(segments.length);
  const gap = segments.length > 1 ? GAP : 0;

  const select = (next: string | null) => {
    if (next === selected) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(segments.length - 1, Math.max(0, index));
    const target = segments[clamped];
    if (!target) return;
    document.getElementById(`${baseId}-entry-${target.id}`)?.focus();
    select(target.id);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(segments.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      select(segments[index]?.id ?? null);
    } else if (event.key === "Escape" && selected !== null) {
      event.preventDefault();
      select(null);
    }
  };

  const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
  // The live region reports the shape of the mix, not the pick: each radio's own
  // name already carries the asset and its share, and a region that echoed every
  // focus move would say everything twice.
  const spoken = `${segments.length} ${segments.length === 1 ? "asset" : "assets"}, ${totalLabel.toLowerCase()} ${format(total)}.`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-4", className)}>
      {label ? (
        <div id={labelId} className="text-sm font-semibold text-foreground">
          {label}
        </div>
      ) : null}

      <div className="relative mx-auto aspect-square w-full max-w-[208px]">
        <svg
          aria-hidden
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="absolute inset-0 size-full"
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={radius}
            fill="none"
            className="text-hairline"
            stroke="currentColor"
            strokeWidth={thickness}
          />
          {/* One static rotation puts the first segment at twelve o'clock; the
              lift below is a CSS translate inside this rotated frame, so it
              stays radial without motion ever rewriting an attribute. */}
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            {/* Presence is left to run its first pass: the draw-in cascade is
                the ring assembling itself, and suppressing it would cost the
                one moment the component earns its shape. */}
            <AnimatePresence>
              {segments.map((segment, index) => {
                const isActive = segment.id === activeId;
                const dimmed = activeId !== null && !isActive;
                const mid = (segment.start + segment.share / 2) * Math.PI * 2;
                const travel = motionSafe && isActive ? LIFT : 0;
                return (
                  <motion.circle
                    key={segment.id}
                    cx={CENTER}
                    cy={CENTER}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="butt"
                    className={cn("cursor-pointer", segment.tone.stroke)}
                    onPointerEnter={() => setHovered(segment.id)}
                    onPointerLeave={() => setHovered(null)}
                    onClick={() =>
                      select(segment.id === selected ? null : segment.id)
                    }
                    initial={
                      motionSafe
                        ? {
                            pathLength: 0,
                            pathOffset: segment.start + gap / 2,
                            opacity: 1,
                          }
                        : false
                    }
                    animate={{
                      pathLength: Math.max(0, segment.share - gap),
                      pathOffset: segment.start + gap / 2,
                      strokeWidth: isActive ? thickness + SWELL : thickness,
                      opacity: dimmed ? 0.34 : 1,
                      x: Math.cos(mid) * travel,
                      y: Math.sin(mid) * travel,
                    }}
                    exit={{
                      pathLength: 0,
                      opacity: 0,
                      transition: exitFor(durations.base),
                    }}
                    transition={
                      motionSafe
                        ? {
                            pathLength: {
                              ...springs.glide,
                              delay: entered ? 0 : index * stagger,
                            },
                            pathOffset: springs.glide,
                            x: springs.snap,
                            y: springs.snap,
                            strokeWidth: springs.snap,
                            opacity: {
                              duration: durations.fast,
                              ease: easings.enter,
                            },
                          }
                        : { duration: 0 }
                    }
                  />
                );
              })}
            </AnimatePresence>
          </g>
        </svg>

        {/* The hub swaps its whole reading, so it cross-fades inside one grid
            cell rather than counting between two unrelated figures. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-[18%]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active ? active.id : "total"}
              className="col-start-1 row-start-1 flex flex-col items-center gap-0.5 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              <span className="max-w-full truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {active ? active.label : totalLabel}
              </span>
              <span className="font-mono text-base text-foreground tabular-nums">
                {format(active ? active.value : total)}
              </span>
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  active ? "text-ink-2" : "text-ink-3",
                )}
              >
                {active ? percent(active.share) : `${segments.length} assets`}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-col"
      >
        {segments.map((segment, index) => {
          const isSelected = segment.id === selected;
          const isActive = segment.id === activeId;
          return (
            <button
              key={segment.id}
              type="button"
              role="radio"
              id={`${baseId}-entry-${segment.id}`}
              aria-checked={isSelected}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => select(isSelected ? null : segment.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onPointerEnter={() => setHovered(segment.id)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(segment.id)}
              onBlur={() => setHovered(null)}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-2 px-2 text-left transition-colors outline-none",
                "hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                isActive ? "bg-accent" : "bg-transparent",
              )}
            >
              <span className="sr-only">
                {segment.label}, {format(segment.value)},{" "}
                {percent(segment.share)} of the portfolio
              </span>
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  segment.tone.dot,
                  isActive ? "opacity-100" : "opacity-80",
                )}
              />
              <span
                aria-hidden
                className="min-w-0 flex-1 truncate text-[13px] text-foreground"
                title={segment.label}
              >
                {segment.label}
              </span>
              <span
                aria-hidden
                className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
              >
                {format(segment.value)}
              </span>
              <span
                aria-hidden
                className={cn(
                  "w-12 shrink-0 text-right font-mono text-[11px] tabular-nums",
                  isActive ? "text-foreground" : "text-ink-2",
                )}
              >
                {percent(segment.share)}
              </span>
            </button>
          );
        })}
      </div>

      <span role="status" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
