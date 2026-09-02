"use client";

import * as React from "react";

import { TickerTape } from "@/registry/ui/ticker-tape";
import { cn } from "@/registry/lib/utils";

export type TapeQuote = {
  id: string;
  quote: string;
  name: string;
  role: string;
  company: string;
  figure: string;
};

export type TestimonialTapeWallProps = {
  eyebrow?: string;
  headline?: string;
  deck?: string;
  /** Two card sets, one per row — row two never repeats row one. */
  rows?: [TapeQuote[], TapeQuote[]];
  className?: string;
};

/** A tighter taper than `TickerTape`'s own — the wall wants its rows to
 * dissolve a little earlier into the section's edge. */
const EDGE_MASK =
  "linear-gradient(to right, transparent, black 8%, black 92%, transparent)";

/** Fixed plate-tint cycle — four signal tokens, never a raw hex, never a
 * roll. Cycled by a running index so the two rows never land on the same
 * tint at the same position. */
const PLATE_TINTS = [
  "var(--primary)",
  "var(--success)",
  "var(--signal)",
  "var(--warn)",
] as const;

const tintFor = (index: number): string =>
  PLATE_TINTS[index % PLATE_TINTS.length] ?? "var(--primary)";

const ROW_ONE_QUOTES = [
  {
    id: "gw-r1-01",
    quote:
      "We stopped arguing about the reading and started arguing about the fix. That is the whole upgrade.",
    name: "R. Castellan",
    role: "Field supervisor",
    company: "Marrow Utilities",
    figure: "−34 min / shift",
  },
  {
    id: "gw-r1-02",
    quote:
      "Three trucks used to roll on one bad number. Now one truck rolls on a number nobody doubts.",
    name: "T. Vasquez",
    role: "Dispatch lead",
    company: "Coldharbor Gas",
    figure: "−2 trucks / call",
  },
  {
    id: "gw-r1-03",
    quote:
      "The calibration argument that ran for six years ended in a Tuesday stand-up.",
    name: "M. Enright",
    role: "Instrumentation lead",
    company: "Baffin Water Co.",
    figure: "±0.3% drift",
  },
  {
    id: "gw-r1-04",
    quote:
      "New hires read the gauge correctly on day one. That used to take a season.",
    name: "K. Odusanya",
    role: "Training coordinator",
    company: "Halyard Pipeline",
    figure: "1 shift to fluent",
  },
  {
    id: "gw-r1-05",
    quote:
      "The meter finally agrees with itself across three trucks. Nobody believed that was possible.",
    name: "D. Farrow",
    role: "Fleet operations",
    company: "Greywick Energy",
    figure: "0 mismatched reads",
  },
  {
    id: "gw-r1-06",
    quote:
      "We used to log the reading, then log our doubt about the reading. One of those is gone now.",
    name: "S. Okafor",
    role: "Site technician",
    company: "Loamfield Ag",
    figure: "−19% re-checks",
  },
  {
    id: "gw-r1-07",
    quote:
      "Handover notes are numbers now, not vibes. The night shift stopped guessing what the day shift meant.",
    name: "P. Byrne",
    role: "Night crew chief",
    company: "Cinder Grid",
    figure: "−41 min handover",
  },
  {
    id: "gw-r1-08",
    quote:
      "The warranty claim that used to take a month of back-and-forth now closes on the first call.",
    name: "A. Milbank",
    role: "Claims reviewer",
    company: "Sable Compliance",
    figure: "1 call to close",
  },
] as const;

const ROW_TWO_QUOTES = [
  {
    id: "gw-r2-01",
    quote:
      "I stopped carrying a second meter as a backup. The first one finally earned that.",
    name: "L. Prentiss",
    role: "Line technician",
    company: "Marrow Utilities",
    figure: "1 meter, not 2",
  },
  {
    id: "gw-r2-02",
    quote:
      "The audit that used to take a week of spreadsheets now takes an afternoon.",
    name: "J. Achebe",
    role: "Compliance officer",
    company: "Coldharbor Gas",
    figure: "−4 days / audit",
  },
  {
    id: "gw-r2-03",
    quote:
      "Our worst reader and our best reader now log the same number. That is the entire point of a gauge.",
    name: "N. Sorrentino",
    role: "Operations manager",
    company: "Baffin Water Co.",
    figure: "0.1 reader variance",
  },
  {
    id: "gw-r2-04",
    quote:
      "We used to schedule a truck on a hunch. Now the hunch has to beat the number first.",
    name: "E. Wardlow",
    role: "Route planner",
    company: "Halyard Pipeline",
    figure: "−27% unneeded rolls",
  },
  {
    id: "gw-r2-05",
    quote:
      "The regulator asked for six months of readings and got them in one export, not one week of digging.",
    name: "C. Duvall",
    role: "Regulatory liaison",
    company: "Greywick Energy",
    figure: "1 export, not 1 week",
  },
  {
    id: "gw-r2-06",
    quote: "Every meter on the yard finally tells the same story at shift change.",
    name: "H. Isikawa",
    role: "Yard foreman",
    company: "Loamfield Ag",
    figure: "6 meters, 1 story",
  },
  {
    id: "gw-r2-07",
    quote:
      "The false alarm rate dropped enough that people actually walk toward the alert now.",
    name: "B. Okonjo",
    role: "Control room lead",
    company: "Cinder Grid",
    figure: "−52% false alarms",
  },
  {
    id: "gw-r2-08",
    quote: "We closed the gap between what the field saw and what the office believed.",
    name: "V. Marchetti",
    role: "Systems analyst",
    company: "Sable Compliance",
    figure: "0 field/office gap",
  },
] as const;

