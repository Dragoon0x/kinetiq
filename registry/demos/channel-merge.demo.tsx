"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  ChannelMerge,
  defaultChannelAgents,
  defaultChannelMessages,
  defaultChannelNow,
  type ChannelKind,
  type ChannelMessage,
} from "@/registry/ui/channel-merge";

export const tweaks = defineTweaks({
  stripeStyle: {
    kind: "choice",
    label: "Stripe",
    default: "edge",
    options: ["edge", "rail", "band"],
    names: { edge: "Edge", rail: "Rail", band: "Band" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const WORD: Record<ChannelKind, string> = {
  email: "email",
  sms: "text",
  chat: "web chat",
  social: "social",
};

/**
 * Basinworks support, ticket BW-4821: Dana Whitlock of Harbor & Pine emailed
 * about a doubled invoice, followed up by text, then opened web chat. Reply on
 * any channel she has used; the reply is "sent", then "delivered".
 */
export function ChannelMergeDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [messages, setMessages] = React.useState<ChannelMessage[]>(
    defaultChannelMessages,
  );
  const [channel, setChannel] = React.useState<ChannelKind>("chat");
  const [assignee, setAssignee] = React.useState<string | null>("a1");
  const [event, setEvent] = React.useState<string | null>(null);
  const timers = React.useRef<number[]>([]);
  const [now, setNow] = React.useState(defaultChannelNow);
  const count = React.useRef(0);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setNow(defaultChannelNow);
    setMessages(defaultChannelMessages);
    setChannel("chat");
    setAssignee("a1");
    setEvent(null);
    setRound((r) => r + 1);
  };

  const agent = defaultChannelAgents.find((a) => a.id === assignee);

  const surface = (
    <ChannelMerge
      key={round}
      messages={messages}
      now={now}
      channel={channel}
      onChannelChange={(next) => {
        setChannel(next);
        setEvent(`reply via ${WORD[next]}`);
      }}
      assignee={assignee}
      onAssign={(id) => {
        setAssignee(id);
        const who = defaultChannelAgents.find((a) => a.id === id);
        setEvent(who ? `assigned · ${who.name.split(" ")[0]}` : "unassigned");
      }}
      onSend={(reply) => {
        count.current += 1;
        const at = now + 60_000;
        setNow(at);
        const id = `r${count.current}`;
        const message: ChannelMessage = {
          id,
          channel: reply.channel,
          from: "agent",
          author: agent?.name ?? "Basinworks Support",
          at,
          body: reply.body,
          subject: reply.subject,
          status: "sending",
        };
        setMessages((list) => [...list, message]);
        setEvent(`sent · ${WORD[reply.channel]}`);
        const mark = (status: ChannelMessage["status"], ms: number) => {
          timers.current.push(
            window.setTimeout(
              () =>
                setMessages((list) =>
                  list.map((m) => (m.id === id ? { ...m, status } : m)),
                ),
              ms,
            ),
          );
        };
        mark("sent", 700);
        mark("delivered", 1600);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const used = new Set(
    messages.filter((m) => m.from === "customer").map((m) => m.channel),
  ).size;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {event ?? `reply via ${WORD[channel]}`}
        </span>{" "}
        · {messages.length} messages · {used} channels ·{" "}
        {agent ? `assigned to ${agent.name.split(" ")[0]}` : "unassigned"}
      </p>
    </div>
  );
}
