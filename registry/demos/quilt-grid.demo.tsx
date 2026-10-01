"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { QuiltGrid, type QuiltGridWave } from "@/registry/ui/quilt-grid";

export const tweaks = defineTweaks({
  blocks: {
    kind: "range",
    label: "Blocks",
    default: 10,
    min: 6,
    max: 16,
    step: 1,
  },
  wave: {
    kind: "range",
    label: "Wave",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "farm",
    options: ["farm", "sea", "candy"],
    names: { farm: "Farm", sea: "Sea", candy: "Candy" },
  },
});

/**
 * The Fieldline Quilt Guild's winter show: the guild's own quilt behind the
 * notice, re-stitched wherever the visitor points.
 */
export function QuiltGridDemo({
  chrome = true,
  // The quilt is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [last, setLast] = React.useState<QuiltGridWave | null>(null);
  const restitched = last ? last.turned + last.swapped : 0;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <QuiltGrid
        onWave={(wave) => {
          if (wave.press) setLast(wave);
        }}
        className={cn("w-full rounded-3", chrome ? "h-64" : "h-52")}
        {...values}
      >
        <div className="flex h-full items-center justify-center p-4">
          <div className="max-w-[85%] rounded-3 border border-hairline bg-background/90 px-4 py-3 text-center shadow-sm">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fieldline Quilt Guild
            </p>
            <p className="mt-1 text-lg leading-tight font-medium text-foreground">
              Winter quilt show
            </p>
            <p className="mt-1 text-xs text-balance text-ink-2">
              Bring a block, leave with a quilt
            </p>
          </div>
        </div>
      </QuiltGrid>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {last ? (
            <>
              <span className="text-signal">
                re-stitched {restitched} block{restitched === 1 ? "" : "s"}
              </span>{" "}
              · from row {last.row + 1}, block {last.col + 1}
            </>
          ) : (
            <>
              <span className="text-signal">quilt at rest</span> · hover to
              turn, click to re-stitch
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
