"use client";

import * as React from "react";

import { ImageReveal } from "@/registry/ui/image-reveal";

const STEPS = 4;

/** Seeded progress: uneven arrivals that sum to one, with a jittered beat between. */
const INCREMENTS = [0.07, 0.12, 0.09, 0.14, 0.1, 0.13, 0.11, 0.12, 0.12];
const DELAYS = [260, 180, 340, 220, 300, 200, 380, 240, 280];

export function ImageRevealDemo() {
  const [progress, setProgress] = React.useState(0);
  const [tick, setTick] = React.useState(0);
  const [generating, setGenerating] = React.useState(false);
  const [take, setTake] = React.useState(0);
  const [resolved, setResolved] = React.useState(false);

  // A hidden tab holds the render where it is; a picture should not resolve unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!generating || !visible) return;
    const timer = window.setTimeout(
      () => {
        const next = Math.min(
          1,
          progress + (INCREMENTS[tick % INCREMENTS.length] ?? 0.1),
        );
        setProgress(next);
        setTick(tick + 1);
        if (next >= 1) setGenerating(false);
      },
      DELAYS[tick % DELAYS.length] ?? 240,
    );
    return () => window.clearTimeout(timer);
  }, [generating, visible, progress, tick]);

  const regenerate = () => {
    setProgress(0);
    setTick(0);
    setResolved(false);
    setTake(take + 1);
    setGenerating(true);
  };

  const step = Math.min(STEPS, Math.floor(progress * STEPS + 1e-6));
  const line = generating
    ? ["Rendering", `step ${Math.min(STEPS, step + 1)} of ${STEPS}`, ""]
    : resolved
      ? ["Resolved", `${STEPS} steps`, `· take ${take}`]
      : progress >= 1
        ? ["Settling", `step ${STEPS} of ${STEPS}`, ""]
        : ["Idle · press generate", "", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ImageReveal
        label="A lighthouse on a cold morning"
        model="Fernworks Model 3"
        progress={progress}
        steps={STEPS}
        generating={generating}
        seed={Math.max(1, take)}
        onRegenerate={regenerate}
        onResolve={() => setResolved(true)}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>{" "}
        {line[2]}
      </p>
    </div>
  );
}
