"use client";

import * as React from "react";

import { Play } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TalkPill, type TalkPillTake } from "@/registry/ui/talk-pill";

export const tweaks = defineTweaks({
  bars: {
    kind: "range",
    label: "Bars",
    default: 24,
    min: 12,
    max: 40,
    step: 4,
  },
  duration: {
    kind: "range",
    label: "Duration",
    default: 30,
    min: 5,
    max: 60,
    step: 5,
    unit: "s",
  },
  cancel: {
    kind: "range",
    label: "Cancel",
    default: 96,
    min: 48,
    max: 144,
    step: 8,
    unit: "px",
  },
});

type Note = { id: number; seconds: number; levels: number[] };
type Status =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "sent"; seconds: number }
  | { kind: "cancelled" };

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** A sent voice note: its own little tape and its length. */
function VoiceNote({ note }: { note: Note }) {
  const shown = note.levels.filter((_, i) => i % 2 === 0);
  return (
    <li className="flex justify-end">
      <span className="inline-flex h-8 items-center gap-2 rounded-full bg-primary pr-3 pl-1.5 text-primary-foreground">
        <span className="grid size-5 place-items-center rounded-full bg-primary-foreground/20">
          <Play aria-hidden className="size-3 fill-current" />
        </span>
        <svg aria-hidden width={shown.length * 4} height={16} className="block">
          {shown.map((v, i) => {
            const h = Math.max(2, Math.round(v * 14));
            return (
              <rect
                key={i}
                x={i * 4}
                y={(16 - h) / 2}
                width={2}
                height={h}
                rx={1}
                className="fill-current opacity-80"
              />
            );
          })}
        </svg>
        <span className="font-mono text-[11px] tabular-nums">
          {clock(note.seconds)}
        </span>
        <span className="sr-only">Voice note, {note.seconds} seconds</span>
      </span>
    </li>
  );
}

/**
 * A Fieldline Chat composer: hold the pill to record a voice reply, let go
 * to send it, slide away to throw it out.
 */
export function TalkPillDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const next = React.useRef(1);

  const onSend = (take: TalkPillTake) => {
    const seconds = Math.max(1, Math.round(take.duration / 1000));
    const id = next.current++;
    setNotes((prev) =>
      [...prev, { id, seconds, levels: take.levels }].slice(-2),
    );
    setStatus({ kind: "sent", seconds });
  };

  const thread = (
    <ol role="list" aria-label="Conversation" className="flex flex-col gap-2">
      <li className="flex">
        <span className="max-w-[85%] rounded-3 rounded-bl-1 bg-surface-2 px-3 py-2 text-sm text-foreground">
          Can you leave the gate code for Thursday?
        </span>
      </li>
      {notes.map((note) => (
        <VoiceNote key={note.id} note={note} />
      ))}
    </ol>
  );

  const composer = (
    <TalkPill
      onSend={onSend}
      onCancel={() => setStatus({ kind: "cancelled" })}
      onRecordingChange={(on) => {
        if (on) setStatus({ kind: "recording" });
      }}
      sound={sound}
      {...values}
    >
      <input
        type="text"
        aria-label="Message"
        placeholder="Message"
        className="h-11 w-full min-w-0 rounded-full border border-hairline bg-card px-4 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
    </TalkPill>
  );

  if (!chrome) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-1">
        {thread}
        {composer}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-1">
      {thread}
      {composer}
      <p
        role="status"
        className="mt-2 border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status.kind === "idle" ? (
          <>
            <span className="text-signal">hold to talk</span> · space from the
            keyboard
          </>
        ) : status.kind === "recording" ? (
          <>
            <span className="text-signal">recording</span> · let go to send
          </>
        ) : status.kind === "sent" ? (
          <>
            <span className="text-signal">sent</span> · {clock(status.seconds)}{" "}
            voice note
          </>
        ) : (
          <>
            <span className="text-signal">cancelled</span> · nothing sent
          </>
        )}
      </p>
    </div>
  );
}
