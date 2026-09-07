"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PollOption = {
  id: string;
  label: string;
  /** Votes from everyone but this reader. */
  votes: number;
};

export type PollBarsProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Options and their counts, excluding this reader. */
  options: PollOption[];
  /** Controlled vote. */
  value?: string | null;
  /** Initial vote for uncontrolled usage. */
  defaultValue?: string | null;
  /** Fires on vote. */
  onVote?: (id: string) => void;
  /** Let the reader move their vote after casting it. @default true */
  allowChange?: boolean;
  /** The poll question. */
  question: string;
  /** Formats vote counts. @default en-US thousands */
  format?: (value: number) => string;
  className?: string;
};

const formatVotes = (value: number): string =>
  Math.round(value).toLocaleString("en-US");

const formatPercent = (value: number): string => `${Math.round(value)}%`;

type RolledNumberProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * A number that rolls to its target on `glide`. The formatted text is a motion
 * value handed to the span as its child, so the roll runs outside React and
 * re-renders nothing; `tabular-nums` pins the cell width so moving digits can
 * never nudge the layout around them.
 */
function RolledNumber({
  value,
  format,
  motionSafe,
  className,
}: RolledNumberProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the count — only the travel is dropped.
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <span className={cn("font-mono tabular-nums", className)}>
      <span className="sr-only">{format(value)}</span>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  );
}

/**
 * A poll that turns into its own result. Until the reader votes it is a plain
 * radiogroup; the vote reveals the bars, each growing to its share on `glide`
 * in one cascade while the percentages roll and the total climbs. The chosen
 * option stamps its check on `recoil` — ζ0.53, the two bounces of a stamp
 * hitting paper — because casting a vote is the one beat here worth landing.
 *
 * Bars are drawn inside the option rows and the percentage sits in a fixed
 * gutter, so revealing the results shifts nothing: the rows stand exactly where
 * they stood. Moving a vote re-runs the shares together rather than
 * re-cascading. Keyboard: Up and Down (or Left and Right) move and vote, Home
 * and End jump to the ends, Space and Enter cast. Reduced motion sets the bars
 * without spring and swaps the digits.
 */
export function PollBars({
  ref,
  options,
  value,
  defaultValue,
  onVote,
  allowChange = true,
  question,
  format = formatVotes,
  className,
}: PollBarsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const questionId = `${baseId}-question`;

  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue ?? null,
  );
  const current = isControlled ? (value ?? null) : uncontrolled;
  const voted = current !== null;
  const locked = voted && !allowChange;

  // A poll that arrives already voted still cascades on mount; later moves run
  // the bars together, because a re-cascade would read as lag on a re-vote.
  const [cascading, setCascading] = React.useState(
    () => (value ?? defaultValue ?? null) !== null,
  );
  const [focusIndex, setFocusIndex] = React.useState(0);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const tallies = options.map(
    (option) => option.votes + (option.id === current ? 1 : 0),
  );
  const total = tallies.reduce((sum, tally) => sum + tally, 0);
  const checkedIndex = options.findIndex((option) => option.id === current);
  const anchor =
    checkedIndex >= 0
      ? checkedIndex
      : Math.min(focusIndex, Math.max(0, options.length - 1));
  const step = cascade(options.length);

  const vote = (id: string) => {
    if (locked || id === current) return;
    setCascading(current === null);
    if (!isControlled) setUncontrolled(id);
    // Reported from the handler, never from inside a state updater.
    onVote?.(id);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(options.length - 1, Math.max(0, index));
    const option = options[clamped];
    if (!option) return;
    setFocusIndex(clamped);
    buttonRefs.current[clamped]?.focus();
    // A radiogroup selects as it moves — unless the vote is already locked,
    // where the arrows still read the options out.
    if (!locked) vote(option.id);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(options.length - 1);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        vote(options[index]?.id ?? "");
        break;
      default:
        break;
    }
  };

  const hint = !voted
    ? "pick one"
    : allowChange
      ? "arrows move your vote"
      : "vote locked";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <p id={questionId} className="text-sm font-medium text-foreground">
        {question}
      </p>

      <div
        role="radiogroup"
        aria-labelledby={questionId}
        className="flex flex-col gap-1.5"
      >
        {options.map((option, index) => {
          const tally = tallies[index] ?? 0;
          const share = total === 0 ? 0 : tally / total;
          const checked = option.id === current;
          const percent = Math.round(share * 100);
          return (
            <button
              key={option.id}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={locked && !checked ? true : undefined}
              aria-label={
                voted
                  ? `${option.label}, ${percent} percent, ${format(tally)} votes`
                  : option.label
              }
              tabIndex={index === anchor ? 0 : -1}
              onClick={() => vote(option.id)}
              onFocus={() => setFocusIndex(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "relative flex h-11 w-full items-center gap-2.5 overflow-hidden rounded-2 border px-3 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked ? "border-cobalt-bright/60" : "border-hairline",
                locked && !checked
                  ? "cursor-default"
                  : "cursor-pointer hover:border-hairline-strong",
              )}
            >
              {/* The bar lives inside the row, so results reveal without the
                  rows moving a pixel. */}
              <motion.span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 w-full origin-left",
                  checked ? "bg-cobalt-bright/25" : "bg-cobalt-wash",
                )}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: voted ? share : 0 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        delay: cascading ? index * step : 0,
                      }
                    : { duration: 0 }
                }
              />

              <span
                aria-hidden
                className={cn(
                  "relative flex size-4 shrink-0 items-center justify-center rounded-full border",
                  checked
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-hairline-strong bg-surface-0",
                )}
              >
                {checked ? (
                  <motion.svg
                    viewBox="0 0 16 16"
                    className="size-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ originX: 0.5, originY: 0.5 }}
                    initial={motionSafe ? { scale: 1.45, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            opacity: { duration: durations.blink },
                          }
                        : { duration: 0 }
                    }
                  >
                    <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" />
                  </motion.svg>
                ) : null}
              </span>

              <span className="relative min-w-0 flex-1 truncate text-sm text-foreground">
                {option.label}
              </span>

              <motion.span
                aria-hidden
                className="relative w-10 shrink-0 text-right"
                animate={{ opacity: voted ? 1 : 0 }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                <RolledNumber
                  value={voted ? percent : 0}
                  format={formatPercent}
                  motionSafe={motionSafe}
                  className="text-xs font-medium text-foreground"
                />
              </motion.span>
            </button>
          );
        })}
      </div>

      <p
        aria-live="polite"
        className="flex items-baseline gap-1.5 border-t border-hairline pt-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        <RolledNumber
          value={total}
          format={format}
          motionSafe={motionSafe}
          className="text-ink-2"
        />
        <span>votes · {hint}</span>
      </p>
    </div>
  );
}
