"use client";

import * as React from "react";

import { FoldOut } from "@/registry/ui/fold-out";

function Panel({
  step,
  title,
  line,
}: {
  step: number;
  title: string;
  line: string;
}) {
  return (
    <div className="flex h-full items-center justify-between px-4">
      <div>
        <p className="text-label text-ink-3">
          FOLD {String(step).padStart(2, "0")} · {title}
        </p>
        <p className="text-ink-2 mt-1 font-mono text-xs">{line}</p>
      </div>
      <span
        aria-hidden
        className="border-hairline-strong size-6 rounded-full border font-mono text-[9px] leading-6 text-center text-ink-3"
      >
        {step}
      </span>
    </div>
  );
}

export function FoldOutDemo() {
  const [state, setState] = React.useState("FOLDED");

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">FIELD CHART · 04 FOLDS</p>
          <p className="text-label text-ink-3">KQ-094</p>
        </div>

        <FoldOut
          panelHeight={72}
          openLabel="UNFOLD CHART"
          closeLabel="FOLD CHART"
          onOpenChange={(open) => setState(open ? "OPEN" : "FOLDED")}
          panels={[
            <Panel key="p1" step={1} title="LEGEND" line="symbols and scales" />,
            <Panel key="p2" step={2} title="NORTH SPAN" line="masts 01 through 04" />,
            <Panel key="p3" step={3} title="SOUTH SPAN" line="masts 05 through 08" />,
            <Panel key="p4" step={4} title="NOTES" line="wind allowances, rev 3" />,
          ]}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          CHART · <span className="text-cobalt-bright">{state}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Unfold the chart - each crease opens in its own stage.
        </p>
      </div>
    </div>
  );
}
