"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRoutineWeekRoutines,
  defaultRoutineWeekRuns,
  defaultRoutineWeekStart,
  RoutineWeek,
  type RoutineWeekRun,
} from "@/registry/ui/routine-week";

export const tweaks = defineTweaks({
  hourHeight: {
    kind: "range",
    label: "Hour",
    default: 32,
    min: 20,
    max: 44,
    step: 4,
    unit: "px",
  },
  blockStyle: {
    kind: "choice",
    label: "Blocks",
    default: "tinted",
    options: ["solid", "tinted", "outline"],
    names: { solid: "Solid", tinted: "Tinted", outline: "Outline" },
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

const MIN = 60_000;
const DAY_MS = 24 * 60 * MIN;
const TODAY = 3;
const START_MIN = 140;
const END_MIN = 540;
/** One minute of the night per tick: Thursday plays out in about forty seconds. */
const TICK = 100;

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const nameOf = (id: string) =>
  defaultRoutineWeekRoutines.find((r) => r.id === id)?.name ?? id;

/** How Thursday's runs turn out: the churn watch fails again. */
const resultOf = (routine: string): Pick<RoutineWeekRun, "outcome" | "note"> =>
  routine === "churn"
    ? {
        outcome: "failed",
        note: "The warehouse export timed out again, after 44 minutes.",
      }
    : { outcome: "success" };

/** Records every run that has reached its end by `minute`. */
function settle(runs: RoutineWeekRun[], minute: number): RoutineWeekRun[] {
  let next = runs;
  for (const r of defaultRoutineWeekRoutines) {
    if (!r.days.includes(TODAY) || r.paused) continue;
    if (minute < r.at + r.duration) continue;
    if (
      next.some(
        (x) => x.routine === r.id && x.day === TODAY && x.start === r.at,
      )
    )
      continue;
    next = [
      ...next,
      {
        id: `${r.id}-${TODAY}`,
        routine: r.id,
        day: TODAY,
        start: r.at,
        duration: r.duration,
        ...resultOf(r.id),
      },
    ];
  }
  return next.map((x) =>
    x.outcome === "running" && minute >= x.start + x.duration
      ? { ...x, outcome: "success", note: "Started by hand; finished cleanly." }
      : x,
  );
}

type Said =
  | { kind: "ended"; routine: string; outcome: string; at: number }
  | { kind: "ran"; routine: string; at: number }
  | { kind: "open"; routine: string; day: number }
  | { kind: "pause"; routine: string; paused: boolean }
  | { kind: "edit"; routine: string | null };

function useOnScreen(node: HTMLElement | null) {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    if (!node) return;
    let inView = false;
    const sync = () => setOn(inView && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false;
      sync();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [node]);
  return on;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Coldbrook's Thursday night in time-lapse, from 02:20 to 09:00. */
export function RoutineWeekDemo({
  chrome = true,
  // The week is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [minute, setMinute] = React.useState(START_MIN);
  const [runs, setRuns] = React.useState(defaultRoutineWeekRuns);
  const [said, setSaid] = React.useState<Said | null>(null);
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const onScreen = useOnScreen(node);

  React.useEffect(() => {
    if (!onScreen) return;
    const atEnd = minute >= END_MIN;
    const id = window.setTimeout(
      () => {
        if (atEnd) {
          setRound((r) => r + 1);
          setMinute(START_MIN);
          setRuns(defaultRoutineWeekRuns);
          setSaid(null);
          return;
        }
        const next = minute + 1;
        const settled = settle(runs, next);
        if (settled !== runs) {
          const ended = settled.find(
            (x, i) => x.outcome !== "running" && runs[i]?.outcome !== x.outcome,
          );
          if (ended)
            setSaid({
              kind: "ended",
              routine: ended.routine,
              outcome: ended.outcome,
              at: next,
            });
          setRuns(settled);
        }
        setMinute(next);
      },
      atEnd ? 3200 : TICK,
    );
    return () => window.clearTimeout(id);
  }, [onScreen, minute, runs]);

  const surface = (
    <RoutineWeek
      key={round}
      runs={runs}
      onRunsChange={setRuns}
      now={defaultRoutineWeekStart + TODAY * DAY_MS + minute * MIN}
      onRunNow={(routine) =>
        setSaid({ kind: "ran", routine: routine.id, at: minute })
      }
      onOpenRun={(run) =>
        setSaid({ kind: "open", routine: run.routine, day: run.day })
      }
      onPause={(routine, paused) =>
        setSaid({ kind: "pause", routine: routine.id, paused })
      }
      onEditSchedule={(routine) =>
        setSaid({ kind: "edit", routine: routine?.id ?? null })
      }
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={setNode} className="w-full">
        {surface}
      </div>
    );
  }

  const running = defaultRoutineWeekRoutines.find(
    (r) =>
      r.days.includes(TODAY) && minute >= r.at && minute < r.at + r.duration,
  );
  const share = running
    ? Math.round(((minute - running.at) / running.duration) * 100)
    : 0;
  const upcoming = defaultRoutineWeekRoutines
    .filter((r) => r.days.includes(TODAY) && r.at > minute)
    .sort((a, b) => a.at - b.at)[0];

  return (
    <div ref={setNode} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setMinute(START_MIN);
            setRuns(defaultRoutineWeekRuns);
            setSaid(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Restart
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {said?.kind === "ended" ? (
          <>
            <span className="text-signal">
              {nameOf(said.routine)}{" "}
              {said.outcome === "failed" ? "failed" : "succeeded"}
            </span>{" "}
            · {hhmm(said.at)}
          </>
        ) : said?.kind === "ran" ? (
          <>
            <span className="text-signal">ran {nameOf(said.routine)} now</span>{" "}
            · {hhmm(said.at)}
          </>
        ) : said?.kind === "open" ? (
          <>
            <span className="text-signal">opened {nameOf(said.routine)}</span> ·{" "}
            {DAYS[said.day]}
          </>
        ) : said?.kind === "pause" ? (
          <>
            <span className="text-signal">
              {said.paused ? "paused" : "resumed"} {nameOf(said.routine)}
            </span>{" "}
            · {hhmm(minute)}
          </>
        ) : said?.kind === "edit" ? (
          <>
            <span className="text-signal">edit schedule</span> ·{" "}
            {said.routine ? nameOf(said.routine) : "new routine"}
          </>
        ) : running ? (
          <>
            <span className="text-signal">
              thu {hhmm(minute)} · {running.name} running
            </span>{" "}
            · {share}%
          </>
        ) : (
          <>
            <span className="text-signal">thu {hhmm(minute)}</span> ·{" "}
            {upcoming
              ? `next at ${hhmm(upcoming.at)}`
              : "the night’s runs are done"}
          </>
        )}
      </p>
    </div>
  );
}
