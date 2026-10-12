"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultLensViews,
  SavedLenses,
  type LensStatus,
} from "@/registry/ui/saved-lenses";

export const tweaks = defineTweaks({
  tabStyle: {
    kind: "choice",
    label: "Tabs",
    default: "underline",
    options: ["underline", "pill", "boxed"],
    names: { underline: "Line", pill: "Pill", boxed: "Boxed" },
  },
  chipStyle: {
    kind: "choice",
    label: "Chips",
    default: "soft",
    options: ["soft", "outline", "solid"],
    names: { soft: "Soft", outline: "Outline", solid: "Solid" },
  },
  cornerRadius: {
    kind: "range",
    label: "Radius",
    default: 8,
    min: 0,
    max: 14,
    step: 1,
    unit: "px",
  },
});

/**
 * The Gaugeworks support desk: Ines Park's saved views over the shared
 * queue. Switching views keeps the chips two views share exactly where they
 * are; "Fail next view" makes the next switch fail so the quiet error panel
 * shows.
 */
export function SavedLensesDemo({
  chrome = true,
  // The queue is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<LensStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [line, setLine] = React.useState<{ lead: string; rest: string }>({
    lead: "my open",
    rest: "switch views · shared chips stay put",
  });

  const lenses = (
    <SavedLenses
      onViewChange={(view, previous) => {
        if (failNext) {
          setStatus("error");
          setFailNext(false);
        } else setStatus("ready");
        const before = new Set(
          (previous?.filters ?? []).map((f) => `${f.field}=${f.value}`),
        );
        const kept = view.filters.filter((f) =>
          before.has(`${f.field}=${f.value}`),
        ).length;
        const moved = view.filters.length - kept;
        setLine({
          lead: view.name.toLowerCase(),
          rest: `${kept} ${kept === 1 ? "chip" : "chips"} kept · ${moved} slid in`,
        });
      }}
      onSaveView={(view, { asNew }) =>
        setLine({
          lead: asNew ? `saved as “${view.name.toLowerCase()}”` : "saved",
          rest: `${view.filters.length} ${view.filters.length === 1 ? "chip" : "chips"}`,
        })
      }
      onRevert={(id) =>
        setLine({
          lead: "reverted",
          rest:
            defaultLensViews.find((v) => v.id === id)?.name.toLowerCase() ??
            "view",
        })
      }
      status={status}
      onRetry={() => setStatus("ready")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{lenses}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {lenses}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next view
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "error" ? (
          <>
            <span className="text-signal">{line.lead}</span> · did not load ·
            try again
          </>
        ) : (
          <>
            <span className="text-signal">{line.lead}</span> · {line.rest}
          </>
        )}
      </p>
    </div>
  );
}
