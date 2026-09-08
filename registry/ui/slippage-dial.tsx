"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SlippageDialProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The quoted receive figure, before any slippage is allowed for. */
  expected: number;
  /** Controlled tolerance, in percent. */
  value?: number;
  /** Initial tolerance for uncontrolled usage. @default 0.5 */
  defaultValue?: number;
  /** Fires from the press, key, or keystroke that changed the tolerance. */
  onValueChange?: (value: number) => void;
  /** The stops, in percent, left to right. @default [0.1, 0.5, 1] */
  presets?: number[];
  /** Formats the expected and minimum figures. */
  format?: (value: number) => string;
  /** Ticker printed after both figures. @default "FRN" */
  symbol?: string;
  /** Tolerance above which the dial warns that the quote can slip. @default 1 */
  warnAt?: number;
  /** Tolerance below which the dial warns the trade may not settle. @default 0.05 */
  lowAt?: number;
  /** Ceiling the custom field clamps to. @default 50 */
  max?: number;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A figure whose digits roll to their new value on `snap` — one crisp
 * overshoot, the physics of an indicator changing position. Hidden from
 * assistive technology because the dial speaks the same figure in a sentence.
 */
function RollingFigure({
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
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
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
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.2em] items-center justify-center"
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

/** Plain, lossless text for the editable field — never a grouped string. */
const plain = (value: number) => String(Number(value.toFixed(4)));

/** Keeps a decimal field usable: one dot, digits, nothing else. */
const sanitize = (raw: string) => {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot < 0) return cleaned.slice(0, 6);
  return (
    cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "")
  ).slice(0, 6);
};

/** Percent printed on a stop: 0.1 reads as "0.1", 1 reads as "1". */
const stopText = (value: number) => `${Number(value.toFixed(2))}%`;

/** Milliseconds of quiet before the live region reads the settled tolerance. */
const SETTLE_MS = 600;

const STOP_CLASS =
  "relative flex h-8 min-w-0 flex-1 items-center justify-center rounded-1 font-mono text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * How much you will tolerate, and what it costs. Three stops and a field share
 * one knob, keyed by a `useId()`-prefixed `layoutId` so it travels between them
 * on `snap` — one chip moving with a single crisp overshoot, never four chips
 * blinking. The custom field is just one more stop the knob can reach, so
 * typing a figure is the same gesture as pressing one.
 *
 * The minimum received — the quote less the tolerance — rolls its digits on
 * `snap` under the rail, so the figure answers the stop the moment it lands.
 * Two thresholds put a note under the row: below `lowAt` the trade may not
 * settle, above `warnAt` the quote can slip far. That note's height is measured
 * with a `ResizeObserver` and glided open, so no room is reserved for a state
 * that is usually absent, and it carries the fact in words as well as in the
 * warn tint.
 *
 * The stops are a real radio group with a roving tabindex — arrows step, Home
 * and End reach the ends, Space selects — and the field is a real decimal input
 * one Tab further on. Under reduced motion the knob appears on its stop with no
 * travel and the digits swap in place; the figure still changes, because what
 * the tolerance costs is the information.
 */
