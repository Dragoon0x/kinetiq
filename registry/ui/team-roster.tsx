"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";
import { StatusPip, type PipStatus } from "@/registry/ui/status-pip";

export type Member = {
  id: string;
  name: string;
  role: string;
  /** Marks the local player. Exactly one row should carry this. */
  you?: boolean;
};

export type TeamRosterProps = {
  /** The party. Exactly one entry should carry `you: true`. @default 5 built-in members */
  members?: Member[];
  /** Fires once, the moment the countdown finishes and the match launches. */
  onLaunch?: () => void;
  className?: string;
};

type Phase = "lobby" | "countdown" | "launching";

const DEFAULT_MEMBERS: Member[] = [
  { id: "you", name: "You", role: "Vanguard", you: true },
  { id: "mo", name: "Mo Arden", role: "Anchor" },
  { id: "juno", name: "Juno Cabral", role: "Scout" },
  { id: "reiko", name: "Reiko Sato", role: "Support" },
  { id: "piet", name: "Piet Bakker", role: "Flex" },
];

const FALLBACK_MEMBER: Member = {
  id: "you",
  name: "You",
  role: "Flex",
  you: true,
};

/** Generous ceiling on teammate count so the timer-ref array can be sized
 * once and only ever mutated in place, never reallocated. */
const MAX_TEAMMATES = 64;

/**
 * Fixed per-teammate ready delays after mount, in roster order — never a
 * random draw. The last entry is deliberately long: a lobby's whole social
 * texture is the one person everyone else ends up waiting on.
 */
const TEAMMATE_READY_DELAYS_MS = [1400, 3100, 5000, 8800] as const;
const FALLBACK_READY_DELAY_MS = 1400;

/** Fixed presence a teammate opens the lobby with, by roster position. */
const TEAMMATE_PRESENCE_TABLE: PipStatus[] = [
  "online",
  "online",
  "online",
  "busy",
];

/** Which teammate (by roster position) steps away, and how long after
 * mount — fixed, so the lobby feels alive without a server. */
const AWAY_TEAMMATE_INDEX = 1;
const AWAY_PRESENCE_DELAY_MS = 4600;

/** How long each countdown numeral holds before advancing. */
const COUNTDOWN_STEP_MS = 800;
/** Light-sweep duration across the panel once the countdown starts. */
const SWEEP_S = 0.6;

const PRESENCE_LABELS: Record<PipStatus, string> = {
  online: "online",
  away: "away",
  busy: "in-match",
  offline: "offline",
};

/** First name only — the "waiting on" line reads like lobby chat, not a
 * roster printout. */
function firstNameOf(name: string): string {
  const trimmed = name.trim();
  const [first] = trimmed.split(/\s+/);
  return first ?? trimmed;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const initials = `${first}${last}`.toUpperCase();
  return initials || "?";
}

/** Clears whatever is pending in `timers` and re-arms one setTimeout per
 * teammate from the fixed delay table. The array is mutated in place — its
 * slots are written, never replaced — so a caller holding the same ref
 * always sees the live set of pending timers. */
function armTeammateSchedule(
  teammates: Member[],
  timers: (number | null)[],
  onReady: (member: Member) => void,
): void {
  for (let i = 0; i < timers.length; i += 1) {
    const pending = timers[i];
    if (pending !== null && pending !== undefined) window.clearTimeout(pending);
    timers[i] = null;
  }
  teammates.forEach((member, i) => {
    const delay =
      TEAMMATE_READY_DELAYS_MS[i % TEAMMATE_READY_DELAYS_MS.length] ??
      FALLBACK_READY_DELAY_MS;
    timers[i] = window.setTimeout(() => {
      timers[i] = null;
      onReady(member);
    }, delay);
  });
}

type ReadyGlyphProps = {
  ready: boolean;
  motionSafe: boolean;
};

/** A hollow ring that fills and stamps a check once ready. Pure props, no
 * hooks, so it is safe to call from inside the roster's `.map`. */
