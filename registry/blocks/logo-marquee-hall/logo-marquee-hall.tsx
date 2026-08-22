"use client";

import * as React from "react";

import { TickerTape } from "@/registry/ui/ticker-tape";
import { cn } from "@/registry/lib/utils";

export type HallMark = {
  id: string;
  /** The wordmark, rendered typographically. */
  name: string;
  /** Optional style accent: mono renders in the mono stack. */
  mono?: boolean;
};

export type LogoMarqueeHallProps = {
  claim?: string;
  /** Split across the two rows; row two runs the opposite way. */
  marks?: HallMark[];
  className?: string;
};

const DEFAULT_MARKS: HallMark[] = [
  { id: "fieldline", name: "Fieldline" },
  { id: "relay", name: "RELAY", mono: true },
  { id: "basinworks", name: "Basinworks" },
  { id: "ovenword", name: "Ovenword" },
  { id: "keeper", name: "KEEPER", mono: true },
  { id: "switchyard", name: "Switchyard" },
  { id: "ferrite", name: "FERRITE", mono: true },
  { id: "waylight", name: "Waylight" },
];

function MarkRow({ marks }: { marks: HallMark[] }) {
  return (
    <>
      {marks.map((mark) => (
        <span
          key={mark.id}
          className={cn(
            "text-ink-3 px-6 text-xl font-semibold tracking-tight whitespace-nowrap opacity-70",
            mark.mono && "font-mono text-lg tracking-[0.14em]",
          )}
        >
          {mark.name}
        </span>
      ))}
    </>
  );
}

/**
 * A hall of marks on two counter-running tapes — the library's own ticker,
 * with its friction and hover drag, carrying typographic wordmarks instead of
 * image files, so the row reads sharply in both themes and at any density.
 * The rows run against each other slowly enough to scan; under reduced
 * motion both park as a plain double rail.
 */
export function LogoMarqueeHall({
  claim = "Runs the morning shift at teams like",
  marks = DEFAULT_MARKS,
  className,
}: LogoMarqueeHallProps) {
  const half = Math.ceil(marks.length / 2);
  const rowOne = marks.slice(0, half);
  const rowTwo = marks.slice(half);

  return (
    <section
      aria-label={claim}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-14 sm:py-16">
        <p className="text-label text-ink-3 text-center">{claim}</p>
      </div>
      <div aria-hidden className="border-hairline flex flex-col gap-6 border-y py-8 select-none">
        <TickerTape speed={28} gap={8}>
          <MarkRow marks={rowOne} />
        </TickerTape>
        <TickerTape speed={22} direction="right" gap={8}>
          <MarkRow marks={rowTwo.length > 0 ? rowTwo : rowOne} />
        </TickerTape>
      </div>
      {/* The marks, readable by everyone. */}
      <p className="sr-only">{marks.map((m) => m.name).join(", ")}</p>
    </section>
  );
}
