"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ApproveStepStatus =
  "idle" | "approving" | "approved" | "swapping" | "done" | "failed";

export type ApproveStepProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled state of the pair. */
  status?: ApproveStepStatus;
  /** Initial state for uncontrolled usage. @default "idle" */
  defaultStatus?: ApproveStepStatus;
  /** Fires from the press that moved the control into a pending state. */
  onStatusChange?: (status: ApproveStepStatus) => void;
  /** Fires from the Approve (or Retry) press; the host does the work. */
  onApprove?: () => void;
  /** Fires from the Swap press; the host does the work. */
  onSwap?: () => void;
  /** The sum being approved, in `symbol`. */
  amount: number;
  /** Ticker being approved, e.g. "BSN". */
  symbol: string;
  /** The estimated sum received, in `receiveSymbol`. */
  receive: number;
  /** Ticker received, e.g. "FRN". */
  receiveSymbol: string;
  /** Formats both sums, in the labels and in the spoken sentences. */
  format?: (value: number) => string;
  /** The line shown under the row while `status` is `"failed"`. */
  errorMessage?: string;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const amounts = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const defaultFormat = (value: number) => amounts.format(value);

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab never paints, so the ring stops turning where nobody is. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/**
 * A wait turns at a constant rate — a spring here would imply the work is
 * nearly finished, which the control has no way of knowing.
 */
