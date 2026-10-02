"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultChatChannels,
  defaultChatMessages,
  defaultChatPeople,
  defaultTeamChatNow,
  TeamChat,
  type ChatMessage,
} from "@/registry/ui/team-chat";

export const tweaks = defineTweaks({
  thread: {
    kind: "choice",
    label: "Thread",
    default: "dock",
    options: ["dock", "overlay", "full"],
    names: { dock: "Dock", overlay: "Overlay", full: "Full" },
  },
  presence: {
    kind: "choice",
    label: "Presence",
    default: "dot",
    options: ["dot", "ring", "off"],
    names: { dot: "Dot", ring: "Ring", off: "Off" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/** What Rae answers with, in turn, when Noor writes in #field-ops. */
const SCRIPT = [
  "On it. I'll post the readings when I'm back in signal.",
  "Noted. The weir path is muddy, so give me twenty minutes.",
  "Copy that. Fixes are syncing now.",
];

const nameOf = (id: string) =>
  defaultChatPeople.find((p) => p.id === id)?.name.split(" ")[0] ?? id;

/**
 * Noor Halvorsen's Fieldline workspace on Friday morning: #field-ops is
 * planning the Basin Road survey, with a thread about the slumped bank
 * open beside it. Write in the channel and Rae answers from the field.
 */
export function TeamChatDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [messages, setMessages] = React.useState(defaultChatMessages);
  const [channel, setChannel] = React.useState("field-ops");
  const [openId, setOpenId] = React.useState<string | null>("fo-6");
  const [following, setFollowing] = React.useState<string[]>([]);
  const [typing, setTyping] = React.useState<string[]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const timers = React.useRef<number[]>([]);
  const turn = React.useRef(0);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
    };
  }, []);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    turn.current = 0;
    setMessages(defaultChatMessages);
    setChannel("field-ops");
    setOpenId("fo-6");
    setFollowing([]);
    setTyping([]);
    setNote(null);
    setRun((r) => r + 1);
  };

  // A teammate answers a message Noor sends in #field-ops: typing first,
  // then the reply, from the seeded script.
  const answer = (sent: ChatMessage) => {
    if (sent.parent || sent.channel !== "field-ops") return;
    const line = SCRIPT[turn.current % SCRIPT.length] ?? "";
    turn.current += 1;
    timers.current.push(
      window.setTimeout(() => setTyping(["rae"]), 700),
      window.setTimeout(() => {
        setTyping([]);
        setMessages((list) => [
          ...list,
          {
            id: `demo-rae-${turn.current}-${list.length}`,
            channel: "field-ops",
            author: "rae",
            at: defaultTeamChatNow,
            text: line,
          },
        ]);
      }, 2300),
    );
  };

  const chat = (
    <TeamChat
      key={run}
      sound={sound}
      {...values}
      messages={messages}
      onMessagesChange={setMessages}
      channel={channel}
      onChannelChange={(id) => {
        setChannel(id);
        setTyping([]);
        setNote(null);
      }}
      openThread={openId}
      onOpenThreadChange={(id) => {
        setOpenId(id);
        setNote(null);
      }}
      following={following}
      onFollowingChange={setFollowing}
      typing={channel === "field-ops" ? typing : []}
      onSend={(m) => {
        setNote(m.parent ? "reply sent in the thread" : "message sent");
        answer(m);
      }}
      onReact={(id, kind, added) => {
        const m = messages.find((x) => x.id === id);
        const who = m ? nameOf(m.author).toLowerCase() : "a";
        const word = kind === "ack" ? "thumbs up" : kind;
        setNote(
          added
            ? `reacted ${word} to ${who}'s message`
            : `took back ${word} on ${who}'s message`,
        );
      }}
      onPinChange={(_, pinned) =>
        setNote(pinned ? "message pinned" : "message unpinned")
      }
      onMuteChange={(id, muted) =>
        setNote(`#${id} ${muted ? "muted" : "unmuted"}`)
      }
    />
  );

  if (!chrome) return <div className="w-full">{chat}</div>;

  const ch = defaultChatChannels.find((c) => c.id === channel);
  const where = ch
    ? ch.kind === "direct"
      ? ch.name.toLowerCase()
      : `#${ch.name}`
    : channel;
  const pinned = messages.filter(
    (m) => m.channel === channel && m.pinned && !m.parent,
  ).length;
  const replies = openId
    ? messages.filter((m) => m.parent === openId).length
    : 0;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {chat}
      <div className="flex items-center gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {typing.length ? (
            <>
              <span className="text-signal">rae is typing</span> · {where}
            </>
          ) : note ? (
            <>
              <span className="text-signal">{note}</span> · {where}
            </>
          ) : openId ? (
            <>
              <span className="text-signal">thread open</span> · {replies}{" "}
              {replies === 1 ? "reply" : "replies"}
              {following.includes(openId) ? " · following" : ""}
            </>
          ) : (
            <>
              <span className="text-signal">{where}</span> · {pinned} pinned
            </>
          )}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
