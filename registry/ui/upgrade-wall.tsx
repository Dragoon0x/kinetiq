"use client";

import * as React from "react";

import {
  Bell,
  Check,
  LoaderCircle,
  Minus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type UpgradeBilling = "monthly" | "yearly";
/** Which billing cycles are offered. */
export type UpgradeCycle = "both" | "monthly" | "yearly";
export type UpgradeTimeline = "track" | "list" | "none";
export type UpgradeCompare = "table" | "unlocks" | "all";
export type UpgradeState = "idle" | "pending" | "success" | "error";
export type UpgradeStatus = "ready" | "loading" | "error";

export type UpgradePlan = {
  id: string;
  name: string;
  /** One line under the name. */
  tagline?: string;
  /** Price per seat per month, billed monthly. */
  monthly: number;
  /** Price per seat per month, billed yearly. */
  yearly: number;
  /** The plan the account is on now. */
  current?: boolean;
  /** A short flag, e.g. "Popular". */
  badge?: string;
};

export type UpgradeFeature = {
  id: string;
  label: string;
  /** What each plan gives: included or not, or a short amount ("1 year"). */
  values: Readonly<Record<string, boolean | string>>;
};

/** What the visitor chose, handed to `onPurchase`. */
export type UpgradeSelection = {
  plan: string;
  billing: UpgradeBilling;
  seats: number;
  /** A free trial comes first. */
  trial: boolean;
  /** What the first charge is, in the currency `format` prints. */
  amount: number;
  /** When it is taken, ms since the epoch. */
  firstCharge: number;
};

export type UpgradeWallProps = {
  /** The trial drawn as a track from today to the first charge, as a vertical list, or no trial at all (billed today). @default "track" */
  timeline?: UpgradeTimeline;
  /** The current plan against the chosen one, only what unlocks, or every plan side by side. @default "table" */
  compare?: UpgradeCompare;
  /** The billing cycles offered: both behind a switch, or only one. @default "both" */
  cycle?: UpgradeCycle;
  /** The plans, current one included. @default defaultUpgradePlans */
  plans?: UpgradePlan[];
  /** The comparison rows. @default defaultUpgradeFeatures */
  features?: UpgradeFeature[];
  /** The id of the plan the account is on. @default the plan marked current, else the first */
  current?: string;
  /** Controlled chosen plan. */
  plan?: string;
  /** @default the first plan with a badge, else the first plan after the current one */
  defaultPlan?: string;
  /** Fires from the press or key that chose a plan. */
  onPlanChange?: (plan: string) => void;
  /** Controlled billing cycle, when `cycle` is "both". */
  billing?: UpgradeBilling;
  /** @default "yearly" */
  defaultBilling?: UpgradeBilling;
  /** Fires from the press or key that switched billing. */
  onBillingChange?: (billing: UpgradeBilling) => void;
  /** Seats the price is multiplied by. @default 3 */
  seats?: number;
  /** Length of the free trial, in days. @default 14 */
  trialDays?: number;
  /** How many days before the first charge the reminder goes out. @default 2 */
  reminderDays?: number;
  /** Today, for the dates on the timeline. @default defaultUpgradeNow */
  now?: Date | number;
  /** Prints an amount. @default euros through Intl.NumberFormat */
  format?: (amount: number) => string;
  /** Controlled purchase state. */
  state?: UpgradeState;
  /** Fires from the press that started a purchase, and when it settles. */
  onStateChange?: (state: UpgradeState) => void;
  /** Starts the purchase. Return a promise to hold the button pending; reject with an Error to show its message. */
  onPurchase?: (selection: UpgradeSelection) => void | Promise<void>;
  /** The Not now button. Hidden without it. */
  onDismiss?: () => void;
  /** The heading and accessible name. @default "Upgrade to keep your dashboards live" */
  title?: string;
  /** The line under it: why the wall is here. */
  subtitle?: string;
  /** Loading draws placeholders; error offers Retry. @default "ready" */
  status?: UpgradeStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** Play a click on plan and billing changes and a chime when your purchase lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the wall but takes no input. */
  disabled?: boolean;
  /** The region's accessible name, when it should differ from the title. */
  label?: string;
  className?: string;
};

export const defaultUpgradePlans: UpgradePlan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For trying things out",
    monthly: 0,
    yearly: 0,
    current: true,
  },
  {
    id: "team",
    name: "Team",
    tagline: "For small teams that run on dashboards",
    monthly: 12,
    yearly: 10,
    badge: "Popular",
  },
  {
    id: "business",
    name: "Business",
    tagline: "For companies that need audit and single sign-on",
    monthly: 24,
    yearly: 20,
  },
];

export const defaultUpgradeFeatures: UpgradeFeature[] = [
  {
    id: "dashboards",
    label: "Dashboards",
    values: { free: "3", team: "Unlimited", business: "Unlimited" },
  },
  {
    id: "refresh",
    label: "Live refresh",
    values: { free: false, team: "Every minute", business: "Every 10 s" },
  },
  {
    id: "retention",
    label: "Data retention",
    values: { free: "30 days", team: "1 year", business: "3 years" },
  },
  {
    id: "alerts",
    label: "Alerts",
    values: { free: false, team: true, business: true },
  },
  {
    id: "shared",
    label: "Shared workspaces",
    values: { free: false, team: true, business: true },
  },
  {
    id: "sso",
    label: "SSO and SCIM",
    values: { free: false, team: false, business: true },
  },
  {
    id: "audit",
    label: "Audit log",
    values: { free: false, team: false, business: true },
  },
  {
    id: "support",
    label: "Support",
    values: { free: "Community", team: "Email", business: "Priority" },
  },
];

/** 2 October 2026, 09:00 UTC: the demo's today. */
export const defaultUpgradeNow = Date.UTC(2026, 9, 2, 9, 0);

