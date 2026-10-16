"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPromptStampRows,
  PromptStamp,
  type PromptStampHandle,
  type PromptStampResults,
  type PromptStampRow,
} from "@/registry/ui/prompt-stamp";

export const tweaks = defineTweaks({
  stampSpeed: {
    kind: "range",
    label: "Stamp speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  rowHeight: {
    kind: "range",
    label: "Row height",
    default: 52,
    min: 40,
    max: 76,
    step: 6,
    unit: "px",
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

/**
 * Coldbrook's shop editor: one prompt writes the descriptions for six
 * coffees. Saltmarsh has no tasting notes yet, so its row fails with the
 * reason instead of an invented answer. The demo presses Run once, a moment
 * after the sheet is first seen.
 */
export function PromptStampDemo({
  chrome = true,
  // The sheet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [results, setResults] = React.useState<PromptStampResults>({});
  const [rows, setRows] = React.useState<PromptStampRow[]>(
    defaultPromptStampRows,
  );
  const [exported, setExported] = React.useState<number | null>(null);
  const handle = React.useRef<PromptStampHandle | null>(null);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.35 });

  // Runs once per round, after the sheet has been on screen for a beat.
  const ran = React.useRef(-1);
  React.useEffect(() => {
    if (!inView || ran.current === round) return;
    const t = window.setTimeout(() => {
      ran.current = round;
      handle.current?.run();
    }, 900);
    return () => window.clearTimeout(t);
  }, [inView, round]);

  const surface = (
    <PromptStamp
      key={round}
      ref={handle}
      onResultsChange={setResults}
      onRowsChange={setRows}
      onRun={() => setExported(null)}
      onExport={(_csv, res) =>
        setExported(
          Object.values(res).filter((r) => r.status === "done").length,
        )
      }
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const states = rows.map((r) => results[r.id]?.status ?? "idle");
  const count = (s: string) => states.filter((x) => x === s).length;
  const active = count("queued") + count("running");
  const started = count("running") + count("done") + count("failed");
  const inRun = states.length - count("idle");
  const failed = rows.find((r) => results[r.id]?.status === "failed");
  const line =
    exported !== null
      ? `exported ${exported} rows · csv`
      : active
        ? `stamping ${started} of ${inRun}`
        : inRun
          ? `${rows.length} rows · ${count("done")} done · ${count("failed")} failed${
              failed
                ? ` · ${failed.values.product?.toLowerCase() ?? failed.id}: ${(
                    results[failed.id]?.error ?? ""
                  ).toLowerCase()}`
                : ""
            }`
          : `${rows.length} rows · ready to stamp`;

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setResults({});
            setRows(defaultPromptStampRows);
            setExported(null);
            setRound((r) => r + 1);
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
        <span className="text-signal">{line}</span> · coldbrook shop
      </p>
    </div>
  );
}
