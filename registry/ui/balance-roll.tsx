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

export type BalanceRollProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The balance in major units. Changing it rolls the digits and raises a delta chip. */
  value: number;
  /** What the figure is — labels the readout for assistive technology. */
  label: string;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Controlled mask state. */
  masked?: boolean;
  /** Initial mask state for uncontrolled usage. @default false */
  defaultMasked?: boolean;
  /** Fires from the press that toggled the mask. */
  onMaskedChange?: (masked: boolean) => void;
  /** Fires once per settled change, from the effect that observed it. */
  onValueSettle?: (value: number, delta: number) => void;
  /** Milliseconds the delta chip holds before it fades; 0 keeps it up. @default 2600 */
  deltaHoldMs?: number;
  /** A quiet line under the figure — the account the balance belongs to. */
  caption?: React.ReactNode;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on the most important string on the screen.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

/** Ten digits and the bullet, in one strip — masking is a roll, not a swap. */
const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "•"];
const MASK_FACE = FACES.length - 1;
const STEP = 100 / FACES.length;

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The figure itself. Each digit column is one eleven-face strip translated by a
 * percentage of its own height, so a single `y` moves exactly one face and the
 * bullet is simply the face after 9 — which is why masking rolls rather than
 * swaps. The cascade starts at the units and ripples left, the way an odometer's
 * small wheels stop first.
 *
 * Hidden from assistive technology: the button around it already carries the
 * amount as a sentence, and no reader should wade through eleven faces a column.
 */
