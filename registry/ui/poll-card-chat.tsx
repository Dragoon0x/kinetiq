"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PollDelivery = "sent" | "delivered" | "read";

export type ChatPollOption = {
  id: string;
  label: string;
  /** Votes from everyone but this reader. */
  votes: number;
};

export type ChatPoll = {
  id: string;
  /** Own polls sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  question: string;
  options: ChatPollOption[];
  /** Printed under the card, already formatted. */
  time?: string;
  /** Read for own polls only. @default "sent" */
  delivery?: PollDelivery;
  /** Printed in the footer, already formatted — "closes 17:00". */
  closesAt?: string;
};

export type PollCardChatProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The poll message. */
  poll: ChatPoll;
  /** Controlled id of the reader's vote. */
  value?: string | null;
  /** Initial vote for uncontrolled usage. @default null */
  defaultValue?: string | null;
  /** Fires from the press or key that casts, moves or withdraws a vote. */
  onVote?: (id: string | null, previous: string | null) => void;
  /** Lets the reader move or withdraw a vote after casting it. @default true */
  allowChange?: boolean;
  /** Locks the rows and marks the winner. @default false */
  closed?: boolean;
  /** Formats every count and the total. @default en-US thousands */
  format?: (votes: number) => string;
  /** Names the sender in sentences. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const defaultFormat = (votes: number): string =>
  Math.round(votes).toLocaleString("en-US");

const round3 = (value: number): number => Number(value.toFixed(3));

const plural = (count: number) => (count === 1 ? "vote" : "votes");

const CHECK = "M2 8.5 5 11.5 10.5 5.5";
const CHECK_TRAIL = "M6.5 11.5 12 5.5";

const deliverySentence = (delivery: PollDelivery, peerName: string) =>
  ({
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
  })[delivery];

type RolledTotalProps = {
  value: number;
  format: (votes: number) => string;
  motionSafe: boolean;
};

/**
 * The total rolls to its new figure on `glide` — the same spring the bars
 * settle on, so the count and the shares arrive together. The formatted text is
 * a motion value handed straight to the span, so the roll re-renders nothing,
 * and `tabular-nums` pins the cell so moving digits cannot nudge the footer.
 */
function RolledTotal({ value, format, motionSafe }: RolledTotalProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(Math.round(latest)));

  React.useEffect(() => {
    // Reduced motion still reports the count; only the travel is dropped.
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <span className="font-mono tabular-nums">
      <span className="sr-only">{format(value)}</span>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  );
}

/**
 * A poll sent into a thread, where the room is visible from the first glance.
 * The counts are public before you vote, so every bar is already drawn — and
 * every one of them re-flows the moment you cast, because your vote joins the
 * total and drops everyone else's share. Bars take their new width on `glide`,
 * ζ0.98 and no overshoot, each delayed by `cascade()` so the re-flow reads top
 * to bottom rather than snapping all at once; moving a vote shrinks the row you
 * left while the row you joined grows, on the same spring. The leading rail is
 * one 3px bar travelling between rows on `snap` through a `useId`-prefixed
 * `layoutId`, so the lead is an object moving rather than two marks blinking,
 * and the total rolls beneath.
 *
 * The rows are a real `role="radiogroup"`: a roving tabindex where Up and Down
 * step without wrapping past the ends, Home and End jump, and Space or Enter
 * votes — arrows move focus without casting, because arrowing through a poll
 * should not spend your vote. With `allowChange`, voting again on your own row
 * withdraws it. Every row's `aria-label` carries its count and share, so nothing
 * rests on the bar's colour. Under reduced motion the bars still re-flow — a
 * share is information — on a tween with no cascade, and the rail swaps rows
 * without travelling.
 */