export function SlippageDial({
  ref,
  expected,
  value,
  defaultValue = 0.5,
  onValueChange,
  presets = [0.1, 0.5, 1],
  format = defaultFormat,
  symbol = "FRN",
  warnAt = 1,
  lowAt = 0.05,
  max = 50,
  label,
  className,
  "aria-label": ariaLabel,
}: SlippageDialProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const knobId = `${baseId}-knob`;
  const fieldId = `${baseId}-field`;
  const noteId = `${baseId}-note`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const tolerance = isControlled ? value : uncontrolled;

  const presetIndex = presets.findIndex(
    (stop) => Math.abs(stop - tolerance) < 0.0001,
  );

  // The field's text is the record of which stop is live: empty means a preset
  // owns the tolerance, filled means the field does. Re-seeded whenever a
  // tolerance arrives from outside, so a controlling parent stays in charge.
  const [field, setField] = React.useState(() => ({
    value: tolerance,
    text: presetIndex >= 0 ? "" : plain(tolerance),
  }));
  if (field.value !== tolerance) {
    setField({
      value: tolerance,
      text: presetIndex >= 0 ? "" : plain(tolerance),
    });
  }
  const isCustom = field.text !== "";

  const commit = (next: number, text: string) => {
    const clamped = Math.min(max, Math.max(0, next));
    setField({ value: clamped, text });
    if (clamped === tolerance) return;
    if (!isControlled) setUncontrolled(clamped);
    onValueChange?.(clamped);
  };

  const focusIndex = isCustom || presetIndex < 0 ? 0 : presetIndex;

  const focusStop = (index: number) => {
    const clamped = Math.min(presets.length - 1, Math.max(0, index));
    const stop = presets[clamped];
    if (stop === undefined) return;
    document.getElementById(`${baseId}-stop-${clamped}`)?.focus();
    commit(stop, "");
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusStop(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusStop(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusStop(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusStop(presets.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      const stop = presets[index];
      if (stop !== undefined) commit(stop, "");
    }
  };

  const handleField = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = sanitize(event.target.value);
    const parsed = Number(text);
    if (text === "") {
      // Emptying the field hands the tolerance back to the nearest preset
      // rather than leaving the dial with no stop at all.
      const fallback = presets[0] ?? 0;
      commit(fallback, "");
      return;
    }
    commit(Number.isNaN(parsed) ? 0 : parsed, text);
  };

  const minimum = Math.max(0, expected * (1 - tolerance / 100));
  const high = tolerance > warnAt;
  const low = tolerance < lowAt;
  const note = high
    ? `A quote can settle up to ${format(expected - minimum)} ${symbol} below this one.`
    : low
      ? "The trade may not settle: prices move more than this between blocks."
      : null;

  // The note's own height is measured rather than reserved, so an absent note
  // costs the layout nothing and an arriving one glides the card open.
  const noteRef = React.useRef<HTMLParagraphElement>(null);
  const [noteHeight, setNoteHeight] = React.useState(0);
  React.useEffect(() => {
    const node = noteRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setNoteHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const sentence = `Tolerance ${stopText(tolerance)}. Minimum received ${format(minimum)} ${symbol}.${note ? ` ${note}` : ""}`;
  const [announced, setAnnounced] = React.useState("");
  React.useEffect(() => {
    // Typing a custom figure must not announce every half-typed number, so the
    // region waits for the dial to go quiet.
    const timer = window.setTimeout(() => setAnnounced(sentence), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [sentence]);

  const knob = motionSafe ? (
    <motion.span
      aria-hidden
      layoutId={knobId}
      transition={springs.snap}
      className="absolute inset-0 rounded-1 border border-hairline-strong bg-surface-0 shadow-raised"
    />
  ) : (
    <span
      aria-hidden
      className="absolute inset-0 rounded-1 border border-hairline-strong bg-surface-0 shadow-raised"
    />
  );

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {label ? (
          <span id={labelId} className="text-sm font-semibold text-foreground">
            {label}
          </span>
        ) : null}
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Quoted {format(expected)} {symbol}
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-2 border border-hairline bg-surface-2 p-1">
        <div
          role="radiogroup"
          aria-label="Preset tolerance"
          aria-describedby={note ? noteId : undefined}
          className="flex min-w-0 flex-1 items-center gap-1"
        >
          {presets.map((stop, index) => {
            const checked = !isCustom && index === presetIndex;
            return (
              <button
                key={stop}
                type="button"
                role="radio"
                id={`${baseId}-stop-${index}`}
                aria-checked={checked}
                tabIndex={index === focusIndex ? 0 : -1}
                onClick={() => commit(stop, "")}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  STOP_CLASS,
                  checked
                    ? "text-foreground"
                    : "text-ink-3 hover:text-foreground",
                )}
              >
                {checked ? knob : null}
                <span className="relative tabular-nums">{stopText(stop)}</span>
              </button>
            );
          })}
        </div>

        <div
          className={cn(
            "relative flex h-8 w-20 shrink-0 items-center rounded-1 transition-colors",
            isCustom ? "text-foreground" : "text-ink-3",
          )}
        >
          {isCustom ? knob : null}
          <input
            id={fieldId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="Custom"
            value={field.text}
            onChange={handleField}
            aria-label="Custom tolerance, percent"
            // Only the field can be invalid: a preset that trips a threshold is
            // a warning about the trade, not a badly typed number.
            aria-invalid={(isCustom && (high || low)) || undefined}
            aria-describedby={note ? noteId : undefined}
            className={cn(
              "relative h-8 min-w-0 flex-1 rounded-1 bg-transparent pl-2 font-mono text-xs tabular-nums outline-none",
              "placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              high ? "text-warn" : "text-foreground",
            )}
          />
          <span
            aria-hidden
            className={cn(
              "relative pr-2 font-mono text-xs",
              isCustom ? "text-ink-2" : "text-transparent",
            )}
          >
            %
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Minimum received
        </span>
        <span
          className={cn(
            "flex items-baseline gap-1 font-mono text-lg leading-none transition-colors",
            high ? "text-warn" : "text-foreground",
          )}
        >
          <RollingFigure value={format(minimum)} motionSafe={motionSafe} />
          <span className="text-xs text-ink-3">{symbol}</span>
          <span className="sr-only">
            {format(minimum)} {symbol}
          </span>
        </span>
      </div>

      {/* The negative margin cancels the column's own gap, so an absent note
          costs nothing at all — a zero height with a gap above it would still
          be twelve pixels of reserved room. The gap lives inside the measured
          content instead, as the note's own top padding. */}
      <motion.div
        className="-mt-3 overflow-hidden"
        initial={false}
        animate={{ height: noteHeight }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
      >
        <p
          ref={noteRef}
          id={noteId}
          className={cn(
            "flex items-start gap-1.5 pt-3 text-[11px] leading-snug text-warn",
            note ? "" : "hidden",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="mt-px size-3.5 shrink-0"
          >
            <path d="M8 2.5 14.5 13.5h-13L8 2.5ZM8 6.5v3.2M8 11.6v.4" />
          </svg>
          <span className="min-w-0">{note}</span>
        </p>
      </motion.div>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
