"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultExportValue,
  ExportRecipe,
  type ExportStatus,
  type ExportValue,
} from "@/registry/ui/export-recipe";

export const tweaks = defineTweaks({
  sentenceStyle: {
    kind: "choice",
    label: "Recipe",
    default: "prose",
    options: ["prose", "list"],
    names: { prose: "Sentence", list: "List" },
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
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

/**
 * Coldbrook Reports' order export: pick a format, the columns, a month and
 * where the file goes, and read the recipe back as one sentence before it runs.
 */
export function ExportRecipeDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<ExportValue>(defaultExportValue);
  const [status, setStatus] = React.useState<ExportStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [runs, setRuns] = React.useState(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <ExportRecipe height={540} {...values} />
      </div>
    );
  }

  const surface = (
    <ExportRecipe
      height={560}
      value={value}
      onChange={setValue}
      status={status}
      onRetry={reload}
      onDownload={() => setRuns((n) => n + 1)}
      {...values}
    />
  );

  const button =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {surface}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {value.format} · {value.columns.length} columns · {value.delivery}
          </span>{" "}
          · {value.filters.length} filters · {runs} downloaded
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reload} className={button}>
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              setFailNext(true);
              reload();
            }}
            className={button}
          >
            Fail estimate
          </button>
          <button
            type="button"
            onClick={() => setValue(defaultExportValue)}
            className={button}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
