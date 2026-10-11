"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSeedheadItems,
  SeedheadGallery,
} from "@/registry/ui/seedhead-gallery";

export const tweaks = defineTweaks({
  angle: {
    kind: "range",
    label: "Angle",
    default: 137.5,
    min: 130,
    max: 145,
    step: 0.5,
    unit: "°",
  },
  growth: {
    kind: "range",
    label: "Growth",
    default: 0.6,
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  scale: {
    kind: "range",
    label: "Scale",
    default: 1,
    min: 0.5,
    max: 1.5,
    step: 0.05,
  },
});

const BUTTON =
  "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs text-foreground transition-colors outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-50";

/**
 * Fernworks Seed Library: every variety in the archive, scanned and set in
 * one seed head, newest at the core.
 */
export function SeedheadGalleryDemo({
  chrome = true,
  // The seed head is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [held, setHeld] = React.useState<number | null>(null);
  const [offset, setOffset] = React.useState(0);
  const items = defaultSeedheadItems;
  const growth = Math.min(
    1,
    Math.max(0.1, (values.growth ?? tweaks.growth.default) + offset),
  );

  const head = (
    <SeedheadGallery
      items={items}
      value={held}
      onValueChange={setHeld}
      label="Fernworks seed library"
      {...values}
      growth={growth}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 520 }}>
        {head}
      </div>
    );
  }

  const seed = held === null ? null : items[held];
  const grown = Math.max(3, Math.round(growth * items.length));

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks seed library
          </p>
          <p className="text-sm font-medium text-foreground">
            {items.length} varieties, scanned
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={growth <= 0.1}
            onClick={() => setOffset((o) => Math.round((o - 0.1) * 100) / 100)}
          >
            Shrink
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={growth >= 1}
            onClick={() => setOffset((o) => Math.round((o + 0.1) * 100) / 100)}
          >
            Grow
          </button>
        </div>
      </div>
      <div className="w-full" style={{ height: 420 }}>
        {head}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {seed && held !== null ? (
          <>
            <span className="text-signal">seed {held + 1}</span> ·{" "}
            {seed.caption ?? seed.alt}
          </>
        ) : (
          <>
            <span className="text-signal">{grown} grown</span> of {items.length}{" "}
            · scroll to grow
          </>
        )}
      </p>
    </div>
  );
}
