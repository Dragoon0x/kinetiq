"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTriageIssues,
  defaultTriageMembers,
  defaultTriageNow,
  ExceptionTriage,
  type TriageIssue,
  type TriageStatus,
} from "@/registry/ui/exception-triage";

export const tweaks = defineTweaks({
  sparkStyle: {
    kind: "choice",
    label: "Spark",
    default: "line",
    options: ["line", "bars", "area"],
    names: { line: "Line", bars: "Bars", area: "Area" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "ember", "mono"],
    names: { cobalt: "Cobalt", ember: "Ember", mono: "Mono" },
  },
});

/** Fixed yesterday, so "Regress a fix" always has something to bring back. */
const FIXED: TriageIssue = {
  id: "datalayer-ref",
  fingerprint: "5c0e91d2",
  type: "ReferenceError",
  message: "dataLayer is not defined",
  culprit: "analytics/track.ts in pushEvent",
  level: "error",
  events: 640,
  users: 233,
  firstSeen: defaultTriageNow - 9 * 86_400_000,
  lastSeen: defaultTriageNow - 20 * 3_600_000,
  hourly: [
    9, 12, 8, 6, 4, 3, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  status: "resolved",
  assignee: "ines",
};

const START: TriageIssue[] = [...defaultTriageIssues, FIXED];

/**
 * Waylight checkout on a Tuesday morning: the on-call engineer triages the
 * night's errors before stand-up. Resolve a few with E, then "Regress a fix"
 * brings the last one back to the top with a Reopened tag.
 */
export function ExceptionTriageDemo({
  chrome = true,
  // The inbox is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [issues, setIssues] = React.useState<TriageIssue[]>(START);
  const [status, setStatus] = React.useState<TriageStatus>("ready");
  const [lastFixed, setLastFixed] = React.useState<string>(FIXED.id);
  const [note, setNote] = React.useState<string | null>(null);

  const patch = (id: string, change: Partial<TriageIssue>) =>
    setIssues((list) =>
      list.map((i) => (i.id === id ? { ...i, ...change } : i)),
    );

  const inbox = (
    <ExceptionTriage
      issues={issues}
      members={defaultTriageMembers}
      onResolve={(issue) => {
        patch(issue.id, { status: "resolved" });
        setLastFixed(issue.id);
        setNote(`resolved · ${issue.type}`);
      }}
      onIgnore={(issue) => {
        patch(issue.id, { status: "ignored" });
        setNote(`ignored · ${issue.type}`);
      }}
      onAssign={(issue, memberId) => {
        patch(issue.id, { assignee: memberId });
        const who = defaultTriageMembers.find((m) => m.id === memberId);
        setNote(
          who
            ? `assigned · ${issue.type} → ${who.name}`
            : `unassigned · ${issue.type}`,
        );
      }}
      onOpen={(issue) => setNote(`opened · ${issue.type}`)}
      status={status}
      onRetry={() => setStatus("ready")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{inbox}</div>;

  const open = issues.filter(
    (i) => i.status === "unresolved" || i.status === "regressed",
  );
  const reopened = open.filter((i) => i.status === "regressed").length;
  const fixed = issues.find((i) => i.id === lastFixed);

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {inbox}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={fixed?.status !== "resolved" || undefined}
          onClick={() => {
            if (!fixed || fixed.status !== "resolved") return;
            patch(fixed.id, {
              status: "regressed",
              lastSeen: defaultTriageNow - 60_000,
              events: fixed.events + 23,
              hourly: [...fixed.hourly.slice(1), 23],
            });
            setNote(`regressed · ${fixed.type} is back`);
          }}
          className={cn(
            button,
            fixed?.status !== "resolved" && "cursor-not-allowed opacity-60",
          )}
        >
          Regress a fix
        </button>
        <button
          type="button"
          aria-pressed={status === "error"}
          onClick={() => setStatus((s) => (s === "error" ? "ready" : "error"))}
          className={cn(
            button,
            status === "error" &&
              "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail fetch
        </button>
        <button
          type="button"
          onClick={() => {
            setIssues(START);
            setStatus("ready");
            setLastFixed(FIXED.id);
            setNote(null);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "error" ? (
          <>
            <span className="text-signal">fetch failed</span> · retry to load
            issues
          </>
        ) : open.length === 0 ? (
          <span className="text-signal">inbox zero</span>
        ) : (
          <>
            <span className="text-signal">{open.length} open</span>
            {reopened ? ` · ${reopened} reopened` : ""}
            {note ? ` · ${note}` : " · j k move · e resolve"}
          </>
        )}
      </p>
    </div>
  );
}
