"use client";

import * as React from "react";

import { AnimatePresence, motion, type Transition } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type VerifyVerdict = "match" | "partial" | "mismatch";

export type VerifyRowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The claim being checked. */
  claim: string;
  /** What the claim is checked against. */
  source: { label: string; domain: string };
  /** The check is running: the scan bar sweeps until a verdict lands. */
  verifying?: boolean;
  /** The outcome once known; stamps the row when set. */
  verdict?: VerifyVerdict | null;
  /** Fires from the Verify or Recheck button. */
  onVerify?: () => void;
  /** Blocks the button, for hosts that check one row at a time. */
  disabled?: boolean;
  className?: string;
};

const VERDICTS: Record<
  VerifyVerdict,
  { word: string; announce: string; tone: string; fill: string }
> = {
  match: {
    word: "Match",
    announce: "Claim matches the source",
    tone: "text-success border-success",
    fill: "bg-success",
  },
  partial: {
    word: "Partial",
    announce: "Claim partly matches the source",
    tone: "text-warn border-warn",
    fill: "bg-warn",
  },
  mismatch: {
    word: "Mismatch",
    announce: "Claim does not match the source",
    tone: "text-danger border-danger",
    fill: "bg-danger",
  },
};

/**
 * A stamp lands with the physics of its meaning: a match on `recoil` (two
 * bounces of rubber hitting paper), a partial on `snap` (one firm overshoot),
 * a mismatch on `glide` — a failed check never celebrates.
 */
const LANDING: Record<
  VerifyVerdict,
  {
    from: { scale: number; rotate: number };
    rotate: number;
    spring: Transition;
  }
> = {
  match: {
    from: { scale: 1.4, rotate: -8 },
    rotate: -3,
    spring: springs.recoil,
  },
  partial: {
    from: { scale: 1.2, rotate: -5 },
    rotate: -2,
    spring: springs.snap,
  },
  mismatch: {
    from: { scale: 1.1, rotate: 0 },
    rotate: 0,
    spring: springs.glide,
  },
};

function VerdictMark({ verdict }: { verdict: VerifyVerdict }) {
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
      {verdict === "match" ? (
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
      ) : verdict === "partial" ? (
        <path d="M3 8h10" />
      ) : (
        <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
      )}
    </svg>
  );
}

/**
 * A claim checked against its source. The row carries the claim, the source
 * it leans on and a Verify button. Pressing Verify hands the check to the host;
 * while `verifying` a narrow scan bar sweeps the claim box on a linear tween
 * and repeats until the verdict lands, so the wait reads as a check in
 * progress rather than a frozen row. When `verdict` arrives the bar runs off
 * the right edge on the exit ease and a stamp lands beside the button — match
 * on `recoil`, partial on `snap`, mismatch on `glide` — while the claim's
 * underline takes the verdict's colour.
 *
 * The button is a real button (Tab, Enter, Space), busy while checking, and
 * the stamp is a word beside a colour, never colour alone; the row's live
 * region announces the verdict once, on the stamp. Under reduced motion the
 * claim box breathes a wash instead of a travelling bar and the stamp fades
 * in place.
 */
export function VerifyRow({
  ref,
  claim,
  source,
  verifying = false,
  verdict = null,
  onVerify,
  disabled = false,
  className,
}: VerifyRowProps) {
  const motionSafe = useMotionSafe();
  const claimId = React.useId();

  const busy = verifying && verdict === null;
  const settled = verdict ? VERDICTS[verdict] : null;
  const buttonLabel = busy ? "Checking" : verdict ? "Recheck" : "Verify";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={claimId}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-2 bg-surface-0 px-2.5 py-2">
        <p
          id={claimId}
          className="relative text-sm leading-snug text-foreground"
        >
          {claim}
        </p>
        <span
          aria-hidden
          className={cn(
            "mt-1.5 block h-0.5 w-full rounded-full transition-colors duration-200",
            settled ? settled.fill : "bg-hairline-strong",
          )}
        />

        <AnimatePresence>
          {busy ? (
            motionSafe ? (
              <motion.span
                key="scan"
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-10 bg-linear-to-r from-cobalt-bright/0 via-cobalt-bright/25 to-cobalt-bright/0"
                initial={{ left: "-15%", opacity: 1 }}
                animate={{ left: "100%" }}
                exit={{ left: "100%", opacity: 0, transition: exitFor() }}
                transition={{
                  duration: durations.page,
                  ease: easings.linear,
                  repeat: Infinity,
                }}
              >
                <span className="absolute inset-y-0 left-1/2 w-px bg-cobalt-bright/70" />
              </motion.span>
            ) : (
              <motion.span
                key="breathe"
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-cobalt-wash"
                initial={{ opacity: 0.25 }}
                animate={{ opacity: 0.85 }}
                exit={{ opacity: 0, transition: exitFor() }}
                transition={{
                  duration: durations.slow,
                  ease: easings.move,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
              />
            )
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-1.5 text-xs">
          <span className="shrink-0 text-ink-3">against</span>
          <span
            title={source.label}
            className="truncate font-medium text-ink-2"
          >
            {source.label}
          </span>
          <span className="hidden shrink-0 font-mono text-[10px] text-ink-3 sm:inline">
            {source.domain}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <AnimatePresence initial={false}>
            {verdict && settled ? (
              <motion.span
                key={verdict}
                className={cn(
                  "flex h-8 items-center gap-1 rounded-1 border-2 px-1.5 font-mono text-[10px] font-medium tracking-[0.08em] uppercase",
                  settled.tone,
                )}
                initial={
                  motionSafe
                    ? { ...LANDING[verdict].from, opacity: 0 }
                    : { opacity: 0 }
                }
                animate={{
                  scale: 1,
                  rotate: motionSafe ? LANDING[verdict].rotate : 0,
                  opacity: 1,
                }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...LANDING[verdict].spring,
                        opacity: { duration: durations.blink },
                      }
                    : { duration: durations.fast }
                }
              >
                <VerdictMark verdict={verdict} />
                {settled.word}
              </motion.span>
            ) : null}
          </AnimatePresence>

          <button
            type="button"
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            onClick={() => onVerify?.()}
            className={cn(
              "flex h-8 min-w-20 items-center justify-center rounded-2 border border-hairline-strong bg-surface-0 px-3 text-xs font-medium transition-colors outline-none",
              "hover:bg-accent active:bg-cobalt-wash disabled:cursor-default disabled:opacity-60 disabled:hover:bg-surface-0",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {buttonLabel}
          </button>
        </span>
      </div>

      <span role="status" className="sr-only">
        {settled ? settled.announce : ""}
      </span>
    </div>
  );
}
