"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Resting label sits where a placeholder would; floated it becomes an overline. */
const LABEL_VARIANTS = {
  rest: { y: 26, scale: 1 },
  float: { y: 7, scale: 0.85 },
} as const;

export type TraceInputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "prefix"
> & {
  label: string;
  description?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
};

/**
 * Focus draws its own boundary: a 1.5px ring-colored stroke traces the
 * field's perimeter (pathLength 0→1, `durations.base` + `easings.enter`) and
 * fades out on blur at `exitFor(durations.base)`. The label glides between
 * placeholder and overline positions on `glide`; an invalid value nudges the
 * field 2px sideways and pins a dimension line beside the error text.
 * Reduced motion: the stroke fades in at `durations.fast`, the label snaps,
 * and the nudge is skipped.
 */
export function TraceInput({
  label,
  description,
  error,
  prefix,
  suffix,
  className,
  id,
  value,
  defaultValue,
  disabled,
  onChange,
  onFocus,
  onBlur,
  ...props
}: TraceInputProps) {
  const motionSafe = useMotionSafe();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const baseId = React.useId();
  const inputId = id ?? `${baseId}-input`;
  const descriptionId = `${baseId}-description`;
  const errorId = `${baseId}-error`;

  const [focused, setFocused] = React.useState(false);
  const isControlled = value !== undefined;
  const [innerHasValue, setInnerHasValue] = React.useState(
    () => defaultValue !== undefined && String(defaultValue).length > 0,
  );
  const hasValue = isControlled ? String(value).length > 0 : innerHasValue;
  const floated = focused || hasValue;

  // Imperative keyframes so a changing error message re-nudges without
  // remounting (a remount would drop focus mid-typing).
  const fieldX = useMotionValue(0);
  React.useEffect(() => {
    if (!error || !motionSafe) return;
    const controls = animate(fieldX, [0, -2, 2, -1, 0], {
      duration: durations.base,
      ease: easings.move,
    });
    return () => controls.stop();
  }, [error, motionSafe, fieldX]);

  const describedBy =
    [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("w-full", className)}>
      <motion.div
        style={{ x: fieldX }}
        onPointerDown={(event) => {
          // Clicking anywhere on the field focuses the input, without
          // stealing caret placement from clicks on the input itself.
          if (event.target !== inputRef.current && !disabled) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
        className={cn(
          "relative flex h-14 cursor-text items-center gap-2 rounded-2 border bg-transparent px-3 transition-colors",
          error ? "border-destructive" : "border-input",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {/* Focus traces the boundary. The rect is the focus indicator for the
            field (the inner input's outline is intentionally replaced by it),
            and it appears instantly under reduced motion. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <motion.rect
            x={0.75}
            y={0.75}
            rx={5.25}
            fill="none"
            stroke="var(--ring)"
            strokeWidth={1.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={{ width: "calc(100% - 1.5px)", height: "calc(100% - 1.5px)" }}
            initial={false}
            animate={
              focused
                ? { pathLength: 1, opacity: 1 }
                : { pathLength: 0, opacity: 0 }
            }
            transition={
              focused
                ? motionSafe
                  ? {
                      pathLength: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                      opacity: { duration: durations.blink },
                    }
                  : {
                      pathLength: { duration: 0 },
                      opacity: { duration: durations.fast },
                    }
                : motionSafe
                  ? {
                      opacity: exitFor(durations.base),
                      // Reset the trace only after the fade, so blur never
                      // plays the draw in reverse.
                      pathLength: { duration: 0, delay: durations.base * 0.6 },
                    }
                  : {
                      opacity: exitFor(durations.fast),
                      pathLength: { duration: 0, delay: durations.fast * 0.6 },
                    }
            }
          />
        </svg>

        {prefix && (
          <span
            aria-hidden
            className="text-muted-foreground flex shrink-0 items-center"
          >
            {prefix}
          </span>
        )}

        <div className="relative h-full min-w-0 flex-1">
          <motion.label
            htmlFor={inputId}
            variants={LABEL_VARIANTS}
            initial={false}
            animate={floated ? "float" : "rest"}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            className={cn(
              "pointer-events-none absolute top-0 left-0 origin-left text-sm leading-5 whitespace-nowrap transition-colors",
              focused ? "text-primary" : "text-muted-foreground",
            )}
          >
            {label}
          </motion.label>
          <input
            ref={inputRef}
            id={inputId}
            disabled={disabled}
            value={value}
            defaultValue={defaultValue}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              if (!isControlled) {
                setInnerHasValue(event.target.value.length > 0);
              }
              onChange?.(event);
            }}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            className="text-foreground h-full w-full bg-transparent pt-4 text-sm outline-none"
            {...props}
          />
        </div>

        {suffix && (
          <span
            aria-hidden
            className="text-muted-foreground flex shrink-0 items-center"
          >
            {suffix}
          </span>
        )}
      </motion.div>

      {description && (
        <p id={descriptionId} className="text-muted-foreground mt-1.5 text-xs">
          {description}
        </p>
      )}

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            key="error"
            id={errorId}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              transition: exitFor(motionSafe ? durations.base : durations.fast),
            }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: durations.fast }
            }
            className="text-destructive mt-1.5 flex items-center gap-2 text-xs"
          >
            {/* The dimension line: a 12px hairline pinning the note to the field. */}
            <span aria-hidden className="bg-destructive h-px w-3 shrink-0" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
