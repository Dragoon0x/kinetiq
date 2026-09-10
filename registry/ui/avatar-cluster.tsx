"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ClusterPerson = {
  id: string;
  name: string;
  /** A short clause spoken with the avatar's name ("on dock three"). */
  note?: string;
};

export type AvatarClusterProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The room, in stacking order; the first face sits on top. */
  people: ClusterPerson[];
  /** Names the cluster ("Coldbrook standup"). */
  label: string;
  /** Faces drawn before the overflow chip. @default 4 */
  max?: number;
  /** Who is speaking; that face lifts, rings and rises above its neighbours. */
  speakingId?: string | null;
  /** Fires from a face's click, Enter or Space. */
  onSelect?: (id: string) => void;
  /** Fires from the overflow chip. */
  onOverflowSelect?: () => void;
  className?: string;
};

/** How far faces overlap when the cluster is closed, and the gap when spread. */
const OVERLAP = -10;
const GAP = 4;

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** FNV-1a over the id: integer maths only, so the server and the browser agree. */
const hashOf = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
};

const round3 = (value: number): number => Number(value.toFixed(3));

/**
 * A rim signature instead of a photograph: two arcs whose lengths and rotation
 * come from the id, expressed as fractions of `pathLength={1}` so nothing has
 * to be measured and no trigonometry reaches an attribute.
 */
const rimOf = (id: string): { dash: string; offset: number } => {
  const hash = hashOf(id);
  const long = round3(0.12 + (hash % 5) * 0.04);
  const short = round3(0.06 + ((hash >> 3) % 4) * 0.03);
  const tail = round3(Math.max(0.08, 1 - long - 0.08 - short));
  return {
    dash: `${long} 0.08 ${short} ${tail}`,
    offset: round3(-(((hash >> 6) % 12) / 12)),
  };
};

/** The speaking ring's breath; a mirrored tween, never a spring. */
const BREATH = {
  duration: 1.4,
  ease: easings.move,
  repeat: Infinity,
  repeatType: "mirror",
} as const;

/** The count rolls the way it moved: `custom` carries the direction to the
    reading that is leaving, which its own last render no longer knows. */
const ROLL_MOVE = {
  enter: (direction: number) => ({ y: `${direction * 110}%`, opacity: 0 }),
  center: { y: "0%", opacity: 1 },
  exit: (direction: number) => ({
    y: `${direction * -110}%`,
    opacity: 0,
    transition: exitFor(),
  }),
};

const ROLL_STILL = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0, transition: exitFor() },
};

type FaceProps = {
  person: ClusterPerson;
  stopId: string;
  index: number;
  depth: number;
  spread: boolean;
  speaking: boolean;
  tabIndex: number;
  motionSafe: boolean;
  onSelect?: (id: string) => void;
  onFocusStop: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
};

function ClusterFace({
  person,
  stopId,
  index,
  depth,
  spread,
  speaking,
  tabIndex,
  motionSafe,
  onSelect,
  onFocusStop,
  onKeyDown,
}: FaceProps) {
  const rim = rimOf(person.id);
  const sentence = speaking
    ? `${person.name}, speaking`
    : person.note
      ? `${person.name}, ${person.note}`
      : person.name;

  return (
    <motion.li
      // The margin is what widens the cluster, so faces uncover each other
      // instead of sliding out from under a neighbour that stays put.
      initial={false}
      animate={{
        marginLeft: index === 0 ? 0 : spread ? GAP : OVERLAP,
        y: speaking && motionSafe ? -2 : 0,
        scale: speaking && motionSafe ? 1.06 : 1,
      }}
      transition={
        motionSafe
          ? { marginLeft: springs.glide, y: springs.snap, scale: springs.snap }
          : { duration: 0 }
      }
      style={{ zIndex: speaking ? depth + 1 : depth - index }}
      className="relative"
    >
      <button
        type="button"
        id={stopId}
        tabIndex={tabIndex}
        aria-label={sentence}
        onClick={() => {
          onFocusStop();
          onSelect?.(person.id);
        }}
        onFocus={onFocusStop}
        onKeyDown={onKeyDown}
        className="relative grid size-8 place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-card bg-surface-2"
        />
        <svg
          viewBox="0 0 32 32"
          aria-hidden
          className="absolute inset-0 size-full text-ink-3"
        >
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeOpacity="0.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={rim.dash}
            strokeDashoffset={rim.offset}
          />
        </svg>

        {speaking ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-0.5 rounded-full border-2 border-cobalt-bright"
            initial={motionSafe ? { opacity: 0, scale: 0.92 } : { opacity: 1 }}
            animate={
              motionSafe
                ? { opacity: [0.95, 0.35], scale: [1, 1.12] }
                : { opacity: 1, scale: 1 }
            }
            transition={motionSafe ? BREATH : { duration: durations.fast }}
          />
        ) : null}

        <span
          aria-hidden
          className={cn(
            "relative text-[11px] font-semibold transition-colors",
            speaking ? "text-cobalt-bright" : "text-ink-2",
          )}
        >
          {initialsOf(person.name)}
        </span>
      </button>
    </motion.li>
  );
}

