"use client";

import * as React from "react";

import { StickyNote } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PaperBall } from "@/registry/ui/paper-ball";

export const tweaks = defineTweaks({
  hold: {
    kind: "range",
    label: "Hold",
    default: 600,
    min: 200,
    max: 1500,
    step: 100,
    unit: "ms",
  },
  crumple: {
    kind: "range",
    label: "Crumple",
    default: 0.8,
    min: 0.2,
    max: 1,
    step: 0.1,
  },
  arc: {
    kind: "range",
    label: "Arc",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Status = "idle" | "crumpling" | "ready" | "missed" | "in";

/**
 * A Basinworks desk: a reminder that has been dealt with goes in the
 * basket. Hold the note to crumple it, then toss it or throw it in.
 */
export function PaperBallDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [discarded, setDiscarded] = React.useState(false);
  const [status, setStatus] = React.useState<Status>("idle");
  const [tenths, setTenths] = React.useState(0);

  const ball = (
    <PaperBall
      text="Call Basinworks about the March invoice"
      discarded={discarded}
      onDiscardedChange={setDiscarded}
      onProgressChange={(t) => {
        setTenths(t);
        setStatus((s) =>
          t > 0 && t < 10 && (s === "idle" || s === "crumpling")
            ? "crumpling"
            : t === 0 && s === "crumpling"
              ? "idle"
              : s,
        );
      }}
      onCrumpleChange={(crumpled) => setStatus(crumpled ? "ready" : "idle")}
      onThrow={(result) => setStatus(result === "in" ? "in" : "missed")}
      sound={sound}
      className="self-center"
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{ball}</div>;
  }

  const line: Record<Status, [string, string]> = {
    idle: ["note up", " · hold it to crumple"],
    crumpling: [`crumpling ${tenths * 10}%`, " · keep holding"],
    ready: ["ball ready", " · let go to toss, or throw it"],
    missed: ["missed", " · try again"],
    in: ["in the bin", " · note discarded"],
  };
  const [lead, rest] = line[status];

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {ball}
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
          aria-disabled={!discarded}
          onClick={() => {
            if (!discarded) return;
            setDiscarded(false);
            setStatus("idle");
            setTenths(0);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-card"
        >
          <StickyNote aria-hidden className="size-3.5 shrink-0" />
          New note
        </button>
      </div>
    </div>
  );
}
