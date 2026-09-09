"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TailMessage = {
  id: string;
  author: string;
  text: string;
  /** Clock time as `HH:mm`. */
  at: string;
  mine?: boolean;
};

export type BubbleTailProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread in order. */
  messages: TailMessage[];
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  className?: string;
};

/**
 * The tail in a 12×12 box that overlaps the bubble's corner by six pixels, so
 * the filled block behind the curve covers the corner and no seam shows. The
 * tucked shape keeps every command of the pointed one, which is what lets
 * motion interpolate between them.
 */
const TAIL = {
  left: {
    tucked: "M12 0 H6 C6 6 6 10 6 12 H12 Z",
    point: "M12 0 H6 C6 6 4 10 0 12 H12 Z",
  },
  right: {
    tucked: "M0 0 H6 C6 6 6 10 6 12 H0 Z",
    point: "M0 0 H6 C6 6 8 10 12 12 H0 Z",
  },
} as const;

/** The bubble radius, and the tighter corner a tail grows out of. */
const RADIUS = 10;
const TAIL_RADIUS = 4;

type Row = {
  message: TailMessage;
  /** Id of the run's first message; the tail's identity within the run. */
  run: string;
  first: boolean;
  last: boolean;
};

/**
 * Only the last message of a run wears the tail. Consecutive messages from
 * one sender form a run; the tail is one element per run with a shared
 * `layoutId`, so when a new message extends the run it hands off — travelling
 * from the old last bubble to the new one on `snap`, one crisp overshoot, its
 * path morphing from a tucked curve to the full point on the way — while the
 * old bubble's corner rounds back to the bubble radius on `glide`. A new
 * sender starts a new run with its own tail; the previous run keeps its own.
 *
 * The run boundary is carried by the printed name at the head of each run and
 * an sr-only sender on every bubble, never by the tail, which is decoration.
 * Under reduced motion the tail simply appears on the new last bubble on a
 * short fade and the corner swaps.
 */
export function BubbleTail({
  ref,
  messages,
  label = "Thread",
  className,
}: BubbleTailProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const rows: Row[] = [];
  let run = "";
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) continue;
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const first = previous === undefined || previous.author !== message.author;
    const last = next === undefined || next.author !== message.author;
    if (first) run = message.id;
    rows.push({ message, run, first, last });
  }

  // Everything on screen at mount is history and renders settled; only later
  // arrivals rise, and only a tail that moved morphs.
  const [settled] = React.useState(
    () => new Set(messages.map((message) => message.id)),
  );

  const latest = messages[messages.length - 1];
  const announcement = latest ? `${latest.author}: ${latest.text}` : "";
  const fade = { duration: durations.fast } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <ol role="list" aria-labelledby={labelId} className="flex flex-col gap-1">
        {rows.map(({ message, run, first, last }) => {
          const mine = message.mine === true;
          const fresh = !settled.has(message.id);
          const side = mine ? "right" : "left";
          const corner = last ? TAIL_RADIUS : RADIUS;
          return (
            <li
              key={message.id}
              className={cn(
                "flex flex-col",
                mine ? "items-end" : "items-start",
                first && "mt-2 first:mt-0",
              )}
            >
              {first && (
                <span
                  aria-hidden
                  className="mb-1 px-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  {message.author}
                </span>
              )}
              <motion.div
                className={cn(
                  "relative max-w-[82%] px-3 py-2 text-sm leading-snug",
                  mine
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-foreground",
                )}
                style={{
                  borderTopLeftRadius: RADIUS,
                  borderTopRightRadius: RADIUS,
                  borderBottomLeftRadius: mine ? RADIUS : undefined,
                  borderBottomRightRadius: mine ? undefined : RADIUS,
                }}
                initial={
                  fresh
                    ? motionSafe
                      ? { opacity: 0, y: distances.step }
                      : { opacity: 0 }
                    : false
                }
                animate={{
                  opacity: 1,
                  y: 0,
                  ...(mine
                    ? { borderBottomRightRadius: corner }
                    : { borderBottomLeftRadius: corner }),
                }}
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

                {last && (
                  <motion.span
                    aria-hidden
                    // Scoped to the run so two runs never share a tail, and
                    // dropped under reduced motion so nothing travels.
                    layoutId={motionSafe ? `${baseId}-tail-${run}` : undefined}
                    transition={motionSafe ? springs.snap : fade}
                    initial={fresh && !motionSafe ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    className={cn(
                      "pointer-events-none absolute bottom-0 block size-3",
                      mine
                        ? "-right-1.5 text-primary"
                        : "-left-1.5 text-surface-2",
                    )}
                  >
                    <svg viewBox="0 0 12 12" className="size-3">
                      <motion.path
                        fill="currentColor"
                        initial={
                          fresh && motionSafe ? { d: TAIL[side].tucked } : false
                        }
                        animate={{ d: TAIL[side].point }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    </svg>
                  </motion.span>
                )}
              </motion.div>
            </li>
          );
        })}
      </ol>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
