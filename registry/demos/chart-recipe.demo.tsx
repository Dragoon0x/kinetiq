"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ChartRecipe,
  defaultChartRecipe,
  defaultRecipeDatasets,
  defaultSavedRecipes,
  type ChartRecipeValue,
  type RecipeDataset,
  type SavedRecipe,
} from "@/registry/ui/chart-recipe";

export const tweaks = defineTweaks({
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "warm", "mono"],
    names: { cobalt: "Cobalt", warm: "Warm", mono: "Mono" },
  },
  morph: {
    kind: "toggle",
    label: "Morph",
    default: true,
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Basinworks Analytics: build a chart of Gaugeworks Pay's quarter from a
 * dataset, a metric, a group and a grain, and save it to the shelf.
 */
export function ChartRecipeDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [recipe, setRecipe] =
    React.useState<ChartRecipeValue>(defaultChartRecipe);
  const [saved, setSaved] = React.useState<SavedRecipe[]>(defaultSavedRecipes);
  const [loading, setLoading] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [saves, setSaves] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <ChartRecipe height={540} {...values} />
      </div>
    );
  }

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setFailed(false);
    setLoading(recipe.dataset);
    const shouldFail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setLoading(null);
      setFailed(shouldFail);
    }, 1100);
  };

  const datasets: RecipeDataset[] = defaultRecipeDatasets.map((d) =>
    d.id === loading
      ? { ...d, status: "loading" }
      : failed && d.id === recipe.dataset
        ? { ...d, status: "error" }
        : d,
  );

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setLoading(null);
    setFailed(false);
    setFailNext(false);
    setRecipe(defaultChartRecipe);
    setSaved(defaultSavedRecipes);
    setSaves(0);
  };

  const buttonClass =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <ChartRecipe
        datasets={datasets}
        value={recipe}
        onChange={setRecipe}
        saved={saved}
        onSavedChange={(next, change) => {
          setSaved(next);
          if (change.kind === "save") setSaves((n) => n + 1);
        }}
        onRetry={reload}
        height={540}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {recipe.metric ?? "no metric"} · {recipe.grain} · {recipe.chart}
            {recipe.groupBy ? ` · by ${recipe.groupBy}` : ""}
          </span>{" "}
          · {saved.length} saved · {saves} saved this session
          {loading ? " · loading" : failed ? " · failed" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reload} className={buttonClass}>
            Reload dataset
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className={buttonClass}
          >
            {failNext ? "Next load fails" : "Fail next load"}
          </button>
          <button type="button" onClick={reset} className={buttonClass}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
