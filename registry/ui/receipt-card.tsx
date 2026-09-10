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

export type ReceiptLine = {
  id: string;
  /** The item, written without a full stop; the spoken line adds one. */
  label: string;
  /** How many. Omitted or 1 prints no count. */
  qty?: number;
  /** Runs through `format`, and is summed into the total. */
  amount: number;
};

export type ReceiptCardProps = {
  ref?: React.Ref<HTMLElement>;
  /** Who was paid. */
  merchant: string;
  /** A preformatted date; the card never reads a clock. */
  date: string;
  /** How it was paid, in words. @default "Waylight Pay" */
  method?: string;
  /** An invented reference code printed under the tear. */
  reference?: string;
  /** The item lines, printed in order. */
  lines: ReceiptLine[];
  /** Service, delivery and the like, printed under a rule. */
  extras?: ReceiptLine[];
  /** Controlled fold state. */
  open?: boolean;
  /** Initial fold state for uncontrolled use. @default false */
  defaultOpen?: boolean;
  /** Fires from the summary control and from Escape. */
  onOpenChange?: (open: boolean) => void;
  /** Money formatter. */
  format?: (value: number) => string;
  /** The chip's word. @default "Paid" */
  paidLabel?: string;
  /** The total row's word. @default "Total" */
  totalLabel?: string;
  /** Names the receipt for assistive technology. */
  label?: string;
  className?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** The torn bottom edge: integer teeth, so the path never needs rounding. */
const TEETH = 24;
const TEAR = `M0 0${Array.from(
  { length: TEETH },
  (_, i) => `L${i * 10 + 5} 6L${(i + 1) * 10} 0`,
).join("")}Z`;

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/**
 * The total, rolling up from zero as the row mounts — secondary motion that
 * fires because the roll landed, not on a schedule of its own. The column is
 * ten digits tall, so a `y` of a whole multiple of ten percent moves exactly
 * one digit, and it is hidden from assistive technology because the row's own
 * sentence already carries the figure.
 */
function RollingTotal({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right, so the units column keeps its identity when
        // the figure gains or loses a digit.
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
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={{ y: "0%" }}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
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
 * Paid, and here is the proof. Folded, the receipt is one line — who was paid,
 * when, how much, and a chip that says Paid in words rather than in a colour.
 * Pressing it unrolls the paper: the body's height is measured through a
 * callback ref, so the observer attaches to the node the moment it arrives
 * rather than to whatever a mount-only effect would have found, and the box
 * glides open on `glide` while the lines arrive from 4px up in a `cascade`.
 * The total lands last and rolls up from zero on `snap`.
 *
 * Folding runs the same beat backwards: the lines leave on the exit ease, and
 * Escape folds it from anywhere inside and gives the summary control its focus
 * back. The torn edge is drawn from integer teeth, sized by its container, and
 * painted in the paper's own colour — an opaque edge, not a wash over one.
 * Under reduced motion the lines fade in together and the digits appear at
 * their value: the proof is the point.
 */
export function ReceiptCard({
  ref,
  merchant,
  date,
  method = "Waylight Pay",
  reference,
  lines,
  extras = [],
  open,
  defaultOpen = false,
  onOpenChange,
  format = defaultFormat,
  paidLabel = "Paid",
  totalLabel = "Total",
  label,
  className,
}: ReceiptCardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const bodyId = `${baseId}-body`;
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  };

  // Rounded to cents before anything is summed, spoken or drawn: a float that
  // reaches a string is a float that can differ between two runtimes.
  const cents = [...lines, ...extras].reduce(
    (sum, line) => sum + Math.round(line.amount * 100),
    0,
  );
  const total = cents / 100;
  const count = lines.length + extras.length;

  // The observer attaches to the node when the node arrives, which is the only
  // moment it exists: the body is unmounted while the receipt is folded.
  const observer = React.useRef<ResizeObserver | null>(null);
  const [height, setHeight] = React.useState(0);
  const measure = React.useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      if (next > 0) setHeight((prev) => (prev === next ? prev : next));
    });
    watcher.observe(node);
    observer.current = watcher;
  }, []);
  React.useEffect(() => () => observer.current?.disconnect(), []);

  // Frozen at the moment of the change, in one string, pluralised, and with no
  // second full stop after a figure that already ended the sentence.
  const [spoken, setSpoken] = React.useState(() => ({
    open: isOpen,
    text: "",
  }));
  if (spoken.open !== isOpen) {
    setSpoken({
      open: isOpen,
      text: isOpen
        ? `Receipt open. ${count} ${count === 1 ? "line" : "lines"}, total ${format(total)}.`
        : "Receipt folded.",
    });
  }

  const stagger = cascade(count + 1);
  const printed = [...lines, ...extras];
  // Each line arrives from a nudge above, the way a roll of paper feeds out.
  const rise = motionSafe
    ? { opacity: 0, y: -distances.nudge }
    : { opacity: 0 };

  return (
    <section
      ref={ref}
      aria-label={label ?? `Receipt from ${merchant}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        aria-label={`${merchant}, ${format(total)}, paid on ${date}. ${
          isOpen ? "Fold the receipt." : "Open the receipt."
        }`}
        onClick={() => setOpen(!isOpen)}
        className="-m-1 flex items-center gap-2.5 rounded-2 p-1 text-left transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <motion.svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0 text-ink-3"
          style={{ originX: 0.5, originY: 0.5 }}
          initial={false}
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={motionSafe ? springs.snap : { duration: durations.blink }}
        >
          <path d="M6 3.5 10.5 8 6 12.5" />
        </motion.svg>

        <span aria-hidden className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{merchant}</span>
          <span className="truncate text-[11px] leading-snug text-ink-3">
            {`${method} · ${date}`}
          </span>
        </span>

        <span
          aria-hidden
          className="rounded-full border border-success/50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-success uppercase"
        >
          {paidLabel}
        </span>

        {/* The figure lives in the total row once the receipt is open, so the
            card never shows the same number twice. */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: isOpen ? 0 : 1 }}
          transition={FADE}
          className="shrink-0 font-mono text-sm font-medium tabular-nums"
        >
          {format(total)}
        </motion.span>
      </button>

      <motion.div
        id={bodyId}
        initial={false}
        animate={{ height: isOpen ? height : 0 }}
        transition={motionSafe ? springs.glide : FADE}
        className="overflow-hidden"
      >
        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              key="roll"
              ref={measure}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              className="pt-2.5"
            >
              <div className="rounded-t-2 border border-b-0 border-hairline bg-surface-0 px-3 pt-2.5 pb-1">
                <ol role="list" className="flex flex-col">
                  {printed.map((line, index) => {
                    const many = line.qty !== undefined && line.qty > 1;
                    return (
                      <motion.li
                        key={line.id}
                        initial={rise}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          motionSafe
                            ? { ...springs.glide, delay: index * stagger }
                            : FADE
                        }
                        className={cn(
                          "flex items-baseline justify-between gap-3 py-1",
                          index === lines.length && lines.length > 0
                            ? "mt-1 border-t border-dashed border-hairline pt-2"
                            : null,
                        )}
                      >
                        <span className="sr-only">
                          {`${line.label}, ${many ? `${line.qty} of them, ` : ""}${format(line.amount)}.`}
                        </span>
                        <span
                          aria-hidden
                          className="min-w-0 truncate text-xs"
                          title={line.label}
                        >
                          {many ? `${line.qty}× ` : ""}
                          {line.label}
                        </span>
                        <span
                          aria-hidden
                          className="shrink-0 font-mono text-xs text-ink-2 tabular-nums"
                        >
                          {format(line.amount)}
                        </span>
                      </motion.li>
                    );
                  })}
                </ol>

                <motion.div
                  initial={rise}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? { ...springs.glide, delay: count * stagger }
                      : FADE
                  }
                  className="mt-1 flex items-baseline justify-between gap-3 border-t border-hairline pt-2"
                >
                  <span className="sr-only">
                    {`${totalLabel}, ${format(total)}.`}
                  </span>
                  <span
                    aria-hidden
                    className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase"
                  >
                    {totalLabel}
                  </span>
                  <span className="font-mono text-sm font-semibold text-ink">
                    <RollingTotal
                      value={format(total)}
                      motionSafe={motionSafe}
                    />
                  </span>
                </motion.div>

                {reference ? (
                  <p className="pt-1.5 pb-1 font-mono text-[10px] text-ink-3">
                    {`Reference ${reference}`}
                  </p>
                ) : null}
              </div>

              {/* Painted in the paper's own colour, so the teeth read as a torn
                  edge rather than as a tint laid over the card. */}
              <svg
                aria-hidden
                viewBox={`0 0 ${TEETH * 10} 6`}
                preserveAspectRatio="none"
                className="block h-1.5 w-full fill-surface-0"
              >
                <path d={TEAR} />
              </svg>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.text}
      </span>
    </section>
  );
}
