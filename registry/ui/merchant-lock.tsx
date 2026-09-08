"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MerchantGlyph =
  "cart" | "fuel" | "stream" | "travel" | "dining" | "cash";

export type MerchantCategory = {
  id: string;
  /** Category name, as the statement prints it. */
  label: string;
  /** Typical spend per `period` in this category. */
  amount: number;
  /** Drawn mark beside the name. @default "cart" */
  glyph?: MerchantGlyph;
};

export type MerchantLockProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The rules, in the order they should read. */
  categories?: MerchantCategory[];
  /** Controlled ids of the locked categories. */
  locked?: string[];
  /** Initial locked ids for uncontrolled usage. */
  defaultLocked?: string[];
  /** Fires from the click or key that toggled a lock; `id` is `"*"` for the sweep. */
  onLockedChange?: (
    locked: string[],
    changed: { id: string; locked: boolean },
  ) => void;
  /** Formats every amount; the list never invents a currency. */
  format?: (value: number) => string;
  /** Suffix on the row amounts and the total. @default "a month" */
  period?: string;
  /** Visible heading, also the group's name. */
  label?: string;
  /** Renders the header control that locks or opens every row. @default true */
  showLockAll?: boolean;
  /** Locks the rules themselves; every switch goes inert. */
  disabled?: boolean;
  className?: string;
};

const DEFAULT_CATEGORIES: MerchantCategory[] = [
  { id: "groceries", label: "Groceries", amount: 340, glyph: "cart" },
  { id: "fuel", label: "Fuel", amount: 120, glyph: "fuel" },
  { id: "streaming", label: "Streaming", amount: 36, glyph: "stream" },
  { id: "travel", label: "Travel", amount: 480, glyph: "travel" },
  { id: "dining", label: "Dining", amount: 210, glyph: "dining" },
  { id: "cash", label: "Cash withdrawal", amount: 150, glyph: "cash" },
];

/** Explicit locale: the server and the first client render must agree. */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const formatMoney = (value: number): string => MONEY.format(value);

const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const NO_IDS: string[] = [];

/** Line marks, drawn rather than shipped — the registry carries no assets. */
const GLYPHS: Record<MerchantGlyph, React.ReactNode> = {
  cart: (
    <>
      <path d="M1.75 3h1.6l1.9 7.3h6.6L13.6 5H4.1" />
      <circle cx="6.4" cy="13" r="1.05" />
      <circle cx="11.4" cy="13" r="1.05" />
    </>
  ),
  fuel: (
    <>
      <path d="M3 13.6V3.6A1.6 1.6 0 0 1 4.6 2h3.1a1.6 1.6 0 0 1 1.6 1.6v10" />
      <path d="M1.9 13.6h8.9M3.9 6.4h4.5" />
      <path d="M11 5.6 12.9 7v4.8a1.05 1.05 0 0 0 2.1 0V4.9L13.1 3.4" />
    </>
  ),
  stream: (
    <>
      <rect x="1.6" y="3.2" width="12.8" height="9.6" rx="1.6" />
      <path d="M6.9 6.4 10 8l-3.1 1.6Z" />
    </>
  ),
  travel: (
    <>
      <rect x="1.9" y="5" width="12.2" height="8.4" rx="1.4" />
      <path d="M5.9 5V3.5a1.1 1.1 0 0 1 1.1-1.1h2a1.1 1.1 0 0 1 1.1 1.1V5" />
    </>
  ),
  dining: (
    <>
      <path d="M4 2.2v5.2M6.2 2.2v5.2M5.1 7.4V13.8" />
      <path d="M11.6 2.2c-1.1 1.4-1.3 3.4 0 4.7v6.9" />
    </>
  ),
  cash: (
    <>
      <rect x="1.6" y="4" width="12.8" height="8" rx="1.4" />
      <circle cx="8" cy="8" r="1.8" />
    </>
  ),
};

/**
 * A figure whose digits roll to their new place on `snap`. The column is ten
 * faces tall, so a `y` of one tenth of its own height moves exactly one digit;
 * a `1ch` `tabular-nums` cell keeps a rolling digit from nudging the word beside
 * it. Hidden from assistive technology — the plain figure sits beside it.
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
        const digit = FACES.indexOf(char as (typeof FACES)[number]);
        // Keyed from the right, so the units column keeps its identity when the
        // figure gains or loses a digit and only the new column mounts.
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
              {FACES.map((face) => (
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

/**
 * The padlock, drawn at exactly 16px so one SVG user unit is one pixel and the
 * shackle's lift is the same distance in any row. Closing drops the hasp on
 * `flick` — a lock is an acknowledgement, not a journey — while the body stays
 * put, so it reads as one object closing rather than two shapes swapping.
 */
function Padlock({
  locked,
  motionSafe,
  delay,
}: {
  locked: boolean;
  motionSafe: boolean;
  delay: number;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <motion.g
        style={{ originX: 0.5, originY: 0.5 }}
        initial={false}
        animate={{ y: locked ? 0 : -2.6 }}
        transition={motionSafe ? { ...springs.flick, delay } : { duration: 0 }}
      >
        <path d="M5.6 8.2V5.9a2.4 2.4 0 0 1 4.8 0v2.3" />
      </motion.g>
      <rect x="3.2" y="8" width="9.6" height="6.2" rx="1.6" />
      <path d="M8 10.4v1.6" />
    </svg>
  );
}

