"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  CheckCheck,
  Flag,
  RotateCcw,
  ScanSearch,
  TriangleAlert,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type SpikeDimension = "keys" | "members" | "prompts";
export type SpikeStrandStyle = "ribbon" | "thread" | "step";
export type SpikeFlagStyle = "pin" | "ring" | "band";
export type SpikeTraceAccentName = "cobalt" | "plum" | "mint" | "ink";
export type SpikeTraceStatus = "ready" | "loading" | "error";

export type SpikeDay = {
  /** "2026-10-15". */
  date: string;
  total: number;
};

/** Something that made part of a day's usage. */
export type SpikeCause = {
  id: string;
  label: string;
  amount: number;
  /** A short line under the label: who owns the key, what the prompt does. */
  detail?: string;
};

export type SpikeAttribution = Record<SpikeDimension, SpikeCause[]>;

/** A day the detector flagged as unusual. */
export type SpikeFlag = {
  date: string;
  /** Someone has marked this spike as expected. */
  expected?: boolean;
  /** Why it was expected, or what the detector saw. */
  note?: string;
};

export type SpikeTraceProps = {
  /** Daily usage, oldest first. @default defaultSpikeDays */
  days?: SpikeDay[];
  /** What made each flagged day, by date. @default defaultSpikeAttributions */
  attributions?: Record<string, SpikeAttribution>;
  /** The days the detector flagged. Empty shows the no-spikes state. @default defaultSpikeFlags */
  flags?: SpikeFlag[];
  /** Flagged dates whose causes are still being worked out. @default ["2026-10-17"] */
  pending?: string[];
  /** Controlled unpacked date, or null when every spike is folded. */
  value?: string | null;
  /** Initial unpacked date when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the press or key that unpacked a spike, or with null when it folds. */
  onSelectSpike?: (date: string | null, day: SpikeDay | null) => void;
  /** Controlled dimension the spike is unpacked by. */
  dimension?: SpikeDimension;
  /** Initial dimension when uncontrolled. @default "keys" */
  defaultDimension?: SpikeDimension;
  /** Fires from the switch with the new dimension. */
  onDimensionChange?: (dimension: SpikeDimension) => void;
  /** A cause's Open button was pressed. */
  onOpenCause?: (
    cause: SpikeCause,
    dimension: SpikeDimension,
    date: string,
  ) => void;
  /** Mark expected was pressed, with the state it asks for. Omit it and the button is not drawn. */
  onFlagExpected?: (date: string, expected: boolean) => void;
  /** Usage arrived, is on its way, or failed. @default "ready" */
  status?: SpikeTraceStatus;
  /** Try again was pressed after usage failed to load. */
  onRetry?: () => void;
  /** Causes listed before the rest are folded into "Other". @default 5 */
  maxCauses?: number;
  /** The panel's heading. @default "Basinworks · usage" */
  title?: string;
  /** Under the heading. @default "Sep 18 – Oct 17 · tokens a day" (from `days` and `unit`) */
  subtitle?: string;
  /** What is counted, in words. @default "tokens" */
  unit?: string;
  /** How an amount is printed. @default "6.4M" by hand */
  formatValue?: (amount: number) => string;
  /** How the strands are drawn: filled ribbons, fine threads or orthogonal steps. @default "ribbon" */
  strandStyle?: SpikeStrandStyle;
  /** How a flagged day is marked: a pin above the bar, a ring, or a tinted band behind it. @default "pin" */
  flagStyle?: SpikeFlagStyle;
  /** The spike, the switch and the hue the cause colours turn from. @default "cobalt" */
  accent?: SpikeTraceAccentName | (string & {});
  /** Read only: spikes cannot be unpacked or marked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY_MS = 86400000;
const END = Date.UTC(2026, 9, 17);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Deterministic noise: the same chart on the server and in the browser. */
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

const SPIKES: Record<string, number> = {
  "2026-09-24": 2_900_000,
  "2026-10-01": 4_100_000,
  "2026-10-15": 6_400_000,
  "2026-10-17": 3_200_000,
};

/**
 * Thirty days of a Basinworks workspace: about 1.9M tokens a weekday and a
 * third of that at weekends, with four days the detector flagged.
 */
export const defaultSpikeDays: SpikeDay[] = (() => {
  const rnd = mulberry32(2094);
  const out: SpikeDay[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const ms = END - i * DAY_MS;
    const date = iso(ms);
    const dow = new Date(ms).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const base = weekend ? 640_000 : 1_900_000;
    const total =
      SPIKES[date] ?? Math.round((base * (0.86 + 0.28 * rnd())) / 1000) * 1000;
    out.push({ date, total });
  }
  return out;
})();

export const defaultSpikeFlags: SpikeFlag[] = [
  { date: "2026-09-24", note: "1.5× the median" },
  { date: "2026-10-01", expected: true, note: "Quarterly eval run" },
  { date: "2026-10-15", note: "3.4× the median" },
  { date: "2026-10-17", note: "Weekend usage at weekday levels" },
];

const c = (
  id: string,
  label: string,
  amount: number,
  detail?: string,
): SpikeCause => ({
  id,
  label,
  amount,
  detail,
});

export const defaultSpikeAttributions: Record<string, SpikeAttribution> = {
  "2026-10-15": {
    keys: [
      c(
        "nightly-evals",
        "nightly-evals",
        3_900_000,
        "Eval runner · Rowan Achebe",
      ),
      c("support-bot", "support-bot-prod", 1_150_000, "Support desk"),
      c("web-app", "web-app", 800_000, "Customer app"),
      c("staging", "staging", 350_000, "Shared staging"),
      c("ci", "ci-checks", 120_000, "Build pipeline"),
      c("misc", "notebooks", 80_000, "Three personal keys"),
    ],
    members: [
      c("rowan", "Rowan Achebe", 3_400_000, "Ran an archive backfill"),
      c("sol", "Sol Varga", 1_100_000, "Support tooling"),
      c("maren", "Maren Kwok", 900_000, "Customer app"),
      c("theo", "Theo Lindgren", 600_000, "Evals"),
      c("ivo", "Ivo Brandt", 250_000, "Staging tests"),
      c("other", "Four others", 150_000),
    ],
    prompts: [
      c(
        "classify",
        "Classify archived tickets",
        3_100_000,
        "Backfill · 41k calls",
      ),
      c("summarise", "Summarise support thread", 1_400_000, "support-bot-prod"),
      c("draft", "Draft a reply", 900_000, "web-app"),
      c("invoice", "Explain an invoice line", 500_000, "web-app"),
      c("evals", "Eval suite: answers v7", 350_000, "nightly-evals"),
      c("other", "Twelve other prompts", 150_000),
    ],
  },
  "2026-10-01": {
    keys: [
      c("nightly-evals", "nightly-evals", 2_600_000, "Quarterly eval run"),
      c("support-bot", "support-bot-prod", 700_000, "Support desk"),
      c("web-app", "web-app", 620_000, "Customer app"),
      c("staging", "staging", 180_000, "Shared staging"),
    ],
    members: [
      c("theo", "Theo Lindgren", 2_400_000, "Quarterly evals"),
      c("sol", "Sol Varga", 700_000, "Support tooling"),
      c("maren", "Maren Kwok", 600_000, "Customer app"),
      c("other", "Five others", 400_000),
    ],
    prompts: [
      c("evals", "Eval suite: answers v7", 2_500_000, "nightly-evals"),
      c("summarise", "Summarise support thread", 700_000, "support-bot-prod"),
      c("draft", "Draft a reply", 560_000, "web-app"),
      c("other", "Nine other prompts", 340_000),
    ],
  },
  "2026-09-24": {
    keys: [
      c("web-app", "web-app", 1_500_000, "Customer app launch"),
      c("support-bot", "support-bot-prod", 900_000, "Support desk"),
      c("nightly-evals", "nightly-evals", 300_000, "Eval runner"),
      c("staging", "staging", 200_000, "Shared staging"),
    ],
    members: [
      c("maren", "Maren Kwok", 1_300_000, "Shipped the new search"),
      c("sol", "Sol Varga", 900_000, "Support tooling"),
      c("other", "Six others", 700_000),
    ],
    prompts: [
      c("search", "Answer a search query", 1_200_000, "web-app"),
      c("summarise", "Summarise support thread", 900_000, "support-bot-prod"),
      c("draft", "Draft a reply", 500_000, "web-app"),
      c("other", "Eight other prompts", 300_000),
    ],
  },
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Compact by hand: Intl's compact output differs between Node and browsers. */
const compact = (n: number): string => {
  const v = Math.max(0, n);
  const trim = (s: string) => s.replace(/\.0$/, "");
  if (v >= 1e6) return `${trim((v / 1e6).toFixed(1))}M`;
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
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const parse = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
const shortDate = (date: string) => {
  const d = new Date(parse(date));
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const weekday = (date: string) =>
  WEEKDAYS[new Date(parse(date)).getUTCDay()] ?? "";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

const DIMENSIONS: { id: SpikeDimension; label: string; noun: string }[] = [
  { id: "keys", label: "Keys", noun: "key" },
  { id: "members", label: "People", noun: "person" },
  { id: "prompts", label: "Prompts", noun: "prompt" },
];

const ACCENTS: Record<SpikeTraceAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const HUES = [0, 150, 60, 290, 210, 110];
const GREYS = [0.44, 0.58, 0.7, 0.52, 0.64, 0.76];

/** Cause colours are pigments turned round the accent's hue; "Other" is grey. */
const causeColor = (i: number, other: boolean, accent: string) =>
  other
    ? "oklch(from var(--ink-3) 0.66 0.01 h)"
    : accent === "ink"
      ? `oklch(from var(--ink-2) ${GREYS[i % 6] ?? 0.6} 0.012 h)`
      : `oklch(from var(--st-ink) 0.68 0.12 calc(h + ${HUES[i % 6] ?? 0}))`;

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--st-ink": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as SpikeTraceAccentName]
      : accent,
    "--st-wash": "color-mix(in oklab, var(--st-ink) 12%, transparent)",
    "--st-soft": "color-mix(in oklab, var(--st-ink) 30%, transparent)",
    "--st-flag": "oklch(from var(--warn) 0.78 0.14 h)",
    "--st-flag-wash":
      "color-mix(in oklab, oklch(from var(--warn) 0.78 0.14 h) 16%, transparent)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/* ----------------------------------------------------------------------- */
/*                                 Geometry                                 */
/* ----------------------------------------------------------------------- */

/** Room above the tallest bar for its flag, and below the bars for dates. */
const PLOT_TOP = 30;
const AXIS_H = 20;
/** The ranked list: a heading, then fixed rows the strands land on. */
const LIST_HEAD = 34;
const ROW_H = 44;
const COL_GAP = 20;

type Band = {
  id: string;
  top: number;
  height: number;
  share: number;
  color: string;
  cause: SpikeCause;
};

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A workspace's daily usage as bars, with anomalous days flagged. Pressing a
 * flagged spike unpacks it — the moment the piece is built for: the bar
 * splits into a coloured band per cause (keys, people or prompts), and from
 * each band a strand fans out across the rest of the chart to its row in a
 * ranked list beside it, drawn by a clip that sweeps from the bar to the
 * list on `glide`, while the rows arrive in a `cascade()` and one line names
 * the biggest cause. Escape folds it back on the exit ease. Switching the
 * dimension re-splits the bar and re-sweeps the strands.
 *
 * The flagged days are a roving set of buttons over the chart: Left and
 * Right move between them, Home and End jump, Enter or Space unpacks and
 * Escape folds. Below a 40rem container the strands become a stacked bar
 * above the list. Days still being attributed show a hatched bar and say
 * so; a window with no flags says that instead. Under reduced motion the
 * bands, strands and rows appear with a short fade and nothing sweeps.
 */
export function SpikeTrace({
  days = defaultSpikeDays,
  attributions = defaultSpikeAttributions,
  flags = defaultSpikeFlags,
  pending = ["2026-10-17"],
  value,
  defaultValue = null,
  onSelectSpike,
  dimension,
  defaultDimension = "keys",
  onDimensionChange,
  onOpenCause,
  onFlagExpected,
  status = "ready",
  onRetry,
  maxCauses = 5,
  title = "Basinworks · usage",
  subtitle,
  unit = "tokens",
  formatValue = compact,
  strandStyle = "ribbon",
  flagStyle = "pin",
  accent = "cobalt",
  disabled = false,
  className,
}: SpikeTraceProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const clipId = `${uid}-sweep`;
  const hatchId = `${uid}-hatch`;

  const [ownValue, setOwnValue] = React.useState<string | null>(defaultValue);
  const rawSelected = value === undefined ? ownValue : value;
  const [ownDim, setOwnDim] = React.useState<SpikeDimension>(defaultDimension);
  const dim = dimension ?? ownDim;
  const [expectedMap, setExpectedMap] = React.useState<Record<string, boolean>>(
    {},
  );
  const [activeFlag, setActiveFlag] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const [size, setSize] = React.useState({ w: 388, h: 220 });
  const [chartNode, setChartNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!chartNode) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(chartNode.clientWidth);
      const h = Math.round(chartNode.clientHeight);
      if (w > 0 && h > 0)
        setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(chartNode);
    return () => ro.disconnect();
  }, [chartNode]);

  const flagByDate = React.useMemo(
    () => new Map(flags.map((f) => [f.date, f])),
    [flags],
  );
  const flagged = React.useMemo(
    () => days.filter((d) => flagByDate.has(d.date)),
    [days, flagByDate],
  );
  const selected =
    rawSelected && flagByDate.has(rawSelected) ? rawSelected : null;
  const selectedDay = selected
    ? (days.find((d) => d.date === selected) ?? null)
    : null;
  const roving =
    activeFlag && flagByDate.has(activeFlag)
      ? activeFlag
      : (selected ?? flagged[flagged.length - 1]?.date ?? null);
  const isExpected = (date: string) =>
    expectedMap[date] ?? flagByDate.get(date)?.expected ?? false;

  const med = React.useMemo(() => median(days.map((d) => d.total)), [days]);
  const maxV = React.useMemo(
    () => Math.max(1, ...days.map((d) => d.total)) * 1.06,
    [days],
  );

  /* ------------------------------- geometry ------------------------------ */

  const { w: cw, h: ch } = size;
  const plotH = Math.max(40, ch - PLOT_TOP - AXIS_H);
  const n = Math.max(1, days.length);
  const slot = cw / n;
  const barW = Math.max(2, slot * (slot < 8 ? 0.8 : 0.64));
  const barX = (i: number) => r2(i * slot + (slot - barW) / 2);
  const barTop = (v: number) => r2(PLOT_TOP + plotH - (v / maxV) * plotH);
  const medY = barTop(med);

  const selIndex = selected ? days.findIndex((d) => d.date === selected) : -1;
  const isPending = !!selected && pending.includes(selected);
  const attribution =
    selected && !isPending ? attributions[selected] : undefined;

  /** The ranked causes of the unpacked spike, the tail folded into "Other". */
  const causes = React.useMemo(() => {
    const list = [...(attribution?.[dim] ?? [])].sort(
      (a, b) => b.amount - a.amount,
    );
    const keep = Math.max(1, maxCauses);
    if (list.length <= keep + 1)
      return list.map((cause) => ({ cause, other: false }));
    const head = list.slice(0, keep);
    const rest = list.slice(keep);
    const restSum = rest.reduce((s, x) => s + x.amount, 0);
    return [
      ...head.map((cause) => ({ cause, other: false })),
      {
        cause: { id: "__other", label: `${rest.length} more`, amount: restSum },
        other: true,
      },
    ];
  }, [attribution, dim, maxCauses]);

  const causeTotal = causes.reduce((s, x) => s + x.cause.amount, 0);
  const bands: Band[] = React.useMemo(() => {
    if (selIndex < 0 || !selectedDay) return [];
    const top = barTop(selectedDay.total);
    const height = PLOT_TOP + plotH - top;
    let y = top;
    return causes.map((x, i) => {
      const share = causeTotal > 0 ? x.cause.amount / causeTotal : 0;
      const h = share * height;
      const band: Band = {
        id: x.cause.id,
        top: r2(y),
        height: r2(h),
        share,
        color: causeColor(i, x.other, accent),
        cause: x.cause,
      };
      y += h;
      return band;
    });
    // barTop is derived from size, maxV and plotH, all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selIndex, selectedDay, causes, causeTotal, accent, plotH, maxV, cw]);

  const sx = selIndex >= 0 ? r2(barX(selIndex) + barW) : 0;
  const tx = cw + COL_GAP - 2;
  const strandPath = (b: Band, i: number): string => {
    const ty = LIST_HEAD + i * ROW_H + ROW_H / 2;
    const mid = b.top + b.height / 2;
    const mx = sx + (tx - sx) * 0.5;
    if (strandStyle === "thread") {
      return `M${r2(sx)} ${r2(mid)}C${r2(mx)} ${r2(mid)} ${r2(mx)} ${r2(ty)} ${r2(tx)} ${r2(ty)}`;
    }
    if (strandStyle === "step") {
      const turn = r2(sx + Math.max(10, (tx - sx) * (0.35 + i * 0.06)));
      const dir = ty >= mid ? 1 : -1;
      const rr = Math.min(6, Math.abs(ty - mid) / 2);
      return `M${r2(sx)} ${r2(mid)}H${r2(turn - rr)}Q${turn} ${r2(mid)} ${turn} ${r2(mid + dir * rr)}V${r2(ty - dir * rr)}Q${turn} ${r2(ty)} ${r2(turn + rr)} ${r2(ty)}H${r2(tx)}`;
    }
    const te = clamp(b.share * 30, 2, 22);
    const y0 = b.top + 0.5;
    const y1 = b.top + Math.max(1, b.height - 1);
    return `M${r2(sx)} ${r2(y0)}C${r2(mx)} ${r2(y0)} ${r2(mx)} ${r2(ty - te / 2)} ${r2(tx)} ${r2(ty - te / 2)}L${r2(tx)} ${r2(ty + te / 2)}C${r2(mx)} ${r2(ty + te / 2)} ${r2(mx)} ${r2(y1)} ${r2(sx)} ${r2(y1)}Z`;
  };

  /* ---------------------------- interactions ---------------------------- */

  const dimNoun = (d: SpikeDimension) =>
    DIMENSIONS.find((x) => x.id === d)?.noun ?? d;

  const unpackSentence = (date: string, d: SpikeDimension) => {
    if (pending.includes(date))
      return `${shortDate(date)}: attribution still being computed.`;
    const list = [...(attributions[date]?.[d] ?? [])].sort(
      (a, b) => b.amount - a.amount,
    );
    const top = list[0];
    const sum = list.reduce((s, x) => s + x.amount, 0);
    return top && sum > 0
      ? `${shortDate(date)} unpacked by ${dimNoun(d)}. Most came from ${top.label}, ${Math.round((top.amount / sum) * 100)}%.`
      : `${shortDate(date)} unpacked.`;
  };

  const select = (date: string | null) => {
    if (disabled) return;
    if (date === selected) return;
    if (value === undefined) setOwnValue(date);
    onSelectSpike?.(
      date,
      date ? (days.find((d) => d.date === date) ?? null) : null,
    );
    setAnnouncement(date ? unpackSentence(date, dim) : "Spike folded.");
  };

  const setDim = (next: SpikeDimension) => {
    if (disabled || next === dim) return;
    if (dimension === undefined) setOwnDim(next);
    onDimensionChange?.(next);
    if (selected) setAnnouncement(unpackSentence(selected, next));
  };

  const flagButton = (date: string) =>
    chartNode?.querySelector<HTMLElement>(
      `[data-st-flag="${CSS.escape(date)}"]`,
    ) ?? null;

  const onFlagKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    date: string,
  ) => {
    const i = flagged.findIndex((d) => d.date === date);
    let next = -1;
    switch (event.key) {
      case "ArrowRight":
        next = Math.min(flagged.length - 1, i + 1);
        break;
      case "ArrowLeft":
        next = Math.max(0, i - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = flagged.length - 1;
        break;
      case "Escape":
        if (selected) {
          event.preventDefault();
          select(null);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    const target = flagged[next]?.date;
    if (target) flagButton(target)?.focus();
  };

  /* ------------------------------- header ------------------------------- */

  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  const sub =
    subtitle ??
    (first && last
      ? `${shortDate(first)} – ${shortDate(last)} · ${unit} a day`
      : `${unit} a day`);
  const openFlags = flags.filter((f) => !isExpected(f.date)).length;

  const dimSwitch = (
    <div
      role="radiogroup"
      aria-label="Unpack by"
      className="relative inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full border border-hairline bg-surface-1 p-0.5"
      onKeyDown={(event) => {
        const order = DIMENSIONS.map((d) => d.id);
        const i = order.indexOf(dim);
        let next: SpikeDimension | undefined;
        if (event.key === "ArrowRight" || event.key === "ArrowDown")
          next = order[(i + 1) % order.length];
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
          next = order[(i + order.length - 1) % order.length];
        else return;
        event.preventDefault();
        if (!next) return;
        setDim(next);
        event.currentTarget
          .querySelector<HTMLElement>(`[data-st-dim="${next}"]`)
          ?.focus();
      }}
    >
      {DIMENSIONS.map((d) => {
        const on = d.id === dim;
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            data-st-dim={d.id}
            aria-checked={on}
            aria-disabled={disabled || undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => setDim(d.id)}
            className={cn(
              "relative inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium transition-colors @[30rem]:px-3",
              on ? "text-[var(--st-ink)]" : "text-ink-3 hover:text-foreground",
              FOCUS,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-pill`}
                aria-hidden
                className="absolute inset-0 rounded-full border border-[var(--st-soft)] bg-[var(--st-wash)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative">{d.label}</span>
          </button>
        );
      })}
    </div>
  );

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-3">
      <span
        aria-hidden
        className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--st-wash)] text-[var(--st-ink)] @[30rem]:inline-flex"
      >
        <ScanSearch className="size-4" />
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
        {dimSwitch}
        {status === "ready" && flags.length > 0 ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline px-2.5 font-mono text-[10.5px] tracking-[0.04em] text-ink-2 uppercase">
            <Flag aria-hidden className="size-3 text-[var(--st-flag)]" />
            {`${openFlags} open`}
          </span>
        ) : null}
      </div>
    </div>
  );

  /* -------------------------------- chart ------------------------------- */

  const hovered = hover !== null ? days[hover] : null;
  const chart = (
    <div
      ref={setChartNode}
      className="relative h-44 w-full @[40rem]:h-[236px]"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const i = Math.floor(((event.clientX - rect.left) / rect.width) * n);
        const next = i >= 0 && i < n ? i : null;
        if (next !== hover) setHover(next);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        role="img"
        aria-label={`Daily ${unit}, median ${formatValue(med)}. ${flags.length} flagged days.`}
        viewBox={`0 0 ${cw} ${ch}`}
        className="absolute inset-0 block size-full overflow-visible"
      >
        <defs>
          <pattern
            id={hatchId}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} className="fill-surface-2" />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={6}
              strokeWidth={2}
              className="stroke-hairline-strong"
            />
          </pattern>
        </defs>
        {flagStyle === "band"
          ? flagged.map((d) => {
              const i = days.indexOf(d);
              return (
                <rect
                  key={`band-${d.date}`}
                  x={r2(i * slot)}
                  y={PLOT_TOP - 8}
                  width={r2(slot)}
                  height={r2(plotH + 8)}
                  rx={2}
                  className={cn(
                    isExpected(d.date)
                      ? "fill-surface-2"
                      : "fill-[var(--st-flag-wash)]",
                  )}
                />
              );
            })
          : null}
        <line
          x1={0}
          x2={cw}
          y1={PLOT_TOP + plotH + 0.5}
          y2={PLOT_TOP + plotH + 0.5}
          strokeWidth={1}
          className="stroke-hairline-strong"
        />
        {days.map((d, i) => {
          const isFlag = flagByDate.has(d.date);
          const isSel = i === selIndex;
          const dimmed = selIndex >= 0 && !isSel;
          return (
            <rect
              key={d.date}
              x={barX(i)}
              y={barTop(d.total)}
              width={r2(barW)}
              height={r2(PLOT_TOP + plotH - barTop(d.total))}
              rx={Math.min(2, barW / 3)}
              className={cn(
                "transition-[opacity,fill] duration-200",
                isSel && isPending
                  ? ""
                  : isFlag && !isExpected(d.date)
                    ? "fill-[var(--st-ink)]"
                    : hover === i
                      ? "fill-ink-2"
                      : "fill-ink-3",
              )}
              style={{
                opacity: dimmed ? 0.28 : isFlag ? 1 : 0.55,
                fill: isSel && isPending ? `url(#${hatchId})` : undefined,
              }}
            />
          );
        })}
        <line
          x1={0}
          x2={cw}
          y1={medY}
          y2={medY}
          strokeDasharray="4 4"
          strokeWidth={1}
          className="stroke-ink-3"
          opacity={0.7}
        />
        <text
          x={2}
          y={medY - 5}
          className="fill-ink-3 stroke-card font-mono"
          strokeWidth={3}
          strokeLinejoin="round"
          style={{ fontSize: 10, paintOrder: "stroke" }}
        >
          {`median ${formatValue(med)}`}
        </text>
        {days.map((d, i) =>
          (days.length - 1 - i) % 7 === 0 ? (
            <text
              key={`t-${d.date}`}
              x={r2(clamp(i * slot + slot / 2, 14, cw - 14))}
              y={ch - 5}
              textAnchor="middle"
              className="fill-ink-3 font-mono"
              style={{ fontSize: 10 }}
            >
              {shortDate(d.date)}
            </text>
          ) : null,
        )}
        {flagStyle !== "band"
          ? flagged.map((d) => {
              const i = days.indexOf(d);
              const cx = r2(i * slot + slot / 2);
              const top = barTop(d.total);
              const exp = isExpected(d.date);
              return (
                <motion.g
                  key={`flag-${d.date}`}
                  initial={false}
                  animate={{
                    opacity: selIndex >= 0 && i !== selIndex ? 0.35 : 1,
                  }}
                  transition={{ duration: durations.fast }}
                  className={cn(exp ? "text-ink-3" : "text-[var(--st-flag)]")}
                >
                  {flagStyle === "pin" ? (
                    <>
                      <line
                        x1={cx}
                        x2={cx}
                        y1={r2(top - 3)}
                        y2={r2(top - 19)}
                        stroke="currentColor"
                        strokeWidth={1.2}
                      />
                      <path
                        d={`M${cx} ${r2(top - 19)}h7l-2 3 2 3h-7z`}
                        fill="currentColor"
                      />
                    </>
                  ) : (
                    <circle
                      cx={cx}
                      cy={r2(top - 9)}
                      r={3.5}
                      fill={exp ? "none" : "currentColor"}
                      stroke="currentColor"
                      strokeWidth={1.4}
                    />
                  )}
                </motion.g>
              );
            })
          : null}
        <AnimatePresence>
          {selIndex >= 0 && selectedDay
            ? bands.map((b, i) => (
                <motion.rect
                  key={`${selected}:${dim}:${b.id}`}
                  x={barX(selIndex)}
                  y={b.top}
                  width={r2(barW)}
                  height={r2(
                    Math.max(0.5, b.height - (i < bands.length - 1 ? 1 : 0)),
                  )}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    duration: durations.base,
                    ease: easings.enter,
                    delay: motionSafe ? i * 0.03 : 0,
                  }}
                  style={{ fill: b.color }}
                />
              ))
            : null}
        </AnimatePresence>
      </svg>
      {flagged.map((d) => {
        const i = days.indexOf(d);
        const exp = isExpected(d.date);
        const pend = pending.includes(d.date);
        const x = i * slot;
        const f = flagByDate.get(d.date);
        return (
          <button
            key={d.date}
            type="button"
            data-st-flag={d.date}
            tabIndex={roving === d.date ? 0 : -1}
            aria-pressed={selected === d.date}
            aria-disabled={disabled || undefined}
            aria-describedby={hintId}
            aria-label={`${weekday(d.date)} ${shortDate(d.date)}, ${formatValue(d.total)} ${unit}, ${med > 0 ? `${(d.total / med).toFixed(1)} times the median` : ""}, ${exp ? "expected" : "unexpected"}${pend ? ", attribution pending" : ""}${f?.note ? `. ${f.note}` : ""}`}
            onFocus={() => setActiveFlag(d.date)}
            onClick={() => select(selected === d.date ? null : d.date)}
            onKeyDown={(event) => onFlagKey(event, d.date)}
            className={cn("absolute rounded-1", FOCUS)}
            style={{
              left: `${r2((x / cw) * 100)}%`,
              width: `${r2((slot / cw) * 100)}%`,
              top: `${r2(((PLOT_TOP - 24) / ch) * 100)}%`,
              height: `${r2(((plotH + 24) / ch) * 100)}%`,
            }}
          />
        );
      })}
      <AnimatePresence initial={false}>
        {hovered && selIndex < 0 ? (
          <motion.p
            key="hover"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
            className="pointer-events-none absolute top-0 left-0 font-mono text-[10.5px] text-ink-2 tabular-nums"
          >
            {`${shortDate(hovered.date)} · ${formatValue(hovered.total)}`}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );

  /* ------------------------------- strands ------------------------------- */

  const sweepW = r2(Math.max(0, tx - sx + 4));
  const overlayH = Math.max(ch, LIST_HEAD + causes.length * ROW_H);
  const sweepKey = `${selected ?? ""}-${dim}`;
  const strands =
    selIndex >= 0 && attribution && causes.length > 0 ? (
      <motion.svg
        key={sweepKey}
        aria-hidden
        className="pointer-events-none absolute top-0 left-3 hidden overflow-visible @[40rem]:block"
        width={cw + COL_GAP}
        height={overlayH}
        viewBox={`0 0 ${cw + COL_GAP} ${overlayH}`}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: exitFor(durations.base) }}
      >
        <defs>
          <clipPath id={`${clipId}-${sweepKey}`}>
            <motion.rect
              x={r2(sx)}
              y={-10}
              height={overlayH + 20}
              initial={{ width: motionSafe ? 0 : sweepW }}
              animate={{ width: sweepW }}
              transition={
                motionSafe ? { ...springs.glide, delay: 0.08 } : { duration: 0 }
              }
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId}-${sweepKey})`}>
          {bands.map((b, i) => (
            <path
              key={`${selected}:${dim}:${b.id}`}
              d={strandPath(b, i)}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={
                strandStyle === "ribbon"
                  ? { fill: b.color, fillOpacity: 0.42 }
                  : {
                      fill: "none",
                      stroke: b.color,
                      strokeWidth:
                        strandStyle === "thread"
                          ? 1.6
                          : r2(clamp(b.share * 12, 1.5, 7)),
                      strokeOpacity: 0.9,
                    }
              }
            />
          ))}
        </g>
      </motion.svg>
    ) : null;

  /* -------------------------------- list -------------------------------- */

  const step = cascade(causes.length);
  let listBody: React.ReactNode;
  if (!selected) {
    listBody = (
      <div
        className="flex flex-col items-start gap-1.5 px-1 py-2 text-[12.5px] text-ink-3"
        style={{ paddingTop: 6 }}
      >
        {flags.length === 0 ? (
          <>
            <p className="font-medium text-foreground">No unusual days</p>
            <p>{`Nothing in this window went past the detector’s threshold.`}</p>
          </>
        ) : (
          <>
            <p className="font-medium text-foreground">
              Press a flag to trace it
            </p>
            <p>{`${flags.length} flagged ${flags.length === 1 ? "day" : "days"}; each unpacks into the keys, people and prompts that made it.`}</p>
          </>
        )}
      </div>
    );
  } else if (isPending) {
    listBody = (
      <div className="flex flex-col gap-2">
        <p className="px-1 text-[12.5px] text-ink-3">
          {`Attribution for ${shortDate(selected)} is still being computed. It usually lands within the hour.`}
        </p>
        {[0.8, 0.55, 0.4].map((w, i) => (
          <span
            key={i}
            aria-hidden
            className="h-3 rounded-1 bg-surface-2"
            style={{ width: `${w * 100}%` }}
          />
        ))}
      </div>
    );
  } else {
    listBody = (
      <ol
        aria-label={`Causes of ${shortDate(selected)} by ${dimNoun(dim)}`}
        className="flex flex-col"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {causes.map((x, i) => {
            const share = causeTotal > 0 ? x.cause.amount / causeTotal : 0;
            const color = bands[i]?.color ?? "var(--st-ink)";
            return (
              <motion.li
                key={`${selected}:${dim}:${x.cause.id}`}
                initial={{ opacity: 0, x: motionSafe ? -distances.step : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  x: motionSafe
                    ? { ...springs.glide, delay: 0.14 + i * step }
                    : { duration: 0 },
                  opacity: {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: motionSafe ? 0.14 + i * step : 0,
                  },
                }}
                className="flex items-center gap-2.5 border-b border-hairline last:border-b-0"
                style={{ height: ROW_H }}
              >
                <span
                  aria-hidden
                  className="h-6 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline gap-2">
                    <span
                      title={x.cause.label}
                      className="min-w-0 flex-1 truncate text-[12.5px] leading-5 font-medium"
                    >
                      {x.cause.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums">
                      {formatValue(x.cause.amount)}
                    </span>
                    <span className="w-8 shrink-0 text-right font-mono text-[10.5px] text-ink-3 tabular-nums">
                      {`${Math.round(share * 100)}%`}
                    </span>
                  </span>
                  <span className="truncate text-[11px] leading-4 text-ink-3">
                    {x.cause.detail ?? (x.other ? "Folded together" : "")}
                  </span>
                </span>
                {onOpenCause && !x.other ? (
                  <button
                    type="button"
                    aria-label={`Open ${x.cause.label}`}
                    disabled={disabled}
                    onClick={() => onOpenCause(x.cause, dim, selected)}
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    <ArrowUpRight aria-hidden className="size-3.5" />
                  </button>
                ) : (
                  <span aria-hidden className="size-7 shrink-0" />
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    );
  }

  const listHead =
    selected && selectedDay ? (
      <p className="flex flex-wrap items-baseline gap-x-2 pb-1.5 @[40rem]:h-[34px] @[40rem]:flex-nowrap @[40rem]:pb-0">
        <span className="text-[13px] font-semibold whitespace-nowrap">{`${weekday(selected).slice(0, 3)} ${shortDate(selected)}`}</span>
        <span className="font-mono text-[11.5px] text-ink-2 tabular-nums">{`${formatValue(selectedDay.total)} ${unit}`}</span>
        {med > 0 ? (
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">{`${(selectedDay.total / med).toFixed(1)}× median`}</span>
        ) : null}
      </p>
    ) : (
      <p className="pb-1.5 text-[13px] font-semibold @[40rem]:h-[34px] @[40rem]:pb-0">
        Causes
      </p>
    );

  /** The narrow stand-in for the strands: the same shares, as one stacked bar. */
  const stacked =
    selected && attribution && causes.length > 0 ? (
      <div
        aria-hidden
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full @[40rem]:hidden"
      >
        {bands.map((b, i) => (
          <motion.span
            key={b.id}
            className="h-full first:rounded-l-full last:rounded-r-full"
            initial={{ width: "0%" }}
            animate={{ width: `${r2(b.share * 100)}%` }}
            transition={
              motionSafe
                ? { ...springs.glide, delay: i * step }
                : { duration: 0 }
            }
            style={{ backgroundColor: b.color }}
          />
        ))}
      </div>
    ) : null;

  /* ------------------------------- footer ------------------------------- */

  const top = attribution ? causes[0] : undefined;
  const topLine =
    selected && top && causeTotal > 0
      ? `Most of ${weekday(selected)} came from ${dim === "keys" ? `the ${top.cause.label} key` : dim === "prompts" ? `“${top.cause.label}”` : top.cause.label}: ${formatValue(top.cause.amount)} of ${formatValue(selectedDay?.total ?? causeTotal)} ${unit}, ${Math.round((top.cause.amount / causeTotal) * 100)}%.`
      : null;

  const footer =
    status === "ready" ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline px-3 py-2.5">
        <p className="min-w-0 flex-1 text-[12.5px] leading-5 text-ink-2">
          {topLine ??
            (selected && isPending
              ? `${shortDate(selected)} is still being attributed.`
              : flags.length === 0
                ? `No unusual days between ${first ? shortDate(first) : ""} and ${last ? shortDate(last) : ""}.`
                : `Median day ${formatValue(med)} ${unit}. Left and Right move between flags.`)}
        </p>
        {selected && onFlagExpected ? (
          <button
            type="button"
            aria-pressed={isExpected(selected)}
            disabled={disabled}
            onClick={() => {
              const next = !isExpected(selected);
              setExpectedMap((m) => ({ ...m, [selected]: next }));
              onFlagExpected(selected, next);
              setAnnouncement(
                next
                  ? `${shortDate(selected)} marked as expected.`
                  : `${shortDate(selected)} flagged again.`,
              );
            }}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border px-2.5 text-[12px] font-medium transition-colors",
              isExpected(selected)
                ? "border-[var(--st-soft)] bg-[var(--st-wash)] text-[var(--st-ink)]"
                : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <CheckCheck aria-hidden className="size-3.5" />
            {isExpected(selected) ? "Expected" : "Mark expected"}
          </button>
        ) : null}
      </div>
    ) : null;

  /* -------------------------------- body -------------------------------- */

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div
        aria-hidden
        className="flex h-44 items-end gap-1 px-3 pb-3 @[40rem]:h-[236px]"
      >
        {Array.from({ length: 24 }, (_, i) => (
          <span
            key={i}
            className="flex-1 rounded-1 bg-surface-2"
            style={{ height: `${30 + ((i * 37) % 45)}%` }}
          />
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2 px-3 py-6">
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
  } else {
    body = (
      <div className="relative grid grid-cols-1 gap-3 px-3 @[40rem]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] @[40rem]:gap-5">
        <div className="relative flex flex-col gap-3">
          {chart}
          {stacked}
        </div>
        <div className="relative min-w-0">
          {listHead}
          {listBody}
        </div>
        <AnimatePresence initial={false}>{strands}</AnimatePresence>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container flex max-h-[36rem] w-full [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={accentVars(accent)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected && !event.defaultPrevented) {
          event.preventDefault();
          select(null);
          flagButton(selected)?.focus();
        }
      }}
    >
      {header}
      {body}
      {footer}
      <p id={hintId} className="sr-only">
        Left and Right move between flagged days, Enter unpacks a spike, Escape
        folds it.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
