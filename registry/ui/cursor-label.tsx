"use client";

import * as React from "react";

import { motion, useMotionValue, useSpring } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CursorLabelProps = {
  /** The region the labelled cursor lives inside. Mark any element with
   *  `data-cursor="Verb"` and the cursor names it while hovered. */
  children: React.ReactNode;
  className?: string;
};

/**
 * A cursor that says what a thing does. Inside the region it rides a small dot
 * that trails the pointer on the glide spring; cross an element tagged with a
 * verb and the dot morphs into a pill carrying that word, snapping back to a dot
 * on the way out. The label is read from the target, so the guidance lives with
 * the element rather than in a lookup.
 *
 * The pill is decoration — `aria-hidden`, and the real elements underneath keep
 * their own roles, focus, and hit areas — so nothing here changes what a
 * keyboard or screen reader gets. It is a fine-pointer flourish: on touch the
 * region renders plain. Reduced motion drops the trailing spring and the pill
 * tracks and morphs without lag.
 */
export function CursorLabel({ children, className }: CursorLabelProps) {
  const fine = usePointerFine();
  const motionSafe = useMotionSafe();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const glide = {
    stiffness: springs.glide.stiffness,
    damping: springs.glide.damping,
    mass: springs.glide.mass,
  };
  const sx = useSpring(x, glide);
  const sy = useSpring(y, glide);
  const [label, setLabel] = React.useState<string | null>(null);
  const [inside, setInside] = React.useState(false);

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(event.clientX - rect.left);
    y.set(event.clientY - rect.top);
    const target = (event.target as HTMLElement).closest?.("[data-cursor]");
    const next = target?.getAttribute("data-cursor") ?? null;
    setLabel((prev) => (prev === next ? prev : next));
    setInside(true);
  };

  if (!fine) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={frameRef}
      onPointerMove={move}
      onPointerLeave={() => setInside(false)}
      className={cn("relative cursor-none", className)}
    >
      {children}

      <motion.div
        aria-hidden
        style={{
          x: motionSafe ? sx : x,
          y: motionSafe ? sy : y,
          opacity: inside ? 1 : 0,
        }}
        className="pointer-events-none absolute top-0 left-0 z-50"
      >
        <motion.div
          layout
          transition={motionSafe ? springs.snap : { duration: 0 }}
          className={cn(
            "bg-primary text-primary-foreground flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full whitespace-nowrap shadow-sm",
            label ? "h-6 px-2.5 text-xs font-medium" : "size-3",
          )}
        >
          {label && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.12 }}
            >
              {label}
            </motion.span>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
