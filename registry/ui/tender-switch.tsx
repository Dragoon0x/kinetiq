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

export type TenderMethod = "card" | "cash" | "split";

export type TenderSwitchProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The sale total the tender must cover. */
  total: number;
  /** Controlled method. */
  value?: TenderMethod;
  /** Initial method for uncontrolled usage. @default "card" */
  defaultValue?: TenderMethod;
  /** Fires from the press or key that changed the method. */
  onValueChange?: (method: TenderMethod) => void;
  /** Controlled card share when split; cash is the remainder. */
  cardAmount?: number;
  /** Initial card share for uncontrolled usage. Defaults to half the total, to cents. */
  defaultCardAmount?: number;
  /** Fires from the input that changed it. */
  onCardAmountChange?: (amount: number) => void;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the group. @default "Tender" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's, so server and client print the same
 * string for the same number and the summary never hydrates against itself.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const METHODS: { value: TenderMethod; label: string }[] = [
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "split", label: "Split" },
];

const toCents = (value: number) => Math.round(value * 100) / 100;

/** Digits and one point, two decimals at most — what a till keypad would accept. */
const sanitize = (text: string) => {
  const [whole = "", ...rest] = text.replace(/[^\d.]/g, "").split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
};

function MethodGlyph({ method }: { method: TenderMethod }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {method === "card" ? (
        <>
          <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
          <path d="M1.5 6.5h13" />
        </>
      ) : method === "cash" ? (
        <>
          <rect x="1.5" y="4" width="13" height="8" rx="1" />
          <circle cx="8" cy="8" r="2" />
        </>
      ) : (
        <>
          <path d="M8 2v12" />
          <path d="M2.5 5.5 5 8l-2.5 2.5M13.5 5.5 11 8l2.5 2.5" />
        </>
      )}
    </svg>
  );
}

/**
 * Card, cash, or split. One knob rides a three-stop track to the chosen method
 * on `snap`, keyed by a shared `layoutId` so the same knob travels rather than
 * three knobs blinking. Under it the chosen method's chip slides into the
 * summary line from the left on `snap` while the old one leaves on the exit
 * ease, so the method reads as having moved from the selector into the sale.
 * Split unfolds two amount fields: the region's measured height glides open,
 * the fields arrive in a `cascade`, and they keep each other honest — editing
 * one sets the other to the remainder, clamped to the total — while a
 * two-segment bar beneath glides to the new proportion.
 *
 * It is a radio group with a roving tabindex: Left and Right step without
 * wrapping past the ends, Home and End jump, Space selects. The summary is a
 * polite live region and the fields are labelled decimal inputs; the bar is
 * hidden because the fields already carry the numbers. Under reduced motion the
 * knob swaps stops, the chip cross-fades in place, and the height and bar tween.
 */
