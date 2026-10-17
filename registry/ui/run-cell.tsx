"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  Clock,
  Copy,
  Maximize2,
  RotateCcw,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type RunCellCodeTheme = "paper" | "ink" | "tint";
export type RunCellGutterStyle = "ticks" | "bar" | "dots";
export type RunCellAccentName = "cobalt" | "plum" | "mint" | "ink";
export type RunCellStatus =
  "queued" | "running" | "done" | "error" | "timed-out" | "stopped";
export type RunCellTab = "output" | "figure" | "data";

/** One line the code printed. */
export type RunOutput = {
  id: string;
  stream: "stdout" | "stderr";
  text: string;
};

/** One line on a figure. */
export type RunSeries = {
  label: string;
  /** Evenly spaced readings along the x axis. */
  values: number[];
};

/** A figure the code returned. */
export type RunFigure = {
  id: string;
  title: string;
  /** The x axis: one label per tick, spread evenly. */
  xTicks: string[];
  /** The y axis's unit, shown on the axis. */
  yUnit: string;
  series: RunSeries[];
  /** A band either side of zero, drawn as the tolerance. */
  band?: number;
  /** One sentence for assistive technology and the caption. */
  summary: string;
};

/** Where and why the code failed. */
export type RunError = {
  /** 1-based, as a traceback counts. */
  line: number;
  name: string;
  message: string;
  /** The traceback, one line each. */
  trace: string[];
};

