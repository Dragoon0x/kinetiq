"use client";

import * as React from "react";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { PaginationRail } from "@/registry/ui/pagination-rail";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FolioColumn = {
  id: string;
  label: string;
  /** Hidden until re-picked; every column starts shown unless this is true. */
  defaultHidden?: boolean;
};

export type FolioRow = {
  id: string;
  /** Values by column id, pre-formatted. */
  cells: Record<string, string>;
};

export type FolioTableProps = {
  columns?: FolioColumn[];
  rows?: FolioRow[];
  /** Rows per page. @default 5 */
  pageSize?: number;
  label?: string;
  className?: string;
};

const DEFAULT_COLUMNS: FolioColumn[] = [
  { id: "yard", label: "Yard" },
  { id: "board", label: "Board" },
  { id: "cut", label: "Cut at" },
  { id: "crews", label: "Crews", defaultHidden: true },
  { id: "state", label: "State" },
];

const DEFAULT_ROWS: FolioRow[] = Array.from({ length: 14 }, (_, i) => ({
  id: `f${i + 1}`,
  cells: {
    yard: ["North basin", "Kettle point", "Relay floor", "Dry dock 2"][i % 4]!,
    board: `r${14 - i}`,
    cut: `0${5 + (i % 3)}:${String(10 + i * 3).slice(-2)}`,
    crews: String(2 + (i % 3)),
    state: ["signed", "posted", "draft"][i % 3]!,
  },
}));

/**
 * The paged edition of the working grid: a folio turns pages instead of
 * scrolling ten thousand rows, columns can be re-picked from a rail of
 * chips, and the page turn is a directional slide so going back reads as
 * going back. Paging belongs to pagination-rail — this table seats it.
 * For the virtualized firehose, the ledger remains the instrument; a folio
 * is for datasets you leaf through, not pour.
 *
 * Reduced motion: pages swap in place.
 */
export function FolioTable({
  columns = DEFAULT_COLUMNS,
  rows = DEFAULT_ROWS,
  pageSize = 5,
  label = "Boards, paged",
  className,
}: FolioTableProps) {
  const motionSafe = useMotionSafe();
  const [page, setPage] = React.useState(1);
  const [direction, setDirection] = React.useState(1);
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)),
  );

  const shownColumns = columns.filter((column) => !hidden.has(column.id));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(page, pageCount);
  const pageRows = rows.slice((clamped - 1) * pageSize, clamped * pageSize);

  const turn = (next: number) => {
    setDirection(next > clamped ? 1 : -1);
    setPage(next);
  };

  const toggleColumn = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (shownColumns.length > 1) next.add(id);
      return next;
    });
  };

  return (
    <div className={cn("w-full max-w-md", className)}>
      {/* Column picker: chips, ticked while shown. */}
      <div role="group" aria-label="Columns" className="flex flex-wrap gap-1.5">
        {columns.map((column) => {
          const shown = !hidden.has(column.id);
          return (
            <button
              key={column.id}
              type="button"
              aria-pressed={shown}
              onClick={() => toggleColumn(column.id)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                shown
                  ? "border-hairline-strong text-ink"
                  : "border-hairline text-ink-3 hover:text-ink-2",
              )}
            >
              {shown && <Check aria-hidden className="size-3" />}
              {column.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 overflow-hidden rounded-3 border border-hairline">
        <div
          className="grid border-b border-hairline px-3 py-2 text-label text-ink-3"
          style={{
            gridTemplateColumns: `repeat(${shownColumns.length}, 1fr)`,
          }}
        >
          {shownColumns.map((column) => (
            <span key={column.id}>{column.label}</span>
          ))}
        </div>

        <div className="relative overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.ul
              key={clamped}
              aria-label={`${label}, page ${clamped} of ${pageCount}`}
              initial={{
                x: motionSafe ? direction * 32 : 0,
                opacity: motionSafe ? 0.4 : 0,
              }}
              animate={{ x: 0, opacity: 1 }}
              exit={{
                x: motionSafe ? -direction * 32 : 0,
                opacity: 0,
                transition: { duration: durations.fast },
              }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
            >
              {pageRows.map((row) => (
                <li
                  key={row.id}
                  className="grid border-b border-hairline px-3 py-2 text-sm last:border-b-0"
                  style={{
                    gridTemplateColumns: `repeat(${shownColumns.length}, 1fr)`,
                  }}
                >
                  {shownColumns.map((column, index) => (
                    <span
                      key={column.id}
                      className={cn(
                        "min-w-0 truncate pr-2",
                        index === 0 ? "font-medium text-ink" : "text-ink-2",
                      )}
                    >
                      {row.cells[column.id] ?? "—"}
                    </span>
                  ))}
                </li>
              ))}
            </motion.ul>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-3 flex justify-center">
        <PaginationRail
          total={pageCount}
          page={clamped}
          onPageChange={turn}
          label={`${label} pages`}
        />
      </div>
    </div>
  );
}
