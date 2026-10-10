"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RailSelect, type RailSelectOption } from "@/registry/ui/rail-select";

export const tweaks = defineTweaks({
  stretch: {
    kind: "range",
    label: "Stretch",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  width: {
    kind: "range",
    label: "Width",
    default: 240,
    min: 180,
    max: 320,
    step: 20,
    unit: "px",
  },
});

type Region = RailSelectOption & {
  ms: number;
  failover: string;
  home: string;
};

/** Waylight's edge regions, west to east along the line. */
const REGIONS: Region[] = [
  {
    value: "fjord",
    label: "Fjord North",
    hint: "12 ms",
    ms: 12,
    failover: "Harbor East",
    home: "Fjord",
  },
  {
    value: "harbor",
    label: "Harbor East",
    hint: "18 ms",
    ms: 18,
    failover: "Fjord North",
    home: "Harbor",
  },
  {
    value: "lowland",
    label: "Lowland Central",
    hint: "27 ms",
    ms: 27,
    failover: "Harbor East",
    home: "Lowland",
  },
  {
    value: "coast",
    label: "Coast West",
    hint: "41 ms",
    ms: 41,
    failover: "Lowland Central",
    home: "Coast",
  },
];

/**
 * Waylight edge settings: where a project's traffic is served from. The
 * rows under the select describe the chosen region.
 */
export function RailSelectDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [region, setRegion] = React.useState("harbor");
  const [open, setOpen] = React.useState(false);
  const r = REGIONS.find((x) => x.value === region) ?? REGIONS[1];

  const rows: [string, string][] = r
    ? [
        ["Latency", `${r.ms} ms`],
        ["Failover", r.failover],
        ["Data stays in", r.home],
        ["Cache", "Warm"],
      ]
    : [];

  const panel = (
    <div className="w-full max-w-sm rounded-3 border border-hairline bg-card p-3">
      <RailSelect
        label="Edge region"
        options={REGIONS}
        value={region}
        onValueChange={setRegion}
        open={open}
        onOpenChange={setOpen}
        name="region"
        sound={sound}
        {...values}
      />
      <dl className="mt-3 text-xs">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex h-7 items-center justify-between gap-3 border-t border-hairline"
          >
            <dt className="text-ink-3">{k}</dt>
            <dd className="truncate text-foreground tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{panel}</div>;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {open ? "choosing" : `region · ${r?.label.toLowerCase()}`}
        </span>
        {open ? " · arrows, letters or a click" : ` · ${r?.ms} ms`}
      </p>
    </div>
  );
}
