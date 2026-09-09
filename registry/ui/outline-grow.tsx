"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OutlineSection = {
  id: string;
  heading: string;
  /** The section's paragraph, one sentence per entry. */
  sentences: string[];
};

export type OutlineGrowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The document's sections in order, each with its heading and sentences. */
  sections: OutlineSection[];
  /** Sentences that have arrived across the document, in reading order. */
  arrived?: number;
  /** Generation is open: the outline shows and `aria-busy` is set. */
  generating?: boolean;
  /** The document's title; printed in the header and naming the article. */
  title: string;
  /** An invented model name for the header chip. */
  model?: string;
  /** Fires once when the last sentence has landed. */
  onComplete?: () => void;
  className?: string;
};

const round = (value: number) => Number(value.toFixed(3));

/**
 * A document that shows its outline before its prose. When generation opens
 * every heading lands at once — a fade with a `distances.nudge` rise on
 * `glide`, staggered by `cascade()` — in the article and in a rail beside it
 * that stays for the life of the document. Prose then fills under each
 * heading sentence by sentence: each sentence is an inline span that fades
 * in and settles down four pixels of relative offset on `glide`, so a
 * paragraph grows in place while its words still wrap as prose. The rail is
 * the document's progress: a marker pill slides to the section being written
 * on `snap` (a shared `layoutId` prefixed by `useId`), each dot fills when
 * its section completes, and the track fills top to bottom on `glide`.
 *
 * The rail is a `<nav>` with a roving tabindex — Up and Down step, Home and
 * End jump, Enter or Space moves focus to that heading in the article — and
 * the section being written carries `aria-current`. One polite live region
 * speaks the outline, each section's completion and the document's, never a
 * sentence. Under reduced motion headings and sentences fade with no rise,
 * the marker swaps to its item and the track fill tweens.
 */
