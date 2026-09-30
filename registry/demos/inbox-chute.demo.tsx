"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { InboxChute, type InboxChuteNotice } from "@/registry/ui/inbox-chute";

export const tweaks = defineTweaks({
  bounce: {
    kind: "range",
    label: "Bounce",
    default: 0.35,
    min: 0,
    max: 0.8,
    step: 0.05,
  },
  lean: {
    kind: "range",
    label: "Lean",
    default: 4,
    min: 0,
    max: 10,
    step: 0.5,
    unit: "°",
  },
  tray: {
    kind: "choice",
    label: "Tray",
    default: "steel",
    options: ["steel", "wood", "plastic"],
    names: { steel: "Steel", wood: "Wood", plastic: "Plastic" },
  },
});

const FIRST: InboxChuteNotice[] = [
  { id: "cafe", title: "Card payment", body: "Fernworks Café · €4.20" },
  {
    id: "salary",
    title: "Salary received",
    body: "Gaugeworks Ltd · €3,180.00",
    tone: "success",
  },
  {
    id: "signin",
    title: "Unusual sign-in",
    body: "A new device at 02:14",
    tone: "danger",
  },
];

const MORE: Omit<InboxChuteNotice, "id">[] = [
  {
    title: "Direct debit due",
    body: "Basinworks Energy · €62.40, Friday",
    tone: "warn",
  },
  { title: "Transfer sent", body: "€250.00 to Savings", tone: "success" },
  { title: "Card payment", body: "Waylight Transit · €2.90" },
  { title: "Low balance", body: "Everyday account under €100", tone: "warn" },
  { title: "Statement ready", body: "September, 14 transactions" },
];

/** The most the demo's tray holds before Send one waits. */
const MOST = 8;

/**
 * Coldbrook Bank's notifications: payments, transfers and alerts drop into
 * the tray as they happen, and pile up until they are read.
 */
export function InboxChuteDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [notices, setNotices] = React.useState<InboxChuteNotice[]>(FIRST);
  const [sent, setSent] = React.useState(0);

  const chute = (
    <InboxChute
      label="Coldbrook Bank notifications"
      notices={notices}
      onDismiss={(id) => setNotices((list) => list.filter((n) => n.id !== id))}
      onClearAll={() => setNotices([])}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full max-w-xs justify-center">{chute}</div>;
  }

  const next = MORE[sent % MORE.length] as Omit<InboxChuteNotice, "id">;
  const newest = notices[notices.length - 1];

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {chute}
      <div className="flex items-center justify-center">
        <button
          type="button"
          disabled={notices.length >= MOST}
          onClick={() => {
            setNotices((list) => [...list, { ...next, id: `sent-${sent}` }]);
            setSent((s) => s + 1);
          }}
          className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Send one
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {newest ? (
          <>
            <span className="text-signal">{notices.length} in the tray</span> ·
            newest: {newest.title.toLowerCase()}
          </>
        ) : (
          <span className="text-signal">tray empty</span>
        )}
      </p>
    </div>
  );
}
