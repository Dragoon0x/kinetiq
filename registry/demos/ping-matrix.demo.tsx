"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countPings,
  defaultPingChannels,
  defaultPingGroups,
  defaultPingQuietHours,
  defaultPingValue,
  formatHour,
  PingMatrix,
  type PingDigest,
  type PingQuietHours,
  type PingStatus,
  type PingValue,
} from "@/registry/ui/ping-matrix";

export const tweaks = defineTweaks({
  tickStyle: {
    kind: "choice",
    label: "Tick",
    default: "check",
    options: ["check", "dot", "fill"],
    names: { check: "Check", dot: "Dot", fill: "Fill" },
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
 * A Fieldline crew lead's notification settings: which of nine events reach
 * them in the app, by email, push or SMS, with nights kept quiet.
 */
export function PingMatrixDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<PingValue>(defaultPingValue);
  const [quiet, setQuiet] = React.useState<PingQuietHours | null>(
    defaultPingQuietHours,
  );
  const [digest, setDigest] = React.useState<PingDigest>("instant");
  const [status, setStatus] = React.useState<PingStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
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
    }, LOAD_MS);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setValue(defaultPingValue);
    setQuiet(defaultPingQuietHours);
    setDigest("instant");
    setStatus("ready");
    setFailNext(false);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <PingMatrix height={540} {...values} />
      </div>
    );
  }

  const on = countPings(value, defaultPingGroups, defaultPingChannels);
  const total =
    defaultPingGroups.reduce((n, g) => n + g.rows.length, 0) *
    defaultPingChannels.length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <PingMatrix
        height={560}
        value={value}
        onChange={setValue}
        quietHours={quiet}
        onQuietHoursChange={setQuiet}
        digest={digest}
        onDigestChange={setDigest}
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
            {on} of {total} on
          </span>{" "}
          · digest {digest} · quiet{" "}
          {quiet
            ? `${formatHour(quiet.start)}-${formatHour(quiet.end)}`
            : "off"}
          {status !== "ready" ? ` · ${status}` : ""}
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
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-hairline-strong aria-pressed:text-foreground"
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
