"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Marks are drawn, never typed: a glyph font is not a design system. */
export type TallyMark = "check" | "star" | "lift" | "eye" | "hold";

export type TallyReaction = {
  id: string;
  /** The reaction's name — spoken by the chip and printed on it. */
  name: string;
  /** Votes from other people; your own vote rides in `value`. */
  count: number;
  /** @default "check" */
  mark?: TallyMark;
};

export type TallyRank = {
  /** Reaction ids, loudest first. */
  order: string[];
  leaderId: string | null;
  leaderTotal: number;
  /** How far first place is clear of second; zero when they are level. */
  margin: number;
};

export type ReactionTallyProps = {
  ref?: React.Ref<HTMLDivElement>;
  reactions: TallyReaction[];
  /** Controlled: the ids you have reacted to. */
  value?: string[];
  /** Initial reacted ids for uncontrolled usage. @default [] */
  defaultValue?: string[];
  onValueChange?: (ids: string[]) => void;
  /** Fires with the standing after every count or vote change. */
  onRankChange?: (rank: TallyRank) => void;
  /** The message body the tally hangs under. */
  text: string;
  author: string;
  /** Sent time, already formatted. */
  time?: string;
  /** Names the thread list. @default "Thread" */
  label?: string;
  className?: string;
};

const PULSE = { duration: durations.slow, ease: easings.enter } as const;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Every mark is drawn in one 16-unit box, so five chips share a metric and
 *  no chip depends on the reader's emoji font. */
const MARKS: Record<TallyMark, string[]> = {
  check: ["M3.2 8.6 6.6 12 12.8 4.4"],
  star: ["M8 1.8 9.6 6.4 14.2 8 9.6 9.6 8 14.2 6.4 9.6 1.8 8 6.4 6.4Z"],
  lift: ["M8 13.2V3.4", "M4.4 7 8 3.4 11.6 7"],
  eye: ["M1.8 8C4.2 4.8 11.8 4.8 14.2 8 11.8 11.2 4.2 11.2 1.8 8Z"],
  hold: ["M6.1 4V12", "M9.9 4V12"],
};

function Mark({ kind }: { kind: TallyMark }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0">
      {MARKS[kind].map((d) => (
        <path key={d} {...STROKE} d={d} />
      ))}
      {kind === "eye" ? <circle {...STROKE} cx="8" cy="8" r="1.8" /> : null}
    </svg>
  );
}

/** Digits roll to their face on snap; keyed from the units column so a
 *  nine-to-ten slides one wheel rather than reshuffling the number. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(value);
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        const key = text.length - index;
        if (digit < 0) return <span key={key}>{char}</span>;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
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

type Ranked = TallyReaction & { total: number; mine: boolean };

type Beat = {
  signature: string;
  /** Zero on the seed, so the leader does not pulse at nothing on mount. */
  seq: number;
  message: string;
  totals: Record<string, number>;
  mine: string[];
  leaderId: string | null;
  rank: TallyRank;
};

const describe = (previous: Beat, ranked: Ranked[], mine: string[]): string => {
  const gained = mine.find((id) => !previous.mine.includes(id));
  const dropped = previous.mine.find((id) => !mine.includes(id));
  const changed = gained ?? dropped;
  if (changed) {
    const item = ranked.find((entry) => entry.id === changed);
    if (item) {
      const verb = gained ? "You reacted with" : "You withdrew";
      return `${verb} ${item.name}, ${item.total} total`;
    }
  }
  const leader = ranked[0];
  if (!leader) return "No reactions yet";
  if (leader.id !== previous.leaderId) {
    return `${leader.name} now leads with ${leader.total}`;
  }
  const risen = ranked.find(
    (entry) => entry.total > (previous.totals[entry.id] ?? 0),
  );
  return risen
    ? `${risen.name}, ${risen.total} reactions`
    : `${leader.name} leads with ${leader.total}`;
};

/**
 * Every reaction, tallied. A tally row under a message keeps its chips in
 * standing order: a vote that overtakes reorders the row and every chip
 * travels to its new slot as a layout FLIP on `glide`, so the change reads as
 * one row rearranging rather than numbers blinking in place. The chip in
 * front pulses on each new vote — a cobalt ring growing out of it on a tween —
 * and counts roll to their new face on `snap`.
 *
 * The row is a real list of `aria-pressed` buttons on a roving tabindex: Left
 * and Right step without wrapping, Home and End jump to the loudest and the
 * quietest, Space and Enter toggle your vote. Focus rides the chip, not the
 * slot, so the chip you are on keeps focus while it moves. Under reduced
 * motion the row reorders instantly and the leader holds a steady ring — the
 * standing is information, the travel is not.
 */
