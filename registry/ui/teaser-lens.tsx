"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { ArrowRight, RotateCcw, Search, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type TeaserStage = {
  name: string;
  /** Average days a task waits in this stage. */
  days: number;
};

/** The account's own summary numbers the report is drawn from. */
export type TeaserSummary = {
  workspace: string;
  /** The period the report covers: "September 2026". */
  period: string;
  members: number;
  activeMembers: number;
  /** Tasks finished in the period. */
  tasksDone: number;
  /** Median days from start to done. */
  cycleDays: number;
  /** Share of due tasks finished on time, 0–1. */
  onTime: number;
  /** Tasks finished each week, oldest first (up to twelve are drawn). */
  weekly: number[];
  /** Retention by start week: each row is a cohort, each value a later week's share still active, 0–1. */
  cohorts: number[][];
  /** Where tasks wait, in flow order. */
  stages: TeaserStage[];
};

/** What a region of the report would tell you. Ids: pulse, trend, cohorts, stages. */
export type TeaserRegion = { id: string; title: string; teaser: string };

/** The lens centre as fractions of the report's width and height. */
export type TeaserLensValue = { x: number; y: number };

export type TeaserLensAccent = "cobalt" | "signal" | "amber" | "graphite";
export type TeaserLensStatus = "ready" | "loading" | "error";

