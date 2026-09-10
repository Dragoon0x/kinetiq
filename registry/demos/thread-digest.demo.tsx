"use client";

import * as React from "react";

import { ThreadDigest, type DigestThread } from "@/registry/ui/thread-digest";

const HOURS = ["6 am", "7 am", "8 am", "9 am", "10 am", "11 am"];

const THREADS: DigestThread[] = [
  {
    id: "yard",
    name: "Coldbrook yard",
    preview: "Dock three is free from nine.",
    unread: 6,
    activity: 60,
    counts: [1, 0, 2, 5, 3, 1],
  },
  {
    id: "dock",
    name: "Basinworks dock",
    preview: "Two pallets, both labelled.",
    unread: 3,
    activity: 58,
    counts: [0, 1, 1, 2, 4, 2],
  },
  {
    id: "pay",
    name: "Waylight Pay ops",
    preview: "Yard fee is 4471-CB.",
    unread: 9,
    activity: 55,
    counts: [3, 6, 2, 1, 0, 1],
  },
  {
    id: "returns",
    name: "Fernworks returns",
    preview: "Three crates back Friday.",
    unread: 0,
    activity: 52,
    counts: [1, 1, 0, 0, 1, 0],
  },
  {
    id: "night",
    name: "Night shift",
    preview: "Loader booked until half past.",
    unread: 5,
    activity: 48,
    counts: [4, 2, 1, 0, 0, 0],
  },
];

/** A seeded script, walked by index — no clock, no randomness. */
const SCRIPT = [
  { id: "returns", preview: "Marta: two crates are short a label." },
  { id: "night", preview: "Ines: handover sheet is on the desk." },
  { id: "dock", preview: "Rui: loader is free after the morning run." },
  { id: "pay", preview: "Ines: the yard fee cleared this morning." },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ThreadDigestDemo() {
  const [threads, setThreads] = React.useState<DigestThread[]>(THREADS);
  const [step, setStep] = React.useState(0);
  const [opened, setOpened] = React.useState<string | null>(null);

  const deliver = () => {
    const line = SCRIPT[step % SCRIPT.length];
    if (!line) return;
    setStep(step + 1);
    setThreads((prev) => {
      const top = prev.reduce((max, one) => Math.max(max, one.activity), 0);
      return prev.map((thread) =>
        thread.id === line.id
          ? {
              ...thread,
              preview: line.preview,
              unread: thread.unread + 1,
              activity: top + 1,
              counts: thread.counts.map((count, index) =>
                index === thread.counts.length - 1 ? count + 1 : count,
              ),
            }
          : thread,
      );
    });
  };

  const open = (id: string) => {
    setOpened(id);
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === id ? { ...thread, unread: 0 } : thread,
      ),
    );
  };

  const moved = threads.filter((thread) => thread.unread > 0).length;
  const messages = threads.reduce((sum, thread) => sum + thread.unread, 0);
  const top = threads.reduce<DigestThread | null>(
    (best, thread) =>
      best === null || thread.activity > best.activity ? thread : best,
    null,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ThreadDigest
        label="Coldbrook Logistics threads"
        threads={threads}
        bucketLabels={HOURS}
        maxHeight={300}
        onOpen={open}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={deliver} className={chip}>
          Deliver a message
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{top?.name ?? "no thread"}</span>
        {` · ${moved === 1 ? "1 thread" : `${moved} threads`} moved · ${messages} unread`}
        {opened ? " · opened" : null}
      </p>
    </div>
  );
}
