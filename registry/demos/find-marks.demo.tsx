"use client";

import * as React from "react";

import { FindMarks } from "@/registry/ui/find-marks";

const PASSAGE = `Basinworks measures flow at the weir, not at the pump. A pump reports what it was asked to do; the weir reports what the channel actually carried. Where the two disagree the difference is a leak, and the leak is what the report is for.

Each station samples flow every thirty seconds and keeps a rolling median of the last five minutes. Short spikes are held back, because a gust of flow through a half-open valve is not a reading. When the median settles the station writes one row: the flow in litres per second, the head above the sill, and the temperature of the water at the sill.

Nightly, the site totals its rows and compares them against the flow allocated to it. A station that runs over allocation twice in a week is flagged for a visit; a station that reports no flow at all is flagged the same night, because a silent weir is usually a blocked one.`;

export function FindMarksDemo() {
  const [match, setMatch] = React.useState({ index: 0, total: 0 });

  // Bails out when nothing changed, so reporting the match up cannot loop.
  const onMatchChange = React.useCallback((index: number, total: number) => {
    setMatch((prev) =>
      prev.index === index && prev.total === total ? prev : { index, total },
    );
  }, []);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <FindMarks
        text={PASSAGE}
        defaultQuery="flow"
        onMatchChange={onMatchChange}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {match.total === 0 ? (
          "No matches"
        ) : (
          <>
            Match{" "}
            <span className="text-signal tabular-nums">{match.index + 1}</span>{" "}
            of <span className="tabular-nums">{match.total}</span>
          </>
        )}
      </p>
    </div>
  );
}
