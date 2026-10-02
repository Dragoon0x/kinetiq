"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";
import {
  Check,
  Download,
  Layers,
  Plus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BillingStack = "fan" | "wallet" | "none";
export type BillingEstimate = "total" | "itemized";
export type BillingDensity = "compact" | "regular" | "comfortable";
export type BillingStatus = "ready" | "loading" | "error";

export type BillingMethod = {
  id: string;
  /** Who issued the card: the first thing on its face. */
  issuer: string;
  /** What kind of card it is: "Business debit", "Virtual card". */
  kind?: string;
  /** The last four digits. */
  last4: string;
  /** Expiry as MM/YY. */
  expires: string;
  /** The name on the card. */
  holder?: string;
  /** The network's word mark (invented), bottom right of the face. */
  network?: string;
  /** Any CSS colour for the card's face — pass a token, never a hex. Its hue is kept at a fixed lightness. */
  tint?: string;
};

export type BillingPlan = {
  /** The plan's name: "Team". */
  name: string;
  /** What the plan costs each cycle, before usage and tax. */
  price: number;
  /** The next bill's date, YYYY-MM-DD: the day this cycle ends. */
  renews: string;
  /** How long a cycle is, in days. @default 30 */
  cycleDays?: number;
};

export type BillingTier = {
  /** The usage this tier runs to; null for the last, open-ended tier. */
  upTo: number | null;
  /** The price for every `per` units inside this tier. */
  price: number;
};

export type BillingMeter = {
  /** What is metered, as a heading: "Events". */
  name: string;
  /** The unit in a sentence: "events". */
  unit: string;
  /** Used so far this cycle. The projection can never go below it. */
  used: number;
  /** Included in the plan's price. */
  included: number;
  /** The top of the projection slider. */
  max: number;
  /** The slider's resolution and one arrow key's move. */
  step: number;
  /** Tier prices are per this many units. @default 1000 */
  per?: number;
  /** Prices above the included allowance, in order. */
  tiers: BillingTier[];
};

export type BillingInvoiceStatus = "paid" | "open" | "failed" | "refunded";

export type BillingInvoice = {
  id: string;
  /** The invoice number printed on it: "FL-2609". */
  number: string;
  /** Issue date, YYYY-MM-DD. */
  date: string;
  amount: number;
  status: BillingInvoiceStatus;
  /** A line under the number at comfortable density: "Team plan · 236k events". */
  description?: string;
};

export type BillingPanelProps = {
  /** The cards on file. @default defaultBillingMethods */
  methods?: BillingMethod[];
  /** Controlled id of the default payment method (the card charged). */
  primaryMethod?: string;
  /** Initial default card when uncontrolled. @default the first method */
  defaultPrimaryMethod?: string;
  /** Fires from Make default with the new default card's id. */
  onPrimaryMethodChange?: (id: string) => void;
  /** Controlled: the deck is fanned open. Ignored when `stack` is "none". */
  expanded?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultExpanded?: boolean;
  /** Fires from the press, key or Escape that opened or closed the deck. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Add was pressed. Without it there is no Add button. */
  onAddMethod?: () => void;
  /** Remove was pressed on a card that is not the default. Without it there is no Remove button. */
  onRemoveMethod?: (id: string) => void;
  /** The plan being billed. @default defaultBillingPlan */
  plan?: BillingPlan;
  /** The metered part of the bill. @default defaultBillingMeter */
  meter?: BillingMeter;
  /** Tax on the bill, 0 to 1. @default 0.08 */
  taxRate?: number;
  /** Controlled projected usage for this cycle: the slider's value. */
  usage?: number;
  /** Initial projection when uncontrolled. @default the pace so far, carried to the cycle's end */
  defaultUsage?: number;
  /** Fires from the drag or key that moved the projection, once per step. */
  onUsageChange?: (usage: number) => void;
  /** Past invoices, newest first. @default defaultBillingInvoices */
  invoices?: BillingInvoice[];
  /** Download was pressed. Return a promise and the row waits for it, then shows a check (or the error). */
  onDownload?: (invoice: BillingInvoice) => void | Promise<unknown>;
  /** Change plan was pressed. Without it there is no button. */
  onChangePlan?: () => void;
  /** Today (Date or ms): how far into the cycle we are. @default defaultBillingNow */
  now?: number | Date;
  /** Money. @default the `currency` in `locale` */
  format?: (amount: number) => string;
  /** Usage counts. @default compact: 182k, 1.2M */
  formatUsage?: (units: number) => string;
  /** Invoice dates from YYYY-MM-DD. @default "Sep 1, 2026" */
  formatDate?: (date: string) => string;
  /** The default money format's locale. Fixed, so the server and the browser agree. @default "en-US" */
  locale?: string;
  /** The default money format's currency. @default "USD" */
  currency?: string;
  /** How the cards sit: a pile that fans out like a hand, a pile that unfolds into strips, or a flat grid. @default "fan" */
  stack?: BillingStack;
  /** How the next bill reads: one rolling total, or the total and each line that makes it. @default "itemized" */
  estimate?: BillingEstimate;
  /** Row height, padding and how much each invoice row says. @default "regular" */
  density?: BillingDensity;
  /** Whether the billing data has arrived. @default "ready" */
  status?: BillingStatus;
  /** Try again was pressed after the data failed to load. */
  onRetry?: () => void;
  /** The panel's heading. @default "Billing" */
  title?: string;
  /** The panel's accessible name. @default the title */
  label?: string;
  /** Clicks for presses and ticks for the projection's steps. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const DAY = 86_400_000;
const RATIO = 1.586;
/** Room around the cards inside the deck: a turned card's corners stay in. */
const PAD = 14;
/** How far each card behind the front one shows above it in a closed pile. */
const PEEK = 7;
/** The strip of each card a fanned-out wallet shows. */
const STRIP = 46;
/** The Default tag's box, px. */
const TAG_W = 62;
const TAG_H = 18;
/** How long a finished download keeps its check. */
const DONE_HOLD = 1600;
/** Exits never spring. */
const exitTransition = { duration: durations.fast, ease: easings.exit };

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());
const msOf = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
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
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Fixed English dates: a locale lookup during render would not survive hydration. */
const longDate = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}, ${y}`;
};
const shortDate = (iso: string) => {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
};
const monthOf = (iso: string) => {
  const [, m = 1] = iso.split("-").map(Number);
  return MONTH_NAMES[m - 1] ?? "";
};

const trimmed = (v: number, places: number) => `${Number(v.toFixed(places))}`;
const compactUnits = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${trimmed(n / 1e6, 2)}M`;
  if (a >= 1e4) return `${trimmed(n / 1e3, 0)}k`;
  if (a >= 1e3) return `${trimmed(n / 1e3, 1)}k`;
  return `${Math.round(n)}`;
};

/* -------------------------------- defaults -------------------------------- */

export const defaultBillingMethods: BillingMethod[] = [
  {
    id: "cbk-4417",
    issuer: "Coldbrook Bank",
    kind: "Business debit",
    last4: "4417",
    expires: "08/28",
    holder: "Fieldline Labs",
    network: "basin",
    tint: "var(--accent)",
  },
  {
    id: "wly-0912",
    issuer: "Waylight Pay",
    kind: "Virtual card",
    last4: "0912",
    expires: "03/27",
    holder: "Fieldline Ops",
    network: "gauge",
    tint: "var(--signal)",
  },
  {
    id: "fcu-7730",
    issuer: "Fernworks Credit Union",
    kind: "Credit",
    last4: "7730",
    expires: "11/29",
    holder: "Fieldline Labs",
    network: "fern",
    tint: "var(--warn)",
  },
];

