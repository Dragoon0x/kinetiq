"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DueStatus = "due" | "overdue" | "paid";

export type DueBadgeProps = {
  ref?: React.Ref<HTMLSpanElement>;
  /** The standing. Changing it runs the wash, the label slide and the state's own motion. @default "due" */
  status?: DueStatus;
  /** Whole days until the due date, or since it when overdue; drives the label. */
  days?: number;
  /** Optional figure printed after the label. */
  amount?: number;
  /** Turns `amount` into its printed string. */
  format?: (value: number) => string;
  /** Overrides the generated label for any state. */
  labels?: Partial<Record<DueStatus, string>>;
  /** `sm` is the row badge, `md` the card badge. @default "md" */
  size?: "sm" | "md";
  /** What the badge is about ("Invoice 4821"), spoken before the state. */
  name?: string;
  /** Keeps the polite live region that reads the new state. @default true */
  announce?: boolean;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on a line a reader is told out loud.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const TONES: Record<DueStatus, { pill: string; wash: string; ring: string }> = {
  due: {
    pill: "bg-cobalt-wash text-cobalt-bright",
    wash: "bg-cobalt-bright/20",
    ring: "border-cobalt-bright/40",
  },
  overdue: {
    pill: "bg-danger/12 text-danger",
    wash: "bg-danger/25",
    ring: "border-danger/50",
  },
  paid: {
    pill: "bg-success/14 text-success",
    wash: "bg-success/25",
    ring: "border-success/40",
  },
};

const plural = (count: number, unit: string) =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

function defaultLabel(status: DueStatus, days?: number) {
  if (status === "paid") return "Paid";
  if (days === undefined) return status === "overdue" ? "Overdue" : "Due";
  if (status === "overdue") {
    return days <= 0 ? "Overdue" : `Overdue by ${plural(days, "day")}`;
  }
  if (days <= 0) return "Due today";
  return `Due in ${plural(days, "day")}`;
}

/**
 * Due, overdue, paid — one pill that carries an invoice's whole standing.
 *
 * A change of `status` runs a wash: a tinted layer wipes across the pill from
 * the left on the base tween while the pill's own colour transitions beneath it,
 * and the label swaps by sliding — the old words leave upward on the exit ease,
 * the new words arrive from below on `snap`, both taken out of flow so the two
 * never stack. The pill's width follows the new label on `glide`, measured
 * rather than guessed, so `Due in 4 days` becoming `Paid` closes instead of
 * snapping.
 *
 * Overdue is the only state that gets ambient motion: a ring outside the pill
 * breathes on `drift`, mirrored, because an unpaid invoice is the one thing here
 * that should keep asking. Paid stamps — the tick draws with `pathLength` on
 * `flick` and the pill lands from 1.06 to 1 on `recoil`, two visible bounces and
 * a settle. Colour never carries the state alone: each has its own glyph and its
 * own words, spoken once through a polite live region. Under reduced motion the
 * colour transitions, the label cross-fades in place, the tick is already drawn,
 * and nothing pulses.
 */
export function DueBadge({
  ref,
  status = "due",
  days,
  amount,
  format = defaultFormat,
  labels,
  size = "md",
  name,
  announce = true,
  className,
}: DueBadgeProps) {
  const motionSafe = useMotionSafe();
  const pillRef = React.useRef<HTMLSpanElement | null>(null);
  const sizerRef = React.useRef<HTMLSpanElement | null>(null);
  const [measured, setMeasured] = React.useState(0);

  const label = labels?.[status] ?? defaultLabel(status, days);
  const tone = TONES[status];
  const amountText = amount === undefined ? null : format(amount);

  // The label box is measured, never guessed: a hidden sizer carries the
  // current words at their natural width and the visible box glides to it, so
  // the pill resizes without a layout animation fighting the slide inside it.
  React.useEffect(() => {
    const node = sizerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setMeasured(node.offsetWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The stamp is imperative because it plays once, on arrival, rather than
  // describing a state the pill stays in. `[1.06, 1]` is exactly two keyframes,
  // which is all a spring may carry.
  const previous = React.useRef<DueStatus | null>(null);
  React.useEffect(() => {
    const was = previous.current;
    previous.current = status;
    const node = pillRef.current;
    if (!node || !motionSafe) return;
    if (status !== "paid" || was === null || was === "paid") return;
    const controls = animate(node, { scale: [1.06, 1] }, springs.recoil);
    return () => controls.stop();
  }, [status, motionSafe]);

  const sentence = [
    name,
    status === "paid"
      ? "paid"
      : status === "overdue"
        ? days === undefined || days <= 0
          ? "overdue"
          : `overdue by ${plural(days, "day")}`
        : days === undefined
          ? "due"
          : days <= 0
            ? "due today"
            : `due in ${plural(days, "day")}`,
    amountText,
  ]
    .filter(Boolean)
    .join(", ");

  const box =
    size === "sm"
      ? "h-6 gap-1.5 px-2 text-[11px]"
      : "h-7 gap-1.5 px-2.5 text-xs";
  const glyph = size === "sm" ? "size-3" : "size-3.5";

  return (
    <span
      ref={ref}
      className={cn("relative inline-flex max-w-full", className)}
    >
      {/* The pulse lives outside the pill, which is clipped for the wash. */}
      <AnimatePresence initial={false}>
        {status === "overdue" && motionSafe ? (
          <motion.span
            key="pulse"
            aria-hidden
            className={cn(
              "pointer-events-none absolute -inset-0.5 rounded-full border",
              tone.ring,
            )}
            initial={{ opacity: 0.55, scale: 1 }}
            animate={{ opacity: 0.05, scale: 1.05 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              ...springs.drift,
              repeat: Infinity,
              repeatType: "mirror",
            }}
          />
        ) : null}
      </AnimatePresence>

      <span
        ref={pillRef}
        aria-hidden
        className={cn(
          "relative isolate inline-flex items-center overflow-hidden rounded-full font-medium transition-colors",
          box,
          tone.pill,
        )}
      >
        {/* The wipe is keyed by state, so each change draws its own pass and
            the last one fades out from under it rather than jumping away. */}
        <AnimatePresence initial={false}>
          {motionSafe ? (
            <motion.span
              key={status}
              className={cn("absolute inset-0 -z-10", tone.wash)}
              style={{ originX: 0 }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            />
          ) : null}
        </AnimatePresence>

        <span
          className={cn("relative grid shrink-0 place-items-center", glyph)}
        >
          <motion.svg
            viewBox="0 0 16 16"
            className={cn("col-start-1 row-start-1", glyph)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ opacity: status === "due" ? 1 : 0 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.6V8l2.2 1.6" />
          </motion.svg>
          <motion.svg
            viewBox="0 0 16 16"
            className={cn("col-start-1 row-start-1", glyph)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ opacity: status === "overdue" ? 1 : 0 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.8v3.6" />
            <path d="M8 11.1h.01" />
          </motion.svg>
          <motion.svg
            viewBox="0 0 16 16"
            className={cn("col-start-1 row-start-1", glyph)}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ opacity: status === "paid" ? 1 : 0 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <motion.path
              d="M3.4 8.4 6.4 11.4 12.6 4.8"
              pathLength={1}
              initial={false}
              // The draw is the acknowledgement: instant under reduced motion,
              // never absent.
              animate={{ pathLength: status === "paid" ? 1 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </motion.svg>
        </span>

        <motion.span
          className="relative block min-w-0 overflow-hidden"
          initial={false}
          animate={{ width: measured || "auto" }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          {/* `w-max`, not a block that would fill the box it is measuring:
              the sizer has to report the words' own width, or the box would
              simply measure itself. */}
          <span
            ref={sizerRef}
            aria-hidden
            className="invisible block w-max whitespace-nowrap"
          >
            {label}
          </span>
          {/* Both labels are absolute, so the outgoing one leaves from where it
              stood while the incoming one rises into the same slot — no mode
              needed to keep them from stacking. */}
          <AnimatePresence initial={false}>
            <motion.span
              key={label}
              className="absolute inset-0 whitespace-nowrap"
              initial={
                motionSafe
                  ? { y: distances.step, opacity: 0 }
                  : { opacity: 0, y: 0 }
              }
              animate={{ y: 0, opacity: 1 }}
              exit={{
                y: motionSafe ? -distances.step : 0,
                opacity: 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </motion.span>

        {amountText ? (
          <span className="shrink-0 font-mono tabular-nums opacity-80">
            {amountText}
          </span>
        ) : null}
      </span>

      {/* One voice: the pill is decoration to a reader, and the whole standing
          arrives here as a sentence, once. */}
      <span role={announce ? "status" : undefined} className="sr-only">
        {sentence}
      </span>
    </span>
  );
}
