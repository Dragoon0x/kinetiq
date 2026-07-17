"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StickerPeelProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The sticker face. */
  children: React.ReactNode;
  /** Width of the square-ish sticker in px. @default 240 */
  width?: number;
  /** Height in px. @default 150 */
  height?: number;
  /** Drag distance in px past which a release removes the sticker. @default 96 */
  threshold?: number;
  /** Accessible name for the sticker and its control. */
  label?: string;
  onPeel?: () => void;
  onRestore?: () => void;
  className?: string;
};

/**
 * A sticker you can peel. Drag it and the grabbed corner curls up, a shadow
 * pools underneath, and the card tilts away from the surface; let go before the
 * threshold and it snaps back on `recoil`, or past it and it lifts clean off,
 * baring the dashed slot beneath. A paired button peels and re-sticks it for
 * keyboard and pointer-free use. Under reduced motion the lift is a plain fade
 * with no curl or spring.
 */
export function StickerPeel({
  ref,
  children,
  width = 240,
  height = 150,
  threshold = 96,
  label = "Sticker",
  onPeel,
  onRestore,
  className,
}: StickerPeelProps) {
  const motionSafe = useMotionSafe();
  const [peeled, setPeeled] = React.useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(1);

  const dist = useTransform<number, number>([x, y], ([lx, ly]) =>
    Math.hypot(lx ?? 0, ly ?? 0),
  );
  const rotate = useTransform(x, [-160, 160], [-9, 9], { clamp: true });
  const curl = useTransform(dist, [0, 140], [10, 40], { clamp: true });
  const curlOpacity = useTransform(dist, [0, 24, 140], [0, 0.55, 1], {
    clamp: true,
  });
  const lift = useTransform(dist, [0, 140], [2, 18], { clamp: true });
  const blur = useTransform(dist, [0, 140], [6, 30], { clamp: true });
  const shadowAlpha = useTransform(dist, [0, 140], [0.06, 0.3], { clamp: true });
  const boxShadow = useMotionTemplate`0px ${lift}px ${blur}px rgba(2, 6, 23, ${shadowAlpha})`;

  const settle = (nx: number, ny: number, spring: boolean) => {
    const transition = spring
      ? springs.recoil
      : { duration: durations.fast, ease: easings.enter };
    animate(x, nx, transition);
    animate(y, ny, transition);
  };

  const doPeel = (dirX: number, dirY: number) => {
    if (peeled) return;
    setPeeled(true);
    onPeel?.();
    const len = Math.hypot(dirX, dirY) || 1;
    const reach = motionSafe ? 260 : 0;
    animate(x, (dirX / len) * reach, {
      duration: durations.base,
      ease: easings.exit,
    });
    animate(y, (dirY / len) * reach - (motionSafe ? 40 : 0), {
      duration: durations.base,
      ease: easings.exit,
    });
    animate(opacity, 0, { duration: durations.base, ease: easings.exit });
  };

  const doRestore = () => {
    if (!peeled) return;
    setPeeled(false);
    onRestore?.();
    animate(opacity, 1, { duration: durations.fast, ease: easings.enter });
    settle(0, 0, motionSafe);
  };

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    const reached = Math.hypot(x.get(), y.get());
    if (reached > threshold) {
      const vx = info.velocity.x;
      const vy = info.velocity.y;
      doPeel(x.get() + vx * 0.05, y.get() + vy * 0.05);
    } else {
      settle(0, 0, motionSafe);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        ref={ref}
        className="relative"
        style={{ width, height }}
      >
        {/* The slot the sticker lifts away from. */}
        <div className="border-hairline-strong text-ink-3 absolute inset-0 grid place-items-center rounded-3 border border-dashed text-xs font-medium">
          {peeled ? "Peeled off" : null}
        </div>

        <motion.div
          role="img"
          aria-label={label}
          drag={!peeled}
          dragMomentum={false}
          dragElastic={0.9}
          onDragEnd={onDragEnd}
          style={{ x, y, rotate, opacity, boxShadow }}
          className={cn(
            "border-hairline bg-surface-1 text-ink absolute inset-0 grid touch-none place-items-center overflow-hidden rounded-3 border p-4 text-center select-none",
            peeled ? "pointer-events-none" : "cursor-grab active:cursor-grabbing",
          )}
        >
          {/* Peeling corner — catches light as it lifts. */}
          <motion.span
            aria-hidden
            style={{
              width: curl,
              height: curl,
              opacity: curlOpacity,
              clipPath: "polygon(0 0, 100% 0, 100% 100%)",
              background:
                "linear-gradient(225deg, var(--card), color-mix(in oklab, var(--card) 40%, transparent))",
            }}
            className="absolute top-0 right-0 rounded-bl-2 shadow-[-2px_2px_6px_rgba(2,6,23,0.18)]"
          />
          {children}
        </motion.div>
      </div>

      <button
        type="button"
        onClick={() => (peeled ? doRestore() : doPeel(-70, -70))}
        className="border-hairline bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:ring-cobalt-bright/50 rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {peeled ? `Stick ${label} back` : `Peel ${label} off`}
      </button>
    </div>
  );
}
