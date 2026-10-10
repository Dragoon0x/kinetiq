"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DragNumber } from "@/registry/ui/drag-number";

export const tweaks = defineTweaks({
  step: {
    kind: "range",
    label: "Step",
    default: 1,
    min: 0.5,
    max: 5,
    step: 0.5,
  },
  precision: {
    kind: "range",
    label: "Precision",
    default: 0,
    min: 0,
    max: 2,
    step: 1,
  },
  sensitivity: {
    kind: "range",
    label: "Sensitivity",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
  },
});

/** Seeded contour rings for the layer thumbnail: the same on server and client. */
const RINGS: string[] = (() => {
  let seed = 1508;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: string[] = [];
  for (let ring = 0; ring < 5; ring += 1) {
    const base = 4 + ring * 4.2;
    const pts: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const a = (i / 20) * Math.PI * 2;
      const r = base * (1 + (rand() - 0.5) * 0.22);
      const x = 24 + Math.cos(a) * r * 1.15;
      const y = 22 + Math.sin(a) * r;
      pts.push(`${Number(x.toFixed(2))} ${Number(y.toFixed(2))}`);
    }
    out.push(`M${pts.join("L")}Z`);
  }
  return out;
})();

function ContourThumb({ strength }: { strength: number }) {
  return (
    <svg
      aria-hidden
      width={48}
      height={44}
      viewBox="0 0 48 44"
      className="shrink-0 overflow-clip rounded-2 bg-surface-2"
    >
      <g
        fill="none"
        strokeWidth={1}
        strokeLinejoin="round"
        className="stroke-cobalt-bright"
        style={{ opacity: Number(strength.toFixed(3)) }}
      >
        {RINGS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

/**
 * A Fieldline map layer: the contour layer's opacity is a field you scrub by
 * its label, and the thumbnail follows it.
 */
export function DragNumberDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [opacity, setOpacity] = React.useState(72);
  const [scrub, setScrub] = React.useState({ on: false, gear: 1 });

  const card = (
    <div className="flex w-full max-w-72 flex-col gap-3 self-center rounded-3 border border-hairline bg-card p-3">
      <div className="flex items-center gap-3">
        <ContourThumb strength={opacity / 100} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            Contours
          </p>
          <p className="truncate text-xs text-ink-3">
            Fieldline · Ridge survey
          </p>
        </div>
      </div>
      <DragNumber
        label="Opacity"
        unit="%"
        min={0}
        max={100}
        value={opacity}
        onValueChange={setOpacity}
        onScrubChange={(on, gear) => setScrub({ on, gear })}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{card}</div>;
  }

  const [lead, rest] = scrub.on
    ? [
        "scrubbing",
        scrub.gear > 1 ? ` · coarse ×${scrub.gear}` : " · fine steps",
      ]
    : [`opacity ${opacity}%`, " · drag the label or type"];

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{lead}</span>
        {rest}
      </p>
    </div>
  );
}
