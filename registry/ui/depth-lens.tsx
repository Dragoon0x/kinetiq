"use client";

import * as React from "react";

import { motion, useSpring, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type DepthLensProps = {
  /** The visible top layer. */
  surface: React.ReactNode;
  /** The layer exposed inside the lens. */
  beneath: React.ReactNode;
  /** Lens radius in px. @default 64 */
  radius?: number;
  /** Stage height in px. @default 240 */
  height?: number;
  surfaceLabel?: string;
  beneathLabel?: string;
  className?: string;
  "aria-label"?: string;
};

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/** Keyboard nudge per arrow press, px. */
const KEY_STEP = 24;

/**
 * An x-ray lens over a two-layer scene — the circular aperture chases the
 * pointer on the glide spring and shows the layer beneath through the
 * surface. The trick is honest: `beneath` renders twice, once under
 * everything and once inside the lens, counter-translated so the two copies
 * register perfectly. Arrows steer the lens from the keyboard. Under reduced
 * motion the lens rests at center and keyboard moves are instant.
 */
export function DepthLens({
  surface,
  beneath,
  radius = 64,
  height = 240,
  surfaceLabel = "Surface",
  beneathLabel = "Beneath",
  className,
  "aria-label": ariaLabel = "Depth lens",
}: DepthLensProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  const follow = motionSafe && pointerFine;
  const stageRef = React.useRef<HTMLDivElement>(null);
  /** Measured stage width — the inner lens copy needs it to register. */
  const [stageWidth, setStageWidth] = React.useState(0);

  const targetX = useSpring(0, GLIDE);
  const targetY = useSpring(0, GLIDE);

  // Center the lens once the stage has a size; re-center on resize. The
  // width write is deduped so the observer never loops.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const center = () => {
      const rect = stage.getBoundingClientRect();
      setStageWidth((prev) =>
        Math.abs(prev - rect.width) < 1 ? prev : rect.width,
      );
      targetX.jump(rect.width / 2);
      targetY.jump(rect.height / 2);
    };
    const observer = new ResizeObserver(center);
    observer.observe(stage);
    center();
    return () => observer.disconnect();
  }, [targetX, targetY]);

  const steer = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    targetX.set(clamp(clientX - rect.left, radius * 0.4, rect.width - radius * 0.4));
    targetY.set(clamp(clientY - rect.top, radius * 0.4, rect.height - radius * 0.4));
  };

  const nudge = (dx: number, dy: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = clamp(targetX.get() + dx, radius * 0.4, rect.width - radius * 0.4);
    const ny = clamp(targetY.get() + dy, radius * 0.4, rect.height - radius * 0.4);
    if (motionSafe) {
      targetX.set(nx);
      targetY.set(ny);
    } else {
      targetX.jump(nx);
      targetY.jump(ny);
    }
  };

  const lensX = useTransform(targetX, (x) => x - radius);
  const lensY = useTransform(targetY, (y) => y - radius);
  // Counter-translate the inner copy so it registers with the base layer.
  const innerX = useTransform(lensX, (x) => -x);
  const innerY = useTransform(lensY, (y) => -y);

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={stageRef}
        role="group"
        tabIndex={0}
        aria-label={ariaLabel}
        onPointerMove={follow ? (e) => steer(e.clientX, e.clientY) : undefined}
        onPointerDown={
          follow ? undefined : (e) => steer(e.clientX, e.clientY)
        }
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            nudge(-KEY_STEP, 0);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            nudge(KEY_STEP, 0);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            nudge(0, -KEY_STEP);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            nudge(0, KEY_STEP);
          }
        }}
        style={{ height }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 relative touch-none overflow-hidden rounded-3 border outline-none select-none focus-visible:ring-2"
      >
        {/* the surface everyone sees */}
        <div aria-hidden className="absolute inset-0">
          {surface}
        </div>

        {/* the lens: a clipped, registered copy of what lies beneath */}
        <motion.div
          aria-hidden
          style={{ x: lensX, y: lensY, width: radius * 2, height: radius * 2 }}
          className="border-cobalt-bright/70 bg-surface-0 absolute top-0 left-0 z-10 overflow-hidden rounded-full border shadow-[0_4px_24px_rgb(0_0_0/0.35)]"
        >
          <motion.div
            style={{ x: innerX, y: innerY }}
            className="absolute top-0 left-0"
          >
            <div style={{ width: stageWidth || undefined, height }}>
              {beneath}
            </div>
          </motion.div>
          {/* bezel crosshair */}
          <span
            aria-hidden
            className="border-cobalt-bright/40 pointer-events-none absolute inset-1.5 rounded-full border border-dashed"
          />
        </motion.div>

        {/* corner labels */}
        <span className="text-label text-ink-2 bg-surface-0/70 absolute top-2 left-2 rounded-1 px-1.5 py-0.5 backdrop-blur-sm">
          {surfaceLabel}
        </span>
        <span className="text-label text-cobalt-bright bg-surface-0/70 absolute top-2 right-2 rounded-1 px-1.5 py-0.5 backdrop-blur-sm">
          LENS · {beneathLabel}
        </span>
      </div>
    </div>
  );
}
