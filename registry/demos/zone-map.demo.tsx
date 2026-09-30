"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ZoneMap } from "@/registry/ui/zone-map";

export const tweaks = defineTweaks({
  regions: {
    kind: "range",
    label: "Regions",
    default: 7,
    min: 4,
    max: 9,
    step: 1,
  },
  lift: {
    kind: "range",
    label: "Lift",
    default: 4,
    min: 0,
    max: 8,
    step: 1,
  },
  flood: { kind: "toggle", label: "Flood", default: true },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "tide",
    options: ["tide", "ember", "moss", "ink"],
    names: { tide: "Tide", ember: "Ember", moss: "Moss", ink: "Ink" },
  },
});

/** Invented districts of the Basinworks service area, top-left first. */
const DISTRICTS = [
  "Velmoor",
  "Quillon",
  "Ashgrave",
  "Tolmarch",
  "Sorrel Reach",
  "Brannoc",
  "Oskarra",
  "Lindwe",
  "Pellmere",
];

/**
 * A Basinworks field crew marks the districts it covers: tap a district to
 * take it on, tap it again or remove it from the list to hand it back.
 */
export function ZoneMapDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [covered, setCovered] = React.useState<string[]>([
    "Quillon",
    "Sorrel Reach",
  ]);
  const [last, setLast] = React.useState<{ name: string; added: boolean }>();
  const shown = DISTRICTS.slice(0, values.regions ?? 7);
  const count = covered.filter((d) => shown.includes(d)).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="truncate px-0.5 text-xs text-ink-3">
          Basinworks <span aria-hidden>·</span>{" "}
          <span className="text-foreground">Crew 4 service area</span>
        </p>
        <ZoneMap
          label="Service districts"
          names={DISTRICTS}
          value={covered}
          onValueChange={(next) => {
            const added = next.find((d) => !covered.includes(d));
            const dropped = covered.find((d) => !next.includes(d));
            const name = added ?? dropped;
            if (name) setLast({ name, added: Boolean(added) });
            setCovered(next);
          }}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {count} {count === 1 ? "district" : "districts"} covered
          </span>{" "}
          ·{" "}
          {last
            ? `last ${last.added ? "added" : "handed back"} ${last.name}`
            : "tap a district to cover it"}
        </p>
      ) : null}
    </div>
  );
}
