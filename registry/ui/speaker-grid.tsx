"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpeakerTile = {
  id: string;
  name: string;
  /** 0 to 1. The loudest at or above `threshold` takes the front cell. */
  level?: number;
  muted?: boolean;
};

export type SpeakerGridProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** People on the call, in join order. The component reorders for display only. */
  participants: SpeakerTile[];
  /** Level at or above which someone counts as speaking. @default 0.18 */
  threshold?: number;
  /** Grid columns, clamped 1–4. @default 2 */
  columns?: number;
  /** Controlled pin. */
  pinnedId?: string | null;
  /** Initial pin for uncontrolled use. @default null */
  defaultPinnedId?: string | null;
  onPinnedChange?: (id: string | null) => void;
  /** Fires when the derived speaker changes. */
  onSpeakerChange?: (id: string | null) => void;
  /** Names the grid for assistive technology. */
  label: string;
  className?: string;
};

const trim = (value: number) => Number(value.toFixed(3));

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** FNV-1a, so the same person always draws the same face and nothing is random. */
const hashOf = (id: string) => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
};

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "·";

/**
 * A face drawn from an id: two ridges and a low sun, every coordinate a whole
 * number so nothing trigonometric ever reaches an attribute and the server's
 * markup is the markup the browser hydrates.
 */
function Face({ id }: { id: string }) {
  const hash = hashOf(id);
  const ridge = 14 + (hash % 7) * 2;
  const far = 12 + ((hash >> 3) % 6) * 2;
  const sunX = 8 + ((hash >> 6) % 8) * 4;
  const sunY = 8 + ((hash >> 9) % 4) * 2;
  return (
    <svg
      viewBox="0 0 48 36"
      aria-hidden
      preserveAspectRatio="none"
      className="absolute inset-0 size-full text-cobalt-bright opacity-30"
    >
      <circle cx={sunX} cy={sunY} r="3.5" fill="currentColor" />
      <path
        d={`M0 36 L0 ${ridge} Q 12 ${ridge - 6} 24 ${ridge + 2} T 48 ${far} L48 36 Z`}
        fill="currentColor"
        fillOpacity="0.45"
      />
      <path
        d={`M0 36 L0 ${ridge + 8} Q 16 ${ridge + 2} 30 ${ridge + 10} T 48 ${far + 9} L48 36 Z`}
        fill="currentColor"
        fillOpacity="0.7"
      />
    </svg>
  );
}

/**
 * Whoever speaks, comes forward. The speaker is derived rather than declared —
 * the loudest participant at or above `threshold` — and when that changes every
 * tile travels to its new cell with FLIP on `glide`, ζ0.98, the house spring for
 * a layout shift, rather than the contents swapping inside stationary boxes.
 * Every tile is one `<li>` of one list, so a tile moving from the third cell to
 * the first keeps its React identity, its DOM node and its focus.
 *
 * The speaking tile lifts by `distances.nudge` and rings: the ring scales
 * 0.94 → 1 on `snap`, one crisp overshoot, and its opacity follows the level, so
 * a quiet sentence rings faintly and a loud one rings hard. Faces are procedural
 * — initials over ridges hashed from the id — so nothing is loaded and nothing
 * is random, and each tile reserves its space with an aspect ratio rather than a
 * minimum height. Joining and leaving run through `AnimatePresence` while the
 * grid re-lays around the change.
 *
 * It is a listbox: exactly one tile is tabbable, arrows step across and down,
 * Home and End jump to the first and last participant, and Enter or Space pins
 * a tile to the front whatever the levels do. Speaking and muted are stated in
 * words in every tile and in every option's label, so the ring is never the only
 * signal. Under reduced motion nothing lifts and nothing travels — the order
 * still changes, because who is speaking is information.
 */
