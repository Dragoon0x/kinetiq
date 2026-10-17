"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultEnvRibbonActions,
  defaultEnvRibbonEnvironments,
  defaultEnvRibbonSnapshots,
  EnvRibbon,
} from "@/registry/ui/env-ribbon";

export const tweaks = defineTweaks({
  ribbonWidth: {
    kind: "range",
    label: "Ribbon",
    default: 4,
    min: 2,
    max: 8,
    step: 1,
    unit: "px",
  },
  hatch: {
    kind: "choice",
    label: "Hatch",
    default: "stripe",
    options: ["stripe", "cross", "ticks", "off"],
    names: { stripe: "Stripe", cross: "Cross", ticks: "Ticks", off: "Off" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const START = "production";

/**
 * Waylight's deploy console, opened on production: the ribbon is red and
 * every destructive button already wears its hatched edge. Switch to
 * staging to watch the amber sweep out of the switcher, and back to
 * production to be asked for the name first.
 */
export function EnvRibbonDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The console is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [env, setEnv] = React.useState(START);
  const [last, setLast] = React.useState<string | null>(null);

  const surface = (
    <EnvRibbon
      environment={env}
      onEnvironmentChange={(id) => setEnv(id)}
      onAction={(actionId) => setLast(actionId)}
      onConfirmProtected={(request) => {
        if (request.kind === "action" && request.actionId) {
          setLast(request.actionId);
        }
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-3xl">{surface}</div>;

  const current = defaultEnvRibbonEnvironments.find((e) => e.id === env);
  const version = defaultEnvRibbonSnapshots[env]?.version ?? "";
  const action = defaultEnvRibbonActions.find((a) => a.id === last);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setEnv(START);
            setLast(null);
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
        <span className="text-signal">{current?.name ?? env}</span>
        {` · ${current?.region ?? ""} · ${version} · last: ${
          action ? (action.done ?? action.label) : "nothing run"
        }`}
      </p>
    </div>
  );
}
