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

export type SpendMerchant = {
  id: string;
  name: string;
  amount: number;
};

export type SpendCategory = {
  id: string;
  label: string;
  amount: number;
  merchants?: SpendMerchant[];
};

export type CategoryBarsProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The categories. Sorted internally, heaviest first. */
  categories: SpendCategory[];
  /** Controlled open category id, or null for none. */
  expanded?: string | null;
  /** Initial open category for uncontrolled usage. @default null */
  defaultExpanded?: string | null;
  /** Fires from the click or key that opened or closed a row. */
  onExpandedChange?: (id: string | null) => void;
  /** The figure that rolls above the board. @default the sum of `categories` */
  total?: number;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Names the board; printed above it. @default "Spend by category" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and the total is
 * the first thing anyone reads.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const DIGITS = "0123456789";

/**
 * Digits ride a ten-face column, so a `y` of one tenth of its height moves
 * exactly one digit. Hidden from assistive technology: the board announces its
 * total once, in words, rather than ten faces per column.
 */
function Rolling({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char);
        // Keyed from the right so the units column keeps its identity when the
        // number gains or loses a digit and only the new column mounts.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.split("").map((face) => (
                <span
                  key={face}
                  className="flex h-[1.15em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

function MerchantPanel({
  id,
  open,
  merchants,
  format,
  motionSafe,
}: {
  id: string;
  open: boolean;
  merchants: SpendMerchant[];
  format: (value: number) => string;
  motionSafe: boolean;
}) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    // ResizeObserver fires once on observe, so the first height lands without
    // reading layout during render — and it fires before paint, so the frame
    // starts gliding in the same frame the row opens.
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const stagger = cascade(merchants.length);

  return (
    <motion.div
      id={id}
      aria-hidden={!open}
      initial={false}
      animate={{ height: open ? measured : 0 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className="overflow-hidden"
    >
      <div ref={innerRef}>
        {merchants.length === 0 && (
          <p className="py-1.5 pl-6 text-xs text-ink-3">
            No merchants recorded.
          </p>
        )}
        <ul className="m-0 flex list-none flex-col gap-1 py-1.5 pr-1 pl-3">
          {merchants.map((merchant, index) => (
            <motion.li
              key={merchant.id}
              className="flex items-center gap-2 border-l border-hairline-strong pl-2.5"
              initial={false}
              animate={{
                opacity: open ? 1 : 0,
                y: open || !motionSafe ? 0 : -distances.nudge,
              }}
              transition={
                motionSafe
                  ? { ...springs.snap, delay: open ? index * stagger : 0 }
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              <span className="min-w-0 flex-1 truncate text-xs text-ink-2">
                {merchant.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                {format(merchant.amount)}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

/**
 * Where the money went. Categories sort heaviest first and each bar draws in
 * from its left origin on `glide` under a `cascade()` stagger, so the whole
 * board settles inside the choreography budget instead of racing. Bars are
 * scaled against the largest category rather than the total, which is what keeps
 * the smallest one legible.
 *
 * Pressing a row unpacks its merchants: the panel's real height is measured by a
 * ResizeObserver and the frame glides to it — nothing is reserved, so a category
 * with two merchants takes the room two merchants need — while the rows arrive
 * one after another on `snap`, each from a `nudge` of travel. One row is open at
 * a time and the open bar tints to `signal`. The total above the board rolls its
 * digits on `snap` whenever the figures change.
 *
 * Each header is a `button` with `aria-expanded` and `aria-controls`, so every
 * one of them stays in the tab order; Arrow Up and Down walk the headers, Home
 * and End jump to the ends, Enter and Space toggle. Under reduced motion the
 * bars still fill and the panel still opens — that is the information — but
 * without stagger, travel, or spring.
 */
export function CategoryBars({
  ref,
  categories,
  expanded,
  defaultExpanded = null,
  onExpandedChange,
  total,
  format = (value) => money.format(value),
  label = "Spend by category",
  className,
}: CategoryBarsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const headerRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultExpanded,
  );
  const isControlled = expanded !== undefined;
  const openId = isControlled ? expanded : uncontrolled;

  const rows = React.useMemo(
    () =>
      categories
        .map((category, index) => ({ category, index }))
        .sort(
          (a, b) => b.category.amount - a.category.amount || a.index - b.index,
        )
        .map((entry) => entry.category),
    [categories],
  );

  const sum = rows.reduce((carry, row) => carry + row.amount, 0);
  const board = total ?? sum;
  const max = rows.reduce((carry, row) => Math.max(carry, row.amount), 0) || 1;
  const stagger = cascade(rows.length);
  const openRow = rows.find((row) => row.id === openId) ?? null;

  const toggle = (id: string) => {
    const next = openId === id ? null : id;
    if (!isControlled) setUncontrolled(next);
    onExpandedChange?.(next);
  };

  const focusAt = (to: number) => {
    const clamped = Math.min(rows.length - 1, Math.max(0, to));
    headerRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(rows.length - 1);
        break;
      default:
        break;
    }
  };

  const shareOf = (amount: number) =>
    board > 0 ? Math.round((amount / board) * 100) : 0;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {rows.length} categories
          </span>
        </div>
        <span className="shrink-0 font-mono text-lg leading-none font-semibold text-ink">
          <Rolling value={format(board)} motionSafe={motionSafe} />
        </span>
      </div>

      <ul aria-labelledby={labelId} className="m-0 flex list-none flex-col p-0">
        {rows.map((row, index) => {
          const isOpen = row.id === openId;
          const merchants = row.merchants ?? [];
          const panelId = `${baseId}-panel-${index}`;
          const share = shareOf(row.amount);
          return (
            <li key={row.id} className="border-b border-hairline last:border-0">
              <button
                ref={(node) => {
                  headerRefs.current[index] = node;
                }}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-label={`${row.label}, ${format(row.amount)}, ${share} percent of total, ${merchants.length} merchants`}
                onClick={() => toggle(row.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "flex w-full flex-col gap-1.5 rounded-2 px-1.5 py-2 text-left transition-colors outline-none",
                  "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <span className="flex items-center gap-2">
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      "size-3.5 shrink-0 text-ink-3 transition-transform",
                      isOpen && "rotate-90",
                    )}
                  >
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {row.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                    {share}%
                  </span>
                  <span className="shrink-0 font-mono text-xs font-medium tabular-nums">
                    {format(row.amount)}
                  </span>
                </span>

                <span
                  aria-hidden
                  className="block h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong"
                >
                  <motion.span
                    className={cn(
                      "block h-full origin-left rounded-full transition-colors",
                      isOpen ? "bg-signal" : "bg-cobalt-bright",
                    )}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Math.min(1, row.amount / max) }}
                    transition={
                      motionSafe
                        ? { ...springs.glide, delay: index * stagger }
                        : { duration: durations.base, ease: easings.enter }
                    }
                  />
                </span>
              </button>

              <MerchantPanel
                id={panelId}
                open={isOpen}
                merchants={merchants}
                format={format}
                motionSafe={motionSafe}
              />
            </li>
          );
        })}
      </ul>

      <span className="sr-only" role="status">
        {openRow
          ? `${openRow.label} open, ${format(openRow.amount)}, ${shareOf(
              openRow.amount,
            )} percent of ${format(board)}.`
          : `${rows.length} categories, ${format(board)} total.`}
      </span>
    </div>
  );
}