export const defaultBillingPlan: BillingPlan = {
  name: "Team",
  price: 49,
  renews: "2026-10-01",
  cycleDays: 30,
};

export const defaultBillingMeter: BillingMeter = {
  name: "Events",
  unit: "events",
  used: 182_000,
  included: 100_000,
  max: 1_000_000,
  step: 10_000,
  per: 1000,
  tiers: [
    { upTo: 500_000, price: 0.4 },
    { upTo: null, price: 0.25 },
  ],
};

/** Day 18 of the September cycle. */
export const defaultBillingNow = Date.UTC(2026, 8, 19);

export const defaultBillingInvoices: BillingInvoice[] = [
  {
    id: "fl-2609",
    number: "FL-2609",
    date: "2026-09-01",
    amount: 119.88,
    status: "paid",
    description: "Team plan · 255k events",
  },
  {
    id: "fl-2608",
    number: "FL-2608",
    date: "2026-08-01",
    amount: 132.84,
    status: "paid",
    description: "Team plan · 285k events",
  },
  {
    id: "fl-2607",
    number: "FL-2607",
    date: "2026-07-01",
    amount: 98.28,
    status: "paid",
    description: "Team plan · 205k events",
  },
  {
    id: "fl-2606",
    number: "FL-2606",
    date: "2026-06-01",
    amount: 107.35,
    status: "failed",
    description: "Team plan · 226k events · card declined",
  },
  {
    id: "fl-2605",
    number: "FL-2605",
    date: "2026-05-01",
    amount: 87.48,
    status: "paid",
    description: "Team plan · 180k events",
  },
  {
    id: "fl-2604",
    number: "FL-2604",
    date: "2026-04-01",
    amount: 21.6,
    status: "refunded",
    description: "Starter plan · refunded on upgrade",
  },
];

/* --------------------------------- pricing -------------------------------- */

/** What the usage above the allowance costs, tier by tier, to the cent. */
function usageCost(meter: BillingMeter, usage: number): number {
  const per = meter.per ?? 1000;
  let cost = 0;
  let from = meter.included;
  for (const tier of meter.tiers) {
    const to = tier.upTo ?? Infinity;
    if (to <= from) continue;
    const units = Math.min(usage, to) - from;
    if (units > 0) cost += (units / per) * tier.price;
    from = to;
    if (usage <= to) break;
  }
  return r2(cost);
}

export type BillingLines = {
  /** The plan's price. */
  plan: number;
  /** Usage above the allowance, priced tier by tier. */
  usage: number;
  tax: number;
  total: number;
};

/**
 * The next bill for a projected usage, to the cent: the plan, the usage
 * above the allowance priced tier by tier, and tax on both. The same sum the
 * panel shows, for a host that wants to print it elsewhere.
 */
export function estimateBill(
  plan: BillingPlan,
  meter: BillingMeter,
  taxRate: number,
  usage: number,
): BillingLines {
  const metered = usageCost(meter, usage);
  const tax = r2((plan.price + metered) * taxRate);
  return {
    plan: r2(plan.price),
    usage: metered,
    tax,
    total: r2(plan.price + metered + tax),
  };
}

/* ---------------------------------- deck ---------------------------------- */

type Pose = { x: number; y: number; rotate: number; scale: number };
type Deck = { cw: number; ch: number; height: number; poses: Pose[] };

/** A pile is never neat: each card behind the front one sits a little off. */
const PILE = [
  { dx: 0, rot: 0 },
  { dx: -5, rot: -2.5 },
  { dx: 6, rot: 2 },
  { dx: -3, rot: -1.5 },
  { dx: 4, rot: 1.2 },
];

/**
 * Every card's pose from the deck's width, its slot (0 is the default, in
 * front) and the arrangement. One function for every state, so a change of
 * state is only ever a spring from one pose to the next.
 */
function layDeck(
  mode: BillingStack,
  open: boolean,
  breathe: boolean,
  n: number,
  width: number,
  sel: number,
): Deck {
  const W = Math.max(200, width);
  if (mode === "none") {
    // Flat cards never turn, so they need no room for corners: a hair of
    // padding, and a few px above for the selected card's lift.
    const gap = 12;
    const minW = 132;
    const padX = 4;
    const padY = 6;
    const cols = Math.max(
      1,
      Math.min(n, Math.floor((W - 2 * padX + gap) / (minW + gap))),
    );
    const cw = r2(Math.min(240, (W - 2 * padX - (cols - 1) * gap) / cols));
    const ch = r2(cw / RATIO);
    const rows = Math.max(1, Math.ceil(n / cols));
    const x0 = (W - (cols * cw + (cols - 1) * gap)) / 2;
    const poses = Array.from({ length: n }, (_, i) => ({
      x: r2(x0 + (i % cols) * (cw + gap)),
      y: r2(padY + Math.floor(i / cols) * (ch + gap) - (i === sel ? 4 : 0)),
      rotate: 0,
      scale: 1,
    }));
    return {
      cw,
      ch,
      height: r2(2 * padY + rows * ch + (rows - 1) * gap),
      poses,
    };
  }

  if (mode === "wallet") {
    const cw = r2(Math.min(W - 2 * PAD, 260));
    const ch = r2(cw / RATIO);
    const x = r2((W - cw) / 2);
    if (!open) {
      const peek = PEEK + 2 + (breathe ? 3 : 0);
      const height = r2(2 * PAD + ch + (n - 1) * (PEEK + 5));
      const front = height - PAD - ch;
      return {
        cw,
        ch,
        height,
        poses: Array.from({ length: n }, (_, i) => ({
          x,
          y: r2(front - i * peek),
          rotate: 0,
          scale: r2(1 - i * 0.04),
        })),
      };
    }
    const shift = sel > 0 ? ch - STRIP + 10 : 0;
    return {
      cw,
      ch,
      height: r2(2 * PAD + (n - 1) * STRIP + ch + shift),
      poses: Array.from({ length: n }, (_, i) => ({
        x,
        y: r2(PAD + (n - 1 - i) * STRIP + (i < sel ? shift : 0)),
        rotate: 0,
        scale: 1,
      })),
    };
  }

  // The fan: a hand of cards. Closed it is a pile; open, the cards spread on
  // a shallow arc, the middle ones highest, each turned by its offset.
  const cw = r2(clamp(Math.round(W * 0.58), 150, Math.min(224, W - 2 * PAD)));
  const ch = r2(cw / RATIO);
  const arc = n > 2 ? 10 : 6;
  const lift = 10;
  const height = r2(2 * PAD + ch + Math.max((n - 1) * (PEEK + 3), arc + lift));
  const base = height - PAD - ch;
  if (!open) {
    const k = breathe ? 1.9 : 1;
    const peek = PEEK + (breathe ? 3 : 0);
    return {
      cw,
      ch,
      height,
      poses: Array.from({ length: n }, (_, i) => {
        const p = PILE[i % PILE.length] ?? { dx: 0, rot: 0 };
        return {
          x: r2((W - cw) / 2 + p.dx * k),
          y: r2(base - i * peek),
          rotate: r2(p.rot * k),
          scale: r2(1 - i * 0.025),
        };
      }),
    };
  }
  const mid = (n - 1) / 2;
  const step = n > 1 ? Math.min(cw * 0.62, (W - 2 * PAD - cw) / (n - 1)) : 0;
  const span = step * (n - 1) + cw;
  const x0 = (W - span) / 2;
  const turn = n > 1 ? Math.min(6, 2.5 * (n - 1)) : 0;
  return {
    cw,
    ch,
    height,
    poses: Array.from({ length: n }, (_, i) => {
      const t = n > 1 ? (i - mid) / mid : 0;
      return {
        x: r2(x0 + i * step),
        y: r2(base - arc * (1 - t * t) - (i === sel ? lift : 0)),
        rotate: r2(t * turn),
        scale: 1,
      };
    }),
  };
}

