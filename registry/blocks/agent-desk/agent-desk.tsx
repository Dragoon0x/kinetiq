"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { PromptWell } from "@/registry/ui/prompt-well";
import { TrainOfThought } from "@/registry/ui/train-of-thought";
import { VolleyThread, type VolleyMessage } from "@/registry/ui/volley-thread";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DeskThread = {
  id: string;
  /** The tab's label. */
  title: string;
  messages: VolleyMessage[];
};

export type AgentDeskProps = {
  threads?: DeskThread[];
  defaultThreadId?: string;
  /** Passed straight through to the composer. */
  models?: string[];
  onSubmit?: (value: string, threadId: string) => void;
  className?: string;
};

const DEFAULT_THREADS: DeskThread[] = [
  {
    id: "yards",
    title: "Yards",
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Compare north basin's reshuffles to last month.",
      },
      {
        id: "m2",
        role: "agent",
        content: (
          <div className="flex flex-col gap-2">
            <TrainOfThought
              summary="Thought for 3 seconds"
              steps={[
                { id: "s1", text: "Pulled eight weeks of reshuffle rows" },
                {
                  id: "s2",
                  text: "Searching cause codes",
                  kind: "search",
                  detail: "3 causes",
                },
              ]}
            />
            <p>
              Reshuffles are down 31% on last month — the crane-hold deadline
              change accounts for most of it.
            </p>
          </div>
        ),
        note: "read: ledger · 2 tools · 3.1s",
      },
    ],
  },
  {
    id: "crews",
    title: "Crews",
    messages: [
      {
        id: "m3",
        role: "user",
        content: "Who can take the coating pass on Saturday?",
      },
      {
        id: "m4",
        role: "agent",
        content:
          "Crew B is clear from 10:15 and rested; Crew C would breach the rest window by forty minutes.",
        note: "read: rosters · 1.8s",
      },
    ],
  },
];

/**
 * The chat surface assembled from its instruments: tabbed threads, each a
 * volley-thread whose agent turns can open a train-of-thought, with the
 * prompt-well seated at the foot — models, @ sources, and / commands
 * included. The desk contributes the tabs and the seating; every behaviour
 * belongs to the primitive that owns it, which is the point of having
 * primitives.
 *
 * Reduced motion: thread swaps crossfade in place.
 */
export function AgentDesk({
  threads = DEFAULT_THREADS,
  defaultThreadId,
  models = ["waylight-2", "waylight-2-mini"],
  onSubmit,
  className,
}: AgentDeskProps) {
  const motionSafe = useMotionSafe();
  const [activeId, setActiveId] = React.useState(
    defaultThreadId ?? threads[0]?.id ?? "",
  );
  const active = threads.find((thread) => thread.id === activeId) ?? threads[0];

  if (!active) return null;

  return (
    <div
      className={cn(
        "flex w-full max-w-md flex-col rounded-4 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div
        role="tablist"
        aria-label="Threads"
        className="flex gap-1 border-b border-hairline p-2"
      >
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            role="tab"
            aria-selected={thread.id === active.id}
            onClick={() => setActiveId(thread.id)}
            className={cn(
              "rounded-2 px-3 py-1 text-sm transition-colors",
              thread.id === active.id
                ? "bg-surface-0 font-medium text-ink shadow-raised"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {thread.title}
          </button>
        ))}
      </div>

      <div className="min-h-64 flex-1 p-3">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: motionSafe ? 0 : 1 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            <VolleyThread
              messages={active.messages}
              aria-label={`${active.title} thread`}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="border-t border-hairline p-2.5">
        <PromptWell
          aria-label={`Message the ${active.title} thread`}
          models={models}
          placeholder="Ask about the morning…"
          maxRows={4}
          onSubmit={(value) => onSubmit?.(value, active.id)}
        />
      </div>
    </div>
  );
}
