"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  SlotSwipe,
  type SlotSwipeAction,
  type SlotSwipeItem,
} from "@/registry/ui/slot-swipe";

export const tweaks = defineTweaks({
  threshold: {
    kind: "range",
    label: "Threshold",
    default: 0.35,
    min: 0.2,
    max: 0.6,
    step: 0.05,
  },
  side: {
    kind: "choice",
    label: "Slot side",
    default: "right",
    options: ["right", "left"],
    names: { right: "Right", left: "Left" },
  },
  squash: {
    kind: "range",
    label: "Squash",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.1,
  },
  undo: { kind: "toggle", label: "Undo", default: true },
});

/** Fieldline Mail: this morning's threads. */
const THREADS: SlotSwipeItem[] = [
  {
    id: "basinworks",
    from: "Basinworks billing",
    subject: "Invoice 2291 is ready",
    time: "09:12",
  },
  {
    id: "gaugeworks",
    from: "Gaugeworks",
    subject: "Uptime report for September",
    time: "08:40",
  },
  {
    id: "coldbrook",
    from: "Coldbrook Bank",
    subject: "Your statement is available",
    time: "07:55",
  },
  {
    id: "fernworks",
    from: "Fernworks",
    subject: "Order FW-4410 has shipped",
    time: "Mon",
  },
  {
    id: "waylight",
    from: "Waylight Pay",
    subject: "Payout of 1,240 sent",
    time: "Mon",
  },
];

const ALL = THREADS.map((thread) => thread.id);

/**
 * Fieldline Mail's inbox. Swipe a thread into the slot to archive it, or
 * into the drawer to snooze it until nine; Delete and S do the same.
 */
export function SlotSwipeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [ids, setIds] = React.useState<string[]>(ALL);
  const [tally, setTally] = React.useState<Record<SlotSwipeAction, string[]>>({
    archive: [],
    snooze: [],
  });

  const onValueChange = (next: string[]) => {
    setIds(next);
    // A row that came back (Undo) is no longer archived or snoozed.
    setTally((t) => ({
      archive: t.archive.filter((id) => !next.includes(id)),
      snooze: t.snooze.filter((id) => !next.includes(id)),
    }));
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <SlotSwipe
        label="Inbox"
        items={THREADS}
        value={ids}
        onValueChange={onValueChange}
        onAction={(id, action) =>
          setTally((t) => ({ ...t, [action]: [...t[action], id] }))
        }
        snoozeHour={9}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{ids.length} in inbox</span> ·{" "}
            {tally.archive.length} archived · {tally.snooze.length} snoozed
          </p>
          {ids.length < ALL.length ? (
            <button
              type="button"
              onClick={() => {
                setIds(ALL);
                setTally({ archive: [], snooze: [] });
              }}
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
