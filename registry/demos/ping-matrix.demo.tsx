"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPingMatrixChannels,
  defaultPingMatrixDefaults,
  defaultPingMatrixEvents,
  defaultPingMatrixValue,
  PingMatrix,
  type PingMatrixStatus,
  type PingMatrixValue,
} from "@/registry/ui/ping-matrix";

export const tweaks = defineTweaks({
  switchStyle: {
    kind: "choice",
    label: "Switch",
    default: "pill",
    options: ["pill", "check", "dot"],
    names: { pill: "Pill", check: "Check", dot: "Dot" },
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
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const SAVE_MS = 700;
const label = (list: { id: string; label: string }[], id: string) =>
  (list.find((x) => x.id === id)?.label ?? id).toLowerCase();
const edited = (v: PingMatrixValue) =>
  defaultPingMatrixEvents.reduce(
    (n, e) =>
      n +
      defaultPingMatrixChannels.filter(
        (c) => !!v[e.id]?.[c.id] !== !!defaultPingMatrixDefaults[e.id]?.[c.id],
      ).length,
    0,
  );

/**
 * A Basinworks engineer tuning what reaches them during a release week.
 * Saving is faked with a short wait; "Fail next save" refuses one, and
 * "Reload" shows the skeletons while the settings come back.
 */
export function PingMatrixDemo({
  chrome = true,
  // The grid is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [value, setValue] = React.useState<PingMatrixValue>(
    defaultPingMatrixValue,
  );
  const [status, setStatus] = React.useState<PingMatrixStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const failRef = React.useRef(failNext);
  React.useEffect(() => {
    failRef.current = failNext;
  });
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const grid = (
    <PingMatrix
      key={round}
      value={value}
      onValueChange={setValue}
      status={status}
      onChange={(e, c, on) =>
        setNote(
          `${label(defaultPingMatrixChannels, c)} ${on ? "on" : "off"} for ${label(defaultPingMatrixEvents, e)}`,
        )
      }
      onReset={() => setNote("back to the workspace default")}
      onSave={() =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          if (fail) setFailNext(false);
          timers.current.push(
            window.setTimeout(() => {
              if (fail) {
                setNote("save failed · edits kept");
                reject(new Error("refused"));
              } else {
                setNote("saved");
                resolve();
              }
            }, SAVE_MS),
          );
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{grid}</div>;

  const reload = () => {
    setStatus("loading");
    setNote(null);
    timers.current.push(window.setTimeout(() => setStatus("ready"), 1100));
  };
  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setValue(defaultPingMatrixValue);
    setStatus("ready");
    setFailNext(false);
    setNote(null);
    setRound((r) => r + 1);
  };
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {grid}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next save
        </button>
        <button type="button" onClick={reload} className={button}>
          Reload
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "loading" ? (
          <span className="text-signal">loading settings</span>
        ) : (
          <>
            <span className="text-signal">{note ?? "your settings"}</span> ·{" "}
            {edited(value)} edited from default
          </>
        )}
      </p>
    </div>
  );
}
