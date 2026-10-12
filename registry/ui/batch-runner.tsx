"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Eye,
  Inbox,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One selected record, e.g. a user in Coldbrook Admin. */
export type BatchRecord = {
  id: string;
  name: string;
  /** A second line under the name, e.g. an email. */
  detail?: string;
  team: string;
  role: string;
  /** When they were last seen, as text: "Today", "3d ago". */
  lastActive?: string;
};

/** A bulk action the picker offers. */
export type BatchAction = {
  id: string;
  /** The picker's label, e.g. "Move to team". */
  label: string;
  /** A target shown beside the label, e.g. the team moved to. */
  target?: string;
  /** The status cell's text once a row is done, e.g. "Deactivated". */
  done: string;
  /** What a dry run says the row would get, e.g. "Would deactivate". */
  preview: string;
  /** Whether done rows can be reversed with Undo. @default true */
  undoable?: boolean;
  /** Drawn in the danger colour on the Run button. @default false */
  destructive?: boolean;
};

export type BatchResult =
  { ok: true; note?: string } | { ok: false; reason: string };

export type BatchRunContext = {
  /** True when the run is a preview and nothing may change. */
  dryRun: boolean;
  /** 1 on the first run, 2 and up from Retry failed. */
  attempt: number;
  /** Aborted when the runner unmounts or the results are cleared. */
  signal: AbortSignal;
};

/** Works one row: resolve with the outcome, or reject and the row fails. */
export type BatchRun = (
  record: BatchRecord,
  action: BatchAction,
  context: BatchRunContext,
) => Promise<BatchResult>;

export type BatchRowStatus =
  | "queued"
  | "excluded"
  | "running"
  | "done"
  | "failed"
  | "skipped"
  | "previewed"
  | "reverting"
  | "reverted";

export type BatchOutcome = {
  status: BatchRowStatus;
  /** Why the row failed. */
  reason?: string;
  /** A note the run returned with success. */
  note?: string;
  attempt: number;
};

export type BatchJobKind = "run" | "retry" | "undo";

export type BatchSummary = {
  kind: BatchJobKind;
  dryRun: boolean;
  actionId: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  previewed: number;
  reverted: number;
  cancelled: boolean;
};

export type BatchChange = {
  /** The record toggled, or "*" for include all / none. */
  id: string;
  included: boolean;
};

export type BatchPhase = "idle" | "running" | "paused" | "done";
export type BatchCursor = "bar" | "glow" | "none";
export type BatchDensity = "compact" | "cozy" | "roomy";
export type BatchStatus = "ready" | "loading" | "error";

export type BatchRunnerProps = {
  /** The selected records, in table order. @default defaultBatchRecords */
  records?: BatchRecord[];
  /** The actions the picker offers, in order. @default defaultBatchActions */
  actions?: BatchAction[];
  /** Controlled action id. */
  action?: string;
  /** Initial action id when uncontrolled. @default the first action */
  defaultAction?: string;
  /** An action was chosen, from a press or an arrow key. */
  onActionChange?: (actionId: string) => void;
  /** Controlled set of included record ids. */
  value?: string[];
  /** Initial included ids when uncontrolled. @default every record */
  defaultValue?: string[];
  /** A row was included or left out, with the whole set. */
  onChange?: (value: string[], change: BatchChange) => void;
  /** Works one row; a rejection fails it. @default defaultBatchRun, a seeded simulator */
  run?: BatchRun;
  /** Reverses one done row for Undo. @default defaultBatchUndo */
  undo?: BatchRun;
  /** How many rows are worked at once. @default 1 */
  concurrency?: number;
  /** The least time the cursor spends on a row, in ms. @default 180 */
  pace?: number;
  /** Controlled dry-run switch. */
  dryRun?: boolean;
  /** Initial dry-run state when uncontrolled. @default false */
  defaultDryRun?: boolean;
  /** The dry-run switch was flipped. */
  onDryRunChange?: (dryRun: boolean) => void;
  /** How the row being worked is marked: a bar at its edge, a glow across it, or not at all. @default "bar" */
  cursor?: BatchCursor;
  /** Row height and detail. @default "cozy" */
  density?: BatchDensity;
  /** A row settled: done, failed, skipped, previewed or reverted. */
  onRowSettle?: (record: BatchRecord, outcome: BatchOutcome) => void;
  /** A run, retry or undo finished or was cancelled. */
  onFinish?: (summary: BatchSummary) => void;
  /** Whether the records have arrived. @default "ready" */
  status?: BatchStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Bulk action" */
  title?: string;
  /** Named under the heading. @default "Coldbrook Admin" */
  product?: string;
  /** What one record is called. @default { one: "user", other: "users" } */
  noun?: { one: string; other: string };
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the runner in px; the table scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be picked, toggled or run. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const NAMES = [
  "Ada Okafor",
  "Ben Halloran",
  "Cleo Marsh",
  "Dev Raman",
  "Esme Lindqvist",
  "Farid Nasser",
  "Greta Voss",
  "Hugo Beltran",
  "Ines Varga",
  "Jonah Petrie",
  "Kai Moreno",
  "Lena Strand",
  "Milo Achebe",
  "Nia Fontaine",
  "Oskar Reinholt",
  "Pia Castellano",
  "Quentin Oyelaran",
  "Rosa Ekwueme",
  "Sami Haddad",
  "Tove Almqvist",
  "Umar Siddiqui",
  "Vera Kowalczyk",
  "Wren Delacroix",
  "Yusuf Demir",
];

const TEAMS = ["Support", "Field Ops", "Billing", "Dispatch", "Platform"];
const ROLES = ["Member", "Member", "Admin", "Viewer", "Member", "Owner"];
const SEEN = [
  "Today",
  "Yesterday",
  "3d ago",
  "Today",
  "2w ago",
  "6d ago",
  "41d ago",
  "Today",
  "Yesterday",
  "9d ago",
  "Today",
  "5w ago",
];

/** 24 Coldbrook Admin users, as selected in the people table. */
export const defaultBatchRecords: BatchRecord[] = NAMES.map((name, i) => {
  const [first = "", last = ""] = name.toLowerCase().split(" ");
  return {
    id: `u-${1041 + i * 7}`,
    name,
    detail: `${first}.${last}@coldbrook.example`,
    team: TEAMS[(i * 3 + 1) % TEAMS.length] ?? "Support",
    role: ROLES[(i * 5 + 2) % ROLES.length] ?? "Member",
    lastActive: SEEN[(i * 7) % SEEN.length],
  };
});

export const defaultBatchActions: BatchAction[] = [
  {
    id: "deactivate",
    label: "Deactivate",
    done: "Deactivated",
    preview: "Would deactivate",
    destructive: true,
  },
  {
    id: "reset",
    label: "Reset password",
    done: "Reset link sent",
    preview: "Would send a reset link",
    undoable: false,
  },
  {
    id: "move",
    label: "Move to team",
    target: "Field Ops",
    done: "Moved to Field Ops",
    preview: "Would move to Field Ops",
  },
  {
    id: "export",
    label: "Export",
    done: "Exported",
    preview: "Would add to the export",
    undoable: false,
  },
];

const FAIL_REASONS: Record<string, string[]> = {
  deactivate: ["Last admin on their team", "Owns open tickets"],
  reset: ["SSO-managed account", "No verified email"],
  move: ["Team is at its seat limit", "Pending invite"],
  export: ["Export quota reached", "Profile is locked"],
};

const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const simulate = (
  signal: AbortSignal,
  delay: number,
  result: BatchResult,
): Promise<BatchResult> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve({ ok: false, reason: "Cancelled" });
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      resolve({ ok: false, reason: "Cancelled" });
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

/**
 * A seeded simulator: about one row in ten fails the first time with a
 * reason that fits the action, and most of those succeed when retried. A
 * dry run never fails.
 */
export const defaultBatchRun: BatchRun = (record, action, context) => {
  const h = hashStr(`${record.id}:${action.id}`);
  const delay = 30 + (h % 90);
  const fails =
    !context.dryRun && (context.attempt === 1 ? h % 10 === 0 : h % 30 === 0);
  const reasons = FAIL_REASONS[action.id] ?? ["The service refused it"];
  const reason =
    reasons[(h >>> 8) % reasons.length] ?? "The service refused it";
  return simulate(
    context.signal,
    delay,
    fails ? { ok: false, reason } : { ok: true },
  );
};

/** Reverses a row after a short delay; it never fails. */
export const defaultBatchUndo: BatchRun = (record, action, context) =>
  simulate(
    context.signal,
    20 + (hashStr(`${record.id}:${action.id}:undo`) % 60),
    {
      ok: true,
    },
  );

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const ANNOUNCE_GAP = 1200;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, noun: { one: string; other: string }) =>
  `${n} ${n === 1 ? noun.one : noun.other}`;

