"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpendLimitProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled limit. */
  value?: number;
  /** Initial limit for uncontrolled usage. */
  defaultValue?: number;
  /** Fires from the pointer move or key that changed the ceiling. */
  onValueChange?: (value: number) => void;
  /** Fires once the ceiling has settled — on release, or on key-up. */
  onCommit?: (value: number) => void;
  /** Spend so far, drawn as the column fill. */
  spend?: number;
  /** Top of the scale. @default 2000 */
  max?: number;
  /** Drag snap and arrow step; Page keys move five of them. @default 50 */
  step?: number;
  /** Formats every amount in the instrument. */
  format?: (value: number) => string;
  /** Names the slider. @default "Monthly limit" */
  label?: string;
  /** Suffix beside the headline figure. @default "USD" */
  unit?: string;
  /** Locks the rail. */
  disabled?: boolean;
  className?: string;
};

const TRACK_H = 176;
/** Pointer travel before capture: capturing on pointerdown eats plain clicks. */
const CAPTURE_PX = 4;
const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const AMOUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const formatAmount = (value: number): string => AMOUNT.format(value);

const HATCH =
  "repeating-linear-gradient(45deg, transparent 0 5px, color-mix(in oklab, var(--danger) 55%, transparent) 5px 10px)";

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/**
 * A figure whose digits roll to their new place on `snap`. The column is ten
 * faces tall, so a `y` of one tenth of its own height moves exactly one digit;
 * `tabular-nums` and a `1ch` cell keep a rolling digit from nudging the label
 * it sits in. Hidden from assistive technology — the slider's `aria-valuetext`
 * already says the figure in words.
 */
