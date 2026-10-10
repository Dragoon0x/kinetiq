"use client";

import * as React from "react";

import { Gift, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PeelLabel } from "@/registry/ui/peel-label";

export const tweaks = defineTweaks({
  curl: {
    kind: "range",
    label: "Curl",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  shadow: {
    kind: "range",
    label: "Shadow",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  corner: {
    kind: "choice",
    label: "Corner",
    default: "bottom-right",
    options: ["top-left", "top-right", "bottom-left", "bottom-right"],
    names: {
      "top-left": "Top L",
      "top-right": "Top R",
      "bottom-left": "Low L",
      "bottom-right": "Low R",
    },
  },
});

const CODE = "CBK-7Q4M-2HX9";

function Face() {
  return (
    <span className="flex flex-col items-center gap-1.5 text-center">
      <Gift aria-hidden className="size-4 shrink-0" />
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase">
        Peel to reveal
      </span>
      <span className="font-mono text-[9px] tracking-[0.08em] uppercase opacity-70">
        Coldbrook · one use
      </span>
    </span>
  );
}

/**
 * A Coldbrook gift card whose redemption code sits under a peel-off label:
 * lift the corner to read it, and the Copy button under it wakes up once
 * the label is off.
 */
export function PeelLabelDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [peeled, setPeeled] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  const card = (
    <div className="w-full max-w-xs rounded-4 border border-hairline bg-card p-3 shadow-[0_12px_32px_-22px_color-mix(in_oklab,black_70%,transparent)]">
      <div className="flex items-baseline justify-between gap-3 px-1 pb-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · gift card
        </p>
        <p className="font-mono text-sm text-foreground tabular-nums">$50.00</p>
      </div>
      <PeelLabel
        label={<Face />}
        peeled={peeled}
        onPeeledChange={(next) => {
          setPeeled(next);
          if (!next) setCopied(false);
        }}
        onProgressChange={setProgress}
        sound={sound}
        {...values}
      >
        <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-hairline-strong bg-surface-2 px-3">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Your code
          </p>
          <p className="font-mono text-sm tracking-[0.12em] text-foreground">
            {CODE}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(CODE).catch(() => {});
              setCopied(true);
            }}
            className="inline-flex h-7 items-center rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
      </PeelLabel>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{card}</div>;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex w-full justify-center">{card}</div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {peeled ? (
            <>
              <span className="text-signal">label off</span> · code revealed
            </>
          ) : progress > 0.01 ? (
            <>
              <span className="text-signal">peeling</span> ·{" "}
              {Math.round(progress * 100)}%
            </>
          ) : (
            <>
              <span className="text-signal">label sealed</span> · drag its
              corner
            </>
          )}
        </p>
        <button
          type="button"
          aria-disabled={!peeled}
          onClick={() => {
            if (!peeled) return;
            setPeeled(false);
            setCopied(false);
            setProgress(0);
          }}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-not-allowed aria-disabled:text-ink-3 aria-disabled:hover:bg-transparent"
        >
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
          Restick
        </button>
      </div>
    </div>
  );
}
