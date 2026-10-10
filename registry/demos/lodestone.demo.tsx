"use client";

import * as React from "react";

import { Bookmark, Share2 } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { Lodestone } from "@/registry/ui/lodestone";

export const tweaks = defineTweaks({
  radius: {
    kind: "range",
    label: "Radius",
    default: 72,
    min: 24,
    max: 160,
    step: 8,
    unit: "px",
  },
  strength: {
    kind: "range",
    label: "Strength",
    default: 0.35,
    min: 0.1,
    max: 0.8,
    step: 0.05,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 8,
    min: 0,
    max: 20,
    step: 1,
    unit: "°",
  },
});

const ring =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Gaugeworks Pro's offer card: the trial button and the two small actions
 * beside it each sit on their own lodestone.
 */
export function LodestoneDemo({
  chrome = true,
  // The lodestones are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pulled, setPulled] = React.useState<string[]>([]);
  const [lifted, setLifted] = React.useState<string | null>(null);

  const track = (name: string) => (on: boolean) =>
    setPulled((list) =>
      on
        ? [...list.filter((n) => n !== name), name]
        : list.filter((n) => n !== name),
    );
  const focusProps = (name: string) => ({
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
      if (event.currentTarget.matches(":focus-visible")) setLifted(name);
    },
    onBlur: () => setLifted(null),
  });

  const card = (
    <div className="flex w-full flex-col gap-4 rounded-3 border border-hairline bg-card p-5">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · Pro
        </p>
        <p className="text-lg leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
          Instruments that answer back.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Lodestone {...values} onPullChange={track("Start free trial")}>
          <button
            type="button"
            {...focusProps("Start free trial")}
            className={`inline-flex h-9 items-center rounded-2 bg-primary px-4 text-sm font-medium text-primary-foreground ${ring}`}
          >
            Start free trial
          </button>
        </Lodestone>
        <div className="flex items-center gap-5">
          <Lodestone {...values} onPullChange={track("Bookmark")}>
            <button
              type="button"
              aria-label="Bookmark"
              {...focusProps("Bookmark")}
              className={`inline-flex size-9 items-center justify-center rounded-2 border border-hairline-strong bg-surface-2 text-foreground ${ring}`}
            >
              <Bookmark aria-hidden className="size-4 shrink-0" />
            </button>
          </Lodestone>
          <Lodestone {...values} onPullChange={track("Share")}>
            <button
              type="button"
              aria-label="Share"
              {...focusProps("Share")}
              className={`inline-flex size-9 items-center justify-center rounded-2 border border-hairline-strong bg-surface-2 text-foreground ${ring}`}
            >
              <Share2 aria-hidden className="size-4 shrink-0" />
            </button>
          </Lodestone>
        </div>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xs">{card}</div>;

  const nearest = pulled[pulled.length - 1];
  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lifted ? (
          <>
            <span className="text-signal">lifted</span> · {lifted}
          </>
        ) : nearest ? (
          <>
            <span className="text-signal">pulled</span> · {nearest}
            {pulled.length > 1 ? ` and ${pulled.length - 1} more` : ""}
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · bring the pointer
            near
          </>
        )}
      </p>
    </div>
  );
}
