"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ThumbFlipbook } from "@/registry/ui/thumb-flipbook";

export const tweaks = defineTweaks({
  frames: {
    kind: "range",
    label: "Frames",
    default: 12,
    min: 6,
    max: 24,
    step: 1,
  },
  bend: {
    kind: "range",
    label: "Bend",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  riffle: {
    kind: "range",
    label: "Riffle",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const PAGES = 48;

/**
 * The pocket flipbook from the Fernworks Paper Co. gift shop: a boat on the
 * swell and a gull overhead, drawn in pen, one drawing to a page.
 */
export function ThumbFlipbookDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [page, setPage] = React.useState(0);
  const frames = values.frames ?? tweaks.frames.default;

  const book = (
    <ThumbFlipbook
      label="Fernworks pocket flipbook"
      pages={PAGES}
      value={page}
      onValueChange={setPage}
      sound={sound}
      className={chrome ? "aspect-auto h-[200px]" : "aspect-auto h-[216px]"}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{book}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {book}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            page {page} of {PAGES}
          </span>
          {" · "}drawing {(page % frames) + 1} of {frames}
        </p>
        <button
          type="button"
          onClick={() => setPage((p) => (p + frames > PAGES ? 0 : p + frames))}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Riffle a loop
        </button>
      </div>
    </div>
  );
}
