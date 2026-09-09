"use client";

import * as React from "react";

import { TypingEcho, type EchoMessage } from "@/registry/ui/typing-echo";

const OPENING: EchoMessage[] = [
  { id: "m1", from: "Ines", text: "Can the Friday run take 4471?", own: true },
  { id: "m2", from: "Marta", text: "Checking the dock sheet now." },
];

type Step = { after: number; typing: string[]; arrive?: EchoMessage };

/** A seeded timeline: who types, and what lands, in order. */
const SCRIPT: Step[] = [
  { after: 500, typing: ["Marta"] },
  {
    after: 1800,
    typing: [],
    arrive: { id: "m3", from: "Marta", text: "Door 3 is free after nine." },
  },
  { after: 900, typing: ["Marta", "Rui"] },
  {
    after: 1700,
    typing: ["Marta"],
    arrive: { id: "m4", from: "Rui", text: "I can drive it." },
  },
  {
    after: 1600,
    typing: [],
    arrive: { id: "m5", from: "Marta", text: "Booked, nine sharp." },
  },
];

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TypingEchoDemo() {
  const [messages, setMessages] = React.useState<EchoMessage[]>(OPENING);
  const [typing, setTyping] = React.useState<string[]>([]);
  const [stage, setStage] = React.useState<number | null>(null);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // One timer per step; a hidden tab holds the script where it stands.
  React.useEffect(() => {
    if (stage === null || !visible) return;
    const step = SCRIPT[stage];
    if (!step) return;
    const timer = window.setTimeout(() => {
      setTyping(step.typing);
      if (step.arrive) {
        const arrival = step.arrive;
        setMessages((prev) => [...prev, arrival]);
      }
      setStage(stage + 1 < SCRIPT.length ? stage + 1 : null);
    }, step.after);
    return () => window.clearTimeout(timer);
  }, [stage, visible]);

  const reset = () => {
    setStage(null);
    setTyping([]);
    setMessages(OPENING);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TypingEcho
        label="Depot group with Marta and Rui"
        messages={messages}
        typing={typing}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            reset();
            setStage(0);
          }}
          disabled={stage !== null}
          className={chip}
        >
          Play script
        </button>
        <button type="button" onClick={reset} className={chip}>
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {typing.length > 0 ? (
          <>
            Typing · <span className="text-signal">{typing.join(", ")}</span>
          </>
        ) : (
          <>Quiet · {messages.length} messages</>
        )}
      </p>
    </div>
  );
}
