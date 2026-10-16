"use client";

import * as React from "react";

import { AnimatePresence, motion, useInView } from "motion/react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CirclePause,
  CircleSlash,
  HardDrive,
  History,
  LayoutGrid,
  Plug,
  RotateCcw,
  TriangleAlert,
  Users,
  Zap,
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

export type PauseInsteadStep = "reason" | "losses" | "decide" | "done";
export type PauseInsteadOutcome =
  "kept" | "paused" | "downgraded" | "cancelled";
export type PauseInsteadListStyle = "switch" | "strike" | "tiles";
export type PauseInsteadDensity = "compact" | "cozy" | "roomy";
export type PauseInsteadTone = "calm" | "warm" | "mono";
export type PauseInsteadStatus = "ready" | "loading" | "error";
export type PauseInsteadIcon =
  "boards" | "history" | "integrations" | "seats" | "automations" | "storage";

export type PauseInsteadPlan = {
  id: string;
  /** The product, shown small above the heading. */
  product: string;
  /** The plan being cancelled: "Team". */
  name: string;
  /** Price per seat for one billing cycle. */
  price: number;
  seats: number;
  cycle: "month" | "year";
  /** When the paid period ends, in ms since the epoch. Nothing stops before it. */
  renewsAt: number;
  /** ISO currency code. @default "USD" */
  currency?: string;
};

/** Something that switches off when the plan ends. */
export type PauseInsteadLoss = {
  id: string;
  label: string;
  /** One line of consequence: "14 boards go read-only for 8 members". */
  detail: string;
  /** A short figure for the tiles style: "14", "2.3 y". */
  figure?: string;
  icon?: PauseInsteadIcon;
};

export type PauseInsteadKeep = { id: string; label: string };
export type PauseInsteadReason = { id: string; label: string };

export type PauseInsteadOffers = {
  /** Offer a pause of one of these lengths, in months. */
  pause?: { months: number[]; defaultMonths?: number };
  /** Offer a cheaper plan instead. */
  downgrade?: { plan: string; price: string; keeps: string };
};

export type PauseInsteadDetails = {
  /** The reason id chosen on the first step, or null. */
  reason: string | null;
  /** Anything typed in the optional note. */
  note: string;
};
export type PauseInsteadPauseDetails = PauseInsteadDetails & {
  months: number;
  /** When billing starts again, in ms. */
  resumesAt: number;
};
export type PauseInsteadDowngradeDetails = PauseInsteadDetails & {
  plan: string;
};

type Async = void | Promise<unknown>;

export type PauseInsteadProps = {
  /** The plan being cancelled. @default defaultPauseInsteadPlan */
  plan?: PauseInsteadPlan;
  /** What switches off when the plan ends, in the order it goes. @default defaultPauseInsteadUsage */
  usage?: PauseInsteadLoss[];
  /** What stays whatever is chosen. @default defaultPauseInsteadKeeps */
  keeps?: PauseInsteadKeep[];
  /** The reasons offered on the first step. @default defaultPauseInsteadReasons */
  reasons?: PauseInsteadReason[];
  /** The pause and downgrade offered instead. Omit one to leave it out. @default defaultPauseInsteadOffers */
  offers?: PauseInsteadOffers;
  /** The moment "days left" counts from, in ms. @default 23 days before plan.renewsAt */
  now?: number;
  /** Controlled step. */
  step?: PauseInsteadStep;
  /** Initial step when uncontrolled. @default "reason" */
  defaultStep?: PauseInsteadStep;
  /** Fires from the button that moved the flow, with the new step. */
  onStepChange?: (step: PauseInsteadStep) => void;
  /** Cancel was confirmed. Return a promise to hold the button; a rejection keeps the step with its message. */
  onCancel?: (details: PauseInsteadDetails) => Async;
  /** A pause was chosen, with its length and the date billing resumes. */
  onPause?: (details: PauseInsteadPauseDetails) => Async;
  /** The cheaper plan was chosen. */
  onDowngrade?: (details: PauseInsteadDowngradeDetails) => Async;
  /** The flow was left: Keep my plan, or Done after an outcome. */
  onExit?: (outcome: PauseInsteadOutcome) => void;
  /** Whether the plan's data has arrived. @default "ready" */
  status?: PauseInsteadStatus;
  /** "Try again" was pressed after the plan failed to load. */
  onRetry?: () => void;
  /** How the losses are drawn: rows with a switch that flips off, rows struck through, or figure tiles that drain. @default "switch" */
  listStyle?: PauseInsteadListStyle;
  /** Padding, gaps and type size. @default "cozy" */
  density?: PauseInsteadDensity;
  /** The offer's wash, the primary fill and the step pill: cobalt, amber or ink. @default "calm" */
  tone?: PauseInsteadTone;
  /** Milliseconds between one loss switching off and the next; the run never passes 600ms. @default 150 */
  dimInterval?: number;
  /** How a date is written. @default "12 Nov 2026", in UTC */
  formatDate?: (ms: number) => string;
  /** How a price is written. @default Intl currency, no cents when whole */
  formatMoney?: (amount: number, currency: string) => string;
  /** The surface's height cap in px; the steps scroll inside it. @default 560 */
  maxHeight?: number;
  /** Every action is unavailable; the steps can still be read. @default false */
  disabled?: boolean;
  /** Classes for the surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** A Fieldline workspace on Team, paid through 12 November. */
export const defaultPauseInsteadPlan: PauseInsteadPlan = {
  id: "team",
  product: "Fieldline",
  name: "Team",
  price: 12,
  seats: 8,
  cycle: "month",
  renewsAt: Date.UTC(2026, 10, 12),
  currency: "USD",
};

export const defaultPauseInsteadUsage: PauseInsteadLoss[] = [
  {
    id: "boards",
    label: "Shared boards",
    detail: "14 boards go read-only for 8 members",
    figure: "14",
    icon: "boards",
  },
  {
    id: "history",
    label: "History beyond 30 days",
    detail: "2.3 years of edits are archived",
    figure: "2.3 y",
    icon: "history",
  },
  {
    id: "integrations",
    label: "9 integrations",
    detail: "Syncs stop; nothing is deleted",
    figure: "9",
    icon: "integrations",
  },
];

export const defaultPauseInsteadKeeps: PauseInsteadKeep[] = [
  { id: "read", label: "Every board stays readable" },
  { id: "export", label: "Export everything, any time" },
  { id: "members", label: "Members keep their accounts" },
];

export const defaultPauseInsteadReasons: PauseInsteadReason[] = [
  { id: "cost", label: "It costs too much" },
  { id: "use", label: "We don't use it enough" },
  { id: "feature", label: "A feature is missing" },
  { id: "moving", label: "We're moving to another tool" },
  { id: "other", label: "Something else" },
];

export const defaultPauseInsteadOffers: PauseInsteadOffers = {
  pause: { months: [1, 2, 3], defaultMonths: 2 },
  downgrade: {
    plan: "Free",
    price: "$0",
    keeps: "3 boards and 30 days of history",
  },
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

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

/** Fixed UTC dates: a locale lookup in render would not survive hydration. */
const utcDate = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

/** Calendar months, clamped to the target month's last day (31 Jan + 1 → 28 Feb). */
const addMonths = (ms: number, n: number): number => {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last));
};

const defaultMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const ICONS: Record<PauseInsteadIcon, typeof LayoutGrid> = {
  boards: LayoutGrid,
  history: History,
  integrations: Plug,
  seats: Users,
  automations: Zap,
  storage: HardDrive,
};

const STEPS: { id: Exclude<PauseInsteadStep, "done">; label: string }[] = [
  { id: "reason", label: "Reason" },
  { id: "losses", label: "What changes" },
  { id: "decide", label: "Decide" },
];
const ORDER: PauseInsteadStep[] = ["reason", "losses", "decide", "done"];

/**
 * Tone as four custom properties: an ink for strokes and small text, a fill
 * and the ink that sits on it, and a wash. The warm fill is pigment — the
 * warn hue at a fixed lightness — because the warn token is tuned for text
 * and reads as mud when it fills a button on a light page.
 */
const TONE: Record<PauseInsteadTone, Record<string, string>> = {
  calm: {
    "--pi-ink": "var(--accent-bright)",
    "--pi-fill": "var(--primary)",
    "--pi-on": "var(--primary-foreground)",
    "--pi-wash": "color-mix(in oklab, var(--accent-bright) 9%, transparent)",
  },
  warm: {
    "--pi-ink": "var(--warn)",
    "--pi-fill": "oklch(from var(--warn) 0.8 0.13 h)",
    "--pi-on": "oklch(from var(--warn) 0.26 0.05 h)",
    "--pi-wash": "color-mix(in oklab, var(--warn) 11%, transparent)",
  },
  mono: {
    "--pi-ink": "var(--ink-2)",
    "--pi-fill": "var(--foreground)",
    "--pi-on": "var(--background)",
    "--pi-wash": "color-mix(in oklab, var(--ink) 5%, transparent)",
  },
};

const DENSITY: Record<
  PauseInsteadDensity,
  {
    pad: string;
    body: string;
    gap: string;
    row: string;
    text: string;
    meta: string;
  }
