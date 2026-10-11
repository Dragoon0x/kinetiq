"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LightWand } from "@/registry/ui/light-wand";

export const tweaks = defineTweaks({
  exposure: {
    kind: "range",
    label: "Exposure",
    default: 4,
    min: 1,
    max: 12,
    step: 0.5,
    unit: "s",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "spectrum",
    options: ["spectrum", "ember", "ice", "sodium"],
    names: {
      spectrum: "Spectrum",
      ember: "Ember",
      ice: "Ice",
      sodium: "Sodium",
    },
  },
  thickness: {
    kind: "range",
    label: "Thickness",
    default: 6,
    min: 2,
    max: 16,
    step: 1,
    unit: "px",
  },
});

type Story =
  { kind: "dark" } | { kind: "open" } | { kind: "closed"; length: number };

/** Thousands with a thin comma, by hand, so server and browser agree. */
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Basinworks Night School: the light-painting class on Thursdays, its page a
 * dark studio where the visitor can try the wand before they sign up.
 */
export function LightWandDemo({
  chrome = true,
  // Light is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({ kind: "dark" });
  const exposure = values.exposure ?? 4;

  const room = (
    <LightWand
      label="Light-painting studio"
      onExposureStart={() => setStory({ kind: "open" })}
      onExposureEnd={(length) => setStory({ kind: "closed", length })}
      className="h-52 w-full rounded-3 border border-hairline"
      {...values}
    >
      <div className="@container flex size-full flex-col justify-end p-5 [text-shadow:0_1px_12px_var(--bg-0)]">
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Basinworks Night School · Thursdays
        </p>
        <p
          className="mt-1 font-semibold tracking-tight text-foreground"
          style={{ fontSize: "clamp(1.5rem, 7cqw, 2.75rem)", lineHeight: 1.05 }}
        >
          Paint with light.
        </p>
      </div>
    </LightWand>
  );

  if (!chrome) return <div className="flex w-full">{room}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {room}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "open" ? (
          <>
            <span className="text-signal">exposure open</span> ·{" "}
            {exposure.toFixed(1)} s on the shutter
          </>
        ) : story.kind === "closed" ? (
          <>
            <span className="text-signal">shutter closed</span> ·{" "}
            {grouped(story.length)} px of light, fading oldest first
          </>
        ) : (
          <>
            <span className="text-signal">dark room</span> · move to open the
            shutter
          </>
        )}
      </p>
    </div>
  );
}
