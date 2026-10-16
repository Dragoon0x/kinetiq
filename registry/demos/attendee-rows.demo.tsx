"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AttendeeRows,
  defaultAttendeeRows,
  type AttendeeRow,
} from "@/registry/ui/attendee-rows";

export const tweaks = defineTweaks({
  rowStyle: {
    kind: "choice",
    label: "Rows",
    default: "lines",
    options: ["lines", "cards", "striped"],
    names: { lines: "Lines", cards: "Cards", striped: "Striped" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
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

const SEATS = 6;
const who = (row: AttendeeRow | undefined, index: number) =>
  (row?.values.name?.trim() || `guest ${index + 1}`).toLowerCase();

/**
 * Lina Okafor registering her studio team for the Fernworks open day. Three
 * guests to start; Theo's email is still missing its domain.
 */
export function AttendeeRowsDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [rows, setRows] = React.useState<AttendeeRow[]>(defaultAttendeeRows);
  const [last, setLast] = React.useState<string | null>(null);
  const timers = React.useRef<number[]>([]);
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setRows(defaultAttendeeRows);
    setLast(null);
    setRound((r) => r + 1);
  };

  const form = (
    <AttendeeRows
      key={round}
      defaultRows={defaultAttendeeRows}
      seats={SEATS}
      onRowsChange={setRows}
      onAdd={(_row, index) => setLast(`added guest ${index + 1}`)}
      onRemove={(row, index) =>
        setLast(`removed ${who(row, index)} · undo for 5s`)
      }
      onRestore={(row, index) => setLast(`restored ${who(row, index)}`)}
      onReorder={(next, _from, to) =>
        setLast(`moved ${who(next[to], to)} to ${to + 1}`)
      }
      onSubmit={(list) =>
        new Promise<void>((resolve) => {
          setLast("registering");
          timers.current.push(
            window.setTimeout(() => {
              setLast(
                `registered ${list.length} ${list.length === 1 ? "guest" : "guests"}`,
              );
              resolve();
            }, 1400),
          );
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{form}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {form}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reset}
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
        <span className="text-signal">
          {last ?? `${rows.length} ${rows.length === 1 ? "guest" : "guests"}`}
        </span>{" "}
        · {rows.length} of {SEATS} seats
      </p>
    </div>
  );
}
