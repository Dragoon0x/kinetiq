"use client";

import * as React from "react";

import {
  BubbleLand,
  type BubbleDelivery,
  type BubbleMessage,
} from "@/registry/ui/bubble-land";

const OPENING: BubbleMessage[] = [
  {
    id: "m1",
    from: "peer",
    text: "Order 4471 is packed. Hold it at the depot, or send it on?",
    time: "9:38",
  },
  {
    id: "m2",
    from: "me",
    text: "Hold it until Friday, please.",
    time: "9:39",
    delivery: "read",
  },
];

const REPLIES = [
  "Done. Held at Coldbrook until Friday.",
  "Noted. I will tag it for the morning run.",
];

/** Each hop's delay after the one before; a reply follows a read. */
const MS = { sent: 400, delivered: 600, failed: 600, read: 900, reply: 900 };
type Hop = keyof typeof MS;
const WALK: readonly Hop[] = ["sent", "delivered", "read", "reply"];
const STUMBLE: readonly Hop[] = ["sent", "failed"];

const clock = (n: number) =>
  `${9 + Math.floor((41 + n) / 60)}:${String((41 + n) % 60).padStart(2, "0")}`;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;
const useVisible = () =>
  React.useSyncExternalStore(subscribeVisibility, getVisible, getServerVisible);

type Pending = { id: string; n: number; steps: readonly Hop[]; stage: number };

export function BubbleLandDemo() {
  const [messages, setMessages] = React.useState<BubbleMessage[]>(OPENING);
  const [sentCount, setSentCount] = React.useState(0);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const visible = useVisible();

  const mark = (id: string, delivery: BubbleDelivery) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, delivery } : m)),
    );

  // A seeded script drives the walk; a hidden tab holds it where it stands.
  React.useEffect(() => {
    if (!pending || !visible) return;
    const hop = pending.steps[pending.stage];
    if (!hop) return;
    const timer = window.setTimeout(() => {
      if (hop === "reply") {
        const text = REPLIES[(pending.n - 1) % REPLIES.length] ?? "Noted.";
        const reply = { id: `r${pending.n}`, from: "peer", text } as const;
        setMessages((prev) => [...prev, { ...reply, time: clock(pending.n) }]);
      } else {
        mark(pending.id, hop);
      }
      const stage = pending.stage + 1;
      setPending(stage < pending.steps.length ? { ...pending, stage } : null);
    }, MS[hop]);
    return () => window.clearTimeout(timer);
  }, [pending, visible]);

  const send = (text: string) => {
    const n = sentCount + 1;
    const id = `s${n}`;
    const fresh = { id, from: "me", text, time: clock(n) } as const;
    setMessages((prev) => [...prev, { ...fresh, delivery: "sending" }]);
    setSentCount(n);
    setPending({ id, n, steps: n % 3 === 0 ? STUMBLE : WALK, stage: 0 });
  };

  const retry = (id: string) => {
    mark(id, "sending");
    setPending({ id, n: sentCount, steps: WALK, stage: 0 });
  };

  const lastOwn = [...messages].reverse().find((m) => m.from === "me");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BubbleLand
        label="Depot chat with Marta"
        peerName="Marta"
        messages={messages}
        onSend={send}
        onRetry={retry}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Ines → Marta ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {lastOwn?.delivery ?? "sent"}
        </span>{" "}
        · {sentCount} sent
      </p>
    </div>
  );
}
