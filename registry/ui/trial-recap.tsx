"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  ArrowRight,
  CalendarPlus,
  MessageCircle,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

/** What the workspace did during its trial. */
export type TrialUsage = {
  /** Projects created. */
  projects: number;
  /** Teammates invited. */
  invited: number;
  /** Seats in use (the inviter included). */
  seats: number;
  /** Hours saved, by the workspace's own automations report. */
  hoursSaved: number;
  /** Teams the projects belong to. */
  teams?: number;
};

export type TrialPlan = {
  id: string;
  name: string;
  /** Price per seat per month. */
  price: number;
  /** Most seats the plan holds; null for no limit. */
  seats: number | null;
  /** Most projects the plan holds; null for no limit. */
  projects: number | null;
  /** One line on who it is for. */
  blurb: string;
};

export type TrialRecommendation = { planId: string; reason: string } | null;
export type TrialRingStyle = "solid" | "days" | "ticks";
export type TrialDensity = "compact" | "regular" | "roomy";
export type TrialTone = "calm" | "urgent" | "quiet";
export type TrialRecapStatus = "ready" | "loading" | "error";

export type TrialRecapProps = {
  /** What the workspace did. @default defaultTrialUsage (23 projects, 13 invited, 14 seats, 61 hours) */
  usage?: TrialUsage;
  /** The plans offered, cheapest first. @default defaultTrialPlans (Starter, Team, Business) */
  plans?: TrialPlan[];
  /** The moment days are counted from, in ms; never the wall clock. @default defaultTrialNow */
  now?: number;
  /** When the trial ends, in ms. @default seven days after now */
  endsAt?: number;
  /** How long the trial runs, in days; the ring goes round once for it. @default 14 */
  trialDays?: number;
  /** Controlled: the chosen plan's id. */
  value?: string;
  /** Initial plan when uncontrolled. @default the plan that fits */
  defaultValue?: string;
  /** Fires from the click or key that chose another plan. */
  onValueChange?: (planId: string) => void;
  /** The call to action was pressed, with the plan and its monthly total. */
  onChoosePlan?: (plan: TrialPlan, total: number) => void;
  /** "Extend" was pressed. */
  onExtend?: () => void;
  /** "Talk to us" was pressed. */
  onTalk?: () => void;
  /** Picks the plan that fits and says why. @default the cheapest plan that holds your seats and projects */
  recommend?: (usage: TrialUsage, plans: TrialPlan[]) => TrialRecommendation;
  /** Days an extension asks for. @default 7 */
  extendDays?: number;
  /** The workspace's name. @default "Fieldline" */
  workspace?: string;
  /** The days-left ring: one arc, one segment per trial day, or a dial of fine ticks. @default "solid" */
  ringStyle?: TrialRingStyle;
  /** Padding, gaps, ring and type size. @default "regular" */
  density?: TrialDensity;
  /** The voice and colour: calm cobalt, urgent amber, or quiet graphite. @default "calm" */
  tone?: TrialTone;
  /** Formats a price. @default US dollars, cents only when there are some */
  formatPrice?: (amount: number) => string;
  /** Whether the recap has arrived. @default "ready" */
  status?: TrialRecapStatus;
  /** "Try again" was pressed after the recap failed to load. */
  onRetry?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                  Defaults                                */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** Morning of day seven of a fourteen-day trial. */
export const defaultTrialNow = Date.UTC(2026, 9, 12, 9, 0);

export const defaultTrialUsage: TrialUsage = {
  projects: 23,
  invited: 13,
  seats: 14,
  hoursSaved: 61,
  teams: 4,
};

export const defaultTrialPlans: TrialPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 6,
    seats: 10,
    projects: 5,
    blurb: "For a small team finding its feet.",
  },
  {
    id: "team",
    name: "Team",
    price: 12,
    seats: 50,
    projects: 50,
    blurb: "Shared roadmaps, guests and version history.",
  },
  {
    id: "business",
    name: "Business",
    price: 20,
    seats: null,
    projects: null,
    blurb: "Single sign-on, audit log and priority support.",
  },
];

