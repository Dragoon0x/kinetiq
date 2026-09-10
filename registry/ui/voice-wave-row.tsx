"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type VoiceParticipant = {
  id: string;
  name: string;
  /** A muted row draws a struck flat line and says so in its label. */
  muted?: boolean;
};

export type VoiceWaveRowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The people on the call, in the caller's order. */
  participants: VoiceParticipant[];
  /** Level 0–1 per id, from the host. A missing id sits at zero. */
  levels?: Record<string, number>;
  /** Level at or above which a row counts as speaking. @default 0.12 */
  threshold?: number;
  /** Bars per strip. @default 12 */
  bars?: number;
  /** Controlled pinned row. */
  pinnedId?: string | null;
  /** Initial pinned row for uncontrolled usage. @default null */
  defaultPinnedId?: string | null;
  onPinnedChange?: (id: string | null) => void;
  /** Fires once per frozen change sentence ("Marta Ferreira is speaking"). */
  onSpeakerChange?: (sentence: string) => void;
  /** Names the row list for assistive technology. */
  label: string;
  className?: string;
};

const NO_LEVELS: Record<string, number> = {};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A 32-bit integer hash. No trigonometry, so a profile drawn on the server and
 * the same profile drawn in the browser agree to the last digit.
 */
const hash = (a: number, b: number): number => {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  x = x ^ (x >>> 13);
  x = Math.imul(x, 1274126177) | 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const seedOf = (id: string): number => {
  let x = 0;
  for (let index = 0; index < id.length; index += 1) {
    x = (Math.imul(x, 31) + id.charCodeAt(index)) | 0;
  }
  return x;
};

/**
 * Every voice keeps its own shape: the profile is fixed per person, and the
 * level only scales it, so a familiar wave belongs to a familiar name. Peaks
 * sit toward the middle of the strip the way a spoken phrase does.
 */
const profileFor = (id: string, count: number): number[] => {
  const seed = seedOf(id);
  return Array.from({ length: count }, (_, index) => {
    const middle = 1 - Math.abs((index + 0.5) / count - 0.5) * 1.1;
    const body = 0.45 + 0.55 * hash(seed, index);
    return Number((body * middle).toFixed(3));
  });
};

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type StripProps = {
  profile: number[];
  level: number;
  muted: boolean;
  speaking: boolean;
  pinned: boolean;
  motionSafe: boolean;
};

/**
 * The strip. Bars scale from their centre on `flick`, because a level meter
 * follows the signal rather than settling into it, and a silent row keeps a
 * hairline rule across the whole strip — silence is a flat line, not an
 * absence. Nothing here touches a microphone: the level arrives as a prop.
 */
function WaveStrip({
  profile,
  level,
  muted,
  speaking,
  pinned,
  motionSafe,
}: StripProps) {
  const tone = muted
    ? "bg-hairline-strong"
    : speaking
      ? "bg-cobalt-bright"
      : "bg-ink-3/60";

  return (
    <motion.span
      aria-hidden
      className="relative flex shrink-0 items-center justify-end gap-[2px] overflow-hidden"
      initial={false}
      animate={{ height: pinned ? 26 : 16 }}
      transition={
        motionSafe
          ? springs.glide
          : { duration: durations.base, ease: easings.move }
      }
    >
      {profile.map((share, index) => {
        const scale = muted
          ? 0.06
          : Number(Math.max(0.06, share * level).toFixed(3));
        return (
          <motion.span
            key={index}
            className={cn(
              "h-full w-[3px] shrink-0 rounded-full transition-colors",
              tone,
            )}
            initial={false}
            animate={{ scaleY: scale }}
            transition={
              motionSafe
                ? springs.flick
                : { duration: durations.fast, ease: easings.enter }
            }
          />
        );
      })}
      {muted ? (
        <span className="pointer-events-none absolute top-1/2 left-0 h-px w-full -translate-y-1/2 -rotate-12 bg-ink-3/70" />
      ) : null}
    </motion.span>
  );
}

/**
 * Who is talking, read off the waves. Each row carries one person's strip,
 * driven entirely by the levels the host passes — this component has no access
 * to audio and asks for none. The loudest voice above the threshold is the
 * active one: its name lifts 2px and takes cobalt on `snap`, the indicator
 * spring, while every other row stays where it is. Silent rows flatten, muted
 * rows draw a struck line, and any row can be pinned to hold its contrast and
 * grow its strip when two people talk at once.
 *
 * Rows are real buttons under a roving tabindex — Down and Up step, Home and
 * End jump, Enter and Space pin — and each name is a whole sentence, so
 * speaking, silent and muted never depend on colour. A polite status speaks the
 * turn once, frozen when the active id changes, never per level. Under reduced
 * motion bars still rise and fall on a tween and the name takes colour and
 * weight instead of lifting.
 */
export function VoiceWaveRow({
  ref,
  participants,
  levels = NO_LEVELS,
  threshold = 0.12,
  bars = 12,
  pinnedId,
  defaultPinnedId = null,
  onPinnedChange,
  onSpeakerChange,
  label,
  className,
}: VoiceWaveRowProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const rowId = (id: string) => `${uid}-row-${id}`;
  const count = Math.max(4, Math.round(bars));

  const profiles = React.useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const person of participants) {
      map[person.id] = profileFor(person.id, count);
    }
    return map;
  }, [participants, count]);

  const [uncontrolledPin, setUncontrolledPin] = React.useState<string | null>(
    defaultPinnedId,
  );
  const pinned = pinnedId === undefined ? uncontrolledPin : pinnedId;

  const togglePin = (id: string) => {
    const next = pinned === id ? null : id;
    if (pinnedId === undefined) setUncontrolledPin(next);
    onPinnedChange?.(next);
  };

  // The loudest voice over the threshold holds the turn; a muted row can never
  // hold it, whatever level the host reports for it.
  let activeId: string | null = null;
  let loudest = threshold;
  for (const person of participants) {
    if (person.muted) continue;
    const level = levels[person.id] ?? 0;
    if (level >= loudest) {
      loudest = level;
      activeId = person.id;
    }
  }

  const activeName =
    participants.find((person) => person.id === activeId)?.name ?? "";

  // The turn is frozen the moment the active id changes, so a render that
  // merely re-derives the levels cannot make the region repeat a past turn.
  const [turn, setTurn] = React.useState(() => ({
    id: activeId,
    sentence: "",
    stamp: 0,
  }));
  if (turn.id !== activeId) {
    setTurn({
      id: activeId,
      sentence: activeId ? `${activeName} is speaking` : "Nobody is speaking",
      stamp: turn.stamp + 1,
    });
  }

  const announceRef = useLatest(onSpeakerChange);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (turn.sentence) announceRef.current?.(turn.sentence);
  }, [turn.stamp, turn.sentence, announceRef]);

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const focusIndex = Math.max(
    0,
    participants.findIndex((person) => person.id === focusId),
  );

  const focusAt = (index: number) => {
    const clamped = Math.min(participants.length - 1, Math.max(0, index));
    const person = participants[clamped];
    if (!person) return;
    setFocusId(person.id);
    document.getElementById(rowId(person.id))?.focus();
  };

  const keyHandler =
    (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusAt(index + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusAt(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusAt(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusAt(participants.length - 1);
      }
    };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          {participants.length} on the call
        </span>
      </div>

      <ol role="list" aria-label={label} className="flex flex-col gap-0.5">
        {participants.map((person, index) => {
          const level = levels[person.id] ?? 0;
          const muted = person.muted === true;
          const speaking = !muted && person.id === activeId;
          const isPinned = pinned === person.id;
          const profile = profiles[person.id] ?? [];
          const words = muted
            ? "microphone muted"
            : speaking
              ? "speaking"
              : "silent";

          return (
            <li key={person.id}>
              <button
                type="button"
                id={rowId(person.id)}
                aria-pressed={isPinned}
                aria-label={`${person.name}, ${words}. ${isPinned ? "Unpin" : "Pin"} ${person.name}.`}
                tabIndex={participants[focusIndex]?.id === person.id ? 0 : -1}
                onFocus={() => setFocusId(person.id)}
                onClick={() => {
                  setFocusId(person.id);
                  togglePin(person.id);
                }}
                onKeyDown={keyHandler(index)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-2 px-2 py-1.5 text-left transition-colors",
                  focusRing,
                  isPinned ? "bg-cobalt-wash" : "hover:bg-accent",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border text-[10px] font-semibold transition-colors",
                    speaking
                      ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline bg-surface-2 text-ink-3",
                  )}
                >
                  {initialsOf(person.name)}
                </span>

                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  {/* The turn lifts the name rather than the row: a row that
                      moved would push its neighbours around every time
                      somebody drew breath. */}
                  <motion.span
                    className={cn(
                      "min-w-0 truncate text-sm transition-colors",
                      speaking
                        ? "font-semibold text-cobalt-bright"
                        : muted
                          ? "text-ink-3"
                          : "font-medium text-ink-2",
                    )}
                    initial={false}
                    animate={{ y: motionSafe && speaking ? -2 : 0 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  >
                    {person.name}
                  </motion.span>
                  {isPinned ? (
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className="size-3.5 shrink-0 text-cobalt-bright"
                    >
                      <path
                        d="M6 2h4l-.6 4 2.1 2.2H4.5L6.6 6z M8 8.4V14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>

                <WaveStrip
                  profile={profile}
                  level={level}
                  muted={muted}
                  speaking={speaking}
                  pinned={isPinned}
                  motionSafe={motionSafe}
                />
              </button>
            </li>
          );
        })}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {turn.sentence}
      </span>
    </div>
  );
}
