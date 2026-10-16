"use client";

import * as React from "react";

import {
  BarChart3,
  Briefcase,
  ChevronDown,
  Map as MapIcon,
  RotateCcw,
  Route,
  Search,
  Share2,
  Users,
} from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultWayfindingHints,
  WayfindingDots,
} from "@/registry/ui/wayfinding-dots";

export const tweaks = defineTweaks({
  dotStyle: {
    kind: "choice",
    label: "Dot",
    default: "beacon",
    options: ["beacon", "halo", "ring", "pip"],
    names: { beacon: "Beacon", halo: "Halo", ring: "Ring", pip: "Pip" },
  },
  breathSpeed: {
    kind: "range",
    label: "Breath",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

type Job = {
  id: string;
  lane: "scheduled" | "progress";
  title: string;
  where: string;
  crew: string | null;
  at: string;
  due: boolean;
};

const JOBS: Job[] = [
  {
    id: "j1",
    lane: "scheduled",
    title: "Replace valve",
    where: "Dock 4",
    crew: "MR",
    at: "09:30",
    due: true,
  },
  {
    id: "j2",
    lane: "scheduled",
    title: "Hedge trim",
    where: "Pier 9 offices",
    crew: "TF",
    at: "11:00",
    due: false,
  },
  {
    id: "j3",
    lane: "scheduled",
    title: "Gutter clear",
    where: "Coldbrook Row 12",
    crew: null,
    at: "14:15",
    due: true,
  },
  {
    id: "j4",
    lane: "progress",
    title: "Boiler service",
    where: "Basin Yard",
    crew: "KA",
    at: "08:00",
    due: true,
  },
  {
    id: "j5",
    lane: "progress",
    title: "Fence repair",
    where: "Fernworks depot",
    crew: "PN",
    at: "10:30",
    due: false,
  },
  {
    id: "j6",
    lane: "progress",
    title: "Lamp swap",
    where: "Harbour Gate",
    crew: null,
    at: "12:45",
    due: true,
  },
];

type Filter = "all" | "due" | "open";

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * A Fieldline dispatch board for a small field-service firm: quick find,
 * saved views, sharing, a sections rail and two lanes of today's jobs. The
 * filters are real; the five features the hints point at carry
 * `data-wayfinding`.
 */
function FieldlineBoard() {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [section, setSection] = React.useState("jobs");
  const shown = JOBS.filter((j) =>
    filter === "due" ? j.due : filter === "open" ? j.crew === null : true,
  );
  const chips: { id: Filter; label: string; count: number; key?: string }[] = [
    { id: "all", label: "All jobs", count: JOBS.length },
    {
      id: "due",
      label: "Due today",
      count: JOBS.filter((j) => j.due).length,
      key: "due",
    },
    {
      id: "open",
      label: "Unassigned",
      count: JOBS.filter((j) => j.crew === null).length,
    },
  ];
  const sections = [
    { id: "jobs", label: "Jobs", icon: Briefcase, count: 12 },
    { id: "crews", label: "Crews", icon: Users, count: 5, key: "crews" },
    { id: "map", label: "Map", icon: MapIcon },
    { id: "reports", label: "Reports", icon: BarChart3 },
  ];

  return (
    <div className="@container/fieldline-board flex flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2.5">
        <span className="mr-auto inline-flex items-center gap-2 text-sm font-semibold @min-[34rem]/fieldline-board:mr-1">
          <span className="flex size-6 items-center justify-center rounded-2 bg-primary text-primary-foreground">
            <Route aria-hidden className="size-3.5" />
          </span>
          Fieldline
        </span>
        <label
          data-wayfinding="search"
          className="order-last flex h-8 w-full items-center gap-2 rounded-2 border border-hairline bg-surface-1 px-2.5 text-ink-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring focus-within:outline-solid @min-[34rem]/fieldline-board:order-none @min-[34rem]/fieldline-board:w-auto @min-[34rem]/fieldline-board:flex-1"
        >
          <Search aria-hidden className="size-3.5 shrink-0" />
          <input
            aria-label="Quick find"
            placeholder="Find a job, crew or address"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-3"
          />
          <kbd className="hidden h-5 items-center rounded-1 border border-hairline-strong px-1.5 font-mono text-[10px] text-ink-3 @min-[34rem]/fieldline-board:inline-flex">
            /
          </kbd>
        </label>
        <button
          type="button"
          data-wayfinding="views"
          aria-label="Saved views"
          aria-haspopup="menu"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <span>
            <span className="hidden @min-[24rem]/fieldline-board:inline">
              Saved views
            </span>
            <span className="@min-[24rem]/fieldline-board:hidden">Views</span>
          </span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0" />
        </button>
        <button
          type="button"
          data-wayfinding="share"
          aria-label="Share board"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
            FOCUS,
          )}
        >
          <Share2 aria-hidden className="size-3.5 shrink-0" />
          <span className="hidden @min-[24rem]/fieldline-board:inline">
            Share
          </span>
        </button>
      </header>

      <div className="flex flex-col @min-[34rem]/fieldline-board:flex-row">
        <nav
          aria-label="Board sections"
          className="flex gap-1 border-b border-hairline p-2 @min-[34rem]/fieldline-board:w-36 @min-[34rem]/fieldline-board:shrink-0 @min-[34rem]/fieldline-board:flex-col @min-[34rem]/fieldline-board:border-r @min-[34rem]/fieldline-board:border-b-0"
        >
          {sections.map((s) => {
            const Icon = s.icon;
            const on = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                data-wayfinding={s.key}
                aria-current={on ? "page" : undefined}
                onClick={() => setSection(s.id)}
                className={cn(
                  "inline-flex h-8 min-w-0 items-center gap-2 rounded-2 px-2 text-[13px] transition-colors",
                  on
                    ? "bg-cobalt-wash text-foreground"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  s.count === undefined &&
                    "hidden @min-[34rem]/fieldline-board:inline-flex",
                  FOCUS,
                )}
              >
                <Icon aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{s.label}</span>
                {s.count !== undefined ? (
                  <span className="ml-auto font-mono text-[10px] text-ink-3 tabular-nums">
                    {s.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 p-3">
          <div
            role="radiogroup"
            aria-label="Filter jobs"
            className="flex flex-wrap items-center gap-1.5"
          >
            {chips.map((c) => {
              const on = filter === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-wayfinding={c.key}
                  onClick={() => setFilter(c.id)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                    on
                      ? "border-transparent bg-foreground text-background"
                      : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  {c.label}
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      on ? "opacity-70" : "text-ink-3",
                    )}
                  >
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {(["scheduled", "progress"] as const).map((lane) => {
              const jobs = shown.filter((j) => j.lane === lane);
              return (
                <section key={lane} aria-label={lane} className="min-w-0">
                  <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {lane === "scheduled" ? "Scheduled" : "In progress"}
                    <span className="tabular-nums">{jobs.length}</span>
                  </p>
                  <ul className="flex flex-col gap-2">
                    {jobs.map((j, i) => (
                      <li
                        key={j.id}
                        className={cn(
                          "min-w-0 rounded-3 border border-hairline bg-surface-1 p-2.5",
                          i === 2 &&
                            "hidden @min-[34rem]/fieldline-board:block",
                        )}
                      >
                        <p className="truncate text-[13px] font-medium">
                          {j.title}
                        </p>
                        <p className="truncate text-[11px] text-ink-3">
                          {j.where}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-ink-2 tabular-nums">
                            {j.at}
                          </span>
                          {j.due ? (
                            <span className="inline-flex h-4 items-center rounded-full bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] px-1.5 text-[10px] text-warn">
                              Due
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "ml-auto flex size-5 items-center justify-center rounded-full text-[9px] font-semibold",
                              j.crew
                                ? "bg-cobalt-wash text-cobalt-bright"
                                : "border border-dashed border-hairline-strong text-ink-3",
                            )}
                          >
                            {j.crew ?? "?"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Day three of a Fieldline trial: the dispatcher has used the board but not
 * yet found quick find, saved views, the due filter, crews or sharing.
 */
export function WayfindingDotsDemo({
  chrome = true,
  // The hints are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [found, setFound] = React.useState<string[]>([]);
  const [shown, setShown] = React.useState(true);
  const [last, setLast] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);

  const layer = (
    <WayfindingDots
      key={round}
      found={found}
      onFoundChange={setFound}
      shown={shown}
      onShownChange={setShown}
      onDismiss={(hint) => setLast(hint.title)}
      onDismissAll={() => setLast(null)}
      {...values}
    >
      <FieldlineBoard />
    </WayfindingDots>
  );

  if (!chrome) return <div className="w-full">{layer}</div>;

  const total = defaultWayfindingHints.length;
  const count = defaultWayfindingHints.filter((h) =>
    found.includes(h.id),
  ).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {layer}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setFound([]);
            setShown(true);
            setLast(null);
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset hints
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {!shown ? (
          <>
            <span className="text-signal">hints hidden</span> · press h to show
          </>
        ) : count === total ? (
          <>
            <span className="text-signal">all {total} found</span> · counter
            retired
          </>
        ) : (
          <>
            <span className="text-signal">
              {count} of {total} found
            </span>{" "}
            · {last ? `last: ${last.toLowerCase()}` : "nothing found yet"}
          </>
        )}
      </p>
    </div>
  );
}
