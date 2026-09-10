"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MuteParticipant = {
  id: string;
  name: string;
  /** A short word beside the name ("host"); spoken with nothing, drawn only. */
  role?: string;
};

export type MuteAllProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The people on the call, in the caller's order. */
  participants: MuteParticipant[];
  /** Controlled muted set. */
  mutedIds?: string[];
  /** Initial muted set for uncontrolled usage. @default [] */
  defaultMutedIds?: string[];
  /** Fires from the sweep, the undo, and every row toggle. */
  onMutedIdsChange?: (ids: string[]) => void;
  /** Fires after a sweep with the number of microphones it muted. */
  onMuteAll?: (count: number) => void;
  /** Fires after an undo with the number of microphones it unmuted. */
  onUndo?: (count: number) => void;
  /** Fires once per frozen change sentence ("Muted 4 microphones"). */
  onAnnounce?: (sentence: string) => void;
  /** Names the roster for assistive technology. */
  label: string;
  className?: string;
};

type Sweep = {
  kind: "mute" | "undo" | "single" | null;
  /** The microphones the last sweep took, and only those. */
  ids: string[];
  stamp: number;
};

const NO_IDS: string[] = [];

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const MIC_BODY =
  "M8 2.6a1.9 1.9 0 0 1 1.9 1.9v3.2a1.9 1.9 0 0 1-3.8 0V4.5A1.9 1.9 0 0 1 8 2.6z";
const MIC_STAND = "M4.4 7.9a3.6 3.6 0 0 0 7.2 0M8 11.5V13.4";
const MIC_SLASH = "M3.6 3.6 12.4 12.4";

const mics = (count: number): string =>
  `${count} ${count === 1 ? "microphone" : "microphones"}`;

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type MicProps = {
  muted: boolean;
  delay: number;
  motionSafe: boolean;
};

/**
 * The slash draws its own length on `flick` — a confirmation, not a journey —
 * and the delay is what makes the sweep read as a sweep. Under reduced motion
 * the same target arrives with no duration: which microphones are muted is
 * information, the order they were taken in is flourish.
 */
function MicGlyph({ muted, delay, motionSafe }: MicProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0">
      <g
        className={cn(
          "transition-colors",
          muted ? "text-ink-3" : "text-cobalt-bright",
        )}
      >
        <path
          d={MIC_BODY}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={MIC_STAND}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
      <motion.path
        d={MIC_SLASH}
        className="text-danger"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        pathLength={1}
        initial={false}
        animate={{ pathLength: muted ? 1 : 0 }}
        transition={motionSafe ? { ...springs.flick, delay } : { duration: 0 }}
      />
    </svg>
  );
}

/**
 * Everyone, quiet — and a way back. Mute all commits every open microphone at
 * once, because the state must never lag the promise, while the drawing
 * cascades: each slash draws its length on `flick` at a `cascade()` delay by
 * row, and a cobalt wash sweeps the list top to bottom so the eye follows the
 * rows it just took. Undo restores exactly the microphones that sweep muted —
 * a mic somebody closed by hand stays closed, because undo is not the same as
 * unmute — and runs the cascade bottom to top. A row toggled by hand draws at
 * once and clears the undo, since the set it would restore no longer exists.
 *
 * Rows are toggle buttons under a roving tabindex — Down and Up step, Home and
 * End jump, Enter and Space toggle — each named in one sentence, so a closed
 * microphone is never a red glyph alone. Under reduced motion nothing cascades
 * and no wash travels: every slash swaps instantly.
 */
