"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Braces,
  Check,
  CircleAlert,
  Download,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
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

export type PromptStampColumn = {
  /** The field a row's `values` holds, and the name a `{placeholder}` uses. */
  id: string;
  /** The column heading. */
  label: string;
  /** Share of the input width this column takes, as a fraction unit. @default 1 */
  grow?: number;
};

export type PromptStampRow = {
  id: string;
  /** One value per column id. An empty value fails the row if the prompt uses it. */
  values: Record<string, string>;
};

export type PromptStampRowState =
  "idle" | "queued" | "running" | "failed" | "done";

export type PromptStampResult = {
  status: PromptStampRowState;
  /** The answer so far (running) or in full (done). */
  text?: string;
  /** Why a failed row failed, in a few words. */
  error?: string;
};

export type PromptStampResults = Record<string, PromptStampResult>;

/** One row's filled prompt, as Run and Retry hand it to the host. */
export type PromptStampRun = { rowId: string; prompt: string };

export type PromptStampStatus = "ready" | "loading" | "error";

export type PromptStampHandle = {
  /** Runs the prompt down every row (what Run does). */
  run: () => void;
  /** Stops a run (what Stop does). */
  stop: () => void;
};

export type PromptStampProps = {
  /** Imperative handle: `run()` and `stop()`. */
  ref?: React.Ref<PromptStampHandle>;
  /** Controlled prompt, with `{placeholders}` naming columns. */
  template?: string;
  /** Initial prompt when uncontrolled. @default defaultPromptTemplate */
  defaultTemplate?: string;
  /** Fires from every edit and every column inserted from the picker. */
  onTemplateChange?: (template: string) => void;
  /** The sheet's input columns, in order. @default defaultPromptStampColumns */
  columns?: PromptStampColumn[];
  /** Controlled rows. */
  rows?: PromptStampRow[];
  /** Initial rows when uncontrolled. @default defaultPromptStampRows */
  defaultRows?: PromptStampRow[];
  /** Fires with every row after a cell is edited. */
  onRowsChange?: (rows: PromptStampRow[]) => void;
  /** Placeholder names that read another column, e.g. `{ bean: "product" }`. @default {} */
  mapping?: Record<string, string>;
  /** Controlled run state per row id. Given, the host runs the prompt; the sheet only shows it. */
  results?: PromptStampResults;
  /** Initial run state per row id when uncontrolled. @default {} */
  defaultResults?: PromptStampResults;
  /** Fires whenever the built-in run changes a row's state or text. */
  onResultsChange?: (results: PromptStampResults) => void;
  /** The built-in run's answer for a row and its filled prompt. @default seeded Coldbrook answers */
  respond?: (row: PromptStampRow, prompt: string) => string;
  /** Run was pressed: every row's filled prompt. */
  onRun?: (runs: PromptStampRun[]) => void;
  /** Stop was pressed during a run. */
  onStop?: () => void;
  /** Retry was pressed on a failed row. */
  onRetryRow?: (rowId: string, prompt: string) => void;
  /** Export was pressed: the sheet with its answers as CSV, and the results. */
  onExport?: (csv: string, results: PromptStampResults) => void;
  /** How fast the stamp walks the sheet and the answers stream, as a multiplier. @default 1 */
  stampSpeed?: number;
  /** Row height in px; the answer shows as many lines as fit. @default 52 */
  rowHeight?: number;
  /** Tokens, the stamp, lit cells, Run and done checks — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Rows the built-in run works on at once. @default 3 */
  concurrency?: number;
  /** The sheet's name in the header. @default "Shop descriptions" */
  title?: string;
  /** The output column's heading. @default "Description" */
  outputLabel?: string;
  /** Whether the rows are here: loading shows a skeleton, error a retry. @default "ready" */
  status?: PromptStampStatus;
  /** Try again was pressed after the rows failed to load. */
  onReload?: () => void;
  /** The tallest the surface grows, px; past it the sheet scrolls inside. @default 560 */
  height?: number;
  /** Nothing can be edited or run. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultPromptTemplate =
  "Write two sentences for the shop page about {product}, a {roast} roast from {origin}. Lead with {notes}; warm and plain, no superlatives.";

export const defaultPromptStampColumns: PromptStampColumn[] = [
  { id: "product", label: "Product", grow: 1 },
  { id: "origin", label: "Origin", grow: 1.1 },
  { id: "roast", label: "Roast", grow: 0.6 },
  { id: "notes", label: "Tasting notes", grow: 1.2 },
];

export const defaultPromptStampRows: PromptStampRow[] = [
  {
    id: "ridgeline",
    values: {
      product: "Ridgeline",
      origin: "Huila, Colombia",
      roast: "Medium",
      notes: "cocoa, red plum",
    },
  },
  {
    id: "lantern",
    values: {
      product: "Lantern",
      origin: "Sidama, Ethiopia",
      roast: "Light",
      notes: "bergamot, white peach",
    },
  },
  {
    id: "night-ferry",
    values: {
      product: "Night Ferry",
      origin: "Minas Gerais, Brazil",
      roast: "Dark",
      notes: "molasses, toasted walnut",
    },
  },
  {
    id: "saltmarsh",
    values: {
      product: "Saltmarsh",
      origin: "Kayanza, Burundi",
      roast: "Light",
      notes: "",
    },
  },
  {
    id: "copperleaf",
    values: {
      product: "Copperleaf",
      origin: "Nariño, Colombia",
      roast: "Medium",
      notes: "caramel, orange zest",
    },
  },
  {
    id: "harbour-decaf",
    values: {
      product: "Harbour Decaf",
      origin: "Cajamarca, Peru",
      roast: "Medium",
      notes: "milk chocolate, almond",
    },
  },
];

const SEEDED_ANSWERS: Record<string, string> = {
  ridgeline:
    "Ridgeline opens with cocoa and settles into a soft red-plum finish. A medium roast from Huila that is easy black and better with a splash of milk.",
  lantern:
    "Lantern is all bergamot and white peach, bright without being sharp. A light roast from Sidama for slow mornings and a clean filter.",
  "night-ferry":
    "Night Ferry is dark and round, molasses up front and toasted walnut underneath. Grown in Minas Gerais and built for espresso with milk.",
  copperleaf:
    "Copperleaf tastes of caramel with a lift of orange zest at the end. A medium roast from Nariño that holds up from pour-over to stovetop.",
  "harbour-decaf":
    "Harbour Decaf keeps the milk chocolate and almond and leaves out the caffeine. A medium roast from Cajamarca for the evening cup.",
};

const signature = (row: PromptStampRow) =>
  Object.keys(row.values)
    .sort()
    .map((k) => `${k}=${row.values[k] ?? ""}`)
    .join("|");

const SEEDED_SIGNATURES = new Map(
  defaultPromptStampRows.map((row) => [row.id, signature(row)]),
);

/**
 * The built-in run's answers: the seeded copy while a row still holds its
 * seeded values, and a plain sentence from whatever the row says once it has
 * been edited, so a fixed row never comes back with words about old data.
 */
export function defaultRespond(row: PromptStampRow): string {
  const seeded = SEEDED_ANSWERS[row.id];
  if (seeded && SEEDED_SIGNATURES.get(row.id) === signature(row)) return seeded;
  const v = row.values;
  const name = v.product || "This coffee";
  const roast = (v.roast || "house").toLowerCase();
  const notes = v.notes ? `Expect ${v.notes} in the cup.` : "";
  const origin = v.origin ? ` from ${v.origin}` : "";
  return `${name} is a ${roast} roast${origin}, roasted in small batches at Coldbrook. ${notes}`.trim();
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const TOKEN = /\{([A-Za-z][\w-]*)\}/g;
const EMPTY_RESULTS: PromptStampResults = {};
const EMPTY_MAPPING: Record<string, string> = {};

type Piece =
  | { kind: "text"; text: string; key: string }
  | { kind: "token"; name: string; columnId: string | null; key: string };

function parseTemplate(
  template: string,
  resolve: (name: string) => string | null,
): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of template.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last)
      out.push({
        kind: "text",
        text: template.slice(last, at),
        key: `t${last}`,
      });
    const name = m[1] ?? "";
    out.push({ kind: "token", name, columnId: resolve(name), key: `k${at}` });
    last = at + m[0].length;
  }
  if (last < template.length)
    out.push({ kind: "text", text: template.slice(last), key: `t${last}` });
  return out;
}

