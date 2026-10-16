"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTimecodeMedia,
  defaultTimecodeNotes,
  TimecodeNotes,
  type TimecodeNote,
} from "@/registry/ui/timecode-notes";

export const tweaks = defineTweaks({
  markerStyle: {
    kind: "choice",
    label: "Marker",
    default: "tick",
    options: ["tick", "dot", "avatar"],
    names: { tick: "Tick", dot: "Dot", avatar: "Avatar" },
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
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * The third cut of the Waylight onboarding film, under review: six notes
 * from three reviewers, two close enough to share a marker. Play it and
 * watch each note rise as the playhead reaches it.
 */
export function TimecodeNotesDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [notes, setNotes] =
    React.useState<TimecodeNote[]>(defaultTimecodeNotes);
  // Read when playback stops; never rendered per second, so the status line
  // does not talk while the clip plays.
  const time = React.useRef(0);
  const [playing, setPlaying] = React.useState(false);
  const [event, setEvent] = React.useState<string | null>(null);

  const reset = () => {
    setNotes(defaultTimecodeNotes);
    time.current = 0;
    setPlaying(false);
    setEvent(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <TimecodeNotes
      key={round}
      notes={notes}
      onNotesChange={setNotes}
      onTimeChange={(s) => {
        time.current = s;
      }}
      onPlayingChange={(on) => {
        setPlaying(on);
        setEvent(on ? null : `paused · ${clock(time.current)}`);
      }}
      onSeek={(at, noteId) => {
        const n = notes.find((x) => x.id === noteId);
        setEvent(
          n
            ? `seek · ${clock(at)} · ${n.author.split(" ")[0]}`
            : `seek · ${clock(at)}`,
        );
      }}
      onAdd={(note) => setEvent(`note added · ${clock(note.at)}`)}
      onResolve={(id, resolved) => {
        const n = notes.find((x) => x.id === id);
        setEvent(
          `${resolved ? "resolved" : "reopened"} · ${n ? clock(n.at) : ""}`,
        );
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
          {event ??
            (playing
              ? "playing"
              : `ready · ${clock(defaultTimecodeMedia.duration)}`)}
        </span>{" "}
        · {notes.length} notes · {notes.filter((n) => !n.resolved).length} open
      </p>
    </div>
  );
}
