"use client";

import * as React from "react";

import { Orrery, type OrreryItem } from "@/registry/ui/orrery";
import { cn } from "@/registry/lib/utils";

/** Fixed relay roster — ids, bands and status words never change per visit. */
const STATIONS = [
  { id: "RLY-01", label: "Meridian", band: "S-BAND", status: "NOMINAL" },
  { id: "RLY-02", label: "Aphelion", band: "X-BAND", status: "NOMINAL" },
  { id: "RLY-03", label: "Cinder Gate", band: "KA-BAND", status: "STANDBY" },
  { id: "RLY-04", label: "Larkspur", band: "UHF", status: "NOMINAL" },
  { id: "RLY-05", label: "Basalt Relay", band: "L-BAND", status: "SHADOWED" },
  { id: "RLY-06", label: "Windrow", band: "KU-BAND", status: "NOMINAL" },
] as const;

type Station = (typeof STATIONS)[number];

const ITEMS: OrreryItem[] = STATIONS.map((station) => ({
  id: station.id,
  label: station.label,
}));

/**
 * Orrery dressed as a relay constellation board: six stations on inclined
 * orbits around the KQ-079 CORE plate. Pulling a station forward opens its
 * band/status card; the status line mirrors every capture and release.
 */
export function OrreryDemo() {
  // The board boots scanning; the line only changes when focus does.
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const focusStation: Station | undefined = STATIONS.find(
    (station) => station.id === focusId,
  );

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Relay Constellation &middot; 6 Stations
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-079</span>
        </div>

        <div className="flex justify-center">
          <Orrery
            items={ITEMS}
            radius={96}
            aria-label="Relay constellation"
            onFocusChange={setFocusId}
            hub={
              <span className="flex flex-col items-center gap-1 leading-none">
                <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-ink">
                  CORE
                </span>
                <span className="font-mono text-[8px] tracking-[0.12em] text-ink-3">
                  RELAY
                </span>
              </span>
            }
            detail={(item) => {
              const station = STATIONS.find((s) => s.id === item.id);
              if (!station) {
                return <p className="text-center text-sm text-ink">{item.label}</p>;
              }
              return <StationCard station={station} />;
            }}
          />
        </div>

        {/* Mirrors onFocusChange — the board's settled telemetry word. */}
        <p
          role="status"
          className="border-t border-hairline pt-3 text-center text-label"
        >
          {focusStation ? (
            <span className="text-ink-2">
              IN FOCUS &middot;{" "}
              <span className="text-signal tabular-nums">
                {focusStation.id}
              </span>
            </span>
          ) : (
            <span className="text-ink-3">SCANNING</span>
          )}
        </p>

        <p className="mt-3 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-079 &middot; Orrery &middot; R 96 &middot; Incl 24&deg; &middot; T
          36s
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Click a body to pull it into focus - Escape returns it to orbit.
      </p>
    </div>
  );
}

/** Focus card: the station's mono id, band, and a status word. */
function StationCard({ station }: { station: Station }) {
  return (
    <dl className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-label text-ink-3">Station</dt>
        <dd className="font-mono text-xs text-ink tabular-nums">
          {station.id}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-label text-ink-3">Band</dt>
        <dd className="font-mono text-xs text-ink-2 tabular-nums">
          {station.band}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-hairline pt-1.5">
        <dt className="text-label text-ink-3">Status</dt>
        <dd className="font-mono text-xs font-medium tracking-[0.1em] text-signal">
          {station.status}
        </dd>
      </div>
    </dl>
  );
}
