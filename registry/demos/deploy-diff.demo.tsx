"use client";

import * as React from "react";

import {
  DeployDiff,
  type DeployCommit,
  type DeployStatus,
  type ServiceChange,
} from "@/registry/ui/deploy-diff";

/** Basinworks ships dock-worker 2.14.0 from dock to live. */
const COMMITS: DeployCommit[] = [
  {
    id: "c1",
    hash: "a7f31c2",
    subject: "Hold the ledger open until the last batch settles",
    author: "rhodes",
  },
  {
    id: "c2",
    hash: "4c0b98d",
    subject: "Retry a refused hold once, then give up",
    author: "okonjo",
  },
  {
    id: "c3",
    hash: "19ee5a4",
    subject: "Name the yard queue in every log line",
    author: "rhodes",
  },
  {
    id: "c4",
    hash: "f30d71b",
    subject: "Drop the unused settle timer",
    author: "vance",
  },
];

const SERVICES: ServiceChange[] = [
  { id: "s1", name: "dock-worker", added: 214, removed: 38 },
  { id: "s2", name: "ledger-api", added: 36, removed: 4 },
  { id: "s3", name: "gate-relay", added: 8, removed: 8 },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function DeployDiffDemo() {
  const [status, setStatus] = React.useState<DeployStatus>("ready");
  const [open, setOpen] = React.useState(false);
  const [arm, setArm] = React.useState(0);
  const [hidden, setHidden] = React.useState(false);

  // A hidden tab throttles timers, so the deploy lands when the tab is back
  // rather than appearing to have finished while nobody was watching.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (status !== "deploying" || hidden) return;
    const timer = window.setTimeout(() => setStatus("deployed"), 1600);
    return () => window.clearTimeout(timer);
  }, [status, hidden]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DeployDiff
        release="dock-worker 2.14.0"
        from="dock"
        to="live"
        commits={COMMITS}
        services={SERVICES}
        status={status}
        blockedNote="Two checks are still running on dock."
        open={open}
        onOpenChange={setOpen}
        onArmChange={setArm}
        onDeploy={() => setStatus("deploying")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={status === "ready"}
          onClick={() => setStatus("ready")}
        >
          Reset
        </button>
        <button
          type="button"
          className={chip}
          disabled={status === "blocked"}
          onClick={() => setStatus("blocked")}
        >
          Block on checks
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{`${COMMITS.length} commits`}</span>
        {` · ${SERVICES.length} services · ${open ? "open" : "folded"}`}
        {status === "ready" ? ` · armed ${Math.round(arm * 100)}%` : ""}
        {` · ${status}`}
      </p>
    </div>
  );
}
