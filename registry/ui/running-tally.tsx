"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TallyEntry = {
  id: string;
  /** What the movement was. */
  label: string;
  /** Signed major units: positive credits, negative debits. */
  amount: number;
  /** A short qualifier — "cleared", "same day". */
  note?: string;
};

export type RunningTallyProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The movements, newest first. */
  entries: TallyEntry[];
  /** The figure the entries move from. @default 0 */
  openingBalance?: number;
  /** Rows kept on screen; older ones leave on the exit ease. @default 5 */
  max?: number;
  /** Names the tally and titles the total. */
  label: string;
  /** Formats the total. */
  format?: (value: number) => string;
  /** Formats a row's amount; the sign always shows. */
  formatDelta?: (value: number) => string;
  /** Fires from the effect that observes a new total, never during render. */
  onTotalChange?: (total: number) => void;
  className?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const signed = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});

const defaultFormat = (value: number) => currency.format(value);
const defaultFormatDelta = (value: number) => signed.format(value);

const DIGITS = "0123456789";

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The total. Each column is a ten-face strip moved by a tenth of its own height,
 * so one `y` is exactly one digit. It rolls on `glide` because the total is
 * being pushed by the same layout event that moved the list, and the cascade
 * starts at the units so the small wheels stop first.
 */
function RollingAmount({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  const chars = text.split("");
  const stagger = cascade(chars.length);

  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char);
        // Keyed from the right so the units column survives a change of length.
        const key = chars.length - index;
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
              transition={
                motionSafe
                  ? {
                      ...springs.glide,
                      delay: (chars.length - 1 - index) * stagger,
                    }
                  : { duration: 0 }
              }
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

/**
 * A ledger that keeps its own score. Each new movement arrives from the side its
 * sign points to — a credit from the right, a debit from the left, a `shift` of
 * travel on `snap` — while the list makes room by animating its height on
 * `glide`, so the rows below are pushed rather than teleported. Past `max` the
 * oldest row leaves on the exit ease, which accelerates away instead of
 * springing.
 *
 * The total rolls its digits on `glide`, and a hairline under it wipes toward
 * the side the movement came from before fading. That rail is the only
 * celebration in the instrument: a withdrawal gets the same physics as a
 * deposit, in the other direction. Nothing here runs on a clock — entries arrive
 * because the host passed them — and the settled total is reported through
 * `onTotalChange` from the effect that observed it.
 *
 * The list is an ordered list of rows whose direction is spoken ("Credit") as
 * well as drawn, and the total is announced politely. Under reduced motion rows
 * fade into place with no side travel and the digits swap, but the order and the
 * total still change, because they are the record.
 */
export function RunningTally({
  ref,
  entries,
  openingBalance = 0,
  max = 5,
  label,
  format = defaultFormat,
  formatDelta = defaultFormatDelta,
  onTotalChange,
  className,
}: RunningTallyProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const total = entries.reduce(
    (sum, entry) => sum + entry.amount,
    openingBalance,
  );

  const head = entries[0];
  // A genuinely new head is what raises the direction rail; comparing ids in
  // committed state means a re-render with the same list never replays it.
  const [seen, setSeen] = React.useState({ id: head?.id ?? "", seq: 0 });
  if (seen.id !== (head?.id ?? "")) {
    setSeen({ id: head?.id ?? "", seq: seen.seq + 1 });
  }
  const arrival = seen.seq > 0 && head ? head : null;
  const arrivalUp = (arrival?.amount ?? 0) > 0;

  const totalRef = useLatest(onTotalChange);
  React.useEffect(() => {
    totalRef.current?.(total);
  }, [total, totalRef]);

  const visible = entries.slice(0, Math.max(1, max));

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span
            id={labelId}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {label}
          </span>
          <span className="relative inline-flex font-mono text-2xl leading-none font-medium text-ink">
            <RollingAmount text={format(total)} motionSafe={motionSafe} />
            {arrival ? (
              <motion.span
                // Keyed by the arrival, so the rail replays for each movement
                // and never needs a timer to clear itself.
                key={seen.seq}
                aria-hidden
                style={{ originX: arrivalUp ? 0 : 1 }}
                className={cn(
                  "absolute -bottom-1.5 left-0 h-0.5 w-full rounded-full",
                  arrivalUp ? "bg-success" : "bg-danger",
                )}
                initial={
                  motionSafe ? { scaleX: 0, opacity: 1 } : { opacity: 1 }
                }
                animate={{ scaleX: 1, opacity: 0 }}
                transition={{
                  scaleX: motionSafe ? springs.glide : { duration: 0 },
                  opacity: {
                    duration: durations.slow,
                    delay: durations.base,
                    ease: easings.exit,
                  },
                }}
              />
            ) : null}
          </span>
        </div>

        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* No gap between rows: a leaving row animates its own height to nothing,
          and a gap is space that cannot animate with it. */}
      <ol aria-labelledby={labelId} className="flex flex-col">
        <AnimatePresence initial={false}>
          {visible.map((entry, index) => {
            const up = entry.amount > 0;
            return (
              <motion.li
                key={entry.id}
                className="overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0, transition: exitFor() }}
                transition={
                  motionSafe
                    ? springs.glide
                    : { duration: durations.fast, ease: easings.enter }
                }
              >
                <motion.div
                  // The rule sits on top of every row but the first, so it
                  // belongs to the row that owns it and collapses with it.
                  className={cn(
                    "flex items-center gap-2.5 py-2",
                    index > 0 && "border-t border-hairline",
                  )}
                  initial={{
                    x: motionSafe
                      ? up
                        ? distances.shift
                        : -distances.shift
                      : 0,
                  }}
                  animate={{ x: 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                >
                  <span
                    role="img"
                    aria-label={up ? "Credit" : "Debit"}
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full",
                      up
                        ? "bg-success/10 text-success"
                        : "bg-danger/10 text-danger",
                    )}
                  >
                    <svg
                      viewBox="0 0 12 12"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3"
                    >
                      {up ? (
                        <path d="M6 9.5v-7M3 5.5 6 2.5l3 3" />
                      ) : (
                        <path d="M6 2.5v7M3 6.5 6 9.5l3-3" />
                      )}
                    </svg>
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      title={entry.label}
                      className="truncate text-sm text-foreground"
                    >
                      {entry.label}
                    </span>
                    {entry.note ? (
                      <span className="truncate text-[11px] text-ink-3">
                        {entry.note}
                      </span>
                    ) : null}
                  </span>

                  <span
                    className={cn(
                      "shrink-0 font-mono text-sm tabular-nums",
                      up ? "text-success" : "text-foreground",
                    )}
                  >
                    {formatDelta(entry.amount)}
                  </span>
                </motion.div>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {/* The empty line lives inside the list, so an empty tally costs no
            gap of its own between the total and the words. */}
        {entries.length === 0 ? (
          <li className="py-2 text-xs text-ink-3">No movements yet.</li>
        ) : null}
      </ol>

      <span role="status" className="sr-only">
        {arrival
          ? `Total ${format(total)} after a ${
              arrivalUp ? "credit" : "debit"
            } of ${format(Math.abs(arrival.amount))}`
          : ""}
      </span>
    </div>
  );
}