/**
 * A card's spending rules, one row per merchant category. Locking a row closes
 * the hasp on `flick`, dims the row on a colour tween and strikes its amount,
 * so the state is carried by shape and text rather than tone alone. Under the
 * list the allowed figure — the sum of every open category — rolls to its new
 * place on `snap`, the indicator spring, in a `1ch` `tabular-nums` cell that no
 * rolling digit can nudge.
 *
 * The header control sweeps every row at once, and that sweep staggers by
 * `cascade(n)` so a wall of locks closes in sequence instead of flashing; a
 * single toggle carries no delay, because one lock should answer immediately.
 * Every switch is a real `role="switch"` button named by its row, so Tab
 * reaches each one and Space toggles it.
 *
 * Under reduced motion the hasp is drawn already closed or open, the row dims
 * on a tween, the figure swaps in place and the sweep applies to every row at
 * once — the rules still change, because what a card may pay for is
 * information rather than flourish.
 */
export function MerchantLock({
  ref,
  categories = DEFAULT_CATEGORIES,
  locked,
  defaultLocked = NO_IDS,
  onLockedChange,
  format = formatMoney,
  period = "a month",
  label = "Where this card can spend",
  showLockAll = true,
  disabled = false,
  className,
}: MerchantLockProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const [uncontrolled, setUncontrolled] =
    React.useState<string[]>(defaultLocked);
  const isControlled = locked !== undefined;
  const current = isControlled ? locked : uncontrolled;
  const lockedSet = React.useMemo(() => new Set(current), [current]);

  // A sweep staggers; a single toggle does not. Storing which kind of change
  // happened keeps the delay out of the render's guesswork.
  const [swept, setSwept] = React.useState(false);
  const [note, setNote] = React.useState("");

  const count = categories.length;
  const lockedCount = categories.filter((entry) =>
    lockedSet.has(entry.id),
  ).length;
  const allLocked = count > 0 && lockedCount === count;
  const openCount = count - lockedCount;
  const total = categories.reduce(
    (sum, entry) => (lockedSet.has(entry.id) ? sum : sum + entry.amount),
    0,
  );
  const step = cascade(count);
  const totalText = format(total);

  const commit = (next: string[], changed: { id: string; locked: boolean }) => {
    if (!isControlled) setUncontrolled(next);
    onLockedChange?.(next, changed);
  };

  const toggle = (entry: MerchantCategory) => {
    if (disabled) return;
    const nextLocked = !lockedSet.has(entry.id);
    const next = nextLocked
      ? [...current, entry.id]
      : current.filter((id) => id !== entry.id);
    setSwept(false);
    setNote(`${entry.label} ${nextLocked ? "locked" : "opened"}.`);
    commit(next, { id: entry.id, locked: nextLocked });
  };

  const sweep = () => {
    if (disabled) return;
    const nextLocked = !allLocked;
    setSwept(true);
    setNote(nextLocked ? "Every category locked." : "Every category opened.");
    commit(nextLocked ? categories.map((entry) => entry.id) : [], {
      id: "*",
      locked: nextLocked,
    });
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        {showLockAll ? (
          <button
            type="button"
            onClick={sweep}
            disabled={disabled}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none",
              "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45",
            )}
          >
            {allLocked ? "Open all" : "Lock all"}
          </button>
        ) : null}
      </div>

      <ul aria-labelledby={labelId} className="flex flex-col">
        {categories.map((entry, index) => {
          const isLocked = lockedSet.has(entry.id);
          const rowLabelId = `${uid}-row-${entry.id}`;
          const delay = swept ? index * step : 0;
          return (
            <li
              key={entry.id}
              className="flex h-11 items-center gap-3 border-b border-hairline last:border-b-0"
            >
              <motion.span
                aria-hidden
                className="shrink-0 text-ink-3"
                initial={false}
                animate={{ opacity: isLocked ? 0.55 : 1 }}
                transition={{
                  duration: durations.fast,
                  ease: easings.enter,
                  delay: motionSafe ? delay : 0,
                }}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 shrink-0"
                >
                  {GLYPHS[entry.glyph ?? "cart"]}
                </svg>
              </motion.span>

              <span
                id={rowLabelId}
                className="min-w-0 flex-1 truncate text-sm text-foreground"
              >
                {entry.label}
              </span>

              {/* Only the amount dims and strikes: the name keeps full contrast
                  so a switched-off row never becomes hard to read. */}
              <motion.span
                aria-hidden
                className={cn(
                  "shrink-0 font-mono text-[11px] tabular-nums",
                  isLocked ? "text-ink-3 line-through" : "text-ink-2",
                )}
                initial={false}
                animate={{ opacity: isLocked ? 0.75 : 1 }}
                transition={{
                  duration: durations.fast,
                  ease: easings.enter,
                  delay: motionSafe ? delay : 0,
                }}
              >
                {format(entry.amount)}
              </motion.span>

              <button
                type="button"
                role="switch"
                aria-checked={isLocked}
                aria-labelledby={rowLabelId}
                disabled={disabled}
                onClick={() => toggle(entry)}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-2 border transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  disabled
                    ? "border-hairline text-ink-3 opacity-45"
                    : isLocked
                      ? "border-hairline-strong bg-surface-2 text-foreground hover:bg-accent"
                      : "border-hairline text-ink-3 hover:bg-accent hover:text-foreground",
                )}
              >
                <Padlock
                  locked={isLocked}
                  motionSafe={motionSafe}
                  delay={delay}
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Allowed
          </span>
          <span className="flex items-baseline gap-1">
            <span className="font-mono text-base font-medium">
              <Rolling value={totalText} motionSafe={motionSafe} />
            </span>
            <span className="truncate text-[11px] text-ink-3">{period}</span>
            <span className="sr-only">
              {totalText} {period}
            </span>
          </span>
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {lockedCount} of {count} locked
        </span>
      </div>

      <p role="status" className="sr-only">
        {note} {totalText} {period} allowed across {openCount} of {count}{" "}
        categories.
      </p>
    </div>
  );
}
