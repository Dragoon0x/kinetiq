"use client";

import * as React from "react";

import {
  ErrorPin,
  type ErrorPinHandle,
  type PinLevel,
  type PinLine,
} from "@/registry/ui/error-pin";

type Row = [at: string, level: PinLevel, message: string];

/** Fernwork gate-relay under load — a seeded script the buttons replay. */
const SCRIPT: Row[] = [
  ["09:41:02", "info", "gate-relay listening, 7 workers"],
  ["09:41:03", "info", "hold 4471 accepted"],
  ["09:41:04", "warn", "queue depth 40, shedding reads"],
  ["09:41:05", "info", "hold 4472 accepted"],
  ["09:41:06", "error", "hold 4473 rejected, ledger closed"],
  ["09:41:07", "info", "hold 4474 accepted"],
  ["09:41:08", "info", "worker 3 recycled"],
  ["09:41:09", "warn", "queue depth 61"],
  ["09:41:10", "info", "hold 4475 accepted"],
  ["09:41:12", "error", "hold 4476 rejected, ledger closed"],
  ["09:41:13", "info", "worker 5 recycled"],
  ["09:41:14", "info", "hold 4477 accepted"],
  ["09:41:15", "error", "upstream timeout after 2.0 s"],
  ["09:41:16", "info", "retry queue drained"],
  ["09:41:17", "warn", "queue depth 12"],
  ["09:41:18", "error", "hold 4478 rejected, ledger closed"],
];

const LINES: PinLine[] = SCRIPT.map(([at, level, message], index) => ({
  id: `g${index + 1}`,
  at,
  level,
  message,
}));

const START = 13;

const chip =
  "border-hairline-strong hover:bg-accent focus-visible:outline-ring flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

export function ErrorPinDemo() {
  const pins = React.useRef<ErrorPinHandle | null>(null);
  const [shown, setShown] = React.useState(START);
  const [active, setActive] = React.useState<string | null>(null);
  const [at, setAt] = React.useState<number | null>(null);

  const lines = LINES.slice(0, shown);
  const errors = lines.filter((line) => line.level === "error");
  const landed = lines.find((line) => line.id === active) ?? null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ErrorPin
        ref={pins}
        label="gate-relay"
        lines={lines}
        activeId={active}
        onActiveChange={setActive}
        onJump={(_id, index) => setAt(index)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={shown >= LINES.length}
          onClick={() => setShown((n) => Math.min(LINES.length, n + 1))}
        >
          Emit line
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => pins.current?.jumpToNextError()}
        >
          Next error
        </button>
        <button
          type="button"
          className={chip}
          disabled={shown === START && active === null}
          onClick={() => {
            setShown(START);
            setActive(null);
            setAt(null);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {errors.length} {errors.length === 1 ? "error" : "errors"}
        </span>{" "}
        ·{" "}
        {landed && at !== null
          ? `pin ${at + 1} of ${errors.length} · ${landed.at} ${landed.message}`
          : "no pin pressed yet"}
      </p>
    </div>
  );
}
