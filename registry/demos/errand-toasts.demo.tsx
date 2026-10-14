"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countErrandToasts,
  defaultErrands,
  defaultErrandToasts,
  ErrandToasts,
  type ErrandStatus,
  type ErrandToast,
} from "@/registry/ui/errand-toasts";

export const tweaks = defineTweaks({
  corner: {
    kind: "choice",
    label: "Corner",
    default: "bottom-right",
    options: ["bottom-right", "bottom-left", "top-right"],
    names: {
      "bottom-right": "Bottom right",
      "bottom-left": "Bottom left",
      "top-right": "Top right",
    },
  },
  stackStyle: {
    kind: "choice",
    label: "Rail",
    default: "stack",
    options: ["stack", "list"],
    names: { stack: "Stack", list: "List" },
  },
  holdSeconds: {
    kind: "range",
    label: "Hold",
    default: 4,
    min: 2,
    max: 10,
    step: 1,
    unit: "s",
  },
});

const LOAD_MS = 900;

/**
 * Basinworks' back office at the end of a Friday: a photo sync still
 * uploading, an invoice run that bounced off the mail relay, and four
 * errands on the toolbar to start again.
 */
export function ErrandToastsDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [toasts, setToasts] =
    React.useState<ErrandToast[]>(defaultErrandToasts);
  const [status, setStatus] = React.useState<ErrandStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const timer = React.useRef<number | null>(null);
  const seq = React.useRef(0);

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
    }, LOAD_MS);
  };

  // The host adds a toast per errand; the surface adopts and runs them all.
  const startAll = () => {
    seq.current += 1;
    const batch = seq.current;
    setToasts((ts) => [
      ...ts,
      ...defaultErrands.map<ErrandToast>((errand) => ({
        id: `${errand.id}-all-${batch}`,
        errandId: errand.id,
        state: "running",
        progress: 0,
        attempt: 1,
        startedAt: Date.now(),
      })),
    ]);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <ErrandToasts height={280} {...values} />
      </div>
    );
  }

  const counts = countErrandToasts(toasts);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ErrandToasts
        height={300}
        toasts={toasts}
        onChange={setToasts}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {counts.running} running · {counts.failed} failed
          </span>{" "}
          · {toasts.length} in the rail · hold {values.holdSeconds ?? 4} s
          {status !== "ready" ? ` · ${status}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startAll}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Start all four
          </button>
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
            className={`inline-flex h-7 items-center gap-1.5 rounded-2 border px-2.5 text-xs transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid ${
              failNext
                ? "border-danger text-danger"
                : "border-hairline text-ink-2"
            }`}
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => setToasts(defaultErrandToasts)}
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
