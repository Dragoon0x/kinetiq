"use client";

import * as React from "react";

import { HistoryScrub, type HistoryMessage } from "@/registry/ui/history-scrub";

const ASSISTANT = "Fernworks Model 3";

/** The Basinworks yard moving its invoicing to Waylight Pay, over three days. */
// prettier-ignore
const THREAD: HistoryMessage[] = [
  { id: "m1", role: "user", date: "Mon 2 Mar", text: "We want to move the yard's invoicing to Waylight Pay. Where do we start?" },
  { id: "m2", role: "assistant", date: "Mon 2 Mar", text: "Start with the yard office account. I can draft the setup steps and the net 30 terms." },
  { id: "m3", role: "user", date: "Mon 2 Mar", text: "Draft them. Invoices go to the yard office, not the front desk." },
  { id: "m4", role: "assistant", date: "Tue 3 Mar", text: "Drafted. The yard office is the billing contact and PDF invoices are the default." },
  { id: "m5", role: "user", date: "Tue 3 Mar", text: "Can the first invoice go out this week?" },
  { id: "m6", role: "assistant", date: "Tue 3 Mar", text: "Yes. It is queued for Thursday, net 30 from the ship date." },
  { id: "m7", role: "user", date: "Thu 5 Mar", text: "Did the invoice go out?" },
  { id: "m8", role: "assistant", date: "Thu 5 Mar", text: "It went out at 09:10 to the yard office. Payment is due 4 Apr through Waylight Pay." },
];

export function HistoryScrubDemo() {
  const [index, setIndex] = React.useState(THREAD.length - 1);
  const current = THREAD[index];
  const who = current?.role === "assistant" ? ASSISTANT : "You";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HistoryScrub
        label="Basinworks yard · invoicing"
        messages={THREAD}
        value={index}
        onValueChange={setIndex}
        assistantName={ASSISTANT}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Msg {index + 1} / {THREAD.length} · {current?.date ?? ""} · {who}
      </p>
    </div>
  );
}
