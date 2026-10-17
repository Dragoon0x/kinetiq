"use client";

import * as React from "react";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRerunNow,
  RerunBench,
  type RerunBenchArgs,
  type RerunBenchRun,
  type RerunBenchStatus,
  type RerunBenchValue,
} from "@/registry/ui/rerun-bench";

export const tweaks = defineTweaks({
  diffStyle: {
    kind: "choice",
    label: "Diff",
    default: "gutter",
    options: ["gutter", "inline", "wash"],
    names: { gutter: "Gutter", inline: "Inline", wash: "Wash" },
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
      "oklch(from var(--accent-bright) l c 300)",
      "var(--warn)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "oklch(from var(--accent-bright) l c 300)": "Plum",
      "var(--warn)": "Amber",
    },
  },
});

/* ------------------------------------------------------------------------ */
/*          A tiny Fernworks CRM: the same arguments, the same answer        */
/* ------------------------------------------------------------------------ */

const INVOICES = [
  { number: "INV-8590", date: "2026-08-14", eur: 620, paid: true },
  { number: "INV-8812", date: "2026-09-14", eur: 620, paid: true },
  { number: "INV-9034", date: "2026-10-14", eur: 680, paid: false },
];
const RATE: Record<string, { rate: number; sign: string }> = {
  EUR: { rate: 1, sign: "€" },
  USD: { rate: 1.09, sign: "$" },
  GBP: { rate: 0.86, sign: "£" },
};
const DAY = 86_400_000;
const toDay = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const failure = (code: string, message: string) => ({
  response: { error: { code, message } } as RerunBenchValue,
  error: true,
});

function lookup(args: RerunBenchArgs): {
  response: RerunBenchValue;
  ms: number;
  error: boolean;
} {
  const ms =
    150 +
    (hash(JSON.stringify(args)) % 60) +
    (args.include === "full" ? 40 : args.include === "billing" ? 20 : 0);
  const id = String(args.customer_id ?? "")
    .trim()
    .toUpperCase();
  if (id !== "C-20417")
    return {
      ...failure("not_found", `No customer ${id || "with an empty id"}`),
      ms: 64,
    };
  const asOf = String(args.as_of ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf))
    return {
      ...failure("invalid_argument", "as_of must be YYYY-MM-DD"),
      ms: 58,
    };
  const max = args.max_invoices;
  if (typeof max !== "number" || max < 0 || max > 12)
    return {
      ...failure("invalid_argument", "max_invoices must be 0 to 12"),
      ms: 58,
    };
  const cur = RATE[String(args.currency)] ?? RATE.EUR!;
  const money = (eur: number) => `${cur.sign}${(eur * cur.rate).toFixed(2)}`;
  const day = toDay(asOf);
  const issued = INVOICES.filter((inv) => toDay(inv.date) <= day);
  const open = issued.filter((inv) => !inv.paid);
  const late = open.some((inv) => day - toDay(inv.date) > 30 * DAY);
  const lastInv = issued[issued.length - 1];

  const out: { [key: string]: RerunBenchValue } = {
    id,
    name: "Larkspur Studio",
    plan: "Team",
    seats: day >= toDay("2026-10-10") ? 14 : 13,
  };
  if (args.include_archived === true) out.seats_archived = 3;
  out.status = late ? "past_due" : "active";
  if (args.include !== "summary") {
    out.balance = money(open.reduce((sum, inv) => sum + inv.eur, 0));
    out.last_invoice = lastInv
      ? {
          number: lastInv.number,
          date: lastInv.date,
          amount: money(lastInv.eur),
          status: lastInv.paid ? "paid" : "open",
        }
      : null;
    out.invoices = issued
      .slice()
      .reverse()
      .slice(0, max)
      .map((inv) => inv.number);
  }
  if (args.include === "full") {
    out.owner = "Ines Varga";
    out.created = "2023-03-02";
    out.flags = ["net-30"];
  }
  return { response: out, ms, error: false };
}

const RECORDED: RerunBenchArgs = {
  customer_id: "C-20417",
  as_of: "2026-10-01",
  include: "billing",
  currency: "EUR",
  max_invoices: 2,
  include_archived: false,
};

function makeRun(
  id: string,
  args: RerunBenchArgs,
  at: number,
  extra: Partial<RerunBenchRun> = {},
): RerunBenchRun {
  const result = lookup(args);
  return {
    id,
    args,
    at,
    response: result.response,
    ms: result.ms,
    error: result.error || undefined,
    ...extra,
  };
}

