"use client";

import * as React from "react";

import { SummaryFold, type FoldMessage } from "@/registry/ui/summary-fold";

const ASSISTANT = "Fernworks Model 3";

/** A Coldbrook Bank statement thread about a duplicate charge, oldest first. */
// prettier-ignore
const OLDER: FoldMessage[] = [
  { id: "f1", role: "user", text: "There are two charges of 84.00 on 3 Mar from the same shop. One should not be there." },
  { id: "f2", role: "assistant", text: "I see both on the card ending 2210. Were you at the shop twice that day?" },
  { id: "f3", role: "user", text: "No, once. The terminal timed out and I tapped again." },
  { id: "f4", role: "assistant", text: "Then the second is a duplicate. I can raise a refund for 84.00 now." },
  { id: "f5", role: "user", text: "Please do." },
  { id: "f6", role: "assistant", text: "Raised. The refund goes back to the card ending 2210 in three to five days." },
];

const SUMMARY =
  "Duplicate charge of 84.00 on 3 Mar confirmed; refund raised to the Coldbrook Bank card ending 2210; three to five days.";

const NEWEST = "Thanks. Will I get a note when it lands?";

export function SummaryFoldDemo() {
  const [folded, setFolded] = React.useState(true);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <SummaryFold
          label="Coldbrook Bank · duplicate charge"
          messages={OLDER}
          summary={SUMMARY}
          folded={folded}
          onFoldedChange={setFolded}
          assistantName={ASSISTANT}
        />
        {/* The newest message sits beneath the fold, outside the summary. */}
        <div className="flex flex-col gap-0.5 rounded-2 border border-hairline bg-surface-0 px-2.5 py-2">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            You
          </span>
          <span className="text-sm leading-5 text-foreground">{NEWEST}</span>
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {folded
          ? `Folded · ${OLDER.length} messages in the summary`
          : `Unfolded · ${OLDER.length} messages shown`}
      </p>
    </div>
  );
}
