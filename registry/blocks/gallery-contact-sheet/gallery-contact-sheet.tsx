"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SheetFrame = {
  id: string;
  /** Frame number as printed on the sheet edge. */
  frame: string;
  caption: string;
  /** A CSS colour or gradient standing in for the exposure. */
  wash?: string;
  /** Marked frames are the selects, ringed the way a grease pencil would. */
  selected?: boolean;
};

export type GalleryContactSheetProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  frames?: SheetFrame[];
  /** The roll's own label, printed along the head of the sheet. */
  rollLabel?: string;
  className?: string;
};

const DEFAULT_FRAMES: SheetFrame[] = [
  { id: "f1", frame: "01", caption: "Gate, 06:12" },
  { id: "f2", frame: "02", caption: "Crane 2, holding" },
  { id: "f3", frame: "03", caption: "Crew B, second slot", selected: true },
  { id: "f4", frame: "04", caption: "Berth 4, empty" },
  { id: "f5", frame: "05", caption: "Tide board" },
  { id: "f6", frame: "06", caption: "Handover, 14:00", selected: true },
  { id: "f7", frame: "07", caption: "Cold store doors" },
  { id: "f8", frame: "08", caption: "Rain on the sheet" },
  { id: "f9", frame: "09", caption: "Night gang arriving" },
  { id: "f10", frame: "10", caption: "Last lift" },
  { id: "f11", frame: "11", caption: "Yard, 23:40", selected: true },
  { id: "f12", frame: "12", caption: "Board for tomorrow" },
];

/**
 * The contact sheet: twelve frames at working size with their numbers on the
 * edge and the selects ringed, the way a sheet gets marked up before anything
 * is printed. Where the shelf banks covers in perspective and the rail flings
 * plates past, this one does not move at all — it is for showing the whole
 * roll at once, including the frames that were not chosen, which is a
 * different claim about a body of work.
 */
export function GalleryContactSheet({
  eyebrow = "Fernworks · sheet 14",
  headline = "One day, twelve frames, three keepers.",
  copy = "Printed as shot and in order, selects ringed. The ones that did not make it are the reason the three that did are worth anything.",
  frames = DEFAULT_FRAMES,
  rollLabel = "NORTH BASIN · 04 MAR · HP5 400",
  className,
}: GalleryContactSheetProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(frames.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <div className="mt-10 rounded-4 border border-hairline bg-surface-1 p-4 sm:p-6">
          <p className="mb-4 font-mono text-[10px] tracking-[0.14em] text-ink-3">
            {rollLabel}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {frames.map((frame, index) => (
              <motion.li
                key={frame.id}
                initial={{ opacity: motionSafe ? 0 : 1 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={
                  motionSafe
                    ? {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: index * step,
                      }
                    : { duration: 0 }
                }
                className="min-w-0"
              >
                <figure className="min-w-0">
                  <div
                    className={cn(
                      "relative aspect-4/3 overflow-hidden rounded-1",
                      // The select ring sits outside the frame, like a mark
                      // made on the sheet rather than on the image.
                      frame.selected &&
                        "ring-2 ring-[var(--signal,var(--primary))] ring-offset-2 ring-offset-[var(--bg-1)]",
                    )}
                    style={{
                      background:
                        frame.wash ??
                        "linear-gradient(155deg, var(--bg-2), var(--bg-0))",
                    }}
                  />
                  <figcaption className="mt-1.5 flex min-w-0 items-baseline gap-1.5">
                    <span className="shrink-0 font-mono text-[9px] text-ink-3">
                      {frame.frame}
                    </span>
                    <span className="min-w-0 truncate text-[10px] text-ink-3">
                      {frame.caption}
                    </span>
                  </figcaption>
                </figure>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
