"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSpendRecipients,
  defaultSpendThresholds,
  SpendGuard,
  type SpendThreshold,
} from "@/registry/ui/spend-guard";

export const tweaks = defineTweaks({
  markerStyle: {
    kind: "choice",
    label: "Marker",
    default: "pin",
    options: ["pin", "flag", "tick"],
    names: { pin: "Pin", flag: "Flag", tick: "Tick" },
  },
  barHeight: {
    kind: "range",
    label: "Bar",
    default: 20,
    min: 12,
    max: 36,
    step: 4,
    unit: "px",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "ember", "moss", "mono"],
    names: { cobalt: "Cobalt", ember: "Ember", moss: "Moss", mono: "Mono" },
  },
});

const LIMIT = 6250;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/**
 * The Waylight project's billing settings in mid-October: three alerts on a
 * $5,000 budget and a hard limit a quarter over it. Saving takes a moment,
 * as a real request would.
 */
export function SpendGuardDemo({
  chrome = true,
  // The panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [thresholds, setThresholds] = React.useState<SpendThreshold[]>(
    defaultSpendThresholds,
  );
  const [limit, setLimit] = React.useState<number | null>(LIMIT);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  const panel = (
    <SpendGuard
      key={run}
      thresholds={thresholds}
      onThresholdChange={(next, id) => {
        setThresholds(next);
        const t = next.find((x) => x.id === id);
        setNote(
          t
            ? `${t.percent}% alert · ${people(t.recipients.length)}`
            : `${next.length} ${next.length === 1 ? "alert" : "alerts"}`,
        );
      }}
      onRecipientsChange={(id, ids) => {
        const t = thresholds.find((x) => x.id === id);
        const last = ids[ids.length - 1];
        const who = defaultSpendRecipients.find((p) => p.id === last)?.name;
        setNote(
          `${t ? `${t.percent}% alert` : "alert"} · ${people(ids.length)}${who ? ` · ${who.split(" ")[0]?.toLowerCase()}` : ""}`,
        );
      }}
      hardLimit={limit}
      onHardLimitChange={(v) => {
        setLimit(v);
        setNote(v === null ? "hard limit off" : `hard limit · ${usd(v)}`);
      }}
      onSave={(config) =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            setNote(
              `saved · ${config.thresholds.length} alerts · ${config.hardLimit === null ? "no hard limit" : `hard limit ${usd(config.hardLimit)}`}`,
            );
            resolve();
          }, 700);
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{panel}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {panel}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setThresholds(defaultSpendThresholds);
            setLimit(LIMIT);
            setNote(null);
            setRun((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">
              {thresholds.length} {thresholds.length === 1 ? "alert" : "alerts"}
            </span>{" "}
            · budget $5,000 ·{" "}
            {limit === null ? "no hard limit" : `stops at ${usd(limit)}`}
          </>
        )}
      </p>
    </div>
  );
}
