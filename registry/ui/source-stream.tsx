"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StreamSource = {
  id: string;
  /** The publication or system the claim leans on. */
  label: string;
  /** Shown small on the chip and in the tray. */
  domain: string;
};

export type StreamSegment = {
  id: string;
  text: string;
  /** A citation chip that lands inline right after this segment. */
  source?: StreamSource;
};

export type SourceStreamProps = {
  /** The answer, in segments; a segment's source lands when it finishes. */
  segments?: StreamSegment[];
  /** Suggested next asks, offered once the stream completes. */
  followUps?: string[];
  onFollowUp?: (text: string) => void;
  /** Words per second while streaming. @default 14 */
  rate?: number;
  /** Skip the stream and print whole (also forced by reduced motion). */
  immediate?: boolean;
  className?: string;
};

const DEFAULT_SEGMENTS: StreamSegment[] = [
  {
    id: "s1",
    text: "North basin is your steadiest yard this month — boards cut before the gate 26 mornings out of 28, and reshuffles are down a third.",
    source: { id: "src1", label: "Morning ledger", domain: "ledger.waylight" },
  },
  {
    id: "s2",
    text: "The two late mornings trace to the same cause: crane 2 holds entered after 05:30, which the cut cannot fold in.",
    source: { id: "src2", label: "Crane log", domain: "cranes.waylight" },
  },
  {
    id: "s3",
    text: "Moving the hold deadline to 05:15 would have saved both.",
  },
];

const DEFAULT_FOLLOW_UPS = [
  "Which yards miss the gate most often",
  "Show the two late mornings in full",
];

/**
 * An answer that streams in with its sources landing inline: prose arrives
 * word by word, and when a claim finishes, its citation chip drops into the
 * sentence right where the claim was made — provenance at the point of
 * assertion, not footnoted at the end. A sources tray sums the run, and
 * follow-up asks are offered only once the stream is done, because
 * suggestions under a moving answer are suggestions nobody reads.
 *
 * The stream is a mount-driven tick, never the wall clock, so server and
 * client agree and a re-render never re-streams. The live region announces
 * once, at completion — a per-word live region would read the answer out
 * dozens of times.
 *
 * Reduced motion (or `immediate`): the whole answer prints at once, chips
 * and all, and follow-ups appear without travel.
 */
export function SourceStream({
  segments = DEFAULT_SEGMENTS,
  followUps = DEFAULT_FOLLOW_UPS,
  onFollowUp,
  rate = 14,
  immediate = false,
  className,
}: SourceStreamProps) {
  const motionSafe = useMotionSafe();
  const instant = immediate || !motionSafe;

  const words = React.useMemo(
    () =>
      segments.map((segment) => ({
        ...segment,
        words: segment.text.split(/\s+/),
      })),
    [segments],
  );
  const total = React.useMemo(
    () => words.reduce((sum, s) => sum + s.words.length, 0),
    [words],
  );

  const [shown, setShown] = React.useState(instant ? total : 0);

  // Content or mode changed: restart from the honest edge. Adjusted during
  // render rather than in an effect, so the reset cannot cascade a frame.
  const [streamKey, setStreamKey] = React.useState(`${instant}:${total}`);
  if (streamKey !== `${instant}:${total}`) {
    setStreamKey(`${instant}:${total}`);
    setShown(instant ? total : 0);
  }

  React.useEffect(() => {
    if (instant) return;
    const ms = Math.max(20, 1000 / rate);
    const id = window.setInterval(() => {
      setShown((n) => {
        if (n >= total) {
          window.clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [instant, total, rate]);

  // Each segment's starting word index, derived — render never accumulates.
  const offsets = React.useMemo(
    () =>
      words.reduce<number[]>((acc, segment, i) => {
        acc.push(
          i === 0 ? 0 : (acc[i - 1] ?? 0) + (words[i - 1]?.words.length ?? 0),
        );
        return acc;
      }, []),
    [words],
  );

  const done = shown >= total;

  return (
    <div className={cn("w-full max-w-md", className)}>
      <p className="text-sm leading-relaxed text-ink" aria-hidden>
        {words.map((segment, index) => {
          const before = offsets[index] ?? 0;
          const visible = Math.max(
            0,
            Math.min(segment.words.length, shown - before),
          );
          const segmentDone = shown >= before + segment.words.length;
          return (
            <React.Fragment key={segment.id}>
              {segment.words.slice(0, visible).join(" ")}
              {visible > 0 && !segmentDone && (
                <span className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse rounded-full bg-primary" />
              )}
              {segmentDone && segment.source && (
                <motion.span
                  initial={{
                    opacity: instant ? 1 : 0,
                    y: instant ? 0 : distances.nudge / 2,
                  }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    instant
                      ? { duration: 0 }
                      : { duration: durations.base, ease: easings.enter }
                  }
                  className="mx-1 inline-flex translate-y-[-1px] items-center rounded-full border border-hairline bg-surface-1 px-1.5 py-px align-middle font-mono text-[10px] tracking-[0.04em] text-ink-3"
                >
                  {segment.source.domain}
                </motion.span>
              )}
              {segmentDone && " "}
            </React.Fragment>
          );
        })}
      </p>
      {/* Announced once, whole, when the answer is finished. */}
      <p role="status" className="sr-only">
        {done ? segments.map((s) => s.text).join(" ") : ""}
      </p>

      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: instant ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitConfig(instant) }}
            transition={
              instant
                ? { duration: 0 }
                : { duration: durations.base, ease: easings.enter }
            }
          >
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-3">
              <span className="text-label text-ink-3">
                {segments.filter((s) => s.source).length} sources
              </span>
              {segments
                .filter((s) => s.source)
                .map((s) => (
                  <span
                    key={s.source!.id}
                    className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-2"
                  >
                    <span className="truncate font-medium">
                      {s.source!.label}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-3">
                      {s.source!.domain}
                    </span>
                  </span>
                ))}
            </div>

            {followUps.length > 0 && (
              <div className="mt-3">
                <p className="text-label text-ink-3">Follow-ups</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {followUps.map((text, index) => (
                    <motion.button
                      key={text}
                      type="button"
                      onClick={() => onFollowUp?.(text)}
                      initial={{ opacity: instant ? 1 : 0 }}
                      animate={{ opacity: 1 }}
                      transition={
                        instant
                          ? { duration: 0 }
                          : {
                              duration: durations.base,
                              ease: easings.enter,
                              delay: index * cascade(followUps.length),
                            }
                      }
                      className="rounded-full border border-hairline px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
                    >
                      {text}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function exitConfig(instant: boolean) {
  return { duration: instant ? 0 : durations.fast };
}
