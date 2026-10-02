"use client";

import * as React from "react";

import { FileText } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { BinLid, type BinLidState } from "@/registry/ui/bin-lid";

export const tweaks = defineTweaks({
  window: {
    kind: "range",
    label: "Window",
    default: 5000,
    min: 2000,
    max: 10000,
    step: 1000,
    unit: "ms",
  },
  arc: {
    kind: "range",
    label: "Arc",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  puff: {
    kind: "range",
    label: "Puff",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const DRAFTS = [
  { name: "Q3 forecast draft", meta: "edited 3 min ago" },
  { name: "Basin Road survey notes", meta: "edited yesterday" },
  { name: "Coldbrook pitch outline", meta: "edited Monday" },
  { name: "Gauge calibration log", meta: "edited last week" },
] as const;

/**
 * Clearing old drafts out of a Fernworks Drive folder: each one goes in the
 * bin with a few seconds to change your mind, and the next takes its row.
 */
export function BinLidDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<BinLidState>("idle");
  const [failNext, setFailNext] = React.useState(false);
  const [removed, setRemoved] = React.useState(0);
  const draft = DRAFTS[index % DRAFTS.length] ?? DRAFTS[0];
  const seconds = Math.round((values.window ?? 5000) / 1000);
  const binned =
    phase === "armed" || phase === "pending" || phase === "success";

  const onDelete = () => {
    const fail = failNext;
    if (fail) setFailNext(false);
    return new Promise<void>((resolve, reject) => {
      window.setTimeout(
        () => (fail ? reject(new Error("Offline")) : resolve()),
        700,
      );
    });
  };

  const onStateChange = (next: BinLidState) => {
    if (next === "success") setRemoved((n) => n + 1);
    // Once "Deleted" has held, the next draft moves up into the row.
    if (next === "idle" && phase === "success") setIndex((i) => i + 1);
    setPhase(next);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-card pl-3">
        <FileText aria-hidden className="size-4 shrink-0 text-ink-3" />
        <div
          className={cn(
            "min-w-0 flex-1 transition-opacity duration-200",
            binned && "opacity-45",
          )}
        >
          <p
            className="truncate text-sm font-medium text-foreground"
            title={draft.name}
          >
            {draft.name}
          </p>
          <p className="truncate text-xs text-ink-3">
            Fernworks Drive · {draft.meta}
          </p>
        </div>
        <BinLid
          itemName={draft.name}
          onDelete={onDelete}
          onStateChange={onStateChange}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "armed" ? (
              <>
                <span className="text-signal">in the bin</span> · undo within{" "}
                {seconds} s
              </>
            ) : phase === "pending" ? (
              <span className="text-signal">deleting</span>
            ) : phase === "success" ? (
              <>
                <span className="text-signal">deleted</span> · {removed}{" "}
                {removed === 1 ? "draft" : "drafts"} removed
              </>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">not deleted</span> · press retry
              </>
            ) : (
              <>
                <span className="text-signal">in drafts</span> · press delete
              </>
            )}
          </p>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((v) => !v)}
            className={cn(
              "inline-flex h-7 shrink-0 cursor-pointer items-center rounded-2 border px-2.5 text-xs transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              failNext
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            Fail next
          </button>
        </div>
      ) : null}
    </div>
  );
}
