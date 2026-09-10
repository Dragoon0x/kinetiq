"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SegmentId = "used" | "reserved" | "free";

export type CapacityBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Cores in use. */
  used: number;
  /** Cores held for reservations but not running. */
  reserved: number;
  /** The pool's size; the rail is this wide. */
  total: number;
  /** Printed after every figure, singular when the figure is one. @default "cores" */
  unit?: string;
  /** Controlled line, as a share of `total` from 0 to 1. */
  threshold?: number;
  /** Initial line for uncontrolled usage. @default 0.8 */
  defaultThreshold?: number;
  /** Fires from the drag or key that moved the line, never from an effect. */
  onThresholdChange?: (value: number) => void;
  /** A settled event: committed capacity crossing the line, not the first commit. */
  onOverChange?: (over: boolean) => void;
  /** Fires as a run is hovered, or as the line enters one while the handle is held. */
  onSegmentChange?: (id: SegmentId | null) => void;
  /** Renders every core figure. @default one decimal, trailing zero trimmed */
  format?: (value: number) => string;
  /** Names the rail for assistive technology. @default "Capacity" */
  label?: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Three decimals before a percentage reaches a style: motion re-serialises
 *  what it painted on the server, so an unrounded string never hydrates. */
const pct = (value: number): string =>
  `${Number(Math.min(100, Math.max(0, value)).toFixed(3))}%`;

const defaultFormat = (value: number): string =>
  String(Number(value.toFixed(1)));

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const RUNS: { id: SegmentId; name: string; fill: string; dot: string }[] = [
  {
    id: "used",
    name: "Used",
    fill: "bg-cobalt-bright",
    dot: "bg-cobalt-bright",
  },
  { id: "reserved", name: "Reserved", fill: "bg-ink-3", dot: "bg-ink-3" },
  { id: "free", name: "Free", fill: "bg-hairline", dot: "bg-hairline-strong" },
];

/**
 * What a pool is actually holding. Three runs share one rail — cores in use,
 * cores reserved but idle, and the free remainder — and each animates its own
 * width on `glide`, so a pool filling up reads as the free run giving ground
 * rather than as three bars blinking.
 *
 * A threshold rides the rail as a real slider. Drag its handle — the pointer is
 * captured only after four pixels of travel, inside a try/catch, so a plain
 * press is never swallowed and a synthetic sweep cannot throw — or arrow it,
 * and the moment committed capacity reaches the line the overhang past it
 * shades warn on a tween and the printed state turns from "within headroom" to
 * "over the line". Hovering a run names it in the header reading, which lives
 * in the component's own box and cross-fades in one cell; moving the line on
 * the keyboard names the run it now sits in, so the pointer and the keyboard
 * learn the same thing. Every figure is repeated in a definition list under the
 * rail, so no reading depends on a tint.
 */
