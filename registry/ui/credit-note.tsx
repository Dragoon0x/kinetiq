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

export type CreditNoteProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The credit note's full value in major units. */
  credit: number;
  /** The next invoice's amount before credit, in major units. */
  invoiceSubtotal: number;
  /** Controlled credit already applied. */
  applied?: number;
  /** Initial applied credit for uncontrolled usage. @default 0 */
  defaultApplied?: number;
  /** Fires from the Apply or Remove press. */
  onAppliedChange?: (applied: number) => void;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** @default "Credit note" */
  creditLabel?: string;
  /** A small reference under the credit label. */
  creditReference?: string;
  /** @default "Next invoice" */
  invoiceLabel?: string;
  /** A small reference under the invoice label. */
  invoiceReference?: string;
  /** @default "Apply credit" */
  applyLabel?: string;
  /** @default "Remove credit" */
  removeLabel?: string;
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

const DIGITS = "0123456789";
/** The flying chip's height in px (`h-6`), for centring it on a figure. */
const CHIP_HEIGHT = 24;
/** The landing target is the only animation definition that travels. */
const isLanding = (definition: unknown): boolean =>
  typeof definition === "object" && definition !== null && "x" in definition;
/** Applied credit is drawn as well as coloured, so the split survives a
 *  monochrome print and both themes. */
const HATCH =
  "repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 6px)";

/**
 * A figure whose digit columns roll on `glide` with a right-first cascade.
 * Columns are keyed from the right and exactly `1ch` wide, so a change never
 * shifts layout. Hidden from assistive technology; the printed value sits
 * beside it.
 */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  const stagger = cascade(chars.length);
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char);
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

function Figure({
  text,
  motionSafe,
  className,
  ref,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
  ref?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <span ref={ref} className={cn("font-mono tabular-nums", className)}>
      <Rolling text={text} motionSafe={motionSafe} />
      <span className="sr-only">{text}</span>
    </span>
  );
}

type Flight = {
  seq: number;
  /** Where the chip starts and lands, relative to the frame. */
  top: number;
  right: number;
  dy: number;
  dx: number;
  text: string;
  /** What the figures keep showing until the chip lands. */
  prevApplied: number;
};

/**
 * Two cards: a credit note with its figure and a credit bar, and the next
 * invoice with its subtotal, credit line and total. Pressing Apply lifts a
 * chip carrying the amount that will be applied — the lesser of the remaining
 * credit and the invoice's balance — from the credit figure and slides it into
 * the invoice's total on `glide`: a figure travelling from one document to the
 * other, easing into place with no overshoot. The chip is an overlay inside the
 * component's own frame, placed from rectangles measured in the press. When it
 * lands, the total and the credit line roll to their new values on `glide` and
 * the applied share of the credit bar hatches in from the left on `glide`
 * while the remainder stays solid. Remove reverses it.
 *
 * All arithmetic is in cents. The bar is a meter that speaks applied and
 * remaining; Apply and Remove are one real button whose label changes, held
 * disabled while a chip is in flight so a double press cannot fork the
 * figures; a status line reports each landing. Under reduced motion there is
 * no flight — the figures swap on the press and the hatch tweens.
 */
