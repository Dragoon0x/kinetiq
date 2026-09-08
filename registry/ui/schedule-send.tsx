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

export type ScheduleMode = "now" | "scheduled";
export type ScheduleRepeat = "once" | "weekly" | "monthly";

export type ScheduleValue = {
  mode: ScheduleMode;
  /** Days after `baseDate` the transfer leaves. Ignored while mode is "now". */
  offsetDays: number;
  repeat: ScheduleRepeat;
};

export type ScheduleSendProps = {
  /** Controlled schedule. */
  value?: ScheduleValue;
  /** Initial schedule for uncontrolled usage. */
  defaultValue?: ScheduleValue;
  /** Fires from the control that changed. */
  onValueChange?: (value: ScheduleValue) => void;
  /** The sum being scheduled; drives the summary sentence. */
  amount: number;
  /** Formats every amount the component prints. */
  format?: (value: number) => string;
  /** ISO `YYYY-MM-DD` the offset counts from, read in UTC. */
  baseDate?: string;
  /** Furthest schedulable day. @default 60 */
  maxOffsetDays?: number;
  /** Visible group label. @default "Send" */
  label?: string;
  className?: string;
};

const DAY_MS = 86_400_000;
const MIN_OFFSET = 1;

const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** One formatter for the file: money must read identically in every line. */
const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

/**
 * Dates are anchored to a prop and stepped in whole UTC days: a render that
 * sampled "today" would disagree with the markup the server sent.
 */
const parseBase = (iso: string): number => {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1);
};

const formatDate = (ms: number): string => {
  const date = new Date(ms);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};

const MODE_OPTIONS: { value: ScheduleMode; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "scheduled", label: "Scheduled" },
];

const REPEAT_OPTIONS: { value: ScheduleRepeat; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const REPEAT_WORDS: Record<ScheduleRepeat, string | null> = {
  once: null,
  weekly: "then every week",
  monthly: "then every month",
};

type SegmentsProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
  idBase: string;
  knobId: string;
  labelledBy: string;
  motionSafe: boolean;
};

/**
 * Both pickers are one instrument: a radiogroup with a roving tabindex, arrows
 * that step without wrapping, and a single knob that travels on `snap`.
 */
