"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SlateTablet } from "@/registry/ui/slate-tablet";

export const tweaks = defineTweaks({
  ink: {
    kind: "choice",
    label: "Ink",
    default: "black",
    options: ["black", "blue", "red"],
    names: { black: "Black", blue: "Blue", red: "Red" },
  },
  bezel: {
    kind: "range",
    label: "Bezel",
    default: 14,
    min: 8,
    max: 24,
    step: 2,
    unit: "px",
  },
  orientation: {
    kind: "choice",
    label: "Orientation",
    default: "landscape",
    options: ["landscape", "portrait"],
    names: { landscape: "Landscape", portrait: "Portrait" },
  },
});

const CHECKS = [
  { id: "weir", text: "Weir gauge read", done: true },
  { id: "silt", text: "Silt trap cleared", done: true },
  { id: "fence", text: "Fence post by the sluice", done: false },
];

/** A Fernworks Notes page: a ruled sheet with the visit's checklist. */
function NotesPage() {
  return (
    <div className="flex size-full flex-col gap-2 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_17px,var(--hairline)_17px,var(--hairline)_18px)] px-3 pt-2.5 pb-2 @min-[18rem]:px-4 @min-[18rem]:pt-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-semibold text-foreground @min-[18rem]:text-sm">
          Site visit — Basin 3
        </span>
        <span className="shrink-0 font-mono text-[9px] text-ink-3 tabular-nums @max-[12rem]:hidden">
          14 Oct
        </span>
      </div>
      <ul role="list" className="flex flex-col">
        {CHECKS.map((c) => (
          <li
            key={c.id}
            className="flex h-[18px] items-center gap-1.5 text-[10px] text-ink-2 @min-[18rem]:text-[11px]"
          >
            <span
              aria-hidden
              className={
                c.done
                  ? "flex size-2.5 shrink-0 items-center justify-center rounded-[3px] bg-success text-background"
                  : "size-2.5 shrink-0 rounded-[3px] border border-ink-3"
              }
            >
              {c.done ? (
                <svg
                  viewBox="0 0 10 10"
                  className="size-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2.2 5.2 L4.2 7.2 L7.8 3" />
                </svg>
              ) : null}
            </span>
            <span className={c.done ? "truncate line-through" : "truncate"}>
              {c.text}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[9px] text-ink-3 @min-[18rem]:text-[10px]">
        Sketch the sluice below.
      </p>
    </div>
  );
}

/**
 * Field notes in Fernworks Notes: pull the pencil off the tablet's edge and
 * mark up the page; put it back and the ink clears.
 */
export function SlateTabletDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [docked, setDocked] = React.useState(true);
  const [strokes, setStrokes] = React.useState(0);

  const tablet = (
    <SlateTablet
      label="Fernworks Notes tablet"
      docked={docked}
      onDockedChange={(next) => {
        setDocked(next);
        if (next) setStrokes(0);
      }}
      onStroke={() => setStrokes((n) => n + 1)}
      sound={sound}
      {...values}
    >
      <NotesPage />
    </SlateTablet>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[304px]">{tablet}</div>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {tablet}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {docked ? (
          <>
            <span className="text-signal">pencil docked</span> · drag it onto
            the page
          </>
        ) : (
          <>
            <span className="text-signal">pencil out</span> · {strokes}{" "}
            {strokes === 1 ? "stroke" : "strokes"}
          </>
        )}
      </p>
    </div>
  );
}
