"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultInstanceSizerConfig,
  defaultInstanceSizerRegions,
  defaultInstanceSizerSizes,
  estimateInstanceSizer,
  InstanceSizer,
  type InstanceSizerConfig,
} from "@/registry/ui/instance-sizer";

export const tweaks = defineTweaks({
  rackStyle: {
    kind: "choice",
    label: "Rack",
    default: "line",
    options: ["line", "solid", "plan"],
    names: { line: "Line", solid: "Solid", plan: "Plan" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
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

const money = (n: number) => {
  const c = Math.round(n * 100);
  return `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
};

/**
 * A Gaugeworks telemetry environment being sized: Harbour North, a Medium
 * server and nightly backups so far, waiting on the size.
 */
export function InstanceSizerDemo({
  chrome = true,
  // The wizard is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [config, setConfig] = React.useState<InstanceSizerConfig>(
    defaultInstanceSizerConfig,
  );
  const [provisioned, setProvisioned] = React.useState(false);

  const surface = (
    <InstanceSizer
      key={round}
      defaultStep="size"
      onValueChange={setConfig}
      onProvision={() => setProvisioned(true)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const size = defaultInstanceSizerSizes.find((s) => s.id === config.size);
  const region = defaultInstanceSizerRegions.find(
    (r) => r.id === config.region,
  );
  const total = money(estimateInstanceSizer(config));

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setConfig(defaultInstanceSizerConfig);
            setProvisioned(false);
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
        {provisioned ? (
          <>
            <span className="text-signal">provisioned</span> · telemetry-prod ·{" "}
            {total} / mo
          </>
        ) : (
          <>
            <span className="text-signal">
              {size?.name ?? "no size"} · {region?.name ?? "no region"}
            </span>{" "}
            · {config.addons.length}{" "}
            {config.addons.length === 1 ? "add-on" : "add-ons"} · {total} / mo
          </>
        )}
      </p>
    </div>
  );
}
