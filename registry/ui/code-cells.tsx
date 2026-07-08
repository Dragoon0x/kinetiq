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

/** Codes are digits only, capped at the cell count. */
const sanitize = (raw: string, count: number) =>
  raw.replace(/\D/g, "").slice(0, count);

export type CodeCellsProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  | "value"
  | "defaultValue"
  | "type"
  | "maxLength"
  | "pattern"
  | "inputMode"
  | "autoComplete"
  | "size"
  | "children"
> & {
  /**
   * Reaches the hidden input, so callers can `.focus()` it again after
   * clearing a rejected code (access-panel relies on this contract).
   */
  ref?: React.Ref<HTMLInputElement>;
  /** Number of cells. @default 6 */
  length?: number;
  /** Controlled code (digits only; longer input is truncated). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (code: string) => void;
  /** Fires once each time the code becomes full; re-arms when it shrinks. */
  onComplete?: (code: string) => void;
  /** Destructive borders plus a sideways nudge of the whole row while true. */
  error?: boolean;
  /** Rendered as a `role="alert"` mono line and wired via `aria-describedby`. */
  errorMessage?: string;
  /** Screen-reader label for the hidden input. Required. */
  label: string;
  /** Cell counts per group, e.g. `[3, 3]`. Ignored unless they sum to `length`. */
  groups?: number[];
};

/**
 * Six digits, dropped into place. One hidden input
 * (`autocomplete="one-time-code"`) drives a row of visual cells: each typed
 * digit drops in from 8px above on `flick` (opacity at `durations.blink`)
 * while a 2px underline tick scales in beneath it in
 * `var(--signal, var(--primary))`; deletions fade out at
 * `exitFor(durations.fast)`. While `error` is true the borders turn
 * destructive and the whole row nudges sideways over `durations.base` on
 * `easings.move`. Clicking any cell focuses the input with the caret pinned
 * to the fill count. Reduced motion: digits appear instantly, the underline
 * fades at `durations.fast`, and the nudge is skipped.
 */
export function CodeCells({
  ref,
  length = 6,
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  onComplete,
  error = false,
  errorMessage,
  label,
  groups,
  disabled,
  className,
  id,
  onChange,
  onFocus,
  onBlur,
  onSelect,
  ...props
}: CodeCellsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const inputId = id ?? `${baseId}-input`;
  const errorId = `${baseId}-error`;

  const count = Math.max(1, Math.floor(length));
  const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
    sanitize(defaultValue, count),
  );
  const isControlled = controlledValue !== undefined;
  const code = isControlled
    ? sanitize(controlledValue, count)
    : uncontrolledValue;

  const [focused, setFocused] = React.useState(false);
  const rowX = useMotionValue(0);

  // Imperative keyframes so a repeated error re-nudges without remounting.
  React.useEffect(() => {
    if (!error || !motionSafe) return;
    const controls = animate(rowX, [0, -2, 2, -1, 0], {
      duration: durations.base,
      ease: easings.move,
    });
    return () => controls.stop();
  }, [error, motionSafe, rowX]);

  /** The caret always sits after the last filled cell. */
  const snapCaret = (event: React.SyntheticEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const end = input.value.length;
    input.setSelectionRange(end, end);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = sanitize(event.target.value, count);
    if (next !== code) {
      if (!isControlled) setUncontrolledValue(next);
      onValueChange?.(next);
      // Completion is a transition, not a state: only a not-full → full
      // change fires, so shrinking (or clearing via props) re-arms it.
      if (next.length === count && code.length < count) onComplete?.(next);
    }
    onChange?.(event);
  };

  let groupSizes: readonly number[] = [count];
  if (
    groups &&
    groups.length > 0 &&
    groups.every((size) => Number.isInteger(size) && size > 0) &&
    groups.reduce((sum, size) => sum + size, 0) === count
  ) {
    groupSizes = groups;
  }

  const caretIndex = Math.min(code.length, count - 1);
  let cellCursor = 0;

  const renderCell = (index: number) => {
    const digit = code[index] ?? "";
    const isCaret = focused && !disabled && index === caretIndex;
    return (
      <div
        key={index}
        className={cn(
          "relative flex h-12 w-10 items-center justify-center rounded-2 border bg-card font-mono text-lg tabular-nums transition-colors",
          error
            ? "border-destructive"
            : isCaret
              ? "border-ring"
              : "border-input",
        )}
      >
        <AnimatePresence initial={false}>
          {digit !== "" && (
            <motion.span
              key={`${index}-${digit}`}
              initial={
                motionSafe
                  ? { y: -distances.step, opacity: 0 }
                  : { opacity: 0 }
              }
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      y: springs.flick,
                      opacity: { duration: durations.blink },
                    }
                  : { duration: 0 }
              }
            >
              {digit}
            </motion.span>
          )}
        </AnimatePresence>
        <motion.span
          className="absolute inset-x-2 bottom-1.5 h-0.5 origin-left rounded-full"
          style={{ background: "var(--signal, var(--primary))" }}
          initial={false}
          animate={
            motionSafe
              ? {
                  scaleX: digit === "" ? 0 : 1,
                  opacity: digit === "" ? 0 : 1,
                }
              : { scaleX: 1, opacity: digit === "" ? 0 : 1 }
          }
          transition={
            motionSafe
              ? {
                  scaleX: springs.flick,
                  opacity: { duration: durations.blink },
                }
              : { duration: durations.fast }
          }
        />
      </div>
    );
  };

  return (
    <div className={cn("w-fit", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className={cn("relative", disabled && "opacity-50")}>
        <motion.div
          aria-hidden
          style={{ x: rowX }}
          className="flex items-center gap-2"
        >
          {groupSizes.map((size, groupIndex) => {
            const cells = Array.from({ length: size }, () => cellCursor++);
            return (
              <React.Fragment key={groupIndex}>
                {groupIndex > 0 && (
                  <span className="bg-input h-px w-2 shrink-0 rounded-full" />
                )}
                <div className="flex items-center gap-1.5">
                  {cells.map(renderCell)}
                </div>
              </React.Fragment>
            );
          })}
        </motion.div>
        <input
          ref={ref}
          id={inputId}
          value={code}
          disabled={disabled}
          onChange={handleChange}
          onFocus={(event) => {
            setFocused(true);
            snapCaret(event);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onSelect={(event) => {
            snapCaret(event);
            onSelect?.(event);
          }}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={count}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && errorMessage ? errorId : undefined}
          className="absolute inset-0 z-10 h-full w-full cursor-text rounded-2 opacity-0 disabled:cursor-default"
          {...props}
        />
      </div>
      <AnimatePresence initial={false}>
        {error && errorMessage && (
          <motion.p
            key="code-cells-error"
            role="alert"
            id={errorId}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: durations.fast }
            }
            className="text-destructive mt-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase"
          >
            <span aria-hidden className="bg-destructive h-px w-3 shrink-0" />
            {errorMessage}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
