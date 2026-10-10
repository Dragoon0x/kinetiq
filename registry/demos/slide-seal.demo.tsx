"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SlideSeal } from "@/registry/ui/slide-seal";

export const tweaks = defineTweaks({
  threshold: {
    kind: "range",
    label: "Threshold",
    default: 0.85,
    min: 0.6,
    max: 0.95,
    step: 0.05,
  },
  seal: {
    kind: "choice",
    label: "Seal",
    default: "crimson",
    options: ["crimson", "forest", "cobalt", "amber"],
    names: {
      crimson: "Crimson",
      forest: "Forest",
      cobalt: "Cobalt",
      amber: "Amber",
    },
  },
  label: {
    kind: "choice",
    label: "Label",
    default: "Slide to seal",
    options: [
      "Slide to sign",
      "Slide to seal",
      "Slide to send",
      "Slide to accept",
    ],
    names: {
      "Slide to sign": "Sign",
      "Slide to seal": "Seal",
      "Slide to send": "Send",
      "Slide to accept": "Accept",
    },
  },
});

const DONE: Record<string, [string, string]> = {
  "Slide to sign": ["Signed", "signed"],
  "Slide to seal": ["Sealed", "sealed"],
  "Slide to send": ["Sent", "sent"],
  "Slide to accept": ["Accepted", "accepted"],
};

/**
 * A Coldbrook offer letter, closed the old way: slide the stamp across and
 * press the wax.
 */
export function SlideSealDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sealed, setSealed] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const label = values.label ?? "Slide to seal";
  const [doneLabel, doneWord] = DONE[label] ?? ["Sealed", "sealed"];

  const letter = (
    <div className="flex w-full max-w-md flex-col gap-3 self-center rounded-3 border border-hairline bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Offer · Coldbrook
        </p>
        <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          Ref 1511
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-base leading-snug font-semibold text-foreground">
          Field engineer
        </p>
        <p className="truncate text-xs text-ink-2">
          Starts 3 Nov · Ridge office
        </p>
      </div>
      <SlideSeal
        sealed={sealed}
        onSealedChange={setSealed}
        onProgressChange={setProgress}
        label={label}
        sealedLabel={doneLabel}
        monogram="C"
        sound={sound}
        className="-mx-1.5 -mb-1.5 max-w-none"
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{letter}</div>;
  }

  const [lead, rest] = sealed
    ? [doneWord, " · offer accepted"]
    : progress > 0
      ? [`slide ${Math.round(progress * 100)}%`, " · let go past the mark"]
      : ["open", ` · ${label.toLowerCase()}`];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {letter}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{lead}</span>
          {rest}
        </p>
        {/* Always present, so pressing it never drops focus to the page. */}
        <button
          type="button"
          aria-disabled={!sealed}
          onClick={() => {
            if (!sealed) return;
            setSealed(false);
            setProgress(0);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-card"
        >
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
          Reset
        </button>
      </div>
    </div>
  );
}
