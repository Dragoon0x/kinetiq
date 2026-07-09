"use client";

import * as React from "react";

import { Grid3x3, MapPin, Radar, RefreshCw, ScrollText, SlidersHorizontal } from "lucide-react";

import { OrbitMenu, type OrbitItem } from "@/registry/ui/orbit-menu";

/** Fixed toolset — six short-labelled modes, indexed by position, never random. */
const TOOLS: OrbitItem[] = [
  { id: "tune", label: "Tune", icon: <SlidersHorizontal /> },
  { id: "scan", label: "Scan", icon: <Radar /> },
  { id: "log", label: "Log", icon: <ScrollText /> },
  { id: "sync", label: "Sync", icon: <RefreshCw /> },
  { id: "map", label: "Map", icon: <MapPin /> },
  { id: "grid", label: "Grid", icon: <Grid3x3 /> },
];

export function OrbitMenuDemo() {
  const [active, setActive] = React.useState<string>(TOOLS[0]?.id ?? "tune");
  const activeLabel =
    TOOLS.find((tool) => tool.id === active)?.label ?? "—";

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <p className="self-start text-label text-ink-3">
        Instrument Modes{" "}
        <span className="text-ink-2 tabular-nums">
          &middot; {String(TOOLS.length).padStart(2, "0")} tools
        </span>
      </p>

      {/* The plate frames the dial; the ring sits centered on it. */}
      <div className="flex h-72 w-full items-center justify-center overflow-hidden rounded-4 border border-hairline bg-surface-1">
        <OrbitMenu
          aria-label="Instrument modes"
          items={TOOLS}
          defaultValue="tune"
          onValueChange={setActive}
          size={240}
        />
      </div>

      <p
        role="status"
        className="w-full border-t border-border pt-3 text-center text-label text-ink-3"
      >
        Mode &middot;{" "}
        <span className="text-[var(--signal,var(--primary))]">{activeLabel}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Drag the ring &middot; click a mode &middot; arrow keys
      </p>
    </div>
  );
}