/**
 * Where a point on a card lands once the card is posed: motion turns and
 * scales a card about its centre, so the point is carried round with it.
 */
function carry(
  pose: Pose,
  cw: number,
  ch: number,
  px: number,
  py: number,
): Pose {
  const a = (pose.rotate * Math.PI) / 180;
  const cos = Number(Math.cos(a).toFixed(6));
  const sin = Number(Math.sin(a).toFixed(6));
  const dx = (px - cw / 2) * pose.scale;
  const dy = (py - ch / 2) * pose.scale;
  return {
    x: r2(pose.x + cw / 2 + dx * cos - dy * sin),
    y: r2(pose.y + ch / 2 + dx * sin + dy * cos),
    rotate: pose.rotate,
    scale: pose.scale,
  };
}

/* --------------------------------- pieces --------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const face = (tint: string) =>
  `radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, white 16%, transparent), transparent 55%), linear-gradient(135deg, oklch(from ${tint} 0.52 0.13 h), oklch(from ${tint} 0.3 0.09 h))`;

/** `small` faces drop the holder's name and half the dots, so the issuer keeps its room. */
function CardFace({
  method,
  small,
}: {
  method: BillingMethod;
  small: boolean;
}) {
  return (
    <span
      className="relative flex size-full flex-col justify-between overflow-clip rounded-3 p-3 text-left text-white shadow-[0_6px_18px_color-mix(in_oklab,black_22%,transparent),inset_0_0_0_1px_color-mix(in_oklab,white_12%,transparent)]"
      style={{ background: face(method.tint ?? "var(--accent)") }}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] leading-4 font-semibold">
          {method.issuer}
        </span>
        <span className="shrink-0 font-mono text-[11px] leading-4 tabular-nums">
          {small ? "••" : "••••"} {method.last4}
        </span>
      </span>
      <svg aria-hidden viewBox="0 0 26 19" className="h-[19px] w-[26px]">
        <rect
          x="0.5"
          y="0.5"
          width="25"
          height="18"
          rx="4"
          style={{
            fill: "oklch(from var(--warn) 0.86 0.07 h)",
            stroke: "oklch(from var(--warn) 0.62 0.08 h)",
          }}
        />
        <path
          d="M0.5 7h7M0.5 12h7M18.5 7h7M18.5 12h7M9 0.5v18M17 0.5v18"
          fill="none"
          strokeWidth="0.8"
          style={{ stroke: "oklch(from var(--warn) 0.6 0.08 h)" }}
        />
      </svg>
      <span className="flex items-end justify-between gap-2">
        <span className="min-w-0">
          {method.holder && !small ? (
            <span className="block truncate text-[10px] leading-3 tracking-[0.06em] text-white/70 uppercase">
              {method.holder}
            </span>
          ) : null}
          <span className="block font-mono text-[10px] leading-4 tabular-nums">
            {method.expires}
          </span>
        </span>
        {method.network ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] leading-4 font-semibold tracking-tight italic">
            <svg aria-hidden viewBox="0 0 14 8" className="h-2 w-3.5">
              <path
                d="M1 6.5 4 1.5l3 5 3-5 3 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {method.network}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** One digit as a column of 0–9 that rolls to its value on the snap spring. */
function Digit({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span className="relative inline-block h-[1.15em] overflow-clip">
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-value * 10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="block h-[1.15em] leading-[1.15em]">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * A formatted number whose digits roll. Columns are keyed from the right, so
 * the units stay the units as the number grows; the widest value it will
 * ever show is reserved in the same cell, so a new digit never shifts what
 * sits beside it.
 */
function Roll({
  text,
  widest,
  motionSafe,
  className,
}: {
  text: string;
  widest: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = [...text];
  return (
    <span aria-hidden className={cn("inline-grid tabular-nums", className)}>
      <span className="invisible col-start-1 row-start-1 leading-[1.15em] whitespace-pre">
        {widest.length > text.length ? widest : text}
      </span>
      <span className="col-start-1 row-start-1 inline-flex justify-self-end leading-[1.15em] whitespace-pre">
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          if (ch >= "0" && ch <= "9") {
            return (
              <Digit
                key={`d${fromRight}`}
                value={Number(ch)}
                motionSafe={motionSafe}
              />
            );
          }
          return (
            <span key={`c${fromRight}${ch}`} className="inline-block">
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}

const STATUS_STYLE: Record<
  BillingInvoiceStatus,
  { label: string; pill: string; dot: string }
> = {
  paid: {
    label: "Paid",
    pill: "bg-success/12 text-success",
    dot: "bg-success",
  },
  open: { label: "Due", pill: "bg-warn/14 text-warn", dot: "bg-warn" },
  failed: {
    label: "Failed",
    pill: "bg-danger/12 text-danger",
    dot: "bg-danger",
  },
  refunded: {
    label: "Refunded",
    pill: "bg-surface-2 text-ink-3",
    dot: "bg-ink-3",
  },
};

type DownloadState = "idle" | "pending" | "done" | "error";

function DownloadGlyph({
  state,
  motionSafe,
}: {
  state: DownloadState;
  motionSafe: boolean;
}) {
  if (state === "pending") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className={cn(
          "size-4 text-cobalt-bright",
          motionSafe && "animate-spin",
        )}
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="1.6"
        />
        <path
          d="M8 2a6 6 0 0 1 6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (state === "done") {
    return (
      <svg aria-hidden viewBox="0 0 16 16" className="size-4 text-success">
        <motion.path
          d="M3.5 8.5 6.6 11.5 12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: motionSafe ? 0 : 1 }}
          animate={{ pathLength: 1 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      </svg>
    );
  }
  if (state === "error") {
    return <TriangleAlert aria-hidden className="size-4 text-danger" />;
  }
  return <Download aria-hidden className="size-4" />;
}

type DensitySpec = {
  pad: string;
  gap: string;
  section: string;
  row: string;
  text: string;
  button: string;
};

const DENSITY: Record<BillingDensity, DensitySpec> = {
  compact: {
    pad: "p-2.5 @min-[40rem]:p-3",
    gap: "gap-2.5 @min-[40rem]:gap-3",
    section: "p-2.5",
    row: "py-1.5",
    text: "text-[12px]",
    button: "size-7",
  },
  regular: {
    pad: "p-3 @min-[40rem]:p-4",
    gap: "gap-3 @min-[40rem]:gap-4",
    section: "p-3",
    row: "py-2",
    text: "text-[13px]",
    button: "size-8",
  },
  comfortable: {
    pad: "p-4 @min-[40rem]:p-5",
    gap: "gap-4 @min-[40rem]:gap-5",
    section: "p-4",
    row: "py-3",
    text: "text-[13px]",
    button: "size-9",
  },
};

type Said = { n: number; text: string };

/**
 * A billing settings panel: the cards on file, the next bill and the
 * invoices, all from typed data.
 *
 * The cards are a deck. Closed they are a pile, the default in front; open
 * they fan out like a hand (`stack="fan"`), unfold into strips like a wallet
 * (`"wallet"`), or sit flat in a grid (`"none"`). Every card's pose comes
 * from one function of the deck's measured width, so every change of state
 * is a glide from one pose to the next. Make default lifts the chosen card,
 * slides it across to the front on glide while the rest close ranks, and the
 * Default tag slides from the old card to the new one on snap.
 *
 * The next bill is plan + usage over the allowance + tax. The projection is a
 * slider you drag 1:1 (it rubber-bands past the max and against what has
 * already been used, and lands on its step on snap with the throw's
 * velocity); every digit of the estimate is its own rolling column, so the
 * total rolls as the thumb moves. Invoices download through a promise: a
 * turning ring while it waits, a check drawn on flick when it lands.
 *
 * The deck is a tablist over a details panel: arrows open the pile and move
 * through the cards, Escape folds it, Make default and Remove are buttons.
 * The projection is a slider (arrows step, Page keys ten, Home and End jump).
 * Under reduced motion cards swap poses without travel, digits change without
 * rolling and the thumb follows without springs — the numbers still change,
 * because they are the information.
 */
export function BillingPanel({
  methods = defaultBillingMethods,
  primaryMethod,
  defaultPrimaryMethod,
  onPrimaryMethodChange,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onAddMethod,
  onRemoveMethod,
  plan = defaultBillingPlan,
  meter = defaultBillingMeter,
  taxRate = 0.08,
  usage,
  defaultUsage,
  onUsageChange,
  invoices = defaultBillingInvoices,
  onDownload,
  onChangePlan,
  now = defaultBillingNow,
  format,
  formatUsage = compactUnits,
  formatDate = longDate,
  locale = "en-US",
  currency = "USD",
  stack = "fan",
  estimate = "itemized",
  density = "regular",
  status = "ready",
  onRetry,
  title = "Billing",
  label,
  sound = false,
  disabled = false,
  className,
}: BillingPanelProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const D = DENSITY[density] ?? DENSITY.regular;

  const money = React.useMemo(() => {
    if (format) return format;
    const nf = new Intl.NumberFormat(locale, { style: "currency", currency });
    return (v: number) => nf.format(v);
  }, [format, locale, currency]);

  /* ------------------------------ the cycle ------------------------------ */

  const cycleDays = Math.max(1, plan.cycleDays ?? 30);
  const end = msOf(plan.renews);
  const start = end - cycleDays * DAY;
  const today = toMs(now);
  const elapsed = clamp(Math.floor((today - start) / DAY), 1, cycleDays);
  const dueIn = Math.max(0, Math.ceil((end - today) / DAY));
  const step = Math.max(1, meter.step);
  const floor = clamp(meter.used, 0, meter.max);
  const quantize = React.useCallback(
    (v: number) =>
      clamp(Number((Math.round(v / step) * step).toFixed(6)), floor, meter.max),
    [step, floor, meter.max],
  );
  const pace = quantize((meter.used / elapsed) * cycleDays);

  const [ownUsage, setOwnUsage] = React.useState(() =>
    quantize(defaultUsage ?? pace),
  );
  const projected = quantize(usage ?? ownUsage);
  const bill = estimateBill(plan, meter, taxRate, projected);
  const widest = estimateBill(plan, meter, taxRate, meter.max);
  const last = [...invoices].sort((a, b) => msOf(b.date) - msOf(a.date))[0];

  /* ------------------------------ the deck ------------------------------- */

  const [ownPrimary, setOwnPrimary] = React.useState(
    () => defaultPrimaryMethod ?? methods[0]?.id ?? "",
  );
  const primaryWanted = primaryMethod ?? ownPrimary;
  const primary = methods.some((m) => m.id === primaryWanted)
    ? primaryWanted
    : (methods[0]?.id ?? "");
  const order = [
    ...methods.filter((m) => m.id === primary),
    ...methods.filter((m) => m.id !== primary),
  ];
  const slotOf = (id: string) => order.findIndex((m) => m.id === id);

  const [ownExpanded, setOwnExpanded] = React.useState(defaultExpanded);
  const stacked = stack !== "none" && order.length > 1;
  const open = stacked ? (expanded ?? ownExpanded) : true;

  const [picked, setPicked] = React.useState<string | null>(null);
  const selectedId =
    stacked && !open
      ? primary
      : picked && methods.some((m) => m.id === picked)
        ? picked
        : primary;
  const selected = methods.find((m) => m.id === selectedId);

  const [breathe, setBreathe] = React.useState(false);
  const [stagger, setStagger] = React.useState(false);
  const [moving, setMoving] = React.useState<{ id: string; n: number } | null>(
    null,
  );
  const [geo, setGeo] = React.useState({ w: 0, settled: false });
  const [deckNode, setDeckNode] = React.useState<HTMLDivElement | null>(null);

  const deck = layDeck(
    stack,
    open,
    breathe && motionSafe && stacked && !open,
    order.length,
    geo.w || 320,
    open ? slotOf(selectedId) : -1,
  );

  const cardNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  /** Add was pressed: the next card to arrive is shown and focused. */
  const addAsked = React.useRef(false);
  const knownIds = React.useRef(methods.map((m) => m.id));
  const timers = React.useRef(new Set<number>());
  const alive = React.useRef(true);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  const click = (pitch: number, gain: number, el?: Element | null) => {
    const rect = el?.getBoundingClientRect();
    audio.play("click", {
      pitch,
      gain,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const nameOf = (m: BillingMethod) =>
    `${m.issuer}${m.kind ? ` ${m.kind.toLowerCase()}` : ""} ending ${m.last4}`;

  const setOpen = (next: boolean) => {
    if (!stacked || next === open) return;
    setStagger(true);
    if (!next) setPicked(null);
    if (expanded === undefined) setOwnExpanded(next);
    onExpandedChange?.(next);
  };

  const pick = (id: string, focus: boolean) => {
    setStagger(false);
    setPicked(id);
    if (focus) cardNodes.current.get(id)?.focus({ preventScroll: true });
  };

  const makeDefault = (id: string, el?: Element | null) => {
    if (disabled || id === primary) return;
    const m = methods.find((x) => x.id === id);
    if (!m) return;
    click(1.15, 0.55, el);
    setStagger(false);
    setPicked(id);
    setMoving((v) => ({ id, n: (v?.n ?? 0) + 1 }));
    later(700, () => setMoving((v) => (v?.id === id ? null : v)));
    if (primaryMethod === undefined) setOwnPrimary(id);
    onPrimaryMethodChange?.(id);
    say(`${nameOf(m)} is now the default.`);
  };

  const onCardKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const n = order.length;
    if (n === 0) return;
    const slot = slotOf(id);
    const wallet = stack === "wallet";
    let to = -1;
    switch (event.key) {
      case "ArrowRight":
        to = slot + 1;
        break;
      case "ArrowLeft":
        to = slot - 1;
        break;
      // The wallet's back cards are above its front one.
      case "ArrowUp":
        to = wallet ? slot + 1 : slot - 1;
        break;
      case "ArrowDown":
        to = wallet ? slot - 1 : slot + 1;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      case "Escape":
        if (!stacked || !open) return;
        // Handled here, where focus is; the stage must not also close.
        event.preventDefault();
        click(0.85, 0.4, event.currentTarget);
        setOpen(false);
        cardNodes.current.get(primary)?.focus({ preventScroll: true });
        return;
      default:
        return;
    }
    event.preventDefault();
    if (disabled) return;
    const target = order[(to + n) % n];
    if (!target) return;
    click(1.3 - (0.2 * ((to + n) % n)) / Math.max(1, n - 1), 0.32);
    if (stacked && !open) setOpen(true);
    pick(target.id, true);
  };

  const onCardClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (disabled) return;
    click(1.2, 0.45, event.currentTarget);
    if (stacked && !open) {
      setOpen(true);
      setPicked(id);
      return;
    }
    pick(id, false);
  };

  /* --------------------------- the projection ---------------------------- */

  const u = useMotionValue(projected);
  const reported = React.useRef(projected);
  /** Where the thumb was last sent, so a host echoing it back is not news. */
  const aimed = React.useRef(projected);
  const [check, setCheck] = React.useState(0);
  const dragging = React.useRef<{ base: number; width: number } | null>(null);
  const uAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLDivElement | null>(null);

  const pct = (v: number) => r2((clamp(v, 0, meter.max) / meter.max) * 100);

  const tick = (v: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    audio.play("tick", {
      pitch: r2(0.85 * semitones((v / meter.max) * 14)),
      gain: 0.32,
      pan: rect ? panFrom(rect.left + (pct(v) / 100) * rect.width, null) : 0,
    });
  };

  const report = (q: number) => {
    if (q === reported.current) return false;
    reported.current = q;
    if (usage === undefined) setOwnUsage(q);
    onUsageChange?.(q);
    return true;
  };

  const glideTo = (
    q: number,
    velocity = 0,
    spring: Transition = springs.snap,
  ) => {
    aimed.current = q;
    uAnim.current?.stop();
    if (!motionSafe) {
      u.set(q);
    } else {
      uAnim.current = animate(u, q, { ...spring, velocity });
    }
    // A controlled host answers on its own schedule. Once it has had its
    // turn, a host that refused the move gets its own value back.
    if (usage !== undefined)
      React.startTransition(() => setCheck((c) => c + 1));
  };

  const valueAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return u.get();
    return ((clientX - rect.left) / rect.width) * meter.max;
  };

  const sayEstimate = (q: number) => {
    const b = estimateBill(plan, meter, taxRate, q);
    say(`Estimate ${money(b.total)} for ${formatUsage(q)} ${meter.unit}.`);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: ({ point, offset }) => {
      const rect = trackRef.current?.getBoundingClientRect();
      const width = rect && rect.width > 0 ? rect.width : 1;
      const startX = point.x - offset.x;
      const thumbX = rect ? rect.left + (pct(u.get()) / 100) * width : 0;
      uAnim.current?.stop();
      dragging.current = {
        base: Math.abs(startX - thumbX) <= 14 ? u.get() : valueAt(startX),
        width,
      };
    },
    onMove: ({ offset }) => {
      const d = dragging.current;
      if (!d) return;
      const raw = d.base + (offset.x / d.width) * meter.max;
      const give = meter.max * 0.12;
      const v = motionSafe
        ? raw < floor
          ? floor + rubberband(raw - floor, give)
          : raw > meter.max
            ? meter.max + rubberband(raw - meter.max, give)
            : raw
        : clamp(raw, floor, meter.max);
      u.set(r2(v));
      const q = quantize(v);
      if (report(q)) tick(q);
    },
    onEnd: ({ velocity }) => {
      const d = dragging.current;
      dragging.current = null;
      if (!d) return;
      const perSecond = (velocity.x / d.width) * meter.max;
      const q = quantize(project(u.get(), perSecond, 0.98));
      if (report(q)) tick(q);
      glideTo(q, perSecond);
      sayEstimate(q);
    },
    onCancel: () => {
      dragging.current = null;
      glideTo(reported.current);
    },
    onTap: (event) => {
      const q = quantize(valueAt(event.clientX));
      if (report(q)) tick(q);
      glideTo(q, 0, springs.glide);
      sayEstimate(q);
      thumbRef.current?.focus({ preventScroll: true });
    },
  });

  const onThumbKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const at = reported.current;
    let to: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        to = at + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        to = at - step;
        break;
      case "PageUp":
        to = at + step * 10;
        break;
      case "PageDown":
        to = at - step * 10;
        break;
      case "Home":
        to = floor;
        break;
      case "End":
        to = meter.max;
        break;
      default:
        return;
    }
    event.preventDefault();
    const q = quantize(to);
    if (report(q)) tick(q);
    glideTo(q);
  };

  const backToPace = () => {
    if (disabled) return;
    click(0.95, 0.45, trackRef.current);
    report(pace);
    glideTo(pace, 0, springs.glide);
    sayEstimate(pace);
    // The button hides once the projection is back on pace: focus moves on
    // to the slider instead of falling to the page.
    thumbRef.current?.focus({ preventScroll: true });
  };

  // A projection the host (or a tweak) moves arrives on the glide spring.
  // No cleanup stops it: StrictMode's second run finds it already aimed and
  // lets the first run's glide finish rather than freezing it.
  React.useEffect(() => {
    if (dragging.current) return;
    reported.current = projected;
    if (aimed.current === projected) return;
    aimed.current = projected;
    uAnim.current?.stop();
    if (!motionSafe) {
      u.set(projected);
      return;
    }
    uAnim.current = animate(u, projected, springs.glide);
  }, [projected, check, motionSafe, u]);

  const thumbLeft = useTransform(u, (v) => `${pct(v)}%`);
  const projectedWidth = useTransform(
    u,
    (v) => `${r2(Math.max(0, pct(v) - pct(floor)))}%`,
  );

  /* ------------------------------ downloads ------------------------------ */

  const [downloads, setDownloads] = React.useState<
    Record<string, DownloadState>
  >({});
  const setDownload = (id: string, s: DownloadState) =>
    setDownloads((d) => ({ ...d, [id]: s }));

  const download = (inv: BillingInvoice, el: Element) => {
    if (disabled || downloads[inv.id] === "pending") return;
    click(1.05, 0.5, el);
    const finish = (ok: boolean) => {
      if (!alive.current) return;
      setDownload(inv.id, ok ? "done" : "error");
      say(
        ok
          ? `Invoice ${inv.number} downloaded.`
          : `Invoice ${inv.number} did not download. Press again to retry.`,
      );
      if (ok) {
        later(DONE_HOLD, () =>
          setDownloads((d) =>
            d[inv.id] === "done" ? { ...d, [inv.id]: "idle" } : d,
          ),
        );
      }
    };
    let result: unknown;
    try {
      result = onDownload?.(inv);
    } catch {
      finish(false);
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setDownload(inv.id, "pending");
      say(`Downloading invoice ${inv.number}.`);
      (result as Promise<unknown>).then(
        () => finish(true),
        () => finish(false),
      );
    } else {
      finish(true);
    }
  };

  /* ------------------------------- effects ------------------------------- */

  // The deck is measured when it arrives and whenever it changes width. The
  // first measurement lands without travel; after a frame, poses spring.
  React.useEffect(() => {
    if (!deckNode) return;
    let frame = 0;
    const measure = () => {
      const w = Math.round(deckNode.clientWidth);
      setGeo((g) => (g.w === w ? g : { w, settled: g.w !== 0 && g.settled }));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setGeo((g) => (g.settled ? g : { ...g, settled: true })),
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(deckNode);
    measure();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [deckNode]);

  // A card that arrives after Add is fanned into view, selected and focused,
  // so focus has somewhere to go if the host takes the Add button away. The
  // ids are only marked seen when that happens, so StrictMode's second run
  // finds the same new card rather than nothing.
  const methodIds = methods.map((m) => m.id).join("|");
  React.useEffect(() => {
    const ids = methodIds ? methodIds.split("|") : [];
    const fresh = ids.find((id) => !knownIds.current.includes(id));
    if (!fresh || !addAsked.current) {
      knownIds.current = ids;
      return;
    }
    const frame = requestAnimationFrame(() => {
      knownIds.current = ids;
      addAsked.current = false;
      const at = document.activeElement;
      const inside =
        !at || at === document.body || rootRef.current?.contains(at);
      setStagger(false);
      setPicked(fresh);
      if (stack !== "none" && ids.length > 1 && expanded === undefined) {
        setOwnExpanded(true);
      }
      if (stack !== "none" && ids.length > 1) onExpandedChange?.(true);
      if (inside) cardNodes.current.get(fresh)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
    // Runs when the set of cards changes; the rest is read as it stands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodIds]);

  React.useEffect(() => {
    alive.current = true;
    const running = timers.current;
    return () => {
      alive.current = false;
      for (const t of running) window.clearTimeout(t);
      running.clear();
      uAnim.current?.stop();
    };
  }, []);

  /* -------------------------------- render ------------------------------- */

  const instant = !motionSafe || !geo.settled;
  const n = order.length;
  const lag = cascade(Math.max(2, n));
  const poseTransition = (slot: number) => {
    if (instant) return { duration: 0 };
    const delay = stagger ? (open ? slot : n - 1 - slot) * lag * 0.6 : 0;
    return { ...springs.glide, delay };
  };
  const zOf = (id: string, slot: number) => {
    if (moving?.id === id) return 80;
    if (open && stack === "fan" && id === selectedId) return 60;
    return 10 + (n - slot);
  };

  const primaryCard = methods.find((m) => m.id === primary);
  const tagPose = (() => {
    const slot = slotOf(primary);
    const pose = deck.poses[slot];
    if (!pose) return null;
    return carry(
      pose,
      deck.cw,
      deck.ch,
      deck.cw - 12 - TAG_W,
      deck.ch / 2 - TAG_H / 2,
    );
  })();

  const panelId = `${uid}-card-panel`;
  const deckId = `${uid}-deck`;
  const tabId = (id: string) => `${uid}-card-${id}`;
  const sliderLabelId = `${uid}-slider-label`;
  const atPace = projected === pace;
  const delta = last ? r2(bill.total - last.amount) : 0;

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
      <div className="min-w-0">
        <h2 id={titleId} className="truncate text-sm font-semibold">
          {title}
        </h2>
        <p className="truncate text-[11px] text-ink-3">
          {plan.name} plan · {money(plan.price)}{" "}
          {cycleDays >= 28 && cycleDays <= 31
            ? "a month"
            : `every ${cycleDays} days`}{" "}
          · renews {shortDate(plan.renews)}
        </p>
      </div>
      {onChangePlan ? (
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            click(1, 0.45, event.currentTarget);
            onChangePlan();
          }}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
            FOCUS_RING,
          )}
        >
          Change plan
        </button>
      ) : null}
    </header>
  );

  const sectionClass = cn(
    "flex min-w-0 flex-col rounded-3 border border-hairline bg-surface-1",
    D.section,
  );

  const payments = (
    <section
      aria-labelledby={`${uid}-pm`}
      className={cn(sectionClass, "@container/pm gap-2")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${uid}-pm`} className="truncate text-[13px] font-medium">
          Payment methods
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {stacked ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={deckId}
              disabled={disabled}
              onClick={(event) => {
                click(open ? 0.85 : 1.1, 0.45, event.currentTarget);
                setOpen(!open);
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              <Layers
                aria-hidden
                className="hidden size-3.5 shrink-0 @min-[19rem]/pm:block"
              />
              <span className="grid">
                <span
                  className={cn("col-start-1 row-start-1", open && "invisible")}
                >
                  Show all {n}
                </span>
                <span
                  className={cn(
                    "col-start-1 row-start-1",
                    !open && "invisible",
                  )}
                >
                  Stack
                </span>
              </span>
            </button>
          ) : null}
          {onAddMethod ? (
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                click(1.25, 0.45, event.currentTarget);
                addAsked.current = true;
                onAddMethod();
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2 text-[11px] text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              <Plus aria-hidden className="size-3.5 shrink-0" />
              Add
            </button>
          ) : null}
        </div>
      </div>

      {n === 0 ? (
        <p className="rounded-2 border border-dashed border-hairline-strong px-3 py-6 text-center text-xs text-ink-3">
          No card on file. Add one to pay the next bill.
        </p>
      ) : (
        <motion.div
          ref={setDeckNode}
          id={deckId}
          role="tablist"
          aria-label="Payment methods"
          aria-orientation={stack === "wallet" ? "vertical" : "horizontal"}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse" && !open) setBreathe(true);
          }}
          onPointerLeave={() => setBreathe(false)}
          className="relative w-full"
          initial={false}
          animate={{ height: deck.height }}
          transition={instant ? { duration: 0 } : springs.glide}
        >
          <AnimatePresence initial={false}>
            {methods.map((m) => {
              const slot = slotOf(m.id);
              const pose = deck.poses[slot] ?? {
                x: 0,
                y: 0,
                rotate: 0,
                scale: 1,
              };
              const isSel = m.id === selectedId;
              const isDefault = m.id === primary;
              const hop = moving?.id === m.id && motionSafe;
              return (
                <motion.button
                  key={m.id}
                  ref={(node: HTMLButtonElement | null) => {
                    if (node) cardNodes.current.set(m.id, node);
                    else cardNodes.current.delete(m.id);
                  }}
                  type="button"
                  role="tab"
                  id={tabId(m.id)}
                  aria-selected={isSel}
                  aria-controls={panelId}
                  aria-label={`${nameOf(m)}, expires ${m.expires}${isDefault ? ", default" : ""}`}
                  tabIndex={isSel ? 0 : -1}
                  disabled={disabled}
                  onClick={(event) => onCardClick(event, m.id)}
                  onKeyDown={(event) => onCardKeyDown(event, m.id)}
                  className={cn(
                    "absolute top-0 left-0 rounded-3 select-none disabled:cursor-not-allowed",
                    open ? "cursor-pointer" : "cursor-zoom-in",
                    FOCUS_RING,
                  )}
                  style={{
                    width: deck.cw,
                    height: deck.ch,
                    zIndex: zOf(m.id, slot),
                  }}
                  initial={{
                    opacity: 0,
                    x: pose.x,
                    y: pose.y + 12,
                    rotate: pose.rotate,
                    scale: 0.94,
                  }}
                  animate={{
                    opacity: 1,
                    x: pose.x,
                    y: pose.y,
                    rotate: pose.rotate,
                    scale: pose.scale,
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.9,
                    transition: exitTransition,
                  }}
                  transition={{
                    ...poseTransition(slot),
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                >
                  <motion.span
                    className="block size-full"
                    whileHover={
                      open && motionSafe && !isSel && stack !== "wallet"
                        ? { y: -4 }
                        : undefined
                    }
                    transition={springs.snap}
                  >
                    <motion.span
                      key={hop ? `hop-${moving?.n}` : "still"}
                      className={cn(
                        "block size-full rounded-3 transition-shadow",
                        isSel &&
                          open &&
                          stack === "none" &&
                          "shadow-[0_0_0_2px_var(--accent-bright)]",
                      )}
                      initial={false}
                      animate={
                        hop
                          ? { y: [0, -14, 0], scale: [1, 1.04, 1] }
                          : { y: 0, scale: 1 }
                      }
                      transition={{ duration: 0.5, ease: easings.move }}
                    >
                      <CardFace method={m} small={deck.cw < 180} />
                    </motion.span>
                  </motion.span>
                </motion.button>
              );
            })}
          </AnimatePresence>
          {tagPose && primaryCard ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 inline-flex items-center justify-center gap-1 rounded-full bg-white/92 text-[10px] font-semibold text-[color:oklch(from_var(--accent)_0.3_0.06_h)] shadow-[0_1px_3px_color-mix(in_oklab,black_20%,transparent)]"
              style={{
                width: TAG_W,
                height: TAG_H,
                originX: 0,
                originY: 0,
                zIndex: zOf(primary, 0) + 1,
              }}
              initial={false}
              animate={{
                x: tagPose.x,
                y: tagPose.y,
                rotate: tagPose.rotate,
                scale: tagPose.scale,
              }}
              transition={instant ? { duration: 0 } : springs.snap}
            >
              <Check aria-hidden className="size-3 shrink-0" strokeWidth={3} />
              Default
            </motion.span>
          ) : null}
        </motion.div>
      )}

      {selected ? (
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(selected.id)}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline pt-2.5"
        >
          <motion.div
            key={selected.id}
            className="min-w-0 grow basis-44"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            <p className="truncate text-[13px] font-medium">
              {selected.issuer}
              <span className="font-normal text-ink-3">
                {" "}
                · •••• {selected.last4}
              </span>
            </p>
            <p className="truncate text-[11px] text-ink-3">
              {selected.kind ? `${selected.kind} · ` : ""}Expires{" "}
              {selected.expires}
              {selected.holder ? ` · ${selected.holder}` : ""}
            </p>
          </motion.div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-disabled={selected.id === primary || disabled || undefined}
              onClick={(event) => makeDefault(selected.id, event.currentTarget)}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-2 px-3 text-xs font-medium transition-colors",
                selected.id === primary
                  ? "cursor-default bg-success/12 text-success"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
                disabled && "cursor-not-allowed opacity-50",
                FOCUS_RING,
              )}
            >
              <span className="grid">
                <span
                  className={cn(
                    "col-start-1 row-start-1 inline-flex items-center justify-center gap-1",
                    selected.id !== primary && "invisible",
                  )}
                >
                  <Check aria-hidden className="size-3.5 shrink-0" />
                  Default
                </span>
                <span
                  className={cn(
                    "col-start-1 row-start-1",
                    selected.id === primary && "invisible",
                  )}
                >
                  Make default
                </span>
              </span>
            </button>
            {onRemoveMethod ? (
              <button
                type="button"
                aria-disabled={selected.id === primary || disabled || undefined}
                aria-label={`Remove ${nameOf(selected)}`}
                title={
                  selected.id === primary
                    ? "Make another card the default first"
                    : undefined
                }
                onClick={(event) => {
                  if (disabled || selected.id === primary) return;
                  click(0.8, 0.5, event.currentTarget);
                  onRemoveMethod(selected.id);
                  say(`${nameOf(selected)} removed.`);
                  setPicked(null);
                  cardNodes.current
                    .get(primary)
                    ?.focus({ preventScroll: true });
                }}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors",
                  selected.id === primary || disabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-danger/40 hover:text-danger",
                  FOCUS_RING,
                )}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );

  const segments = [
    { key: "plan", value: bill.plan, className: "bg-cobalt-bright" },
    {
      key: "usage",
      value: bill.usage,
      className: "bg-[color:oklch(from_var(--accent)_0.74_0.1_h)]",
    },
    { key: "tax", value: bill.tax, className: "bg-ink-3/45" },
  ];
  const over = Math.max(0, projected - meter.included);

  const nextBill = (
    <section
      aria-labelledby={`${uid}-nb`}
      className={cn(sectionClass, "gap-3")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${uid}-nb`} className="truncate text-[13px] font-medium">
          Next bill
        </h3>
        <span className="shrink-0 text-[11px] text-ink-3">
          Due {shortDate(plan.renews)} · in {dueIn}{" "}
          {dueIn === 1 ? "day" : "days"}
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[30px] leading-none font-medium tracking-tight text-foreground">
          <span className="sr-only">Estimated {money(bill.total)}</span>
          <Roll
            text={money(bill.total)}
            widest={money(widest.total)}
            motionSafe={motionSafe}
          />
        </p>
        {last ? (
          <p className="pb-0.5 font-mono text-[11px] text-ink-3 tabular-nums">
            {delta >= 0 ? "+" : "−"}
            {money(Math.abs(delta))} vs {monthOf(last.date)}
          </p>
        ) : null}
      </div>

      {estimate === "itemized" ? (
        <div className="flex flex-col gap-2">
          <div
            aria-hidden
            className="flex h-1.5 w-full gap-px overflow-clip rounded-full bg-surface-2"
          >
            {segments.map((s) => (
              <motion.span
                key={s.key}
                className={cn("h-full shrink-0", s.className)}
                initial={false}
                animate={{
                  width: `${bill.total > 0 ? r2((s.value / bill.total) * 100) : 0}%`,
                }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            ))}
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[12px]">
            <dt className="flex min-w-0 items-center gap-1.5 text-ink-2">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
              />
              <span className="truncate">{plan.name} plan</span>
            </dt>
            <dd className="text-right font-mono text-foreground">
              <span className="sr-only">{money(bill.plan)}</span>
              <Roll
                text={money(bill.plan)}
                widest={money(widest.plan)}
                motionSafe={motionSafe}
              />
            </dd>
            <dt className="flex min-w-0 items-center gap-1.5 text-ink-2">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-[color:oklch(from_var(--accent)_0.74_0.1_h)]"
              />
              <span className="truncate">
                {formatUsage(over)} {meter.unit} over{" "}
                {formatUsage(meter.included)}
              </span>
            </dt>
            <dd className="text-right font-mono text-foreground">
              <span className="sr-only">{money(bill.usage)}</span>
              <Roll
                text={money(bill.usage)}
                widest={money(widest.usage)}
                motionSafe={motionSafe}
              />
            </dd>
            <dt className="flex min-w-0 items-center gap-1.5 text-ink-2">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-ink-3/45"
              />
              <span className="truncate">Tax · {r2(taxRate * 100)}%</span>
            </dt>
            <dd className="text-right font-mono text-foreground">
              <span className="sr-only">{money(bill.tax)}</span>
              <Roll
                text={money(bill.tax)}
                widest={money(widest.tax)}
                motionSafe={motionSafe}
              />
            </dd>
          </dl>
        </div>
      ) : (
        <p className="text-[12px] text-ink-2">
          {plan.name} plan with {formatUsage(projected)} {meter.unit},{" "}
          {formatUsage(meter.included)} included · tax included
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span id={sliderLabelId} className="truncate text-ink-2">
            Projected {meter.unit} this cycle
          </span>
          <span className="shrink-0 font-mono text-foreground tabular-nums">
            {formatUsage(projected)}
          </span>
        </div>
        <div
          ref={trackRef}
          {...drag}
          className={cn(
            "relative h-7 touch-pan-y select-none",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-clip rounded-full bg-surface-2">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-cobalt-bright"
              style={{ width: `${pct(floor)}%` }}
            />
            <motion.span
              aria-hidden
              className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--accent-bright)_42%,transparent)_0_4px,color-mix(in_oklab,var(--accent-bright)_24%,transparent)_4px_8px)]"
              style={{ left: `${pct(floor)}%`, width: projectedWidth }}
            />
          </div>
          {[meter.included, ...meter.tiers.map((t) => t.upTo)]
            .filter((v): v is number => v !== null && v > 0 && v < meter.max)
            .map((v) => (
              <span
                key={v}
                aria-hidden
                className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-ink-3/60"
                style={{ left: `${pct(v)}%` }}
              />
            ))}
          <span
            aria-hidden
            title="Pace"
            className="absolute top-0 size-1.5 -translate-x-1/2 rotate-45 bg-ink-3"
            style={{ left: `${pct(pace)}%` }}
          />
          <motion.div
            ref={thumbRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-labelledby={sliderLabelId}
            aria-valuemin={floor}
            aria-valuemax={meter.max}
            aria-valuenow={projected}
            aria-valuetext={`${formatUsage(projected)} ${meter.unit} projected, estimate ${money(bill.total)}`}
            aria-disabled={disabled || undefined}
            onKeyDown={onThumbKeyDown}
            whileHover={motionSafe && !disabled ? { scale: 1.12 } : undefined}
            whileTap={motionSafe && !disabled ? { scale: 0.94 } : undefined}
            transition={springs.snap}
            className={cn(
              "absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cobalt-bright bg-card shadow-[0_1px_4px_color-mix(in_oklab,black_22%,transparent)]",
              FOCUS_RING,
            )}
            style={{ left: thumbLeft }}
          />
        </div>
        <div
          aria-hidden
          className="relative h-3 font-mono text-[10px] leading-3 text-ink-3 tabular-nums"
        >
          <span className="absolute left-0">0</span>
          {meter.included > meter.max * 0.05 &&
          meter.included < meter.max * 0.8 ? (
            // Near the start it hangs off its notch to the right, clear of
            // the 0; further along it centres on the notch.
            <span
              className={cn(
                "absolute whitespace-nowrap",
                pct(meter.included) < 22
                  ? "-translate-x-0.5"
                  : "-translate-x-1/2",
              )}
              style={{ left: `${pct(meter.included)}%` }}
            >
              {formatUsage(meter.included)} incl.
            </span>
          ) : null}
          {meter.tiers
            .map((t) => t.upTo)
            .filter(
              (v): v is number =>
                v !== null &&
                v > meter.max * 0.3 &&
                v < meter.max * 0.85 &&
                v - meter.included > meter.max * 0.2,
            )
            .map((v) => (
              <span
                key={v}
                className="absolute -translate-x-1/2"
                style={{ left: `${pct(v)}%` }}
              >
                {formatUsage(v)}
              </span>
            ))}
          <span className="absolute right-0">{formatUsage(meter.max)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-ink-3">
          <span className="min-w-0 truncate">
            {formatUsage(meter.used)} used · day {elapsed} of {cycleDays}
          </span>
          <button
            type="button"
            onClick={backToPace}
            disabled={disabled}
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1 rounded-2 px-1.5 text-[11px] text-cobalt-bright transition-colors hover:bg-cobalt-wash",
              atPace && "invisible",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3 shrink-0" />
            Back to pace
          </button>
        </div>
      </div>
    </section>
  );

  const invoiceList = (
    <section
      aria-labelledby={`${uid}-inv`}
      className={cn(
        sectionClass,
        "@container/invoices gap-1 @min-[40rem]:col-span-2 @min-[68rem]:col-span-1",
      )}
    >
      <div className="flex items-center justify-between gap-2 pb-1">
        <h3 id={`${uid}-inv`} className="truncate text-[13px] font-medium">
          Invoices
        </h3>
        <span className="shrink-0 text-[11px] text-ink-3">
          {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
        </span>
      </div>
      {invoices.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-3">
          No invoices yet. The first arrives on {longDate(plan.renews)}.
        </p>
      ) : (
        <>
          <div
            aria-hidden
            className="hidden grid-cols-[6.5rem_minmax(0,1fr)_6rem_5.5rem_auto] items-center gap-x-3 border-b border-hairline pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]/invoices:grid"
          >
            <span>Date</span>
            <span>Invoice</span>
            <span className="text-right">Amount</span>
            <span>Status</span>
            <span className={cn("shrink-0", D.button)} />
          </div>
          <ul role="list" className="flex flex-col">
            {invoices.map((inv) => {
              const st = downloads[inv.id] ?? "idle";
              const look = STATUS_STYLE[inv.status] ?? STATUS_STYLE.paid;
              const name =
                st === "pending"
                  ? `Downloading invoice ${inv.number}`
                  : st === "done"
                    ? `Downloaded invoice ${inv.number}`
                    : st === "error"
                      ? `Retry download of invoice ${inv.number}`
                      : `Download invoice ${inv.number}, ${formatDate(inv.date)}`;
              return (
                <li
                  key={inv.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 border-t border-hairline first:border-t-0 @min-[30rem]/invoices:grid-cols-[6.5rem_minmax(0,1fr)_6rem_5.5rem_auto]",
                    D.row,
                    D.text,
                  )}
                >
                  <span className="hidden truncate text-ink-2 @min-[30rem]/invoices:block">
                    {formatDate(inv.date)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate font-medium text-foreground">
                        {inv.number}
                      </span>
                      {density === "compact" ? (
                        <span className="truncate text-[11px] text-ink-3 @min-[30rem]/invoices:hidden">
                          {shortDate(inv.date)}
                        </span>
                      ) : null}
                    </span>
                    {density !== "compact" ? (
                      <span className="block truncate text-[11px] text-ink-3 @min-[30rem]/invoices:hidden">
                        {formatDate(inv.date)}
                      </span>
                    ) : null}
                    {density === "comfortable" && inv.description ? (
                      <span className="block truncate text-[11px] text-ink-3">
                        {inv.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="flex items-center gap-1.5 font-mono text-foreground tabular-nums">
                      {density === "compact" ? (
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full @min-[30rem]/invoices:hidden",
                            look.dot,
                          )}
                        />
                      ) : null}
                      {money(inv.amount)}
                    </span>
                    {density !== "compact" ? (
                      <span
                        className={cn(
                          "inline-flex h-4.5 items-center rounded-full px-1.5 text-[10px] font-medium @min-[30rem]/invoices:hidden",
                          look.pill,
                        )}
                      >
                        {look.label}
                      </span>
                    ) : (
                      <span className="sr-only @min-[30rem]/invoices:hidden">
                        {look.label}
                      </span>
                    )}
                  </span>
                  <span className="hidden @min-[30rem]/invoices:block">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium",
                        look.pill,
                      )}
                    >
                      {look.label}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={name}
                    aria-disabled={st === "pending" || disabled || undefined}
                    onClick={(event) => download(inv, event.currentTarget)}
                    className={cn(
                      "inline-flex shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
                      D.button,
                      st === "pending" || disabled
                        ? "cursor-default"
                        : "hover:bg-surface-2 hover:text-foreground",
                      disabled && "opacity-50",
                      FOCUS_RING,
                    )}
                  >
                    <DownloadGlyph state={st} motionSafe={motionSafe} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );

  const body = () => {
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className={cn(
            "grid @min-[40rem]:grid-cols-2 @min-[68rem]:grid-cols-3",
            D.pad,
            D.gap,
          )}
        >
          <p className="sr-only">Loading billing.</p>
          <div className="h-52 rounded-3 bg-surface-2" />
          <div className="h-52 rounded-3 bg-surface-2" />
          <div className="h-52 rounded-3 bg-surface-2 @min-[40rem]:col-span-2 @min-[68rem]:col-span-1" />
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Billing did not load.</p>
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
        className={cn(
          "grid items-start @min-[40rem]:grid-cols-2 @min-[68rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]",
          D.pad,
          D.gap,
        )}
      >
        {payments}
        {nextBill}
        {invoiceList}
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      {header}
      {body()}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