function ReadyGlyph({ ready, motionSafe }: ReadyGlyphProps): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        ready ? "border-primary" : "border-hairline-strong",
      )}
      style={{ transitionDuration: `${durations.base}s` }}
    >
      <motion.span
        className="absolute inset-0.5 rounded-full bg-primary"
        initial={false}
        animate={{ scale: ready ? 1 : 0 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
      <motion.span
        className="relative flex text-primary-foreground"
        initial={false}
        animate={{ scale: ready ? 1 : 0, opacity: ready ? 1 : 0 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      >
        <Check className="size-3.5" />
      </motion.span>
    </span>
  );
}

type RosterRowProps = {
  member: Member;
  isYou: boolean;
  ready: boolean;
  presence: PipStatus;
  presenceLabel: string;
  brightenKey: number;
  pulseKey: number;
  pulseDelay: number;
  motionSafe: boolean;
  disabled: boolean;
  onToggleReady: () => void;
};

/** One seat — avatar, name, role, presence, and a ready glyph. Pure props,
 * no hooks, so it is safe to call from inside the roster's `.map`. */
function RosterRow({
  member,
  isYou,
  ready,
  presence,
  presenceLabel,
  brightenKey,
  pulseKey,
  pulseDelay,
  motionSafe,
  disabled,
  onToggleReady,
}: RosterRowProps): React.JSX.Element {
  const ariaLabel = `${member.name}, ${member.role}, ${presenceLabel}, ${
    ready ? "ready" : "not ready"
  }${isYou ? ", you" : ""}`;

  return (
    <li aria-label={ariaLabel} className="list-none">
      <motion.div
        initial={false}
        animate={{ opacity: presence === "away" ? 0.62 : 1 }}
        transition={
          motionSafe
            ? { duration: durations.base, ease: easings.move }
            : { duration: 0 }
        }
        className={cn(
          "relative flex items-center gap-3 overflow-hidden rounded-3 border px-3 py-2.5",
          isYou
            ? "border-primary bg-primary/5"
            : "border-hairline bg-surface-2",
        )}
      >
        {motionSafe && !isYou && brightenKey > 0 && (
          <motion.span
            key={`bright-${brightenKey}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-primary/15"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}

        {motionSafe && pulseKey > 0 && (
          <motion.span
            key={`pulse-${pulseKey}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-primary-foreground/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0] }}
            transition={{
              duration: durations.slow,
              ease: easings.move,
              times: [0, 0.5, 1],
              delay: pulseDelay,
            }}
          />
        )}

        <span
          aria-hidden
          className={cn(
            "relative flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold",
            isYou
              ? "border-primary bg-primary/15 text-primary"
              : "border-hairline-strong bg-surface-1 text-ink-2",
          )}
        >
          {initialsFor(member.name)}
        </span>

        <span className="relative min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink">
              {member.name}
            </span>
            {isYou && (
              <span className="rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide text-primary uppercase">
                you
              </span>
            )}
            <span className="rounded-full border border-hairline-strong bg-surface-1 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide text-ink-3 uppercase">
              {member.role}
            </span>
          </span>
          <StatusPip status={presence} label={presenceLabel} className="mt-1" />
        </span>

        {isYou ? (
          <motion.button
            type="button"
            aria-label="Ready up"
            aria-pressed={ready}
            disabled={disabled}
            onClick={onToggleReady}
            whileTap={motionSafe && !disabled ? { scale: 0.92 } : undefined}
            transition={springs.flick}
            className="relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 disabled:pointer-events-none disabled:opacity-70"
          >
            <ReadyGlyph ready={ready} motionSafe={motionSafe} />
          </motion.button>
        ) : (
          <span aria-hidden className="relative shrink-0">
            <ReadyGlyph ready={ready} motionSafe={motionSafe} />
          </span>
        )}
      </motion.div>
    </li>
  );
}

/**
 * A party lobby — five seats, one of them yours, waiting on everyone else to
 * click ready. Your row carries a real "Ready up" button: pressing it fills
 * the ring and stamps a check on `flick`, rolls the header count in a
 * `Readout`, and launches the panel into its countdown if the roster just
 * completed. Teammates ready themselves off a fixed table of delays after
 * mount — never a random draw — each one popping its own check and briefly
 * brightening its row; the last teammate is deliberately slow, because a
 * lobby is really everyone waiting on one person, named in a mono line
 * beneath the roster. One teammate also steps away on a fixed timer partway
 * through, its `StatusPip` dimming the row, because a checked ring does not
 * mean a present player. Reaching all-ready counts 3 · 2 · 1 down in large
 * mono while the rows pulse in a cascade and a light sweeps the panel;
 * "cancel" aborts the countdown and clears every ready state back to zero,
 * re-arming the same fixed teammate schedule.
 * Reduced motion: no pops, pulses, sweeps, or countdown bounce play — ring
 * fills, presence changes, and captions swap instantly, while the countdown
 * still steps 3 · 2 · 1 on its same fixed timer.
 */
