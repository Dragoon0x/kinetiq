"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type SplitPaneProps = {
  start: React.ReactNode;
  end: React.ReactNode;
  /** Start pane width as a percentage. @default 50 */
  defaultSplit?: number;
  /** Travel limits in percent. @default 20 / 80 */
  min?: number;
  max?: number;
  /** Targets the divider snaps to on release, within 4%. @default thirds + half */
  snap?: number[];
  /** Stage height in px. @default 240 */
  height?: number;
  label?: string;
  className?: string;
};

const clampTo = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Two panes with a divider you can move. Dragging tracks the handle one to one;
 * on release it eases to the nearest snap — the thirds and the half — if it is
 * close, and stays put otherwise. The grabber swells while hovered or held so
 * the hit target announces itself.
 *
 * The divider is a real `separator` with a value, so it is reachable by keyboard
 * and reads its position aloud: arrows nudge, Shift jumps, Home and End go to
 * the limits. Under reduced motion the snap lands without the glide.
 */
export function SplitPane({
  start,
  end,
  defaultSplit = 50,
  min = 20,
  max = 80,
  snap = [100 / 3, 50, 200 / 3],
  height = 240,
  label = "Resize panels",
  className,
}: SplitPaneProps) {
  const motionSafe = useMotionSafe();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [split, setSplit] = React.useState(clampTo(defaultSplit, min, max));
  const [dragging, setDragging] = React.useState(false);

  const fromClientX = (clientX: number) => {
    const el = frameRef.current;
    if (!el) return split;
    const rect = el.getBoundingClientRect();
    return clampTo(((clientX - rect.left) / rect.width) * 100, min, max);
  };

  const snapNearest = (value: number) => {
    for (const target of snap) {
      if (Math.abs(value - target) < 4) return target;
    }
    return value;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const big = event.shiftKey ? 10 : 2;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = split - big;
    else if (event.key === "ArrowRight") next = split + big;
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    setSplit(clampTo(next, min, max));
  };

  // Drag is one-to-one; the snap glides only on release, so the transition is
  // suppressed while the handle is held.
  const transition =
    motionSafe && !dragging
      ? "flex-basis 300ms cubic-bezier(0.22, 1, 0.36, 1)"
      : "none";

  return (
    <div
      ref={frameRef}
      className={cn(
        "border-hairline flex w-full touch-none overflow-hidden rounded-3 border",
        className,
      )}
      style={{ height }}
    >
      <div
        className="bg-surface-1 min-w-0 overflow-auto"
        style={{ flexBasis: `${split}%`, transition }}
      >
        {start}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(split)}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={label}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (dragging) setSplit(fromClientX(event.clientX));
        }}
        onPointerUp={(event) => {
          if (!dragging) return;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setSplit((value) => snapNearest(value));
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={handleKeyDown}
        className="bg-surface-2 group relative flex w-2.5 shrink-0 cursor-col-resize items-center justify-center outline-none focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-[-2px]"
      >
        <span
          aria-hidden
          className={cn(
            "w-1 rounded-full transition-all duration-150",
            dragging
              ? "bg-primary h-12"
              : "bg-border group-hover:bg-muted-foreground h-8 group-hover:h-12",
          )}
        />
      </div>

      <div className="bg-surface-1 min-w-0 flex-1 overflow-auto">{end}</div>
    </div>
  );
}
