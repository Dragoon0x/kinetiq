"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DayFigure = {
  id: string;
  label: string;
  value: number;
  /** @default "neutral" */
  tone?: "neutral" | "success" | "danger";
};

export type DayCategory = {
  id: string;
  label: string;
  value: number;
};

export type DayState = "open" | "totalled" | "closed";

export type DayCloseProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The figures, top to bottom; the last one is read as the net. */
  figures: DayFigure[];
  /** The bars; shares are computed from their sum. */
  categories: DayCategory[];
  /** Controlled state. */
  state?: DayState;
  /** Initial state for uncontrolled usage. @default "open" */
  defaultState?: DayState;
  /** Fires from the press that advanced it. */
  onStateChange?: (state: DayState) => void;
  /** The day, as text. */
  heading: string;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the card. @default "Day close" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's, so server and client print the same
 * string for the same number and the figures never hydrate against themselves.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The offset between one figure's columns — shorter than the cascade between figures. */
const COLUMN_STEP = 0.03;
/** How long the last column takes to land before the bars begin. */
const SETTLE = 0.3;

const TONES = {
  neutral: "text-foreground",
  success: "text-success",
  danger: "text-danger",
} as const;

const CONTROL_LABELS: Record<DayState, string> = {
  open: "Total the day",
  totalled: "Close the day",
  closed: "Closed",
};

/**
 * One figure's digit columns. Each mounts at zero and rolls up to its face on
 * `snap`, offset by the figure's place in the cascade plus a shorter step per
 * column, so the card reads as one sweep. Hidden from assistive technology:
 * the sr-only text beside it carries the amount.
 */
