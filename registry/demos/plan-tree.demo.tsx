"use client";

import * as React from "react";

import {
  PlanTree,
  type PlanNode,
  type PlanStatus,
} from "@/registry/ui/plan-tree";

/** A stretch of work in tenths of a second; a third value holds a failure until the re-plan. */
type Run = [start: number, end: number, failedUntil?: number];
/** Parent, id, label, the tick it is planned, and the stretches it runs. */
type Leaf = [string, string, string, number, Run[]];

const REPLAN_AT = 68;
const COMPLETE_AT = 106;

/** Scout, Drafter and Checker planning a Waylight release note. */
const ROOTS = [
  { id: "gather", label: "Gather changes", detail: "Scout", appear: 0 },
  { id: "draft", label: "Draft note", detail: "Drafter", appear: 6 },
  { id: "check", label: "Check note", detail: "Checker", appear: 12 },
];

const LEAVES: Leaf[] = [
  ["gather", "g1", "Read merged branches", 3, [[18, 26]]],
  ["gather", "g2", "List closed tickets", 3, [[26, 34]]],
  ["draft", "d1", "Outline sections", 9, [[36, 44]]],
  ["draft", "d2", "Write highlights", 9, [[44, 52]]],
  [
    "check",
    "c1",
    "Verify links",
    15,
    [
      [54, 62, REPLAN_AT],
      [90, 98],
    ],
  ],
  ["check", "c2", "Spell and style", 15, [[98, 106]]],
];

/** The Draft branch as re-planned after the link check fails. */
const REPLANNED: Leaf[] = [
  ["draft", "d3", "Fix two links", REPLAN_AT, [[72, 80]]],
  ["draft", "d4", "Rewrite highlights", REPLAN_AT, [[80, 88]]],
];

function leafStatus(runs: Run[], ticks: number): PlanStatus {
  for (const [start, end, failedUntil] of runs) {
    if (ticks < start) return "planned";
    if (ticks < end) return "running";
    if (failedUntil === undefined) return "done";
    if (ticks < failedUntil) return "failed";
  }
  return "planned";
}

function branchStatus(children: PlanNode[]): PlanStatus {
  const statuses = children.map((child) => child.status ?? "planned");
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("running")) return "running";
  const done = statuses.length > 0 && statuses.every((s) => s === "done");
  return done ? "done" : "planned";
}

function planAt(ticks: number): PlanNode[] {
  return ROOTS.filter((root) => ticks >= root.appear).map((root) => {
    const replanned = root.id === "draft" && ticks >= REPLAN_AT;
    const children = (replanned ? REPLANNED : LEAVES)
      .filter(([parent, , , appear]) => parent === root.id && ticks >= appear)
      .map(([, id, label, , runs]) => ({
        id,
        label,
        status: leafStatus(runs, ticks),
      }));
    const status = branchStatus(children);
    return { ...root, status, children, plan: replanned ? 1 : 0 };
  });
}

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function PlanTreeDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  // A hidden tab holds the plan where it is; nothing should complete unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const complete = ticks >= COMPLETE_AT;
  React.useEffect(() => {
    if (!playing || complete || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [playing, complete, visible]);

  const nodes = playing ? planAt(ticks) : [];
  const total = nodes.reduce(
    (n, node) => n + 1 + (node.children?.length ?? 0),
    0,
  );
  const root = nodes.find((node) => node.status === "running");
  const leaf = root?.children?.find((child) => child.status === "running");

  const status = !playing
    ? "Idle · press plan"
    : complete
      ? `Complete · ${total} steps · 1 re-plan`
      : nodes.some((node) => node.status === "failed")
        ? "Re-planning · Draft note"
        : root && leaf
          ? `Running · ${root.label} › ${leaf.label}`
          : `Planning · ${total} steps`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PlanTree label="Release note" nodes={nodes} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTicks(0);
            setPlaying(true);
          }}
          className={button}
        >
          {playing ? "Replay" : "Plan"}
        </button>
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
