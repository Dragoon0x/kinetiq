"use client";

import * as React from "react";

import { KineticGallery } from "@/registry/ui/kinetic-gallery";
import { cn } from "@/registry/lib/utils";

export type RailPlate = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  /** The plate's footer figure. */
  figure: string;
};

export type GalleryPlateRailProps = {
  eyebrow?: string;
  headline?: string;
  plates?: RailPlate[];
  className?: string;
};

const DEFAULT_PLATES: RailPlate[] = [
  { id: "p1", kicker: "KETTLE POINT", title: "The morning gate", body: "Four crews, nine slots, and the first plan that survived till noon.", figure: "PLATE 01 · NORTH YARD" },
  { id: "p2", kicker: "BASIN SIX", title: "The weir readings", body: "Two sensors disagreed for a week; the ledger held the row open until someone walked out and looked.", figure: "PLATE 02 · FIELD" },
  { id: "p3", kicker: "RELAY FLOOR", title: "Release day, quiet", body: "Forty pipelines rolled between coffee and standup. Nobody watched a progress bar.", figure: "PLATE 03 · SHIP ROOM" },
  { id: "p4", kicker: "THE PRESS", title: "Issue forty-seven", body: "The letter that retired the hydration ladder, set and shipped from one bench.", figure: "PLATE 04 · PRESSROOM" },
  { id: "p5", kicker: "KEEPER FLEET", title: "Rotation night", body: "Two hundred and fourteen services rotated keys in an hour, and the audit read itself.", figure: "PLATE 05 · FLEET" },
];

/**
 * A gallery on the fling instrument — momentum, friction, and snap all come
 * from kinetic-gallery — carrying typographic plates instead of photographs:
 * scenes from the field, set in type, that read in both themes and never
 * arrive as a broken image. Throw the rail; it lands on a plate.
 */
export function GalleryPlateRail({
  eyebrow = "From the floor",
  headline = "Five plates from places the work happens.",
  plates = DEFAULT_PLATES,
  className,
}: GalleryPlateRailProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 pt-20 sm:pt-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h2
          id={headingId}
          className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>
      </div>

      <div className="mx-auto w-full max-w-7xl px-6 py-10 sm:pb-16">
        <KineticGallery aria-label={headline} gap={16} align="start">
          {plates.map((plate) => (
            <article
              key={plate.id}
              className="border-hairline bg-surface-1 rounded-4 flex h-72 w-72 shrink-0 flex-col justify-between border p-6 sm:h-80 sm:w-96 select-none"
            >
              <div>
                <p className="text-label text-ink-3">{plate.kicker}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">
                  {plate.title}
                </h3>
                <p className="text-ink-2 mt-3 text-sm leading-relaxed">
                  {plate.body}
                </p>
              </div>
              <p className="border-hairline text-ink-3 border-t pt-3 font-mono text-[10px] tracking-[0.14em] uppercase">
                {plate.figure}
              </p>
            </article>
          ))}
        </KineticGallery>
      </div>
    </section>
  );
}
