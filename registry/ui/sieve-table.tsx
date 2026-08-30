"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SieveStatus = { id: string; label: string };

export type SieveRow = {
  id: string;
  cells: string[];
  statusId: string;
};

export type SieveTableProps = {
  columns?: string[];
  statuses?: SieveStatus[];
  rows?: SieveRow[];
  allLabel?: string;
  className?: string;
};

const DEFAULT_COLUMNS = ["Task", "Yard", "Due"];

const DEFAULT_STATUSES: SieveStatus[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "In progress" },
  { id: "done", label: "Completed" },
];

const DEFAULT_ROWS: SieveRow[] = [
  {
    id: "s1",
    cells: ["Recut the morning board", "North basin", "06:00"],
    statusId: "todo",
  },
  {
    id: "s2",
    cells: ["Verify crane 2 clearance", "North basin", "07:30"],
    statusId: "doing",
  },
  {
    id: "s3",
    cells: ["Post the handover note", "Kettle point", "14:00"],
    statusId: "todo",
  },
  {
    id: "s4",
    cells: ["Score stockout risk", "Relay floor", "10:00"],
    statusId: "doing",
  },
  {
    id: "s5",
    cells: ["File yesterday's exports", "Kettle point", "09:00"],
    statusId: "done",
  },
];

/**
 * A table sieved by status chips: pick a chip and the rows that survive glide
 * to their new positions while the rest fold away — a layout move, never a
 * reprint, because rows that teleport can't be followed and rows that
 * reprint can't be trusted to be the same rows. Every chip carries its
 * count, derived from the data, so the filter admits how much it hides.
 *
 * Reduced motion: rows swap in place with a fade, no travel.
 */
export function SieveTable({
  columns = DEFAULT_COLUMNS,
  statuses = DEFAULT_STATUSES,
  rows = DEFAULT_ROWS,
  allLabel = "All",
  className,
}: SieveTableProps) {
  const motionSafe = useMotionSafe();
  const [active, setActive] = React.useState<string | null>(null);

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows)
      map.set(row.statusId, (map.get(row.statusId) ?? 0) + 1);
    return map;
  }, [rows]);

  const shown = active ? rows.filter((row) => row.statusId === active) : rows;
  const statusLabel = (id: string) =>
    statuses.find((s) => s.id === id)?.label ?? id;

  return (
    <div className={cn("w-full max-w-md", className)}>
      <div
        role="radiogroup"
        aria-label="Filter by status"
        className="flex flex-wrap gap-1.5"
      >
        <button
          type="button"
          role="radio"
          aria-checked={active === null}
          onClick={() => setActive(null)}
          className={cn(
            "flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
            active === null
              ? "border-primary bg-primary/10 text-ink"
              : "border-hairline text-ink-2 hover:border-hairline-strong",
          )}
        >
          {allLabel}
          <Readout value={rows.length} size="sm" />
        </button>
        {statuses.map((status) => (
          <button
            key={status.id}
            type="button"
            role="radio"
            aria-checked={active === status.id}
            onClick={() => setActive(status.id)}
            className={cn(
              "flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              active === status.id
                ? "border-primary bg-primary/10 text-ink"
                : "border-hairline text-ink-2 hover:border-hairline-strong",
            )}
          >
            {status.label}
            <Readout value={counts.get(status.id) ?? 0} size="sm" />
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-3 border border-hairline">
        <div
          className="grid border-b border-hairline px-3 py-2 text-label text-ink-3"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, 1fr) 6rem`,
          }}
        >
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
          <span>Status</span>
        </div>
        <ul aria-live="polite">
          <AnimatePresence initial={false}>
            {shown.map((row) => (
              <motion.li
                key={row.id}
                layout={motionSafe}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: durations.fast } }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        opacity: { duration: durations.base },
                      }
                    : { duration: 0 }
                }
                className="grid border-b border-hairline px-3 py-2 text-sm last:border-b-0"
                style={{
                  gridTemplateColumns: `repeat(${columns.length}, 1fr) 6rem`,
                }}
              >
                {row.cells.map((cell, index) => (
                  <span
                    key={index}
                    className={cn(
                      "min-w-0 truncate pr-2",
                      index === 0 ? "text-ink" : "text-ink-2",
                    )}
                  >
                    {cell}
                  </span>
                ))}
                <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                  {statusLabel(row.statusId)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {shown.length === 0 && (
          <p className="px-3 py-4 text-sm text-ink-3">
            Nothing carries that status.
          </p>
        )}
      </div>
    </div>
  );
}
