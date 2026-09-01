"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Crown } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Brief x-jiggle thrown at a row the moment your climb passes it — a tween,
 * never a spring, since it carries more than two keyframes. */
const NUDGE_DURATION_S = 0.32;
const NUDGE_DURATION_MS = Math.round(NUDGE_DURATION_S * 1000);
const NUDGE_KEYFRAMES = [0, -4, 3, -2, 0] as const;
const NUDGE_TIMES = [0, 0.22, 0.5, 0.75, 1] as const;

/** How long the rank-delta chip holds beside the rank number before it clears. */
const RANK_CHIP_MS = 900;
/** How long the "first place" caption flashes. */
const CAPTION_MS = 1300;
/** Light-sweep duration across the row on reaching the top. */
const SWEEP_S = 0.7;
const SWEEP_MS = Math.round(SWEEP_S * 1000);

const DEFAULT_GAINS: number[] = [180, 240, 95, 310, 140];

export type Player = {
  id: string;
  name: string;
  score: number;
  you?: boolean;
};

const DEFAULT_PLAYERS: Player[] = [
  { id: "marguerite", name: "Marguerite Voss", score: 2450 },
  { id: "otto", name: "Otto Kessler", score: 2180 },
  { id: "junie", name: "Junie Vantroy", score: 1960 },
  { id: "you", name: "You", score: 1820, you: true },
  { id: "silas", name: "Silas Brack", score: 1690 },
  { id: "nadia", name: "Nadia Holt", score: 1540 },
  { id: "bram", name: "Bram Wexler", score: 1310 },
  { id: "percy", name: "Percy Dunmore", score: 1120 },
];

const FALLBACK_PLAYER: Player = { id: "you", name: "You", score: 0, you: true };

/** Re-ranks by score, substituting the live score onto the "you" row. Pure —
 * safe to call from a click handler as well as render. */
function rankPlayers(players: Player[], yourScore: number): Player[] {
  return players
    .map((p) => (p.you ? { ...p, score: yourScore } : p))
    .sort((a, b) => b.score - a.score);
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const initials = `${first}${last}`.toUpperCase();
  return initials || "?";
}

type LeaderboardRowProps = {
  player: Player;
  rank: number;
  isYou: boolean;
  isRivalAbove: boolean;
  isTop: boolean;
  motionSafe: boolean;
  nudgeActive: boolean;
  rankChip: { token: number; delta: number } | null;
  sweepToken: number | null;
};

/** One standing — rank, avatar, name, score. Pure props, no hooks, so it is
 * safe to call from inside the panel's `.map`. */
