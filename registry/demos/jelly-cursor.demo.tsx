"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { JellyCursor } from "@/registry/ui/jelly-cursor";

export const tweaks = defineTweaks({
  size: {
    kind: "range",
    label: "Size",
    default: 28,
    min: 16,
    max: 48,
    step: 4,
    unit: "px",
  },
  wobble: {
    kind: "range",
    label: "Wobble",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "mint", "ember", "ink"],
    names: { cobalt: "Cobalt", mint: "Mint", ember: "Ember", ink: "Ink" },
  },
});

const ghost =
  "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Waylight's landing strip: a calm reading app whose cursor is a drop of
 * jelly that wraps each link it touches and clings a moment when you leave.
 */
export function JellyCursorDemo({
  chrome = true,
  // The jelly is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [on, setOn] = React.useState<string | null>("start reading");
  const [inside, setInside] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const active = inside || focused;
  const [wraps, setWraps] = React.useState(0);

  const strip = (
    <JellyCursor
      className={cn(
        "w-full rounded-3 border border-hairline bg-card",
        chrome ? "h-60" : "h-52",
      )}
      onTargetChange={(el) => {
        const name = el?.textContent?.trim().toLowerCase() ?? null;
        setOn(name);
        if (name && active) setWraps((n) => n + 1);
      }}
      {...values}
    >
      <div
        className="flex size-full flex-col justify-between gap-3 p-4 sm:p-5"
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setInside(true);
        }}
        onPointerLeave={() => setInside(false)}
        onFocus={(event) => setFocused(event.target.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight · reading app
          </p>
          <nav aria-label="Waylight" className="-mx-3 flex flex-wrap">
            <button type="button" className={ghost}>
              Library
            </button>
            <button type="button" className={ghost}>
              Highlights
            </button>
            <button type="button" className={ghost}>
              Pricing
            </button>
          </nav>
        </div>
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-[18rem] text-lg leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
            Read at your own pace.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-jelly-rest
              className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Start reading
            </button>
            {chrome ? (
              <button type="button" className={ghost}>
                See a sample
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </JellyCursor>
  );

  if (!chrome) return <div className="flex w-full">{strip}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {strip}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {on && active ? (
          <>
            <span className="text-signal">wrapped</span> · {on}
            {wraps > 1 ? ` · ${wraps} wraps` : ""}
          </>
        ) : on ? (
          <>
            <span className="text-signal">resting</span> · on {on}
          </>
        ) : inside ? (
          <>
            <span className="text-signal">following</span> · move fast, then
            stop
          </>
        ) : (
          <>
            <span className="text-signal">away</span> · point inside or press
            Tab
          </>
        )}
      </p>
    </div>
  );
}
