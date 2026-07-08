"use client";

import * as React from "react";

import { Beacon, type BeaconActivity } from "@/registry/blocks/beacon/beacon";
import { PressureButton } from "@/registry/ui/pressure-button";

type Stage = "timer" | "upload" | "call" | "playing" | "standby";

const ORDER: Stage[] = ["timer", "upload", "call", "playing", "standby"];

const STAGE_LOG: Record<Stage, string> = {
  timer: "timer running — focus block, 90 s",
  upload: "upload started — bench captures",
  call: "incoming call — mira on the line",
  playing: "now playing — coil memory",
  standby: "standby — beacon idle",
};

export function BeaconDemo() {
  const [stage, setStage] = React.useState<Stage>("standby");
  const [endsAt, setEndsAt] = React.useState<number | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [log, setLog] = React.useState("standby — tap the capsule to expand");
  const progressRef = React.useRef(0);
  const doneTimer = React.useRef<number | null>(null);

  const enter = React.useCallback((next: Stage, message: string) => {
    if (next === "timer") setEndsAt(Date.now() + 90_000);
    if (next === "upload") {
      progressRef.current = 0;
      setProgress(0);
    }
    setStage(next);
    setLog(message);
  }, []);

  // Kick off with a 90s timer one frame after mount (standby → timer morph).
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => enter("timer", STAGE_LOG.timer));
    return () => cancelAnimationFrame(frame);
  }, [enter]);

  // Simulated upload: progress creeps up, completion advances to the call.
  React.useEffect(() => {
    if (stage !== "upload") return;
    const interval = window.setInterval(() => {
      const next = Math.min(1, progressRef.current + 0.03);
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) {
        window.clearInterval(interval);
        doneTimer.current = window.setTimeout(
          () => enter("call", "upload complete — incoming call"),
          600,
        );
      }
    }, 150);
    return () => {
      window.clearInterval(interval);
      if (doneTimer.current !== null) window.clearTimeout(doneTimer.current);
    };
  }, [stage, enter]);

  const nextStage = () => {
    const index = ORDER.indexOf(stage);
    const next = ORDER[(index + 1) % ORDER.length] ?? "timer";
    enter(next, STAGE_LOG[next]);
  };

  const activity: BeaconActivity | null =
    stage === "timer" && endsAt !== null
      ? { kind: "timer", label: "Focus block", endsAt }
      : stage === "upload"
        ? { kind: "upload", label: "Bench captures", progress }
        : stage === "call"
          ? {
              kind: "call",
              name: "Mira",
              onAccept: () => enter("playing", "call accepted — now playing"),
              onDecline: () => enter("playing", "call declined — now playing"),
            }
          : stage === "playing"
            ? { kind: "playing", title: "Coil Memory", artist: "Signal Garden" }
            : null;

  return (
    <div className="flex h-[400px] w-full max-w-sm flex-col items-center py-2">
      <div className="flex flex-1 items-start justify-center pt-12">
        <Beacon activity={activity} />
      </div>
      <div className="flex w-full flex-col items-center gap-3">
        <PressureButton variant="outline" size="sm" onClick={nextStage}>
          Next activity
        </PressureButton>
        <p className="max-w-full truncate font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          ▸ {log}
        </p>
      </div>
    </div>
  );
}
