"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultMixedValuesRecords,
  MixedValues,
  type MixedValuesChanges,
} from "@/registry/ui/mixed-values";

export const tweaks = defineTweaks({
  chipStyle: {
    kind: "choice",
    label: "Chips",
    default: "stack",
    options: ["stack", "bar", "inline"],
    names: { stack: "Stack", bar: "Bar", inline: "Inline" },
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
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** Two bags refuse the first time round, with the reasons a shop would see. */
const REFUSALS: Record<string, string> = {
  "cb-08": "Locked by an open order",
  "cb-04": "Below cost price",
};

/**
 * Coldbrook's shop manager editing fourteen retail bags at once. Apply
 * reports each bag after a short seeded wait; two refuse on the first run
 * and go through on Retry failed.
 */
export function MixedValuesDemo({
  chrome = true,
  // The editor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [changes, setChanges] = React.useState<MixedValuesChanges>({});
  const [selected, setSelected] = React.useState(() =>
    defaultMixedValuesRecords.map((r) => r.id),
  );
  const [event, setEvent] = React.useState<string | null>(null);
  const tries = React.useRef(0);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    tries.current = 0;
    setChanges({});
    setSelected(defaultMixedValuesRecords.map((r) => r.id));
    setEvent(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <MixedValues
      key={round}
      selected={selected}
      onSelectedChange={setSelected}
      onChange={(c) => {
        setChanges(c);
        setEvent(null);
      }}
      onCancel={() => setEvent("changes dropped")}
      onApply={(_changes, ids, report) =>
        new Promise<void>((resolve) => {
          tries.current += 1;
          const first = tries.current === 1;
          let failed = 0;
          ids.forEach((id, i) => {
            later(
              () => {
                const reason = first ? REFUSALS[id] : undefined;
                if (reason) failed += 1;
                report(id, !reason, reason);
                setEvent(`applying · ${i + 1} of ${ids.length}`);
                if (i === ids.length - 1) {
                  later(() => {
                    setEvent(
                      failed
                        ? `${ids.length - failed} updated · ${failed} failed`
                        : `${ids.length} updated`,
                    );
                    resolve();
                  }, 160);
                }
              },
              180 + i * 130 + ((i * 37) % 60),
            );
          });
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const n = Object.keys(changes).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {event ??
            (n === 0 ? "no changes" : `${n} ${n === 1 ? "change" : "changes"}`)}
        </span>{" "}
        · {selected.length} of {defaultMixedValuesRecords.length} products
        selected
      </p>
    </div>
  );
}