export function TeamRoster({
  members: membersProp,
  onLaunch,
  className,
}: TeamRosterProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const members = membersProp ?? [...DEFAULT_MEMBERS];

  // The incoming roster is a starting condition for this lobby session, not
  // a live prop to keep tracking — captured once so timers and effects can
  // reference it without ever needing to reschedule on a prop change.
  const [roster] = React.useState<{ you: Member; teammates: Member[] }>(() => {
    const you = members.find((m) => m.you) ?? members[0] ?? FALLBACK_MEMBER;
    const teammates = members.filter((m) => m.id !== you.id);
    return { you, teammates };
  });

  const [phase, setPhase] = React.useState<Phase>("lobby");
  const [readyMap, setReadyMap] = React.useState<Record<string, boolean>>({});
  const [presenceMap, setPresenceMap] = React.useState<
    Record<string, PipStatus>
  >(() => {
    const map: Record<string, PipStatus> = {};
    roster.teammates.forEach((member, i) => {
      map[member.id] =
        TEAMMATE_PRESENCE_TABLE[i % TEAMMATE_PRESENCE_TABLE.length] ?? "online";
    });
    return map;
  });
  const [brightenKeys, setBrightenKeys] = React.useState<
    Record<string, number>
  >({});
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [pulseKey, setPulseKey] = React.useState(0);
  const [sweepKey, setSweepKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const phaseRef = React.useRef<Phase>("lobby");
  const readyMapRef = React.useRef<Record<string, boolean>>({});
  const teammateTimersRef = React.useRef<(number | null)[]>(
    Array.from({ length: MAX_TEAMMATES }, () => null),
  );
  const awayTimerRef = React.useRef<number | null>(null);
  const countdownTimerRef = React.useRef<number | null>(null);
  const onLaunchRef = React.useRef(onLaunch);

  React.useEffect(() => {
    onLaunchRef.current = onLaunch;
  }, [onLaunch]);

  const setReady = React.useCallback((id: string, value: boolean) => {
    const next = { ...readyMapRef.current, [id]: value };
    readyMapRef.current = next;
    setReadyMap(next);
    return next;
  }, []);

  const startLaunch = React.useCallback(() => {
    phaseRef.current = "countdown";
    setPhase("countdown");
    setCountdown(3);
    setPulseKey((k) => k + 1);
    setSweepKey((k) => k + 1);
    setAnnounce("All ready. Match starting in 3.");

    if (countdownTimerRef.current !== null)
      window.clearTimeout(countdownTimerRef.current);
    countdownTimerRef.current = window.setTimeout(() => {
      setCountdown(2);
      setAnnounce("2.");
      countdownTimerRef.current = window.setTimeout(() => {
        setCountdown(1);
        setAnnounce("1.");
        countdownTimerRef.current = window.setTimeout(() => {
          countdownTimerRef.current = null;
          phaseRef.current = "launching";
          setPhase("launching");
          setCountdown(null);
          setAnnounce("Match starting.");
          onLaunchRef.current?.();
        }, COUNTDOWN_STEP_MS);
      }, COUNTDOWN_STEP_MS);
    }, COUNTDOWN_STEP_MS);
  }, []);

  const checkAllReady = React.useCallback(
    (map: Record<string, boolean>) => {
      if (phaseRef.current !== "lobby") return;
      const everyone = [roster.you, ...roster.teammates];
      const allReady = everyone.every((m) => map[m.id] === true);
      if (allReady) startLaunch();
    },
    [roster, startLaunch],
  );

  const handleTeammateReady = React.useCallback(
    (member: Member) => {
      const next = setReady(member.id, true);
      setBrightenKeys((prev) => ({
        ...prev,
        [member.id]: (prev[member.id] ?? 0) + 1,
      }));
      setAnnounce(`${member.name} is ready.`);
      checkAllReady(next);
    },
    [setReady, checkAllReady],
  );

  React.useEffect(() => {
    armTeammateSchedule(
      roster.teammates,
      teammateTimersRef.current,
      handleTeammateReady,
    );

    const awayTarget =
      roster.teammates.length > 0
        ? (roster.teammates[AWAY_TEAMMATE_INDEX % roster.teammates.length] ??
          null)
        : null;
    if (awayTarget) {
      const targetId = awayTarget.id;
      const targetName = awayTarget.name;
      awayTimerRef.current = window.setTimeout(() => {
        awayTimerRef.current = null;
        setPresenceMap((prev) => ({ ...prev, [targetId]: "away" }));
        setAnnounce(`${targetName} stepped away.`);
      }, AWAY_PRESENCE_DELAY_MS);
    }

    const teammateTimers = teammateTimersRef.current;
    return () => {
      for (let i = 0; i < teammateTimers.length; i += 1) {
        const t = teammateTimers[i];
        if (t !== null && t !== undefined) window.clearTimeout(t);
      }
      if (awayTimerRef.current !== null)
        window.clearTimeout(awayTimerRef.current);
      if (countdownTimerRef.current !== null)
        window.clearTimeout(countdownTimerRef.current);
    };
  }, [roster, handleTeammateReady]);

  const toggleYourReady = () => {
    if (phaseRef.current !== "lobby") return;
    const wasReady = readyMapRef.current[roster.you.id] === true;
    const nextReady = !wasReady;
    const next = setReady(roster.you.id, nextReady);
    setAnnounce(nextReady ? "You are ready." : "You are not ready.");
    if (nextReady) checkAllReady(next);
  };

  const cancelLaunch = () => {
    if (phaseRef.current !== "countdown") return;
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    phaseRef.current = "lobby";
    setPhase("lobby");
    setCountdown(null);

    const cleared: Record<string, boolean> = {};
    readyMapRef.current = cleared;
    setReadyMap(cleared);
    setAnnounce("Launch cancelled. Ready states cleared.");

    armTeammateSchedule(
      roster.teammates,
      teammateTimersRef.current,
      handleTeammateReady,
    );
  };

  const orderedMembers = [roster.you, ...roster.teammates];
  const readyCount = orderedMembers.filter(
    (m) => readyMap[m.id] === true,
  ).length;
  const total = orderedMembers.length;
  const pulseStep = cascade(total);

  const waitingNames = roster.teammates
    .filter((m) => readyMap[m.id] !== true)
    .map((m) => firstNameOf(m.name));
  const statusText =
    phase === "lobby"
      ? waitingNames.length > 0
        ? `waiting on ${waitingNames.join(", ")}`
        : ""
      : "match starting";

  return (
    <div
      role="group"
      aria-label="Team roster"
      className={cn(
        "relative w-full max-w-md overflow-hidden rounded-4 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      {motionSafe && sweepKey > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <motion.span
            key={sweepKey}
            className="absolute inset-y-0 w-1/4 bg-primary-foreground/10"
            style={{ skewX: -14 }}
            initial={{ x: "-160%" }}
            animate={{ x: "420%" }}
            transition={{ duration: SWEEP_S, ease: easings.linear }}
          />
        </span>
      )}

      <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
        <span>party</span>
        <span aria-hidden>·</span>
        <span className="flex items-baseline gap-1 tracking-normal text-ink-2 normal-case">
          <Readout value={readyCount} size="sm" />
          <span>of {total} ready</span>
        </span>
      </div>

      <ul aria-label="Party members" className="flex flex-col gap-1.5">
        {orderedMembers.map((member, index) => {
          const isYou = member.id === roster.you.id;
          const presence: PipStatus = isYou
            ? "online"
            : (presenceMap[member.id] ?? "online");
          return (
            <RosterRow
              key={member.id}
              member={member}
              isYou={isYou}
              ready={readyMap[member.id] === true}
              presence={presence}
              presenceLabel={PRESENCE_LABELS[presence]}
              brightenKey={brightenKeys[member.id] ?? 0}
              pulseKey={pulseKey}
              pulseDelay={index * pulseStep}
              motionSafe={motionSafe}
              disabled={phase !== "lobby"}
              onToggleReady={toggleYourReady}
            />
          );
        })}
      </ul>

      {phase === "countdown" && (
        <div
          aria-hidden
          className="mt-3 flex h-20 items-center justify-center overflow-hidden"
        >
          <AnimatePresence mode="wait" initial={false}>
            {countdown !== null && (
              <motion.span
                key={countdown}
                initial={
                  motionSafe ? { opacity: 0, scale: 0.5 } : { opacity: 1 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        scale: 0.6,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={motionSafe ? springs.recoil : { duration: 0 }}
                className="font-mono text-6xl font-bold text-ink tabular-nums"
              >
                {countdown}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}

      <div
        aria-hidden
        className="mt-3 flex min-h-4 items-center justify-center overflow-hidden text-center font-mono text-[11px] text-ink-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          {statusText && (
            <motion.span
              key={statusText}
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
              className={cn(
                "tracking-[0.04em]",
                phase !== "lobby" && "text-warn uppercase",
              )}
            >
              {statusText}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {phase === "countdown" && (
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            onClick={cancelLaunch}
            className="font-mono text-[11px] font-medium text-ink-2 underline underline-offset-2 transition-colors outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
          >
            cancel
          </button>
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
