"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSieveFilters,
  defaultSieveNow,
  defaultSieveRows,
  sieve,
  SieveStack,
  type SieveFilter,
  type SieveStatus,
} from "@/registry/ui/sieve-stack";

export const tweaks = defineTweaks({
  bandStyle: {
    kind: "choice",
    label: "Band",
    default: "hatch",
    options: ["hatch", "tint", "dashed"],
    names: { hatch: "Hatch", tint: "Tint", dashed: "Dashed" },
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
    options: ["ink", "cobalt", "ember", "moss"],
    names: { ink: "Ink", cobalt: "Cobalt", ember: "Ember", moss: "Moss" },
  },
});

const LOAD_MS = 1200;

/**
 * The Basinworks maintenance board: what the east crews should pick up this
 * week, and which of the four filters is costing the most work orders.
 */
export function SieveStackDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [filters, setFilters] =
    React.useState<SieveFilter[]>(defaultSieveFilters);
  const [status, setStatus] = React.useState<SieveStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    const fail = failNext;
    timer.current = window.setTimeout(() => {
      setStatus(fail ? "error" : "ready");
      if (fail) setFailNext(false);
    }, LOAD_MS);
  };

  const stack = (
    <SieveStack
      filters={filters}
      onFiltersChange={setFilters}
      onToggle={(id, active) => {
        const f = filters.find((x) => x.id === id);
        setNote(f ? `${f.label.toLowerCase()} ${active ? "on" : "off"}` : null);
      }}
      onReorder={(ids) => {
        const first = filters.find((x) => x.id === ids[0]);
        setNote(first ? `${first.label.toLowerCase()} now first` : null);
      }}
      onRemove={(id) => {
        const f = filters.find((x) => x.id === id);
        setNote(f ? `removed ${f.label.toLowerCase()}` : null);
      }}
      status={status}
      onRetry={reload}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{stack}</div>;

  const { tiers, survivors } = sieve(
    defaultSieveRows,
    filters,
    defaultSieveNow,
  );
  // The layer taking the most rows right now, for the status line.
  const worst = filters.reduce<{ label: string; cost: number } | null>(
    (best, f, i) => {
      const t = tiers[i];
      if (!t || f.active === false) return best;
      const cost = t.reach - t.pass;
      return !best || cost > best.cost ? { label: f.label, cost } : best;
    },
    null,
  );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {stack}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reload} className={button}>
          Reload
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
          Fail next load
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current) window.clearTimeout(timer.current);
            setFilters(defaultSieveFilters);
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
          <span className="text-signal">loading work orders</span>
        ) : status === "error" ? (
          <>
            <span className="text-signal">load failed</span> · the stack keeps
            its shape
          </>
        ) : (
          <>
            <span className="text-signal">
              {survivors.length} of {defaultSieveRows.length} pass
            </span>
            {note
              ? ` · ${note}`
              : worst
                ? ` · ${worst.label.toLowerCase()} costs ${worst.cost}`
                : " · no filter on"}
          </>
        )}
      </p>
    </div>
  );
}