export function PollCardChat({
  ref,
  poll,
  value,
  defaultValue = null,
  onVote,
  allowChange = true,
  closed = false,
  format = defaultFormat,
  peerName = "Them",
  label = "Thread",
  className,
}: PollCardChatProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const questionId = `${baseId}-question`;
  const railId = `${baseId}-rail`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);
  const [say, setSay] = React.useState("");

  const chosen = value === undefined ? uncontrolled : value;
  const options = poll.options;

  const counts = options.map(
    (option) => option.votes + (chosen === option.id ? 1 : 0),
  );
  const total = counts.reduce((sum, count) => sum + count, 0);

  const leadIndex = counts.reduce(
    (best, count, index) => (count > (counts[best] ?? -1) ? index : best),
    0,
  );
  const leadOption = options[leadIndex];

  const chosenIndex = options.findIndex((option) => option.id === chosen);
  const tabbable = focusIndex ?? (chosenIndex >= 0 ? chosenIndex : 0);
  const stagger = cascade(options.length);

  const shareOf = (index: number) =>
    total > 0 ? (counts[index] ?? 0) / total : 0;

  const percentOf = (index: number) => Math.round(shareOf(index) * 100);

  const cast = (index: number) => {
    const option = options[index];
    if (!option || closed) return;
    const previous = chosen;
    const withdrawing = previous === option.id;
    if (withdrawing && !allowChange) return;
    const next = withdrawing ? null : option.id;
    if (value === undefined) setUncontrolled(next);
    onVote?.(next, previous);

    // The sentence is frozen here, at the vote, with the totals this press
    // produced — reading them back from a later render would speak the old ones.
    const after = options.map(
      (item) => item.votes + (next === item.id ? 1 : 0),
    );
    const sum = after.reduce((acc, count) => acc + count, 0);
    const leader = after.reduce(
      (best, count, i) => (count > (after[best] ?? -1) ? i : best),
      0,
    );
    const leadName = options[leader]?.label ?? "";
    const leadCount = after[leader] ?? 0;
    setSay(
      next === null
        ? `Vote withdrawn. ${leadName} leads with ${format(leadCount)} of ${format(sum)} ${plural(sum)}.`
        : `Voted for ${option.label}. ${leadName} leads with ${format(leadCount)} of ${format(sum)} ${plural(sum)}.`,
    );
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(options.length - 1, Math.max(0, index));
    const option = options[clamped];
    if (!option) return;
    setFocusIndex(clamped);
    document.getElementById(`${baseId}-row-${option.id}`)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const key = event.key;
    if (key === "ArrowDown" || key === "ArrowRight") focusAt(index + 1);
    else if (key === "ArrowUp" || key === "ArrowLeft") focusAt(index - 1);
    else if (key === "Home") focusAt(0);
    else if (key === "End") focusAt(options.length - 1);
    else if (key === " " || key === "Enter") cast(index);
    else return;
    event.preventDefault();
  };

  const own = poll.from === "me";
  const delivery = poll.delivery ?? "sent";
  const flow = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-3">
        <motion.li
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor() }}
          transition={{ duration: durations.base, ease: easings.enter }}
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
            <p id={questionId} className="text-[13px] leading-5 font-medium">
              {poll.question}
            </p>

            <div
              role="radiogroup"
              aria-labelledby={questionId}
              className="flex flex-col gap-1.5"
            >
              {options.map((option, index) => {
                const checked = chosen === option.id;
                const count = counts[index] ?? 0;
                const percent = percentOf(index);
                const leads = index === leadIndex && total > 0;
                return (
                  <button
                    key={option.id}
                    id={`${baseId}-row-${option.id}`}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-disabled={closed || undefined}
                    tabIndex={index === tabbable ? 0 : -1}
                    onClick={() => cast(index)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                    onFocus={() => setFocusIndex(index)}
                    aria-label={`${option.label}, ${format(count)} of ${format(total)} ${plural(total)}, ${percent} percent${closed && leads ? ", winner" : ""}`}
                    className={cn(
                      "relative flex h-9 w-full items-center gap-2 rounded-2 border border-current/15 px-2.5 text-left transition-[border-color,opacity]",
                      closed ? "cursor-default" : "hover:border-current/35",
                      // A closed poll keeps its winner lit and lets the rest
                      // fall back, so the result reads before the detail does.
                      closed && !leads ? "opacity-60" : "opacity-100",
                      focusRing,
                    )}
                  >
                    {/* The share, drawn behind the label. The bar takes its
                        width inside a track rather than scaling a box, so its
                        rounded end never distorts on the way. */}
                    <span
                      aria-hidden
                      className="absolute inset-[3px] overflow-hidden rounded-1"
                    >
                      <motion.span
                        className={cn(
                          "block h-full rounded-1",
                          checked ? "bg-current/25" : "bg-current/12",
                        )}
                        initial={false}
                        animate={{ width: `${round3(shareOf(index) * 100)}%` }}
                        transition={
                          motionSafe
                            ? { ...springs.glide, delay: index * stagger }
                            : flow
                        }
                      />
                    </span>

                    {leads ? (
                      motionSafe ? (
                        <motion.span
                          aria-hidden
                          layoutId={railId}
                          transition={springs.snap}
                          className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-current"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-current"
                        />
                      )
                    ) : null}

                    <span
                      aria-hidden
                      className={cn(
                        "relative grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                        checked ? "border-current" : "border-current/40",
                      )}
                    >
                      <motion.span
                        className="block size-2 rounded-full bg-current"
                        initial={false}
                        animate={{ scale: checked ? 1 : 0 }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    </span>

                    <span className="relative min-w-0 flex-1 truncate text-[12px] leading-4">
                      {option.label}
                    </span>
                    <span
                      aria-hidden
                      className="relative shrink-0 font-mono text-[10px] tabular-nums opacity-80"
                    >
                      {percent}%
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-[11px] opacity-80">
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <RolledTotal
                  value={total}
                  format={format}
                  motionSafe={motionSafe}
                />
                <span className="truncate">{plural(total)}</span>
              </span>
              <span className="shrink-0 truncate">
                {closed
                  ? `Closed · ${leadOption?.label ?? "no winner"} wins`
                  : chosen === null
                    ? (poll.closesAt ?? "Pick one")
                    : allowChange
                      ? "Press again to withdraw"
                      : "Vote cast"}
              </span>
            </div>
          </div>

          <span className="flex items-center gap-1.5 px-1">
            {poll.time ? (
              <span className="text-[11px] text-ink-3 tabular-nums">
                {poll.time}
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
        </motion.li>
      </ol>

      {/* Closing is a prop, not a press, so its sentence is derived here
          rather than pushed into state from an effect. */}
      <span role="status" aria-live="polite" className="sr-only">
        {closed
          ? `Poll closed. ${leadOption?.label ?? "No option"} wins with ${format(counts[leadIndex] ?? 0)} of ${format(total)} ${plural(total)}.`
          : say}
      </span>
    </div>
  );
}
