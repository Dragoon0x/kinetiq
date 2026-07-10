"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  usePointerFine,
  usePointerTilt,
} from "@/registry/hooks/use-pointer-tilt";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FoilCardProps = {
  children: React.ReactNode;
  /** Foil-only artwork (an emblem, a band) that carries the strongest sheen. */
  emblem?: React.ReactNode;
  /** Sheen strength, 0–1. @default 0.6 */
  intensity?: number;
  /** Fires on the stamp press. */
  onStamp?: () => void;
  className?: string;
  "aria-label"?: string;
};

/**
 * A holographic foil card that never tilts — only the light moves. The sheen
 * chases the pointer across fine foil striping, rotating its hue with the
 * travel, and pressing the card stamps a bright flash into the foil. The
 * whole card is a real button. Under reduced motion the sheen rests at a
 * fixed angle and the press still flashes, opacity-only.
 */
export function FoilCard({
  children,
  emblem,
  intensity = 0.6,
  onStamp,
  className,
  "aria-label": ariaLabel = "Foil card",
}: FoilCardProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  const live = motionSafe && pointerFine;
  const tilt = usePointerTilt({ maxTilt: 0, disabled: !live });
  const flash = useMotionValue(0);
  const flashControls = React.useRef<ReturnType<typeof animate> | null>(null);

  React.useEffect(
    () => () => {
      flashControls.current?.stop();
    },
    [],
  );

  const sheenX = useTransform(tilt.pointerX, (v) => `${v}%`);
  const sheenY = useTransform(tilt.pointerY, (v) => `${v}%`);
  const hue = useTransform(tilt.pointerX, [0, 100], [190, 340]);
  const sheen = useMotionTemplate`radial-gradient(320px circle at ${sheenX} ${sheenY}, oklch(0.82 0.16 ${hue} / ${intensity}), oklch(0.7 0.12 258 / ${intensity * 0.35}) 42%, transparent 72%)`;
  const flashOverlay = useTransform(flash, (f) => f * 0.85);

  const stamp = () => {
    flashControls.current?.stop();
    flash.set(1);
    flashControls.current = animate(flash, 0, {
      duration: durations.slow,
      ease: [0.22, 1, 0.36, 1],
    });
    onStamp?.();
  };

  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      onClick={stamp}
      {...(live ? tilt.handlers : {})}
      whileTap={motionSafe ? { scale: 0.985 } : undefined}
      transition={springs.flick}
      className={cn(
        "border-hairline bg-surface-2 focus-visible:ring-cobalt-bright/50 relative block w-full overflow-hidden rounded-3 border p-4 text-left outline-none focus-visible:ring-2",
        className,
      )}
    >
      {/* foil striping — the fine grain the sheen plays across */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          background:
            "repeating-linear-gradient(115deg, rgb(255 255 255) 0px, transparent 1px, transparent 3px, rgb(255 255 255) 4px)",
        }}
      />
      {/* the traveling sheen (fixed under RM / coarse pointers) */}
      {motionSafe ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{ background: sheen }}
        />
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{
            background:
              "radial-gradient(320px circle at 30% 25%, oklch(0.82 0.16 258 / 0.35), transparent 70%)",
          }}
        />
      )}
      {/* stamp flash */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-white mix-blend-overlay"
        style={{ opacity: flashOverlay }}
      />
      {emblem ? (
        <span aria-hidden className="absolute top-3 right-3">
          {emblem}
        </span>
      ) : null}
      <span className="relative">{children}</span>
    </motion.button>
  );
}
