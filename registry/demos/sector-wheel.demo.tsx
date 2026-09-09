"use client";

import * as React from "react";

import { SectorWheel, type WheelSector } from "@/registry/ui/sector-wheel";

/** Basinworks Exchange's six sectors, clockwise from the notch, each with three movers. */
const ROSTER: [string, string, string][] = [
  ["energy", "Energy", "BSN Basin Power|HLW Hollowmere Oil|TRV Torvane Gas"],
  ["tech", "Tech", "FRN Fernwork|GGE Gauge Systems|LMN Loomline"],
  ["health", "Health", "CBK Coldbrook Labs|MRW Marrow Bio|VLT Veltis Care"],
  ["finance", "Finance", "WAY Waylight Pay|BKR Brookharbor|NDL Needle Trust"],
  ["goods", "Goods", "FLD Fieldline|ORC Orchard Row|KTL Kettleworks"],
  ["materials", "Materials", "SLT Saltmoor Metals|QRZ Quarrell|IRN Ironholt"],
];

/** Three market states: per sector, its move and then its three movers' moves. */
const SCRIPT: number[][][] = [
  [
    [-1.12, -1.9, -0.84, -0.61],
    [1.84, 3.2, 1.62, 0.71],
    [0.42, 0.88, 0.31, -0.12],
    [0.67, 1.14, 0.52, 0.35],
    [-0.28, -0.46, -0.31, 0.08],
    [-0.95, -1.64, -0.77, -0.44],
  ],
  [
    [2.4, 3.1, 2.05, 1.2],
    [0.35, 0.9, -0.15, 0.28],
    [-0.6, -1.1, -0.44, 0.05],
    [1.1, 1.85, 0.62, 0.9],
    [0.15, 0.3, -0.1, 0.22],
    [1.75, 2.6, 1.2, 1.05],
  ],
  [
    [-0.8, -1.35, -0.62, -0.4],
    [-2.35, -3.4, -1.9, -1.15],
    [0.95, 1.42, 0.66, 0.51],
    [-1.6, -2.2, -1.35, -0.98],
    [-0.45, -0.62, -0.51, -0.12],
    [-1.3, -2.05, -1.1, -0.66],
  ],
];

const sectorsAt = (tick: number): WheelSector[] =>
  ROSTER.map(([id, label, movers], index) => {
    const [change = 0, ...moves] = SCRIPT[tick]?.[index] ?? [];
    return {
      id,
      label,
      change,
      movers: movers.split("|").map((entry, position) => ({
        symbol: entry.slice(0, 3),
        name: entry.slice(4),
        change: moves[position] ?? 0,
      })),
    };
  });

const signed = (percent: number) =>
  `${percent > 0 ? "+" : percent < 0 ? "-" : ""}${Math.abs(percent).toFixed(2)}%`;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function SectorWheelDemo() {
  const [tick, setTick] = React.useState(0);
  const [sector, setSector] = React.useState("tech");

  const sectors = React.useMemo(() => sectorsAt(tick), [tick]);
  const chosen = sectors.find((entry) => entry.id === sector) ?? sectors[0];
  const top = chosen
    ? [...chosen.movers].sort(
        (a, b) => Math.abs(b.change) - Math.abs(a.change),
      )[0]
    : undefined;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <SectorWheel
        label="Basinworks Exchange"
        sectors={sectors}
        value={sector}
        onValueChange={setSector}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={tick >= SCRIPT.length - 1}
          onClick={() => setTick((current) => current + 1)}
        >
          Next tick
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={tick === 0}
          onClick={() => setTick(0)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-cobalt-bright">
          {chosen?.label ?? "No sector"}
        </span>{" "}
        <span className="tabular-nums">{signed(chosen?.change ?? 0)}</span>
        {top ? (
          <>
            {" "}
            · top <span className="text-signal">{top.symbol}</span>{" "}
            <span className="tabular-nums">{signed(top.change)}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
