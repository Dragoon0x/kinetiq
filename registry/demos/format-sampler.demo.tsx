"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultFormatValue,
  FormatSampler,
  type FormatStatus,
  type FormatValue,
} from "@/registry/ui/format-sampler";

export const tweaks = defineTweaks({
  samplerLayout: {
    kind: "choice",
    label: "Sampler",
    default: "sheet",
    options: ["sheet", "cards"],
    names: { sheet: "Sheet", cards: "Cards" },
  },
  sampleSet: {
    kind: "choice",
    label: "Samples",
    default: "everyday",
    options: ["everyday", "finance", "engineering"],
    names: {
      everyday: "Everyday",
      finance: "Finance",
      engineering: "Engineering",
    },
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
 * Coldbrook's language and formats page: a Lisbon account in British
 * English, with the Nairobi and Osaka offices on the clock strip.
 */
export function FormatSamplerDemo({
  chrome = true,
  // The sampler is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<FormatValue | null>(
    defaultFormatValue,
  );
  const [status, setStatus] = React.useState<FormatStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [changes, setChanges] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

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

  if (!chrome) {
    return (
      <div className="w-full">
        <FormatSampler height={540} deviceZone="Europe/Lisbon" {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <FormatSampler
        height={540}
        value={value}
        onChange={(next) => {
          setValue(next);
          setChanges((n) => n + 1);
        }}
        status={status}
        onRetry={reload}
        deviceZone="Europe/Lisbon"
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {value
              ? `${value.locale} · ${value.zone} · ${value.hourCycle}h · ${value.currency}`
              : "device defaults"}
          </span>{" "}
          · {changes} {changes === 1 ? "change" : "changes"}
          {status !== "ready" ? ` · ${status}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-hairline-strong aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(defaultFormatValue);
              setChanges(0);
              setStatus("ready");
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
