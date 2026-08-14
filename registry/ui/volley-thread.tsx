"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type VolleyRole = "user" | "agent" | "system";

export type VolleyMessage = {
  /** Stable identity — drives the arrival animation and React keys. */
  id: string;
  role: VolleyRole;
  content: React.ReactNode;
  /** Mono footnote under the bubble: a duration, a model name, a state. */
  note?: string;
};

export type VolleyThreadProps = {
  ref?: React.Ref<HTMLDivElement>;
  messages: VolleyMessage[];
  /** Held open at the foot of the thread while a reply is being formed. */
  pending?: React.ReactNode;
  /** Follow the newest message as it lands. @default true */
  follow?: boolean;
  label?: React.ReactNode;
  "aria-label"?: string;
  className?: string;
};

const ROLE_NAME: Record<VolleyRole, string> = {
  user: "You",
  agent: "Assistant",
  system: "System",
};

/**
 * A thread where each turn arrives under its own weight. A message enters from
 * the side that owns it, rides in on `glide`, and settles — consecutive turns
 * from one speaker stagger against each other on the cascade budget rather than
 * landing together, so a burst reads as a run of thought instead of a dump.
 *
 * Speaker is carried three ways, never by colour alone: the side it sits on, a
 * mono label above each run, and a screen-reader name on every bubble. The list
 * is a `log` with polite live semantics, so additions are announced without
 * stealing focus.
 *
 * Under reduced motion the travel is dropped and turns simply resolve in place.
 */
export function VolleyThread({
  ref,
  messages,
  pending,
  follow = true,
  label,
  "aria-label": ariaLabel,
  className,
}: VolleyThreadProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const labelId = label ? `${baseId}-label` : undefined;

  // Follow the foot of the thread as turns land. Reading scrollHeight in an
  // effect keeps it out of render, and no state is set — the DOM is the state.
  const count = messages.length;
  const hasPending = pending !== undefined && pending !== null;
  React.useEffect(() => {
    if (!follow) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: motionSafe ? "smooth" : "auto",
    });
  }, [count, hasPending, follow, motionSafe]);

  // Stagger within a run of one speaker; a change of speaker restarts the clock.
  const step = cascade(Math.min(count, 6));
  const runIndexes = React.useMemo(
    () =>
      messages.reduce<number[]>((acc, message, index) => {
        const opensRun = messages[index - 1]?.role !== message.role;
        acc.push(opensRun ? 0 : (acc[index - 1] ?? 0) + 1);
        return acc;
      }, []),
    [messages],
  );

  return (
    <div
      ref={ref}
      className={cn("flex w-full flex-col gap-2", className)}
      role="group"
      aria-label={labelId ? undefined : (ariaLabel ?? "Conversation")}
      aria-labelledby={labelId}
    >
      {label && (
        <span id={labelId} className="text-label text-ink-3">
          {label}
        </span>
      )}

      <div
        ref={scrollRef}
        className="border-hairline bg-surface-1 rounded-3 max-h-80 overflow-y-auto overscroll-contain border p-3"
      >
        <ul role="log" aria-live="polite" aria-relevant="additions" className="flex flex-col gap-1.5">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const opensRun = previous?.role !== message.role;
            const runIndex = runIndexes[index] ?? 0;
            const mine = message.role === "user";
            const system = message.role === "system";

            return (
              <li
                key={message.id}
                className={cn(
                  "flex flex-col",
                  opensRun && index > 0 && "mt-2",
                  system ? "items-center" : mine ? "items-end" : "items-start",
                )}
              >
                {opensRun && !system && (
                  <span className="text-label text-ink-3 mb-1 px-1">
                    {ROLE_NAME[message.role]}
                  </span>
                )}

                <motion.div
                  initial={
                    motionSafe
                      ? { opacity: 0, x: system ? 0 : mine ? distances.step : -distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  transition={
                    motionSafe
                      ? { ...springs.glide, delay: runIndex * step }
                      : { duration: durations.fast, ease: easings.enter }
                  }
                  className={cn(
                    "rounded-3 max-w-[85%] border px-3 py-2 text-sm leading-relaxed",
                    system
                      ? "border-hairline text-ink-3 bg-transparent text-center text-xs"
                      : mine
                        ? "text-ink"
                        : "border-hairline bg-surface-2 text-ink",
                  )}
                  style={
                    mine
                      ? {
                          background: "var(--accent-wash)",
                          borderColor: "var(--accent)",
                        }
                      : undefined
                  }
                >
                  <span className="sr-only">{ROLE_NAME[message.role]}: </span>
                  {message.content}
                </motion.div>

                {message.note && (
                  <span className="text-label text-ink-3 mt-1 px-1">
                    {message.note}
                  </span>
                )}
              </li>
            );
          })}

          {hasPending && (
            <li className="flex flex-col items-start">
              <div className="border-hairline bg-surface-2 text-ink-2 rounded-3 max-w-[85%] border px-3 py-2 text-sm">
                {pending}
              </div>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
