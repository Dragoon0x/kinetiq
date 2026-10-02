"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { RoleCard } from "@/registry/ui/role-card";

export const tweaks = defineTweaks({
  band: {
    kind: "choice",
    label: "Band",
    default: "sweep",
    options: ["sweep", "center", "ends"],
    names: { sweep: "Sweep", center: "From middle", ends: "Calipers" },
  },
  crease: {
    kind: "range",
    label: "Crease",
    default: 40,
    min: 32,
    max: 64,
    step: 8,
    unit: "px",
  },
  expand: {
    kind: "choice",
    label: "Expand",
    default: "inline",
    options: ["inline", "sheet"],
    names: { inline: "Inline", sheet: "Sheet" },
  },
});

/**
 * A listing on Fieldline Jobs: a design role at Gaugeworks in Lisbon. Saving
 * folds the corner; applying sends after a short wait, or fails when asked.
 */
export function RoleCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [saved, setSaved] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [applied, setApplied] = React.useState(false);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);

  const onApply = () => {
    const fail = failNext;
    if (fail) setFailNext(false);
    return new Promise<void>((resolve, reject) => {
      window.setTimeout(
        () => (fail ? reject(new Error("Offline")) : resolve()),
        900,
      );
    });
  };

  const reset = () => {
    setSaved(false);
    setOpen(false);
    setApplied(false);
    setFailNext(false);
    setRound((n) => n + 1);
  };

  const small = cn(
    "inline-flex h-7 shrink-0 cursor-pointer items-center rounded-2 border px-2.5 text-xs transition-colors outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <RoleCard
        key={round}
        saved={saved}
        onSavedChange={setSaved}
        open={open}
        onOpenChange={setOpen}
        applied={applied}
        onAppliedChange={setApplied}
        onApply={onApply}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex w-full items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{saved ? "saved" : "not saved"}</span>
            {` · ${applied ? "applied" : open ? "applying" : "not applied"}`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-pressed={failNext}
              onClick={() => setFailNext((v) => !v)}
              className={cn(
                small,
                failNext
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              Fail next
            </button>
            <button
              type="button"
              onClick={reset}
              className={cn(
                small,
                "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
