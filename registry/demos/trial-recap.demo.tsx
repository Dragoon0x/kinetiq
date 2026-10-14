"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTrialEndsAt,
  defaultTrialNow,
  defaultTrialPlans,
  defaultTrialQuietUsage,
  defaultTrialUsage,
  TrialRecap,
  trialTimeLeft,
  type TrialStatus,
} from "@/registry/ui/trial-recap";

export const tweaks = defineTweaks({
  tileStyle: {
    kind: "choice",
    label: "Numbers",
    default: "tiles",
    options: ["tiles", "rows"],
    names: { tiles: "Tiles", rows: "Rows" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

/**
 * Three days before a paving outfit's Fieldline trial ends: sixty jobs, four
 * crews and nine invoices, read against Starter and Pro.
 */
export function TrialRecapDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [plan, setPlan] = React.useState<string | null>(
    defaultTrialPlans.find((p) => p.recommended)?.id ?? null,
  );
  const [status, setStatus] = React.useState<TrialStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [quiet, setQuiet] = React.useState(false);
  const [last, setLast] = React.useState<string | null>(null);
  const [epoch, setEpoch] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = (fail: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setFailNext(false);
    }, 900);
  };

  const reset = () => {
    setPlan(defaultTrialPlans.find((p) => p.recommended)?.id ?? null);
    setLast(null);
    setQuiet(false);
    setEpoch((e) => e + 1);
    load(false);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <TrialRecap height={540} {...values} />
      </div>
    );
  }

  const left = trialTimeLeft(defaultTrialNow, defaultTrialEndsAt);
  const planName =
    defaultTrialPlans.find((p) => p.id === plan)?.name.toLowerCase() ?? "none";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <TrialRecap
        key={epoch}
        height={560}
        usage={quiet ? defaultTrialQuietUsage : defaultTrialUsage}
        value={plan}
        onChange={setPlan}
        onChoose={(p) => setLast(`keeping going on ${p.name.toLowerCase()}`)}
        onRemindLater={() => setLast("reminder set")}
        status={status}
        onRetry={() => load(false)}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status === "ready" ? (last ?? `${planName} chosen`) : status}
          </span>{" "}
          · {left.days}d {left.hours}h left ·{" "}
          {quiet ? "quiet trial" : `${defaultTrialUsage.jobs} jobs`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => load(failNext)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-warn aria-pressed:text-warn"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => {
              setQuiet((q) => !q);
              setEpoch((e) => e + 1);
            }}
            aria-pressed={quiet}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-signal aria-pressed:text-signal"
          >
            Quiet trial
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
