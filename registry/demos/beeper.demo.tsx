"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { Beeper, type BeeperNotice } from "@/registry/ui/beeper";

export const tweaks = defineTweaks({
  buzz: {
    kind: "range",
    label: "Buzz",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lcd: {
    kind: "choice",
    label: "Display",
    default: "green",
    options: ["green", "amber", "ice"],
    names: { green: "Green", amber: "Amber", ice: "Ice" },
  },
  scroll: {
    kind: "range",
    label: "Scroll",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
});

const FIRST: BeeperNotice[] = [
  {
    id: "lag",
    title: "Replica lag",
    body: "bn-04 is 42 s behind primary",
    tone: "warn",
  },
  {
    id: "deploy",
    title: "Deploy 1.8.2 done",
    body: "Ledger API healthy on all nodes",
    tone: "success",
  },
  {
    id: "disk",
    title: "Disk 91% on bn-07",
    body: "Archive volume fills in 3 h",
    tone: "danger",
  },
];

const MORE: Omit<BeeperNotice, "id">[] = [
  { title: "Page from Ines", body: "Can you look at the batch job?" },
  { title: "Queue backlog", body: "2,140 settlements waiting", tone: "warn" },
  {
    title: "Error rate 4.2%",
    body: "Payments API, last 5 min",
    tone: "danger",
  },
  {
    title: "Backup finished",
    body: "Nightly snapshot, 118 GB",
    tone: "success",
  },
  { title: "Cert renews 02:00", body: "Gateway, no action needed" },
];

/** Most a pager holds before Send one stops: its count reads two digits. */
const MOST = 12;

/**
 * The Basinworks on-call pager: whoever holds it this week gets the
 * database, deploy and disk alerts here, and reads them one at a time.
 */
export function BeeperDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [notices, setNotices] = React.useState<BeeperNotice[]>(FIRST);
  const [sent, setSent] = React.useState(0);
  const [last, setLast] = React.useState("on call · basinworks");

  const pager = (
    <Beeper
      label="Basinworks on-call pager"
      notices={notices}
      onDismiss={(id) => {
        const gone = notices.find((n) => n.id === id);
        setNotices((list) => list.filter((n) => n.id !== id));
        if (gone) setLast(`read ${gone.title.toLowerCase()}`);
      }}
      onClearAll={() => {
        setNotices([]);
        setLast("cleared all");
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full justify-center">{pager}</div>;

  const next = MORE[sent % MORE.length] as Omit<BeeperNotice, "id">;
  const full = notices.length >= MOST;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {pager}
      <div className="flex items-center justify-center">
        <button
          type="button"
          disabled={full}
          onClick={() => {
            setNotices((list) => [...list, { ...next, id: `sent-${sent}` }]);
            setSent((s) => s + 1);
            setLast(`paged: ${next.title.toLowerCase()}`);
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
        <span className="text-signal">
          {notices.length === 0
            ? "nothing waiting"
            : `${notices.length} waiting`}
        </span>{" "}
        · {last}
      </p>
    </div>
  );
}
