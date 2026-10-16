"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultParcelSpecPackages,
  defaultParcelSpecServices,
  ParcelSpec,
  type ParcelSpecPackage,
  type ParcelSpecQuotes,
} from "@/registry/ui/parcel-spec";

export const tweaks = defineTweaks({
  unitSystem: {
    kind: "choice",
    label: "Units",
    default: "metric",
    options: ["metric", "imperial"],
    names: { metric: "Metric", imperial: "Imperial" },
  },
  boxStyle: {
    kind: "choice",
    label: "Box",
    default: "kraft",
    options: ["kraft", "wire", "tint"],
    names: { kraft: "Kraft", wire: "Wire", tint: "Tint" },
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

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** The carrier's answer: each service's rate card, null where it can't go. */
const priceAll = (list: ParcelSpecPackage[]): ParcelSpecQuotes => {
  const out: ParcelSpecQuotes = {};
  for (const svc of defaultParcelSpecServices) {
    const fits = list.every(
      (p) =>
        p.weight <= svc.maxWeight &&
        Math.max(p.length, p.width, p.height) <= svc.maxLength,
    );
    out[svc.id] = fits
      ? Math.round(
          list.reduce(
            (t, p) =>
              t +
              svc.base +
              svc.perKg *
                Math.max(p.weight, (p.length * p.width * p.height) / 5000),
            0,
          ) * 100,
        ) / 100
      : null;
  }
  return out;
};

/**
 * Basinworks Supply sending two parcels to Halden Street Roasters: filter
 * cartridges and a water test kit. Quotes come back from the carrier after
 * a short wait.
 */
export function ParcelSpecDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [packages, setPackages] = React.useState(defaultParcelSpecPackages);
  const [activeId, setActiveId] = React.useState(
    defaultParcelSpecPackages[0]?.id ?? "",
  );
  const [service, setService] = React.useState("standard");
  const [quotes, setQuotes] = React.useState<ParcelSpecQuotes | null>(null);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    setPackages(defaultParcelSpecPackages);
    setActiveId(defaultParcelSpecPackages[0]?.id ?? "");
    setService("standard");
    setQuotes(null);
    setRound((r) => r + 1);
  };

  const onQuote = (list: ParcelSpecPackage[]) => {
    setQuotes(null);
    return new Promise<ParcelSpecQuotes>((resolve) => {
      const t = window.setTimeout(
        () => {
          timers.current.delete(t);
          const q = priceAll(list);
          setQuotes(q);
          resolve(q);
        },
        620 + (list.length % 3) * 90,
      );
      timers.current.add(t);
    });
  };

  const surface = (
    <ParcelSpec
      key={round}
      packages={packages}
      onChange={(next) => {
        setPackages(next);
        if (!next.some((p) => p.id === activeId)) {
          setActiveId(next[0]?.id ?? "");
        }
      }}
      onActivePackageChange={setActiveId}
      service={service}
      onServiceChange={setService}
      onQuote={onQuote}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const imperial = values.unitSystem === "imperial";
  const at = Math.max(
    0,
    packages.findIndex((p) => p.id === activeId),
  );
  const p = packages[at];
  const len = (cm: number) =>
    imperial ? Number((cm / 2.54).toFixed(1)) : Number(cm.toFixed(1));
  const kg = (v: number) =>
    imperial ? `${Number((v / 0.45359237).toFixed(2))} lb` : `${v} kg`;
  const svc = defaultParcelSpecServices.find((s) => s.id === service);
  const price = quotes?.[service];
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {p ? (
          <>
            <span className="text-signal">
              parcel {at + 1} · {len(p.length)} × {len(p.width)} ×{" "}
              {len(p.height)} {imperial ? "in" : "cm"} · {kg(p.weight)}
            </span>{" "}
            ·{" "}
            {quotes === null
              ? "quoting…"
              : `${svc?.name.toLowerCase() ?? service} · ${typeof price === "number" ? money.format(price) : "unavailable"}`}
          </>
        ) : (
          "no parcels"
        )}
      </p>
    </div>
  );
}
