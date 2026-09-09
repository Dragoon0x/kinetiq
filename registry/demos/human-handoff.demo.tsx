"use client";

import * as React from "react";

import { HumanHandoff, type HandoffStage } from "@/registry/ui/human-handoff";

/** Coldbrook support: a refund above the house limit goes to a person. */
const MODEL = "Fernworks Model 3";
const PERSON = { name: "Ines", team: "Coldbrook support" };
const REASON = "Refund above the house limit needs a person's approval.";
/** Seeded: how long the queue takes to find Ines. */
const QUEUE_MS = 3800;

const formatWait = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const primary =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";
const quiet =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function HumanHandoffDemo() {
  const [stage, setStage] = React.useState<HandoffStage>("model");
  const [seconds, setSeconds] = React.useState(0);
  const [cancelled, setCancelled] = React.useState(false);

  // A hidden tab holds the queue; Ines should not arrive unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (stage !== "waiting" || !visible) return;
    const timer = window.setTimeout(() => setStage("human"), QUEUE_MS);
    return () => window.clearTimeout(timer);
  }, [stage, visible]);

  const handOff = () => {
    setCancelled(false);
    setSeconds(0);
    setStage("waiting");
  };

  const status =
    stage === "waiting"
      ? `Waiting · ${formatWait(seconds)}`
      : stage === "human"
        ? `${PERSON.name} joined · waited ${formatWait(seconds)}`
        : cancelled
          ? "Handoff cancelled"
          : "Model answering";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HumanHandoff
        label="Who holds the thread"
        stage={stage}
        model={MODEL}
        person={PERSON}
        reason={REASON}
        onWaitChange={setSeconds}
        onCancel={() => {
          setCancelled(true);
          setStage("model");
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={stage !== "model"}
          onClick={handOff}
          className={primary}
        >
          Hand off
        </button>
        {stage !== "model" ? (
          <button
            type="button"
            onClick={() => {
              setCancelled(false);
              setStage("model");
            }}
            className={quiet}
          >
            Reset
          </button>
        ) : null}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