const DEFAULT_ROWS: [TapeQuote[], TapeQuote[]] = [
  [...ROW_ONE_QUOTES],
  [...ROW_TWO_QUOTES],
];

/** First one or two initials from a full name — never more, never a
 * generated avatar. Guarded for `noUncheckedIndexedAccess`. */
function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Deterministic initials plate. The tint is a `color-mix()` off a fixed
 * cycled token, and it steps up a shade on `group-hover` — since motion
 * cannot interpolate `color-mix()`/`var()`, that step runs on a plain CSS
 * transition, never a motion value. */
function InitialsPlate({ name, tint }: { name: string; tint: string }) {
  return (
    <span
      aria-hidden
      style={{ "--tint": tint } as React.CSSProperties}
      className={cn(
        "border-hairline rounded-2 flex size-9 shrink-0 items-center justify-center border font-mono text-xs tracking-[0.08em]",
        "transition-colors duration-300",
        "bg-[color-mix(in_oklab,var(--tint)_14%,var(--color-surface-1))]",
        "text-[color-mix(in_oklab,var(--tint)_78%,var(--ink))]",
        "group-hover:bg-[color-mix(in_oklab,var(--tint)_28%,var(--color-surface-1))]",
      )}
    >
      {initialsFor(name)}
    </span>
  );
}

function TapeCard({ item, tint }: { item: TapeQuote; tint: string }) {
  return (
    <figure className="group border-hairline bg-surface-1 rounded-3 flex w-80 shrink-0 flex-col justify-between gap-5 border p-5">
      <blockquote className="text-ink line-clamp-3 text-sm leading-relaxed">
        “{item.quote}”
      </blockquote>
      <figcaption className="border-hairline flex items-center justify-between gap-3 border-t pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <InitialsPlate name={item.name} tint={tint} />
          <div className="min-w-0">
            <p className="text-ink truncate text-sm font-medium">{item.name}</p>
            <p className="text-ink-3 mt-0.5 truncate text-xs">
              {item.role} at {item.company}
            </p>
          </div>
        </div>
        <p className="text-ink-2 shrink-0 font-mono text-[10px] tracking-[0.06em] whitespace-nowrap uppercase">
          {item.figure}
        </p>
      </figcaption>
    </figure>
  );
}

function TapeRow({ items, tintOffset }: { items: TapeQuote[]; tintOffset: number }) {
  return (
    <>
      {items.map((item, index) => (
        <TapeCard key={item.id} item={item} tint={tintFor(tintOffset + index)} />
      ))}
    </>
  );
}

/**
 * Two rows of testimonial cards riding the library's own ticker in opposite
 * directions and slightly out of phase — the friction, the hover drag, and
 * the fling all belong to `TickerTape`; this block only ever feeds it cards
 * instead of wordmarks. Row two carries a different eight-card set than row
 * one, so the wall never rhymes with itself as it scrolls past. Where the
 * dispatch wall proves a pattern with one cascade that settles, this wall
 * proves it with volume that keeps arriving, shift after shift, never
 * settling at all.
 * Reduced motion: `TickerTape` parks each row into a static wrapped grid on
 * its own; this section adds no motion of its own.
 */
export function TestimonialTapeWall({
  eyebrow = "Gaugeworks · from the field",
  headline = "The proof keeps arriving, shift after shift.",
  deck = "One reading does not change a route. Eight hundred of them, all agreeing, do. This is what the crews keep saying once the meter stops guessing.",
  rows = DEFAULT_ROWS,
  className,
}: TestimonialTapeWallProps) {
  const headingId = React.useId();
  const [rowOne, rowTwo] = rows;
  const allQuotes = [...rowOne, ...rowTwo];

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3 text-center">{eyebrow}</p>
        <h2
          id={headingId}
          className="text-ink mx-auto mt-3 max-w-3xl text-center text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>
        <p className="text-ink-2 mx-auto mt-4 max-w-2xl text-center leading-relaxed">
          {deck}
        </p>
      </div>

      <div className="flex flex-col gap-4 pb-20 select-none sm:pb-24">
        <div
          aria-hidden
          style={{ maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}
        >
          <TickerTape speed={46} direction="left" gap={16} pauseOnHover>
            <TapeRow items={rowOne} tintOffset={0} />
          </TickerTape>
        </div>
        <div
          aria-hidden
          style={{ maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}
        >
          <TickerTape speed={38} direction="right" gap={16} pauseOnHover>
            <TapeRow items={rowTwo} tintOffset={rowOne.length} />
          </TickerTape>
        </div>
      </div>

      {/* The quotes, readable by everyone. */}
      <ul className="sr-only">
        {allQuotes.map((item) => (
          <li key={item.id}>
            {item.quote} — {item.name}, {item.role} at {item.company} (
            {item.figure})
          </li>
        ))}
      </ul>
    </section>
  );
}
