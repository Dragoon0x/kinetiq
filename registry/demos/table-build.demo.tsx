"use client";

import * as React from "react";

import {
  TableBuild,
  type TableBuildColumn,
  type TableBuildRow,
  type TableBuildSort,
} from "@/registry/ui/table-build";

const COLUMNS: TableBuildColumn[] = [
  { key: "vendor", label: "Vendor" },
  { key: "due", label: "Due", numeric: true, format: (v) => `${v} d` },
  {
    key: "amount",
    label: "Amount",
    numeric: true,
    format: (v) => Number(v).toLocaleString("en-US"),
  },
  { key: "status", label: "Status" },
];

/** Open invoices at Coldbrook Bank, in the order the model finds them. */
const ROWS: TableBuildRow[] = [
  { id: "inv-1", vendor: "Basinworks", due: 12, amount: 4200, status: "Open" },
  { id: "inv-2", vendor: "Fernworks", due: 3, amount: 1180, status: "Overdue" },
  {
    id: "inv-3",
    vendor: "Coldbrook Print",
    due: 21,
    amount: 760,
    status: "Open",
  },
  { id: "inv-4", vendor: "Waylight", due: 8, amount: 2950, status: "Paid" },
  { id: "inv-5", vendor: "Fieldline", due: 30, amount: 5400, status: "Open" },
  { id: "inv-6", vendor: "Gaugeworks", due: 15, amount: 1625, status: "Held" },
];

/** The header holds for a beat, then rows land on a seeded jitter. */
const HEADER_HOLD_MS = 600;
const DELAYS = [420, 300, 520, 360, 460, 340];

const button =
  "flex h-8 items-center self-start rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TableBuildDemo() {
  const [arrived, setArrived] = React.useState(0);
  const [generating, setGenerating] = React.useState(false);
  const [sort, setSort] = React.useState<TableBuildSort | null>(null);
  const [landed, setLanded] = React.useState(false);

  // A hidden tab holds the build where it is; rows should not land unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!generating || !visible) return;
    const timer = window.setTimeout(
      () => {
        const next = arrived + 1;
        setArrived(next);
        if (next >= ROWS.length) setGenerating(false);
      },
      arrived === 0 ? HEADER_HOLD_MS : (DELAYS[arrived % DELAYS.length] ?? 400),
    );
    return () => window.clearTimeout(timer);
  }, [generating, visible, arrived]);

  const build = () => {
    setArrived(0);
    setLanded(false);
    setGenerating(true);
  };

  const sortLabel = sort
    ? `· ${COLUMNS.find((column) => column.key === sort.key)?.label ?? sort.key} ${sort.direction}`
    : "· unsorted";
  const line = generating
    ? arrived === 0
      ? ["Header", `${COLUMNS.length} columns`, ""]
      : ["Filling", `row ${arrived} of ${ROWS.length}`, sortLabel]
    : arrived >= ROWS.length
      ? [landed ? "Complete" : "Landing", `${ROWS.length} rows`, sortLabel]
      : ["Idle · press build", "", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TableBuild
        caption="Open invoices at Coldbrook Bank"
        model="Gaugeworks Reasoner"
        columns={COLUMNS}
        rows={ROWS}
        arrived={arrived}
        generating={generating}
        sort={sort}
        onSortChange={setSort}
        onComplete={() => setLanded(true)}
      />

      <button
        type="button"
        onClick={build}
        disabled={generating}
        className={button}
      >
        {arrived > 0 ? "Rebuild" : "Build"}
      </button>

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
