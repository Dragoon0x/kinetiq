"use client";

import * as React from "react";

import { ReactionPicker } from "@/registry/ui/reaction-picker";

/** Seeded tally from the rest of the depot, so the row starts with weight. */
const BASE = { spark: 3, watching: 1 };

const LABELS: Record<string, string> = {
  spark: "Spark",
  agree: "Agree",
  lift: "Lift",
  watching: "Watching",
  question: "Question",
};

export function ReactionPickerDemo() {
  const [picked, setPicked] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);

  const total =
    Object.values(BASE).reduce((sum, count) => sum + count, 0) + picked.length;
  const yours = picked.map((id) => LABELS[id] ?? id).join(", ");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 pt-6">
      <p className="px-1 text-[11px] leading-4 text-ink-3">
        Point at the message, or press React, and the bar rises.
      </p>

      <ReactionPicker
        label="Message from Rui with quick reactions"
        sender="Rui"
        time="07:44"
        text="The loose crate at gate B has no label and the docket is one weight short. I can hold it until Marta signs."
        baseCounts={BASE}
        picked={picked}
        onPickedChange={setPicked}
        open={open}
        onOpenChange={setOpen}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <span className="text-signal">picker open</span>
        ) : (
          "picker closed"
        )}
        {" · yours "}
        {yours === "" ? "none" : yours}
        {` · ${total} reactions`}
      </p>
    </div>
  );
}
