"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultDrivePath,
  defaultDriveTree,
  DestinationPicker,
  type DriveMode,
  type DrivePath,
  type DriveStatus,
} from "@/registry/ui/destination-picker";

export const tweaks = defineTweaks({
  slideStyle: {
    kind: "choice",
    label: "Folders",
    default: "slide",
    options: ["slide", "fade", "stack"],
    names: { slide: "Slide", fade: "Fade", stack: "Stack" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  showFiles: {
    kind: "toggle",
    label: "Files",
    default: true,
  },
});

const nameOf = (path: DrivePath) => {
  const walk = (
    node: typeof defaultDriveTree,
    rest: string[],
  ): string | undefined => {
    const [head, ...tail] = rest;
    if (head !== node.id) return undefined;
    if (tail.length === 0) return node.name;
    for (const child of node.children ?? []) {
      const found = walk(child, tail);
      if (found) return found;
    }
    return undefined;
  };
  return walk(defaultDriveTree, path) ?? "a new folder";
};

/**
 * Basinworks Drive: two files and a folder from the Fieldline survey are
 * going somewhere else. Pick the folder, then Move or Copy.
 */
export function DestinationPickerDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<DrivePath>(defaultDrivePath);
  const [mode, setMode] = React.useState<DriveMode>("move");
  const [status, setStatus] = React.useState<DriveStatus>("ready");
  const [confirmed, setConfirmed] = React.useState(0);
  const [epoch, setEpoch] = React.useState(0);
  const failNext = React.useRef(false);
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
      setStatus(failNext.current ? "error" : "ready");
      failNext.current = false;
    }, 900);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    failNext.current = false;
    setValue(defaultDrivePath);
    setMode("move");
    setStatus("ready");
    setConfirmed(0);
    setEpoch((e) => e + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <DestinationPicker height={540} {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <DestinationPicker
        key={epoch}
        height={540}
        value={value}
        onChange={setValue}
        mode={mode}
        onModeChange={setMode}
        onConfirm={() => setConfirmed((n) => n + 1)}
        status={status}
        onRetry={load}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {mode} to {nameOf(value)}
          </span>{" "}
          · {status} · confirmed {confirmed}
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
            onClick={() => {
              failNext.current = true;
              load();
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
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
