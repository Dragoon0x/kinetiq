"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FlipbookPath } from "@/registry/ui/flipbook-path";

export const tweaks = defineTweaks({
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 30,
    min: 16,
    max: 64,
    step: 2,
    unit: "px",
  },
  frameSize: {
    kind: "range",
    label: "Page",
    default: 56,
    min: 32,
    max: 72,
    step: 4,
    unit: "px",
  },
  fade: {
    kind: "range",
    label: "Fade",
    default: 2.5,
    min: 0.5,
    max: 6,
    step: 0.5,
    unit: "s",
  },
});

type Story =
  | { kind: "rest" }
  | { kind: "laying"; count: number }
  | { kind: "playing"; frame: number; of: number }
  | { kind: "fading"; count: number }
  | { kind: "clear" };

/**
 * Fernworks Animation School's open studio: the drafting table where every
 * stroke of the pointer lays a page, and a sweep back plays them.
 */
export function FlipbookPathDemo({
  chrome = true,
  // The pages are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({ kind: "rest" });
  const shown = React.useRef(-1);

  const onTrail = (count: number, resting: boolean) => {
    const before = shown.current;
    shown.current = count;
    if (resting || before < 0) setStory({ kind: "rest" });
    else if (count === 0) setStory({ kind: "clear" });
    else if (count > before) setStory({ kind: "laying", count });
    else setStory({ kind: "fading", count });
  };

  const surface = (
    <div className="relative w-full">
      <FlipbookPath
        label="Fernworks drafting table"
        onTrail={onTrail}
        onFrame={(frame, of) => setStory({ kind: "playing", frame, of })}
        className="h-52 w-full rounded-3 border border-hairline bg-surface-1 bg-[linear-gradient(var(--grid-minor)_1px,transparent_1px),linear-gradient(90deg,var(--grid-minor)_1px,transparent_1px)] bg-[size:16px_16px]"
        {...values}
      />
      <p className="pointer-events-none absolute top-2.5 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-2 border border-hairline bg-background/85 px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
        Fernworks · open studio
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks Animation School
        </p>
        <p className="text-base font-medium text-foreground">
          Every line is a frame. Draw one, then play it back.
        </p>
      </div>
      {surface}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "rest" ? (
          <>
            <span className="text-signal">move to lay frames</span> · sweep back
            to play them
          </>
        ) : story.kind === "laying" ? (
          <>
            <span className="text-signal">laying</span> · {story.count}{" "}
            {story.count === 1 ? "frame" : "frames"}
          </>
        ) : story.kind === "playing" ? (
          <>
            <span className="text-signal">playing</span> · frame {story.frame}{" "}
            of {story.of}
          </>
        ) : story.kind === "fading" ? (
          <>
            <span className="text-signal">fading from the oldest</span> ·{" "}
            {story.count} left
          </>
        ) : (
          <>
            <span className="text-signal">trail cleared</span> · draw again
          </>
        )}
      </p>
    </div>
  );
}
