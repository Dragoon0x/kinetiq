"use client";

import * as React from "react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type EditableRow = {
  id: string;
  name: string;
  detail: string;
  /** The editable value. */
  value: string;
  /** Unit printed after the value, never inside it. */
  unit?: string;
};

export type DatatableInlineEditProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  rows?: EditableRow[];
  valueLabel?: string;
  onCommit?: (id: string, value: string) => void;
  /** The line explaining what a change actually does. */
  consequenceLine?: string;
  className?: string;
};

const DEFAULT_ROWS: EditableRow[] = [
  {
    id: "e1",
    name: "North basin",
    detail: "Crane 2 window",
    value: "06:00–14:00",
    unit: "",
  },
  {
    id: "e2",
    name: "Kettle point",
    detail: "Minimum crew rest",
    value: "11",
    unit: "hours",
  },
  {
    id: "e3",
    name: "Relay floor",
    detail: "Slots per shift",
    value: "9",
    unit: "",
  },
  {
    id: "e4",
    name: "Dry dock 2",
    detail: "Notice for project work",
    value: "48",
    unit: "hours",
  },
  {
    id: "e5",
    name: "Cold store",
    detail: "Sequence lock",
    value: "strict",
    unit: "",
  },
];

/**
 * A grid you can correct in place: click a value, change it, Enter commits and
 * Escape abandons — and the row stamps a seal so the save is visible without a
 * toast crossing the screen. The ops desk operates on records and the run
 * history reads a trend; this one exists for the third thing people do with a
 * table, which is notice a wrong number and fix it without leaving.
 */
export function DatatableInlineEdit({
  eyebrow = "Waylight · constraints",
  headline = "Wrong number? Fix it here.",
  copy = "These are the constraints every board is cut against. Change one and the next cut uses it — there is no separate settings page for any of this.",
  rows = DEFAULT_ROWS,
  valueLabel = "Value",
  onCommit,
  consequenceLine = "Changes apply to the next cut, not to boards already published. Nothing already signed is altered.",
  className,
}: DatatableInlineEditProps) {
  const headingId = React.useId();
  const [values, setValues] = React.useState(() =>
    Object.fromEntries(rows.map((row) => [row.id, row.value])),
  );
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [saved, setSaved] = React.useState<string | null>(null);

  // The seal clears itself so a stale "saved" never sits beside a later edit.
  React.useEffect(() => {
    if (!saved) return;
    const id = window.setTimeout(() => setSaved(null), 2000);
    return () => window.clearTimeout(id);
  }, [saved]);

  const begin = (row: EditableRow) => {
    setEditing(row.id);
    setDraft(values[row.id] ?? row.value);
  };

  const commit = (id: string) => {
    const next = draft.trim();
    if (next && next !== values[id]) {
      setValues((prev) => ({ ...prev, [id]: next }));
      setSaved(id);
      onCommit?.(id, next);
    }
    setEditing(null);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <div className="mt-10 rounded-4 border border-hairline">
          <div className="hidden grid-cols-[minmax(0,1fr)_14rem] gap-4 border-b border-hairline px-5 py-3 text-label text-ink-3 sm:grid">
            <span>Yard</span>
            <span>{valueLabel}</span>
          </div>

          <ul>
            {rows.map((row) => {
              const isEditing = editing === row.id;
              return (
                <li
                  key={row.id}
                  className="grid gap-x-4 gap-y-2 border-b border-hairline px-5 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{row.name}</p>
                    <p className="truncate text-sm text-ink-3">{row.detail}</p>
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    {isEditing ? (
                      <input
                        // Mounts only on an explicit click to edit, so
                        // taking focus is the expected behaviour.
                        autoFocus
                        aria-label={`${row.name}, ${row.detail}`}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => commit(row.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commit(row.id);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setEditing(null);
                          }
                        }}
                        className="min-w-0 flex-1 rounded-2 border border-primary bg-transparent px-2 py-1 font-mono text-sm text-ink outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => begin(row)}
                        className="min-w-0 flex-1 rounded-2 border border-dashed border-hairline px-2 py-1 text-left transition-colors hover:border-hairline-strong hover:bg-surface-1"
                      >
                        <span className="font-mono text-sm text-ink">
                          {values[row.id] ?? row.value}
                        </span>
                        {row.unit && (
                          <span className="ml-1 text-xs text-ink-3">
                            {row.unit}
                          </span>
                        )}
                      </button>
                    )}
                    {saved === row.id && (
                      <StatusSeal variant="success">saved</StatusSeal>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {consequenceLine && (
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-3">
            {consequenceLine}
          </p>
        )}
      </div>
    </section>
  );
}
