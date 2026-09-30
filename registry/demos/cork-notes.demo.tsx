"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CorkNotes, type CorkNotesNotice } from "@/registry/ui/cork-notes";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 5,
    min: 0,
    max: 12,
    step: 1,
    unit: "°",
  },
  pins: {
    kind: "choice",
    label: "Pins",
    default: "round",
    options: ["round", "flat", "tack"],
    names: { round: "Round", flat: "Flat", tack: "Tack" },
  },
  cork: {
    kind: "choice",
    label: "Cork",
    default: "light",
    options: ["light", "dark"],
    names: { light: "Light", dark: "Dark" },
  },
  max: {
    kind: "range",
    label: "Max",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
});

const FIRST: CorkNotesNotice[] = [
  {
    id: "note-a",
    title: "Standup moved",
    body: "10:15 today, in the long room.",
    tone: "info",
  },
  {
    id: "note-b",
    title: "Release 4.2 shipped",
    body: "Live for every workspace.",
    tone: "success",
  },
  {
    id: "note-c",
    title: "Deploy freeze",
    body: "Nothing merges to main until Friday.",
    tone: "warn",
  },
];

const MORE: Omit<CorkNotesNotice, "id">[] = [
  {
    title: "Build failing",
    body: "Main is red after the search change.",
    tone: "danger",
  },
  {
    title: "Lunch order",
    body: "The deli list closes at 11:30.",
    tone: "info",
  },
  {
    title: "Review needed",
    body: "Billing copy wants a second read.",
    tone: "warn",
  },
  {
    title: "Visitors at 2",
    body: "Two from Gaugeworks, front desk.",
    tone: "info",
  },
];

/**
 * The team board by the kettle at Fieldline: notes go up as things happen,
 * and whoever deals with one takes it down.
 */
export function CorkNotesDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [notices, setNotices] = React.useState(FIRST);
  const [sent, setSent] = React.useState(0);
  const [last, setLast] = React.useState<{
    what: "pinned" | "unpinned";
    title: string;
  } | null>(null);
  const pinned = Math.min(notices.length, values.max ?? 4);

  const pin = () => {
    const next = MORE[sent % MORE.length];
    if (!next) return;
    setNotices((list) => [...list, { ...next, id: `note-${sent}` }]);
    setSent((n) => n + 1);
    setLast({ what: "pinned", title: next.title });
  };

  const dismiss = (id: string) => {
    const gone = notices.find((n) => n.id === id);
    setNotices((list) => list.filter((n) => n.id !== id));
    if (gone) setLast({ what: "unpinned", title: gone.title });
  };

  return (
    <div className="flex w-full max-w-96 flex-col gap-3">
      <CorkNotes
        label="Team board"
        notices={notices}
        onDismiss={dismiss}
        sound={sound}
        {...values}
        className="self-center"
      />
      {chrome ? (
        <>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={pin}
              className="inline-flex h-8 items-center justify-center rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Pin one
            </button>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {last ? (
              <>
                <span className="text-signal">{last.what}</span> · {last.title}{" "}
                · {pinned} pinned
              </>
            ) : (
              <>
                <span className="text-signal">{pinned} pinned</span> · top:{" "}
                {notices[notices.length - 1]?.title ?? "none"}
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
