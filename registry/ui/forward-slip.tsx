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

export type SlipSource = {
  threadId: string;
  threadName: string;
  messageId: string;
  author: string;
  /** Clock time of the original as `HH:mm`. */
  at: string;
};

export type SlipMessage = {
  id: string;
  author: string;
  text: string;
  /** Clock time as `HH:mm`. */
  at: string;
  mine?: boolean;
  /** Where this message came from; renders the stamp. */
  forwardedFrom?: SlipSource;
};

export type SlipThread = {
  id: string;
  name: string;
  messages: SlipMessage[];
};

export type SlipTarget = { threadId: string; messageId: string };

export type ForwardSlipProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The visible thread. Swapping its id cross-fades the list. */
  thread: SlipThread;
  /** A message id to focus once this thread mounts; the destination of a jump. */
  arriveAt?: string;
  /** Fires from pressing a stamp's source name. */
  onJump?: (target: SlipTarget) => void;
  /** Names the thread for assistive technology. @default thread.name */
  label?: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

type ListProps = {
  thread: SlipThread;
  arriveAt?: string;
  onJump?: (target: SlipTarget) => void;
  motionSafe: boolean;
};

/**
 * One thread's list. It is its own component so that a thread swap mounts a
 * fresh list: everything present at mount is settled history, and only a
 * message added to this thread afterwards rises and gets its stamp slid in.
 */
