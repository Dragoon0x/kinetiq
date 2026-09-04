"use client";

import * as React from "react";

import { motion } from "motion/react";

import { StepformOneQuestion } from "@/registry/blocks/stepform-one-question/stepform-one-question";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OnboardingFirstRunProps = {
  wordmark?: string;
  /** Where a returning user escapes to; onboarding must never be a trap. */
  skipLabel?: string;
  skipHref?: string;
  /**
   * Shows a live-bound preview card beside the question flow (stacked below
   * it under `lg`) so the person filling the form watches their own answers
   * land in something real instead of typing into a void.
   */
  showPreview?: boolean;
  onDone?: (answers: Record<string, string>) => void;
  className?: string;
};

/**
 * The first session, asked one question at a time, with a way out at the top.
 * The escape hatch is the part that matters: onboarding that cannot be
 * skipped is a wall, and the people most likely to hit it are the ones
 * setting up their second yard who already know all the answers. With
 * `showPreview`, a live preview card mirrors each answer as it is typed;
 * reduced motion updates that card's text in place, skipping the settle
 * entrance.
 */
export function OnboardingFirstRun({
  wordmark = "WAYLIGHT",
  skipLabel = "Skip — I have done this before",
  skipHref = "/",
  showPreview = false,
  onDone,
  className,
}: OnboardingFirstRunProps) {
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState(false);

  const handleAnswerChange = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleDone = (allAnswers: Record<string, string>) => {
    setDone(true);
    onDone?.(allAnswers);
  };

  return (
    <main className={cn("min-h-screen bg-surface-0", className)}>
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-6 pt-8">
        <p className="font-mono text-[11px] tracking-[0.18em] text-ink-3">
          {wordmark}
        </p>
        <a
          href={skipHref}
          className="text-xs text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
        >
          {skipLabel}
        </a>
      </header>

      {showPreview ? (
        // With a preview standing beside it, the header comes out of the
        // block and sits above both columns. Left inside, it would push the
        // card down by its own height and leave the two boxes on different
        // lines — by 108px here, and by 148px once the headline wraps, so no
        // fixed offset on the preview could have squared them.
        <>
          <div className="mx-auto w-full max-w-6xl px-6 pt-20 sm:pt-24">
            <p className="text-label text-ink-3">{SETUP_EYEBROW}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {SETUP_HEADLINE}
            </h2>
          </div>
          <div className="mx-auto mt-10 grid w-full max-w-6xl grid-cols-1 items-start gap-2 lg:grid-cols-2 lg:gap-6">
            <StepformOneQuestion
              showHeader={false}
              eyebrow={SETUP_EYEBROW}
              headline={SETUP_HEADLINE}
              onSubmit={handleDone}
              onAnswerChange={handleAnswerChange}
            />
            <div className="px-6 pb-16 lg:sticky lg:top-16">
              <LivePreview wordmark={wordmark} answers={answers} done={done} />
            </div>
          </div>
        </>
      ) : (
        <StepformOneQuestion
          onSubmit={handleDone}
          onAnswerChange={handleAnswerChange}
        />
      )}
    </main>
  );
}

/**
 * Crew-size choices, mirrored from stepform-one-question's default `crews`
 * question: this preview does not receive the block's `questions` prop, so
 * the page always composes the defaults and these ids/labels can be
 * hardcoded rather than threaded through.
 */
/** The setup header's copy, mirrored from stepform-one-question's defaults:
 * the page draws it so the card and the preview can share a top edge, and
 * hands it back to the block as the section's accessible name. */
const SETUP_EYEBROW = "Waylight · getting set up";
const SETUP_HEADLINE = "Three questions, one at a time.";

const CREW_OPTIONS = [
  { value: "one", label: "one crew" },
  { value: "two", label: "two or three crews" },
  { value: "many", label: "more than three crews" },
] as const;

/**
 * Deterministic accent per crew-size index, off `var(--primary)`. Motion
 * cannot interpolate `color-mix()`/`var()`, so this only ever moves through
 * the plain CSS `transition-colors` on the element that consumes it.
 */
function accentTint(index: number): string {
  if (index < 0) return "var(--color-surface-2)";
  const pct = 20 + index * 16;
  return `color-mix(in oklab, var(--primary) ${pct}%, var(--color-surface-2))`;
}

/** First two words' initials, uppercased — the same shape as a name's, so a
 * short phrase still reads as a plate rather than a wall of letters. */
function initialsOf(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * One bound field: keyed by its own current value, so a change remounts the
 * span and its `initial` plays a 1-keyframe opacity/y settle on `snap` —
 * no exit, no AnimatePresence, just a fresh arrival. Reduced motion skips
 * the entrance and the text simply updates.
 */
function SettleText({
  value,
  motionSafe,
  className,
}: {
  value: string;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <motion.span
      key={value}
      initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.snap}
      className={cn("inline-block", className)}
    >
      {value}
    </motion.span>
  );
}

