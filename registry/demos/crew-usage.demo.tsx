"use client";

import * as React from "react";

import { Lock, LockOpen } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CrewUsage,
  defaultCrewMembers,
  defaultCrewUsage,
  type CrewMetric,
} from "@/registry/ui/crew-usage";

export const tweaks = defineTweaks({
  sparkStyle: {
    kind: "choice",
    label: "Sparks",
    default: "line",
    options: ["line", "area", "bars"],
    names: { line: "Line", area: "Area", bars: "Bars" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const leaderBy = (metric: CrewMetric) => {
  let best = "";
  let bestV = 0;
  for (const m of defaultCrewMembers) {
    const v = (defaultCrewUsage[m.id]?.[metric] ?? []).reduce(
      (a, b) => a + b,
      0,
    );
    if (v > bestV) {
      bestV = v;
      best = m.name;
    }
  }
  return best;
};

/**
 * The Fernworks design team's last thirty days with the assistant. In the
 * gallery the ranking switches once from requests to spend a moment after
 * the card is seen, so the re-rank plays: the writers fall, the engineer
 * rises.
 */
export function CrewUsageDemo({
  chrome = true,
  // The table is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [metric, setMetric] = React.useState<CrewMetric>("requests");
  const [open, setOpen] = React.useState<string | null>(null);
  const [billing, setBilling] = React.useState(true);
  const [opened, setOpened] = React.useState<string | null>(null);
  const [exported, setExported] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);

  // The card re-ranks once, shortly after it is first seen.
  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          setMetric("spend");
        }, 1100);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  const shownMetric = metric === "spend" && !billing ? "requests" : metric;

  const table = (
    <CrewUsage
      metric={shownMetric}
      onMetricChange={setMetric}
      expanded={open}
      onExpandedChange={setOpen}
      canSeeCosts={billing}
      onOpenMember={(id) => setOpened(id)}
      onExport={() => setExported(true)}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-3xl">
        {table}
      </div>
    );
  }

  const name = (id: string | null) =>
    defaultCrewMembers.find((m) => m.id === id)?.name ?? "none";

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {table}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={billing}
          onClick={() => setBilling((b) => !b)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          {billing ? (
            <LockOpen aria-hidden className="size-3.5" />
          ) : (
            <Lock aria-hidden className="size-3.5" />
          )}
          Billing access
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{shownMetric}</span>
        {` · 7 members · top ${leaderBy(shownMetric)} · open ${opened ? name(opened) : name(open)}`}
        {billing ? "" : " · costs hidden"}
        {exported ? " · exported" : ""}
      </p>
    </div>
  );
}
