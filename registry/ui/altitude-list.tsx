"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { liftShadow, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type AltitudeItem = {
  id: string;
  label: string;
  value: number;
  unit?: string;
};

export type AltitudeSort = "value-desc" | "value-asc" | "label";

export type AltitudeListProps = {
  /** Three to eight readings. */
  items: AltitudeItem[];
  /** @default "value-desc" */
  defaultSort?: AltitudeSort;
  onSortChange?: (sort: AltitudeSort) => void;
  className?: string;
  "aria-label"?: string;
};

const SORTS: { id: AltitudeSort; label: string }[] = [
  { id: "value-desc", label: "HIGH FIRST" },
  { id: "value-asc", label: "LOW FIRST" },
  { id: "label", label: "BY NAME" },
];

/** Peak plate lift in px at the highest value. */
const MAX_LIFT = 14;

/**
 * Readings that float at altitudes — each plate lifts off its ground line in
 * proportion to its value, casting a contact shadow that lengthens and
 * softens with height. Re-sorting flies the plates to their new order on the
 * glide spring while their altitudes hold, so magnitude survives the shuffle.
 * Under reduced motion plates sit flat with value bars and re-orders are
 * instant.
 */
export function AltitudeList({
  items,
  defaultSort = "value-desc",
  onSortChange,
  className,
  "aria-label": ariaLabel = "Altitude readings",
}: AltitudeListProps) {
  const motionSafe = useMotionSafe();
  const [sort, setSort] = React.useState<AltitudeSort>(defaultSort);

  const list = items.slice(0, 8);
  const min = Math.min(...list.map((i) => i.value));
  const max = Math.max(...list.map((i) => i.value));

  const sorted = [...list].sort((a, b) => {
    if (sort === "label") return a.label.localeCompare(b.label);
    return sort === "value-asc" ? a.value - b.value : b.value - a.value;
  });

  const pick = (next: AltitudeSort) => {
    setSort(next);
    onSortChange?.(next);
  };

  return (
    <div className={cn("w-full", className)}>
      <div role="group" aria-label="Sort order" className="mb-3 flex gap-1.5">
        {SORTS.map((option) => {
          const on = option.id === sort;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(option.id)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition-colors",
                on
                  ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                  : "border-hairline text-ink-3 hover:text-ink hover:border-hairline-strong",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <ul aria-label={ariaLabel} className="space-y-3">
        {sorted.map((item) => {
          const altitude = mapRange(item.value, min, max, 0.08, 1);
          const shadow = liftShadow(altitude);
          return (
            <motion.li
              key={item.id}
              layout={motionSafe ? true : false}
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
              className="relative"
            >
              {/* ground line + contact shadow */}
              <span
                aria-hidden
                className="bg-hairline absolute right-2 -bottom-1.5 left-2 h-px"
              />
              <div
                style={
                  motionSafe
                    ? {
                        transform: `translateY(${-altitude * MAX_LIFT}px)`,
                        boxShadow: `0 ${shadow.y}px ${shadow.blur}px ${shadow.spread}px rgb(6 10 22 / ${shadow.opacity})`,
                      }
                    : undefined
                }
                className="border-hairline bg-surface-2 flex items-center justify-between gap-3 rounded-2 border px-3 py-2"
              >
                <span className="text-ink min-w-0 truncate font-mono text-xs">
                  {item.label}
                </span>
                <span className="flex items-center gap-2">
                  {!motionSafe ? (
                    <span
                      aria-hidden
                      className="bg-cobalt-bright/60 h-1 rounded-full"
                      style={{ width: 12 + altitude * 48 }}
                    />
                  ) : null}
                  <span className="text-cobalt-bright font-mono text-xs tabular-nums">
                    {item.value}
                    {item.unit ? (
                      <span className="text-ink-3 ml-0.5">{item.unit}</span>
                    ) : null}
                  </span>
                </span>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