export function MuteAll({
  ref,
  participants,
  mutedIds,
  defaultMutedIds = NO_IDS,
  onMutedIdsChange,
  onMuteAll,
  onUndo,
  onAnnounce,
  label,
  className,
}: MuteAllProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const rowId = (id: string) => `${uid}-mic-${id}`;

  const [uncontrolled, setUncontrolled] =
    React.useState<string[]>(defaultMutedIds);
  const muted = mutedIds ?? uncontrolled;
  const mutedSet = React.useMemo(() => new Set(muted), [muted]);

  const [sweep, setSweep] = React.useState<Sweep>({
    kind: null,
    ids: NO_IDS,
    stamp: 0,
  });
  const [said, setSaid] = React.useState("");

  const announceRef = useLatest(onAnnounce);
  React.useEffect(() => {
    if (said) announceRef.current?.(said);
  }, [said, sweep.stamp, announceRef]);

  const commit = (next: string[]) => {
    if (mutedIds === undefined) setUncontrolled(next);
    onMutedIdsChange?.(next);
  };

  const open = participants.filter((person) => !mutedSet.has(person.id));
  // An undo is only honest while every microphone it would give back is still
  // closed: a host that changed the set from outside has moved past it.
  const canUndo =
    sweep.kind === "mute" &&
    sweep.ids.length > 0 &&
    sweep.ids.every((id) => mutedSet.has(id));
  const stagger = cascade(participants.length);

  const muteAll = () => {
    const taking = open.map((person) => person.id);
    if (taking.length === 0) return;
    commit([...muted, ...taking]);
    setSweep({ kind: "mute", ids: taking, stamp: sweep.stamp + 1 });
    setSaid(`Muted ${mics(taking.length)}`);
    onMuteAll?.(taking.length);
  };

  const undo = () => {
    const giving = sweep.ids;
    if (giving.length === 0) return;
    commit(muted.filter((id) => !giving.includes(id)));
    setSweep({ kind: "undo", ids: NO_IDS, stamp: sweep.stamp + 1 });
    setSaid(`Unmuted ${mics(giving.length)}`);
    onUndo?.(giving.length);
  };

  const toggleOne = (person: MuteParticipant) => {
    const nowMuted = !mutedSet.has(person.id);
    commit(
      nowMuted ? [...muted, person.id] : muted.filter((id) => id !== person.id),
    );
    // A hand toggle invalidates the undo: the set it would restore is gone.
    setSweep({ kind: "single", ids: NO_IDS, stamp: sweep.stamp + 1 });
    setSaid(`${person.name} ${nowMuted ? "muted" : "unmuted"}`);
  };

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

  const reading = `${muted.length} of ${participants.length} muted`;
  const headLabel = canUndo
    ? `Undo, unmute ${mics(sweep.ids.length)}`
    : "Mute all microphones";
  const headDisabled = !canUndo && open.length === 0;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (headDisabled) return;
            if (canUndo) undo();
            else muteAll();
          }}
          aria-disabled={headDisabled}
          aria-label={headLabel}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-2 border px-3 text-xs font-medium transition-colors",
            focusRing,
            headDisabled
              ? "cursor-not-allowed border-hairline text-ink-3"
              : canUndo
                ? "border-hairline-strong text-cobalt-bright hover:bg-cobalt-wash"
                : "border-hairline-strong text-ink-2 hover:bg-accent",
          )}
        >
          {canUndo ? "Undo" : "Mute all"}
        </button>

        {/* Successive readings share one grid cell and cross-fade; a wait-mode
            presence would hold a stale count behind a fast second press. */}
        <span className="grid min-w-0 justify-items-end">
          <AnimatePresence initial={false}>
            <motion.span
              key={reading}
              className="col-start-1 row-start-1 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums"
              initial={motionSafe ? { opacity: 0, y: -4 } : { opacity: 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              {reading}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div className="relative overflow-hidden rounded-3 border border-hairline bg-surface-1">
        <ol role="list" aria-label={label} className="flex flex-col">
          {participants.map((person, index) => {
            const isMuted = mutedSet.has(person.id);
            const delay =
              sweep.kind === "mute"
                ? index * stagger
                : sweep.kind === "undo"
                  ? (participants.length - 1 - index) * stagger
                  : 0;

            return (
              <li
                key={person.id}
                className="flex items-center gap-3 border-b border-hairline px-3 py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {person.name}
                  </span>
                  {person.role ? (
                    <span
                      aria-hidden
                      className="shrink-0 text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                    >
                      {person.role}
                    </span>
                  ) : null}
                </span>

                <button
                  type="button"
                  id={rowId(person.id)}
                  aria-pressed={isMuted}
                  aria-label={`${isMuted ? "Unmute" : "Mute"} ${person.name}`}
                  tabIndex={participants[focusIndex]?.id === person.id ? 0 : -1}
                  onFocus={() => setFocusId(person.id)}
                  onClick={() => {
                    setFocusId(person.id);
                    toggleOne(person);
                  }}
                  onKeyDown={keyHandler(index)}
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-2 transition-colors hover:bg-accent",
                    focusRing,
                  )}
                >
                  <MicGlyph
                    muted={isMuted}
                    delay={delay}
                    motionSafe={motionSafe}
                  />
                </button>
              </li>
            );
          })}
        </ol>

        {/* The wash lives inside the list's own box and is keyed by the sweep,
            so it replays on a press rather than waiting on a timer. */}
        <AnimatePresence initial={false}>
          {motionSafe && (sweep.kind === "mute" || sweep.kind === "undo") ? (
            <motion.span
              key={sweep.stamp}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-transparent via-cobalt-wash to-transparent"
              initial={{ y: sweep.kind === "mute" ? "-100%" : "200%" }}
              animate={{ y: sweep.kind === "mute" ? "200%" : "-100%" }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.page, ease: easings.move }}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
