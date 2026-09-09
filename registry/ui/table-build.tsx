"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TableBuildColumn = {
  /** The row field this column reads. */
  key: string;
  /** Heading text. */
  label: string;
  /** Right-aligned, tabular, and compared as a number when sorted. */
  numeric?: boolean;
  /** Prints the cell; sorting always reads the raw value. */
  format?: (value: string | number) => string;
};

export type TableBuildRow = { id: string } & Record<string, string | number>;

export type TableBuildSort = { key: string; direction: "asc" | "desc" };

export type TableBuildProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Column key, heading and whether it is numeric. */
  columns: TableBuildColumn[];
  /** Every row the table will have, each with an `id`, in arrival order. */
  rows: TableBuildRow[];
  /** Rows that have arrived so far. */
  arrived?: number;
  /** The build is open: the header shows and `aria-busy` is set. */
  generating?: boolean;
  /** Controlled sort. */
  sort?: TableBuildSort | null;
  /** Initial sort for uncontrolled usage. @default null */
  defaultSort?: TableBuildSort | null;
  onSortChange?: (sort: TableBuildSort | null) => void;
  /** Names the table; rendered as its caption. */
  caption: string;
  /** An invented model name beside the caption. */
  model?: string;
  /** Fires once when the last row has landed. */
  onComplete?: () => void;
  className?: string;
};

