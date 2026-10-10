"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ClickBloom, type ClickBloomHandle } from "@/registry/ui/click-bloom";

export const tweaks = defineTweaks({
  petals: {
    kind: "range",
    label: "Petals",
    default: 7,
    min: 3,
    max: 12,
    step: 1,
  },
  spread: {
    kind: "range",
    label: "Spread",
    default: 1,
    min: 0.4,
    max: 2,
    step: 0.1,
  },
  gravity: {
    kind: "range",
    label: "Gravity",
    default: 700,
    min: 0,
    max: 1800,
    step: 100,
    unit: "px/s²",
  },
});

/**
 * Fernworks' spring sowing card: every click anywhere on it opens a small
 * flower, and the Sow button keeps count of the rows.
 */
export function ClickBloomDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const bloom = React.useRef<ClickBloomHandle | null>(null);
  const [rows, setRows] = React.useState(142);
  const [blooms, setBlooms] = React.useState(0);
  const [lastOn, setLastOn] = React.useState("the card");

  // A tweak shows itself at once: one silent bloom in the middle of the
  // card with the new petals, spread and gravity.
  const settings = `${values.petals ?? ""}:${values.spread ?? ""}:${values.gravity ?? ""}`;
  const shown = React.useRef(settings);
  React.useEffect(() => {
    if (shown.current === settings) return;
    shown.current = settings;
    bloom.current?.bloom();
  }, [settings]);

  const card = (
    <ClickBloom
      ref={bloom}
      className="w-full rounded-3 border border-hairline bg-card"
      onBloom={() => setBlooms((n) => n + 1)}
      sound={sound}
      {...values}
    >
      <div
        onClickCapture={(event) => {
          const target = event.target as HTMLElement;
          setLastOn(target.closest("button")?.textContent ?? "the card");
        }}
        className="flex flex-col gap-3 p-5"
      >
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks · spring sowing
        </p>
        <p className="text-lg leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
          Every click plants something.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => setRows((n) => n + 1)}
            className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Sow a row
          </button>
          <span className="font-mono text-xs text-ink-3 tabular-nums">
            {rows} rows sown
          </span>
        </div>
      </div>
    </ClickBloom>
  );

  if (!chrome) return <div className="flex w-full max-w-xs">{card}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {blooms === 0 ? (
          <>
            <span className="text-signal">no blooms yet</span> · click anywhere
          </>
        ) : (
          <>
            <span className="text-signal">
              {blooms} {blooms === 1 ? "bloom" : "blooms"}
            </span>{" "}
            · last on {lastOn}
          </>
        )}
      </p>
    </div>
  );
}
