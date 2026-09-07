"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** How far the two halves of the perforation separate once it gives way. */
const SEAM_GAP = 2.5;

/**
 * The stub leaves under a closing clip while it swings away: a tear
 * accelerates off the ticket, so it rides the exit ease and never springs.
 */
const TEAR = {
  whole: { opacity: 1, y: 0, rotate: 0, clipPath: "inset(0% 0% 0% 0%)" },
  torn: {
    opacity: 0,
    x: 20,
    y: 10,
    rotate: 5,
    clipPath: "inset(0% 0% 0% 55%)",
    transition: exitFor(durations.base),
  },
};

export type CouponResult = {
  /** What the discount is called on the summary line. */
  label: string;
  /** Amount taken off the subtotal, in the same units as `subtotal`. */
  amount: number;
};

export type CouponSlotProps = {
  /** Validates a code and returns the discount, or null to refuse it. */
  onApply: (code: string) => CouponResult | null;
  /** The figure the discount comes off. */
  subtotal: number;
  /** Money formatter — the component prints nothing it did not return. */
  format: (value: number) => string;
  /** Field label, shown above the stub. @default "Coupon code" */
  label?: string;
  /** Fires when a discount is applied or removed. */
  onDiscountChange?: (discount: CouponResult | null) => void;
  className?: string;
};

type RolledMoneyProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * The figure rolls to its new total on `glide`. The text is a motion value
 * handed to the span as its child, so counting down re-renders nothing, and
 * `tabular-nums` pins the cell so travelling digits cannot nudge the row.
 */
function RolledMoney({
  value,
  format,
  motionSafe,
  className,
}: RolledMoneyProps) {
  const amount = useMotionValue(value);
  const text = useTransform(amount, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the total — only the travel is dropped.
    if (!motionSafe) {
      amount.set(value);
      return;
    }
    const controls = animate(amount, value, springs.glide);
    return () => controls.stop();
  }, [amount, motionSafe, value]);

  return (
    <span className={cn("font-mono tabular-nums", className)}>
      <span className="sr-only">{format(value)}</span>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  );
}

/**
 * A coupon field shaped like the ticket it is. A code that takes tears the
 * stub off along its perforation — the stub swings out under a closing clip on
 * the exit ease, because a tear accelerates away and never springs back — the
 * two halves of the seam part, a discount line glides in beneath the subtotal,
 * and the total rolls down to meet it.
 *
 * A code that does not take is refused in the same language: the field nudges
 * 4px and settles on `recoil`, and the seam opens and reseals on that same
 * spring, so the ticket is visibly still whole. Removing the discount reseals
 * the seam on `glide` and the stub returns.
 *
 * The field is a plain input: Enter applies, the outcome is wired to it
 * through `aria-describedby` and announced politely, and focus follows the
 * work — to Remove when the stub tears off, back to the field when it returns.
 * Under reduced motion nothing travels: the discount line and the stub simply
 * appear, and the total's digits swap.
 */
