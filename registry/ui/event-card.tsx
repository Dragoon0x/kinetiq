"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RsvpStatus = "going" | "maybe" | "no";

export type EventDelivery = "sent" | "delivered" | "read";

export type EventAttendee = {
  id: string;
  name: string;
  /** Which run of the strip their tile sits in. */
  status: "going" | "maybe";
};

export type ChatEvent = {
  id: string;
  /** Own invitations sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  title: string;
  /** Already formatted — "Thursday, 09:30". */
  when: string;
  /** Already formatted — "Basinworks yard, bay four". */
  where: string;
  /** Printed under the card, already formatted. */
  time?: string;
  /** Read for own invitations only. @default "sent" */
  delivery?: EventDelivery;
};

export type EventCardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The invitation. */
  event: ChatEvent;
  /** Everyone but you. */
  attendees: EventAttendee[];
  /** Controlled RSVP. */
  value?: RsvpStatus | null;
  /** Initial RSVP for uncontrolled usage. @default null */
  defaultValue?: RsvpStatus | null;
  /** Fires from the press or key that answers, and from the press that withdraws. */
  onValueChange?: (
    status: RsvpStatus | null,
    previous: RsvpStatus | null,
  ) => void;
  /** Your display name — the initials on your tile. @default "You" */
  you?: string;
  /** How many the event holds. Omitted, the going count reads on its own. */
  capacity?: number;
  /** Names the sender in the delivery sentence. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  /** Holds the three controls; the card still reads. @default false */
  disabled?: boolean;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const CHECK = "M2 8.5 5 11.5 10.5 5.5";
const CHECK_TRAIL = "M6.5 11.5 12 5.5";

const ANSWERS: { value: RsvpStatus; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Can't" },
];

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

const joinNames = (names: string[]): string => {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
};

const peopleCount = (count: number) =>
  `${count} ${count === 1 ? "person" : "people"}`;

const deliverySentence = (delivery: EventDelivery, peerName: string) =>
  ({
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
  })[delivery];

/**
 * A count whose digit columns each take their new position on `snap` — one
 * crisp overshoot, ten faces per column, so a change of tens never nudges the
 * row. Hidden from assistive technology because the chip already carries the
 * figure in real text.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // number gains a digit and only the new column mounts.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
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

type TileProps = {
  name: string;
  tone: "going" | "maybe" | "parked";
  mine?: boolean;
  motionSafe: boolean;
};

/**
 * A tile is procedural — initials in the bubble's own ink, so it reads on an
 * own message and a received one alike, and its run is told by fill and edge
 * rather than by a colour a reader might not see.
 */
function Tile({ name, tone, mine = false, motionSafe }: TileProps) {
  return (
    <motion.li
      layout={motionSafe}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
        tone === "going" && "bg-current/18",
        tone === "maybe" && "border border-current/40",
        tone === "parked" &&
          "border border-dashed border-current/40 opacity-70",
        mine && "ring-1 ring-current/60",
      )}
    >
      <span aria-hidden>{initialsOf(name)}</span>
      <span className="sr-only">{name}</span>
    </motion.li>
  );
}

/**
 * An invitation sent into a thread, answered in the room rather than filed
 * away. Your tile is one object: it waits at the end of the strip behind a
 * dashed edge until you answer, and choosing *moves* it — motion reorders the
 * same node into the going run or the maybe run on `glide`, ζ0.98 and no
 * overshoot, because a person joining a list is a layout shift and not a pop.
 * The going count rolls to its new figure on `snap`, each column ten faces tall
 * so a change of tens cannot nudge the row, and declining rolls it back down.
 *
 * Everyone lives in one strip rather than two lists, so an answer never changes
 * the card's height, and the tiles are procedural: initials in the bubble's own
 * ink, their run told by fill and edge rather than by colour. With `capacity`
 * set the chip reads "5 of 8 going" and Going locks with a sentence once the
 * list fills.
 *
 * The three controls are a real radio group: a roving tabindex where Left and
 * Right move and select without wrapping past the ends, Home and End jump, and
 * pressing the answer you already gave withdraws it. Every control carries an
 * `aria-label` sentence with the count in it and the strip's names are real
 * text, so nothing rests on a fill. Under reduced motion the tile does not
 * travel — it is simply in its new place — and the count still changes, because
 * a guest list is information.
 */
