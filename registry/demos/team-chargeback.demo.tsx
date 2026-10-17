"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultChargebackCosts,
  defaultChargebackTeams,
  TeamChargeback,
} from "@/registry/ui/team-chargeback";

export const tweaks = defineTweaks({
  barStyle: {
    kind: "choice",
    label: "Bars",
    default: "soft",
    options: ["solid", "soft", "outline"],
    names: { solid: "Solid", soft: "Soft", outline: "Outline" },
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
    default: "basin",
    options: ["basin", "ember", "spectrum", "mono"],
    names: {
      basin: "Basin",
      ember: "Ember",
      spectrum: "Spectrum",
      mono: "Mono",
    },
  },
});

const team = (id: string) =>
  defaultChargebackTeams.find((t) => t.id === id)?.name.toLowerCase() ?? id;
const resource = (id: string) =>
  Object.values(defaultChargebackCosts)
    .flat()
    .find((c) => c.id === id)?.label ?? id;

/**
 * Basinworks' October cloud bill, charged back to five teams. In the gallery
 * the total splits itself once, a moment after the card comes into view.
 */
export function TeamChargebackDemo({
  chrome = true,
  // The view is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [split, setSplit] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);

  // The card splits once, shortly after it is first seen.
  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node) return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current)
        timer = window.setTimeout(() => {
          once.current = true;
          setSplit(true);
        }, 700);
    });
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [chrome]);

  const view = (
    <TeamChargeback
      key={run}
      split={split}
      onSplitChange={(s) => {
        setSplit(s);
        setNote(s ? "split · 5 teams · ranked by spend" : "folded · one total");
      }}
      onRuleChange={(rule) =>
        setNote(
          rule.kind === "split"
            ? `shared costs · ${rule.enabled ? (rule.method === "even" ? "split evenly" : "split by usage") : "not split"}`
            : `rule ${rule.key}=${rule.value} · ${rule.enabled ? "on" : "off"}`,
        )
      }
      onAllocate={(costId, teamId) =>
        setNote(`assigned · ${resource(costId)} → ${team(teamId)}`)
      }
      onExport={() => setNote("exported · cost-by-team.csv")}
      onMonthChange={(m) => setNote(`month · ${m}`)}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={ref} className="w-full">
        {view}
      </div>
    );

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {view}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSplit(false);
            setNote(null);
            setRun((r) => r + 1);
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
        {note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">october</span> · press the total to
            split it by team
          </>
        )}
      </p>
    </div>
  );
}
