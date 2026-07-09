"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { FlyoverMap, type FlyoverSection } from "@/registry/ui/flyover-map";

/** Fixed survey instruments — indexed by position, never random. */
const INSTRUMENTS = [
  { tag: "VN-01", name: "Vane Gauge" },
  { tag: "DR-02", name: "Drift Meter" },
  { tag: "TQ-03", name: "Torque Cell" },
  { tag: "LV-04", name: "Level Sight" },
] as const;

/** Fixed calibration ledger — short mono rows, deterministic offsets. */
const CALIBRATION = [
  { step: "CAL-01", note: "Zero vane at post", value: "+0.02" },
  { step: "CAL-02", note: "Sweep to both stops", value: "-0.11" },
  { step: "CAL-03", note: "Log drift over two", value: "+0.40" },
  { step: "CAL-04", note: "Stamp the bay card", value: "0.00" },
] as const;

/** Four sectors at deliberately different heights, so districts read unequal. */
const SECTORS: FlyoverSection[] = [
  {
    id: "overview",
    label: "OVERVIEW",
    content: (
      <div className="flex flex-col gap-2">
        <p className="m-0 leading-relaxed">
          Grid stations report nominal across the north field.
        </p>
        <p className="m-0 leading-relaxed">
          Two benches flagged for manual review after the morning sweep.
        </p>
      </div>
    ),
  },
  {
    id: "instruments",
    label: "INSTRUMENTS",
    content: (
      <div className="grid grid-cols-2 gap-2">
        {INSTRUMENTS.map((instrument) => (
          <div
            key={instrument.tag}
            className="rounded-2 border border-hairline bg-surface-1 px-3 py-2"
          >
            <p className="m-0 font-mono text-[10px] tracking-[0.08em] text-ink-3">
              {instrument.tag}
            </p>
            <p className="m-0 text-sm text-ink">{instrument.name}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "calibration",
    label: "CALIBRATION",
    content: (
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {CALIBRATION.map((row) => (
          <li
            key={row.step}
            className="flex items-baseline justify-between gap-3 font-mono text-[10px] tracking-[0.08em]"
          >
            <span className="shrink-0 text-ink-3">{row.step}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">
              {row.note}
            </span>
            <span className="shrink-0 text-ink-2 tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "appendix",
    label: "APPENDIX",
    content: (
      <div className="flex flex-col gap-2">
        <p className="m-0 leading-relaxed">
          Full plate scans archived under the north-field ledger.
        </p>
        <p className="m-0 leading-relaxed">
          Retire any sheet that returns with a creased edge.
        </p>
      </div>
    ),
  },
];

/**
 * FlyoverMap as a bench instrument: a four-sector site survey with its aerial
 * chart pinned bottom-right, framed by a bezel plate with corner ticks and the
 * KQ-118 spec header. The status line mirrors every arrival.
 */
export function FlyoverMapDemo() {
  const [arrivedId, setArrivedId] = React.useState<string>("overview");
  const arrived = SECTORS.find((sector) => sector.id === arrivedId) ?? SECTORS[0];

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-0 p-4">
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
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Site Survey &middot; 4 Sectors
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-118</span>
        </div>

        <FlyoverMap
          sections={SECTORS}
          height={300}
          onArrive={setArrivedId}
          aria-label="Site survey"
        />

        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Sector &middot;{" "}
          <span className="text-signal">{arrived?.label ?? "—"}</span>
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Click a district on the map - the survey flies to it.
      </p>
    </div>
  );
}