export function CouponSlot({
  onApply,
  subtotal,
  format,
  label = "Coupon code",
  onDiscountChange,
  className,
}: CouponSlotProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const inputId = `${uid}-code`;
  const outcomeId = `${uid}-outcome`;

  const [code, setCode] = React.useState("");
  const [applied, setApplied] = React.useState<
    (CouponResult & { code: string }) | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const removeRef = React.useRef<HTMLButtonElement | null>(null);
  /** Where focus should land once the stub has swapped, set by the handler. */
  const handOff = React.useRef<"remove" | "input" | null>(null);

  const nudge = useMotionValue(0);
  const seam = useMotionValue(0);
  const seamUp = useTransform(seam, (value) => -value * SEAM_GAP);
  const seamDown = useTransform(seam, (value) => value * SEAM_GAP);

  const total = Math.max(0, subtotal - (applied?.amount ?? 0));

  React.useEffect(() => {
    const target = handOff.current;
    if (!target) return;
    handOff.current = null;
    if (target === "remove") removeRef.current?.focus();
    else inputRef.current?.focus();
  }, [applied]);

  const apply = () => {
    const trimmed = code.trim();
    if (!trimmed || applied) return;
    const result = onApply(trimmed);

    if (!result) {
      setError("That code is not valid.");
      // Two keyframes, because a spring only ever honours two: the field
      // starts 4px out and settles back through recoil's two bounces, and the
      // seam opens with it and closes again — the ticket is still whole.
      if (motionSafe) {
        animate(nudge, [distances.nudge, 0], springs.recoil);
        animate(seam, [1, 0], springs.recoil);
      }
      return;
    }

    setError(null);
    setApplied({ ...result, code: trimmed });
    handOff.current = "remove";
    onDiscountChange?.(result);
    if (motionSafe) {
      animate(seam, 1, { duration: durations.base, ease: easings.exit });
    } else {
      seam.set(0);
    }
  };

  const remove = () => {
    if (!applied) return;
    setApplied(null);
    setError(null);
    handOff.current = "input";
    onDiscountChange?.(null);
    if (motionSafe) animate(seam, 0, springs.glide);
    else seam.set(0);
  };

  const outcome = error ?? (applied ? `${applied.label} applied.` : "");

  /** Height glides, opacity tweens — a line arriving is a layout shift. */
  const reveal = {
    height: motionSafe ? springs.glide : { duration: 0 },
    opacity: { duration: durations.fast, ease: easings.enter },
  };

  const row = "flex items-baseline justify-between gap-3";
  const rowLabel = "text-ink-2 min-w-0 truncate text-xs";
  const rowValue = "shrink-0 font-mono text-sm tabular-nums";

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex flex-col gap-2 p-3">
        <div className={row}>
          <span className={rowLabel}>Subtotal</span>
          <span className={cn(rowValue, "text-ink-2")}>{format(subtotal)}</span>
        </div>

        <AnimatePresence initial={false}>
          {applied ? (
            <motion.div
              key="discount"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, transition: exitFor() }}
              transition={reveal}
              className="overflow-hidden"
            >
              <motion.div
                initial={{ y: motionSafe ? -distances.step : 0 }}
                animate={{ y: 0 }}
                transition={
                  motionSafe ? springs.glide : { duration: durations.fast }
                }
                className={row}
              >
                <span className={cn(rowLabel, "text-success")}>
                  {applied.label}
                </span>
                <span className={cn(rowValue, "text-success")}>
                  &minus;{format(applied.amount)}
                </span>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="border-t border-hairline pt-2">
          <div className={row}>
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              Total
            </span>
            <RolledMoney
              value={total}
              format={format}
              motionSafe={motionSafe}
              className={cn(rowValue, "font-medium text-foreground")}
            />
          </div>
        </div>
      </div>

      {/* The perforation is one line drawn twice; parting the copies by a
          couple of pixels is the seam giving way, with no third element to
          keep in register. */}
      <div aria-hidden className="relative h-3">
        {[
          { key: "up", y: seamUp },
          { key: "down", y: seamDown },
        ].map((half) => (
          <motion.span
            key={half.key}
            style={{
              y: half.y,
              top: 4.5,
              backgroundImage:
                "radial-gradient(circle, currentColor 1.2px, transparent 1.4px)",
              backgroundSize: "9px 3px",
              backgroundRepeat: "repeat-x",
            }}
            className="absolute inset-x-3 block h-[3px] text-ink-3/70"
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 p-3 pt-1">
        {applied ? (
          <span className="block font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {label}
          </span>
        ) : (
          <label
            htmlFor={inputId}
            className="block font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {label}
          </label>
        )}

        <motion.div style={{ x: nudge }} className="relative h-9">
          <AnimatePresence initial={false}>
            {applied ? (
              <motion.div
                key="applied"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="absolute inset-0 flex items-center gap-2"
              >
                <span className="flex h-9 min-w-0 flex-1 items-center rounded-2 bg-cobalt-wash px-3 font-mono text-xs tracking-[0.06em] text-cobalt-bright uppercase">
                  <span className="truncate">{applied.code}</span>
                </span>
                <button
                  ref={removeRef}
                  type="button"
                  onClick={remove}
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-2 border border-hairline-strong px-3 text-sm font-medium text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Remove
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="stub"
                initial={{
                  ...TEAR.whole,
                  opacity: 0,
                  y: motionSafe ? -distances.step : 0,
                }}
                animate={TEAR.whole}
                exit={
                  motionSafe
                    ? TEAR.torn
                    : { opacity: 0, transition: exitFor(durations.fast) }
                }
                transition={
                  motionSafe ? springs.glide : { duration: durations.fast }
                }
                className="absolute inset-0 flex items-center gap-2"
                style={{ originX: 0, originY: 0.5 }}
              >
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  value={code}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={outcomeId}
                  placeholder="Enter a code"
                  onChange={(event) => {
                    setCode(event.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    apply();
                  }}
                  className={cn(
                    "h-9 min-w-0 flex-1 rounded-2 border bg-surface-0 px-3 font-mono text-xs tracking-[0.06em] text-foreground uppercase transition-colors outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    error ? "border-danger" : "border-input",
                  )}
                />
                <button
                  type="button"
                  onClick={apply}
                  disabled={code.trim().length === 0}
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-2 bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50"
                >
                  Apply
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence initial={false}>
          {outcome ? (
            <motion.p
              key="outcome"
              id={outcomeId}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, transition: exitFor() }}
              transition={reveal}
              className={cn(
                "overflow-hidden text-xs",
                error ? "text-danger" : "text-success",
              )}
            >
              {outcome}
            </motion.p>
          ) : null}
        </AnimatePresence>

        {/* A live region has to be in the document before its text changes, so
            the announcement lives here rather than on the line that fades in. */}
        <span role="status" aria-live="polite" className="sr-only">
          {outcome}
        </span>
      </div>
    </div>
  );
}
