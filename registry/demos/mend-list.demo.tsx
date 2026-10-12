"use client";

import * as React from "react";

import { Bug, RefreshCw, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countMendProblems,
  defaultMendSections,
  defaultMendValidators,
  defaultMendValue,
  MendList,
  type MendStatus,
  type MendValue,
} from "@/registry/ui/mend-list";

export const tweaks = defineTweaks({
  summaryPosition: {
    kind: "choice",
    label: "Summary",
    default: "top",
    options: ["top", "side"],
    names: { top: "Top", side: "Side" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "danger",
    options: ["danger", "warn"],
    names: { danger: "Red", warn: "Amber" },
  },
});

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Coldbrook Roasters applying to Gaugeworks Pay: half the form is filled,
 * six fields will not pass, and the summary mends itself as each is fixed.
 */
export function MendListDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<MendValue>(defaultMendValue);
  const [status, setStatus] = React.useState<MendStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [submissions, setSubmissions] = React.useState(0);
  const [epoch, setEpoch] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <MendList height={540} {...values} />
      </div>
    );
  }

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setValue(defaultMendValue);
    setStatus("ready");
    setFailNext(false);
    setSubmissions(0);
    setEpoch((e) => e + 1);
  };

  const open = countMendProblems(
    defaultMendSections,
    value,
    defaultMendValidators,
  ).length;
  const total = defaultMendSections.reduce((n, s) => n + s.fields.length, 0);
  const filled = defaultMendSections.reduce(
    (n, s) =>
      n + s.fields.filter((f) => (value[f.id] ?? "").trim() !== "").length,
    0,
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <MendList
        key={epoch}
        height={540}
        value={value}
        onChange={setValue}
        status={status}
        onRetry={reload}
        onSubmit={(next) =>
          new Promise((resolve) => {
            window.setTimeout(() => {
              setSubmissions((n) => n + 1);
              resolve({
                reference: `GP-${String(41200 + Object.keys(next).length)}`,
              });
            }, 900);
          })
        }
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {open} {open === 1 ? "problem" : "problems"} open
          </span>{" "}
          · {filled} of {total} filled · {submissions} submitted
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reload} className={BUTTON}>
            <RefreshCw aria-hidden className="size-3.5" />
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={BUTTON}
          >
            <Bug aria-hidden className="size-3.5" />
            {failNext ? "Next load fails" : "Fail next load"}
          </button>
          <button type="button" onClick={reset} className={BUTTON}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
