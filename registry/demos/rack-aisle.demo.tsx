"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RackAisle, type RackAisleItem } from "@/registry/ui/rack-aisle";

export const tweaks = defineTweaks({
  racks: {
    kind: "range",
    label: "Racks",
    default: 6,
    min: 3,
    max: 10,
    step: 1,
  },
  load: {
    kind: "range",
    label: "Load",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  sweep: {
    kind: "range",
    label: "Sweep",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** An integer hash to 0–1: the same in Node and every browser, unlike trig. */
const unit = (a: number, b: number) => {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** The row's feed: loads wander round the set level, and now and then one rack spikes. */
function feed(count: number, load: number, tick: number): RackAisleItem[] {
  const spikeOn = tick % 4 === 1 || tick % 4 === 2;
  const spiking = Math.floor(unit(Math.floor(tick / 4), 3) * count);
  return Array.from({ length: count }, (_, i) => {
    const id = `R${String(i + 1).padStart(2, "0")}`;
    const phase = (tick + i * 3) % 8;
    const swing = (phase < 4 ? phase : 8 - phase) / 4 - 0.5;
    const wander = 0.2 * (unit(i, 1) - 0.5) + 0.16 * swing;
    const level = Math.min(0.9, Math.max(0.03, load + wander));
    const spike = spikeOn && i === spiking && tick > 0;
    return {
      id,
      load: Math.round((spike ? 0.97 : level) * 100) / 100,
      spike,
    };
  });
}

/**
 * Basinworks east, row 4: the operations view of one cold aisle, fed by the
 * row's telemetry every few seconds.
 */
export function RackAisleDemo({
  chrome = true,
  // The aisle is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const racks = Math.round(values.racks ?? tweaks.racks.default);
  const load = values.load ?? tweaks.load.default;
  const [tick, setTick] = React.useState(0);
  const [pinned, setPinned] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 2600);
    return () => window.clearInterval(id);
  }, []);

  const items = feed(racks * 2, load, tick);

  const aisle = (
    <div className="relative size-full">
      <RackAisle
        items={items}
        value={pinned}
        onValueChange={setPinned}
        {...values}
      />
      <p className="pointer-events-none absolute top-2.5 left-2.5 z-30 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card/80 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-signal"
        />
        Basinworks east · row 4
      </p>
    </div>
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {aisle}
      </div>
    );
  }

  const mean = Math.round(
    (items.reduce((sum, r) => sum + (r.load ?? 0), 0) / items.length) * 100,
  );
  const spiking = items.find((r) => r.spike);
  const held = items.find((r) => r.id === pinned);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="w-full" style={{ height: 224 }}>
        {aisle}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {held ? (
          <span className="text-signal">
            pinned {held.id} · {Math.round((held.load ?? 0) * 100)}%
          </span>
        ) : (
          <span className="text-signal">
            {racks} {racks === 1 ? "rack" : "racks"} a side
          </span>
        )}{" "}
        · mean load {mean}%
        {spiking ? (
          <span className="text-warn"> · spike on {spiking.id}</span>
        ) : null}
      </p>
    </div>
  );
}
