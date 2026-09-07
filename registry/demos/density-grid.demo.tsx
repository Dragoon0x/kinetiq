"use client";

import * as React from "react";

import { DensityGrid, type GridDensity } from "@/registry/ui/density-grid";

const MEMBERS = [
  { id: "gw-1", name: "Rosa Amberlink", role: "Field lead", status: "Active" },
  { id: "gw-2", name: "Ines Kettleby", role: "Calibration", status: "Active" },
  { id: "gw-3", name: "Owen Marsh", role: "Depot", status: "Away" },
  { id: "gw-4", name: "Priya Vance", role: "Calibration", status: "Active" },
  { id: "gw-5", name: "Teo Bramhall", role: "Yard", status: "Invited" },
  { id: "gw-6", name: "Halle Crane", role: "Field lead", status: "Paused" },
  { id: "gw-7", name: "Nils Oberg", role: "Depot", status: "Active" },
  { id: "gw-8", name: "June Rakes", role: "Yard", status: "Invited" },
];

export function DensityGridDemo() {
  const frame = React.useRef<HTMLDivElement>(null);
  const [density, setDensity] = React.useState<GridDensity>("comfortable");
  const [height, setHeight] = React.useState(0);

  // offsetHeight, not getBoundingClientRect: the card carries a layout
  // transform mid-glide and the rect would report the animated size.
  React.useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <DensityGrid
        ref={frame}
        label="Gaugeworks crew"
        rows={MEMBERS}
        density={density}
        onDensityChange={setDensity}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-[var(--signal,var(--primary))]">{density}</span> ·{" "}
        {height}px tall
      </p>
    </div>
  );
}
