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

export type StackMessage = {
  id: string;
  /** Display name of the sender; runs are cut wherever it changes. */
  sender: string;
  text: string;
  /** Printed under the last bubble of a run, already formatted. */
  time?: string;
};

export type GroupStackProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: StackMessage[];
  /** The sender rendered as own messages, right-aligned, without a disc. @default "You" */
  self?: string;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;
const TONES = [
  "bg-cobalt-wash text-cobalt-bright",
  "bg-surface-2 text-ink-2",
  "bg-accent text-accent-foreground",
] as const;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

/** A stable tone per sender so the same person keeps the same disc. */
const toneOf = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return TONES[hash % TONES.length] ?? "bg-surface-2 text-ink-2";
};

type Placed = StackMessage & {
  own: boolean;
  first: boolean;
  last: boolean;
  run: number;
};

/** Cuts the thread into runs: a run is one sender's consecutive messages. */
const place = (messages: StackMessage[], self: string): Placed[] => {
  let run = -1;
  return messages.map((message, index) => {
    const before = messages[index - 1];
    const after = messages[index + 1];
    const first = before?.sender !== message.sender;
    if (first) run += 1;
    return {
      ...message,
      own: message.sender === self,
      first,
      last: after?.sender !== message.sender,
      run,
    };
  });
};

/**
 * Same sender, stacked tight. Consecutive messages from one sender form a
 * run: the gap inside a run is 2px and between runs 12px, so a bubble that
 * joins a run tightens against the one above while the corners between them
 * lose their radius. The run's disc renders once, on its last message, under
 * a shared `layoutId`, so as the run grows the disc slides down on `glide` to
 * the newest bubble; the name shows on the first message only. A new sender
 * opens the gap and mounts a fresh disc with a pop on `snap`, and every
 * arriving bubble rises from `distances.step` on `snap`. The list's height is
 * measured so the frame glides taller inside a capped scroll that follows the
 * newest bubble.
 *
 * Continuation messages carry a hidden sender prefix so each item reads with
 * its sender, discs are decoration, and a status region speaks each arrival
 * once. Under reduced motion gaps swap, the disc re-renders in place, and
 * bubbles fade in.
 */
export function GroupStack({
  ref,
  messages,
  self = "You",
  label,
  className,
}: GroupStackProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const placed = place(messages, self);

  const listRef = React.useRef<HTMLOListElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = listRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Pin the scroll to the newest bubble; while the frame is still gliding
  // taller the browser clamps this back, which reads as the thread rising.
  const count = messages.length;
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [count]);

  // Speak each arrival once. Adjusted during render so the sentence belongs
  // to the render that brought the message.
  const [seen, setSeen] = React.useState<{ ids: string[]; message: string }>(
    () => ({ ids: messages.map((message) => message.id), message: "" }),
  );
  const fresh = messages.filter((message) => !seen.ids.includes(message.id));
  if (fresh.length > 0 || seen.ids.length !== count) {
    const latest = fresh[fresh.length - 1];
    setSeen({
      ids: messages.map((message) => message.id),
      message: latest ? `${latest.sender}: ${latest.text}` : seen.message,
    });
  }

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <motion.div
        ref={scrollRef}
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
        className="max-h-80 overflow-x-hidden overflow-y-auto"
      >
        <ol
          ref={listRef}
          role="list"
          aria-label={label}
          className="flex flex-col px-0.5 pb-0.5"
        >
          <AnimatePresence initial={false}>
            {placed.map((message, index) => (
              <motion.li
                key={message.id}
                layout={motionSafe ? "position" : false}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { layout: springs.glide, y: springs.snap, opacity: FADE }
                    : FADE
                }
                className={cn(
                  "flex items-end gap-2",
                  message.own && "flex-row-reverse",
                  // The tightened gap is the whole point: a run reads as one
                  // breath, a new sender as a new paragraph.
                  index === 0 ? "mt-0" : message.first ? "mt-3" : "mt-0.5",
                )}
              >
                {message.own ? null : (
                  <span className="relative size-6 shrink-0">
                    {message.last ? (
                      <motion.span
                        aria-hidden
                        layoutId={
                          motionSafe
                            ? `${baseId}-disc-${message.run}`
                            : undefined
                        }
                        // A run of one is a fresh sender, so the disc pops;
                        // a longer run hands the disc down instead, and the
                        // shared layoutId carries it without an entrance.
                        initial={
                          message.first && motionSafe
                            ? { opacity: 0, scale: 0.6 }
                            : false
                        }
                        animate={{ opacity: 1, scale: 1 }}
                        transition={
                          motionSafe
                            ? { layout: springs.glide, ...springs.snap }
                            : { duration: 0 }
                        }
                        className={cn(
                          "absolute inset-0 grid place-items-center rounded-full text-[10px] leading-none font-semibold",
                          toneOf(message.sender),
                        )}
                      >
                        {initialsOf(message.sender)}
                      </motion.span>
                    ) : null}
                  </span>
                )}

                <div
                  className={cn(
                    "flex max-w-[82%] min-w-0 flex-col gap-1",
                    message.own ? "items-end" : "items-start",
                  )}
                >
                  {message.first && !message.own ? (
                    <span className="px-1 text-[11px] font-medium text-ink-2">
                      {message.sender}
                    </span>
                  ) : null}
                  <div
                    className={cn(
                      "rounded-3 px-3 py-2 text-sm leading-snug wrap-break-word transition-[border-radius] duration-200",
                      message.own
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-2 text-foreground",
                      !message.first &&
                        (message.own ? "rounded-tr-1" : "rounded-tl-1"),
                      !message.last &&
                        (message.own ? "rounded-br-1" : "rounded-bl-1"),
                    )}
                  >
                    {message.first && !message.own ? null : (
                      <span className="sr-only">
                        {message.own ? "You" : message.sender}:{" "}
                      </span>
                    )}
                    {message.text}
                  </div>
                  {message.last && message.time ? (
                    <span className="px-1 text-[11px] text-ink-3 tabular-nums">
                      {message.time}
                    </span>
                  ) : null}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {seen.message}
      </span>
    </div>
  );
}
