"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultRoomMembers,
  EmptyRoom,
  type RoomMessage,
  type RoomPerson,
  type RoomStatus,
} from "@/registry/ui/empty-room";

export const tweaks = defineTweaks({
  bubbleStyle: {
    kind: "choice",
    label: "Bubbles",
    default: "soft",
    options: ["soft", "flat", "outline"],
    names: { soft: "Soft", flat: "Flat", outline: "Outline" },
  },
  avatarShape: {
    kind: "choice",
    label: "Avatars",
    default: "round",
    options: ["round", "square"],
    names: { round: "Round", square: "Square" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Fieldline Rooms, the morning #ridgeline-survey was made: four people in,
 * nothing said yet. Say hello, invite Kenji, send the first message and
 * watch the room answer.
 */
export function EmptyRoomDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [members, setMembers] =
    React.useState<RoomPerson[]>(defaultRoomMembers);
  const [messages, setMessages] = React.useState<RoomMessage[]>([]);
  const [status, setStatus] = React.useState<RoomStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [epoch, setEpoch] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <EmptyRoom height={540} {...values} />
      </div>
    );
  }

  const load = (fail: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const reload = () => {
    const fail = failNext;
    setFailNext(false);
    load(fail);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setMembers(defaultRoomMembers);
    setMessages([]);
    setStatus("ready");
    setFailNext(false);
    setEpoch((e) => e + 1);
  };

  const button =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <EmptyRoom
        key={epoch}
        height={540}
        members={members}
        onMembersChange={setMembers}
        messages={messages}
        onMessagesChange={setMessages}
        status={status}
        onRetry={() => load(false)}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {messages.length === 0
              ? "nothing said yet"
              : `${messages.length} ${messages.length === 1 ? "message" : "messages"}`}
          </span>{" "}
          · {members.length} here · {status}
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reload} className={button}>
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={button}
          >
            Fail next load
          </button>
          <button type="button" onClick={reset} className={button}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
