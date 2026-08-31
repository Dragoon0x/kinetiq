"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type VignetteIsoFloorProps = {
  /** Tiles per side. @default 5 */
  size?: number;
  /** Tile indices (row-major) that pulse, in this fixed order. */
  route?: number[];
  /** Seconds between pulses. @default 0.9 */
  cadence?: number;
  label?: string;
  className?: string;
};

const DEFAULT_ROUTE = [2, 7, 12, 11, 16, 17, 22];

/**
 * An isometric tile floor with a route pulsing across it, one tile at a
 * time — the infrastructure scene, for heroes about things moving through a
 * system. The floor is a CSS-rotated grid, the route is fixed data, and the
 * pulse is a mount-driven cycle: deterministic everywhere. One image to
 * assistive tech.
 *
 * Reduced motion: the whole route holds lit.
 */
export function VignetteIsoFloor({
  size = 5,
  route = DEFAULT_ROUTE,
  cadence = 0.9,
  label = "A change propagating",
  className,
}: VignetteIsoFloorProps) {
  const motionSafe = useMotionSafe();
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (!motionSafe) return;
    const id = window.setInterval(
      () => setStep((s) => (s + 1) % (route.length + 3)),
      cadence * 1000,
    );
    return () => window.clearInterval(id);
  }, [motionSafe, route.length, cadence]);

  const litThrough = motionSafe ? step : route.length;

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("w-full max-w-xs", className)}
    >
      <div
        aria-hidden
        className="flex h-52 items-center justify-center overflow-hidden"
      >
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${size}, 2.25rem)`,
            transform: "rotateX(55deg) rotateZ(-45deg)",
            transformStyle: "preserve-3d",
          }}
        >
          {Array.from({ length: size * size }, (_, index) => {
            const routeAt = route.indexOf(index);
            const lit = routeAt !== -1 && routeAt < litThrough;
            const head = motionSafe && routeAt === litThrough - 1;
            return (
              <motion.span
                key={index}
                className={cn(
                  "size-9 rounded-[4px] border border-hairline",
                  lit ? "border-primary/40 bg-primary/20" : "bg-surface-1",
                )}
                animate={head ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={
                  head ? { duration: 0.5, ease: "easeOut" } : { duration: 0.2 }
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