export type RunCellProps = {
  /** The code, in full or as far as it has arrived. New lines slide in. @default defaultRunCode */
  code?: string;
  /** Its language, for the chip and the colouring. @default "python" */
  language?: string;
  /** How many lines have run; the line at this index is running now. @default every line once done */
  executedLine?: number;
  /** What it printed, so far. @default defaultRunOutputs */
  outputs?: RunOutput[];
  /** What it returned. A new figure develops in the Figure tab. @default defaultRunFigures */
  figures?: RunFigure[];
  /** Where the call is. @default "done" */
  status?: RunCellStatus;
  /** The failure, with the line it happened on. */
  error?: RunError;
  /** Run time so far, ms. @default 2380 */
  elapsed?: number;
  /** The run's time limit, ms, shown when it is hit. @default 30000 */
  timeout?: number;
  /** The machine that ran it. @default "Gaugeworks runtime · py 3.12" */
  runtime?: string;
  /** The execution count, In [7]. @default 7 */
  count?: number;
  /** Controlled output tab. */
  tab?: RunCellTab;
  /** Initial output tab when uncontrolled; a new figure selects Figure. @default "figure" when a figure exists, else "output" */
  defaultTab?: RunCellTab;
  /** Fires from the click or key that changed the tab. */
  onTabChange?: (tab: RunCellTab) => void;
  /** Re-run was pressed, or Enter on the code. */
  onRerun?: () => void;
  /** Stop was pressed while it ran. */
  onStop?: () => void;
  /** Copy was pressed, with the code (also written to the clipboard when it allows). */
  onCopy?: (code: string) => void;
  /** Open was pressed on a figure. */
  onOpenFigure?: (figure: RunFigure) => void;
  /** On a phone the code folds to this many lines until opened. @default 4 */
  foldLines?: number;
  /** The code's surface: the page's paper, a deep ink panel in both themes, or a tint of the accent. @default "paper" */
  codeTheme?: RunCellCodeTheme;
  /** How executed lines are marked: a tick each, one bar filling down, or dots that fill. @default "ticks" */
  gutterStyle?: RunCellGutterStyle;
  /** The cursor, keywords and the running state: a named pigment or any CSS colour. @default "cobalt" */
  accent?: RunCellAccentName | (string & {});
  /** Read only: nothing can be re-run, stopped or copied. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Gaugeworks' sensor drift check for line 4, as the agent wrote it. */
export const defaultRunCode = [
  "from gaugeworks import sensors, plot",
  "",
  'readings = sensors.load("line-4", days=7)',
  "tolerance = 0.8  # kPa, from the line-4 spec",
  "",
  "drift = {}",
  "for sensor in readings.sensors:",
  "    series = readings.kpa(sensor)",
  "    base = series[0]",
  "    drift[sensor] = [round(v - base, 2) for v in series]",
  "",
  "for sensor, values in drift.items():",
  "    worst = max(abs(v) for v in values)",
  '    flag = "PAST TOLERANCE" if worst > tolerance else "ok"',
  '    print(f"{sensor}  max drift {worst:.2f} kPa  {flag}")',
  "",
  'fig = plot.lines(drift, title="Drift per sensor, 7 days")',
  'fig.band(-tolerance, tolerance, label="tolerance")',
].join("\n");

export const defaultRunOutputs: RunOutput[] = [
  {
    id: "o1",
    stream: "stdout",
    text: "loaded 3 sensors · 168 readings · line-4",
  },
  { id: "o2", stream: "stdout", text: "P-101  max drift 0.07 kPa  ok" },
  { id: "o3", stream: "stdout", text: "P-102  max drift 0.51 kPa  ok" },
  {
    id: "o4",
    stream: "stdout",
    text: "P-103  max drift 1.24 kPa  PAST TOLERANCE",
  },
];

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Four readings a day for a week, seeded: one steady, one creeping, one past tolerance. */
const driftSeries = (seed: number, slope: number, wobble: number) => {
  const rand = mulberry32(seed);
  return Array.from({ length: 28 }, (_, i) => {
    const v = slope * (i / 27) ** 1.35 + (rand() - 0.5) * wobble;
    return Math.round((i === 0 ? 0 : v) * 100) / 100;
  });
};

export const defaultRunFigures: RunFigure[] = [
  {
    id: "fig-1",
    title: "Drift per sensor, 7 days",
    xTicks: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    yUnit: "kPa",
    band: 0.8,
    series: [
      { label: "P-101", values: driftSeries(101, 0.06, 0.12) },
      { label: "P-102", values: driftSeries(102, 0.48, 0.1) },
      { label: "P-103", values: driftSeries(103, 1.2, 0.1) },
    ],
    summary:
      "Drift over seven days: P-101 stays near zero, P-102 creeps to half a kilopascal, P-103 leaves the ±0.8 kPa tolerance on Saturday and ends the week at 1.24.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;
const seconds = (ms: number) =>
  ms < 10_000
    ? `${(Math.round(ms / 100) / 10).toFixed(1)} s`
    : `${Math.round(ms / 1000)} s`;

const ACCENTS: Record<RunCellAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--rc-ink": ACCENTS[accent as RunCellAccentName] ?? accent,
    "--rc-wash": "color-mix(in oklab, var(--rc-ink) 11%, transparent)",
    "--rc-soft": "color-mix(in oklab, var(--rc-ink) 32%, transparent)",
  }) as React.CSSProperties;

/**
 * Token colours per code surface. The ink panel is the same deep ink in both
 * themes (a fixed lightness on the accent's hue), so its tokens are fixed
 * lightness too.
 */
const THEME: Record<
  RunCellCodeTheme,
  {
    surface: React.CSSProperties;
    text: string;
    dim: string;
    keyword: string;
    string: string;
    number: string;
    comment: string;
    call: string;
  }
> = {
  paper: {
    surface: { backgroundColor: "var(--bg-1)" },
    text: "var(--ink-2)",
    dim: "var(--ink-3)",
    keyword: "var(--rc-ink)",
    string: "var(--success)",
    number: "var(--warn)",
    comment: "var(--ink-3)",
    call: "var(--foreground)",
  },
  ink: {
    surface: { backgroundColor: "oklch(from var(--accent) 0.2 0.03 h)" },
    text: "oklch(from var(--ink) 0.86 0.01 h)",
    dim: "oklch(from var(--ink) 0.58 0.02 h)",
    keyword: "oklch(from var(--rc-ink) 0.78 c h)",
    string: "oklch(from var(--success) 0.8 0.13 h)",
    number: "oklch(from var(--warn) 0.84 0.12 h)",
    comment: "oklch(from var(--ink) 0.6 0.02 h)",
    call: "oklch(from var(--ink) 0.97 0.01 h)",
  },
  tint: {
    surface: {
      backgroundColor: "color-mix(in oklab, var(--rc-ink) 8%, var(--bg-1))",
    },
    text: "var(--ink-2)",
    dim: "var(--ink-3)",
    keyword: "var(--rc-ink)",
    string: "var(--success)",
    number: "var(--warn)",
    comment: "var(--ink-3)",
    call: "var(--foreground)",
  },
};

type Tok = {
  text: string;
  kind: "keyword" | "string" | "number" | "comment" | "call" | "text";
};

const KEYWORDS = new Set([
  "from",
  "import",
  "as",
  "def",
  "return",
  "for",
  "in",
  "if",
  "else",
  "elif",
  "while",
  "with",
  "lambda",
  "and",
  "or",
  "not",
  "is",
  "None",
  "True",
  "False",
  "class",
  "try",
  "except",
  "raise",
  "yield",
  "pass",
  "break",
  "continue",
]);

/** A small, honest Python colouring: keywords, strings, numbers, comments, calls. */
function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const re =
    /(#.*$)|([rbf]?"(?:[^"\\]|\\.)*"?|[rbf]?'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(?=\s*\()|([A-Za-z_][A-Za-z0-9_]*)|(\s+|.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1]) out.push({ text: m[1], kind: "comment" });
    else if (m[2]) out.push({ text: m[2], kind: "string" });
    else if (m[3]) out.push({ text: m[3], kind: "number" });
    else if (m[4])
      out.push({ text: m[4], kind: KEYWORDS.has(m[4]) ? "keyword" : "call" });
    else if (m[5])
      out.push({ text: m[5], kind: KEYWORDS.has(m[5]) ? "keyword" : "text" });
    else out.push({ text: m[0], kind: "text" });
  }
  return out;
}

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const LINE_H = 20;

