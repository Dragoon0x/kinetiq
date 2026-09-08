"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GainLossHolding = {
  id: string;
  /** Ticker or short name printed at the head of the row. */
  label: string;
  /** Money moved today. Negative is a loss. */
  change: number;
  /** The same move as a percentage. Negative is a loss. */
  percent: number;
};

export type GainLossSort = "best" | "worst" | "name";

export type GainLossProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The set, in whatever order the caller holds it. */
  holdings: GainLossHolding[];
  /** Controlled sort. */
  sort?: GainLossSort;
  /** Initial sort for uncontrolled usage. @default "best" */
  defaultSort?: GainLossSort;
  onSortChange?: (sort: GainLossSort) => void;
  /** Which figure the bars and the row readouts measure. @default "amount" */
  basis?: "amount" | "percent";
  /** Formats every money figure, including the net. */
  format?: (value: number) => string;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same figure, which is a
 * hydration mismatch on the numbers this component exists to compare.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const defaultFormat = (value: number) => money.format(value);

const SORTS: { value: GainLossSort; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "worst", label: "Worst" },
  { value: "name", label: "Name" },
];

/** Milliseconds the draw-in cascade owns before later changes run undelayed. */
const ENTER_WINDOW = 620;

const signed = (value: number, print: (value: number) => string) =>
  `${value >= 0 ? "+" : "-"}${print(Math.abs(value))}`;

/**
 * A holding's day, measured from a centre line. A gain grows right in success,
 * a loss grows left in danger, and both are scaled against the largest absolute
 * move in the set, so the longest bar reaches the edge and every other bar is
 * honest against it. Bars draw out of the axis on `glide` — `scaleX` from zero
 * with the origin pinned to the centre line, so a bar unrolls from the axis
 * rather than sliding in from a side — staggered by `cascade()` on the first
 * paint only.
 *
 * The sort control re-orders the rows with FLIP: `layout="position"` on
 * `glide`, the spring for a layout settling somewhere new, so a row travels to
 * its place instead of blinking out of one and into another. The bars
 * deliberately do not redraw during a sort — only the rows move, which is what
 * makes the re-order readable. Changing `basis` between money and percent
 * re-scales every bar at once against the new maximum, again on `glide`, so the
 * set breathes to its new proportions as one body.
 *
 * A holding that has not moved keeps a dot on the axis rather than a
 * zero-width bar, so it is still visible. The sort is a real radiogroup with a
 * roving tabindex: arrows step without wrapping, Home and End jump to the ends,
 * Space and Enter select. Under reduced motion the bars are already at full
 * length and rows swap places without travelling — the arrangement is the
 * information.
 */