const FIRST_RUNS: RerunBenchRun[] = [
  makeRun("run-1", RECORDED, defaultRerunNow - 6 * 60_000, { recorded: true }),
  makeRun(
    "run-2",
    { ...RECORDED, as_of: "2026-10-15" },
    defaultRerunNow - 3 * 60_000,
    { from: "run-1" },
  ),
];

/**
 * Fernworks support: the assistant looked up Larkspur Studio's billing as of
 * 1 October. The bench re-runs that call against a small, deterministic CRM.
 */
export function RerunBenchDemo({
  chrome = true,
  // The bench is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [runs, setRuns] = React.useState<RerunBenchRun[]>(FIRST_RUNS);
  const [run, setRun] = React.useState("run-2");
  const [args, setArgs] = React.useState<RerunBenchArgs>(FIRST_RUNS[1]!.args);
  const [status, setStatus] = React.useState<RerunBenchStatus>("ready");
  const [error, setError] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const timer = React.useRef<number | null>(null);
  const runsRef = React.useRef(runs);
  React.useEffect(() => {
    runsRef.current = runs;
  }, [runs]);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = React.useState(false);

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

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const rerun = React.useCallback(
    (next: RerunBenchArgs, from: string) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setStatus("running");
      setError(null);
      const result = lookup(next);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setStatus("ready");
        if (failNext) {
          setFailNext(false);
          setError("fernworks-crm didn’t answer within 5 s.");
          return;
        }
        const list = runsRef.current;
        const fresh: RerunBenchRun = {
          id: `run-${list.length + 1}`,
          from,
          args: next,
          at: defaultRerunNow,
          response: result.response,
          ms: result.ms,
          error: result.error || undefined,
        };
        setRuns([...list, fresh]);
        setRun(fresh.id);
        setArgs(fresh.args);
      }, 620 + result.ms);
    },
    [failNext],
  );

  // The gallery card shows the bench once: an argument changes, the answer
  // goes stale, and the fresh one streams over it.
  const [tour, setTour] = React.useState(0);
  React.useEffect(() => {
    if (chrome || !inView || tour >= 2) return;
    const t = window.setTimeout(
      () => {
        if (tour === 0) setArgs((a) => ({ ...a, currency: "USD" }));
        else rerun({ ...FIRST_RUNS[1]!.args, currency: "USD" }, "run-2");
        setTour((n) => n + 1);
      },
      tour === 0 ? 1100 : 1300,
    );
    return () => window.clearTimeout(t);
  }, [chrome, inView, tour, rerun]);

  const surface = (
    <RerunBench
      key={round}
      runs={runs}
      run={run}
      onRunChange={setRun}
      args={args}
      onArgsChange={setArgs}
      onRerun={rerun}
      status={status}
      error={error}
      now={defaultRerunNow}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const shown = runs.find((r) => r.id === run) ?? runs[runs.length - 1];
  const index = shown ? runs.indexOf(shown) + 1 : 0;
  const edits = shown
    ? Object.keys(args).filter(
        (k) => JSON.stringify(args[k]) !== JSON.stringify(shown.args[k]),
      )
    : [];
  const from = shown?.from ? runs.findIndex((r) => r.id === shown.from) + 1 : 0;
  const line =
    status === "running"
      ? "running · lookup_customer"
      : error
        ? "failed · retry from the bench"
        : edits.length
          ? `stale · ${edits.join(", ")} edited`
          : shown
            ? `run #${index} of ${runs.length} · ${shown.ms} ms${shown.error ? " · tool error" : from ? ` · re-run of #${from}` : " · recorded"}`
            : "ready";

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Fernworks support · Larkspur Studio · billing question
      </p>
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={cn(
            button,
            failNext &&
              "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] text-danger hover:text-danger",
          )}
        >
          <TriangleAlert aria-hidden className="size-3.5" />
          Fail next run
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            setRuns(FIRST_RUNS);
            setRun("run-2");
            setArgs(FIRST_RUNS[1]!.args);
            setStatus("ready");
            setError(null);
            setFailNext(false);
            setRound((r) => r + 1);
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
        <span className="text-signal">{line}</span>
        {" · fernworks crm"}
      </p>
    </div>
  );
}
