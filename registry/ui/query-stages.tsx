"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  Check,
  CircleX,
  Copy,
  ExternalLink,
  ListTree,
  LoaderCircle,
  RotateCw,
  Timer,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type QueryClause =
  "from" | "join" | "where" | "group" | "having" | "select" | "order" | "limit";

export type QueryStage = {
  id: string;
  /** Which clause this stage runs; sets the keyword. */
  clause: QueryClause;
  /** The clause's text after its keyword. */
  text: string;
  /** Rows left after this stage. */
  rows: number;
  /** Time spent in this stage, ms. */
  ms: number;
  /** Why it took as long as it did, shown when the stage is slow. */
  note?: string;
  /** A few rows as they stood after this stage, shown on Enter. */
  sample?: { columns: string[]; rows: (string | number)[][] };
};

export type QueryColumn = {
  key: string;
  label: string;
  /** Numbers read right-aligned. @default "left" */
  align?: "left" | "right";
  /** Dropped from the table under 40rem of width. */
  hideNarrow?: boolean;
  /** A fixed CSS width; columns without one share what is left. */
  width?: string;
};

export type QueryRow = Record<string, string | number>;

export type QueryStagesError = {
  /** The id of the stage whose clause is at fault. */
  stage: string;
  message: string;
  /** The offending token inside the clause text, underlined. */
  token?: string;
  /** Line in the statement, for the message. */
  line?: number;
};

export type QueryStagesStatus = "loading" | "running" | "done" | "error";
export type QueryStageStyle = "funnel" | "bars" | "rail";
export type QueryCounterStyle = "roll" | "tally" | "share";

