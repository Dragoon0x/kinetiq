"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GridDensity = "comfortable" | "cozy" | "compact";

export type DensityGridRow = {
  id: string;
  name: string;
  role: string;
  status: string;
};

export type DensityGridProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Rows in reading order. `id` keys the row so it survives a density change. */
  rows: DensityGridRow[];
  /** Controlled density. */
  density?: GridDensity;
  /** Initial density for uncontrolled usage. */
  defaultDensity?: GridDensity;
  onDensityChange?: (density: GridDensity) => void;
  /** Column headers, left to right. */
  columns?: [string, string, string];
  /** Visible table label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const DENSITIES = ["comfortable", "cozy", "compact"] as const;

const DENSITY_LABEL: Record<GridDensity, string> = {
  comfortable: "Comfortable",
  cozy: "Cozy",
  compact: "Compact",
};

/**
 * Every number a density owns, in one place: the row's height, the gutter it
 * keeps at each end, the column gap and the avatar. Nothing else changes — the
 * type sizes hold, because shrinking text is a legibility decision, not a
 * density one.
 */
const METRICS: Record<
  GridDensity,
  { row: number; pad: number; gap: number; avatar: number }
> = {
  comfortable: { row: 48, pad: 12, gap: 12, avatar: 28 },
  cozy: { row: 40, pad: 10, gap: 10, avatar: 24 },
  compact: { row: 32, pad: 8, gap: 8, avatar: 20 },
};

/** Named tones only; anything else reads as neutral rather than guessing. */
const TONES: Record<string, string> = {
  active: "bg-success",
  online: "bg-success",
  invited: "bg-warn",
  pending: "bg-warn",
  paused: "bg-ink-3",
  away: "bg-ink-3",
  removed: "bg-danger",
};

/** Columns: the member fills the row, role and status hold their widths so the
 *  three stay in line at every density. The sum is the table's min-width. */
const TEMPLATE = "minmax(0, 1fr) 84px 78px";
const MIN_WIDTH = 132 + 84 + 78;

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/**
 * A members table with a density switch. Changing density is a `layout`
 * animation on `glide`: rows are keyed by id, so each one keeps its identity
 * and tightens in place — height, gutters and avatar all closing at once —
 * rather than the table reprinting itself at a new size. The card follows the
 * rows down, and the header and its switch ride along corrected, so the only
 * thing that appears to move is the space between people.
 *
 * The switch is a radio group: a roving tabindex where Left and Right step
 * between the three stops without wrapping past the ends, Home and End jump to
 * comfortable and compact, Space selects. Under reduced motion the sizes swap —
 * the table is still denser, it just does not travel there.
 */
