"use client";

import * as React from "react";

import { TimeDial, type TimeDialPhase } from "@/registry/ui/time-dial";

const PHASE_COPY: Record<TimeDialPhase, string> = {
  hour: "picking hour",
  minute: "picking minute",
  done: "window set",
};

export function TimeDialDemo() {
  const [start, setStart] = React.useState("08:15");
  const [phase, setPhase] = React.useState<TimeDialPhase>("hour");

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <TimeDial
        label="Fieldline dispatch start"
        value={start}
        onValueChange={setStart}
        onPhaseChange={setPhase}
      />

      <p className="text-center text-xs text-muted-foreground">
        Enter advances hour to minute to done. Escape steps back.
      </p>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Dispatch window opens{" "}
        <span className="text-cobalt-bright">{start}</span> ·{" "}
        {PHASE_COPY[phase]}
      </p>
    </div>
  );
}
