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

export type RiskHoldStatus = "held" | "released" | "escalated";
export type RiskHoldCause = "reviewer" | "timer";

export type RiskHoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled state of the hold. */
  status?: RiskHoldStatus;
  /** Initial state for uncontrolled usage. @default "held" */
  defaultStatus?: RiskHoldStatus;
  /** Fires from the press, or from the ring running out (`cause: "timer"`). */
  onStatusChange?: (status: RiskHoldStatus, cause: RiskHoldCause) => void;
  /** The held sum, in `symbol`. */
  amount: number;
  /** Asset code, e.g. "BSN". */
  symbol: string;
  /** Who the payment goes to. */
  payee: string;
  /** Why it was held. @default "New payee" */
  reason?: string;
  /** Formats the amount. */
  format?: (value: number) => string;
  /** The review window; the ring drains across it and releases at zero. @default 10000 */
  reviewMs?: number;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => money.format(value);

const clock = (totalSeconds: number) => {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab never paints, so the window stops draining where nobody is. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/** The tick draws rather than appears: `flick` settles in 120ms, so the
 *  confirmation never delays the thing it confirms. */
function TickMark({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3 shrink-0"
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
 * Held for a look, then released. A payment row keeps its place at the top
 * while a hold notice beneath it explains the pause and drains a review ring
 * across `reviewMs` — linearly, because a countdown is information, and the
 * readout ticks from the motion value so nothing re-renders per second.
 * Release, by a reviewer or by the ring running out, slides the notice away
 * on the exit ease while its height closes, and the row's chip turns to Sent
 * with a tick drawn on `flick`. Escalate stops the ring where it stands and
 * turns the notice amber by colour alone; a human can still release it.
 *
 * Nothing here bounces: a hold is a pause and a release is a door opening, so
 * the notice arrives on `glide` and leaves on the exit ease. Under reduced
 * motion the ring still drains, the notice fades and closes without sliding,
 * and the amber turn is instant.
 */
export function RiskHold({
  ref,
  status,
  defaultStatus = "held",
  onStatusChange,
  amount,
  symbol,
  payee,
  reason = "New payee",
  format = defaultFormat,
  reviewMs = 10000,
  label,
  className,
  "aria-label": ariaLabel,
}: RiskHoldProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] =
    React.useState<RiskHoldStatus>(defaultStatus);
  const isControlled = status !== undefined;
  const current = isControlled ? status : uncontrolled;
  const [cause, setCause] = React.useState<RiskHoldCause>("reviewer");

  const changeRef = React.useRef(onStatusChange);
  React.useEffect(() => {
    changeRef.current = onStatusChange;
  }, [onStatusChange]);

  // 1 → 0 across the window. A motion value, not state: pausing is stopping
  // the animation and resuming from what is left, with no render in between.
  const remaining = useMotionValue(1);
  const ringOffset = useTransform(remaining, (value) => 1 - value);
  const readout = useTransform(remaining, (value) =>
    clock(Math.ceil((value * reviewMs) / 1000)),
  );

  const previousStatus = React.useRef(current);
  React.useEffect(() => {
    // A fresh hold gets a full ring; a paused one resumes where it stood.
    if (previousStatus.current !== current) {
      previousStatus.current = current;
      if (current === "held") remaining.set(1);
    }
    if (current !== "held" || !visible || reviewMs <= 0) return;
    const controls = animate(remaining, 0, {
      duration: (reviewMs / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => {
        setCause("timer");
        if (!isControlled) setUncontrolled("released");
        changeRef.current?.("released", "timer");
      },
    });
    return () => controls.stop();
  }, [current, visible, reviewMs, remaining, isControlled]);

  const move = (next: RiskHoldStatus) => {
    if (next === current) return;
    setCause("reviewer");
    if (!isControlled) setUncontrolled(next);
    onStatusChange?.(next, "reviewer");
  };

  const held = current === "held";
  const released = current === "released";
  const escalated = current === "escalated";

  const chipText = released ? "Sent" : escalated ? "Escalated" : "Held";
  const announcement = released
    ? cause === "timer"
      ? "Released when the review window closed. Payment sent."
      : "Released by reviewer. Payment sent."
    : escalated
      ? "Escalated for manual review."
      : `Held for review. Releases in ${Math.round(reviewMs / 1000)} seconds unless escalated.`;

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {label ? (
            <span
              id={labelId}
              className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              {label}
            </span>
          ) : null}
          <span className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span className="text-base font-semibold text-foreground">
              {format(amount)}
            </span>
            <span className="text-xs text-ink-3">{symbol}</span>
          </span>
          <span className="truncate text-xs text-ink-3" title={payee}>
            to {payee}
          </span>
        </div>

        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors",
            released
              ? "border-success/40 text-success"
              : escalated
                ? "border-warn/40 text-warn"
                : "border-hairline-strong text-ink-2",
          )}
        >
          {released ? <TickMark motionSafe={motionSafe} /> : null}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={chipText}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {chipText}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <AnimatePresence initial={false}>
        {!released ? (
          <motion.div
            key="notice"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, x: 0 }}
            // The slide is the release: the notice leaves to the side while its
            // height closes, so the row above never jumps to fill the gap.
            exit={{
              x: motionSafe ? distances.shift : 0,
              opacity: 0,
              height: 0,
              transition: exitFor(),
            }}
            transition={
              motionSafe
                ? { ...springs.glide, opacity: fade }
                : { duration: durations.base, ease: easings.enter }
            }
          >
            <div
              className={cn(
                "flex flex-col gap-3 border-t border-hairline p-3 transition-colors",
                escalated && "bg-warn/10",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  role="timer"
                  aria-label="Review window"
                  className={cn(
                    "relative grid size-10 shrink-0 place-items-center transition-colors",
                    escalated ? "text-warn" : "text-cobalt-bright",
                  )}
                >
                  <svg
                    viewBox="0 0 40 40"
                    aria-hidden
                    className="col-start-1 row-start-1 size-full -rotate-90"
                  >
                    <circle
                      cx="20"
                      cy="20"
                      r="17"
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity="0.2"
                      strokeWidth="3"
                    />
                    <motion.circle
                      cx="20"
                      cy="20"
                      r="17"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray="1 1"
                      style={{ strokeDashoffset: ringOffset }}
                    />
                  </svg>
                  <motion.span className="col-start-1 row-start-1 font-mono text-[10px] font-medium text-foreground tabular-nums">
                    {readout}
                  </motion.span>
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-sm font-medium transition-colors",
                      escalated ? "text-warn" : "text-foreground",
                    )}
                  >
                    {escalated ? "Escalated for review" : "Held for review"}
                  </span>
                  <span className="text-xs text-ink-3">
                    {escalated
                      ? "A reviewer will clear it by hand."
                      : `${reason}. Releases when the window closes.`}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => move("released")}
                  className={cn(
                    "flex h-8 flex-1 items-center justify-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 active:bg-primary/95",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  Release
                </button>
                <button
                  type="button"
                  aria-disabled={escalated || undefined}
                  onClick={() => {
                    if (held) move("escalated");
                  }}
                  // Never `disabled`: the label is the state, and a control
                  // dropped from the tab order cannot say "already escalated".
                  className={cn(
                    "flex h-8 flex-1 items-center justify-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    escalated
                      ? "cursor-default border-warn/40 text-warn"
                      : "border-hairline-strong bg-surface-2 text-foreground hover:bg-accent active:bg-cobalt-wash",
                  )}
                >
                  {escalated ? "Escalated" : "Escalate"}
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
