"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Scene = { id: string; node: React.ReactNode };

export type StickyRevealProps = {
  scenes: Scene[];
  /** Pinned stage height in px. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A stage that stays put while the story scrolls through it. The panel pins to
 * the top and the scroll drives which scene is lit — each one cross-fades in as
 * its stretch of the track arrives while a rail of dots marks the position, so a
 * short sequence plays out in place instead of scrolling past.
 *
 * Reduced motion refuses the trick outright: rather than pin and cross-fade, it
 * lays the scenes out as a plain stacked list, all present and readable, so no
 * content is gated behind a scroll animation. The scroll region is a labelled,
 * keyboard-focusable landmark, and the off-scene panels are hidden from
 * assistive tech so only the live one is read.
 */
export function StickyReveal({
  scenes,
  height = 300,
  className,
  "aria-label": ariaLabel = "Scroll story",
}: StickyRevealProps) {
  const motionSafe = useMotionSafe();
  const [active, setActive] = React.useState(0);

  if (!motionSafe) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {scenes.map((scene) => (
          <div
            key={scene.id}
            className="border-hairline bg-surface-1 rounded-3 border p-4"
          >
            {scene.node}
          </div>
        ))}
      </div>
    );
  }

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    const progress = max > 0 ? el.scrollTop / max : 0;
    const index = Math.min(
      scenes.length - 1,
      Math.floor(progress * scenes.length),
    );
    setActive((value) => (value === index ? value : index));
  };

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      style={{ height }}
      className={cn(
        "border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 relative overflow-y-auto rounded-3 border outline-none focus-visible:ring-2",
        className,
      )}
    >
      <div style={{ height: height * scenes.length }} className="relative">
        <div className="sticky top-0 overflow-hidden" style={{ height }}>
          <div className="relative h-full">
            {scenes.map((scene, index) => (
              <motion.div
                key={scene.id}
                aria-hidden={index !== active}
                initial={false}
                animate={{
                  opacity: index === active ? 1 : 0,
                  y: index === active ? 0 : index < active ? -10 : 10,
                }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="absolute inset-0 flex items-center justify-center p-6 text-center"
              >
                {scene.node}
              </motion.div>
            ))}
            <div className="absolute top-1/2 right-3 flex -translate-y-1/2 flex-col gap-1.5">
              {scenes.map((scene, index) => (
                <span
                  key={scene.id}
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    index === active ? "bg-primary" : "bg-border",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
