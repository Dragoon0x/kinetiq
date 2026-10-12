"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  GhostRows,
  type GhostChange,
  type GhostRow,
  type GhostStatus,
} from "@/registry/ui/ghost-rows";

export const tweaks = defineTweaks({
  ghostStyle: {
    kind: "choice",
    label: "Ghosts",
    default: "ink",
    options: ["ink", "outline", "dashed"],
    names: { ink: "Ink", outline: "Outline", dashed: "Dashed" },
  },
  ghostCount: {
    kind: "range",
    label: "Ghost rows",
    default: 3,
    min: 2,
    max: 6,
    step: 1,
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const LOAD_MS = 900;

const CHANGE_WORD: Record<GhostChange["kind"], string> = {
  create: "added",
  edit: "saved",
  delete: "removed",
  sample: "sample loaded",
  import: "imported",
};

/**
 * Coldbrook's invoices on the first morning: nothing billed yet, so the table
 * shows what an invoice will look like and offers three ways to get one in.
 */
export function GhostRowsDemo({
  chrome = true,
  // The table is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [rows, setRows] = React.useState<GhostRow[]>([]);
  const [status, setStatus] = React.useState<GhostStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setNote(fail ? "load failed" : "loaded");
    }, LOAD_MS);
  };

  const surface = (
    <GhostRows
      key={round}
      rows={rows}
      onChange={(next, change) => {
        setRows(next);
        setNote(
          `${CHANGE_WORD[change.kind]} ${change.rows.length === 1 ? (change.rows[0]?.cells.number ?? "1 invoice") : `${change.rows.length} invoices`}`,
        );
      }}
      status={status}
      onRetry={load}
      height={chrome ? 520 : 540}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={load}
          aria-disabled={status === "loading" || undefined}
          className={cn(button, "aria-disabled:opacity-50")}
        >
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next load
        </button>
        <button
          type="button"
          aria-disabled={rows.length === 0 || undefined}
          onClick={() => {
            if (rows.length === 0) return;
            setRows([]);
            setNote("cleared");
          }}
          className={cn(button, "aria-disabled:opacity-50")}
        >
          Clear rows
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            setRows([]);
            setStatus("ready");
            setFailNext(false);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ??
            (status === "ready"
              ? rows.length === 0
                ? "ghosts showing"
                : `${rows.length} invoices`
              : status)}
        </span>{" "}
        · {rows.length === 0 ? "example rows in place" : `${rows.length} real`}
        {failNext ? " · next load fails" : ""}
      </p>
    </div>
  );
}
