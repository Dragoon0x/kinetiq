"use client";

import * as React from "react";

import { Plus, RotateCcw, WifiOff } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultWeaveGoals,
  defaultWeavePlan,
  defaultWeaveValue,
  GoalWeave,
  weaveMinutes,
  weaveSteps,
  type WeavePlan,
  type WeaveStatus,
} from "@/registry/ui/goal-weave";

export const tweaks = defineTweaks({
  threadStyle: {
    kind: "choice",
    label: "Threads",
    default: "weave",
    options: ["weave", "lines", "none"],
    names: { weave: "Weave", lines: "Lines", none: "None" },
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

const LOAD_MS = 900;

/**
 * Fieldline's onboarding: a crew-tracking, faster-invoicing business picks
 * its goals and watches the first steps weave into a plan for the week.
 */
export function GoalWeaveDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [picked, setPicked] = React.useState<string[]>(defaultWeaveValue);
  const [plan, setPlan] = React.useState<WeavePlan>(defaultWeavePlan);
  const [status, setStatus] = React.useState<WeaveStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [continued, setContinued] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <GoalWeave height={540} {...values} />
      </div>
    );
  }

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    const fail = failNext;
    setFailNext(false);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, LOAD_MS);
  };

  const reset = () => {
    setPicked(defaultWeaveValue);
    setPlan(defaultWeavePlan);
    setContinued(0);
  };

  const steps = weaveSteps(defaultWeaveGoals, picked, plan);
  const minutes = weaveMinutes(steps);
  const estimate =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
      : `${minutes} min`;

  const buttonClass =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <GoalWeave
        height={540}
        value={picked}
        onChange={setPicked}
        plan={plan}
        onPlanChange={setPlan}
        status={status}
        onRetry={load}
        onContinue={() => setContinued((n) => n + 1)}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {picked.length} {picked.length === 1 ? "goal" : "goals"} ·{" "}
            {steps.length} {steps.length === 1 ? "step" : "steps"}
          </span>{" "}
          · about {estimate}
          {continued > 0 ? ` · continued ${continued}×` : ""}
          {status !== "ready" ? ` · ${status}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className={buttonClass}
          >
            <WifiOff aria-hidden className="size-3.5" />
            Fail next load
          </button>
          <button type="button" onClick={load} className={buttonClass}>
            <Plus aria-hidden className="size-3.5" />
            Reload
          </button>
          <button type="button" onClick={reset} className={buttonClass}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
