"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LassoGrid, type LassoGridItem } from "@/registry/ui/lasso-grid";

export const tweaks = defineTweaks({
  mode: {
    kind: "choice",
    label: "Shape",
    default: "box",
    options: ["box", "lasso"],
    names: { box: "Box", lasso: "Lasso" },
  },
  hit: {
    kind: "choice",
    label: "Catch",
    default: "touch",
    options: ["touch", "contain"],
    names: { touch: "Touch", contain: "Contain" },
  },
  badge: { kind: "toggle", label: "Badge", default: true },
});

/** A Fernworks shoot folder. Sizes are in kB. */
const FILES: (LassoGridItem & { size: number })[] = [
  { id: "drafts", name: "Drafts", kind: "folder", size: 48_200 },
  { id: "selects", name: "Selects", kind: "folder", size: 31_600 },
  { id: "brief", name: "brief.pdf", kind: "doc", size: 820 },
  { id: "shots", name: "shots.txt", kind: "doc", size: 6 },
  { id: "cover", name: "cover.jpg", kind: "image", size: 4_300 },
  { id: "wide1", name: "wide1.jpg", kind: "image", size: 5_100 },
  { id: "wide2", name: "wide2.jpg", kind: "image", size: 4_900 },
  { id: "close", name: "close.jpg", kind: "image", size: 3_800 },
  { id: "costs", name: "costs.csv", kind: "sheet", size: 14 },
  { id: "call", name: "call.m4a", kind: "audio", size: 2_600 },
  { id: "cut", name: "cut.mp4", kind: "video", size: 38_400 },
  { id: "grade", name: "grade.png", kind: "image", size: 1_200 },
];

const megabytes = (kb: number) =>
  kb >= 1000 ? `${(kb / 1000).toFixed(1)} mb` : `${kb} kb`;

/**
 * The "Spring shoot" folder in a Fernworks project: drag to draw a box
 * around files, hold Alt for a lasso, Shift to add and Cmd or Ctrl to
 * toggle — or do it all from the keyboard.
 */
export function LassoGridDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [picked, setPicked] = React.useState<string[]>(["cover", "wide1"]);
  const total = FILES.filter((f) => picked.includes(f.id)).reduce(
    (sum, f) => sum + f.size,
    0,
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <p className="min-w-0 truncate text-xs text-ink-3">
            Fernworks <span aria-hidden>/</span>{" "}
            <span className="text-foreground">Spring shoot</span>
          </p>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {FILES.length} items
          </span>
        </div>
        <LassoGrid
          label="Spring shoot files"
          items={FILES}
          value={picked}
          onValueChange={setPicked}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {picked.length === 0 ? (
            <>
              <span className="text-signal">none selected</span> · drag to draw
              a box
            </>
          ) : (
            <>
              <span className="text-signal">{picked.length} selected</span> ·{" "}
              {megabytes(total)}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