/* ----------------------------------------------------------------------- */
/*                                  Figure                                  */
/* ----------------------------------------------------------------------- */

/** Series strokes: the accent, then two ink tones, so the palette stays quiet. */
const SERIES = [
  "var(--rc-ink)",
  "var(--ink-2)",
  "oklch(from var(--danger) 0.64 0.19 h)",
];

function FigurePlot({
  figure,
  uid,
  develop,
  motionSafe,
}: {
  figure: RunFigure;
  uid: string;
  develop: boolean;
  motionSafe: boolean;
}) {
  const all = figure.series.flatMap((s) => s.values);
  const band = figure.band ?? 0;
  // The domain hugs the data and the band, so a one-sided drift fills the
  // frame instead of leaving its empty half.
  const top = Math.max(band, ...all) || 1;
  const bottom = Math.min(-band, ...all);
  const pad = (top - bottom) * 0.08;
  const hi = top + pad;
  const lo = bottom - pad;
  // The plot is drawn in a 100 × 60 box stretched to fit; strokes keep their
  // width, and the labels are HTML placed by percentage, so it stays crisp
  // at any width without measuring.
  const W = 100;
  const H = 60;
  const yOf = (v: number) => r2(((hi - v) / (hi - lo)) * H);
  const clipId = `${uid}-sweep`;
  const longest = Math.max(1, ...figure.series.map((s) => s.values.length));
  const ticks = band ? [band, 0, -band] : [r2(top), 0, r2(bottom)];

  return (
    <motion.div
      className="relative flex h-full flex-col gap-2"
      initial={
        develop
          ? motionSafe
            ? { opacity: 0, filter: "blur(12px)", scale: 1.02 }
            : { opacity: 0 }
          : false
      }
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      transition={{
        opacity: { duration: durations.slow, ease: easings.enter },
        filter: { duration: durations.page, ease: easings.enter },
        scale: motionSafe ? springs.glide : { duration: 0 },
      }}
    >
      <div className="relative min-w-0 flex-1" style={{ minHeight: 72 }}>
        {/* y axis labels */}
        {ticks.map((t) => (
          <span
            key={t}
            aria-hidden
            className="absolute left-0 w-8 -translate-y-1/2 pr-1 text-right font-mono text-[9px] text-ink-3 tabular-nums"
            style={{ top: `${r2((yOf(t) / H) * 100)}%` }}
          >
            {t === 0 ? `0 ${figure.yUnit}` : t.toFixed(1)}
          </span>
        ))}
        <svg
          role="img"
          aria-label={`${figure.title}. ${figure.summary}`}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          // Absolute, so the stretched plot takes the box it is given and
          // never its own aspect ratio.
          className="absolute inset-y-0 right-0 left-9 block h-full w-[calc(100%-2.25rem)] overflow-visible"
        >
          <defs>
            <clipPath id={clipId}>
              <motion.rect
                x={0}
                y={-5}
                height={H + 10}
                initial={develop && motionSafe ? { width: 0 } : false}
                animate={{ width: W }}
                transition={{ ...springs.glide, delay: develop ? 0.15 : 0 }}
              />
            </clipPath>
          </defs>
          {band ? (
            <motion.rect
              x={0}
              y={yOf(band)}
              width={W}
              height={r2(yOf(-band) - yOf(band))}
              className="fill-[var(--rc-wash)]"
              initial={develop ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{
                duration: durations.slow,
                delay: develop ? 0.45 : 0,
              }}
            />
          ) : null}
          {ticks.map((t) => (
            <line
              key={t}
              x1={0}
              x2={W}
              y1={yOf(t)}
              y2={yOf(t)}
              vectorEffect="non-scaling-stroke"
              className={t === 0 ? "stroke-hairline-strong" : "stroke-hairline"}
              strokeWidth={1}
              strokeDasharray={t === 0 ? undefined : "2 3"}
            />
          ))}
          <g clipPath={`url(#${clipId})`}>
            {figure.series.map((s, k) => (
              <polyline
                key={s.label}
                points={s.values
                  .map((v, i) => `${r2((i / (longest - 1)) * W)},${yOf(v)}`)
                  .join(" ")}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ stroke: SERIES[k % SERIES.length] }}
              />
            ))}
          </g>
        </svg>
      </div>
      <div
        className="flex justify-between pl-9 font-mono text-[9px] text-ink-3"
        aria-hidden
      >
        {figure.xTicks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-9"
        aria-hidden
      >
        {figure.series.map((s, k) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-2"
          >
            <span
              className="h-0.5 w-3 rounded-full"
              style={{ backgroundColor: SERIES[k % SERIES.length] }}
            />
            {s.label}
          </span>
        ))}
        {band ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-3">
            <span className="h-2 w-3 rounded-[2px] bg-[var(--rc-wash)]" />
            {`±${band} ${figure.yUnit}`}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A code execution tool call drawn as a notebook cell, fed by props as the
 * call streams. New lines of code slide in from 4 px on `glide`; as the run
 * passes each line an execution cursor glides down the gutter and the line
 * is marked on `flick` (a tick, a bar filling down, or a dot); stdout rises
 * line by line below. When a figure first arrives the Figure tab opens and
 * the plot develops out of a blank frame: a soft blur clears and the frame
 * settles from 1.02 on `glide` while the lines draw left to right behind a
 * sweeping clip and the tolerance band fades in last. Its data is one tab
 * away, as a real table.
 *
 * A failing line takes a danger wash and a cross, a timed-out line a warn
 * wash and a clock, and the trace shows in the output. Tab moves from the
 * code to the tabs to the panel; Enter on the code re-runs. Below a 30rem
 * container the code folds to its first lines. Under reduced motion lines
 * and figures appear with a fade and the cursor jumps.
 */
export function RunCell({
  code = defaultRunCode,
  language = "python",
  executedLine,
  outputs = defaultRunOutputs,
  figures = defaultRunFigures,
  status = "done",
  error,
  elapsed = 2380,
  timeout = 30_000,
  runtime = "Gaugeworks runtime · py 3.12",
  count = 7,
  tab,
  defaultTab,
  onTabChange,
  onRerun,
  onStop,
  onCopy,
  onOpenFigure,
  foldLines = 4,
  codeTheme = "paper",
  gutterStyle = "ticks",
  accent = "cobalt",
  disabled = false,
  className,
}: RunCellProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const theme = THEME[codeTheme] ?? THEME.paper;

  const lines = code.length ? code.split("\n") : [];
  const total = lines.length;
  const running = status === "running";
  const ran =
    executedLine ??
    (status === "queued"
      ? 0
      : status === "done"
        ? total
        : status === "error" && error
          ? error.line - 1
          : total);
  const done = clamp(Math.round(ran), 0, total);
  const failAt = status === "error" && error ? error.line - 1 : -1;
  const stopAt =
    status === "timed-out" || status === "stopped"
      ? Math.min(done, total - 1)
      : -1;
  const cursorAt = running ? Math.min(done, total - 1) : -1;

  // A replaced program (a re-run) starts its lines fresh; an extended one
  // keeps the lines it had and slides the new ones in.
  const [gen, setGen] = React.useState(0);
  const [prevCode, setPrevCode] = React.useState(code);
  if (code !== prevCode) {
    if (!code.startsWith(prevCode)) setGen((g) => g + 1);
    setPrevCode(code);
  }

  const [ownTab, setOwnTab] = React.useState<RunCellTab>(
    defaultTab ?? (figures.length ? "figure" : "output"),
  );
  const [prevFigures, setPrevFigures] = React.useState(figures.length);
  // Figures that arrive after the first frame develop; the rest are drawn.
  const [developing, setDeveloping] = React.useState<string[]>([]);
  if (figures.length !== prevFigures) {
    if (figures.length > prevFigures) {
      if (tab === undefined) setOwnTab("figure");
      setDeveloping(figures.slice(prevFigures).map((f) => f.id));
    }
    setPrevFigures(figures.length);
  }
  const shownTab = tab ?? ownTab;

  const [expanded, setExpanded] = React.useState(false);
  const [traceOpen, setTraceOpen] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [prevStatus, setPrevStatus] = React.useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    setAnnouncement(
      status === "done"
        ? `Run finished in ${seconds(elapsed)}${figures.length ? `, ${plural(figures.length, "figure")}` : ""}.`
        : status === "error" && error
          ? `${error.name} on line ${error.line}: ${error.message}`
          : status === "timed-out"
            ? `Timed out after ${seconds(timeout)}.`
            : status === "stopped"
              ? "Run stopped."
              : status === "running"
                ? "Running."
                : "",
    );
  }

  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const selectTab = (next: RunCellTab) => {
    if (tab === undefined) setOwnTab(next);
    onTabChange?.(next);
  };

  const rerun = () => {
    if (disabled || running) return;
    onRerun?.();
  };

  const copy = () => {
    if (disabled) return;
    try {
      void navigator.clipboard?.writeText(code).catch(() => {});
    } catch {
      // No clipboard here; the host still hears about the copy.
    }
    onCopy?.(code);
    setCopied(true);
    setAnnouncement("Code copied.");
  };

  /* -------------------------------- parts ------------------------------- */

  const STATUS: Record<
    RunCellStatus,
    { label: string; className: string; dot: React.CSSProperties }
  > = {
    queued: {
      label: "Queued",
      className: "text-ink-3 border-hairline-strong",
      dot: { backgroundColor: "var(--hairline-strong)" },
    },
    running: {
      label: "Running",
      className: "text-[var(--rc-ink)] border-[var(--rc-soft)]",
      dot: { backgroundColor: "var(--rc-ink)" },
    },
    done: {
      label: "Done",
      className:
        "text-success border-[color-mix(in_oklab,var(--success)_40%,transparent)]",
      dot: { backgroundColor: "oklch(from var(--success) 0.7 0.15 h)" },
    },
    error: {
      label: "Error",
      className:
        "text-danger border-[color-mix(in_oklab,var(--danger)_40%,transparent)]",
      dot: { backgroundColor: "oklch(from var(--danger) 0.64 0.2 h)" },
    },
    "timed-out": {
      label: "Timed out",
      className:
        "text-warn border-[color-mix(in_oklab,var(--warn)_40%,transparent)]",
      dot: { backgroundColor: "oklch(from var(--warn) 0.8 0.14 h)" },
    },
    stopped: {
      label: "Stopped",
      className: "text-ink-2 border-hairline-strong",
      dot: { backgroundColor: "var(--ink-3)" },
    },
  };
  const chip = STATUS[status];
  const hiddenCount = Math.max(0, total - foldLines);

  const gutterMark = (i: number, blank: boolean) => {
    if (i === failAt) {
      return <X aria-hidden className="size-3 text-danger" strokeWidth={3} />;
    }
    if (i === stopAt) {
      return (
        <Clock aria-hidden className="size-3 text-warn" strokeWidth={2.5} />
      );
    }
    const executed = i < done && !blank;
    if (gutterStyle === "bar") {
      return (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-0.5 origin-top -translate-x-1/2 bg-[var(--rc-ink)]"
          initial={false}
          animate={{ scaleY: i < done ? 1 : 0, opacity: i < done ? 1 : 0 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
      );
    }
    if (gutterStyle === "dots") {
      return blank ? null : (
        <motion.span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full border border-[var(--rc-soft)] transition-colors duration-150",
            executed && "bg-[var(--rc-ink)]",
          )}
          initial={false}
          animate={{ scale: executed ? 1 : 0.8 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      );
    }
    return blank ? null : (
      <svg aria-hidden viewBox="0 0 12 12" className="size-3">
        <motion.path
          d="M 2.5 6.5 L 5 9 L 9.5 3.5"
          fill="none"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-[var(--rc-ink)]"
          initial={false}
          animate={{ pathLength: executed ? 1 : 0, opacity: executed ? 1 : 0 }}
          transition={{
            pathLength: motionSafe ? springs.flick : { duration: 0 },
            opacity: { duration: durations.blink },
          }}
        />
      </svg>
    );
  };

  const codeLines = lines.map((line, i) => {
    const blank = line.trim() === "";
    const folded = i >= foldLines && !expanded;
    const isFail = i === failAt;
    const isStop = i === stopAt;
    return (
      <motion.div
        key={`${gen}-${i}`}
        className={cn(
          folded ? "hidden @min-[30rem]:flex" : "flex",
          "relative items-center pr-3",
          isFail && "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)]",
          isStop && "bg-[color-mix(in_oklab,var(--warn)_14%,transparent)]",
          i === cursorAt && "bg-[var(--rc-wash)]",
        )}
        style={{ height: LINE_H }}
        initial={
          motionSafe ? { opacity: 0, x: -distances.nudge } : { opacity: 0 }
        }
        animate={{ opacity: 1, x: 0 }}
        transition={{
          x: motionSafe ? springs.glide : { duration: 0 },
          opacity: { duration: durations.base, ease: easings.enter },
        }}
      >
        <span className="relative flex h-full w-5 shrink-0 items-center justify-center">
          {gutterMark(i, blank)}
          {i === cursorAt ? (
            <motion.span
              layoutId={`${uid}-cursor`}
              aria-hidden
              className="absolute inset-y-0.5 left-0 w-0.5 rounded-full bg-[var(--rc-ink)]"
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          ) : null}
        </span>
        <span
          aria-hidden
          className="w-6 shrink-0 pr-2 text-right text-[11px] tabular-nums select-none"
          style={{ color: theme.dim }}
        >
          {i + 1}
        </span>
        <span className="min-w-0 flex-1 overflow-hidden whitespace-pre">
          {tokenize(line).map((tok, k) => (
            <span
              key={k}
              className={cn(tok.kind === "comment" && "italic")}
              style={{ color: theme[tok.kind === "text" ? "text" : tok.kind] }}
            >
              {tok.text}
            </span>
          ))}
          {isFail ? <span className="sr-only"> (error here)</span> : null}
          {isStop ? <span className="sr-only"> (timed out here)</span> : null}
        </span>
      </motion.div>
    );
  });

  const tabs: { id: RunCellTab; label: string; count?: number }[] = [
    { id: "output", label: "Output", count: outputs.length },
    { id: "figure", label: "Figure", count: figures.length },
    { id: "data", label: "Data" },
  ];

  const figure = figures[figures.length - 1];
  const tabId = (t: RunCellTab) => `${uid}-tab-${t}`;
  const panelId = (t: RunCellTab) => `${uid}-panel-${t}`;

  const outputPanel = (
    <div
      role="log"
      aria-live="off"
      aria-label="Output"
      className="flex flex-col gap-0.5 font-mono text-[11.5px] leading-[18px]"
    >
      {outputs.length === 0 && status !== "error" ? (
        <p className="text-ink-3">
          {status === "queued"
            ? "Waiting to run."
            : running
              ? "No output yet."
              : "Nothing was printed."}
        </p>
      ) : null}
      <AnimatePresence initial={false}>
        {outputs.map((o) => (
          <motion.p
            key={o.id}
            className={cn(
              "break-words whitespace-pre-wrap",
              o.stream === "stderr" ? "text-danger" : "text-foreground",
              /PAST TOLERANCE/.test(o.text) && "text-warn",
            )}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base },
            }}
          >
            {o.text}
          </motion.p>
        ))}
      </AnimatePresence>
      {status === "error" && error ? (
        <div className="mt-2 flex flex-col gap-1 rounded-2 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] p-2">
          <button
            type="button"
            aria-expanded={traceOpen}
            onClick={() => setTraceOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 rounded-1 text-left text-danger",
              FOCUS,
            )}
          >
            <motion.span
              aria-hidden
              className="inline-flex"
              initial={false}
              animate={{ rotate: traceOpen ? 90 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronRight className="size-3" />
            </motion.span>
            {`${error.name}: ${error.message}`}
          </button>
          {traceOpen ? (
            <pre className="overflow-x-auto pl-4 text-[11px] leading-4 whitespace-pre text-ink-2">
              {error.trace.join("\n")}
            </pre>
          ) : null}
        </div>
      ) : null}
      {status === "timed-out" ? (
        <p className="mt-2 flex items-center gap-1.5 text-warn">
          <Clock aria-hidden className="size-3" />
          {`Timed out after ${seconds(timeout)} on line ${stopAt + 1}.`}
        </p>
      ) : null}
      {status === "stopped" ? (
        <p className="mt-2 text-ink-3">{`Stopped on line ${stopAt + 1}.`}</p>
      ) : null}
    </div>
  );

  const figurePanel = figure ? (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[12px] font-medium text-foreground">
          {figure.title}
        </p>
        <button
          type="button"
          onClick={() => onOpenFigure?.(figure)}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <Maximize2 aria-hidden className="size-3" />
          Open
        </button>
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden pr-1">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={figure.id}
            className="h-full"
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            <FigurePlot
              figure={figure}
              uid={uid}
              develop={developing.includes(figure.id)}
              motionSafe={motionSafe}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  ) : (
    <div className="flex h-full items-center justify-center rounded-2 border border-dashed border-hairline-strong text-[12px] text-ink-3">
      {running
        ? "A figure develops here when the code returns one."
        : "No figure returned."}
    </div>
  );

  const days = figure?.xTicks.length ?? 0;
  const perDay = figure
    ? Math.max(
        1,
        Math.floor((figure.series[0]?.values.length ?? 0) / Math.max(1, days)),
      )
    : 1;
  const dataPanel = figure ? (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
        <caption className="sr-only">{`${figure.title}, daily mean drift in ${figure.yUnit}`}</caption>
        <thead>
          <tr className="border-b border-hairline text-ink-3">
            <th scope="col" className="py-1 pr-3 text-left font-normal">
              Day
            </th>
            {figure.series.map((s) => (
              <th
                key={s.label}
                scope="col"
                className="py-1 pr-3 text-right font-normal"
              >
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {figure.xTicks.map((d, di) => (
            <tr key={d} className="border-b border-hairline/60 last:border-0">
              <th
                scope="row"
                className="py-1 pr-3 text-left font-normal text-ink-2"
              >
                {d}
              </th>
              {figure.series.map((s) => {
                const slice = s.values.slice(di * perDay, di * perDay + perDay);
                const mean = slice.length
                  ? slice.reduce((a, b) => a + b, 0) / slice.length
                  : 0;
                const past =
                  figure.band !== undefined && Math.abs(mean) > figure.band;
                return (
                  <td
                    key={s.label}
                    className={cn(
                      "py-1 pr-3 text-right",
                      past ? "text-danger" : "text-foreground",
                    )}
                  >
                    {/* + 0 turns a rounded −0 into 0, so a still sensor never reads "-0.00". */}
                    {(Math.round(mean * 100) / 100 + 0).toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="text-[12px] text-ink-3">No data yet.</p>
  );

  const executedCount = Math.min(done, total);

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container flex max-h-[36rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          <h2
            id={titleId}
            className="shrink-0 font-mono text-[13px] font-semibold text-[var(--rc-ink)] tabular-nums"
          >
            {`In [${running || status === "queued" ? "*" : count}]`}
          </h2>
          <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-hairline-strong px-1.5 font-mono text-[10px] text-ink-2">
            {language}
          </span>
          <span className="truncate text-[12px] text-ink-3" title={runtime}>
            {runtime}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {seconds(elapsed)}
          </span>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={status}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 font-mono text-[10px] tracking-[0.06em] uppercase",
                chip.className,
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
              transition={{ duration: durations.fast }}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={chip.dot}
              />
              {chip.label}
            </motion.span>
          </AnimatePresence>
          {running ? (
            <button
              type="button"
              onClick={() => {
                if (!disabled) onStop?.();
              }}
              aria-label="Stop"
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <Square aria-hidden className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={rerun}
              aria-label="Re-run"
              aria-disabled={disabled || undefined}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? "Copied" : "Copy code"}
            aria-disabled={disabled || undefined}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <Copy aria-hidden className="size-3.5" />
          </button>
        </div>
      </header>

      <div
        // The code is one stop: Enter re-runs it.
        tabIndex={0}
        role="region"
        aria-label={`Code, ${plural(total, "line")}, ${executedCount} executed${status === "error" && error ? `, error on line ${error.line}` : ""}. Enter re-runs.`}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            rerun();
          }
        }}
        className={cn(
          "relative max-h-[15.5rem] shrink-0 [scrollbar-width:thin] overflow-auto overscroll-contain py-2 font-mono text-[12px]",
          FOCUS_IN,
        )}
        style={theme.surface}
      >
        <AnimatePresence initial={false}>{codeLines}</AnimatePresence>
        {hiddenCount > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((x) => !x)}
            className={cn(
              "mt-1 ml-11 inline-flex h-7 items-center gap-1.5 rounded-2 px-1.5 font-sans text-[12px] text-[var(--rc-ink)] @min-[30rem]:hidden",
              FOCUS,
            )}
          >
            <motion.span
              aria-hidden
              className="inline-flex"
              initial={false}
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronRight className="size-3.5" />
            </motion.span>
            {expanded
              ? "Fold the code"
              : `Show ${plural(hiddenCount, "more line")}`}
          </button>
        ) : null}
        {total === 0 ? (
          <p
            className="px-4 py-2 font-sans text-[12px]"
            style={{ color: theme.dim }}
          >
            Waiting for the code.
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden border-t border-hairline">
        <div
          role="tablist"
          aria-label="Results"
          className="flex shrink-0 items-center gap-1 px-3 pt-2"
          onKeyDown={(e) => {
            const at = tabs.findIndex((t) => t.id === shownTab);
            const next =
              e.key === "ArrowRight"
                ? tabs[(at + 1) % tabs.length]
                : e.key === "ArrowLeft"
                  ? tabs[(at - 1 + tabs.length) % tabs.length]
                  : e.key === "Home"
                    ? tabs[0]
                    : e.key === "End"
                      ? tabs[tabs.length - 1]
                      : undefined;
            if (!next) return;
            e.preventDefault();
            selectTab(next.id);
            document.getElementById(tabId(next.id))?.focus();
          }}
        >
          {tabs.map((t) => {
            const on = shownTab === t.id;
            return (
              <button
                key={t.id}
                id={tabId(t.id)}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={panelId(t.id)}
                tabIndex={on ? 0 : -1}
                onClick={() => selectTab(t.id)}
                className={cn(
                  "relative inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-[12px] transition-colors",
                  on ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                  FOCUS,
                )}
              >
                {on ? (
                  <motion.span
                    aria-hidden
                    layoutId={`${uid}-tab`}
                    className="absolute inset-0 rounded-2 bg-surface-2"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative">{t.label}</span>
                {t.count ? (
                  <span className="relative font-mono text-[10px] text-ink-3 tabular-nums">
                    {t.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {tabs.map((t) => (
          <div
            key={t.id}
            id={panelId(t.id)}
            role="tabpanel"
            aria-labelledby={tabId(t.id)}
            tabIndex={0}
            hidden={shownTab !== t.id}
            className={cn(
              "h-52 shrink-0 [scrollbar-width:thin] overflow-auto overscroll-contain px-4 py-3",
              FOCUS_IN,
            )}
          >
            {t.id === "output"
              ? outputPanel
              : t.id === "figure"
                ? figurePanel
                : dataPanel}
          </div>
        ))}
      </div>

      {status === "error" && error ? (
        <p className="flex shrink-0 items-center gap-1.5 border-t border-hairline px-4 py-2 text-[12px] text-danger">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{`Line ${error.line}: ${error.name}`}</span>
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
