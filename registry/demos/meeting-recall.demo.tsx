"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRecallSegments,
  MeetingRecall,
} from "@/registry/ui/meeting-recall";

export const tweaks = defineTweaks({
  waveStyle: {
    kind: "choice",
    label: "Wave",
    default: "bars",
    options: ["bars", "mirror", "line"],
    names: { bars: "Bars", mirror: "Mirror", line: "Line" },
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

const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const topicOf = (ids: string[]) => {
  const first = defaultRecallSegments.find((s) => s.id === ids[0]);
  return first ? first.text.split(/[.,:]/)[0]?.toLowerCase() : "";
};

type Event =
  | { kind: "seek"; at: number; lines: number }
  | { kind: "play"; playing: boolean }
  | { kind: "ask"; question: string; found: boolean };

/**
 * The Waylight Tuesday roadmap call, asked what was decided about the beta;
 * three more questions are offered under the composer.
 */
export function MeetingRecallDemo({
  chrome = true,
  // The recording is drawn, not heard: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [event, setEvent] = React.useState<Event | null>(null);
  const [topic, setTopic] = React.useState("");

  const surface = (
    <MeetingRecall
      key={round}
      onSeek={(at, ids) => {
        setEvent({ kind: "seek", at, lines: ids.length });
        setTopic(topicOf(ids) ?? "");
      }}
      onPlay={(playing) => setEvent({ kind: "play", playing })}
      onAsk={(question, answer) =>
        setEvent({
          kind: "ask",
          question,
          found: !!answer && answer.claims.some((c) => c.refs.length > 0),
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setEvent(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {event?.kind === "seek" ? (
          <>
            <span className="text-signal">{clock(event.at)}</span> ·{" "}
            {event.lines} {event.lines === 1 ? "line" : "lines"}
            {topic ? ` · ${topic}` : ""}
          </>
        ) : event?.kind === "play" ? (
          <>
            <span className="text-signal">
              {event.playing ? "playing" : "paused"}
            </span>{" "}
            · k toggles
          </>
        ) : event?.kind === "ask" ? (
          <>
            <span className="text-signal">
              {event.found ? "asked" : "no source"}
            </span>{" "}
            · {event.question.replace(/\?$/, "").toLowerCase()}
          </>
        ) : (
          <>
            <span className="text-signal">1 answer</span> · press a time to jump
            to the moment
          </>
        )}
      </p>
    </div>
  );
}
