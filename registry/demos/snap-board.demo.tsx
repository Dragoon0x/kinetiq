"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultBoardLayout,
  defaultBoardWidgets,
  SnapBoard,
  type SnapBoardDrag,
  type SnapBoardItem,
} from "@/registry/ui/snap-board";

export const tweaks = defineTweaks({
  columns: {
    kind: "range",
    label: "Columns",
    default: 12,
    min: 4,
    max: 12,
    step: 2,
  },
  push: {
    kind: "choice",
    label: "Push",
    default: "compact",
    options: ["compact", "free", "swap"],
    names: { compact: "Compact", free: "Free", swap: "Swap" },
  },
  ghost: {
    kind: "choice",
    label: "Ghost",
    default: "outline",
    options: ["outline", "tint", "none"],
    names: { outline: "Outline", tint: "Tint", none: "None" },
  },
});

const titleOf = (id: string) =>
  (defaultBoardWidgets.find((w) => w.id === id)?.title ?? id).toLowerCase();

/** Gaugeworks' operations dashboard, open for editing. */
export function SnapBoardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const cols = values.columns ?? 12;
  const [saved, setSaved] = React.useState(() => ({
    cols,
    layout: defaultBoardLayout(cols),
  }));
  // A new column count starts from the layout authored for it.
  const layout = saved.cols === cols ? saved.layout : defaultBoardLayout(cols);
  const [drag, setDrag] = React.useState<SnapBoardDrag | null>(null);
  const [last, setLast] = React.useState<{ id: string; moved: number } | null>(
    null,
  );
  const rows = layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {/* The editing canvas: the board sits at its top and scrolls inside
          it, so a board that grows while a widget is held never moves the
          widget out from under the finger. */}
      <div
        className="w-full overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-background p-1"
        style={{ height: chrome ? 452 : 556 }}
      >
        <SnapBoard
          label="Gaugeworks operations"
          layout={layout}
          onLayoutChange={(next: SnapBoardItem[]) =>
            setSaved({ cols, layout: next })
          }
          onMove={(id, moved) => setLast({ id, moved: moved.length })}
          onDragChange={(next) => {
            setDrag(next);
            if (next) setLast(null);
          }}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {drag ? (
              <>
                <span className="text-signal">
                  {drag.mode === "move" ? "moving" : "resizing"}{" "}
                  {titleOf(drag.id)}
                </span>{" "}
                · column {drag.item.x + 1}, row {drag.item.y + 1} ·{" "}
                {drag.item.w} by {drag.item.h}
              </>
            ) : last ? (
              <>
                <span className="text-signal">dropped {titleOf(last.id)}</span>{" "}
                · {last.moved} moved
              </>
            ) : (
              <>
                <span className="text-signal">
                  {defaultBoardWidgets.length} widgets
                </span>{" "}
                · {cols} columns · {rows} rows
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setSaved({ cols, layout: defaultBoardLayout(cols) });
              setLast(null);
            }}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-[11px] text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset layout
          </button>
        </div>
      ) : null}
    </div>
  );
}
