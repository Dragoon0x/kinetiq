"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PatternLock } from "@/registry/ui/pattern-lock";

export const tweaks = defineTweaks({
  grid: {
    kind: "choice",
    label: "Grid",
    default: "3",
    options: ["3", "4"],
    names: { "3": "3 × 3", "4": "4 × 4" },
  },
  path: { kind: "toggle", label: "Path", default: true },
  line: {
    kind: "range",
    label: "Line",
    default: 4,
    min: 2,
    max: 10,
    step: 1,
    unit: "px",
  },
  clearDelay: {
    kind: "range",
    label: "Clear delay",
    default: 800,
    min: 200,
    max: 2000,
    step: 100,
    unit: "ms",
  },
});

type Step = "first" | "confirm" | "saved";

const PROMPT: Record<Step, string> = {
  first: "Draw a pattern for Waylight Pay",
  confirm: "Draw it again to confirm",
  saved: "Pattern saved",
};

const same = (a: number[], b: number[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);

const dotsWord = (n: number) => `${n} ${n === 1 ? "dot" : "dots"}`;

/**
 * Setting an unlock pattern for Waylight Pay: draw one (it is recorded), draw
 * it again (a match locks with a ripple, anything else shakes), and it is
 * saved. Drawing after that starts over.
 */
export function PatternLockDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [step, setStep] = React.useState<Step>("first");
  const [first, setFirst] = React.useState<number[]>([]);
  const [drawn, setDrawn] = React.useState(0);
  const [misses, setMisses] = React.useState(0);
  const [grid, setGrid] = React.useState(values.grid);

  // A new grid is a new pattern: the one being confirmed no longer fits.
  if (grid !== values.grid) {
    setGrid(values.grid);
    setStep("first");
    setFirst([]);
    setMisses(0);
    setDrawn(0);
  }

  const prompt =
    step === "confirm" && misses > 0
      ? "That did not match. Draw it again"
      : PROMPT[step];

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <p className="text-center text-sm text-foreground">{prompt}</p>
      <PatternLock
        label="Waylight Pay unlock pattern"
        size={chrome ? 216 : 180}
        onValueChange={(pattern) => {
          setDrawn(pattern.length);
          if (step === "saved" && pattern.length > 0) {
            setStep("first");
            setFirst([]);
            setMisses(0);
          }
        }}
        onComplete={(pattern) => {
          if (step === "confirm") {
            if (same(pattern, first)) {
              setStep("saved");
              return true;
            }
            setMisses((m) => m + 1);
            return false;
          }
          setFirst(pattern);
          setStep("confirm");
          setMisses(0);
          return undefined;
        }}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex w-full flex-col gap-3">
          {step === "confirm" ? (
            <button
              type="button"
              onClick={() => {
                setStep("first");
                setFirst([]);
                setMisses(0);
              }}
              className="inline-flex h-8 items-center justify-center self-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Start over
            </button>
          ) : null}
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {step === "first" ? (
              <>
                <span className="text-signal">step 1 of 2</span> ·{" "}
                {dotsWord(drawn)}
              </>
            ) : step === "confirm" ? (
              misses > 0 ? (
                <>
                  <span className="text-signal">no match</span> · try{" "}
                  {misses + 1}
                </>
              ) : (
                <>
                  <span className="text-signal">step 2 of 2</span> · draw the
                  same {dotsWord(first.length)}
                </>
              )
            ) : (
              <>
                <span className="text-signal">saved</span> ·{" "}
                {dotsWord(first.length)}, {values.grid === "4" ? "4" : "3"} ×{" "}
                {values.grid === "4" ? "4" : "3"}
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
