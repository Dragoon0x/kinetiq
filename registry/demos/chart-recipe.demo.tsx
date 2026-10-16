"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  ChartRecipe,
  defaultRecipeChartTypes,
  defaultRecipeFilters,
  defaultRecipeSources,
  defaultRecipeWindows,
  type ChartRecipeValue,
  type RecipeSeries,
  type RecipeSource,
} from "@/registry/ui/chart-recipe";

export const tweaks = defineTweaks({
  previewStyle: {
    kind: "choice",
    label: "Preview",
    default: "paper",
    options: ["paper", "grid", "blueprint"],
    names: { paper: "Paper", grid: "Grid", blueprint: "Blueprint" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "earth", "mono", "spectrum"],
    names: {
      cobalt: "Cobalt",
      earth: "Earth",
      mono: "Mono",
      spectrum: "Spectrum",
    },
  },
});

/** Sensor uptime lives in a slower store: it arrives through loadSource. */
const SOURCES: RecipeSource[] = defaultRecipeSources.map((s) =>
  s.id === "uptime" ? { ...s, series: undefined } : s,
);
const UPTIME =
  defaultRecipeSources.find((s) => s.id === "uptime")?.series ?? [];

const START: Partial<ChartRecipeValue> = {
  source: "pressure",
  chartType: "line",
};
const STEP_NAMES = ["source", "chart", "filters", "notes"];

/**
 * A new Gaugeworks report for the Harbour line, started with pump pressure
 * as a line chart. Sensor uptime comes from a slower store, so choosing it
 * shows the layer skeleton for a moment.
 */
export function ChartRecipeDemo({
  chrome = true,
  // The wizard is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [step, setStep] = React.useState(1);
  const [recipe, setRecipe] = React.useState<ChartRecipeValue | null>(null);
  const [created, setCreated] = React.useState<string | null>(null);
  const timers = React.useRef(new Set<number>());
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.clear();
    };
  }, []);

  const loadSource = (): Promise<RecipeSeries[]> =>
    new Promise((resolve) => {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        resolve(UPTIME);
      }, 900);
      timers.current.add(t);
    });

  const wizard = (
    <ChartRecipe
      key={round}
      sources={SOURCES}
      defaultValue={START}
      defaultStep={1}
      loadSource={loadSource}
      onStepChange={(s) => {
        setStep(s);
        setCreated(null);
      }}
      onValueChange={(v) => {
        setRecipe(v);
        setCreated(null);
      }}
      onCreate={(r) => setCreated(r.name)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{wizard}</div>;

  const r = recipe;
  const sourceLabel = (
    defaultRecipeSources.find((s) => s.id === (r?.source ?? "pressure"))
      ?.label ?? ""
  ).toLowerCase();
  const kindLabel = (
    defaultRecipeChartTypes.find((c) => c.id === (r?.chartType ?? "line"))
      ?.label ?? ""
  ).toLowerCase();
  const kept = r?.series.length ?? defaultRecipeFilters.length;
  const windowLabel =
    defaultRecipeWindows.find((w) => w.id === (r?.window ?? "12"))?.label ?? "";
  const detail =
    step === 0
      ? sourceLabel
      : step === 1
        ? `${sourceLabel} · ${kindLabel}`
        : step === 2
          ? `${kept} of ${defaultRecipeFilters.length} series · ${windowLabel}`
          : `${r?.annotations.length ?? 0} notes`;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      {wizard}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current.clear();
            setStep(1);
            setRecipe(null);
            setCreated(null);
            setRound((n) => n + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {created ? (
          <span className="text-signal">created · {created}</span>
        ) : (
          <>
            <span className="text-signal">
              step {step + 1} of 4 · {STEP_NAMES[step]}
            </span>{" "}
            · {detail}
          </>
        )}
      </p>
    </div>
  );
}
