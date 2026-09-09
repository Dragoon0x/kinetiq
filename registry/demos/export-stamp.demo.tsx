"use client";

import * as React from "react";

import { ExportStamp, type ExportStage } from "@/registry/ui/export-stamp";

/** Three Fieldline places a Fernworks Model 3 shift brief can go. */
const TARGETS = [
  { id: "drive", label: "Drive", detail: "Fieldline Drive · /briefs/shift" },
  { id: "inbox", label: "Inbox", detail: "Depot leads · 6 people" },
  { id: "board", label: "Board", detail: "Ops wall · pinned for a week" },
];

const EXPORT_MS = 1800;
const TICK = 40;

/** Quick to sixty, a held breath, then the rest — polynomial, so both sides agree. */
const pace = (t: number) => {
  const shaped = t < 0.5 ? t * 1.2 : 0.6 + (t - 0.5) * 0.8;
  return Math.round(shaped * shaped * (3 - 2 * shaped) * 1000) / 1000;
};

export function ExportStampDemo() {
  const [target, setTarget] = React.useState("drive");
  const [stage, setStage] = React.useState<ExportStage>("idle");
  const [clock, setClock] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    if (!playing) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = clock + TICK;
        setClock(next);
        if (next >= EXPORT_MS) {
          setPlaying(false);
          setStage("stamped");
        }
      }, TICK);
    };
    // A hidden tab holds the export where it is and resumes on return.
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

  const progress = pace(Math.min(1, clock / EXPORT_MS));
  const chosen = TARGETS.find((item) => item.id === target);
  const name = chosen?.label ?? target;

  const start = () => {
    setClock(0);
    setStage("exporting");
    setPlaying(true);
  };

  // A new target is a new export: the stamp belongs to the old one.
  const pick = (id: string) => {
    setTarget(id);
    setStage("idle");
    setPlaying(false);
  };

  const line =
    stage === "stamped"
      ? ["Stamped ·", name, ""]
      : stage === "exporting"
        ? ["Exporting ·", `${Math.round(progress * 100)}%`, `· ${name}`]
        : ["Target ·", name, ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ExportStamp
        label="Send the shift brief"
        targets={TARGETS}
        value={target}
        onValueChange={pick}
        stage={stage}
        progress={progress}
        onExport={start}
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
