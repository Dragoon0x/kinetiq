"use client";

import * as React from "react";

import { PartialTable } from "@/registry/ui/partial-table";

const COLUMNS = ["Supplier", "Lead", "Cost", "Stock"];

const ROWS = [
  ["Basinworks", "3 days", "$4.20", "In stock"],
  ["Fernworks", "1 day", "$5.10", "Low"],
  ["Coldbrook", "6 days", "$3.85", "In stock"],
  ["Fieldline", "2 days", "$4.60", "Backorder"],
];

const TOTAL = ROWS.reduce(
  (sum, row) => sum + row.reduce((acc, cell) => acc + cell.length, 0),
  0,
);

/** Seeded chunking: one to four characters per tick, with a jittered beat between. */
const chunkAt = (step: number) => 1 + (((step * 2654435761) >>> 0) % 4);
const delayAt = (step: number) => 40 + ((step * 40503) % 7) * 14;

export function PartialTableDemo() {
  const [arrived, setArrived] = React.useState(0);
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [settled, setSettled] = React.useState(false);

  React.useEffect(() => {
    if (!playing || arrived >= TOTAL) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = Math.min(TOTAL, arrived + chunkAt(step));
        setArrived(next);
        setStep(step + 1);
        if (next >= TOTAL) setPlaying(false);
      }, delayAt(step));
    };
    // A hidden tab holds the stream where it is and resumes on return.
    const onVisibility = () => {
      window.clearTimeout(timer);
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, arrived, step]);

  const start = () => {
    setArrived(0);
    setStep(0);
    setSettled(false);
    setPlaying(true);
  };

  // The row being written: the first row whose characters are not all in.
  let rowAt = 0;
  let offset = 0;
  for (let index = 0; index < ROWS.length; index += 1) {
    offset += ROWS[index]?.reduce((acc, cell) => acc + cell.length, 0) ?? 0;
    if (arrived < offset) {
      rowAt = index + 1;
      break;
    }
  }

  const line = playing
    ? ["Writing", `row ${rowAt} of ${ROWS.length}`, "· columns held"]
    : arrived >= TOTAL
      ? [
          "Complete",
          `${ROWS.length} rows`,
          `· columns ${settled ? "settled" : "settling"}`,
        ]
      : ["Waiting · press write", "", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PartialTable
        columns={COLUMNS}
        rows={ROWS}
        arrived={arrived}
        playing={playing}
        caption="Suppliers for the Waylight order"
        model="Gaugeworks Reasoner"
        onSettle={() => setSettled(true)}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={playing}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {arrived > 0 ? "Rewrite" : "Write"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>{" "}
        {line[2]}
      </p>
    </div>
  );
}