export function TenderSwitch({
  ref,
  total,
  value,
  defaultValue = "card",
  onValueChange,
  cardAmount,
  defaultCardAmount,
  onCardAmountChange,
  format = defaultFormat,
  label = "Tender",
  className,
}: TenderSwitchProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const knobId = `${baseId}-knob`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const method = isControlled ? value : uncontrolled;
  const isSplit = method === "split";

  const [uncontrolledCard, setUncontrolledCard] = React.useState(
    () => defaultCardAmount ?? toCents(total / 2),
  );
  const isCardControlled = cardAmount !== undefined;
  const card = Math.min(
    total,
    Math.max(0, isCardControlled ? cardAmount : uncontrolledCard),
  );
  const cash = toCents(total - card);

  // The field being typed in shows its own text, so "24." survives a keystroke;
  // the other field always shows the computed remainder.
  const [draft, setDraft] = React.useState<{
    field: "card" | "cash";
    text: string;
  } | null>(null);

  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = React.useState(0);

  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    // setState lives in the observer callback, never in the effect body.
    const observer = new ResizeObserver((entries) => {
      setContentHeight(entries[0]?.contentRect.height ?? 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const select = (next: TenderMethod) => {
    if (next === method) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const focusAt = (index: number) => {
    const option = METHODS[Math.min(METHODS.length - 1, Math.max(0, index))];
    if (!option) return;
    document.getElementById(`${baseId}-${option.value}`)?.focus();
    select(option.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(METHODS.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      select(METHODS[index]?.value ?? "card");
    }
  };

  const setCard = (next: number) => {
    const clamped = toCents(Math.min(total, Math.max(0, next)));
    if (!isCardControlled) setUncontrolledCard(clamped);
    onCardAmountChange?.(clamped);
  };

  const edit = (field: "card" | "cash", raw: string) => {
    const text = sanitize(raw);
    setDraft({ field, text });
    const parsed = Number.parseFloat(text);
    const amount = Number.isFinite(parsed) ? parsed : 0;
    setCard(field === "card" ? amount : total - amount);
  };

  const chosen =
    METHODS.find((option) => option.value === method) ?? METHODS[0];
  const summary = isSplit
    ? `card ${format(card)} · cash ${format(cash)}`
    : format(total);

  const cardShare = total > 0 ? Number((card / total).toFixed(6)) : 0;
  const cardWidth = `${Number((cardShare * 100).toFixed(3))}%`;
  const cashWidth = `${Number(((1 - cardShare) * 100).toFixed(3))}%`;
  const glide = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  const fields = [
    { field: "card" as const, label: "Card", amount: card },
    { field: "cash" as const, label: "Cash", amount: cash },
  ];
  const stagger = cascade(fields.length);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
        <span className="font-mono text-xs text-ink-3 tabular-nums">
          {format(total)}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid h-9 grid-cols-3 rounded-full border border-hairline bg-surface-2 p-1"
      >
        {METHODS.map((option, index) => {
          const checked = option.value === method;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              id={`${baseId}-${option.value}`}
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => select(option.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "relative flex items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {checked ? (
                motionSafe ? (
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
                )
              ) : null}
              <span className="relative flex items-center gap-1.5">
                <MethodGlyph method={option.value} />
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-hairline pt-3"
      >
        <span className="flex items-center gap-2 text-xs text-ink-3">
          Paying by
          {/* Both chips share one grid cell, so the leaving chip never holds
              a column open beside the arriving one. */}
          <span className="grid">
            <AnimatePresence initial={false}>
              <motion.span
                key={chosen.value}
                className="col-start-1 row-start-1 inline-flex h-6 w-fit items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-0 px-2 text-xs font-medium text-foreground"
                initial={
                  motionSafe
                    ? { x: -distances.shift, opacity: 0 }
                    : { opacity: 0 }
                }
                animate={{ x: 0, opacity: 1 }}
                exit={{
                  x: motionSafe ? distances.nudge : 0,
                  opacity: 0,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
              >
                <MethodGlyph method={chosen.value} />
                {chosen.label}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
        <span className="font-mono text-xs text-foreground tabular-nums">
          {summary}
        </span>
      </div>

      <motion.div
        aria-hidden={!isSplit}
        inert={!isSplit || undefined}
        className="overflow-hidden"
        initial={false}
        animate={{
          // "auto" only covers the frame before the observer has measured.
          height: isSplit ? (contentHeight > 0 ? contentHeight : "auto") : 0,
        }}
        transition={glide}
      >
        <div ref={contentRef} className="flex flex-col gap-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            {fields.map((entry, index) => (
              <motion.label
                key={entry.field}
                className="flex min-w-0 flex-col gap-1"
                initial={false}
                animate={{
                  opacity: isSplit ? 1 : 0,
                  y: isSplit || !motionSafe ? 0 : -distances.nudge,
                }}
                transition={{
                  ...glide,
                  delay: isSplit ? index * stagger : 0,
                  opacity: {
                    duration: durations.fast,
                    delay: isSplit ? index * stagger : 0,
                  },
                }}
              >
                <span className="text-[11px] font-medium text-ink-2">
                  {entry.label}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={
                    draft?.field === entry.field
                      ? draft.text
                      : entry.amount.toFixed(2)
                  }
                  onChange={(event) => edit(entry.field, event.target.value)}
                  onBlur={() => setDraft(null)}
                  className={cn(
                    "h-9 w-full min-w-0 rounded-2 border border-input bg-surface-0 px-3 font-mono text-sm tabular-nums transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                />
              </motion.label>
            ))}
          </div>

          <div
            aria-hidden
            className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full"
          >
            <motion.span
              className="h-full rounded-full bg-cobalt-bright"
              initial={false}
              animate={{ width: cardWidth }}
              transition={glide}
            />
            <motion.span
              className="h-full rounded-full bg-success"
              initial={false}
              animate={{ width: cashWidth }}
              transition={glide}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
