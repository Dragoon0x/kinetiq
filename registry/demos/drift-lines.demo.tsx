"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DriftLines } from "@/registry/ui/drift-lines";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 24,
    min: 8,
    max: 48,
    step: 4,
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "var(--foreground)",
    options: [
      "var(--foreground)",
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
    ],
    names: {
      "var(--foreground)": "Ink",
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
    },
  },
});

const PLANES = (depth: number) =>
  depth > 0.6 ? "near lines" : depth < 0.4 ? "far lines" : "middle lines";

/**
 * Coldbrook Labs' research hero: the line sits over a field of drifting
 * lines that turns toward the visitor's hand, and a press racks focus.
 */
export function DriftLinesDemo({
  chrome = true,
  // The lines are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [near, setNear] = React.useState(false);
  const [lens, setLens] = React.useState<{ depth: number; racked: boolean }>({
    depth: 0,
    racked: false,
  });
  const count = values.count ?? 24;

  const field = (
    <DriftLines
      onActiveChange={setNear}
      onFocusChange={(depth, racked) => setLens({ depth, racked })}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline bg-background"
          : "h-52 rounded-3 border border-hairline bg-background"
      }
      {...values}
    >
      <div className="@container relative size-full">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[radial-gradient(ellipse_60%_70%_at_18%_50%,var(--background)_30%,transparent_72%)] @lg:w-3/4"
        />
        <div className="relative flex size-full flex-col justify-center p-5 @lg:p-7">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Coldbrook Labs
          </p>
          <p className="mt-1.5 max-w-48 text-lg leading-snug font-semibold text-balance text-foreground @lg:max-w-64 @lg:text-xl">
            Every layer, in focus
          </p>
          {chrome ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Read the notes
              </button>
              <span className="text-xs text-ink-2">
                Field notes from the deep survey
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </DriftLines>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lens.racked ? (
          <>
            <span className="text-signal">focus</span> · {PLANES(lens.depth)}
          </>
        ) : near ? (
          <>
            <span className="text-signal">parallax</span> · the field turns to
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{count} lines</span> · drifting
          </>
        )}
      </p>
    </div>
  );
}