export function ReactionTally({
  ref,
  reactions,
  value,
  defaultValue,
  onValueChange,
  onRankChange,
  text,
  author,
  time,
  label = "Thread",
  className,
}: ReactionTallyProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const chipId = (id: string) => `${baseId}-chip-${id}`;

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    () => defaultValue ?? [],
  );
  const mine = value ?? uncontrolled;

  const ranked: Ranked[] = React.useMemo(() => {
    const withTotals = reactions.map((reaction, index) => {
      const isMine = mine.includes(reaction.id);
      return {
        ...reaction,
        mine: isMine,
        total: Math.max(0, Math.trunc(reaction.count)) + (isMine ? 1 : 0),
        index,
      };
    });
    // Ties keep first-reacted order, so a level row never churns on its own.
    withTotals.sort((a, b) => b.total - a.total || a.index - b.index);
    return withTotals;
  }, [reactions, mine]);

  const leader = ranked[0];
  const runnerUp = ranked[1];
  const signature = `${ranked.map((entry) => `${entry.id}:${entry.total}`).join("|")}#${mine.join(",")}`;

  const rankOf = (): TallyRank => ({
    order: ranked.map((entry) => entry.id),
    leaderId: leader?.id ?? null,
    leaderTotal: leader?.total ?? 0,
    margin: leader ? leader.total - (runnerUp?.total ?? 0) : 0,
  });

  const totalsOf = () => {
    const totals: Record<string, number> = {};
    for (const entry of ranked) totals[entry.id] = entry.total;
    return totals;
  };

  // The sentence and the pulse are frozen at the moment the standing changes,
  // so a host that rewrites the list later cannot make the region repeat a
  // reading that has already been spoken.
  const [beat, setBeat] = React.useState<Beat>(() => ({
    signature,
    seq: 0,
    message: "",
    totals: totalsOf(),
    mine,
    leaderId: leader?.id ?? null,
    rank: rankOf(),
  }));

  if (beat.signature !== signature) {
    setBeat({
      signature,
      seq: beat.seq + 1,
      message: describe(beat, ranked, mine),
      totals: totalsOf(),
      mine,
      leaderId: leader?.id ?? null,
      rank: rankOf(),
    });
  }

  const rankListener = React.useRef(onRankChange);
  React.useEffect(() => {
    rankListener.current = onRankChange;
  });
  React.useEffect(() => {
    rankListener.current?.(beat.rank);
  }, [beat]);

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const activeId =
    focusId !== null && ranked.some((entry) => entry.id === focusId)
      ? focusId
      : (leader?.id ?? null);

  const toggle = (id: string) => {
    const next = mine.includes(id)
      ? mine.filter((entry) => entry !== id)
      : [...mine, id];
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const moveFocus = (index: number) => {
    const target = ranked[Math.min(ranked.length - 1, Math.max(0, index))];
    if (!target) return;
    setFocusId(target.id);
    document.getElementById(chipId(target.id))?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    // Enter and Space stay native, or the button would toggle twice.
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(ranked.length - 1);
    }
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-1", className)}>
      <ol role="list" aria-label={label} className="flex flex-col">
        <li className="flex flex-col items-start gap-1">
          <span className="px-1 text-[11px] font-medium text-ink-2">
            {author}
          </span>
          <div className="max-w-[92%] rounded-3 rounded-bl-1 bg-surface-2 px-3 py-2 text-sm leading-snug wrap-break-word text-foreground">
            {text}
          </div>
          {time ? (
            <span className="px-1 text-[11px] text-ink-3 tabular-nums">
              {time}
            </span>
          ) : null}

          {ranked.length > 0 ? (
            <ul
              role="list"
              className="flex flex-wrap items-center gap-1.5 pt-1"
            >
              {ranked.map((entry, index) => {
                const isLeader = entry.id === leader?.id;
                return (
                  <motion.li
                    key={entry.id}
                    layout={motionSafe}
                    transition={springs.glide}
                    className="flex"
                  >
                    <motion.button
                      type="button"
                      id={chipId(entry.id)}
                      aria-pressed={entry.mine}
                      aria-label={`${entry.name}, ${entry.total} ${entry.total === 1 ? "reaction" : "reactions"}, ${entry.mine ? "you reacted. Withdraw." : "Add yours."}`}
                      tabIndex={entry.id === activeId ? 0 : -1}
                      onFocus={() => setFocusId(entry.id)}
                      onClick={() => toggle(entry.id)}
                      onKeyDown={(event) => onKeyDown(event, index)}
                      whileTap={motionSafe ? { scale: 0.97 } : undefined}
                      transition={springs.flick}
                      className={cn(
                        "relative flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        entry.mine
                          ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                          : "border-hairline-strong text-ink-2 hover:bg-accent",
                        isLeader && !motionSafe && "ring-1 ring-cobalt-bright",
                      )}
                    >
                      {isLeader && motionSafe && beat.seq > 0 ? (
                        <motion.span
                          // Keyed by the vote counter: a new vote remounts the
                          // ring, so a burst of votes gives a burst of rings.
                          key={beat.seq}
                          aria-hidden
                          initial={{ opacity: 0.5, scale: 0.86 }}
                          animate={{ opacity: 0, scale: 1.24 }}
                          transition={PULSE}
                          className="pointer-events-none absolute inset-0 rounded-full border border-cobalt-bright"
                        />
                      ) : null}
                      <Mark kind={entry.mark ?? "check"} />
                      <span aria-hidden>{entry.name}</span>
                      <span aria-hidden className="font-mono text-ink-3">
                        <Rolling value={entry.total} motionSafe={motionSafe} />
                      </span>
                    </motion.button>
                  </motion.li>
                );
              })}
            </ul>
          ) : (
            <span className="px-1 pt-1 text-[11px] text-ink-3">
              No reactions yet
            </span>
          )}
        </li>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.message}
      </span>
    </div>
  );
}
