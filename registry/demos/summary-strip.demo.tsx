"use client";

import * as React from "react";

import { SummaryStrip } from "@/registry/ui/summary-strip";

/** Three seeded readings of the same thread, walked by index. */
const READINGS = [
  {
    text: "Two crates are short a label and the gate opens at eleven.",
    covers: 46,
  },
  {
    text: "The Waylight Pay hold cleared, so pallet 4471 leaves on the eleven o'clock run.",
    covers: 52,
  },
  {
    text: "Marta has the handover sheet; nothing is outstanding on the dock.",
    covers: 58,
  },
];

const THREAD = [
  { id: "t1", author: "Rui", text: "Dock three is free from nine." },
  { id: "t2", author: "Marta", text: "Two crates are short a label." },
  { id: "t3", author: "Ines", text: "Waylight Pay is holding the yard fee." },
  { id: "t4", author: "Rui", text: "Gate opens at eleven, not half past." },
  { id: "t5", author: "Marta", text: "Handover sheet is on the desk." },
];

/** The host's scripted think time before a new reading arrives. */
const WRITE_MS = 900;

export function SummaryStripDemo() {
  const [index, setIndex] = React.useState(0);
  const [writing, setWriting] = React.useState(false);
  const [settled, setSettled] = React.useState(true);

  React.useEffect(() => {
    if (!writing) return;
    const id = window.setTimeout(() => {
      setIndex((step) => (step + 1) % READINGS.length);
      setWriting(false);
    }, WRITE_MS);
    return () => window.clearTimeout(id);
  }, [writing]);

  const reading = READINGS[index] ?? READINGS[0];

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <SummaryStrip
        summary={reading?.text ?? ""}
        covers={reading?.covers}
        refreshing={writing}
        onRefresh={() => {
          setWriting(true);
          setSettled(false);
        }}
        onSettle={() => setSettled(true)}
      />

      <ol
        role="list"
        aria-label="Basinworks dock thread"
        className="flex flex-col gap-1.5"
      >
        {THREAD.map((message) => (
          <li
            key={message.id}
            className="rounded-2 border border-hairline bg-surface-2/60 px-2.5 py-1.5"
          >
            <p className="text-[11px] font-medium text-ink-3">
              {message.author}
            </p>
            <p className="text-sm leading-snug text-foreground">
              {message.text}
            </p>
          </li>
        ))}
      </ol>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {writing ? (
          <span className="text-signal">Writing</span>
        ) : (
          `Summary ${index + 1} of ${READINGS.length}`
        )}
        {` · ${reading?.covers ?? 0} messages · ${settled ? "settled" : "typing"}`}
      </p>
    </div>
  );
}