export function EventCard({
  ref,
  event,
  attendees,
  value,
  defaultValue = null,
  onValueChange,
  you = "You",
  capacity,
  peerName = "Them",
  label = "Thread",
  disabled = false,
  className,
}: EventCardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;

  const [uncontrolled, setUncontrolled] = React.useState<RsvpStatus | null>(
    defaultValue,
  );
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);
  const [say, setSay] = React.useState("");

  const chosen = value === undefined ? uncontrolled : value;

  const goingOthers = attendees.filter((one) => one.status === "going");
  const maybeOthers = attendees.filter((one) => one.status === "maybe");
  const going = goingOthers.length + (chosen === "going" ? 1 : 0);
  const maybes = maybeOthers.length + (chosen === "maybe" ? 1 : 0);
  const full = capacity !== undefined && going >= capacity;
  const parked = chosen === null || chosen === "no";

  const chosenIndex = ANSWERS.findIndex((answer) => answer.value === chosen);
  const tabbable = focusIndex ?? (chosenIndex >= 0 ? chosenIndex : 0);

  const placesPhrase = (count: number) =>
    capacity === undefined
      ? `${peopleCount(count)} going.`
      : `${count} of ${capacity} places taken.`;

  const select = (index: number) => {
    const answer = ANSWERS[index];
    if (!answer || disabled) return;
    const previous = chosen;
    const withdrawing = previous === answer.value;
    const next = withdrawing ? null : answer.value;

    if (
      next === "going" &&
      capacity !== undefined &&
      goingOthers.length >= capacity
    ) {
      setSay(`The list is full, ${capacity} of ${capacity} places taken.`);
      return;
    }

    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next, previous);

    // Frozen here, with the count this press produced: reading it back from a
    // later render would speak the figure the press replaced.
    const tail = placesPhrase(goingOthers.length + (next === "going" ? 1 : 0));
    setSay(
      next === null
        ? `Answer withdrawn. ${tail}`
        : next === "going"
          ? `You are going. ${tail}`
          : next === "maybe"
            ? `You are a maybe. ${tail}`
            : `You cannot come. ${tail}`,
    );
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(ANSWERS.length - 1, Math.max(0, index));
    const answer = ANSWERS[clamped];
    if (!answer) return;
    setFocusIndex(clamped);
    document.getElementById(`${baseId}-answer-${answer.value}`)?.focus();
    // The radio-group convention: arrows move and select together.
    if (answer.value !== chosen) select(clamped);
  };

  const onKeyDown = (keyEvent: React.KeyboardEvent, index: number) => {
    const key = keyEvent.key;
    if (key === "ArrowRight" || key === "ArrowDown") focusAt(index + 1);
    else if (key === "ArrowLeft" || key === "ArrowUp") focusAt(index - 1);
    else if (key === "Home") focusAt(0);
    else if (key === "End") focusAt(ANSWERS.length - 1);
    else if (key === " ") select(index);
    else return;
    keyEvent.preventDefault();
  };

  // One flat array with stable keys: your tile keeps its identity as it moves
  // between the runs, which is what lets motion animate the move rather than
  // unmount one tile and mount another.
  const strip: React.ReactNode[] = [];
  for (const one of goingOthers) {
    strip.push(
      <Tile
        key={one.id}
        name={one.name}
        tone="going"
        motionSafe={motionSafe}
      />,
    );
  }
  if (chosen === "going") {
    strip.push(
      <Tile key="you" name={you} tone="going" mine motionSafe={motionSafe} />,
    );
  }
  if (maybeOthers.length > 0 || chosen === "maybe") {
    strip.push(
      <li key="rule-maybe" aria-hidden className="h-4 w-px bg-current/25" />,
    );
  }
  for (const one of maybeOthers) {
    strip.push(
      <Tile
        key={one.id}
        name={one.name}
        tone="maybe"
        motionSafe={motionSafe}
      />,
    );
  }
  if (chosen === "maybe") {
    strip.push(
      <Tile key="you" name={you} tone="maybe" mine motionSafe={motionSafe} />,
    );
  }
  if (parked) {
    strip.push(
      <li key="rule-parked" aria-hidden className="h-4 w-px bg-current/25" />,
    );
    strip.push(
      <Tile key="you" name={you} tone="parked" mine motionSafe={motionSafe} />,
    );
  }

  const goingNames = [
    ...goingOthers.map((one) => one.name),
    ...(chosen === "going" ? ["you"] : []),
  ];
  const maybeNames = [
    ...maybeOthers.map((one) => one.name),
    ...(chosen === "maybe" ? ["you"] : []),
  ];
  const goingLine =
    goingNames.length === 0
      ? "Nobody has said yes yet."
      : `${joinNames(goingNames)} ${goingNames.length === 1 ? "is" : "are"} going.`;
  const maybeLine =
    maybeNames.length === 0 ? "" : `${joinNames(maybeNames)} might come.`;

  const own = event.from === "me";
  const delivery = event.delivery ?? "sent";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-1">
        <li
          className={cn(
            "flex flex-col gap-1",
            own ? "items-end" : "items-start",
          )}
        >
          <div
            className={cn(
              "flex w-full max-w-[92%] flex-col gap-2.5 rounded-3 px-3 py-2.5",
              own
                ? "rounded-br-1 bg-primary text-primary-foreground"
                : "rounded-bl-1 bg-surface-2 text-foreground",
            )}
          >
            <div className="flex flex-col gap-0.5">
              <p id={titleId} className="text-[13px] leading-5 font-medium">
                {event.title}
              </p>
              <p className="text-[12px] leading-4 opacity-80">{event.when}</p>
              <p className="text-[12px] leading-4 opacity-80">{event.where}</p>
            </div>

            <div className="flex items-center gap-2 border-t border-current/15 pt-2.5">
              {/* One run of tiles, so an answer is a reorder rather than a jump
                  between two lists that would change the card's height. */}
              <ul
                role="list"
                className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
              >
                {strip}
              </ul>

              <span className="flex h-6 shrink-0 items-center rounded-full bg-current/10 px-2 font-mono text-[11px] font-medium">
                <span className="sr-only">
                  {capacity === undefined
                    ? `${going} going.`
                    : `${going} of ${capacity} going.`}
                </span>
                <span aria-hidden className="flex items-center">
                  <RollingNumber
                    value={String(going)}
                    motionSafe={motionSafe}
                  />
                  {capacity === undefined ? " going" : `/${capacity} going`}
                </span>
              </span>
            </div>

            <div className="flex flex-col gap-0.5 text-[12px] leading-4 opacity-80">
              <p>{goingLine}</p>
              {maybeLine === "" ? null : <p>{maybeLine}</p>}
            </div>

            <div
              role="radiogroup"
              aria-labelledby={titleId}
              className="flex items-stretch gap-1.5"
            >
              {ANSWERS.map((answer, index) => {
                const checked = chosen === answer.value;
                const locked = answer.value === "going" && full && !checked;
                const sentence =
                  answer.value === "going"
                    ? locked
                      ? `Going. The list is full, ${capacity} of ${capacity} places taken.`
                      : `Going. ${placesPhrase(going)}`
                    : answer.value === "maybe"
                      ? `Maybe. ${maybes === 1 ? "1 person might come." : `${maybes} people might come.`}`
                      : "Cannot come.";
                return (
                  <button
                    key={answer.value}
                    id={`${baseId}-answer-${answer.value}`}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-disabled={locked || undefined}
                    disabled={disabled}
                    tabIndex={index === tabbable ? 0 : -1}
                    onClick={() => select(index)}
                    onKeyDown={(keyEvent) => onKeyDown(keyEvent, index)}
                    onFocus={() => setFocusIndex(index)}
                    aria-label={sentence}
                    className={cn(
                      "flex h-9 min-w-0 flex-1 items-center justify-center rounded-2 border px-2 text-[12px] font-medium transition-colors disabled:opacity-50",
                      checked
                        ? "border-current/70 bg-current/15"
                        : "border-current/20 hover:border-current/45",
                      locked && "opacity-55",
                      focusRing,
                    )}
                  >
                    <motion.span
                      initial={false}
                      animate={{ opacity: checked ? 1 : 0.85 }}
                      transition={{
                        duration: durations.fast,
                        ease: easings.enter,
                      }}
                    >
                      {answer.label}
                    </motion.span>
                  </button>
                );
              })}
            </div>
          </div>

          <span className="flex items-center gap-1.5 px-1">
            {event.time ? (
              <span className="text-[11px] text-ink-3 tabular-nums">
                {event.time}
              </span>
            ) : null}
            {own ? (
              <span
                role="img"
                aria-label={deliverySentence(delivery, peerName)}
                className={cn(
                  "inline-flex size-3.5 items-center justify-center",
                  delivery === "read" ? "text-cobalt-bright" : "text-ink-3",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                >
                  <path d={CHECK} />
                  {delivery === "sent" ? null : <path d={CHECK_TRAIL} />}
                </svg>
              </span>
            ) : null}
          </span>
        </li>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {say}
      </span>
    </div>
  );
}
