"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AnswerSlip,
  type AnswerStatus,
  type AnswerTone,
} from "@/registry/ui/answer-slip";

export const tweaks = defineTweaks({
  typing: {
    kind: "choice",
    label: "Reply arrives",
    default: "type",
    options: ["type", "fade"],
    names: { type: "Typed in", fade: "Cross-fade" },
  },
  defaultTone: {
    kind: "choice",
    label: "Tone",
    default: "friendly",
    options: ["friendly", "formal"],
    names: { friendly: "Friendly", formal: "Formal" },
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
 * Fieldline Support's inbox: Rosa's gateway stopped syncing on Tuesday, and
 * three suggested replies wait on the slip under her thread.
 */
export function AnswerSlipDemo({
  chrome = true,
  // The slip is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<AnswerStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [sent, setSent] = React.useState(0);
  const [tone, setTone] = React.useState<AnswerTone>(
    values.defaultTone ?? "friendly",
  );
  const [seed, setSeed] = React.useState(0);
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
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setStatus("ready");
    setFailNext(false);
    setSent(0);
    setTone(values.defaultTone ?? "friendly");
    setSeed((s) => s + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <AnswerSlip key={seed} height={540} {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <AnswerSlip
        key={seed}
        height={560}
        status={status}
        onRetry={load}
        onSend={() => setSent((n) => n + 1)}
        onToneChange={setTone}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {sent} sent · {tone} tone
          </span>{" "}
          · suggestions {status}
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload suggestions
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
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
