"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { SlingSend } from "@/registry/ui/sling-send";

export const tweaks = defineTweaks({
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  maxStretch: {
    kind: "range",
    label: "Max stretch",
    default: 100,
    min: 60,
    max: 140,
    step: 10,
    unit: "px",
  },
  trajectory: {
    kind: "choice",
    label: "Trajectory",
    default: "arc",
    options: ["straight", "arc", "guided"],
    names: { straight: "Straight", arc: "Arc", guided: "Guided" },
  },
  trail: { kind: "toggle", label: "Trail", default: true },
});

type Message = { id: number; from: "them" | "you"; text: string };

const THREAD: Message[] = [
  { id: 1, from: "them", text: "Your order FW-4410 shipped this morning." },
  { id: 2, from: "you", text: "Great. Is there a tracking number?" },
  { id: 3, from: "them", text: "FL 88 2041 7763, arriving Thursday." },
];

/** Suggested replies: each send loads the next, so the band never runs dry. */
const REPLIES = [
  "Perfect, thanks for the quick reply",
  "Thursday works, I will be in",
  "Could you send the invoice too?",
  "All good, speak soon",
];

/**
 * A Fieldline support chat: the last three messages, and a composer whose
 * send button is a slingshot, loaded with a suggested reply.
 */
export function SlingSendDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [thread, setThread] = React.useState(THREAD);
  const [sent, setSent] = React.useState(0);
  const [draft, setDraft] = React.useState(REPLIES[0] ?? "");

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      {/* Messages grow in at the bottom as the oldest folds away at the top,
          in flow, so nothing overlaps while the thread moves. */}
      <ol
        role="list"
        aria-label="Fieldline support"
        className="-mb-2 flex flex-col"
      >
        <AnimatePresence initial={false}>
          {thread.slice(-3).map((m) => (
            <motion.li
              key={m.id}
              className="overflow-clip"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={
                motionSafe
                  ? { duration: durations.slow, ease: easings.move }
                  : {
                      height: { duration: 0 },
                      opacity: { duration: durations.fast },
                    }
              }
            >
              <div
                className={cn(
                  "flex pb-2",
                  m.from === "you" ? "justify-end" : "justify-start",
                )}
              >
                <p
                  className={cn(
                    "max-w-[85%] rounded-3 px-3 py-2 text-sm leading-snug",
                    m.from === "you"
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-foreground",
                  )}
                >
                  <span className="sr-only">
                    {m.from === "you" ? "You: " : "Fieldline: "}
                  </span>
                  {m.text}
                </p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      <SlingSend
        label="Reply to Fieldline"
        value={draft}
        onValueChange={setDraft}
        onSend={(message) => {
          setThread((list) => [
            ...list,
            { id: THREAD.length + list.length + 1, from: "you", text: message },
          ]);
          setSent((n) => n + 1);
          setDraft(REPLIES[(sent + 1) % REPLIES.length] ?? "");
        }}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {sent === 0 ? (
            <>
              <span className="text-signal">reply loaded</span> · pull back and
              let go
            </>
          ) : (
            <>
              <span className="text-signal">{sent} sent</span> · next reply
              loaded
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
