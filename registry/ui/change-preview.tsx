"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type ChangePreviewTimelineStyle = "track" | "rail" | "days";
export type ChangePreviewDensity = "compact" | "cozy" | "roomy";
export type ChangePreviewAccentName = "cobalt" | "plum" | "mint" | "ink";
export type ChangePreviewStatus = "ready" | "loading" | "error";

export type ChangePlan = {
  id: string;
  name: string;
  /** Price for one billing period. */
  price: number;
  /** One line of what the plan holds. */
  blurb?: string;
};

export type ChangePeriod = {
  /** Start of the current billing period, ms since the epoch. */
  start: number;
  /** End of the period (exclusive): when the next one starts. */
  end: number;
};

/** The parts of a preview that can fail to calculate. */
export type ChangePreviewPart = "credit" | "charge" | "tax";

export type ChangeQuote = {
  plan: ChangePlan;
  kind: "upgrade" | "downgrade" | "same";
  /** When the change takes effect: today, or when the period ends. */
  timing: "now" | "period-end";
  /** The day it takes effect, ms. */
  effective: number;
  /** Back for the unused part of the current plan. */
  credit: number;
  /** For the new plan over the rest of the period. */
  charge: number;
  tax: number;
  /** What is charged today. */
  dueToday: number;
  /** Credit left over, carried to the next invoice. */
  carry: number;
  /** Days left in the period, counting today, and the period's length. */
  daysLeft: number;
  daysTotal: number;
};

type Async<T> = void | Promise<T>;

