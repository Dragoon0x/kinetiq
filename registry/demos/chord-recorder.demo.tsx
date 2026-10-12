"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ChordRecorder,
  chordId,
  chordWords,
  defaultChordCommands,
  defaultChordMap,
  type ChordChange,
  type ChordMap,
  type ChordStatus,
} from "@/registry/ui/chord-recorder";

export const tweaks = defineTweaks({
  capStyle: {
    kind: "choice",
    label: "Keycaps",
    default: "raised",
    options: ["raised", "flat", "outline"],
    names: { raised: "Raised", flat: "Flat", outline: "Outline" },
  },
  platform: {
    kind: "choice",
    label: "Glyphs",
    default: "mac",
    options: ["mac", "windows"],
    names: { mac: "Mac", windows: "Windows" },
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
 * Gaugeworks Studio's shortcut settings: re-record Save all, run into Go to
 * gauge already holding Command P, and swap or keep both.
 */
export function ChordRecorderDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<ChordMap>(defaultChordMap);
  const [status, setStatus] = React.useState<ChordStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const [last, setLast] = React.useState<string | null>(null);
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
      if (!fail) setRound((r) => r + 1);
    }, 900);
  };

  const describe = (change: ChordChange) => {
    const name = (id: string) =>
      defaultChordCommands.find((cmd) => cmd.id === id)?.label ?? id;
    const platform = values.platform ?? "mac";
    switch (change.kind) {
      case "record":
        return `${name(change.id)} is now ${chordWords(change.to, platform)}`;
      case "clear":
        return `${name(change.id)} cleared`;
      case "swap":
        return `swapped with ${name(change.other ?? "")}`;
      case "keep":
        return `kept both: ambiguous with ${name(change.other ?? "")}`;
      case "reset":
        return "reset to defaults";
      default:
        return null;
    }
  };

  const changed = defaultChordCommands.filter(
    (cmd) => chordId(value[cmd.id] ?? null) !== chordId(cmd.defaultChord),
  ).length;

  if (!chrome) {
    return (
      <div className="w-full">
        <ChordRecorder height={540} {...values} />
      </div>
    );
  }

  const surface = (
    <ChordRecorder
      key={round}
      value={value}
      onChange={(next, change) => {
        setValue(next);
        setLast(describe(change));
      }}
      status={status}
      onRetry={reload}
      height={520}
      {...values}
    />
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {surface}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {changed} changed &middot; {status}
          </span>
          {last ? <> &middot; {last}</> : null}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
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
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger aria-pressed:text-danger"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(defaultChordMap);
              setLast(null);
              setStatus("ready");
              setRound((r) => r + 1);
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
