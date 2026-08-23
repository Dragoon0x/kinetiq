"use client";

import * as React from "react";

import { Check } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StepperNumber } from "@/registry/ui/stepper-number";
import { cn } from "@/registry/lib/utils";

export type SeatBreak = {
  /** Seats at and above this count take this rate. */
  from: number;
  perSeat: number;
};

export type PricingSeatCounterProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  min?: number;
  max?: number;
  defaultSeats?: number;
  /** Ascending breaks; the applicable rate is the last one at or below the count. */
  breaks?: SeatBreak[];
  included?: string[];
  cta?: string;
  onCta?: (seats: number, total: number) => void;
  className?: string;
};

const DEFAULT_BREAKS: SeatBreak[] = [
  { from: 1, perSeat: 24 },
  { from: 10, perSeat: 19 },
  { from: 25, perSeat: 15 },
];

const DEFAULT_INCLUDED = ["Every instrument", "Unlimited benches", "Full history"];

/**
 * Seat pricing with the arithmetic on the counter: step the seats and both
 * numbers roll — the applicable rate, which drops at printed breaks, and the
 * total it produces. Discrete where the usage dial is continuous: for teams
 * who buy in people, not units, and want to see exactly where the next
 * seat gets cheaper.
 */
export function PricingSeatCounter({
  eyebrow = "Fieldline · pricing",
  headline = "Count the crew. Watch the rate.",
  copy = "Rates drop at ten and twenty-five seats — the breaks are printed, and the counter shows which one you are on.",
  min = 1,
  max = 60,
  defaultSeats = 8,
  breaks = DEFAULT_BREAKS,
  included = DEFAULT_INCLUDED,
  cta = "Start with this crew",
  onCta,
  className,
}: PricingSeatCounterProps) {
  const headingId = React.useId();
  const [seats, setSeats] = React.useState(defaultSeats);

  const rate =
    [...breaks].reverse().find((b) => seats >= b.from)?.perSeat ??
    breaks[0]?.perSeat ??
    0;
  const total = seats * rate;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <div className="border-hairline bg-surface-1 rounded-4 mt-10 border p-6 shadow-raised sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-label text-ink-3">Seats</p>
              <div className="mt-2">
                <StepperNumber
                  label="Seats"
                  value={seats}
                  onValueChange={setSeats}
                  min={min}
                  max={max}
                />
              </div>
            </div>
            <div className="text-right">
              <p className="text-label text-ink-3">Monthly total</p>
              <p className="mt-1 flex items-baseline justify-end gap-1">
                <span className="text-ink-3 text-lg">$</span>
                <Readout value={total} size="lg" />
              </p>
              <p className="text-ink-3 mt-1 flex items-baseline justify-end gap-1 text-xs">
                at $<Readout value={rate} size="sm" /> / seat
              </p>
            </div>
          </div>

          {/* The breaks, printed. */}
          <dl className="border-hairline mt-6 grid gap-3 border-t pt-5 sm:grid-cols-3">
            {breaks.map((b) => {
              const active = rate === b.perSeat && seats >= b.from;
              return (
                <div
                  key={b.from}
                  className={cn(
                    "border-hairline rounded-2 border px-3 py-2.5",
                    active ? "bg-surface-0" : "opacity-50",
                  )}
                >
                  <dt className="text-label text-ink-3">
                    {b.from === 1 ? "1+" : `${b.from}+`} seats
                  </dt>
                  <dd className="text-ink mt-1 font-mono text-sm">
                    ${b.perSeat} <span className="text-ink-3">/ seat</span>
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
              {included.map((item) => (
                <li key={item} className="text-ink-2 flex items-center gap-1.5 text-sm">
                  <Check
                    className="text-[var(--success,var(--primary))] size-4"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
            <PressureButton onClick={() => onCta?.(seats, total)}>
              {cta}
            </PressureButton>
          </div>
        </div>
      </div>
    </section>
  );
}