function Rolling({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {value.split("").map((char, index) => {
        const digit = FACES.indexOf(char as (typeof FACES)[number]);
        // Keyed from the right, so the units column keeps its identity when the
        // figure gains or loses a digit and only the new column mounts.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {FACES.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.2em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Drag the ceiling, watch the room. The column fills from the floor to the
 * spend on `glide` — a quantity settling, no overshoot — and a rail across it
 * marks the limit. Grab the rail and it tracks the pointer 1:1 (capture waits
 * for 4px of travel, or a plain click on the knob is swallowed); release and it
 * settles onto the nearest `step` on `snap`, one crisp overshoot, the physics
 * of an indicator taking a position. The remaining-room chip rides the rail,
 * flipping below it near the top of the scale, and its figure rolls on the same
 * spring.
 *
 * Drag the ceiling under the spend and the column goes over-limit: the slice
 * above the rail takes a drawn hatch and turns danger, and the chip swaps from
 * "left" to "over by". That change is a colour tween and a hatch fading in —
 * nothing bounces, because being over your limit is not a celebration.
 *
 * It is a vertical `role="slider"`: Up and Right add a step, Down and Left take
 * one, Page keys move five, Home and End run to the ends, and `aria-valuetext`
 * says the money and the room in words. Under reduced motion the rail moves
 * without a spring and the fill sets without one, but the colours, the hatch
 * and the figures still change — where the ceiling stands is information.
 */
export function SpendLimit({
  ref,
  value,
  defaultValue = 1200,
  onValueChange,
  onCommit,
  spend = 860,
  max = 2000,
  step = 50,
  format = formatAmount,
  label = "Monthly limit",
  unit = "USD",
  disabled = false,
  className,
}: SpendLimitProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const spendId = `${uid}-spend`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const limit = clamp(isControlled ? value : uncontrolled, 0, max);

  const [dragging, setDragging] = React.useState(false);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const grab = React.useRef<{
    y: number;
    from: number;
    height: number;
  } | null>(null);
  const captured = React.useRef(false);
  const dirty = React.useRef(false);

  const span = max > 0 ? max : 1;
  const railY = TRACK_H * (1 - clamp(limit, 0, max) / span);
  const fillHeight = TRACK_H * clamp(spend / span, 0, 1);
  const fillTop = TRACK_H - fillHeight;
  const overHeight = Math.max(0, railY - fillTop);
  const isOver = spend > limit;
  const room = Math.max(0, limit - spend);
  const over = Math.max(0, spend - limit);

  const set = (next: number) => {
    const bounded = clamp(Math.round(next), 0, max);
    if (bounded === limit) return;
    if (!isControlled) setUncontrolled(bounded);
    onValueChange?.(bounded);
  };

  const settle = (next: number) => {
    const snapped = clamp(Math.round(next / step) * step, 0, max);
    if (snapped !== limit) {
      if (!isControlled) setUncontrolled(snapped);
      onValueChange?.(snapped);
    }
    onCommit?.(snapped);
  };

  const nudge = (by: number) => {
    dirty.current = true;
    set(clamp(Math.round(limit / step) * step + by, 0, max));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const { key } = event;
    if (key === "ArrowUp" || key === "ArrowRight") nudge(step);
    else if (key === "ArrowDown" || key === "ArrowLeft") nudge(-step);
    else if (key === "PageUp") nudge(step * 5);
    else if (key === "PageDown") nudge(-step * 5);
    else if (key === "Home") {
      dirty.current = true;
      set(0);
    } else if (key === "End") {
      dirty.current = true;
      set(max);
    } else return;
    event.preventDefault();
  };

  const railTransition =
    dragging || !motionSafe ? { duration: 0 } : springs.snap;
  const fillTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };
  const valueText = isOver
    ? `${format(limit)} ${unit} limit, over by ${format(over)} ${unit}`
    : `${format(limit)} ${unit} limit, ${format(room)} ${unit} left this month`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        {/* Centred, not baseline-aligned: a rolling column is an overflow-hidden
            inline-block, whose baseline is its bottom edge. */}
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm">
          <Rolling value={format(limit)} motionSafe={motionSafe} />
          <span className="text-[10px] tracking-[0.1em] text-ink-3 uppercase">
            {unit}
          </span>
        </span>
      </div>

      <div
        ref={trackRef}
        className={cn(
          "relative w-full rounded-2 border border-hairline bg-surface-2",
          disabled && "opacity-50",
        )}
        style={{ height: TRACK_H }}
      >
        {/* The clip lives on an inner layer so the rail's focus ring is not
            cut off at the rim of the track it rides in. */}
        <div aria-hidden className="absolute inset-0 overflow-hidden rounded-2">
          {[0.25, 0.5, 0.75].map((tick) => (
            <span
              key={tick}
              className="absolute inset-x-0 h-px bg-hairline"
              style={{ top: TRACK_H * tick }}
            />
          ))}

          <motion.div
            className="absolute inset-x-0 bottom-0 bg-cobalt-bright/35"
            initial={false}
            animate={{ height: fillHeight }}
            transition={fillTransition}
          >
            <span className="absolute inset-x-0 top-0 h-px bg-cobalt-bright" />
            {/* Anchored to the fill's own top edge, so the over-limit slice
                keeps its grip on the spend while the fill glides. */}
            <motion.span
              className="absolute inset-x-0 top-0 overflow-hidden bg-danger/25"
              style={{ backgroundImage: HATCH }}
              initial={false}
              animate={{ height: overHeight, opacity: isOver ? 1 : 0 }}
              transition={{
                height: railTransition,
                opacity: { duration: durations.fast, ease: easings.enter },
              }}
            />
          </motion.div>
        </div>

        <motion.div
          className="absolute inset-x-0 top-0 h-0"
          initial={false}
          animate={{ y: railY }}
          transition={railTransition}
        >
          <div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-labelledby={labelId}
            aria-describedby={spendId}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={limit}
            aria-valuetext={valueText}
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            onKeyUp={() => {
              if (!dirty.current) return;
              dirty.current = false;
              settle(limit);
            }}
            onPointerDown={(event) => {
              if (disabled || event.button !== 0) return;
              const rect = trackRef.current?.getBoundingClientRect();
              if (!rect || rect.height <= 0) return;
              grab.current = {
                y: event.clientY,
                from: limit,
                height: rect.height,
              };
              captured.current = false;
              event.currentTarget.focus();
            }}
            onPointerMove={(event) => {
              const from = grab.current;
              if (!from || disabled) return;
              const dy = event.clientY - from.y;
              if (!captured.current) {
                if (Math.abs(dy) < CAPTURE_PX) return;
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // A synthetic sweep has no live pointer to capture; the drag
                  // still tracks, it is just not held once the pointer leaves.
                }
                captured.current = true;
                setDragging(true);
              }
              set(from.from - (dy / from.height) * span);
            }}
            onPointerUp={(event) => {
              if (!grab.current) return;
              try {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              } catch {
                // Already released by the browser; nothing left to give back.
              }
              const dragged = captured.current;
              grab.current = null;
              captured.current = false;
              setDragging(false);
              if (dragged) settle(limit);
            }}
            onPointerCancel={() => {
              if (!grab.current) return;
              grab.current = null;
              captured.current = false;
              setDragging(false);
              settle(limit);
            }}
            style={{ touchAction: "none" }}
            className={cn(
              "absolute inset-x-0 -top-3 flex h-6 items-center outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              disabled ? "cursor-not-allowed" : "cursor-ns-resize",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-0.5 flex-1 transition-colors",
                isOver ? "bg-danger" : "bg-cobalt-bright",
              )}
            />
            <span
              aria-hidden
              className={cn(
                "mr-2 flex h-3.5 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                isOver
                  ? "border-danger bg-danger text-destructive-foreground"
                  : "border-cobalt-bright bg-surface-0 text-cobalt-bright",
              )}
            >
              <span className="h-px w-3 bg-current" />
            </span>
          </div>

          {/* The room chip rides the rail and flips under it near the top of
              the scale, so it never leaves the track it belongs to. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-2 flex items-center gap-1 rounded-1 border border-hairline bg-surface-0/90 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap",
              isOver ? "text-danger" : "text-ink",
            )}
            style={{ top: railY < 30 ? 8 : -22 }}
          >
            <Rolling
              value={format(isOver ? over : room)}
              motionSafe={motionSafe}
            />
            <span className="text-ink-3">{isOver ? "over" : "left"}</span>
          </span>
        </motion.div>
      </div>

      <div className="flex h-8 w-full items-center justify-between gap-3 rounded-2 border border-hairline px-2.5 text-xs">
        <span id={spendId} className="min-w-0 truncate text-ink-2">
          Spent {format(spend)}
        </span>
        <span
          className={cn(
            "shrink-0 font-medium",
            isOver ? "text-danger" : "text-ink-3",
          )}
        >
          {isOver ? `Over by ${format(over)}` : `${format(room)} left`}
        </span>
      </div>
    </div>
  );
}
