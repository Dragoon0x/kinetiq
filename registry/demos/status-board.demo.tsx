"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultStatusIncidents,
  defaultStatusRegions,
  defaultStatusServices,
  StatusBoard,
} from "@/registry/ui/status-board";

export const tweaks = defineTweaks({
  days: {
    kind: "range",
    label: "Days",
    default: 90,
    min: 30,
    max: 90,
    step: 15,
    unit: "days",
  },
  live: { kind: "toggle", label: "Live", default: true },
  regions: { kind: "toggle", label: "Regions", default: true },
});

const MIN_MS = 60_000;

const span = (minutes: number) => {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${rest} min` : `${m / 60} h`;
};

const nameOf = (id: string) =>
  defaultStatusServices.find((s) => s.id === id)?.name ?? id;

const troubled = defaultStatusServices.filter(
  (s) => s.status !== "operational",
);
const ongoing = defaultStatusIncidents.filter((i) => i.end === undefined);

/**
 * Fieldline's public status page on the afternoon of 30 September: webhook
 * deliveries are running late, the API had a bad morning six days ago, and
 * one region is slow.
 */
export function StatusBoardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [incident, setIncident] = React.useState<string | null>(null);
  const [region, setRegion] = React.useState<string | null>(null);

  const board = (
    <StatusBoard
      title="Fieldline status"
      incident={incident}
      onIncidentChange={setIncident}
      region={region}
      onRegionChange={setRegion}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{board}</div>;

  const picked = defaultStatusIncidents.find((i) => i.id === incident);
  const place =
    values.regions === false
      ? null
      : defaultStatusRegions.find((r) => r.id === region);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {board}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {picked ? (
          <>
            <span className="text-signal">{picked.title}</span> ·{" "}
            {span(
              ((picked.end ?? picked.start + 47 * MIN_MS) - picked.start) /
                MIN_MS,
            )}
            {picked.end === undefined ? " so far" : ""} ·{" "}
            {picked.services.map(nameOf).join(", ")}
          </>
        ) : (
          <>
            <span className="text-signal">
              {troubled.length
                ? troubled.map((s) => `${s.name} ${s.status}`).join(", ")
                : "all systems operational"}
            </span>{" "}
            · {ongoing.length} ongoing · latency for{" "}
            {place ? place.name : "all regions"}
          </>
        )}
      </p>
    </div>
  );
}