> = {
  compact: {
    pad: "px-4",
    body: "py-3",
    gap: "gap-3",
    row: "py-2",
    text: "text-[13px] leading-5",
    meta: "text-[11px] leading-4",
  },
  cozy: {
    pad: "px-5",
    body: "py-4",
    gap: "gap-4",
    row: "py-2.5",
    text: "text-[13px] leading-5",
    meta: "text-[12px] leading-4",
  },
  roomy: {
    pad: "px-6",
    body: "py-5",
    gap: "gap-5",
    row: "py-3",
    text: "text-[14px] leading-5",
    meta: "text-[12px] leading-[18px]",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const BUTTON =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3.5 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,opacity,translate] active:translate-y-px";
const PRIMARY = cn(
  BUTTON,
  "bg-[var(--pi-fill)] text-[var(--pi-on)] hover:bg-[color-mix(in_oklab,var(--pi-fill)_88%,var(--foreground))]",
);
const SECONDARY = cn(
  BUTTON,
  "border border-input bg-surface-1 text-foreground hover:bg-surface-2",
);
const GHOST = cn(
  BUTTON,
  "px-2.5 text-ink-2 hover:bg-surface-2 hover:text-foreground",
);
const EYEBROW =
  "font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase";

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/** A check whose stroke sweeps in on flick rather than popping. */
function Tick({
  motionSafe,
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      <motion.path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: motionSafe ? 0 : 1 }}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

/**
 * A value that rolls when it changes: the old one leaves upward on the exit
 * ease while the new one rises in on glide. Both sit in one grid cell, so
 * quick changes stack and cross rather than queueing behind each other.
 */
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

/**
 * A box whose height follows its content on glide. The inner node is
 * measured by a ResizeObserver bound when it arrives; the step leaving
 * through popLayout is taken out of flow, so the height heads straight for
 * the new step's.
 */
function Measured({
  motionSafe,
  children,
}: {
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const read = () => setHeight(Math.round(node.offsetHeight));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      className="overflow-hidden"
      initial={false}
      animate={{ height: height ?? "auto" }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      <div ref={setNode} className="relative">
        {children}
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               A loss, drawn                              */
/* ----------------------------------------------------------------------- */

function LossItem({
  loss,
  off,
  endsOn,
  listStyle,
  d,
  motionSafe,
}: {
  loss: PauseInsteadLoss;
  off: boolean;
  endsOn: string;
  listStyle: PauseInsteadListStyle;
  d: (typeof DENSITY)[PauseInsteadDensity];
  motionSafe: boolean;
}) {
  const Icon = ICONS[loss.icon ?? "boards"] ?? LayoutGrid;
  const spoken = `${loss.label}: ${loss.detail}.${off ? ` Switches off on ${endsOn}.` : ""}`;
  const ink = cn(
    "transition-colors duration-300",
    off ? "text-ink-3" : "text-foreground",
  );
  const offTag = (
    <motion.span
      aria-hidden
      className="inline-flex h-5 shrink-0 items-center rounded-full bg-surface-2 px-1.5 font-mono text-[10px] tracking-[0.04em] text-ink-2"
      initial={{ opacity: 0, x: motionSafe ? -distances.nudge : 0 }}
      animate={{ opacity: 1, x: 0 }}
      transition={
        motionSafe
          ? { x: springs.snap, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      Off
    </motion.span>
  );

  if (listStyle === "tiles") {
    return (
      <li className="relative flex flex-col gap-1 overflow-hidden rounded-3 border border-hairline bg-surface-1 px-3 pt-3 pb-2.5">
        <span className="sr-only">{spoken}</span>
        {/* The live bar drains toward the end of the period, on glide. */}
        <motion.span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-[var(--pi-ink)]"
          initial={false}
          animate={{ scaleX: off ? 0 : 1, opacity: off ? 0.4 : 1 }}
          transition={motionSafe ? springs.glide : { duration: durations.fast }}
          style={{ originX: 1 }}
        />
        <span aria-hidden className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "font-mono text-lg leading-6 font-medium tabular-nums",
              ink,
            )}
          >
            {loss.figure ?? "—"}
          </span>
          {off ? offTag : null}
        </span>
        <span aria-hidden className={cn(d.meta, "font-medium", ink)}>
          {loss.label}
        </span>
        <span aria-hidden className={cn(d.meta, "text-ink-3")}>
          {loss.detail}
        </span>
      </li>
    );
  }

  return (
    <li className={cn("flex items-center gap-3 px-3", d.row)}>
      <span className="sr-only">{spoken}</span>
      <span
        aria-hidden
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-2 transition-colors duration-300",
          off
            ? "bg-surface-2 text-ink-3"
            : "bg-[var(--pi-wash)] text-[var(--pi-ink)]",
        )}
      >
        <Icon className="size-4" />
        {listStyle === "strike" ? (
          <motion.span
            className="absolute top-1/2 left-1.5 h-[1.5px] w-5 -rotate-45 rounded-full bg-current"
            initial={false}
            animate={{ scaleX: off ? 1 : 0 }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            style={{ originX: 0 }}
          />
        ) : null}
      </span>
      <span aria-hidden className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span
            title={listStyle === "strike" ? loss.label : undefined}
            className={cn(
              "relative min-w-0",
              listStyle === "strike" && "truncate",
              d.text,
              ink,
            )}
          >
            {loss.label}
            {listStyle === "strike" ? (
              <motion.span
                className="absolute inset-x-0 top-1/2 h-px bg-current"
                initial={false}
                animate={{ scaleX: off ? 1 : 0 }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                style={{ originX: 0 }}
              />
            ) : null}
          </span>
          {off && listStyle === "strike" ? (
            <span className="hidden @min-[26rem]:inline-flex">{offTag}</span>
          ) : null}
        </span>
        <span className={cn("text-ink-3", d.meta)}>{loss.detail}</span>
      </span>
      {listStyle === "switch" ? (
        <span aria-hidden className="flex shrink-0 items-center gap-2">
          {off ? (
            <span className="hidden @min-[26rem]:inline-flex">{offTag}</span>
          ) : null}
          <span
            className={cn(
              "relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200",
              off
                ? "bg-surface-2 ring-1 ring-hairline-strong ring-inset"
                : "bg-[var(--pi-fill)]",
            )}
          >
            <motion.span
              className={cn(
                "absolute left-0.5 size-3 rounded-full shadow-sm transition-colors duration-200",
                off ? "bg-ink-3" : "bg-[var(--pi-on)]",
              )}
              initial={false}
              animate={{ x: off ? 0 : 12 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
        </span>
      ) : null}
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Decision = "pause" | "downgrade" | "cancel";

/**
 * A cancellation flow that shows its consequences before it asks for the
 * decision. Three steps — the reason, what changes, the choice — in a step
 * bar whose pill slides between stops on `springs.snap` while each step
 * cross-slides 8px on `springs.glide` inside a box that glides to the new
 * step's measured height.
 *
 * The signature is the switch-off. When "What changes" comes into view the
 * losses go off one at a time, top to bottom, inside the 600ms budget: the
 * row's ink fades and its marker turns off — a mini switch whose knob slides
 * across on snap, a strike that sweeps the label on glide, or a tile whose
 * live bar drains on glide — and each row is tagged with the date it goes.
 * A beat after the last, the pause offer slides up 16px beneath on glide
 * with the date the plan would resume, which rolls as the length changes.
 *
 * The confirmation is plain and never hidden: the last step names what
 * cancelling does in one sentence and lists Pause, the cheaper plan and
 * Cancel as three equal buttons. Reasons and pause lengths are radiogroups
 * (arrows move and select, Home and End jump); a step change moves focus to
 * the new step's heading. Under reduced motion nothing travels, but the
 * losses still go off one at a time — that order is the information.
 */
export function PauseInstead({
  plan = defaultPauseInsteadPlan,
  usage = defaultPauseInsteadUsage,
  keeps = defaultPauseInsteadKeeps,
  reasons = defaultPauseInsteadReasons,
  offers = defaultPauseInsteadOffers,
  now,
  step: stepProp,
  defaultStep = "reason",
  onStepChange,
  onCancel,
  onPause,
  onDowngrade,
  onExit,
  status = "ready",
  onRetry,
  listStyle = "switch",
  density = "cozy",
  tone = "calm",
  dimInterval = 150,
  formatDate = utcDate,
  formatMoney = defaultMoney,
  maxHeight = 560,
  disabled = false,
  className,
}: PauseInsteadProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;
  const ready = status === "ready";

  const [ownStep, setOwnStep] = React.useState<PauseInsteadStep>(defaultStep);
  const current = stepProp ?? ownStep;
  const index = ORDER.indexOf(current);

  const [reason, setReason] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [needReason, setNeedReason] = React.useState(false);
  const pauseMonths = offers.pause?.months ?? [];
  const [months, setMonths] = React.useState(
    offers.pause?.defaultMonths ?? pauseMonths[0] ?? 1,
  );
  const [dimmed, setDimmed] = React.useState(0);
  const [offerShown, setOfferShown] = React.useState(false);
  const [pending, setPending] = React.useState<Decision | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<PauseInsteadOutcome | null>(
    null,
  );
  const [announcement, setAnnouncement] = React.useState("");
  const [direction, setDirection] = React.useState(1);
  const attempt = React.useRef(0);

  // Arriving at "What changes" from the reason step replays the switch-off;
  // coming back from the decision keeps everything already off. Decided in
  // render as the step flips, so a host-driven step behaves the same.
  const [seenStep, setSeenStep] = React.useState(current);
  if (seenStep !== current) {
    setSeenStep(current);
    setDirection(ORDER.indexOf(current) >= ORDER.indexOf(seenStep) ? 1 : -1);
    if (current === "losses" && seenStep === "reason") {
      setDimmed(0);
      setOfferShown(false);
    }
    if (current !== "done") setFailure(null);
  }

  const rootRef = React.useRef<HTMLElement | null>(null);
  const inView = useInView(rootRef, { amount: 0.25 });

  const endsOn = formatDate(plan.renewsAt);
  const resumesAt = addMonths(plan.renewsAt, months);
  const resumesOn = formatDate(resumesAt);
  const currency = plan.currency ?? "USD";
  const nowMs = now ?? plan.renewsAt - 23 * DAY;
  const daysLeft = Math.max(0, Math.ceil((plan.renewsAt - nowMs) / DAY));
  const losses = usage;
  const allOff = dimmed >= losses.length;
  const lossStep = Math.min(
    Math.max(40, dimInterval),
    Math.floor(600 / Math.max(1, losses.length)),
  );

  // The switch-off: one loss at a time, each timer scheduling the next, so a
  // StrictMode rehearsal (or leaving the view) cancels cleanly and resumes
  // from wherever the count had reached.
  React.useEffect(() => {
    if (current !== "losses" || !ready || !inView) return;
    if (allOff) {
      if (offerShown) return;
      const t = window.setTimeout(() => {
        setOfferShown(true);
        const pause = offers.pause
          ? ` Pause instead and it resumes on ${resumesOn}.`
          : "";
        setAnnouncement(
          `${plural(losses.length, "thing switches", "things switch")} off on ${endsOn}.${pause}`,
        );
      }, 240);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(
      () => setDimmed((n) => Math.min(losses.length, n + 1)),
      dimmed === 0 ? 360 : lossStep,
    );
    return () => window.clearTimeout(t);
  }, [
    current,
    ready,
    inView,
    allOff,
    offerShown,
    dimmed,
    lossStep,
    losses.length,
    endsOn,
    resumesOn,
    offers.pause,
  ]);

  // Focus follows a step change made from inside the flow, bound to the new
  // heading when it arrives rather than fired on a guessed frame.
  const focusPending = React.useRef(false);
  const [heading, setHeading] = React.useState<HTMLElement | null>(null);
  const bindHeading = React.useCallback((node: HTMLElement | null) => {
    if (node) setHeading(node);
  }, []);
  React.useEffect(() => {
    if (!heading || !focusPending.current || !heading.isConnected) return;
    focusPending.current = false;
    heading.focus({ preventScroll: true });
  }, [heading]);

  const go = (next: PauseInsteadStep) => {
    if (next === current) return;
    focusPending.current = true;
    if (stepProp === undefined) setOwnStep(next);
    onStepChange?.(next);
    const n = ORDER.indexOf(next);
    if (next === "losses")
      setAnnouncement(`Step 2 of 3: what changes on ${endsOn}.`);
    else if (next !== "done") setAnnouncement(`Step ${n + 1} of 3.`);
  };

  const details = (): PauseInsteadDetails => ({ reason, note: note.trim() });

  const decide = (kind: Decision) => {
    if (disabled || pending || !ready) return;
    const run = ++attempt.current;
    setPending(kind);
    setFailure(null);
    const result =
      kind === "pause"
        ? onPause?.({ ...details(), months, resumesAt })
        : kind === "downgrade"
          ? onDowngrade?.({
              ...details(),
              plan: offers.downgrade?.plan ?? "",
            })
          : onCancel?.(details());
    const land = () => {
      if (attempt.current !== run) return;
      const out: PauseInsteadOutcome =
        kind === "pause"
          ? "paused"
          : kind === "downgrade"
            ? "downgraded"
            : "cancelled";
      setPending(null);
      setOutcome(out);
      setAnnouncement(
        out === "paused"
          ? `Paused. ${plan.name} resumes on ${resumesOn}.`
          : out === "downgraded"
            ? `Switched to ${offers.downgrade?.plan ?? "the cheaper plan"} from ${endsOn}.`
            : `${plan.name} is cancelled. It ends on ${endsOn}.`,
      );
      go("done");
    };
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(land, (reason: unknown) => {
        if (attempt.current !== run) return;
        const message =
          reason instanceof Error && reason.message
            ? reason.message
            : "That didn't go through. Nothing has changed.";
        setPending(null);
        setFailure(message);
        setAnnouncement(message);
      });
    } else {
      land();
    }
  };

  const keep = () => {
    if (pending) return;
    setAnnouncement(`Kept ${plan.name}.`);
    onExit?.("kept");
  };

  const toContinue = () => {
    if (!reason) {
      setNeedReason(true);
      const radios = rootRef.current?.querySelectorAll<HTMLElement>(
        `[data-pi-reason="${uid}"]`,
      );
      radios?.[0]?.focus();
      setAnnouncement("Choose a reason to continue.");
      return;
    }
    go("losses");
  };

  /* ----------------------------- radiogroups ----------------------------- */

  const radioKeys = (
    event: React.KeyboardEvent,
    ids: string[],
    at: number,
    choose: (i: number) => void,
    selector: string,
  ) => {
    let next = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = (at + 1) % ids.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = (at - 1 + ids.length) % ids.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      choose(at);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    choose(next);
    const nodes = rootRef.current?.querySelectorAll<HTMLElement>(selector);
    nodes?.[next]?.focus();
  };

  /* -------------------------------- steps -------------------------------- */

  const headingClass = cn(
    "text-[15px] leading-5 font-semibold text-foreground outline-none",
  );

  const reasonStep = (
    <div className={cn("flex flex-col", d.gap)}>
      <div className="flex flex-col gap-1">
        <h3
          ref={current === "reason" ? bindHeading : undefined}
          id={`${uid}-reason`}
          tabIndex={-1}
          className={headingClass}
        >
          Why are you cancelling?
        </h3>
        <p className={cn("text-ink-3", d.meta)}>
          One answer helps us improve. It doesn&apos;t change your options.
        </p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-reason`}
        aria-describedby={needReason && !reason ? `${uid}-need` : undefined}
        className="grid grid-cols-1 gap-2 @min-[36rem]:grid-cols-2"
      >
        {reasons.map((r, i) => {
          const checked = reason === r.id;
          const focusable = reason ? checked : i === 0;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={checked}
              data-pi-reason={uid}
              tabIndex={focusable ? 0 : -1}
              onClick={() => {
                setReason(r.id);
                setNeedReason(false);
              }}
              onKeyDown={(event) =>
                radioKeys(
                  event,
                  reasons.map((x) => x.id),
                  i,
                  (k) => {
                    const pick = reasons[k];
                    if (pick) {
                      setReason(pick.id);
                      setNeedReason(false);
                    }
                  },
                  `[data-pi-reason="${uid}"]`,
                )
              }
              className={cn(
                "flex items-center gap-2.5 rounded-2 border px-3 py-2.5 text-left transition-colors",
                d.text,
                FOCUS,
                checked
                  ? "border-[var(--pi-ink)] bg-[var(--pi-wash)] text-foreground"
                  : "border-hairline text-ink-2 hover:border-hairline-strong hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  checked ? "border-[var(--pi-ink)]" : "border-hairline-strong",
                )}
              >
                <motion.span
                  className="size-2 rounded-full bg-[var(--pi-ink)]"
                  initial={false}
                  animate={{
                    scale: checked ? 1 : 0,
                    opacity: checked ? 1 : 0,
                  }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </span>
              <span className="min-w-0">{r.label}</span>
            </button>
          );
        })}
      </div>
      {needReason && !reason ? (
        <p id={`${uid}-need`} className={cn("text-danger", d.meta)}>
          Choose a reason to continue.
        </p>
      ) : null}
      <label className={cn("flex flex-col gap-1.5 text-ink-2", d.meta)}>
        Anything else? (optional)
        <textarea
          value={note}
          rows={2}
          maxLength={500}
          disabled={disabled}
          onChange={(event) => {
            const v = event.currentTarget.value;
            setNote(v);
          }}
          placeholder="What would have made it worth keeping?"
          className={cn(
            "w-full resize-none rounded-2 border border-input bg-surface-0 px-3 py-2 text-foreground placeholder:text-ink-3",
            d.text,
            "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        />
      </label>
    </div>
  );

  const pauseOffer =
    offers.pause && pauseMonths.length > 0 ? (
      <div className="flex flex-col gap-3 rounded-3 border border-[color-mix(in_oklab,var(--pi-ink)_32%,transparent)] bg-[var(--pi-wash)] p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--pi-fill)] text-[var(--pi-on)]"
          >
            <CirclePause className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h4
              id={`${uid}-pause`}
              className="text-[14px] leading-5 font-semibold text-foreground"
            >
              Pause instead
            </h4>
            <p className={cn("text-ink-2", d.meta)}>
              Keep everything exactly as it is. Billing stops while paused.
            </p>
            <p className={cn("mt-1 text-ink-2", d.meta)}>
              Paused from {endsOn}; resumes on{" "}
              <span className="font-medium text-foreground">
                <Roll value={resumesOn} motionSafe={motionSafe} />
                <span className="sr-only">{resumesOn}</span>
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div
            role="radiogroup"
            aria-label="Pause length"
            className="grid h-9 flex-1 basis-44 auto-cols-fr grid-flow-col gap-0.5 rounded-2 bg-surface-2 p-0.5"
          >
            {pauseMonths.map((m, i) => {
              const checked = months === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  data-pi-month={uid}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => setMonths(m)}
                  onKeyDown={(event) =>
                    radioKeys(
                      event,
                      pauseMonths.map(String),
                      i,
                      (k) => {
                        const pick = pauseMonths[k];
                        if (pick !== undefined) setMonths(pick);
                      },
                      `[data-pi-month="${uid}"]`,
                    )
                  }
                  className={cn(
                    "relative flex items-center justify-center rounded-[calc(var(--radius-2)-2px)] text-[12px] font-medium transition-colors",
                    FOCUS,
                    checked
                      ? "text-foreground"
                      : "text-ink-2 hover:text-foreground",
                  )}
                >
                  {checked ? (
                    <motion.span
                      layoutId={`${uid}-month`}
                      aria-hidden
                      className="absolute inset-0 rounded-[inherit] bg-card shadow-sm ring-1 ring-hairline"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <span className="relative">
                    {plural(m, "month", "months")}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => decide("pause")}
            aria-disabled={
              disabled || (pending !== null && pending !== "pause") || undefined
            }
            aria-busy={pending === "pause" || undefined}
            className={cn(
              PRIMARY,
              FOCUS,
              "flex-1 basis-36",
              disabled && "opacity-60",
            )}
          >
            {pending === "pause"
              ? "Pausing…"
              : `Pause for ${plural(months, "month", "months")}`}
          </button>
        </div>
      </div>
    ) : null;

  const downgradeOffer = offers.downgrade ? (
    <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2"
        >
          <ArrowDownToLine className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h4 className="text-[14px] leading-5 font-semibold text-foreground">
            Switch to {offers.downgrade.plan}
          </h4>
          <p className={cn("text-ink-2", d.meta)}>
            {offers.downgrade.price} · keeps {offers.downgrade.keeps}.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => decide("downgrade")}
        aria-disabled={
          disabled || (pending !== null && pending !== "downgrade") || undefined
        }
        aria-busy={pending === "downgrade" || undefined}
        className={cn(
          SECONDARY,
          FOCUS,
          "mt-auto w-full",
          disabled && "opacity-60",
        )}
      >
        {pending === "downgrade"
          ? "Switching…"
          : `Switch to ${offers.downgrade.plan}`}
      </button>
    </div>
  ) : null;

  const lossesStep = (
    <div className={cn("flex flex-col", d.gap)}>
      <div className="flex flex-col gap-1">
        <h3
          ref={current === "losses" ? bindHeading : undefined}
          tabIndex={-1}
          className={headingClass}
        >
          What changes on {endsOn}
        </h3>
      </div>
      <div
        className={cn(
          "grid grid-cols-1 @min-[36rem]:grid-cols-[1.4fr_1fr]",
          d.gap,
        )}
      >
        <section
          aria-labelledby={`${uid}-off`}
          className="flex min-w-0 flex-col gap-2"
        >
          <h4 id={`${uid}-off`} className={EYEBROW}>
            Switches off
          </h4>
          <ul
            role="list"
            className={cn(
              listStyle === "tiles"
                ? "grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2"
                : "flex flex-col divide-y divide-hairline rounded-3 border border-hairline bg-surface-1",
            )}
          >
            {losses.map((loss, i) => (
              <LossItem
                key={loss.id}
                loss={loss}
                off={i < dimmed}
                endsOn={endsOn}
                listStyle={listStyle}
                d={d}
                motionSafe={motionSafe}
              />
            ))}
          </ul>
        </section>
        <section
          aria-labelledby={`${uid}-stays`}
          className="flex min-w-0 flex-col gap-2"
        >
          <h4 id={`${uid}-stays`} className={EYEBROW}>
            Stays
          </h4>
          <ul role="list" className="flex flex-col gap-2">
            {keeps.map((k) => (
              <li
                key={k.id}
                className={cn("flex items-start gap-2 text-ink-2", d.text)}
              >
                <Check
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-success"
                />
                <span className="min-w-0">{k.label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <AnimatePresence initial={false}>
        {offerShown && (pauseOffer || downgradeOffer) ? (
          <motion.div
            key="offers"
            initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? {
                    y: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
            className={cn(
              "grid grid-cols-1 @min-[36rem]:grid-cols-[1.4fr_1fr]",
              d.gap,
            )}
          >
            {pauseOffer}
            {downgradeOffer}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const choices: {
    kind: Decision;
    title: string;
    busy: string;
    consequence: string;
    icon: typeof CirclePause;
  }[] = [
    ...(offers.pause && pauseMonths.length > 0
      ? [
          {
            kind: "pause" as const,
            title: `Pause for ${plural(months, "month", "months")}`,
            busy: "Pausing…",
            consequence: `Billing stops on ${endsOn}; ${plan.name} resumes on ${resumesOn}.`,
            icon: CirclePause,
          },
        ]
      : []),
    ...(offers.downgrade
      ? [
          {
            kind: "downgrade" as const,
            title: `Switch to ${offers.downgrade.plan}`,
            busy: "Switching…",
            consequence: `${offers.downgrade.price} from ${endsOn}; keeps ${offers.downgrade.keeps}.`,
            icon: ArrowDownToLine,
          },
        ]
      : []),
    {
      kind: "cancel",
      title: `Cancel ${plan.name} plan`,
      busy: "Cancelling…",
      consequence: `Ends on ${endsOn}. You won't be charged again.`,
      icon: CircleSlash,
    },
  ];

  const decideStep = (
    <div className={cn("flex flex-col", d.gap)}>
      <div className="flex flex-col gap-1">
        <h3
          ref={current === "decide" ? bindHeading : undefined}
          tabIndex={-1}
          className={headingClass}
        >
          Your choice
        </h3>
        <p className={cn("text-ink-2", d.text)}>
          Cancelling ends {plan.name} on {endsOn}. You won&apos;t be charged
          again, and you can come back any time.
        </p>
      </div>
      <ul role="list" className="flex flex-col gap-2">
        {choices.map((c) => {
          const Icon = c.icon;
          const busy = pending === c.kind;
          const cancel = c.kind === "cancel";
          return (
            <li key={c.kind}>
              <button
                type="button"
                onClick={() => decide(c.kind)}
                aria-disabled={
                  disabled || (pending !== null && !busy) || undefined
                }
                aria-busy={busy || undefined}
                className={cn(
                  "group/pause-instead flex w-full items-center gap-3 rounded-3 border px-3 text-left transition-colors active:translate-y-px",
                  d.row,
                  FOCUS,
                  cancel
                    ? "border-hairline-strong bg-surface-1 hover:border-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
                    : "border-hairline bg-surface-1 hover:border-hairline-strong hover:bg-surface-2",
                  (disabled || (pending !== null && !busy)) && "opacity-60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-2",
                    cancel
                      ? "bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger"
                      : c.kind === "pause"
                        ? "bg-[var(--pi-wash)] text-[var(--pi-ink)]"
                        : "bg-surface-2 text-ink-2",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("font-medium text-foreground", d.text)}>
                    {busy ? c.busy : c.title}
                  </span>
                  <span className={cn("text-ink-3", d.meta)}>
                    {c.consequence}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-ink-3 transition-transform group-hover/pause-instead:translate-x-0.5"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const doneStep = (() => {
    const out = outcome ?? "cancelled";
    const title =
      out === "paused"
        ? `Paused until ${resumesOn}`
        : out === "downgraded"
          ? `You're on ${offers.downgrade?.plan ?? "the new plan"} from ${endsOn}`
          : `${plan.name} is cancelled`;
    const body =
      out === "paused"
        ? `${plan.name} pauses on ${endsOn} and picks up again on ${resumesOn}. Nothing switches off.`
        : out === "downgraded"
          ? `${plan.name} runs until then; ${offers.downgrade?.plan ?? "the new plan"} keeps ${offers.downgrade?.keeps ?? "the basics"}.`
          : `It ends on ${endsOn}. You won't be charged again, and every board stays readable.`;
    return (
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            out === "cancelled"
              ? "bg-surface-2 text-ink-2"
              : "bg-[var(--pi-fill)] text-[var(--pi-on)]",
          )}
        >
          <Tick motionSafe={motionSafe} className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            ref={current === "done" ? bindHeading : undefined}
            tabIndex={-1}
            className={headingClass}
          >
            {title}
          </h3>
          <p className={cn("text-ink-2", d.text)}>{body}</p>
        </div>
      </div>
    );
  })();

  /* ------------------------------- chrome -------------------------------- */

  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
  const [fade, setFade] = React.useState({ top: false, bottom: false });
  React.useEffect(() => {
    if (!scroller) return;
    const check = () => {
      const top = scroller.scrollTop > 1;
      const bottom =
        scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1;
      setFade((f) =>
        f.top === top && f.bottom === bottom ? f : { top, bottom },
      );
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(scroller);
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    scroller.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", check);
    };
  }, [scroller]);
  const maskImage =
    fade.top && fade.bottom
      ? "linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)"
      : fade.top
        ? "linear-gradient(to bottom, transparent, black 16px)"
        : fade.bottom
          ? "linear-gradient(to bottom, black calc(100% - 16px), transparent)"
          : undefined;

  const footer = (() => {
    if (!ready) return null;
    if (current === "reason")
      return (
        <>
          <button
            type="button"
            onClick={keep}
            className={cn(GHOST, FOCUS, "-ml-1")}
          >
            Keep my plan
          </button>
          <button
            type="button"
            onClick={toContinue}
            aria-disabled={disabled || undefined}
            className={cn(PRIMARY, FOCUS, "ml-auto", disabled && "opacity-60")}
          >
            Continue
            <ArrowRight aria-hidden className="size-4" />
          </button>
        </>
      );
    if (current === "losses")
      return (
        <>
          <button
            type="button"
            onClick={() => go("reason")}
            className={cn(GHOST, FOCUS, "-ml-1")}
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </button>
          <button
            type="button"
            onClick={() => go("decide")}
            aria-disabled={pending !== null || undefined}
            className={cn(SECONDARY, FOCUS, "ml-auto")}
          >
            Continue to cancel
          </button>
        </>
      );
    if (current === "decide")
      return (
        <>
          <button
            type="button"
            onClick={() => {
              if (!pending) go("losses");
            }}
            className={cn(GHOST, FOCUS, "-ml-1")}
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </button>
          <button
            type="button"
            onClick={keep}
            className={cn(SECONDARY, FOCUS, "ml-auto")}
          >
            Keep my plan
          </button>
        </>
      );
    return (
      <button
        type="button"
        onClick={() => onExit?.(outcome ?? "cancelled")}
        className={cn(SECONDARY, FOCUS, "ml-auto")}
      >
        Done
      </button>
    );
  })();

  const body = (() => {
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Your plan didn&apos;t load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(SECONDARY, FOCUS, "h-8 text-xs")}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className={cn("flex flex-col gap-3", d.pad, d.body)}
        >
          <p className="sr-only">Loading your plan.</p>
          <span
            aria-hidden
            className="h-3.5 w-48 max-w-full rounded-full bg-surface-2"
          />
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className="h-10 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      );
    }
    const content =
      current === "reason"
        ? reasonStep
        : current === "losses"
          ? lossesStep
          : current === "decide"
            ? decideStep
            : doneStep;
    return (
      <Measured motionSafe={motionSafe}>
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={current}
            custom={direction}
            variants={{
              enter: (dir: number) => ({
                opacity: 0,
                x: motionSafe ? dir * distances.step : 0,
              }),
              still: { opacity: 1, x: 0 },
              leave: (dir: number) => ({
                opacity: 0,
                x: motionSafe ? -dir * distances.step : 0,
                transition: exitFor(durations.fast),
              }),
            }}
            initial="enter"
            animate="still"
            exit="leave"
            transition={
              motionSafe
                ? {
                    x: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
            className={cn(d.pad, d.body)}
          >
            {content}
          </motion.div>
        </AnimatePresence>
      </Measured>
    );
  })();

  const toneVars = (TONE[tone] ?? TONE.calm) as React.CSSProperties;

  return (
    <section
      ref={rootRef}
      aria-labelledby={`${uid}-title`}
      className={cn(
        "@container flex w-full max-w-3xl flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...toneVars, maxHeight }}
    >
      <header
        className={cn(
          "grid shrink-0 grid-cols-1 gap-x-4 border-b border-hairline pt-4 pb-3 @min-[36rem]:grid-cols-[minmax(0,1fr)_auto]",
          d.pad,
        )}
      >
        <div className="flex flex-col gap-0.5">
          <p className={EYEBROW}>{plan.product} · Billing</p>
          <h2 id={`${uid}-title`} className="text-base leading-6 font-semibold">
            Cancel {plan.name}
          </h2>
        </div>
        {ready ? (
          <p
            className={cn("mt-0.5 text-ink-3 @min-[36rem]:col-span-2", d.meta)}
          >
            {plural(plan.seats, "seat", "seats")} ·{" "}
            {formatMoney(plan.price, currency)} a seat a {plan.cycle} · paid
            through {endsOn} ({plural(daysLeft, "day", "days")} left)
          </p>
        ) : (
          <span
            aria-hidden
            className="mt-1.5 h-3 w-56 max-w-full rounded-full bg-surface-2 @min-[36rem]:col-span-2"
          />
        )}
        <ol
          aria-label="Cancellation steps"
          className="mt-3 flex flex-wrap items-center gap-1 @min-[36rem]:col-start-2 @min-[36rem]:row-start-1 @min-[36rem]:mt-0 @min-[36rem]:self-start"
        >
          {STEPS.map((s, i) => {
            const active = current === s.id;
            const reached = index > i;
            return (
              <li
                key={s.id}
                aria-current={active ? "step" : undefined}
                className="flex items-center gap-1"
              >
                {i > 0 ? (
                  <span
                    aria-hidden
                    className="hidden h-px w-3 bg-hairline-strong @min-[26rem]:block"
                  />
                ) : null}
                <span className="relative flex h-7 items-center gap-1.5 rounded-full px-2 text-[12px]">
                  {active ? (
                    <motion.span
                      layoutId={`${uid}-pill`}
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-[var(--pi-wash)] ring-1 ring-[color-mix(in_oklab,var(--pi-ink)_30%,transparent)] ring-inset"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className={cn(
                      "relative flex size-4 items-center justify-center rounded-full font-mono text-[10px] leading-none transition-colors",
                      reached
                        ? "bg-[var(--pi-fill)] text-[var(--pi-on)]"
                        : active
                          ? "text-[var(--pi-ink)] ring-1 ring-[var(--pi-ink)]"
                          : "text-ink-3 ring-1 ring-hairline-strong",
                    )}
                  >
                    {reached ? (
                      <Tick motionSafe={motionSafe} className="size-3" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "relative whitespace-nowrap",
                      active
                        ? "font-medium text-foreground"
                        : "sr-only text-ink-3 @min-[26rem]:not-sr-only",
                    )}
                  >
                    {s.label}
                    <span className="sr-only">{reached ? ", done" : ""}</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </header>

      <div
        ref={setScroller}
        className="flex-auto [scrollbar-width:thin] overflow-y-auto overscroll-contain"
        style={{ maskImage }}
      >
        {body}
      </div>

      <AnimatePresence initial={false}>
        {failure ? (
          <motion.div
            key="failure"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
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
            className="shrink-0 overflow-hidden"
          >
            <p
              role="alert"
              className={cn(
                "flex items-start gap-2 border-t border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] py-2 text-danger",
                d.pad,
                d.meta,
              )}
            >
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {failure}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {footer ? (
        <footer
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline py-3",
            d.pad,
          )}
        >
          {footer}
        </footer>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
