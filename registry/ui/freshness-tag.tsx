"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FreshSource = {
  id: string;
  /** The document or page. */
  title: string;
  /** Where it lives, printed in mono. */
  site: string;
  /** When it was last fetched, as an ISO date or date-time. */
  fetchedAt: string;
};

export type FreshnessTagProps = {
  ref?: React.Ref<HTMLDivElement>;
  sources: FreshSource[];
  /**
   * The moment ages are measured from — an ISO date or epoch milliseconds.
   * Pass it from an effect or the server, never from render.
   */
  now: string | number;
  /** Age in days at which a source turns amber and offers a re-fetch. @default 30 */
  staleAfterDays?: number;
  /** Ids the host is re-fetching right now; their controls turn. */
  fetching?: string[];
  /** Fires from the press on a stale source's re-fetch control. */
  onRefetch?: (id: string) => void;
  /** Formats a fetched date for the row and descriptions. @default 9 Sep 2026 */
  formatDate?: (iso: string) => string;
  /** Names the list for assistive technology. */
  label: string;
  className?: string;
};

const NONE: string[] = [];
const DAY_MS = 86_400_000;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** One turn of the re-fetch arrows. */
const TURN_SECONDS = 0.9;

/**
 * A fixed month table rather than a locale formatter, so the server and
 * every browser print the same string and nothing mismatches on hydration.
 */
export function formatFreshDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

function ageOf(days: number): { short: string; long: string } {
  if (days <= 0) return { short: "today", long: "today" };
  if (days < 7)
    return {
      short: `${days}d`,
      long: `${days} ${days === 1 ? "day" : "days"} ago`,
    };
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return {
      short: `${weeks}w`,
      long: `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`,
    };
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return {
      short: `${months}mo`,
      long: `${months} ${months === 1 ? "month" : "months"} ago`,
    };
  }
  const years = Math.floor(days / 365);
  return {
    short: `${years}y`,
    long: `${years} ${years === 1 ? "year" : "years"} ago`,
  };
}

/**
 * How old each source is, worn as a tag. Ages are measured from `now`, which
 * the host passes, so the list never reads a clock. A source past
 * `staleAfterDays` turns amber — the tag's colour tweens to warn — and a
 * re-fetch control slides open beside it on `snap`. Pressing it fires
 * `onRefetch`; while the host lists the id in `fetching` the control's
 * arrows turn on a linear loop and the tag reads "fetching". When the host
 * stamps a new `fetchedAt`, the date lands from 1.3× on `recoil` — a stamp
 * landing — the tag cools back to neutral and the control folds away. When
 * `now` moves, every age rolls to its new reading on `snap`.
 *
 * Each row's state is words as well as colour: the tag carries a full
 * sentence for assistive technology, the control is a real button with
 * `aria-busy` while fetching, and the live region reads each stamp once.
 * Under reduced motion ages swap in place, the control fades in without
 * sliding, the arrows hold at half opacity, and the new date fades in.
 */
