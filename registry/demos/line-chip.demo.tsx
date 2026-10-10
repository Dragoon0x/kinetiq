"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  LineChip,
  type LineChipDirection,
  type LineChipState,
} from "@/registry/ui/line-chip";

export const tweaks = defineTweaks({
  ripple: {
    kind: "range",
    label: "Ripple",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  timer: {
    kind: "range",
    label: "Timer",
    default: 0,
    min: 0,
    max: 600,
    step: 15,
    unit: "s",
  },
  state: {
    kind: "choice",
    label: "State",
    default: "ringing",
    options: ["ringing", "active", "ended"],
    names: { ringing: "Ringing", active: "Active", ended: "Ended" },
  },
});

/** How long the far side takes to pick up a call back. */
const PICK_UP_MS = 2200;

type Call = {
  /** The tweak this call started from: a new tweak value starts over. */
  from: LineChipState;
  state: LineChipState;
  direction: LineChipDirection;
};

/**
 * The Basinworks support desk's call chip: Mara Lind is on the line. Call
 * back rings her, and she picks up a moment later.
 */
export function LineChipDemo({
  chrome = true,
  sound,
  state: tweakState = "ringing",
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [call, setCall] = React.useState<Call | null>(null);
  const timer = React.useRef<number | null>(null);
  const live =
    call && call.from === tweakState
      ? call
      : { from: tweakState, state: tweakState, direction: "incoming" as const };

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onStateChange = (next: LineChipState) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (live.state === "ended" && next === "ringing") {
      setCall({ from: tweakState, state: "ringing", direction: "outgoing" });
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setCall((c) => (c ? { ...c, state: "active" } : c));
      }, PICK_UP_MS);
      return;
    }
    setCall({ from: tweakState, state: next, direction: live.direction });
  };

  const chip = (
    <LineChip
      caller="Mara Lind"
      state={live.state}
      direction={live.direction}
      onStateChange={onStateChange}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks · support line
        </p>
        {chip}
      </div>
    );
  }

  const [lead, rest] =
    live.state === "ringing"
      ? live.direction === "incoming"
        ? ["incoming", "mara lind"]
        : ["calling", "mara lind"]
      : live.state === "active"
        ? ["on call", "mara lind"]
        : ["call ended", "basinworks support"];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks · support line
      </p>
      {chip}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{lead}</span> · {rest}
      </p>
    </div>
  );
}
