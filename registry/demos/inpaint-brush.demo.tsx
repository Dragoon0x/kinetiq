"use client";

import * as React from "react";

import { InpaintBrush, type InpaintStage } from "@/registry/ui/inpaint-brush";

/** How long a sweep takes, and how often the demo's clock ticks. */
const SWEEP_MS = 1600;
const TICK = 40;

/** A smoothstep is polynomial, so it paints alike on both sides. */
const ease = (t: number) => Math.round(t * t * (3 - 2 * t) * 1000) / 1000;

export function InpaintBrushDemo() {
  const [stage, setStage] = React.useState<InpaintStage>("paint");
  const [clock, setClock] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [seed, setSeed] = React.useState(1);
  const [passes, setPasses] = React.useState(0);
  const [coverage, setCoverage] = React.useState(0);

  React.useEffect(() => {
    if (!playing) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = clock + TICK;
        setClock(next);
        if (next >= SWEEP_MS) {
          setPlaying(false);
          setStage("resolved");
          setPasses((count) => count + 1);
        }
      }, TICK);
    };
    // A hidden tab holds the sweep where it is and resumes on return.
    const onVisibility = () => {
      window.clearTimeout(timer);
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, clock]);

  const progress = ease(Math.min(1, clock / SWEEP_MS));

  const regenerate = () => {
    // A new seed per pass, fixed before the sweep starts so the scene that
    // resolves is the scene that gets kept.
    setSeed((current) => current + 1);
    setClock(0);
    setStage("sweeping");
    setPlaying(true);
  };

  const onMaskChange = (percent: number) => {
    setCoverage(percent);
    if (stage === "resolved") setStage("paint");
  };

  const line =
    stage === "sweeping"
      ? ["Regenerating ·", `${Math.round(progress * 100)}%`, ""]
      : stage === "resolved"
        ? ["Regenerated ·", `pass ${passes}`, ""]
        : coverage > 0
          ? ["Mask", `${coverage}%`, "· ready"]
          : ["Paint the part to redo", "", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <InpaintBrush
        label="Poster render · Fernworks Model 3"
        stage={stage}
        progress={progress}
        seed={seed}
        onRegenerate={regenerate}
        onMaskChange={onMaskChange}
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
