"use client";

import * as React from "react";

import { Ledger, type LedgerColumn } from "@/registry/ui/ledger";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type OpsRun = {
  id: string;
  bench: string;
  recipe: string;
  crew: string;
  minutes: number;
  state: "done" | "live" | "queued";
};

export type DatatableOpsDeskProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  runs?: OpsRun[];
  onArchive?: (ids: string[]) => void;
  className?: string;
};

/** Deterministic roster — same rows every render, SSR included. */
const DEFAULT_RUNS: OpsRun[] = Array.from({ length: 48 }, (_, i) => {
  const benches = ["bench-01", "bench-02", "bench-04", "bench-07"];
  const recipes = ["Torque calibration", "Hull cure pass", "Rig load test", "Coating audit", "Frame survey"];
  const crews = ["Crew A", "Crew B", "Crew C"];
  const states: OpsRun["state"][] = ["done", "done", "done", "live", "queued"];
  return {
    id: `run-${String(220 - i)}`,
    bench: benches[i % benches.length]!,
    recipe: recipes[i % recipes.length]!,
    crew: crews[i % crews.length]!,
    minutes: 18 + ((i * 7) % 63),
    state: states[i % states.length]!,
  };
});

const COLUMNS: LedgerColumn<OpsRun>[] = [
  { key: "id", header: "Run", width: 90, sortable: true },
  { key: "bench", header: "Bench", width: 100, sortable: true },
  { key: "recipe", header: "Recipe", width: "1fr", sortable: true },
  { key: "crew", header: "Crew", width: 90 },
  { key: "minutes", header: "Min", width: 70, align: "right", sortable: true },
  {
    key: "state",
    header: "State",
    width: 110,
    cell: (row) => (
      <StatusSeal
        variant={row.state === "done" ? "success" : "info"}
        live={row.state === "live"}
        className="text-[10px]"
      >
        {row.state}
      </StatusSeal>
    ),
  },
];

/**
 * A working grid in a marketing section, honestly: the library's own
 * virtualized ledger — real sorting, whole-dataset selection — dressed with
 * an ops toolbar whose counts carry-roll as the selection changes. The point
 * of the section is that the table is not a mockup; it is the instrument the
 * page is selling, doing its job on the page.
 */
export function DatatableOpsDesk({
  eyebrow = "Fieldline · the run ledger",
  headline = "The grid is the product. Sort it.",
  copy = "Forty-eight runs, virtualized, sortable, selectable to the whole set — the same ledger instrument your app would ship.",
  runs = DEFAULT_RUNS,
  onArchive,
  className,
}: DatatableOpsDeskProps) {
  const headingId = React.useId();
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <div className="border-hairline bg-surface-1 rounded-4 mt-10 overflow-hidden border shadow-raised">
          <div className="border-hairline flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <p className="flex items-baseline gap-2">
              <Readout value={selected.size} size="sm" />
              <span className="text-label text-ink-3">
                OF {runs.length} SELECTED
              </span>
            </p>
            <PressureButton
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => {
                onArchive?.([...selected]);
                setSelected(new Set());
              }}
            >
              Archive selected
            </PressureButton>
          </div>
          <div className="p-2">
            <Ledger
              columns={COLUMNS}
              rows={runs}
              rowId={(row) => row.id}
              height={360}
              selectable
              selected={selected}
              onSelectedChange={setSelected}
              defaultSort={{ key: "id", direction: "desc" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