function SlipList({ thread, arriveAt, onJump, motionSafe }: ListProps) {
  const itemsRef = React.useRef(new Map<string, HTMLLIElement>());
  const [settled] = React.useState(
    () => new Set(thread.messages.map((message) => message.id)),
  );

  // A jump needs somewhere to land: the original message takes focus without
  // scrolling the page, so a reader arrives on it rather than at the top.
  React.useEffect(() => {
    if (arriveAt === undefined) return;
    itemsRef.current.get(arriveAt)?.focus({ preventScroll: true });
  }, [arriveAt]);

  const fade = { duration: durations.fast } as const;
  // The lift is a variant so the underline, a child, draws on the same
  // hover and focus without its own handlers.
  const lift = motionSafe
    ? { rest: { y: 0 }, lift: { y: -2 } }
    : { rest: { y: 0 }, lift: { y: 0 } };
  const rule = motionSafe
    ? { rest: { scaleX: 0 }, lift: { scaleX: 1 } }
    : { rest: { opacity: 0 }, lift: { opacity: 1 } };

  return (
    <ol role="list" className="flex flex-col gap-1.5">
      {thread.messages.map((message) => {
        const mine = message.mine === true;
        const fresh = !settled.has(message.id);
        const source = message.forwardedFrom;
        return (
          <li
            key={message.id}
            ref={(node) => {
              if (node) itemsRef.current.set(message.id, node);
              else itemsRef.current.delete(message.id);
            }}
            tabIndex={-1}
            className={cn(
              "flex items-end gap-2 rounded-3",
              mine ? "flex-row-reverse" : "flex-row",
              focusRing,
            )}
          >
            {!mine && (
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-2"
              >
                {initialsOf(message.author)}
              </span>
            )}
            <div
              className={cn(
                "flex max-w-[82%] min-w-0 flex-col",
                mine ? "items-end" : "items-start",
              )}
            >
              {source && (
                <motion.div
                  className={cn(
                    "mb-1 flex max-w-full items-center gap-1.5 px-1",
                    mine ? "flex-row-reverse" : "flex-row",
                  )}
                  initial={
                    fresh
                      ? motionSafe
                        ? {
                            opacity: 0,
                            x: mine ? distances.shift : -distances.shift,
                          }
                        : { opacity: 0 }
                      : false
                  }
                  animate={{ opacity: 1, x: 0 }}
                  transition={
                    motionSafe
                      ? // The stamp lands after the bubble has risen, on
                        // recoil — a stamp is pressed on, it does not glide.
                        {
                          ...springs.recoil,
                          delay: 0.12,
                          opacity: { ...fade, delay: 0.12 },
                        }
                      : fade
                  }
                >
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      "size-3 shrink-0 text-ink-3",
                      mine && "-scale-x-100",
                    )}
                  >
                    <path d="M9 4.5 12.5 8 9 11.5M12.5 8H6.5A3 3 0 0 0 3.5 11v1" />
                  </svg>
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    Forwarded from
                  </span>
                  <motion.button
                    type="button"
                    onClick={() =>
                      onJump?.({
                        threadId: source.threadId,
                        messageId: source.messageId,
                      })
                    }
                    aria-label={`Jump to ${source.threadName}, ${source.author}'s message at ${source.at}`}
                    initial="rest"
                    whileHover="lift"
                    whileFocus="lift"
                    variants={lift}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                    className={cn(
                      "relative min-w-0 truncate rounded-1 font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase transition-colors hover:text-foreground",
                      focusRing,
                    )}
                  >
                    {source.threadName}
                    <motion.span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-px bg-current"
                      style={{ originX: 0 }}
                      variants={rule}
                      transition={motionSafe ? springs.flick : fade}
                    />
                  </motion.button>
                </motion.div>
              )}
              <motion.div
                className={cn(
                  "rounded-3 px-3 py-2 text-sm leading-snug",
                  mine
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-foreground",
                )}
                initial={
                  fresh
                    ? motionSafe
                      ? { opacity: 0, y: distances.step }
                      : { opacity: 0 }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : fade
                }
              >
                <span className="sr-only">
                  {message.author}, {message.at}.{" "}
                </span>
                {message.text}
                <span
                  aria-hidden
                  className="ml-2 font-mono text-[10px] tabular-nums opacity-70"
                >
                  {message.at}
                </span>
              </motion.div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A thread where a message can have come from somewhere else. A forwarded
 * message rises on `glide` and then its stamp — "Forwarded from" and the
 * source thread's name — slides in from the bubble's outer edge on `recoil`,
 * because a stamp is pressed on and lands with ζ0.53's two bounces rather
 * than gliding. The source name is a button: hovering or focusing it lifts
 * the name two pixels on `snap` and draws a rule under it on `flick`, and
 * pressing jumps — `onJump` reports the source, the host swaps the thread in,
 * the list cross-fades on a tween and the original message takes focus so
 * the jump has a real destination.
 *
 * The forwarded state is visible text, never colour alone, and one polite
 * sentence names the source when a stamped message arrives or a jump lands.
 * Under reduced motion the stamp fades in place, the name changes colour
 * instead of lifting, and the swap is the same cross-fade.
 */
export function ForwardSlip({
  ref,
  thread,
  arriveAt,
  onJump,
  label,
  className,
}: ForwardSlipProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const landed =
    arriveAt !== undefined
      ? thread.messages.find((message) => message.id === arriveAt)
      : undefined;
  const latest = thread.messages[thread.messages.length - 1];
  const announcement = landed
    ? `${thread.name}, landed on ${landed.author}'s message at ${landed.at}`
    : latest
      ? latest.forwardedFrom
        ? `Forwarded from ${latest.forwardedFrom.threadName}, ${latest.forwardedFrom.author}, ${latest.forwardedFrom.at}: ${latest.text}`
        : `${latest.author}: ${latest.text}`
      : "";
  const count = thread.messages.length;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <span id={labelId} className="sr-only">
        {label ?? thread.name}
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={thread.id}
          className="flex flex-col gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          <div
            aria-hidden
            className="flex h-5 items-center gap-2 px-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            <span className="min-w-0 truncate text-ink-2">{thread.name}</span>
            <span className="shrink-0 tabular-nums">
              · {count} {count === 1 ? "message" : "messages"}
            </span>
          </div>
          <SlipList
            thread={thread}
            arriveAt={arriveAt}
            onJump={onJump}
            motionSafe={motionSafe}
          />
        </motion.div>
      </AnimatePresence>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
