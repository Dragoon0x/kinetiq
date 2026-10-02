"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTreeMapData,
  TreeMap,
  type TreeMapNode,
} from "@/registry/ui/tree-map";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 2,
    min: 1,
    max: 3,
    step: 1,
  },
  labels: {
    kind: "choice",
    label: "Labels",
    default: "full",
    options: ["full", "name", "off"],
    names: { full: "Full", name: "Name", off: "Off" },
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "category",
    options: ["category", "size", "change"],
    names: { category: "Category", size: "Size", change: "Change" },
  },
});

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const totalOf = (n: TreeMapNode): number =>
  n.children ? n.children.reduce((s, c) => s + totalOf(c), 0) : (n.value ?? 0);

const find = (
  n: TreeMapNode,
  id: string,
  parent: TreeMapNode | null = null,
): { node: TreeMapNode; parent: TreeMapNode | null } | null => {
  if (n.id === id) return { node: n, parent };
  for (const c of n.children ?? []) {
    const hit = find(c, id, n);
    if (hit) return hit;
  }
  return null;
};

/**
 * Fernworks' third-quarter spend on Waylight Pay cards and invoices, from
 * the categories down to the vendors.
 */
export function TreeMapDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [focus, setFocus] = React.useState(defaultTreeMapData.id);
  const [picked, setPicked] = React.useState<TreeMapNode | null>(null);

  const map = (
    <TreeMap
      title="Fernworks spend"
      sound={sound}
      {...values}
      value={focus}
      onValueChange={(id) => {
        setFocus(id);
        setPicked(null);
      }}
      onSelect={(node) => setPicked(node)}
    />
  );

  if (!chrome) return <div className="w-full">{map}</div>;

  const root = totalOf(defaultTreeMapData);
  const hit = find(defaultTreeMapData, picked?.id ?? focus);
  const node = hit?.node ?? defaultTreeMapData;
  const amount = totalOf(node);
  const kids = node.children?.length ?? 0;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {map}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {picked ? `picked ${node.name}` : node.name}
        </span>{" "}
        · {usd.format(amount)} · {((amount / root) * 100).toFixed(1)}% of spend
        {kids > 0 ? ` · ${kids} ${kids === 1 ? "item" : "items"}` : ""}
      </p>
    </div>
  );
}
