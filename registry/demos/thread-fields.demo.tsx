"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultThreadQuestions,
  defaultThreadValue,
  ThreadFields,
  type ThreadStatus,
  type ThreadValue,
  visibleThread,
} from "@/registry/ui/thread-fields";

export const tweaks = defineTweaks({
  threadStyle: {
    kind: "choice",
    label: "Thread",
    default: "line",
    options: ["line", "dots", "none"],
    names: { line: "Line", dots: "Dots", none: "None" },
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
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

/**
 * Fieldline's incident report, half written up: a spill in Coldbrook's pump
 * house. Answer the rest and watch the follow-ups thread out beneath.
 */
export function ThreadFieldsDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<ThreadValue>(defaultThreadValue);
  const [status, setStatus] = React.useState<ThreadStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [sent, setSent] = React.useState(0);
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
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <ThreadFields height={540} {...values} />
      </div>
    );
  }

  const rows = visibleThread(defaultThreadQuestions, value);
  const answered = rows.filter(
    ({ question }) =>
      value[question.id] !== undefined && value[question.id] !== null,
  ).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ThreadFields
        height={540}
        value={value}
        onChange={setValue}
        onSubmit={() => setSent((n) => n + 1)}
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
            {answered} of {rows.length} answered
          </span>{" "}
          · {sent} sent · {status}
          {failNext ? " · next load fails" : ""}
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
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(defaultThreadValue);
              setSent(0);
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
