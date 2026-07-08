"use client";

import * as React from "react";

import { ChevronUp } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Checkbox } from "@/registry/ui/checkbox";

export type LedgerSortDirection = "asc" | "desc";

/** Sort descriptor: which column key, which way. `null` anywhere = unsorted. */
export type LedgerSort = {
  key: string;
  direction: LedgerSortDirection;
};

/** 1-based inclusive bounds of the rows in view (overscan excluded). */
export type LedgerVisibleRange = {
  from: number;
  to: number;
};

export type LedgerColumn<T> = {
  /** Field key; the default cell reads `row[key]` and stringifies it. */
  key: string;
  header: string;
  /** Pixel width or `"1fr"` (default) — folded into one shared grid template. */
  width?: number | "1fr";
  /** `"right"` renders the cell in right-aligned mono tabular-nums. */
  align?: "left" | "right";
  /** Renders the header as a button cycling asc → desc → none. */
  sortable?: boolean;
  /** Custom cell renderer; defaults to the stringified field. */
  cell?: (row: T) => React.ReactNode;
  /** Ascending comparator; defaults to numeric, else string compare on `key`. */
  sortFn?: (a: T, b: T) => number;
};

export type LedgerProps<T> = {
  /** Keep referentially stable (module scope or memo) so rows stay memoized. */
  columns: LedgerColumn<T>[];
  rows: readonly T[];
  /** Stable unique id per row — drives row identity, keys, and selection. */
  rowId: (row: T) => string;
  /** Fixed row height in px; every row must be exactly this tall. */
  rowHeight?: number;
  /** Scroll viewport height in px (excludes the header row). */
  height?: number;
  /** Extra rows rendered above and below the visible window. */
  overscan?: number;
  /** Controlled sort. */
  sort?: LedgerSort | null;
  defaultSort?: LedgerSort | null;
  onSortChange?: (sort: LedgerSort | null) => void;
  /**
   * Adds a 40px checkbox column. The header checkbox selects ALL rows in
   * `rows` — the full data set, not just the rendered window — and reads
   * checked / indeterminate from `selected.size` vs `rows.length`.
   */
  selectable?: boolean;
  /** Controlled selection of row ids. */
  selected?: ReadonlySet<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /**
   * Fires from the rAF-coalesced scroll handler when the 1-based visible
   * range changes. Never fired during render or mount — at mount scrollTop
   * is 0, so the initial range is rows 1..ceil(height / rowHeight).
   */
  onVisibleRangeChange?: (range: LedgerVisibleRange) => void;
  /** Accessible name for the table. */
  label?: string;
  className?: string;
};

/** Sort FLIPs are capped so the animation set stays bounded at any row count. */
const FLIP_CAP = 30;

/** Steps in the sort micro-cascade — delay = min(flipIndex, 3) × 0.02s. */
const FLIP_CASCADE_STEPS = 3;
const FLIP_CASCADE_STEP_S = 0.02;

const HEADER_TEXT =
  "font-mono text-[11px] font-medium tracking-[0.08em] uppercase";

function stringifyField<T>(row: T, key: string): string {
  const value = (row as Record<string, unknown>)[key];
  return value == null ? "" : String(value);
}

function defaultCompare<T>(a: T, b: T, key: string): number {
  const av = (a as Record<string, unknown>)[key];
  const bv = (b as Record<string, unknown>)[key];
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av ?? "").localeCompare(String(bv ?? ""));
}

type LedgerRowProps<T> = {
  row: T;
  id: string;
  /** Absolute index in the sorted array — position = index × rowHeight. */
  index: number;
  rowHeight: number;
  gridTemplate: string;
  columns: LedgerColumn<T>[];
  selectable: boolean;
  checked: boolean;
  /** Tick-draw delay for the select-all cascade (seconds). */
  drawDelay: number;
  onToggle: (id: string, checked: boolean) => void;
  /** Pre-sort minus post-sort offset; 0 = appear in place, no animation. */
  flipDelta: number;
  flipDelay: number;
  motionSafe: boolean;
};

