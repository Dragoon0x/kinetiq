"use client";

import * as React from "react";

import { KycSteps, type KycStepStatus } from "@/registry/ui/kyc-steps";

const STEPS = [
  {
    id: "document",
    title: "Identity document",
    description: "A passport or national ID card, all four corners in frame.",
  },
  {
    id: "selfie",
    title: "Selfie",
    description:
      "Look straight at the camera in even light, no hat or glasses.",
  },
  {
    id: "address",
    title: "Proof of address",
    description: "A utility bill or bank letter from the last three months.",
  },
];

const REASONS = { selfie: "Face was partly out of frame. Take it again." };

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

export function KycStepsDemo() {
  const [status, setStatus] = React.useState<Record<string, KycStepStatus>>({});
  const [rejectedOnce, setRejectedOnce] = React.useState(false);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const reviewing = STEPS.find((step) => status[step.id] === "review");

  // The stepper never invents time — the review resolves here, in an effect
  // with cleanup, and holds while the tab is hidden rather than landing unseen.
  React.useEffect(() => {
    if (!visible || !reviewing) return;
    const id = reviewing.id;
    const rejects = id === "selfie" && !rejectedOnce;
    const timer = window.setTimeout(() => {
      setStatus((prev) => ({
        ...prev,
        [id]: rejects ? "rejected" : "approved",
      }));
      if (rejects) setRejectedOnce(true);
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [visible, reviewing, rejectedOnce]);

  const currentIndex = STEPS.findIndex(
    (step) => status[step.id] !== "approved",
  );
  const current = STEPS[currentIndex];
  const line =
    currentIndex === -1 || !current
      ? `verified · ${STEPS.length} of ${STEPS.length}`
      : `step ${currentIndex + 1} of ${STEPS.length} · ${
          status[current.id] === "review"
            ? "in review"
            : status[current.id] === "rejected"
              ? "rejected"
              : current.title
        }`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <KycSteps
        label="Coldbrook Bank · open an account"
        steps={STEPS}
        status={status}
        onStatusChange={setStatus}
        reasons={REASONS}
      />

      <button
        type="button"
        disabled={Object.keys(status).length === 0}
        onClick={() => {
          setStatus({});
          setRejectedOnce(false);
        }}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Reset
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{line}</span>
      </p>
    </div>
  );
}