const DAY = 86_400_000;
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
const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
/** Success is pigment on a filled button: the same green in both themes. */
const PIGMENT = "oklch(from var(--success) 0.6 0.15 h)";

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Days are UTC days, so the server and the browser print the same date. */
const dateOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

const euros = (amount: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);

const unlocks = (f: UpgradeFeature, current: string, chosen: string) => {
  const to = f.values[chosen];
  return to !== undefined && to !== false && to !== f.values[current];
};

const messageOf = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : "That didn't go through. Nothing was charged.";

/** One digit as a column of ten that rolls to its value on snap. */
function Digit({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span className="relative inline-block h-[1em] overflow-clip">
      <motion.span
        className="flex flex-col"
        initial={false}
        animate={{ y: `${-value * 10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {Array.from({ length: 10 }, (_, d) => (
          <span key={d} className="h-[1em]">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * A printed amount whose digits roll. Columns are keyed from the right, so
 * units stay units when the amount gains a digit; tabular figures keep the
 * width still.
 */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = [...text];
  return (
    <span className={cn("inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex leading-none">
        {chars.map((c, i) => {
          const key = chars.length - i;
          return /\d/.test(c) ? (
            <Digit key={`d${key}`} value={Number(c)} motionSafe={motionSafe} />
          ) : (
            <span key={`s${key}-${c}`} className="h-[1em] whitespace-pre">
              {c}
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** A lock whose shackle lifts open about its right leg. */
function LockGlyph({
  open,
  tone,
  delay,
  motionSafe,
}: {
  open: boolean;
  tone: "muted" | "cobalt" | "success";
  delay: number;
  motionSafe: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "size-3.5 shrink-0 transition-colors duration-300",
        tone === "success"
          ? "text-success"
          : tone === "cobalt"
            ? "text-cobalt-bright"
            : "text-ink-3",
      )}
    >
      <rect x={3.5} y={7.5} width={9} height={6.5} rx={1.5} />
      <motion.path
        d="M5.5 7.5V5.2a2.5 2.5 0 0 1 5 0v2.3"
        style={{ originX: 1, originY: 1 }}
        initial={false}
        animate={{ y: open ? -2.6 : 0, rotate: open ? -32 : 0 }}
        transition={motionSafe ? { ...springs.snap, delay } : { duration: 0 }}
      />
    </svg>
  );
}

function Value({ value }: { value: boolean | string | undefined }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center">
        <Check aria-hidden className="size-4 text-foreground" />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (value === false || value === undefined) {
    return (
      <span className="inline-flex items-center">
        <Minus aria-hidden className="size-4 text-ink-3" />
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return <span>{value}</span>;
}

/** A cell whose content rolls when it changes: old up and out, new in from below. */
function RollCell({
  id,
  children,
  motionSafe,
}: {
  id: string;
  children: React.ReactNode;
  motionSafe: boolean;
}) {
  return (
    <span className="relative inline-grid overflow-clip align-middle">
      <AnimatePresence initial={false}>
        <motion.span
          key={id}
          className="col-start-1 row-start-1 inline-flex items-center"
          initial={{ opacity: 0, y: motionSafe ? 6 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -6 : 0,
            transition: exitFor(durations.fast),
          }}
          transition={{
            y: motionSafe ? springs.snap : { duration: 0 },
            opacity: { duration: durations.fast },
          }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * The rail between two moments of the list, from one dot to the next: it
 * fills its own share of the sweep, so the rail never runs past the last dot.
 */
function Connector({
  index,
  count,
  sweep,
  tone,
}: {
  index: number;
  count: number;
  sweep: MotionValue<number>;
  tone: string;
}) {
  const clip = useTransform(sweep, (s) => {
    const k = Math.min(1, Math.max(0, s * count - index));
    return `inset(0 0 ${r2((1 - k) * 100)}% 0)`;
  });
  return (
    <span
      aria-hidden
      className="absolute top-4 -bottom-[18px] left-[6px] w-0.5"
    >
      <span className="absolute inset-0 bg-hairline-strong" />
      <motion.span
        className={cn("absolute inset-0 transition-colors duration-300", tone)}
        style={{ clipPath: clip }}
      />
    </span>
  );
}

type TimelineProps = {
  kind: "track" | "list";
  sweep: MotionValue<number>;
  today: number;
  trialDays: number;
  reminderDays: number;
  charge: string;
  success: boolean;
  motionSafe: boolean;
  className?: string;
};

function Timeline({
  kind,
  sweep,
  today,
  trialDays,
  reminderDays,
  charge,
  success,
  motionSafe,
  className,
}: TimelineProps) {
  const days = Math.max(1, Math.round(trialDays));
  const remind = Math.min(days - 1, Math.max(0, Math.round(reminderDays)));
  const remindAt = remind > 0 ? (days - remind) / days : null;
  const reminderDate = dateOf(today + (days - remind) * DAY);
  const chargeDate = dateOf(today + days * DAY);
  const ticks = React.useMemo(
    () =>
      Array.from({ length: days + 1 }, (_, i) => ({
        p: i / days,
        d: `M ${r2((i / days) * 100)} 0 V 4`,
      })),
    [days],
  );
  const lit = useTransform(sweep, (s) =>
    ticks
      .filter((t) => t.p <= s + 0.0001)
      .map((t) => t.d)
      .join(" "),
  );
  const clipX = useTransform(
    sweep,
    (s) => `inset(0 ${r2((1 - Math.min(1, Math.max(0, s))) * 100)}% 0 0)`,
  );
  const tone = success ? "bg-success" : "bg-cobalt-bright";

  const todayDot = (
    <span className="relative grid size-3.5 place-items-center">
      <AnimatePresence initial={false}>
        <motion.span
          key={success ? "on" : "off"}
          className={cn(
            "col-start-1 row-start-1 size-3.5 rounded-full ring-4 ring-card",
            tone,
          )}
          initial={
            motionSafe && success ? { scale: 0.4, opacity: 0 } : { opacity: 0 }
          }
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe && success
              ? { scale: springs.recoil, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        />
      </AnimatePresence>
    </span>
  );

  const items = [
    {
      key: "today",
      when: success ? "Today · started" : "Today",
      what: success ? "Your trial is running" : "Full access, nothing to pay",
      say: `Today: full access starts, nothing to pay.`,
    },
    ...(remindAt !== null
      ? [
          {
            key: "remind",
            when: reminderDate,
            what: "We email a reminder",
            say: `${reminderDate}: we email you a reminder.`,
          },
        ]
      : []),
    {
      key: "charge",
      when: chargeDate,
      what: `${charge} charged`,
      say: `${chargeDate}: ${charge} charged. Cancel before then and pay nothing.`,
    },
  ];

  if (kind === "list") {
    return (
      <ol role="list" className={cn("relative grid gap-4", className)}>
        {items.map((it, i) => (
          <li key={it.key} className="relative flex items-start gap-3">
            {i < items.length - 1 ? (
              <Connector
                index={i}
                count={items.length - 1}
                sweep={sweep}
                tone={tone}
              />
            ) : null}
            <span className="sr-only">{it.say}</span>
            <span
              aria-hidden
              className="mt-0.5 grid size-3.5 shrink-0 place-items-center"
            >
              {i === 0 ? (
                todayDot
              ) : (
                <span
                  className={cn(
                    "size-3.5 rounded-full border-2 bg-card ring-4 ring-card",
                    success ? "border-success" : "border-cobalt-bright",
                  )}
                />
              )}
            </span>
            <span aria-hidden className="grid min-w-0 gap-0.5">
              <span className="text-[12px] leading-4 font-medium text-foreground">
                {it.when}
              </span>
              <span className="text-[12px] leading-4 text-ink-3">
                {it.what}
              </span>
            </span>
          </li>
        ))}
      </ol>
    );
  }

  const pct = (p: number) => `${r2(p * 100)}%`;
  return (
    <div className={cn("relative", className)}>
      <ol role="list" className="sr-only">
        {items.map((it) => (
          <li key={it.key}>{it.say}</li>
        ))}
      </ol>
      <div aria-hidden className="relative pt-9 pb-12">
        {remindAt !== null ? (
          <span
            className="absolute top-0 grid justify-items-end gap-0.5 text-right"
            style={{ right: `calc(${pct(1 - remindAt)} - 6px)` }}
          >
            <span className="inline-flex items-center gap-1 text-[12px] leading-4 font-medium whitespace-nowrap text-foreground">
              <Bell className="size-3 text-ink-3" />
              {reminderDate}
            </span>
            <span className="text-[11px] leading-4 whitespace-nowrap text-ink-3">
              Reminder
            </span>
          </span>
        ) : null}
        <div className="relative mx-[7px] h-3.5">
          <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-hairline-strong" />
          <motion.span
            className={cn(
              "absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-colors duration-300",
              tone,
            )}
            style={{ clipPath: clipX }}
          />
          <svg
            viewBox="0 0 100 4"
            preserveAspectRatio="none"
            className="absolute inset-x-0 top-full mt-1 h-1 w-full overflow-visible"
          >
            <path
              d={ticks.map((t) => t.d).join(" ")}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="stroke-hairline-strong"
            />
            <motion.path
              d={lit}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className={cn(
                "transition-[stroke] duration-300",
                success ? "stroke-success" : "stroke-cobalt-bright",
              )}
            />
          </svg>
          <span className="absolute top-0 left-0 -translate-x-1/2">
            {todayDot}
          </span>
          {remindAt !== null ? (
            <span
              className={cn(
                "absolute top-0 size-3.5 -translate-x-1/2 rounded-full border-2 bg-card",
                success ? "border-success" : "border-cobalt-bright",
              )}
              style={{ left: pct(remindAt) }}
            />
          ) : null}
          <span
            className={cn(
              "absolute top-0 left-full size-3.5 -translate-x-1/2 rounded-full border-2 bg-card",
              success ? "border-success" : "border-cobalt-bright",
            )}
          />
        </div>
        <span className="absolute bottom-0 left-0 grid gap-0.5">
          <span className="text-[12px] leading-4 font-medium whitespace-nowrap text-foreground">
            {success ? "Started today" : "Today"}
          </span>
          <span className="text-[11px] leading-4 whitespace-nowrap text-ink-3">
            {success ? "Trial running" : "Free from now"}
          </span>
        </span>
        <span className="absolute right-0 bottom-0 grid justify-items-end gap-0.5 text-right">
          <span className="text-[12px] leading-4 font-medium whitespace-nowrap text-foreground">
            {chargeDate}
          </span>
          <span className="text-[11px] leading-4 whitespace-nowrap text-ink-3">
            {charge} charged
          </span>
        </span>
      </div>
    </div>
  );
}

type RadioOption = { id: string; content: React.ReactNode; name: string };

/** A radiogroup with a pill that slides to the chosen option on snap. */
function Segmented({
  label,
  options,
  value,
  pillId,
  disabled,
  locked,
  motionSafe,
  onChange,
  className,
}: {
  label: string;
  options: RadioOption[];
  value: string;
  pillId: string;
  disabled: boolean;
  locked: boolean;
  motionSafe: boolean;
  onChange: (id: string) => void;
  className?: string;
}) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const at = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  const pick = (i: number) => {
    const o = options[(i + options.length) % options.length];
    if (!o || disabled || locked) return;
    nodes.current.get(o.id)?.focus();
    if (o.id !== value) onChange(o.id);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={locked || undefined}
      className={cn(
        "grid auto-cols-fr grid-flow-col gap-1 rounded-3 border border-hairline bg-surface-2 p-1 transition-opacity",
        locked && "opacity-60",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            ref={(node) => {
              if (node) nodes.current.set(o.id, node);
              else nodes.current.delete(o.id);
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.name}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              if (!locked && !on) onChange(o.id);
            }}
            onKeyDown={(event) => {
              const k = event.key;
              if (k === "ArrowRight" || k === "ArrowDown") {
                event.preventDefault();
                pick(at + 1);
              } else if (k === "ArrowLeft" || k === "ArrowUp") {
                event.preventDefault();
                pick(at - 1);
              } else if (k === "Home") {
                event.preventDefault();
                pick(0);
              } else if (k === "End") {
                event.preventDefault();
                pick(options.length - 1);
              }
            }}
            className={cn(
              "relative inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-2 px-2.5 text-[13px] transition-colors",
              FOCUS,
              on
                ? "text-foreground"
                : "text-ink-2 enabled:hover:text-foreground",
              (disabled || locked) && "cursor-default",
            )}
          >
            {on ? (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 rounded-2 border border-hairline-strong bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_10%,transparent)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative inline-flex min-w-0 items-center gap-1.5">
              {o.content}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A paywall for a free account that has hit a limit. The comparison shows
 * what the chosen plan unlocks: those rows light in a cascade and their locks
 * lift open on snap, and when the plan changes only the rows that changed
 * re-light while the chosen column's cells roll. The plan and the billing
 * cycle are radiogroups with pills that slide on snap, and every price rolls
 * digit by digit, tabular so nothing shifts.
 *
 * The trial is drawn as a track: from today to the first charge, a tick per
 * day, the span drawn in on glide when the wall arrives, with the reminder
 * above it and the charge's amount rolling with the plan. The purchase button
 * holds its width through pending, success and error; success stamps on
 * recoil, turns the track and the unlocked rows green and opens every lock.
 *
 * Plan and billing take arrow keys, the comparison is a real table, the
 * timeline is a list of sentences, and the button's state is announced.
 * Under reduced motion nothing rolls, slides or stamps: values swap in place
 * and the track appears drawn, while every price and state still changes.
 */
export function UpgradeWall({
  timeline = "track",
  compare = "table",
  cycle = "both",
  plans = defaultUpgradePlans,
  features = defaultUpgradeFeatures,
  current: currentProp,
  plan: planProp,
  defaultPlan,
  onPlanChange,
  billing: billingProp,
  defaultBilling = "yearly",
  onBillingChange,
  seats = 3,
  trialDays = 14,
  reminderDays = 2,
  now = defaultUpgradeNow,
  format = euros,
  state: stateProp,
  onStateChange,
  onPurchase,
  onDismiss,
  title = "Upgrade to keep your dashboards live",
  subtitle = "You've used 3 of 3 dashboards on Free. Pick a plan to add more.",
  status = "ready",
  onRetry,
  sound = false,
  disabled = false,
  label,
  className,
}: UpgradeWallProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const today = typeof now === "number" ? now : now.getTime();

  const currentId =
    currentProp ?? plans.find((p) => p.current)?.id ?? plans[0]?.id ?? "";
  const currentPlan = plans.find((p) => p.id === currentId);
  const choices = plans.filter((p) => p.id !== currentId);

  const [ownPlan, setOwnPlan] = React.useState(
    () =>
      defaultPlan ?? choices.find((p) => p.badge)?.id ?? choices[0]?.id ?? "",
  );
  const chosenId = planProp ?? ownPlan;
  const chosen =
    choices.find((p) => p.id === chosenId) ?? choices[0] ?? currentPlan;

  const [ownBilling, setOwnBilling] =
    React.useState<UpgradeBilling>(defaultBilling);
  const billing: UpgradeBilling =
    cycle === "both" ? (billingProp ?? ownBilling) : cycle;

  const [ownState, setOwnState] = React.useState<UpgradeState>("idle");
  const state = stateProp ?? ownState;
  const [failure, setFailure] = React.useState<string | null>(null);
  const requested = React.useRef(false);
  const alive = React.useRef(true);

  const trial = timeline !== "none" && trialDays > 0;
  const seatCount = Math.max(1, Math.round(seats));
  const perSeat = chosen
    ? billing === "yearly"
      ? chosen.yearly
      : chosen.monthly
    : 0;
  const amount = r2(perSeat * seatCount * (billing === "yearly" ? 12 : 1));
  const firstCharge = trial ? today + Math.round(trialDays) * DAY : today;
  const saving =
    chosen && chosen.monthly > 0
      ? Math.round((1 - chosen.yearly / chosen.monthly) * 100)
      : 0;
  const success = state === "success";
  const pending = state === "pending";
  const locked = success || pending;

  // A spoken line is frozen in the render that flips the purchase state.
  const [seen, setSeen] = React.useState(state);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  if (seen !== state) {
    setSeen(state);
    const name = chosen?.name ?? "the plan";
    const text =
      state === "pending"
        ? trial
          ? "Starting your trial."
          : "Processing your upgrade."
        : state === "success"
          ? trial
            ? `Trial started on ${name}. First charge ${format(amount)} on ${dateOf(firstCharge)}.`
            : `You're on ${name}. ${format(amount)} charged.`
          : "";
    if (text) setSaid((s) => ({ n: s.n + 1, text }));
  }

  const report = (next: UpgradeState) => {
    if (stateProp === undefined) setOwnState(next);
    onStateChange?.(next);
  };

  const choosePlan = (id: string) => {
    if (disabled || locked || id === chosenId) return;
    audio.play("click", { pitch: 1.1, gain: 0.5 });
    if (planProp === undefined) setOwnPlan(id);
    onPlanChange?.(id);
    if (state === "error") report("idle");
  };

  const chooseBilling = (next: UpgradeBilling) => {
    if (disabled || locked || next === billing) return;
    audio.play("click", { pitch: next === "yearly" ? 1.2 : 0.95, gain: 0.5 });
    if (billingProp === undefined) setOwnBilling(next);
    onBillingChange?.(next);
    if (state === "error") report("idle");
  };

  const purchase = async () => {
    if (disabled || locked || !chosen) return;
    setFailure(null);
    requested.current = true;
    const selection: UpgradeSelection = {
      plan: chosen.id,
      billing,
      seats: seatCount,
      trial,
      amount,
      firstCharge,
    };
    let result: void | Promise<void>;
    try {
      result = onPurchase?.(selection);
    } catch (error) {
      setFailure(messageOf(error));
      report("error");
      return;
    }
    if (!result || typeof result.then !== "function") {
      report("success");
      return;
    }
    report("pending");
    try {
      await result;
    } catch (error) {
      if (!alive.current) return;
      setFailure(messageOf(error));
      report("error");
      return;
    }
    if (!alive.current) return;
    report("success");
  };

  /* ------------------------------- timeline ------------------------------- */

  const sweep = useMotionValue(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const play = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  // The trial span draws itself in when the wall arrives and when the trial
  // changes length; a re-run starts the draw again rather than freezing it.
  React.useEffect(() => {
    if (!motionSafe) {
      anims.current.get("sweep")?.stop();
      sweep.set(1);
      return;
    }
    sweep.jump(0);
    play("sweep", animate(sweep, 1, { ...springs.glide, delay: 0.12 }));
  }, [trialDays, reminderDays, timeline, motionSafe, sweep]);

  // The purchase lands with a chime, if the visitor's own press started it.
  React.useEffect(() => {
    if (state !== "success" || !requested.current) return;
    requested.current = false;
    audio.play("chime", { pitch: 1, gain: 0.5 });
  }, [state, audio]);

  React.useEffect(() => {
    alive.current = true;
    const running = anims.current;
    return () => {
      alive.current = false;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ------------------------------- compare -------------------------------- */

  const step = cascade(features.length);
  const unlocking = features.filter(
    (f) => chosen && unlocks(f, currentId, chosen.id),
  );

  const tableWrap = React.useRef<HTMLDivElement | null>(null);
  const heads = React.useRef(new Map<string, HTMLTableCellElement>());
  const bandX = useMotionValue(0);
  const bandW = useMotionValue(0);
  const bandOpacity = useMotionValue(0);
  const bandPlaced = React.useRef(false);

  // In "all", a band behind the chosen column slides across on snap.
  React.useLayoutEffect(() => {
    if (compare !== "all" || !chosen) return;
    const wrap = tableWrap.current;
    const th = heads.current.get(chosen.id);
    if (!wrap || !th) return;
    const place = (animateIt: boolean) => {
      const a = wrap.getBoundingClientRect();
      const b = th.getBoundingClientRect();
      const x = r2(b.left - a.left);
      const w = r2(b.width);
      if (!animateIt || !bandPlaced.current || !motionSafe) {
        bandX.jump(x);
        bandW.jump(w);
      } else {
        play("bandX", animate(bandX, x, springs.snap));
        play("bandW", animate(bandW, w, springs.snap));
      }
      bandPlaced.current = true;
      bandOpacity.set(b.width > 0 ? 1 : 0);
    };
    place(true);
    // Only a real change of width re-places it at once: the observer's
    // first report would otherwise cut the slide short.
    let width = wrap.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (wrap.offsetWidth === width) return;
      width = wrap.offsetWidth;
      place(false);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, chosen?.id, motionSafe]);

  const columns =
    compare === "all"
      ? plans
      : [currentPlan, chosen].filter((p): p is UpgradePlan => !!p);

  const lockFor = (f: UpgradeFeature, i: number) => {
    const opens = !!chosen && unlocks(f, currentId, chosen.id);
    const has =
      f.values[currentId] !== undefined && f.values[currentId] !== false;
    if (!opens && has) {
      return <span aria-hidden className="size-3.5 shrink-0" />;
    }
    return (
      <LockGlyph
        open={opens}
        tone={opens ? (success ? "success" : "cobalt") : "muted"}
        delay={motionSafe ? i * step : 0}
        motionSafe={motionSafe}
      />
    );
  };

  let comparison: React.ReactNode;
  if (compare === "unlocks") {
    comparison = (
      <div className="grid gap-2">
        <p className="text-[12px] font-medium text-ink-2">
          What {chosen?.name ?? "it"} adds to {currentPlan?.name ?? "your plan"}
        </p>
        <ul role="list" className="grid rounded-3 border border-hairline">
          <AnimatePresence initial={false}>
            {unlocking.map((f, i) => (
              <motion.li
                key={f.id}
                className="overflow-clip border-hairline not-first:border-t"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: motionSafe
                    ? { ...exitFor(durations.base) }
                    : { duration: 0 },
                }}
                transition={{
                  height: motionSafe
                    ? { ...springs.glide, delay: i * step }
                    : { duration: 0 },
                  opacity: { duration: durations.base, delay: i * step },
                }}
              >
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors duration-300",
                    success ? "bg-success/8" : "bg-cobalt-wash",
                  )}
                >
                  <LockGlyph
                    open
                    tone={success ? "success" : "cobalt"}
                    delay={0}
                    motionSafe={motionSafe}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-foreground"
                    title={f.label}
                  >
                    <span className="sr-only">Unlocks </span>
                    {f.label}
                  </span>
                  <span className="shrink-0 text-ink-2">
                    <RollCell
                      id={`${chosen?.id}-${f.id}`}
                      motionSafe={motionSafe}
                    >
                      <Value value={chosen ? f.values[chosen.id] : undefined} />
                    </RollCell>
                  </span>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
          {unlocking.length === 0 ? (
            <li className="px-3 py-3 text-[13px] text-ink-3">
              Nothing new on this plan.
            </li>
          ) : null}
        </ul>
      </div>
    );
  } else {
    comparison = (
      <div ref={tableWrap} className="relative">
        {compare === "all" ? (
          <motion.span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 top-0 left-0 rounded-3 border transition-colors duration-300",
              success
                ? "border-success/40 bg-success/6"
                : "border-cobalt-bright/40 bg-cobalt-wash",
            )}
            style={{ x: bandX, width: bandW, opacity: bandOpacity }}
          />
        ) : null}
        <table className="relative w-full table-fixed border-separate border-spacing-0 text-[13px]">
          <caption className="sr-only">
            {currentPlan?.name ?? "Your plan"} compared with{" "}
            {compare === "all"
              ? "every plan"
              : (chosen?.name ?? "the chosen plan")}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-[44%] pb-2 text-left text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase"
              >
                Feature
              </th>
              {columns.map((p) => {
                const isCurrent = p.id === currentId;
                const isChosen = p.id === chosen?.id;
                return (
                  <th
                    key={
                      compare === "all"
                        ? p.id
                        : isCurrent
                          ? "current"
                          : "chosen"
                    }
                    ref={(node) => {
                      if (node) heads.current.set(p.id, node);
                      else heads.current.delete(p.id);
                    }}
                    scope="col"
                    className={cn(
                      "px-2 pt-1 pb-2 text-left text-[12px] font-medium",
                      compare === "all" &&
                        !isCurrent &&
                        !isChosen &&
                        "hidden @min-[40rem]:table-cell",
                      isChosen ? "text-foreground" : "text-ink-2",
                    )}
                  >
                    {compare === "all" || isCurrent ? (
                      <span className="inline-flex items-center gap-1.5">
                        {p.name}
                        {isCurrent ? (
                          <span className="rounded-full border border-hairline px-1.5 text-[10px] leading-4 font-normal text-ink-3">
                            Now
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <RollCell id={p.id} motionSafe={motionSafe}>
                        {p.name}
                      </RollCell>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {features.map((f, i) => {
              const opens = !!chosen && unlocks(f, currentId, chosen.id);
              const wash = opens
                ? success
                  ? "bg-success/8"
                  : "bg-cobalt-wash"
                : "bg-transparent";
              const delay = motionSafe
                ? `${Math.round(i * step * 1000)}ms`
                : "0ms";
              return (
                <tr key={f.id}>
                  <th
                    scope="row"
                    className={cn(
                      "rounded-l-2 py-2 pr-2 pl-2 text-left font-normal transition-colors duration-300",
                      wash,
                    )}
                    style={{ transitionDelay: delay }}
                  >
                    <span className="flex items-center gap-2">
                      {lockFor(f, i)}
                      <span className="min-w-0 leading-4 text-foreground">
                        {f.label}
                      </span>
                    </span>
                  </th>
                  {columns.map((p, c) => {
                    const isCurrent = p.id === currentId;
                    const isChosen = p.id === chosen?.id;
                    return (
                      <td
                        key={
                          compare === "all"
                            ? p.id
                            : isCurrent
                              ? "current"
                              : "chosen"
                        }
                        className={cn(
                          "px-2 py-2 transition-colors duration-300",
                          wash,
                          c === columns.length - 1 && "rounded-r-2",
                          compare === "all" &&
                            !isCurrent &&
                            !isChosen &&
                            "hidden @min-[40rem]:table-cell",
                          isChosen ? "text-foreground" : "text-ink-2",
                        )}
                        style={{ transitionDelay: delay }}
                      >
                        {compare === "all" || isCurrent ? (
                          <Value value={f.values[p.id]} />
                        ) : (
                          <RollCell
                            id={`${p.id}-${f.id}`}
                            motionSafe={motionSafe}
                          >
                            <Value value={f.values[p.id]} />
                          </RollCell>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  /* ------------------------------ the pickers ----------------------------- */

  const planOptions: RadioOption[] = choices.map((p) => ({
    id: p.id,
    name: p.badge ? `${p.name}, ${p.badge.toLowerCase()}` : p.name,
    content: (
      <>
        <span className="truncate" title={p.name}>
          {p.name}
        </span>
        {p.badge ? (
          <span className="shrink-0 rounded-full bg-cobalt-wash px-1.5 text-[10px] leading-4 font-medium text-cobalt-bright">
            {p.badge}
          </span>
        ) : null}
      </>
    ),
  }));

  const billingOptions: RadioOption[] = [
    { id: "monthly", name: "Monthly", content: "Monthly" },
    {
      id: "yearly",
      name: saving > 0 ? `Yearly, save ${saving}%` : "Yearly",
      content: (
        <>
          Yearly
          {saving > 0 ? (
            <span className="shrink-0 font-mono text-[10px] text-success">
              −{saving}%
            </span>
          ) : null}
        </>
      ),
    },
  ];

  const planCards = (
    <div
      role="radiogroup"
      aria-label="Plan"
      className="hidden gap-2 @min-[60rem]:grid"
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, plans.length)}, minmax(0, 1fr))`,
      }}
    >
      {plans.map((p) => {
        const isCurrent = p.id === currentId;
        const on = p.id === chosen?.id;
        const price = billing === "yearly" ? p.yearly : p.monthly;
        const body = (
          <>
            {on ? (
              <motion.span
                layoutId={`${uid}-card`}
                aria-hidden
                className={cn(
                  "absolute inset-0 rounded-3 border-2 transition-colors duration-300",
                  success ? "border-success" : "border-cobalt-bright",
                )}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-foreground">
                {p.name}
              </span>
              {isCurrent ? (
                <span className="rounded-full border border-hairline px-1.5 text-[10px] leading-4 text-ink-3">
                  Current
                </span>
              ) : p.badge ? (
                <span className="rounded-full bg-cobalt-wash px-1.5 text-[10px] leading-4 font-medium text-cobalt-bright">
                  {p.badge}
                </span>
              ) : null}
            </span>
            <span className="relative flex items-baseline gap-1">
              <Roll
                text={format(price)}
                motionSafe={motionSafe}
                className="text-[18px] font-semibold text-foreground"
              />
              <span className="text-[11px] text-ink-3">/ seat / mo</span>
            </span>
            {p.tagline ? (
              <span className="relative line-clamp-2 text-[11px] leading-4 text-ink-3">
                {p.tagline}
              </span>
            ) : null}
          </>
        );
        if (isCurrent) {
          return (
            <div
              key={p.id}
              className="relative grid content-start gap-1.5 rounded-3 border border-dashed border-hairline-strong p-3 opacity-80"
            >
              {body}
            </div>
          );
        }
        const at = choices.findIndex((c) => c.id === p.id);
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${p.name}, ${format(price)} per seat per month`}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => choosePlan(p.id)}
            onKeyDown={(event) => {
              const k = event.key;
              const d =
                k === "ArrowRight" || k === "ArrowDown"
                  ? 1
                  : k === "ArrowLeft" || k === "ArrowUp"
                    ? -1
                    : 0;
              if (!d && k !== "Home" && k !== "End") return;
              event.preventDefault();
              const i =
                k === "Home"
                  ? 0
                  : k === "End"
                    ? choices.length - 1
                    : (at + d + choices.length) % choices.length;
              const next = choices[i];
              if (!next) return;
              const parent = event.currentTarget.parentElement;
              choosePlan(next.id);
              parent
                ?.querySelector<HTMLButtonElement>(
                  `[data-plan-card="${next.id}"]`,
                )
                ?.focus();
            }}
            data-plan-card={p.id}
            className={cn(
              "relative grid content-start gap-1.5 rounded-3 border border-hairline bg-card p-3 text-left transition-colors",
              FOCUS,
              !on &&
                !locked &&
                "enabled:hover:border-hairline-strong enabled:hover:bg-surface-2",
              locked && "cursor-default",
              locked && !on && "opacity-60",
            )}
          >
            {body}
          </button>
        );
      })}
    </div>
  );

  const pickers = (
    <div className="grid gap-2">
      {planCards}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Plan"
          options={planOptions}
          value={chosen?.id ?? ""}
          pillId={`${uid}-plan`}
          disabled={disabled}
          locked={locked}
          motionSafe={motionSafe}
          onChange={choosePlan}
          className="min-w-0 flex-1 basis-56 @min-[60rem]:hidden"
        />
        {cycle === "both" ? (
          <Segmented
            label="Billing"
            options={billingOptions}
            value={billing}
            pillId={`${uid}-billing`}
            disabled={disabled}
            locked={locked}
            motionSafe={motionSafe}
            onChange={(id) =>
              chooseBilling(id === "monthly" ? "monthly" : "yearly")
            }
            className="min-w-0 flex-1 basis-48 @min-[60rem]:max-w-72"
          />
        ) : (
          <p className="inline-flex h-10 items-center rounded-3 border border-dashed border-hairline px-3 text-[12px] text-ink-2">
            Billed {cycle}
          </p>
        )}
      </div>
    </div>
  );

  /* ------------------------------- the buy -------------------------------- */

  const total = format(amount);
  const perSeatText = format(perSeat);
  const buttonLabels: Record<UpgradeState, React.ReactNode> = {
    idle: trial
      ? `Start ${Math.round(trialDays)}-day free trial`
      : `Upgrade · ${total}`,
    pending: (
      <>
        <LoaderCircle
          aria-hidden
          className={cn("size-4 shrink-0", motionSafe && "animate-spin")}
        />
        {trial ? "Starting trial…" : "Processing…"}
      </>
    ),
    success: (
      <>
        <motion.span
          className="inline-flex"
          initial={motionSafe ? { scale: 0.5 } : false}
          animate={{ scale: 1 }}
          transition={motionSafe ? springs.recoil : { duration: 0 }}
        >
          <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-4">
            <motion.path
              d="M3.5 8.4 6.6 11.4 12.5 4.8"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={
                motionSafe ? { ...springs.flick, delay: 0.08 } : { duration: 0 }
              }
            />
          </svg>
        </motion.span>
        {trial ? "Trial started" : `You're on ${chosen?.name ?? "it"}`}
      </>
    ),
    error: "Try again",
  };

  const buyButton = (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={locked || undefined}
      onClick={() => void purchase()}
      className={cn(
        "relative inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-2 px-4 text-[13px] font-medium text-primary-foreground transition-[background-color,filter,opacity] duration-300",
        !locked && "enabled:hover:brightness-110",
        "disabled:opacity-50 aria-disabled:cursor-default",
        success ? "" : "bg-primary",
        FOCUS,
      )}
      style={success ? { background: PIGMENT } : undefined}
    >
      <span className="inline-grid items-center">
        {(Object.keys(buttonLabels) as UpgradeState[]).map((key) => (
          <span
            key={key}
            aria-hidden={key !== state || undefined}
            className={cn(
              "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-opacity",
              key === state ? "opacity-100" : "opacity-0",
            )}
          >
            {key === "success" && state !== "success" ? (
              <>
                <span className="size-4" />
                {trial ? "Trial started" : `You're on ${chosen?.name ?? "it"}`}
              </>
            ) : (
              buttonLabels[key]
            )}
          </span>
        ))}
      </span>
    </button>
  );

  const finePrint = trial
    ? `Cancel before ${dateOf(firstCharge)} and you won't be charged. We email you ${Math.max(0, Math.round(reminderDays))} days ahead.`
    : "Billed today. Cancel any time from Settings.";

  const priceBlock = (
    <div className="grid gap-1">
      <div className="flex items-baseline gap-1.5">
        <Roll
          text={perSeatText}
          motionSafe={motionSafe}
          className="text-[30px] font-semibold tracking-[-0.02em] text-foreground"
        />
        <span className="text-[12px] text-ink-3">/ seat / month</span>
      </div>
      <p className="text-[12px] text-ink-2">
        <Roll
          text={total}
          motionSafe={motionSafe}
          className="text-[12px] text-foreground"
        />{" "}
        {billing === "yearly" ? "a year" : "a month"} for {seatCount}{" "}
        {seatCount === 1 ? "seat" : "seats"}
      </p>
    </div>
  );

  const timelineNode =
    timeline === "none" ? (
      <p className="flex items-center gap-2 rounded-3 border border-hairline px-3 py-2.5 text-[12px] text-ink-2">
        <Sparkles aria-hidden className="size-4 shrink-0 text-cobalt-bright" />
        No trial: {total} today, then every{" "}
        {billing === "yearly" ? "year" : "month"}.
      </p>
    ) : (
      <Timeline
        kind={timeline}
        sweep={sweep}
        today={today}
        trialDays={trialDays}
        reminderDays={reminderDays}
        charge={total}
        success={success}
        motionSafe={motionSafe}
      />
    );

  /* --------------------------------- render -------------------------------- */

  if (status !== "ready") {
    return (
      <div
        role="region"
        aria-labelledby={titleId}
        aria-busy={status === "loading" || undefined}
        className={cn(
          "@container grid h-[560px] w-full place-items-center overflow-clip rounded-4 border border-hairline bg-card p-6 text-foreground",
          className,
        )}
      >
        {status === "loading" ? (
          <div className="grid w-full max-w-md gap-3">
            <p id={titleId} className="sr-only">
              Loading plans
            </p>
            <span className="h-4 w-56 max-w-full animate-pulse rounded-1 bg-surface-2" />
            <span className="h-3 w-72 max-w-full animate-pulse rounded-1 bg-surface-2" />
            <span className="h-10 animate-pulse rounded-3 bg-surface-2" />
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-6 animate-pulse rounded-1 bg-surface-2"
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p id={titleId} className="text-[13px] text-foreground">
              Couldn&apos;t load the plans.
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors enabled:hover:bg-surface-2",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* The columns answer to the root's width: a container query only
          sees ancestors, so the grid is a child of the container. */}
      <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] @min-[40rem]:grid-cols-[minmax(0,1fr)_17rem] @min-[60rem]:grid-cols-[minmax(0,1fr)_21rem]">
        <motion.div
          layoutScroll
          className="col-start-1 row-start-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain @min-[40rem]:row-span-2"
        >
          <div className="grid gap-5 p-4 @min-[40rem]:p-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-3 bg-cobalt-wash text-cobalt-bright"
              >
                <Sparkles className="size-4" />
              </span>
              <div className="grid min-w-0 flex-1 gap-1">
                <h2
                  id={titleId}
                  className="text-[16px] leading-5 font-semibold text-foreground"
                >
                  {title}
                </h2>
                {subtitle ? (
                  <p className="text-[13px] leading-5 text-ink-2">{subtitle}</p>
                ) : null}
              </div>
              {onDismiss ? (
                <button
                  type="button"
                  aria-label="Not now"
                  disabled={disabled}
                  onClick={onDismiss}
                  className={cn(
                    "-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-2 text-ink-3 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
            {pickers}
            {comparison}
            <div className="grid gap-3 @min-[40rem]:hidden">
              <p className="text-[12px] font-medium text-ink-2">
                {trial ? `Your ${Math.round(trialDays)}-day trial` : "Billing"}
              </p>
              {timelineNode}
            </div>
          </div>
        </motion.div>

        <div className="col-start-2 row-start-1 hidden [scrollbar-width:thin] overflow-y-auto overscroll-contain border-l border-hairline bg-surface-1 @min-[40rem]:block">
          <div className="grid gap-5 p-5">
            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-foreground">
                  <RollCell id={chosen?.id ?? "-"} motionSafe={motionSafe}>
                    {chosen?.name}
                  </RollCell>
                </span>
                {chosen?.badge ? (
                  <span className="rounded-full bg-cobalt-wash px-1.5 text-[10px] leading-4 font-medium text-cobalt-bright">
                    {chosen.badge}
                  </span>
                ) : null}
              </div>
              {chosen?.tagline ? (
                <p className="text-[12px] leading-4 text-ink-3">
                  {chosen.tagline}
                </p>
              ) : null}
            </div>
            {priceBlock}
            <div className="grid gap-3">
              <p className="text-[12px] font-medium text-ink-2">
                {trial ? `Your ${Math.round(trialDays)}-day trial` : "Billing"}
              </p>
              {timelineNode}
            </div>
          </div>
        </div>

        <div className="col-start-1 row-start-2 grid gap-2 border-t border-hairline bg-card p-3 @min-[40rem]:col-start-2 @min-[40rem]:border-t-0 @min-[40rem]:border-l @min-[40rem]:bg-surface-1 @min-[40rem]:px-5 @min-[40rem]:pt-0 @min-[40rem]:pb-5">
          <div className="flex items-center gap-3">
            <div className="grid shrink-0 gap-0.5 @min-[40rem]:hidden">
              <span className="flex items-baseline gap-1">
                <Roll
                  text={perSeatText}
                  motionSafe={motionSafe}
                  className="text-[16px] font-semibold text-foreground"
                />
                <span className="text-[11px] text-ink-3">/ seat / mo</span>
              </span>
              <span className="text-[11px] text-ink-3">
                {total} {trial ? `on ${dateOf(firstCharge)}` : "today"}
              </span>
            </div>
            {buyButton}
          </div>
          <AnimatePresence initial={false}>
            {state === "error" && failure ? (
              <motion.p
                key={failure}
                role="alert"
                className="flex items-start gap-1.5 text-[12px] leading-4 text-danger"
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  y: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast, ease: easings.enter },
                }}
              >
                <TriangleAlert
                  aria-hidden
                  className="mt-px size-3.5 shrink-0"
                />
                {failure}
              </motion.p>
            ) : null}
          </AnimatePresence>
          <p className="hidden text-[11px] leading-4 text-ink-3 @min-[40rem]:block">
            {finePrint}
          </p>
        </div>
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
