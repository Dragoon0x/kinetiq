"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { DepthMenu, type DepthMenuNode } from "@/registry/ui/depth-menu";

/** Fixed console tree — three levels, indexed hints, never random. */
const TREE: DepthMenuNode[] = [
  {
    id: "calibrate",
    label: "CALIBRATE",
    hint: "03",
    children: [
      {
        id: "springs",
        label: "SPRINGS",
        hint: "05",
        children: [
          { id: "flick", label: "FLICK", hint: "ζ 0.99" },
          { id: "snap", label: "SNAP", hint: "ζ 0.83" },
          { id: "glide", label: "GLIDE", hint: "ζ 0.98" },
          { id: "drift", label: "DRIFT", hint: "ζ 1.00" },
          { id: "recoil", label: "RECOIL", hint: "ζ 0.53" },
        ],
      },
      { id: "lenses", label: "LENSES", hint: "F/1.4" },
      { id: "dampers", label: "DAMPERS", hint: "PAIR" },
    ],
  },
  {
    id: "route",
    label: "ROUTE SIGNAL",
    hint: "03",
    children: [
      { id: "bus-a", label: "BUS A", hint: "48V" },
      { id: "bus-b", label: "BUS B", hint: "48V" },
      { id: "monitor", label: "MONITOR", hint: "TAP" },
    ],
  },
  { id: "export", label: "EXPORT", hint: "CSV" },
  { id: "shutdown", label: "SHUT DOWN", hint: "SAFE" },
];

/** Resolve a selection into display labels for the status line. */
function orderLabel(id: string, path: string[]): string {
  const labels: string[] = [];
  let nodes: DepthMenuNode[] = TREE;
  for (const segment of [...path, id]) {
    const node = nodes.find((candidate) => candidate.id === segment);
    if (!node) break;
    labels.push(node.label);
    nodes = node.children ?? [];
  }
  return labels.join(" / ");
}

/**
 * DepthMenu as a bench instrument: the ARRAY CONSOLE command tree on the
 * perspective stage, framed by a bezel plate with corner ticks and the
 * KQ-113 spec header. The status line mirrors the last leaf order.
 */
export function DepthMenuDemo() {
  const [lastOrder, setLastOrder] = React.useState<string | null>(null);

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
            Array Console &middot; 3 Levels
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-113</span>
        </div>

        <DepthMenu
          items={TREE}
          aria-label="Array console"
          onSelect={(id, path) => setLastOrder(orderLabel(id, path))}
        />

        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Last Order &middot;{" "}
          <span className="text-signal">{lastOrder ?? "—"}</span>
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Step into a branch - the trail hangs behind you.
      </p>
    </div>
  );
}
