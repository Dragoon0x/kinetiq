"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TriOption = { value: string; label: string };

export type TriToggleProps = {
  /** Controlled value. */
  value?: string;
  /** Initial value for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Exactly three positions. @default off / auto / on */
  options?: [TriOption, TriOption, TriOption];
  /** Renders a hidden native radio per position so plain forms post the value. */
  name?: string;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const DEFAULTS: [TriOption, TriOption, TriOption] = [
  { value: "off", label: "Off" },
  { value: "auto", label: "Auto" },
  { value: "on", label: "On" },
];

/**
 * A switch with a middle. One knob rides a three-stop track — off, a considered
 * middle, on — gliding to the chosen stop on `snap` with a single crisp
 * overshoot, keyed by a shared `layoutId` so the same knob travels rather than
 * three knobs blinking.
 *
 * It is a radio group under the hood, so it reads and drives as one: a roving
 * tabindex where Left and Right step between the stops without wrapping past the
 * ends, Home and End jump to off and on, and Space selects. Reduced motion swaps
 * the knob to its stop instantly, colour only.
 */
export function TriToggle({
  value,
  defaultValue,
  onValueChange,
  options = DEFAULTS,
  name,
  label,
  className,
  "aria-label": ariaLabel,
}: TriToggleProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const knobId = `${baseId}-knob`;

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? options[1].value,
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.value === current),
  );

  const select = (next: string) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(options.length - 1, Math.max(0, index));
    const option = options[clamped];
    if (!option) return;
    document
      .getElementById(`${baseId}-stop-${option.value}`)
      ?.focus();
    select(option.value);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(options.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      select(options[index]?.value ?? "");
    }
  };

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      {label && (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="bg-surface-2 border-hairline inline-flex h-9 items-stretch rounded-full border p-1"
      >
        {options.map((option, index) => {
          const checked = option.value === current;
          return (
            <React.Fragment key={option.value}>
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                id={`${baseId}-stop-${option.value}`}
                tabIndex={index === currentIndex ? 0 : -1}
                onClick={() => select(option.value)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "relative flex min-w-14 flex-1 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors outline-none",
                  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
                  checked
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {checked &&
                  (motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={knobId}
                      transition={springs.snap}
                      className="bg-surface-0 border-hairline absolute inset-0 rounded-full border shadow-sm"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="bg-surface-0 border-hairline absolute inset-0 rounded-full border shadow-sm"
                    />
                  ))}
                <span className="relative">{option.label}</span>
              </button>
              {name !== undefined && (
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={checked}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                  className="sr-only"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
