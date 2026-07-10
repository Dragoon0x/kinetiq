"use client";

import * as React from "react";

import { motion, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  usePointerFine,
  usePointerTilt,
} from "@/registry/hooks/use-pointer-tilt";
import { cn } from "@/registry/lib/utils";

export type MirrorHallProps = {
  /** The plate reflected down the hall. Keep it light — it renders N times. */
  children: React.ReactNode;
  /** Reflection count behind the front plate. @default 5 */
  copies?: number;
  /** Scale step per reflection. @default 0.86 */
  falloff?: number;
  /** How strongly the corridor bends toward the pointer, px per depth. @default 14 */
  bend?: number;
  /** Stage height in px. @default 240 */
  height?: number;
  className?: string;
};

/**
 * A hall of mirrors — the plate recedes through scaled, dimmed copies toward
 * a vanishing point, and the corridor bends toward your pointer: deeper
 * reflections displace further, so the axis swings as your hand moves.
 * Copies are aria-hidden; only the front plate is real. Under reduced motion
 * the corridor rests centered.
 */
export function MirrorHall({
  children,
  copies = 5,
  falloff = 0.86,
  bend = 14,
  height = 240,
  className,
}: MirrorHallProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  const live = motionSafe && pointerFine;
  const tilt = usePointerTilt({ maxTilt: 0, disabled: !live });

  const count = Math.min(Math.max(copies, 2), 7);
  const depths = Array.from({ length: count }, (_, i) => count - i); // deepest first

  return (
    <div
      {...(live ? tilt.handlers : {})}
      style={{ height }}
      className={cn(
        "border-hairline bg-surface-0 relative w-full overflow-hidden rounded-3 border",
        className,
      )}
    >
      {/* receding reflections, deepest painted first */}
      {depths.map((depth) => (
        <Reflection
          key={depth}
          depth={depth}
          falloff={falloff}
          bend={bend}
          tiltX={tilt.tiltX}
          tiltY={tilt.tiltY}
          live={live}
        >
          {children}
        </Reflection>
      ))}
      {/* the front plate — the only real one */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function Reflection({
  depth,
  falloff,
  bend,
  tiltX,
  tiltY,
  live,
  children,
}: {
  depth: number;
  falloff: number;
  bend: number;
  tiltX: ReturnType<typeof usePointerTilt>["tiltX"];
  tiltY: ReturnType<typeof usePointerTilt>["tiltY"];
  live: boolean;
  children: React.ReactNode;
}) {
  const scale = falloff ** depth;
  const x = useTransform(tiltX, (v) => (live ? v * bend * depth : 0));
  const y = useTransform(tiltY, (v) => (live ? v * bend * depth * 0.6 : 0));
  const opacity = Math.max(0.85 - depth * 0.16, 0.08);
  const mirrored = depth % 2 === 1;

  return (
    <motion.div
      aria-hidden
      style={{ x, y }}
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div
        style={{
          transform: `scale(${scale}) ${mirrored ? "scaleX(-1)" : ""}`,
          opacity,
          filter: "saturate(0.8)",
        }}
      >
        {children}
      </div>
    </motion.div>
  );
}