const fill = (pieces: Piece[], row: PromptStampRow) =>
  pieces
    .map((p) =>
      p.kind === "text"
        ? p.text
        : p.columnId
          ? (row.values[p.columnId] ?? "")
          : `{${p.name}}`,
    )
    .join("");

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const round = (v: number) => Math.round(v * 100) / 100;
const clampNum = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const CELL_FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12.5px] font-medium whitespace-nowrap transition-[background-color,color,opacity,border-color]";

/** Stamp timings at 1×, ms. Gaps and streaming scale with `stampSpeed`. */
const STAMP_GAP = 340;
const PRESS = 260;
const THINK = 220;
const CPS = 90;
/** The head waits on a row this long after pressing, then lifts away. */
const HOLD = 380;
const HEAD_H = 26;
const LINE = 22;

type Job = {
  rowId: string;
  phase: "queued" | "press" | "think" | "stream" | "over";
  since: number;
  target: string;
  shown: number;
  missing: string | null;
};

type Runner = {
  clock: number;
  last: number;
  nextStamp: number;
  jobs: Job[];
  results: PromptStampResults;
};

/** On screen and in a visible tab — the only time the built-in run ticks. */
function useShown(node: HTMLElement | null) {
  const [onScreen, setOnScreen] = React.useState(true);
  const [tabVisible, setTabVisible] = React.useState(true);
  React.useEffect(() => {
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) =>
      setOnScreen(Boolean(entry?.isIntersecting)),
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node]);
  React.useEffect(() => {
    const read = () => setTabVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);
  return onScreen && tabVisible;
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Picker = {
  /** Index of the `{` being completed, or the caret for a button insert. */
  from: number;
  query: string;
  active: number;
  left: number;
  top: number;
  typed: boolean;
};

type Stamp = { seq: number; rowId: string };

/**
 * One prompt, run down every row of a small sheet. The prompt is written with
 * `{placeholders}` that name columns — typing `{` opens a column picker — and
 * Run stamps it down the sheet: a plate carrying the prompt's tokens travels
 * down the output column on `springs.glide`, presses each row on
 * `springs.recoil`, and at the press its tokens turn into that row's values
 * while the row's mapped cells light up left to right in a `cascade()`. The
 * answer then streams into the output cell. A row whose mapped cell is empty
 * is pressed too, but the empty cell lights in danger and the row fails with
 * the reason — the stamp never invents a value.
 *
 * Rows are queued, running, failed or done; failed rows retry, Export hands
 * the host a CSV. Given `results`, the host does the running and the sheet
 * shows it; without them a built-in run plays `respond`, ticking only while
 * the sheet is on screen. The sheet is a real grid with one roving cell;
 * Enter edits an input cell and retries or expands an output. Under reduced
 * motion the stamp does not travel: rows light in place and answers still
 * arrive word by word.
 */
export function PromptStamp({
  ref,
  template: templateProp,
  defaultTemplate = defaultPromptTemplate,
  onTemplateChange,
  columns = defaultPromptStampColumns,
  rows: rowsProp,
  defaultRows = defaultPromptStampRows,
  onRowsChange,
  mapping = EMPTY_MAPPING,
  results: resultsProp,
  defaultResults = EMPTY_RESULTS,
  onResultsChange,
  respond = defaultRespond,
  onRun,
  onStop,
  onRetryRow,
  onExport,
  stampSpeed = 1,
  rowHeight = 52,
  accent = "var(--accent-bright)",
  concurrency = 3,
  title = "Shop descriptions",
  outputLabel = "Description",
  status = "ready",
  onReload,
  height = 560,
  disabled = false,
  className,
}: PromptStampProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const listId = `${uid}-columns`;
  const hintId = `${uid}-hint`;

  /* ------------------------------ values -------------------------------- */

  const [ownTemplate, setOwnTemplate] = React.useState(defaultTemplate);
  const template = templateProp ?? ownTemplate;
  const setTemplate = (next: string) => {
    if (templateProp === undefined) setOwnTemplate(next);
    onTemplateChange?.(next);
  };

  const [ownRows, setOwnRows] = React.useState(defaultRows);
  const rows = rowsProp ?? ownRows;

  const controlled = resultsProp !== undefined;
  const [ownResults, setOwnResults] = React.useState(defaultResults);
  const results = resultsProp ?? ownResults;
  const runner = React.useRef<Runner>({
    clock: 0,
    last: 0,
    nextStamp: 0,
    jobs: [],
    results: defaultResults,
  });

  const commitResults = (next: PromptStampResults) => {
    runner.current.results = next;
    setOwnResults(next);
    onResultsChange?.(next);
  };

  const resolve = (name: string) => {
    const id = mapping[name] ?? name;
    return columns.some((c) => c.id === id) ? id : null;
  };
  const pieces = parseTemplate(template, resolve);
  const used: PromptStampColumn[] = [];
  const unknown: string[] = [];
  for (const p of pieces) {
    if (p.kind !== "token") continue;
    if (p.columnId) {
      const col = columns.find((c) => c.id === p.columnId);
      if (col && !used.includes(col)) used.push(col);
    } else if (!unknown.includes(p.name)) unknown.push(p.name);
  }
  const usedIds = new Set(used.map((c) => c.id));

  const stateOf = (id: string): PromptStampResult =>
    results[id] ?? { status: "idle" };
  const missingOf = (row: PromptStampRow) =>
    used.filter((c) => !(row.values[c.id] ?? "").trim());

  const counts = { queued: 0, running: 0, done: 0, failed: 0, idle: 0 };
  for (const row of rows) counts[stateOf(row.id).status] += 1;
  const active = counts.queued + counts.running > 0;
  const inRun = rows.length - counts.idle;
  const started = counts.running + counts.done + counts.failed;

  /* ------------------------------ runner -------------------------------- */

  const [surface, setSurface] = React.useState<HTMLElement | null>(null);
  const shown = useShown(surface);
  const live = React.useRef({ stampSpeed, concurrency, onResultsChange });
  React.useEffect(() => {
    live.current = { stampSpeed, concurrency, onResultsChange };
  });

  const runnerOn = !controlled && active && shown;
  React.useEffect(() => {
    if (!runnerOn) return;
    // The tick lives here, not in render: it reads the clock and the
    // runner, and only ever runs from the interval this effect owns.
    const tick = () => {
      const r = runner.current;
      const { stampSpeed: speedRaw, concurrency: lanes } = live.current;
      const speed = clampNum(speedRaw, 0.25, 4);
      const now = performance.now();
      // A paused or throttled tab resumes where it left off, not leaps ahead.
      if (r.last >= 0) r.clock += Math.min(100, Math.max(0, now - r.last));
      r.last = now;
      let next = r.results;
      let changed = false;
      const put = (id: string, res: PromptStampResult) => {
        next = { ...next, [id]: res };
        changed = true;
      };

      const working = r.jobs.filter(
        (j) => j.phase !== "queued" && j.phase !== "over",
      ).length;
      if (working < Math.max(1, Math.round(lanes)) && r.clock >= r.nextStamp) {
        const job = r.jobs.find((j) => j.phase === "queued");
        if (job) {
          job.phase = "press";
          job.since = r.clock;
          r.nextStamp = r.clock + STAMP_GAP / speed;
          put(job.rowId, { status: "running", text: "" });
        }
      }

      for (const job of r.jobs) {
        const age = r.clock - job.since;
        if (job.phase === "press" && age >= PRESS / speed) {
          if (job.missing) {
            put(job.rowId, {
              status: "failed",
              error: `${job.missing} is empty`,
            });
            job.phase = "over";
          } else {
            job.phase = "think";
            job.since = r.clock;
          }
        } else if (job.phase === "think" && age >= THINK / speed) {
          job.phase = "stream";
          job.since = r.clock;
        } else if (job.phase === "stream" && job.target.length === 0) {
          put(job.rowId, { status: "failed", error: "No answer came back" });
          job.phase = "over";
        } else if (job.phase === "stream") {
          const reach = Math.floor((age / 1000) * CPS * speed);
          let upto = job.target.length;
          if (reach < job.target.length) {
            // Whole words only: a half-word reads as a typo, not as progress.
            const space = job.target.lastIndexOf(" ", reach);
            upto = space > job.shown ? space : job.shown;
          }
          if (upto !== job.shown) {
            job.shown = upto;
            const finished = upto >= job.target.length;
            put(job.rowId, {
              status: finished ? "done" : "running",
              text: job.target.slice(0, upto),
            });
            if (finished) job.phase = "over";
          }
        }
      }
      r.jobs = r.jobs.filter((j) => j.phase !== "over");
      if (changed) {
        r.results = next;
        setOwnResults(next);
        live.current.onResultsChange?.(next);
      }
    };
    // The first tick only starts the clock, so time spent paused never counts.
    runner.current.last = -1;
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [runnerOn]);

  /* ---------------------------- announcements --------------------------- */

  const [announcement, setAnnouncement] = React.useState("");
  const [exported, setExported] = React.useState<number | null>(null);

  // The run is announced once when it settles, from the render that sees it.
  const [wasActive, setWasActive] = React.useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active && inRun > 0) {
      const failedRows = rows.filter((r) => stateOf(r.id).status === "failed");
      const why = failedRows
        .map(
          (r) =>
            `${r.values[columns[0]?.id ?? ""] || r.id}, ${stateOf(r.id).error ?? "failed"}`,
        )
        .join("; ");
      setAnnouncement(
        `${plural(counts.done, "row")} done${counts.failed ? `, ${counts.failed} failed: ${why}` : ""}.`,
      );
    }
  }

  /* ------------------------------- stamps ------------------------------- */

  // A row turning `running` is a stamp, whoever runs it — the built-in run or
  // the host — so the head follows the data, not the button.
  const runningKey = rows
    .filter((r) => stateOf(r.id).status === "running")
    .map((r) => r.id)
    .join(",");
  const [seenRunning, setSeenRunning] = React.useState(runningKey);
  const [stamp, setStamp] = React.useState<Stamp | null>(null);
  const [pressed, setPressed] = React.useState<Record<string, number>>({});
  if (seenRunning !== runningKey) {
    setSeenRunning(runningKey);
    const before = new Set(seenRunning.split(",").filter(Boolean));
    const fresh = runningKey.split(",").filter((id) => id && !before.has(id));
    const last = fresh[fresh.length - 1];
    if (last) setStamp((s) => ({ seq: (s?.seq ?? 0) + 1, rowId: last }));
  }

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const cellNode = (key: string) =>
    bodyRef.current?.querySelector<HTMLElement>(
      `[data-pstamp-cell="${CSS.escape(key)}"]`,
    ) ?? null;
  const hx = useMotionValue(0);
  const hy = useMotionValue(0);
  const hw = useMotionValue(120);
  const ho = useMotionValue(0);
  const hs = useMotionValue(1);
  const headRuns = React.useRef<AnimationPlaybackControls[]>([]);

  React.useEffect(() => {
    if (!stamp) return;
    const body = bodyRef.current;
    const cell = body?.querySelector<HTMLElement>(
      `[data-pstamp-cell="${CSS.escape(`${stamp.rowId}:out`)}"]`,
    );
    const stopAll = () => {
      for (const a of headRuns.current) a.stop();
      headRuns.current = [];
    };
    if (!motionSafe || !body || !cell) {
      const t = window.setTimeout(
        () => setPressed((p) => ({ ...p, [stamp.rowId]: stamp.seq })),
        0,
      );
      return () => window.clearTimeout(t);
    }
    stopAll();
    const b = body.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const x = round(c.left - b.left + 6);
    const w = round(Math.max(40, c.width - 12));
    const y = round(c.top - b.top + (c.height - HEAD_H) / 2);
    const travelling = ho.get() > 0.4;
    let pressAt = 0;
    if (travelling) {
      headRuns.current = [
        animate(hx, x, springs.glide),
        animate(hy, y, springs.glide),
        animate(hw, w, springs.glide),
        animate(ho, 1, { duration: durations.fast }),
      ];
      pressAt = 190;
    } else {
      hx.jump(x);
      hy.jump(y);
      hw.jump(w);
      headRuns.current = [
        animate(ho, 1, { duration: durations.fast, ease: easings.enter }),
      ];
    }
    // Keep the pressed row in view inside the sheet's own scroller — never
    // the page's.
    const scroller = scrollerRef.current;
    if (scroller) {
      const s = scroller.getBoundingClientRect();
      if (c.bottom > s.bottom || c.top < s.top + 32) {
        scroller.scrollTo({
          top: scroller.scrollTop + (c.top - s.top) - s.height / 2,
          behavior: "smooth",
        });
      }
    }
    const press = window.setTimeout(() => {
      // Reset with jump() so the landing spring starts from rest.
      hs.jump(1.06);
      headRuns.current.push(animate(hs, 1, springs.recoil));
      setPressed((p) => ({ ...p, [stamp.rowId]: stamp.seq }));
    }, pressAt);
    const lift = window.setTimeout(() => {
      headRuns.current.push(
        animate(ho, 0, { duration: durations.base, ease: easings.exit }),
      );
    }, pressAt + HOLD);
    return () => {
      window.clearTimeout(press);
      window.clearTimeout(lift);
    };
  }, [stamp, motionSafe, hx, hy, hw, ho, hs]);

  React.useEffect(
    () => () => {
      for (const a of headRuns.current) a.stop();
    },
    [],
  );

  /* ------------------------------- actions ------------------------------ */

  const promptFor = (row: PromptStampRow) => fill(pieces, row);
  const blockedReason = disabled
    ? "The sheet is read-only."
    : status !== "ready"
      ? "The rows haven't loaded."
      : rows.length === 0
        ? "There are no rows to run."
        : unknown.length
          ? `Fix {${unknown[0]}} first: it isn't a column.`
          : null;

  const queueRows = (ids: string[]) => {
    const r = runner.current;
    const base = r.jobs.filter((j) => !ids.includes(j.rowId));
    const fresh: Job[] = [];
    let next = { ...r.results };
    for (const id of ids) {
      const row = rows.find((x) => x.id === id);
      if (!row) continue;
      const prompt = promptFor(row);
      const gone = missingOf(row)[0];
      fresh.push({
        rowId: id,
        phase: "queued",
        since: r.clock,
        target: gone ? "" : respond(row, prompt),
        shown: 0,
        missing: gone ? gone.label : null,
      });
      next = { ...next, [id]: { status: "queued" } };
    }
    r.jobs = [...base, ...fresh];
    if (base.length === 0) r.nextStamp = r.clock;
    commitResults(next);
  };

  const run = () => {
    if (blockedReason) {
      setAnnouncement(blockedReason);
      return;
    }
    if (active) {
      stop();
      return;
    }
    setExported(null);
    setPressed({});
    onRun?.(rows.map((row) => ({ rowId: row.id, prompt: promptFor(row) })));
    if (!controlled) queueRows(rows.map((r) => r.id));
    setAnnouncement(
      `Running the prompt on ${plural(rows.length, "row")}. Results arrive in the ${outputLabel} column.`,
    );
  };

  const stop = () => {
    onStop?.();
    if (controlled) return;
    const r = runner.current;
    let next = { ...r.results };
    for (const job of r.jobs) {
      next =
        job.phase === "queued"
          ? { ...next, [job.rowId]: { status: "idle" } }
          : {
              ...next,
              [job.rowId]: {
                status: "failed",
                text: job.target.slice(0, job.shown),
                error: "Stopped",
              },
            };
    }
    r.jobs = [];
    commitResults(next);
    setAnnouncement("Run stopped.");
  };

  const retry = (row: PromptStampRow) => {
    if (disabled || unknown.length) return;
    const prompt = promptFor(row);
    onRetryRow?.(row.id, prompt);
    if (!controlled) queueRows([row.id]);
    const name = row.values[columns[0]?.id ?? ""] || row.id;
    setAnnouncement(`Retrying ${name}.`);
  };

  const exportCsv = () => {
    const doneRows = rows.filter((r) => stateOf(r.id).status === "done");
    if (doneRows.length === 0) {
      setAnnouncement("Nothing to export yet. Run the prompt first.");
      return;
    }
    const head = [...columns.map((c) => c.label), outputLabel]
      .map(csvCell)
      .join(",");
    const body = rows.map((r) =>
      [
        ...columns.map((c) => r.values[c.id] ?? ""),
        stateOf(r.id).status === "done" ? (stateOf(r.id).text ?? "") : "",
      ]
        .map(csvCell)
        .join(","),
    );
    onExport?.([head, ...body].join("\n"), results);
    setExported(doneRows.length);
    setAnnouncement(`Exported ${plural(doneRows.length, "row")} as CSV.`);
  };

  React.useImperativeHandle(ref, () => ({ run, stop }));

  /* ------------------------------ template ------------------------------ */

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const mirrorInner = React.useRef<HTMLDivElement | null>(null);
  const probeRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const pendingCaret = React.useRef<number | null>(null);
  const [picker, setPicker] = React.useState<Picker | null>(null);

  React.useLayoutEffect(() => {
    const p = pendingCaret.current;
    const ta = textareaRef.current;
    if (p === null || !ta) return;
    pendingCaret.current = null;
    ta.setSelectionRange(p, p);
  }, [template]);

  const matchesFor = (query: string) => {
    const q = query.toLowerCase();
    return columns
      .filter(
        (c) =>
          !q ||
          c.id.toLowerCase().includes(q) ||
          c.label.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          Number(!a.id.toLowerCase().startsWith(q)) -
          Number(!b.id.toLowerCase().startsWith(q)),
      );
  };

  /** Where the caret sits inside the editor, read off a probe in the same type. */
  const caretPoint = (text: string, at: number) => {
    const probe = probeRef.current;
    const ta = textareaRef.current;
    const box = editorRef.current;
    if (!probe || !ta || !box) return { left: 0, top: LINE + 10 };
    probe.textContent = text.slice(0, at);
    const mark = document.createElement("span");
    mark.textContent = "\u200b";
    probe.appendChild(mark);
    const width = box.clientWidth;
    const left = clampNum(mark.offsetLeft - 10, 0, Math.max(0, width - 232));
    const top = mark.offsetTop + LINE + 2 - ta.scrollTop;
    probe.textContent = "";
    return { left: Math.round(left), top: Math.round(top) };
  };

  const syncPicker = (ta: HTMLTextAreaElement) => {
    const text = ta.value;
    const caret = ta.selectionStart;
    if (caret !== ta.selectionEnd) {
      if (picker) setPicker(null);
      return;
    }
    let i = caret - 1;
    while (i >= 0 && /[\w-]/.test(text[i] ?? "")) i -= 1;
    if (i >= 0 && text[i] === "{") {
      const query = text.slice(i + 1, caret);
      const at = caretPoint(text, i);
      setPicker((p) => ({
        from: i,
        query,
        active: p && p.typed && p.from === i ? p.active : 0,
        left: at.left,
        top: at.top,
        typed: true,
      }));
    } else if (picker?.typed || (picker && picker.from !== caret)) {
      setPicker(null);
    }
  };

  const openPicker = () => {
    const ta = textareaRef.current;
    if (!ta || disabled) return;
    ta.focus();
    const caret = ta.selectionStart;
    const at = caretPoint(ta.value, caret);
    setPicker({
      from: caret,
      query: "",
      active: 0,
      left: at.left,
      top: at.top,
      typed: false,
    });
  };

  const insert = (col: PromptStampColumn) => {
    const ta = textareaRef.current;
    if (!picker || !ta) return;
    const caret = ta.selectionStart;
    let end = caret;
    if (template[end] === "}") end += 1;
    const token = `{${col.id}}`;
    const next = template.slice(0, picker.from) + token + template.slice(end);
    pendingCaret.current = picker.from + token.length;
    setTemplate(next);
    setPicker(null);
    setAnnouncement(`${col.label} inserted.`);
  };

  const pickerMatches = picker ? matchesFor(picker.query) : [];
  const pickerOpen = picker !== null && pickerMatches.length > 0;
  const activeMatch = pickerOpen
    ? pickerMatches[clampNum(picker.active, 0, pickerMatches.length - 1)]
    : undefined;

  const onTemplateKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      run();
      return;
    }
    if (!picker) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setPicker(null);
      return;
    }
    if (!pickerOpen) return;
    const n = pickerMatches.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const d = event.key === "ArrowDown" ? 1 : -1;
      setPicker({ ...picker, active: (picker.active + d + n) % n });
    } else if (event.key === "Enter" || event.key === "Tab") {
      if (activeMatch) {
        event.preventDefault();
        insert(activeMatch);
      }
    }
  };

  /* -------------------------------- grid -------------------------------- */

  const colKeys = ["state", ...columns.map((c) => c.id), "out"];
  const [focus, setFocus] = React.useState({ row: 0, col: 1 });
  const [editing, setEditing] = React.useState<{
    rowId: string;
    colId: string;
    draft: string;
  } | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const restoreTo = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (editing !== null) return;
    const key = restoreTo.current;
    if (!key) return;
    restoreTo.current = null;
    const node = cellNode(key);
    if (node?.isConnected) node.focus({ preventScroll: true });
  }, [editing]);

  const focusCell = (r: number, c: number) => {
    const row = rows[clampNum(r, 0, rows.length - 1)];
    const key = colKeys[clampNum(c, 0, colKeys.length - 1)];
    if (!row || !key) return;
    cellNode(`${row.id}:${key}`)?.focus();
  };

  const setCell = (rowId: string, colId: string, value: string) => {
    const next = rows.map((r) =>
      r.id === rowId ? { ...r, values: { ...r.values, [colId]: value } } : r,
    );
    if (rowsProp === undefined) setOwnRows(next);
    onRowsChange?.(next);
  };

  const finishEdit = (save: boolean) => {
    if (!editing) return;
    restoreTo.current = `${editing.rowId}:${editing.colId}`;
    if (save) {
      const row = rows.find((r) => r.id === editing.rowId);
      if (row && (row.values[editing.colId] ?? "") !== editing.draft) {
        setCell(editing.rowId, editing.colId, editing.draft);
        const col = columns.find((c) => c.id === editing.colId);
        setAnnouncement(
          `${col?.label ?? "Cell"} saved${stateOf(editing.rowId).status === "failed" ? ". Retry the row to run it again" : ""}.`,
        );
      }
    }
    setEditing(null);
  };

  const startEdit = (row: PromptStampRow, colId: string) => {
    if (disabled || colId === "state" || colId === "out") return;
    if (stateOf(row.id).status === "running") return;
    setEditing({ rowId: row.id, colId, draft: row.values[colId] ?? "" });
  };

  const toggleExpand = (rowId: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });

  const onGridKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const { row: r, col: c } = focus;
    const lastRow = rows.length - 1;
    const lastCol = colKeys.length - 1;
    const mod = event.ctrlKey || event.metaKey;
    const go = (rr: number, cc: number) => {
      event.preventDefault();
      focusCell(rr, cc);
    };
    switch (event.key) {
      case "ArrowRight":
        return go(r, c + 1);
      case "ArrowLeft":
        return go(r, c - 1);
      case "ArrowDown":
        return go(r + 1, c);
      case "ArrowUp":
        return go(r - 1, c);
      case "Home":
        return mod ? go(0, 0) : go(r, 0);
      case "End":
        return mod ? go(lastRow, lastCol) : go(r, lastCol);
      case "PageDown":
        return go(r + 5, c);
      case "PageUp":
        return go(r - 5, c);
      case "Enter":
      case "F2":
      case " ": {
        const row = rows[r];
        const key = colKeys[c];
        if (!row || !key) return;
        event.preventDefault();
        if (key === "out") {
          if (stateOf(row.id).status === "failed") retry(row);
          else if (event.key !== "F2") toggleExpand(row.id);
        } else if (key === "state") {
          if (stateOf(row.id).status === "failed") retry(row);
        } else if (event.key !== " ") {
          startEdit(row, key);
        }
        return;
      }
      default:
        return;
    }
  };

  /* ------------------------------- layout ------------------------------- */

  const lines = Math.max(1, Math.floor((rowHeight - 14) / 18));
  const vars = {
    "--ps-accent": accent,
    "--ps-wash": `color-mix(in oklab, ${accent} 13%, transparent)`,
    "--ps-faint": `color-mix(in oklab, ${accent} 6%, transparent)`,
    "--ps-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--ps-solid": `oklch(from ${accent} 0.55 c h)`,
    "--ps-on": "oklch(0.99 0.004 262)",
    "--ps-row": `${Math.round(rowHeight)}px`,
    "--ps-lines": String(lines),
    "--ps-lines-card": String(lines + 1),
    "--ps-cols": `2.75rem ${columns
      .map((c) => `minmax(4.5rem, ${Number((c.grow ?? 1).toFixed(3))}fr)`)
      .join(" ")} minmax(11rem, 3fr)`,
  } as React.CSSProperties;

  const summary =
    status === "loading"
      ? "Loading rows…"
      : status === "error"
        ? "The rows didn't load"
        : exported !== null
          ? `Exported ${plural(exported, "row")}`
          : active
            ? `Stamping ${started} of ${inRun}`
            : counts.done + counts.failed > 0
              ? `${counts.done} done · ${counts.failed} failed`
              : `${plural(rows.length, "row")} · ${plural(used.length, "field")}`;

  const headRow = stamp ? rows.find((r) => r.id === stamp.rowId) : undefined;
  const headPressed = Boolean(
    stamp && headRow && pressed[headRow.id] === stamp.seq,
  );

  const canExport = counts.done > 0;
  const runLabel = active
    ? "Stop"
    : counts.done + counts.failed > 0
      ? "Run again"
      : `Run ${plural(rows.length, "row")}`;

  /* ------------------------------- editor ------------------------------- */

  const editor = (
    <div className="flex flex-col gap-1.5 border-b border-hairline px-4 pt-3 pb-2.5">
      <label
        htmlFor={`${uid}-template`}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        Prompt
      </label>
      <div
        ref={editorRef}
        className="relative grid rounded-3 border border-input bg-surface-0 transition-colors focus-within:border-(--ps-line)"
      >
        <div
          aria-hidden
          className="pointer-events-none max-h-[104px] overflow-hidden [grid-area:1/1] @min-[34rem]/prompt-stamp:max-h-[126px]"
        >
          <div
            ref={mirrorInner}
            className="px-3 py-2.5 text-[13.5px] leading-[22px] break-words whitespace-pre-wrap text-foreground"
          >
            {pieces.map((p) =>
              p.kind === "text" ? (
                <React.Fragment key={p.key}>{p.text}</React.Fragment>
              ) : p.columnId ? (
                <span
                  key={p.key}
                  className="relative rounded-1 bg-(--ps-wash) text-(--ps-accent) shadow-[0_0_0_2px_var(--ps-wash)]"
                >
                  {motionSafe && stamp ? (
                    <motion.span
                      key={stamp.seq}
                      className="absolute -inset-x-0.5 inset-y-0 rounded-1 bg-(--ps-line)"
                      initial={{ opacity: 0.7 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: easings.exit }}
                    />
                  ) : null}
                  {`{${p.name}}`}
                </span>
              ) : (
                <span
                  key={p.key}
                  className="text-danger underline decoration-danger decoration-dashed underline-offset-4"
                >
                  {`{${p.name}}`}
                </span>
              ),
            )}
            {"\u200b"}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          id={`${uid}-template`}
          value={template}
          readOnly={disabled}
          rows={1}
          spellCheck={false}
          role="combobox"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            pickerOpen && activeMatch
              ? `${uid}-col-${activeMatch.id}`
              : undefined
          }
          aria-describedby={hintId}
          onChange={(event) => {
            const ta = event.currentTarget;
            setTemplate(ta.value);
            syncPicker(ta);
          }}
          onSelect={(event) => syncPicker(event.currentTarget)}
          onBlur={() => setPicker(null)}
          onScroll={(event) => {
            const top = event.currentTarget.scrollTop;
            if (mirrorInner.current)
              mirrorInner.current.style.transform = `translateY(${-top}px)`;
          }}
          onKeyDown={onTemplateKey}
          className={cn(
            "relative block h-full w-full resize-none [scrollbar-width:none] overflow-y-auto rounded-3 bg-transparent px-3 py-2.5 text-[13.5px] leading-[22px] text-transparent caret-foreground [grid-area:1/1] selection:bg-(--ps-line) selection:text-transparent [&::-webkit-scrollbar]:hidden",
            "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        />
        <div
          ref={probeRef}
          aria-hidden
          className="pointer-events-none invisible absolute inset-x-0 top-0 px-3 py-2.5 text-[13.5px] leading-[22px] break-words whitespace-pre-wrap"
        />
        {pickerOpen && picker ? (
          <motion.ul
            key="picker"
            id={listId}
            role="listbox"
            aria-label="Columns"
            className="absolute z-30 flex w-56 flex-col gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_8px_24px_color-mix(in_oklab,black_14%,transparent)]"
            style={{ left: picker.left, top: picker.top }}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {pickerMatches.map((col) => {
              const on = col === activeMatch;
              const sample = rows[0]?.values[col.id] ?? "";
              return (
                <li
                  key={col.id}
                  id={`${uid}-col-${col.id}`}
                  role="option"
                  aria-selected={on}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insert(col);
                  }}
                  onMouseMove={() => {
                    const i = pickerMatches.indexOf(col);
                    if (picker.active !== i)
                      setPicker({ ...picker, active: i });
                  }}
                  className={cn(
                    "flex h-8 cursor-pointer items-center gap-2 rounded-2 px-2",
                    on ? "bg-(--ps-wash)" : "hover:bg-surface-2",
                  )}
                >
                  <span className="truncate text-[12.5px] font-medium text-foreground">
                    {col.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
                    {sample}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-(--ps-accent)">
                    {`{${col.id}}`}
                  </span>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p
          id={hintId}
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4",
            unknown.length ? "text-danger" : "text-ink-3",
          )}
        >
          {unknown.length ? (
            <>
              <CircleAlert aria-hidden className="size-3.5 shrink-0" />
              <span>{`{${unknown[0]}} isn’t a column. Pick one from the list.`}</span>
            </>
          ) : (
            <span>
              Type <kbd className="font-mono text-ink-2">{"{"}</kbd> to add a
              column · ⌘↵ runs
            </span>
          )}
        </p>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openPicker}
          aria-disabled={disabled || undefined}
          className={cn(
            BUTTON,
            FOCUS,
            "h-7 px-2 text-[11.5px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <Braces aria-hidden className="size-3.5" />
          Columns
        </button>
      </div>
    </div>
  );

  /* -------------------------------- sheet ------------------------------- */

  const header = (
    <div role="rowgroup" className="sticky top-0 z-10">
      <div
        role="row"
        aria-rowindex={1}
        className="sr-only @min-[34rem]/prompt-stamp:not-sr-only @min-[34rem]/prompt-stamp:grid @min-[34rem]/prompt-stamp:h-8 @min-[34rem]/prompt-stamp:grid-cols-(--ps-cols) @min-[34rem]/prompt-stamp:border-b @min-[34rem]/prompt-stamp:border-hairline @min-[34rem]/prompt-stamp:bg-surface-1"
      >
        <span
          role="columnheader"
          aria-colindex={1}
          className="flex items-center px-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          #
        </span>
        {columns.map((col, i) => (
          <span
            key={col.id}
            role="columnheader"
            aria-colindex={i + 2}
            className={cn(
              "flex min-w-0 items-center gap-1 px-3 font-mono text-[10px] tracking-[0.08em] uppercase",
              usedIds.has(col.id) ? "text-(--ps-accent)" : "text-ink-3",
            )}
          >
            <span className="truncate">{col.label}</span>
          </span>
        ))}
        <span
          role="columnheader"
          aria-colindex={columns.length + 2}
          className="flex items-center border-l border-hairline px-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {outputLabel}
        </span>
      </div>
    </div>
  );

  const glyph = (state: PromptStampRowState) => {
    if (state === "queued")
      return (
        <span
          aria-hidden
          className="size-2 rounded-full border border-hairline-strong"
        />
      );
    if (state === "running")
      return (
        <LoaderCircle
          aria-hidden
          className="size-3.5 text-(--ps-accent) motion-safe:animate-spin"
        />
      );
    if (state === "done")
      return (
        <motion.span
          aria-hidden
          className="inline-flex text-(--ps-accent)"
          initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { scale: springs.flick, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          <Check className="size-3.5" strokeWidth={2.5} />
        </motion.span>
      );
    if (state === "failed")
      return <CircleAlert aria-hidden className="size-3.5 text-danger" />;
    return null;
  };

  const focusRow = clampNum(focus.row, 0, Math.max(0, rows.length - 1));
  const sheetRows = rows.map((row, ri) => {
    const res = stateOf(row.id);
    const missing = missingOf(row);
    const lit =
      res.status === "running" &&
      (!motionSafe || pressed[row.id] !== undefined);
    const open = expanded.has(row.id);
    const name = row.values[columns[0]?.id ?? ""] || `Row ${ri + 1}`;
    const stateWord =
      res.status === "idle"
        ? "not run"
        : res.status === "failed"
          ? `failed: ${res.error ?? "no answer"}`
          : res.status;
    const isFocus = (c: number) => focusRow === ri && focus.col === c;
    const bind = (key: string) => `${row.id}:${key}`;
    const onCellFocus = (c: number) => () => {
      if (focus.row !== ri || focus.col !== c) setFocus({ row: ri, col: c });
    };
    const usedOrder = used.map((u) => u.id);

    return (
      <div
        key={row.id}
        role="row"
        aria-rowindex={ri + 2}
        className={cn(
          "relative flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-hairline px-3 py-2.5 last:border-b-0",
          "@min-[34rem]/prompt-stamp:grid @min-[34rem]/prompt-stamp:grid-cols-(--ps-cols) @min-[34rem]/prompt-stamp:gap-0 @min-[34rem]/prompt-stamp:p-0",
          open
            ? "@min-[34rem]/prompt-stamp:h-auto"
            : "@min-[34rem]/prompt-stamp:h-(--ps-row)",
          res.status === "queued" && "opacity-70",
        )}
      >
        <div
          data-pstamp-cell={bind("state")}
          role="rowheader"
          aria-colindex={1}
          aria-label={`Row ${ri + 1}, ${name}, ${stateWord}`}
          tabIndex={isFocus(0) ? 0 : -1}
          onFocus={onCellFocus(0)}
          className={cn(
            "flex h-6 w-9 shrink-0 items-center gap-1.5 rounded-1 font-mono text-[11px] text-ink-3 tabular-nums",
            "@min-[34rem]/prompt-stamp:h-full @min-[34rem]/prompt-stamp:w-auto @min-[34rem]/prompt-stamp:rounded-none @min-[34rem]/prompt-stamp:px-3",
            CELL_FOCUS,
          )}
        >
          <span>{ri + 1}</span>
          {glyph(res.status)}
        </div>
        {columns.map((col, ci) => {
          const value = row.values[col.id] ?? "";
          const mapped = usedIds.has(col.id);
          const empty = mapped && missing.some((m) => m.id === col.id);
          const flagged = empty && res.status === "failed";
          const isEditing =
            editing?.rowId === row.id && editing.colId === col.id;
          const order = Math.max(0, usedOrder.indexOf(col.id));
          return (
            <div
              key={col.id}
              data-pstamp-cell={bind(col.id)}
              role="gridcell"
              aria-colindex={ci + 2}
              aria-label={`${col.label}: ${value || "empty"}`}
              tabIndex={isFocus(ci + 1) ? 0 : -1}
              onFocus={onCellFocus(ci + 1)}
              onDoubleClick={() => startEdit(row, col.id)}
              title={value || undefined}
              className={cn(
                "relative flex min-w-0 items-center rounded-1 transition-[background-color,box-shadow] duration-300",
                ci === 0
                  ? "w-[calc(100%-2.75rem)] text-[13px] font-medium text-foreground"
                  : "h-6 rounded-full bg-surface-2 px-2 text-[11.5px] text-ink-2",
                "@min-[34rem]/prompt-stamp:h-full @min-[34rem]/prompt-stamp:w-auto @min-[34rem]/prompt-stamp:rounded-none @min-[34rem]/prompt-stamp:bg-transparent @min-[34rem]/prompt-stamp:px-2.5 @min-[34rem]/prompt-stamp:text-[12.5px]",
                ci === 0 && "@min-[34rem]/prompt-stamp:font-medium",
                ci !== 0 && "@min-[34rem]/prompt-stamp:text-ink-2",
                lit &&
                  mapped &&
                  "bg-(--ps-wash) @min-[34rem]/prompt-stamp:bg-(--ps-wash)",
                !lit &&
                  res.status === "running" &&
                  mapped &&
                  "@min-[34rem]/prompt-stamp:bg-(--ps-faint)",
                flagged &&
                  "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] @min-[34rem]/prompt-stamp:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]",
                CELL_FOCUS,
              )}
              style={{
                transitionDelay:
                  lit && mapped && motionSafe
                    ? `${Math.round(order * cascade(used.length) * 1000)}ms`
                    : "0ms",
              }}
            >
              {isEditing ? (
                <input
                  ref={(node) => node?.focus({ preventScroll: true })}
                  aria-label={`Edit ${col.label}`}
                  value={editing.draft}
                  onChange={(event) => {
                    const v = event.currentTarget.value;
                    setEditing((e) => (e ? { ...e, draft: v } : e));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      finishEdit(true);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      finishEdit(false);
                    }
                  }}
                  onBlur={() => finishEdit(true)}
                  className="h-7 w-full min-w-0 rounded-1 border border-(--ps-line) bg-surface-0 px-1.5 text-[12.5px] text-foreground outline-none"
                />
              ) : (
                <span
                  className={cn(
                    "truncate",
                    !value && "font-mono text-[11px] text-ink-3",
                    flagged && "text-danger",
                  )}
                >
                  {value || (flagged ? "empty" : "—")}
                </span>
              )}
            </div>
          );
        })}
        <div
          data-pstamp-cell={bind("out")}
          role="gridcell"
          aria-colindex={columns.length + 2}
          aria-expanded={res.status === "done" ? open : undefined}
          tabIndex={isFocus(colKeys.length - 1) ? 0 : -1}
          onFocus={onCellFocus(colKeys.length - 1)}
          onClick={() => {
            if (res.status === "done") toggleExpand(row.id);
          }}
          className={cn(
            "relative flex w-full min-w-0 items-start rounded-2 border border-hairline px-2.5 py-2",
            "@min-[34rem]/prompt-stamp:h-full @min-[34rem]/prompt-stamp:items-center @min-[34rem]/prompt-stamp:rounded-none @min-[34rem]/prompt-stamp:border-0 @min-[34rem]/prompt-stamp:border-l @min-[34rem]/prompt-stamp:px-3 @min-[34rem]/prompt-stamp:py-[7px]",
            res.status === "done" && "cursor-pointer",
            CELL_FOCUS,
          )}
        >
          {pressed[row.id] !== undefined ? (
            <motion.span
              key={pressed[row.id]}
              aria-hidden
              className="pointer-events-none absolute inset-1 rounded-2 border border-(--ps-accent) bg-(--ps-faint)"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: easings.exit, delay: 0.12 }}
            />
          ) : null}
          {res.status === "failed" ? (
            <span className="relative flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12px] text-danger">
                {res.error ?? "No answer"}
              </span>
              <button
                type="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  retry(row);
                }}
                aria-disabled={disabled || unknown.length > 0 || undefined}
                className={cn(
                  BUTTON,
                  "h-6 border border-hairline-strong bg-card px-2 text-[11.5px] text-foreground hover:bg-surface-2",
                )}
              >
                <RotateCcw aria-hidden className="size-3" />
                Retry
              </button>
            </span>
          ) : (
            <span
              className={cn(
                "relative text-[12.5px] leading-[18px]",
                open
                  ? "line-clamp-none"
                  : "line-clamp-(--ps-lines-card) @min-[34rem]/prompt-stamp:line-clamp-(--ps-lines)",
                res.status === "done" || res.status === "running"
                  ? "text-foreground"
                  : "font-mono text-[11px] text-ink-3",
              )}
            >
              {res.text
                ? res.text
                : res.status === "queued"
                  ? "Queued"
                  : res.status === "running"
                    ? "Writing…"
                    : "Not run yet"}
              {res.status === "running" && res.text ? (
                <span
                  aria-hidden
                  className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] rounded-full bg-(--ps-accent) motion-safe:animate-pulse"
                />
              ) : null}
            </span>
          )}
        </div>
      </div>
    );
  });

  const body =
    status === "loading" ? (
      <div aria-hidden className="flex flex-col">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-hairline px-3"
            style={{ height: Math.round(rowHeight) }}
          >
            <span className="h-2.5 w-4 rounded-full bg-surface-2" />
            <span className="h-2.5 w-24 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-2.5 flex-1 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <CircleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">The sheet didn’t load.</p>
        <button
          type="button"
          onClick={() => onReload?.()}
          className={cn(
            BUTTON,
            FOCUS,
            "border border-hairline-strong bg-surface-1 text-foreground hover:bg-surface-2",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    ) : rows.length === 0 ? (
      <p className="px-6 py-10 text-center text-[13px] text-ink-2">
        No rows to stamp yet. Add rows to the sheet and the prompt runs down
        them.
      </p>
    ) : (
      <div
        role="grid"
        aria-labelledby={titleId}
        aria-rowcount={rows.length + 1}
        aria-colcount={colKeys.length}
        aria-describedby={`${uid}-grid-hint`}
        onKeyDown={onGridKey}
        className="relative"
      >
        {header}
        <div ref={bodyRef} role="rowgroup" className="relative">
          {sheetRows}
          {motionSafe ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 z-20 flex items-center gap-1 overflow-hidden rounded-2 border-[1.5px] border-(--ps-accent) bg-card px-1.5 shadow-[0_6px_18px_color-mix(in_oklab,black_16%,transparent)]"
              style={{
                x: hx,
                y: hy,
                width: hw,
                height: HEAD_H,
                opacity: ho,
                scale: hs,
              }}
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded-1 bg-(--ps-wash) text-(--ps-accent)">
                <Braces className="size-3" />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {used.map((col) => {
                  const value = headRow?.values[col.id] ?? "";
                  const missing = headPressed && !value.trim();
                  return (
                    <span
                      key={col.id}
                      className={cn(
                        "inline-flex h-4 shrink-0 items-center rounded-1 px-1 font-mono text-[10px] whitespace-nowrap",
                        missing
                          ? "bg-[color-mix(in_oklab,var(--danger)_16%,transparent)] text-danger"
                          : headPressed
                            ? "bg-(--ps-wash) text-foreground"
                            : "text-(--ps-accent)",
                      )}
                    >
                      {headPressed ? value || "empty" : `{${col.id}}`}
                    </span>
                  );
                })}
              </span>
            </motion.div>
          ) : null}
        </div>
      </div>
    );

  return (
    <section
      ref={setSurface}
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/prompt-stamp relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...vars, maxHeight: height }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="truncate text-[14px] leading-5 font-semibold"
          >
            {title}
          </h2>
          <p className="truncate font-mono text-[10.5px] leading-4 text-ink-3 tabular-nums">
            {summary}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            aria-disabled={!canExport || undefined}
            className={cn(
              BUTTON,
              FOCUS,
              "border border-hairline-strong bg-surface-1 text-foreground hover:bg-surface-2",
              !canExport && "text-ink-3 hover:bg-surface-1",
            )}
          >
            <Download aria-hidden className="size-3.5" />
            Export
          </button>
          <button
            type="button"
            onClick={run}
            aria-disabled={(!active && blockedReason !== null) || undefined}
            className={cn(
              BUTTON,
              FOCUS,
              active
                ? "border border-hairline-strong bg-surface-2 text-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_10%,var(--bg-2))]"
                : "bg-(--ps-solid) text-(--ps-on) hover:bg-[color-mix(in_oklab,var(--ps-solid)_88%,black)]",
              !active && blockedReason !== null && "opacity-50",
            )}
          >
            {active ? (
              <Square aria-hidden className="size-3 fill-current" />
            ) : (
              <Play aria-hidden className="size-3.5 fill-current" />
            )}
            {runLabel}
          </button>
        </div>
      </header>

      {editor}

      <div
        ref={scrollerRef}
        className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        {body}
      </div>

      <p id={`${uid}-grid-hint`} className="sr-only">
        Arrow keys move between cells. Enter edits a field; on an answer, Enter
        expands it or retries a failed row.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
