"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DitherCurtain } from "@/registry/ui/dither-curtain";

export const tweaks = defineTweaks({
  matrix: {
    kind: "choice",
    label: "Matrix",
    default: "4x4",
    options: ["2x2", "4x4", "8x8"],
    names: { "2x2": "2×2", "4x4": "4×4", "8x8": "8×8" },
  },
  scale: {
    kind: "range",
    label: "Scale",
    default: 4,
    min: 2,
    max: 10,
    step: 1,
    unit: "px",
  },
  trigger: {
    kind: "choice",
    label: "Trigger",
    default: "inView",
    options: ["mount", "inView", "hover"],
    names: { mount: "Mount", inView: "In view", hover: "Hover" },
  },
});

/**
 * Basinworks' private beta: the invitation card arrives behind a veil of
 * ordered dots that draws back as it comes into view.
 */
export function DitherCurtainDemo({
  chrome = true,
  // The veil is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [take, setTake] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const trigger = values.trigger ?? "inView";
  // Any tweak replays the reveal, so every one of them shows.
  const key = `${take}-${values.matrix ?? ""}-${values.scale ?? ""}-${trigger}`;

  const card = (
    <DitherCurtain
      key={key}
      once={trigger !== "hover"}
      className="w-full rounded-3"
      onRevealChange={setOpen}
      {...values}
    >
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card p-5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks · private beta
        </p>
        <div className="flex flex-col gap-1">
          <p className="text-xl leading-tight font-semibold tracking-[-0.01em] text-foreground">
            The quiet water report
          </p>
          <p className="text-sm text-ink-2">
            Readings from every basin, sent at dawn.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Request access
          </button>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            412 on the list
          </span>
        </div>
      </div>
    </DitherCurtain>
  );

  if (!chrome) return <div className="flex w-full max-w-md">{card}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {card}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{open ? "revealed" : "veiled"}</span>
          {open
            ? " · the card is yours"
            : trigger === "hover"
              ? " · hover or focus to lift"
              : " · move over it to peek"}
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTake((t) => t + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
