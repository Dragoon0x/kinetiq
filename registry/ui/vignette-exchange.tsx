"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ExchangeBeat = {
  id: string;
  side: "ask" | "answer";
  text: string;
};

export type VignetteExchangeProps = {
  beats?: ExchangeBeat[];
  /** Seconds each beat holds before the next lands. @default 2.4 */
  holdSeconds?: number;
  /** Seconds the finished exchange rests before looping. @default 4 */
  restSeconds?: number;
  className?: string;
};

const DEFAULT_BEATS: ExchangeBeat[] = [
  { id: "b1", side: "ask", text: "Who has crane 2 at ten?" },
  { id: "b2", side: "answer", text: "Crew A, until the rig test signs off." },
  { id: "b3", side: "ask", text: "Move the coating pass to B?" },
  { id: "b4", side: "answer", text: "Done — both boards updated." },
];

/**
 * A chat moment that loops politely: bubbles land one beat at a time, the
 * finished exchange rests long enough to be read whole, then it clears and
 * begins again. A vignette, not a chat — the beats are fixed, nothing is
 * interactive, and the whole scene reads to assistive tech as one image
 * with the transcript as its label. For heroes that want a conversation's
 * shape without a working thread; the working thread is volley-thread.
 *
 * Reduced motion: the whole exchange prints at rest and stays.
 */
export function VignetteExchange({
  beats = DEFAULT_BEATS,
  holdSeconds = 2.4,
  restSeconds = 4,
  className,
}: VignetteExchangeProps) {
  const motionSafe = useMotionSafe();
  const [shown, setShown] = React.useState(motionSafe ? 0 : beats.length);

  // Mode or content changed: reset during render, never inside the effect.
  const [loopKey, setLoopKey] = React.useState(`${motionSafe}:${beats.length}`);
  if (loopKey !== `${motionSafe}:${beats.length}`) {
    setLoopKey(`${motionSafe}:${beats.length}`);
    setShown(motionSafe ? 0 : beats.length);
  }

  React.useEffect(() => {
    if (!motionSafe) return;
    let cancelled = false;
    let timer: number;
    const advance = (count: number) => {
      if (cancelled) return;
      if (count < beats.length) {
        timer = window.setTimeout(
          () => {
            setShown(count + 1);
            advance(count + 1);
          },
          count === 0 ? 600 : holdSeconds * 1000,
        );
      } else {
        timer = window.setTimeout(() => {
          setShown(0);
          advance(0);
        }, restSeconds * 1000);
      }
    };
    advance(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [motionSafe, beats.length, holdSeconds, restSeconds]);

  return (
    <div
      role="img"
      aria-label={`Exchange: ${beats.map((b) => b.text).join(" — ")}`}
      className={cn("w-full max-w-xs", className)}
    >
      <div aria-hidden className="flex min-h-48 flex-col justify-end gap-2">
        <AnimatePresence>
          {beats.slice(0, shown).map((beat) => (
            <motion.div
              key={beat.id}
              layout={motionSafe}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.nudge : 0,
                scale: motionSafe ? 0.96 : 1,
              }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.fast } }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              className={cn(
                "max-w-[85%] rounded-3 border px-3 py-1.5 text-sm",
                beat.side === "ask"
                  ? "self-end rounded-br-1 border-primary/30 bg-primary/10 text-ink"
                  : "self-start rounded-bl-1 border-hairline bg-surface-1 text-ink-2",
              )}
            >
              {beat.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
