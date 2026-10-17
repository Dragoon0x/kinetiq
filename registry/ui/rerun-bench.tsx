"use client";

import * as React from "react";

import { motion } from "motion/react";
import {
  Check,
  FlaskConical,
  LoaderCircle,
  Play,
  RotateCcw,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

/** Any JSON value a tool can return. */
export type RerunBenchValue =
  | string
  | number
  | boolean
  | null
  | RerunBenchValue[]
  | { [key: string]: RerunBenchValue };

export type RerunBenchArgValue = string | number | boolean;
export type RerunBenchArgs = Record<string, RerunBenchArgValue>;

export type RerunBenchParam = {
  name: string;
  /** Picks the field: a text box, a number box, a switch or a select. */
  type: "string" | "number" | "boolean" | "enum";
  /** The choices of an enum. */
  options?: string[];
  /** One line on what the argument does, read with the field. */
  description?: string;
  required?: boolean;
};

export type RerunBenchCall = {
  /** The tool's name as the assistant called it. */
  tool: string;
  /** The server the tool lives on. */
  server: string;
  description?: string;
  /** Every argument the tool takes, in the order to show them. */
  params: RerunBenchParam[];
};

export type RerunBenchRun = {
  id: string;
  /** The arguments this run was called with. */
  args: RerunBenchArgs;
  /** What came back. For a tool error, the error body. */
  response: RerunBenchValue;
  /** How long the call took, ms. */
  ms: number;
  /** When it ran, ms since the epoch. */
  at: number;
  /** The run this one was re-run from; marks are drawn against it. */
  from?: string;
  /** The call as the assistant originally made it. */
  recorded?: boolean;
  /** The tool answered with an error body. */
  error?: boolean;
};

export type RerunBenchStatus = "ready" | "loading" | "running";
export type RerunBenchDiffStyle = "gutter" | "inline" | "wash";
export type RerunBenchDensity = "compact" | "cozy" | "roomy";

export type RerunBenchProps = {
  /** The tool and the arguments it takes. @default defaultRerunCall */
  call?: RerunBenchCall;
  /** Every run, oldest first; the first is usually the recorded call. @default defaultRerunRuns */
  runs?: RerunBenchRun[];
  /** Controlled: the id of the run on the bench. */
  run?: string;
  /** Initial run when uncontrolled. @default the newest run */
  defaultRun?: string;
  /** Fires from the pick or the Alt+Up/Down step that changed the run. */
  onRunChange?: (id: string) => void;
  /** Controlled argument draft. Uncontrolled, it starts as the shown run's arguments. */
  args?: RerunBenchArgs;
  /** Fires from every edit, restore or run change, with the whole draft. */
  onArgsChange?: (args: RerunBenchArgs) => void;
  /** Re-run (or Cmd/Ctrl+Enter): call the tool with these arguments. */
  onRerun?: (args: RerunBenchArgs, fromRunId: string) => void;
  /** Restore: the draft went back to this run's arguments. */
  onRestore?: (runId: string) => void;
  /** Save as test: keep this run's arguments and response as a test case. */
  onSaveAsTest?: (run: RerunBenchRun) => void;
  /** loading: the record is not here yet; running: a re-run is out. @default "ready" */
  status?: RerunBenchStatus;
  /** The last re-run never came back; shown over the response with Retry. @default null */
  error?: string | null;
  /** The moment "3 min ago" counts from, ms. @default defaultRerunNow */
  now?: number;
  /** What a run's marks are drawn against: the run it came from, or the recorded call. @default "previous" */
  baseline?: "previous" | "recorded";
  /** How a changed field keeps its mark: a gutter bar, the old value struck through, or a wash. @default "gutter" */
  diffStyle?: RerunBenchDiffStyle;
  /** Row height and type size. @default "cozy" */
  density?: RerunBenchDensity;
  /** Selection, change marks, the sweep and Re-run — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long a fresh response takes to stream over the stale one, ms. @default 520 */
  streamMs?: number;
  /** The bench's accessible name. @default "<tool> rerun bench" */
  label?: string;
  /** Read only: nothing can be edited or re-run. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** A fixed morning, so the default bench renders the same everywhere. */
export const defaultRerunNow = Date.UTC(2026, 9, 16, 10, 24);
const MIN = 60_000;

export const defaultRerunCall: RerunBenchCall = {
  tool: "lookup_customer",
  server: "fernworks-crm",
  description:
    "Finds a customer account and returns its plan, seats and billing state.",
  params: [
    {
      name: "customer_id",
      type: "string",
      required: true,
      description: "Account id: C- and five digits.",
    },
    {
      name: "as_of",
      type: "string",
      description: "Billing state on this date, YYYY-MM-DD.",
    },
    {
      name: "include",
      type: "enum",
      options: ["summary", "billing", "full"],
      description: "How much of the account to return.",
    },
    {
      name: "currency",
      type: "enum",
      options: ["EUR", "USD", "GBP"],
      description: "Currency for every amount.",
    },
    {
      name: "max_invoices",
      type: "number",
      description: "Newest invoices to list, 0 to 12.",
    },
    {
      name: "include_archived",
      type: "boolean",
      description: "Count archived seats too.",
    },
  ],
};

export const defaultRerunRuns: RerunBenchRun[] = [
  {
    id: "run-1",
    recorded: true,
    at: defaultRerunNow - 6 * MIN,
    ms: 182,
    args: {
      customer_id: "C-20417",
      as_of: "2026-10-01",
      include: "billing",
      currency: "EUR",
      max_invoices: 2,
      include_archived: false,
    },
    response: {
      id: "C-20417",
      name: "Larkspur Studio",
      plan: "Team",
      seats: 13,
      status: "active",
      balance: "€0.00",
      last_invoice: {
        number: "INV-8812",
        date: "2026-09-14",
        amount: "€620.00",
        status: "paid",
      },
      invoices: ["INV-8812", "INV-8590"],
    },
  },
  {
    id: "run-2",
    from: "run-1",
    at: defaultRerunNow - 3 * MIN,
    ms: 204,
    args: {
      customer_id: "C-20417",
      as_of: "2026-10-15",
      include: "billing",
      currency: "EUR",
      max_invoices: 2,
      include_archived: false,
    },
    response: {
      id: "C-20417",
      name: "Larkspur Studio",
      plan: "Team",
      seats: 14,
      status: "active",
      balance: "€680.00",
      last_invoice: {
        number: "INV-9034",
        date: "2026-10-14",
        amount: "€680.00",
        status: "open",
      },
      invoices: ["INV-9034", "INV-8812"],
    },
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

type Tone = "string" | "number" | "literal" | "object";

type Row = {
  path: string;
  key: string;
  depth: number;
  text: string;
  tone: Tone;
};

type Change = "same" | "changed" | "added" | "removed";
type ShownRow = Row & { change: Change; was?: string };

const isRecord = (v: unknown): v is { [key: string]: RerunBenchValue } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** One value as it reads in the response: strings quoted, arrays inline. */
function show(value: RerunBenchValue): string {
  if (typeof value === "string") return `"${value}"`;
  if (Array.isArray(value)) return `[${value.map(show).join(", ")}]`;
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

const toneOf = (value: RerunBenchValue): Tone =>
  typeof value === "string"
    ? "string"
    : typeof value === "number"
      ? "number"
      : "literal";

/** The response as indented rows; objects open into groups. */
function flatten(
  value: RerunBenchValue,
  path = "",
  depth = 0,
  out: Row[] = [],
): Row[] {
  if (!isRecord(value)) {
    if (depth === 0)
      out.push({
        path: "$",
        key: "result",
        depth,
        text: show(value),
        tone: toneOf(value),
      });
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const p = path ? `${path}.${key}` : key;
    if (isRecord(child)) {
      const n = Object.keys(child).length;
      out.push({
        path: p,
        key,
        depth,
        text: `{ ${n} ${n === 1 ? "field" : "fields"} }`,
        tone: "object",
      });
      flatten(child, p, depth + 1, out);
    } else {
      out.push({ path: p, key, depth, text: show(child), tone: toneOf(child) });
    }
  }
  return out;
}

/**
 * Rows of `next` marked against `base`. Fields that went away are kept as
 * struck rows where they used to sit, so a vanished field is as plain as a
 * changed one.
 */
function diffRows(next: Row[], base: Row[] | null): ShownRow[] {
  if (!base) return next.map((r) => ({ ...r, change: "same" }));
  const before = new Map(base.map((r) => [r.path, r]));
  const now = new Set(next.map((r) => r.path));
  const out: ShownRow[] = next.map((r) => {
    const old = before.get(r.path);
    if (!old) return { ...r, change: "added" };
    if (r.tone === "object" || old.text === r.text)
      return { ...r, change: "same" };
    return { ...r, change: "changed", was: old.text };
  });
  base.forEach((r, i) => {
    if (now.has(r.path)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prev = base[j];
      const k = prev ? out.findIndex((o) => o.path === prev.path) : -1;
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, { ...r, change: "removed" });
  });
  return out;
}

const sameArg = (
  a: RerunBenchArgValue | undefined,
  b: RerunBenchArgValue | undefined,
) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const showArg = (v: RerunBenchArgValue | undefined) =>
  v === undefined ? "unset" : typeof v === "string" ? `"${v}"` : String(v);

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const DENSITY: Record<
  RerunBenchDensity,
  { row: string; text: string; field: string; gap: string }
> = {
  compact: { row: "py-0.5", text: "text-[12px]", field: "h-7", gap: "gap-1.5" },
  cozy: { row: "py-1", text: "text-[12.5px]", field: "h-8", gap: "gap-2" },
  roomy: { row: "py-1.5", text: "text-[13px]", field: "h-9", gap: "gap-2.5" },
};

/* ----------------------------------------------------------------------- */
/*                                The bench                                 */
/* ----------------------------------------------------------------------- */

/**
 * A bench for one recorded tool call. The call's arguments sit on the left
 * as real fields and its response on the right as indented rows; change any
 * argument and the response dims where it is, marked Stale, because it no
 * longer answers what the fields say.
 *
 * Re-running keeps it dimmed while a hairline loops down the pane. When the
 * fresh run arrives, one accent line sweeps down over `streamMs` and, as it
 * passes each row, the stale value fades and the new one drops in from 4px on
 * `springs.flick`; fields that differ flash once on a tween and keep a change
 * mark that grows in on `springs.snap`, so what the argument did is plain. An
 * identical answer lands a quiet chip on snap and flashes nothing. The run
 * strip keeps every run with a bar for its time; the selection slides on snap.
 *
 * Cmd or Ctrl+Enter re-runs from anywhere in the bench, Alt+Up and Alt+Down
 * step through the runs, the strip is a radiogroup on the arrow keys, and
 * Escape in an edited field puts that argument back. Under reduced motion the
 * values cross-fade and the marks simply appear.
 */
export function RerunBench({
  call = defaultRerunCall,
  runs = defaultRerunRuns,
  run: runProp,
  defaultRun,
  onRunChange,
  args: argsProp,
  onArgsChange,
  onRerun,
  onRestore,
  onSaveAsTest,
  status = "ready",
  error = null,
  now = defaultRerunNow,
  baseline = "previous",
  diffStyle = "gutter",
  density = "cozy",
  accent = "var(--accent-bright)",
  streamMs = 520,
  label,
  disabled = false,
  className,
}: RerunBenchProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;
  const name = label ?? `${call.tool} rerun bench`;

  /* -------------------------------- runs -------------------------------- */

  const last = runs[runs.length - 1];
  const [ownRun, setOwnRun] = React.useState(defaultRun ?? last?.id ?? "");
  const wanted = runProp ?? ownRun;
  const current = runs.find((r) => r.id === wanted) ?? last;
  const index = current ? runs.indexOf(current) : -1;
  const numberOf = (id: string | undefined) =>
    runs.findIndex((r) => r.id === id) + 1;

  const baseOf = React.useCallback(
    (r: RerunBenchRun | undefined): RerunBenchRun | null => {
      if (!r) return null;
      const i = runs.indexOf(r);
      if (baseline === "recorded") {
        const rec = runs.find((x) => x.recorded) ?? runs[0];
        return rec && rec !== r ? rec : null;
      }
      if (r.from) return runs.find((x) => x.id === r.from) ?? null;
      return i > 0 ? (runs[i - 1] ?? null) : null;
    },
    [baseline, runs],
  );

  /* ------------------------------- draft -------------------------------- */

  const [ownArgs, setOwnArgs] = React.useState<RerunBenchArgs>(
    () => current?.args ?? {},
  );
  const [argsFor, setArgsFor] = React.useState(current?.id ?? "");
  if (current && argsFor !== current.id) {
    // A different run is on the bench: its arguments are the new draft.
    setArgsFor(current.id);
    setOwnArgs(current.args);
  }
  const draft = argsProp ?? ownArgs;
  const edited = call.params.filter(
    (p) => !sameArg(draft[p.name], current?.args[p.name]),
  );
  const stale = edited.length > 0;

  /* ----------------------------- announcing ----------------------------- */

  const [announcement, setAnnouncement] = React.useState("");

  /* ------------------------ fresh runs and sweeps ----------------------- */

  const ids = runs.map((r) => r.id).join("|");
  const [known, setKnown] = React.useState(ids);
  const [pendingFresh, setPendingFresh] = React.useState<string | null>(null);
  const [lastShown, setLastShown] = React.useState(current?.id ?? "");
  const [stream, setStream] = React.useState<{
    id: string;
    over: string;
    n: number;
  } | null>(null);
  const [streamCount, setStreamCount] = React.useState(0);

  let freshNow = pendingFresh;
  if (known !== ids) {
    const before = new Set(known.split("|"));
    const fresh = runs.filter((r) => !before.has(r.id));
    const newest = fresh[fresh.length - 1];
    setKnown(ids);
    if (newest) {
      freshNow = newest.id;
      setPendingFresh(newest.id);
      // Uncontrolled, the bench moves to what just came back; a host that
      // controls `run` selects it itself.
      if (runProp === undefined && ownRun !== newest.id) setOwnRun(newest.id);
    }
  }

  const describe = (r: RerunBenchRun): string => {
    const n = numberOf(r.id);
    if (r.error) {
      const body = isRecord(r.response) ? r.response.error : null;
      const msg =
        isRecord(body) && typeof body.message === "string"
          ? body.message
          : "the tool returned an error";
      return `Run ${n} came back with an error in ${r.ms} ms: ${msg}.`;
    }
    const base = baseOf(r);
    if (!base) return `Run ${n} came back in ${r.ms} ms.`;
    const rows = diffRows(flatten(r.response), flatten(base.response)).filter(
      (x) => x.change !== "same",
    );
    if (rows.length === 0)
      return `Run ${n} came back in ${r.ms} ms with the same result as run ${numberOf(base.id)}.`;
    const names = rows.slice(0, 4).map((x) => x.path);
    return `Run ${n} came back in ${r.ms} ms. ${plural(rows.length, "field", "fields")} changed: ${names.join(", ")}${rows.length > 4 ? " and more" : ""}.`;
  };

  if (current && lastShown !== current.id) {
    setLastShown(current.id);
    if (freshNow === current.id) {
      setStream({ id: current.id, over: lastShown, n: streamCount + 1 });
      setStreamCount((c) => c + 1);
      setPendingFresh(null);
      setAnnouncement(describe(current));
    } else {
      setStream(null);
    }
  }

  // The stale layer is only drawn until the sweep has passed the last row.
  React.useEffect(() => {
    if (!stream) return;
    const t = window.setTimeout(
      () => setStream(null),
      Math.round(streamMs + (motionSafe ? 900 : 200)),
    );
    return () => window.clearTimeout(t);
  }, [stream, streamMs, motionSafe]);

  const [seenError, setSeenError] = React.useState(error);
  if (seenError !== error) {
    setSeenError(error);
    if (error) setAnnouncement(`The re-run failed: ${error}`);
  }

  /* ------------------------------ actions ------------------------------- */

  const busy = status === "running";
  const locked = disabled || status === "loading";

  const setDraft = (next: RerunBenchArgs) => {
    if (argsProp === undefined) setOwnArgs(next);
    onArgsChange?.(next);
  };

  const editArg = (param: string, value: RerunBenchArgValue) => {
    if (locked) return;
    const next = { ...draft, [param]: value };
    const wasStale = stale;
    setDraft(next);
    const nowStale = call.params.some(
      (p) => !sameArg(next[p.name], current?.args[p.name]),
    );
    if (!wasStale && nowStale)
      setAnnouncement(
        `${param} changed. The response is stale until you re-run.`,
      );
    else if (wasStale && !nowStale)
      setAnnouncement("Arguments match the run again.");
  };

  const restoreArg = (param: string) => {
    if (!current) return;
    const v = current.args[param];
    const next = { ...draft };
    if (v === undefined) delete next[param];
    else next[param] = v;
    setDraft(next);
    setAnnouncement(`${param} restored to ${showArg(v)}.`);
  };

  const restore = () => {
    if (!current || locked || !stale) return;
    setDraft(current.args);
    onRestore?.(current.id);
    setAnnouncement(`Arguments restored to run ${index + 1}.`);
  };

  const rerun = () => {
    if (!current || locked || busy) return;
    onRerun?.(draft, current.id);
    setAnnouncement(`Running ${call.tool}.`);
  };

  const [saved, setSaved] = React.useState<string[]>([]);
  const saveAsTest = () => {
    if (!current || locked) return;
    onSaveAsTest?.(current);
    setSaved((s) => (s.includes(current.id) ? s : [...s, current.id]));
    setAnnouncement(`Run ${index + 1} saved as a test.`);
  };

  const pick = (target: RerunBenchRun | undefined) => {
    if (!target || target.id === current?.id) return;
    if (runProp === undefined) setOwnRun(target.id);
    onRunChange?.(target.id);
    if (argsProp !== undefined) onArgsChange?.(target.args);
    setAnnouncement(
      `Run ${numberOf(target.id)}${target.recorded ? ", recorded" : ""}, ${target.ms} ms.`,
    );
  };

  const step = (delta: number) => pick(runs[index + delta]);

  const pillRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const onStripKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = runs.length - 1;
    else return;
    event.preventDefault();
    const target = runs[Math.max(0, Math.min(runs.length - 1, next))];
    if (!target) return;
    pick(target);
    pillRefs.current.get(target.id)?.focus();
  };

  const onRootKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      rerun();
      return;
    }
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      step(event.key === "ArrowUp" ? -1 : 1);
    }
  };

  /* ------------------------------ derived ------------------------------- */

  const base = baseOf(current);
  const rows = current
    ? diffRows(flatten(current.response), base ? flatten(base.response) : null)
    : [];
  const changes = rows.filter((r) => r.change !== "same").length;
  const overRows = React.useMemo(() => {
    if (!stream) return null;
    const over = runs.find((r) => r.id === stream.over);
    return over
      ? new Map(flatten(over.response).map((r) => [r.path, r]))
      : null;
  }, [runs, stream]);
  const streaming = stream !== null && stream.id === current?.id;
  const maxMs = Math.max(1, ...runs.map((r) => r.ms));
  const dim = (stale || busy) && !streaming;

  const chip: { text: string; tone: "accent" | "warn" | "danger" | "quiet" } =
    status === "loading"
      ? { text: "Loading", tone: "quiet" }
      : busy
        ? { text: "Running", tone: "accent" }
        : stale
          ? { text: "Stale", tone: "warn" }
          : current?.error
            ? { text: "Tool error", tone: "danger" }
            : !base
              ? {
                  text: current?.recorded ? "Recorded" : "First run",
                  tone: "quiet",
                }
              : changes === 0
                ? { text: `Identical to #${numberOf(base.id)}`, tone: "quiet" }
                : {
                    text: `${plural(changes, "field", "fields")} changed`,
                    tone: "accent",
                  };

  const delta = current && base ? current.ms - base.ms : null;
  const step2 = Math.max(rows.length - 1, 1);
  const rowDelay = (i: number) =>
    Number((((i / step2) * streamMs * 0.92) / 1000).toFixed(3));

  const vars = {
    "--rb-accent": accent,
    "--rb-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--rb-flash": `color-mix(in oklab, ${accent} 26%, transparent)`,
    "--rb-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--rb-solid": `oklch(from ${accent} 0.55 c h)`,
    "--rb-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  /* ------------------------------- render ------------------------------- */

  const field = cn(
    "w-full min-w-0 rounded-2 border border-input bg-surface-0 px-2 font-mono text-[12px] text-foreground transition-colors",
    "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
    "read-only:text-ink-2",
    d.field,
  );

  const request = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Request
        </span>
        <span className="truncate font-mono text-[10.5px] text-ink-3">
          {stale
            ? `${plural(edited.length, "edit", "edits")} · not run`
            : `as run #${index + 1}`}
        </span>
      </div>
      <div className={cn("flex flex-col", d.gap)}>
        {status === "loading"
          ? call.params.map((p) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="h-3 w-20 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                <span
                  className={cn(
                    "flex-1 rounded-2 bg-surface-2 motion-safe:animate-pulse",
                    d.field,
                  )}
                />
              </div>
            ))
          : call.params.map((p) => {
              const id = `${uid}-arg-${p.name}`;
              const hintId = `${id}-hint`;
              const value = draft[p.name];
              const was = current?.args[p.name];
              const changed = !sameArg(value, was);
              const onEscape = (event: React.KeyboardEvent) => {
                if (event.key === "Escape" && changed) {
                  event.preventDefault();
                  restoreArg(p.name);
                }
              };
              let control: React.ReactNode;
              if (p.type === "boolean") {
                const on = value === true;
                control = (
                  <button
                    id={id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-describedby={hintId}
                    aria-disabled={locked || undefined}
                    onClick={() => editArg(p.name, !on)}
                    onKeyDown={onEscape}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-2 rounded-2 px-1 font-mono text-[12px] text-ink-2",
                      d.field,
                      FOCUS,
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
                        on
                          ? "border-(--rb-line) bg-(--rb-solid)"
                          : "border-hairline-strong bg-surface-2",
                      )}
                    >
                      <motion.span
                        className="absolute top-[1px] left-[1px] size-3 rounded-full bg-background shadow-sm"
                        initial={false}
                        animate={{ x: on ? 12 : 0 }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    </span>
                    {String(on)}
                  </button>
                );
              } else if (p.type === "enum") {
                control = (
                  <select
                    id={id}
                    aria-describedby={hintId}
                    value={String(value ?? "")}
                    disabled={locked}
                    onChange={(event) => {
                      const v = event.currentTarget.value;
                      editArg(p.name, v);
                    }}
                    onKeyDown={onEscape}
                    className={cn(field, "cursor-pointer pr-1")}
                  >
                    {(p.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                );
              } else {
                control = (
                  <input
                    id={id}
                    aria-describedby={hintId}
                    type="text"
                    inputMode={p.type === "number" ? "numeric" : undefined}
                    spellCheck={false}
                    autoComplete="off"
                    value={String(value ?? "")}
                    readOnly={locked}
                    aria-required={p.required || undefined}
                    onChange={(event) => {
                      const raw = event.currentTarget.value;
                      const n = Number(raw);
                      editArg(
                        p.name,
                        p.type === "number" &&
                          raw.trim() !== "" &&
                          Number.isFinite(n)
                          ? n
                          : raw,
                      );
                    }}
                    onKeyDown={onEscape}
                    className={field}
                  />
                );
              }
              return (
                <div
                  key={p.name}
                  className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-x-2 gap-y-1 @min-[24rem]/rerun-bench:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] @min-[24rem]/rerun-bench:gap-x-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <label
                      htmlFor={id}
                      title={p.name}
                      className="flex min-w-0 items-center gap-1.5 font-mono text-[12px] leading-4 text-foreground"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full transition-colors",
                          changed ? "bg-(--rb-accent)" : "bg-transparent",
                        )}
                      />
                      <span className="min-w-0">
                        {p.name.split("_").map((part, k, all) => (
                          <React.Fragment key={k}>
                            {part}
                            {k < all.length - 1 ? (
                              <>
                                _<wbr />
                              </>
                            ) : null}
                          </React.Fragment>
                        ))}
                      </span>
                    </label>
                    <span
                      id={hintId}
                      className={cn(
                        "truncate pl-3 font-mono text-[10.5px] leading-4 text-ink-3",
                        !changed && "hidden @min-[24rem]/rerun-bench:block",
                      )}
                      title={changed ? `was ${showArg(was)}` : p.description}
                    >
                      {changed ? (
                        <>
                          {"was "}
                          <s className="decoration-ink-3">{showArg(was)}</s>
                        </>
                      ) : (
                        <>
                          {p.type}
                          {p.required ? " · required" : ""}
                          <span className="sr-only">
                            {p.description ? `. ${p.description}` : ""}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1">
                    <div className="min-w-0 flex-1">{control}</div>
                    <button
                      type="button"
                      aria-label={`Restore ${p.name} to ${showArg(was)}`}
                      title="Restore (Esc)"
                      tabIndex={changed ? 0 : -1}
                      aria-hidden={!changed || undefined}
                      onClick={() => restoreArg(p.name)}
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-[opacity,color] hover:bg-surface-2 hover:text-foreground",
                        changed
                          ? "opacity-100"
                          : "pointer-events-none opacity-0",
                        FOCUS,
                      )}
                    >
                      <RotateCcw aria-hidden className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );

  const chipClass = {
    accent: "border-(--rb-line) bg-(--rb-wash) text-foreground",
    warn: "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-foreground",
    danger:
      "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger",
    quiet: "border-hairline bg-surface-1 text-ink-2",
  }[chip.tone];

  const response = (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Response
        </span>
        {current ? (
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-ink-3 tabular-nums">
            <span className="truncate">{`#${index + 1} · ${ago(current.at, now)}`}</span>
            <span className="text-ink-2">{`${current.ms} ms`}</span>
            {delta !== null && delta !== 0 ? (
              <span>{delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-3 border bg-surface-0 transition-colors",
          current?.error && !dim
            ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)]"
            : "border-hairline",
        )}
      >
        {error ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-3 py-1.5">
            <TriangleAlert
              aria-hidden
              className="size-3.5 shrink-0 text-danger"
            />
            <p className="min-w-0 flex-1 text-[12px] leading-4 text-foreground">
              {error}
            </p>
            <button
              type="button"
              onClick={rerun}
              aria-disabled={locked || busy || undefined}
              className={cn(
                "inline-flex h-6 items-center rounded-1 border border-hairline-strong bg-surface-1 px-2 text-[11.5px] font-medium text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              Retry
            </button>
          </div>
        ) : null}

        <motion.dl
          className={cn("relative py-1.5 font-mono", d.text)}
          initial={false}
          animate={{ opacity: dim ? 0.45 : 1 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {status === "loading"
            ? Array.from({ length: 7 }, (_, i) => (
                <div
                  key={i}
                  className={cn("flex items-center gap-3 px-3", d.row)}
                >
                  <span className="h-3 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                  <span
                    className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{ width: `${30 + ((i * 37) % 45)}%` }}
                  />
                </div>
              ))
            : rows.map((r, i) => {
                const old = overRows?.get(r.path);
                const marked = r.change !== "same";
                const delay = streaming ? rowDelay(i) : 0;
                const fresh = streaming && motionSafe;
                return (
                  <div
                    key={r.path}
                    className={cn(
                      "relative grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 pr-3 leading-5",
                      d.row,
                      marked &&
                        diffStyle === "wash" &&
                        r.change !== "removed" &&
                        "bg-(--rb-wash)",
                    )}
                    style={{ paddingLeft: 12 + r.depth * 14 }}
                  >
                    {fresh && r.change === "changed" ? (
                      <motion.span
                        key={`flash-${stream?.n}`}
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-(--rb-flash)"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{
                          duration: 0.9,
                          times: [0, 0.22, 1],
                          ease: "easeOut",
                          delay,
                        }}
                      />
                    ) : null}
                    {marked && diffStyle !== "wash" ? (
                      <motion.span
                        key={`mark-${current?.id}`}
                        aria-hidden
                        className={cn(
                          "absolute top-1 bottom-1 left-0 w-[2px] rounded-full",
                          r.change === "removed"
                            ? "bg-ink-3"
                            : "bg-(--rb-accent)",
                          diffStyle === "inline" && "opacity-60",
                        )}
                        initial={fresh ? { scaleY: 0 } : false}
                        animate={{ scaleY: 1 }}
                        transition={
                          fresh
                            ? { ...springs.snap, delay: delay + 0.12 }
                            : { duration: 0 }
                        }
                        style={{ originY: 0.5 }}
                      />
                    ) : null}
                    <dt
                      className={cn(
                        "relative flex items-baseline gap-1",
                        r.change === "removed"
                          ? "text-ink-3 line-through"
                          : "text-ink-2",
                      )}
                    >
                      {r.change === "added" ? (
                        <span aria-hidden className="text-(--rb-accent)">
                          +
                        </span>
                      ) : r.change === "removed" ? (
                        <span aria-hidden className="text-ink-3 no-underline">
                          −
                        </span>
                      ) : null}
                      {r.key}
                    </dt>
                    <dd className="relative grid min-w-0">
                      {fresh && old && old.text !== r.text ? (
                        <motion.span
                          key={`old-${stream?.n}`}
                          aria-hidden
                          className="truncate text-ink-3 [grid-area:1/1]"
                          initial={{ opacity: 0.45 }}
                          animate={{ opacity: 0 }}
                          transition={{ duration: durations.fast, delay }}
                        >
                          {old.text}
                        </motion.span>
                      ) : null}
                      <motion.span
                        key={`${current?.id}-${stream?.n ?? 0}`}
                        className={cn(
                          "min-w-0 [overflow-wrap:anywhere] [grid-area:1/1]",
                          r.change === "removed"
                            ? "text-ink-3 line-through"
                            : r.tone === "object"
                              ? "text-ink-3"
                              : r.tone === "string"
                                ? "text-foreground"
                                : "text-ink-2",
                          marked &&
                            r.change !== "removed" &&
                            "font-medium text-foreground",
                          current?.error && "text-danger",
                        )}
                        initial={
                          fresh
                            ? { opacity: 0, y: -4 }
                            : streaming
                              ? { opacity: 0 }
                              : false
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          fresh
                            ? {
                                y: { ...springs.flick, delay },
                                opacity: { duration: durations.fast, delay },
                              }
                            : { duration: durations.base, ease: easings.enter }
                        }
                      >
                        {r.change === "changed" &&
                        diffStyle === "inline" &&
                        r.was ? (
                          <>
                            <s className="mr-1.5 font-normal text-ink-3 decoration-ink-3">
                              {r.was}
                            </s>
                            <span
                              aria-hidden
                              className="mr-1.5 font-normal text-ink-3"
                            >
                              →
                            </span>
                          </>
                        ) : null}
                        {r.text}
                        <span className="sr-only">
                          {r.change === "changed"
                            ? `, changed, was ${r.was ?? ""}`
                            : r.change === "added"
                              ? ", added"
                              : r.change === "removed"
                                ? ", removed"
                                : ""}
                        </span>
                      </motion.span>
                    </dd>
                  </div>
                );
              })}

          {busy && motionSafe ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 h-px bg-(--rb-accent) shadow-[0_0_8px_1px_var(--rb-line)]"
              initial={{ top: "0%" }}
              animate={{ top: ["0%", "100%"] }}
              transition={{
                duration: 1.2,
                ease: easings.move,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            />
          ) : null}
        </motion.dl>

        {streaming && motionSafe ? (
          <motion.span
            key={`sweep-${stream?.n}`}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 h-[2px] bg-(--rb-accent) shadow-[0_0_10px_2px_var(--rb-line)]"
            initial={{ top: "0%", opacity: 1 }}
            animate={{ top: "100%", opacity: [1, 1, 0] }}
            transition={{
              top: { duration: streamMs / 1000, ease: "linear" },
              opacity: {
                duration: streamMs / 1000 + 0.12,
                times: [0, 0.86, 1],
              },
            }}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <section
      aria-label={name}
      aria-busy={busy || status === "loading" || undefined}
      onKeyDown={onRootKey}
      className={cn(
        "@container/rerun-bench flex max-h-[34rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={vars}
    >
      {/* Header: the call, its state and the run strip. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[13px] font-semibold text-foreground">
            {call.tool}
          </span>
          <span className="rounded-1 border border-hairline bg-surface-1 px-1.5 font-mono text-[10.5px] leading-[18px] text-ink-3">
            {call.server}
          </span>
          <motion.span
            key={chip.text}
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] leading-none font-medium whitespace-nowrap",
              chipClass,
            )}
            initial={
              motionSafe ? { opacity: 0, y: 4, scale: 0.94 } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {busy ? (
              <LoaderCircle
                aria-hidden
                className="size-3 motion-safe:animate-spin"
              />
            ) : null}
            {chip.text}
          </motion.span>
        </div>

        <div
          role="radiogroup"
          aria-label="Runs"
          className="flex max-w-full [scrollbar-width:none] items-center gap-1 overflow-x-auto"
        >
          {runs.map((r, i) => {
            const on = r.id === current?.id;
            const from = r.from ? numberOf(r.from) : 0;
            return (
              <button
                key={r.id}
                ref={(node) => {
                  pillRefs.current.set(r.id, node);
                }}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Run ${i + 1}${r.recorded ? ", recorded" : ""}, ${r.ms} ms${from ? `, re-run of run ${from}` : ""}${r.error ? ", error" : ""}`}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                title={`${r.recorded ? "Recorded" : `Re-run${from ? ` of #${from}` : ""}`} · ${r.ms} ms · ${ago(r.at, now)}`}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(r)}
                onKeyDown={onStripKey}
                className={cn(
                  "relative flex h-8 w-10 shrink-0 flex-col items-center justify-center gap-1 rounded-2 font-mono text-[11px] leading-none transition-colors",
                  on
                    ? "text-foreground"
                    : "text-ink-3 hover:bg-surface-2 hover:text-ink-2",
                  FOCUS,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-run`}
                    aria-hidden
                    className="absolute inset-0 rounded-2 border border-(--rb-line) bg-(--rb-wash)"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative flex items-center gap-0.5">
                  {r.recorded ? (
                    <span
                      aria-hidden
                      className="size-1 rounded-full bg-ink-3"
                    />
                  ) : null}
                  {`#${i + 1}`}
                </span>
                <span
                  aria-hidden
                  className="relative h-[2px] w-6 overflow-hidden rounded-full bg-surface-2"
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      r.error
                        ? "bg-danger"
                        : on
                          ? "bg-(--rb-accent)"
                          : "bg-ink-3",
                    )}
                    style={{ width: `${Math.round((r.ms / maxMs) * 100)}%` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Body: request and response, side by side when there is room. */}
      <div className="[min-height:0] flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-1 gap-4 p-3 @min-[34rem]/rerun-bench:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {request}
          {response}
        </div>
      </div>

      {/* Footer: what to do with the bench. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2.5">
        <button
          type="button"
          onClick={restore}
          aria-disabled={locked || !stale || undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-[color,background-color,opacity] hover:bg-surface-2 hover:text-foreground",
            (locked || !stale) && "opacity-50",
            FOCUS,
          )}
        >
          <Undo2 aria-hidden className="size-3.5 shrink-0" />
          <span className="sr-only @min-[22rem]/rerun-bench:not-sr-only">
            Restore
          </span>
        </button>
        <button
          type="button"
          onClick={saveAsTest}
          aria-disabled={locked || undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            locked && "opacity-50",
            FOCUS,
          )}
        >
          <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center">
            {current && saved.includes(current.id) ? (
              <motion.span
                key="saved"
                initial={
                  motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
                className="inline-flex"
              >
                <Check aria-hidden className="size-3.5 text-(--rb-accent)" />
              </motion.span>
            ) : (
              <FlaskConical aria-hidden className="size-3.5" />
            )}
          </span>
          <span className="sr-only @min-[22rem]/rerun-bench:not-sr-only">
            {current && saved.includes(current.id)
              ? "Saved as test"
              : "Save as test"}
          </span>
        </button>
        <span className="ml-auto hidden font-mono text-[10.5px] text-ink-3 @min-[34rem]/rerun-bench:inline">
          ⌘↵ re-run · ⌥↑↓ runs
        </span>
        <button
          type="button"
          onClick={rerun}
          aria-disabled={locked || busy || undefined}
          aria-busy={busy || undefined}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          className={cn(
            "ml-auto inline-flex h-8 items-center gap-1.5 rounded-2 bg-(--rb-solid) px-3 text-[12px] font-medium text-(--rb-on) transition-[background-color,opacity] hover:bg-[color-mix(in_oklab,var(--rb-solid)_88%,black)] @min-[34rem]/rerun-bench:ml-0",
            (locked || busy) && "opacity-70",
            !stale &&
              !busy &&
              "bg-[color-mix(in_oklab,var(--rb-solid)_82%,var(--card))]",
            FOCUS,
          )}
        >
          {busy ? (
            <LoaderCircle
              aria-hidden
              className="size-3.5 shrink-0 motion-safe:animate-spin"
            />
          ) : (
            <Play aria-hidden className="size-3.5 shrink-0" />
          )}
          {busy ? "Running…" : "Re-run"}
        </button>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
