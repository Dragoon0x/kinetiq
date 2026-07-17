"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Swatch = {
  /** Stable identity — also the value reported by `onValueChange`. */
  id: string;
  /** Announced to assistive tech; colour alone is never the only cue. */
  label: string;
  /** Any CSS colour. */
  color: string;
};

export type SwatchLockProps = {
  swatches: Swatch[];
  /** Controlled selection. */
  value?: string;
  /** Initial selection for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Renders a hidden native radio per swatch so plain forms post the pick. */
  name?: string;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  /** @default 5 */
  columns?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A grid of colour swatches where the pick locks in: a ring draws itself around
 * the chosen chip (`pathLength` 0→1 on `easings.enter`) while the rest ease back
 * to let it stand alone. Locking is the whole affordance — you can see which one
 * is held without reading anything.
 *
 * Semantically a radio group, not a toolbar: full APG keyboard with a roving
 * tabindex — Left/Right walk the roster and wrap, Up/Down step a row, Home and
 * End jump to the ends, Space selects. Colour is never the only carrier: every
 * swatch is labelled, and the label is what assistive tech announces.
 *
 * Reduced motion: the ring is simply there, the dim is a colour change, and the
 * first paint never animates — same picks, same keyboard, same announcements.
 */
export function SwatchLock({
  swatches,
  value,
  defaultValue,
  onValueChange,
  name,
  label,
  columns = 5,
  className,
  "aria-label": ariaLabel,
}: SwatchLockProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const ringId = `${baseId}-ring`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue ?? null,
  );
  const isControlled = value !== undefined;
  const picked = isControlled ? value : uncontrolled;

  const select = (id: string) => {
    if (id === picked) return;
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  /** Moves focus and the selection together, as the radio pattern requires. */
  const focusAt = (index: number, group: Element | null) => {
    if (!group) return;
    const buttons = Array.from(
      group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
    );
    const target = buttons[(index + buttons.length) % buttons.length];
    if (!target) return;
    target.focus();
    const next = target.dataset.swatchId;
    if (next) select(next);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const group = event.currentTarget.closest('[role="radiogroup"]');
    let target: number | null = null;
    if (event.key === "ArrowRight") target = index + 1;
    else if (event.key === "ArrowLeft") target = index - 1;
    else if (event.key === "ArrowDown") target = index + columns;
    else if (event.key === "ArrowUp") target = index - columns;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = swatches.length - 1;
    else if (event.key === " ") {
      event.preventDefault();
      select(swatches[index]?.id ?? "");
      return;
    } else return;
    event.preventDefault();
    // Up/Down off the ends stay put rather than wrapping into a stray column.
    if (target < 0 || target >= swatches.length) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") return;
    }
    focusAt(target, group);
  };

  // Before any pick the first swatch is the tab stop, per the radio pattern.
  const tabStop = picked ?? swatches[0]?.id;

  return (
    <div
      role="radiogroup"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      {label && (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      )}

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {swatches.map((swatch, index) => {
          const isPicked = swatch.id === picked;
          return (
            <React.Fragment key={swatch.id}>
              <button
                type="button"
                role="radio"
                aria-checked={isPicked}
                aria-label={swatch.label}
                data-swatch-id={swatch.id}
                tabIndex={swatch.id === tabStop ? 0 : -1}
                onClick={() => select(swatch.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "relative aspect-square rounded-2 outline-none transition-opacity",
                  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
                  isPicked ? "opacity-100" : "opacity-55 hover:opacity-85",
                )}
              >
                <span
                  aria-hidden
                  className="border-hairline absolute inset-0 rounded-2 border"
                  style={{ background: swatch.color }}
                />
                {isPicked && (
                  <svg
                    aria-hidden
                    viewBox="0 0 44 44"
                    className="absolute -inset-1 size-[calc(100%+0.5rem)]"
                    fill="none"
                  >
                    <motion.rect
                      key={ringId}
                      x={2}
                      y={2}
                      width={40}
                      height={40}
                      rx={8}
                      stroke="var(--primary)"
                      strokeWidth={2}
                      strokeLinecap="round"
                      initial={{ pathLength: motionSafe ? 0 : 1 }}
                      animate={{ pathLength: 1 }}
                      transition={
                        motionSafe
                          ? { duration: durations.base, ease: easings.enter }
                          : { duration: 0 }
                      }
                    />
                  </svg>
                )}
              </button>
              {name !== undefined && (
                <input
                  type="radio"
                  name={name}
                  value={swatch.id}
                  checked={isPicked}
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
