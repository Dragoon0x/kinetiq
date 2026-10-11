"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HandSet } from "@/registry/ui/hand-set";

export const tweaks = defineTweaks({
  pace: {
    kind: "range",
    label: "Pace",
    default: 170,
    min: 60,
    max: 420,
    step: 20,
    unit: "ms",
  },
  justify: {
    kind: "choice",
    label: "Justify",
    default: "full",
    options: ["full", "left", "center"],
    names: { full: "Full", left: "Ragged", center: "Centred" },
  },
  measure: {
    kind: "range",
    label: "Measure",
    default: 46,
    min: 24,
    max: 64,
    step: 2,
    unit: "ch",
  },
});

const NOTE =
  "Every line in this issue was set by hand. A word goes into the stick, the spacing opens to take it, and when the line is full it is locked up and the next one begins. Slow work, but you can feel it in the reading.";

/**
 * Waylight's editor's note for the winter issue, set word by word the way
 * the first bulletins were.
 */
export function HandSetDemo({
  chrome = true,
  // The stick is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [locked, setLocked] = React.useState({ line: 0, lines: 0 });
  const [done, setDone] = React.useState(false);

  const paragraph = (
    <HandSet
      key={round}
      text={NOTE}
      onLineSet={(line, lines) => setLocked({ line: line + 1, lines })}
      onComplete={() => setDone(true)}
      className={
        chrome
          ? "text-sm leading-relaxed text-foreground"
          : "text-[13px] leading-relaxed text-foreground"
      }
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{paragraph}</div>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight · editor&apos;s note
      </p>
      {paragraph}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-3">Winter issue, set in the stick.</p>
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setLocked({ line: 0, lines: 0 });
            setDone(false);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Set again
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {done ? (
          <>
            <span className="text-signal">set</span> · {locked.lines}{" "}
            {locked.lines === 1 ? "line" : "lines"} locked
          </>
        ) : locked.line > 0 ? (
          <>
            <span className="text-signal">
              setting line {locked.line + 1} of {locked.lines}
            </span>{" "}
            · {locked.line} locked
          </>
        ) : (
          <>
            <span className="text-signal">in the stick</span> · line 1
          </>
        )}
      </p>
    </div>
  );
}