export function FreshnessTag({
  ref,
  sources,
  now,
  staleAfterDays = 30,
  fetching = NONE,
  onRefetch,
  formatDate = formatFreshDate,
  label,
  className,
}: FreshnessTagProps) {
  const motionSafe = useMotionSafe();

  const nowMs = typeof now === "number" ? now : Date.parse(now);
  const rows = sources.map((source) => {
    const fetchedMs = Date.parse(source.fetchedAt);
    const days =
      Number.isNaN(fetchedMs) || Number.isNaN(nowMs)
        ? 0
        : Math.max(0, Math.floor((nowMs - fetchedMs) / DAY_MS));
    return {
      source,
      days,
      age: ageOf(days),
      stale: days >= staleAfterDays,
      busy: fetching.includes(source.id),
    };
  });
  const staleCount = rows.filter((row) => row.stale).length;

  // Stamps and a moved clock are noticed by comparing against what was last
  // rendered, adjusted during render so the announcement lands with the
  // change rather than a frame after it.
  const [announcement, setAnnouncement] = React.useState("");
  const [seen, setSeen] = React.useState(() => ({
    dates: new Map(sources.map((s) => [s.id, s.fetchedAt])),
    now: nowMs,
  }));
  const stamped = sources.filter(
    (s) => seen.dates.has(s.id) && seen.dates.get(s.id) !== s.fetchedAt,
  );
  if (stamped.length > 0 || seen.now !== nowMs) {
    setSeen({
      dates: new Map(sources.map((s) => [s.id, s.fetchedAt])),
      now: nowMs,
    });
    if (stamped.length > 0) {
      setAnnouncement(
        stamped
          .map((s) => `${s.title} re-fetched, dated ${formatDate(s.fetchedAt)}`)
          .join(". "),
      );
    } else {
      setAnnouncement(`${staleCount} of ${sources.length} sources stale`);
    }
  }

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const rise = motionSafe
    ? { ...springs.snap, opacity: fade }
    : { duration: durations.fast, ease: easings.enter };

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <ul aria-label={label} className="flex flex-col">
        {rows.map(({ source, age, days, stale, busy }) => {
          const dateText = formatDate(source.fetchedAt);
          const state = busy
            ? "fetching"
            : stale
              ? `stale, fetched ${dateText}, ${age.long}`
              : `fresh, fetched ${dateText}, ${age.long}`;
          return (
            <li
              key={source.id}
              className="flex items-center gap-3 border-b border-hairline py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {source.title}
                </p>
                <p className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-ink-3">
                  <span className="min-w-0 truncate">{source.site}</span>
                  <span aria-hidden className="shrink-0">
                    ·
                  </span>
                  {/* Keyed by the date so a stamp lands a new element on
                    recoil; the first date mounts still, not landing. */}
                  <span className="relative inline-grid shrink-0">
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.span
                        key={source.fetchedAt}
                        className="col-start-1 row-start-1 whitespace-nowrap tabular-nums"
                        initial={
                          motionSafe
                            ? { scale: 1.3, opacity: 0 }
                            : { opacity: 0 }
                        }
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? {
                                ...springs.recoil,
                                opacity: { duration: durations.blink },
                              }
                            : fade
                        }
                      >
                        {dateText}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </p>
              </div>

              <span
                title={`Fetched ${dateText}`}
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 font-mono text-[10px] transition-colors duration-300",
                  busy
                    ? "border-hairline-strong bg-surface-2 text-ink-2"
                    : stale
                      ? "border-warn/40 bg-warn/10 text-warn"
                      : "border-hairline bg-surface-1 text-ink-2",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full transition-colors duration-300",
                    busy ? "bg-ink-3" : stale ? "bg-warn" : "bg-success",
                  )}
                />
                <span aria-hidden className="relative inline-grid">
                  {/* Keyed by the reading so a moved clock rolls in the next age. */}
                  <motion.span
                    key={busy ? "fetching" : age.short}
                    className="col-start-1 row-start-1 whitespace-nowrap tabular-nums"
                    initial={
                      motionSafe ? { y: -6, opacity: 0 } : { opacity: 0 }
                    }
                    animate={{ y: 0, opacity: 1 }}
                    transition={rise}
                  >
                    {busy ? "fetching" : age.short}
                  </motion.span>
                </span>
                <span className="sr-only">
                  {state}. {days} {days === 1 ? "day" : "days"} old.
                </span>
              </span>

              <AnimatePresence initial={false}>
                {stale ? (
                  <motion.button
                    key="refetch"
                    type="button"
                    aria-label={`Re-fetch ${source.title}`}
                    aria-busy={busy}
                    disabled={busy}
                    onClick={() => onRefetch?.(source.id)}
                    initial={
                      motionSafe ? { width: 0, opacity: 0 } : { opacity: 0 }
                    }
                    animate={{ width: 24, opacity: 1 }}
                    exit={{
                      width: motionSafe ? 0 : 24,
                      opacity: 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={rise}
                    className={cn(
                      "flex h-6 shrink-0 items-center justify-center overflow-hidden rounded-2 border border-hairline bg-surface-1 text-ink-2 transition-colors outline-none hover:border-hairline-strong hover:text-ink disabled:cursor-default",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    )}
                  >
                    <motion.svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5 shrink-0"
                      style={{ originX: 0.5, originY: 0.5 }}
                      animate={{
                        rotate: busy && motionSafe ? 360 : 0,
                        opacity: busy && !motionSafe ? 0.5 : 1,
                      }}
                      transition={{
                        rotate:
                          busy && motionSafe
                            ? {
                                duration: TURN_SECONDS,
                                ease: "linear",
                                repeat: Infinity,
                              }
                            : { duration: 0 },
                        opacity: fade,
                      }}
                    >
                      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
                      <path d="M13 3v2.4h-2.4" />
                    </motion.svg>
                  </motion.button>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
