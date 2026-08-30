"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RedlineKind = "keep" | "remove" | "add" | "change";

export type RedlineRow = {
  id: string;
  cells: string[];
  /** What the proposal does to this row. @default "keep" */
  kind?: RedlineKind;
  /** For "change": the cells as they would become. */
  next?: string[];
};

export type RedlineTableProps = {
  /** What the sweep proposes, named at the top. */
  heading?: string;
  hint?: string;
  columns?: string[];
  rows?: RedlineRow[];
  applyLabel?: (count: number) => string;
  onApply?: (acceptedIds: string[]) => void;
  className?: string;
};

const DEFAULT_COLUMNS = ["Slot", "Crew", "Window"];

const DEFAULT_ROWS: RedlineRow[] = [
  { id: "r1", cells: ["Rig test", "Crew A", "09:00–11:00"] },
  {
    id: "r2",
    cells: ["Coating pass", "Crew A", "10:00–13:00"],
    kind: "change",
    next: ["Coating pass", "Crew B", "10:15–13:15"],
  },
  {
    id: "r3",
    cells: ["Hull sounding", "Crew C", "11:30–12:30"],
    kind: "remove",
  },
  { id: "r4", cells: ["Deck survey", "Crew C", "13:00–14:00"] },
  { id: "r5", cells: ["Crane relube", "Crew B", "15:00–16:00"], kind: "add" },
];

/**
 * An agent's proposed edits laid over the table itself: removals struck
 * through, additions tinted in, changes shown as was → would-be — and every
 * proposal is a toggle, so the reader accepts or declines row by row before
 * anything is applied. The counts under the grid are derived from what is
 * currently accepted; the apply button never claims more than the toggles
 * say. Editing data wholesale is exactly the act that deserves a per-row
 * veto.
 *
 * Reduced motion: rows print in place; toggling swaps states without travel.
 */
export function RedlineTable({
  heading = "Proposed board cleanup",
  hint = "Click a proposed row to accept or decline it",
  columns = DEFAULT_COLUMNS,
  rows = DEFAULT_ROWS,
  applyLabel = (count) =>
    `Apply ${count} ${count === 1 ? "change" : "changes"}`,
  onApply,
  className,
}: RedlineTableProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(rows.length);

  // Every proposed row starts accepted; clicking withdraws it.
  const proposed = React.useMemo(
    () => rows.filter((row) => (row.kind ?? "keep") !== "keep"),
    [rows],
  );
  const [declined, setDeclined] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [applied, setApplied] = React.useState(false);

  const accepted = proposed.filter((row) => !declined.has(row.id));
  const removals = accepted.filter((r) => r.kind === "remove").length;
  const additions = accepted.filter((r) => r.kind === "add").length;
  const changes = accepted.filter((r) => r.kind === "change").length;

  const toggle = (id: string) => {
    if (applied) return;
    setDeclined((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={cn("w-full max-w-md", className)}>
      <p className="text-sm font-medium text-ink">{heading}</p>
      <p className="mt-0.5 text-xs text-ink-3">{hint}</p>

      <div className="mt-3 overflow-hidden rounded-3 border border-hairline">
        <div
          className="grid border-b border-hairline px-3 py-2 text-label text-ink-3"
          style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
        >
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
        <ul>
          {rows.map((row, index) => {
            const kind = row.kind ?? "keep";
            const active = kind !== "keep" && !declined.has(row.id) && !applied;
            const off = kind !== "keep" && declined.has(row.id);
            return (
              <motion.li
                key={row.id}
                initial={{ opacity: motionSafe ? 0 : 1 }}
                animate={{ opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: index * step,
                      }
                    : { duration: 0 }
                }
                className="border-b border-hairline last:border-b-0"
              >
                <button
                  type="button"
                  disabled={kind === "keep" || applied}
                  aria-pressed={kind === "keep" ? undefined : active}
                  onClick={() => toggle(row.id)}
                  className={cn(
                    "grid w-full px-3 py-2 text-left text-sm transition-colors",
                    kind !== "keep" && !applied && "cursor-pointer",
                    active && kind === "remove" && "bg-destructive/8",
                    active &&
                      kind === "add" &&
                      "bg-[var(--success,var(--primary))]/8",
                    active && kind === "change" && "bg-primary/8",
                  )}
                  style={{
                    gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
                  }}
                >
                  {row.cells.map((cell, cellIndex) => (
                    <span key={cellIndex} className="min-w-0 truncate pr-2">
                      <span
                        className={cn(
                          active && kind === "remove"
                            ? "text-ink-3 line-through decoration-[var(--destructive)]/60"
                            : active && kind === "change"
                              ? "text-ink-3 line-through"
                              : "text-ink-2",
                          active && kind === "add" && "text-ink",
                          off && "text-ink-2",
                        )}
                      >
                        {cell}
                      </span>
                      {active && kind === "change" && row.next && (
                        <span className="block text-ink">
                          {row.next[cellIndex]}
                        </span>
                      )}
                    </span>
                  ))}
                  <span className="sr-only">
                    {kind === "keep"
                      ? undefined
                      : `${kind} ${active ? "accepted" : "declined"}`}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="flex items-baseline gap-1 font-mono text-[11px] text-ink-3">
          <Readout value={removals} size="sm" />
          <span>{removals === 1 ? "removal" : "removals"} ·</span>
          <Readout value={additions} size="sm" />
          <span>{additions === 1 ? "addition" : "additions"} ·</span>
          <Readout value={changes} size="sm" />
          <span>{changes === 1 ? "change" : "changes"}</span>
        </p>
        <button
          type="button"
          disabled={accepted.length === 0 || applied}
          onClick={() => {
            setApplied(true);
            onApply?.(accepted.map((row) => row.id));
          }}
          className={cn(
            "rounded-2 px-3 py-1.5 text-sm font-medium transition-colors",
            accepted.length > 0 && !applied
              ? "bg-primary text-primary-foreground"
              : "cursor-not-allowed bg-surface-2 text-ink-3",
          )}
        >
          {applied ? "Applied" : applyLabel(accepted.length)}
        </button>
      </div>
    </div>
  );
}
