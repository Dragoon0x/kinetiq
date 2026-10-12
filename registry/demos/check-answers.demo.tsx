"use client";

import * as React from "react";

import { CloudOff, RefreshCw, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CheckAnswers,
  checkIssues,
  defaultCheckAnswers,
  defaultCheckSections,
  type CheckStatus,
  type CheckValue,
} from "@/registry/ui/check-answers";

export const tweaks = defineTweaks({
  layout: {
    kind: "choice",
    label: "Layout",
    default: "table",
    options: ["table", "cards"],
    names: { table: "Table", cards: "Cards" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Coldbrook Civils' street-works permit on Fieldline, read back before it
 * goes in: the email is missing its domain and the duration is blank, so
 * Submit waits until both are fixed and the declaration is on.
 */
export function CheckAnswersDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<CheckValue>(defaultCheckAnswers);
  const [status, setStatus] = React.useState<CheckStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [submitted, setSubmitted] = React.useState<string | null>(null);
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
        <CheckAnswers height={540} {...values} />
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
    setValue(defaultCheckAnswers);
    setSubmitted(null);
    setStatus("ready");
    setFailNext(false);
    setEpoch((e) => e + 1);
  };

  const issues = checkIssues(defaultCheckSections, value).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <CheckAnswers
        key={epoch}
        height={560}
        value={value}
        onChange={setValue}
        onSubmit={(_, reference) => setSubmitted(reference)}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {submitted
              ? `submitted ${submitted}`
              : issues === 0
                ? "no issues"
                : `${issues} ${issues === 1 ? "issue" : "issues"}`}
          </span>{" "}
          · {status}
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reload} className={BUTTON}>
            <RefreshCw aria-hidden className="size-3.5" />
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className={BUTTON}
          >
            <CloudOff aria-hidden className="size-3.5" />
            Fail next load
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