export function CapacityBar({
  ref,
  used,
  reserved,
  total,
  unit = "cores",
  threshold,
  defaultThreshold = 0.8,
  onThresholdChange,
  onOverChange,
  onSegmentChange,
  format = defaultFormat,
  label = "Capacity",
  className,
}: CapacityBarProps) {
  const motionSafe = useMotionSafe();
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef({ id: -1, startX: 0, active: false });

  const [ownThreshold, setOwnThreshold] = React.useState(defaultThreshold);
  const isControlled = threshold !== undefined;
  const line = clamp01(isControlled ? threshold : ownThreshold);

  const [hovered, setHovered] = React.useState<SegmentId | null>(null);
  const [focused, setFocused] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const holding = focused || dragging;

  const size = total > 0 ? total : 1;
  const usedCores = Math.min(size, Math.max(0, used));
  const reservedCores = Math.min(size - usedCores, Math.max(0, reserved));
  const freeCores = Math.max(0, size - usedCores - reservedCores);
  const committed = Number((usedCores + reservedCores).toFixed(3));

  const shares: Record<SegmentId, number> = {
    used: Number(((usedCores / size) * 100).toFixed(3)),
    reserved: Number(((reservedCores / size) * 100).toFixed(3)),
    free: Number(((freeCores / size) * 100).toFixed(3)),
  };
  const cores: Record<SegmentId, number> = {
    used: usedCores,
    reserved: reservedCores,
    free: freeCores,
  };

  const linePercent = Math.round(line * 100);
  const committedPercent = Number(((committed / size) * 100).toFixed(3));
  const over = committed >= line * size;
  const state = over ? "over the line" : "within headroom";

  const unitFor = (count: number): string =>
    count === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit;

  const runAt = (share: number): SegmentId => {
    const at = share * size;
    if (at < usedCores) return "used";
    if (at < usedCores + reservedCores) return "reserved";
    return "free";
  };

  const named = hovered ?? (holding ? runAt(line) : null);

  const segmentRef = React.useRef(onSegmentChange);
  const overRef = React.useRef(onOverChange);
  React.useEffect(() => {
    segmentRef.current = onSegmentChange;
    overRef.current = onOverChange;
  });
  const firstSegment = React.useRef(true);
  React.useEffect(() => {
    if (firstSegment.current) {
      firstSegment.current = false;
      return;
    }
    segmentRef.current?.(named);
  }, [named]);
  const firstOver = React.useRef(true);
  React.useEffect(() => {
    if (firstOver.current) {
      firstOver.current = false;
      return;
    }
    overRef.current?.(over);
  }, [over]);

  const setLine = (next: number) => {
    const value = Number(clamp01(next).toFixed(4));
    if (!isControlled) setOwnThreshold(value);
    onThresholdChange?.(value);
  };

  const step = (delta: number) => setLine((linePercent + delta) / 100);

  const onHandleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const big = event.shiftKey ? 5 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      step(big);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      step(-big);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      step(10);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      step(-10);
    } else if (event.key === "Home") {
      event.preventDefault();
      setLine(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setLine(1);
    }
  };

  const shareFromX = (clientX: number): number => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return line;
    return clamp01((clientX - rect.left) / rect.width);
  };

  const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      active: false,
    };
  };

  const onHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current.id !== event.pointerId) return;
    if (!drag.current.active) {
      // Capture only after real travel, or a plain press is swallowed and the
      // handle stops being clickable.
      if (Math.abs(event.clientX - drag.current.startX) < 4) return;
      drag.current.active = true;
      setDragging(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic sweep has no pointer to capture; the drag still tracks.
      }
    }
    setLine(shareFromX(event.clientX));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current.id !== event.pointerId) return;
    if (drag.current.active) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Nothing was captured; there is nothing to release.
      }
    }
    drag.current = { id: -1, startX: 0, active: false };
    setDragging(false);
  };

  const reading = named
    ? `${RUNS.find((run) => run.id === named)?.name ?? "Free"} · ${format(cores[named])} ${unitFor(cores[named])} · ${shares[named].toFixed(1)}%`
    : `${format(freeCores)} ${unitFor(freeCores)} free of ${format(size)}`;

  const meterText = `${format(committed)} of ${format(size)} ${unitFor(size)} committed, ${Math.round(committedPercent)} percent, ${state}.`;
  const sliderText = `Line at ${linePercent} percent, ${format(Number((line * size).toFixed(2)))} of ${format(size)} ${unitFor(size)}, in the ${runAt(line)} run.`;

  // The slider speaks its own value, so the region carries only the crossing —
  // frozen in the render that commits it, never announced ahead of the host.
  const [spoken, setSpoken] = React.useState({ over, sentence: "" });
  if (spoken.over !== over) {
    setSpoken({
      over,
      sentence: over
        ? `Committed capacity is over the line, ${format(committed)} of ${format(size)} ${unitFor(size)}.`
        : `Committed capacity is back within the line, ${format(committed)} of ${format(size)} ${unitFor(size)}.`,
    });
  }

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const runTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        {/* Both readings share one cell and cross-fade: sweeping the runs or
            arrowing the line must never blank the header. */}
        <div aria-hidden className="grid h-4 min-w-0 flex-1 items-center">
          <AnimatePresence initial={false}>
            <motion.span
              key={reading}
              className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {reading}
            </motion.span>
          </AnimatePresence>
        </div>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
            over ? "text-warn" : "text-ink-3",
          )}
        >
          {state}
        </span>
      </div>

      <div className="px-2">
        <div className="relative h-6">
          <div
            ref={railRef}
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={Number(size.toFixed(3))}
            aria-valuenow={Math.min(committed, Number(size.toFixed(3)))}
            aria-valuetext={meterText}
            className="absolute inset-x-0 top-1/2 flex h-3 -translate-y-1/2 overflow-clip rounded-full bg-hairline [contain:paint]"
          >
            {RUNS.map((run) => (
              <motion.span
                key={run.id}
                aria-hidden
                onPointerEnter={() => setHovered(run.id)}
                onPointerLeave={() =>
                  setHovered((previous) =>
                    previous === run.id ? null : previous,
                  )
                }
                className={cn(
                  "h-full shrink-0 transition-[opacity,background-color]",
                  run.fill,
                  // The free run is the track's own colour, so naming it needs
                  // a fill of its own rather than only dimming its neighbours.
                  named === run.id && run.id === "free" && "bg-hairline-strong",
                  named !== null && named !== run.id && "opacity-45",
                )}
                initial={false}
                animate={{ width: pct(shares[run.id]) }}
                transition={runTransition}
              />
            ))}

            {/* The overhang past the line is what "over" means, so that is what
                shades — the rest of the rail keeps telling the truth. */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 bg-warn"
              initial={false}
              animate={{
                left: pct(linePercent),
                width: pct(Math.max(0, committedPercent - linePercent)),
                opacity: over ? 0.45 : 0,
              }}
              transition={
                motionSafe ? { ...springs.glide, opacity: fade } : fade
              }
            />

            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-ink"
              initial={false}
              animate={{ left: pct(linePercent) }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </div>

          <motion.div
            role="slider"
            aria-label={`${label} line`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={linePercent}
            aria-valuetext={sliderText}
            tabIndex={0}
            onKeyDown={onHandleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={cn(
              "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 border-surface-0 transition-colors",
              over ? "bg-warn" : "bg-ink",
              focusRing,
            )}
            initial={false}
            animate={{ left: pct(linePercent) }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        </div>
      </div>

      <dl className="flex flex-col gap-1">
        {RUNS.map((run) => (
          <div key={run.id} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", run.dot)}
            />
            <dt className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">
              {run.name}
            </dt>
            <dd className="shrink-0 font-mono text-[11px] text-ink tabular-nums">
              {format(cores[run.id])} {unitFor(cores[run.id])}
              <span className="pl-1.5 text-ink-3">
                {shares[run.id].toFixed(1)}%
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
