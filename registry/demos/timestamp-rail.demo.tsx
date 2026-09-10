"use client";

import * as React from "react";

import {
  TimestampRail,
  type RailLevel,
  type RailLine,
  type RailMode,
  type TimestampRailHandle,
} from "@/registry/ui/timestamp-rail";

type Row = [at: number, clock: string, level: RailLevel, message: string];

/** Waylight Pay settle-runner, batch 118 — every time is seeded, none is read. */
const SCRIPT: Row[] = [
  [0, "09:41:02", "info", "settle-runner woke, batch 118"],
  [120, "09:41:02", "info", "ledger-api reachable"],
  [410, "09:41:02", "info", "12 holds queued"],
  [980, "09:41:02", "info", "hold 4471 claimed"],
  [1240, "09:41:03", "info", "hold 4472 claimed"],
  [1600, "09:41:03", "warn", "gate-relay queue depth 40"],
  [8000, "09:41:10", "info", "gate-relay answered"],
  [8300, "09:41:10", "info", "hold 4471 settled"],
  [8700, "09:41:10", "info", "hold 4472 settled"],
  [9100, "09:41:11", "info", "hold 4473 settled"],
  [9600, "09:41:11", "error", "hold 4474 rejected, ledger closed"],
  [10100, "09:41:12", "info", "hold 4475 settled"],
  [10500, "09:41:12", "info", "batch 118 drained"],
  [22600, "09:41:24", "info", "sweep timer fired"],
  [23000, "09:41:25", "info", "sweep opened, 3 stragglers"],
  [23500, "09:41:25", "warn", "hold 4474 still open"],
  [27400, "09:41:29", "info", "hold 4474 retried"],
  [27900, "09:41:29", "info", "settle-runner idle"],
];

const LINES: RailLine[] = SCRIPT.map(([at, clock, level, message], index) => ({
  id: `r${index + 1}`,
  at,
  clock,
  level,
  message,
}));

const chip =
  "border-hairline-strong hover:bg-accent focus-visible:outline-ring flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2";

const seconds = (ms: number) => (ms / 1000).toFixed(1);

export function TimestampRailDemo() {
  const rail = React.useRef<TimestampRailHandle | null>(null);
  const [mode, setMode] = React.useState<RailMode>("clock");
  const [threshold, setThreshold] = React.useState(1000);
  const [landed, setLanded] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<number | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TimestampRail
        ref={rail}
        label="settle-runner"
        lines={LINES}
        mode={mode}
        onModeChange={setMode}
        gapMs={threshold}
        onJump={(id) =>
          setLanded(LINES.find((line) => line.id === id)?.clock ?? null)
        }
        onGapFocus={setHovered}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => rail.current?.jumpToLongestGap()}
        >
          Jump to longest gap
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => setThreshold((ms) => (ms === 1000 ? 5000 : 1000))}
        >
          Gaps over {seconds(threshold)} s
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {mode} ·{" "}
        <span className="text-signal">over {seconds(threshold)} s</span> ·{" "}
        {landed ? `landed at ${landed}` : "no jump yet"}
        {hovered !== null ? ` · gap ${seconds(hovered)} s` : ""}
      </p>
    </div>
  );
}