export type ChangePreviewProps = {
  /** The plan the account is on now. @default "team" */
  currentPlan?: string;
  /** The plans on offer, cheapest first. @default defaultChangePlans */
  plans?: ChangePlan[];
  /** The current billing period. @default Oct 1 – Nov 1 2026 */
  period?: ChangePeriod;
  /** The moment the preview is made, in ms. @default Oct 17 2026, 14:00 UTC */
  now?: number;
  /** Controlled chosen plan id. */
  value?: string;
  /** Initial choice when uncontrolled. @default "business" */
  defaultValue?: string;
  /**
   * Fires from the press or key that chose a plan. Return a promise to show
   * "Calculating…"; resolve it with figures to use the host's own numbers,
   * reject it to say the preview could not be made.
   */
  onPreview?: (
    plan: ChangePlan,
  ) => Async<Partial<Pick<ChangeQuote, ChangePreviewPart>> | void>;
  /** Confirm was pressed. Return a promise to hold the button; a rejection is stated. */
  onConfirm?: (plan: ChangePlan, quote: ChangeQuote) => Async<unknown>;
  /** "Keep" was pressed: the choice goes back to the current plan. */
  onCancel?: () => void;
  /** Parts the host could not calculate, with the reason for each. */
  errors?: Partial<Record<ChangePreviewPart, string>>;
  /** Tax on what is due today, as a fraction (0.08 is 8%). @default 0 */
  taxRate?: number;
  /** When a cheaper plan starts. @default "period-end" */
  downgradeAt?: "period-end" | "now";
  /** The account changing plans. @default "Fernworks" */
  account?: string;
  /** Whether the plans have arrived. @default "ready" */
  status?: ChangePreviewStatus;
  /** "Try again" was pressed after the plans failed to load. */
  onRetry?: () => void;
  /** How the billing period is drawn. @default "track" */
  timelineStyle?: ChangePreviewTimelineStyle;
  /** Padding, gaps and the plan cards' height. @default "cozy" */
  density?: ChangePreviewDensity;
  /** Selection, charge and Confirm: a named pigment or any CSS colour. @default "cobalt" */
  accent?: ChangePreviewAccentName | (string & {});
  /** How money is written. @default Intl USD */
  formatMoney?: (amount: number) => string;
  /** Plans can be compared but not changed. @default false */
  disabled?: boolean;
  /** Classes for the panel; it caps at 36rem tall and scrolls inside past that. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

export const defaultChangePlans: ChangePlan[] = [
  { id: "starter", name: "Starter", price: 19, blurb: "3 seats · 50 GB" },
  { id: "team", name: "Team", price: 49, blurb: "10 seats · 500 GB" },
  {
    id: "business",
    name: "Business",
    price: 99,
    blurb: "25 seats · 2 TB · SSO",
  },
  { id: "scale", name: "Scale", price: 249, blurb: "Any seats · 10 TB" },
];

export const defaultChangePeriod: ChangePeriod = {
  start: Date.UTC(2026, 9, 1),
  end: Date.UTC(2026, 10, 1),
};

const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14);
const NO_ERRORS: Partial<Record<ChangePreviewPart, string>> = {};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const defaultMoney = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
const cents = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const f3 = (v: number) => Number(v.toFixed(3));

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
/** "Oct 17" on a fixed UTC calendar, so server and browser agree. */
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const startOfDay = (ms: number) => Math.floor(ms / DAY) * DAY;

/**
 * What a change costs. A move up starts today: the unused part of the
 * current plan comes back as credit, the new plan is charged for the same
 * days, and the difference (plus tax) is due now. A move down waits for the
 * period's end unless `downgradeAt` says otherwise, in which case nothing is
 * due and the spare credit carries to the next invoice.
 */
export function quoteChangePreview({
  current,
  plan,
  period,
  now,
  taxRate = 0,
  downgradeAt = "period-end",
}: {
  current: ChangePlan | undefined;
  plan: ChangePlan;
  period: ChangePeriod;
  now: number;
  taxRate?: number;
  downgradeAt?: "period-end" | "now";
}): ChangeQuote {
  const daysTotal = Math.max(1, Math.round((period.end - period.start) / DAY));
  const today = clamp(startOfDay(now), period.start, period.end);
  const daysLeft = clamp(Math.round((period.end - today) / DAY), 0, daysTotal);
  const share = daysLeft / daysTotal;
  const kind: ChangeQuote["kind"] =
    !current || plan.id === current.id
      ? "same"
      : plan.price > current.price
        ? "upgrade"
        : "downgrade";
  const timing: ChangeQuote["timing"] =
    kind === "downgrade" && downgradeAt === "period-end" ? "period-end" : "now";
  const base = { plan, kind, timing, daysLeft, daysTotal };
  if (kind === "same" || timing === "period-end") {
    return {
      ...base,
      effective: kind === "same" ? today : period.end,
      credit: 0,
      charge: 0,
      tax: 0,
      dueToday: 0,
      carry: 0,
    };
  }
  const credit = cents((current?.price ?? 0) * share);
  const charge = cents(plan.price * share);
  const net = cents(charge - credit);
  const tax = net > 0 ? cents(net * taxRate) : 0;
  return {
    ...base,
    effective: today,
    credit,
    charge,
    tax,
    dueToday: Math.max(0, cents(net + tax)),
    carry: net < 0 ? cents(-net) : 0,
  };
}

/**
 * Accent as custom properties: the token for text and strokes, pigment —
 * its hue and chroma at a fixed lightness — for the charge segment, so a
 * filled bar reads the same in both themes. Credit is always success.
 */
const ACCENTS: Record<ChangePreviewAccentName, Record<string, string>> = {
  cobalt: {
    "--cp-ink": "var(--accent-bright)",
    "--cp-fill": "oklch(from var(--accent-bright) 0.62 c h)",
    "--cp-button": "var(--primary)",
    "--cp-on": "var(--primary-foreground)",
  },
  plum: {
    "--cp-ink": "oklch(from var(--accent-bright) l c 320)",
    "--cp-fill": "oklch(from var(--accent-bright) 0.6 c 320)",
    "--cp-button": "oklch(from var(--accent-bright) 0.54 c 320)",
    "--cp-on": "var(--primary-foreground)",
  },
  mint: {
    "--cp-ink": "var(--success)",
    "--cp-fill": "oklch(from var(--success) 0.7 c h)",
    "--cp-button": "oklch(from var(--success) 0.68 c h)",
    "--cp-on": "oklch(from var(--success) 0.22 0.04 h)",
  },
  ink: {
    "--cp-ink": "var(--ink-2)",
    "--cp-fill": "oklch(from var(--ink-2) 0.5 0.02 h)",
    "--cp-button": "var(--foreground)",
    "--cp-on": "var(--background)",
  },
};

const accentVars = (accent: string): React.CSSProperties => {
  const named = ACCENTS[accent as ChangePreviewAccentName];
  const vars = named ?? {
    "--cp-ink": accent,
    "--cp-fill": accent,
    "--cp-button": accent,
    "--cp-on": "var(--primary-foreground)",
  };
  return {
    ...vars,
    "--cp-wash": "color-mix(in oklab, var(--cp-ink) 12%, transparent)",
    "--cp-credit": "oklch(from var(--success) 0.72 c h)",
    "--cp-used": "color-mix(in oklab, var(--foreground) 24%, transparent)",
    "--cp-keep": "color-mix(in oklab, var(--foreground) 13%, transparent)",
    "--cp-empty": "color-mix(in oklab, var(--foreground) 5%, transparent)",
  } as React.CSSProperties;
};

const HATCH_CREDIT =
  "bg-[color-mix(in_oklab,var(--cp-credit)_22%,transparent)] bg-[repeating-linear-gradient(135deg,var(--cp-credit)_0_2px,transparent_2px_6px)]";
const HATCH_UNKNOWN =
  "bg-[repeating-linear-gradient(135deg,var(--ink-3)_0_1.5px,transparent_1.5px_5px)]";

const DENSITY: Record<
  ChangePreviewDensity,
  { pad: string; gap: string; card: string; lane: number }
> = {
  compact: { pad: "p-3.5", gap: "gap-3", card: "px-2.5 py-2", lane: 20 },
  cozy: {
    pad: "p-4 @min-[34rem]:p-5",
    gap: "gap-4",
    card: "px-3 py-2.5",
    lane: 26,
  },
  roomy: {
    pad: "p-5 @min-[34rem]:p-6",
    gap: "gap-5",
    card: "px-3.5 py-3.5",
    lane: 32,
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const EYEBROW =
  "font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase";

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/** A figure that rolls: the old one leaves upward, the new one rises in. */
function Roll({ value, motionSafe }: { value: string; motionSafe: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-grid overflow-hidden align-bottom tabular-nums"
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          className="whitespace-nowrap [grid-area:1/1]"
          initial={motionSafe ? { y: "100%", opacity: 0 } : { opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{
            ...(motionSafe ? { y: "-100%" } : {}),
            opacity: 0,
            transition: exitFor(durations.base),
          }}
          transition={
            motionSafe
              ? { y: springs.glide, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type SegmentKind = "used" | "keep" | "credit" | "charge" | "unknown" | "empty";

const SEGMENT: Record<SegmentKind, string> = {
  used: "bg-[var(--cp-used)]",
  keep: "bg-[var(--cp-keep)]",
  credit: HATCH_CREDIT,
  charge: "bg-[var(--cp-fill)]",
  unknown: HATCH_UNKNOWN,
  empty: "bg-[var(--cp-empty)]",
};

type LaneSpec = {
  label: string;
  /** Segments from the period's start: [kind, from, to, grow variable]. */
  segments: [SegmentKind, number, number, string | null][];
};

/**
 * One orientation of the timeline. Positions are fractions of the period
 * written as CSS variables by the parent's motion values, so the marker
 * slides and the segments grow without a React render per frame, and the
 * same values drive both orientations — the container decides which shows.
 */
function Timeline({
  orientation,
  lanes,
  style,
  laneSize,
  todayLabel,
  startLabel,
  endLabel,
  marker,
  todayAt,
  todayIndex,
  dayKinds,
  motionSafe,
}: {
  orientation: "horizontal" | "vertical";
  lanes: LaneSpec[];
  style: ChangePreviewTimelineStyle;
  laneSize: number;
  todayLabel: string;
  startLabel: string;
  endLabel: string;
  marker: "solid" | "dashed" | "none";
  todayAt: number;
  todayIndex: number;
  dayKinds: SegmentKind[][];
  motionSafe: boolean;
}) {
  const H = orientation === "horizontal";
  const rail = style === "rail";
  const thick = rail ? 6 : laneSize;
  const along = (from: number, to: number): React.CSSProperties =>
    H
      ? { left: `${f3(from * 100)}%`, right: `${f3((1 - to) * 100)}%` }
      : { top: `${f3(from * 100)}%`, bottom: `${f3((1 - to) * 100)}%` };
  const grow = (v: string | null): React.CSSProperties =>
    v
      ? {
          transform: H ? `scaleX(var(${v}))` : `scaleY(var(${v}))`,
          transformOrigin: H ? "left center" : "center top",
        }
      : {};

  const laneBox = (lane: LaneSpec, li: number) => {
    if (style === "days") {
      const kinds = dayKinds[li] ?? [];
      return (
        <div
          className={cn("relative flex", H ? "flex-row" : "flex-col")}
          style={
            H
              ? { height: thick, columnGap: 2 }
              : { width: Math.max(14, thick), height: "100%", rowGap: 2 }
          }
        >
          {kinds.map((kind, i) => (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-[2px] transition-[background-color,background-image] duration-300",
                SEGMENT[kind],
              )}
              style={{
                transitionDelay: motionSafe
                  ? `${Math.abs(i - todayIndex) * 14}ms`
                  : "0ms",
              }}
            />
          ))}
        </div>
      );
    }
    return (
      <div
        className={cn(
          "relative overflow-hidden",
          rail ? "rounded-full" : "rounded-2",
          rail ? "bg-[var(--cp-empty)]" : "bg-[var(--cp-empty)]",
        )}
        style={
          H ? { height: thick } : { width: Math.max(14, thick), height: "100%" }
        }
      >
        {lane.segments.map(([kind, from, to, v], si) =>
          to > from ? (
            <span
              key={`${kind}-${si}`}
              className={cn(
                "absolute",
                H ? "top-0 bottom-0" : "right-0 left-0",
                SEGMENT[kind],
              )}
              style={{ ...along(from, to), ...grow(v) }}
            />
          ) : null,
        )}
      </div>
    );
  };

  if (H) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="relative ml-[6.75rem] h-4 font-mono text-[10px] leading-4 text-ink-3 tabular-nums">
          <span className="absolute left-0">{startLabel}</span>
          {todayAt > 0.14 && todayAt < 0.86 ? (
            <span
              className="absolute -translate-x-1/2 text-ink-2"
              style={{ left: `${f3(todayAt * 100)}%` }}
            >
              {todayLabel}
            </span>
          ) : null}
          <span className="absolute right-0">{endLabel}</span>
        </div>
        <div className="relative flex flex-col gap-2">
          {lanes.map((lane, li) => (
            <div key={li} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-right text-[12px] leading-4 text-ink-2">
                {lane.label}
              </span>
              <div className="min-w-0 flex-1">{laneBox(lane, li)}</div>
            </div>
          ))}
          <div className="pointer-events-none absolute top-[-4px] right-0 bottom-[-4px] left-[6.75rem]">
            <span
              className="absolute top-0 bottom-0 border-l border-dotted border-ink-3"
              style={{ left: `${f3(todayAt * 100)}%` }}
            />
            <span
              className={cn(
                "absolute top-0 bottom-0 -ml-px border-l-2 transition-opacity duration-200",
                marker === "dashed"
                  ? "border-dashed border-foreground"
                  : "border-solid border-foreground",
                marker === "none" ? "opacity-0" : "opacity-100",
              )}
              style={{ left: "calc(var(--cp-at) * 100%)" }}
            >
              <span className="absolute -top-1 -left-[4px] size-1.5 rounded-full bg-foreground" />
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex shrink-0 flex-col">
        <span className="h-5" />
        <div className="relative h-56 w-12 font-mono text-[10px] leading-4 text-ink-3 tabular-nums">
          <span className="absolute top-0 right-0">{startLabel}</span>
          {todayAt > 0.1 && todayAt < 0.9 ? (
            <span
              className="absolute right-0 -translate-y-1/2 text-ink-2"
              style={{ top: `${f3(todayAt * 100)}%` }}
            >
              {todayLabel}
            </span>
          ) : null}
          <span className="absolute right-0 bottom-0">{endLabel}</span>
        </div>
      </div>
      <div className="relative flex min-w-0 flex-1 gap-3">
        {lanes.map((lane, li) => (
          <div key={li} className="flex min-w-0 flex-1 flex-col items-center">
            <span className="h-5 max-w-full truncate text-[11px] leading-4 text-ink-2">
              {lane.label}
            </span>
            <div className="h-56">{laneBox(lane, li)}</div>
          </div>
        ))}
        <div className="pointer-events-none absolute top-5 right-0 bottom-0 left-0">
          <span
            className="absolute right-0 left-0 border-t border-dotted border-ink-3"
            style={{ top: `${f3(todayAt * 100)}%` }}
          />
          <span
            className={cn(
              "absolute right-0 left-0 -mt-px border-t-2 transition-opacity duration-200",
              marker === "dashed"
                ? "border-dashed border-foreground"
                : "border-solid border-foreground",
              marker === "none" ? "opacity-0" : "opacity-100",
            )}
            style={{ top: "calc(var(--cp-at) * 100%)" }}
          >
            <span className="absolute -top-[4px] -left-1 size-1.5 rounded-full bg-foreground" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Phase = "idle" | "previewing" | "confirming" | "done" | "failed";

/**
 * A plan-change preview: the plans as a radio group, and beneath them the
 * current billing period drawn as a timeline — the days already used, and
 * from the change date on, what comes back and what is charged — with the
 * amount due today and what each period costs after.
 *
 * The signature is the split. Choosing a plan slides a marker to the change
 * date on `springs.snap`, one crisp overshoot as it lands; from it the
 * credit for the unused current plan and the charge for the new one grow
 * toward the period's end on `springs.glide`, the credit a beat ahead,
 * while the amount due today rolls to its new figure on glide. A cheaper
 * plan that waits for the period's end slides the marker there and draws it
 * dashed, and the current plan's lane firms back to solid. In the "days"
 * style each day takes its new colour on a tween staggered outward from the
 * marker, so the split visibly spreads. Every position is a CSS variable
 * written by a motion value: nothing re-renders per frame, and the same
 * values drive the horizontal timeline and — at phone widths, by container
 * query alone — the vertical one.
 *
 * Plans are a radiogroup (arrows move and choose, Home and End jump); the
 * timeline is a figure whose caption says the whole change in one sentence.
 * Parts the host could not calculate are drawn as an ink hatch and named in
 * words, and Confirm waits until they are known. Under reduced motion the
 * marker and segments are simply in place and the figures cross-fade.
 */
export function ChangePreview({
  currentPlan = "team",
  plans = defaultChangePlans,
  period = defaultChangePeriod,
  now = DEFAULT_NOW,
  value: valueProp,
  defaultValue = "business",
  onPreview,
  onConfirm,
  onCancel,
  errors = NO_ERRORS,
  taxRate = 0,
  downgradeAt = "period-end",
  account = "Fernworks",
  status = "ready",
  onRetry,
  timelineStyle = "track",
  density = "cozy",
  accent = "cobalt",
  formatMoney = defaultMoney,
  disabled = false,
  className,
}: ChangePreviewProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const ready = status === "ready";

  const [ownValue, setOwnValue] = React.useState(defaultValue);
  const chosenId = valueProp ?? ownValue;
  const current = plans.find((p) => p.id === currentPlan);
  const plan = plans.find((p) => p.id === chosenId) ?? current ?? plans[0];
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [hostFigures, setHostFigures] = React.useState<{
    id: string;
    figures: Partial<Pick<ChangeQuote, ChangePreviewPart>>;
  } | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  // Frozen when the change lands, so a host that then moves `currentPlan`
  // never rewrites what was just confirmed.
  const [done, setDone] = React.useState<{
    label: string;
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const attempt = React.useRef(0);

  const quoteFor = (p: ChangePlan): ChangeQuote => {
    const q = quoteChangePreview({
      current,
      plan: p,
      period,
      now,
      taxRate,
      downgradeAt,
    });
    const host = hostFigures?.id === p.id ? hostFigures.figures : null;
    if (!host) return q;
    const credit = host.credit ?? q.credit;
    const charge = host.charge ?? q.charge;
    const tax = host.tax ?? q.tax;
    const net = cents(charge - credit);
    return {
      ...q,
      credit,
      charge,
      tax,
      dueToday: Math.max(0, cents(net + tax)),
      carry: net < 0 ? cents(-net) : 0,
    };
  };
  const quote = plan ? quoteFor(plan) : null;
  const unknown = (Object.keys(errors) as ChangePreviewPart[]).filter(
    (k) => errors[k],
  );
  const blocked =
    quote !== null &&
    quote.timing === "now" &&
    quote.kind !== "same" &&
    unknown.length > 0;

  /* ------------------------------ geometry ------------------------------- */

  const total = period.end - period.start;
  const todayAt = clamp(
    (clamp(startOfDay(now), period.start, period.end) - period.start) /
      Math.max(1, total),
    0,
    1,
  );
  const targetAt = !quote
    ? todayAt
    : quote.timing === "period-end"
      ? 1
      : todayAt;
  const splits =
    quote !== null && quote.kind !== "same" && quote.timing === "now";

  const at = useMotionValue(targetAt);
  const creditGrow = useMotionValue(splits ? 1 : 0);
  const chargeGrow = useMotionValue(splits ? 1 : 0);
  const atVar = useTransform(at, (v) => f3(v));
  const creditVar = useTransform(creditGrow, (v) => f3(clamp(v, 0, 1)));
  const chargeVar = useTransform(chargeGrow, (v) => f3(clamp(v, 0, 1)));

  // The split: the marker lands on snap, then credit and charge grow from it
  // on glide, the credit a beat ahead. A re-run for the same plan (a
  // rehearsal remount, a reduced-motion switch) finishes it in place rather
  // than playing it again or leaving it half-drawn.
  const shownPlan = React.useRef(plan?.id);
  React.useEffect(() => {
    const running: AnimationPlaybackControls[] = [];
    const same = shownPlan.current === plan?.id;
    shownPlan.current = plan?.id;
    if (same || !motionSafe) {
      at.jump(targetAt);
      creditGrow.jump(splits ? 1 : 0);
      chargeGrow.jump(splits ? 1 : 0);
      return;
    }
    running.push(animate(at, targetAt, springs.snap));
    if (splits) {
      creditGrow.jump(0);
      chargeGrow.jump(0);
      running.push(
        animate(creditGrow, 1, { ...springs.glide, delay: 0.08 }),
        animate(chargeGrow, 1, { ...springs.glide, delay: 0.16 }),
      );
    } else {
      running.push(
        animate(creditGrow, 0, exitFor(durations.base)),
        animate(chargeGrow, 0, exitFor(durations.base)),
      );
    }
    return () => {
      for (const c of running) c.stop();
    };
  }, [at, chargeGrow, creditGrow, motionSafe, plan?.id, splits, targetAt]);

  /* ------------------------------- actions ------------------------------- */

  const sentence = (q: ChangeQuote) => {
    if (q.kind === "same") return `You're on ${q.plan.name}. Nothing changes.`;
    if (q.timing === "period-end")
      return `${q.plan.name} starts ${dayLabel(q.effective)} at ${formatMoney(q.plan.price)} a month. Nothing is due today; ${current?.name ?? "your plan"} continues until then.`;
    return `Switch to ${q.plan.name} today: ${formatMoney(q.credit)} credit for unused ${current?.name ?? "time"}, ${formatMoney(q.charge)} for ${plural(q.daysLeft, "day")} of ${q.plan.name}${q.tax ? `, ${formatMoney(q.tax)} tax` : ""}. ${formatMoney(q.dueToday)} due today${q.carry ? `, ${formatMoney(q.carry)} credit carried forward` : ""}, then ${formatMoney(q.plan.price)} a month from ${dayLabel(period.end)}.`;
  };

  const choose = (id: string) => {
    if (disabled || !ready) return;
    const next = plans.find((p) => p.id === id);
    if (!next || id === chosenId) return;
    if (valueProp === undefined) setOwnValue(id);
    setFailure(null);
    setPhase("idle");
    setHostFigures(null);
    setAnnouncement(
      sentence(
        quoteChangePreview({
          current,
          plan: next,
          period,
          now,
          taxRate,
          downgradeAt,
        }),
      ),
    );
    const run = ++attempt.current;
    const result = onPreview?.(next);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPhase("previewing");
      (
        result as Promise<Partial<Pick<ChangeQuote, ChangePreviewPart>> | void>
      ).then(
        (figures) => {
          if (attempt.current !== run) return;
          setPhase("idle");
          if (figures) setHostFigures({ id, figures });
        },
        (reason: unknown) => {
          if (attempt.current !== run) return;
          setPhase("failed");
          setFailure(
            reason instanceof Error && reason.message
              ? `Couldn't preview ${next.name}: ${reason.message}`
              : `Couldn't preview ${next.name}.`,
          );
        },
      );
    }
  };

  const cancel = () => {
    if (phase === "confirming") return;
    if (current && chosenId !== current.id) {
      if (valueProp === undefined) setOwnValue(current.id);
    }
    setFailure(null);
    setPhase("idle");
    onCancel?.();
    setAnnouncement(`Kept ${current?.name ?? "the current plan"}.`);
  };

  const confirm = () => {
    if (!quote || !plan || disabled || !ready) return;
    if (quote.kind === "same" || blocked || phase === "confirming") return;
    if (phase === "previewing") return;
    const run = ++attempt.current;
    const q = quote;
    setPhase("confirming");
    setFailure(null);
    setAnnouncement(`Switching to ${plan.name}.`);
    const land = () => {
      if (attempt.current !== run) return;
      const message =
        q.timing === "period-end"
          ? `${plan.name} starts ${dayLabel(q.effective)}. Nothing was charged today.`
          : `You're on ${plan.name}. ${formatMoney(q.dueToday)} was charged today.`;
      setDone({
        label:
          q.timing === "period-end"
            ? `${plan.name} scheduled`
            : `On ${plan.name}`,
        message,
      });
      setPhase("done");
      setAnnouncement(message);
    };
    const result = onConfirm?.(plan, q);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(land, (reason: unknown) => {
        if (attempt.current !== run) return;
        const message =
          reason instanceof Error && reason.message
            ? reason.message
            : "The change didn't go through.";
        setPhase("failed");
        setFailure(message);
        setAnnouncement(`Not switched. ${message}`);
      });
    } else {
      land();
    }
  };

  const radios = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % plans.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + plans.length) % plans.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = plans.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = plans[next];
    if (!target) return;
    choose(target.id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLElement>("[role=radio]")
      [next]?.focus();
  };

  /* -------------------------------- render ------------------------------- */

  const lanes: LaneSpec[] = (() => {
    if (!quote) return [];
    const curName = current?.name ?? "Current";
    const creditKind: SegmentKind = errors.credit ? "unknown" : "credit";
    const chargeKind: SegmentKind = errors.charge ? "unknown" : "charge";
    if (quote.kind === "same") {
      return [
        {
          label: curName,
          segments: [
            ["used", 0, todayAt, null],
            ["keep", todayAt, 1, null],
          ],
        },
        { label: "No change", segments: [] },
      ];
    }
    if (quote.timing === "period-end") {
      return [
        {
          label: curName,
          segments: [
            ["used", 0, todayAt, null],
            ["keep", todayAt, 1, null],
          ],
        },
        { label: `${quote.plan.name} →`, segments: [] },
      ];
    }
    return [
      {
        label: curName,
        segments: [
          ["used", 0, todayAt, null],
          ["keep", todayAt, 1, null],
          [creditKind, todayAt, 1, "--cp-cg"],
        ],
      },
      {
        label: quote.plan.name,
        segments: [[chargeKind, todayAt, 1, "--cp-hg"]],
      },
    ];
  })();

  const daysTotal = quote?.daysTotal ?? 30;
  const todayIndex = Math.round(todayAt * daysTotal);
  const dayKinds: SegmentKind[][] = (() => {
    const a: SegmentKind[] = [];
    const b: SegmentKind[] = [];
    for (let i = 0; i < daysTotal; i++) {
      const after = i >= todayIndex;
      if (!after) {
        a.push("used");
        b.push("empty");
      } else if (splits) {
        a.push(errors.credit ? "unknown" : "credit");
        b.push(errors.charge ? "unknown" : "charge");
      } else {
        a.push("keep");
        b.push("empty");
      }
    }
    return [a, b];
  })();

  const marker: "solid" | "dashed" | "none" = !quote
    ? "none"
    : quote.kind === "same"
      ? "none"
      : quote.timing === "period-end"
        ? "dashed"
        : "solid";

  const timelineProps = {
    lanes,
    style: timelineStyle,
    laneSize: d.lane,
    todayLabel: "Today",
    startLabel: dayLabel(period.start),
    endLabel: dayLabel(period.end),
    marker,
    todayAt,
    todayIndex,
    dayKinds,
    motionSafe,
  };

  const figure = (q: ChangeQuote) => {
    const rows: {
      key: string;
      swatch: SegmentKind | null;
      label: string;
      note: string;
      amount: string;
      tone?: "success";
      error?: string;
    }[] = [];
    if (q.kind === "same") {
      rows.push({
        key: "same",
        swatch: null,
        label: `You're on ${q.plan.name}`,
        note: "Choose another plan to see what changes",
        amount: `${formatMoney(q.plan.price)}/mo`,
      });
    } else if (q.timing === "period-end") {
      rows.push(
        {
          key: "keep",
          swatch: "keep",
          label: `${current?.name ?? "Current plan"} continues`,
          note: `Until ${dayLabel(period.end - DAY)}, already paid`,
          amount: formatMoney(0),
        },
        {
          key: "starts",
          swatch: "charge",
          label: `${q.plan.name} starts ${dayLabel(q.effective)}`,
          note: "On your next invoice",
          amount: `${formatMoney(q.plan.price)}/mo`,
        },
      );
    } else {
      rows.push(
        {
          key: "credit",
          swatch: errors.credit ? "unknown" : "credit",
          label: "Credit",
          note: `Unused ${current?.name ?? "plan"}, ${plural(q.daysLeft, "day")}`,
          amount: errors.credit ? "—" : `−${formatMoney(q.credit)}`,
          tone: "success",
          error: errors.credit,
        },
        {
          key: "charge",
          swatch: errors.charge ? "unknown" : "charge",
          label: "Charge",
          note: `${q.plan.name}, ${plural(q.daysLeft, "day")}`,
          amount: errors.charge ? "—" : `+${formatMoney(q.charge)}`,
          error: errors.charge,
        },
      );
      if (taxRate > 0 || errors.tax) {
        rows.push({
          key: "tax",
          swatch: null,
          label: "Tax",
          note: `${Number((taxRate * 100).toFixed(2))}% of the difference`,
          amount: errors.tax ? "—" : `+${formatMoney(q.tax)}`,
          error: errors.tax,
        });
      }
    }
    return rows;
  };

  const confirmLabel = !quote
    ? "Choose a plan"
    : phase === "confirming"
      ? "Switching…"
      : phase === "done" && done
        ? done.label
        : quote.kind === "same"
          ? "No change"
          : quote.timing === "period-end"
            ? `Schedule ${quote.plan.name} for ${dayLabel(quote.effective)}`
            : `Switch to ${quote.plan.name} · ${formatMoney(quote.dueToday)} today`;
  const confirmOff =
    disabled ||
    !ready ||
    !quote ||
    quote.kind === "same" ||
    blocked ||
    phase === "previewing" ||
    phase === "done";

  const planCards = (
    <div
      role="radiogroup"
      aria-label="Plans"
      className="grid grid-cols-2 gap-x-2 gap-y-3 @min-[34rem]:grid-cols-[repeat(var(--cp-cols),minmax(0,1fr))]"
      style={{ "--cp-cols": Math.max(1, plans.length) } as React.CSSProperties}
    >
      {plans.map((p, i) => {
        const checked = p.id === plan?.id;
        const isCurrent = p.id === currentPlan;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${p.name}, ${formatMoney(p.price)} a month${p.blurb ? `, ${p.blurb}` : ""}${isCurrent ? ", current plan" : ""}`}
            aria-disabled={disabled || undefined}
            tabIndex={checked ? 0 : -1}
            onClick={() => choose(p.id)}
            onKeyDown={(event) => radios(event, i)}
            className={cn(
              "relative flex min-w-0 flex-col items-start gap-0.5 rounded-3 border text-left transition-colors",
              d.card,
              FOCUS,
              checked
                ? "border-transparent"
                : "border-hairline bg-card hover:border-hairline-strong",
            )}
          >
            {isCurrent ? (
              <span className="absolute -top-2 right-2 z-10 rounded-full border border-hairline-strong bg-card px-1.5 font-mono text-[9px] leading-[14px] tracking-[0.06em] text-ink-2 uppercase">
                Current
              </span>
            ) : null}
            {checked ? (
              <motion.span
                layoutId={`${uid}-plan`}
                aria-hidden
                className="absolute -inset-px rounded-[inherit] border-2 border-[var(--cp-ink)] bg-[var(--cp-wash)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative flex w-full items-center justify-between gap-2">
              <span className="truncate text-[13px] leading-5 font-medium text-foreground">
                {p.name}
              </span>
            </span>
            <span className="relative font-mono text-[14px] leading-5 text-foreground tabular-nums">
              {formatMoney(p.price)}
              <span className="text-[11px] text-ink-3">/mo</span>
            </span>
            {p.blurb ? (
              <span
                title={p.blurb}
                className="relative w-full truncate text-[11px] leading-4 text-ink-3"
              >
                {p.blurb}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const body = (() => {
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-2 rounded-3 border border-hairline px-4 py-6 text-center">
          <TriangleAlert aria-hidden className="size-4 text-danger" />
          <p className="text-[13px] leading-5 text-foreground">
            The plans didn&apos;t load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (status === "loading" || !quote) {
      return (
        <div aria-busy="true" className={cn("flex flex-col", d.gap)}>
          <span className="sr-only">Loading plans.</span>
          <div className="grid grid-cols-2 gap-2 @min-[34rem]:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                aria-hidden
                className="h-[4.5rem] rounded-3 bg-surface-2 motion-safe:animate-pulse"
              />
            ))}
          </div>
          <span
            aria-hidden
            className="h-24 rounded-3 bg-surface-2 motion-safe:animate-pulse"
          />
        </div>
      );
    }
    const rows = figure(quote);
    const unknownTotal = blocked;
    return (
      <div className={cn("flex flex-col", d.gap)}>
        {planCards}

        <motion.figure
          className={cn(
            "flex flex-col gap-3 rounded-3 border border-hairline bg-card p-3 transition-opacity duration-200 @min-[34rem]:p-4",
            phase === "previewing" && "opacity-60",
          )}
          style={
            {
              "--cp-at": atVar,
              "--cp-cg": creditVar,
              "--cp-hg": chargeVar,
            } as unknown as React.CSSProperties
          }
          aria-labelledby={`${uid}-cap`}
        >
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className={EYEBROW}>
              Billing period · {dayLabel(period.start)} –{" "}
              {dayLabel(period.end - DAY)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] leading-4 text-ink-2">
              <CalendarClock aria-hidden className="size-3.5 shrink-0" />
              {phase === "previewing"
                ? "Calculating…"
                : quote.kind === "same"
                  ? "No change"
                  : quote.timing === "period-end"
                    ? `Changes ${dayLabel(quote.effective)}`
                    : "Changes today"}
            </span>
            <span id={`${uid}-cap`} className="sr-only">
              {sentence(quote)}
            </span>
          </figcaption>
          <div aria-hidden>
            <div className="@min-[34rem]:hidden">
              <Timeline orientation="vertical" {...timelineProps} />
            </div>
            <div className="hidden @min-[34rem]:block">
              <Timeline orientation="horizontal" {...timelineProps} />
            </div>
          </div>
        </motion.figure>

        <div className="flex flex-col gap-3 @min-[34rem]:flex-row @min-[34rem]:items-end @min-[34rem]:justify-between @min-[34rem]:gap-6">
          <dl className="flex min-w-0 flex-1 flex-col gap-1.5">
            {rows.map((r) => (
              <div
                key={r.key}
                className="flex items-start justify-between gap-3"
              >
                <dt className="flex min-w-0 items-start gap-2">
                  {r.swatch ? (
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1 size-3 shrink-0 rounded-[3px]",
                        SEGMENT[r.swatch],
                      )}
                    />
                  ) : (
                    <span aria-hidden className="size-3 shrink-0" />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[12px] leading-5 text-foreground">
                      {r.label}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] leading-4",
                        r.error ? "text-warn" : "text-ink-3",
                      )}
                    >
                      {r.error ?? r.note}
                    </span>
                  </span>
                </dt>
                <dd
                  className={cn(
                    "shrink-0 font-mono text-[12px] leading-5 tabular-nums",
                    r.tone === "success" && !r.error
                      ? "text-success"
                      : "text-foreground",
                  )}
                >
                  {r.amount}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex shrink-0 flex-col gap-0.5 border-t border-hairline pt-3 @min-[34rem]:items-end @min-[34rem]:border-t-0 @min-[34rem]:pt-0 @min-[34rem]:text-right">
            <p className={EYEBROW}>Due today</p>
            <p className="font-mono text-[26px] leading-8 font-medium text-foreground tabular-nums">
              {unknownTotal ? (
                <span className="text-[15px] text-ink-2">
                  Can&apos;t total yet
                </span>
              ) : (
                <>
                  <span className="sr-only">{formatMoney(quote.dueToday)}</span>
                  <Roll
                    value={formatMoney(quote.dueToday)}
                    motionSafe={motionSafe}
                  />
                </>
              )}
            </p>
            <p className="text-[11px] leading-4 text-ink-3">
              {quote.kind === "same"
                ? "Nothing changes today"
                : quote.carry > 0
                  ? `${formatMoney(quote.carry)} credit carries to ${dayLabel(period.end)}`
                  : `Then ${formatMoney(quote.plan.price)} a month from ${dayLabel(period.end)}`}
            </p>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {failure || phase === "done" ? (
            <motion.div
              key={phase === "done" ? "done" : "failure"}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{
                opacity: 0,
                height: 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: 0 }
              }
              className="overflow-hidden"
            >
              {phase === "done" ? (
                <p className="flex items-center gap-2 rounded-2 bg-[color-mix(in_oklab,var(--success)_11%,transparent)] px-3 py-2 text-[12px] leading-4 text-foreground">
                  <Check
                    aria-hidden
                    className="size-3.5 shrink-0 text-success"
                  />
                  {done?.message}
                </p>
              ) : (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-2 bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-3 py-2 text-[12px] leading-4 text-danger"
                >
                  <TriangleAlert
                    aria-hidden
                    className="mt-px size-3.5 shrink-0"
                  />
                  {failure}
                </p>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {blocked ? (
          <p className="text-[11px] leading-4 text-ink-3">
            Confirm waits until the{" "}
            {unknown.length === 1
              ? unknown[0]
              : `${unknown.slice(0, -1).join(", ")} and ${unknown[unknown.length - 1] ?? ""}`}{" "}
            can be worked out.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {quote.kind !== "same" && phase !== "done" ? (
            <button
              type="button"
              onClick={cancel}
              aria-disabled={phase === "confirming" || undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-2 border border-hairline px-3 text-[13px] text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              Keep {current?.name ?? "current plan"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={confirm}
            aria-disabled={confirmOff || undefined}
            aria-busy={phase === "confirming" || undefined}
            className={cn(
              "inline-flex h-9 max-w-full items-center gap-1.5 rounded-2 px-3.5 text-[13px] font-medium transition-[background-color,opacity,translate] active:translate-y-px",
              FOCUS,
              confirmOff && phase !== "done"
                ? "border border-hairline bg-surface-1 text-ink-3"
                : phase === "done"
                  ? "border border-hairline bg-surface-1 text-foreground"
                  : "bg-[var(--cp-button)] text-[var(--cp-on)] hover:opacity-90",
            )}
          >
            {phase === "done" ? (
              <Check aria-hidden className="size-3.5 shrink-0 text-success" />
            ) : null}
            <span className="truncate tabular-nums">{confirmLabel}</span>
            {!confirmOff && phase === "idle" ? (
              <ArrowRight aria-hidden className="size-3.5 shrink-0" />
            ) : null}
          </button>
        </div>
      </div>
    );
  })();

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container flex max-h-[36rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className={cn("flex flex-col", d.pad, d.gap)}>
          <header className="flex flex-col gap-0.5">
            <h2 id={titleId} className="text-[15px] leading-5 font-semibold">
              Change plan
            </h2>
            <p className="text-[12px] leading-4 text-ink-3">
              {account} · on {current?.name ?? "no plan"} · billed monthly
            </p>
          </header>
          {body}
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
