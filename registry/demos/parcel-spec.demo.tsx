"use client";

import * as React from "react";

import { PackageOpen, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultParcelCarriers,
  defaultParcelValue,
  emptyParcelValue,
  isParcelEmpty,
  ParcelSpec,
  quoteParcel,
  type ParcelStatus,
  type ParcelValue,
} from "@/registry/ui/parcel-spec";

export const tweaks = defineTweaks({
  boxStyle: {
    kind: "choice",
    label: "Box",
    default: "iso",
    options: ["iso", "flat", "wire"],
    names: { iso: "Shaded", flat: "Flat", wire: "Wire" },
  },
  defaultUnits: {
    kind: "choice",
    label: "Units",
    default: "metric",
    options: ["metric", "imperial"],
    names: { metric: "cm · kg", imperial: "in · lb" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const CLASS_WORD = {
  letter: "letter",
  small: "small",
  medium: "medium",
  large: "large",
  oversize: "oversize",
} as const;

/**
 * Basinworks Shipping's parcel form with a shoebox on it: change a side,
 * pick a preset or switch to inches, and watch the box, the needle and
 * five carriers' rates follow.
 */
export function ParcelSpecDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<ParcelValue>(defaultParcelValue);
  const [status, setStatus] = React.useState<ParcelStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
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
        <ParcelSpec height={540} {...values} />
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

  const empty = isParcelEmpty(value);
  const { quote, rates } = quoteParcel(value, defaultParcelCarriers);
  const best = rates[0] && rates[0].price !== null ? rates[0] : null;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ParcelSpec
        height={540}
        value={value}
        onChange={(next) => setValue(next)}
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
              : empty
                ? "no dimensions"
                : CLASS_WORD[quote.sizeClass]}
          </span>{" "}
          ·{" "}
          {empty
            ? "waiting for a size"
            : `${value.length} x ${value.width} x ${value.height} cm · ${quote.billable.toFixed(2)} kg billable`}
          {best && status === "ready"
            ? ` · ${best.carrier.name} $${(best.price ?? 0).toFixed(2)}`
            : ""}
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setValue(emptyParcelValue)}
            aria-disabled={empty || undefined}
            className={BUTTON}
          >
            <PackageOpen aria-hidden className="size-3.5" />
            Start empty
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={BUTTON}
          >
            Fail next load
          </button>
          <button type="button" onClick={reload} className={BUTTON}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
