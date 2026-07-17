"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type ProgressScrubProps = {
  children: React.ReactNode;
  /** Scroll region height in px. @default 240 */
  height?: number;
  label?: string;
  className?: string;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A reading bar that both reports and drives. As you scroll the region its fill
 * tracks how far through you are; grab the bar and you scrub the other way — the
 * region scrolls to wherever you drag, so the same control shows progress and
 * seeks with it.
 *
 * The bar is a real slider: it carries its position for assistive tech, and the
 * arrows, Home, and End step and jump the scroll from the keyboard. Under reduced
 * motion a seek jumps straight to the target instead of gliding; the two-way bind
 * is otherwise identical.
 */
export function ProgressScrub({
  children,
  height = 240,
  label = "Reading progress",
  className,
}: ProgressScrubProps) {
  const motionSafe = useMotionSafe();
  const regionId = React.useId();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const [progress, setProgress] = React.useState(0);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? clamp01(el.scrollTop / max) : 0);
  };

  const scrubTo = (fraction: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTo({
      top: max * clamp01(fraction),
      behavior: motionSafe ? "smooth" : "auto",
    });
  };

  const fractionFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      scrubTo(progress + 0.1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      scrubTo(progress - 0.1);
    } else if (event.key === "Home") {
      event.preventDefault();
      scrubTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      scrubTo(1);
    }
  };

  const pct = `${progress * 100}%`;

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-controls={regionId}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingRef.current = true;
          scrubTo(fractionFromClientX(event.clientX));
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) scrubTo(fractionFromClientX(event.clientX));
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onKeyDown={handleKeyDown}
        className="bg-surface-2 relative h-2.5 cursor-pointer touch-none rounded-full outline-none focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div
          className="bg-primary absolute inset-y-0 left-0 rounded-full"
          style={{ width: pct }}
        />
        <div
          className="bg-surface-0 border-hairline-strong absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ left: pct }}
        />
      </div>

      <div
        id={regionId}
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ height }}
        className="border-hairline bg-surface-1 overflow-y-auto rounded-3 border p-4"
      >
        {children}
      </div>
    </div>
  );
}
