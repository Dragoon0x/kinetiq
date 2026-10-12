"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultMixedItems,
  defaultMixedProperties,
  defaultMixedSelected,
  MixedValues,
  summarizeMixed,
  type MixedChange,
  type MixedItem,
  type MixedStatus,
} from "@/registry/ui/mixed-values";

export const tweaks = defineTweaks({
  indicator: {
    kind: "choice",
    label: "Mixed",
    default: "dots",
    options: ["dots", "dash", "stripe"],
    names: { dots: "Dots", dash: "Dash", stripe: "Stripe" },
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
 * Gaugeworks Design, with the Pay console mock open: the hero card, the Pay
 * now button and the status badge are selected, and their fills, radii and
 * sizes disagree while opacity and font do not.
 */
export function MixedValuesDemo({
  chrome = true,
  // The panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [items, setItems] = React.useState<MixedItem[]>(defaultMixedItems);
  const [selected, setSelected] =
    React.useState<string[]>(defaultMixedSelected);
  const [status, setStatus] = React.useState<MixedStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [last, setLast] = React.useState<MixedChange | null>(null);
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
        <MixedValues height={540} {...values} />
      </div>
    );
  }

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

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setItems(defaultMixedItems);
    setSelected(defaultMixedSelected);
    setStatus("ready");
    setFailNext(false);
    setLast(null);
  };

  const mixedCount = defaultMixedProperties.filter(
    (p) => summarizeMixed(items, selected, p.id).length > 1,
  ).length;
  const lastLabel = last
    ? (defaultMixedProperties.find((p) => p.id === last.property)?.label ??
      last.property)
    : null;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <MixedValues
        height={540}
        items={items}
        onItemsChange={setItems}
        selected={selected}
        onSelectionChange={setSelected}
        onChange={setLast}
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
            {selected.length} selected · {mixedCount} mixed
          </span>
          {last && lastLabel ? (
            <>
              {" "}
              · last: {lastLabel}{" "}
              {last.kind === "nudge"
                ? `${Number(last.value) > 0 ? "+" : ""}${last.value}`
                : String(last.value)}{" "}
              on {last.ids.length}
            </>
          ) : status === "loading" ? (
            " · loading"
          ) : status === "error" ? (
            " · failed"
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-hairline-strong aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reset}
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
