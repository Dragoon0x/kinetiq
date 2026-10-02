"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultPaneTree, PaneStack } from "@/registry/ui/pane-stack";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  compress: {
    kind: "range",
    label: "Compress",
    default: 40,
    min: 28,
    max: 64,
    step: 4,
    unit: "px",
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 1.5,
    step: 0.1,
    unit: "x",
  },
});

type Where = { title: string; level: number };

const START = "plots";

const titles = new Map<string, string>();
const collect = (node: typeof defaultPaneTree) => {
  titles.set(node.id, node.title);
  for (const child of node.children ?? []) collect(child);
};
collect(defaultPaneTree);

/**
 * The Fieldline field office's workspace: projects, plots and soil samples,
 * seven levels deep, with every level above the open one kept as a tab.
 */
export function PaneStackDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // Opened three levels in, so the way back is already in view.
  const [where, setWhere] = React.useState<Where>({
    title: titles.get(START) ?? START,
    level: 3,
  });
  const [opened, setOpened] = React.useState<string | null>(null);

  const stack = (
    <PaneStack
      label="Fieldline workspace"
      defaultValue={START}
      height={chrome ? 440 : 460}
      onValueChange={(id, path) => {
        setOpened(null);
        setWhere({ title: titles.get(id) ?? id, level: path.length - 1 });
      }}
      onSelect={(id) => setOpened(titles.get(id) ?? id)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-3xl">{stack}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {stack}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {opened ? (
          <>
            <span className="text-signal">opened {opened}</span> · in{" "}
            {where.title}
          </>
        ) : where.level === 0 ? (
          <>
            <span className="text-signal">{where.title}</span> · open a project,
            a tab takes you back
          </>
        ) : (
          <>
            <span className="text-signal">{where.title}</span> · level{" "}
            {where.level + 1} ·{" "}
            {where.level === 1 ? "1 tab" : `${where.level} tabs`} back
          </>
        )}
      </p>
    </div>
  );
}
