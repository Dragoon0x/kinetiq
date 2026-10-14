"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultInstanceCatalogue,
  defaultInstanceRequirements,
  formatInstancePrice,
  InstanceSizer,
  quoteInstances,
  type InstanceRequirements,
  type InstanceStatus,
} from "@/registry/ui/instance-sizer";

export const tweaks = defineTweaks({
  costUnit: {
    kind: "choice",
    label: "Cost",
    default: "month",
    options: ["month", "hour"],
    names: { month: "Per month", hour: "Per hour" },
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
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Green" },
  },
});

/**
 * Sizing a box on Basinworks Cloud: drag the sliders or pick a workload, and
 * watch the catalogue re-sort, the price roll and the budget line answer.
 */
export function InstanceSizerDemo({
  chrome = true,
  // The sizer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<InstanceRequirements>(
    defaultInstanceRequirements,
  );
  const [compare, setCompare] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<InstanceStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <InstanceSizer height={540} {...values} />
      </div>
    );
  }

  const best = quoteInstances(defaultInstanceCatalogue, value).find(
    (q) => q.fits,
  );
  const unit = values.costUnit ?? "month";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <InstanceSizer
        height={560}
        value={value}
        onChange={setValue}
        compare={compare}
        onCompareChange={setCompare}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status !== "ready"
              ? status
              : best
                ? `${best.instance.name} · ${formatInstancePrice(
                    unit === "hour" ? best.hourly : best.monthly,
                    unit,
                  )}/${unit === "hour" ? "hr" : "mo"}`
                : "nothing fits"}
          </span>{" "}
          · {value.vcpu} vcpu · {value.memoryGb} gb · {value.storageGb} gb ·
          comparing {compare.length}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:text-danger"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(defaultInstanceRequirements);
              setCompare([]);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
