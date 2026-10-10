"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FlickNote, type FlickNoteItem } from "@/registry/ui/flick-note";

export const tweaks = defineTweaks({
  visible: {
    kind: "range",
    label: "Visible",
    default: 3,
    min: 2,
    max: 4,
    step: 1,
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 8,
    min: 4,
    max: 10,
    step: 2,
    unit: "px",
  },
  distance: {
    kind: "range",
    label: "Distance",
    default: 120,
    min: 60,
    max: 200,
    step: 20,
    unit: "px",
  },
});

/** The Gaugeworks console's notifications, in the order they arrive. */
const QUEUE: FlickNoteItem[] = [
  {
    id: "build",
    title: "Build 482 passed",
    body: "main is live in production",
    time: "2m",
    tone: "success",
  },
  {
    id: "review",
    title: "Review requested",
    body: "Ines asked you to look at PR 318",
    time: "6m",
    tone: "info",
  },
  {
    id: "disk",
    title: "Disk at 86%",
    body: "eu-west log volume is filling",
    time: "14m",
    tone: "warn",
  },
  {
    id: "payout",
    title: "Payout sent",
    body: "1,240.00 to Waylight Pay",
    time: "1h",
    tone: "info",
  },
  {
    id: "incident",
    title: "Incident resolved",
    body: "Checkout latency is back under 200 ms",
    time: "3h",
    tone: "success",
  },
  {
    id: "quota",
    title: "Build minutes at 92%",
    body: "The plan resets on the 1st",
    time: "5h",
    tone: "danger",
  },
];

/** When the stack runs dry, a couple of notes come back after this long, in ms. */
const REFILL = 2400;

/**
 * Deploy notifications in the Gaugeworks console: fan the stack to read it,
 * flick the ones you are done with.
 */
export function FlickNoteDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [notes, setNotes] = React.useState<FlickNoteItem[]>(() =>
    QUEUE.slice(0, 4),
  );
  const [last, setLast] = React.useState<{
    verb: string;
    title: string;
  } | null>(null);
  const next = React.useRef(4);
  const round = React.useRef(0);

  const add = React.useCallback(() => {
    const item = QUEUE[next.current % QUEUE.length];
    if (!item) return;
    next.current += 1;
    round.current += 1;
    // A fresh id each time round, so a note that comes back is a new note.
    const fresh = { ...item, id: `${item.id}-${round.current}`, time: "now" };
    setNotes((prev) => [fresh, ...prev].slice(0, 8));
  }, []);

  // An empty stack fills again on its own, so the card never stays bare.
  const empty = notes.length === 0;
  React.useEffect(() => {
    if (!empty) return;
    const timer = window.setTimeout(() => {
      add();
      add();
    }, REFILL);
    return () => window.clearTimeout(timer);
  }, [empty, add]);

  const stack = (
    <FlickNote
      label="Gaugeworks notifications"
      notes={notes}
      onDismiss={(id) => {
        const gone = notes.find((n) => n.id === id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        if (gone) setLast({ verb: "dismissed", title: gone.title });
      }}
      onOpen={(id) => {
        const note = notes.find((n) => n.id === id);
        if (note) setLast({ verb: "opened", title: note.title });
      }}
      size={chrome ? "md" : "sm"}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full max-w-sm justify-center">{stack}</div>;
  }

  const n = notes.length;
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {stack}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {last ? (
            <>
              <span className="text-signal">{last.verb}</span> ·{" "}
              {last.title.toLowerCase()}
            </>
          ) : (
            <>
              <span className="text-signal">
                {n} {n === 1 ? "note" : "notes"}
              </span>{" "}
              · hover to fan, flick to dismiss
            </>
          )}
        </p>
        <button
          type="button"
          onClick={add}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Add note
        </button>
      </div>
    </div>
  );
}
