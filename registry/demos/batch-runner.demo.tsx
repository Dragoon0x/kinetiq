"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  BatchRunner,
  defaultBatchRecords,
  type BatchStatus,
  type BatchSummary,
} from "@/registry/ui/batch-runner";

export const tweaks = defineTweaks({
  pace: {
    kind: "range",
    label: "Pace",
    default: 180,
    min: 60,
    max: 600,
    step: 20,
    unit: "ms",
  },
  cursor: {
    kind: "choice",
    label: "Cursor",
    default: "bar",
    options: ["bar", "glow", "none"],
    names: { bar: "Bar", glow: "Glow", none: "None" },
  },
  density: {
    kind: "choice",
    label: "Rows",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Coldbrook Admin's people table with 24 users selected: pick Deactivate,
 * run it, watch two rows fail, retry them, and undo the lot.
 */
export function BatchRunnerDemo({
  chrome = true,
  // The runner is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<string[]>(() =>
    defaultBatchRecords.map((r) => r.id),
  );
  const [status, setStatus] = React.useState<BatchStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [last, setLast] = React.useState<BatchSummary | null>(null);
  const [epoch, setEpoch] = React.useState(0);
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
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const reset = () => {
    setValue(defaultBatchRecords.map((r) => r.id));
    setLast(null);
    setEpoch((e) => e + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <BatchRunner height={540} {...values} />
      </div>
    );
  }

  const lastLine = last
    ? last.kind === "undo"
      ? `reverted ${last.reverted}`
      : last.dryRun
        ? `previewed ${last.previewed}`
        : `${last.cancelled ? "cancelled · " : ""}done ${last.done} · failed ${last.failed}${last.skipped ? ` · skipped ${last.skipped}` : ""}`
    : "not run yet";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <BatchRunner
        key={epoch}
        height={540}
        value={value}
        onChange={setValue}
        onFinish={setLast}
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
            {value.length} of {defaultBatchRecords.length} included
          </span>{" "}
          · {lastLine}
          {status !== "ready" ? ` · ${status}` : ""}
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
