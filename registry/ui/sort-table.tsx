"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SortColumn = {
  id: string;
  label: string;
  /** Sorts numerically and right-aligns the column in a mono, tabular face. */
  numeric?: boolean;
};

export type SortRow = Record<string, string | number>;

export type SortState = { id: string; dir: "asc" | "desc" };

export type SortTableProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Columns, left to right. */
  columns: SortColumn[];
  /** Rows, each carrying a stable key field. */
  rows: SortRow[];
  /** Controlled sort; null is the source order. */
  sort?: SortState | null;
  /** Initial sort for uncontrolled usage. */
  defaultSort?: SortState;
  /** Fires with the new sort, or null when a third click clears it. */
  onSortChange?: (sort: SortState | null) => void;
  /** Formats a cell. Numbers should come through here, not raw. */
  format?: (value: string | number, column: SortColumn) => React.ReactNode;
  /** Row field holding the stable key the FLIP animation tracks. @default "id" */
  rowKey?: string;
  /** Table caption; read by assistive technology, hidden on screen. */
  label?: string;
  className?: string;
};

const defaultFormat = (value: string | number): React.ReactNode => value;

const compare = (
  a: SortRow,
  b: SortRow,
  column: SortColumn | undefined,
  dir: "asc" | "desc",
): number => {
  const sign = dir === "asc" ? 1 : -1;
  const left = a[column?.id ?? ""];
  const right = b[column?.id ?? ""];
  if (column?.numeric) {
    return ((Number(left) || 0) - (Number(right) || 0)) * sign;
  }
  // An explicit locale keeps the server's order and the client's identical.
  return String(left ?? "").localeCompare(String(right ?? ""), "en") * sign;
};

/**
 * A table whose rows trade places. Sorting does not re-paint the body in a new
 * order — each row keeps its key and FLIPs to its new seat on `glide`, the
 * spring for layout, so a reorder is something you can follow with your eye
 * rather than a blink you have to re-read. The header's arrow flips on `snap`
 * for one crisp overshoot, and the sorted column tints so the axis of the
 * order is never in doubt.
 *
 * Headers are real buttons inside `th` cells carrying `aria-sort`: the first
 * press sorts ascending, the second reverses, the third clears back to the
 * source order, and each change is announced. Under reduced motion the rows
 * simply swap — the order still changes, because the order is the information.
 */
export function SortTable({
  ref,
  columns,
  rows,
  sort,
  defaultSort,
  onSortChange,
  format = defaultFormat,
  rowKey = "id",
  label,
  className,
}: SortTableProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolled, setUncontrolled] = React.useState<SortState | null>(
    defaultSort ?? null,
  );
  /** Nothing is announced until the reader has actually changed the sort. */
  const [touched, setTouched] = React.useState(false);
  const isControlled = sort !== undefined;
  const current = isControlled ? sort : uncontrolled;

  const sortedColumn = columns.find((column) => column.id === current?.id);

  const sorted = React.useMemo(() => {
    if (!current || !sortedColumn) return rows;
    return [...rows].sort((a, b) => compare(a, b, sortedColumn, current.dir));
  }, [rows, current, sortedColumn]);

  /** asc → desc → cleared. Three presses return the table to source order. */
  const cycle = (columnId: string) => {
    const next: SortState | null =
      current?.id !== columnId
        ? { id: columnId, dir: "asc" }
        : current.dir === "asc"
          ? { id: columnId, dir: "desc" }
          : null;
    if (!isControlled) setUncontrolled(next);
    setTouched(true);
    onSortChange?.(next);
  };

  const announcement = current
    ? `Sorted by ${sortedColumn?.label ?? current.id}, ${
        current.dir === "asc" ? "ascending" : "descending"
      }`
    : "Sort cleared";

  const rowTransition = motionSafe ? springs.glide : { duration: 0 };

  return (
    // Four columns do not fit a phone; the table scrolls sideways inside its
    // own box rather than pushing the page, and the FLIP rows ride along.
    <div ref={ref} className={cn("w-full overflow-x-auto", className)}>
      {/* Separated borders, not collapsed: a collapsed border belongs to the
          table's own grid and would stay behind while a row FLIPs away from
          it. Each cell carries its own rule so the whole row travels intact. */}
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        {label ? <caption className="sr-only">{label}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = current?.id === column.id;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    isSorted
                      ? current.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={cn(
                    "border-b border-hairline-strong p-0 align-middle transition-colors",
                    isSorted && "bg-cobalt-wash",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => cycle(column.id)}
                    className={cn(
                      "flex h-9 w-full cursor-pointer items-center gap-1 px-2 text-[11px] font-medium tracking-[0.06em] uppercase outline-none",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      column.numeric ? "justify-end" : "justify-start",
                      isSorted
                        ? "text-foreground"
                        : "text-ink-3 hover:text-foreground",
                    )}
                  >
                    <span className="min-w-0 truncate">{column.label}</span>
                    {/* Always rendered, so sorting tints a header without
                        changing its width and shoving the row about. */}
                    <motion.span
                      aria-hidden
                      className="inline-flex size-4 shrink-0 items-center justify-center"
                      initial={false}
                      animate={{
                        rotate: isSorted && current.dir === "desc" ? 180 : 0,
                        opacity: isSorted ? 1 : 0.35,
                      }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: 0 }
                      }
                    >
                      <svg viewBox="0 0 12 12" className="size-3" fill="none">
                        <path d="M6 3 L10 8.5 L2 8.5 Z" fill="currentColor" />
                      </svg>
                    </motion.span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, rowIndex) => (
            <motion.tr
              key={String(row[rowKey] ?? "")}
              // "position" animates the seat change only; a full layout
              // animation would scale-correct cells that never resized.
              layout={motionSafe ? "position" : false}
              transition={rowTransition}
              className="transition-colors hover:bg-surface-2/60"
            >
              {columns.map((column) => {
                const isSorted = current?.id === column.id;
                return (
                  <td
                    key={column.id}
                    className={cn(
                      "px-2 py-2 align-middle transition-colors",
                      rowIndex < sorted.length - 1 &&
                        "border-b border-hairline",
                      column.numeric
                        ? "text-right font-mono text-foreground tabular-nums"
                        : "text-ink-2",
                      isSorted && "bg-cobalt-wash text-foreground",
                    )}
                  >
                    {format(row[column.id] ?? "", column)}
                  </td>
                );
              })}
            </motion.tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
          No rows
        </p>
      ) : null}

      <span role="status" aria-live="polite" className="sr-only">
        {touched ? announcement : ""}
      </span>
    </div>
  );
}