/** The cheapest plan that holds the workspace, and the number that decided it. */
export function recommendTrialPlan(
  usage: TrialUsage,
  plans: TrialPlan[],
): TrialRecommendation {
  const fits = (p: TrialPlan) =>
    (p.seats === null || p.seats >= usage.seats) &&
    (p.projects === null || p.projects >= usage.projects);
  const sorted = [...plans].sort((a, b) => a.price - b.price);
  const pick = sorted.find(fits);
  if (!pick) return null;
  const below = sorted.filter((p) => p.price < pick.price);
  const short = below[below.length - 1];
  if (!short) {
    return {
      planId: pick.id,
      reason: `Covers your ${usage.seats} seats and ${usage.projects} projects`,
    };
  }
  if (short.seats !== null && short.seats < usage.seats) {
    return { planId: pick.id, reason: `Based on your ${usage.seats} seats` };
  }
  return {
    planId: pick.id,
    reason: `Based on your ${usage.projects} projects`,
  };
}

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const TONES: Record<TrialTone, string> = {
  calm: "var(--accent-bright)",
  urgent: "var(--warn)",
  quiet: "var(--ink-2)",
};

const DENSITY: Record<
  TrialDensity,
  { pad: string; gap: string; ring: number; stat: string; card: string }
> = {
  compact: {
    pad: "p-3",
    gap: "gap-3",
    ring: 112,
    stat: "text-lg",
    card: "p-2.5",
  },
  regular: {
    pad: "p-4",
    gap: "gap-4",
    ring: 136,
    stat: "text-xl",
    card: "p-3",
  },
  roomy: {
    pad: "p-5",
    gap: "gap-5",
    ring: 156,
    stat: "text-2xl",
    card: "p-3.5",
  },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const whole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});
const dollars = (n: number) =>
  Number.isInteger(n) ? whole.format(n) : cents.format(n);

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

const WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];
const daysWord = (n: number) =>
  `${n <= 10 ? (WORDS[n] ?? String(n)) : n} ${n === 1 ? "day" : "days"}`;

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
  delay?: number;
};

