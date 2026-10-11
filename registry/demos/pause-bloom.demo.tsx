"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PauseBloom } from "@/registry/ui/pause-bloom";

export const tweaks = defineTweaks({
  palette: {
    kind: "choice",
    label: "Palette",
    default: "garden",
    options: ["garden", "harbour", "ember", "ink"],
    names: { garden: "Garden", harbour: "Harbour", ember: "Ember", ink: "Ink" },
  },
  bloomSize: {
    kind: "range",
    label: "Bloom",
    default: 72,
    min: 24,
    max: 160,
    step: 8,
    unit: "px",
  },
  dryTime: {
    kind: "range",
    label: "Dry time",
    default: 12,
    min: 2,
    max: 40,
    step: 2,
    unit: "s",
  },
});

/** The pigments each palette steps through, in the order the drops take them. */
const PIGMENTS: Record<string, string[]> = {
  garden: ["sap green", "rose madder", "gamboge", "ultramarine"],
  harbour: ["ultramarine", "viridian", "cerulean", "slate"],
  ember: ["vermilion", "quinacridone gold", "rose", "burnt sienna"],
  ink: ["indigo", "sepia", "lamp black"],
};

/** The paper starts with this many dried blooms, so the first drop takes the next pigment. */
const FIRST = 3;

type Story =
  | { kind: "idle" }
  | { kind: "bloom"; count: number; pigment: number }
  | { kind: "clean" };

/**
 * Fernworks Paper Co.: a sheet of their cold-pressed watercolour paper as the
 * hero of the product card, wet and waiting for a brush that only paints
 * when it stops.
 */
export function PauseBloomDemo({
  chrome = true,
  // The paper is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({ kind: "idle" });
  const [blot, setBlot] = React.useState(0);
  const names = PIGMENTS[values.palette ?? "garden"] ?? PIGMENTS.garden ?? [];
  const nameOf = (i: number) => names[i % Math.max(1, names.length)] ?? "";

  const paper = (
    <PauseBloom
      label="Fernworks cold-pressed paper"
      clearKey={blot}
      defaultBlooms={FIRST}
      onBloom={(count, pigment) => setStory({ kind: "bloom", count, pigment })}
      onClean={() => setStory({ kind: "clean" })}
      className="h-52 w-full rounded-3 border border-hairline"
      {...values}
    >
      <div className="@container flex size-full flex-col justify-end p-5">
        {chrome ? null : (
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Fernworks · Cold-pressed, 300 gsm
          </p>
        )}
        <p
          className="mt-1 max-w-[18ch] font-semibold tracking-tight text-balance text-foreground"
          style={{
            fontSize: "clamp(1.375rem, 6.5cqw, 2.5rem)",
            lineHeight: 1.08,
          }}
        >
          Pause, and let it bloom.
        </p>
      </div>
    </PauseBloom>
  );

  if (!chrome) return <div className="flex w-full">{paper}</div>;

  const next =
    story.kind === "bloom"
      ? story.pigment + 1
      : story.kind === "idle"
        ? FIRST
        : 0;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Paper Co.
          </p>
          <p className="text-base font-medium text-foreground">
            Cold-pressed, 300 gsm, all cotton.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBlot((b) => b + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-background px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Blot the paper
        </button>
      </div>
      {paper}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "bloom" ? (
          <>
            <span className="text-signal">blooming</span> · drop {story.count},{" "}
            {nameOf(story.pigment)} · {nameOf(next)} next
          </>
        ) : story.kind === "clean" ? (
          <>
            <span className="text-signal">paper dry</span> · rest to paint
          </>
        ) : (
          <>
            <span className="text-signal">rest to paint</span> · {nameOf(next)}{" "}
            first
          </>
        )}
      </p>
    </div>
  );
}
