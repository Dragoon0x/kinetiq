"use client";

import * as React from "react";

import { RollbackArc, type ReleaseVersion } from "@/registry/ui/rollback-arc";

/** Coldbrook's gate-relay: six seeded versions, the frontier a bad one. */
const VERSIONS: ReleaseVersion[] = (
  [
    ["v1", "2.11.0", "good", ""],
    ["v2", "2.12.2", "good", ""],
    ["v3", "2.13.0", "good", "Ran a full week on live"],
    ["v4", "2.13.4", "good", "Last clean run on live"],
    ["v5", "2.13.6", "unknown", "Only nine minutes of traffic"],
    ["v6", "2.14.0", "bad", "Holds time out under the yard's clock"],
  ] as [
    id: string,
    label: string,
    status: ReleaseVersion["status"],
    note: string,
  ][]
).map(([id, label, status, note]) => ({
  id,
  label,
  status,
  ...(note ? { note } : {}),
}));

const FRONTIER = "v6";

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function RollbackArcDemo() {
  const [deployed, setDeployed] = React.useState(FRONTIER);
  const [chosen, setChosen] = React.useState(FRONTIER);
  const [rolling, setRolling] = React.useState(false);

  const onArc = VERSIONS.find((version) => version.id === deployed);
  const caret = VERSIONS.find((version) => version.id === chosen);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RollbackArc
        service="gate-relay"
        label="gate-relay versions"
        versions={VERSIONS}
        value={deployed}
        onValueChange={(id) => {
          setRolling(false);
          setDeployed(id);
        }}
        onChosenChange={setChosen}
        onRollbackStart={() => setRolling(true)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={deployed === FRONTIER || rolling}
          onClick={() => setDeployed(FRONTIER)}
        >
          Reset arc
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          On {onArc ? onArc.label : "nothing"}
        </span>
        {caret ? ` · chosen ${caret.label} · ${caret.status}` : ""}
        {rolling ? " · rolling back" : ""}
      </p>
    </div>
  );
}
