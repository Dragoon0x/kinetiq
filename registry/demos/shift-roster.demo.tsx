"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRosterCoverage,
  defaultRosterShifts,
  defaultRosterStaff,
  ShiftRoster,
  type RosterShift,
} from "@/registry/ui/shift-roster";

export const tweaks = defineTweaks({
  blockStyle: {
    kind: "choice",
    label: "Blocks",
    default: "soft",
    options: ["soft", "solid", "outline"],
    names: { soft: "Soft", solid: "Solid", outline: "Outline" },
  },
  rowHeight: {
    kind: "range",
    label: "Rows",
    default: 48,
    min: 40,
    max: 64,
    step: 4,
    unit: "px",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "garden",
    options: ["garden", "cool", "mono"],
    names: { garden: "Garden", cool: "Cool", mono: "Mono" },
  },
});

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const AREA = { plants: "plants", tills: "tills", cafe: "café", yard: "yard" };
const first = (id: string | null) =>
  id === null
    ? "open"
    : (defaultRosterStaff.find((p) => p.id === id)?.name.split(" ")[0] ?? id);

/**
 * The Fernworks garden centre's week of 19 October. Three open shifts would
 * fill Friday to Sunday; Priya is double-booked on Thursday. Drag a shift, or
 * focus a cell and use Space and the arrow keys.
 */
export function ShiftRosterDemo({
  chrome = true,
  // The rota is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [shifts, setShifts] =
    React.useState<RosterShift[]>(defaultRosterShifts);
  const [published, setPublished] =
    React.useState<RosterShift[]>(defaultRosterShifts);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  const roster = (
    <ShiftRoster
      key={run}
      shifts={shifts}
      onShiftsChange={setShifts}
      published={published}
      onAssign={(s, staffId, day) =>
        setNote(
          `assigned · ${DAYS[day] ?? ""} ${AREA[s.area]} → ${first(staffId)}`,
        )
      }
      onSwap={(a, b) =>
        setNote(`swapped · ${first(b.staff)} ↔ ${first(a.staff)}`)
      }
      onPublish={(list) => {
        const before = new Map(published.map((s) => [s.id, s]));
        const n = list.filter((s) => {
          const b = before.get(s.id);
          return !b || b.staff !== s.staff || b.day !== s.day;
        }).length;
        setPublished(list);
        setNote(`published · ${n === 1 ? "1 change" : `${n} changes`}`);
      }}
      onDiscard={() => setNote("changes discarded")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{roster}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const open = shifts.filter((s) => s.staff === null).length;
  const sat = shifts
    .filter((s) => s.day === 5 && s.staff !== null)
    .reduce((t, s) => t + (s.end - s.start) / 60, 0);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {roster}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setShifts(defaultRosterShifts);
            setPublished(defaultRosterShifts);
            setNote(null);
            setRun((r) => r + 1);
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
        {note ? (
          <>
            <span className="text-signal">{note}</span> · {open} open
          </>
        ) : (
          <>
            <span className="text-signal">
              sat {sat}/{defaultRosterCoverage[5]} h
            </span>{" "}
            · {open} open
          </>
        )}
      </p>
    </div>
  );
}
