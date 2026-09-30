"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { YarnKnit } from "@/registry/ui/yarn-knit";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  yarn: {
    kind: "choice",
    label: "Yarn",
    default: "wool",
    options: ["wool", "cotton", "mohair"],
    names: { wool: "Wool", cotton: "Cotton", mohair: "Mohair" },
  },
  colour: {
    kind: "choice",
    label: "Colour",
    default: "rose",
    options: ["rose", "sage", "navy"],
    names: { rose: "Rose", sage: "Sage", navy: "Navy" },
  },
});

const PAGES = 14;
const TASK = `Summarising ${PAGES} pages`;

type Summary = { read: number; rest: number };

/** One beat of the simulated summary: a page or so at a time, then a rest. */
function advance(s: Summary): Summary {
  if (s.read < 100) {
    // Uneven reading: 3 to 9 points a beat, the same run every time.
    const step = 3 + ((s.read * 29 + 5) % 7);
    const read = Math.min(100, s.read + step);
    return { read, rest: read >= 100 ? 8 : 0 };
  }
  return s.rest > 0 ? { ...s, rest: s.rest - 1 } : { read: 0, rest: 0 };
}

/**
 * Fernworks Model 3 working on a reply: the big glyph knits while the model
 * thinks, and the note under it knits a row as the summary is read.
 */
export function YarnKnitDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [summary, setSummary] = React.useState<Summary>({ read: 62, rest: 0 });
  const [pulled, setPulled] = React.useState(0);

  React.useEffect(() => {
    let timer = 0;
    const beat = () => {
      timer = window.setTimeout(beat, 320);
      if (!document.hidden) setSummary(advance);
    };
    timer = window.setTimeout(beat, 320);
    return () => window.clearTimeout(timer);
  }, []);

  const done = summary.read >= 100;

  const scene = (
    <div className="flex w-full max-w-xs flex-col gap-4 self-center">
      <YarnKnit
        size={64}
        label="Fernworks is thinking"
        onTug={() => setPulled((n) => n + 1)}
        sound={sound}
        {...values}
      />
      <div className="flex items-center gap-2 rounded-2 border border-hairline bg-card px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-foreground" title={TASK}>
          {done ? "Summary ready" : TASK}
        </span>
        <YarnKnit
          size={16}
          hideLabel
          disabled
          label={TASK}
          progress={summary.read / 100}
          {...values}
        />
        <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-3 tabular-nums">
          {summary.read}%
        </span>
      </div>
    </div>
  );

  if (!chrome) return scene;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">thinking</span>
        {done ? " · summary ready" : ` · ${PAGES} pages to read`}
        {pulled > 0
          ? ` · ${pulled} ${pulled === 1 ? "loop" : "loops"} pulled`
          : ""}
      </p>
    </div>
  );
}
