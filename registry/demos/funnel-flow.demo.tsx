"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultFunnelSegments,
  defaultFunnelStages,
  FunnelFlow,
} from "@/registry/ui/funnel-flow";

export const tweaks = defineTweaks({
  particles: {
    kind: "range",
    label: "Particles",
    default: 100,
    min: 20,
    max: 200,
    step: 20,
  },
  segment: {
    kind: "choice",
    label: "Segment",
    default: "all",
    options: ["all", "web", "mobile", "partner"],
    names: { all: "All", web: "Web", mobile: "Mobile", partner: "Partner" },
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
    unit: "×",
  },
});

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const count = new Intl.NumberFormat("en-US");

/**
 * Fieldline's trial funnel for September: forty-eight thousand visits down
 * to the people who renewed, split by where they came from.
 */
export function FunnelFlowDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The tweak sets the segment the flow starts on; the switch is the
  // visitor's from there.
  const [segment, setSegment] = React.useState<string>(values.segment ?? "all");
  const [seen, setSeen] = React.useState(values.segment);
  if (seen !== values.segment) {
    setSeen(values.segment);
    if (values.segment !== undefined) setSegment(values.segment);
  }
  const [pinned, setPinned] = React.useState<string | null>(null);

  const funnel = (
    <FunnelFlow
      title="Trial funnel"
      subtitle="Fieldline · September"
      sound={sound}
      {...values}
      segment={segment}
      onSegmentChange={setSegment}
      stage={pinned}
      onStageChange={setPinned}
    />
  );

  if (!chrome) return <div className="w-full">{funnel}</div>;

  const seg =
    defaultFunnelSegments.find((s) => s.id === segment) ??
    defaultFunnelSegments[0];
  const counts = seg?.counts ?? [];
  const last = counts.length - 1;
  const end = (counts[last] ?? 0) / Math.max(1, counts[0] ?? 1);
  let worst = 1;
  for (let i = 1; i < last; i += 1) {
    const rate = 1 - (counts[i + 1] ?? 0) / Math.max(1, counts[i] ?? 1);
    const best = 1 - (counts[worst + 1] ?? 0) / Math.max(1, counts[worst] ?? 1);
    if (rate > best) worst = i;
  }
  const at = pinned
    ? defaultFunnelStages.findIndex((s) => s.id === pinned)
    : -1;
  const stage = defaultFunnelStages[at];

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {funnel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {stage ? (
          <>
            <span className="text-signal">
              {stage.label.toLowerCase()} · {count.format(counts[at] ?? 0)}
            </span>
            {at < last
              ? ` · ${pct(1 - (counts[at + 1] ?? 0) / Math.max(1, counts[at] ?? 1))} dropped`
              : " · the end of the funnel"}{" "}
            · frozen
          </>
        ) : (
          <>
            <span className="text-signal">
              {segment === "all"
                ? "all segments"
                : `${seg?.label.toLowerCase()} only`}
            </span>{" "}
            · {pct(end)} end to end · most lost at{" "}
            {defaultFunnelStages[worst]?.label.toLowerCase()}
          </>
        )}
      </p>
    </div>
  );
}