export function CreditNote({
  ref,
  credit,
  invoiceSubtotal,
  applied,
  defaultApplied = 0,
  onAppliedChange,
  format = defaultFormat,
  creditLabel = "Credit note",
  creditReference,
  invoiceLabel = "Next invoice",
  invoiceReference,
  applyLabel = "Apply credit",
  removeLabel = "Remove credit",
  className,
}: CreditNoteProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const creditId = `${baseId}-credit`;
  const invoiceId = `${baseId}-invoice`;

  const creditCents = Math.max(0, Math.round(credit * 100));
  const subtotalCents = Math.max(0, Math.round(invoiceSubtotal * 100));
  const applicable = Math.min(creditCents, subtotalCents);

  const [ownApplied, setOwnApplied] = React.useState(defaultApplied);
  const appliedCents = Math.min(
    applicable,
    Math.max(0, Math.round((applied ?? ownApplied) * 100)),
  );

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const creditFigure = React.useRef<HTMLSpanElement | null>(null);
  const totalFigure = React.useRef<HTMLSpanElement | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [message, setMessage] = React.useState("");

  // The figures hold their old values while the chip is in the air; they roll
  // only once it has landed, so the number arrives with the chip.
  const shown = flight ? flight.prevApplied : appliedCents;
  const remaining = creditCents - shown;
  const due = subtotalCents - shown;
  const money = (cents: number) => format(cents / 100);

  const fullyApplied = appliedCents >= applicable;
  const delta = fullyApplied ? appliedCents : applicable - appliedCents;
  const nothing = applicable === 0;

  const report = (nextApplied: number) => {
    const nextDue = money(subtotalCents - nextApplied);
    setMessage(
      nextApplied > 0
        ? `Applied ${money(nextApplied)}, invoice total ${nextDue}`
        : `Credit removed, invoice total ${nextDue}`,
    );
  };

  const press = () => {
    if (nothing || flight) return;
    const next = fullyApplied ? 0 : applicable;
    const frame = frameRef.current?.getBoundingClientRect();
    const from = (fullyApplied ? totalFigure : creditFigure).current;
    const to = (fullyApplied ? creditFigure : totalFigure).current;
    if (motionSafe && frame && from && to) {
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      setFlight({
        seq: next,
        top: a.top + a.height / 2 - frame.top,
        right: frame.right - a.right,
        dy: b.top + b.height / 2 - (a.top + a.height / 2),
        dx: a.right - b.right,
        text: `${fullyApplied ? "+" : "−"}${money(delta)}`,
        prevApplied: appliedCents,
      });
    } else {
      report(next);
    }
    if (applied === undefined) setOwnApplied(next / 100);
    onAppliedChange?.(next / 100);
  };

  const land = () => {
    setFlight(null);
    report(appliedCents);
  };

  const bar = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };
  const appliedShare = creditCents > 0 ? (shown / creditCents) * 100 : 0;
  const meterText = `${money(shown)} applied, ${money(remaining)} remaining of ${money(creditCents)}`;

  const lines = [
    { term: "Subtotal", text: money(subtotalCents), tone: "text-ink-2" },
    {
      term: "Credit applied",
      text: shown > 0 ? `−${money(shown)}` : money(0),
      tone: shown > 0 ? "text-success" : "text-ink-3",
    },
  ];

  return (
    <div
      ref={(node) => {
        frameRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn("relative flex w-full flex-col gap-3", className)}
    >
      <section
        aria-labelledby={creditId}
        className="flex flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span
              id={creditId}
              className="truncate text-sm font-medium text-foreground"
            >
              {creditLabel}
            </span>
            {creditReference ? (
              <span className="truncate font-mono text-[11px] text-ink-3">
                {creditReference}
              </span>
            ) : null}
          </span>
          <Figure
            ref={creditFigure}
            text={money(remaining)}
            motionSafe={motionSafe}
            className="shrink-0 text-lg leading-none font-medium text-ink"
          />
        </div>

        <div
          role="meter"
          aria-label={`${creditLabel} remaining`}
          aria-valuemin={0}
          aria-valuemax={creditCents / 100}
          aria-valuenow={remaining / 100}
          aria-valuetext={meterText}
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-hairline"
        >
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-cobalt-wash text-cobalt-bright"
            style={{ backgroundImage: HATCH }}
            initial={false}
            animate={{ width: `${appliedShare}%` }}
            transition={bar}
          />
          <motion.span
            aria-hidden
            className="absolute inset-y-0 right-0 bg-cobalt-bright"
            initial={false}
            animate={{ left: `${appliedShare}%` }}
            transition={bar}
          />
        </div>

        <div className="flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[2px] bg-cobalt-wash text-cobalt-bright"
              style={{ backgroundImage: HATCH }}
            />
            Applied <Figure text={money(shown)} motionSafe={motionSafe} />
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[2px] bg-cobalt-bright"
            />
            Carries <Figure text={money(remaining)} motionSafe={motionSafe} />
          </span>
        </div>
      </section>

      <section
        aria-labelledby={invoiceId}
        className="flex flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <span
            id={invoiceId}
            className="truncate text-sm font-medium text-foreground"
          >
            {invoiceLabel}
          </span>
          {invoiceReference ? (
            <span className="shrink-0 font-mono text-[11px] text-ink-3">
              {invoiceReference}
            </span>
          ) : null}
        </div>
        <dl className="flex flex-col gap-1.5">
          {lines.map((line) => (
            <div
              key={line.term}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <dt className="text-ink-3">{line.term}</dt>
              <dd className={cn("transition-colors", line.tone)}>
                <Figure text={line.text} motionSafe={motionSafe} />
              </dd>
            </div>
          ))}
          <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-hairline pt-2 text-sm font-medium">
            <dt className="text-foreground">Total due</dt>
            <dd className="text-ink">
              <Figure
                ref={totalFigure}
                text={money(due)}
                motionSafe={motionSafe}
              />
            </dd>
          </div>
        </dl>
      </section>

      <button
        type="button"
        disabled={nothing || flight !== null}
        onClick={press}
        className={cn(
          "inline-flex h-9 w-full items-center justify-center rounded-2 px-4 text-sm font-medium transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          fullyApplied && !nothing
            ? "border border-input bg-transparent text-foreground hover:bg-accent"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {nothing
          ? "Nothing to apply"
          : fullyApplied
            ? removeLabel
            : `${applyLabel} · ${money(delta)}`}
      </button>

      {/* The chip lives inside the frame and is sized by its text, so it can
          never overhang the column; it is a picture of a number already
          spoken by the status line. */}
      <AnimatePresence>
        {flight ? (
          <motion.span
            key={flight.seq}
            aria-hidden
            // Pixels only: the chip is CHIP_HEIGHT tall, so centring on the
            // figure is arithmetic rather than a percentage motion would have
            // to convert mid-flight.
            style={{ top: flight.top - CHIP_HEIGHT / 2, right: flight.right }}
            className="pointer-events-none absolute z-10 inline-flex h-6 items-center rounded-full border border-hairline-strong bg-popover px-2 font-mono text-xs font-medium whitespace-nowrap text-popover-foreground tabular-nums shadow-md"
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{ x: -flight.dx, y: flight.dy, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              ...springs.glide,
              opacity: { duration: durations.fast },
            }}
            onAnimationComplete={(definition) => {
              // The exit completes too, and a chip fading out must not settle
              // (or cancel) a flight that started after it: only the landing
              // target carries a travel.
              if (isLanding(definition)) land();
            }}
          >
            {flight.text}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {message}
      </span>
    </div>
  );
}
