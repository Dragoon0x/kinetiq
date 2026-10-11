"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BeachScrawl } from "@/registry/ui/beach-scrawl";

export const tweaks = defineTweaks({
  waveRate: {
    kind: "range",
    label: "Waves",
    default: 7,
    min: 2,
    max: 16,
    step: 1,
    unit: "/min",
  },
  charSet: {
    kind: "choice",
    label: "Glyphs",
    default: "shore",
    options: ["shore", "dots", "hatch"],
    names: { shore: "Shore", dots: "Dots", hatch: "Hatch" },
  },
  wetness: {
    kind: "range",
    label: "Wetness",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Story =
  | { kind: "writing" }
  | { kind: "written"; waves: number }
  | { kind: "washed" }
  | { kind: "visitor" };

/**
 * Waylight Inn, rooms on Coldbrook Bay: the beach is the hero of a small
 * booking card, the hour's news written in the sand and taken by the tide.
 */
export function BeachScrawlDemo({
  chrome = true,
  // The beach is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({ kind: "writing" });

  const beach = (
    <div
      className="relative w-full"
      onPointerDown={() => setStory({ kind: "visitor" })}
      onKeyDown={(event) => {
        if (event.key.length === 1 || event.key === "Backspace") {
          setStory({ kind: "visitor" });
        }
      }}
    >
      <BeachScrawl
        message="Low tide"
        label="Coldbrook Bay beach"
        onWritten={() => setStory({ kind: "written", waves: 0 })}
        onWave={() =>
          setStory((s) =>
            s.kind === "written" ? { kind: "written", waves: s.waves + 1 } : s,
          )
        }
        onWashed={() => setStory({ kind: "washed" })}
        className={
          chrome
            ? "h-56 w-full rounded-3 border border-hairline bg-card"
            : "h-52 w-full rounded-3 border border-hairline bg-card"
        }
        {...values}
      />
      {chrome ? null : (
        <p className="pointer-events-none absolute top-2.5 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-2 border border-hairline bg-background/85 px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
          Waylight Inn · Coldbrook Bay
        </p>
      )}
    </div>
  );

  if (!chrome) return <div className="flex w-full">{beach}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Inn · Coldbrook Bay
          </p>
          <p className="text-base font-medium text-foreground">
            Low tide at 16:40. Rooms from 140.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Book a room
        </button>
      </div>
      {beach}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "writing" ? (
          <>
            <span className="text-signal">writing in the sand</span> · “LOW
            TIDE”
          </>
        ) : story.kind === "written" ? (
          <>
            <span className="text-signal">written</span> ·{" "}
            {story.waves === 0
              ? "the tide is coming"
              : `wave ${story.waves} softening it`}
          </>
        ) : story.kind === "washed" ? (
          <>
            <span className="text-signal">washed away</span> · writing again
          </>
        ) : (
          <>
            <span className="text-signal">your writing</span> · the tide is
            coming
          </>
        )}
      </p>
    </div>
  );
}
