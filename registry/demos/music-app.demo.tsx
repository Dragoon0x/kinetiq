"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultMusicAlbums,
  defaultMusicUpNext,
  MusicApp,
} from "@/registry/ui/music-app";

export const tweaks = defineTweaks({
  disc: {
    kind: "choice",
    label: "Disc",
    default: "vinyl",
    options: ["vinyl", "cd", "cover"],
    names: { vinyl: "Vinyl", cd: "CD", cover: "Sleeve" },
  },
  queue: {
    kind: "choice",
    label: "Queue",
    default: "panel",
    options: ["panel", "sheet"],
    names: { panel: "Panel", sheet: "Sheet" },
  },
  mini: {
    kind: "choice",
    label: "Mini player",
    default: "bar",
    options: ["bar", "pill", "card"],
    names: { bar: "Bar", pill: "Pill", card: "Card" },
  },
});

const titleOf = (id: string) => {
  for (const a of defaultMusicAlbums) {
    const t = a.tracks.find((x) => x.id === id);
    if (t) return t.title.toLowerCase();
  }
  return "";
};

/**
 * A Waylight Radio library: six albums, Tidewater by the Coldbrook Quartet
 * cued up and four songs waiting in Up next.
 */
export function MusicAppDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const first = defaultMusicAlbums[0]?.tracks[0]?.id ?? "";
  const [track, setTrack] = React.useState(first);
  const [playing, setPlaying] = React.useState(false);
  const [queue, setQueue] = React.useState(defaultMusicUpNext);
  const [note, setNote] = React.useState<string | null>(null);
  // A track that moves on takes its song off the queue: that is not news.
  const advanced = React.useRef(false);

  const screen = (
    <MusicApp
      onTrackChange={(id) => {
        advanced.current = true;
        setTrack(id);
        setNote(null);
      }}
      onPlayingChange={(on) => {
        setPlaying(on);
        setNote(null);
      }}
      onUpNextChange={(ids) => {
        setQueue(ids);
        if (advanced.current) {
          advanced.current = false;
          return;
        }
        setNote(
          ids.length === 0
            ? "queue cleared"
            : ids.length === queue.length
              ? "queue reordered"
              : ids.length < queue.length
                ? "removed from the queue"
                : "queue changed",
        );
      }}
      onFollowingChange={(artists) =>
        setNote(`following ${artists.length} artists`)
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{screen}</div>;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {screen}
      <p
        role="status"
        className="truncate border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ??
            (playing
              ? `playing “${titleOf(track)}”`
              : `paused · “${titleOf(track)}”`)}
        </span>{" "}
        · {queue.length} up next
      </p>
    </div>
  );
}
