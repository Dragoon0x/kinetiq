"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "type" | "checked" | "defaultChecked"
> & {
  checked?: boolean;
  defaultChecked?: boolean;
  /** Visual-only mixed state; applied to the native input via `el.indeterminate`. */
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  /**
   * Seconds to wait before the tick draws — CheckboxGroup uses this to
   * cascade a select-all down the list. Ignored under reduced motion.
   */
  drawDelay?: number;
};

/**
 * The tick is drawn, not shown: checking draws the checkmark path
 * (pathLength 0→1) on `flick`; unchecking fades it at
 * `exitFor(durations.fast)`. Indeterminate slides a dash in from the left on
 * `flick`, and the box background crossfades at `durations.fast`. Reduced
 * motion: instant tick, no cascade.
 */
export function Checkbox({
  checked: controlledChecked,
  defaultChecked = false,
  indeterminate = false,
  onCheckedChange,
  label,
  description,
  disabled,
  drawDelay = 0,
  className,
  onChange,
  ...props
}: CheckboxProps) {
  const motionSafe = useMotionSafe();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uncontrolledChecked, setUncontrolledChecked] =
    React.useState(defaultChecked);
  const checked = controlledChecked ?? uncontrolledChecked;

  React.useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const delay = motionSafe ? drawDelay : 0;
  const showCheck = checked && !indeterminate;

  return (
    <label
      className={cn(
        "flex items-start gap-2.5",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          if (controlledChecked === undefined) {
            setUncontrolledChecked(event.target.checked);
          }
          onCheckedChange?.(event.target.checked);
          onChange?.(event);
        }}
        className="peer sr-only"
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          "border-input mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-1 border transition-colors",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          (checked || indeterminate) && "border-primary bg-primary",
        )}
      >
        <svg viewBox="0 0 12 12" className="size-3">
          <motion.path
            d="M2.5 6.5 L5 9 L9.5 3.5"
            fill="none"
            stroke="var(--primary-foreground)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={
              showCheck
                ? { pathLength: 1, opacity: 1 }
                : { pathLength: 0, opacity: 0 }
            }
            transition={
              !motionSafe
                ? { duration: 0 }
                : showCheck
                  ? {
                      pathLength: { ...springs.flick, delay },
                      opacity: { duration: durations.blink, delay },
                    }
                  : {
                      opacity: { ...exitFor(durations.fast), delay },
                      // Rewind the draw only after the fade completes.
                      pathLength: {
                        duration: 0,
                        delay: delay + durations.fast * 0.6,
                      },
                    }
            }
          />
          <motion.path
            d="M3 6 L9 6"
            fill="none"
            stroke="var(--primary-foreground)"
            strokeWidth="1.8"
            strokeLinecap="round"
            initial={false}
            animate={
              indeterminate
                ? { pathLength: 1, opacity: 1, x: 0 }
                : { pathLength: 0, opacity: 0, x: -4 }
            }
            transition={
              !motionSafe
                ? { duration: 0 }
                : indeterminate
                  ? {
                      pathLength: springs.flick,
                      x: springs.flick,
                      opacity: { duration: durations.blink },
                    }
                  : {
                      opacity: exitFor(durations.fast),
                      pathLength: { duration: 0, delay: durations.fast * 0.6 },
                      x: { duration: 0, delay: durations.fast * 0.6 },
                    }
            }
          />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="text-muted-foreground mt-0.5 block text-xs">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

export type CheckboxGroupItem = {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
};

export type CheckboxGroupProps = {
  items: CheckboxGroupItem[];
  /** Controlled set of checked item ids. */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Adds a parent checkbox that checks, unchecks, or mixes with the list. */
  selectAll?: boolean;
  selectAllLabel?: string;
  legend: string;
  /** Keeps the legend for screen readers but hides it visually. */
  srOnlyLegend?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Fieldset of drawn ticks. An optional select-all parent reads all/none/some
 * as checked/unchecked/indeterminate; toggling it cascades the tick draws
 * down the list, staggered by `cascade(n)`. Reduced motion: no stagger,
 * instant ticks.
 */
export function CheckboxGroup({
  items,
  value: controlledValue,
  defaultValue = [],
  onValueChange,
  selectAll = false,
  selectAllLabel = "Select all",
  legend,
  srOnlyLegend = false,
  disabled,
  className,
}: CheckboxGroupProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolledValue, setUncontrolledValue] =
    React.useState<string[]>(defaultValue);
  const value = controlledValue ?? uncontrolledValue;
  const valueSet = React.useMemo(() => new Set(value), [value]);
  // Only a select-all change cascades; individual toggles draw immediately.
  const [fromSelectAll, setFromSelectAll] = React.useState(false);

  const allChecked = items.length > 0 && items.every((i) => valueSet.has(i.id));
  const someChecked = items.some((i) => valueSet.has(i.id));

  const commit = (next: string[]) => {
    if (controlledValue === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
  };

  const interval = cascade(items.length);

  return (
    <fieldset disabled={disabled} className={cn("min-w-0", className)}>
      <legend
        className={cn("text-sm font-semibold", srOnlyLegend ? "sr-only" : "mb-3")}
      >
        {legend}
      </legend>

      {selectAll && (
        <>
          <Checkbox
            label={selectAllLabel}
            checked={allChecked}
            indeterminate={someChecked && !allChecked}
            disabled={disabled}
            onCheckedChange={(next) => {
              setFromSelectAll(true);
              commit(next ? items.map((i) => i.id) : []);
            }}
          />
          <div aria-hidden className="border-border my-2.5 border-t" />
        </>
      )}

      <div className={cn("space-y-2.5", selectAll && "pl-7")}>
        {items.map((item, index) => (
          <Checkbox
            key={item.id}
            label={item.label}
            description={item.description}
            checked={valueSet.has(item.id)}
            disabled={disabled}
            drawDelay={fromSelectAll && motionSafe ? index * interval : 0}
            onCheckedChange={(next) => {
              setFromSelectAll(false);
              commit(
                next
                  ? [...value, item.id]
                  : value.filter((id) => id !== item.id),
              );
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}