export function GainLoss({
  ref,
  holdings,
  sort,
  defaultSort = "best",
  onSortChange,
  basis = "amount",
  format = defaultFormat,
  label,
  className,
  "aria-label": ariaLabel,
}: GainLossProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] =
    React.useState<GainLossSort>(defaultSort);
  const isControlled = sort !== undefined;
  const current = isControlled ? sort : uncontrolled;

  const [hovered, setHovered] = React.useState<string | null>(null);
  const sortRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // The cascade belongs to the first paint. After its window closes, a basis
  // change re-scales every bar at once instead of rippling through the set.
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setEntered(true), ENTER_WINDOW);
    return () => window.clearTimeout(timer);
  }, []);

  const valueOf = (holding: GainLossHolding) =>
    basis === "percent" ? holding.percent : holding.change;

  const printed = (holding: GainLossHolding) =>
    basis === "percent"
      ? `${holding.percent >= 0 ? "+" : "-"}${Math.abs(holding.percent).toFixed(1)}%`
      : signed(holding.change, format);

  const rows = holdings.slice().sort((a, b) => {
    if (current === "name") return a.label.localeCompare(b.label, "en");
    const delta = valueOf(b) - valueOf(a);
    return current === "worst" ? -delta : delta;
  });

  const peak = holdings.reduce(
    (max, holding) => Math.max(max, Math.abs(valueOf(holding))),
    0,
  );
  const net = holdings.reduce((sum, holding) => sum + holding.change, 0);
  const stagger = cascade(Math.max(rows.length, 1));

  const select = (next: GainLossSort) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    onSortChange?.(next);
  };

  const focusSort = (index: number) => {
    const clamped = Math.min(SORTS.length - 1, Math.max(0, index));
    sortRefs.current[clamped]?.focus();
    const option = SORTS[clamped];
    if (option) select(option.value);
  };

  const handleSortKey = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusSort(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusSort(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusSort(0);
        break;
      case "End":
        event.preventDefault();
        focusSort(SORTS.length - 1);
        break;
      case " ":
        event.preventDefault();
        select(SORTS[index]?.value ?? current);
        break;
      default:
        break;
    }
  };

  const currentIndex = Math.max(
    0,
    SORTS.findIndex((option) => option.value === current),
  );

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-medium">
            {label}
          </span>
        ) : null}
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Net
          </span>
          <span
            className={cn(
              "font-mono text-sm font-medium tabular-nums transition-colors",
              net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-ink-2",
            )}
          >
            {signed(net, format)}
          </span>
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Sort holdings"
        className="flex items-center gap-1 border-b border-hairline"
      >
        {SORTS.map((option, index) => {
          const checked = option.value === current;
          return (
            <button
              key={option.value}
              ref={(node) => {
                sortRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === currentIndex ? 0 : -1}
              onClick={() => select(option.value)}
              onKeyDown={(event) => handleSortKey(event, index)}
              className={cn(
                "relative flex h-8 items-center px-2 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
              {checked ? (
                <motion.span
                  aria-hidden
                  // Prefixed by useId so two instances on one page cannot
                  // trade underlines between their radiogroups.
                  layoutId={motionSafe ? `${baseId}-underline` : undefined}
                  transition={springs.snap}
                  className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-1.5">
        {rows.map((holding, index) => {
          const value = valueOf(holding);
          const share = peak === 0 ? 0 : Math.abs(value) / peak;
          const up = value > 0;
          const down = value < 0;
          const dimmed = hovered !== null && hovered !== holding.id;
          // Spoken from the holding's own figures, not the current basis, and
          // as words: a screen reader may swallow a leading plus entirely.
          const spoken =
            holding.change === 0 && holding.percent === 0
              ? `${holding.label}, unchanged`
              : `${holding.label}, ${
                  holding.change >= 0 ? "up" : "down"
                } ${format(Math.abs(holding.change))}, ${Math.abs(
                  holding.percent,
                ).toFixed(1)} percent`;
          return (
            <motion.li
              key={holding.id}
              layout={motionSafe ? "position" : false}
              transition={springs.glide}
              onPointerEnter={() => setHovered(holding.id)}
              onPointerLeave={() => setHovered(null)}
              className={cn(
                "flex items-center gap-2 transition-opacity",
                dimmed && "opacity-55",
              )}
            >
              {/* The row's readouts are hidden from assistive technology and
                  replaced by one sentence below, so a screen reader hears
                  "up $1,240, 6.8 percent" rather than a bare signed number
                  whose plus may not be spoken at all. */}
              <span
                aria-hidden
                title={holding.label}
                className="w-11 shrink-0 truncate font-mono text-[11px] font-medium"
              >
                {holding.label}
              </span>

              <span
                aria-hidden
                className="relative h-4 min-w-0 flex-1 rounded-1 bg-surface-2"
              >
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline-strong" />
                {value === 0 ? (
                  <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-3" />
                ) : (
                  <motion.span
                    className={cn(
                      "absolute inset-y-[3px] rounded-1",
                      up
                        ? "right-0 left-1/2 origin-left bg-success"
                        : "right-1/2 left-0 origin-right bg-danger",
                    )}
                    initial={motionSafe ? { scaleX: 0 } : false}
                    animate={{ scaleX: share }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.glide,
                            delay: entered ? 0 : index * stagger,
                          }
                        : { duration: 0 }
                    }
                  />
                )}
              </span>

              <span
                aria-hidden
                className={cn(
                  "w-16 shrink-0 text-right font-mono text-[11px] font-medium tabular-nums transition-colors",
                  up ? "text-success" : down ? "text-danger" : "text-ink-3",
                )}
              >
                {printed(holding)}
              </span>

              <span className="sr-only">{spoken}</span>
            </motion.li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="text-xs text-ink-3">Nothing held today.</p>
      ) : null}

      <span role="status" className="sr-only">
        Sorted by {current}, net {signed(net, format)} across {rows.length}{" "}
        holdings
      </span>
    </div>
  );
}