function LedgerRowBase<T>({
  row,
  id,
  index,
  rowHeight,
  gridTemplate,
  columns,
  selectable,
  checked,
  drawDelay,
  onToggle,
  flipDelta,
  flipDelay,
  motionSafe,
}: LedgerRowProps<T>) {
  return (
    // Positioning is transform-only (no `top`) so scrolling never triggers
    // layout; `contain: layout paint` isolates each row ("strict" would also
    // pin size, which fights absolutely-positioned children).
    <div
      role="row"
      aria-rowindex={index + 1}
      className="absolute inset-x-0 top-0"
      style={{
        height: rowHeight,
        transform: `translateY(${index * rowHeight}px)`,
        contain: "layout paint",
      }}
    >
      <motion.div
        role="presentation"
        className={cn(
          "border-border grid h-full items-center border-b transition-colors",
          checked ? "bg-accent" : "hover:bg-secondary/60",
        )}
        style={{ gridTemplateColumns: gridTemplate }}
        initial={flipDelta === 0 ? false : { y: flipDelta }}
        animate={{ y: 0 }}
        transition={
          motionSafe && flipDelta !== 0
            ? { ...springs.glide, delay: flipDelay }
            : { duration: 0 }
        }
      >
        {selectable && (
          <div role="cell" className="flex h-full items-center justify-center">
            <Checkbox
              checked={checked}
              drawDelay={drawDelay}
              onCheckedChange={(next) => onToggle(id, next)}
              label={<span className="sr-only">{`Select row ${id}`}</span>}
              className="items-center"
            />
          </div>
        )}
        {columns.map((column) => (
          <div
            key={column.key}
            role="cell"
            className={cn(
              "min-w-0 truncate px-3 text-sm",
              column.align === "right" &&
                "text-right font-mono text-xs tabular-nums",
            )}
          >
            {column.cell ? column.cell(row) : stringifyField(row, column.key)}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// memo() erases the generic; the cast restores it. Rows only re-render when
// their own position, selection, or flip props change.
const LedgerRow = React.memo(LedgerRowBase) as typeof LedgerRowBase;

/**
 * Ten thousand rows, sixty frames: a hand-rolled virtualized table. Only the
 * scrolled window exists in the DOM — a spacer div holds the full height and
 * each row is absolutely placed via `translateY(index × rowHeight)`.
 *
 * Sorting is the signature motion: the header chevron flips (rotate 180) on
 * `snap` and fades between states, while rows visible both before and after
 * the sort FLIP from their old offset to the new one on `glide` with a
 * ≤3-step micro-cascade; everything else appears in place. Select-all draws
 * ticks down the visible window, staggered by `cascade`. Reduced motion:
 * chevron swaps instantly, rows jump, no tick cascade.
 *
 * Perf: scrollTop updates are coalesced through one rAF per frame (scroll
 * state changes ONLY inside that callback). At defaults (height 320,
 * rowHeight 40, overscan 6) the window is ceil(320/40)+1 ≈ 9 visible rows
 * + 2×6 overscan ≈ 21 rendered row nodes — bounded (~32 with generous
 * overscan) regardless of total rows — and a sort animates at most 30 of
 * them, so the animation set never scales with the data.
 */
export function Ledger<T>({
  columns,
  rows,
  rowId,
  rowHeight = 40,
  height = 320,
  overscan = 6,
  sort: sortProp,
  defaultSort = null,
  onSortChange,
  selectable = false,
  selected: selectedProp,
  onSelectedChange,
  onVisibleRangeChange,
  label = "Ledger",
  className,
}: LedgerProps<T>) {
  const motionSafe = useMotionSafe();

  const isSortControlled = sortProp !== undefined;
  const [internalSort, setInternalSort] = React.useState<LedgerSort | null>(
    defaultSort,
  );
  const sort = isSortControlled ? sortProp : internalSort;

  const isSelectionControlled = selectedProp !== undefined;
  const [internalSelected, setInternalSelected] = React.useState<
    ReadonlySet<string>
  >(() => new Set());
  const selected = selectedProp ?? internalSelected;

  const [scrollTop, setScrollTop] = React.useState(0);
  // Pre-sort offsets of the rendered window, captured in the header click
  // handler BEFORE the sort state applies. Held in state (not a ref) so the
  // render that computes flip deltas never reads ref.current.
  const [flipOrigins, setFlipOrigins] = React.useState<Map<
    string,
    number
  > | null>(null);
  // Bumped per sort click; part of each row key so remounts re-apply
  // `initial` — the FLIP mechanism (layout animations stay off).
  const [sortGen, setSortGen] = React.useState(0);
  // Only a select-all toggle cascades tick draws; row toggles are immediate.
  const [fromSelectAll, setFromSelectAll] = React.useState(false);
  const [status, setStatus] = React.useState("");

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const rafPending = React.useRef(false);
  const rafId = React.useRef(0);
  const lastRange = React.useRef<LedgerVisibleRange | null>(null);
  const selectedRef = React.useRef(selected);

  React.useEffect(() => {
    selectedRef.current = selected;
  });

  // Retire stale flip origins once the glide (+cascade) has settled, so rows
  // mounting later in the same generation can never replay old deltas.
  React.useEffect(() => {
    if (!flipOrigins) return;
    const timer = window.setTimeout(() => setFlipOrigins(null), 700);
    return () => window.clearTimeout(timer);
  }, [flipOrigins]);

  React.useEffect(() => {
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const total = rows.length;

  const sortedRows = React.useMemo<readonly T[]>(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;
    const key = sort.key;
    const compare =
      column.sortFn ?? ((a: T, b: T) => defaultCompare(a, b, key));
    const factor = sort.direction === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => factor * compare(a, b));
  }, [rows, columns, sort]);

  // One template string shared by the header row and every body row.
  const gridTemplate = React.useMemo(() => {
    const widths = columns.map((column) =>
      typeof column.width === "number" ? `${column.width}px` : "minmax(0, 1fr)",
    );
    return (selectable ? ["40px", ...widths] : widths).join(" ");
  }, [columns, selectable]);

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(
    total,
    Math.ceil((scrollTop + height) / rowHeight) + overscan,
  );
  const windowCount = Math.max(1, last - first);
  const tickInterval = cascade(windowCount);

  const commitSelected = React.useCallback(
    (next: Set<string>) => {
      if (!isSelectionControlled) setInternalSelected(next);
      onSelectedChange?.(next);
      setStatus(`${next.size} selected`);
    },
    [isSelectionControlled, onSelectedChange],
  );

  // Stable across renders (reads selection via ref at event time) so
  // memoized rows never re-render just because the handler was re-created.
  const handleToggleRow = React.useCallback(
    (id: string, checked: boolean) => {
      setFromSelectAll(false);
      const next = new Set(selectedRef.current);
      if (checked) next.add(id);
      else next.delete(id);
      commitSelected(next);
    },
    [commitSelected],
  );

  // Select-all targets the FULL data set, not just the rendered window.
  const handleSelectAll = React.useCallback(
    (checked: boolean) => {
      setFromSelectAll(true);
      commitSelected(
        checked ? new Set(rows.map((row) => rowId(row))) : new Set<string>(),
      );
    },
    [commitSelected, rows, rowId],
  );

  // Scroll state moves ONLY here: one pending rAF per frame coalesces scroll
  // events into a single batched state update.
  const handleScroll = React.useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;
    rafId.current = requestAnimationFrame(() => {
      rafPending.current = false;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const top = viewport.scrollTop;
      setScrollTop(top);
      // Scrolling retires any in-flight flip snapshot and cascade flag;
      // functional updates bail out when already clear.
      setFlipOrigins((origins) => (origins ? null : origins));
      setFromSelectAll((flag) => (flag ? false : flag));
      if (onVisibleRangeChange) {
        const from = Math.min(total, Math.floor(top / rowHeight) + 1);
        const to = Math.min(total, Math.ceil((top + height) / rowHeight));
        const previous = lastRange.current;
        if (!previous || previous.from !== from || previous.to !== to) {
          const range = { from, to };
          lastRange.current = range;
          onVisibleRangeChange(range);
        }
      }
    });
  }, [onVisibleRangeChange, total, rowHeight, height]);

  const cycleSort = (column: LedgerColumn<T>) => {
    const current = sort && sort.key === column.key ? sort.direction : null;
    const nextDirection: LedgerSortDirection | null =
      current === null ? "asc" : current === "asc" ? "desc" : null;
    const next = nextDirection
      ? { key: column.key, direction: nextDirection }
      : null;

    if (motionSafe) {
      // Snapshot the rendered window's offsets BEFORE the sort state applies;
      // rows present in both the old and new windows FLIP from these.
      const origins = new Map<string, number>();
      for (let index = first; index < last; index += 1) {
        const row = sortedRows[index];
        if (row !== undefined) origins.set(rowId(row), index * rowHeight);
      }
      setFlipOrigins(origins);
      setSortGen((generation) => generation + 1);
    }

    if (!isSortControlled) setInternalSort(next);
    onSortChange?.(next);
    setStatus(
      next
        ? `Sorted by ${column.header}, ${
            next.direction === "asc" ? "ascending" : "descending"
          }`
        : "Sort cleared",
    );
  };

  // Build the visible window. Flip deltas resolve here, in render, from the
  // `flipOrigins` state snapshot — capped at FLIP_CAP rows per sort.
  type WindowEntry = {
    row: T;
    id: string;
    index: number;
    flipDelta: number;
    flipDelay: number;
  };
  const windowRows: WindowEntry[] = [];
  let flips = 0;
  for (let index = first; index < last; index += 1) {
    const row = sortedRows[index];
    if (row === undefined) continue;
    const id = rowId(row);
    let flipDelta = 0;
    let flipDelay = 0;
    if (flipOrigins && motionSafe && flips < FLIP_CAP) {
      const oldY = flipOrigins.get(id);
      const newY = index * rowHeight;
      if (oldY !== undefined && oldY !== newY) {
        flipDelta = oldY - newY;
        flipDelay = Math.min(flips, FLIP_CASCADE_STEPS) * FLIP_CASCADE_STEP_S;
        flips += 1;
      }
    }
    windowRows.push({ row, id, index, flipDelta, flipDelay });
  }

  const allSelected = total > 0 && selected.size === total;
  const someSelected = selected.size > 0;

  return (
    <div className={cn("w-full", className)}>
      <div
        role="table"
        aria-label={label}
        aria-rowcount={total}
        className="border-border bg-card overflow-hidden rounded-3 border"
      >
        <div
          role="row"
          className="border-border bg-card sticky top-0 z-10 grid h-9 items-center border-b"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {selectable && (
            <div
              role="columnheader"
              className="flex h-full items-center justify-center"
            >
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onCheckedChange={handleSelectAll}
                label={<span className="sr-only">Select all rows</span>}
                className="items-center"
              />
            </div>
          )}
          {columns.map((column) => {
            const direction =
              sort && sort.key === column.key ? sort.direction : null;
            return (
              <div
                key={column.key}
                role="columnheader"
                // aria-sort lives on the columnheader (per ARIA); the button
                // inside is the interactive wrapper for label + chevron.
                aria-sort={
                  column.sortable
                    ? direction === "asc"
                      ? "ascending"
                      : direction === "desc"
                        ? "descending"
                        : "none"
                    : undefined
                }
                className={cn(
                  "flex h-full items-center px-3",
                  column.align === "right" && "justify-end",
                )}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() => cycleSort(column)}
                    className={cn(
                      "text-muted-foreground hover:text-foreground -mx-1 flex items-center gap-1 rounded-1 px-1 transition-colors",
                      HEADER_TEXT,
                      direction !== null && "text-foreground",
                    )}
                  >
                    <span>{column.header}</span>
                    <motion.span
                      aria-hidden
                      className="flex"
                      initial={false}
                      animate={{
                        rotate: direction === "desc" ? 180 : 0,
                        opacity: direction === null ? 0 : 1,
                      }}
                      transition={
                        motionSafe
                          ? {
                              rotate: springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: 0 }
                      }
                    >
                      <ChevronUp className="size-3" />
                    </motion.span>
                  </button>
                ) : (
                  <span className={cn("text-muted-foreground", HEADER_TEXT)}>
                    {column.header}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div
          ref={viewportRef}
          role="presentation"
          onScroll={handleScroll}
          className="overflow-y-auto overscroll-contain"
          style={{ height }}
        >
          {/* Spacer: full scroll height; rows position inside via transform. */}
          <div
            role="rowgroup"
            className="relative"
            style={{ height: total * rowHeight }}
          >
            {windowRows.map((entry) => (
              <LedgerRow
                key={`g${sortGen}:${entry.id}`}
                row={entry.row}
                id={entry.id}
                index={entry.index}
                rowHeight={rowHeight}
                gridTemplate={gridTemplate}
                columns={columns}
                selectable={selectable}
                checked={selectable && selected.has(entry.id)}
                drawDelay={
                  fromSelectAll && motionSafe
                    ? (entry.index - first) * tickInterval
                    : 0
                }
                onToggle={handleToggleRow}
                flipDelta={entry.flipDelta}
                flipDelay={entry.flipDelay}
                motionSafe={motionSafe}
              />
            ))}
          </div>
        </div>
      </div>
      <div role="status" className="sr-only">
        {status}
      </div>
    </div>
  );
}
