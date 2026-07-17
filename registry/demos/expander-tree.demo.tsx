"use client";

import { ExpanderTree, type TreeNode } from "@/registry/ui/expander-tree";

const TREE: TreeNode[] = [
  {
    id: "registry",
    label: "registry",
    children: [
      {
        id: "ui",
        label: "ui",
        children: [
          { id: "caliper", label: "caliper-slider.tsx" },
          { id: "wavefield", label: "wavefield.tsx" },
          { id: "split", label: "split-pane.tsx" },
        ],
      },
      {
        id: "lib",
        label: "lib",
        children: [
          { id: "motion", label: "motion.ts" },
          { id: "spatial", label: "spatial.ts" },
        ],
      },
      { id: "utils", label: "utils.ts" },
    ],
  },
  {
    id: "content",
    label: "content",
    children: [
      { id: "manifest", label: "manifest/components.ts" },
      { id: "showcases", label: "showcases.ts" },
    ],
  },
];

export function ExpanderTreeDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="border-hairline bg-surface-1 rounded-3 border p-2">
        <ExpanderTree
          nodes={TREE}
          defaultExpanded={["registry"]}
          aria-label="Project tree"
        />
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Expand{" "}
        <span className="text-[var(--signal,var(--primary))]">
          children cascade in
        </span>
      </p>
    </div>
  );
}
