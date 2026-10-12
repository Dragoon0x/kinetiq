"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  countTwinWords,
  defaultTwinSource,
  parseTwinBlocks,
  TwinPreview,
  type TwinStatus,
} from "@/registry/ui/twin-preview";

export const tweaks = defineTweaks({
  split: {
    kind: "choice",
    label: "Split",
    default: "side",
    options: ["side", "stack"],
    names: { side: "Side by side", stack: "Stacked" },
  },
  device: {
    kind: "choice",
    label: "Device",
    default: "desktop",
    options: ["desktop", "tablet", "phone"],
    names: { desktop: "Desktop", tablet: "Tablet", phone: "Phone" },
  },
  lockstep: {
    kind: "toggle",
    label: "Lockstep",
    default: true,
  },
});

/**
 * Gaugeworks Docs: Fieldline's calibration rollout note, typed on the left
 * and rendered on the right as it changes.
 */
export function TwinPreviewDemo({
  chrome = true,
  // The page is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [source, setSource] = React.useState(defaultTwinSource);
  const [status, setStatus] = React.useState<TwinStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);
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
    setNote("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (failNext) {
        setFailNext(false);
        setStatus("error");
        setNote("load failed");
      } else {
        setStatus("ready");
        setNote("loaded");
      }
    }, 900);
  };

  const surface = (
    <TwinPreview
      key={round}
      height={540}
      value={source}
      onChange={(next, cause) => {
        setSource(next);
        if (cause !== "typing") setNote(`${cause} applied`);
      }}
      onDeviceChange={(device) =>
        setNote(
          `${device.label.toLowerCase()}${device.width ? ` · ${device.width} px` : ""}`,
        )
      }
      onThemeChange={(theme) => setNote(`theme ${theme}`)}
      onLockstepChange={(on) => setNote(on ? "lockstep on" : "lockstep off")}
      status={status}
      onRetry={load}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const blocks = parseTwinBlocks(source).length;
  const words = countTwinWords(source);
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={load} className={button}>
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next load
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            setSource(defaultTwinSource);
            setStatus("ready");
            setFailNext(false);
            setNote(null);
            setRound((r) => r + 1);
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
        <span className="text-signal">{note ?? "ready"}</span> · {blocks}{" "}
        {blocks === 1 ? "block" : "blocks"} · {words} words
      </p>
    </div>
  );
}