function PendingRing({ spin }: { spin: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-3.5 shrink-0"
      style={{ originX: 0.5, originY: 0.5 }}
      animate={spin ? { rotate: 360 } : { rotate: 0 }}
      transition={
        spin
          ? { duration: 0.9, ease: easings.linear, repeat: Infinity }
          : { duration: 0 }
      }
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

/** The tick draws rather than appears: a confirmation lands, and `flick`
 *  settles in 120ms so it never delays what it is confirming. */
function TickMark({
  motionSafe,
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
    >
      <motion.path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        initial={motionSafe ? { pathLength: 0 } : { pathLength: 1 }}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

/**
 * Allow, then swap. Two controls share one row, and the second cannot be
 * reached until the first has finished: Swap starts `aria-disabled` and drawn
 * asleep, so the keyboard can still find it and hear why it will not move.
 * Approving turns a ring at a constant rate; approval collapses the button to a
 * tick chip that slides aside on `glide` while Swap takes the width it left, one
 * layout move of 450ms. Swap wakes into that width with a single `snap` from
 * 0.98 — one crisp overshoot — and a settled swap stamps its tick on `recoil`,
 * the only bounce in the control, because a completed trade is a landing.
 *
 * Every state arrives through `status`, so the control never invents time; a
 * failed approval returns as Retry with a `role="alert"` line and no
 * celebration at all. Under reduced motion the ring holds still and says
 * "Approving" in words, and the chip and the width swap instantly.
 */
export function ApproveStep({
  ref,
  status,
  defaultStatus = "idle",
  onStatusChange,
  onApprove,
  onSwap,
  amount,
  symbol,
  receive,
  receiveSymbol,
  format = defaultFormat,
  errorMessage = "Approval was not confirmed.",
  label,
  className,
  "aria-label": ariaLabel,
}: ApproveStepProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const noteId = `${baseId}-note`;

  const [uncontrolled, setUncontrolled] =
    React.useState<ApproveStepStatus>(defaultStatus);
  const isControlled = status !== undefined;
  const current = isControlled ? status : uncontrolled;

  const swapRef = React.useRef<HTMLButtonElement>(null);
  // Set by the Approve press, read by the effect that lands on "approved": the
  // button the viewer was standing on is about to become a chip, so the flow
  // hands focus to the step that just woke rather than dropping it on the body.
  const handoffRef = React.useRef(false);

  const settled = current === "approved" || current === "swapping";
  const done = current === "done";
  const cleared = settled || done;
  const approving = current === "approving";
  const swapping = current === "swapping";
  const failed = current === "failed";
  const asleep = !cleared;

  React.useEffect(() => {
    if (current !== "approved") return;
    if (!handoffRef.current) return;
    handoffRef.current = false;
    swapRef.current?.focus();
  }, [current]);

  const move = (next: ApproveStepStatus) => {
    if (!isControlled) setUncontrolled(next);
    onStatusChange?.(next);
  };

  const pressApprove = () => {
    if (approving || cleared) return;
    handoffRef.current = true;
    move("approving");
    onApprove?.();
  };

  const pressSwap = () => {
    if (asleep || swapping || done) return;
    move("swapping");
    onSwap?.();
  };

  const step = done ? "Complete" : cleared ? "Step 2 of 2" : "Step 1 of 2";
  const stepNote = done
    ? "Swapped"
    : cleared
      ? "Swap when you are ready"
      : "Approve the allowance first";

  const layout = motionSafe ? true : false;
  const layoutTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  const announcement = done
    ? `Swap complete. ${format(receive)} ${receiveSymbol} received.`
    : current === "approved"
      ? `Approved. Swap is ready.`
      : "";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          {label ? (
            <span
              id={labelId}
              className="min-w-0 truncate text-sm font-semibold"
            >
              {label}
            </span>
          ) : null}
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {step}
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums">
          {format(amount)} {symbol}
          <span aria-hidden className="mx-1.5 text-ink-3">
            →
          </span>
          <span className="sr-only">for about </span>
          {format(receive)} {receiveSymbol}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <motion.div
          layout={layout}
          transition={layoutTransition}
          className={cn(cleared ? "w-10 shrink-0" : "min-w-0 flex-1")}
        >
          {cleared ? (
            <motion.span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-2 border border-hairline-strong bg-surface-2 text-success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              <TickMark motionSafe={motionSafe} />
            </motion.span>
          ) : (
            <button
              type="button"
              onClick={pressApprove}
              aria-busy={approving}
              aria-label={`${failed ? "Retry approval of" : "Approve"} ${format(
                amount,
              )} ${symbol}`}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-1.5 overflow-hidden rounded-2 border px-3 text-sm font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                failed
                  ? "border-hairline-strong bg-surface-2 text-warn hover:bg-accent"
                  : "border-hairline-strong bg-surface-2 text-foreground hover:bg-accent active:bg-cobalt-wash",
                approving && "text-ink-2",
              )}
            >
              {approving ? <PendingRing spin={motionSafe && visible} /> : null}
              <span className="truncate">
                {approving ? "Approving" : failed ? "Retry" : "Approve"}
              </span>
            </button>
          )}
        </motion.div>

        <motion.div
          layout={layout}
          transition={layoutTransition}
          className="min-w-0 flex-1"
        >
          <motion.button
            type="button"
            ref={swapRef}
            onClick={pressSwap}
            aria-disabled={asleep || done}
            aria-busy={swapping}
            aria-describedby={asleep ? noteId : undefined}
            aria-label={`Swap ${format(amount)} ${symbol} for about ${format(
              receive,
            )} ${receiveSymbol}`}
            // Never `disabled`: a control taken out of the tab order cannot
            // explain why it is asleep, and the reason is the whole point here.
            className={cn(
              "flex h-10 w-full items-center justify-center gap-1.5 overflow-hidden rounded-2 px-3 text-sm font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              asleep
                ? "cursor-not-allowed border border-hairline bg-surface-2 text-ink-3"
                : done
                  ? "cursor-default bg-primary text-primary-foreground"
                  : "bg-primary text-primary-foreground shadow-raised hover:opacity-90",
            )}
            initial={false}
            // Reduced motion gets no scale at all: waking is carried by the
            // colour and the label, neither of which travels.
            animate={{ scale: motionSafe && asleep ? 0.98 : 1 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {swapping ? <PendingRing spin={motionSafe && visible} /> : null}
            {done ? (
              <motion.span
                aria-hidden
                className="flex shrink-0 items-center"
                initial={motionSafe ? { scale: 0.6 } : { scale: 1 }}
                animate={{ scale: 1 }}
                transition={motionSafe ? springs.recoil : { duration: 0 }}
              >
                <TickMark motionSafe={motionSafe} />
              </motion.span>
            ) : null}
            <span className="truncate">
              {done ? "Swapped" : swapping ? "Swapping" : "Swap"}
            </span>
          </motion.button>
        </motion.div>
      </div>

      {/* One line, whatever the state: the note and the failure share it, so
          nothing reserves room for a message that may never come. */}
      <div className="flex min-w-0 items-center border-t border-hairline pt-2.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={failed ? "error" : "note"}
            className={cn(
              "min-w-0 flex-1 text-[11px]",
              failed ? "text-warn" : "text-ink-3",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {failed ? errorMessage : stepNote}
          </motion.span>
        </AnimatePresence>
      </div>

      <span id={noteId} className="sr-only">
        Approve the allowance before swapping.
      </span>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {failed ? (
        <span role="alert" className="sr-only">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
