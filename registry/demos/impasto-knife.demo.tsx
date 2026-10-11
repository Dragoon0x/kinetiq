"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { ImpastoKnife } from "@/registry/ui/impasto-knife";

export const tweaks = defineTweaks({
  thickness: {
    kind: "range",
    label: "Thickness",
    default: 0.6,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "ochre",
    options: ["ochre", "harbour", "garden", "ink"],
    names: { ochre: "Ochre", harbour: "Harbour", garden: "Garden", ink: "Ink" },
  },
  lightAngle: {
    kind: "range",
    label: "Light",
    default: 225,
    min: 0,
    max: 345,
    step: 15,
    unit: "°",
  },
});

const NAMES: Record<string, string[]> = {
  ochre: ["yellow ochre", "madder rose", "burnt sienna", "titanium white"],
  harbour: ["ultramarine", "cerulean", "payne's grey", "titanium white"],
  garden: ["sap green", "cadmium yellow", "viridian", "rose"],
  ink: ["ivory black", "raw umber", "warm grey", "titanium white"],
};

/**
 * Fieldline Art Supply's studio oils: the product card is a primed board you
 * can smear with a palette knife, under a low studio light.
 */
export function ImpastoKnifeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [stroke, setStroke] = React.useState<{ n: number; pigment: number }>({
    n: 0,
    pigment: 0,
  });
  const [clean, setClean] = React.useState(false);
  const [clearKey, setClearKey] = React.useState(0);
  const names = NAMES[values.palette ?? "ochre"] ?? NAMES.ochre ?? [];

  const board = (
    <div className="relative w-full">
      <ImpastoKnife
        className={cn("w-full rounded-3", chrome ? "h-60" : "h-52")}
        clearKey={clearKey}
        sound={sound}
        onStroke={(n, pigment) => {
          setStroke({ n, pigment });
          setClean(false);
        }}
        onClear={() => setClean(true)}
        {...values}
      />
      <p className="pointer-events-none absolute top-3 left-3 rounded-full border border-hairline bg-card/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
        Fieldline · Studio oils
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{board}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {board}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {clean ? (
            <>
              <span className="text-signal">scraped clean</span> · drag to paint
              again
            </>
          ) : stroke.n > 0 ? (
            <>
              <span className="text-signal">stroke {stroke.n}</span> ·{" "}
              {names[stroke.pigment % Math.max(1, names.length)]}
            </>
          ) : (
            <>
              <span className="text-signal">board primed</span> · drag to paint,
              double click to scrape
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setClearKey((k) => k + 1)}
          className="inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Scrape
        </button>
      </div>
    </div>
  );
}
