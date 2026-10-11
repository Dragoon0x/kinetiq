"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TaffyPull } from "@/registry/ui/taffy-pull";

export const tweaks = defineTweaks({
  stretch: {
    kind: "range",
    label: "Stretch",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 420,
    min: 120,
    max: 900,
    step: 20,
  },
  thinning: {
    kind: "range",
    label: "Thinning",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const HEADLINE = "Saltwater taffy";
const LETTERS = Array.from(HEADLINE.replace(/\s/g, ""));

type Story =
  | { kind: "idle" }
  | { kind: "pulling"; letter: string; amount: number }
  | { kind: "snapped" }
  | { kind: "torn" }
  | { kind: "landed" };

/**
 * Fernworks Sweets, a confectioner's landing line: the headline is the
 * product, and every letter of it pulls like the real thing.
 */
export function TaffyPullDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({ kind: "idle" });

  const headline = (
    <div className="@container w-full">
      <TaffyPull
        text={HEADLINE}
        as="h2"
        sound={sound}
        onPull={(i, amount) =>
          setStory({ kind: "pulling", letter: LETTERS[i] ?? "", amount })
        }
        onSnap={() =>
          setStory((s) =>
            s.kind === "torn" ? { kind: "landed" } : { kind: "snapped" },
          )
        }
        onTear={() => setStory({ kind: "torn" })}
        className="text-center text-[clamp(2.25rem,11cqi,4.25rem)] font-semibold tracking-tight text-foreground"
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full">{headline}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks Sweets
      </p>
      {headline}
      <p className="text-center text-sm text-ink-2">
        Pulled by hand in Coldbrook since 1931.
      </p>
      <button
        type="button"
        className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        See the flavours
      </button>
      <p
        role="status"
        className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "pulling" ? (
          <>
            <span className="text-signal">pulling “{story.letter}”</span> ·{" "}
            {Math.round(story.amount * 100)}%
          </>
        ) : story.kind === "snapped" ? (
          <>
            <span className="text-signal">snapped home</span> · pull another
          </>
        ) : story.kind === "torn" ? (
          <>
            <span className="text-signal">torn free</span> · reeling it in
          </>
        ) : story.kind === "landed" ? (
          <>
            <span className="text-signal">back in its slot</span> · reeled home
          </>
        ) : (
          <>
            <span className="text-signal">grab a letter</span> · and pull
          </>
        )}
      </p>
    </div>
  );
}