const f3 = (v: number) => Number(v.toFixed(3));
const r5 = (v: number) => Math.round(v * 100000) / 100000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** An arc from angle a to b (radians, 0 at the top, clockwise) as a path. */
function arc(cx: number, cy: number, r: number, a: number, b: number) {
  const p = (t: number) =>
    `${f3(cx + r * Math.sin(t))} ${f3(cy - r * Math.cos(t))}`;
  const large = b - a > Math.PI ? 1 : 0;
  return `M ${p(a)} A ${r} ${r} 0 ${large} 1 ${p(b)}`;
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/**
 * One odometer wheel. The units wheel turns with the value; every wheel
 * above it holds still and only rolls over as the wheel below it passes 9,
 * the way a mechanical counter does.
 */
function Wheel({
  value,
  place,
}: {
  value: MotionValue<number>;
  place: number;
}) {
  const unit = 10 ** place;
  const y = useTransform(value, (v) => {
    const n = Math.max(0, v);
    let pos: number;
    if (place === 0) pos = n % 10;
    else {
      const base = Math.floor(n / unit);
      const lower = n - base * unit;
      pos = (base % 10) + clamp01(lower - (unit - 1));
    }
    return `${f3((-pos / 11) * 100)}%`;
  });
  const opacity = useTransform(value, (v) =>
    place === 0 || v >= unit - 0.5 ? 1 : 0,
  );
  return (
    <span
      className="relative inline-block overflow-clip"
      style={{ width: "1ch", height: "1em", lineHeight: 1 }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ y, opacity }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
          <span key={i} style={{ height: "1em", lineHeight: 1 }}>
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Count({
  value,
  final,
  className,
}: {
  value: MotionValue<number>;
  final: number;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(final))).length;
  return (
    <span className={cn("relative inline-flex tabular-nums", className)}>
      <span className="sr-only">{Math.round(final)}</span>
      <span aria-hidden className="inline-flex">
        {Array.from({ length: digits }, (_, i) => (
          <Wheel key={digits - 1 - i} value={value} place={digits - 1 - i} />
        ))}
      </span>
    </span>
  );
}

/** A short label whose text rolls up or down on snap when it changes. */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  return (
    <span className="relative inline-grid overflow-clip">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={text}
          className="inline-block whitespace-nowrap tabular-nums [grid-area:1/1]"
          initial={{ opacity: 0, y: motionSafe ? "60%" : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? "-60%" : 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Ring({
  look,
  progress,
  share,
  total,
  size,
  expired,
}: {
  look: TrialRingStyle;
  progress: MotionValue<number>;
  share: number;
  total: number;
  size: number;
  expired: boolean;
}) {
  const C = 2 * Math.PI * 52;
  const dash = useTransform(progress, (p) => f3(C * (1 - clamp01(p))));
  const segments = Math.max(1, Math.min(31, Math.round(total)));
  const gap = segments > 1 ? Math.min(0.08, (Math.PI * 2) / segments / 4) : 0;
  const TICKS = 56;
  const lit = useTransform(progress, (p) => Math.round(clamp01(p) * TICKS));
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 120"
      className="block shrink-0"
      style={{ width: size, height: size }}
    >
      {look === "solid" ? (
        <g transform="rotate(-90 60 60)">
          <circle
            cx={60}
            cy={60}
            r={52}
            fill="none"
            strokeWidth={8}
            className="stroke-surface-2"
            strokeDasharray={expired ? "3 5" : undefined}
          />
          <motion.circle
            cx={60}
            cy={60}
            r={52}
            fill="none"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={f3(C)}
            className={share > 0 ? "opacity-100" : "opacity-0"}
            style={{
              strokeDashoffset: dash,
              stroke: "oklch(from var(--tr-tone) 0.66 c h)",
            }}
          />
        </g>
      ) : look === "days" ? (
        Array.from({ length: segments }, (_, i) => {
          const a = (i / segments) * Math.PI * 2 + gap / 2;
          const b = ((i + 1) / segments) * Math.PI * 2 - gap / 2;
          return (
            <Segment
              key={i}
              d={arc(60, 60, 52, a, b)}
              index={i}
              segments={segments}
              progress={progress}
            />
          );
        })
      ) : (
        Array.from({ length: TICKS }, (_, i) => {
          const t = (i / TICKS) * Math.PI * 2;
          const long = i % 4 === 0;
          const r1 = long ? 43 : 46;
          return (
            <Tick
              key={i}
              index={i}
              lit={lit}
              x1={f3(60 + r1 * Math.sin(t))}
              y1={f3(60 - r1 * Math.cos(t))}
              x2={f3(60 + 55 * Math.sin(t))}
              y2={f3(60 - 55 * Math.cos(t))}
              long={long}
            />
          );
        })
      )}
    </svg>
  );
}

function Segment({
  d,
  index,
  segments,
  progress,
}: {
  d: string;
  index: number;
  segments: number;
  progress: MotionValue<number>;
}) {
  // A day lights as the sweep passes its middle.
  const on = useTransform(progress, (p) =>
    p * segments >= index + 0.5 ? 1 : 0,
  );
  return (
    <>
      <path
        d={d}
        fill="none"
        strokeWidth={8}
        strokeLinecap="butt"
        className="stroke-surface-2"
      />
      <motion.path
        d={d}
        fill="none"
        strokeWidth={8}
        strokeLinecap="butt"
        style={{ opacity: on, stroke: "oklch(from var(--tr-tone) 0.66 c h)" }}
      />
    </>
  );
}

function Tick({
  index,
  lit,
  x1,
  y1,
  x2,
  y2,
  long,
}: {
  index: number;
  lit: MotionValue<number>;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  long: boolean;
}) {
  const on = useTransform(lit, (n) => (index < n ? 1 : 0.18));
  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      strokeWidth={long ? 2.4 : 1.6}
      strokeLinecap="round"
      style={{ opacity: on, stroke: "oklch(from var(--tr-tone) 0.62 c h)" }}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The screen                               */
/* ----------------------------------------------------------------------- */

/**
 * The screen a workspace sees as its trial runs out: what the team did with
 * it beside the plans. On arrival the days-left ring sweeps to its share on
 * drift while the day count rolls up, the recap's counts roll up on odometer
 * wheels in cascade on glide — the units wheel spins, each wheel above it
 * turns only as the one below rolls over — and as they settle the plan that
 * fits the workspace's actual usage rises on glide and its reason chip
 * stamps in on recoil ("Based on your 14 seats").
 *
 * The plans are a radiogroup: arrows move the choice, the call to action
 * rolls its monthly total on snap, and Extend and Talk to us sit under it.
 * An expired trial changes the copy and empties the ring. Under reduced
 * motion every number and the raised plan are simply there.
 */
export function TrialRecap({
  usage = defaultTrialUsage,
  plans = defaultTrialPlans,
  now = defaultTrialNow,
  endsAt,
  trialDays = 14,
  value,
  defaultValue,
  onValueChange,
  onChoosePlan,
  onExtend,
  onTalk,
  recommend = recommendTrialPlan,
  extendDays = 7,
  workspace = "Fieldline",
  ringStyle = "solid",
  density = "regular",
  tone = "calm",
  formatPrice = dollars,
  status = "ready",
  onRetry,
  disabled = false,
  className,
}: TrialRecapProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const plansId = `${uid}-plans`;
  const d = DENSITY[density] ?? DENSITY.regular;
  const toneColor = TONES[tone] ?? TONES.calm;
  const ready = status === "ready";

  const end = endsAt ?? now + 7 * DAY;
  const span = Math.max(1, Math.round(trialDays));
  const left = Math.max(0, Math.ceil((end - now) / DAY));
  const expired = end <= now;
  const ago = expired ? Math.max(0, Math.floor((now - end) / DAY)) : 0;
  const share = expired ? 0 : clamp01(left / span);

  const pick = recommend(usage, plans);
  const fitId = pick?.planId;
  const [own, setOwn] = React.useState<string | undefined>(
    () => defaultValue ?? fitId ?? plans[0]?.id,
  );
  const chosenId = value ?? own ?? fitId ?? plans[0]?.id;
  const chosen = plans.find((p) => p.id === chosenId) ?? plans[0];
  const total = chosen ? chosen.price * usage.seats : 0;

  /* ------------------------------ arrival ------------------------------- */

  const ring = useMotionValue(share);
  const dayCount = useMotionValue(left);
  const projects = useMotionValue(usage.projects);
  const invited = useMotionValue(usage.invited);
  const hours = useMotionValue(usage.hoursSaved);
  const raise = useMotionValue(1);
  const stamp = useMotionValue(1);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // The server paints the finished screen. In the browser the numbers start
  // from nothing and arrive the first time the screen is seen; a re-run
  // (StrictMode, new numbers) finishes the old arrival and plays again.
  React.useLayoutEffect(() => {
    const finals: [MotionValue<number>, number][] = [
      [ring, share],
      [dayCount, left],
      [projects, usage.projects],
      [invited, usage.invited],
      [hours, usage.hoursSaved],
      [raise, 1],
      [stamp, 1],
    ];
    const settle = () => {
      for (const [mv, v] of finals) mv.jump(v);
    };
    const node = rootRef.current;
    if (
      !motionSafe ||
      !ready ||
      !node ||
      typeof IntersectionObserver === "undefined"
    ) {
      settle();
      return;
    }
    for (const [mv] of finals) mv.jump(0);
    let running: AnimationPlaybackControls[] = [];
    const drive = (mv: MotionValue<number>, to: number, transition: Spring) =>
      animate(0, to, {
        ...transition,
        onUpdate: (v: number) => mv.set(r5(v)),
      });
    const play = () => {
      const step = cascade(3);
      running = [
        drive(ring, share, springs.drift),
        drive(dayCount, left, springs.drift),
        drive(projects, usage.projects, { ...springs.glide, delay: 0.08 }),
        drive(invited, usage.invited, { ...springs.glide, delay: 0.08 + step }),
        drive(hours, usage.hoursSaved, {
          ...springs.glide,
          delay: 0.08 + step * 2,
        }),
        drive(raise, 1, { ...springs.glide, delay: 0.36 }),
        drive(stamp, 1, { ...springs.recoil, delay: 0.5 }),
      ];
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        play();
      },
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      for (const c of running) c.stop();
      running = [];
      settle();
    };
  }, [
    motionSafe,
    ready,
    share,
    left,
    usage.projects,
    usage.invited,
    usage.hoursSaved,
    ring,
    dayCount,
    projects,
    invited,
    hours,
    raise,
    stamp,
  ]);

  const lift = useTransform(raise, (v) => f3(-6 * v));
  const liftShadow = useTransform(raise, (v) => f3(v));
  const stampScale = useTransform(stamp, (v) => f3(0.6 + 0.4 * v));
  const stampOpacity = useTransform(stamp, (v) => f3(clamp01(v * 1.6)));

  /* ------------------------------- choose ------------------------------- */

  const cardNodes = React.useRef(new Map<string, HTMLDivElement>());
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const choose = (id: string, focus = false) => {
    if (disabled || id === chosenId) {
      if (focus) cardNodes.current.get(id)?.focus();
      return;
    }
    if (value === undefined) setOwn(id);
    onValueChange?.(id);
    const plan = plans.find((p) => p.id === id);
    if (plan) {
      setSaid((s) => ({
        n: s.n + 1,
        text: `${plan.name} chosen, ${formatPrice(plan.price * usage.seats)} a month for ${usage.seats} seats.`,
      }));
    }
    if (focus) cardNodes.current.get(id)?.focus();
  };

  const onPlanKey = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = (index + 1) % plans.length;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = (index - 1 + plans.length) % plans.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = plans.length - 1;
        break;
      case " ":
      case "Enter": {
        event.preventDefault();
        const p = plans[index];
        if (p) choose(p.id);
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    const p = plans[next];
    if (p) choose(p.id, true);
  };

  /* -------------------------------- copy -------------------------------- */

  const used = Math.max(0, span - left);
  const head = (() => {
    if (expired) {
      if (tone === "urgent")
        return {
          line: <>Your trial has ended</>,
          sub: `${usage.projects} projects are read-only until you choose a plan.`,
        };
      if (tone === "quiet")
        return {
          line: (
            <>
              Trial ended ·{" "}
              {ago === 0 ? "today" : `${ago} ${ago === 1 ? "day" : "days"} ago`}
            </>
          ),
          sub: "Choose a plan to keep working.",
        };
      return {
        line: (
          <>
            Your trial ended{" "}
            {ago === 0 ? "today" : `${ago} ${ago === 1 ? "day" : "days"} ago`}
          </>
        ),
        sub: "Your projects are safe. Choose a plan to pick up where you left off.",
      };
    }
    if (tone === "urgent") {
      return {
        line: (
          <>
            Your trial ends in{" "}
            <strong className="font-semibold text-(--tr-tone)">
              {left} {left === 1 ? "day" : "days"}
            </strong>
          </>
        ),
        sub: `Pick a plan to keep ${usage.projects} projects running.`,
      };
    }
    if (tone === "quiet") {
      return {
        line: (
          <>
            Trial · {left} {left === 1 ? "day" : "days"} left
          </>
        ),
        sub: "A summary of your workspace so far.",
      };
    }
    return {
      line: <>{daysWord(left)} left in your trial</>,
      sub: `Here is what your team did with the first ${used} ${used === 1 ? "day" : "days"}.`,
    };
  })();

  const stats: {
    key: string;
    label: string;
    value: MotionValue<number>;
    final: number;
    note: string;
  }[] = [
    {
      key: "projects",
      label: "Projects created",
      value: projects,
      final: usage.projects,
      note: usage.teams ? `across ${usage.teams} teams` : "in this workspace",
    },
    {
      key: "invited",
      label: "Teammates invited",
      value: invited,
      final: usage.invited,
      note: `${usage.seats} seats in use`,
    },
    {
      key: "hours",
      label: "Hours saved",
      value: hours,
      final: usage.hoursSaved,
      note: "from automations",
    },
  ];

  const limitLine = (p: TrialPlan) =>
    [
      p.seats === null ? "Any number of seats" : `Up to ${p.seats} seats`,
      p.projects === null ? "unlimited projects" : `${p.projects} projects`,
    ].join(" · ");

  /* ------------------------------- render ------------------------------- */

  const body = () => {
    if (status === "error") {
      return (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The trial summary did not load.
          </p>
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
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className={cn("flex flex-1 flex-col overflow-y-auto", d.pad, d.gap)}
        >
          <p className="sr-only">Loading the trial summary.</p>
          <div className="flex items-center gap-4">
            <span className="size-24 shrink-0 rounded-full border-8 border-surface-2" />
            <div className="flex flex-1 flex-col gap-2">
              <span className="h-4 w-3/4 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              <span className="h-3 w-1/2 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            </div>
          </div>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-16 rounded-3 bg-surface-2 motion-safe:animate-pulse"
            />
          ))}
        </div>
      );
    }
    return (
      <div className={cn("flex-1 overflow-y-auto overscroll-contain", d.pad)}>
        <div
          className={cn(
            "grid grid-cols-1 @min-[40rem]:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]",
            d.gap,
            "@min-[40rem]:gap-6",
          )}
        >
          <section
            aria-labelledby={titleId}
            className={cn("flex flex-col", d.gap)}
          >
            <div>
              <h2
                id={titleId}
                className="text-lg leading-snug font-semibold tracking-tight text-balance"
              >
                {head.line}
              </h2>
              <p className="mt-1 text-[13px] text-ink-2">{head.sub}</p>
            </div>
            <div className="flex items-center gap-4">
              <div
                role="img"
                aria-label={
                  expired ? "Trial ended" : `${left} of ${span} days left`
                }
                className="relative shrink-0"
              >
                <span className="block @min-[40rem]:hidden">
                  <Ring
                    look={ringStyle}
                    progress={ring}
                    share={share}
                    total={span}
                    size={Math.round(d.ring * 0.72)}
                    expired={expired}
                  />
                </span>
                <span className="hidden @min-[40rem]:block">
                  <Ring
                    look={ringStyle}
                    progress={ring}
                    share={share}
                    total={span}
                    size={d.ring}
                    expired={expired}
                  />
                </span>
                <span
                  aria-hidden
                  className="absolute inset-0 flex flex-col items-center justify-center"
                >
                  <Count
                    value={dayCount}
                    final={left}
                    className={cn(
                      "leading-none font-semibold tracking-tight",
                      d.stat,
                    )}
                  />
                  <span className="mt-1 text-[10px] text-ink-3 @min-[40rem]:text-[11px]">
                    {expired
                      ? "trial over"
                      : left === 1
                        ? "day left"
                        : "days left"}
                  </span>
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">
                  {expired
                    ? "Trial over"
                    : `Day ${Math.min(span, used + 1)} of ${span}`}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-3">
                  {expired
                    ? `Ended ${dayLabel(end)}. Your projects are kept.`
                    : `Ends ${dayLabel(end)}. Nothing is charged until you choose.`}
                </p>
              </div>
            </div>
            <dl
              className={cn(
                "flex min-w-0 flex-col",
                density === "roomy" ? "gap-2.5" : "gap-2",
              )}
            >
              {stats.map((s) => (
                <div
                  key={s.key}
                  className={cn(
                    "flex min-w-0 items-center justify-between gap-3 rounded-3 border border-hairline bg-surface-1",
                    density === "compact" ? "px-2.5 py-1.5" : "px-3 py-2",
                  )}
                >
                  <dt className="min-w-0">
                    <span className="block truncate text-[12px] text-ink-2">
                      {s.label}
                    </span>
                    <span className="block truncate text-[11px] text-ink-3">
                      {s.note}
                    </span>
                  </dt>
                  <dd className="shrink-0">
                    <Count
                      value={s.value}
                      final={s.final}
                      className={cn(
                        "leading-none font-semibold tracking-tight",
                        d.stat,
                      )}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            aria-labelledby={plansId}
            className={cn(
              "flex flex-col",
              density === "compact" ? "gap-2" : "gap-3",
            )}
          >
            <p
              id={plansId}
              className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              Choose a plan
            </p>
            <div
              role="radiogroup"
              aria-labelledby={plansId}
              className={cn(
                "flex flex-col",
                density === "roomy" ? "gap-3" : "gap-2",
              )}
            >
              {plans.map((p, i) => {
                const on = p.id === chosenId;
                const fit = p.id === fitId;
                const reasonId = `${uid}-reason-${p.id}`;
                return (
                  <motion.div
                    key={p.id}
                    ref={(node: HTMLDivElement | null) => {
                      if (node) cardNodes.current.set(p.id, node);
                      else cardNodes.current.delete(p.id);
                    }}
                    role="radio"
                    aria-checked={on}
                    aria-describedby={fit && pick ? reasonId : undefined}
                    aria-disabled={disabled || undefined}
                    tabIndex={on ? 0 : -1}
                    onClick={() => choose(p.id)}
                    onKeyDown={(e) => onPlanKey(e, i)}
                    style={fit ? { y: motionSafe ? lift : -6 } : undefined}
                    className={cn(
                      "relative flex cursor-pointer items-start gap-3 rounded-3 border text-left transition-colors",
                      d.card,
                      on
                        ? "border-[color-mix(in_oklab,var(--tr-tone)_60%,transparent)] bg-[color-mix(in_oklab,var(--tr-pigment)_7%,var(--card))]"
                        : "border-hairline bg-card hover:border-hairline-strong",
                      disabled && "cursor-not-allowed",
                      FOCUS_RING,
                    )}
                  >
                    {fit ? (
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[0_10px_26px_color-mix(in_oklab,black_14%,transparent)]"
                        style={{ opacity: liftShadow }}
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className={cn(
                        "relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                        on ? "border-(--tr-tone)" : "border-hairline-strong",
                      )}
                    >
                      <motion.span
                        className="size-2 rounded-full bg-(--tr-pigment)"
                        initial={false}
                        animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
                        transition={
                          motionSafe
                            ? springs.snap
                            : { duration: durations.fast }
                        }
                      />
                    </span>
                    <span className="relative flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-semibold">
                          {p.name}
                        </span>
                        {fit ? (
                          <motion.span
                            className="inline-flex h-5 items-center rounded-full bg-[color-mix(in_oklab,var(--tr-pigment)_16%,transparent)] px-1.5 text-[10px] font-medium text-(--tr-tone)"
                            style={
                              motionSafe
                                ? { scale: stampScale, opacity: stampOpacity }
                                : undefined
                            }
                          >
                            Fits your usage
                          </motion.span>
                        ) : null}
                        <span className="ml-auto text-[13px] font-semibold tabular-nums">
                          {formatPrice(p.price)}
                          <span className="text-[11px] font-normal text-ink-3">
                            {" "}
                            /seat/mo
                          </span>
                        </span>
                      </span>
                      <span className="text-[12px] text-ink-2">{p.blurb}</span>
                      <span className="text-[11px] text-ink-3">
                        {limitLine(p)}
                      </span>
                      {fit && pick ? (
                        <span
                          id={reasonId}
                          className="mt-0.5 text-[11px] font-medium text-(--tr-tone)"
                        >
                          {pick.reason}
                        </span>
                      ) : null}
                    </span>
                  </motion.div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!disabled && chosen) onChoosePlan?.(chosen, total);
              }}
              aria-disabled={disabled || undefined}
              aria-label={
                chosen
                  ? `${expired ? "Choose" : "Continue with"} ${chosen.name}, ${formatPrice(total)} a month`
                  : undefined
              }
              className={cn(
                "mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-3 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
                FOCUS_RING,
              )}
            >
              <span className="whitespace-nowrap">
                <span className="@max-[22rem]:hidden">
                  {expired ? "Keep my work on " : "Continue with "}
                </span>
                {chosen?.name}
              </span>
              <span aria-hidden className="opacity-60">
                ·
              </span>
              <Rolling
                text={`${formatPrice(total)}/mo`}
                motionSafe={motionSafe}
              />
              <ArrowRight aria-hidden className="size-4 shrink-0" />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (!disabled) onExtend?.();
                }}
                aria-disabled={disabled || undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <CalendarPlus aria-hidden className="size-3.5 shrink-0" />
                {expired
                  ? `Ask for ${extendDays} more days`
                  : `Extend ${extendDays} days`}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!disabled) onTalk?.();
                }}
                aria-disabled={disabled || undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <MessageCircle aria-hidden className="size-3.5 shrink-0" />
                Talk to us
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          "--tr-tone": toneColor,
          "--tr-pigment": `oklch(from ${toneColor} 0.66 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-2 bg-[color-mix(in_oklab,var(--tr-pigment)_16%,var(--card))] text-[11px] font-semibold text-(--tr-tone)"
          >
            {workspace.charAt(0)}
          </span>
          <span className="truncate text-sm font-semibold">{workspace}</span>
          <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-hairline px-2 text-[11px] text-ink-2">
            Trial
          </span>
        </div>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 font-mono text-[11px] tabular-nums",
            expired
              ? "bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger"
              : "bg-[color-mix(in_oklab,var(--tr-pigment)_12%,transparent)] text-(--tr-tone)",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              expired ? "bg-danger" : "bg-(--tr-pigment)",
            )}
          />
          {expired ? `Ended ${dayLabel(end)}` : `Ends ${dayLabel(end)}`}
        </span>
      </header>
      {body()}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