function Figure({
  text,
  masked,
  motionSafe,
}: {
  text: string;
  masked: boolean;
  motionSafe: boolean;
}) {
  const chars = text.split("");
  const stagger = cascade(chars.length);

  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = FACES.indexOf(char);
        // Keyed from the right so the units column keeps its identity when the
        // balance gains or loses a digit and only the new column mounts.
        const key = chars.length - index;
        const fromRight = chars.length - 1 - index;

        if (digit < 0 || digit === MASK_FACE) {
          const separator = char === "," || char === ".";
          return (
            <motion.span
              key={key}
              className="inline-block"
              initial={false}
              // Separators keep their width and only fade, so masking cannot
              // shift the figure by a pixel.
              animate={{ opacity: separator && masked ? 0 : 1 }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {char}
            </motion.span>
          );
        }

        const face = masked ? MASK_FACE : digit;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${face * -STEP}%` }}
              transition={
                motionSafe
                  ? { ...springs.glide, delay: fromRight * stagger }
                  : { duration: 0 }
              }
            >
              {FACES.map((faceChar) => (
                <span
                  key={faceChar}
                  className="flex h-[1.15em] items-center justify-center"
                >
                  {faceChar}
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
 * A balance that rolls to its new figure on `glide` — a quantity settling, not a
 * switch flipping — and can be masked by pressing it, which rolls every digit
 * one face further to a bullet instead of swapping the number for a placeholder.
 *
 * A change slides a delta chip in beside the figure on `snap`, held for
 * `deltaHoldMs` and then gone on the exit ease. A credit and a debit get exactly
 * the same physics: a withdrawal should not celebrate. Masking takes the chip
 * with it, because a hidden balance that still advertises its movement is not
 * hidden.
 *
 * The press is a real `aria-pressed` button whose accessible name carries the
 * amount, so the rolling columns stay out of the accessibility tree, and settled
 * changes are announced politely by a `role="status"` line. Under reduced motion
 * the digits swap to their faces and the chip fades in place — the change is
 * still reported, because a change of balance is information.
 */
export function BalanceRoll({
  ref,
  value,
  label,
  format = defaultFormat,
  masked,
  defaultMasked = false,
  onMaskedChange,
  onValueSettle,
  deltaHoldMs = 2600,
  caption,
  className,
}: BalanceRollProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [uncontrolledMask, setUncontrolledMask] = React.useState(defaultMasked);
  const isMaskControlled = masked !== undefined;
  const isMasked = isMaskControlled ? masked : uncontrolledMask;

  // The previous figure is held in committed state rather than a ref: a ref read
  // during render is banned here, and the committed pair is what the delta chip
  // and the announcement both have to agree about.
  const [committed, setCommitted] = React.useState({
    value,
    previous: value,
    seq: 0,
  });
  if (committed.value !== value) {
    setCommitted({ value, previous: committed.value, seq: committed.seq + 1 });
  }
  const delta = committed.value - committed.previous;
  const seq = committed.seq;

  const [dismissed, setDismissed] = React.useState(0);
  const settleRef = useLatest(onValueSettle);

  React.useEffect(() => {
    if (seq === 0) return;
    settleRef.current?.(value, delta);
  }, [seq, value, delta, settleRef]);

  React.useEffect(() => {
    if (seq === 0 || deltaHoldMs <= 0) return;
    // setState lives in the timer callback, never in the effect body.
    const timer = window.setTimeout(() => setDismissed(seq), deltaHoldMs);
    return () => window.clearTimeout(timer);
  }, [seq, deltaHoldMs]);

  const toggle = () => {
    const next = !isMasked;
    if (!isMaskControlled) setUncontrolledMask(next);
    onMaskedChange?.(next);
  };

  const printed = format(value);
  const showChip = seq > 0 && delta !== 0 && dismissed < seq && !isMasked;
  const up = delta > 0;
  const deltaText = `${up ? "+" : "-"}${format(Math.abs(delta))}`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-1.5", className)}>
      <span
        id={labelId}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {label}
      </span>

      {/* Wraps rather than overflows: a long figure and a long chip together
          drop the chip to its own line instead of running past the edge. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          aria-pressed={isMasked}
          aria-describedby={labelId}
          onClick={toggle}
          className={cn(
            "group -mx-1 flex items-center gap-2 rounded-2 px-1 py-0.5 outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="font-mono text-2xl leading-none font-medium text-ink">
            <Figure text={printed} masked={isMasked} motionSafe={motionSafe} />
          </span>
          <span className="sr-only">
            {isMasked
              ? "Balance hidden. Show balance."
              : `${printed}. Hide balance.`}
          </span>
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-foreground"
          >
            <path d="M1.9 10S4.8 4.9 10 4.9 18.1 10 18.1 10 15.2 15.1 10 15.1 1.9 10 1.9 10Z" />
            <circle cx="10" cy="10" r="2.3" />
            <motion.line
              x1="4.4"
              y1="15.6"
              x2="15.6"
              y2="4.4"
              pathLength={1}
              initial={false}
              // The slash is the acknowledgement of the press, so it draws on
              // flick — instant under reduced motion, never absent.
              animate={{ pathLength: isMasked ? 1 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        </button>

        <AnimatePresence initial={false}>
          {showChip ? (
            <motion.span
              key={seq}
              aria-hidden
              className={cn(
                "flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 font-mono text-[11px] tabular-nums",
                up
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-danger/30 bg-danger/10 text-danger",
              )}
              initial={
                motionSafe
                  ? { opacity: 0, x: distances.step }
                  : { opacity: 0, x: 0 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? {
                      ...springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            >
              <svg
                viewBox="0 0 12 12"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3 shrink-0"
              >
                {up ? (
                  <path d="M6 9.5v-7M3 5.5 6 2.5l3 3" />
                ) : (
                  <path d="M6 2.5v7M3 6.5 6 9.5l3-3" />
                )}
              </svg>
              {deltaText}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {caption ? <p className="text-xs text-ink-3">{caption}</p> : null}

      {/* Masked changes stay silent here: the button's own name already changes,
          and a hidden balance should not be read out on every movement. */}
      <span role="status" className="sr-only">
        {isMasked || seq === 0
          ? ""
          : `${label} ${printed}${
              delta === 0
                ? ""
                : `, ${up ? "up" : "down"} ${format(Math.abs(delta))}`
            }`}
      </span>
    </div>
  );
}
