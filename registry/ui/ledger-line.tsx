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

export type LedgerLineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** What the entry says on the statement. */
  title: string;
  /** Signed major units; negative is a debit. */
  amount: number;
  /** An already-formatted day label — the row never reads a clock. */
  date: string;
  /** Pending shimmers along the amount; settled stamps the tick. @default "settled" */
  status?: "pending" | "settled";
  /** The merchant the entry resolved to. */
  merchant?: string;
  /** Category chip in the detail. */
  category?: string;
  /** Balance after this entry; omitted, the line is left out. */
  runningBalance?: number;
  /** Reference code in the detail. */
  reference?: string;
  /** Controlled expansion. */
  open?: boolean;
  /** Initial expansion for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Formats an unsigned amount; the row composes the sign itself. */
  format?: (value: number) => string;
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

/**
 * Pending is drawn as well as written under reduced motion, so the state never
 * rests on a sweep the viewer asked not to see.
 */
const HATCH =
  "repeating-linear-gradient(45deg, var(--hairline-strong) 0 1px, transparent 1px 5px)";

/**
 * A transaction row that opens where it stands. Pressing expands the detail on
 * `glide` — a layout shift eases into place rather than overshooting — to a
 * height a `ResizeObserver` measured on the content, so no room is reserved for
 * a panel that is not showing. Inside, the merchant, category, running balance
 * and reference arrive on a `cascade()`, and the chevron turns on `snap`.
 *
 * Two states live on the amount. Pending sweeps a soft band along the figure on
 * a linear tween — a shimmer has no destination, so it is never a spring — and
 * the sweep is driven entirely by the `status` prop, with no timer of its own to
 * leak. Settling stamps a tick that draws itself with `pathLength` on `flick`
 * and lands from 1.3× on `recoil`; the stamp sits inside an `AnimatePresence
 * initial={false}`, so a row that mounts already settled shows its tick plainly
 * and only a row that settles in front of you gets the bounce.
 *
 * The row is a real `aria-expanded` button — Enter and Space toggle, Escape
 * closes — and the panel is a labelled region. Pending is a word and a hatch as
 * well as a colour. Under reduced motion nothing sweeps and nothing stamps: the
 * tick appears complete, the panel opens instantly, and the facts fade in.
 */
export function LedgerLine({
  ref,
  title,
  amount,
  date,
  status = "settled",
  merchant,
  category,
  runningBalance,
  reference,
  open,
  defaultOpen = false,
  onOpenChange,
  format = defaultFormat,
  className,
}: LedgerLineProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const panelId = `${baseId}-panel`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
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

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const pending = status === "pending";
  const credit = amount > 0;
  const printed = `${credit ? "+" : "-"}${format(Math.abs(amount))}`;

  const facts: { term: string; value: React.ReactNode }[] = [];
  if (merchant) facts.push({ term: "Merchant", value: merchant });
  if (category)
    facts.push({
      term: "Category",
      value: (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
          />
          {category}
        </span>
      ),
    });
  if (runningBalance !== undefined)
    facts.push({
      term: "Running balance",
      value: <span className="tabular-nums">{format(runningBalance)}</span>,
    });
  if (reference)
    facts.push({
      term: "Reference",
      value: <span className="tabular-nums">{reference}</span>,
    });
  const stagger = cascade(facts.length);

  return (
    <div
      ref={ref}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }}
      className={cn(
        "w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <motion.span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center text-ink-3"
          initial={false}
          animate={{ rotate: isOpen ? 90 : 0 }}
          // The chevron is a switch changing position: snap, one overshoot.
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
          >
            <path d="m6 3.5 5 4.5-5 4.5" />
          </svg>
        </motion.span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            id={titleId}
            title={title}
            className="truncate text-sm font-medium text-foreground"
          >
            {title}
          </span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-ink-3">{date}</span>
            {pending ? (
              <span
                style={motionSafe ? undefined : { backgroundImage: HATCH }}
                className="inline-flex h-5 shrink-0 items-center rounded-full border border-hairline-strong px-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                Pending
              </span>
            ) : null}
          </span>
        </span>

        <span
          className={cn(
            "relative shrink-0 overflow-hidden font-mono text-sm tabular-nums",
            credit ? "text-success" : "text-foreground",
          )}
        >
          {printed}
          {pending && motionSafe ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-ink-3/45 to-transparent"
              initial={{ x: "-110%" }}
              animate={{ x: "210%" }}
              transition={{
                duration: 1.4,
                ease: easings.move,
                repeat: Infinity,
                repeatDelay: 0.4,
              }}
            />
          ) : null}
        </span>

        <span className="flex size-4 shrink-0 items-center justify-center">
          <AnimatePresence initial={false}>
            {pending ? null : (
              <motion.span
                key="tick"
                aria-hidden
                className="flex items-center justify-center text-success"
                initial={
                  motionSafe ? { scale: 1.3, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                >
                  <motion.path
                    d="M3.4 8.4 6.4 11.4 12.6 4.8"
                    pathLength={1}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </svg>
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <span className="sr-only">{pending ? "" : "Settled"}</span>
      </button>

      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={titleId}
        aria-hidden={!isOpen}
        className="overflow-hidden"
        initial={false}
        animate={{
          // "auto" only covers the frame before the observer has measured;
          // afterwards the panel animates to a real, measured height.
          height: isOpen ? (contentHeight > 0 ? contentHeight : "auto") : 0,
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div ref={contentRef}>
          <dl className="flex flex-col gap-1.5 border-t border-hairline px-3 py-2.5">
            {facts.map((fact, index) => (
              <motion.div
                key={fact.term}
                className="flex items-center justify-between gap-3"
                initial={false}
                animate={{
                  opacity: isOpen ? 1 : 0,
                  y: motionSafe && !isOpen ? distances.nudge : 0,
                }}
                transition={
                  motionSafe
                    ? { ...springs.glide, delay: isOpen ? index * stagger : 0 }
                    : { duration: durations.fast, ease: easings.enter }
                }
              >
                <dt className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {fact.term}
                </dt>
                <dd className="min-w-0 truncate text-xs text-foreground">
                  {fact.value}
                </dd>
              </motion.div>
            ))}
          </dl>
        </div>
      </motion.div>
    </div>
  );
}
