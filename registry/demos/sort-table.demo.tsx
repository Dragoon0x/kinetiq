"use client";

import * as React from "react";

import {
  SortTable,
  type SortColumn,
  type SortRow,
  type SortState,
} from "@/registry/ui/sort-table";

const COLUMNS: SortColumn[] = [
  { id: "name", label: "Property" },
  { id: "district", label: "District" },
  { id: "beds", label: "Beds", numeric: true },
  { id: "rent", label: "Rent", numeric: true },
];

const ROWS: SortRow[] = [
  {
    id: "alder",
    name: "Alder Court",
    district: "Basin North",
    beds: 2,
    rent: 2150,
  },
  { id: "kiln", name: "Kiln Row", district: "Old Wharf", beds: 1, rent: 1725 },
  {
    id: "marlow",
    name: "Marlow Flats",
    district: "Basin North",
    beds: 3,
    rent: 2840,
  },
  {
    id: "pier",
    name: "Pier Nine",
    district: "Harbourgate",
    beds: 2,
    rent: 2260,
  },
  { id: "salt", name: "Salt Yard", district: "Old Wharf", beds: 4, rent: 3310 },
  {
    id: "verge",
    name: "Verge House",
    district: "Harbourgate",
    beds: 1,
    rent: 1580,
  },
];

const INITIAL: SortState = { id: "rent", dir: "desc" };

const cell = (value: string | number, column: SortColumn) =>
  column.id === "rent"
    ? `$${Number(value).toLocaleString("en-US")}`
    : String(value);

export function SortTableDemo() {
  const [sort, setSort] = React.useState<SortState | null>(INITIAL);
  const column = COLUMNS.find((entry) => entry.id === sort?.id);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <SortTable
        columns={COLUMNS}
        rows={ROWS}
        defaultSort={INITIAL}
        onSortChange={setSort}
        format={cell}
        label="Basinworks properties"
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {sort && column ? (
          <>
            Sorted by{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {column.label}
            </span>{" "}
            · {sort.dir === "asc" ? "ascending" : "descending"}
          </>
        ) : (
          "Source order"
        )}
      </p>
    </div>
  );
}
