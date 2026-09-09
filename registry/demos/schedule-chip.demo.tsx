"use client";

import * as React from "react";

import {
  ScheduleChip,
  type ScheduleOption,
  type ScheduledMessage,
} from "@/registry/ui/schedule-chip";

/** The desk runs at roughly an hour a second, so a queue can be watched out. */
const OPTIONS: ScheduleOption[] = [
  { id: "tonight", label: "Tonight 18:00", hour: 18, minute: 0, delayMs: 6000 },
  { id: "tomorrow", label: "Tomorrow 9:00", hour: 9, minute: 0, delayMs: 9000 },
  { id: "monday", label: "Monday 9:00", hour: 9, minute: 0, delayMs: 12000 },
];

const LINES = [
  "Marta, the Waylight Pay batch for week 36 is cleared and ready to release.",
  "Rui, gate B needs a second signature before the Basinworks run leaves.",
  "Coldbrook payouts are short one docket. I will chase it in the morning.",
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ScheduleChipDemo() {
  const [draft, setDraft] = React.useState("");
  const [queue, setQueue] = React.useState<ScheduledMessage[]>([]);
  const [sent, setSent] = React.useState<{ id: string; text: string }[]>([]);
  const [last, setLast] = React.useState<"now" | "delivered" | null>(null);
  const [made, setMade] = React.useState(0);

  const land = (id: string, text: string) =>
    setSent((prev) => [...prev, { id, text }].slice(-3));

  const nextLabel = OPTIONS.find(
    (option) => option.id === queue[0]?.optionId,
  )?.label;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {sent.length > 0 ? (
        <ol
          role="list"
          aria-label="Sent from the ops desk"
          className="flex flex-col items-end gap-1.5"
        >
          {sent.map((line) => (
            <li
              key={line.id}
              className="max-w-[88%] rounded-3 rounded-br-1 bg-surface-2 px-3 py-1.5 text-sm leading-5 wrap-break-word text-foreground"
            >
              {line.text}
            </li>
          ))}
        </ol>
      ) : null}

      <ScheduleChip
        label="Message the Waylight Pay desk"
        options={OPTIONS}
        queue={queue}
        draft={draft}
        onDraftChange={setDraft}
        onSend={(text) => {
          setMade(made + 1);
          land(`s${made + 1}`, text);
          setLast("now");
        }}
        onQueue={(text, option) => {
          setMade(made + 1);
          setQueue((prev) => [
            ...prev,
            { id: `q${made + 1}`, text, optionId: option.id },
          ]);
          setLast(null);
        }}
        onDeliver={(id) => {
          // Read the message from this render's queue, never from inside the
          // updater: React may call an updater twice.
          const item = queue.find((message) => message.id === id);
          setQueue((prev) => prev.filter((message) => message.id !== id));
          if (item) land(`d${id}`, item.text);
          setLast("delivered");
        }}
      />

      <button
        type="button"
        onClick={() => setDraft(LINES[sent.length % LINES.length] ?? "")}
        className={chip}
      >
        Paste a line
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {queue.length > 0 ? (
          <>
            <span className="text-signal">{queue.length} queued</span>
            {nextLabel ? ` · next ${nextLabel}` : null}
          </>
        ) : last !== null ? (
          <>
            <span className="text-signal">
              {last === "now" ? "sent now" : "delivered"}
            </span>
            {` · ${sent.length} sent`}
          </>
        ) : (
          "ready · send now"
        )}
      </p>
    </div>
  );
}
