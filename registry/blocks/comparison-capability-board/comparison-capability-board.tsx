"use client";

import * as React from "react";

import { Check, Minus } from "lucide-react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type BoardColumn = {
  id: string;
  name: string;
  note: string;
  recommended?: boolean;
};

export type BoardRow = {
  capability: string;
  detail?: string;
  /** Cell per column id: true = tick, false = dash, string = printed as-is. */
  cells: Record<string, boolean | string>;
};

export type ComparisonCapabilityBoardProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  columns?: BoardColumn[];
  rows?: BoardRow[];
  className?: string;
};

const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: "notebook", name: "The notebook", note: "Where every yard starts" },
  { id: "sheets", name: "Spreadsheets", note: "Where most yards stall" },
  { id: "waylight", name: "Waylight", note: "Where mornings go quiet", recommended: true },
];

const DEFAULT_ROWS: BoardRow[] = [
  { capability: "Plans survive the morning", detail: "Changes propagate instead of forking", cells: { notebook: false, sheets: "sometimes", waylight: true } },
  { capability: "Two crews, one truth", cells: { notebook: false, sheets: false, waylight: true } },
  { capability: "History that answers audits", cells: { notebook: "if kept dry", sheets: "if disciplined", waylight: true } },
  { capability: "Works at the gate, gloves on", cells: { notebook: true, sheets: false, waylight: true } },
  { capability: "The week writes its own review", cells: { notebook: false, sheets: false, waylight: true } },
];

/**
 * A comparison set as a capability board: capabilities down the side, the
 * honest alternatives across the top — including the notebook, which wins a
 * row, because a board that never concedes anything reads as advertising.
 * Ticks are drawn, dashes are quiet, and prose cells say the true middle
 * thing. The recommended column is sealed and tinted, never reordered.
 */
export function ComparisonCapabilityBoard({
  eyebrow = "Waylight · the honest board",
  headline = "Against the notebook and the sheet.",
  copy = "The real competition is the way the yard already works. Here is where each holds up.",
  columns = DEFAULT_COLUMNS,
  rows = DEFAULT_ROWS,
  className,
}: ComparisonCapabilityBoardProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        {/* Wide boards scroll inside their own frame, never the page. The
            frame is positioned so the sr-only cell labels — absolutely
            positioned by their utility — contain here and stay clipped,
            instead of escaping to the section and dragging the page wide. */}
        <div className="border-hairline rounded-4 relative mt-10 overflow-x-auto border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-hairline border-b">
                <th scope="col" className="text-label text-ink-3 px-4 py-4 text-left">
                  CAPABILITY
                </th>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn(
                      "px-4 py-4 text-left align-top",
                      column.recommended && "bg-surface-1",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-ink font-semibold">{column.name}</span>
                      {column.recommended && (
                        <StatusSeal variant="info" className="text-[10px]">
                          recommended
                        </StatusSeal>
                      )}
                    </span>
                    <span className="text-ink-3 mt-1 block text-xs font-normal">
                      {column.note}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.capability} className="border-hairline border-b last:border-b-0">
                  <th scope="row" className="px-4 py-3.5 text-left font-normal">
                    <span className="text-ink font-medium">{row.capability}</span>
                    {row.detail && (
                      <span className="text-ink-3 mt-0.5 block text-xs">
                        {row.detail}
                      </span>
                    )}
                  </th>
                  {columns.map((column) => {
                    const cell = row.cells[column.id];
                    return (
                      <td
                        key={column.id}
                        className={cn("px-4 py-3.5", column.recommended && "bg-surface-1")}
                      >
                        {cell === true ? (
                          <>
                            <Check
                              className="text-[var(--success,var(--primary))] size-4"
                              aria-hidden
                            />
                            <span className="sr-only">Yes</span>
                          </>
                        ) : cell === false || cell === undefined ? (
                          <>
                            <Minus className="text-ink-3 size-4" aria-hidden />
                            <span className="sr-only">No</span>
                          </>
                        ) : (
                          <span className="text-ink-3 text-xs">{cell}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