function Segments<T extends string>({
  options,
  value,
  onSelect,
  idBase,
  knobId,
  labelledBy,
  motionSafe,
}: SegmentsProps<T>) {
  const current = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const focusAt = (index: number) => {
    const option = options[Math.min(options.length - 1, Math.max(0, index))];
    if (!option) return;
    document.getElementById(`${idBase}-${option.value}`)?.focus();
    onSelect(option.value);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const { key } = event;
    if (key === "ArrowRight" || key === "ArrowDown") focusAt(index + 1);
    else if (key === "ArrowLeft" || key === "ArrowUp") focusAt(index - 1);
    else if (key === "Home") focusAt(0);
    else if (key === "End") focusAt(options.length - 1);
    else if (key === " ") onSelect(options[index]?.value ?? value);
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex h-9 w-full items-stretch rounded-full border border-hairline bg-surface-2 p-1"
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            id={`${idBase}-${option.value}`}
            aria-checked={checked}
            tabIndex={index === current ? 0 : -1}
            onClick={() => onSelect(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "relative flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-full px-2 text-xs font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              checked
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {checked &&
              (motionSafe ? (
                <motion.span
                  aria-hidden
                  layoutId={knobId}
                  transition={springs.snap}
                  className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                />
              ))}
            <span className="relative truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onPress,
  back,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  back?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-input bg-surface-1 text-ink-2 transition-colors outline-none",
        "hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5 shrink-0"
      >
        <path d={back ? "M9.5 4 5.5 8l4 4" : "M6.5 4l4 4-4 4"} />
      </svg>
    </button>
  );
}

/**
 * Now, later, or every month. A two-stop control decides when the money leaves;
 * one knob travels between the stops on `snap`. Choosing Scheduled unfolds a
 * date spinbutton and a repeat picker whose height is measured rather than
 * reserved, gliding open on `glide` and closing to a true zero. Underneath, the
 * summary rewrites itself token by token: only the words that changed leave and
 * arrive, the survivors sliding across to close the gap.
 *
 * Both pickers are radiogroups with a roving tabindex; the date is a spinbutton
 * where arrows move a day and Page keys move a week. Under reduced motion the
 * knobs swap instantly, the panel opens without a spring, and the summary
 * cross-fades in place — the sentence still rewrites, because it is the answer.
 */
export function ScheduleSend({
  value,
  defaultValue,
  onValueChange,
  amount,
  format = defaultFormat,
  baseDate = "2026-04-13",
  maxOffsetDays = 60,
  label = "Send",
  className,
}: ScheduleSendProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const repeatLabelId = `${baseId}-repeat-label`;

  const [uncontrolled, setUncontrolled] = React.useState<ScheduleValue>(
    defaultValue ?? { mode: "now", offsetDays: 1, repeat: "once" },
  );
  const current = value ?? uncontrolled;

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // The measurement is taken in the observer's own callback, which fires once
    // on observe() — so the panel never needs a synchronous read in the effect.
    const observer = new ResizeObserver(() =>
      setPanelHeight(node.offsetHeight),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const commit = (next: ScheduleValue) => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const setOffset = (days: number) => {
    const offsetDays = Math.min(maxOffsetDays, Math.max(MIN_OFFSET, days));
    if (offsetDays === current.offsetDays) return;
    commit({ ...current, offsetDays });
  };

  const scheduled = current.mode === "scheduled";
  const dateMs = parseBase(baseDate) + current.offsetDays * DAY_MS;
  const dateLabel = formatDate(dateMs);
  const relative =
    current.offsetDays === 1 ? "tomorrow" : `in ${current.offsetDays} days`;

  const handleDateKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key === "ArrowUp" || key === "ArrowRight")
      setOffset(current.offsetDays + 1);
    else if (key === "ArrowDown" || key === "ArrowLeft")
      setOffset(current.offsetDays - 1);
    else if (key === "PageUp") setOffset(current.offsetDays + 7);
    else if (key === "PageDown") setOffset(current.offsetDays - 7);
    else if (key === "Home") setOffset(MIN_OFFSET);
    else if (key === "End") setOffset(maxOffsetDays);
    else return;
    event.preventDefault();
  };

  const money = format(amount);
  const repeatWord = scheduled ? REPEAT_WORDS[current.repeat] : null;
  const tokens = [
    { slot: "verb", text: "Sends", strong: false },
    { slot: "amount", text: money, strong: true },
    { slot: "when", text: scheduled ? `on ${dateLabel}` : "now", strong: true },
    ...(repeatWord
      ? [{ slot: "repeat", text: repeatWord, strong: false }]
      : []),
  ];
  const sentence = tokens.map((token) => token.text).join(" ");
  const stagger = cascade(tokens.length);

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>

      <Segments
        options={MODE_OPTIONS}
        value={current.mode}
        onSelect={(mode) => commit({ ...current, mode })}
        idBase={`${baseId}-mode`}
        knobId={`${baseId}-mode-knob`}
        labelledBy={labelId}
        motionSafe={motionSafe}
      />

      <motion.div
        inert={!scheduled}
        aria-hidden={!scheduled}
        initial={false}
        // "auto" only until the first measurement lands, so an instance that
        // mounts already scheduled opens at its true height instead of unfolding.
        animate={{ height: scheduled ? (panelHeight ?? "auto") : 0 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="overflow-hidden"
      >
        {/* pb-1 is the focus ring's room: the wrapper clips to this height. */}
        <div ref={panelRef} className="flex flex-col gap-3 pb-1">
          <div className="flex items-center gap-2">
            <StepButton
              back
              label="Earlier day"
              disabled={current.offsetDays <= MIN_OFFSET}
              onPress={() => setOffset(current.offsetDays - 1)}
            />
            <div
              role="spinbutton"
              tabIndex={scheduled ? 0 : -1}
              aria-label="Send date"
              aria-valuenow={current.offsetDays}
              aria-valuemin={MIN_OFFSET}
              aria-valuemax={maxOffsetDays}
              aria-valuetext={`${dateLabel}, ${relative}`}
              onKeyDown={handleDateKeys}
              className={cn(
                "flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-hairline bg-surface-1 px-3 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <span className="truncate font-mono text-xs text-ink tabular-nums">
                {dateLabel}
              </span>
              <span className="truncate text-[11px] text-ink-3">
                {relative}
              </span>
            </div>
            <StepButton
              label="Later day"
              disabled={current.offsetDays >= maxOffsetDays}
              onPress={() => setOffset(current.offsetDays + 1)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span
              id={repeatLabelId}
              className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              Repeat
            </span>
            <Segments
              options={REPEAT_OPTIONS}
              value={current.repeat}
              onSelect={(repeat) => commit({ ...current, repeat })}
              idBase={`${baseId}-repeat`}
              knobId={`${baseId}-repeat-knob`}
              labelledBy={repeatLabelId}
              motionSafe={motionSafe}
            />
          </div>
        </div>
      </motion.div>

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-t border-hairline pt-3 text-sm">
        {/* The animated line is decoration for the sentence beside it: a reader
            hears one settled statement, not four words arriving separately. */}
        <AnimatePresence mode="popLayout" initial={false}>
          {tokens.map((token, index) => (
            <motion.span
              key={`${token.slot}:${token.text}`}
              aria-hidden
              layout={motionSafe}
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.nudge }
                  : { opacity: 0, y: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, delay: index * stagger }
                  : { duration: durations.fast, ease: easings.enter }
              }
              // inline-block, not inline: transforms and layout projection do
              // not apply to an inline box, so a bare span would never travel.
              className={cn(
                "inline-block",
                token.strong
                  ? "font-medium text-ink tabular-nums"
                  : "text-ink-2",
              )}
            >
              {token.text}
            </motion.span>
          ))}
        </AnimatePresence>
        <span role="status" className="sr-only">
          {sentence}
        </span>
      </div>
    </div>
  );
}
