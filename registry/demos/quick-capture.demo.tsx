"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  type CaptureStatus,
  type CaptureTask,
  defaultCaptureTasks,
  QuickCapture,
} from "@/registry/ui/quick-capture";

export const tweaks = defineTweaks({
  chipPlacement: {
    kind: "choice",
    label: "Chips",
    default: "below",
    options: ["below", "inline"],
    names: { below: "Below", inline: "Inline" },
  },
  legend: {
    kind: "toggle",
    label: "Legend",
    default: false,
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
 * Fieldline Tasks' quick-add bar: type "Walk Mill Lane fri 2pm #drainage
 * @sana !2 ~1h", watch the chips land, and press Enter to file it.
 */
export function QuickCaptureDemo({
  chrome = true,
  // The bar is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tasks, setTasks] = React.useState<CaptureTask[]>(defaultCaptureTasks);
  const [status, setStatus] = React.useState<CaptureStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [captured, setCaptured] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <QuickCapture height={540} {...values} />
      </div>
    );
  }

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus("ready");
    }, 1100);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setTasks(defaultCaptureTasks);
    setStatus("ready");
    setFailNext(false);
    setCaptured(0);
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <QuickCapture
        height={520}
        tasks={tasks}
        status={status}
        onCapture={(task, next) => {
          if (failNext) {
            setFailNext(false);
            setStatus("error");
            return;
          }
          setTasks(next);
          setCaptured((n) => n + 1);
        }}
        onRemove={(_task, next) => setTasks(next)}
        onRetry={() => setStatus("ready")}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status === "loading"
              ? "loading"
              : status === "error"
                ? "capture failed"
                : failNext
                  ? "next capture will fail"
                  : `${captured} captured`}
          </span>{" "}
          · {tasks.length} tasks
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
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next capture
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
