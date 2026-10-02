"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultStripTabs,
  TabStrip,
  type TabStripTab,
} from "@/registry/ui/tab-strip";

export const tweaks = defineTweaks({
  width: {
    kind: "range",
    label: "Width",
    default: 168,
    min: 112,
    max: 216,
    step: 8,
    unit: "px",
  },
  reorder: {
    kind: "choice",
    label: "Reorder",
    default: "glide",
    options: ["glide", "snap", "off"],
    names: { glide: "Glide", snap: "Snap", off: "Off" },
  },
  slide: {
    kind: "range",
    label: "Slide",
    default: 12,
    min: 0,
    max: 32,
    step: 4,
    unit: "px",
  },
});

/**
 * The Fernworks editor's open documents: drag them into order, close them,
 * open more until they spill into the menu.
 */
export function TabStripDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tabs, setTabs] = React.useState<TabStripTab[]>(defaultStripTabs);
  const [active, setActive] = React.useState(defaultStripTabs[1]?.id ?? "");
  const [round, setRound] = React.useState(0);
  const title = tabs.find((t) => t.id === active)?.title ?? "";

  const strip = (
    <TabStrip
      key={round}
      label="Fernworks documents"
      tabs={tabs}
      onTabsChange={setTabs}
      value={active}
      onValueChange={setActive}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-3xl">{strip}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {strip}
      <div className="flex items-center gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{title}</span> ·{" "}
          {tabs.length === 1 ? "1 open" : `${tabs.length} open`} · drag a tab,
          press + for more
        </p>
        <button
          type="button"
          onClick={() => {
            setTabs(defaultStripTabs);
            setActive(defaultStripTabs[1]?.id ?? "");
            setRound((r) => r + 1);
          }}
          className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
