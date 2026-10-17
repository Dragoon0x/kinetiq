"use client";

import * as React from "react";

import { RotateCw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultQueryRows,
  defaultQueryStages,
  defaultQueryStatement,
  QueryStages,
  type QueryRow,
  type QueryStage,
  type QueryStagesError,
  type QueryStagesStatus,
} from "@/registry/ui/query-stages";

export const tweaks = defineTweaks({
  stageStyle: {
    kind: "choice",
    label: "Stages",
    default: "funnel",
    options: ["funnel", "bars", "rail"],
    names: { funnel: "Funnel", bars: "Bars", rail: "Rail" },
  },
  counterStyle: {
    kind: "choice",
    label: "Counter",
    default: "roll",
    options: ["roll", "tally", "share"],
    names: { roll: "Roll", tally: "Tally", share: "Share" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "oklch(from var(--accent-bright) l c 300)",
      "var(--signal)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "oklch(from var(--accent-bright) l c 300)": "Plum",
      "var(--signal)": "Mint",
    },
  },
});

type Scenario = "normal" | "slow" | "empty" | "typo";
type Case = {
  stages: QueryStage[];
  rows: QueryRow[];
  statement: string;
  error: QueryStagesError | null;
};

const withWhere = (
  patch: Partial<QueryStage>,
  after?: (s: QueryStage) => QueryStage,
): QueryStage[] =>
  defaultQueryStages.map((s) =>
    s.id === "where" ? { ...s, ...patch } : after ? after(s) : s,
  );

const CASES: Record<Scenario, Case> = {
  normal: {
    stages: defaultQueryStages,
    rows: defaultQueryRows,
    statement: defaultQueryStatement,
    error: null,
  },
  slow: {
    stages: withWhere({
      ms: 2310,
      note: "Read all 48,210 rows: stock_levels has no index on (warehouse_id, on_hand).",
    }),
    rows: defaultQueryRows,
    statement: defaultQueryStatement,
    error: null,
  },
  empty: {
    stages: defaultQueryStages.map((s) =>
      s.id === "where"
        ? {
            ...s,
            text: "w.region = 'north' AND s.on_hand < 0",
            rows: 0,
            ms: 41,
            sample: undefined,
          }
        : s.id === "from" || s.id === "join"
          ? s
          : { ...s, rows: 0, ms: 1 },
    ),
    rows: [],
    statement: defaultQueryStatement.replace(
      "s.on_hand < s.reorder_point",
      "s.on_hand < 0",
    ),
    error: null,
  },
  typo: {
    stages: withWhere({
      text: "w.regoin = 'north' AND s.on_hand < s.reorder_point",
    }),
    rows: [],
    statement: defaultQueryStatement.replace("w.region", "w.regoin"),
    error: {
      stage: "where",
      message: "column w.regoin does not exist",
      token: "w.regoin",
      line: 6,
    },
  },
};

const KEYWORD: Record<string, string> = {
  from: "from",
  join: "join",
  where: "where",
  group: "group by",
  having: "having",
  select: "select",
  order: "order by",
  limit: "limit",
};

/** Stage times are tens of ms; the replay holds each long enough to watch. */
const hold = (ms: number) => Math.round(280 + Math.min(900, ms * 0.9));

/**
 * Coldbrook's ops assistant asks the stock database which items are short in
 * the North warehouses. The call replays by its stage timings whenever it
 * comes into view and on Re-run.
 */
export function QueryStagesDemo({
  chrome = true,
  // The view is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [scenario, setScenario] = React.useState<Scenario>("normal");
  const [status, setStatus] = React.useState<QueryStagesStatus>("running");
  const [completed, setCompleted] = React.useState(0);
  const [round, setRound] = React.useState(0);
  const [inView, setInView] = React.useState(false);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const c = CASES[scenario];

  React.useEffect(() => {
    const node = frame.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    if (!inView || status !== "running") return;
    const stage = c.stages[completed];
    const wait = c.error ? 700 : completed === 0 ? 700 : 0;
    const t = window.setTimeout(
      () => {
        if (c.error) {
          setStatus("error");
          return;
        }
        if (completed + 1 >= c.stages.length) {
          setCompleted(c.stages.length);
          setStatus("done");
        } else setCompleted(completed + 1);
      },
      wait + hold(stage?.ms ?? 0),
    );
    return () => window.clearTimeout(t);
  }, [inView, status, completed, c, round]);

  const restart = (next: Scenario = scenario) => {
    setScenario(next);
    setStatus("running");
    setCompleted(0);
    setRound((r) => r + 1);
  };

  const surface = (
    <QueryStages
      stages={c.stages}
      rows={c.rows}
      statement={c.statement}
      status={status}
      completed={completed}
      error={status === "error" ? c.error : null}
      onRerun={() => restart()}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const total = c.stages.reduce((sum, s) => sum + s.ms, 0);
  const lastDone = c.stages[completed - 1];
  const emptied = c.stages.find((s) => s.rows === 0);
  const line =
    status === "error"
      ? `syntax error · line ${c.error?.line ?? 0} · ${c.error ? KEYWORD[c.error.stage] : ""}`
      : status === "done"
        ? emptied
          ? `done · 0 rows · ${KEYWORD[emptied.clause]} emptied it`
          : `done · ${c.rows.length} rows · ${total >= 1000 ? `${(total / 1000).toFixed(2)} s` : `${total} ms`}`
        : lastDone
          ? `${KEYWORD[lastDone.clause]} · ${lastDone.rows.toLocaleString("en-US")} rows · stage ${completed} of ${c.stages.length}`
          : "running · stage 1";

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Coldbrook ops · which items are short in the North warehouses
      </p>
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Scenario"
          className="flex flex-wrap items-center gap-1"
        >
          {(["normal", "slow", "empty", "typo"] as Scenario[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scenario === s}
              onClick={() => restart(s)}
              className={cn(
                button,
                "px-2.5",
                scenario === s &&
                  "border-hairline-strong bg-surface-2 text-foreground",
              )}
            >
              {s === "normal"
                ? "Normal"
                : s === "slow"
                  ? "Slow"
                  : s === "empty"
                    ? "Empty"
                    : "Typo"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => restart()} className={button}>
          <RotateCw aria-hidden className="size-3.5" />
          Re-run
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span>
        {" · coldbrook stock"}
      </p>
    </div>
  );
}