type LivePreviewProps = {
  wordmark: string;
  answers: Record<string, string>;
  done: boolean;
};

/**
 * An app-window mock that mirrors the question flow live: the yard name
 * becomes the chrome bar's title, the sidebar's first row, the avatar plate's
 * initials, and the greeting; the crew-size choice re-tints the sidebar
 * accent and swaps the mono status line; and the morning's-argument answer
 * becomes the board's first item — "the first thing to settle" — because that
 * is what the reader just told us it is. Every empty field reads a quiet
 * placeholder instead of going blank. On completion the chrome bar stamps a
 * "ready" seal.
 */
function LivePreview({ wordmark, answers, done }: LivePreviewProps) {
  const motionSafe = useMotionSafe();

  const yardRaw = answers["yard"]?.trim() ?? "";
  const yardHas = yardRaw.length > 0;
  const yardText = yardHas ? yardRaw : "your yard";

  const initials = yardHas ? initialsOf(yardRaw) : "–";

  const painRaw = answers["pain"]?.trim() ?? "";
  const painHas = painRaw.length > 0;
  const painText = painHas ? painRaw : "the morning's usual argument";

  const crewValue = answers["crews"] ?? "";
  const crewOption = CREW_OPTIONS.find((option) => option.value === crewValue);
  const crewIndex = crewOption ? CREW_OPTIONS.indexOf(crewOption) : -1;
  const statusText = crewOption ? crewOption.label : "crew size not set";
  const tint = accentTint(crewIndex);

  return (
    <div
      role="img"
      aria-label={`Live preview: ${yardText}${done ? ", ready" : ""}`}
      className="w-full max-w-md"
    >
      <div
        aria-hidden
        className="overflow-hidden rounded-4 border border-hairline bg-surface-1 shadow-raised"
      >
        {/* Chrome bar: three dots, the invented product name, and a "ready"
            seal once the flow behind it is done. */}
        <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
          <span className="flex shrink-0 gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-2 rounded-full border border-hairline-strong"
              />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.06em] text-ink-3">
            {wordmark.toLowerCase()} —{" "}
            <SettleText
              value={yardText}
              motionSafe={motionSafe}
              className={yardHas ? "text-ink-2" : undefined}
            />
          </span>
          {done && (
            <StatusSeal variant="success" className="shrink-0">
              ready
            </StatusSeal>
          )}
        </div>

        <div className="grid grid-cols-[7rem_minmax(0,1fr)]">
          {/* Sidebar strip: the yard name as the first row, accented by the
              chosen crew size. */}
          <div className="border-r border-hairline p-2">
            <div
              className="flex items-center rounded-1 px-1.5 py-1 transition-colors duration-300"
              style={{ backgroundColor: tint }}
            >
              <span
                className={cn(
                  "truncate text-[11px] font-medium",
                  yardHas ? "text-ink" : "text-ink-3",
                )}
              >
                <SettleText value={yardText} motionSafe={motionSafe} />
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-1">
              <span className="truncate px-1.5 py-1 text-[11px] text-ink-2">
                Crews
              </span>
              <span className="truncate px-1.5 py-1 text-[11px] text-ink-2">
                Holds
              </span>
            </div>
          </div>

          {/* Content pane: the yard's plate and greeting, the first board
              item the argument answer becomes, then the status line the
              crew-size choice swaps. */}
          <div className="p-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline bg-surface-2 font-mono text-[11px]",
                  yardHas ? "text-ink" : "text-ink-3",
                )}
              >
                <SettleText value={initials} motionSafe={motionSafe} />
              </span>
              <p className="min-w-0 truncate text-xs">
                <span className="text-ink-3">Good morning, </span>
                <SettleText
                  value={yardText}
                  motionSafe={motionSafe}
                  className={yardHas ? "text-ink" : "text-ink-3"}
                />
              </p>
            </div>

            <div className="mt-3 rounded-2 border border-hairline bg-surface-0 px-2.5 py-2">
              <p className="text-label text-ink-3">first thing to settle</p>
              <p
                className={cn(
                  "mt-1 line-clamp-2 text-xs leading-snug",
                  painHas ? "text-ink" : "text-ink-3",
                )}
              >
                <SettleText value={painText} motionSafe={motionSafe} />
              </p>
            </div>

            <p
              className={cn(
                "mt-3 font-mono text-[10px] tracking-[0.06em] uppercase",
                crewOption ? "text-ink-2" : "text-ink-3",
              )}
            >
              <SettleText value={statusText} motionSafe={motionSafe} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
