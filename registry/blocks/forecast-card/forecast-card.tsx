"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

export type ForecastOption = {
  id: string;
  label: string;
  /** Raw vote count — every percentage is derived from these. */
  votes: number;
};

export type ForecastCardProps = {
  /** The market question, e.g. "Ships before the offsite?" */
  question: string;
  /** 2–4 outcomes. The `options` prop is always the source of the counts. */
  options: ForecastOption[];
  /**
   * Controlled vote: the option id the viewer has voted for (null = none).
   * Providing this also hands the counts back to you — the component renders
   * `options.votes` verbatim and adds no internal +1.
   */
  votedId?: string | null;
  /**
   * Uncontrolled starting vote. Treated as already included in `votes`
   * (a restored session), so it adds no extra count.
   */
  defaultVotedId?: string;
  onVote?: (id: string) => void;
  /** Let the viewer move their vote after it lands. */
  allowRevote?: boolean;
  /** Shown in the footer as a compact mono "CLOSES <date>" line. */
  closesAt?: string | Date;
  className?: string;
};

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/** Read once at module scope — render stays pure, SSR and client agree. */
const CURRENT_YEAR = new Date().getFullYear();

/** "JUL 15", with the year appended only when it isn't this year. */
function formatCloses(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  const label = `${MONTHS[date.getMonth()] ?? ""} ${date.getDate()}`;
  return date.getFullYear() === CURRENT_YEAR
    ? label
    : `${label} ${date.getFullYear()}`;
}

const formatPercent = (value: number): string => `${value}%`;

/**
 * A pocket prediction market: every vote moves every bar. Casting a vote
 * renormalizes the whole field in one commit — each fill springs to its new
 * width on `glide`, each percentage `Readout` carry-rolls, the mono ▲ leader
 * tick migrates to the new front-runner on `snap` (shared layoutId), your row
 * draws its check on `flick`, and the vote total rolls +1. Percentages are
 * plain `Math.round`, so they can sum to 99 or 101 — the numbers stay honest.
 *
 * Two data patterns; pick one:
 * - Uncontrolled: pass `options` once. The component records the viewer's
 *   single vote and layers it (+1, moved on revote) over your counts.
 *   Re-pass fresh `options` any time (live tallies) — the layer survives.
 *   Remount with a new `key` to reset. `defaultVotedId` marks a vote your
 *   counts already include.
 * - Controlled: pass `votedId` and fold `onVote` into `options` yourself;
 *   the component renders your numbers verbatim.
 *
 * Reduced motion: widths jump, Readouts pulse instead of rolling, the leader
 * tick teleports, and the check simply appears.
 */
