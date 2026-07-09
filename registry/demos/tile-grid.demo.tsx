"use client";

import * as React from "react";

import { TileGrid, type Tile } from "@/registry/ui/tile-grid";

type Module = {
  id: string;
  serial: string;
  metric: string;
  /** Fixed accent per module — no randomness, stable across renders. */
  accent: string;
};

const MODULES: Module[] = [
  { id: "CPU", serial: "0x1A", metric: "42%", accent: "var(--signal)" },
  { id: "MEM", serial: "0x2B", metric: "6.1G", accent: "var(--accent-bright)" },
  { id: "NET", serial: "0x3C", metric: "88ms", accent: "var(--warn)" },
  { id: "DISK", serial: "0x4D", metric: "512G", accent: "var(--success)" },
  { id: "GPU", serial: "0x5E", metric: "71%", accent: "var(--accent)" },
  { id: "PWR", serial: "0x6F", metric: "94W", accent: "var(--danger)" },
];

const INITIAL_ORDER = MODULES.map((module) => module.id);

function ModuleFace({ module }: { module: Module }) {
  return (
    <div className="flex h-24 w-full flex-col justify-between p-2.5">
      <div className="flex items-start justify-between">
        <span className="text-label text-foreground">{module.id}</span>
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: module.accent }}
        />
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-ink-3 font-mono text-[10px] tracking-wide tabular-nums">
          {module.serial}
        </span>
        <span
          className="font-mono text-sm tabular-nums"
          style={{ color: module.accent }}
        >
          {module.metric}
        </span>
      </div>
    </div>
  );
}

export function TileGridDemo() {
  const [order, setOrder] = React.useState<string[]>(INITIAL_ORDER);

  const tiles: Tile[] = React.useMemo(
    () =>
      MODULES.map((module) => ({
        id: module.id,
        content: <ModuleFace module={module} />,
      })),
    [],
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <TileGrid
        tiles={tiles}
        columns={3}
        onOrderChange={setOrder}
        aria-label="Rack modules"
      />
      <div className="border-hairline flex flex-col gap-1.5 border-t pt-3">
        <p role="status" className="text-label text-muted-foreground">
          Order ·{" "}
          {order.map((id, index) => (
            <React.Fragment key={id}>
              {index > 0 && <span className="text-ink-3"> </span>}
              <span className="text-[var(--signal,var(--primary))]">{id}</span>
            </React.Fragment>
          ))}
        </p>
        <p className="text-ink-3 font-mono text-[10px] tracking-wide">
          DRAG TO REORDER · SPACE TO LIFT
        </p>
      </div>
    </div>
  );
}
