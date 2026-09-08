"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type InvoiceLine = {
  id: string;
  /** What the line is for. */
  description: string;
  /** How many. */
  qty: number;
  /** Price of one, in major units. */
  unitPrice: number;
};

export type InvoiceBuildProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The lines. Adding one slides it in; removing one collapses it. */
  lines: InvoiceLine[];
  /** Fires from the press on a line's remove — drop the line to play the collapse. */
  onRemove?: (id: string) => void;
  /** Fraction of the subtotal charged as tax. @default 0.08 */
  taxRate?: number;
  /** What the tax line is called. @default "Tax" */
  taxLabel?: string;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the lines and the totals. @default "Invoice" */
  label?: string;
  /** A quiet caption under the totals — the account or the terms. */
  note?: React.ReactNode;
  /** The designed empty state. @default "No lines yet." */
  emptyLabel?: string;
  /** Fires from the effect that observes a settled change of the figures. */
  onTotalChange?: (total: number, subtotal: number, tax: number) => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on the figure that matters most.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Money is counted in whole cents, so a run of edits cannot drift. */
const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * A figure whose digit columns roll to their new value on `snap` — one crisp
 * overshoot, the physics of any indicator moving to a new position.
 *
 * Each column is a ten-face strip translated by a percentage of its own height,
 * so one `y` moves exactly one digit, and `1ch` in a monospaced face is exactly
 * a digit wide: the total can gain a column without shifting the column beside
 * it. Hidden from assistive technology, which is given the amount as words.
 */
function RollingFigure({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex items-center tabular-nums", className)}
    >
      {chars.map((char, index) => {
        const digit = FACES.indexOf(char);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
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
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
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

/**
 * One line, owning its own height. A ResizeObserver on the inner content gives
 * the row a real number to open to and collapse from — it fires on observe and
 * before paint, so the first measurement lands without reading layout during
 * render, and no `min-h` is ever reserved for a row that may not exist.
 */
function Line({
  line,
  amountText,
  unitText,
  spoken,
  motionSafe,
  buttonId,
  onRemove,
}: {
  line: InvoiceLine;
  amountText: string;
  unitText: string;
  spoken: string;
  motionSafe: boolean;
  buttonId: string;
  onRemove: () => void;
}) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.li
      className="overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: measured || "auto", opacity: 1 }}
      exit={{
        height: 0,
        opacity: 0,
        transition: motionSafe
          ? exitFor(durations.slow)
          : { duration: durations.fast, ease: easings.exit },
      }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      {/* The slide lives on the content, not on the row: a row that travels
          sideways would overhang its container before the clip catches it. */}
      <motion.div
        ref={innerRef}
        initial={motionSafe ? { x: -distances.shift, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.enter }
        }
        className="flex items-center gap-2.5 border-t border-hairline py-2.5"
      >
        {/* One sentence for the reader, so the multiplication sign and the two
            figures do not arrive as three unrelated fragments. */}
        <span className="sr-only">{spoken}</span>
        <div aria-hidden className="min-w-0 flex-1">
          <div
            title={line.description}
            className="truncate text-sm text-foreground"
          >
            {line.description}
          </div>
          <div className="font-mono text-[11px] text-ink-3 tabular-nums">
            {unitText}
          </div>
        </div>
        <span
          aria-hidden
          className="shrink-0 font-mono text-sm text-foreground tabular-nums"
        >
          {amountText}
        </span>
        <button
          type="button"
          id={buttonId}
          onClick={onRemove}
          title={`Remove ${line.description}`}
          aria-label={`Remove ${line.description}`}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none",
            "hover:bg-accent hover:text-foreground active:bg-cobalt-wash",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="size-3.5 shrink-0"
          >
            <path d="M4 8h8" />
          </svg>
        </button>
      </motion.div>
    </motion.li>
  );
}

function TotalRow({
  term,
  text,
  spoken,
  motionSafe,
  emphasis,
}: {
  term: string;
  text: string;
  spoken: string;
  motionSafe: boolean;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        emphasis && "border-t border-hairline pt-2",
      )}
    >
      <dt
        className={cn(
          "text-xs",
          emphasis ? "text-sm font-semibold text-foreground" : "text-ink-3",
        )}
      >
        {term}
      </dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          emphasis
            ? "text-lg font-medium text-foreground"
            : "text-sm text-ink-2",
        )}
      >
        <span className="sr-only">{spoken}</span>
        <RollingFigure text={text} motionSafe={motionSafe} />
      </dd>
    </div>
  );
}

