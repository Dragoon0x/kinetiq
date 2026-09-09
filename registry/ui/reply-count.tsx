"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ReplyEntry = {
  id: string;
  name: string;
  /** When they replied, already formatted. */
  at: string;
  /** Derived from the name when omitted. */
  initials?: string;
};

export type ReplyCountProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread's replies, oldest first. Append to it as they land. */
  replies: ReplyEntry[];
  /** Controlled: how many replies you have already read. */
  seenCount?: number;
  /** Initial read count for uncontrolled usage. @default 0 */
  defaultSeenCount?: number;
  /** Fires when opening the thread marks everything read. */
  onSeenCountChange?: (count: number) => void;
  /** Fires from a press or Enter with the reply count. */
  onOpen?: (count: number) => void;
  /** The parent message's body. */
  text: string;
  author: string;
  /** The parent's sent time, already formatted. */
  time?: string;
  /** Names the thread list. @default "Thread" */
  label?: string;
  /** What the badge reads with no replies yet. @default "Reply" */
  emptyLabel?: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;
const TONES = [
  "bg-cobalt-wash text-cobalt-bright",
  "bg-surface-2 text-ink-2",
  "bg-accent text-accent-foreground",
] as const;

const initialsOf = (reply: ReplyEntry) =>
  reply.initials ??
  reply.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

/** A stable tone per person, so the same face keeps the same disc. */
const toneOf = (id: string) => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return TONES[hash % TONES.length] ?? "bg-surface-2 text-ink-2";
};

type Beat = {
  ids: string;
  count: number;
  seq: number;
  /** True only when the list actually grew: a removal must not celebrate. */
  grew: boolean;
  message: string;
};

const arrivalOf = (
  previousCount: number,
  replies: ReplyEntry[],
  last: ReplyEntry | undefined,
): string => {
  const gained = replies.length - previousCount;
  if (gained <= 0 || !last) return "";
  const total = `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`;
  return gained === 1
    ? `${last.name} replied, ${total}`
    : `${gained} new replies, last from ${last.name}, ${total}`;
};

/**
 * Replies, and the last one's face. Under a message hangs its thread badge:
 * the last replier's disc, the count, and the time it landed. An arrival bumps
 * the badge from 1.06 back to rest on `recoil` — exactly two keyframes, driven
 * imperatively, because a spring silently drops anything in between — while
 * the disc and the number swap on `snap`, each pair stacked in one grid cell
 * so the outgoing face cross-fades under the incoming one instead of being
 * pushed sideways. Replies past the ones you have read ride in a chip that
 * opens out of the badge's edge on `snap` and collapses when you open the
 * thread.
 *
 * The badge is a single button whose name is a sentence — count, unread, last
 * replier and time — so nothing here is carried by colour or by a glyph.
 * Under reduced motion nothing bumps or slides: the disc and the number
 * cross-fade in place and the chip appears at full width, because a reply
 * landing is information.
 */
