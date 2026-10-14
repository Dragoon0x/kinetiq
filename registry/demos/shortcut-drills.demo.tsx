"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultDrillSets,
  ShortcutDrills,
  type DrillStatus,
  type DrillSummary,
} from "@/registry/ui/shortcut-drills";

export const tweaks = defineTweaks({
  capStyle: {
    kind: "choice",
    label: "Keycaps",
    default: "raised",
    options: ["raised", "flat"],
    names: { raised: "Raised", flat: "Flat" },
  },
  platform: {
    kind: "choice",
    label: "Glyphs",
    default: "mac",
    options: ["mac", "windows"],
    names: { mac: "Mac", windows: "Windows" },
  },
  defaultHints: {
    kind: "toggle",
    label: "Hints",
    default: false,
  },
});

/**
 * Gaugeworks Studio's onboarding drill: three sets of shortcuts to press
 * from memory, with the slow ones queued for another round.
 */
export function ShortcutDrillsDemo({
  chrome = true,
  // The drill is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<DrillStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [setId, setSetId] = React.useState(defaultDrillSets[0]?.id ?? "");
  const [answered, setAnswered] = React.useState(0);
  const [last, setLast] = React.useState<DrillSummary | null>(null);
  const [epoch, setEpoch] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = (fail: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      if (!fail) setEpoch((n) => n + 1);
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <ShortcutDrills
          key={String(values.defaultHints ?? false)}
          height={540}
          {...values}
        />
      </div>
    );
  }

  const set = defaultDrillSets.find((s) => s.id === setId);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ShortcutDrills
        // Reload and the hint default both start a fresh drill.
        key={`${epoch}-${String(values.defaultHints ?? false)}`}
        height={540}
        status={status}
        value={setId}
        onChange={setSetId}
        onAnswer={() => setAnswered((n) => n + 1)}
        onComplete={(_results, summary) => setLast(summary)}
        onRetry={() => {
          setFailNext(false);
          load(false);
        }}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {set?.label ?? "set"} · {answered} answered
          </span>{" "}
          ·{" "}
          {last
            ? `last round ${last.firstTry}/${last.total} first try, ${last.slow} slow`
            : "no round finished yet"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const fail = failNext;
              setFailNext(false);
              load(fail);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next load
          </button>
        </div>
      </div>
    </div>
  );
}