export function SpeakerGrid({
  ref,
  participants,
  threshold = 0.18,
  columns = 2,
  pinnedId,
  defaultPinnedId = null,
  onPinnedChange,
  onSpeakerChange,
  label,
  className,
}: SpeakerGridProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultPinnedId,
  );
  const isControlled = pinnedId !== undefined;
  const pinned = isControlled ? pinnedId : uncontrolled;

  const levelOf = (tile: SpeakerTile) =>
    tile.muted ? 0 : Math.min(1, Math.max(0, tile.level ?? 0));

  let speakerId: string | null = null;
  let loudest = -1;
  for (const tile of participants) {
    const level = levelOf(tile);
    if (level >= threshold && level > loudest) {
      loudest = level;
      speakerId = tile.id;
    }
  }

  const speakerOutRef = useLatest(onSpeakerChange);
  React.useEffect(() => {
    speakerOutRef.current?.(speakerId);
  }, [speakerId, speakerOutRef]);

  // Pinned first, then the speaker, then everyone in join order. The head is
  // built by filtering rather than sorting so join order is never disturbed.
  const order = React.useMemo(() => {
    const head: SpeakerTile[] = [];
    const pin = participants.find((tile) => tile.id === pinned);
    if (pin) head.push(pin);
    const speaker =
      speakerId && speakerId !== pinned
        ? participants.find((tile) => tile.id === speakerId)
        : undefined;
    if (speaker) head.push(speaker);
    const rest = participants.filter(
      (tile) => tile.id !== pin?.id && tile.id !== speaker?.id,
    );
    return [...head, ...rest];
  }, [participants, pinned, speakerId]);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const firstId = order[0]?.id ?? null;
  const active =
    activeId && order.some((tile) => tile.id === activeId) ? activeId : firstId;

  const nameOf = (id: string | null) =>
    participants.find((tile) => tile.id === id)?.name ?? null;

  // Frozen at the moment of the change, so a render that merely re-derives the
  // sentence cannot make the region repeat a past event. A pin is the louder
  // event, so it wins the reading when both change in one commit.
  const [seen, setSeen] = React.useState({ speaker: speakerId, pin: pinned });
  const [spoken, setSpoken] = React.useState("");
  if (seen.speaker !== speakerId || seen.pin !== pinned) {
    if (seen.pin !== pinned) {
      const pinName = nameOf(pinned);
      const wasName = nameOf(seen.pin);
      setSpoken(
        pinName
          ? `${pinName} is pinned to the front.`
          : `${wasName ?? "That tile"} is no longer pinned.`,
      );
    } else {
      const speakerName = nameOf(speakerId);
      setSpoken(
        speakerName ? `${speakerName} is speaking.` : "No one is speaking.",
      );
    }
    setSeen({ speaker: speakerId, pin: pinned });
  }

  const setPin = (next: string | null) => {
    if (!isControlled) setUncontrolled(next);
    onPinnedChange?.(next);
  };

  const cols = Math.min(4, Math.max(1, Math.round(columns)));

  const focusAt = (index: number) => {
    const clamped = Math.min(order.length - 1, Math.max(0, index));
    const tile = order[clamped];
    if (!tile) return;
    setActiveId(tile.id);
    document.getElementById(`${baseId}-tile-${tile.id}`)?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    index: number,
    id: string,
  ) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + cols);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - cols);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(order.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPin(pinned === id ? null : id);
    }
  };

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <ul
        role="listbox"
        aria-label={label}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        <AnimatePresence initial={false}>
          {order.map((tile, index) => {
            const level = levelOf(tile);
            const speaking = tile.id === speakerId;
            const isPinned = tile.id === pinned;
            const state = speaking
              ? "Speaking"
              : tile.muted
                ? "Muted"
                : "Listening";
            // One string: the accessible-name algorithm must not be handed two
            // text nodes to join with a stray space.
            const optionLabel = `${tile.name} is ${state.toLowerCase()}. ${
              isPinned ? "Unpin this tile." : "Pin this tile."
            }`;
            return (
              <motion.li
                key={tile.id}
                layout={motionSafe}
                role="option"
                aria-selected={isPinned}
                id={`${baseId}-tile-${tile.id}`}
                aria-label={optionLabel}
                tabIndex={tile.id === active ? 0 : -1}
                onFocus={() => setActiveId(tile.id)}
                onClick={() => {
                  setActiveId(tile.id);
                  setPin(isPinned ? null : tile.id);
                }}
                onKeyDown={(event) => handleKeyDown(event, index, tile.id)}
                // Opacity only on the layout element: a scale on the box motion
                // is measuring would distort the face it is animating past.
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor() }}
                transition={
                  motionSafe
                    ? springs.glide
                    : { duration: durations.fast, ease: easings.enter }
                }
                className="cursor-pointer rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <motion.div
                  className="flex flex-col gap-1.5"
                  initial={
                    motionSafe ? { scale: 0.94, y: distances.step } : false
                  }
                  animate={{
                    scale: 1,
                    y: motionSafe && speaking ? -distances.nudge : 0,
                  }}
                  transition={
                    motionSafe
                      ? springs.snap
                      : { duration: durations.fast, ease: easings.enter }
                  }
                >
                  <span className="relative block aspect-[4/3] overflow-hidden rounded-2 bg-cobalt-wash">
                    <Face id={tile.id} />
                    <span
                      aria-hidden
                      className="absolute inset-0 grid place-items-center text-sm font-semibold text-cobalt-bright"
                    >
                      {initialsOf(tile.name)}
                    </span>
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-2 ring-2 ring-cobalt-bright ring-inset"
                      initial={false}
                      animate={{
                        opacity: speaking ? trim(0.35 + level * 0.65) : 0,
                        scale: motionSafe && !speaking ? 0.94 : 1,
                      }}
                      transition={
                        motionSafe
                          ? springs.snap
                          : { duration: durations.fast, ease: easings.enter }
                      }
                    />
                    {isPinned ? (
                      <span
                        aria-hidden
                        className="absolute top-1 right-1 rounded-1 border border-hairline bg-surface-0 px-1 text-[9px] font-medium text-ink-2"
                      >
                        Pinned
                      </span>
                    ) : null}
                  </span>

                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs leading-snug font-medium">
                      {tile.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[10px] leading-snug font-medium transition-colors",
                        speaking
                          ? "text-cobalt-bright"
                          : tile.muted
                            ? "text-warn"
                            : "text-ink-3",
                      )}
                    >
                      {state}
                    </span>
                  </span>
                </motion.div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
