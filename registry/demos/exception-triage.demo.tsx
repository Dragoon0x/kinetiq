"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTriageGroups,
  ExceptionTriage,
  pendingTriage,
  type TriageDecision,
  type TriageStatus,
} from "@/registry/ui/exception-triage";

export const tweaks = defineTweaks({
  density: {
    kind: "choice",
    label: "Cards",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  sparkline: {
    kind: "choice",
    label: "24h",
    default: "bars",
    options: ["bars", "line", "none"],
    names: { bars: "Bars", line: "Line", none: "Off" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Green", ink: "Ink" },
  },
});

/**
 * Monday morning on Gaugeworks Pay: fourteen error groups from the weekend,
 * three of them regressions, worked down to an empty inbox one card at a time.
 */
export function ExceptionTriageDemo({
  chrome = true,
  // The inbox is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<TriageDecision[]>([]);
  const [status, setStatus] = React.useState<TriageStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <ExceptionTriage height={540} {...values} />
      </div>
    );
  }

  const open = pendingTriage(defaultTriageGroups, value).length;
  const count = (action: TriageDecision["action"]) =>
    value.filter((d) => d.action === action).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ExceptionTriage
        height={540}
        value={value}
        onChange={setValue}
        status={status}
        onRetry={load}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{open} open</span> · resolved{" "}
          {count("resolve")} · ignored {count("ignore")} · assigned{" "}
          {count("assign")} · snoozed {count("snooze")}
          {status !== "ready" ? ` · ${status}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-hairline-strong aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => setValue([])}
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
