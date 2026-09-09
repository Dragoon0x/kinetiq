"use client";

import * as React from "react";

import { SelfieRing, type SelfieRingStatus } from "@/registry/ui/selfie-ring";

const PROMPTS = ["Centre your face", "Turn left", "Turn right", "Blink"];

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

const secondary =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function SelfieRingDemo() {
  const [status, setStatus] = React.useState<SelfieRingStatus>("idle");
  const [step, setStep] = React.useState(0);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The ring owns no clock: each prompt is held here for a beat, in an effect
  // with cleanup that waits while the tab is hidden.
  React.useEffect(() => {
    if (!visible || status !== "checking") return;
    const timer = window.setTimeout(() => {
      if (step < PROMPTS.length - 1) setStep(step + 1);
      else setStatus("passed");
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [visible, status, step]);

  const line =
    status === "idle"
      ? `ready · 0 of ${PROMPTS.length}`
      : status === "checking"
        ? `${PROMPTS[step]} · ${step + 1} of ${PROMPTS.length}`
        : status === "passed"
          ? `passed · ${PROMPTS.length} of ${PROMPTS.length}`
          : "failed · face lost";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SelfieRing
        label="Basinworks Exchange · confirm withdrawal"
        prompts={PROMPTS}
        status={status}
        onStatusChange={setStatus}
        step={step}
        onStart={() => setStep(0)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={status !== "checking"}
          onClick={() => setStatus("failed")}
          className={secondary}
        >
          Lose the face
        </button>
        <button
          type="button"
          disabled={status === "idle"}
          onClick={() => {
            setStatus("idle");
            setStep(0);
          }}
          className={secondary}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{line}</span>
      </p>
    </div>
  );
}
