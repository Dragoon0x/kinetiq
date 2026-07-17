"use client";

import * as React from "react";

import { motion, useMotionValue, useTransform } from "motion/react";

import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { cn } from "@/registry/lib/utils";

export type CursorLensProps = {
  /** The content under the glass. Rendered once as the base and once, magnified
   *  and aria-hidden, inside the lens. Keep it presentational. */
  children: React.ReactNode;
  /** Magnification. @default 2 */
  zoom?: number;
  /** Lens diameter in px. @default 128 */
  size?: number;
  className?: string;
};

/**
 * A round glass that follows the pointer and magnifies whatever is beneath it.
 * The magnified copy scales about the exact point under the cursor and a fixed
 * circular clip travels with it, both driven straight off two motion values — so
 * the glass tracks the cursor without a single React render, and the content
 * under your pointer stays put while it grows.
 *
 * There is no ambient or auto-playing motion here: the lens only moves when you
 * do, which is why it needs no reduced-motion pathway. It is a fine-pointer
 * instrument, so on touch it steps aside and the content is left plain and fully
 * readable; the magnified copy is aria-hidden, so assistive tech reads the
 * content once.
 */
export function CursorLens({
  children,
  zoom = 2,
  size = 128,
  className,
}: CursorLensProps) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const cx = useMotionValue(-9999);
  const cy = useMotionValue(-9999);
  const opacity = useMotionValue(0);
  const fine = usePointerFine();

  const ringLeft = useTransform(cx, (value) => value - size / 2);
  const ringTop = useTransform(cy, (value) => value - size / 2);
  // The clip is a fixed circle in frame space, so the magnified layer beneath it
  // shows only through the glass wherever the cursor is.
  const clip = useTransform(
    [cx, cy],
    ([x, y]: number[]) => `circle(${size / 2}px at ${x}px ${y}px)`,
  );
  // The copy scales about the cursor point, so that point holds still as it grows.
  const origin = useTransform(
    [cx, cy],
    ([x, y]: number[]) => `${x}px ${y}px`,
  );

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!fine) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    cx.set(event.clientX - rect.left);
    cy.set(event.clientY - rect.top);
    opacity.set(1);
  };

  return (
    <div
      ref={frameRef}
      onPointerMove={move}
      onPointerEnter={move}
      onPointerLeave={() => opacity.set(0)}
      className={cn(
        "relative w-full overflow-hidden",
        fine && "cursor-none",
        className,
      )}
    >
      {children}

      {fine && (
        <>
          {/* the magnified copy, shown only through the travelling clip */}
          <motion.div
            aria-hidden
            style={{ clipPath: clip, opacity }}
            className="pointer-events-none absolute inset-0"
          >
            <motion.div
              className="bg-surface-0 absolute inset-0"
              style={{ scale: zoom, transformOrigin: origin }}
            >
              {children}
            </motion.div>
          </motion.div>

          {/* the glass rim */}
          <motion.div
            aria-hidden
            style={{ left: ringLeft, top: ringTop, width: size, height: size, opacity }}
            className="border-hairline-strong pointer-events-none absolute rounded-full border-2 shadow-lg"
          />
        </>
      )}
    </div>
  );
}
