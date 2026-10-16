"use client";

import * as React from "react";

import { ArrowLeft, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  LeaveGuard,
  type LeaveGuardChange,
  type LeaveGuardSaveError,
} from "@/registry/ui/leave-guard";

export const tweaks = defineTweaks({
  diffStyle: {
    kind: "choice",
    label: "Diff",
    default: "inline",
    options: ["inline", "stacked", "split"],
    names: { inline: "Inline", stacked: "Stacked", split: "Split" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "caution",
    options: ["calm", "caution", "stern"],
    names: { calm: "Calm", caution: "Caution", stern: "Stern" },
  },
});

type Values = {
  name: string;
  threshold: number;
  night: boolean;
  crew: string;
};
type Field = keyof Values;

const SAVED: Values = {
  name: "Pump station 4",
  threshold: 3.8,
  night: false,
  crew: "Ana Ferreira",
};
const EDITED: Values = {
  name: "Riverside PS4",
  threshold: 4.2,
  night: true,
  crew: "Tomasz Wren",
};
const LABEL: Record<Field, string> = {
  name: "Station name",
  threshold: "Alarm threshold",
  night: "Night mode",
  crew: "Crew on call",
};
const SECTION: Record<Field, string> = {
  name: "General",
  threshold: "Alarms",
  night: "Alarms",
  crew: "Rota",
};
const CREW = ["Ana Ferreira", "Tomasz Wren", "Kofi Mensah", "Lena Strand"];
const FIELDS: Field[] = ["name", "threshold", "night", "crew"];

const shown = (field: Field, v: Values) =>
  field === "threshold"
    ? `${v.threshold.toFixed(1)} bar`
    : field === "night"
      ? v.night
      : v[field];

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const INPUT =
  "h-9 w-full rounded-2 border border-input bg-surface-0 px-2.5 text-[13px] text-foreground focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * A Gaugeworks station's settings with four edits made, and a way out that
 * the guard stands in front of. The first save fails, so the error has
 * somewhere to stay; the second reports each field as it lands.
 */
export function LeaveGuardDemo({
  chrome = true,
  // The guard is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const uid = React.useId();
  const [saved, setSaved] = React.useState<Values>(SAVED);
  const [now, setNow] = React.useState<Values>(EDITED);
  const [open, setOpen] = React.useState(!chrome);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const attempts = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const changes: LeaveGuardChange[] = FIELDS.filter(
    (f) => saved[f] !== now[f],
  ).map((f) => ({
    id: f,
    label: LABEL[f],
    section: SECTION[f],
    from: shown(f, saved),
    to: shown(f, now),
  }));

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    attempts.current = 0;
    setSaved(SAVED);
    setNow(EDITED);
    setNote(null);
    setOpen(!chrome);
    setRound((r) => r + 1);
  };
  const resetSoon = () => {
    if (!chrome) timers.current.push(window.setTimeout(reset, 2400));
  };

  const set = <K extends Field>(field: K, value: Values[K]) =>
    setNow((v) => ({ ...v, [field]: value }));

  const leave = () => {
    if (changes.length === 0) {
      setNote("left · nothing unsaved");
      return;
    }
    setNote(null);
    setOpen(true);
  };

  const page = (
    <div className="flex h-[33rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
        <button
          type="button"
          onClick={leave}
          className={cn(
            "-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-2 px-1.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <ArrowLeft aria-hidden className="size-4" />
          All stations
        </button>
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · Settings
        </span>
      </div>
      <div className="flex flex-1 [scrollbar-width:thin] flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-semibold">{now.name || "Untitled"}</h3>
          <p className="text-[12px] text-ink-3">
            Lift station on the Riverside rising main · 3 pumps
          </p>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 @min-[34rem]:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[12px] text-ink-2">
            Station name
            <input
              className={INPUT}
              value={now.name}
              onChange={(e) => {
                const v = e.currentTarget.value;
                set("name", v);
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] text-ink-2">
            Alarm threshold
            <span className="flex items-center gap-2">
              <input
                className={INPUT}
                type="number"
                step={0.1}
                min={0}
                value={now.threshold}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v))
                    set("threshold", Math.round(v * 10) / 10);
                }}
              />
              <span className="shrink-0 text-[12px] text-ink-3">bar</span>
            </span>
          </label>
          <div className="flex items-center justify-between gap-3 rounded-3 border border-hairline px-3 py-2">
            <span className="flex flex-col">
              <span id={`${uid}-night`} className="text-[13px] text-foreground">
                Night mode
              </span>
              <span className="text-[11px] text-ink-3">
                Quiet alarms 22:00–06:00
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={now.night}
              aria-labelledby={`${uid}-night`}
              onClick={() => set("night", !now.night)}
              className={cn(
                "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                FOCUS,
                now.night
                  ? "bg-primary"
                  : "bg-surface-2 ring-1 ring-hairline-strong",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute top-1 left-1 size-4 rounded-full bg-background shadow-sm transition-transform duration-200",
                  now.night && "translate-x-4",
                )}
              />
            </button>
          </div>
          <label className="flex flex-col gap-1.5 text-[12px] text-ink-2">
            Crew on call
            <select
              className={INPUT}
              value={now.crew}
              onChange={(e) => {
                const v = e.currentTarget.value;
                set("crew", v);
              }}
            >
              {CREW.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <section
          aria-labelledby={`${uid}-pumps`}
          className="flex flex-col gap-2"
        >
          <h4
            id={`${uid}-pumps`}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Pumps
          </h4>
          <ul
            role="list"
            className="flex flex-col divide-y divide-hairline rounded-3 border border-hairline"
          >
            {[
              ["P1", "Duty", "412 h since service"],
              ["P2", "Standby", "398 h since service"],
              ["P3", "Standby", "7 h · new impeller"],
            ].map(([id, role, hours]) => (
              <li
                key={id}
                className="flex items-center gap-3 px-3 py-2 text-[12px]"
              >
                <span className="w-6 font-mono text-ink-3">{id}</span>
                <span className="flex-1 text-foreground">{role}</span>
                <span className="text-ink-3 tabular-nums">{hours}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-3">
        <span className="text-[12px] text-ink-3">
          {changes.length === 0
            ? "All changes saved"
            : `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}`}
        </span>
        <button
          type="button"
          onClick={() => {
            setSaved(now);
            setNote("saved from the page");
          }}
          className={cn(
            "inline-flex h-8 items-center rounded-2 border border-input px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
            FOCUS,
          )}
        >
          Save
        </button>
      </div>
    </div>
  );

  const surface = (
    <LeaveGuard
      key={round}
      open={open}
      onOpenChange={setOpen}
      changes={changes}
      onRevert={(change) => {
        const f = change.id as Field;
        setNow((v) => ({ ...v, [f]: saved[f] }));
      }}
      onDiscard={(list) => {
        setNote(`discarded · ${list.length} reverted`);
        resetSoon();
      }}
      onCancel={() => setNote("kept editing")}
      onSave={async (list, report) => {
        attempts.current += 1;
        const failing = attempts.current === 1;
        for (const [i, c] of list.entries()) {
          await new Promise((r) => window.setTimeout(r, 240));
          if (failing && i === 2) {
            setNote("save failed · still open");
            const error: LeaveGuardSaveError = new Error(
              "Gaugeworks did not answer. Your edits are still here.",
            );
            error.fields = { [c.id]: "Not sent yet." };
            throw error;
          }
          report(c.id);
        }
        setSaved(now);
        setNote(`saved · ${list.length} changes`);
        resetSoon();
      }}
      {...values}
    >
      {page}
    </LeaveGuard>
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
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
            <span className="text-signal">{note}</span> · {changes.length}{" "}
            unsaved
          </>
        ) : (
          <>
            <span className="text-signal">{changes.length} unsaved</span> ·{" "}
            {open ? "guard open" : "all stations to leave"}
          </>
        )}
      </p>
    </div>
  );
}
