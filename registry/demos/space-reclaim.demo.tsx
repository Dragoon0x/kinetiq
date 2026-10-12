"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSpaceReclaimFiles,
  defaultSpaceReclaimNow,
  defaultSpaceReclaimQuota,
  SpaceReclaim,
  type SpaceReclaimStatus,
} from "@/registry/ui/space-reclaim";

export const tweaks = defineTweaks({
  barStyle: {
    kind: "choice",
    label: "Bars",
    default: "bar",
    options: ["bar", "line", "blocks"],
    names: { bar: "Bar", line: "Line", blocks: "Blocks" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "cobalt",
    options: ["cobalt", "moss", "amber", "ink"],
    names: { cobalt: "Cobalt", moss: "Moss", amber: "Amber", ink: "Ink" },
  },
});

const START = ["f-film", "f-renders"];
const FOLDERS = [
  "Brand / Film",
  "Photo / 2025",
  "Web / Renders",
  "Data / Exports",
  "Packaging",
  "People / Training",
];
const GB = 1e9;
const size = (ids: string[]) =>
  ids.reduce(
    (t, id) =>
      t + (defaultSpaceReclaimFiles.find((f) => f.id === id)?.size ?? 0),
    0,
  );
const gb = (bytes: number) => `${(bytes / GB).toFixed(1)} GB`;

/**
 * Coldbrook's shared drive, 86% full: the operations lead clearing out old
 * film masters and render dumps before the quarter closes. Removal is faked
 * with a short wait; "Fail next remove" makes it refuse once.
 */
export function SpaceReclaimDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [selected, setSelected] = React.useState<string[]>(START);
  const [status, setStatus] = React.useState<SpaceReclaimStatus>("ready");
  const [progress, setProgress] = React.useState(0);
  const [failNext, setFailNext] = React.useState(false);
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const timers = React.useRef<number[]>([]);
  const failRef = React.useRef(failNext);
  React.useEffect(() => {
    failRef.current = failNext;
  });

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  React.useEffect(() => clear, []);

  const rescan = () => {
    clear();
    setStatus("scanning");
    setProgress(0);
    setNote(null);
    for (let i = 1; i <= 20; i += 1) {
      timers.current.push(
        window.setTimeout(() => {
          setProgress(i / 20);
          if (i === 20) {
            setStatus("ready");
            setSelected([]);
            setRemoved([]);
            setRound((r) => r + 1);
          }
        }, i * 120),
      );
    }
  };

  const reset = () => {
    clear();
    setStatus("ready");
    setProgress(0);
    setSelected(START);
    setRemoved([]);
    setFailNext(false);
    setNote(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <SpaceReclaim
      key={round}
      now={defaultSpaceReclaimNow}
      selected={selected}
      onSelectedChange={(ids) => {
        setSelected(ids);
        setNote(null);
      }}
      onReclaim={(ids) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          timers.current.push(
            window.setTimeout(() => {
              if (fail) {
                setFailNext(false);
                setNote("remove failed · selection kept");
                reject(new Error("refused"));
              } else {
                setRemoved((r) => [...r, ...ids]);
                setNote(
                  `removed ${ids.length} ${ids.length === 1 ? "file" : "files"} · ${gb(size(ids))} freed`,
                );
                resolve();
              }
            }, 900),
          );
        })
      }
      onRescan={rescan}
      status={status}
      scanProgress={progress}
      scanPath={
        FOLDERS[Math.min(FOLDERS.length - 1, Math.floor(progress * 6))] ??
        undefined
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const used = defaultSpaceReclaimQuota.used - size(removed);
  const total = defaultSpaceReclaimQuota.total;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (status !== "scanning") rescan();
          }}
          // Stays focusable while it works: a disabled button drops focus.
          aria-disabled={status === "scanning" || undefined}
          className={cn(button, "aria-disabled:opacity-50")}
        >
          Rescan
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next remove
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
        {status === "scanning" ? (
          <>
            <span className="text-signal">scanning</span> ·{" "}
            {Math.round(progress * 100)}%
          </>
        ) : note ? (
          <span className="text-signal">{note}</span>
        ) : selected.length === 0 ? (
          <>
            <span className="text-signal">nothing chosen</span> ·{" "}
            {gb(total - used)} free
          </>
        ) : (
          <>
            <span className="text-signal">
              {selected.length} {selected.length === 1 ? "file" : "files"}{" "}
              chosen · {gb(size(selected))} to free
            </span>{" "}
            · {gb(used).replace(" GB", "")} of {gb(total)} used
          </>
        )}
      </p>
    </div>
  );
}
