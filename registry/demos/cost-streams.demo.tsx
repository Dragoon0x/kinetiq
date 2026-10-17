"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CostStreams,
  defaultCostFeatures,
  defaultCostModels,
  defaultCostMonths,
  defaultCostProjects,
} from "@/registry/ui/cost-streams";

export const tweaks = defineTweaks({
  curvature: {
    kind: "range",
    label: "Curvature",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  nodeWidth: {
    kind: "range",
    label: "Nodes",
    default: 10,
    min: 4,
    max: 20,
    step: 2,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const LAST = defaultCostMonths[defaultCostMonths.length - 1]?.id ?? "";
const BEFORE = defaultCostMonths[defaultCostMonths.length - 2]?.id ?? LAST;

const short = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${n}`;

/**
 * Gaugeworks' assistant spend across four products. The gallery card opens
 * on September and steps to October once it is seen, so the streams
 * re-thicken: reply drafts swell, receipt reading has already moved to Lite.
 */
export function CostStreamsDemo({
  chrome = true,
  // The streams are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [month, setMonth] = React.useState(chrome ? LAST : BEFORE);
  const [isolated, setIsolated] = React.useState<string | null>(null);
  const [exported, setExported] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const replayTimer = React.useRef(0);

  React.useEffect(() => () => window.clearTimeout(replayTimer.current), []);

  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          setMonth(LAST);
        }, 1100);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  const panel = (
    <CostStreams
      month={month}
      onMonthChange={(id) => setMonth(id)}
      isolated={isolated}
      onSelectNode={(id) => setIsolated(id)}
      onExport={(id) => setExported(id)}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-3xl">
        {panel}
      </div>
    );
  }

  const current = defaultCostMonths.find((m) => m.id === month);
  const total = (current?.flows ?? []).reduce((s, f) => s + f.amount, 0);
  const name =
    [...defaultCostProjects, ...defaultCostFeatures, ...defaultCostModels].find(
      (n) => n.id === isolated,
    )?.name ?? "none";

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {panel}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMonth(BEFORE);
            setIsolated(null);
            setExported(null);
            window.clearTimeout(replayTimer.current);
            replayTimer.current = window.setTimeout(() => setMonth(LAST), 700);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{`${current?.label ?? ""} · ${short(total)}`}</span>
        {` · isolated ${name}${current?.partialThrough ? " · partial" : ""}${exported ? " · exported" : ""}`}
      </p>
    </div>
  );
}
