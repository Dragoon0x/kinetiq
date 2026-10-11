"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultWordWindowLinks,
  defaultWordWindowText,
  WordWindow,
} from "@/registry/ui/word-window";

export const tweaks = defineTweaks({
  expandDelay: {
    kind: "range",
    label: "Delay",
    default: 450,
    min: 100,
    max: 1200,
    step: 50,
    unit: "ms",
  },
  cardSize: {
    kind: "range",
    label: "Card",
    default: 200,
    min: 140,
    max: 260,
    step: 10,
    unit: "px",
  },
  maskTone: {
    kind: "choice",
    label: "Tone",
    default: "natural",
    options: ["natural", "duotone", "mono", "deep"],
    names: {
      natural: "Natural",
      duotone: "Duotone",
      mono: "Mono",
      deep: "Deep",
    },
  },
});

/**
 * Fernworks Quarterly, the autumn issue: the contents line, with a picture
 * in each of its three places.
 */
export function WordWindowDemo({
  chrome = true,
  // The words are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const link = open === null ? null : defaultWordWindowLinks[open];

  const paragraph = (
    <div className="h-full w-full">
      <WordWindow
        text={defaultWordWindowText}
        links={defaultWordWindowLinks}
        value={open}
        onValueChange={setOpen}
        className="h-full w-full"
        {...values}
      />
    </div>
  );

  const type = {
    fontSize: "clamp(1rem, 3.4cqw, 1.625rem)",
    lineHeight: 1.45,
  } as const;

  if (!chrome) {
    return (
      <div
        className="@container w-full tracking-tight text-pretty text-foreground"
        style={{ height: 208 }}
      >
        <div className="h-full w-full" style={type}>
          {paragraph}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks Quarterly · autumn issue
      </p>
      <div
        className="@container w-full tracking-tight text-pretty text-foreground"
        style={{ height: 220 }}
      >
        <div className="h-full w-full" style={type}>
          {paragraph}
        </div>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {link ? (
          <>
            <span className="text-signal">card open</span> ·{" "}
            {link.caption ?? link.alt}
          </>
        ) : (
          <>
            <span className="text-signal">reading</span> · rest on a word to
            open it
          </>
        )}
      </p>
    </div>
  );
}
