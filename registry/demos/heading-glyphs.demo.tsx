"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { HeadingGlyphs } from "@/registry/ui/heading-glyphs";

export const tweaks = defineTweaks({
  ramp: {
    kind: "choice",
    label: "Ramp",
    default: "ascii",
    options: ["ascii", "box", "dots"],
    names: { ascii: "ASCII", box: "Box", dots: "Dots" },
  },
  fade: {
    kind: "range",
    label: "Fade",
    default: 1400,
    min: 400,
    max: 4000,
    step: 200,
    unit: "ms",
  },
  cell: {
    kind: "range",
    label: "Cell",
    default: 14,
    min: 10,
    max: 26,
    step: 2,
    unit: "px",
  },
});

type Reading =
  | { kind: "rest" }
  | { kind: "stamp"; col: number; row: number }
  | { kind: "focus"; name: string };

const chip =
  "inline-flex h-8 items-center rounded-full border border-hairline-strong bg-surface-1 px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:border-cobalt-bright/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Waylight Type's specimen page: the hero sets your cursor's path in the
 * characters that fit it.
 */
export function HeadingGlyphsDemo({
  chrome = true,
  // The type is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [reading, setReading] = React.useState<Reading>({ kind: "rest" });

  const action = (name: string) => (
    <button
      type="button"
      className={chip}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible"))
          setReading({ kind: "focus", name });
      }}
    >
      {name}
    </button>
  );

  const hero = (
    <HeadingGlyphs
      onStamp={(at) => setReading({ kind: "stamp", ...at })}
      className={cn(
        "w-full rounded-3 border border-hairline bg-card",
        chrome ? "h-60" : "h-52",
      )}
      {...values}
    >
      <div className="@container flex size-full flex-col justify-between gap-3 p-4 sm:p-5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight Type · specimen 04
        </p>
        <div className="flex flex-col gap-3">
          <p className="max-w-md text-xl leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground @lg:text-2xl">
            Every stroke has a character.
          </p>
          <div className="flex flex-wrap gap-2">
            {action("Browse faces")}
            {action("Get the specimen")}
          </div>
        </div>
      </div>
    </HeadingGlyphs>
  );

  if (!chrome) return <div className="flex w-full">{hero}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {hero}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reading.kind === "stamp" ? (
          <>
            <span className="text-signal">stamped</span> · col {reading.col} ·
            row {reading.row}
          </>
        ) : reading.kind === "focus" ? (
          <>
            <span className="text-signal">focus stroke</span> · under{" "}
            {reading.name.toLowerCase()}
          </>
        ) : (
          <>
            <span className="text-signal">resting</span> · move across the
            specimen, click to stamp
          </>
        )}
      </p>
    </div>
  );
}
