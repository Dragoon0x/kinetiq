"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { SightLines, type SightLinesMeasure } from "@/registry/ui/sight-lines";

export const tweaks = defineTweaks({
  labels: {
    kind: "choice",
    label: "Labels",
    default: "px",
    options: ["px", "rem", "percent", "none"],
    names: { px: "Pixels", rem: "Rem", percent: "Percent", none: "Off" },
  },
  snap: { kind: "toggle", label: "Snap", default: true },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "redline", "signal", "ink"],
    names: {
      cobalt: "Cobalt",
      redline: "Redline",
      signal: "Signal",
      ink: "Ink",
    },
  },
});

const control =
  "inline-flex h-8 shrink-0 items-center rounded-2 px-3 whitespace-nowrap text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Waylight's spec sheet: a product tile under inspection, where the lines
 * measure the space around whatever you point at.
 */
export function SightLinesDemo({
  chrome = true,
  // The lines are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [measure, setMeasure] = React.useState<{
    label: string;
    width: number;
    height: number;
  } | null>(null);
  const [bagged, setBagged] = React.useState(false);

  const onMeasure = (m: SightLinesMeasure | null) =>
    setMeasure(m ? { label: m.label, width: m.width, height: m.height } : null);

  const sheet = (
    <SightLines
      className="w-full rounded-3 border border-hairline bg-surface-1"
      onMeasure={onMeasure}
      {...values}
    >
      {/* The artboard is a container, so the tile answers to the card it
          sits in, not to the window. */}
      <div
        className={cn(
          "@container flex items-center justify-center px-5 py-6",
          chrome ? "h-64" : "h-52",
        )}
      >
        <div
          data-measure="Tile"
          className="flex w-full max-w-md items-center gap-3 rounded-3 border border-hairline bg-card p-3 @md:gap-4"
        >
          <div
            data-measure="Cover"
            aria-hidden
            className="size-14 shrink-0 rounded-2 @md:size-20"
            style={{
              background:
                "radial-gradient(circle at 34% 30%, oklch(from var(--warn) 0.93 0.07 h) 0 12%, transparent 46%), linear-gradient(150deg, oklch(from var(--accent-bright) 0.5 0.11 h), oklch(from var(--accent-bright) 0.3 0.07 h))",
            }}
          />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <div className="min-w-0">
              <p
                data-measure="Title"
                className="text-sm font-semibold text-foreground"
              >
                Waylight Mini
              </p>
              <p className="text-xs text-ink-3">
                Desk lamp<span className="hidden @md:inline"> · warm dim</span>{" "}
                · $148
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-measure="Add to bag"
                data-measure-home
                onClick={() => setBagged(true)}
                className={cn(
                  control,
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {/* Both labels share one cell so the button keeps its width. */}
                <span className="grid">
                  <span
                    className={cn(
                      "col-start-1 row-start-1",
                      bagged && "invisible",
                    )}
                  >
                    Add to bag
                  </span>
                  <span
                    className={cn(
                      "col-start-1 row-start-1",
                      !bagged && "invisible",
                    )}
                  >
                    In your bag
                  </span>
                </span>
              </button>
              <button
                type="button"
                data-measure="Details"
                className={cn(
                  control,
                  "border border-hairline-strong text-foreground hover:bg-surface-2",
                )}
              >
                Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </SightLines>
  );

  if (!chrome) return <div className="flex w-full">{sheet}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sheet}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {measure ? (
          <>
            <span className="text-signal">measuring</span> · {measure.label} ·{" "}
            {measure.width} × {measure.height}
          </>
        ) : (
          <>
            <span className="text-signal">tracking</span> · point at a block or
            press Tab
          </>
        )}
      </p>
    </div>
  );
}