/**
 * The room at a glance. Faces overlap by ten pixels until the cluster is
 * hovered or holds focus, and then every face's own margin glides apart on
 * `glide` so the cluster widens rather than the faces sliding out from under
 * each other. Each avatar is procedural: initials over a rim signature whose
 * arcs and rotation come from a hash of the id, expressed as fractions of
 * `pathLength` and rounded before they reach an attribute, so the server and the
 * browser draw the same face and no image is requested.
 *
 * The speaking member is a prop: that face lifts and scales on `snap`, rises
 * above its neighbours and takes a cobalt ring that breathes on a mirrored
 * tween. The overflow chip rolls its count in the direction the count moved —
 * up when the room grew, down when it shrank — with both readings stacked in
 * one clipped cell sized for the wider of the two, so the chip never jumps
 * width mid-roll. Faces are buttons under a roving tabindex, which is the
 * keyboard's path to the spread; Escape collapses it. Under reduced motion the
 * spread is instant, the ring holds steady and the count cross-fades.
 */
export function AvatarCluster({
  ref,
  people,
  label,
  max = 4,
  speakingId = null,
  onSelect,
  onOverflowSelect,
  className,
}: AvatarClusterProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const stopId = (key: string) => `${uid}-stop-${key}`;

  const shown = Math.max(1, max);
  const visible = people.slice(0, shown);
  const hidden = people.slice(shown);
  const overflow = hidden.length;

  const stops = [...visible.map((person) => person.id), "overflow"].slice(
    0,
    overflow > 0 ? visible.length + 1 : visible.length,
  );

  const [open, setOpen] = React.useState(false);
  const [activeKey, setActiveKey] = React.useState<string | undefined>(
    undefined,
  );
  const activeIndex = Math.max(
    0,
    stops.findIndex((key) => key === activeKey),
  );

  const focusAt = (index: number) => {
    const clamped = Math.min(stops.length - 1, Math.max(0, index));
    const key = stops[clamped];
    if (!key) return;
    setActiveKey(key);
    document.getElementById(stopId(key))?.focus();
  };

  const keyHandler =
    (index: number) => (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        focusAt(index + 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        focusAt(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusAt(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusAt(stops.length - 1);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };

  // The count's direction is frozen with the count itself, and the previous
  // reading is kept so the chip can be sized for the wider of the two.
  const [roll, setRoll] = React.useState(() => ({
    count: overflow,
    previous: overflow,
    direction: 1,
  }));
  if (roll.count !== overflow) {
    setRoll({
      count: overflow,
      previous: roll.count,
      direction: overflow > roll.count ? 1 : -1,
    });
  }

  const speaker = people.find((person) => person.id === speakingId);
  const [seen, setSeen] = React.useState(() => ({
    speakingId: speakingId ?? null,
    count: people.length,
    sentence: "",
  }));
  if (
    seen.speakingId !== (speakingId ?? null) ||
    seen.count !== people.length
  ) {
    const spoke = seen.speakingId !== (speakingId ?? null);
    setSeen({
      speakingId: speakingId ?? null,
      count: people.length,
      sentence: spoke
        ? speaker
          ? `${speaker.name} is speaking`
          : "No one is speaking"
        : `${people.length} in ${label}`,
    });
  }

  const digits = Math.max(
    String(roll.count).length,
    String(roll.previous).length,
  );

  return (
    <div ref={ref} className={cn("flex w-full items-center", className)}>
      <div
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={(event) => {
          // Collapsing under a keyboard user who opened the spread with focus
          // would take the faces back out from under them.
          if (!event.currentTarget.contains(document.activeElement)) {
            setOpen(false);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
        className="inline-flex py-1.5"
      >
        <ul
          role="list"
          aria-label={`${label}, ${people.length} ${
            people.length === 1 ? "person" : "people"
          }`}
          className="flex items-center"
        >
          {visible.map((person, index) => (
            <ClusterFace
              key={person.id}
              person={person}
              stopId={stopId(person.id)}
              index={index}
              depth={visible.length}
              spread={open}
              speaking={person.id === speakingId}
              tabIndex={stops[activeIndex] === person.id ? 0 : -1}
              motionSafe={motionSafe}
              onSelect={onSelect}
              onFocusStop={() => setActiveKey(person.id)}
              onKeyDown={keyHandler(index)}
            />
          ))}

          {overflow > 0 ? (
            <motion.li
              initial={false}
              animate={{
                marginLeft: visible.length === 0 ? 0 : open ? GAP : OVERLAP,
              }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              className="relative"
              style={{ zIndex: 0 }}
            >
              <button
                type="button"
                id={stopId("overflow")}
                tabIndex={stops[activeIndex] === "overflow" ? 0 : -1}
                title={hidden.map((person) => person.name).join(", ")}
                aria-label={`${overflow} more ${
                  overflow === 1 ? "person" : "people"
                } in ${label}`}
                onClick={() => {
                  setActiveKey("overflow");
                  onOverflowSelect?.();
                }}
                onFocus={() => setActiveKey("overflow")}
                onKeyDown={keyHandler(stops.length - 1)}
                className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-surface-2 font-mono text-[11px] font-medium text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span aria-hidden className="flex items-center leading-none">
                  +
                  <span
                    className="grid overflow-hidden"
                    style={{ width: `${digits}ch`, height: "1.1em" }}
                  >
                    <AnimatePresence initial={false} custom={roll.direction}>
                      <motion.span
                        key={roll.count}
                        custom={roll.direction}
                        variants={motionSafe ? ROLL_MOVE : ROLL_STILL}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={
                          motionSafe
                            ? springs.snap
                            : { duration: durations.fast }
                        }
                        className="col-start-1 row-start-1 flex items-center justify-center tabular-nums"
                      >
                        {roll.count}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </span>
              </button>
            </motion.li>
          ) : null}
        </ul>
      </div>

      {/* The list's name is read when the list is reached; this is what carries
          a change of speaker to a screen reader while it is already inside. */}
      <span role="status" aria-live="polite" className="sr-only">
        {seen.sentence}
      </span>
    </div>
  );
}
