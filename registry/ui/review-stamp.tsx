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

export type ReviewRecord = {
  /** Who approved the answer. */
  reviewer: string;
  /** The team they review for. */
  team?: string;
  /** When they approved it, already formatted by the host. */
  at: string;
};

export type ReviewStampProps = {
  ref?: React.Ref<HTMLElement>;
  /** The answer's text. */
  answer: string;
  /** The invented model that wrote it, printed in the header. */
  model: string;
  /** The approval on record; present, the stamp is down. @default null */
  review?: ReviewRecord | null;
  /** Fires from the Approve control; the host records who and when. */
  onApprove?: () => void;
  /** Fires from the Revoke control. */
  onRevoke?: () => void;
  /** The word on the seal. @default "Reviewed" */
  stampText?: string;
  /** Names the card for assistive technology. */
  label: string;
  className?: string;
};

const describe = (review: ReviewRecord): string =>
  `${review.reviewer}${review.team ? `, ${review.team}` : ""}, at ${review.at}`;

/**
 * An answer with a stamp that lands when a person approves it. The header's
 * right cell holds a state chip until the host records a review; then the
 * chip fades and a tilted seal drops from 1.6× scale on `recoil` — ζ0.53,
 * the two bounces of something landing — while its tick draws on `flick`
 * and the card's border takes the success tone on a colour tween. The seal
 * is a button: hovering or focusing it opens a tooltip that reads who and
 * when, on `flick` from 0.96 scale; pressing toggles it for touch.
 *
 * Revoking peels the seal: it lifts from its bottom edge on `rotateX`, drifts
 * up by `distances.step` and fades on the exit ease — exits never spring —
 * and the chip returns. Approve and Revoke share the footer at one height.
 * Under reduced motion the seal fades in and out at rest and the tooltip
 * fades without scaling; the success tint still tweens.
 */
export function ReviewStamp({
  ref,
  answer,
  model,
  review = null,
  onApprove,
  onRevoke,
  stampText = "Reviewed",
  label,
  className,
}: ReviewStampProps) {
  const motionSafe = useMotionSafe();
  const descId = React.useId();
  const reviewed = review !== null;

  // "Review revoked" is only true of a card that had a review; a card that
  // mounts unreviewed says nothing. Adjusting during render keeps the
  // announcement in the same commit as the change.
  const [wasReviewed, setWasReviewed] = React.useState(reviewed);
  const [revoked, setRevoked] = React.useState(false);
  if (wasReviewed !== reviewed) {
    setWasReviewed(reviewed);
    setRevoked(!reviewed);
  }

  const [hovering, setHovering] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const tipOpen = reviewed && (hovering || focused || pressed);

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  const announcement = review
    ? `Reviewed by ${review.reviewer} at ${review.at}`
    : revoked
      ? "Review revoked"
      : "";

  return (
    <article
      ref={ref}
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border bg-surface-1 p-3 transition-colors duration-300",
        reviewed ? "border-success/60" : "border-hairline",
        className,
      )}
    >
      <header className="flex h-8 items-center justify-between gap-3">
        <span
          title={model}
          className="min-w-0 truncate font-mono text-xs text-ink-2"
        >
          {model}
        </span>

        {/* The chip and the seal share one cell so the landing never moves
            the header; the tooltip hangs off the same cell's right edge. */}
        <span className="relative grid shrink-0 justify-items-end">
          <AnimatePresence initial={false}>
            {!reviewed ? (
              <motion.span
                key="chip"
                className="col-start-1 row-start-1 inline-flex h-6 items-center self-center rounded-full border border-hairline-strong px-2 text-[11px] font-medium text-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                Unreviewed
              </motion.span>
            ) : null}
            {review ? (
              <motion.button
                key="stamp"
                type="button"
                aria-label={`Reviewed by ${review.reviewer}`}
                aria-describedby={descId}
                onPointerEnter={() => setHovering(true)}
                onPointerLeave={() => setHovering(false)}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  setPressed(false);
                }}
                onClick={() => setPressed((current) => !current)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && tipOpen) {
                    event.preventDefault();
                    setPressed(false);
                    setHovering(false);
                    setFocused(false);
                  }
                }}
                style={{ transformPerspective: 400 }}
                initial={
                  motionSafe
                    ? { opacity: 0, scale: 1.6, rotate: -14 }
                    : { opacity: 0, rotate: -6 }
                }
                animate={{ opacity: 1, scale: 1, rotate: -6, rotateX: 0, y: 0 }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        rotateX: 70,
                        y: -distances.step,
                        transition: exitFor(),
                      }
                    : { opacity: 0, transition: exitFor(durations.fast) }
                }
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: { duration: durations.blink },
                      }
                    : fade
                }
                className={cn(
                  "relative col-start-1 row-start-1 flex h-8 items-center gap-1.5 rounded-full border-2 border-current bg-success/10 px-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-success uppercase outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-[3px] rounded-full border border-current opacity-60"
                />
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5 shrink-0"
                >
                  <motion.path
                    d="M3.5 8.5 6.5 11.5 12.5 4.5"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={
                      motionSafe ? { ...springs.flick, delay: 0.2 } : fade
                    }
                  />
                </svg>
                {stampText}
              </motion.button>
            ) : null}
          </AnimatePresence>

          {/* The description is always mounted so it exists the moment
              focus lands; the visible tooltip is its mirror. */}
          <span id={descId} className="sr-only">
            {review ? describe(review) : ""}
          </span>
          <AnimatePresence>
            {review && tipOpen ? (
              <motion.span
                key="tip"
                aria-hidden
                style={{ originX: 1, originY: 0 }}
                initial={
                  motionSafe ? { opacity: 0, scale: 0.96 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? { ...springs.flick, opacity: fade } : fade
                }
                className="pointer-events-none absolute top-full right-0 z-10 mt-1.5 flex w-max max-w-56 flex-col gap-0.5 rounded-2 border border-hairline-strong bg-popover px-2.5 py-2 text-left text-xs text-popover-foreground shadow-raised"
              >
                <span className="font-medium">{review.reviewer}</span>
                <span className="text-ink-2">
                  {review.team ? `${review.team} · ` : ""}
                  {review.at}
                </span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      </header>

      <p className="text-sm leading-relaxed">{answer}</p>

      <footer className="flex items-center justify-end gap-2">
        {reviewed ? (
          <button
            type="button"
            onClick={() => onRevoke?.()}
            className={cn(
              "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Revoke
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onApprove?.()}
            className={cn(
              "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Approve
          </button>
        )}
      </footer>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </article>
  );
}
