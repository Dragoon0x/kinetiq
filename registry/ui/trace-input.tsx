"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TraceInputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "prefix"
> & {
  label: string;
  /** Hide the label visually but keep it for assistive tech. */
  labelHidden?: boolean;
  description?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
};

/**
 * A plain text field, with the focus drawn rather than switched on. The label
 * sits above the box where a form label belongs, so everything inside the box —
 * the affixes and the text itself — shares one centred line.
 *
 * Focus draws its own boundary: a 1.5px ring-coloured stroke traces the field's
 * perimeter (pathLength 0→1, `durations.base` + `easings.enter`) and fades out
 * on blur at `exitFor(durations.base)`, while the label warms to the ring
 * colour. An invalid value nudges the field 2px sideways and pins a dimension
 * line beside the error text.
 *
 * Reduced motion: the stroke appears instantly and fades, and the nudge is
 * skipped — the field still reports focus and error exactly the same way.
 */
export function TraceInput({
  label,
  labelHidden,
  description,
  error,
  prefix,
  suffix,
  className,
  id,
  disabled,
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
      <label
        htmlFor={inputId}
        className={cn(
          "mb-1.5 block text-sm font-medium transition-colors",
          labelHidden && "sr-only",
          error
            ? "text-destructive"
            : focused
              ? "text-primary"
              : "text-foreground",
        )}
        style={{ transitionDuration: `${durations.fast}s` }}
      >
        {label}
      </label>

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
          // One centred row: affixes and text share the box's middle, because
          // nothing is reserved above them any more.
          "relative flex h-11 cursor-text items-center gap-2 rounded-2 border bg-transparent px-3 transition-colors",
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

        <input
          ref={inputRef}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className="text-foreground placeholder:text-muted-foreground h-full w-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          {...props}
        />

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