export function ReplyCount({
  ref,
  replies,
  seenCount,
  defaultSeenCount,
  onSeenCountChange,
  onOpen,
  text,
  author,
  time,
  label = "Thread",
  emptyLabel = "Reply",
  className,
}: ReplyCountProps) {
  const motionSafe = useMotionSafe();
  const count = replies.length;
  const last = count > 0 ? replies[count - 1] : undefined;

  const [uncontrolledSeen, setUncontrolledSeen] = React.useState(
    () => defaultSeenCount ?? 0,
  );
  const seen = Math.min(count, Math.max(0, seenCount ?? uncontrolledSeen));
  const unread = Math.max(0, count - seen);

  // The sentence is frozen at the moment the reply lands, so a host that
  // rewrites the list later cannot make the region repeat a past arrival.
  const ids = replies.map((reply) => reply.id).join(",");
  const [beat, setBeat] = React.useState<Beat>(() => ({
    ids,
    count,
    seq: 0,
    grew: false,
    message: "",
  }));
  if (beat.ids !== ids) {
    setBeat({
      ids,
      count,
      seq: beat.seq + 1,
      grew: count > beat.count,
      message: arrivalOf(beat.count, replies, last),
    });
  }

  const grew = beat.seq > 0 && beat.grew;
  const bumpRef = React.useRef<HTMLSpanElement | null>(null);
  React.useEffect(() => {
    const node = bumpRef.current;
    if (!node || !motionSafe || !grew) return;
    // A wide badge takes a small bump: 1.06 is a nudge, 1.25 would be a jump.
    const bump = animate(node, { scale: [1.06, 1] }, springs.recoil);
    return () => bump.stop();
  }, [beat.seq, grew, motionSafe]);

  const open = () => {
    if (seenCount === undefined) setUncontrolledSeen(count);
    onSeenCountChange?.(count);
    onOpen?.(count);
  };

  const name =
    count === 0
      ? `No replies yet. ${emptyLabel}.`
      : `${count} ${count === 1 ? "reply" : "replies"}${
          unread > 0 ? `, ${unread} new` : ""
        }${last ? `, last from ${last.name} at ${last.at}` : ""}. Open thread.`;

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

          <button
            type="button"
            aria-label={name}
            onClick={open}
            className={cn(
              "rounded-full border border-hairline-strong bg-surface-1 outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              "mt-0.5 transition-colors hover:bg-accent",
            )}
          >
            {/* The bump target is a plain span, so the imperative scale and any
                declarative animation never write the same style. */}
            <span
              ref={bumpRef}
              className="flex h-8 items-center gap-1.5 py-1 pr-2.5 pl-1"
            >
              <span
                aria-hidden
                className="relative grid size-6 shrink-0 place-items-center"
              >
                <AnimatePresence initial={false}>
                  {last ? (
                    <motion.span
                      key={last.id}
                      className={cn(
                        "col-start-1 row-start-1 grid size-6 place-items-center rounded-full border border-surface-0 text-[9px] leading-none font-semibold",
                        toneOf(last.id),
                      )}
                      initial={
                        motionSafe
                          ? { opacity: 0, y: distances.step }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={
                        motionSafe
                          ? {
                              opacity: 0,
                              y: -distances.step,
                              transition: exitFor(durations.fast),
                            }
                          : { opacity: 0, transition: exitFor(durations.fast) }
                      }
                      transition={motionSafe ? springs.snap : FADE}
                    >
                      {initialsOf(last)}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="none"
                      className="col-start-1 row-start-1 grid size-6 place-items-center rounded-full border border-dashed border-hairline-strong text-ink-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={FADE}
                    >
                      <svg viewBox="0 0 16 16" className="size-3">
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.6 4.2 5.8 8l3.8 3.8M5.8 8h4.4"
                        />
                      </svg>
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>

              <span
                aria-hidden
                className="flex items-baseline gap-1 text-xs font-medium text-foreground"
              >
                {/* Both numbers share one grid cell: the outgoing count slides
                    out under the incoming one rather than shoving it along. */}
                <span className="relative grid justify-items-end tabular-nums">
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={count}
                      className="col-start-1 row-start-1"
                      initial={
                        motionSafe
                          ? { opacity: 0, y: distances.nudge }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={
                        motionSafe
                          ? {
                              opacity: 0,
                              y: -distances.nudge,
                              transition: exitFor(durations.fast),
                            }
                          : { opacity: 0, transition: exitFor(durations.fast) }
                      }
                      transition={motionSafe ? springs.snap : FADE}
                    >
                      {count === 0 ? "" : count}
                    </motion.span>
                  </AnimatePresence>
                </span>
                {count === 0 ? emptyLabel : count === 1 ? "reply" : "replies"}
              </span>

              {last ? (
                <span
                  aria-hidden
                  className="text-[11px] text-ink-3 tabular-nums"
                >
                  {last.at}
                </span>
              ) : null}

              <AnimatePresence initial={false}>
                {unread > 0 ? (
                  <motion.span
                    key="unread"
                    aria-hidden
                    className="overflow-hidden"
                    initial={
                      motionSafe ? { width: 0, opacity: 0 } : { opacity: 0 }
                    }
                    animate={
                      motionSafe
                        ? { width: "auto", opacity: 1 }
                        : { opacity: 1 }
                    }
                    exit={
                      motionSafe
                        ? {
                            width: 0,
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }
                        : { opacity: 0, transition: exitFor(durations.fast) }
                    }
                    transition={motionSafe ? springs.snap : FADE}
                  >
                    <span className="ml-0.5 flex h-5 items-center rounded-full bg-cobalt-wash px-1.5 text-[10px] font-semibold whitespace-nowrap text-cobalt-bright tabular-nums">
                      {unread} new
                    </span>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </span>
          </button>
        </li>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.message}
      </span>
    </div>
  );
}
