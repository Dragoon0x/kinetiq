"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultRecoveryValue,
  RecoveryRoute,
  type RecoveryStatus,
  type RecoveryValue,
} from "@/registry/ui/recovery-route";

export const tweaks = defineTweaks({
  mapStyle: {
    kind: "choice",
    label: "Map",
    default: "line",
    options: ["line", "rail", "dots"],
    names: { line: "Line", rail: "Rail", dots: "Dots" },
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
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

const STEP_WORD: Record<RecoveryValue["step"], string> = {
  identify: "identify",
  verify: "verify",
  reset: "reset",
  done: "done",
};

/**
 * Jo Okafor is locked out of Basinworks: the account is found, the text
 * message turns out to be a dead end, and the authenticator gets them to a
 * new password.
 */
export function RecoveryRouteDemo({
  chrome = true,
  // The route is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<RecoveryValue>(defaultRecoveryValue);
  const [status, setStatus] = React.useState<RecoveryStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [finished, setFinished] = React.useState(0);
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
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(failNext ? "error" : "ready");
      setFailNext(false);
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <RecoveryRoute height={540} {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <RecoveryRoute
        height={560}
        value={value}
        onChange={setValue}
        status={status}
        onRetry={reload}
        onFinish={() => setFinished((n) => n + 1)}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            step{" "}
            {["identify", "verify", "reset", "done"].indexOf(value.step) + 1} of
            4 · {STEP_WORD[value.step]}
          </span>{" "}
          · {value.blocked.length} dead{" "}
          {value.blocked.length === 1 ? "end" : "ends"}
          {finished ? ` · signed in ${finished}×` : ""}
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
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(defaultRecoveryValue);
              setFinished(0);
            }}
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