function Figure({
  text,
  delay,
  animated,
  motionSafe,
}: {
  text: string;
  delay: number;
  animated: boolean;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char);
        const key = text.length - index;
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
              initial={animated && motionSafe ? { y: "0%" } : false}
              animate={{ y: `${digit * -10}%` }}
              transition={
                motionSafe
                  ? {
                      ...springs.snap,
                      delay: Number((delay + index * COLUMN_STEP).toFixed(3)),
                    }
                  : { duration: 0 }
              }
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
 * An end-of-day card. Untotalled, the figures read as dashes and the bars sit
 * empty. Totalling reveals the figures in sequence: each one's digit columns
 * mount at zero and roll up on `snap`, offset by `cascade()` per figure and a
 * shorter step per column, so the card reads as a sweep from top to bottom.
 * Once the last column has landed the category bars draw, each fill scaling
 * from the left on `glide` in its own cascade with its share fading in behind.
 * Closing stamps the day: a rotated CLOSED lands over the figures on `recoil`,
 * whose two bounces are ink hitting paper, and the control locks.
 *
 * The card is a labelled group; the figures are a `dl` whose values carry the
 * printed amount (or "not totalled") as text, the bars are a list whose items
 * read label, amount and share, and one button carries the whole flow with a
 * changing label. Under reduced motion the figures appear complete with no
 * roll, the bars fill on a tween, and the stamp fades in without a bounce.
 */
export function DayClose({
  ref,
  figures,
  categories,
  state,
  defaultState = "open",
  onStateChange,
  heading,
  format = defaultFormat,
  label = "Day close",
  className,
}: DayCloseProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState(defaultState);
  const isControlled = state !== undefined;
  const current = isControlled ? state : uncontrolled;
  const revealed = current !== "open";

  // A card that mounts already totalled shows its figures complete; only a
  // change after mount earns the sweep. Committed state, not a ref, so the
  // render that reveals the figures already knows whether to roll them.
  const [seen, setSeen] = React.useState({ state: current, animated: false });
  if (seen.state !== current) {
    setSeen({ state: current, animated: true });
  }
  const animated = seen.animated;

  const advance = () => {
    const next: DayState | null =
      current === "open"
        ? "totalled"
        : current === "totalled"
          ? "closed"
          : null;
    if (!next) return;
    if (!isControlled) setUncontrolled(next);
    onStateChange?.(next);
  };

  const figureStagger = cascade(figures.length);
  const longest = figures.reduce(
    (length, figure) => Math.max(length, format(figure.value).length),
    0,
  );
  // The bars wait for the sweep: the last figure's last column, plus its settle.
  const barsStart =
    animated && motionSafe
      ? Number(
          (
            (figures.length - 1) * figureStagger +
            longest * COLUMN_STEP +
            SETTLE
          ).toFixed(3),
        )
      : 0;
  const barStagger = cascade(categories.length);
  const sum = categories.reduce((acc, category) => acc + category.value, 0);

  const net = figures[figures.length - 1];
  const announcement =
    current === "closed"
      ? "Day closed"
      : current === "totalled" && net
        ? `Totalled, ${net.label.toLowerCase()} ${format(net.value)}`
        : "Open, not totalled";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            id={labelId}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {label}
          </p>
          <p className="truncate text-sm font-semibold">{heading}</p>
        </div>
        <span
          aria-hidden
          className="shrink-0 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {current}
        </span>
      </div>

      <div className="relative">
        <dl className="grid grid-cols-2 gap-3">
          {figures.map((figure, index) => (
            <div
              key={figure.id}
              className="flex min-w-0 flex-col gap-0.5 rounded-2 bg-surface-2 px-3 py-2"
            >
              <dt className="truncate text-[11px] text-ink-3">
                {figure.label}
              </dt>
              <dd
                className={cn(
                  "flex items-center font-mono text-base font-semibold",
                  TONES[figure.tone ?? "neutral"],
                )}
              >
                <span className="sr-only">
                  {revealed ? format(figure.value) : "not totalled"}
                </span>
                {revealed ? (
                  <Figure
                    text={format(figure.value)}
                    delay={index * figureStagger}
                    animated={animated}
                    motionSafe={motionSafe}
                  />
                ) : (
                  <span aria-hidden className="text-ink-3">
                    —
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {/* The stamp sits over the figures, sized by them, and lands on recoil:
            ζ0.53 gives the two bounces of ink hitting paper. */}
        <AnimatePresence initial={false}>
          {current === "closed" ? (
            <motion.span
              key="stamp"
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              initial={motionSafe ? { scale: 1.5, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      ...springs.recoil,
                      opacity: { duration: durations.blink },
                    }
                  : { duration: durations.base, ease: easings.enter }
              }
            >
              <span className="-rotate-12 rounded-2 border-2 border-danger bg-surface-1/70 px-3 py-1 font-mono text-xl font-bold tracking-[0.2em] text-danger uppercase">
                Closed
              </span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <ul className="flex flex-col gap-2">
        {categories.map((category, index) => {
          const share = sum > 0 ? Number((category.value / sum).toFixed(6)) : 0;
          const percent = Math.round(share * 100);
          const delay = Number((barsStart + index * barStagger).toFixed(3));
          return (
            <li key={category.id} className="flex flex-col gap-1">
              <span className="sr-only">
                {revealed
                  ? `${category.label}, ${format(category.value)}, ${percent} percent`
                  : `${category.label}, not totalled`}
              </span>
              <span
                aria-hidden
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <span className="truncate text-ink-2">{category.label}</span>
                <motion.span
                  className="shrink-0 font-mono text-ink-3 tabular-nums"
                  initial={false}
                  animate={{ opacity: revealed ? 1 : 0 }}
                  transition={{
                    duration: durations.fast,
                    delay: revealed ? delay + 0.1 : 0,
                  }}
                >
                  {format(category.value)} · {percent}%
                </motion.span>
              </span>
              <span
                aria-hidden
                className="block h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong"
              >
                <motion.span
                  className="block h-full origin-left rounded-full bg-cobalt-bright"
                  initial={false}
                  animate={{ scaleX: revealed ? share : 0 }}
                  transition={
                    !revealed
                      ? { duration: durations.fast, ease: easings.exit }
                      : motionSafe
                        ? { ...springs.glide, delay }
                        : { duration: durations.base, ease: easings.enter }
                  }
                />
              </span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={advance}
        disabled={current === "closed"}
        className={cn(
          "flex h-9 w-full items-center justify-center rounded-2 border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45",
        )}
      >
        {CONTROL_LABELS[current]}
      </button>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