/**
 * An invoice that does its own arithmetic in front of you.
 *
 * A new line opens from zero to a measured height on `glide` while its content
 * slides in from 16px — layout is a glide, never a bounce — and the three
 * figures underneath roll their digit columns to the new subtotal, tax and total
 * on `snap`. Removing a line closes the same measured height on the exit ease,
 * which accelerates away rather than springing back, and the figures roll down
 * as it goes. Every amount is counted in whole cents and printed through
 * `format` in `tabular-nums`, so a rolling column never nudges its neighbour.
 *
 * Each remove is a real button carrying its line's description, and removing the
 * row you are standing on hands focus to the next remove button, so a keyboard
 * run of deletions never dumps focus on the body. Under reduced motion rows
 * appear and leave at full height on an opacity change and the digits swap in
 * place — the arithmetic still updates, because the arithmetic is the point.
 */
export function InvoiceBuild({
  ref,
  lines,
  onRemove,
  taxRate = 0.08,
  taxLabel = "Tax",
  format = defaultFormat,
  label = "Invoice",
  note,
  emptyLabel = "No lines yet.",
  onTotalChange,
  className,
}: InvoiceBuildProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const amounts = lines.map((line) => cents(line.qty * line.unitPrice));
  const subtotal = cents(amounts.reduce((sum, amount) => sum + amount, 0));
  const tax = cents(subtotal * taxRate);
  const total = cents(subtotal + tax);

  const changeRef = React.useRef(onTotalChange);
  React.useEffect(() => {
    changeRef.current = onTotalChange;
  });
  React.useEffect(() => {
    changeRef.current?.(total, subtotal, tax);
  }, [total, subtotal, tax]);

  // A removed line takes its button with it, so the next line's button takes
  // the focus. The id is parked by the press and used by the effect that runs
  // once the list has actually changed.
  const focusRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = focusRef.current;
    if (!id) return;
    focusRef.current = null;
    document.getElementById(id)?.focus();
  }, [lines]);

  const remove = (id: string, position: number) => {
    const next = lines[position + 1] ?? lines[position - 1];
    focusRef.current = next ? `${baseId}-remove-${next.id}` : null;
    onRemove?.(id);
  };

  const ratePercent = Number((taxRate * 100).toFixed(2));
  const totalText = format(total);

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {lines.length} line{lines.length === 1 ? "" : "s"}
        </span>
      </div>

      {lines.length === 0 ? (
        <p className="border-t border-hairline pt-2.5 text-xs text-ink-3">
          {emptyLabel}
        </p>
      ) : (
        <ul aria-labelledby={labelId} className="flex flex-col">
          {/* `initial={false}` so an invoice that mounts with lines does not
              open every height at once; a line added later still arrives. */}
          <AnimatePresence initial={false}>
            {lines.map((line, position) => (
              <Line
                key={line.id}
                line={line}
                amountText={format(amounts[position] ?? 0)}
                unitText={`${line.qty} × ${format(line.unitPrice)}`}
                spoken={`${line.description}, ${line.qty} at ${format(
                  line.unitPrice,
                )}, ${format(amounts[position] ?? 0)}`}
                motionSafe={motionSafe}
                buttonId={`${baseId}-remove-${line.id}`}
                onRemove={() => remove(line.id, position)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <dl
        aria-labelledby={labelId}
        className="flex flex-col gap-1.5 border-t border-hairline-strong pt-3"
      >
        <TotalRow
          term="Subtotal"
          text={format(subtotal)}
          spoken={`Subtotal ${format(subtotal)}`}
          motionSafe={motionSafe}
        />
        <TotalRow
          term={`${taxLabel} ${ratePercent}%`}
          text={format(tax)}
          spoken={`${taxLabel} ${ratePercent} percent, ${format(tax)}`}
          motionSafe={motionSafe}
        />
        <TotalRow
          term="Total"
          text={totalText}
          spoken={`Total ${totalText}`}
          motionSafe={motionSafe}
          emphasis
        />
      </dl>

      {note ? <p className="text-[11px] text-ink-3">{note}</p> : null}

      <span role="status" className="sr-only">
        {`Total ${totalText} across ${lines.length} line${lines.length === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}