export function OutlineGrow({
  ref,
  sections,
  arrived = 0,
  generating = false,
  title,
  model,
  onComplete,
  className,
}: OutlineGrowProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const markerId = `${baseId}-marker`;

  // Each section owns a run of the sentence stream; everything below is read
  // off `arrived` against those offsets.
  const layout = React.useMemo(() => {
    const runs: { start: number; end: number }[] = [];
    let offset = 0;
    for (const section of sections) {
      runs.push({ start: offset, end: offset + section.sentences.length });
      offset += section.sentences.length;
    }
    return { runs, total: offset };
  }, [sections]);

  const got = Math.max(0, Math.min(layout.total, Math.floor(arrived)));
  const complete = layout.total > 0 && got >= layout.total;
  const open = generating || got > 0;
  const doneCount = layout.runs.filter((run) => run.end <= got).length;
  const writingIndex = complete
    ? -1
    : layout.runs.findIndex((run) => run.end > got);

  const [railIndex, setRailIndex] = React.useState(0);
  const railRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const focusRail = (index: number) => {
    const clamped = Math.min(sections.length - 1, Math.max(0, index));
    const section = sections[clamped];
    if (!section) return;
    setRailIndex(clamped);
    railRefs.current.get(section.id)?.focus();
  };

  const jumpTo = (section: OutlineSection) => {
    document.getElementById(`${baseId}-h-${section.id}`)?.focus();
  };

  const onRailKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRail(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRail(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRail(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRail(sections.length - 1);
    }
  };

  const gap = cascade(Math.max(sections.length, 2));
  const fade = { duration: durations.base, ease: easings.enter } as const;
  const rise = (delay = 0) =>
    motionSafe
      ? { ...springs.glide, delay, opacity: { ...fade, delay } }
      : { duration: durations.fast, delay: 0 };
  const fromBelow = motionSafe
    ? { opacity: 0, y: distances.nudge }
    : { opacity: 0, y: 0 };

  const lastSection = sections[sections.length - 1];
  const announcement = complete
    ? "Document complete"
    : doneCount > 0
      ? `Section ${sections[doneCount - 1]?.heading ?? ""} complete`
      : open
        ? `Outline ready, ${sections.length} sections`
        : "";

  return (
    <div
      ref={ref}
      className={cn(
        "w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-9 items-center justify-between gap-3 border-b border-hairline px-3">
        <span
          id={titleId}
          className="min-w-0 truncate text-sm font-medium text-foreground"
          title={title}
        >
          {title}
        </span>
        {model ? (
          <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            {model}
          </span>
        ) : null}
      </div>

      {!open ? (
        <p className="px-3 py-2.5 text-xs text-ink-3">Nothing drafted yet</p>
      ) : (
        <div className="flex gap-3 p-3">
          <nav aria-label="Outline" className="w-20 shrink-0">
            <ol role="list" className="relative flex flex-col gap-0.5">
              <span
                aria-hidden
                className="absolute top-3 bottom-3 left-[4.5px] w-px bg-hairline-strong"
              >
                <motion.span
                  className="absolute inset-0 origin-top bg-cobalt-bright"
                  initial={false}
                  animate={{
                    scaleY: round(
                      sections.length > 0 ? doneCount / sections.length : 0,
                    ),
                  }}
                  transition={
                    motionSafe ? springs.glide : { duration: durations.fast }
                  }
                />
              </span>
              {sections.map((section, index) => {
                const done = index < doneCount;
                const writing = index === writingIndex;
                return (
                  <motion.li
                    key={section.id}
                    initial={fromBelow}
                    animate={{ opacity: 1, y: 0 }}
                    transition={rise(index * gap)}
                  >
                    <button
                      type="button"
                      ref={(node) => {
                        if (node) railRefs.current.set(section.id, node);
                        else railRefs.current.delete(section.id);
                      }}
                      tabIndex={index === railIndex ? 0 : -1}
                      aria-current={writing ? "true" : undefined}
                      onFocus={() => setRailIndex(index)}
                      onClick={() => jumpTo(section)}
                      onKeyDown={(event) => onRailKeyDown(event, index)}
                      className={cn(
                        "relative flex h-6 w-full items-center gap-2 rounded-2 pr-1 text-left text-[11px] transition-colors outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        writing || done
                          ? "text-foreground"
                          : "text-ink-3 hover:text-foreground",
                      )}
                    >
                      {writing &&
                        (motionSafe ? (
                          <motion.span
                            aria-hidden
                            layoutId={markerId}
                            transition={springs.snap}
                            className="absolute inset-y-0 -right-1 left-3 rounded-2 bg-surface-2"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="absolute inset-y-0 -right-1 left-3 rounded-2 bg-surface-2"
                          />
                        ))}
                      <span
                        aria-hidden
                        className={cn(
                          "relative size-2.5 shrink-0 rounded-full border transition-colors",
                          done
                            ? "border-cobalt-bright bg-cobalt-bright"
                            : writing
                              ? "border-cobalt-bright bg-surface-1"
                              : "border-hairline-strong bg-surface-1",
                        )}
                      />
                      <span
                        className="relative min-w-0 truncate"
                        title={section.heading}
                      >
                        {section.heading}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ol>
          </nav>

          <div
            role="article"
            aria-labelledby={titleId}
            aria-busy={generating || undefined}
            className="flex min-w-0 flex-1 flex-col gap-3"
          >
            {sections.map((section, index) => {
              const run = layout.runs[index];
              const have = run
                ? Math.max(
                    0,
                    Math.min(section.sentences.length, got - run.start),
                  )
                : 0;
              const headingId = `${baseId}-h-${section.id}`;
              return (
                <section key={section.id} aria-labelledby={headingId}>
                  <motion.h3
                    id={headingId}
                    tabIndex={-1}
                    className="rounded-1 text-sm font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    initial={fromBelow}
                    animate={{ opacity: 1, y: 0 }}
                    transition={rise(index * gap)}
                  >
                    {section.heading}
                  </motion.h3>
                  {have > 0 ? (
                    <p className="mt-1 text-[13px] leading-5 text-ink-2">
                      {section.sentences.slice(0, have).map((sentence, at) => {
                        const last =
                          complete &&
                          section === lastSection &&
                          at === section.sentences.length - 1;
                        return (
                          <React.Fragment key={at}>
                            {/* An inline box cannot be transformed, so the
                                settle rides `top` on a relative span and the
                                words keep wrapping as prose. */}
                            <motion.span
                              className="relative"
                              initial={
                                motionSafe
                                  ? { opacity: 0, top: distances.nudge }
                                  : { opacity: 0, top: 0 }
                              }
                              animate={{ opacity: 1, top: 0 }}
                              transition={rise()}
                              onAnimationComplete={
                                last ? () => onComplete?.() : undefined
                              }
                            >
                              {sentence}
                            </motion.span>{" "}
                          </React.Fragment>
                        );
                      })}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      )}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
