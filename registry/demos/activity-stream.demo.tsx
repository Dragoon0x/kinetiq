"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ActivityStream,
  defaultActivityActors,
  defaultActivityKinds,
  type ActivityEvent,
} from "@/registry/ui/activity-stream";

export const tweaks = defineTweaks({
  rate: {
    kind: "range",
    label: "Rate",
    default: 12,
    min: 0,
    max: 30,
    step: 3,
    unit: "/min",
  },
  group: {
    kind: "choice",
    label: "Group",
    default: "actor",
    options: ["actor", "kind", "none"],
    names: { actor: "By person", kind: "By type", none: "Off" },
  },
  pill: {
    kind: "choice",
    label: "Pill",
    default: "avatars",
    options: ["avatars", "count", "off"],
    names: { avatars: "Faces", count: "Count", off: "Off" },
  },
});

const nameOf = (id: string) =>
  defaultActivityActors.find((a) => a.id === id)?.name ?? "someone";
const pluralOf = (id: string) => {
  const k = defaultActivityKinds.find((x) => x.id === id);
  return (k?.plural ?? `${k?.label ?? id}s`).toLowerCase();
};

/**
 * Fieldline's operations workspace: route comments, releases, payouts on
 * Waylight Pay, people joining, files and alerts, running live.
 */
export function ActivityStreamDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [live, setLive] = React.useState(true);
  const [filter, setFilter] = React.useState<string[]>([]);
  const [waiting, setWaiting] = React.useState<ActivityEvent[]>([]);
  const [note, setNote] = React.useState("");
  const holds = (values.pill ?? "avatars") !== "off";

  // Switching the pill off lets everything waiting into the feed.
  const [seenHolds, setSeenHolds] = React.useState(holds);
  if (seenHolds !== holds) {
    setSeenHolds(holds);
    if (!holds) setWaiting([]);
  }

  const stream = (
    <ActivityStream
      title="Fieldline Ops"
      live={live}
      sound={sound}
      {...values}
      onFilterChange={(kinds) => {
        setFilter(kinds);
        setNote(
          kinds.length > 0 ? `showing ${kinds.map(pluralOf).join(", ")}` : "",
        );
      }}
      onArrive={(event) => {
        setNote(`last from ${nameOf(event.actor).toLowerCase()}`);
        if (holds) setWaiting((list) => [...list, event]);
      }}
      onOpen={(event) =>
        setNote(`opened ${(event.target ?? event.action).toLowerCase()}`)
      }
      onReveal={() => setWaiting([])}
    />
  );

  if (!chrome) return <div className="w-full">{stream}</div>;

  const matching = waiting.filter(
    (e) => filter.length === 0 || filter.includes(e.kind),
  ).length;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {stream}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{live ? "live" : "paused"}</span>
          {matching > 0 ? ` · ${matching} new waiting` : " · up to date"}
          {note ? ` · ${note}` : ""}
        </p>
        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {live ? "Pause" : "Resume"}
        </button>
      </div>
    </div>
  );
}
