"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AckLadder,
  defaultAckPolicy,
  defaultAckValue,
  type AckAcknowledgement,
  type AckStatus,
  type AckValue,
} from "@/registry/ui/ack-ladder";

export const tweaks = defineTweaks({
  ladderSide: {
    kind: "choice",
    label: "Ladder",
    default: "right",
    options: ["right", "left"],
    names: { right: "Right", left: "Left" },
  },
  rungStyle: {
    kind: "choice",
    label: "Rungs",
    default: "fill",
    options: ["fill", "tick", "bar"],
    names: { fill: "Fill", tick: "Tick", bar: "Bar" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Gaugeworks People has sent Rhea Vance version 3.1 of the device policy:
 * three sections read on an earlier visit, three to go before she can
 * initial it.
 */
export function AckLadderDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<AckValue>(defaultAckValue);
  const [ack, setAck] = React.useState<AckAcknowledgement | null>(null);
  const [status, setStatus] = React.useState<AckStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [seq, setSeq] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setValue(defaultAckValue);
    setAck(null);
    setStatus("ready");
    setFailNext(false);
    setSeq((n) => n + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <AckLadder height={540} {...values} />
      </div>
    );
  }

  const total = defaultAckPolicy.sections.length;
  const read = value.filter((id) =>
    defaultAckPolicy.sections.some((s) => s.id === id),
  ).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <AckLadder
        key={seq}
        height={540}
        value={value}
        onChange={setValue}
        acknowledgement={ack}
        onAcknowledge={setAck}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status === "ready"
              ? `${read} of ${total} sections read`
              : status === "loading"
                ? "loading"
                : "load failed"}
          </span>{" "}
          · {ack ? `acknowledged as ${ack.initials}` : "not acknowledged"}
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
