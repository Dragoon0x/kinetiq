"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CitationClaim = {
  id: string;
  text: string;
  /** A source backs this claim. */
  covered: boolean;
};

export type CitationCountProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** How many citation marks the answer carries. */
  citations: number;
  /** Every claim the answer makes, and whether a source backs it. */
  claims: CitationClaim[];
  /** Controlled: the uncovered list is shown. */
  open?: boolean;
  /** Initial state for uncontrolled usage. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the badge for assistive technology. @default "Citations" */
  label?: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A number whose digits roll to their new value on `snap` — one crisp
 * overshoot per column. Hidden from assistive technology because the badge's
 * name already reads the count in words.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when
        // the number gains a digit, and only the new column mounts.
        const key = value.length - index;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${Math.max(0, digit) * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
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
 * How well-sourced an answer is, as a badge: a ring, a count and a word. The
 * ring fills in proportion to claims covered on `glide` — a fill is a
 * quantity settling, so it never overshoots — and the citation count rolls
 * its digits on `snap` when it changes. When every claim is covered the ring
 * and count turn success. Pressing the badge opens a panel beneath, its
 * height measured by a ResizeObserver and animated on `glide`, listing the
 * claims that still lack a source; rows leave on the exit ease as they become
 * covered, and when nothing is uncovered the panel says so.
 *
 * The badge is a real button whose name is the whole reading, so a screen
 * reader hears the count and the coverage in one breath; Escape inside the
 * panel closes it and returns focus to the badge. Under reduced motion the
 * ring still fills on a tween, the digits swap in place, and rows fade.
 */
export function CitationCount({
  ref,
  citations,
  claims,
  open,
  defaultOpen = false,
  onOpenChange,
  label = "Citations",
  className,
}: CitationCountProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-panel`;
  const headingId = `${baseId}-heading`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;

  const badgeRef = React.useRef<HTMLButtonElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  // The panel's height is measured from its content's border box, so nothing
  // is reserved for a list that may be empty.
  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      setHeight(
        Math.round(
          box ? box.blockSize : entry.target.getBoundingClientRect().height,
        ),
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const total = claims.length;
  const covered = claims.filter((claim) => claim.covered).length;
  const uncovered = claims.filter((claim) => !claim.covered);
  const ratio = total > 0 ? Math.round((covered / total) * 1e6) / 1e6 : 0;
  const complete = total > 0 && covered === total;
  const count = Math.max(0, Math.round(citations));
  const reading = `${count} ${count === 1 ? "citation" : "citations"}, ${covered} of ${total} ${total === 1 ? "claim" : "claims"} covered`;

  const tone = complete ? "text-success" : "text-cobalt-bright";

  return (
    <div
      ref={ref}
      className={cn("flex w-full flex-col gap-2", className)}
      // Escape anywhere in the widget lowers the panel; the list itself holds
      // nothing focusable, so the key arrives from the badge.
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.preventDefault();
        setOpen(false);
        badgeRef.current?.focus();
      }}
    >
      <button
        ref={badgeRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`${label}: ${reading}`}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "flex h-9 w-full items-center gap-2.5 rounded-full border border-hairline bg-surface-1 pr-3 pl-2.5 text-sm transition-colors outline-none hover:bg-accent",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={cn("size-5 shrink-0 -rotate-90 transition-colors", tone)}
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="2.5"
          />
          <motion.circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            initial={false}
            animate={{ strokeDashoffset: Number((1 - ratio).toFixed(3)) }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.base, ease: easings.enter }
            }
          />
        </svg>

        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span
            className={cn(
              "font-mono text-sm font-medium transition-colors",
              tone,
            )}
          >
            <RollingNumber value={String(count)} motionSafe={motionSafe} />
          </span>
          <span className="text-ink-2">
            {count === 1 ? "citation" : "citations"}
          </span>
        </span>

        <span
          aria-hidden
          className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums"
        >
          {covered}/{total} claims
        </span>

        <motion.svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 shrink-0 text-ink-3"
          style={{ originX: 0.5, originY: 0.5 }}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <path d="m4 6 4 4 4-4" />
        </motion.svg>
      </button>

      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        aria-hidden={!isOpen}
        initial={false}
        animate={{
          height: isOpen ? (height ?? "auto") : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={
          motionSafe
            ? { ...springs.glide, opacity: { duration: durations.fast } }
            : { duration: durations.base, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div
          ref={contentRef}
          className="flex flex-col gap-1.5 rounded-3 border border-hairline bg-surface-1 p-3"
        >
          <span
            id={headingId}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Uncovered claims
          </span>
          {uncovered.length === 0 ? (
            <p className="text-xs text-ink-2">Every claim is sourced.</p>
          ) : (
            <ul className="flex flex-col">
              <AnimatePresence initial={false}>
                {uncovered.map((claim) => (
                  <motion.li
                    key={claim.id}
                    layout={motionSafe ? "position" : false}
                    className="overflow-hidden"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{
                      opacity: 0,
                      height: 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.glide,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <span className="flex items-center gap-2 py-1">
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        className="size-4 shrink-0 text-warn"
                      >
                        <circle cx="8" cy="8" r="6" />
                        <path d="M8 5v3.5M8 11h.01" />
                      </svg>
                      <span className="min-w-0 flex-1 text-xs leading-snug text-foreground">
                        {claim.text}
                      </span>
                      <span className="sr-only">, needs a source</span>
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {reading}
      </span>
    </div>
  );
}
