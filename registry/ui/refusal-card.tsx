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

export type RefusalAlternative = { id: string; label: string };

export type RefusalCardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Shows the card. Raise it when the model has refused. */
  open: boolean;
  /** The refusal headline. @default "Can't do that" */
  title?: string;
  /** One line on why, in the house voice. */
  reason: string;
  /** What the model can do instead, in offer order. */
  alternatives: RefusalAlternative[];
  /** Controlled id of the alternative that was sent, or null. */
  sent?: string | null;
  /** Initial sent id for uncontrolled usage. @default null */
  defaultSent?: string | null;
  /** Fires from the click or key that picked a chip. */
  onSend?: (id: string) => void;
  /** Names the card region for assistive technology. */
  label: string;
  className?: string;
};

/** Seconds after mount at which the chips begin to arrive — the card has visibly landed. */
const LAND = 0.3;

type PanelProps = Omit<RefusalCardProps, "open" | "className" | "ref"> & {
  title: string;
};

/**
 * The panel is its own component so that every opening starts fresh: the
 * lift phase, the roving focus and an uncontrolled pick belong to one refusal,
 * not to the card slot that outlives it.
 */
function RefusalPanel({
  title,
  reason,
  alternatives,
  sent: sentProp,
  defaultSent = null,
  onSend,
  label,
}: PanelProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const groupId = `${baseId}-instead`;

  const [ownSent, setOwnSent] = React.useState<string | null>(defaultSent);
  const sent = sentProp === undefined ? ownSent : sentProp;
  const [lifted, setLifted] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  // The chosen chip lifts first and the sent line follows once the lift has
  // settled; under reduced motion there is no lift to wait for.
  const showSent = sent !== null && (!motionSafe || lifted === sent);
  const sentLabel = alternatives.find((item) => item.id === sent)?.label;

  const pick = (id: string) => {
    if (sent !== null) return;
    if (sentProp === undefined) setOwnSent(id);
    onSend?.(id);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(alternatives.length - 1, Math.max(0, index));
    const item = alternatives[clamped];
    if (!item) return;
    setFocusIndex(clamped);
    document.getElementById(`${baseId}-chip-${item.id}`)?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
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
      focusAt(alternatives.length - 1);
    }
  };

  // The chips leave the tree on a pick, so focus would fall to the body; the
  // sent line takes it instead, but only when it was inside the card.
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const sentRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!showSent) return;
    const active = document.activeElement;
    if (active === document.body || cardRef.current?.contains(active)) {
      sentRef.current?.focus();
    }
  }, [showSent]);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setMeasured(node.getBoundingClientRect().height),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const stagger = cascade(alternatives.length);

  return (
    <motion.div
      ref={cardRef}
      role="region"
      aria-label={label}
      initial={motionSafe ? { opacity: 0, y: -distances.step } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={motionSafe ? { ...springs.drift, opacity: fade } : fade}
      className="flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3"
    >
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="size-4 shrink-0 text-ink-3"
        >
          <circle cx="8" cy="8" r="6" />
          <path d="m4 12 8-8" />
        </svg>
        <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
      </div>
      <p className="text-sm leading-relaxed text-ink-2">{reason}</p>

      <motion.div
        initial={false}
        animate={{ height: measured > 0 ? Math.round(measured) : "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="pt-1">
          <AnimatePresence mode="wait" initial={false}>
            {showSent ? (
              <motion.div
                key="sent"
                ref={sentRef}
                tabIndex={-1}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
                className="flex h-8 items-center gap-2 text-sm outline-none"
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 shrink-0 text-success"
                >
                  <motion.path
                    d="M3.5 8.5 6.5 11.5 12.5 4.5"
                    pathLength={1}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.flick,
                            opacity: { duration: durations.blink },
                          }
                        : { duration: 0 }
                    }
                  />
                </svg>
                <span className="min-w-0 truncate">
                  <span className="text-ink-3">Sent · </span>
                  {sentLabel}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="offer"
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                className="flex flex-col gap-1.5"
              >
                <span
                  id={groupId}
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  Instead
                </span>
                <div
                  role="group"
                  aria-labelledby={groupId}
                  className="flex flex-wrap gap-2"
                >
                  {alternatives.map((item, index) => {
                    const chosen = sent === item.id;
                    const dimmed = sent !== null && !chosen;
                    // No stagger under reduced motion: the offer is one swap.
                    const delay = motionSafe ? LAND + index * stagger : 0;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        id={`${baseId}-chip-${item.id}`}
                        tabIndex={index === focusIndex ? 0 : -1}
                        disabled={sent !== null}
                        onFocus={() => setFocusIndex(index)}
                        onClick={() => pick(item.id)}
                        onKeyDown={(event) => handleKeyDown(event, index)}
                        initial={
                          motionSafe
                            ? { opacity: 0, x: distances.step }
                            : { opacity: 0 }
                        }
                        animate={{
                          opacity: dimmed ? 0 : 1,
                          x: 0,
                          y: chosen && motionSafe ? -2 : 0,
                        }}
                        transition={
                          sent === null
                            ? {
                                x: { ...springs.snap, delay },
                                opacity: { ...fade, delay },
                              }
                            : {
                                y: springs.flick,
                                opacity: {
                                  duration: durations.fast,
                                  ease: easings.exit,
                                },
                              }
                        }
                        onAnimationComplete={() => {
                          if (chosen) setLifted(item.id);
                        }}
                        className={cn(
                          "flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none",
                          chosen
                            ? "border-hairline-strong bg-cobalt-wash text-foreground"
                            : "border-hairline bg-surface-0 text-foreground hover:border-hairline-strong hover:bg-accent",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        )}
                      >
                        {item.label}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {showSent
          ? `Sent: ${sentLabel ?? ""}`
          : `Refused: ${reason} ${alternatives.length} ${alternatives.length === 1 ? "alternative" : "alternatives"}.`}
      </span>
    </motion.div>
  );
}

/**
 * A refusal that arrives without drama and offers a way forward. The card
 * lowers into place from `distances.step` above on `drift` — ζ1.0, no
 * overshoot, because a refusal never celebrates — and once it has landed
 * the alternatives slide in as chips from `distances.step` to the right on
 * `snap`, in a `cascade()`, so the offer reads as a second beat rather than
 * part of the refusal.
 *
 * Picking a chip sends it: the chosen chip lifts two pixels on `flick`, the
 * others fade on the exit ease, and the row cross-fades to a sent line with
 * a tick drawn on `flick`, while the body glides to the measured height of
 * whichever row is showing. The chips are a group with a roving tabindex —
 * arrows step, Home and End jump, Enter or Space sends — and a polite live
 * region reads the refusal once when it lands and the sent line once on a
 * pick. Under reduced motion the card and chips fade in place and the body
 * height changes on a tween.
 */
export function RefusalCard({
  ref,
  open,
  title = "Can't do that",
  className,
  ...panel
}: RefusalCardProps) {
  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <AnimatePresence mode="wait">
        {open ? <RefusalPanel key="panel" title={title} {...panel} /> : null}
      </AnimatePresence>
    </div>
  );
}
