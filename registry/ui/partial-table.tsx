"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PartialTableProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Header labels, left to right. */
  columns: string[];
  /** The complete cell text, row-major. */
  rows: string[][];
  /** Characters received across the cells in row order. */
  arrived?: number;
  /** Whether the stream is live; sets `aria-busy`. */
  playing?: boolean;
  /** Names the table; rendered as its caption. */
  caption: string;
  /** An invented model name, shown beside the caption. */
  model?: string;
  /** Fires from the measurement observer once the columns have settled after completion. */
  onSettle?: () => void;
  className?: string;
};

/** Horizontal cell padding in px, added to each measured text width. */
const CELL_PAD = 16;

/** Keeps the callback out of effect dependencies so a re-render never re-measures. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * A table a model is still writing. Rows enter as their first character
 * arrives — a fade on the row, a 4px nudge on the cell text on `glide` — and
 * every cell that is not yet whole shows a shimmer bar as long as its missing
 * letters: a gradient sweep on a linear tween, repeated, because a shimmer is
 * texture and not physics.
 *
 * The columns are held. While any cell is incomplete the layout is fixed with
 * equal `<col>` widths, so arriving characters never jog a neighbour; when the
 * last character lands, each column's natural width is read off its cells'
 * nowrap inner spans and the `<col>` widths glide to those proportions — the
 * one moment the columns are allowed to move. `onSettle` fires from that
 * measurement. Assistive technology hears a row when it completes and the
 * table when it does, never a character. Under reduced motion rows fade
 * without the nudge, the bars are still, and the widths tween.
 */
export function PartialTable({
  ref,
  columns,
  rows,
  arrived = 0,
  playing = false,
  caption,
  model,
  onSettle,
  className,
}: PartialTableProps) {
  const motionSafe = useMotionSafe();
  const columnCount = Math.max(1, columns.length);

  // Each cell owns a run of the character stream; everything below is read
  // off `arrived` against those offsets.
  const layout = React.useMemo(() => {
    const cells: { text: string; start: number; end: number }[][] = [];
    let offset = 0;
    for (const row of rows) {
      const line: { text: string; start: number; end: number }[] = [];
      for (let col = 0; col < columns.length; col += 1) {
        const text = row[col] ?? "";
        line.push({ text, start: offset, end: offset + text.length });
        offset += text.length;
      }
      cells.push(line);
    }
    return { cells, total: offset };
  }, [rows, columns]);

  const got = Math.max(0, Math.min(layout.total, Math.floor(arrived)));
  const complete = got >= layout.total;
  // The first row waits for the stream to open, not for its first character,
  // so a live table shows where it is about to write; an idle one shows nothing.
  const shownRows =
    playing || got > 0
      ? layout.cells.filter(
          (row, index) => index === 0 || (row[0]?.start ?? 0) < got,
        ).length
      : 0;
  const completeRows = layout.cells.filter(
    (row) => (row[row.length - 1]?.end ?? 0) <= got,
  ).length;

  const held = Number((100 / columnCount).toFixed(3));
  const [settled, setSettled] = React.useState<number[] | null>(null);
  // A rewrite resets the columns to their held state before any row lands.
  if (!complete && settled) setSettled(null);

  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const onSettleRef = useLatest(onSettle);
  const announced = React.useRef(false);

  React.useEffect(() => {
    if (!complete) {
      announced.current = false;
      return;
    }
    const table = tableRef.current;
    if (!table) return;
    const observer = new ResizeObserver(() => {
      const widest = Array.from({ length: columnCount }, () => 0);
      table.querySelectorAll<HTMLElement>("[data-col]").forEach((span) => {
        const col = Number(span.dataset.col);
        if (Number.isFinite(col) && col < widest.length) {
          widest[col] = Math.max(widest[col] ?? 0, span.scrollWidth + CELL_PAD);
        }
      });
      const sum = widest.reduce((acc, width) => acc + width, 0) || 1;
      const next = widest.map((width) =>
        Number(((width / sum) * 100).toFixed(3)),
      );
      // Same proportions keep the same array, so a resize that changes
      // nothing does not re-render the table.
      setSettled((prev) =>
        prev && prev.every((value, index) => value === next[index])
          ? prev
          : next,
      );
      if (!announced.current) {
        announced.current = true;
        onSettleRef.current?.();
      }
    });
    observer.observe(table);
    return () => observer.disconnect();
  }, [complete, columnCount, onSettleRef]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const widths = settled ?? columns.map(() => held);
  const announcement = complete
    ? `Table complete, ${rows.length} rows`
    : completeRows > 0
      ? `Row ${completeRows} complete`
      : "";

  const shimmer = (chars: number, key: string) => (
    <motion.span
      key={key}
      aria-hidden
      style={{ width: `${Math.max(2, Math.min(14, chars))}ch` }}
      className={cn(
        "inline-block h-[0.85em] max-w-full rounded-1 align-baseline",
        motionSafe
          ? "bg-linear-to-r from-hairline-strong via-ink-3/50 to-hairline-strong bg-[length:200%_100%]"
          : "bg-hairline-strong",
      )}
      animate={
        motionSafe ? { backgroundPosition: ["100% 0", "-100% 0"] } : undefined
      }
      transition={{ duration: 1.2, ease: easings.linear, repeat: Infinity }}
    />
  );

  return (
    <div
      ref={ref}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table
          ref={tableRef}
          aria-busy={playing || undefined}
          className="w-full min-w-[20rem] table-fixed border-collapse text-xs"
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
          <colgroup>
            {columns.map((column, index) => (
              <motion.col
                key={`${index}-${column}`}
                initial={false}
                animate={{ width: `${widths[index] ?? held}%` }}
                transition={
                  motionSafe
                    ? springs.glide
                    : { duration: durations.base, ease: easings.move }
                }
              />
            ))}
          </colgroup>
          <thead>
            <tr className="border-y border-hairline">
              {columns.map((column, index) => (
                <th
                  key={`${index}-${column}`}
                  scope="col"
                  className="h-8 px-2 text-left align-middle font-mono text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase"
                >
                  <span
                    data-col={index}
                    title={column}
                    className="inline-block max-w-full truncate align-bottom"
                  >
                    {column}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {layout.cells.slice(0, shownRows).map((row, rowIndex) => (
              <motion.tr
                key={rowIndex}
                className="border-b border-hairline last:border-b-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={fade}
              >
                {row.map((cell, col) => {
                  const have = Math.max(
                    0,
                    Math.min(cell.text.length, got - cell.start),
                  );
                  const whole = have >= cell.text.length;
                  const prefix = cell.text.slice(0, have);
                  return (
                    <td
                      key={col}
                      className="h-9 px-2 align-middle whitespace-nowrap text-foreground"
                    >
                      <motion.span
                        data-col={col}
                        title={whole ? cell.text : undefined}
                        className="inline-block max-w-full truncate align-bottom"
                        initial={motionSafe ? { y: distances.nudge } : { y: 0 }}
                        animate={{ y: 0 }}
                        transition={
                          motionSafe ? springs.glide : { duration: 0 }
                        }
                      >
                        {prefix}
                        {!whole
                          ? shimmer(
                              cell.text.length - have,
                              `bar-${rowIndex}-${col}`,
                            )
                          : null}
                      </motion.span>
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
