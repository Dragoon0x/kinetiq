"use client";

import * as React from "react";

import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ScanRevealProps = {
  /** Tear the dual layers down after the sweep completes (default true). */
  once?: boolean;
  /** Sweep direction across the section. */
  direction?: "down" | "up";
  /** Scrollable ancestor, so scroll-linking works inside overflow containers. */
  containerRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  children: React.ReactNode;
};

/**
 * Sections develop as the scanner passes. A 1px signal line sweeps the
 * section exactly once, linked to scroll progress; a mono coordinate chip
 * rides its right end. A clip-path on the full-opacity developed layer
 * follows the line over a dimmed, blurred base copy, and developed content
 * settles up 8px as it clears. With `once`, the layers tear down into plain
 * children after the sweep. Reduced motion renders fully developed with a
 * single opacity fade.
 */
export function ScanReveal({
  once = true,
  direction = "down",
  containerRef,
  className,
  children,
}: ScanRevealProps) {
  const motionSafe = useMotionSafe();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [done, setDone] = React.useState(false);
  const [readout, setReadout] = React.useState(0);
  const lastReadoutAt = React.useRef(0);

  const { scrollYProgress } = useScroll({
    target: ref,
    container: containerRef,
    offset: ["start 0.9", "start 0.35"],
  });

  // Line position as a % of the section — top→bottom for "down".
  const lineTopPct = useTransform(
    scrollYProgress,
    (value) => (direction === "down" ? value : 1 - value) * 100,
  );
  const lineTop = useMotionTemplate`${lineTopPct}%`;
  const undevelopedPct = useTransform(lineTopPct, (value) => 100 - value);
  const clipDown = useMotionTemplate`inset(0 0 ${undevelopedPct}% 0)`;
  const clipUp = useMotionTemplate`inset(${lineTopPct}% 0 0 0)`;
  // Developed content settles up as the line clears it.
  const rise = useTransform(scrollYProgress, [0, 1], [distances.step, 0]);
  // The line only exists mid-sweep.
  const lineOpacity = useTransform(
    scrollYProgress,
    [0, 0.02, 0.98, 1],
    [0, 1, 1, 0],
  );

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (value >= 1) {
      if (once && !done) setDone(true);
      return;
    }
    // Coordinate readout, throttled to ~10Hz.
    const now = performance.now();
    if (now - lastReadoutAt.current < 100) return;
    lastReadoutAt.current = now;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const t = direction === "down" ? value : 1 - value;
    setReadout(Math.max(0, Math.round(rect.top + rect.height * t)));
  });

  // Reduced motion: fully developed, one opacity fade on first in-view.
  if (!motionSafe) {
    return (
      <motion.div
        ref={ref}
        className={className}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, root: containerRef, amount: 0.15 }}
        transition={{ duration: durations.fast }}
      >
        {children}
      </motion.div>
    );
  }

  // After the sweep: clean DOM, single interactive copy.
  if (done) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Undeveloped base — dimmed, blurred, inert duplicate. */}
      <div
        aria-hidden
        inert
        className="pointer-events-none opacity-30 blur-[2px] select-none"
      >
        {children}
      </div>
      {/* Developed layer — the real content, clipped to the scanned region. */}
      <motion.div
        className="absolute inset-0"
        style={{ clipPath: direction === "down" ? clipDown : clipUp }}
      >
        <motion.div style={{ y: rise }}>{children}</motion.div>
      </motion.div>
      {/* Scan line with coordinate readout riding its right end. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 z-10"
        style={{ top: lineTop, opacity: lineOpacity }}
      >
        <div
          className="h-px w-full"
          style={{ background: "var(--signal, var(--primary))" }}
        />
        <span
          className="bg-background absolute top-1/2 right-2 -translate-y-1/2 rounded-1 border px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
          style={{
            borderColor: "var(--signal, var(--primary))",
            color: "var(--signal, var(--primary))",
          }}
        >
          Y {String(readout).padStart(4, "0")}
        </span>
      </motion.div>
    </div>
  );
}
