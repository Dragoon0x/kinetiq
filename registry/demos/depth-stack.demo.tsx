"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { DepthStack, type StackLayer } from "@/registry/ui/depth-stack";

/** Fixed strata log — five layers, surface to refusal, never random. */
const STRATA = [
  {
    id: "topsoil",
    label: "TOPSOIL",
    range: "0.0–1.2 M",
    note: "Root mat and dark loam - the auger barely notices it.",
    hue: 130,
  },
  {
    id: "sediment",
    label: "SEDIMENT",
    range: "1.2–6.5 M",
    note: "Banded silt beds — every flood year still legible.",
    hue: 86,
  },
  {
    id: "basalt",
    label: "BASALT",
    range: "6.5–19.0 M",
    note: "Columnar flow rock. Feed rate drops to a crawl.",
    hue: 258,
  },
  {
    id: "aquifer",
    label: "AQUIFER",
    range: "19.0–24.5 M",
    note: "Saturated gravel lens under light artesian head.",
    hue: 195,
  },
  {
    id: "bedrock",
    label: "BEDROCK",
    range: "24.5 M+",
    note: "Unfractured granite. The bit stops here.",
    hue: 320,
  },
] as const;

type Stratum = (typeof STRATA)[number];

/** One stratum face: mono depth range, one field note, indexed tint band. */
function StratumFace({ stratum }: { stratum: Stratum }) {
  return (
    <div className="flex h-full flex-col justify-between p-3">
      <div className="min-w-0">
        <p className="font-mono text-xs tracking-[0.08em] text-ink tabular-nums">
          {stratum.range}
        </p>
        <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
          {stratum.note}
        </p>
      </div>
      {/* Tint band keyed to this stratum's hue — indexed OKLCH, never random. */}
      <div className="flex items-center gap-2">
        <div
          aria-hidden
          className="h-1.5 min-w-0 flex-1 rounded-full"
          style={{
            background: `linear-gradient(90deg, oklch(0.72 0.13 ${stratum.hue}), oklch(0.5 0.09 ${stratum.hue}))`,
          }}
        />
        <span className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-ink-3 tabular-nums">
          H{String(stratum.hue).padStart(3, "0")}
        </span>
      </div>
    </div>
  );
}

const LAYERS: StackLayer[] = STRATA.map((stratum) => ({
  id: stratum.id,
  label: stratum.label,
  content: <StratumFace stratum={stratum} />,
}));

/**
 * DepthStack dressed as a core-sample log: the KQ-061 pile on a bezel plate
 * with corner ticks, five strata from topsoil down to refusal. The status
 * line only moves when a layer settles crisp.
 */
export function DepthStackDemo() {
  // KQ-061 boots at the surface; the readout follows settles only.
  const [stratum, setStratum] = React.useState(0);
  const current = STRATA[stratum];

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

        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Core Sample &middot; 5 Strata
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-061</span>
        </div>

        <DepthStack
          aria-label="Core sample strata"
          layers={LAYERS}
          defaultIndex={0}
          height={260}
          onIndexChange={setStratum}
        />

        {/* Settled readout — mirrors the pile, one move per settle. */}
        <p role="status" className="mt-4 text-center text-label text-ink-3">
          Stratum &middot;{" "}
          <span className="text-signal">{current?.label ?? "—"}</span>
        </p>

        <p className="mt-4 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-061 &middot; Depth Stack &middot; Layers 5 &middot; P 800 &middot;
          &zeta; 0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Scroll or drag through the pile - each layer settles crisp.
      </p>
    </div>
  );
}
