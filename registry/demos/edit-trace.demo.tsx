"use client";

import * as React from "react";

import { EditTrace, type EditVersion } from "@/registry/ui/edit-trace";

const VERSIONS: EditVersion[] = [
  { text: "Refund window is 14 days.", at: "14:02" },
  { text: "Refund window is 30 days.", at: "14:07" },
  {
    text: "Refund window is 30 days from delivery, not from the order date.",
    at: "14:12",
  },
];

const EDITS = ["not edited", "edited once", "edited twice"];

export function EditTraceDemo() {
  const [count, setCount] = React.useState(1);
  const [open, setOpen] = React.useState(false);
  const exhausted = count >= VERSIONS.length;

  const button =
    "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <EditTrace
        label="Ops thread"
        author="Marta"
        versions={VERSIONS.slice(0, count)}
        open={open}
        onOpenChange={setOpen}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={exhausted}
          onClick={() =>
            setCount((prev) => Math.min(VERSIONS.length, prev + 1))
          }
          className={button}
        >
          Apply next edit
        </button>
        <button
          type="button"
          disabled={count === 1}
          onClick={() => {
            setCount(1);
            setOpen(false);
          }}
          className={button}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Version {count} of {VERSIONS.length} ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {EDITS[count - 1] ?? "edited"}
        </span>{" "}
        · trace {open && count > 1 ? "open" : "folded"}
      </p>
    </div>
  );
}
