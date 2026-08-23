"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TeamPlace = {
  id: string;
  city: string;
  country: string;
  count: number;
  /** Working hours in UTC, as a pre-formatted string — no clock is read. */
  hours: string;
};

export type TeamWhereWeAreProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  places?: TeamPlace[];
  /** The hours of the day, in UTC, that at least one person is working. */
  coverageLine?: string;
  /** The honest line about the hours nobody covers. */
  gapLine?: string;
  className?: string;
};

const DEFAULT_PLACES: TeamPlace[] = [
  {
    id: "p1",
    city: "Rotterdam",
    country: "Netherlands",
    count: 5,
    hours: "06:00 – 15:00 UTC",
  },
  {
    id: "p2",
    city: "Gdańsk",
    country: "Poland",
    count: 3,
    hours: "06:00 – 15:00 UTC",
  },
  {
    id: "p3",
    city: "Halifax",
    country: "Canada",
    count: 2,
    hours: "12:00 – 21:00 UTC",
  },
  {
    id: "p4",
    city: "Tacoma",
    country: "United States",
    count: 2,
    hours: "15:00 – 24:00 UTC",
  },
];

/**
 * Where the team actually is, and — the useful part — which hours of the day
 * that adds up to. A page of city names is trivia; a page that says the team
 * covers 06:00 to midnight UTC and names the six hours nobody is awake for
 * tells a buyer in a different timezone whether they will be answered. The
 * gap line is the one that makes the rest credible.
 */
export function TeamWhereWeAre({
  eyebrow = "Waylight · where we are",
  headline = "Twelve people, four cities, eighteen hours.",
  copy = "We hire where the yards are. That gives us most of the working day covered without asking anyone to answer at three in the morning.",
  places = DEFAULT_PLACES,
  coverageLine = "06:00 – 24:00 UTC covered by someone on shift",
  gapLine = "00:00 to 06:00 UTC, nobody is working. Urgent pages wake an on-call engineer; everything else waits for Rotterdam.",
  className,
}: TeamWhereWeAreProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(places.length);

  const total = places.reduce((sum, place) => sum + place.count, 0);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
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

        <ul className="mt-10 flex flex-col">
          {places.map((place, index) => (
            <motion.li
              key={place.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-hairline py-4"
            >
              <span className="min-w-0 font-medium text-ink">{place.city}</span>
              <span className="min-w-0 text-sm text-ink-3">
                {place.country}
              </span>
              <span className="ml-auto flex shrink-0 items-baseline gap-1.5 text-sm text-ink-3">
                <Readout value={place.count} />
                <span>{place.count === 1 ? "person" : "people"}</span>
              </span>
              <span className="w-full shrink-0 font-mono text-[11px] tracking-[0.06em] text-ink-2 sm:w-auto sm:pl-6">
                {place.hours}
              </span>
            </motion.li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-hairline pt-6">
          <p className="min-w-0 text-sm text-ink-2">{coverageLine}</p>
          <p className="flex shrink-0 items-baseline gap-1.5 text-sm text-ink-3">
            <Readout value={total} />
            <span>in total</span>
          </p>
        </div>

        {gapLine && (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-3">
            {gapLine}
          </p>
        )}
      </div>
    </section>
  );
}