export type TeaserLensProps = {
  /** The account's numbers; null draws a labelled sample. @default defaultTeaserSummary */
  summary?: TeaserSummary | null;
  /** What each region would tell you, by id. @default defaultTeaserRegions */
  regions?: TeaserRegion[];
  /** Controlled lens centre, as fractions of the report. */
  value?: TeaserLensValue;
  /** Initial lens centre when uncontrolled. @default over Cohorts */
  defaultValue?: TeaserLensValue;
  /** Fires when the lens comes to rest after a drag, a key or a tap. */
  onValueChange?: (value: TeaserLensValue) => void;
  /** The lens came to rest over a different region. */
  onRegionChange?: (region: TeaserRegion) => void;
  /** Enter on the lens, or the card's call to action, with the region under the lens. */
  onUpgrade?: (region: TeaserRegion) => void;
  /** The card's close button, or Escape on the lens. */
  onDismiss?: () => void;
  /** Controlled: the lens and its card are put away. */
  dismissed?: boolean;
  /** Initial dismissed state when uncontrolled. @default false */
  defaultDismissed?: boolean;
  /** Fires from the close (true) or from the pill that brings the lens back (false). */
  onDismissedChange?: (dismissed: boolean) => void;
  /** The lens's diameter in px (the band's height when narrow). @default 136 */
  lensSize?: number;
  /** How soft the rest of the report is, px of blur. @default 6 */
  blurAmount?: number;
  /** The rim, the card and the report's lead series: a named accent or any CSS colour. @default "cobalt" */
  accent?: TeaserLensAccent | (string & {});
  /** How much the glass enlarges what is under it. @default 1.06 */
  magnify?: number;
  /** How heavy the glass is, 0–1: a heavy lens coasts less and tilts more. @default 0.5 */
  weight?: number;
  /** The plan the report belongs to. @default "Pro" */
  planName?: string;
  /** The report's heading. @default "Delivery report" */
  title?: string;
  /** Whether the numbers have arrived. @default "ready" */
  status?: TeaserLensStatus;
  /** "Try again" was pressed after the report failed to load. */
  onRetry?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                  Defaults                                */
/* ----------------------------------------------------------------------- */

/** Fieldline's numbers for September: a team of 42 shipping a little faster each week. */
export const defaultTeaserSummary: TeaserSummary = {
  workspace: "Fieldline",
  period: "September 2026",
  members: 42,
  activeMembers: 38,
  tasksDone: 412,
  cycleDays: 3.4,
  onTime: 0.87,
  weekly: [24, 28, 31, 27, 33, 36, 34, 39, 37, 42, 40, 45],
  cohorts: [
    [1, 0.86, 0.79, 0.74, 0.71, 0.7],
    [1, 0.82, 0.75, 0.71, 0.69],
    [1, 0.88, 0.81, 0.78],
    [1, 0.8, 0.72],
    [1, 0.84],
    [1],
  ],
  stages: [
    { name: "Backlog", days: 1.1 },
    { name: "In review", days: 1.6 },
    { name: "Blocked", days: 0.4 },
    { name: "QA", days: 0.6 },
  ],
};

/** Numbers drawn when the account has none yet; always labelled as a sample. */
export const defaultTeaserSample: TeaserSummary = {
  workspace: "Sample workspace",
  period: "Four weeks",
  members: 12,
  activeMembers: 10,
  tasksDone: 96,
  cycleDays: 2.8,
  onTime: 0.9,
  weekly: [6, 8, 7, 9, 10, 9, 11, 12, 11, 13, 12, 14],
  cohorts: [
    [1, 0.9, 0.84, 0.8, 0.78, 0.77],
    [1, 0.85, 0.8, 0.76, 0.74],
    [1, 0.88, 0.83, 0.8],
    [1, 0.86, 0.8],
    [1, 0.9],
    [1],
  ],
  stages: [
    { name: "Backlog", days: 0.8 },
    { name: "In review", days: 1.1 },
    { name: "Blocked", days: 0.3 },
    { name: "QA", days: 0.6 },
  ],
};

export const defaultTeaserRegions: TeaserRegion[] = [
  {
    id: "pulse",
    title: "Team pulse",
    teaser:
      "How many members are active each week, and whether delivery is speeding up.",
  },
  {
    id: "trend",
    title: "Throughput trend",
    teaser:
      "Twelve weeks of finished work and a forecast, so a slowdown shows before it lands.",
  },
  {
    id: "cohorts",
    title: "Cohort retention",
    teaser:
      "Which start weeks kept their people working in Fieldline past week four.",
  },
  {
    id: "stages",
    title: "Where work waits",
    teaser:
      "The stage that holds tasks longest, and how many days it adds to each one.",
  },
];

const ORDER = ["pulse", "trend", "cohorts", "stages"];
const DEFAULT_VALUE: TeaserLensValue = { x: 0.74, y: 0.52 };

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<TeaserLensAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r5 = (v: number) => Math.round(v * 100000) / 100000;
const pc = (v: number) => `${Number((v * 100).toFixed(3))}%`;

/** Below this container width the lens is a full-width band. */
const NARROW = 480;
/** The least room kept between the lens centre and the report's edge. */
const EDGE = 0.03;

type Rect = { id: string; x: number; y: number; w: number; h: number };
type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

/* ----------------------------------------------------------------------- */
/*                                 The report                               */
/* ----------------------------------------------------------------------- */

function Report({ data }: { data: TeaserSummary }) {
  const weeks = data.weekly.slice(-12);
  const top = Math.max(1, ...weeks) * 1.15;
  const last4 = weeks.slice(-4).reduce((a, b) => a + b, 0);
  const prev4 = weeks.slice(-8, -4).reduce((a, b) => a + b, 0);
  const change = prev4 > 0 ? Math.round(((last4 - prev4) / prev4) * 100) : 0;
  // A straight-line forecast from the last four weeks' slope.
  const slope =
    weeks.length >= 4 ? ((weeks.at(-1) ?? 0) - (weeks.at(-4) ?? 0)) / 3 : 0;
  const bw = 240 / (weeks.length + 3);
  const forecast = [0, 1, 2, 3].map((i) => (weeks.at(-1) ?? 0) + slope * i);
  const fy = (v: number) => r2(86 - (Math.min(v, top) / top) * 80);
  const fline = forecast
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${r2((weeks.length - 1 + i) * bw + bw / 2)} ${fy(v)}`,
    )
    .join(" ");
  const totalDays = data.stages.reduce((a, s) => a + s.days, 0) || 1;
  const longest = data.stages.reduce<TeaserStage | undefined>(
    (a, s) => (!a || s.days > a.days ? s : a),
    undefined,
  );
  const stageTone = [
    "oklch(from var(--tl-accent) 0.66 c h)",
    "oklch(from var(--tl-accent) 0.5 c h)",
    "oklch(from var(--danger) 0.66 c h)",
    "oklch(from var(--ink-3) 0.7 0.02 h)",
  ];
  const tiles = [
    {
      label: "Active members",
      value: String(data.activeMembers),
      sub: `of ${data.members}`,
    },
    {
      label: "Tasks done",
      value: String(data.tasksDone),
      sub: `${change >= 0 ? "+" : ""}${change}% on last month`,
      tone: change >= 0 ? "text-success" : "text-danger",
    },
    {
      label: "Cycle time",
      value: `${data.cycleDays.toFixed(1)} d`,
      sub: "median",
    },
    {
      label: "On time",
      value: `${Math.round(data.onTime * 100)}%`,
      sub: "of due tasks",
    },
  ];
  const card = "rounded-2 border border-hairline bg-surface-1";
  const head = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";
  return (
    <div className="grid grid-cols-1 gap-2.5 p-3 @min-[34rem]:grid-cols-2 @min-[34rem]:gap-3 @min-[34rem]:p-4">
      <section
        data-tl-region="pulse"
        className="grid grid-cols-2 gap-2 @min-[34rem]:col-span-2 @min-[34rem]:grid-cols-4"
      >
        {tiles.map((t) => (
          <div key={t.label} className={cn(card, "px-3 py-2")}>
            <p className="truncate text-[11px] text-ink-3">{t.label}</p>
            <p className="text-lg leading-tight font-semibold tracking-tight tabular-nums">
              {t.value}
            </p>
            <p className={cn("truncate text-[11px] text-ink-3", t.tone)}>
              {t.sub}
            </p>
          </div>
        ))}
      </section>
      <section
        data-tl-region="trend"
        className={cn(card, "flex flex-col gap-2 p-3")}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className={head}>Throughput</p>
          <p className="text-[11px] text-ink-3 tabular-nums">tasks a week</p>
        </div>
        <svg
          viewBox="0 0 240 90"
          preserveAspectRatio="none"
          className="h-20 w-full @min-[34rem]:h-24"
        >
          {[30, 58, 86].map((y) => (
            <line
              key={y}
              x1={0}
              x2={240}
              y1={y}
              y2={y}
              className="stroke-hairline"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {weeks.map((v, i) => (
            <rect
              key={i}
              x={r2(i * bw + bw * 0.18)}
              y={fy(v)}
              width={r2(bw * 0.64)}
              height={r2(86 - fy(v))}
              rx={1.5}
              style={{
                fill:
                  i >= weeks.length - 4
                    ? "oklch(from var(--tl-accent) 0.66 c h)"
                    : "color-mix(in oklab, var(--ink-3) 45%, transparent)",
              }}
            />
          ))}
          <path
            d={fline}
            fill="none"
            stroke="var(--tl-accent)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <p className="text-[11px] text-ink-2">
          {slope >= 0 ? "Rising" : "Easing"} about {Math.abs(Math.round(slope))}{" "}
          a week; forecast dashed.
        </p>
      </section>
      <section
        data-tl-region="cohorts"
        className={cn(card, "flex flex-col gap-2 p-3")}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className={head}>Retention</p>
          <p className="text-[11px] text-ink-3">by start week</p>
        </div>
        <div className="grid grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-0.5 text-[9px] tabular-nums @min-[34rem]:text-[10px]">
          <span />
          {[1, 2, 3, 4, 5, 6].map((w) => (
            <span key={w} className="text-center text-ink-3">
              W{w}
            </span>
          ))}
          {data.cohorts.slice(0, 6).map((row, ri) => (
            <React.Fragment key={ri}>
              <span className="pr-1.5 text-ink-3">C{ri + 1}</span>
              {Array.from({ length: 6 }, (_, ci) => {
                const v = row[ci];
                return (
                  <span
                    key={ci}
                    className="flex h-4 items-center justify-center rounded-[3px] @min-[34rem]:h-[18px]"
                    style={{
                      backgroundColor:
                        v === undefined
                          ? "transparent"
                          : `color-mix(in oklab, oklch(from var(--tl-accent) 0.66 c h) ${Math.round(
                              18 + v * 70,
                            )}%, var(--color-surface-1))`,
                      color:
                        v !== undefined && v > 0.75
                          ? "var(--card)"
                          : "var(--ink-2)",
                    }}
                  >
                    {v === undefined ? "" : Math.round(v * 100)}
                  </span>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </section>
      <section
        data-tl-region="stages"
        className={cn(card, "flex flex-col gap-2 p-3 @min-[34rem]:col-span-2")}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className={head}>Where work waits</p>
          <p className="text-[11px] text-ink-3 tabular-nums">
            {totalDays.toFixed(1)} days in all
          </p>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
          {data.stages.map((s, i) => (
            <span
              key={s.name}
              className="h-full border-r-2 border-surface-1 last:border-r-0"
              style={{
                width: pc(s.days / totalDays),
                backgroundColor: stageTone[i % stageTone.length],
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-2">
          {data.stages.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: stageTone[i % stageTone.length] }}
              />
              {s.name}
              <span className="text-ink-3 tabular-nums">
                {s.days.toFixed(1)} d
              </span>
            </span>
          ))}
        </div>
        {longest ? (
          <p className="hidden text-[11px] text-ink-2 @min-[34rem]:block">
            {longest.name} holds tasks longest: {longest.days.toFixed(1)} days
            on average.
          </p>
        ) : null}
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The lens                                */
/* ----------------------------------------------------------------------- */

/**
 * A premium report drawn from the account's own numbers, softly blurred, with
 * a glass lens you move over it to read one region clearly. The lens follows
 * the finger 1:1 and has weight: picked up it lifts on flick, its rim tilts
 * toward where it is heading and its highlight slides the other way; let go,
 * it coasts by projection, settles on glide with the release velocity and
 * sets down on recoil. Under it the report is sharp and a little enlarged; a
 * card follows beside it on a glide spring, naming what that region would
 * tell you with the call to upgrade. A press anywhere on the report glides
 * the lens there.
 *
 * The lens is a button: arrow keys move it, Page keys and Home/End jump
 * between regions, Enter upgrades, Escape puts it away. With no numbers the
 * report draws a labelled sample. In a narrow container the lens is a
 * full-width band that moves on y. Under reduced motion the lens follows
 * and stops without coast, tilt or bounce, and the card moves with it.
 */
export function TeaserLens({
  summary = defaultTeaserSummary,
  regions = defaultTeaserRegions,
  value,
  defaultValue = DEFAULT_VALUE,
  onValueChange,
  onRegionChange,
  onUpgrade,
  onDismiss,
  dismissed,
  defaultDismissed = false,
  onDismissedChange,
  lensSize = 136,
  blurAmount = 6,
  accent = "cobalt",
  magnify = 1.06,
  weight = 0.5,
  planName = "Pro",
  title = "Delivery report",
  status = "ready",
  onRetry,
  disabled = false,
  className,
}: TeaserLensProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const teaserId = `${uid}-teaser`;
  const color =
    accent in ACCENTS
      ? ACCENTS[accent as TeaserLensAccent]
      : (accent as string);
  const ready = status === "ready";
  const sample = summary === null;
  const data = summary ?? defaultTeaserSample;
  const size = clamp(Math.round(lensSize), 64, 260);
  const bandH = Math.min(size, 200);
  const heavy = clamp(weight, 0, 1);

  const [ownDismissed, setOwnDismissed] = React.useState(defaultDismissed);
  const isDismissed = dismissed ?? ownDismissed;
  const start = value ?? defaultValue;

  const fx = useMotionValue(start.x);
  const fy = useMotionValue(start.y);
  const lift = useMotionValue(1);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const radius = useMotionValue(size / 2);
  const band = useMotionValue(0);
  const cardX = useSpring(0, springs.glide);
  const cardY = useSpring(0, springs.glide);

  const [narrow, setNarrow] = React.useState(false);
  const [placed, setPlaced] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const [regionId, setRegionId] = React.useState("cohorts");
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const reportRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const baseRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const lensRef = React.useRef<HTMLButtonElement | null>(null);
  const box = React.useRef({ w: 0, h: 0 });
  const cardBox = React.useRef({ w: 0, h: 0 });
  const rects = React.useRef<Rect[]>([]);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const grab = React.useRef({ x: 0, y: 0 });
  const announced = React.useRef("");
  const reported = React.useRef(start);
  const focusLens = React.useRef(false);
  const api = React.useRef({ place: () => {}, locate: () => {} });

  const regionOf = (id: string) =>
    regions.find((r) => r.id === id) ?? {
      id,
      title: id,
      teaser: "",
    };
  const region = regionOf(regionId);

  /* ------------------------------ geometry ------------------------------ */

  const limits = () => {
    const h = box.current.h || 1;
    if (narrow) {
      const half = Math.min(0.45, bandH / 2 / h);
      return { x0: 0.5, x1: 0.5, y0: half, y1: 1 - half };
    }
    // The whole disc stays on the report, with a hair of room for its rim.
    const w = box.current.w || 1;
    const rx = Math.min(0.5, Math.max(EDGE, (size / 2 + 4) / w));
    const ry = Math.min(0.5, Math.max(EDGE, (size / 2 + 4) / h));
    return { x0: rx, x1: 1 - rx, y0: ry, y1: 1 - ry };
  };

  const locate = () => {
    const x = fx.get();
    const y = fy.get();
    let best: Rect | undefined;
    let bestD = Infinity;
    for (const r of rects.current) {
      const inside = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
      const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
      const d = inside ? -1 : Math.hypot(dx, dy);
      if (d < bestD) {
        best = r;
        bestD = d;
      }
    }
    if (best) setRegionId((id) => (id === best.id ? id : best.id));
  };

  const place = () => {
    const { w, h } = box.current;
    const { w: cw, h: ch } = cardBox.current;
    if (w === 0 || h === 0 || ch === 0) return;
    const lx = fx.get() * w;
    const ly = fy.get() * h;
    let x = 8;
    let y = 8;
    if (narrow) {
      // Under the band when that is in view, else over it: the card follows
      // the part of the report the scroller is showing.
      const half = Math.min(bandH, h * 0.9) / 2;
      const view = scrollRef.current;
      const top = view ? view.scrollTop : 0;
      const bottom = view ? top + view.clientHeight : h;
      const below = ly + half + 8;
      const above = ly - half - 8 - ch;
      y =
        below + ch <= Math.min(h, bottom) - 8 || above < Math.max(0, top) + 8
          ? below
          : above;
    } else {
      const r = size / 2;
      x = lx + r + 14;
      if (x + cw > w - 8) x = lx - r - 14 - cw;
      x = clamp(x, 8, Math.max(8, w - cw - 8));
      y = ly - ch / 2;
    }
    y = clamp(y, 8, Math.max(8, h - ch - 8));
    if (!placed || !motionSafe) {
      cardX.jump(r2(x));
      cardY.jump(r2(y));
      if (!placed) setPlaced(true);
    } else {
      cardX.set(r2(x));
      cardY.set(r2(y));
    }
  };

  React.useEffect(() => {
    api.current = { place, locate };
  });

  // Rectangles, sizes and the band mode are read off the DOM, never per frame.
  React.useEffect(() => {
    const report = reportRef.current;
    const base = baseRef.current;
    if (!report || !base) return;
    const measure = () => {
      const r = report.getBoundingClientRect();
      box.current = { w: r.width, h: r.height };
      rects.current = Array.from(
        base.querySelectorAll<HTMLElement>("[data-tl-region]"),
      ).map((n) => {
        const b = n.getBoundingClientRect();
        return {
          id: n.dataset.tlRegion ?? "",
          x: (b.left - r.left) / (r.width || 1),
          y: (b.top - r.top) / (r.height || 1),
          w: b.width / (r.width || 1),
          h: b.height / (r.height || 1),
        };
      });
      // The region the lens starts over is not news.
      if (!announced.current) {
        const x = fx.get();
        const y = fy.get();
        announced.current =
          rects.current.find(
            (q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h,
          )?.id ?? "";
      }
      const isNarrow = r.width > 0 && r.width < NARROW;
      setNarrow(isNarrow);
      band.set(isNarrow ? 1 : 0);
      api.current.locate();
      api.current.place();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(report);
    return () => ro.disconnect();
  }, [band, ready, fx, fy]);

  React.useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const ro = new ResizeObserver(() => {
      cardBox.current = { w: card.offsetWidth, h: card.offsetHeight };
      api.current.place();
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, [isDismissed, ready]);

  React.useEffect(() => {
    const a = fx.on("change", () => {
      api.current.locate();
      api.current.place();
    });
    const b = fy.on("change", () => {
      api.current.locate();
      api.current.place();
    });
    return () => {
      a();
      b();
    };
  }, [fx, fy]);

  React.useEffect(() => {
    radius.set(narrow ? bandH / 2 : size / 2);
    api.current.place();
  }, [radius, size, bandH, narrow]);

  React.useEffect(() => {
    const list = running.current;
    return () => {
      for (const c of list) c.stop();
    };
  }, []);

  /* ------------------------------- motion ------------------------------- */

  const halt = () => {
    for (const c of running.current) c.stop();
    running.current = [];
  };

  /** Moves a value to a target on a spring, by a plain number written into it. */
  const drive = (
    mv: MotionValue<number>,
    to: number,
    transition: Spring,
    velocity = 0,
  ) => {
    const c = animate(mv.get(), to, {
      ...transition,
      velocity,
      onUpdate: (v: number) => mv.set(r5(v)),
    });
    running.current.push(c);
    return c;
  };

  const settleAt = (x: number, y: number, vx = 0, vy = 0, landing = false) => {
    halt();
    const lim = limits();
    const tx = r5(clamp(x, lim.x0, lim.x1));
    const ty = r5(clamp(y, lim.y0, lim.y1));
    if (!motionSafe) {
      fx.set(tx);
      fy.set(ty);
      lift.set(1);
      tiltX.set(0);
      tiltY.set(0);
    } else {
      drive(fx, tx, springs.glide, vx);
      drive(fy, ty, springs.glide, vy);
      drive(tiltX, 0, springs.snap);
      drive(tiltY, 0, springs.snap);
      if (landing) drive(lift, 1, springs.recoil);
    }
    report(tx, ty);
  };

  const report = (x: number, y: number) => {
    const next = { x: r5(x), y: r5(y) };
    reported.current = next;
    onValueChange?.(next);
    // Name the region once the lens settles on it, not on every crossing.
    const id = currentRegion(next.x, next.y);
    if (id && id !== announced.current) {
      announced.current = id;
      const r = regionOf(id);
      setSaid((s) => ({ n: s.n + 1, text: `${r.title}. ${r.teaser}` }));
      onRegionChange?.(r);
    }
  };

  const currentRegion = (x: number, y: number) => {
    let best = "";
    let bestD = Infinity;
    for (const r of rects.current) {
      const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
      const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        best = r.id;
        bestD = d;
      }
    }
    return best;
  };

  // A host that moves the lens gets the same glide a key would.
  React.useEffect(() => {
    if (!value) return;
    const last = reported.current;
    if (Math.abs(last.x - value.x) < 1e-4 && Math.abs(last.y - value.y) < 1e-4)
      return;
    reported.current = value;
    for (const c of running.current) c.stop();
    running.current = [];
    const c1 = animate(fx.get(), value.x, {
      ...springs.glide,
      onUpdate: (v: number) => fx.set(r5(v)),
    });
    const c2 = animate(fy.get(), value.y, {
      ...springs.glide,
      onUpdate: (v: number) => fy.set(r5(v)),
    });
    running.current.push(c1, c2);
  }, [value, fx, fy]);

  const usable = ready && !disabled && !isDismissed;

  const drag = useDrag({
    threshold: 3,
    disabled: !usable,
    onStart: () => {
      halt();
      grab.current = { x: fx.get(), y: fy.get() };
      setHeld(true);
      if (motionSafe) drive(lift, 1.05, springs.flick);
    },
    onMove: ({ offset, delta }) => {
      const { w, h } = box.current;
      if (w === 0 || h === 0) return;
      const lim = limits();
      // 1:1 under the finger; past the edge the glass gives a little, then less.
      const soft = (v: number, lo: number, hi: number, span: number) =>
        v < lo
          ? lo - span * (1 - 1 / (((lo - v) * 0.55) / span + 1))
          : v > hi
            ? hi + span * (1 - 1 / (((v - hi) * 0.55) / span + 1))
            : v;
      fx.set(r5(soft(grab.current.x + offset.x / w, lim.x0, lim.x1, 0.08)));
      fy.set(r5(soft(grab.current.y + offset.y / h, lim.y0, lim.y1, 0.08)));
      if (motionSafe && !narrow) {
        const k = 0.9 + heavy * 1.4;
        running.current.push(
          animate(tiltY.get(), clamp(delta.x * k, -14, 14), {
            ...springs.flick,
            onUpdate: (v: number) => tiltY.set(r2(v)),
          }),
          animate(tiltX.get(), clamp(-delta.y * k, -14, 14), {
            ...springs.flick,
            onUpdate: (v: number) => tiltX.set(r2(v)),
          }),
        );
      }
    },
    onEnd: ({ velocity }) => {
      setHeld(false);
      const { w, h } = box.current;
      if (!motionSafe || w === 0 || h === 0) {
        settleAt(fx.get(), fy.get());
        return;
      }
      // A heavy glass stops sooner.
      const rate = 0.996 - heavy * 0.012;
      const px = project(fx.get() * w, narrow ? 0 : velocity.x, rate) / w;
      const py = project(fy.get() * h, velocity.y, rate) / h;
      settleAt(px, py, narrow ? 0 : velocity.x / w, velocity.y / h, true);
    },
    onCancel: () => {
      setHeld(false);
      settleAt(fx.get(), fy.get(), 0, 0, true);
    },
  });

  const surface = useDrag({
    threshold: 6,
    disabled: !usable,
    onTap: (event) => {
      const el = reportRef.current;
      if (!el) return;
      if (
        event.target instanceof Node &&
        lensRef.current?.contains(event.target)
      )
        return;
      if (
        event.target instanceof Node &&
        cardRef.current?.contains(event.target)
      )
        return;
      const r = el.getBoundingClientRect();
      settleAt(
        (event.clientX - r.left) / (r.width || 1),
        (event.clientY - r.top) / (r.height || 1),
      );
    },
  });

  const jumpTo = (id: string) => {
    const r = rects.current.find((x) => x.id === id);
    if (!r) return;
    settleAt(r.x + r.w / 2, r.y + r.h / 2);
  };

  const onLensKeyDown = (event: React.KeyboardEvent) => {
    if (!usable) return;
    const step = event.shiftKey ? 0.15 : 0.05;
    const x = fx.get();
    const y = fy.get();
    const ids = ORDER.filter((id) => rects.current.some((r) => r.id === id));
    const at = Math.max(0, ids.indexOf(regionId));
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        settleAt(x - step, y);
        return;
      case "ArrowRight":
        event.preventDefault();
        settleAt(x + step, y);
        return;
      case "ArrowUp":
        event.preventDefault();
        settleAt(x, y - step);
        return;
      case "ArrowDown":
        event.preventDefault();
        settleAt(x, y + step);
        return;
      case "PageDown":
      case "PageUp": {
        event.preventDefault();
        const next =
          ids[
            (at + (event.key === "PageDown" ? 1 : -1) + ids.length) % ids.length
          ];
        if (next) jumpTo(next);
        return;
      }
      case "Home":
        event.preventDefault();
        if (ids[0]) jumpTo(ids[0]);
        return;
      case "End":
        event.preventDefault();
        if (ids.at(-1)) jumpTo(ids.at(-1) ?? "");
        return;
      case "Enter":
        event.preventDefault();
        onUpgrade?.(region);
        return;
      case "Escape":
        // Handled here: the page behind must not close as well.
        event.preventDefault();
        dismiss();
        return;
      default:
        return;
    }
  };

  const dismiss = () => {
    if (disabled) return;
    if (dismissed === undefined) setOwnDismissed(true);
    onDismissedChange?.(true);
    onDismiss?.();
    setSaid((s) => ({ n: s.n + 1, text: "Lens put away." }));
  };

  const restore = () => {
    if (disabled) return;
    focusLens.current = true;
    if (dismissed === undefined) setOwnDismissed(false);
    onDismissedChange?.(false);
  };

  const bindLens = React.useCallback((node: HTMLButtonElement | null) => {
    lensRef.current = node;
    if (node && focusLens.current) {
      focusLens.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);

  /* ------------------------------- values ------------------------------- */

  const left = useTransform(fx, (v) => pc(v));
  const top = useTransform(fy, (v) => pc(v));
  const clip = useTransform(
    [fx, fy, radius, band] as MotionValue<number>[],
    ([x = 0, y = 0, r = 0, b = 0]: number[]) =>
      b > 0.5
        ? `inset(calc(${pc(y)} - ${r2(r)}px) 0 calc(${pc(1 - y)} - ${r2(r)}px) 0 round 12px)`
        : `circle(${r2(r)}px at ${pc(x)} ${pc(y)})`,
  );
  const shine = useTransform(tiltY, (v) => r2(-v * 0.6));
  const shineY = useTransform(tiltX, (v) => r2(v * 0.6));

  /* ------------------------------- render ------------------------------- */

  const lensView = (
    <motion.button
      ref={bindLens}
      type="button"
      aria-label={`Lens over ${region.title}. Arrow keys move it, Page keys jump between areas, Enter opens the upgrade, Escape puts it away.`}
      aria-describedby={teaserId}
      aria-disabled={!usable || undefined}
      data-tl-lens=""
      onKeyDown={onLensKeyDown}
      {...drag}
      onPointerDown={(event) => {
        // The report underneath must not see this press as its own tap.
        event.stopPropagation();
        drag.onPointerDown(event);
      }}
      className={cn(
        "absolute z-10 select-none",
        narrow
          ? "inset-x-0 cursor-ns-resize touch-pan-x rounded-3"
          : "cursor-grab touch-none rounded-full",
        held && "cursor-grabbing",
        FOCUS_RING,
      )}
      style={{
        left: narrow ? 0 : left,
        top,
        width: narrow ? "100%" : size,
        height: narrow ? bandH : size,
        x: narrow ? 0 : "-50%",
        y: "-50%",
        scale: lift,
        rotateX: tiltX,
        rotateY: tiltY,
        transformPerspective: 600,
      }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 border-[1.5px] border-[color-mix(in_oklab,var(--tl-accent)_55%,var(--hairline-strong))] transition-shadow duration-200",
          narrow ? "rounded-3" : "rounded-full",
          held
            ? "shadow-[0_18px_40px_color-mix(in_oklab,black_22%,transparent),inset_0_0_0_1px_color-mix(in_oklab,white_18%,transparent)]"
            : "shadow-[0_8px_22px_color-mix(in_oklab,black_16%,transparent),inset_0_0_0_1px_color-mix(in_oklab,white_14%,transparent)]",
        )}
      />
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-[6%] bg-[radial-gradient(circle_at_32%_26%,color-mix(in_oklab,white_34%,transparent),transparent_42%)]",
          narrow ? "rounded-2" : "rounded-full",
        )}
        style={{ x: shine, y: shineY }}
      />
      {narrow ? (
        <>
          <span
            aria-hidden
            className="absolute -top-1 left-1/2 h-2 w-10 -translate-x-1/2 rounded-full border border-hairline-strong bg-popover"
          />
          <span
            aria-hidden
            className="absolute -bottom-1 left-1/2 h-2 w-10 -translate-x-1/2 rounded-full border border-hairline-strong bg-popover"
          />
        </>
      ) : (
        <span
          aria-hidden
          className="absolute right-[9%] bottom-[9%] flex size-6 items-center justify-center rounded-full border border-hairline-strong bg-popover text-(--tl-accent) shadow-sm"
        >
          <Search className="size-3" />
        </span>
      )}
    </motion.button>
  );

  const cardView = (
    <motion.div
      ref={cardRef}
      className={cn(
        "absolute top-0 left-0 z-20 flex flex-col gap-2 rounded-3 border border-hairline-strong bg-popover p-3 shadow-[0_10px_30px_color-mix(in_oklab,black_16%,transparent)]",
        narrow ? "w-[calc(100%-16px)]" : "w-[13.5rem]",
      )}
      style={{ x: cardX, y: cardY }}
      initial={false}
      animate={{ opacity: placed ? 1 : 0 }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="grid min-w-0">
          <AnimatePresence initial={false}>
            <motion.p
              key={region.id}
              className="truncate text-[13px] font-semibold [grid-area:1/1]"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {region.title}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="inline-flex h-5 items-center rounded-full bg-[color-mix(in_oklab,var(--tl-pigment)_16%,transparent)] px-1.5 font-mono text-[10px] tracking-[0.06em] text-(--tl-accent) uppercase">
            {planName}
          </span>
          <button
            type="button"
            aria-label="Put the lens away"
            title="Put the lens away"
            onClick={dismiss}
            aria-disabled={disabled || undefined}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="grid">
        <AnimatePresence initial={false}>
          <motion.p
            key={region.id}
            id={teaserId}
            className="text-[12px] leading-snug text-ink-2 [grid-area:1/1]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            {region.teaser}
          </motion.p>
        </AnimatePresence>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!disabled) onUpgrade?.(region);
        }}
        aria-disabled={disabled || undefined}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
          FOCUS_RING,
        )}
      >
        Upgrade to {planName}
        <ArrowRight aria-hidden className="size-3.5 shrink-0" />
      </button>
    </motion.div>
  );

  const body = () => {
    if (status === "error") {
      return (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The report did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div
        ref={scrollRef}
        onScroll={() => {
          if (narrow) place();
        }}
        className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div
          ref={reportRef}
          className={cn("relative", usable && "cursor-zoom-in")}
          {...surface}
        >
          <div
            ref={baseRef}
            aria-hidden
            className="select-none"
            style={{
              filter: `blur(${clamp(blurAmount, 0, 24)}px) saturate(0.92)`,
            }}
          >
            {ready ? (
              <Report data={data} />
            ) : (
              <div aria-busy="true" className="grid gap-3 p-4">
                <p className="sr-only">Loading the report.</p>
                {[64, 120, 120, 80].map((h, i) => (
                  <div
                    key={i}
                    className="rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{ height: h }}
                  />
                ))}
              </div>
            )}
          </div>
          {ready ? (
            <motion.div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 overflow-hidden bg-card transition-opacity duration-200 select-none",
                isDismissed ? "opacity-0" : "opacity-100",
              )}
              style={{ clipPath: clip }}
            >
              <motion.div
                className="bg-card"
                style={{
                  scale: motionSafe && !narrow ? clamp(magnify, 1, 1.4) : 1,
                  originX: left,
                  originY: top,
                }}
              >
                <Report data={data} />
              </motion.div>
            </motion.div>
          ) : null}
          <AnimatePresence initial={false}>
            {ready && !isDismissed ? (
              <motion.div
                key="lens"
                className="absolute inset-0"
                style={{ pointerEvents: "none" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor() }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                <div className="pointer-events-auto">{lensView}</div>
                <div className="pointer-events-auto">{cardView}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {ready && isDismissed ? (
              <motion.div
                key="pill"
                className="pointer-events-none absolute inset-0 flex items-center-safe justify-center-safe"
                initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { y: springs.snap, opacity: { duration: durations.base } }
                    : { duration: durations.fast }
                }
              >
                <button
                  type="button"
                  onClick={restore}
                  aria-disabled={disabled || undefined}
                  className={cn(
                    "pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full border border-hairline-strong bg-popover px-4 text-[13px] text-foreground shadow-[0_8px_24px_color-mix(in_oklab,black_14%,transparent)] transition-colors hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  <Search
                    aria-hidden
                    className="size-4 shrink-0 text-(--tl-accent)"
                  />
                  <span>
                    {planName} report
                    <span className="text-ink-3"> · Look through the lens</span>
                  </span>
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          "--tl-accent": color,
          "--tl-pigment": `oklch(from ${color} 0.66 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p
            id={titleId}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <span className="truncate">{title}</span>
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[color-mix(in_oklab,var(--tl-pigment)_16%,transparent)] px-1.5 font-mono text-[10px] font-normal tracking-[0.06em] text-(--tl-accent) uppercase">
              {planName}
            </span>
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {data.workspace} · {data.period}
          </p>
        </div>
        {sample ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-hairline-strong px-2 text-[11px] text-ink-2">
            Sample report
          </span>
        ) : (
          <span className="hidden text-[11px] text-ink-3 @min-[34rem]:inline">
            Drag the lens to read an area
          </span>
        )}
      </header>
      {sample && ready ? (
        <p className="shrink-0 border-b border-hairline bg-surface-1 px-4 py-2 text-[11px] text-ink-2">
          Sample numbers. Yours appear after a week of activity in Fieldline.
        </p>
      ) : null}
      {body()}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
