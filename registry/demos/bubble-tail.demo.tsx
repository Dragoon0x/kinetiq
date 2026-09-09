"use client";

import * as React from "react";

import { BubbleTail, type TailMessage } from "@/registry/ui/bubble-tail";

/** Basinworks, a delivery slot settled in runs, as author|at|text. */
const LINES = [
  "Marta|09:10|Slot's yours if you want it.",
  "Marta|09:10|Tuesday, first thing.",
  "Marta|09:11|Rui can cover the desk while you're at Basinworks.",
  "Ines|09:13|Taking it. Thanks.",
  "Ines|09:13|I'll bring the seal back with me.",
  "Marta|09:15|Good. See you Tuesday.",
];

const SCRIPT: TailMessage[] = LINES.map((line, index) => {
  const [author = "", at = "", text = ""] = line.split("|");
  return { id: `m${index + 1}`, author, at, text, mine: author === "Ines" };
});

const HISTORY = 2;

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function BubbleTailDemo() {
  const [count, setCount] = React.useState(HISTORY);

  const shown = SCRIPT.slice(0, count);
  const latest = shown[shown.length - 1];
  let run = 0;
  for (let index = shown.length - 1; index >= 0; index -= 1) {
    if (shown[index]?.author !== latest?.author) break;
    run += 1;
  }
  const tail =
    run > 1
      ? `· tail ${count > HISTORY ? "handed to" : "on"} ${count}`
      : "· new run";
  const line = [`${latest?.author ?? "Thread"} ·`, `run of ${run}`, tail];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BubbleTail label="Basinworks slot" messages={shown} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setCount((value) => Math.min(SCRIPT.length, value + 1))
          }
          disabled={count >= SCRIPT.length}
          className={button}
        >
          Send next
        </button>
        <button
          type="button"
          onClick={() => setCount(HISTORY)}
          disabled={count === HISTORY}
          className={button}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>{" "}
        {line[2]}
      </p>
    </div>
  );
}