const DENSITY: Record<
  BatchDensity,
  { row: number; text: string; detail: boolean }
> = {
  compact: { row: 32, text: "text-[12px]", detail: false },
  cozy: { row: 40, text: "text-[13px]", detail: true },
  roomy: { row: 48, text: "text-[13px]", detail: true },
};

const STATUS_WORD: Record<BatchRowStatus, string> = {
  queued: "queued",
  excluded: "left out",
  running: "running",
  done: "done",
  failed: "failed",
  skipped: "skipped",
  previewed: "previewed",
  reverting: "reverting",
  reverted: "reverted",
};

const noopSubscribe = () => () => {};

/** Counts a job's rows by status, for hosts that summarise elsewhere. */
export const summarizeBatch = (
  ids: string[],
  results: Record<string, BatchOutcome | undefined>,
) => {
  const out = { done: 0, failed: 0, skipped: 0, previewed: 0, reverted: 0 };
  for (const id of ids) {
    const s = results[id]?.status;
    if (s === "done") out.done += 1;
    else if (s === "failed") out.failed += 1;
    else if (s === "skipped") out.skipped += 1;
    else if (s === "previewed") out.previewed += 1;
    else if (s === "reverted") out.reverted += 1;
  }
  return out;
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Checkbox                                 */
/* ----------------------------------------------------------------------- */

function Box({
  checked,
  mixed,
  motionSafe,
}: {
  checked: boolean;
  mixed?: boolean;
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center rounded-1 border transition-colors duration-150",
        checked || mixed
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-hairline-strong bg-transparent",
      )}
    >
      {mixed && !checked ? (
        <span className="h-px w-2 bg-current" />
      ) : checked ? (
        <svg viewBox="0 0 14 14" className="size-2.5">
          <motion.path
            d="M3 7.4 5.8 10 11 4.2"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        </svg>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Status cell                                */
/* ----------------------------------------------------------------------- */

function Face({
  status,
  text,
  motionSafe,
}: {
  status: BatchRowStatus;
  text: string;
  motionSafe: boolean;
}) {
  const tone =
    status === "done"
      ? "text-success"
      : status === "failed"
        ? "text-danger"
        : status === "previewed"
          ? "text-cobalt-bright"
          : status === "running" || status === "reverting"
            ? "text-foreground"
            : status === "reverted"
              ? "text-ink-2"
              : "text-ink-3";
  return (
    <span
      className={cn(
        "flex h-5 min-w-0 items-center gap-1.5 text-[11px] leading-none",
        tone,
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {status === "done" ? (
          <svg aria-hidden viewBox="0 0 14 14" className="size-3.5">
            <motion.path
              d="M2.5 7.4 5.6 10.4 11.5 3.8"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={
                motionSafe
                  ? { ...springs.flick, delay: durations.blink }
                  : { duration: 0 }
              }
            />
          </svg>
        ) : status === "failed" ? (
          <X aria-hidden className="size-3.5" />
        ) : status === "running" || status === "reverting" ? (
          <LoaderCircle
            aria-hidden
            className="size-3.5 text-ink-2 motion-safe:animate-spin"
          />
        ) : status === "previewed" ? (
          <Eye aria-hidden className="size-3.5" />
        ) : status === "reverted" ? (
          <Undo2 aria-hidden className="size-3.5" />
        ) : status === "skipped" ? (
          <span className="h-px w-2 bg-current" />
        ) : (
          <span
            className={cn(
              "size-1.5 rounded-full",
              status === "queued" ? "bg-ink-3" : "bg-hairline-strong",
            )}
          />
        )}
      </span>
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

function StatusCell({
  status,
  text,
  motionSafe,
}: {
  status: BatchRowStatus;
  text: string;
  motionSafe: boolean;
}) {
  return (
    <span className="relative block h-5 w-full [perspective:320px]">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={`${status}:${text}`}
          className="absolute inset-0 block"
          style={{ transformOrigin: "50% 50%" }}
          initial={motionSafe ? { rotateX: -90, opacity: 0 } : { opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{
            rotateX: motionSafe ? 90 : 0,
            opacity: 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { ...springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          <Face status={status} text={text} motionSafe={motionSafe} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Engine                                  */
/* ----------------------------------------------------------------------- */

type Engine = {
  seq: number;
  kind: BatchJobKind;
  dry: boolean;
  paused: boolean;
  cancelled: boolean;
  waiters: (() => void)[];
  timers: Set<number>;
  controller: AbortController;
};

type Job = {
  kind: BatchJobKind;
  dry: boolean;
  actionId: string;
  /** Every row the job covers; a retry keeps the first run's set. */
  ids: string[];
  /** The rows this job itself touched: the failed ones on a retry, the done ones on an undo. */
  worked: string[];
  cancelled: boolean;
};

type CursorBox = { top: number; height: number };

/**
 * A bulk-action runner: a table of selected records, an action picker and a
 * Run button. Running works the rows one by one (or `concurrency` at a time):
 * a cursor glides down the table on `springs.glide` and each row's status
 * cell turns over on `springs.snap` — to done, where a tick draws on
 * `springs.flick`, or to failed in the danger colour with the reason. The
 * header's bar fills on glide and its counts roll on snap: "17 of 24, 2
 * failed". Pause holds the cursor after the row in flight; Cancel lets that
 * row finish and marks the rest skipped. When the job settles a summary strip
 * lands on `springs.recoil` with Retry failed, which runs only the failed
 * rows again, and Undo, which reverses the done rows one by one with the
 * cursor gliding back up. A dry-run switch previews what each row would get
 * without changing anything.
 *
 * The table is a grid: arrows move between cells, Home/End and Ctrl+Home/End
 * jump, Space includes or leaves out a row before a run, and the header's box
 * takes every row. The actions are a listbox (arrows choose), Pause and
 * Cancel are buttons, and progress is announced in words, at most once a
 * second plus every failure and the final tally. Under reduced motion the
 * cursor is placed, not slid, and the cells and strip cross-fade.
 */
export function BatchRunner({
  records = defaultBatchRecords,
  actions = defaultBatchActions,
  action,
  defaultAction,
  onActionChange,
  value,
  defaultValue,
  onChange,
  run = defaultBatchRun,
  undo = defaultBatchUndo,
  concurrency = 1,
  pace = 180,
  dryRun,
  defaultDryRun = false,
  onDryRunChange,
  cursor = "bar",
  density = "cozy",
  onRowSettle,
  onFinish,
  status = "ready",
  onRetry,
  title = "Bulk action",
  product = "Coldbrook Admin",
  noun = { one: "user", other: "users" },
  label,
  height = 540,
  disabled = false,
  className,
}: BatchRunnerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  /* ------------------------------- state ------------------------------- */

  const [ownValue, setOwnValue] = React.useState<string[]>(
    () => defaultValue ?? records.map((r) => r.id),
  );
  const included = value ?? ownValue;
  const includedSet = React.useMemo(() => new Set(included), [included]);

  const [ownAction, setOwnAction] = React.useState<string>(
    () => defaultAction ?? actions[0]?.id ?? "",
  );
  const actionId = action ?? ownAction;
  const current = actions.find((a) => a.id === actionId) ?? actions[0];

  const [ownDry, setOwnDry] = React.useState(defaultDryRun);
  const dry = dryRun ?? ownDry;

  const [results, setResults] = React.useState<
    Record<string, BatchOutcome | undefined>
  >({});
  const [phase, setPhase] = React.useState<BatchPhase>("idle");
  const [job, setJob] = React.useState<Job | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [cursorBox, setCursorBox] = React.useState<CursorBox | null>(null);
  const [bodySize, setBodySize] = React.useState(0);
  const [active, setActive] = React.useState<{ row: number; col: number }>({
    row: 1,
    col: 0,
  });
  const [activeOption, setActiveOption] = React.useState<string | null>(null);
  // False for the server render and hydration, true once mounted: the cursor
  // and strip only ever appear after a press, but the actions' pill must not
  // slide on the first paint.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const engine = React.useRef<Engine | null>(null);
  const seqRef = React.useRef(0);
  const paceRef = React.useRef(pace);
  paceRef.current = pace;
  const runRef = React.useRef(run);
  runRef.current = run;
  const undoRef = React.useRef(undo);
  undoRef.current = undo;
  const resultsRef = React.useRef(results);
  resultsRef.current = results;
  const settleRef = React.useRef(onRowSettle);
  settleRef.current = onRowSettle;
  const finishRef = React.useRef(onFinish);
  finishRef.current = onFinish;

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLDivElement>());
  const cellNodes = React.useRef(new Map<string, HTMLElement>());
  const optionNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const announceAt = React.useRef(0);
  const announceTimer = React.useRef<number | null>(null);
  const pendingAnnounce = React.useRef<string | null>(null);

  const ready = status === "ready";
  const busy = phase === "running" || phase === "paused";
  const inert = disabled || !ready;
  const canEdit = !inert && !busy;

  /* ----------------------------- announcing ---------------------------- */

  const announce = React.useCallback((text: string, urgent = false) => {
    const now = Date.now();
    const due = announceAt.current + ANNOUNCE_GAP;
    if (urgent || now >= due) {
      if (announceTimer.current !== null) {
        window.clearTimeout(announceTimer.current);
        announceTimer.current = null;
      }
      pendingAnnounce.current = null;
      announceAt.current = now;
      setAnnouncement(text);
      return;
    }
    pendingAnnounce.current = text;
    if (announceTimer.current === null) {
      announceTimer.current = window.setTimeout(() => {
        announceTimer.current = null;
        const t = pendingAnnounce.current;
        pendingAnnounce.current = null;
        if (t !== null) {
          announceAt.current = Date.now();
          setAnnouncement(t);
        }
      }, due - now);
    }
  }, []);

  React.useEffect(
    () => () => {
      if (announceTimer.current !== null) {
        window.clearTimeout(announceTimer.current);
      }
      const e = engine.current;
      if (e) {
        seqRef.current += 1;
        e.controller.abort();
        for (const t of e.timers) window.clearTimeout(t);
        e.timers.clear();
        e.cancelled = true;
        e.waiters.splice(0).forEach((w) => w());
      }
    },
    [],
  );

  /* ------------------------------- counts ------------------------------ */

  const jobIds = job?.ids ?? [];
  const undoing = job?.kind === "undo";
  const scopeIds = undoing ? job.worked : jobIds;
  const tally = summarizeBatch(scopeIds, results);
  const processed = undoing
    ? tally.reverted + tally.failed
    : tally.done + tally.failed + tally.skipped + tally.previewed;
  const jobTotal = scopeIds.length;
  const runningIds = jobIds.filter((id) => {
    const s = results[id]?.status;
    return s === "running" || s === "reverting";
  });

  /* ------------------------------- engine ------------------------------ */

  const setRow = (id: string, outcome: BatchOutcome) => {
    setResults((prev) => ({ ...prev, [id]: outcome }));
    resultsRef.current = { ...resultsRef.current, [id]: outcome };
  };

  const start = (kind: BatchJobKind, ids: string[]) => {
    if (!current || ids.length === 0) return;
    const prev = engine.current;
    if (prev) {
      prev.cancelled = true;
      prev.controller.abort();
      for (const t of prev.timers) window.clearTimeout(t);
      prev.timers.clear();
      prev.waiters.splice(0).forEach((w) => w());
    }
    seqRef.current += 1;
    const seq = seqRef.current;
    const e: Engine = {
      seq,
      kind,
      dry: kind === "undo" ? false : dry,
      paused: false,
      cancelled: false,
      waiters: [],
      timers: new Set(),
      controller: new AbortController(),
    };
    engine.current = e;
    const act = current;
    const alive = () => seqRef.current === seq;

    const fullIds =
      kind === "retry" && job
        ? job.ids
        : kind === "undo" && job
          ? job.ids
          : ids;
    // What the counts cover: an undo counts only the rows it reverses.
    const scope = kind === "undo" ? ids : fullIds;
    setJob({
      kind,
      dry: e.dry,
      actionId: act.id,
      ids: fullIds,
      worked: ids,
      cancelled: false,
    });
    setPhase("running");

    // The rows about to be worked read queued again.
    const reset: Record<string, BatchOutcome> = {};
    for (const id of ids) {
      const attempt =
        kind === "retry" ? (resultsRef.current[id]?.attempt ?? 1) + 1 : 1;
      reset[id] = { status: "queued", attempt };
    }
    if (kind === "run") {
      // A fresh run forgets the last one entirely.
      resultsRef.current = reset;
      setResults(reset);
    } else {
      resultsRef.current = { ...resultsRef.current, ...reset };
      setResults((p) => ({ ...p, ...reset }));
    }

    const verb =
      kind === "undo"
        ? `Undoing ${act.label}`
        : kind === "retry"
          ? `Retrying ${act.label}`
          : e.dry
            ? `Previewing ${act.label}`
            : `Running ${act.label}`;
    announce(`${verb} on ${plural(ids.length, noun)}.`, true);

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = window.setTimeout(() => {
          e.timers.delete(t);
          resolve();
        }, ms);
        e.timers.add(t);
      });
    const gate = () =>
      e.paused && !e.cancelled
        ? new Promise<void>((resolve) => e.waiters.push(resolve))
        : Promise.resolve();

    // Table order, so a retry's cursor still reads top to bottom; an undo
    // hands its ids in reverse already.
    const order = new Map(fullIds.map((id, i) => [id, i]));
    const queue =
      kind === "undo"
        ? [...ids]
        : [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const worker = async () => {
      for (;;) {
        await gate();
        if (!alive() || e.cancelled) return;
        const id = queue.shift();
        if (id === undefined) return;
        const record = records.find((r) => r.id === id);
        const attempt = resultsRef.current[id]?.attempt ?? 1;
        if (!record) continue;
        setRow(id, {
          status: kind === "undo" ? "reverting" : "running",
          attempt,
        });
        const fn = kind === "undo" ? undoRef.current : runRef.current;
        let result: BatchResult;
        try {
          const [r] = await Promise.all([
            fn(record, act, {
              dryRun: e.dry,
              attempt,
              signal: e.controller.signal,
            }),
            wait(Math.max(0, paceRef.current)),
          ]);
          result = r;
        } catch (error) {
          result = {
            ok: false,
            reason: error instanceof Error ? error.message : "Failed",
          };
        }
        if (!alive()) return;
        const outcome: BatchOutcome = result.ok
          ? {
              status:
                kind === "undo" ? "reverted" : e.dry ? "previewed" : "done",
              note: result.note,
              attempt,
            }
          : { status: "failed", reason: result.reason, attempt };
        setRow(id, outcome);
        settleRef.current?.(record, outcome);
        const t = summarizeBatch(scope, resultsRef.current);
        const n = t.done + t.failed + t.skipped + t.previewed + t.reverted;
        if (outcome.status === "failed") {
          announce(
            `${record.name} failed: ${outcome.reason ?? "no reason"}. ${n} of ${scope.length}.`,
            true,
          );
        } else {
          announce(
            `${n} of ${scope.length}${t.failed ? `, ${t.failed} failed` : ""}.`,
          );
        }
      }
    };

    const workers = Array.from(
      { length: Math.max(1, Math.floor(concurrency)) },
      () => worker(),
    );
    void Promise.all(workers).then(() => {
      if (!alive()) return;
      if (e.cancelled) {
        for (const id of queue) {
          if (resultsRef.current[id]?.status === "queued") {
            const outcome: BatchOutcome = { status: "skipped", attempt: 1 };
            setRow(id, outcome);
            const record = records.find((r) => r.id === id);
            if (record) settleRef.current?.(record, outcome);
          }
        }
      }
      queue.length = 0;
      engine.current = null;
      const t = summarizeBatch(scope, resultsRef.current);
      const summary: BatchSummary = {
        kind,
        dryRun: e.dry,
        actionId: act.id,
        total: scope.length,
        ...t,
        cancelled: e.cancelled,
      };
      setJob((j) => (j ? { ...j, cancelled: e.cancelled } : j));
      setPhase("done");
      finishRef.current?.(summary);
      const parts: string[] = [];
      if (t.previewed) parts.push(`${t.previewed} previewed`);
      if (t.done) parts.push(`${t.done} done`);
      if (t.reverted) parts.push(`${t.reverted} reverted`);
      if (t.failed) parts.push(`${t.failed} failed`);
      if (t.skipped) parts.push(`${t.skipped} skipped`);
      announce(
        `${e.cancelled ? "Cancelled" : "Finished"}: ${parts.join(", ") || "nothing to do"}.`,
        true,
      );
    });
  };

  const pause = () => {
    const e = engine.current;
    if (!e || e.cancelled) return;
    e.paused = true;
    setPhase("paused");
    announce("Paused after the row in flight.", true);
  };

  const resume = () => {
    const e = engine.current;
    if (!e) return;
    e.paused = false;
    e.waiters.splice(0).forEach((w) => w());
    setPhase("running");
    announce("Resumed.", true);
  };

  const cancel = () => {
    const e = engine.current;
    if (!e || e.cancelled) return;
    e.cancelled = true;
    e.paused = false;
    e.waiters.splice(0).forEach((w) => w());
    setJob((j) => (j ? { ...j, cancelled: true } : j));
    announce("Cancelling: the rest will be skipped.", true);
  };

  const clear = () => {
    if (busy) return;
    const e = engine.current;
    if (e) e.controller.abort();
    engine.current = null;
    setResults({});
    resultsRef.current = {};
    setJob(null);
    setPhase("idle");
    setCursorBox(null);
    announce("Results cleared.", true);
  };

  const runAll = () => {
    if (!canEdit || !current) return;
    const ids = records.map((r) => r.id).filter((id) => includedSet.has(id));
    if (ids.length === 0) return;
    start("run", ids);
  };

  const retryFailed = () => {
    if (!canEdit || !job) return;
    const ids = job.ids.filter((id) => results[id]?.status === "failed");
    if (ids.length === 0) return;
    start("retry", ids);
  };

  const undoDone = () => {
    if (!canEdit || !job) return;
    const ids = job.ids
      .filter((id) => results[id]?.status === "done")
      .reverse();
    if (ids.length === 0) return;
    start("undo", ids);
  };

  /* ------------------------------ inclusion ---------------------------- */

  const commit = (next: string[], change: BatchChange) => {
    if (value === undefined) setOwnValue(next);
    onChange?.(next, change);
  };

  const toggle = (id: string) => {
    if (!canEdit) return;
    const on = !includedSet.has(id);
    const next = on
      ? records.map((r) => r.id).filter((x) => x === id || includedSet.has(x))
      : included.filter((x) => x !== id);
    commit(next, { id, included: on });
    const record = records.find((r) => r.id === id);
    announce(
      `${record?.name ?? id} ${on ? "included" : "left out"}. ${plural(next.length, noun)} included.`,
      true,
    );
  };

  const toggleAll = () => {
    if (!canEdit) return;
    const all = records.every((r) => includedSet.has(r.id));
    const next = all ? [] : records.map((r) => r.id);
    commit(next, { id: "*", included: !all });
    announce(
      all
        ? "Every row left out."
        : `All ${plural(next.length, noun)} included.`,
      true,
    );
  };

  const chooseAction = (id: string) => {
    if (!canEdit) return;
    if (action === undefined) setOwnAction(id);
    if (id !== actionId) onActionChange?.(id);
  };

  const setDry = (on: boolean) => {
    if (!canEdit) return;
    if (dryRun === undefined) setOwnDry(on);
    onDryRunChange?.(on);
    announce(on ? "Dry run on: nothing will change." : "Dry run off.", true);
  };

  /* ------------------------------- cursor ------------------------------ */

  const runningKey = runningIds.join("|");
  const lastSettled = React.useRef<string | null>(null);

  React.useEffect(() => {
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setBodySize(Math.round(body.clientWidth * 7919 + body.clientHeight));
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, [status]);

  React.useLayoutEffect(() => {
    if (!busy && phase !== "done") return;
    const body = bodyRef.current;
    if (!body) return;
    if (runningIds.length > 0) lastSettled.current = runningIds[0] ?? null;
    const ids = runningIds.length
      ? runningIds
      : lastSettled.current
        ? [lastSettled.current]
        : [];
    let top = Infinity;
    let bottom = -Infinity;
    for (const id of ids) {
      const node = rowNodes.current.get(id);
      if (!node) continue;
      top = Math.min(top, node.offsetTop);
      bottom = Math.max(bottom, node.offsetTop + node.offsetHeight);
    }
    if (!Number.isFinite(top)) return;
    setCursorBox((prev) =>
      prev && prev.top === top && prev.height === bottom - top
        ? prev
        : { top, height: bottom - top },
    );
    // Keep the row in flight in view, scrolling the table only.
    if (runningIds.length > 0) {
      const viewTop = body.scrollTop;
      const viewBottom = viewTop + body.clientHeight;
      const pad = 8;
      if (top < viewTop + pad) {
        body.scrollTo({
          top: Math.max(0, top - pad),
          behavior: motionSafe ? "smooth" : "auto",
        });
      } else if (bottom > viewBottom - pad) {
        body.scrollTo({
          top: bottom - body.clientHeight + pad,
          behavior: motionSafe ? "smooth" : "auto",
        });
      }
    }
    // The cursor follows the rows in flight; bodySize re-places it on resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningKey, bodySize, busy, phase, motionSafe]);

  /* ------------------------------ keyboard ----------------------------- */

  const cols = 5;
  const rowCount = records.length + 1;
  const cellKey = (r: number, c: number) => `${r}:${c}`;
  const bindCell = (r: number, c: number) => (node: HTMLElement | null) => {
    if (node) cellNodes.current.set(cellKey(r, c), node);
    else cellNodes.current.delete(cellKey(r, c));
  };
  const visibleCell = (r: number, c: number) => {
    const node = cellNodes.current.get(cellKey(r, c));
    return node && node.offsetParent !== null ? node : null;
  };

  const focusCell = (r: number, c: number, dir: 1 | -1 = 1) => {
    const row = clamp(r, 0, rowCount - 1);
    let col = clamp(c, 0, cols - 1);
    let way: 1 | -1 = dir;
    // A column hidden at this width is stepped over in the arrow's direction.
    for (let i = 0; i < cols; i += 1) {
      const node = visibleCell(row, col);
      if (node) {
        setActive({ row, col });
        node.focus();
        return;
      }
      col += way;
      if (col < 0 || col >= cols) {
        col = clamp(col, 0, cols - 1);
        way = way === 1 ? -1 : 1;
      }
    }
  };

  const onGridKey = (event: React.KeyboardEvent, r: number, c: number) => {
    const ctrl = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusCell(r + 1, c);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusCell(r - 1, c);
        return;
      case "ArrowRight":
        event.preventDefault();
        focusCell(r, c + 1, 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        focusCell(r, c - 1, -1);
        return;
      case "Home":
        event.preventDefault();
        if (ctrl) focusCell(1, 0);
        else focusCell(r, 0, 1);
        return;
      case "End":
        event.preventDefault();
        if (ctrl) focusCell(rowCount - 1, cols - 1, -1);
        else focusCell(r, cols - 1, -1);
        return;
      case "PageDown":
        event.preventDefault();
        focusCell(r + 8, c);
        return;
      case "PageUp":
        event.preventDefault();
        focusCell(r - 8, c);
        return;
      case " ":
      case "Enter": {
        event.preventDefault();
        if (r === 0) toggleAll();
        else {
          const record = records[r - 1];
          if (record) toggle(record.id);
        }
        return;
      }
      default:
    }
  };

  const activeOptionId =
    activeOption && actions.some((a) => a.id === activeOption)
      ? activeOption
      : actionId;

  const onOptionKey = (event: React.KeyboardEvent, i: number) => {
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = actions.length - 1;
    else return;
    event.preventDefault();
    const target = actions[clamp(to, 0, actions.length - 1)];
    if (!target) return;
    chooseAction(target.id);
    optionNodes.current.get(target.id)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const allIn =
    records.length > 0 && records.every((r) => includedSet.has(r.id));
  const someIn = records.some((r) => includedSet.has(r.id));
  const includedCount = records.filter((r) => includedSet.has(r.id)).length;
  const step = cascade(Math.min(records.length, 12));

  const statusOf = (id: string): BatchOutcome => {
    const r = results[id];
    if (r) return r;
    return { status: includedSet.has(id) ? "queued" : "excluded", attempt: 0 };
  };

  const faceText = (outcome: BatchOutcome): string => {
    const act = job
      ? (actions.find((a) => a.id === job.actionId) ?? current)
      : current;
    switch (outcome.status) {
      case "queued":
        return "Queued";
      case "excluded":
        return "Left out";
      case "running":
        return outcome.attempt > 1 ? "Retrying" : "Running";
      case "reverting":
        return "Reverting";
      case "done":
        return outcome.note ?? act?.done ?? "Done";
      case "failed":
        return outcome.reason ?? "Failed";
      case "skipped":
        return "Skipped";
      case "previewed":
        return act?.preview ?? "No change";
      case "reverted":
        return "Reverted";
      default:
        return "";
    }
  };

  const jobAction = job
    ? (actions.find((a) => a.id === job.actionId) ?? current)
    : current;
  const canUndo =
    phase === "done" &&
    job?.kind !== "undo" &&
    !job?.dry &&
    jobAction?.undoable !== false &&
    tally.done > 0;
  const canRetry = phase === "done" && tally.failed > 0 && job?.kind !== "undo";
  const pct = (n: number) => (jobTotal ? (n / jobTotal) * 100 : 0);

  const stripText = (() => {
    if (!job || phase !== "done") return "";
    const parts: string[] = [];
    if (job.kind === "undo") {
      parts.push(`${plural(tally.reverted, noun)} reverted`);
      if (tally.failed) parts.push(`${tally.failed} could not be reversed`);
      return parts.join(", ") + ".";
    }
    if (job.dry) {
      return `Dry run: ${plural(tally.previewed, noun)} previewed, nothing changed.`;
    }
    parts.push(`${tally.done} done`);
    if (tally.failed) parts.push(`${tally.failed} failed`);
    if (tally.skipped) parts.push(`${tally.skipped} skipped`);
    return `${job.cancelled ? "Cancelled: " : ""}${parts.join(", ")} of ${plural(jobTotal, noun)}.`;
  })();

  const headCount = (() => {
    if (!job) return null;
    return (
      <p className="flex items-baseline gap-1 text-[12px] text-ink-2">
        <span className="sr-only">
          {processed} of {jobTotal}
          {undoing ? " reverted" : ""}
          {tally.failed ? `, ${tally.failed} failed` : ""}
        </span>
        <Roll
          value={processed}
          motionSafe={motionSafe}
          className="font-mono text-[13px] text-foreground"
        />
        <span aria-hidden>
          of {jobTotal}
          {undoing ? " reverted" : ""}
        </span>
        <AnimatePresence initial={false}>
          {tally.failed > 0 ? (
            <motion.span
              key="failed"
              aria-hidden
              className="flex items-baseline gap-1 text-danger"
              initial={{ opacity: 0, x: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <span>·</span>
              <Roll
                value={tally.failed}
                motionSafe={motionSafe}
                className="font-mono text-[13px]"
              />
              <span>failed</span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </p>
    );
  })();

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Arrows move between cells. Space includes or leaves out a row. The
        header box takes every row.
      </p>

      {/* ------------------------------ header ----------------------------- */}
      <header className="relative flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {product}
            {ready ? (
              <>
                {" "}
                · {includedCount} of {records.length} {noun.other}
                {busy ? (phase === "paused" ? " · paused" : " · running") : ""}
              </>
            ) : null}
          </p>
        </div>
        {ready ? headCount : null}
        {/* The progress bar: done, failed and skipped as segments. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-2"
        >
          <div className="flex h-full w-full">
            <motion.span
              className="block h-full bg-primary"
              initial={false}
              animate={{
                width: `${pct(tally.done + tally.previewed)}%`,
              }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
            <motion.span
              className="block h-full bg-danger"
              initial={false}
              animate={{ width: `${pct(tally.failed)}%` }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
            <motion.span
              className="block h-full bg-hairline-strong"
              initial={false}
              animate={{ width: `${pct(tally.skipped)}%` }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          </div>
        </div>
      </header>

      {/* ------------------------------ toolbar ---------------------------- */}
      {status === "loading" ? (
        <div
          aria-hidden
          className="flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline px-4 py-2.5"
        >
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{
                width: 72 + ((i * 29) % 40),
                animationDelay: `${i * 70}ms`,
              }}
            />
          ))}
          <span className="ml-auto h-7 w-16 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
        </div>
      ) : status === "error" ? null : (
        <div className="flex shrink-0 flex-col gap-2 border-t border-hairline px-4 py-2.5 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:gap-3">
          <div
            role="listbox"
            aria-label="Action"
            aria-orientation="horizontal"
            className="-m-[3px] flex min-w-0 flex-1 flex-wrap items-center gap-1.5 p-[3px]"
          >
            {actions.map((a, i) => {
              const selected = a.id === actionId;
              return (
                <button
                  key={a.id}
                  id={`${uid}-opt-${a.id}`}
                  ref={(node) => {
                    if (node) optionNodes.current.set(a.id, node);
                    else optionNodes.current.delete(a.id);
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={!canEdit || undefined}
                  tabIndex={a.id === activeOptionId ? 0 : -1}
                  onFocus={() => setActiveOption(a.id)}
                  onClick={() => chooseAction(a.id)}
                  onKeyDown={(event) => onOptionKey(event, i)}
                  className={cn(
                    "relative inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                    selected
                      ? "text-foreground"
                      : "text-ink-2 hover:text-foreground",
                    canEdit ? "cursor-pointer" : "cursor-default",
                    FOCUS_RING,
                  )}
                >
                  {selected ? (
                    <motion.span
                      aria-hidden
                      layoutId={live && motionSafe ? `${uid}-pill` : undefined}
                      className="absolute inset-0 rounded-full border border-hairline-strong bg-surface-2"
                      transition={springs.snap}
                    />
                  ) : null}
                  <span className="relative">{a.label}</span>
                  {a.target ? (
                    <span className="relative font-mono text-[10px] text-ink-3">
                      {a.target}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="relative flex shrink-0 flex-wrap items-center gap-2">
            {/* Dry run switch */}
            <button
              type="button"
              role="switch"
              aria-checked={dry}
              aria-disabled={!canEdit || undefined}
              onClick={() => setDry(!dry)}
              className={cn(
                "inline-flex h-7 items-center gap-2 rounded-2 px-1.5 text-xs text-ink-2 transition-colors hover:text-foreground",
                canEdit ? "cursor-pointer" : "cursor-default",
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "relative block h-4 w-7 rounded-full border transition-colors duration-150",
                  dry
                    ? "border-transparent bg-cobalt-bright"
                    : "border-hairline-strong bg-surface-2",
                )}
              >
                <motion.span
                  className={cn(
                    "absolute top-[2px] left-[2px] block size-[10px] rounded-full",
                    dry ? "bg-primary-foreground" : "bg-ink-3",
                  )}
                  initial={false}
                  animate={{ x: dry ? 12 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </span>
              Dry run
            </button>

            <AnimatePresence initial={false} mode="popLayout">
              {busy ? (
                <motion.div
                  key="running"
                  className="flex items-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                >
                  <button
                    type="button"
                    aria-pressed={phase === "paused"}
                    onClick={() => (phase === "paused" ? resume() : pause())}
                    aria-disabled={job?.cancelled || undefined}
                    className={cn(
                      BUTTON,
                      phase === "paused" &&
                        "border-hairline-strong text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <span
                      aria-hidden
                      className="relative block size-3.5 [perspective:200px]"
                    >
                      <motion.span
                        className="absolute inset-0 flex items-center justify-center"
                        initial={false}
                        animate={{ rotateY: phase === "paused" ? 180 : 0 }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        <Pause className="absolute size-3.5 [backface-visibility:hidden]" />
                        <Play
                          className="absolute size-3.5 [backface-visibility:hidden]"
                          style={{ transform: "rotateY(180deg)" }}
                        />
                      </motion.span>
                    </span>
                    {phase === "paused" ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    aria-disabled={job?.cancelled || undefined}
                    className={cn(
                      BUTTON,
                      job?.cancelled && "cursor-default text-ink-3",
                      FOCUS_RING,
                    )}
                  >
                    <Square aria-hidden className="size-3" />
                    {job?.cancelled ? "Cancelling" : "Cancel"}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  className="flex items-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                >
                  <motion.button
                    type="button"
                    onClick={runAll}
                    aria-disabled={
                      !canEdit || includedCount === 0 || !current || undefined
                    }
                    whileTap={
                      canEdit && includedCount > 0 && motionSafe
                        ? { scale: 0.97 }
                        : undefined
                    }
                    transition={springs.flick}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
                      canEdit && includedCount > 0 && current
                        ? current.destructive && !dry
                          ? "bg-danger text-primary-foreground hover:bg-[color-mix(in_oklab,var(--danger)_88%,black)]"
                          : "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--accent)_88%,black)]"
                        : "cursor-default bg-surface-2 text-ink-3",
                      FOCUS_RING,
                    )}
                  >
                    {dry ? (
                      <Eye aria-hidden className="size-3.5" />
                    ) : (
                      <Play aria-hidden className="size-3" />
                    )}
                    {dry ? "Preview" : "Run"}
                    <span className="font-mono text-[10px] opacity-80">
                      {includedCount}
                    </span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ------------------------------- table ----------------------------- */}
      <div className="relative flex min-h-0 flex-1 flex-col border-t border-hairline">
        {status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The selected {noun.other} didn&apos;t load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(BUTTON, "h-8 px-3 text-foreground", FOCUS_RING)}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-1 px-3 py-2">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(6.5rem,8rem)] items-center gap-x-3 px-1"
                style={{ height: d.row }}
              >
                <span className="size-3.5 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                <span
                  className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: `${45 + ((i * 17) % 40)}%`,
                    animationDelay: `${i * 60}ms`,
                  }}
                />
                <span className="h-3 w-14 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
              </span>
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <Inbox aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-foreground">No {noun.other} selected.</p>
            <p className="max-w-[26ch] text-[12px] text-ink-3">
              Select some in {product} and they will line up here, ready for an
              action.
            </p>
          </div>
        ) : (
          <div
            role="grid"
            aria-label={`${title}: ${noun.other}`}
            aria-rowcount={rowCount}
            aria-colcount={cols}
            aria-describedby={hintId}
            aria-busy={busy || undefined}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Column headers */}
            <div role="rowgroup" className="shrink-0 border-b border-hairline">
              <div
                role="row"
                aria-rowindex={1}
                className="grid h-8 grid-cols-[1.75rem_minmax(0,1fr)_minmax(6.5rem,8.5rem)] items-center gap-x-3 px-3 @min-[30rem]:grid-cols-[1.75rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(7rem,9.5rem)] @min-[40rem]:grid-cols-[1.75rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(8rem,11rem)]"
              >
                <div role="columnheader" aria-colindex={1} className="flex">
                  <button
                    ref={bindCell(0, 0)}
                    type="button"
                    role="checkbox"
                    aria-checked={allIn ? true : someIn ? "mixed" : false}
                    aria-label={`Include all ${noun.other}`}
                    aria-disabled={!canEdit || undefined}
                    tabIndex={active.row === 0 && active.col === 0 ? 0 : -1}
                    onFocus={() => setActive({ row: 0, col: 0 })}
                    onClick={toggleAll}
                    onKeyDown={(event) => onGridKey(event, 0, 0)}
                    className={cn(
                      "-m-1 flex rounded-1 p-1",
                      canEdit ? "cursor-pointer" : "cursor-default",
                      FOCUS_RING,
                    )}
                  >
                    <Box
                      checked={allIn}
                      mixed={someIn && !allIn}
                      motionSafe={motionSafe}
                    />
                  </button>
                </div>
                {(
                  [
                    [1, "Name", ""],
                    [2, "Team", "hidden @min-[30rem]:block"],
                    [3, "Role", "hidden @min-[40rem]:block"],
                    [4, "Status", ""],
                  ] as const
                ).map(([c, text, extra]) => (
                  <div
                    key={c}
                    ref={bindCell(0, c)}
                    role="columnheader"
                    aria-colindex={c + 1}
                    tabIndex={active.row === 0 && active.col === c ? 0 : -1}
                    onFocus={() => setActive({ row: 0, col: c })}
                    onKeyDown={(event) => onGridKey(event, 0, c)}
                    className={cn(
                      "truncate rounded-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
                      extra,
                      FOCUS_RING,
                    )}
                  >
                    {text}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            <div
              ref={bodyRef}
              role="rowgroup"
              className={cn(
                "relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain",
                // Room to scroll the last rows out from under the strip.
                phase === "done" && "pb-16",
              )}
            >
              <AnimatePresence>
                {cursor !== "none" &&
                cursorBox &&
                (busy || phase === "done") ? (
                  <motion.div
                    key="cursor"
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-x-0 z-0",
                      cursor === "bar" &&
                        "border-l-2 border-cobalt-bright bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]",
                      cursor === "glow" &&
                        "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--accent)_22%,transparent),color-mix(in_oklab,var(--accent)_4%,transparent)_70%,transparent)]",
                    )}
                    initial={{
                      opacity: 0,
                      top: cursorBox.top,
                      height: cursorBox.height,
                    }}
                    animate={{
                      opacity: busy ? 1 : 0.35,
                      top: cursorBox.top,
                      height: cursorBox.height,
                    }}
                    exit={{ opacity: 0, transition: exitFor(durations.base) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.glide,
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          }
                        : { duration: 0, opacity: { duration: durations.fast } }
                    }
                  />
                ) : null}
              </AnimatePresence>

              {records.map((record, i) => {
                const r = i + 1;
                const outcome = statusOf(record.id);
                const on = includedSet.has(record.id);
                const text = faceText(outcome);
                const isActiveRow = active.row === r;
                return (
                  <motion.div
                    key={record.id}
                    ref={(node) => {
                      if (node) rowNodes.current.set(record.id, node);
                      else rowNodes.current.delete(record.id);
                    }}
                    role="row"
                    aria-rowindex={r + 1}
                    aria-selected={on}
                    initial={
                      live && motionSafe
                        ? { opacity: 0, y: distances.nudge }
                        : false
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      y: {
                        ...springs.glide,
                        delay: r3(Math.min(i, 12) * step),
                      },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }}
                    className={cn(
                      "relative z-10 grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(6.5rem,8.5rem)] items-center gap-x-3 border-b border-hairline px-3 transition-colors duration-150 last:border-b-0 @min-[30rem]:grid-cols-[1.75rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(7rem,9.5rem)] @min-[40rem]:grid-cols-[1.75rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(8rem,11rem)]",
                      d.text,
                      !on && "text-ink-3",
                      outcome.status === "failed" &&
                        "bg-[color-mix(in_oklab,var(--danger)_7%,transparent)]",
                    )}
                    style={{ height: d.row }}
                  >
                    {/* Include */}
                    <div
                      ref={bindCell(r, 0)}
                      role="gridcell"
                      aria-colindex={1}
                      aria-label={`${record.name}, ${on ? "included" : "left out"}`}
                      tabIndex={isActiveRow && active.col === 0 ? 0 : -1}
                      onFocus={() => setActive({ row: r, col: 0 })}
                      onClick={() => toggle(record.id)}
                      onKeyDown={(event) => onGridKey(event, r, 0)}
                      className={cn(
                        "-m-1 flex rounded-1 p-1",
                        canEdit ? "cursor-pointer" : "cursor-default",
                        FOCUS_RING,
                      )}
                    >
                      <Box checked={on} motionSafe={motionSafe} />
                    </div>
                    {/* Name */}
                    <div
                      ref={bindCell(r, 1)}
                      role="gridcell"
                      aria-colindex={2}
                      tabIndex={isActiveRow && active.col === 1 ? 0 : -1}
                      onFocus={() => setActive({ row: r, col: 1 })}
                      onKeyDown={(event) => onGridKey(event, r, 1)}
                      className={cn("min-w-0 rounded-1", FOCUS_RING)}
                    >
                      <span className="block truncate leading-tight">
                        {record.name}
                      </span>
                      {d.detail && record.detail ? (
                        <span className="hidden truncate font-mono text-[10px] leading-tight text-ink-3 @min-[30rem]:block">
                          {record.detail}
                        </span>
                      ) : null}
                    </div>
                    {/* Team */}
                    <div
                      ref={bindCell(r, 2)}
                      role="gridcell"
                      aria-colindex={3}
                      tabIndex={isActiveRow && active.col === 2 ? 0 : -1}
                      onFocus={() => setActive({ row: r, col: 2 })}
                      onKeyDown={(event) => onGridKey(event, r, 2)}
                      className={cn(
                        "hidden min-w-0 truncate rounded-1 text-ink-2 @min-[30rem]:block",
                        !on && "text-ink-3",
                        FOCUS_RING,
                      )}
                    >
                      {record.team}
                    </div>
                    {/* Role */}
                    <div
                      ref={bindCell(r, 3)}
                      role="gridcell"
                      aria-colindex={4}
                      tabIndex={isActiveRow && active.col === 3 ? 0 : -1}
                      onFocus={() => setActive({ row: r, col: 3 })}
                      onKeyDown={(event) => onGridKey(event, r, 3)}
                      className={cn(
                        "hidden min-w-0 truncate rounded-1 text-ink-2 @min-[40rem]:block",
                        !on && "text-ink-3",
                        FOCUS_RING,
                      )}
                    >
                      {record.role}
                      {d.detail && record.lastActive ? (
                        <span className="block truncate font-mono text-[10px] leading-tight text-ink-3">
                          {record.lastActive}
                        </span>
                      ) : null}
                    </div>
                    {/* Status */}
                    <div
                      ref={bindCell(r, 4)}
                      role="gridcell"
                      aria-colindex={5}
                      aria-label={`${STATUS_WORD[outcome.status]}${
                        outcome.status === "failed" ||
                        outcome.status === "previewed" ||
                        outcome.status === "done"
                          ? `: ${text}`
                          : ""
                      }`}
                      tabIndex={isActiveRow && active.col === 4 ? 0 : -1}
                      onFocus={() => setActive({ row: r, col: 4 })}
                      onKeyDown={(event) => onGridKey(event, r, 4)}
                      className={cn("min-w-0 rounded-1", FOCUS_RING)}
                    >
                      <StatusCell
                        status={outcome.status}
                        text={text}
                        motionSafe={motionSafe}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------------------------- summary strip -------------------------- */}
        <AnimatePresence>
          {phase === "done" && job ? (
            <motion.div
              key="strip"
              role="group"
              aria-label="Summary"
              className="absolute inset-x-3 bottom-3 z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-3 border border-hairline-strong bg-popover px-3 py-2 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.shift, scale: 0.98 }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <p className="min-w-0 flex-1 text-[12px] text-foreground">
                {tally.failed > 0 && job.kind !== "undo" ? (
                  <TriangleAlert
                    aria-hidden
                    className="mr-1.5 inline size-3.5 -translate-y-px text-warn"
                  />
                ) : null}
                {stripText}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {canRetry ? (
                  <button
                    type="button"
                    onClick={retryFailed}
                    aria-disabled={!canEdit || undefined}
                    className={cn(BUTTON, "text-foreground", FOCUS_RING)}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Retry failed
                    <span className="font-mono text-[10px] text-ink-3">
                      {tally.failed}
                    </span>
                  </button>
                ) : null}
                {canUndo ? (
                  <button
                    type="button"
                    onClick={undoDone}
                    aria-disabled={!canEdit || undefined}
                    className={cn(BUTTON, FOCUS_RING)}
                  >
                    <Undo2 aria-hidden className="size-3.5" />
                    Undo
                    <span className="font-mono text-[10px] text-ink-3">
                      {tally.done}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={clear}
                  aria-label="Clear results"
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
