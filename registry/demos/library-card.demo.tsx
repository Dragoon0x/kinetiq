"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LibraryCard } from "@/registry/ui/library-card";

export const tweaks = defineTweaks({
  rows: {
    kind: "range",
    label: "Rows",
    default: 6,
    min: 4,
    max: 10,
    step: 1,
  },
  ink: {
    kind: "choice",
    label: "Ink",
    default: "violet",
    options: ["violet", "red", "black"],
    names: { violet: "Violet", red: "Red", black: "Black" },
  },
  crooked: {
    kind: "range",
    label: "Crooked",
    default: 3,
    min: 0,
    max: 6,
    step: 0.5,
    unit: "°",
  },
});

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
/** The first loan was due on 2 September 2026; each one after, 21 days on. */
const FIRST_DUE = Date.UTC(2026, 8, 2);
const LOAN_MS = 21 * 86_400_000;

const dueOn = (loan: number) => {
  const d = new Date(FIRST_DUE + loan * LOAN_MS);
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

/**
 * A book on loan from the Coldbrook Free Library: two borrowers have had it
 * already, and the stamp is set for the next.
 */
export function LibraryCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [dates, setDates] = React.useState<string[]>(() => [
    dueOn(0),
    dueOn(1),
  ]);
  const rows = values.rows ?? tweaks.rows.default;
  const next = dueOn(dates.length);
  const shown = Math.min(dates.length, rows);

  const card = (
    <LibraryCard
      title="Tide Tables of the Basin Coast"
      author="Coldbrook Survey Office"
      callNumber="551.46 BAS"
      library="Coldbrook Free Library"
      due={next}
      value={dates}
      onValueChange={setDates}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return card;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex justify-center">{card}</div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {shown >= rows ? (
            <>
              <span className="text-signal">card full</span> · {shown} of {rows}{" "}
              stamped
            </>
          ) : (
            <>
              <span className="text-signal">
                {shown} of {rows} stamped
              </span>{" "}
              · next due {next.toLowerCase()}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setDates([])}
          disabled={dates.length === 0}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          New card
        </button>
      </div>
    </div>
  );
}
