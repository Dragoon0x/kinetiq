"use client";

import * as React from "react";

import { animate, motion } from "motion/react";
import {
  ArrowUpRight,
  Download,
  Lock,
  RotateCcw,
  TriangleAlert,
  Users,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type CrewMetric = "requests" | "spend" | "tokens";
export type CrewSparkStyle = "line" | "area" | "bars";
export type CrewDensity = "compact" | "cozy" | "roomy";
export type CrewUsageAccentName = "cobalt" | "plum" | "mint" | "ink";
export type CrewUsageStatus = "ready" | "loading" | "error";

export type CrewMember = {
  id: string;
  name: string;
  /** A role id from `roles`, or the role's words. */
  role: string;
  /** Up to two letters for the monogram. @default from the name */
  initials?: string;
};

export type CrewRole = { id: string; label: string };

/** What the assistant is used for. */
export type CrewTask = { id: string; label: string };

/** One member's daily usage, oldest day first, one number per day. */
export type CrewSeries = {
  requests: number[];
  /** In the currency `formatMoney` prints. */
  spend: number[];
  tokens: number[];
};

/** A ranked row, as `onExport` receives it. */
export type CrewRow = {
  member: CrewMember;
  /** 1-based rank by the metric, or null for a member with no usage. */
  rank: number | null;
  requests: number;
  spend: number;
  tokens: number;
};

export type CrewUsageProps = {
  /** The team, in any order; rows rank by the metric. @default defaultCrewMembers */
  members?: CrewMember[];
  /** Role names for the ids members carry. @default defaultCrewRoles */
  roles?: CrewRole[];
  /** Daily usage per member id, oldest first; the window is the series' length. @default defaultCrewUsage */
  usage?: Record<string, CrewSeries>;
  /** What the assistant is used for, in strip order. @default defaultCrewTasks */
  tasks?: CrewTask[];
  /** Requests per task, per member id, over the window. @default defaultCrewMix */
  mix?: Record<string, Record<string, number>>;
  /** Controlled metric the table ranks and draws by. */
  metric?: CrewMetric;
  /** Initial metric when uncontrolled. @default "requests" */
  defaultMetric?: CrewMetric;
  /** Fires from the switch or the M key with the new metric. */
  onMetricChange?: (metric: CrewMetric) => void;
  /** Controlled member whose breakdown is open, or null. */
  expanded?: string | null;
  /** Initial open breakdown when uncontrolled. @default null */
  defaultExpanded?: string | null;
  /** Fires when focus or a click opens a member's breakdown, or null when it closes. */
  onExpandedChange?: (id: string | null) => void;
  /** Enter on a row, or Open in a breakdown. */
  onOpenMember?: (id: string, member: CrewMember) => void;
  /** Export was pressed: the metric and the rows in rank order. Omit it and the button is not drawn. */
  onExport?: (metric: CrewMetric, rows: CrewRow[]) => void;
  /** Whether the viewer may see costs. Without it spend reads "Hidden" and cannot rank. @default true */
  canSeeCosts?: boolean;
  /** Usage arrived, is on its way, or failed. @default "ready" */
  status?: CrewUsageStatus;
  /** Try again was pressed after the usage failed to load. */
  onRetry?: () => void;
  /** The last day of the window, ms. Day labels count back from it. @default defaultCrewNow */
  now?: number;
  /** The table's heading. @default "Fernworks · Design" */
  title?: string;
  /** Under the heading. @default "Last 30 days · Sep 18 – Oct 17" (from `now`) */
  subtitle?: string;
  /** How money is printed. @default "$1,284.50" by hand */
  formatMoney?: (amount: number) => string;
  /** How a sparkline is drawn: a line with an end dot, an area, or day bars. @default "line" */
  sparkStyle?: CrewSparkStyle;
  /** Row height, padding and sparkline height. @default "cozy" */
  density?: CrewDensity;
  /** Sparklines, the metric pill and the strip's palette: a named pigment or any CSS colour. @default "cobalt" */
  accent?: CrewUsageAccentName | (string & {});
  /** Read only: the metric cannot change and nothing opens. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Noon UTC on 17 October 2026: the last day of the window. */
export const defaultCrewNow = Date.UTC(2026, 9, 17, 12, 0, 0);
const DAY_MS = 86400000;

export const defaultCrewRoles: CrewRole[] = [
  { id: "lead", label: "Design lead" },
  { id: "product", label: "Product designer" },
  { id: "research", label: "Researcher" },
  { id: "engineer", label: "Design engineer" },
  { id: "content", label: "Content designer" },
];

export const defaultCrewTasks: CrewTask[] = [
  { id: "writing", label: "Writing" },
  { id: "code", label: "Code" },
  { id: "research", label: "Research" },
  { id: "review", label: "Review" },
];

export const defaultCrewMembers: CrewMember[] = [
  { id: "mara", name: "Mara Lindqvist", role: "lead" },
  { id: "tomas", name: "Tomás Reyes", role: "product" },
  { id: "ines", name: "Ines Okafor", role: "research" },
  { id: "wren", name: "Wren Halloway", role: "engineer" },
  { id: "priya", name: "Priya Natarajan", role: "content" },
  { id: "jun", name: "Jun Ito", role: "product" },
  { id: "ada", name: "Ada Brennan", role: "research" },
];

type Profile = {
  perDay: number;
  cost: number;
  tokens: number;
  /** Change across the window: 0.4 ends 40% higher than it started. */
  trend: number;
  mix: [number, number, number, number];
  seed: number;
};

/**
 * Who does what on the Fernworks design team: Priya writes all day in short
 * cheap requests, Wren sends few but long code requests, Ines reads deeply.
 * Ranked by requests the writers lead; ranked by spend the engineer does.
 */
const PROFILES: Record<string, Profile> = {
  mara: {
    perDay: 22,
    cost: 0.13,
    tokens: 4100,
    trend: 0.1,
    mix: [40, 5, 20, 35],
    seed: 11,
  },
  tomas: {
    perDay: 18,
    cost: 0.16,
    tokens: 4800,
    trend: -0.1,
    mix: [30, 20, 25, 25],
    seed: 23,
  },
  ines: {
    perDay: 11,
    cost: 0.34,
    tokens: 11000,
    trend: 0.2,
    mix: [22, 0, 68, 10],
    seed: 37,
  },
  wren: {
    perDay: 14,
    cost: 0.44,
    tokens: 13000,
    trend: 0.3,
    mix: [8, 72, 10, 10],
    seed: 41,
  },
  priya: {
    perDay: 34,
    cost: 0.07,
    tokens: 2200,
    trend: 0,
    mix: [70, 0, 10, 20],
    seed: 53,
  },
  jun: {
    perDay: 6,
    cost: 0.14,
    tokens: 4000,
    trend: 1.4,
    mix: [50, 20, 30, 0],
    seed: 67,
  },
};

/** Deterministic noise: the same table on the server and in the browser. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buildUsage = (): {
  usage: Record<string, CrewSeries>;
  mix: Record<string, Record<string, number>>;
} => {
  const usage: Record<string, CrewSeries> = {};
  const mix: Record<string, Record<string, number>> = {};
  for (const member of defaultCrewMembers) {
    const p = PROFILES[member.id];
    const series: CrewSeries = { requests: [], spend: [], tokens: [] };
    if (p) {
      const rnd = mulberry32(p.seed);
      for (let d = 0; d < 30; d += 1) {
        const day = new Date(defaultCrewNow - (29 - d) * DAY_MS).getUTCDay();
        const weekend = day === 0 || day === 6;
        // Wren's long-context migration on 6 October is a spend day, not a
        // request day: few calls, huge prompts.
        const migration = member.id === "wren" && d === 19;
        const req = Math.round(
          p.perDay *
            (weekend ? 0.12 : 1) *
            (1 + p.trend * (d / 29 - 0.5)) *
            (0.65 + 0.7 * rnd()) *
            (migration ? 1.5 : 1),
        );
        series.requests.push(req);
        series.spend.push(
          Math.round(
            req * p.cost * (0.85 + 0.3 * rnd()) * (migration ? 2.2 : 1) * 100,
          ) / 100,
        );
        series.tokens.push(
          Math.round(
            req * p.tokens * (0.8 + 0.4 * rnd()) * (migration ? 2.4 : 1),
          ),
        );
      }
      const total = series.requests.reduce((a, b) => a + b, 0);
      const shares = p.mix;
      const sum = shares.reduce((a, b) => a + b, 0);
      mix[member.id] = Object.fromEntries(
        defaultCrewTasks.map((t, i) => [
          t.id,
          Math.round((total * (shares[i] ?? 0)) / sum),
        ]),
      );
    } else {
      for (let d = 0; d < 30; d += 1) {
        series.requests.push(0);
        series.spend.push(0);
        series.tokens.push(0);
      }
      mix[member.id] = {};
    }
    usage[member.id] = series;
  }
  return { usage, mix };
};

const BUILT = buildUsage();
export const defaultCrewUsage: Record<string, CrewSeries> = BUILT.usage;
export const defaultCrewMix: Record<string, Record<string, number>> = BUILT.mix;

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const groupDigits = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Money by hand: the same string in Node and every browser. */
const dollars = (amount: number): string => {
  const neg = amount < 0;
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = groupDigits(String(Math.floor(cents / 100)));
  const frac = String(cents % 100).padStart(2, "0");
  return `${neg ? "−" : ""}$${whole}.${frac}`;
};

const integer = (n: number) => groupDigits(String(Math.round(Math.max(0, n))));

/** Compact by hand: Intl's compact notation prints differently in Node. */
const compact = (n: number): string => {
  const v = Math.max(0, n);
  const trim = (s: string) => s.replace(/\.0$/, "");
  if (v >= 1e6) return `${trim((v / 1e6).toFixed(1))}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (v >= 1e3) return `${trim((v / 1e3).toFixed(1))}k`;
  return String(Math.round(v));
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

const initialsOf = (m: CrewMember) =>
  (
    m.initials ??
    m.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
  ).toUpperCase();

const METRICS: { id: CrewMetric; label: string; word: string }[] = [
  { id: "requests", label: "Requests", word: "requests" },
  { id: "spend", label: "Spend", word: "spend" },
  { id: "tokens", label: "Tokens", word: "tokens" },
];

const ACCENTS: Record<CrewUsageAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const HUE_STEPS = [0, 160, 70, 300, 230, 110];
const INK_STEPS = [0.42, 0.56, 0.68, 0.8, 0.5, 0.62];

/**
 * Task colours are pigments turned round the accent's hue at one lightness,
 * so the strip reads the same on the light page and the dark one; the ink
 * accent is a grey ladder instead.
 */
const taskColor = (i: number, accent: string) =>
  accent === "ink"
    ? `oklch(from var(--ink-2) ${INK_STEPS[i % 6] ?? 0.6} 0.012 h)`
    : `oklch(from var(--cu-ink) 0.7 0.11 calc(h + ${HUE_STEPS[i % 6] ?? 0}))`;

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--cu-ink": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as CrewUsageAccentName]
      : accent,
    "--cu-wash": "color-mix(in oklab, var(--cu-ink) 12%, transparent)",
    "--cu-soft": "color-mix(in oklab, var(--cu-ink) 30%, transparent)",
    "--cu-area": "color-mix(in oklab, var(--cu-ink) 16%, transparent)",
  }) as React.CSSProperties;

/** The active metric sits beside the name in a card row and in its own column in the table. */
const NUMBER_AREA: Record<
  "requests" | "tokens" | "spend",
  { active: string; idle: string }
> = {
  requests: {
    active: "[grid-area:value] @[40rem]:[grid-area:requests]",
    idle: "[grid-area:requests]",
  },
  tokens: {
    active: "[grid-area:value] @[40rem]:[grid-area:tokens]",
    idle: "[grid-area:tokens]",
  },
  spend: {
    active: "[grid-area:value] @[40rem]:[grid-area:spend]",
    idle: "[grid-area:spend]",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const DENSITY: Record<
  CrewDensity,
  { row: string; spark: number; detail: string }
> = {
  compact: { row: "py-1.5", spark: 18, detail: "py-2" },
  cozy: { row: "py-2.5", spark: 22, detail: "py-3" },
  roomy: { row: "py-3.5", spark: 28, detail: "py-4" },
};

/* ----------------------------------------------------------------------- */
/*                                Sparklines                                */
/* ----------------------------------------------------------------------- */

const SPARK_W = 100;
const SPARK_H = 24;
const SPARK_PAD = 2;
/**
 * One scale for every row, gently compressed: heights still compare across
 * the team, and a quiet member's week still has a visible shape.
 */
const SPARK_GAMMA = 0.62;

/**
 * Every metric draws the same number of points with the same commands, so a
 * metric change is a pure interpolation of the path's numbers and the morph
 * stays on one spring.
 */
const sparkPaths = (
  values: readonly number[],
  max: number,
  style: CrewSparkStyle,
) => {
  const n = Math.max(2, values.length);
  const y = (v: number) =>
    r2(
      SPARK_H -
        SPARK_PAD -
        (max > 0 ? Math.pow(Math.max(0, v) / max, SPARK_GAMMA) : 0) *
          (SPARK_H - SPARK_PAD * 2),
    );
  if (style === "bars") {
    const slot = SPARK_W / n;
    const w = r2(slot * 0.64);
    let d = "";
    values.forEach((v, i) => {
      const x = r2(i * slot + (slot - w) / 2);
      const top = v > 0 ? Math.min(y(v), SPARK_H - 0.8) : SPARK_H;
      d += `M${x} ${SPARK_H}V${r2(top)}h${w}V${SPARK_H}Z`;
    });
    return { line: d, area: "", dot: "" };
  }
  const pts = values.map((v, i) => `${r2((i * SPARK_W) / (n - 1))} ${y(v)}`);
  const line = `M${pts.join("L")}`;
  const last = pts[pts.length - 1] ?? `${SPARK_W} ${SPARK_H}`;
  return {
    line,
    area: `M0 ${SPARK_H}L${pts.join("L")}L${SPARK_W} ${SPARK_H}Z`,
    dot: `M${last}h0`,
  };
};

function Sparkline({
  values,
  max,
  style,
  height,
  label,
  motionSafe,
}: {
  values: readonly number[];
  max: number;
  style: CrewSparkStyle;
  height: number;
  label: string;
  motionSafe: boolean;
}) {
  const p = sparkPaths(values, max, style);
  const t = motionSafe ? springs.glide : { duration: 0 };
  // A style change is a different shape, not a morph: the key remounts it.
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="block w-full overflow-visible"
      style={{ height }}
    >
      <line
        x1={0}
        x2={SPARK_W}
        y1={SPARK_H - 0.5}
        y2={SPARK_H - 0.5}
        vectorEffect="non-scaling-stroke"
        strokeWidth={1}
        className="stroke-hairline"
      />
      {style === "bars" ? (
        <motion.path
          key="bars"
          initial={false}
          animate={{ d: p.line }}
          transition={t}
          shapeRendering="crispEdges"
          style={{ fill: "var(--cu-ink)" }}
          opacity={0.78}
        />
      ) : (
        <g key={style}>
          {style === "area" ? (
            <motion.path
              initial={false}
              animate={{ d: p.area }}
              transition={t}
              style={{ fill: "var(--cu-area)" }}
            />
          ) : null}
          <motion.path
            initial={false}
            animate={{ d: p.line }}
            transition={t}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={{ stroke: "var(--cu-ink)" }}
          />
          <motion.path
            initial={false}
            animate={{ d: p.dot }}
            transition={t}
            fill="none"
            strokeWidth={4.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={{ stroke: "var(--cu-ink)" }}
          />
        </g>
      )}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Rolling text                               */
/* ----------------------------------------------------------------------- */

/**
 * A number that rolls to its new value on `snap`. React renders the first
 * value only; the effect owns the text after that, so a change never flashes
 * the final digits a frame before the roll starts.
 */
function Roll({
  value,
  format,
  motionSafe,
  className,
}: {
  value: number;
  format: (v: number) => string;
  motionSafe: boolean;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const [first] = React.useState(() => format(value));
  const shown = React.useRef(value);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = shown.current;
    if (!motionSafe || from === value) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }
    const ctrl = animate(from, value, {
      ...springs.snap,
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = format(v);
      },
      onComplete: () => {
        shown.current = value;
        node.textContent = format(value);
      },
    });
    return () => ctrl.stop();
  }, [value, format, motionSafe]);
  return (
    <span ref={ref} className={className}>
      {first}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Collapse                                 */
/* ----------------------------------------------------------------------- */

/** Height measured from its content and animated on `glide`; nothing is reserved while closed. */
function Collapse({
  open,
  motionSafe,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: open ? height : 0, opacity: open ? 1 : 0 }}
      transition={{
        height: motionSafe ? springs.glide : { duration: 0 },
        opacity: {
          duration: open ? durations.base : durations.fast,
          ease: open ? easings.enter : easings.exit,
        },
      }}
      className="overflow-hidden"
      inert={!open}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Col = "member" | "requests" | "tokens" | "spend" | "trend" | "mix";
const COLS: Col[] = ["member", "requests", "tokens", "spend", "trend", "mix"];

/**
 * Who on a team uses the assistant, how much and for what: a row per member
 * with requests, tokens, spend, a thirty-day sparkline on one shared scale
 * and a thin strip of their task mix. Switching the metric is the moment the
 * table is built for — every sparkline morphs to the new series at once on
 * `glide` while the rows re-rank on `glide` and their rank numbers roll on
 * `snap`, so you watch who rises when the question changes from how often to
 * how much. Focusing or clicking a member opens their strip into a full
 * breakdown below the row, its height measured and animated on `glide`, its
 * segments growing in a cascade.
 *
 * It is a real `role="grid"` with one roving cell: Up and Down move rows,
 * Left and Right move cells, Home and End jump to the first and last member,
 * Enter opens the member, Space or focus opens the breakdown, Escape closes
 * it, and M cycles the metric. Without billing access spend reads "Hidden"
 * and cannot rank. Below a 40rem container each row becomes a card with the
 * sparkline full width. Under reduced motion the sparklines switch, the rows
 * reorder in place and numbers update without rolling.
 */
export function CrewUsage({
  members = defaultCrewMembers,
  roles = defaultCrewRoles,
  usage = defaultCrewUsage,
  tasks = defaultCrewTasks,
  mix = defaultCrewMix,
  metric,
  defaultMetric = "requests",
  onMetricChange,
  expanded,
  defaultExpanded = null,
  onExpandedChange,
  onOpenMember,
  onExport,
  canSeeCosts = true,
  status = "ready",
  onRetry,
  now = defaultCrewNow,
  title = "Fernworks · Design",
  subtitle,
  formatMoney = dollars,
  sparkStyle = "line",
  density = "cozy",
  accent = "cobalt",
  disabled = false,
  className,
}: CrewUsageProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const dens = DENSITY[density] ?? DENSITY.cozy;

  const [ownMetric, setOwnMetric] = React.useState<CrewMetric>(defaultMetric);
  const rawMetric = metric ?? ownMetric;
  const active: CrewMetric =
    rawMetric === "spend" && !canSeeCosts ? "requests" : rawMetric;
  const [ownExpanded, setOwnExpanded] = React.useState<string | null>(
    defaultExpanded,
  );
  const open = expanded === undefined ? ownExpanded : expanded;

  const [announcement, setAnnouncement] = React.useState("");
  const [focus, setFocus] = React.useState<{ id: string | null; col: Col }>({
    id: null,
    col: "member",
  });
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  /** Whether the pressed row was open before the press: focus opens it first, so the click must not undo that. */
  const pressedOpen = React.useRef(false);

  const roleOf = React.useMemo(
    () => new Map(roles.map((r) => [r.id, r.label])),
    [roles],
  );
  const days = React.useMemo(() => {
    let n = 0;
    for (const m of members) n = Math.max(n, usage[m.id]?.requests.length ?? 0);
    return n;
  }, [members, usage]);

  const valueFmt = React.useCallback(
    (m: CrewMetric) =>
      m === "spend" ? formatMoney : m === "tokens" ? compact : integer,
    [formatMoney],
  );
  const metricFmt = React.useMemo(() => valueFmt(active), [valueFmt, active]);

  /** Totals and ranks, recomputed per metric; members with no usage go last. */
  const rows = React.useMemo(() => {
    const list = members.map((member, index) => {
      const s = usage[member.id];
      const requests = sum(s?.requests ?? []);
      const spend = r2(sum(s?.spend ?? []));
      const tokens = sum(s?.tokens ?? []);
      return {
        member,
        index,
        requests,
        spend,
        tokens,
        idle: requests === 0 && spend === 0 && tokens === 0,
      };
    });
    const key = (r: (typeof list)[number]) =>
      active === "spend"
        ? r.spend
        : active === "tokens"
          ? r.tokens
          : r.requests;
    list.sort((a, b) =>
      a.idle !== b.idle
        ? a.idle
          ? 1
          : -1
        : key(b) - key(a) || a.index - b.index,
    );
    return list.map((r, i) => ({
      ...r,
      // Idle members sort last, so an active member's rank is its place.
      rank: r.idle ? null : i + 1,
      total: key(r),
    }));
  }, [members, usage, active]);

  /** One y scale for every sparkline, so heights compare across rows. */
  const max = React.useMemo(() => {
    let m = 0;
    for (const r of rows) {
      for (const v of usage[r.member.id]?.[active] ?? []) m = Math.max(m, v);
    }
    return m;
  }, [rows, usage, active]);

  const teamTotal = React.useMemo(() => sum(rows.map((r) => r.total)), [rows]);
  const topTask = React.useMemo(() => {
    let best: CrewTask | null = null;
    let bestN = 0;
    for (const t of tasks) {
      let n = 0;
      for (const r of rows) n += mix[r.member.id]?.[t.id] ?? 0;
      if (n > bestN) {
        bestN = n;
        best = t;
      }
    }
    return best;
  }, [tasks, rows, mix]);

  const allIdle = rows.length === 0 || rows.every((r) => r.idle);
  const ready = status === "ready" && !allIdle;
  const roving =
    focus.id && rows.some((r) => r.member.id === focus.id)
      ? focus.id
      : (rows[0]?.member.id ?? null);

  const firstDay = now - Math.max(0, days - 1) * DAY_MS;
  const sub =
    subtitle ?? `Last ${days} days · ${dayLabel(firstDay)} – ${dayLabel(now)}`;

  /* ---------------------------- interactions ---------------------------- */

  const metricWord = (m: CrewMetric) =>
    METRICS.find((x) => x.id === m)?.word ?? m;

  const setMetric = (next: CrewMetric) => {
    if (disabled || next === active) return;
    if (next === "spend" && !canSeeCosts) return;
    if (metric === undefined) setOwnMetric(next);
    onMetricChange?.(next);
    // Spoken from the new ranking, computed here from the same totals.
    const ranked = members
      .map((m) => {
        const s = usage[m.id];
        return {
          m,
          v: sum(s?.[next] ?? []),
        };
      })
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);
    const lead = ranked[0]?.m.name;
    setAnnouncement(
      `Ranked by ${metricWord(next)}.${lead ? ` ${lead} is first.` : ""}`,
    );
  };

  const cycleMetric = () => {
    const order = METRICS.map((m) => m.id).filter(
      (m) => m !== "spend" || canSeeCosts,
    );
    const i = order.indexOf(active);
    const next = order[(i + 1) % order.length];
    if (next) setMetric(next);
  };

  const setOpen = (id: string | null) => {
    if (disabled || id === open) return;
    if (expanded === undefined) setOwnExpanded(id);
    onExpandedChange?.(id);
    const row = rows.find((r) => r.member.id === id);
    if (row) setAnnouncement(`${row.member.name}'s breakdown open.`);
  };

  const cellOf = (id: string, col: Col) =>
    gridRef.current?.querySelector<HTMLElement>(
      `[data-cu-cell="${CSS.escape(id)}:${col}"]`,
    ) ?? null;

  const visibleCols = (id: string) =>
    COLS.filter((c) => {
      const el = cellOf(id, c);
      return !!el && el.getClientRects().length > 0;
    });

  const moveTo = (id: string | undefined, col: Col) => {
    if (!id) return;
    const cols = visibleCols(id);
    const target = cols.includes(col) ? col : (cols[0] ?? "member");
    cellOf(id, target)?.focus();
  };

  const onGridKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return;
    const index = rows.findIndex((r) => r.member.id === roving);
    const row = rows[index];
    if (!row) return;
    const id = row.member.id;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(
          rows[Math.min(rows.length - 1, index + 1)]?.member.id,
          focus.col,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(rows[Math.max(0, index - 1)]?.member.id, focus.col);
        break;
      case "ArrowRight":
      case "ArrowLeft": {
        event.preventDefault();
        const cols = visibleCols(id);
        const at = Math.max(0, cols.indexOf(focus.col));
        const next =
          cols[
            event.key === "ArrowRight"
              ? Math.min(cols.length - 1, at + 1)
              : Math.max(0, at - 1)
          ];
        if (next) cellOf(id, next)?.focus();
        break;
      }
      case "Home":
        event.preventDefault();
        moveTo(rows[0]?.member.id, focus.col);
        break;
      case "End":
        event.preventDefault();
        moveTo(rows[rows.length - 1]?.member.id, focus.col);
        break;
      case "Enter":
        event.preventDefault();
        if (!disabled) onOpenMember?.(id, row.member);
        break;
      case " ":
        event.preventDefault();
        setOpen(open === id ? null : id);
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(null);
        }
        break;
      default:
        break;
    }
  };

  /* ------------------------------- header ------------------------------- */

  const metricSwitch = (
    <div
      role="radiogroup"
      aria-label="Rank by"
      className="relative inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full border border-hairline bg-surface-1 p-0.5"
      onKeyDown={(event) => {
        const order = METRICS.map((m) => m.id);
        const i = order.indexOf(active);
        let next: CrewMetric | undefined;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          next = order[(i + 1) % order.length];
          if (next === "spend" && !canSeeCosts)
            next = order[(i + 2) % order.length];
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          next = order[(i + order.length - 1) % order.length];
          if (next === "spend" && !canSeeCosts)
            next = order[(i + order.length - 2) % order.length];
        } else return;
        event.preventDefault();
        if (next) {
          setMetric(next);
          (
            event.currentTarget.querySelector(
              `[data-cu-metric="${next}"]`,
            ) as HTMLElement | null
          )?.focus();
        }
      }}
    >
      {METRICS.map((m) => {
        const on = m.id === active;
        const locked = m.id === "spend" && !canSeeCosts;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            data-cu-metric={m.id}
            aria-checked={on}
            aria-disabled={locked || disabled || undefined}
            title={locked ? "Needs billing access" : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => setMetric(m.id)}
            className={cn(
              "relative inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors @[30rem]:px-3",
              on ? "text-[var(--cu-ink)]" : "text-ink-3 hover:text-foreground",
              locked && "cursor-not-allowed opacity-50 hover:text-ink-3",
              FOCUS,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-pill`}
                aria-hidden
                className="absolute inset-0 rounded-full border border-[var(--cu-soft)] bg-[var(--cu-wash)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            {locked ? <Lock aria-hidden className="relative size-3" /> : null}
            <span className="relative">{m.label}</span>
          </button>
        );
      })}
    </div>
  );

  const header = (
    <div className="flex flex-col gap-2 border-b border-hairline px-3 pt-3 pb-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden
          className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--cu-wash)] text-[var(--cu-ink)] @[30rem]:inline-flex"
        >
          <Users className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            id={titleId}
            title={title}
            className="truncate text-[14px] leading-5 font-semibold"
          >
            {title}
          </p>
          <p className="truncate text-[11.5px] leading-4 text-ink-3">{sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {metricSwitch}
          {onExport ? (
            <motion.button
              type="button"
              aria-label="Export"
              disabled={disabled || !ready}
              whileTap={motionSafe ? { scale: 0.96 } : undefined}
              transition={springs.flick}
              onClick={() =>
                onExport(
                  active,
                  rows.map((r) => ({
                    member: r.member,
                    rank: r.rank,
                    requests: r.requests,
                    spend: canSeeCosts ? r.spend : 0,
                    tokens: r.tokens,
                  })),
                )
              }
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                FOCUS,
              )}
            >
              <Download aria-hidden className="size-3.5" />
              <span className="hidden @[30rem]:inline">Export</span>
            </motion.button>
          ) : null}
        </div>
      </div>
      {ready ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-ink-2">
          <span>{`${rows.filter((r) => !r.idle).length} of ${members.length} members active ·`}</span>
          <Roll
            value={teamTotal}
            format={metricFmt}
            motionSafe={motionSafe}
            className="font-mono font-medium text-foreground tabular-nums"
          />
          <span>{`${active === "spend" ? "spent" : metricWord(active)}${topTask ? ` · mostly ${topTask.label.toLowerCase()}` : ""}`}</span>
          {!canSeeCosts ? (
            <span className="inline-flex items-center gap-1 text-ink-3">
              <Lock aria-hidden className="size-3" />
              costs hidden
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );

  /* -------------------------------- body -------------------------------- */

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-hidden className="flex flex-col gap-3 p-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="size-7 shrink-0 rounded-full bg-surface-2" />
            <span className="h-3 w-28 rounded-1 bg-surface-2" />
            <span className="h-3 flex-1 rounded-1 bg-surface-2" />
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2 p-4">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-danger">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          Usage couldn’t load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (allIdle) {
    body = (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          <Users aria-hidden className="size-4" />
        </span>
        <p className="text-[13px] font-medium">No usage yet</p>
        <p className="max-w-xs text-[12px] text-ink-3">
          {`No one on ${title.split("·").pop()?.trim() || "the team"} has used the assistant in the last ${days} days.`}
        </p>
      </div>
    );
  } else {
    const head = "font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase";
    const areas =
      "[grid-template-areas:'member_value'_'trend_trend'_'mix_mix'] grid-cols-[minmax(0,1fr)_auto] @[40rem]:[grid-template-areas:'member_requests_tokens_spend_trend_mix'] @[40rem]:grid-cols-[minmax(8.5rem,1.5fr)_3.75rem_3.5rem_4.5rem_minmax(5rem,1.4fr)_minmax(4.5rem,1fr)]";
    body = (
      <motion.div
        ref={gridRef}
        role="grid"
        layoutScroll
        aria-labelledby={titleId}
        aria-describedby={hintId}
        aria-colcount={6}
        aria-disabled={disabled || undefined}
        onKeyDown={onGridKey}
        className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        <div
          role="row"
          className={cn(
            "sticky top-0 z-10 grid items-center gap-x-3 border-b border-hairline bg-card px-3 py-1.5",
            "@max-[40rem]:sr-only",
            areas,
          )}
        >
          <span role="columnheader" className={cn(head, "[grid-area:member]")}>
            Member
          </span>
          {(["requests", "tokens", "spend"] as const).map((c) => (
            <span
              key={c}
              role="columnheader"
              aria-sort={c === active ? "descending" : undefined}
              className={cn(
                head,
                "text-right",
                c === active && "text-[var(--cu-ink)]",
              )}
              style={{ gridArea: c }}
            >
              {METRICS.find((m) => m.id === c)?.label}
            </span>
          ))}
          <span role="columnheader" className={cn(head, "[grid-area:trend]")}>
            {`Last ${days} days`}
          </span>
          <span role="columnheader" className={cn(head, "[grid-area:mix]")}>
            Used for
          </span>
        </div>
        {rows.map((r) => {
          const id = r.member.id;
          const s = usage[id];
          const series = s?.[active] ?? [];
          const isOpen = open === id;
          const roleWord = roleOf.get(r.member.role) ?? r.member.role;
          const memberMix = mix[id] ?? {};
          const mixTotal = sum(tasks.map((t) => memberMix[t.id] ?? 0));
          const shares = tasks.map((t, i) => ({
            task: t,
            i,
            n: memberMix[t.id] ?? 0,
            share: mixTotal > 0 ? (memberMix[t.id] ?? 0) / mixTotal : 0,
          }));
          const lead = [...shares].sort((a, b) => b.n - a.n)[0];
          let peak = 0;
          let peakAt = 0;
          series.forEach((v, i) => {
            if (v > peak) {
              peak = v;
              peakAt = i;
            }
          });
          const half = Math.floor(series.length / 2);
          const before = sum(series.slice(0, half));
          const after = sum(series.slice(half));
          const trend =
            before > 0 ? Math.round(((after - before) / before) * 100) : null;
          const peakDay = dayLabel(firstDay + peakAt * DAY_MS);
          const fmt = valueFmt(active);
          const sparkLabel = r.idle
            ? `No usage in ${days} days`
            : `${METRICS.find((m) => m.id === active)?.label} over ${days} days, peak ${fmt(peak)} on ${peakDay}${trend === null ? "" : trend === 0 ? ", flat against the first half" : `, ${trend > 0 ? "up" : "down"} ${Math.abs(trend)}% against the first half`}`;
          const mixLabel =
            mixTotal > 0
              ? shares
                  .filter((x) => x.n > 0)
                  .map((x) => `${x.task.label} ${Math.round(x.share * 100)}%`)
                  .join(", ")
              : "No usage";
          const cell = (col: Col) => ({
            role: "gridcell" as const,
            "data-cu-cell": `${id}:${col}`,
            tabIndex: roving === id && focus.col === col ? 0 : -1,
            onFocus: () => {
              setFocus({ id, col });
              setOpen(id);
            },
          });
          const numberCell = (c: "requests" | "tokens" | "spend") => {
            const isActive = c === active;
            const hidden = c === "spend" && !canSeeCosts;
            const v =
              c === "spend" ? r.spend : c === "tokens" ? r.tokens : r.requests;
            return (
              <span
                key={c}
                {...cell(c)}
                aria-label={
                  hidden
                    ? "Spend hidden"
                    : `${METRICS.find((m) => m.id === c)?.label} ${valueFmt(c)(v)}`
                }
                className={cn(
                  "items-center justify-end rounded-1 text-right font-mono text-[12px] tabular-nums",
                  isActive
                    ? "flex font-medium text-foreground"
                    : "hidden text-ink-2 @[40rem]:flex",
                  isActive ? NUMBER_AREA[c].active : NUMBER_AREA[c].idle,
                  FOCUS_IN,
                )}
              >
                {hidden ? (
                  <Lock aria-hidden className="size-3 text-ink-3" />
                ) : (
                  valueFmt(c)(v)
                )}
              </span>
            );
          };
          return (
            <motion.div
              key={id}
              role="rowgroup"
              layout={motionSafe ? "position" : false}
              transition={{ layout: springs.glide }}
              className={cn(
                "relative border-b border-hairline",
                isOpen ? "z-[1] bg-surface-1" : "bg-card",
              )}
            >
              <div
                role="row"
                aria-expanded={isOpen}
                onPointerDown={() => {
                  pressedOpen.current = isOpen;
                }}
                onClick={(event) => {
                  if (disabled) return;
                  const target = event.target as HTMLElement;
                  const cellEl = target.closest<HTMLElement>("[data-cu-cell]");
                  if (!cellEl) cellOf(id, "member")?.focus();
                  if (pressedOpen.current) setOpen(null);
                  else if (!cellEl) setOpen(id);
                  pressedOpen.current = false;
                }}
                className={cn(
                  "grid cursor-pointer items-center gap-x-3 gap-y-1.5 px-3 transition-colors hover:bg-surface-1",
                  dens.row,
                  areas,
                )}
              >
                <span
                  {...cell("member")}
                  aria-label={`${r.rank ? `${r.rank}. ` : ""}${r.member.name}, ${roleWord}`}
                  className={cn(
                    "flex min-w-0 items-center gap-2.5 rounded-2",
                    FOCUS_IN,
                  )}
                  style={{ gridArea: "member" }}
                >
                  <span className="w-4 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums">
                    {r.rank === null ? (
                      "–"
                    ) : (
                      <Roll
                        value={r.rank}
                        format={integer}
                        motionSafe={motionSafe}
                      />
                    )}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-semibold",
                      isOpen
                        ? "border-[var(--cu-soft)] bg-[var(--cu-wash)] text-[var(--cu-ink)]"
                        : "border-hairline bg-surface-2 text-ink-2",
                    )}
                  >
                    {initialsOf(r.member)}
                  </span>
                  <span className="min-w-0">
                    <span
                      title={r.member.name}
                      className="block truncate text-[13px] leading-5 font-medium"
                    >
                      {r.member.name}
                    </span>
                    <span className="block truncate text-[11px] leading-4 text-ink-3">
                      {roleWord}
                    </span>
                  </span>
                </span>
                {numberCell("requests")}
                {numberCell("tokens")}
                {numberCell("spend")}
                <span
                  {...cell("trend")}
                  className={cn("block min-w-0 rounded-1", FOCUS_IN)}
                  style={{ gridArea: "trend" }}
                >
                  {r.idle ? (
                    <span
                      className="flex items-center gap-2"
                      style={{ height: dens.spark }}
                    >
                      <span className="h-px flex-1 border-t border-dashed border-hairline-strong" />
                      <span className="text-[11px] text-ink-3">No usage</span>
                    </span>
                  ) : (
                    <Sparkline
                      key={sparkStyle}
                      values={series}
                      max={max}
                      style={sparkStyle}
                      height={dens.spark}
                      label={sparkLabel}
                      motionSafe={motionSafe}
                    />
                  )}
                </span>
                <span
                  {...cell("mix")}
                  aria-label={mixLabel}
                  className={cn(
                    "flex min-w-0 flex-col gap-1 rounded-1",
                    FOCUS_IN,
                  )}
                  style={{ gridArea: "mix" }}
                >
                  <span
                    aria-hidden
                    className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-surface-2"
                  >
                    {shares.map((x) =>
                      x.share > 0 ? (
                        <span
                          key={x.task.id}
                          className="h-full"
                          style={{
                            width: `${r2(x.share * 100)}%`,
                            backgroundColor: taskColor(x.i, accent),
                          }}
                        />
                      ) : null,
                    )}
                  </span>
                  <span
                    aria-hidden
                    className="flex min-w-0 items-baseline justify-between gap-2 text-[10.5px] leading-4 text-ink-3"
                  >
                    <span className="truncate">
                      {lead && lead.n > 0
                        ? `${lead.task.label} ${Math.round(lead.share * 100)}%`
                        : "—"}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums @[40rem]:hidden">
                      {(["requests", "tokens", "spend"] as const)
                        .filter((c) => c !== active)
                        .map((c) =>
                          c === "spend"
                            ? canSeeCosts
                              ? valueFmt(c)(r.spend)
                              : "spend hidden"
                            : `${valueFmt(c)(c === "tokens" ? r.tokens : r.requests)} ${c === "tokens" ? "tok" : "req"}`,
                        )
                        .join(" · ")}
                    </span>
                  </span>
                </span>
              </div>
              <div
                role="row"
                aria-hidden={!isOpen || undefined}
                className="block"
              >
                <div role="gridcell" aria-colspan={6} className="block">
                  <Collapse open={isOpen} motionSafe={motionSafe}>
                    <div
                      className={cn(
                        "flex flex-col gap-3 px-3 @[40rem]:pl-[3.75rem]",
                        dens.detail,
                      )}
                    >
                      {mixTotal > 0 ? (
                        <>
                          <div
                            aria-hidden
                            className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
                          >
                            {shares.map((x, k) =>
                              x.share > 0 ? (
                                <motion.span
                                  key={x.task.id}
                                  className="h-full first:rounded-l-full last:rounded-r-full"
                                  initial={false}
                                  animate={{ scaleX: isOpen ? 1 : 0.001 }}
                                  transition={
                                    motionSafe
                                      ? {
                                          ...springs.glide,
                                          delay: isOpen
                                            ? k * cascade(shares.length)
                                            : 0,
                                        }
                                      : { duration: 0 }
                                  }
                                  style={{
                                    width: `${r2(x.share * 100)}%`,
                                    originX: 0,
                                    backgroundColor: taskColor(x.i, accent),
                                  }}
                                />
                              ) : null,
                            )}
                          </div>
                          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 @[40rem]:grid-cols-4">
                            {shares.map((x) => (
                              <li
                                key={x.task.id}
                                className="flex min-w-0 items-center gap-1.5 text-[12px]"
                              >
                                <span
                                  aria-hidden
                                  className="size-2 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor: taskColor(x.i, accent),
                                  }}
                                />
                                <span className="truncate text-ink-2">
                                  {x.task.label}
                                </span>
                                <span className="font-mono text-[11px] text-foreground tabular-nums">
                                  {`${Math.round(x.share * 100)}%`}
                                </span>
                                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                                  {integer(x.n)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="text-[12px] text-ink-3">{`No usage in the last ${days} days.`}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        {!r.idle ? (
                          <p className="min-w-0 flex-1 text-[11.5px] text-ink-3">
                            {`Peak ${peakDay} · ${fmt(peak)}${trend === null ? "" : trend === 0 ? " · flat vs first half" : ` · ${trend > 0 ? "+" : "−"}${Math.abs(trend)}% vs first half`}`}
                          </p>
                        ) : (
                          <span className="flex-1" />
                        )}
                        {onOpenMember ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            disabled={disabled}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenMember(id, r.member);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground"
                          >
                            {`Open ${r.member.name.split(" ")[0] ?? ""}`}
                            <ArrowUpRight aria-hidden className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </Collapse>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container flex max-h-[36rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={accentVars(accent)}
      onKeyDown={(event) => {
        if (
          (event.key === "m" || event.key === "M") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          ready
        ) {
          event.preventDefault();
          cycleMetric();
        }
      }}
    >
      {header}
      {body}
      <p id={hintId} className="sr-only">
        Up and Down move between members, Left and Right between cells. Enter
        opens a member, Space opens the breakdown, M changes the metric.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
