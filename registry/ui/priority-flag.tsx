"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PriorityLevel = {
  value: string;
  label: string;
};

export type PriorityFlagProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled level. */
  value?: string;
  /** Initial level for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** The rungs, ordered bottom to top. @default low / medium / high / urgent */
  levels?: PriorityLevel[];
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const DEFAULT_LEVELS: PriorityLevel[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

/**
 * One rung in px. It is the row height (h-9) too, so the mast pitch and the
 * hit target are the same number and the flag always lands on a row's centre.
 */
const RUNG = 36;

/**
 * Muted → warn → danger. The middle step is mixed from the same two tokens
 * rather than invented, so the ramp holds in both themes.
 */
const RAMP = [
  "var(--ink-3)",
  "var(--warn)",
  "color-mix(in oklab, var(--warn) 35%, var(--danger))",
  "var(--danger)",
] as const;

/**
 * Colour carries meaning, so it tweens even under reduced motion — as CSS,
 * which interpolates the oklch tokens the theme actually resolves.
 */
const COLOUR_TWEEN = `color ${durations.base}s cubic-bezier(${easings.move.join(",")})`;

function rampColour(index: number, count: number): string {
  const last = RAMP.length - 1;
  const step = count <= 1 ? last : Math.round((index / (count - 1)) * last);
  return RAMP[Math.min(last, Math.max(0, step))] ?? RAMP[0];
}

/**
 * Priority as a signal mast. The flag climbs to the chosen rung on `glide` —
 * the level is a position, and positions move — while its colour tweens up
 * the muted → warn → danger ramp. Landing on the top rung the flag flutters
 * once: a single two-keyframe skew on `recoil`, whose ζ0.53 gives the two
 * visible bounces that read as canvas catching wind.
 *
 * It is a radio group with a roving tabindex: Up and Down (or Left and Right)
 * step the mast and wrap, Home and End jump to the ends, Space and Enter
 * select. Under reduced motion the flag jumps to its rung and only the colour
 * moves.
 */
export function PriorityFlag({
  ref,
  value,
  defaultValue,
  onValueChange,
  levels = DEFAULT_LEVELS,
  label,
  className,
  "aria-label": ariaLabel,
}: PriorityFlagProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const rungRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? levels[0]?.value ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  // Rendered top-down: the top of the mast is the highest level.
  const rows = React.useMemo(() => [...levels].reverse(), [levels]);
  const rowIndex = Math.max(
    0,
    rows.findIndex((level) => level.value === current),
  );
  const levelIndex = rows.length - 1 - rowIndex;
  const topValue = rows[0]?.value;

  // A fresh key restarts the skew, so each landing flutters once instead of
  // holding a pose. Two keyframes only: -10° to 0 on recoil.
  const [flutter, setFlutter] = React.useState(0);

  const select = (next: string) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    // Only a landing flutters — re-picking the level already flown does not.
    if (next === topValue) setFlutter((count) => count + 1);
    onValueChange?.(next);
  };

  const focusRow = (index: number) => {
    const wrapped = (index + rows.length) % rows.length;
    const level = rows[wrapped];
    if (!level) return;
    rungRefs.current[wrapped]?.focus();
    select(level.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusRow(index - 1);
        break;
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusRow(index + 1);
        break;
      case "Home":
        event.preventDefault();
        focusRow(0);
        break;
      case "End":
        event.preventDefault();
        focusRow(rows.length - 1);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        select(rows[index]?.value ?? "");
        break;
      default:
        break;
    }
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      {label ? (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      ) : null}

      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="relative"
      >
        {/* The mast runs centre-of-first-rung to centre-of-last. */}
        <span
          aria-hidden
          className="absolute left-4 w-px bg-hairline-strong"
          style={{ top: RUNG / 2, bottom: RUNG / 2 }}
        />

        <motion.span
          aria-hidden
          className="absolute left-4 block"
          style={{
            top: RUNG / 2 - 6,
            color: rampColour(levelIndex, rows.length),
            transition: COLOUR_TWEEN,
          }}
          animate={{ y: rowIndex * RUNG }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <motion.span
            key={motionSafe ? flutter : "still"}
            className="block"
            style={{ originX: 0, originY: 0.5 }}
            initial={motionSafe && flutter > 0 ? { skewY: -10 } : false}
            animate={{ skewY: 0 }}
            transition={motionSafe ? springs.recoil : { duration: 0 }}
          >
            <svg viewBox="0 0 24 12" width="24" height="12" className="block">
              <path d="M0 0 H24 L18 6 L24 12 H0 Z" fill="currentColor" />
            </svg>
          </motion.span>
        </motion.span>

        {rows.map((level, index) => {
          const checked = level.value === current;
          return (
            <button
              key={level.value}
              ref={(node) => {
                rungRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === rowIndex ? 0 : -1}
              onClick={() => select(level.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "group relative flex h-9 w-full items-center rounded-2 pr-2 pl-12 text-left text-sm outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute top-1/2 left-3 h-px w-2 -translate-y-1/2 transition-colors",
                  checked
                    ? "bg-hairline-strong"
                    : "bg-hairline group-hover:bg-hairline-strong",
                )}
              />
              <span className="truncate">{level.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
