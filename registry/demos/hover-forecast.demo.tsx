"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  countForecast,
  defaultForecastFilters,
  defaultForecastTrips,
  HoverForecast,
  type ForecastPreview,
  type ForecastValue,
} from "@/registry/ui/hover-forecast";

export const tweaks = defineTweaks({
  ghostOpacity: {
    kind: "range",
    label: "Ghost",
    default: 0.3,
    min: 0.05,
    max: 0.6,
    step: 0.05,
  },
  layout: {
    kind: "choice",
    label: "Layout",
    default: "cards",
    options: ["cards", "compact", "rows"],
    names: { cards: "Cards", compact: "Compact", rows: "Rows" },
  },
  motionScale: {
    kind: "range",
    label: "Motion",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

type Network = "instant" | "slow" | "offline";
const NETWORKS: Network[] = ["instant", "slow", "offline"];
const NETWORK_NAME: Record<Network, string> = {
  instant: "Instant",
  slow: "Slow",
  offline: "Offline",
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** The board's server, when the network is slow: the same count, late. */
const slowForecast = (value: ForecastValue) =>
  wait(700).then(() =>
    countForecast(defaultForecastTrips, defaultForecastFilters, value),
  );

/** And when it is down: every forecast fails, the board stays as it is. */
const offlineForecast = () =>
  wait(450).then((): number => {
    throw new Error("offline");
  });

const labelOf = (filterId: string, optionId: string | null) => {
  const filter = defaultForecastFilters.find((f) => f.id === filterId);
  if (!filter) return "";
  if (optionId === null) return filter.anyLabel ?? "Any";
  return filter.options.find((o) => o.id === optionId)?.label ?? optionId;
};

const appliedText = (value: ForecastValue) =>
  defaultForecastFilters
    .filter((f) => value[f.id] != null)
    .map((f) => labelOf(f.id, value[f.id] ?? null))
    .join(" + ");

/**
 * Waylight's week of departures between the harbour and valley towns. Rest
 * on a filter option to see which trips it would take away before choosing
 * it; with chrome, the forecast can be made slow or offline to show how a
 * pending or failed forecast is worded.
 */
export function HoverForecastDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<ForecastValue>({});
  const [preview, setPreview] = React.useState<ForecastPreview | null>(null);
  const [network, setNetwork] = React.useState<Network>("instant");
  const radios = React.useRef(new Map<Network, HTMLButtonElement>());
  const networkId = React.useId();

  if (!chrome) {
    return (
      <div className="w-full">
        <HoverForecast className="h-[548px]" {...values} />
      </div>
    );
  }

  const shown = countForecast(
    defaultForecastTrips,
    defaultForecastFilters,
    value,
  );
  const applied = appliedText(value);

  const pick = (next: Network) => {
    setNetwork(next);
    radios.current.get(next)?.focus();
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span
          id={networkId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Forecast service
        </span>
        <div
          role="radiogroup"
          aria-labelledby={networkId}
          className="inline-flex h-8 items-center gap-0.5 rounded-full border border-hairline bg-surface-1 p-0.5"
        >
          {NETWORKS.map((n, i) => (
            <button
              key={n}
              ref={(node) => {
                if (node) radios.current.set(n, node);
                else radios.current.delete(n);
              }}
              type="button"
              role="radio"
              aria-checked={network === n}
              tabIndex={network === n ? 0 : -1}
              onClick={() => setNetwork(n)}
              onKeyDown={(event) => {
                const step =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                if (!step) return;
                event.preventDefault();
                const next =
                  NETWORKS[(i + step + NETWORKS.length) % NETWORKS.length];
                if (next) pick(next);
              }}
              className={cn(
                "inline-flex h-7 items-center rounded-full px-3 text-xs transition-colors",
                network === n
                  ? "bg-surface-2 text-foreground"
                  : "text-ink-3 hover:text-foreground",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              {NETWORK_NAME[n]}
            </button>
          ))}
        </div>
      </div>
      <HoverForecast
        className="h-[440px]"
        value={value}
        onApply={(next) => {
          setValue(next);
          setPreview(null);
        }}
        onPreview={setPreview}
        forecast={
          network === "slow"
            ? slowForecast
            : network === "offline"
              ? offlineForecast
              : undefined
        }
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {preview ? (
          <>
            <span className="text-signal">preview</span> ·{" "}
            {labelOf(preview.filterId, preview.optionId)} → {preview.kept} of{" "}
            {shown} {shown === 1 ? "trip" : "trips"}
          </>
        ) : applied ? (
          <>
            <span className="text-signal">applied</span> · {applied} · {shown}{" "}
            {shown === 1 ? "trip" : "trips"}
          </>
        ) : (
          <>
            <span className="text-signal">{shown} trips</span> · no filters
          </>
        )}
        {network === "instant" ? null : ` · forecast ${network}`}
      </p>
    </div>
  );
}
