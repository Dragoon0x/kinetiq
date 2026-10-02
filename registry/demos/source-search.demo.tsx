"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SourceSearch } from "@/registry/ui/source-search";

export const tweaks = defineTweaks({
  relevance: {
    kind: "choice",
    label: "Relevance",
    default: "bar",
    options: ["bar", "ring", "off"],
    names: { bar: "Bar", ring: "Ring", off: "Off" },
  },
  facets: {
    kind: "choice",
    label: "Facets",
    default: "chips",
    options: ["chips", "rail", "off"],
    names: { chips: "Chips", rail: "Rail", off: "Off" },
  },
  tray: {
    kind: "choice",
    label: "Tray",
    default: "chips",
    options: ["chips", "stack", "count"],
    names: { chips: "Chips", stack: "Stack", count: "Count" },
  },
});

const START = ["doc-retry-policy", "pay-2184"];
const MAX = 6;

/**
 * Fieldline's internal search, grounding an on-call answer about payout
 * retries that pile up after a bank times out. Two sources start in the
 * tray; check more and they fly down into it.
 */
export function SourceSearchDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [selected, setSelected] = React.useState<string[]>(START);
  const [note, setNote] = React.useState<string | null>(null);

  const n = selected.length;
  const line =
    note ??
    (n >= MAX
      ? `tray full · ${MAX} of ${MAX}`
      : `grounded on ${n} ${n === 1 ? "source" : "sources"} · check results to add`);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-3">
      <SourceSearch
        className={chrome ? "h-[500px]" : "h-[560px]"}
        selected={selected}
        onSelectedChange={(ids) => {
          setNote(null);
          setSelected(ids);
        }}
        max={MAX}
        onAnswer={(sources) =>
          setNote(
            `answering · from ${sources.length} ${sources.length === 1 ? "source" : "sources"}`,
          )
        }
        onOpen={(source) => setNote(`opened · ${source.title.toLowerCase()}`)}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{line.split(" · ")[0]}</span>
            {line.includes(" · ")
              ? ` · ${line.split(" · ").slice(1).join(" · ")}`
              : null}
          </p>
          <button
            type="button"
            disabled={n === 0}
            onClick={() => {
              setNote(null);
              setSelected([]);
            }}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-50"
          >
            Clear tray
          </button>
        </div>
      ) : null}
    </div>
  );
}
