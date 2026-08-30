"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Confidence = "high" | "review" | "none";

export type CounselAlternative = {
  id: string;
  text: string;
  confidence: Confidence;
};

export type CounselCardProps = {
  /** The question the suggestion answers. */
  heading?: string;
  /** The suggestion itself, one sentence. */
  counsel?: string;
  /** The entity the counsel names, shown as a chip inside the sentence. */
  subject?: string;
  confidence?: Confidence;
  alternatives?: CounselAlternative[];
  acceptLabel?: string;
  onAccept?: () => void;
  alternativesLabel?: string;
  acceptedLine?: string;
  className?: string;
};

const CONFIDENCE_META: Record<
  Confidence,
  { label: string; bars: number; tone: "success" | "warn" | "muted" }
> = {
  high: { label: "High confidence", bars: 3, tone: "success" },
  review: { label: "Needs review", bars: 2, tone: "warn" },
  none: { label: "No signal", bars: 1, tone: "muted" },
};

const DEFAULT_ALTERNATIVES: CounselAlternative[] = [
  {
    id: "a1",
    text: "Swap the rig test into the morning window",
    confidence: "review",
  },
  { id: "a2", text: "Hold everything and re-cut at noon", confidence: "none" },
];

function ConfidenceMeter({ confidence }: { confidence: Confidence }) {
  const meta = CONFIDENCE_META[confidence];
  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={meta.label}
      role="img"
    >
      <span aria-hidden className="flex items-end gap-px">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "w-1 rounded-[1px]",
              i === 0 ? "h-1.5" : i === 1 ? "h-2.5" : "h-3.5",
              i < meta.bars
                ? meta.tone === "success"
                  ? "bg-[var(--success,var(--primary))]"
                  : meta.tone === "warn"
                    ? "bg-[var(--warn,var(--primary))]"
                    : "bg-ink-3"
                : "bg-surface-2",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-ink-3">{meta.label}</span>
    </span>
  );
}

/**
 * One suggestion, offered rather than executed: the counsel in a sentence
 * with its subject carried as a chip, an honest tri-state confidence meter —
 * high, needs review, no signal — and the alternatives kept a fold away with
 * their own confidence attached. The meter is the card's spine: a
 * recommendation that cannot say how sure it is will be trusted exactly once.
 *
 * Accepting seals the card in place; nothing executes twice. Reduced motion:
 * the fold opens instantly, the seal stamps without travel.
 */
export function CounselCard({
  heading = "Want me to post this reshuffle?",
  counsel = "Move the coating pass to",
  subject = "Crew B",
  confidence = "high",
  alternatives = DEFAULT_ALTERNATIVES,
  acceptLabel = "Accept",
  onAccept,
  alternativesLabel = "Alternatives",
  acceptedLine = "Posted. Both boards updated; the crews see it now.",
  className,
}: CounselCardProps) {
  const motionSafe = useMotionSafe();
  const headingId = React.useId();
  const foldId = React.useId();
  const [showAlternatives, setShowAlternatives] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className={cn(
        "w-full max-w-sm rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <p id={headingId} className="font-medium text-ink">
        {heading}
      </p>

      <p className="mt-2.5 text-sm leading-relaxed text-ink-2">
        {counsel}{" "}
        <span className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border border-hairline bg-surface-0 py-px pr-2 pl-1 align-middle text-xs font-medium text-ink">
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary"
          >
            {subject.slice(0, 1)}
          </span>
          {subject}
        </span>{" "}
        so the crane window holds.
      </p>

      <div className="mt-3">
        <ConfidenceMeter confidence={confidence} />
      </div>

      <AnimatePresence initial={false}>
        {showAlternatives && !accepted && (
          <motion.ul
            id={foldId}
            initial={{ height: 0, opacity: motionSafe ? 0 : 1 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(motionSafe ? durations.base : durations.fast),
            }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
            className="overflow-hidden"
          >
            {alternatives.map((alt, index) => (
              <motion.li
                key={alt.id}
                initial={{ opacity: motionSafe ? 0 : 1 }}
                animate={{ opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: index * cascade(alternatives.length),
                      }
                    : { duration: 0 }
                }
                className="mt-2 flex min-w-0 items-center justify-between gap-3 rounded-2 border border-hairline px-3 py-2 first:mt-3"
              >
                <span className="min-w-0 text-sm text-ink-2">{alt.text}</span>
                <span className="shrink-0">
                  <ConfidenceMeter confidence={alt.confidence} />
                </span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3.5">
        {accepted ? (
          <>
            <StatusSeal variant="success">accepted</StatusSeal>
            <span className="min-w-0 text-xs leading-relaxed text-ink-3">
              {acceptedLine}
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowAlternatives((v) => !v)}
              aria-expanded={showAlternatives}
              aria-controls={foldId}
              className="text-sm text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
            >
              {alternativesLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                setAccepted(true);
                onAccept?.();
              }}
              className="rounded-2 bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground"
            >
              {acceptLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
