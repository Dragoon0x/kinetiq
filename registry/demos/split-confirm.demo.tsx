"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  SplitConfirm,
  type SplitConfirmCancelReason,
} from "@/registry/ui/split-confirm";

export const tweaks = defineTweaks({
  timeout: {
    kind: "range",
    label: "Timeout",
    default: 4,
    min: 2,
    max: 8,
    step: 0.5,
    unit: "s",
  },
  split: {
    kind: "choice",
    label: "Split",
    default: "crack",
    options: ["crack", "slide"],
    names: { crack: "Crack", slide: "Slide" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "danger",
    options: ["danger", "neutral"],
    names: { danger: "Danger", neutral: "Neutral" },
  },
});

const COPY = {
  danger: {
    label: "Delete branch",
    confirm: "Delete",
    done: "Branch deleted",
    after: "Deleted just now",
    verb: "deleted",
  },
  neutral: {
    label: "Merge branch",
    confirm: "Merge",
    done: "Branch merged",
    after: "Merged into main just now",
    verb: "merged",
  },
} as const;

/**
 * Fieldline's branch settings: release/2.14 has shipped, and the branch can
 * go. Deleting it asks once, by splitting; an undo sits beside the result.
 */
export function SplitConfirmDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [done, setDone] = React.useState(false);
  const [last, setLast] = React.useState<SplitConfirmCancelReason | null>(null);
  const copy = COPY[values.tone ?? "danger"] ?? COPY.danger;
  const seconds = values.timeout ?? 4;

  const line = done
    ? [`branch ${copy.verb}`, " · undo restores it"]
    : last === "timeout"
      ? ["timed out", ` · nothing ${copy.verb}`]
      : last
        ? ["cancelled", ` · nothing ${copy.verb}`]
        : ["ready", ` · the question stays open ${seconds} s`];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3 border border-hairline bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-sm text-foreground">release/2.14</p>
          <p className="text-xs text-ink-3">
            {done ? (
              <>
                {copy.after} ·{" "}
                <button
                  type="button"
                  onClick={() => {
                    setDone(false);
                    setLast(null);
                  }}
                  className="rounded-1 text-foreground underline underline-offset-2 outline-none hover:text-cobalt-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Undo
                </button>
              </>
            ) : (
              "Shipped 3 days ago · 42 commits"
            )}
          </p>
        </div>
        <SplitConfirm
          label={copy.label}
          confirmLabel={copy.confirm}
          confirmedLabel={copy.done}
          confirmed={done}
          onConfirm={() => setDone(true)}
          onCancel={setLast}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line[0]}</span>
          {line[1]}
        </p>
      ) : null}
    </div>
  );
}
