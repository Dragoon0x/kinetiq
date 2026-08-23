"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

import { KineticGallery } from "@/registry/ui/kinetic-gallery";
import { PressureButton } from "@/registry/ui/pressure-button";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WallPlate = {
  id: string;
  /** The caption under the plate — what it is, not what it means. */
  caption: string;
  /** Short label set across the plate face. */
  face: string;
  /** A CSS colour or gradient standing in for the artwork. */
  wash?: string;
};

export type HeroGalleryWallProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  cta?: string;
  onCta?: () => void;
  plates?: WallPlate[];
  className?: string;
};

const DEFAULT_PLATES: WallPlate[] = [
  { id: "g1", face: "Kettle Point", caption: "Series 01 · four plates" },
  { id: "g2", face: "North Basin", caption: "Series 02 · nine plates" },
  { id: "g3", face: "Dry Dock", caption: "Series 03 · two plates" },
  { id: "g4", face: "Relay Floor", caption: "Series 04 · six plates" },
  { id: "g5", face: "Cold Store", caption: "Series 05 · three plates" },
];

/**
 * A visual-first hero for work that has to be seen: the claim sits small
 * above a wall of plates that runs the full bleed, scrollable by hand or by
 * keyboard on the library's own gallery. The copy deliberately yields — on a
 * page selling images, a headline competing with the images is a headline in
 * the way. Swap the wash for real artwork and nothing else changes.
 */
export function HeroGalleryWall({
  eyebrow = "Fernworks · plate archive",
  headline = "Eleven years of the yard, printed.",
  copy = "Large-format plates from working ports, editioned and unretouched.",
  cta = "See the archive",
  onCta,
  plates = DEFAULT_PLATES,
  className,
}: HeroGalleryWallProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(3);

  const rise = (index: number) => ({
    initial: {
      opacity: motionSafe ? 0 : 1,
      y: motionSafe ? distances.shift : 0,
    },
    animate: { opacity: 1, y: 0 },
    transition: motionSafe
      ? { duration: durations.base, ease: easings.enter, delay: index * step }
      : { duration: 0 },
  });

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative overflow-hidden bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 pt-20 sm:pt-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl min-w-0">
            <motion.p {...rise(0)} className="text-label text-ink-3">
              {eyebrow}
            </motion.p>
            <motion.h1
              {...rise(1)}
              id={headingId}
              className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
            >
              {headline}
            </motion.h1>
            <motion.p {...rise(2)} className="mt-4 leading-relaxed text-ink-2">
              {copy}
            </motion.p>
          </div>
          <motion.div {...rise(2)}>
            <PressureButton size="lg" onClick={onCta}>
              {cta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
          </motion.div>
        </div>
      </div>

      <motion.div {...rise(3)} className="mt-12 pb-20 sm:pb-24">
        <KineticGallery
          gap={16}
          align="start"
          aria-label="Plate archive"
          // The wall starts flush under the headline and runs off the right
          // edge: the inset resolves to the content column's own margin at
          // wide sizes and collapses to the page gutter at narrow ones.
          className="pr-6 pl-[max(1.5rem,calc((100%-72rem)/2+1.5rem))]"
        >
          {plates.map((plate) => (
            <figure key={plate.id} className="w-64 shrink-0 sm:w-80">
              <div
                className="flex aspect-4/3 items-end rounded-4 border border-hairline p-4"
                style={{
                  background:
                    plate.wash ??
                    "linear-gradient(150deg, var(--bg-2), var(--bg-1))",
                }}
              >
                <span className="font-mono text-xs tracking-[0.08em] text-ink-2 uppercase">
                  {plate.face}
                </span>
              </div>
              <figcaption className="mt-2 text-xs text-ink-3">
                {plate.caption}
              </figcaption>
            </figure>
          ))}
        </KineticGallery>
      </motion.div>
    </section>
  );
}
