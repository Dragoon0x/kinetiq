"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RedactRevealProps = {
  children: React.ReactNode;
  /** Controlled reveal. */
  revealed?: boolean;
  /** Uncontrolled trigger. @default "hover" */
  revealOn?: "hover" | "press";
  className?: string;
};

/**
 * Text under a redaction bar that wipes away to show the words. The bar scales
 * off its left edge, so the line is uncovered left-to-right like a marker
 * pulled back rather than a fade; covering it again wipes the bar closed.
 *
 * The words underneath are always real text, present and readable to assistive
 * tech whether or not the bar is drawn — the redaction is a visual layer, never
 * a way to hide content from a screen reader. In press mode the field is a real
 * toggle button; in hover mode it uncovers while hovered or focused. Reduced
 * motion swaps the bar in and out with no wipe.
 */
export function RedactReveal({
  children,
  revealed,
  revealOn = "hover",
  className,
}: RedactRevealProps) {
  const motionSafe = useMotionSafe();
  const [hovering, setHovering] = React.useState(false);
  const [pressedOpen, setPressedOpen] = React.useState(false);

  const isControlled = revealed !== undefined;
  const open = isControlled
    ? revealed
    : revealOn === "press"
      ? pressedOpen
      : hovering;

  const bar = (
    <motion.span
      aria-hidden
      style={{ background: "var(--ink)" }}
      className="absolute inset-[-0.05em_-0.1em] origin-left rounded-[0.15em]"
      initial={false}
      animate={{ scaleX: open ? 0 : 1 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    />
  );

  const content = (
    <span className="relative inline-block">
      <span className="relative">{children}</span>
      {bar}
    </span>
  );

  if (isControlled) {
    return <span className={cn("inline-block", className)}>{content}</span>;
  }

  if (revealOn === "press") {
    return (
      <button
        type="button"
        aria-pressed={pressedOpen}
        onClick={() => setPressedOpen((value) => !value)}
        className={cn(
          "inline-block cursor-pointer rounded-[0.15em]",
          "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
          className,
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      tabIndex={0}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      className={cn(
        "inline-block cursor-default rounded-[0.15em] outline-none",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
    >
      {content}
    </span>
  );
}