function compare(
  a: string | number | undefined,
  b: string | number | undefined,
  numeric: boolean,
): number {
  if (numeric) return Number(a ?? 0) - Number(b ?? 0);
  const left = String(a ?? "");
  const right = String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * A generated table that is usable before it is finished. The header lands
 * first — each heading drops from `distances.step` on `snap`, one crisp
 * overshoot, staggered left to right by `cascade()` — and rows cascade in as
 * they arrive, fading up from `distances.nudge` on `glide`, staggered from
 * the first row of each delivery so a batch reads as a run rather than a
 * jump. The sort control is live the whole time: rows are keyed by id and
 * carry a position layout animation, so a re-sort glides the rows already
 * present to their new seats and a row that arrives afterwards slots straight
 * into its sorted place instead of the bottom. `onComplete` fires when the
 * last-arriving row finishes landing.
 *
 * Headings are native buttons on `<th>` elements carrying `aria-sort`; Enter
 * or Space cycles ascending, descending, none. Two polite live regions speak
 * the build stage and the sort, never a row. Under reduced motion headings
 * and rows fade in with no drop or rise, a re-sort swaps rows in place, and
 * the arrow swaps direction without rotating.
 */
export function TableBuild({
  ref,
  columns,
  rows,
  arrived = 0,
  generating = false,
  sort: sortProp,
  defaultSort = null,
  onSortChange,
  caption,
  model,
  onComplete,
  className,
}: TableBuildProps) {
  const motionSafe = useMotionSafe();
  const count = rows.length;
  const got = Math.max(0, Math.min(count, Math.floor(arrived)));
  const complete = count > 0 && got >= count;
  const open = generating || got > 0;

  const [uncontrolled, setUncontrolled] = React.useState<TableBuildSort | null>(
    defaultSort,
  );
  const isControlled = sortProp !== undefined;
  const sort = isControlled ? sortProp : uncontrolled;

  // The sort live region stays silent until a sort has been chosen once, so
  // opening the build announces the stage and nothing else.
  const [touched, setTouched] = React.useState(false);

  const cycle = (key: string) => {
    setTouched(true);
    const next: TableBuildSort | null =
      sort?.key !== key
        ? { key, direction: "asc" }
        : sort.direction === "asc"
          ? { key, direction: "desc" }
          : null;
    if (!isControlled) setUncontrolled(next);
    onSortChange?.(next);
  };

  // The stagger starts at the first row of each delivery, not at the head of
  // the table, so a batch cascades from where it began. The anchor lives in
  // state so the committed render knows where the previous count stood.
  const [anchor, setAnchor] = React.useState({ got, from: 0 });
  if (anchor.got !== got) {
    setAnchor({ got, from: got > anchor.got ? anchor.got : 0 });
  }

  const sortedColumn = sort
    ? columns.find((column) => column.key === sort.key)
    : undefined;
  const present = rows.slice(0, got).map((row, index) => ({ row, index }));
  if (sort && sortedColumn) {
    const sign = sort.direction === "asc" ? 1 : -1;
    present.sort(
      (a, b) =>
        sign *
          compare(
            a.row[sort.key],
            b.row[sort.key],
            sortedColumn.numeric === true,
          ) || a.index - b.index,
    );
  }

  const lastId = rows[count - 1]?.id;
  const headGap = cascade(columns.length);
  const rowGap = cascade(count);
  const fade = { duration: durations.base, ease: easings.enter } as const;

  const stageText = complete
    ? `Table complete, ${count} rows`
    : open
      ? "Building table"
      : "";
  const sortText = sortedColumn
    ? `Sorted by ${sortedColumn.label}, ${
        sort?.direction === "asc" ? "ascending" : "descending"
      }`
    : touched
      ? "Arrival order"
      : "";

  return (
    <div
      ref={ref}
      className={cn(
        "w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table
          aria-busy={generating || undefined}
          className="w-full min-w-[20rem] border-collapse text-xs"
        >
          <caption className="px-3 pt-3 pb-2 text-left">
            <span className="flex items-center justify-between gap-3">
              <span
                className="min-w-0 truncate text-sm font-medium text-foreground"
                title={caption}
              >
                {caption}
              </span>
              {model ? (
                <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
                  {model}
                </span>
              ) : null}
            </span>
          </caption>
          {open ? (
            <thead>
              <tr className="border-y border-hairline">
                {columns.map((column, index) => {
                  const active = sort?.key === column.key;
                  return (
                    <motion.th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        active
                          ? sort?.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                      className="p-0 align-middle font-medium"
                      initial={
                        motionSafe
                          ? { opacity: 0, y: -distances.step }
                          : { opacity: 0, y: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.snap,
                              delay: index * headGap,
                              opacity: { ...fade, delay: index * headGap },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <button
                        type="button"
                        onClick={() => cycle(column.key)}
                        className={cn(
                          "flex h-8 w-full items-center gap-1 px-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors outline-none hover:text-foreground",
                          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                          column.numeric ? "justify-end" : "justify-start",
                          active ? "text-foreground" : "text-ink-3",
                        )}
                      >
                        <span className="truncate" title={column.label}>
                          {column.label}
                        </span>
                        <motion.svg
                          viewBox="0 0 12 12"
                          aria-hidden
                          className="size-3 shrink-0"
                          fill="none"
                          style={{ originX: 0.5, originY: 0.5 }}
                          initial={false}
                          animate={{
                            opacity: active ? 1 : 0,
                            rotate:
                              sort?.direction === "desc" && active ? 180 : 0,
                          }}
                          transition={
                            motionSafe
                              ? { ...springs.snap, opacity: fade }
                              : { duration: 0 }
                          }
                        >
                          <path d="M6 3 L10 8.5 L2 8.5 Z" fill="currentColor" />
                        </motion.svg>
                      </button>
                    </motion.th>
                  );
                })}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {present.map(({ row, index }) => {
              const delay = Math.max(0, index - anchor.from) * rowGap;
              return (
                <motion.tr
                  key={row.id}
                  // "position" animates the seat change only; a full layout
                  // animation would scale-correct cells that never resized.
                  layout={motionSafe ? "position" : false}
                  className="border-b border-hairline last:border-b-0"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0, y: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    layout: springs.glide,
                    y: motionSafe
                      ? { ...springs.glide, delay }
                      : { duration: 0 },
                    opacity: motionSafe
                      ? { ...fade, delay }
                      : { duration: durations.fast },
                  }}
                  onAnimationComplete={
                    complete && row.id === lastId
                      ? () => onComplete?.()
                      : undefined
                  }
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "h-9 px-2 align-middle whitespace-nowrap",
                        column.numeric
                          ? "text-right font-mono text-foreground tabular-nums"
                          : "text-ink-2",
                        sort?.key === column.key && "bg-cobalt-wash/60",
                      )}
                    >
                      {column.format
                        ? column.format(row[column.key] ?? "")
                        : (row[column.key] ?? "")}
                    </td>
                  ))}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="flex h-8 items-center justify-between gap-3 border-t border-hairline px-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <span className="tabular-nums">
            {got} of {count} rows
          </span>
          <span className="min-w-0 truncate">
            {sortedColumn
              ? `${sortedColumn.label} ${sort?.direction ?? ""}`
              : "Arrival order"}
          </span>
        </div>
      ) : null}

      <span role="status" className="sr-only">
        {stageText}
      </span>
      <span role="status" className="sr-only">
        {sortText}
      </span>
    </div>
  );
}
