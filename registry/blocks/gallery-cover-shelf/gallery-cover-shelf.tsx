"use client";

import * as React from "react";

import { Coverflow } from "@/registry/ui/coverflow";
import { cn } from "@/registry/lib/utils";

export type ShelfCover = {
  id: string;
  kicker: string;
  title: string;
  note: string;
};

export type GalleryCoverShelfProps = {
  eyebrow?: string;
  headline?: string;
  covers?: ShelfCover[];
  className?: string;
};

const DEFAULT_COVERS: ShelfCover[] = [
  { id: "c1", kicker: "№ 43", title: "The weir issue", note: "Two sensors, one truth" },
  { id: "c2", kicker: "№ 44", title: "Kettle Point", note: "The hour given back" },
  { id: "c3", kicker: "№ 45", title: "Rotation night", note: "214 services, quiet" },
  { id: "c4", kicker: "№ 46", title: "The relay floor", note: "Releases between coffees" },
  { id: "c5", kicker: "№ 47", title: "Hydration, retired", note: "Weigh the bowl" },
];

/**
 * A shelf of covers in perspective: the library's coverflow banks each plate
 * in 3D as the shelf turns — drag, wheel, and keys all come with it — and
 * the plates are typeset covers, not images, so the shelf reads in both
 * themes at any density. The active cover sits square; its neighbours wait
 * at an angle, the way a shelf actually looks.
 */
export function GalleryCoverShelf({
  eyebrow = "The press · back issues",
  headline = "Turn the shelf.",
  covers = DEFAULT_COVERS,
  className,
}: GalleryCoverShelfProps) {
  const headingId = React.useId();
  const [index, setIndex] = React.useState(Math.floor(DEFAULT_COVERS.length / 2));
  const active = covers[index];

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative overflow-hidden", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 pt-20 text-center sm:pt-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h2
          id={headingId}
          className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>
      </div>

      {/* The flow centres its covers absolutely — the frame's height IS the
          stage, so it is set explicitly here. */}
      <div className="mx-auto h-80 w-full max-w-5xl px-6 py-4 sm:h-96">
        <Coverflow
          aria-label={headline}
          index={index}
          onIndexChange={setIndex}
          className="h-full"
        >
          {covers.map((cover) => (
            <article
              key={cover.id}
              className="border-hairline bg-surface-1 rounded-4 flex h-64 w-44 flex-col justify-between border p-5 select-none sm:h-72 sm:w-52"
            >
              <p className="text-label text-ink-3">{cover.kicker}</p>
              <div>
                <h3 className="text-lg leading-snug font-semibold tracking-tight text-balance">
                  {cover.title}
                </h3>
                <p className="text-ink-3 mt-2 text-xs">{cover.note}</p>
              </div>
            </article>
          ))}
        </Coverflow>
      </div>

      <p
        role="status"
        className="text-ink-3 pb-16 text-center font-mono text-[11px] tracking-[0.08em] uppercase"
      >
        {active ? `${active.kicker} · ${active.title}` : " "}
      </p>
    </section>
  );
}