export type QueryStagesProps = {
  /** The tool that ran the query and the database it ran on. @default { tool: "run_query", database: "coldbrook-stock" } */
  source?: { tool: string; database: string };
  /** The statement as written; Copy and Explain hand it over. @default defaultQueryStatement */
  statement?: string;
  /** The clauses in the order they run, with the rows left after each. @default defaultQueryStages */
  stages?: QueryStage[];
  /** The result's columns. @default defaultQueryColumns */
  columns?: QueryColumn[];
  /** The result. @default defaultQueryRows */
  rows?: QueryRow[];
  /** Where the call is. @default "done" */
  status?: QueryStagesStatus;
  /** How many stages have finished; the next one is running. @default stages.length */
  completed?: number;
  /** A syntax error that marks its clause. @default null */
  error?: QueryStagesError | null;
  /** A stage slower than this is marked slow and shows its note, ms. @default 1000 */
  slowMs?: number;
  /** Re-run in the header. */
  onRerun?: () => void;
  /** Open in the result's header, with every row. */
  onOpenResult?: (rows: QueryRow[]) => void;
  /** Copy in the header, with the statement. It is also written to the clipboard. */
  onCopyQuery?: (statement: string) => void;
  /** Explain in the header, with the statement. */
  onExplain?: (statement: string) => void;
  /** Enter or a click opened a stage's rows. */
  onInspectStage?: (stage: QueryStage) => void;
  /** Formats every row count. @default en-US grouping */
  format?: (n: number) => string;
  /** Bars centred into a funnel, bars from the left, or a rail of stage nodes. @default "funnel" */
  stageStyle?: QueryStageStyle;
  /** Rolling digits, a count that tallies down, or the share of the source rows. @default "roll" */
  counterStyle?: QueryCounterStyle;
  /** Lit keywords, bars, the running underline and the table rule — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Result rows visible before the table scrolls. @default 4 */
  tableRows?: number;
  /** The view's accessible name. @default "<tool> on <database>" */
  label?: string;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultQueryStatement = `SELECT s.sku, s.item,
       sum(s.reorder_point - s.on_hand) AS shortfall,
       count(*) AS sites
FROM stock_levels s
JOIN warehouses w ON w.id = s.warehouse_id
WHERE w.region = 'north'
  AND s.on_hand < s.reorder_point
GROUP BY s.sku, s.item
ORDER BY shortfall DESC
LIMIT 8;`;

export const defaultQueryStages: QueryStage[] = [
  {
    id: "from",
    clause: "from",
    text: "stock_levels s",
    rows: 48210,
    ms: 38,
    sample: {
      columns: ["sku", "warehouse_id", "on_hand", "reorder_point"],
      rows: [
        ["CB-0731", "N-04", 9, 220],
        ["CB-2040", "S-11", 64, 40],
        ["CB-1182", "N-02", 112, 180],
      ],
    },
  },
  {
    id: "join",
    clause: "join",
    text: "warehouses w ON w.id = s.warehouse_id",
    rows: 48210,
    ms: 21,
    sample: {
      columns: ["sku", "w.name", "w.region", "on_hand"],
      rows: [
        ["CB-0731", "Harrow Yard", "north", 9],
        ["CB-2040", "Kestrel Dock", "south", 64],
        ["CB-1182", "Millbrook", "north", 112],
      ],
    },
  },
  {
    id: "where",
    clause: "where",
    text: "w.region = 'north' AND s.on_hand < s.reorder_point",
    rows: 1326,
    ms: 64,
    sample: {
      columns: ["sku", "w.name", "on_hand", "reorder_point"],
      rows: [
        ["CB-0731", "Harrow Yard", 9, 220],
        ["CB-1182", "Millbrook", 112, 180],
        ["CB-2207", "Harrow Yard", 30, 200],
      ],
    },
  },
  {
    id: "group",
    clause: "group",
    text: "s.sku, s.item",
    rows: 214,
    ms: 12,
  },
  {
    id: "select",
    clause: "select",
    text: "s.sku, s.item, sum(s.reorder_point - s.on_hand) AS shortfall, count(*) AS sites",
    rows: 214,
    ms: 3,
  },
  {
    id: "order",
    clause: "order",
    text: "shortfall DESC LIMIT 8",
    rows: 8,
    ms: 4,
  },
];

export const defaultQueryColumns: QueryColumn[] = [
  { key: "sku", label: "sku", width: "5.5rem" },
  { key: "item", label: "item" },
  { key: "shortfall", label: "shortfall", align: "right", width: "5.5rem" },
  {
    key: "sites",
    label: "sites",
    align: "right",
    hideNarrow: true,
    width: "3.5rem",
  },
];

export const defaultQueryRows: QueryRow[] = [
  {
    sku: "CB-0731",
    item: "Cold brew concentrate 1 L",
    shortfall: 1240,
    sites: 6,
  },
  { sku: "CB-1182", item: "Oat milk 1 L", shortfall: 980, sites: 7 },
  { sku: "CB-2207", item: "Compostable lids 12 oz", shortfall: 860, sites: 5 },
  { sku: "CB-0415", item: "Paper cups 12 oz", shortfall: 720, sites: 6 },
  { sku: "CB-3310", item: "Filter papers, size 4", shortfall: 540, sites: 4 },
  { sku: "CB-1406", item: "House blend beans 1 kg", shortfall: 410, sites: 3 },
  { sku: "CB-2981", item: "Vanilla syrup 750 ml", shortfall: 260, sites: 3 },
  { sku: "CB-0920", item: "Cardamom buns, frozen", shortfall: 190, sites: 2 },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const DEFAULT_SOURCE = { tool: "run_query", database: "coldbrook-stock" };

const KEYWORD: Record<QueryClause, string> = {
  from: "FROM",
  join: "JOIN",
  where: "WHERE",
  group: "GROUP BY",
  having: "HAVING",
  select: "SELECT",
  order: "ORDER BY",
  limit: "LIMIT",
};

const GROUPING = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const defaultFormat = (n: number) => GROUPING.format(Math.round(n));

const msText = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;

const shareText = (rows: number, source: number) => {
  if (source <= 0) return "0%";
  const p = (rows / source) * 100;
  return `${p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2)}%`;
};

/** Bar length on a log scale: 48,210 and 8 rows must both be visible. */
const shareOf = (rows: number, max: number) =>
  rows <= 0
    ? 0
    : Number(
        Math.max(
          4,
          (Math.log10(rows + 1) / Math.log10(Math.max(2, max) + 1)) * 100,
        ).toFixed(3),
      );

const plural = (n: number, one: string, many: string, format = defaultFormat) =>
  `${format(n)} ${n === 1 ? one : many}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

function useMeasured() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, height] as const;
}

/* ----------------------------------------------------------------------- */
/*                                 Counters                                 */
/* ----------------------------------------------------------------------- */

const LINE = 16;

/**
 * Digits on rolling columns, matched by place value from the right so the
 * units roll against the units. Each column lands on `springs.snap`.
 */
function Roll({
  from,
  to,
  text,
  motionSafe,
}: {
  from: number;
  to: number;
  text: (n: number) => string;
  motionSafe: boolean;
}) {
  const now = text(to);
  const was = text(from).padStart(now.length, " ");
  const chars = now.split("");
  return (
    <span
      className="inline-flex overflow-hidden"
      style={{ height: LINE, lineHeight: `${LINE}px` }}
    >
      {chars.map((ch, i) => {
        const place = chars.length - i;
        const digit = /\d/.test(ch) ? Number(ch) : null;
        if (digit === null)
          return (
            <span key={`p${place}`} className="inline-block">
              {ch}
            </span>
          );
        const prior = was[was.length - place];
        const start = prior && /\d/.test(prior) ? Number(prior) : 0;
        return (
          <span
            key={`p${place}`}
            className="relative inline-block w-[1ch]"
            style={{ height: LINE }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={motionSafe ? { y: -start * LINE } : false}
              animate={{ y: -digit * LINE }}
              transition={
                motionSafe
                  ? {
                      ...springs.snap,
                      delay: Number((place * 0.025).toFixed(3)),
                    }
                  : { duration: 0 }
              }
            >
              {Array.from({ length: 10 }, (_, d) => (
                <span
                  key={d}
                  className="block text-center"
                  style={{ height: LINE }}
                >
                  {d}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** A number that tallies from one value to the next on `springs.snap`. */
function Tally({
  from,
  to,
  text,
  motionSafe,
}: {
  from: number;
  to: number;
  text: (n: number) => string;
  motionSafe: boolean;
}) {
  const value = useMotionValue(motionSafe ? from : to);
  const shown = useTransform(value, (v) => text(Math.max(0, v)));
  React.useEffect(() => {
    if (!motionSafe) {
      value.jump(to);
      return;
    }
    const controls = animate(value.get(), to, {
      ...springs.snap,
      onUpdate: (v) => value.set(v),
    });
    return () => controls.stop();
  }, [to, motionSafe, value]);
  return <motion.span>{shown}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                                  A stage                                 */
/* ----------------------------------------------------------------------- */

type StageState = "pending" | "running" | "done" | "error" | "blocked";

/**
 * A query call shown as the stages it runs through — FROM, JOIN, WHERE,
 * GROUP BY, SELECT, ORDER BY — in the order the database runs them, not the
 * order they are written. As each stage finishes its clause lights, its bar
 * narrows from the previous stage's width to its own on `springs.snap`, and
 * its row counter falls from the previous count to its own on snap (rolling
 * digits, a tally, or the share of the source rows), so the stack of bars
 * reads as a funnel. The running clause carries an accent underline that
 * sweeps; when the last stage finishes the result table unfolds beneath on
 * `springs.glide` and its rows arrive in a `cascade()`.
 *
 * A slow stage is marked with its time and note; an empty result says which
 * clause removed the last rows; a syntax error outlines its clause, underlines
 * the token and leaves every count blank. Tab moves through the clauses and
 * the table; Enter on a clause opens the rows as they stood after it (Escape
 * closes). Under reduced motion clauses light and counts change without
 * travel, and the table opens in place.
 */
export function QueryStages({
  source = DEFAULT_SOURCE,
  statement = defaultQueryStatement,
  stages = defaultQueryStages,
  columns = defaultQueryColumns,
  rows = defaultQueryRows,
  status = "done",
  completed: completedProp,
  error = null,
  slowMs = 1000,
  onRerun,
  onOpenResult,
  onCopyQuery,
  onExplain,
  onInspectStage,
  format = defaultFormat,
  stageStyle = "funnel",
  counterStyle = "roll",
  accent = "var(--accent-bright)",
  tableRows = 4,
  label,
  className,
}: QueryStagesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const name = label ?? `${source.tool} on ${source.database}`;
  const n = stages.length;
  const completed =
    status === "done"
      ? n
      : Math.max(
          0,
          Math.min(n, completedProp ?? (status === "running" ? 0 : n)),
        );
  const sourceRows = stages[0]?.rows ?? 0;
  const maxRows = Math.max(1, ...stages.map((s) => s.rows));
  const totalMs = stages.reduce((sum, s) => sum + s.ms, 0);
  const slowStages = stages.filter((s) => s.ms > slowMs);
  const finished = status === "done" && completed >= n;
  const emptyAt = finished ? stages.findIndex((s) => s.rows === 0) : -1;
  const errorAt =
    status === "error" && error
      ? stages.findIndex((s) => s.id === error.stage)
      : -1;

  const stateOf = (i: number): StageState => {
    if (status === "loading") return "pending";
    if (status === "error") return i === errorAt ? "error" : "blocked";
    if (i < completed) return "done";
    if (i === completed && status === "running") return "running";
    return "pending";
  };

  /* ----------------------------- announcing ---------------------------- */

  const [announcement, setAnnouncement] = React.useState("");
  const sig = `${status}:${completed}:${error?.stage ?? ""}`;
  const [seen, setSeen] = React.useState(sig);
  // Counts and rows only travel once something has happened since mount: a
  // query rendered finished arrives finished, numbers and all.
  const [live, setLive] = React.useState(false);
  if (seen !== sig) {
    setSeen(sig);
    if (!live) setLive(true);
    if (status === "error" && error) {
      const at = stages.find((s) => s.id === error.stage);
      setAnnouncement(
        `Syntax error in ${at ? KEYWORD[at.clause] : "the query"}: ${error.message}.`,
      );
    } else if (finished) {
      setAnnouncement(
        `Query finished in ${msText(totalMs)}. ${plural(rows.length, "row", "rows", format)}${emptyAt >= 0 ? `; ${KEYWORD[stages[emptyAt]!.clause]} removed the last of them` : ""}.`,
      );
    } else if (status === "running" && completed > 0) {
      const s = stages[completed - 1];
      if (s)
        setAnnouncement(
          `${KEYWORD[s.clause]} done: ${plural(s.rows, "row", "rows", format)}.`,
        );
    } else if (status === "running") {
      setAnnouncement("Query running.");
    }
  }

  /* ------------------------------- peeks ------------------------------- */

  const [peek, setPeek] = React.useState<string | null>(null);
  const clauseRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const togglePeek = (s: QueryStage, i: number) => {
    if (stateOf(i) !== "done") {
      setAnnouncement(`${KEYWORD[s.clause]} hasn’t run yet.`);
      return;
    }
    const next = peek === s.id ? null : s.id;
    setPeek(next);
    if (next) {
      onInspectStage?.(s);
      setAnnouncement(
        `${KEYWORD[s.clause]}: ${plural(s.rows, "row", "rows", format)}${s.sample ? `, ${s.sample.rows.length} shown` : ""}.`,
      );
    }
  };

  /* ------------------------------ actions ------------------------------ */

  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(statement).catch(() => undefined);
    } catch {
      // No clipboard here; the host still hears about it.
    }
    onCopyQuery?.(statement);
    setCopied(true);
    setAnnouncement("Query copied.");
  };

  const busy = status === "running" || status === "loading";

  /* ------------------------------- layout ------------------------------ */

  const [bindResult, resultHeight] = useMeasured();
  const resultOpen = finished || status === "error";

  const vars = {
    "--qs-accent": accent,
    "--qs-wash": `color-mix(in oklab, ${accent} 11%, transparent)`,
    "--qs-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--qs-bar": `oklch(from ${accent} 0.62 c h)`,
    "--qs-bar-soft": `color-mix(in oklab, ${accent} 30%, transparent)`,
  } as React.CSSProperties;

  const chip =
    status === "loading"
      ? { text: "Loading", tone: "quiet" as const }
      : status === "error"
        ? {
            text: `Syntax error${error?.line ? ` · line ${error.line}` : ""}`,
            tone: "danger" as const,
          }
        : status === "running"
          ? {
              text: `Stage ${Math.min(n, completed + 1)} of ${n}`,
              tone: "accent" as const,
            }
          : slowStages.length
            ? { text: `Slow · ${msText(totalMs)}`, tone: "warn" as const }
            : emptyAt >= 0
              ? { text: `0 rows · ${msText(totalMs)}`, tone: "quiet" as const }
              : {
                  text: `${plural(rows.length, "row", "rows", format)} · ${msText(totalMs)}`,
                  tone: "accent" as const,
                };

  const chipClass = {
    accent: "border-(--qs-line) bg-(--qs-wash) text-foreground",
    warn: "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-foreground",
    danger:
      "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger",
    quiet: "border-hairline bg-surface-1 text-ink-2",
  }[chip.tone];

  const action = cn(
    "inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS,
  );
  const actionLabel = "sr-only @min-[40rem]/query-stages:not-sr-only";

  const rail = stageStyle === "rail";
  const rowH = 28;

  return (
    <section
      aria-label={name}
      aria-busy={busy || undefined}
      className={cn(
        "@container/query-stages flex max-h-[34rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={vars}
    >
      {/* Header: the call and what can be done with it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[13px] font-semibold">
            {source.tool}
          </span>
          <span className="rounded-1 border border-hairline bg-surface-1 px-1.5 font-mono text-[10.5px] leading-[18px] text-ink-3">
            {source.database}
          </span>
          <motion.span
            key={chip.text}
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] leading-none font-medium whitespace-nowrap tabular-nums",
              chipClass,
            )}
            initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {status === "running" ? (
              <LoaderCircle
                aria-hidden
                className="size-3 motion-safe:animate-spin"
              />
            ) : null}
            {slowStages.length && status === "done" ? (
              <Timer aria-hidden className="size-3 text-warn" />
            ) : null}
            {chip.text}
          </motion.span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={copy}
            className={action}
            title="Copy the query"
          >
            {copied ? (
              <Check
                aria-hidden
                className="size-3.5 shrink-0 text-(--qs-accent)"
              />
            ) : (
              <Copy aria-hidden className="size-3.5 shrink-0" />
            )}
            <span className={actionLabel}>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onExplain?.(statement);
              setAnnouncement("Explain requested.");
            }}
            className={action}
            title="Explain the plan"
          >
            <ListTree aria-hidden className="size-3.5 shrink-0" />
            <span className={actionLabel}>Explain</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              setPeek(null);
              onRerun?.();
            }}
            aria-disabled={busy || undefined}
            className={cn(action, busy && "opacity-50")}
            title="Run it again"
          >
            <RotateCw aria-hidden className="size-3.5 shrink-0" />
            <span className={actionLabel}>Re-run</span>
          </button>
        </div>
      </div>

      <div className="[min-height:0] flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 py-2">
        {/* The stages, in the order they run. */}
        <ol
          aria-label="Stages, in the order they run"
          className="flex flex-col"
        >
          {stages.map((s, i) => {
            const state = stateOf(i);
            const lit = state === "done";
            const prev = i > 0 ? (stages[i - 1]?.rows ?? s.rows) : s.rows;
            const w = shareOf(s.rows, maxRows);
            const pw = i > 0 ? shareOf(prev, maxRows) : w;
            const slow = lit && s.ms > slowMs;
            const isEmpty = emptyAt === i;
            const open = peek === s.id && lit;
            const fault = state === "error" ? error : null;
            const countText = (v: number) =>
              counterStyle === "share" ? shareText(v, sourceRows) : format(v);
            const nameText = `Step ${i + 1}, ${KEYWORD[s.clause]} ${s.text}. ${
              state === "done"
                ? `${plural(s.rows, "row", "rows", format)}${counterStyle === "share" ? `, ${shareText(s.rows, sourceRows)} of the source` : ""}, ${msText(s.ms)}${slow ? ", slow" : ""}`
                : state === "running"
                  ? "Running"
                  : state === "error"
                    ? `Error: ${fault?.message ?? ""}`
                    : state === "blocked"
                      ? "Not run"
                      : "Waiting"
            }`;
            const first = i === 0;
            const last = i === n - 1;

            let textNode: React.ReactNode = s.text;
            if (fault?.token) {
              const at = s.text.indexOf(fault.token);
              if (at >= 0)
                textNode = (
                  <>
                    {s.text.slice(0, at)}
                    <span className="underline decoration-danger decoration-wavy underline-offset-4">
                      {fault.token}
                    </span>
                    {s.text.slice(at + fault.token.length)}
                  </>
                );
            }

            const counter = (
              <span className="flex min-w-0 flex-col items-end">
                <span
                  className={cn(
                    "font-mono text-[12.5px] font-medium tabular-nums",
                    lit ? "text-foreground" : "text-ink-3",
                    isEmpty && "rounded-1 px-1 ring-1 ring-warn",
                  )}
                >
                  {lit ? (
                    counterStyle === "roll" ? (
                      <Roll
                        from={prev}
                        to={s.rows}
                        text={countText}
                        motionSafe={motionSafe && live}
                      />
                    ) : (
                      <Tally
                        from={prev}
                        to={s.rows}
                        text={countText}
                        motionSafe={motionSafe && live}
                      />
                    )
                  ) : (
                    <span style={{ lineHeight: `${LINE}px` }}>
                      {state === "running" ? "…" : "—"}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "font-mono text-[10.5px] leading-4 tabular-nums",
                    slow ? "text-warn" : "text-ink-3",
                  )}
                >
                  {lit
                    ? counterStyle === "share"
                      ? `${format(s.rows)} · ${msText(s.ms)}`
                      : msText(s.ms)
                    : state === "running"
                      ? "running"
                      : " "}
                </span>
              </span>
            );

            const meter = rail ? null : (
              <span
                aria-hidden
                className="relative block h-2 w-full overflow-hidden rounded-full bg-surface-2"
              >
                <motion.span
                  className={cn(
                    "absolute inset-y-0 rounded-full",
                    slow
                      ? "bg-[oklch(from_var(--warn)_0.76_c_h)]"
                      : "bg-(--qs-bar)",
                  )}
                  initial={false}
                  animate={{
                    width: `${lit ? w : pw}%`,
                    left:
                      stageStyle === "funnel"
                        ? `${Number(((100 - (lit ? w : pw)) / 2).toFixed(3))}%`
                        : "0%",
                    opacity: lit ? 1 : state === "running" ? 0.35 : 0,
                  }}
                  transition={
                    motionSafe
                      ? {
                          width: springs.snap,
                          left: springs.snap,
                          opacity: { duration: durations.base },
                        }
                      : { duration: durations.fast }
                  }
                />
              </span>
            );

            return (
              <li key={s.id} className="relative">
                {rail ? (
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0 left-[9px] w-[2px]"
                  >
                    {!first ? (
                      <span className="absolute top-0 h-[17px] w-full bg-hairline-strong" />
                    ) : null}
                    {!last ? (
                      <span className="absolute top-[17px] bottom-0 w-full bg-hairline-strong" />
                    ) : null}
                    {!last ? (
                      <motion.span
                        className="absolute top-[17px] bottom-0 w-full bg-(--qs-accent)"
                        initial={false}
                        animate={{
                          scaleY:
                            i + 1 < completed || (finished && !last) ? 1 : 0,
                        }}
                        transition={
                          motionSafe ? springs.glide : { duration: 0 }
                        }
                        style={{ originY: 0 }}
                      />
                    ) : null}
                  </span>
                ) : null}
                <button
                  ref={(node) => {
                    clauseRefs.current.set(s.id, node);
                  }}
                  type="button"
                  aria-label={nameText}
                  aria-expanded={lit ? open : undefined}
                  aria-controls={lit ? `${uid}-peek-${s.id}` : undefined}
                  onClick={() => togglePeek(s, i)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && open) {
                      event.preventDefault();
                      setPeek(null);
                    }
                  }}
                  className={cn(
                    "relative grid w-full grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 rounded-2 py-1.5 pr-2 text-left transition-colors",
                    rail
                      ? "@min-[40rem]/query-stages:grid-cols-[1.25rem_minmax(0,1fr)_8rem]"
                      : "@min-[40rem]/query-stages:grid-cols-[1.25rem_minmax(0,1fr)_9rem_6.5rem]",
                    open
                      ? "bg-(--qs-wash)"
                      : lit
                        ? "hover:bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]"
                        : "",
                    state === "error" &&
                      "bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--danger)_55%,transparent)]",
                    FOCUS,
                  )}
                >
                  {/* Step number, or the rail's node. */}
                  <span className="flex h-5 items-center justify-center">
                    {rail ? (
                      <motion.span
                        className={cn(
                          "relative z-10 size-2.5 rounded-full border-2 transition-colors",
                          lit
                            ? "border-(--qs-accent) bg-(--qs-accent)"
                            : state === "running"
                              ? "border-(--qs-accent) bg-card"
                              : state === "error"
                                ? "border-danger bg-danger"
                                : "border-hairline-strong bg-card",
                        )}
                        initial={false}
                        animate={{
                          scale: lit ? 1 : state === "running" ? 1.25 : 1,
                        }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    ) : (
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full border font-mono text-[10px] tabular-nums transition-colors",
                          lit
                            ? "border-(--qs-line) bg-(--qs-wash) text-foreground"
                            : state === "running"
                              ? "border-(--qs-accent) text-(--qs-accent)"
                              : state === "error"
                                ? "border-danger text-danger"
                                : "border-hairline text-ink-3",
                        )}
                      >
                        {i + 1}
                      </span>
                    )}
                  </span>

                  {/* The clause. */}
                  <span className="relative flex min-w-0 flex-col gap-1">
                    <span className="font-mono text-[12px] leading-5 [overflow-wrap:anywhere]">
                      <span
                        className={cn(
                          "mr-2 text-[11px] font-semibold tracking-[0.04em] transition-colors",
                          lit || state === "running"
                            ? "text-(--qs-accent)"
                            : state === "error"
                              ? "text-danger"
                              : "text-ink-3",
                        )}
                      >
                        {KEYWORD[s.clause]}
                      </span>
                      <span
                        className={cn(
                          "transition-colors",
                          lit || state === "error"
                            ? "text-foreground"
                            : state === "running"
                              ? "text-ink-2"
                              : "text-ink-3",
                        )}
                      >
                        {textNode}
                      </span>
                    </span>
                    {state === "running" && motionSafe ? (
                      <span
                        aria-hidden
                        className="relative block h-px w-full overflow-hidden bg-hairline"
                      >
                        <motion.span
                          className="absolute inset-y-0 w-1/4 bg-(--qs-accent)"
                          initial={{ left: "0%" }}
                          animate={{ left: ["0%", "75%"] }}
                          transition={{
                            duration: 0.8,
                            ease: easings.move,
                            repeat: Infinity,
                            repeatType: "reverse",
                          }}
                        />
                      </span>
                    ) : null}
                    {slow && s.note ? (
                      <span className="flex items-start gap-1.5 text-[11.5px] leading-4 text-ink-2">
                        <Timer
                          aria-hidden
                          className="mt-px size-3 shrink-0 text-warn"
                        />
                        {s.note}
                      </span>
                    ) : null}
                    {fault ? (
                      <span className="flex items-start gap-1.5 text-[11.5px] leading-4 text-danger">
                        <CircleX
                          aria-hidden
                          className="mt-px size-3 shrink-0"
                        />
                        {`${fault.message}${fault.line ? ` · line ${fault.line}` : ""}`}
                      </span>
                    ) : null}
                  </span>

                  {/* Meter and counter: beside the clause, or under it on a phone. */}
                  <span
                    className={cn(
                      "col-start-2 flex min-w-0 items-center gap-3",
                      rail
                        ? "@min-[40rem]/query-stages:col-start-3 @min-[40rem]/query-stages:row-start-1 @min-[40rem]/query-stages:justify-end"
                        : "@min-[40rem]/query-stages:contents",
                    )}
                  >
                    {meter ? (
                      <span className="block flex-1 @min-[40rem]/query-stages:col-start-3 @min-[40rem]/query-stages:row-start-1 @min-[40rem]/query-stages:mt-1.5 @min-[40rem]/query-stages:self-start">
                        {meter}
                      </span>
                    ) : null}
                    <span className="w-24 shrink-0 @min-[40rem]/query-stages:col-start-4 @min-[40rem]/query-stages:row-start-1 @min-[40rem]/query-stages:w-auto">
                      {counter}
                    </span>
                  </span>
                </button>

                <Peek
                  id={`${uid}-peek-${s.id}`}
                  stage={s}
                  open={open}
                  format={format}
                  motionSafe={motionSafe}
                  onEscape={() => {
                    setPeek(null);
                    clauseRefs.current.get(s.id)?.focus();
                  }}
                />
              </li>
            );
          })}
        </ol>

        {/* The result, unfolding once the last stage is done. */}
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{
            height: resultOpen ? resultHeight : 0,
            opacity: resultOpen ? 1 : 0,
          }}
          transition={
            motionSafe
              ? {
                  height: springs.glide,
                  opacity: { duration: durations.base, ease: easings.enter },
                }
              : { duration: durations.fast }
          }
          inert={!resultOpen}
        >
          <div ref={bindResult} className="pt-2">
            {status === "error" ? (
              <p className="rounded-2 border border-dashed border-hairline-strong px-3 py-2.5 text-[12px] text-ink-2">
                Nothing ran. Fix the clause marked above and run it again.
              </p>
            ) : emptyAt >= 0 ? (
              <div className="rounded-2 border border-dashed border-hairline-strong px-3 py-2.5">
                <p className="text-[12.5px] font-medium text-foreground">
                  No rows.
                </p>
                <p className="text-[12px] text-ink-2">
                  {`${KEYWORD[stages[emptyAt]!.clause]} removed the last ${plural(
                    emptyAt > 0 ? (stages[emptyAt - 1]?.rows ?? 0) : 0,
                    "row",
                    "rows",
                    format,
                  )}.`}
                </p>
              </div>
            ) : (
              <ResultTable
                columns={columns}
                rows={rows}
                total={totalMs}
                format={format}
                tableRows={tableRows}
                rowH={rowH}
                play={finished && motionSafe && live}
                onOpen={() => onOpenResult?.(rows)}
              />
            )}
          </div>
        </motion.div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/*                         A stage's rows, on Enter                          */
/* ----------------------------------------------------------------------- */

function Peek({
  id,
  stage,
  open,
  format,
  motionSafe,
  onEscape,
}: {
  id: string;
  stage: QueryStage;
  open: boolean;
  format: (n: number) => string;
  motionSafe: boolean;
  onEscape: () => void;
}) {
  const [bind, height] = useMeasured();
  const sample = stage.sample;
  const more = sample ? Math.max(0, stage.rows - sample.rows.length) : 0;
  return (
    <motion.div
      id={id}
      className="overflow-hidden"
      initial={false}
      animate={{ height: open ? height : 0, opacity: open ? 1 : 0 }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
      inert={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onEscape();
        }
      }}
    >
      <div ref={bind} className="pt-1 pb-2 pl-8">
        <div className="rounded-2 border border-hairline bg-surface-0 px-2.5 py-2">
          {sample ? (
            <>
              <div className="[scrollbar-width:thin] overflow-x-auto">
                <table className="w-full font-mono text-[11px] tabular-nums">
                  <caption className="sr-only">{`Rows after ${KEYWORD[stage.clause]}`}</caption>
                  <thead>
                    <tr>
                      {sample.columns.map((c) => (
                        <th
                          key={c}
                          scope="col"
                          className="pr-3 pb-1 text-left font-normal whitespace-nowrap text-ink-3"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sample.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((v, ci) => (
                          <td
                            key={ci}
                            className="pr-3 whitespace-nowrap text-ink-2"
                          >
                            {typeof v === "number" ? format(v) : v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="pt-1 font-mono text-[10.5px] text-ink-3">
                {more
                  ? `and ${plural(more, "more row", "more rows", format)} at this stage`
                  : "every row at this stage"}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-ink-2">
              {`${plural(stage.rows, "row", "rows", format)} after ${KEYWORD[stage.clause]}. Rows at this stage aren’t kept; Explain shows the plan.`}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The result                                 */
/* ----------------------------------------------------------------------- */

function ResultTable({
  columns,
  rows,
  total,
  format,
  tableRows,
  rowH,
  play,
  onOpen,
}: {
  columns: QueryColumn[];
  rows: QueryRow[];
  total: number;
  format: (n: number) => string;
  tableRows: number;
  rowH: number;
  play: boolean;
  onOpen: () => void;
}) {
  const step = cascade(Math.min(rows.length, 10));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {`Result · ${plural(rows.length, "row", "rows", format)} · ${msText(total)}`}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <ExternalLink aria-hidden className="size-3.5 shrink-0" />
          Open
        </button>
      </div>
      <div
        tabIndex={0}
        role="region"
        aria-label={`Result, ${plural(rows.length, "row", "rows", format)}`}
        className={cn(
          "[scrollbar-width:thin] overflow-auto overscroll-contain rounded-2 border border-hairline",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ maxHeight: (tableRows + 1) * rowH + 2 }}
      >
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <caption className="sr-only">Query result</caption>
          <colgroup>
            {columns.map((c) => (
              <col
                key={c.key}
                className={cn(
                  c.hideNarrow &&
                    "hidden @min-[40rem]/query-stages:table-column",
                )}
                style={c.width ? { width: c.width } : undefined}
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-1">
            <tr className="border-b border-(--qs-line)">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-2.5 font-mono text-[10.5px] font-medium tracking-[0.04em] text-ink-2",
                    c.align === "right" ? "text-right" : "text-left",
                    c.hideNarrow &&
                      "hidden @min-[40rem]/query-stages:table-cell",
                  )}
                  style={{ height: rowH }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <motion.tr
                key={ri}
                className="border-b border-hairline last:border-b-0"
                initial={play ? { opacity: 0, y: distances.nudge } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...springs.glide,
                  delay: Number((Math.min(ri, 9) * step + 0.12).toFixed(3)),
                  opacity: {
                    duration: durations.base,
                    delay: Number((Math.min(ri, 9) * step + 0.12).toFixed(3)),
                  },
                }}
              >
                {columns.map((c) => {
                  const v = r[c.key];
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        "truncate px-2.5",
                        c.align === "right"
                          ? "text-right font-mono tabular-nums"
                          : "text-left",
                        c.key === columns[0]?.key
                          ? "font-mono text-[12px] text-ink-2"
                          : "text-foreground",
                        c.hideNarrow &&
                          "hidden @min-[40rem]/query-stages:table-cell",
                      )}
                      style={{ height: rowH }}
                      title={typeof v === "string" ? v : undefined}
                    >
                      {typeof v === "number" ? format(v) : (v ?? "")}
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
