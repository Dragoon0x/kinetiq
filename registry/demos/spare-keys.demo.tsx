"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSpareKeys,
  defaultSpareUsed,
  SpareKeys,
  type SpareKey,
  type SpareKeysStatus,
} from "@/registry/ui/spare-keys";

export const tweaks = defineTweaks({
  coverStyle: {
    kind: "choice",
    label: "Cover",
    default: "slide",
    options: ["slide", "blur", "none"],
    names: { slide: "Slide", blur: "Blur", none: "None" },
  },
  grouping: {
    kind: "choice",
    label: "Codes",
    default: "pairs",
    options: ["pairs", "whole"],
    names: { pairs: "Pairs", whole: "Whole" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Mara Lind's Coldbrook recovery codes, one already spent: lift the cover,
 * copy or save them, burn through codes with Use one until the ring runs low,
 * then regenerate the set.
 */
export function SpareKeysDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [codes, setCodes] = React.useState<SpareKey[]>(defaultSpareKeys);
  const [used, setUsed] = React.useState<string[]>(defaultSpareUsed);
  const [status, setStatus] = React.useState<SpareKeysStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [doneAt, setDoneAt] = React.useState<number | null>(null);
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
        <SpareKeys height={540} {...values} />
      </div>
    );
  }

  const remaining = codes.filter((k) => !used.includes(k.id)).length;
  const next = codes.find((k) => !used.includes(k.id));

  const useOne = () => {
    if (!next || status !== "ready") return;
    setUsed((u) => [...u, next.id]);
  };

  const reload = (fail: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const reset = () => {
    setCodes(defaultSpareKeys);
    setUsed(defaultSpareUsed);
    setDoneAt(null);
    setEpoch((e) => e + 1);
    reload(failNext);
    setFailNext(false);
  };

  const button =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <SpareKeys
        key={epoch}
        height={560}
        codes={codes}
        onCodesChange={setCodes}
        used={used}
        onChange={setUsed}
        onDone={({ remaining: left }) => setDoneAt(left)}
        status={status}
        onRetry={() => reload(false)}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {remaining} of {codes.length} left · {used.length} used
          </span>{" "}
          ·{" "}
          {status === "loading"
            ? "generating"
            : status === "error"
              ? "failed"
              : doneAt !== null
                ? `done with ${doneAt} left`
                : "on the ring"}
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={useOne}
            aria-disabled={!next || status !== "ready" || undefined}
            className={button}
          >
            Use one
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={button}
          >
            Fail next load
          </button>
          <button type="button" onClick={reset} className={button}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
