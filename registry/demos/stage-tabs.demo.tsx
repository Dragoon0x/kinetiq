"use client";

import { StageTabs, type StageTab } from "@/registry/ui/stage-tabs";
import { cn } from "@/registry/lib/utils";

/** Fixed bench-report copy — stats, trace lines, and notes never change. */
const SUMMARY_ROWS = [
  { label: "Throughput", value: "412 u/min" },
  { label: "Stage Drift", value: "+0.04°" },
] as const;

const TRACE_LINES = [
  { at: "09:41:02", msg: "STAGE ARMED" },
  { at: "09:41:07", msg: "REVOLVE CW 28 DEG" },
  { at: "09:41:11", msg: "PANEL LOCK OK" },
  { at: "09:41:15", msg: "FLOOR SETTLE 0.94X" },
] as const;

const NOTES = [
  "Bearing runs quiet after the re-grease at hour forty.",
  "Keep the wings clear - panels sweep well past the frame.",
] as const;

/** SUMMARY sheet — two stat rows off the bench log. */
function SummarySheet() {
  return (
    <dl className="flex flex-col gap-3">
      {SUMMARY_ROWS.map((row, i) => (
        <div
          key={row.label}
          className={cn(
            "flex items-baseline justify-between gap-4",
            i > 0 && "border-t border-hairline pt-3",
          )}
        >
          <dt className="text-label text-ink-3">{row.label}</dt>
          <dd className="font-mono text-sm text-ink tabular-nums">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** TRACE sheet — four fixed lines of mono log. */
function TraceSheet() {
  return (
    <div className="flex flex-col gap-1.5 font-mono text-[11px] leading-relaxed">
      {TRACE_LINES.map((line) => (
        <p key={line.at} className="flex items-baseline gap-3">
          <span className="shrink-0 text-ink-3 tabular-nums">{line.at}</span>
          <span className="text-ink-2">{line.msg}</span>
        </p>
      ))}
    </div>
  );
}

/** NOTES sheet — two short service remarks. */
function NotesSheet() {
  return (
    <div className="flex flex-col gap-2">
      {NOTES.map((note) => (
        <p key={note} className="text-sm text-ink-2">
          {note}
        </p>
      ))}
    </div>
  );
}

const TABS: StageTab[] = [
  { id: "summary", label: "Summary", content: <SummarySheet /> },
  { id: "trace", label: "Trace", content: <TraceSheet /> },
  { id: "notes", label: "Notes", content: <NotesSheet /> },
];

/**
 * StageTabs as a bench instrument: the KQ-114 report viewer, three sheets on
 * a revolving stage inside a bezel plate with corner ticks. Later sheets
 * sweep the stage leftward, earlier ones rightward; the tab semantics carry
 * the announcements, so no extra status line is needed.
 */
export function StageTabsDemo() {
  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-0 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Bench Report &middot; 3 Sheets
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-114</span>
        </div>

        <StageTabs
          tabs={TABS}
          defaultValue="summary"
          aria-label="Bench report"
        />

        <p className="mt-3 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-114 &middot; Stage Tabs &middot; Revolve 28&deg; &middot; P 800
          &middot; &zeta; 0.98
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Switch tabs - the stage revolves the next panel in.
      </p>
    </div>
  );
}
