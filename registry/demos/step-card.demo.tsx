"use client";

import * as React from "react";

import {
  StepCard,
  type StepCardCallStatus,
  type StepCardStatus,
} from "@/registry/ui/step-card";

/** Drafter on Waylight release notes: the inputs never change. */
// prettier-ignore
const STEP = {
  id: "draft",
  title: "Draft the release note",
  agent: "Drafter",
  model: "Fernworks Model 3",
  inputs: [
    { name: "branch", value: "release/2.4" },
    { name: "tickets", value: "12 closed" },
    { name: "tone", value: "plain" },
  ],
};

// prettier-ignore
const CALLS = [
  { id: "read", name: "read_changes", detail: "merged since 2.3" },
  { id: "tickets", name: "list_tickets", detail: "closed, 12" },
  { id: "write", name: "write_note", detail: "release-note.md" },
];

/** Tenths of a second at which each call lands; the write fails first. */
const DONE_AT = [9, 18, 30];
const FAIL_AT = 21;
const TOTAL = 30;
const ERROR = "Note exceeds 400 words";
const OUTPUT = "release-note.md · 312 words";

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function StepCardDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [retried, setRetried] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  // A hidden tab pauses the script; the step should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const paused = ticks >= FAIL_AT && !retried;
  const complete = ticks >= TOTAL;
  const running = playing && !paused && !complete;

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const status: StepCardStatus = !playing
    ? "queued"
    : paused
      ? "failed"
      : complete
        ? "done"
        : "running";

  const callStatus = (index: number): StepCardCallStatus => {
    if (!playing) return "pending";
    const start = index === 0 ? 0 : (DONE_AT[index - 1] ?? 0);
    const end = DONE_AT[index] ?? 0;
    if (ticks < start) return "pending";
    if (index === 2 && paused) return "failed";
    return ticks < end ? "running" : "done";
  };
  const calls = CALLS.map((call, index) => ({
    ...call,
    status: callStatus(index),
  }));
  const live = calls.find((call) => call.status === "running");

  const line = !playing
    ? "Idle · press play"
    : paused
      ? "Failed · write_note · retry offered"
      : complete
        ? `Done · 3 calls · ${retried ? 1 : 0} retry`
        : `${retried ? "Retrying" : "Running"} · ${live?.name ?? "write_note"}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StepCard
        step={{
          ...STEP,
          calls,
          output: complete ? OUTPUT : undefined,
          error: paused ? ERROR : undefined,
        }}
        index={2}
        status={status}
        progress={Math.min(ticks, TOTAL) / TOTAL}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onRetry={() => setRetried(true)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTicks(0);
            setRetried(false);
            setPlaying(true);
            setExpanded(true);
          }}
          className={button}
        >
          {playing ? "Replay" : "Play"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line}
      </p>
    </div>
  );
}
