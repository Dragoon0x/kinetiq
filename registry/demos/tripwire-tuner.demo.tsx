"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTripwireChannels,
  defaultTripwireRule,
  defaultTripwireSeries,
  findTripwireFires,
  TripwireTuner,
  type TripwireRule,
  type TripwireStatus,
} from "@/registry/ui/tripwire-tuner";

export const tweaks = defineTweaks({
  chartStyle: {
    kind: "choice",
    label: "Chart",
    default: "area",
    options: ["area", "line", "bars"],
    names: { area: "Area", line: "Line", bars: "Bars" },
  },
  markerShape: {
    kind: "choice",
    label: "Markers",
    default: "pin",
    options: ["pin", "dot", "diamond"],
    names: { pin: "Pin", dot: "Dot", diamond: "Diamond" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--warn)",
    options: [
      "var(--warn)",
      "var(--danger)",
      "var(--accent-bright)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--warn)": "Amber",
      "var(--danger)": "Coral",
      "var(--accent-bright)": "Cobalt",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const LOAD_MS = 1200;
const SAVE_MS = 700;

/**
 * Fieldline's cold chain: the duty engineer tunes the "too warm" rule for
 * cold room 3 before saving it. The nightly defrost makes a 6 °C rule noisy;
 * raising the line or asking for an hour leaves only Thursday's compressor
 * fault. Reload and the two Fail switches show the feed and save states.
 */
export function TripwireTunerDemo({
  chrome = true,
  // The editor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rule, setRule] = React.useState<TripwireRule>(defaultTripwireRule);
  const [status, setStatus] = React.useState<TripwireStatus>("ready");
  const [failFeed, setFailFeed] = React.useState(false);
  const [failSave, setFailSave] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    const fail = failFeed;
    timer.current = window.setTimeout(
      () => setStatus(fail ? "error" : "ready"),
      LOAD_MS,
    );
  };

  const save = (next: TripwireRule) =>
    new Promise<void>((resolve, reject) => {
      const fail = failSave;
      window.setTimeout(() => {
        if (fail) {
          setFailSave(false);
          setNote("save failed · draft kept");
          reject(new Error("save failed"));
        } else {
          const label =
            defaultTripwireChannels.find((c) => c.id === next.channel)?.label ??
            next.channel;
          setNote(`saved · alerts go to ${label}`);
          resolve();
        }
      }, SAVE_MS);
    });

  const editor = (
    <TripwireTuner
      rule={rule}
      onRuleChange={(next) => {
        setRule(next);
        setNote(null);
      }}
      onSave={save}
      status={status}
      onRetry={() => {
        setFailFeed(false);
        if (timer.current) window.clearTimeout(timer.current);
        setStatus("loading");
        timer.current = window.setTimeout(() => setStatus("ready"), LOAD_MS);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{editor}</div>;

  const fired = findTripwireFires(defaultTripwireSeries, rule).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {editor}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reload} className={button}>
          Reload feed
        </button>
        <button
          type="button"
          aria-pressed={failFeed}
          onClick={() => setFailFeed((v) => !v)}
          className={cn(
            button,
            failFeed && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail feed
        </button>
        <button
          type="button"
          aria-pressed={failSave}
          onClick={() => setFailSave((v) => !v)}
          className={cn(
            button,
            failSave && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next save
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current) window.clearTimeout(timer.current);
            setRule(defaultTripwireRule);
            setStatus("ready");
            setFailFeed(false);
            setFailSave(false);
            setNote(null);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "loading" ? (
          <span className="text-signal">loading the last 7 days</span>
        ) : status === "error" ? (
          <>
            <span className="text-signal">feed failed</span> · draft kept
          </>
        ) : note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">
              {rule.threshold.toFixed(1)} °C {rule.comparison}
            </span>{" "}
            · {rule.duration === 0 ? "at once" : `${rule.duration} min`} · would
            have alerted {fired} {fired === 1 ? "time" : "times"}
          </>
        )}
      </p>
    </div>
  );
}
