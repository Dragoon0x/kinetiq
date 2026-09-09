"use client";

import * as React from "react";

import {
  OrchestraView,
  type OrchestraAgent,
  type OrchestraContribution,
} from "@/registry/ui/orchestra-view";

/** Four agents on a Waylight quarterly report; ticks are tenths of a second. */
// prettier-ignore
const SCRIPT = [
  { id: "planner", name: "Planner", model: "Gaugeworks Reasoner", doing: "outlining the report", from: 0, until: 8, gives: "outline, 6 sections" },
  { id: "scout", name: "Scout", model: "Basinworks Scout", doing: "gathering sources", from: 0, until: 14, gives: "14 sources" },
  { id: "drafter", name: "Drafter", model: "Fernworks Model 3", doing: "writing the draft", from: 8, until: 28, gives: "draft, 900 words" },
  { id: "checker", name: "Checker", model: "Gaugeworks Reasoner", doing: "checking figures", from: 16, until: 32, gives: "2 issues" },
];

const END = 32;

const button =
  "flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function OrchestraViewDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [selected, setSelected] = React.useState("");

  // A hidden tab pauses the script; the report should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const complete = ticks >= END;
  const running = playing && !complete;

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const agents: OrchestraAgent[] = SCRIPT.map((entry) => ({
    id: entry.id,
    name: entry.name,
    model: entry.model,
    doing: entry.doing,
    status:
      !playing || ticks < entry.from
        ? "idle"
        : ticks < entry.until
          ? "active"
          : "done",
  }));

  const contributions: OrchestraContribution[] = SCRIPT.filter(
    (entry) => playing && ticks >= entry.until,
  )
    .sort((a, b) => a.until - b.until)
    .map((entry) => ({ id: entry.id, agentId: entry.id, text: entry.gives }));

  const active = agents.filter((agent) => agent.status === "active").length;
  const chosen = SCRIPT.find((entry) => entry.id === selected);
  const line =
    (!playing
      ? "Idle · press play"
      : complete
        ? `Complete · ${contributions.length} received`
        : `Running · ${active} active · ${contributions.length} received`) +
    (chosen ? ` · ${chosen.name} ${chosen.doing}` : "");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <OrchestraView
        label="Quarterly report"
        task="Q3 report"
        agents={agents}
        contributions={contributions}
        value={selected}
        onValueChange={setSelected}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTicks(0);
            setPlaying(true);
          }}
          className={`${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          {playing ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          disabled={!playing && selected === ""}
          onClick={() => {
            setPlaying(false);
            setTicks(0);
            setSelected("");
          }}
          className={`${button} border-hairline-strong text-foreground hover:bg-accent`}
        >
          Reset
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
