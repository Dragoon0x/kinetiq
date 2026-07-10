"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FocusPlane = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export type FocusRackProps = {
  /** Two to four planes, nearest first. */
  planes: FocusPlane[];
  /** Controlled focused plane. */
  focusId?: string;
  defaultFocusId?: string;
  onFocusChange?: (id: string) => void;
  /** Stage height in px. @default 240 */
  height?: number;
  className?: string;
};

/** Depth styling per rack slot (distance from the focused plane). */
const rackSlot = (offset: number) => ({
  scale: 1 - Math.abs(offset) * 0.05,
  y: offset * 18,
  opacity: offset === 0 ? 1 : 0.55 - Math.abs(offset) * 0.1,
  filter: offset === 0 ? "blur(0px)" : `blur(${Math.min(Math.abs(offset) * 1.5, 3)}px)`,
});

/**
 * Layered planes at staggered depths with one in focus — the rest sit soft
 * behind it. Clicking a soft plane (or its rail chip) racks focus: the chosen
 * plane sharpens and dollies forward on the glide spring while the previous
 * one settles back into the soft stack. The blur stays ≤3px and rides flat
 * elements only. Under reduced motion focus swaps instantly with no dolly.
 */
export function FocusRack({
  planes,
  focusId: focusProp,
  defaultFocusId,
  onFocusChange,
  height = 240,
  className,
}: FocusRackProps) {
  const motionSafe = useMotionSafe();
  const list = planes.slice(0, 4);
  const [uncontrolled, setUncontrolled] = React.useState(
    () => defaultFocusId ?? list[0]?.id ?? "",
  );
  const focused = focusProp ?? uncontrolled;

  const rack = (id: string) => {
    if (id === focused) return;
    if (focusProp === undefined) setUncontrolled(id);
    onFocusChange?.(id);
  };

  const focusIndex = Math.max(
    list.findIndex((p) => p.id === focused),
    0,
  );

  return (
    <div className={cn("w-full", className)}>
      {/* rack rail — one chip per plane */}
      <div role="group" aria-label="Focus rack" className="mb-3 flex gap-1.5">
        {list.map((plane, i) => {
          const on = i === focusIndex;
          return (
            <button
              key={plane.id}
              type="button"
              aria-pressed={on}
              onClick={() => rack(plane.id)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition-colors",
                on
                  ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                  : "border-hairline text-ink-3 hover:text-ink hover:border-hairline-strong",
              )}
            >
              {String(i + 1).padStart(2, "0")} {plane.label}
            </button>
          );
        })}
      </div>

      {/* the rack */}
      <div className="relative" style={{ height }}>
        {list.map((plane, i) => {
          const offset = i - focusIndex;
          const inFocus = offset === 0;
          const slot = rackSlot(offset);
          return (
            <motion.div
              key={plane.id}
              initial={false}
              animate={
                motionSafe
                  ? slot
                  : { ...slot, filter: inFocus ? "blur(0px)" : "blur(2px)" }
              }
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
              style={{ zIndex: 10 - Math.abs(offset) }}
              className={cn(
                "border-hairline absolute inset-x-0 top-0 rounded-3 border p-4",
                inFocus
                  ? "bg-surface-2 border-l-cobalt-bright border-l-2"
                  : "bg-surface-1",
              )}
              aria-hidden={inFocus ? undefined : true}
            >
              {inFocus ? (
                <div>
                  <p className="text-label text-ink-3">{plane.label}</p>
                  <div className="mt-2">{plane.content}</div>
                </div>
              ) : (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => rack(plane.id)}
                  className="block w-full cursor-pointer text-left"
                >
                  <p className="text-label text-ink-3">{plane.label}</p>
                  <div className="pointer-events-none mt-2 select-none">
                    {plane.content}
                  </div>
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      <span aria-live="polite" className="sr-only" role="status">
        {list[focusIndex]?.label} in focus
      </span>
    </div>
  );
}
