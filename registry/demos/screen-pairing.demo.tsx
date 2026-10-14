"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPairedScreens,
  ScreenPairing,
  type PairedScreen,
  type ScreenChange,
} from "@/registry/ui/screen-pairing";

export const tweaks = defineTweaks({
  screenStyle: {
    kind: "choice",
    label: "Screen",
    default: "tv",
    options: ["tv", "kiosk", "plain"],
    names: { tv: "TV", kiosk: "Kiosk", plain: "Plain" },
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
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Green" },
  },
});

/**
 * Basinworks Screens: the front desk's new TV shows a code, and the
 * receptionist types it into the laptop beside three screens already paired.
 */
export function ScreenPairingDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [screens, setScreens] =
    React.useState<PairedScreen[]>(defaultPairedScreens);
  const [status, setStatus] = React.useState<"ready" | "loading" | "error">(
    "ready",
  );
  const [failNext, setFailNext] = React.useState(false);
  const [epoch, setEpoch] = React.useState(0);
  const [last, setLast] = React.useState<ScreenChange | null>(null);
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
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(failNext ? "error" : "ready");
      setFailNext(false);
    }, 900);
  };

  const reload = () => {
    setEpoch((e) => e + 1);
    load();
  };

  const reset = () => {
    setScreens(defaultPairedScreens);
    setLast(null);
    setFailNext(false);
    setEpoch((e) => e + 1);
    setStatus("ready");
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <ScreenPairing height={560} {...values} />
      </div>
    );
  }

  const surface = (
    <ScreenPairing
      key={epoch}
      height={560}
      screens={screens}
      onChange={(next, change) => {
        setScreens(next);
        setLast(change);
      }}
      status={status}
      onRetry={load}
      {...values}
    />
  );

  const line =
    last === null
      ? "nothing changed yet"
      : last.type === "paired"
        ? `paired ${last.screen.name}`
        : last.type === "renamed"
          ? `renamed ${last.from} to ${last.screen.name}`
          : `unpaired ${last.screen.name}`;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line}</span> · {screens.length}{" "}
          {screens.length === 1 ? "screen" : "screens"} paired
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
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger aria-pressed:text-danger"
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
