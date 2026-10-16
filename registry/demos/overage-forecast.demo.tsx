"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultOverageForecast,
  defaultOveragePlan,
  defaultOverageUsage,
  OverageForecast,
  projectOverageBill,
  type OverageStatus,
  type OverageUsage,
} from "@/registry/ui/overage-forecast";

export const tweaks = defineTweaks({
  coneStyle: {
    kind: "choice",
    label: "Cone",
    default: "fan",
    options: ["fan", "bands", "lines"],
    names: { fan: "Fan", bands: "Bands", lines: "Lines" },
  },
  meterHeight: {
    kind: "range",
    label: "Meter",
    default: 88,
    min: 56,
    max: 128,
    step: 8,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/** The first morning of the next period: every meter back at zero. */
const FRESH: OverageUsage[] = defaultOverageUsage.map((u) => ({
  ...u,
  used: 0,
  history: [0],
}));
const FRESH_NOW = Date.UTC(2026, 9, 1, 9);
const VIEWS: { id: OverageStatus; label: string }[] = [
  { id: "ready", label: "Live" },
  { id: "loading", label: "Loading" },
  { id: "empty", label: "Fresh" },
];

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);

/**
 * The Gaugeworks account on the Team plan, seventeen days into October:
 * API calls are heading over, storage is comfortable and build minutes are
 * tight, with a load test and a backfill on the calendar.
 */
export function OverageForecastDemo({
  chrome = true,
  // The panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [planned, setPlanned] = React.useState(false);
  const [view, setView] = React.useState<OverageStatus>("ready");
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);

  const fresh = view === "empty";
  const surface = (
    <OverageForecast
      key={round}
      usage={fresh ? FRESH : defaultOverageUsage}
      now={fresh ? FRESH_NOW : undefined}
      status={view}
      includePlanned={planned}
      onForecastToggle={(on) => {
        setPlanned(on);
        setNote(on ? "planned load on" : "planned load off");
      }}
      onSetAlert={(id, value) => {
        const label = defaultOverageUsage.find((u) => u.id === id)?.label;
        setNote(
          value === null
            ? `alert off · ${label ?? id}`
            : `alert · ${label ?? id} at ${new Intl.NumberFormat("en-US").format(value)}`,
        );
      }}
      onUpgrade={(plan) => setNote(`comparing ${plan.name}`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const bill = projectOverageBill(
    defaultOverageUsage,
    defaultOveragePlan,
    defaultOverageForecast,
    planned,
  );
  const over = defaultOverageUsage.filter((u) => {
    const f = defaultOverageForecast[u.id];
    const terms = defaultOveragePlan.meters[u.id];
    if (!f || !terms) return false;
    const mid = f.mid + (planned ? (f.planned?.mid ?? 0) : 0);
    return mid > terms.included;
  }).length;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="View"
          className="inline-flex h-8 items-center rounded-2 border border-hairline p-0.5"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view === v.id}
              tabIndex={view === v.id ? 0 : -1}
              onClick={() => setView(v.id)}
              onKeyDown={(event) => {
                const i = VIEWS.findIndex((x) => x.id === view);
                const step =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                if (!step) return;
                event.preventDefault();
                const next = VIEWS[(i + step + VIEWS.length) % VIEWS.length];
                if (!next) return;
                setView(next.id);
                const group = event.currentTarget.parentElement;
                const target =
                  group?.querySelectorAll<HTMLButtonElement>("[role=radio]")[
                    (i + step + VIEWS.length) % VIEWS.length
                  ];
                target?.focus();
              }}
              className={cn(
                "inline-flex h-full items-center rounded-[4px] px-2.5 text-xs transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                view === v.id
                  ? "bg-surface-2 text-foreground"
                  : "text-ink-3 hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setPlanned(false);
            setView("ready");
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {view === "loading" ? (
          <span className="text-signal">loading readings · axes kept</span>
        ) : fresh ? (
          <>
            <span className="text-signal">fresh period</span> · resets nov 1
          </>
        ) : (
          <>
            <span className="text-signal">
              {note ?? `projected ${money(bill.mid)}`}
            </span>{" "}
            · {note ? `projected ${money(bill.mid)}` : null}
            {note ? " · " : null}
            {over} {over === 1 ? "meter" : "meters"} over
          </>
        )}
      </p>
    </div>
  );
}
