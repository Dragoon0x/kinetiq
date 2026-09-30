"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ClipTrim, type ClipTrimValue } from "@/registry/ui/clip-trim";

export const tweaks = defineTweaks({
  minLength: {
    kind: "range",
    label: "Min length",
    default: 1,
    min: 0.5,
    max: 4,
    step: 0.5,
    unit: "s",
  },
  snapBeats: { kind: "toggle", label: "Snap to beats", default: true },
  handle: {
    kind: "choice",
    label: "Handle",
    default: "frame",
    options: ["frame", "bar", "tab"],
    names: { frame: "Frame", bar: "Bar", tab: "Tab" },
  },
  density: {
    kind: "range",
    label: "Density",
    default: 5,
    min: 2,
    max: 8,
    step: 1,
    unit: "bars/s",
  },
});

const clock = (t: number) => {
  const tenths = Math.max(0, Math.round(t * 10));
  const m = Math.floor(tenths / 600);
  const rem = tenths - m * 600;
  return `${m}:${String(Math.floor(rem / 10)).padStart(2, "0")}.${rem % 10}`;
};

/**
 * Choosing the intro sting for a Fieldline Studio episode: a 12 second take,
 * trimmed to the part that plays before the show.
 */
export function ClipTrimDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [span, setSpan] = React.useState<ClipTrimValue>({
    start: 2,
    end: 6.5,
  });
  const [playing, setPlaying] = React.useState(false);
  const kept = Number((span.end - span.start).toFixed(2));

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card py-3">
        <div className="flex items-baseline justify-between gap-3 px-4">
          <p className="truncate text-sm font-medium text-foreground">
            Intro sting
          </p>
          <p className="shrink-0 font-mono text-xs text-ink-3 tabular-nums">
            take 3 · 120 bpm
          </p>
        </div>
        <ClipTrim
          label="Intro sting"
          duration={12}
          bpm={120}
          seed={31}
          value={span}
          onValueChange={setSpan}
          onPreviewChange={setPlaying}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {playing ? (
            <>
              <span className="text-signal">previewing</span> · {kept} s
            </>
          ) : (
            <>
              <span className="text-signal">
                keeps {clock(span.start)} – {clock(span.end)}
              </span>{" "}
              · {kept} s · space to preview
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
