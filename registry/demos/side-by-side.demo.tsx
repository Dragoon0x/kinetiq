"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultComparisonAnswers,
  SideBySide,
  type ComparisonVote,
} from "@/registry/ui/side-by-side";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 3,
    step: 0.25,
    unit: "×",
  },
  diff: {
    kind: "choice",
    label: "Diff",
    default: "phrases",
    options: ["phrases", "sentences", "off"],
    names: { phrases: "Phrases", sentences: "Sentences", off: "Off" },
  },
  vote: {
    kind: "choice",
    label: "Vote",
    default: "pick",
    options: ["pick", "scale"],
    names: { pick: "Three stops", scale: "Five stops" },
  },
});

const [A, B] = defaultComparisonAnswers;

/**
 * Gaugeworks' evaluation desk: one prompt, two models, and a reviewer who
 * picks the better answer and says why.
 */
export function SideBySideDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [vote, setVote] = React.useState<ComparisonVote | null>(null);
  const [done, setDone] = React.useState<string[]>([]);
  const [lastTime, setLastTime] = React.useState<number | null>(null);

  const surface = (
    <SideBySide
      value={vote}
      onValueChange={setVote}
      onRerun={() => {
        setVote(null);
        setDone([]);
        setLastTime(null);
      }}
      onFinish={(id, stats) => {
        setDone((d) => (d.includes(id) ? d : [...d, id]));
        setLastTime(stats.totalMs);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const name = (id: string) => (id === A.id ? A.model : B.model).toLowerCase();
  const winner =
    vote && vote.choice !== "tie"
      ? `${vote.choice}${vote.margin === 2 ? " much" : ""} better`
      : vote
        ? "a tie"
        : null;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {surface}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {winner ? (
          <>
            <span className="text-signal">voted {winner}</span>
            {vote?.reason ? ` · ${vote.reason.toLowerCase()}` : ""}
          </>
        ) : done.length === 2 ? (
          <>
            <span className="text-signal">both finished</span> · drag the puck
            toward the better answer
          </>
        ) : done.length === 1 && done[0] ? (
          <>
            <span className="text-signal">{name(done[0])} finished</span>
            {lastTime !== null ? ` in ${(lastTime / 1000).toFixed(1)} s` : ""} ·
            the other is still writing
          </>
        ) : (
          <>
            <span className="text-signal">streaming both answers</span> · at{" "}
            {values.speed ?? 1}× speed
          </>
        )}
      </p>
    </div>
  );
}
