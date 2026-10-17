"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultUnitCostMapping,
  defaultUnitCostOutcomes,
  defaultUnitCostPeriods,
  defaultUnitCostUsages,
  UnitCost,
} from "@/registry/ui/unit-cost";

export const tweaks = defineTweaks({
  fractionStyle: {
    kind: "choice",
    label: "Fraction",
    default: "stacked",
    options: ["stacked", "slashed", "ratio"],
    names: { stacked: "Stacked", slashed: "Slashed", ratio: "Ratio" },
  },
  bandStyle: {
    kind: "choice",
    label: "Band",
    default: "shade",
    options: ["shade", "hatch", "rules"],
    names: { shade: "Shade", hatch: "Hatch", rules: "Rules" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const LAST =
  defaultUnitCostPeriods[defaultUnitCostPeriods.length - 1]?.id ?? "";
const BEFORE =
  defaultUnitCostPeriods[defaultUnitCostPeriods.length - 2]?.id ?? LAST;

const each = (v: number) => `$${v.toFixed(v < 0.2 ? 3 : 2)}`;

/**
 * Gaugeworks' support assistant: what a resolved ticket, a sent draft and a
 * built report cost in AI, week by week. The gallery card opens on the week
 * before and steps to this week once it is seen, so the fraction rolls.
 */
export function UnitCostDemo({
  chrome = true,
  // The panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [period, setPeriod] = React.useState(chrome ? LAST : BEFORE);
  const [outcome, setOutcome] = React.useState(
    defaultUnitCostOutcomes[0]?.id ?? "",
  );
  const [targets, setTargets] = React.useState<Record<string, number>>({});
  const [mapped, setMapped] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const replay = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(replay.current), []);

  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          setPeriod(LAST);
        }, 1100);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  // "Map usage" in the demo files the sandbox under drafts, so the note goes.
  const mapping = React.useMemo(
    () =>
      mapped
        ? { ...defaultUnitCostMapping, sandbox: "drafts" }
        : defaultUnitCostMapping,
    [mapped],
  );

  const panel = (
    <UnitCost
      usages={defaultUnitCostUsages}
      mapping={mapping}
      period={period}
      onPeriodChange={(id) => setPeriod(id)}
      outcome={outcome}
      onOutcomeChange={(id) => setOutcome(id)}
      targets={targets}
      onSetTarget={(id, value) => setTargets((t) => ({ ...t, [id]: value }))}
      onMapUsage={() => setMapped(true)}
      className={chrome ? undefined : "max-h-[13.75rem]"}
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

  const o = defaultUnitCostOutcomes.find((x) => x.id === outcome);
  const p = defaultUnitCostPeriods.find((x) => x.id === period);
  const spend = Object.entries(p?.spend ?? {}).reduce(
    (s, [id, v]) => (mapping[id] === outcome ? s + v : s),
    0,
  );
  const count = p?.outcomes[outcome] ?? 0;
  const target = targets[outcome] ?? o?.target ?? 0;
  const tol = o?.tolerance ?? 0.15;
  const value = count > 0 ? spend / count : 0;
  const band =
    value === 0
      ? "none"
      : value > target * (1 + tol)
        ? "over"
        : value < target * (1 - tol)
          ? "under"
          : "in band";

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {panel}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setPeriod(BEFORE);
            setTargets({});
            setMapped(false);
            window.clearTimeout(replay.current);
            replay.current = window.setTimeout(() => setPeriod(LAST), 700);
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
        <span className="text-signal">{`${o?.label ?? ""} · ${p?.label ?? ""}`}</span>
        {` · ${value > 0 ? `${each(value)} each` : "no reading"} · ${band}${mapped ? " · mapped" : ""}`}
      </p>
    </div>
  );
}