function LeaderboardRow({
  player,
  rank,
  isYou,
  isRivalAbove,
  isTop,
  motionSafe,
  nudgeActive,
  rankChip,
  sweepToken,
}: LeaderboardRowProps): React.JSX.Element {
  const ariaLabel = `Rank ${rank + 1}, ${player.name}, ${player.score.toLocaleString()} points${isYou ? ", you" : ""}`;

  return (
    <motion.li
      aria-label={ariaLabel}
      layout={motionSafe}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className="relative"
    >
      <motion.div
        animate={nudgeActive ? { x: [...NUDGE_KEYFRAMES] } : { x: 0 }}
        transition={
          nudgeActive
            ? {
                duration: NUDGE_DURATION_S,
                times: [...NUDGE_TIMES],
                ease: easings.move,
              }
            : { duration: durations.fast }
        }
        className={cn(
          "relative flex items-center gap-3 overflow-hidden rounded-3 border px-3 py-2.5",
          isYou
            ? "border-primary bg-primary/5"
            : "border-hairline bg-surface-2",
        )}
      >
        {isRivalAbove && (
          <span
            aria-hidden
            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary/70"
          />
        )}

        <span className="relative flex w-7 shrink-0 items-center justify-center">
          <Readout
            value={rank + 1}
            size="sm"
            className={isYou ? "text-primary" : "text-ink-2"}
          />
          <AnimatePresence>
            {rankChip && (
              <motion.span
                key={rankChip.token}
                initial={motionSafe ? { opacity: 0, y: 0 } : { opacity: 1 }}
                animate={{ opacity: 1, y: motionSafe ? -14 : 0 }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        y: -22,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={{ duration: durations.slow, ease: easings.enter }}
                className="absolute -top-1 left-full ml-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-success"
              >
                +{rankChip.delta}
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold",
            isYou
              ? "border-primary bg-primary/15 text-primary"
              : "border-hairline-strong bg-surface-1 text-ink-2",
          )}
        >
          {initialsFor(player.name)}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">
            {player.name}
          </span>
          {isYou && (
            <span className="rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide text-primary uppercase">
              you
            </span>
          )}
          {isRivalAbove && (
            <span className="font-mono text-[9px] font-semibold tracking-wide text-ink-3 uppercase">
              next
            </span>
          )}
          <AnimatePresence>
            {isYou && isTop && (
              <motion.span
                key="crown"
                aria-hidden
                initial={motionSafe ? { scale: 0, opacity: 0 } : { opacity: 1 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={
                  motionSafe
                    ? {
                        scale: 0,
                        opacity: 0,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={motionSafe ? springs.flick : { duration: 0 }}
                className="inline-flex text-warn"
              >
                <Crown className="size-3.5" fill="currentColor" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <Readout
          value={player.score}
          size="sm"
          className={isYou ? "text-primary" : "text-ink-2"}
        />

        {isYou && motionSafe && sweepToken !== null && (
          <motion.span
            key={sweepToken}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-linear-to-r from-transparent via-primary/25 to-transparent"
            initial={{ x: "-120%", opacity: 0 }}
            animate={{ x: "220%", opacity: [0, 1, 0] }}
            transition={{ duration: SWEEP_S, ease: easings.move }}
          />
        )}
      </motion.div>
    </motion.li>
  );
}

export type LeaderboardClimbProps = {
  /** Standings; exactly one entry should carry `you: true`. @default 8 built-in players */
  players?: Player[];
  /** Fixed score-gain cycle applied on each "Play a round" click, in order. @default [180, 240, 95, 310, 140] */
  gains?: number[];
  /** Fires the moment your row reaches first place. */
  onFirst?: () => void;
  className?: string;
};

/**
 * A leaderboard where your row climbs. Eight standings rank by score and
 * yours carries an accent border, a sustained highlight, and a "you" tag so
 * it never gets lost in the pack. "Play a round" adds the next gain from a
 * fixed cycle: your score rolls in its Readout, the list resorts on `glide`,
 * and every row your climb overtakes gets a brief nudge — the contact sells
 * the pass. An improved rank flies a small delta chip beside the rank
 * number, and the row directly above yours always carries a thin accent
 * edge and a mono "next" tag naming the rival to beat. Reaching first place
 * stamps a crown on `flick`, sweeps the row with light, and flashes a mono
 * "first place" caption. Reduced motion: rows reorder instantly with no
 * nudges, no flying chip, and no sweep — the rank delta shows as a static
 * mark for a beat, and the crown still stamps in without the spring.
 */
export function LeaderboardClimb({
  players: playersProp,
  gains: gainsProp,
  onFirst,
  className,
}: LeaderboardClimbProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const players = playersProp ?? DEFAULT_PLAYERS;
  const gains = gainsProp ?? [...DEFAULT_GAINS];
  const youPlayer = players.find((p) => p.you) ?? players[0] ?? FALLBACK_PLAYER;

  const [yourScore, setYourScore] = React.useState(youPlayer.score);
  const [nudgeTokens, setNudgeTokens] = React.useState<Record<string, number>>(
    {},
  );
  const [rankChip, setRankChip] = React.useState<{
    token: number;
    delta: number;
  } | null>(null);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [sweepToken, setSweepToken] = React.useState<number | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const yourScoreRef = React.useRef(youPlayer.score);
  const clickIndexRef = React.useRef(0);
  const motionSafeRef = React.useRef(motionSafe);
  const onFirstRef = React.useRef(onFirst);
  const idCounterRef = React.useRef(0);
  const nudgeTimersRef = React.useRef<Record<string, number>>({});
  const rankChipTimerRef = React.useRef<number | null>(null);
  const captionTimerRef = React.useRef<number | null>(null);
  const sweepTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);

  React.useEffect(() => {
    onFirstRef.current = onFirst;
  }, [onFirst]);

  React.useEffect(() => {
    const nudgeT = nudgeTimersRef.current;
    return () => {
      for (const id of Object.keys(nudgeT)) {
        const t = nudgeT[id];
        if (t !== undefined) window.clearTimeout(t);
      }
      if (rankChipTimerRef.current !== null)
        window.clearTimeout(rankChipTimerRef.current);
      if (captionTimerRef.current !== null)
        window.clearTimeout(captionTimerRef.current);
      if (sweepTimerRef.current !== null)
        window.clearTimeout(sweepTimerRef.current);
    };
  }, []);

  const sorted = rankPlayers(players, yourScore);
  const meIndex = sorted.findIndex((p) => p.you);
  const rivalAboveId = meIndex > 0 ? (sorted[meIndex - 1]?.id ?? null) : null;

  const gapFooter = (() => {
    if (meIndex === -1) return "";
    if (meIndex === 0) {
      const second = sorted[1];
      const lead = second ? yourScore - second.score : yourScore;
      return `you lead by ${lead}`;
    }
    const rival = sorted[meIndex - 1];
    if (!rival) return "";
    return `${rival.score - yourScore} behind ${rival.name}`;
  })();

  const triggerNudges = (ids: string[]) => {
    idCounterRef.current += 1;
    const token = idCounterRef.current;
    setNudgeTokens((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = token;
      return next;
    });
    for (const id of ids) {
      const existing = nudgeTimersRef.current[id];
      if (existing !== undefined) window.clearTimeout(existing);
      const t = window.setTimeout(() => {
        delete nudgeTimersRef.current[id];
        setNudgeTokens((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, NUDGE_DURATION_MS);
      nudgeTimersRef.current[id] = t;
    }
  };

  const triggerRankChip = (delta: number) => {
    idCounterRef.current += 1;
    setRankChip({ token: idCounterRef.current, delta });
    if (rankChipTimerRef.current !== null)
      window.clearTimeout(rankChipTimerRef.current);
    rankChipTimerRef.current = window.setTimeout(() => {
      rankChipTimerRef.current = null;
      setRankChip(null);
    }, RANK_CHIP_MS);
  };

  const triggerTopMoment = () => {
    setCaption("first place");
    if (captionTimerRef.current !== null)
      window.clearTimeout(captionTimerRef.current);
    captionTimerRef.current = window.setTimeout(() => {
      captionTimerRef.current = null;
      setCaption(null);
    }, CAPTION_MS);

    if (motionSafeRef.current) {
      idCounterRef.current += 1;
      setSweepToken(idCounterRef.current);
      if (sweepTimerRef.current !== null)
        window.clearTimeout(sweepTimerRef.current);
      sweepTimerRef.current = window.setTimeout(() => {
        sweepTimerRef.current = null;
        setSweepToken(null);
      }, SWEEP_MS);
    }
  };

  const handlePlay = () => {
    const prevScore = yourScoreRef.current;
    const prevSorted = rankPlayers(players, prevScore);
    const prevIndex = prevSorted.findIndex((p) => p.you);
    const prevRank = prevIndex === -1 ? prevSorted.length : prevIndex;

    const gain = gains[clickIndexRef.current % gains.length] ?? 0;
    clickIndexRef.current += 1;
    const nextScore = prevScore + gain;
    yourScoreRef.current = nextScore;
    setYourScore(nextScore);

    const nextSorted = rankPlayers(players, nextScore);
    const nextIndex = nextSorted.findIndex((p) => p.you);
    const nextRank = nextIndex === -1 ? nextSorted.length : nextIndex;

    const overtakenIds = players
      .filter((p) => !p.you && p.score > prevScore && p.score <= nextScore)
      .map((p) => p.id);
    if (motionSafeRef.current && overtakenIds.length > 0) {
      triggerNudges(overtakenIds);
    }

    const rankDelta = prevRank - nextRank;
    if (rankDelta > 0) {
      triggerRankChip(rankDelta);
    }

    const justReachedTop = nextRank === 0 && prevRank !== 0;
    if (justReachedTop) {
      onFirstRef.current?.();
      triggerTopMoment();
    }

    setAnnounce(`Plus ${gain}. Now rank ${nextRank + 1} of ${players.length}.`);
  };

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-4 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="mb-3 text-label text-ink-3">leaderboard</div>

      <ul aria-label="Leaderboard standings" className="flex flex-col gap-1.5">
        {sorted.map((player, index) => (
          <LeaderboardRow
            key={player.id}
            player={player}
            rank={index}
            isYou={Boolean(player.you)}
            isRivalAbove={player.id === rivalAboveId}
            isTop={index === 0}
            motionSafe={motionSafe}
            nudgeActive={nudgeTokens[player.id] !== undefined}
            rankChip={player.you ? rankChip : null}
            sweepToken={player.you ? sweepToken : null}
          />
        ))}
      </ul>

      <div
        aria-hidden
        className="mt-2 flex h-4 items-center justify-center overflow-hidden font-mono text-[11px] text-ink-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          {caption && (
            <motion.span
              key={caption}
              initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 1 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      y: -4,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
              className="tracking-[0.06em] text-warn uppercase"
            >
              {caption}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-ink-2">{gapFooter}</span>
        <motion.button
          type="button"
          aria-label="Play a round"
          onClick={handlePlay}
          whileTap={motionSafe ? { scale: 0.94 } : undefined}
          transition={springs.flick}
          className={cn(
            "rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          play round
        </motion.button>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
