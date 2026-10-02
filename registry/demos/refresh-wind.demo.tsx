"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { RefreshWind, type RefreshWindState } from "@/registry/ui/refresh-wind";

export const tweaks = defineTweaks({
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  wind: {
    kind: "range",
    label: "Wind (turns)",
    default: 2,
    min: 1,
    max: 4,
    step: 1,
  },
  stamp: {
    kind: "choice",
    label: "Stamp",
    default: "relative",
    options: ["relative", "clock", "off"],
    names: { relative: "Relative", clock: "Clock", off: "Off" },
  },
});

/** Friday 9 October, 09:42 UTC: the demo's fixed "now", so every render agrees. */
const NOW = Date.UTC(2026, 9, 9, 9, 42);
/** The gauge's next readings, in bar: seeded, so a refresh always tells the same story. */
const READINGS = [4.79, 4.86, 4.81, 4.9, 4.77, 4.84];

const toggle = (on: boolean) =>
  cn(
    "inline-flex h-7 cursor-pointer items-center rounded-2 border px-2.5 text-xs transition-colors outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    on
      ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
      : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
  );

/**
 * A Gaugeworks pressure reading on Line 3: wind the refresh to pull a fresh
 * reading from the plant, or just press it.
 */
export function RefreshWindDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<RefreshWindState>("idle");
  const [updatedAt, setUpdatedAt] = React.useState<Date | number | null>(
    NOW - 2 * 60_000,
  );
  const [reading, setReading] = React.useState(4.82);
  const [turns, setTurns] = React.useState(0);
  const [failNext, setFailNext] = React.useState(false);
  const failArmed = React.useRef(false);
  const next = React.useRef(0);
  const fresh = updatedAt === NOW;

  /** The plant answers in about a second, or not at all when asked to fail. */
  const refresh = (signal: AbortSignal) => {
    const fail = failArmed.current;
    if (fail) {
      failArmed.current = false;
      setFailNext(false);
    }
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (fail) {
          reject(new Error("Gauge offline"));
          return;
        }
        setReading(READINGS[next.current % READINGS.length] ?? 4.82);
        next.current += 1;
        resolve();
      }, 1100);
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(new Error("Cancelled"));
        },
        { once: true },
      );
    });
  };

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="flex w-full max-w-xs flex-col gap-3 self-center rounded-3 border border-hairline bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              Line 3 pressure
            </p>
            <p className="truncate text-xs text-ink-3">
              Gaugeworks · Basin plant
            </p>
          </div>
          <p className="shrink-0 font-mono text-lg text-foreground tabular-nums">
            {reading.toFixed(2)}
            <span className="ml-1 text-xs text-ink-3">bar</span>
          </p>
        </div>
        <RefreshWind
          size="lg"
          label="Refresh reading"
          now={NOW}
          updatedAt={updatedAt}
          onUpdatedAtChange={(at) => setUpdatedAt(at.getTime())}
          onStateChange={(s) => {
            setPhase(s);
            if (s !== "pending") setTurns(0);
          }}
          onWind={setTurns}
          onRefresh={refresh}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "pending" ? (
              <>
                <span className="text-signal">refreshing</span>
                {turns > 0
                  ? ` · ${turns.toFixed(1)} turn${turns === 1 ? "" : "s"} of spring`
                  : " · one turn"}
              </>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">refresh failed</span> · press to
                retry
              </>
            ) : fresh ? (
              <>
                <span className="text-signal">fresh</span> ·{" "}
                {reading.toFixed(2)} bar
              </>
            ) : (
              <>
                <span className="text-signal">updated 2 min ago</span> · drag
                around to wind
              </>
            )}
          </p>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              failArmed.current = !failNext;
              setFailNext(!failNext);
            }}
            className={toggle(failNext)}
          >
            Fail next
          </button>
        </div>
      ) : null}
    </div>
  );
}
