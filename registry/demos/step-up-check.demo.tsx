"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultStepUpCode,
  StepUpCheck,
  type StepUpMethod,
  type StepUpStatus,
} from "@/registry/ui/step-up-check";

export const tweaks = defineTweaks({
  frost: {
    kind: "range",
    label: "Frost",
    default: 6,
    min: 2,
    max: 12,
    step: 1,
    unit: "px",
  },
  reveal: {
    kind: "choice",
    label: "Reveal",
    default: "down",
    options: ["down", "centre", "fade"],
    names: { down: "Top down", centre: "From the middle", fade: "Fade" },
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
 * Fieldline's finance lead opens the payout account on Gaugeworks Pay: the
 * bank details wait behind the frost until a passkey, the authenticator or
 * a text confirms it is really them.
 */
export function StepUpCheckDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [until, setUntil] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<StepUpMethod | null>(null);
  const [status, setStatus] = React.useState<StepUpStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [cancelled, setCancelled] = React.useState(false);
  const [seq, setSeq] = React.useState(0);
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
    setCancelled(false);
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
    setUntil(null);
    setMethod(null);
    setStatus("ready");
    setFailNext(false);
    setCancelled(false);
    setSeq((n) => n + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <StepUpCheck height={540} {...values} />
      </div>
    );
  }

  const spacedCode = `${defaultStepUpCode.slice(0, 3)} ${defaultStepUpCode.slice(3)}`;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <StepUpCheck
        key={seq}
        height={540}
        verifiedUntil={until}
        onChange={(next, m) => {
          setUntil(next);
          setMethod(next === null ? null : m);
          if (next !== null) setCancelled(false);
        }}
        onCancel={() => setCancelled(true)}
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
            {status === "loading"
              ? "loading"
              : status === "error"
                ? "code failed to send"
                : until !== null
                  ? `verified${method ? ` with ${method.label}` : ""}`
                  : cancelled
                    ? "cancelled · back to the previous screen"
                    : "locked"}
          </span>{" "}
          · authenticator shows {spacedCode}
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setUntil(null)}
            disabled={until === null}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50"
          >
            Relock
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