export function DensityGrid({
  ref,
  rows,
  density,
  defaultDensity,
  onDensityChange,
  columns = ["Member", "Role", "Status"],
  label,
  className,
  "aria-label": ariaLabel,
}: DensityGridProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const knobId = `${baseId}-knob`;

  const [uncontrolled, setUncontrolled] = React.useState<GridDensity>(
    defaultDensity ?? "comfortable",
  );
  const isControlled = density !== undefined;
  const current = isControlled ? density : uncontrolled;
  const metric = METRICS[current];
  const index = Math.max(0, DENSITIES.indexOf(current));

  const stopRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const select = (next: GridDensity) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    onDensityChange?.(next);
  };

  const focusAt = (to: number) => {
    const clamped = Math.min(DENSITIES.length - 1, Math.max(0, to));
    const next = DENSITIES[clamped];
    if (!next) return;
    stopRefs.current[clamped]?.focus();
    select(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent, at: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(at + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(at - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(DENSITIES.length - 1);
        break;
      case " ": {
        event.preventDefault();
        const stop = DENSITIES[at];
        if (stop) select(stop);
        break;
      }
      default:
        break;
    }
  };

  const rowStyle: React.CSSProperties = {
    gridTemplateColumns: TEMPLATE,
    columnGap: metric.gap,
    paddingLeft: metric.pad,
    paddingRight: metric.pad,
  };

  return (
    <motion.div
      ref={ref}
      layout={motionSafe}
      transition={springs.glide}
      // Radius correction only survives when the radius is a style value; the
      // card scales during the layout move and would otherwise square off.
      style={{ borderRadius: 10 }}
      className={cn(
        "flex w-full flex-col border border-hairline bg-surface-1",
        className,
      )}
    >
      <motion.div
        layout={motionSafe ? "position" : false}
        transition={springs.glide}
        className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 pb-2"
      >
        {label ? (
          <div id={labelId} className="text-sm font-semibold">
            {label}
          </div>
        ) : null}
        <div
          role="radiogroup"
          aria-label="Row density"
          className="ml-auto flex h-8 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
        >
          {DENSITIES.map((stop, at) => {
            const checked = stop === current;
            return (
              <button
                key={stop}
                ref={(node) => {
                  stopRefs.current[at] = node;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={at === index ? 0 : -1}
                onClick={() => select(stop)}
                onKeyDown={(event) => handleKeyDown(event, at)}
                className={cn(
                  "relative flex cursor-pointer items-center justify-center rounded-full px-2.5 text-xs font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  checked
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {checked ? (
                  motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={knobId}
                      transition={springs.snap}
                      style={{ borderRadius: 999 }}
                      className="absolute inset-0 border border-hairline bg-surface-0"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0"
                    />
                  )
                ) : null}
                <span className="relative">{DENSITY_LABEL[stop]}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      <div className="overflow-x-auto">
        <div
          role="table"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : ariaLabel}
          style={{ minWidth: MIN_WIDTH }}
        >
          <div role="rowgroup">
            <motion.div
              layout={motionSafe ? "position" : false}
              transition={springs.glide}
              role="row"
              style={rowStyle}
              className="grid h-7 items-center border-b border-hairline text-[11px] font-medium text-ink-3"
            >
              {columns.map((column) => (
                <motion.div
                  key={column}
                  layout={motionSafe ? "position" : false}
                  transition={springs.glide}
                  role="columnheader"
                  className="truncate"
                >
                  {column}
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div role="rowgroup">
            {rows.map((row) => (
              <motion.div
                key={row.id}
                layout={motionSafe}
                transition={springs.glide}
                role="row"
                style={{ ...rowStyle, height: metric.row }}
                className="grid items-center border-b border-hairline last:border-b-0"
              >
                <motion.div
                  layout={motionSafe ? "position" : false}
                  transition={springs.glide}
                  role="cell"
                  className="flex min-w-0 items-center"
                  style={{ gap: metric.gap - 4 }}
                >
                  <motion.span
                    aria-hidden
                    layout={motionSafe}
                    transition={springs.glide}
                    style={{
                      width: metric.avatar,
                      height: metric.avatar,
                      borderRadius: 999,
                    }}
                    className="flex shrink-0 items-center justify-center bg-cobalt-wash text-[10px] font-semibold text-cobalt-bright"
                  >
                    <motion.span
                      layout={motionSafe ? "position" : false}
                      transition={springs.glide}
                    >
                      {initialsOf(row.name)}
                    </motion.span>
                  </motion.span>
                  <span className="truncate text-sm text-foreground">
                    {row.name}
                  </span>
                </motion.div>

                <motion.div
                  layout={motionSafe ? "position" : false}
                  transition={springs.glide}
                  role="cell"
                  className="min-w-0 truncate text-xs text-ink-2"
                >
                  {row.role}
                </motion.div>

                <motion.div
                  layout={motionSafe ? "position" : false}
                  transition={springs.glide}
                  role="cell"
                  className="flex min-w-0 items-center gap-1.5"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      TONES[row.status.toLowerCase()] ?? "bg-ink-3",
                    )}
                  />
                  <span className="truncate text-xs text-ink-2">
                    {row.status}
                  </span>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
