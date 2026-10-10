"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { EdgeHaze } from "@/registry/ui/edge-haze";

export const tweaks = defineTweaks({
  strength: {
    kind: "range",
    label: "Strength",
    default: 10,
    min: 2,
    max: 24,
    step: 2,
    unit: "px",
  },
  height: {
    kind: "range",
    label: "Height",
    default: 64,
    min: 24,
    max: 120,
    step: 8,
    unit: "px",
  },
  edges: {
    kind: "choice",
    label: "Edges",
    default: "both",
    options: ["both", "top", "bottom"],
    names: { both: "Both", top: "Top", bottom: "Bottom" },
  },
});

const NOTES = [
  {
    date: "Apr 18",
    title: "Offline reading lists",
    body: "Save a list before the tunnel and it opens without a signal.",
  },
  {
    date: "Apr 15",
    title: "Quieter night theme",
    body: "Lower contrast after ten, with the accent pulled back to amber.",
  },
  {
    date: "Apr 11",
    title: "Faster search",
    body: "Results arrive as you type, ranked by what you last opened.",
  },
  {
    date: "Apr 08",
    title: "Shared highlights",
    body: "Send a passage to a friend with your note pinned beside it.",
  },
  {
    date: "Apr 04",
    title: "Reading time on every story",
    body: "Measured from your own pace, not an average reader's.",
  },
  {
    date: "Mar 30",
    title: "Gentler notifications",
    body: "One digest at the hour you choose instead of a ping per story.",
  },
  {
    date: "Mar 26",
    title: "Larger type on small phones",
    body: "Body text scales with the screen so lines stay a comfortable length.",
  },
  {
    date: "Mar 21",
    title: "Resume where you left off",
    body: "Open a story on another device and it lands on your last line.",
  },
  {
    date: "Mar 17",
    title: "Waylight 4.2 begins",
    body: "The spring release, built from your notes over the winter.",
  },
] as const;

/**
 * Waylight's spring release notes in a short card: the list scrolls, and its
 * edges haze over only as far as there is more to read beyond them.
 */
export function EdgeHazeDemo({
  chrome = true,
  // The haze is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hidden, setHidden] = React.useState({ top: false, bottom: true });
  const edges = values.edges ?? tweaks.edges.default;
  const above = hidden.top && edges !== "bottom";
  const below = hidden.bottom && edges !== "top";

  const card = (
    <div
      className="grid w-full grid-rows-[auto_minmax(0,1fr)] rounded-3 border border-hairline bg-card"
      style={{ height: chrome ? 420 : 500 }}
    >
      <div className="flex flex-col gap-1 border-b border-hairline px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight 4.2 · release notes
        </p>
        <p className="text-sm font-semibold text-foreground">
          What changed this spring
        </p>
      </div>
      <EdgeHaze
        className="rounded-b-3"
        label="Waylight 4.2 release notes"
        onEdgesChange={setHidden}
        {...values}
      >
        <ol className="flex flex-col gap-4 px-4 py-4">
          {NOTES.map((note) => (
            <li key={note.date} className="flex flex-col gap-1">
              <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
                {note.date}
              </p>
              <p className="text-sm font-medium text-foreground">
                {note.title}
              </p>
              <p className="text-sm leading-relaxed text-ink-2">{note.body}</p>
            </li>
          ))}
        </ol>
      </EdgeHaze>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{card}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {above && below ? (
          <>
            <span className="text-signal">hazed above and below</span> · more
            either way
          </>
        ) : above ? (
          <>
            <span className="text-signal">at the end</span> · hazed above
          </>
        ) : below ? (
          <>
            <span className="text-signal">hazed below</span> · {NOTES.length}{" "}
            notes, newest first
          </>
        ) : (
          <>
            <span className="text-signal">no haze</span> · nothing hidden that
            way
          </>
        )}
      </p>
    </div>
  );
}
