"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultWipeRecords,
  WipePreview,
  type WipePreviewStatus,
} from "@/registry/ui/wipe-preview";

export const tweaks = defineTweaks({
  wipeStyle: {
    kind: "choice",
    label: "Wipe",
    default: "line",
    options: ["line", "feather", "cells"],
    names: { line: "Line", feather: "Feather", cells: "Cells" },
  },
  ringColor: {
    kind: "choice",
    label: "Rings",
    default: "amber",
    options: ["amber", "accent", "signal", "ink"],
    names: { amber: "Amber", accent: "Accent", signal: "Signal", ink: "Ink" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const FAIL_AT = defaultWipeRecords[22];
const FAILURE = {
  message:
    "Compare at would fall below the new price on this item, and the catalog rejects a sale price above list.",
  recordId: FAIL_AT?.id,
};
const APPLY_MS = 700;
const RETRY_MS = 900;

/**
 * Coldbrook's pricing agent proposes lifting cold brew list prices across
 * forty catalog items. The reviewer wipes across the result, skips what
 * should not move, and approves; the catalog answers after a short beat.
 */
export function WipePreviewDemo({
  chrome = true,
  // The preview is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [excluded, setExcluded] = React.useState<string[]>(() => [
    "cb-1044",
    "cb-1061",
  ]);
  const [wipe, setWipe] = React.useState(50);
  const [failing, setFailing] = React.useState(false);
  const [status, setStatus] = React.useState<WipePreviewStatus>("ready");
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const shownStatus: WipePreviewStatus = failing ? "failed" : status;
  const included = defaultWipeRecords.length - excluded.length;

  const surface = (
    <WipePreview
      key={round}
      excluded={excluded}
      onExcludedChange={(ids) => {
        setExcluded(ids);
        setNote(null);
      }}
      value={wipe}
      onValueChange={setWipe}
      status={shownStatus}
      failure={FAILURE}
      onApprove={(ids) =>
        new Promise<void>((resolve) => {
          later(APPLY_MS, () => {
            setNote(`applied · ${ids.length} items`);
            resolve();
          });
        })
      }
      onReject={(text) =>
        setNote(
          text ? "rejected · with a note" : "rejected · back to the agent",
        )
      }
      onEditPlan={() => setNote("opening the plan")}
      onRetry={() => {
        setFailing(false);
        setStatus("loading");
        setNote(null);
        later(RETRY_MS, () => setStatus("ready"));
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const line = failing
    ? "simulation failed · item 23"
    : status === "loading"
      ? `simulating · ${defaultWipeRecords.length} items`
      : (note ??
        `wipe ${Math.round(wipe)}% · ${included} of ${defaultWipeRecords.length} included`);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failing}
          onClick={() => {
            setFailing((v) => !v);
            setNote(null);
          }}
          className={cn(
            button,
            failing && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail simulation
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            setExcluded(["cb-1044", "cb-1061"]);
            setWipe(50);
            setFailing(false);
            setStatus("ready");
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
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
