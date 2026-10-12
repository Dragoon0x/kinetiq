"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTallyFacets,
  defaultTallyRows,
  TallyFacets,
  type TallySelection,
  type TallyStatus,
} from "@/registry/ui/tally-facets";

export const tweaks = defineTweaks({
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  barStyle: {
    kind: "choice",
    label: "Bars",
    default: "bar",
    options: ["bar", "line", "fill"],
    names: { bar: "Bar", line: "Line", fill: "Fill" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const START: TallySelection = { region: ["north"] };
const REFRESH_MS = 1400;

/**
 * Coldbrook's October orders: the sales desk narrowing a month of coffee
 * orders by region, status, owner and channel. Refresh fakes a count
 * refresh; "Fail refresh" makes the next one fail so the stale state shows.
 */
export function TallyFacetsDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [selection, setSelection] = React.useState<TallySelection>(START);
  const [status, setStatus] = React.useState<TallyStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const refresh = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    const fail = failNext;
    timer.current = window.setTimeout(() => {
      setStatus(fail ? "error" : "ready");
      if (fail) setFailNext(false);
    }, REFRESH_MS);
  };

  const surface = (
    <TallyFacets
      value={selection}
      onValueChange={(next) => {
        setSelection(next);
        setNote(null);
      }}
      onSaveView={(saved) => {
        const facets = Object.keys(saved).length;
        setNote(`view saved · ${facets} ${facets === 1 ? "facet" : "facets"}`);
      }}
      status={status}
      onRetry={refresh}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const picked = defaultTallyFacets
    .filter((f) => (selection[f.id] ?? []).length > 0)
    .map(
      (f) => `${f.label.toLowerCase()} ${(selection[f.id] ?? []).join(", ")}`,
    );
  const matching = defaultTallyRows.filter((row) =>
    Object.entries(selection).every(
      ([facet, ids]) =>
        ids.length === 0 || ids.includes(row.facets[facet] ?? ""),
    ),
  ).length;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={refresh} className={button}>
          Refresh counts
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next refresh
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current) window.clearTimeout(timer.current);
            setSelection(START);
            setStatus("ready");
            setFailNext(false);
            setNote(null);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "loading" ? (
          <span className="text-signal">refreshing counts</span>
        ) : status === "error" ? (
          <>
            <span className="text-signal">last refresh failed</span> · showing
            last good counts
          </>
        ) : note ? (
          <span className="text-signal">{note}</span>
        ) : picked.length === 0 ? (
          <>
            <span className="text-signal">
              {defaultTallyRows.length} orders
            </span>{" "}
            · no filters · every bar at full length
          </>
        ) : (
          <>
            <span className="text-signal">
              {matching} of {defaultTallyRows.length} orders
            </span>{" "}
            · {picked.join(" · ")}
          </>
        )}
      </p>
    </div>
  );
}
