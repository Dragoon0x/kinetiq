"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSamplerLocales,
  defaultSamplerZones,
  FormatSampler,
} from "@/registry/ui/format-sampler";

export const tweaks = defineTweaks({
  sampleStyle: {
    kind: "choice",
    label: "Sample",
    default: "card",
    options: ["card", "line", "receipt"],
    names: { card: "Card", line: "Line", receipt: "Receipt" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

const FIELD: Record<string, string> = {
  locale: "language",
  timeZone: "time zone",
  date: "dates",
  time: "time",
  number: "numbers",
  weekStart: "week start",
};

const readable = (field: string, value: string) =>
  field === "locale"
    ? (defaultSamplerLocales.find((l) => l.id === value)?.name ?? value)
    : field === "timeZone"
      ? (defaultSamplerZones.find((z) => z.id === value)?.label ?? value)
      : value;

/**
 * Coldbrook's billing settings. The visitor's browser is taken to read
 * English (United Kingdom), so the one-click suggestion shows; "Fail next save"
 * makes Save reject so the kept choices can be seen.
 */
export function FormatSamplerDemo({
  chrome = true,
  // Formats are read, not heard.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [failNext, setFailNext] = React.useState(false);
  const [line, setLine] = React.useState<{ lead: string; rest: string }>({
    lead: "english (united states)",
    rest: "eastern time · change a setting",
  });
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const sampler = (
    <FormatSampler
      detectedLocale="en-GB"
      onChange={(field, value) =>
        setLine({
          lead: FIELD[field] ?? field,
          rest: readable(field, value).toLowerCase(),
        })
      }
      onSave={(settings) =>
        new Promise<void>((resolve, reject) => {
          const fail = failNext;
          setFailNext(false);
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            timer.current = null;
            if (fail) {
              setLine({ lead: "not saved", rest: "choices kept" });
              reject(new Error("offline"));
            } else {
              setLine({
                lead: "saved",
                rest: `${settings.locale.toLowerCase()} · ${readable("timeZone", settings.timeZone).toLowerCase()}`,
              });
              resolve();
            }
          }, 800);
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{sampler}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {sampler}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next save
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line.lead}</span> · {line.rest}
      </p>
    </div>
  );
}