export function ForecastCard({
  question,
  options,
  votedId: controlledVotedId,
  defaultVotedId,
  onVote,
  allowRevote = false,
  closesAt,
  className,
}: ForecastCardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const [internalVotedId, setInternalVotedId] = React.useState<string | null>(
    defaultVotedId ?? null,
  );
  // The starting vote is assumed to be baked into `votes` already.
  const [seededVotedId] = React.useState<string | null>(defaultVotedId ?? null);
  const [announcement, setAnnouncement] = React.useState("");

  const isControlled = controlledVotedId !== undefined;
  const votedFor = isControlled ? controlledVotedId : internalVotedId;

  // Uncontrolled: layer the viewer's one movable vote over the prop counts.
  const counts = options.map((option) => {
    if (isControlled) return Math.max(0, option.votes);
    let count = option.votes;
    if (votedFor === option.id && seededVotedId !== option.id) count += 1;
    if (
      seededVotedId === option.id &&
      votedFor !== null &&
      votedFor !== option.id
    ) {
      count -= 1;
    }
    return Math.max(0, count);
  });
  const totalVotes = counts.reduce((sum, count) => sum + count, 0);
  const percents = counts.map((count) =>
    totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100),
  );
  const maxCount = counts.reduce((max, count) => Math.max(max, count), 0);
  // First of any tied leaders carries the tick; no tick on an empty market.
  const leaderIndex = maxCount > 0 ? counts.indexOf(maxCount) : -1;

  const hasVoted = votedFor !== null && votedFor !== undefined;
  const locked = hasVoted && !allowRevote;

  const castVote = (option: ForecastOption, index: number) => {
    if (option.id === votedFor) return;
    // Simulate the field after this vote to compose the announcement.
    const nextCounts = options.map((candidate, i) => {
      let count = counts[i] ?? 0;
      if (candidate.id === option.id) count += 1;
      if (votedFor != null && candidate.id === votedFor) count -= 1;
      return Math.max(0, count);
    });
    const nextTotal = nextCounts.reduce((sum, count) => sum + count, 0);
    const mine = nextCounts[index] ?? 0;
    const pct = nextTotal === 0 ? 0 : Math.round((mine / nextTotal) * 100);
    const leading = nextCounts.every(
      (count, i) => i === index || count < mine,
    );
    if (!isControlled) setInternalVotedId(option.id);
    setAnnouncement(
      `Voted ${option.label} — now ${pct}%${leading ? ", leading" : ""}`,
    );
    onVote?.(option.id);
  };

  const closesLabel = closesAt === undefined ? null : formatCloses(closesAt);
  const questionId = `${uid}-question`;

  return (
    <div
      className={cn(
        "border-border bg-card w-full max-w-sm rounded-3 border p-5",
        className,
      )}
    >
      <h3 id={questionId} className="text-sm font-semibold">
        {question}
      </h3>

      <div
        role="group"
        aria-labelledby={questionId}
        className="-mx-2 mt-3 flex flex-col"
      >
        {options.map((option, index) => {
          const isVoted = option.id === votedFor;
          const isLeader = index === leaderIndex;
          const pct = percents[index] ?? 0;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isVoted}
              disabled={locked}
              onClick={() => castVote(option, index)}
              className={cn(
                "w-full rounded-2 px-2 py-2 text-left transition-colors",
                !locked && "hover:bg-accent",
                isVoted && "bg-accent",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{option.label}</span>
                  {isVoted && (
                    <svg
                      viewBox="0 0 12 12"
                      aria-hidden
                      className="text-primary size-3 shrink-0"
                    >
                      <motion.path
                        d="M2.5 6.5 L5 9 L9.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={motionSafe ? { pathLength: 0 } : false}
                        animate={{ pathLength: 1 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {isLeader && (
                    <motion.span
                      aria-hidden
                      layoutId={motionSafe ? `${uid}-leader` : undefined}
                      transition={springs.snap}
                      className="inline-block font-mono text-[10px] leading-none"
                      style={{ color: "var(--signal, var(--primary))" }}
                    >
                      ▲
                    </motion.span>
                  )}
                  <Readout
                    size="sm"
                    value={pct}
                    format={formatPercent}
                    className={cn(
                      "font-medium",
                      isVoted ? "text-foreground" : "text-muted-foreground",
                    )}
                  />
                </span>
              </span>
              {/* Every fill springs to its new share in the same commit. */}
              <span
                aria-hidden
                className="bg-muted mt-1.5 block h-1.5 overflow-hidden rounded-full"
              >
                <motion.span
                  className="block h-full rounded-full transition-colors"
                  style={{
                    backgroundColor: isLeader
                      ? "var(--signal, var(--primary))"
                      : "var(--primary)",
                  }}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-border mt-4 flex items-center justify-between gap-3 border-t pt-3">
        <span className="flex items-baseline gap-1.5">
          <Readout size="sm" value={totalVotes} className="font-medium" />
          <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.08em] uppercase">
            votes
          </span>
        </span>
        {closesLabel !== null && (
          <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.08em] uppercase">
            Closes {closesLabel}
          </span>
        )}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
