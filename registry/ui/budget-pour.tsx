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
  CalendarX,
  ChevronDown,
  Check,
  RotateCcw,
  TriangleAlert,
  UserCheck,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type BudgetBarStyle = "solid" | "cells" | "rail";
export type BudgetAccentName = "cobalt" | "plum" | "mint" | "ink";
export type BudgetStatus = "ready" | "loading" | "empty" | "error";

export type BudgetLineItem = {
  id: string;
  name: string;
  qty: number;
  /** Price of one, in the budget's currency. */
  unit: number;
};

export type BudgetRequest = {
  id: string;
  /** Who asks: "Fieldline purchasing agent". */
  agent: string;
  /** What the order is for. */
  title: string;
  /** The agent's reason, one sentence. */
  reason: string;
  vendor: string;
  quote: { id: string; validUntil: number };
  /** Line items in priority order: the cap trims from the bottom. */
  items: BudgetLineItem[];
  /** When it asked, in ms. */
  requestedAt: number;
};

export type BudgetPot = {
  id: string;
  /** "Field ops · Q4 equipment". */
  name: string;
  total: number;
  /** Already paid. */
  spent: number;
  /** Approved but not yet paid. */
  committed: number;
};

export type BudgetApprover = {
  id: string;
  name: string;
  /** The person looking at the surface. */
  you?: boolean;
};

type Async = void | Promise<unknown>;

export type BudgetPourProps = {
  /** The spend the agent asks for. @default defaultBudgetRequest (a Fieldline equipment order) */
  request?: BudgetRequest;
  /** The budget it would come out of. @default defaultBudgetPot */
  budget?: BudgetPot;
  /** Controlled cap: most the agent may spend on this order. */
  cap?: number;
  /** Initial cap when uncontrolled. @default the request's total */
  defaultCap?: number;
  /** Fires when a drag, key or button settles the cap. */
  onSetCap?: (cap: number) => void;
  /** Your approval, with the amount and the items that fit under the cap. A promise holds the pour until it resolves. */
  onApprove?: (amount: number, items: BudgetLineItem[]) => Async;
  /** Declined, with the reviewer's note (may be empty). */
  onReject?: (note: string) => void;
  /** "Ask for a new quote" was pressed on an expired quote. */
  onRequestQuote?: () => void;
  /** Orders above this need a second approver. @default 3000 */
  secondApprovalAbove?: number;
  /** Who approves; the one marked `you` is the viewer. @default you and Mara Ilves */
  approvers?: BudgetApprover[];
  /** Controlled: ids of approvers who have approved. The pour runs when all have. */
  approvals?: string[];
  /** Whether the request has loaded. @default "ready" */
  status?: BudgetStatus;
  /** Try again was pressed after a failure to load. */
  onRetry?: () => void;
  /** The moment the quote's validity is counted from, in ms. @default Oct 17 2026, 14:00 UTC */
  now?: number;
  /** How the budget is drawn: a solid bar, $250 cells, or a thin rail with ticks. @default "solid" */
  barStyle?: BudgetBarStyle;
  /** How fast the approved amount pours, as a multiple of the glide's pace (0.5 to 2). @default 1 */
  pourSpeed?: number;
  /** The order, its pour and Approve: a named pigment or any CSS colour. @default "cobalt" */
  accent?: BudgetAccentName | (string & {});
  /** How money is written. @default Intl USD */
  formatMoney?: (amount: number) => string;
  /** Tallest the surface grows before its body scrolls, in px. @default 560 */
  height?: number;
  /** Read only. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14, 0);

export const defaultBudgetRequest: BudgetRequest = {
  id: "po-fl-2210",
  agent: "Fieldline purchasing agent",
  title: "Soil sensors for the north plots",
  reason:
    "Six north plots need moisture sensors in the ground before the frost survey starts.",
  vendor: "Gaugeworks Instruments",
  quote: { id: "Q-3318", validUntil: DEFAULT_NOW + 3 * DAY },
  items: [
    { id: "probe", name: "Soil moisture probe", qty: 6, unit: 189 },
    { id: "logger", name: "Data logger", qty: 2, unit: 412 },
    { id: "solar", name: "Solar charge kit", qty: 2, unit: 236 },
    { id: "pole", name: "Mounting pole", qty: 6, unit: 38 },
    { id: "cable", name: "Spare cable set", qty: 4, unit: 29.5 },
    { id: "ship", name: "Expedited shipping", qty: 1, unit: 96 },
  ],
  requestedAt: DEFAULT_NOW - 9 * 60_000,
};

export const defaultBudgetPot: BudgetPot = {
  id: "field-q4",
  name: "Field ops · Q4 equipment",
  total: 9000,
  spent: 4310,
  committed: 1250,
};

export const defaultBudgetApprovers: BudgetApprover[] = [
  { id: "you", name: "You", you: true },
  { id: "mara", name: "Mara Ilves" },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const NO_IDS: string[] = [];

function defaultMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

const cents = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const lineTotal = (item: BudgetLineItem) => cents(item.qty * item.unit);
/** "$1k", "$2.5k": by hand, because compact formats differ between Node and browsers. */
const short = (n: number) =>
  n >= 1000
    ? `$${Math.round(n / 100) / 10}k`.replace(".0k", "k")
    : `$${Math.round(n)}`;

/**
 * The longest run of items, in priority order, that fits under a cap: how
 * many are kept and what they come to. Exported so a host can show the same
 * figures elsewhere.
 */
export function fitUnderCap(items: BudgetLineItem[], cap: number) {
  let sum = 0;
  let kept = 0;
  for (const item of items) {
    const t = lineTotal(item);
    if (sum + t > cap + 0.005) break;
    sum = cents(sum + t);
    kept += 1;
  }
  return { kept, sum };
}

function validity(until: number, now: number) {
  const days = Math.round((until - now) / DAY);
  if (until < now) {
    const ago = Math.max(1, -days);
    return { expired: true, words: `expired ${plural(ago, "day")} ago` };
  }
  return {
    expired: false,
    words:
      days <= 0 ? "valid until today" : `valid ${plural(days, "more day")}`,
  };
}

/** A spring that keeps the glide's damping ratio at `speed` times its pace. */
const pace = (speed: number) => {
  const s = clamp(speed, 0.5, 2);
  return {
    type: "spring" as const,
    stiffness: r3(springs.glide.stiffness * s * s),
    damping: r3(springs.glide.damping * s),
    mass: 1,
  };
};

const ACCENTS: Record<BudgetAccentName, Record<string, string>> = {
  cobalt: {
    "--bp-accent": "var(--accent-bright)",
    "--bp-pigment": "oklch(from var(--accent-bright) 0.64 c h)",
    "--bp-button": "var(--primary)",
    "--bp-on": "var(--primary-foreground)",
  },
  plum: {
    "--bp-accent": "oklch(from var(--accent-bright) l c 320)",
    "--bp-pigment": "oklch(from var(--accent-bright) 0.62 c 320)",
    "--bp-button": "oklch(from var(--accent-bright) 0.54 c 320)",
    "--bp-on": "var(--primary-foreground)",
  },
  mint: {
    "--bp-accent": "var(--success)",
    "--bp-pigment": "oklch(from var(--success) 0.72 c h)",
    "--bp-button": "oklch(from var(--success) 0.68 c h)",
    "--bp-on": "oklch(from var(--success) 0.22 0.04 h)",
  },
  ink: {
    "--bp-accent": "var(--ink-2)",
    "--bp-pigment": "oklch(from var(--ink-2) 0.55 0.02 h)",
    "--bp-button": "var(--foreground)",
    "--bp-on": "var(--background)",
  },
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    ...(ACCENTS[accent as BudgetAccentName] ?? {
      "--bp-accent": accent,
      "--bp-pigment": accent,
      "--bp-button": accent,
      "--bp-on": "var(--primary-foreground)",
    }),
    "--bp-wash": "color-mix(in oklab, var(--bp-pigment) 22%, transparent)",
    "--bp-spent": "color-mix(in oklab, var(--foreground) 58%, var(--card))",
    "--bp-track": "color-mix(in oklab, var(--foreground) 8%, transparent)",
    "--bp-over": "oklch(from var(--danger) 0.64 0.18 h)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/** Diagonal hatch for money that is promised but not paid. */
const HATCH =
  "repeating-linear-gradient(135deg, var(--bp-spent) 0 2px, transparent 2px 5px)";

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function Roll({ value, motionSafe }: { value: string; motionSafe: boolean }) {
  return (
    <span className="relative inline-flex overflow-clip align-bottom tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="inline-block"
          initial={{ opacity: 0, y: motionSafe ? "70%" : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? "-70%" : 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/** awaiting: the host is answering your approval; held: others still have to. */
type Phase =
  "review" | "awaiting" | "held" | "pouring" | "approved" | "declined";

/**
 * An agent asking to spend money, drawn against the budget it would come out
 * of. The budget is a bar — paid, promised (hatched) and the room left — and
 * the order sits above it as a block of its line items, starting exactly
 * where the room left starts, so you see what it would take before you say
 * yes. A cap handle stands at the block's end: drag it (1:1, rubber-banded,
 * settling on the nearest $10 on `springs.snap`) and every item past it lets
 * go of the block and strikes in the list, lowest priority first.
 *
 * The signature is the pour. Approve runs one motion value — the pour front
 * — across the block on `springs.glide` at `pourSpeed`: behind the front the
 * block has drained, its surface sloping down into a thin stream that falls
 * into the bar, the bar's new fill grows under it, and the room left counts
 * down as it goes. Over budget, the block overhangs the bar's end in danger
 * and Approve holds until the cap fits; above `secondApprovalAbove` your
 * approval waits for the second one; an expired quote holds everything.
 *
 * The cap is a `role="slider"` (arrows $10, Shift $100, Page keys $250, Home,
 * End) and Enter on it approves. At narrow widths the line items fold under
 * the total. Under reduced motion nothing pours: the block fades and the bar
 * and the figure step to their final values.
 */
export function BudgetPour({
  request = defaultBudgetRequest,
  budget = defaultBudgetPot,
  cap: capProp,
  defaultCap,
  onSetCap,
  onApprove,
  onReject,
  onRequestQuote,
  secondApprovalAbove = 3000,
  approvers = defaultBudgetApprovers,
  approvals: approvalsProp,
  status = "ready",
  onRetry,
  now = DEFAULT_NOW,
  barStyle = "solid",
  pourSpeed = 1,
  accent = "cobalt",
  formatMoney = defaultMoney,
  height = 560,
  disabled = false,
  className,
}: BudgetPourProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const noteId = `${uid}-note`;
  const itemsId = `${uid}-items`;
  const style: BudgetBarStyle =
    barStyle === "cells" || barStyle === "rail" ? barStyle : "solid";

  /* -------------------------------- figures ------------------------------ */

  const items = request.items;
  const total = cents(items.reduce((a, i) => a + lineTotal(i), 0));
  const base = cents(budget.spent + budget.committed);
  const left = cents(Math.max(0, budget.total - base));

  const [ownCap, setOwnCap] = React.useState(() =>
    clamp(defaultCap ?? total, 0, total),
  );
  const cap = clamp(capProp ?? ownCap, 0, total);
  const { kept, sum: amount } = fitUnderCap(items, cap);

  // The viewer's own yes counts as soon as it is given, controlled or not.
  const [mine, setMine] = React.useState(false);
  const approvals = React.useMemo(() => {
    const list = approvalsProp ?? NO_IDS;
    const own = approvers.find((a) => a.you);
    return mine && own && !list.includes(own.id) ? [...list, own.id] : list;
  }, [approvalsProp, approvers, mine]);
  const needSecond = amount > secondApprovalAbove;
  const required = needSecond ? approvers : approvers.filter((a) => a.you);
  const you = approvers.find((a) => a.you);
  const youApproved = !!you && approvals.includes(you.id);
  const missing = required.filter((a) => !approvals.includes(a.id));

  const quote = validity(request.quote.validUntil, now);
  const over = cents(amount - left);
  const scale = Math.max(budget.total, base + total) * 1.02;
  const pct = (v: number) => r3((v / scale) * 100);

  /* --------------------------------- state ------------------------------- */

  const [phase, setPhase] = React.useState<Phase>("review");
  const [error, setError] = React.useState<string | null>(null);
  const [itemsOpen, setItemsOpen] = React.useState(false);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [sentNote, setSentNote] = React.useState("");
  const [poured, setPoured] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));

  const [seenRequest, setSeenRequest] = React.useState(request.id);
  if (seenRequest !== request.id) {
    setSeenRequest(request.id);
    setPhase("review");
    setError(null);
    setPoured(0);
    setMine(false);
    if (capProp === undefined) setOwnCap(total);
  }

  const ready = status === "ready";
  const deciding = phase === "review" && ready;
  const heldWhy = !ready
    ? null
    : quote.expired
      ? `Quote ${request.quote.id} has ${quote.words}. Ask for a new one first.`
      : amount === 0
        ? "Nothing fits under the cap."
        : over > 0
          ? `${formatMoney(over)} more than is left in ${budget.name}.`
          : null;
  const locked = disabled || !deciding;

  /* ------------------------------ motion values -------------------------- */

  const capMV = useMotionValue(cap);
  const pourMV = useMotionValue(0);
  const capVar = useTransform(capMV, (v) => String(r3(v)));
  const pourVar = useTransform(pourMV, (v) => String(r3(v)));
  const capText = useTransform(capMV, (v) =>
    formatMoney(v >= total - 0.5 ? total : Math.round(v / 10) * 10),
  );
  const leftText = useTransform(pourMV, (p) =>
    formatMoney(Math.max(0, Math.round(left - p))),
  );
  const capAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const pourAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const [liveKept, setLiveKept] = React.useState<number | null>(null);
  const shownKept = liveKept ?? kept;
  const shownAmount = cents(
    items.slice(0, shownKept).reduce((a, i) => a + lineTotal(i), 0),
  );

  React.useEffect(
    () => () => {
      capAnim.current?.stop();
      pourAnim.current?.stop();
    },
    [],
  );

  // A host's cap, or a new request, moves the handle there on snap.
  React.useEffect(() => {
    if (dragging.current) return;
    if (Math.abs(capMV.get() - cap) < 0.5) return;
    capAnim.current?.stop();
    capAnim.current = animate(
      capMV,
      cap,
      motionSafe ? springs.snap : { duration: 0 },
    );
  }, [cap, capMV, motionSafe]);

  const commitCap = (value: number, velocity = 0) => {
    const v = clamp(Math.round(value / 10) * 10, 0, total);
    const snapped = v >= total - 5 ? total : v;
    capAnim.current?.stop();
    capAnim.current = animate(
      capMV,
      snapped,
      motionSafe ? { ...springs.snap, velocity } : { duration: 0 },
    );
    setLiveKept(null);
    if (capProp === undefined) setOwnCap(snapped);
    onSetCap?.(snapped);
    const f = fitUnderCap(items, snapped);
    say(
      `Cap ${formatMoney(snapped)}: ${f.kept} of ${plural(items.length, "item")}, ${formatMoney(f.sum)}. ${formatMoney(Math.max(0, left - f.sum))} left after.`,
    );
  };

  /* --------------------------------- cap --------------------------------- */

  const figureRef = React.useRef<HTMLDivElement | null>(null);
  const dragFrom = React.useRef(0);
  const dollarsPerPx = () => {
    const w = figureRef.current?.getBoundingClientRect().width ?? 0;
    return w > 0 ? scale / w : 0;
  };

  const capDrag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: locked,
    onStart: () => {
      dragging.current = true;
      capAnim.current?.stop();
      dragFrom.current = capMV.get();
    },
    onMove: ({ offset }) => {
      const raw = dragFrom.current + offset.x * dollarsPerPx();
      const v =
        raw < 0
          ? rubberband(raw, total)
          : raw > total
            ? total + rubberband(raw - total, total)
            : raw;
      capMV.set(v);
      // Only a crossing of an item's edge re-renders the list.
      const k = fitUnderCap(items, clamp(v, 0, total)).kept;
      setLiveKept((was) => (was === k ? was : k));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const v = velocity.x * dollarsPerPx();
      commitCap(project(capMV.get(), v, 0.99), v);
    },
    onCancel: () => {
      dragging.current = false;
      setLiveKept(null);
      commitCap(cap);
    },
  });

  const onCapKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      approve();
      return;
    }
    if (locked) return;
    const big = event.shiftKey ? 100 : 10;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = cap + big;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = cap - big;
    else if (event.key === "PageUp") next = cap + 250;
    else if (event.key === "PageDown") next = cap - 250;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = total;
    if (next === null) return;
    event.preventDefault();
    commitCap(next);
  };

  /* -------------------------------- the pour ----------------------------- */

  /** Lets the order go: the pour runs from the effect below. */
  const release = (value: number) => {
    setPoured(value);
    setPhase("pouring");
    say(`Approved. Pouring ${formatMoney(value)} into ${budget.name}.`);
  };

  // The second approval arrives from the host: the held order pours then.
  if (phase === "held" && missing.length === 0) {
    release(amount);
  }

  // The pour runs once its elements exist, from its own first frame, so a
  // StrictMode re-run replays it rather than freezing it half full.
  React.useEffect(() => {
    if (phase !== "pouring") return;
    const value = poured;
    const land = () => {
      setPhase("approved");
      say(
        `Approved ${formatMoney(value)} from ${budget.name}. ${formatMoney(Math.max(0, left - value))} left.`,
      );
    };
    let controls: AnimationPlaybackControls;
    if (!motionSafe) {
      pourMV.jump(value);
      controls = animate(0, 1, { duration: durations.base, onComplete: land });
    } else {
      pourMV.jump(0);
      controls = animate(pourMV, value, {
        ...pace(pourSpeed),
        onComplete: land,
      });
    }
    pourAnim.current = controls;
    return () => controls.stop();
    // One pour per phase change; the figures are read as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // A decision removes the button that made it; focus waits on the region
  // rather than falling to the page.
  const parkFocus = () => {
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      root.focus({ preventScroll: true });
    }
  };

  const approve = () => {
    if (locked) return;
    if (heldWhy) {
      say(heldWhy);
      return;
    }
    const picked = items.slice(0, kept);
    const next =
      you && !approvals.includes(you.id) ? [...approvals, you.id] : approvals;
    const stillMissing = required.filter((a) => !next.includes(a.id));
    const go = () => {
      parkFocus();
      setMine(true);
      if (stillMissing.length > 0) {
        setPhase("held");
        say(
          `Your approval is in. Waiting for ${stillMissing.map((a) => a.name).join(" and ")}.`,
        );
      } else {
        release(amount);
      }
    };
    setError(null);
    const result = onApprove?.(amount, picked);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPhase("awaiting");
      (result as Promise<unknown>).then(go, (why: unknown) => {
        setPhase("review");
        setError(
          why instanceof Error && why.message
            ? why.message
            : "The approval did not go through.",
        );
      });
    } else {
      go();
    }
  };

  const decline = () => {
    if (locked) return;
    const t = note.trim();
    setSentNote(t);
    setNote("");
    setDeclineOpen(false);
    parkFocus();
    setPhase("declined");
    onReject?.(t);
    say("Declined. Nothing was spent.");
  };

  const declineRef = React.useRef<HTMLButtonElement | null>(null);
  const focusOnArrive = React.useCallback((node: HTMLElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);
  const closeDecline = () => {
    setDeclineOpen(false);
    const t = declineRef.current;
    if (t?.isConnected) t.focus({ preventScroll: true });
  };

  /* -------------------------------- render ------------------------------- */

  const button = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,opacity]",
    FOCUS,
  );
  const quiet = cn(
    button,
    "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
  );

  const pouring = phase === "pouring";
  const done = phase === "approved";
  const showBlock = !done && phase !== "declined";
  const afterLeft = Math.max(0, left - amount);
  const cellPct = pct(250);

  // Segment geometry in budget dollars; the block starts where the room left starts.
  const segments: {
    item: BudgetLineItem;
    start: number;
    amount: number;
    kept: boolean;
  }[] = [];
  for (const [i, item] of items.entries()) {
    const start = segments.reduce((acc, x) => cents(acc + x.amount), 0);
    segments.push({
      item,
      start,
      amount: lineTotal(item),
      kept: i < shownKept,
    });
  }

  const barH = style === "rail" ? 4 : style === "cells" ? 16 : 14;

  const figureVars = {
    "--bp-scale": String(r3(scale)),
    "--bp-base": String(base),
    "--bp-cap": capVar,
    "--bp-pour": pourVar,
  } as React.CSSProperties & Record<string, unknown>;

  const capLeft =
    "calc((var(--bp-base) + var(--bp-cap)) / var(--bp-scale) * 100%)";
  const front = `var(--bp-pour) / ${Math.max(1, total)} * 100%`;

  const figure = (
    <figure className="flex flex-col gap-2">
      <motion.div
        ref={figureRef}
        className="relative h-[124px] select-none"
        style={figureVars}
      >
        {/* The block: one segment per line item, sitting over the room it takes. */}
        <AnimatePresence initial={false}>
          {showBlock ? (
            <motion.div
              key="block"
              aria-hidden
              className="absolute top-7 h-9"
              style={{
                left: `${pct(base)}%`,
                width: `${pct(total)}%`,
                // Behind the pour front the block has drained: its surface
                // slopes down into the front over 18px, like liquid leaving.
                clipPath:
                  pouring && motionSafe
                    ? `polygon(calc(${front} + 18px) 0, 100% 0, 100% 100%, calc(${front}) 100%)`
                    : undefined,
              }}
              initial={{ opacity: 1 }}
              animate={{ opacity: pouring && !motionSafe ? 0 : 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={{ duration: durations.base }}
            >
              {segments.map((s) => {
                const segOver = s.kept && s.start + s.amount > left + 0.005;
                return (
                  <span
                    key={s.item.id}
                    className={cn(
                      "[container-type:inline-size] absolute inset-y-0 flex items-center overflow-hidden rounded-[5px] border px-1.5 transition-[background-color,border-color,opacity] duration-200",
                      !s.kept
                        ? "border-dashed border-hairline-strong bg-transparent opacity-70"
                        : segOver
                          ? "border-[color-mix(in_oklab,var(--danger)_60%,transparent)] bg-[color-mix(in_oklab,var(--danger)_16%,transparent)]"
                          : phase === "held"
                            ? "border-dashed border-(--bp-accent) bg-(--bp-wash)"
                            : "border-[color-mix(in_oklab,var(--bp-pigment)_70%,transparent)] bg-(--bp-wash)",
                    )}
                    style={{
                      left: `calc(${r3((s.start / Math.max(1, total)) * 100)}% + 1px)`,
                      width: `calc(${r3((s.amount / Math.max(1, total)) * 100)}% - 2px)`,
                    }}
                  >
                    <span
                      className={cn(
                        "truncate text-[10px] leading-3 @max-[3.25rem]:hidden",
                        s.kept ? "text-foreground" : "text-ink-3 line-through",
                      )}
                    >
                      {s.item.name}
                    </span>
                  </span>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* The stream from the pour front into the bar. */}
        {pouring && motionSafe ? (
          <span
            aria-hidden
            className="absolute w-1.5 -translate-x-1/2 rounded-full bg-(--bp-pigment)"
            style={{
              top: 62,
              height: 84 - 62 + barH / 2,
              left: "calc((var(--bp-base) + var(--bp-pour)) / var(--bp-scale) * 100%)",
            }}
          />
        ) : null}

        {/* The bar. */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-0 overflow-hidden",
            style === "rail" ? "rounded-full" : "rounded-full",
          )}
          style={{
            top: 84,
            height: barH,
            maskImage:
              style === "cells"
                ? `repeating-linear-gradient(to right, black 0 calc(${cellPct}% - 2px), transparent calc(${cellPct}% - 2px) ${cellPct}%)`
                : undefined,
            width: `${pct(budget.total)}%`,
          }}
        >
          <span className="absolute inset-0 bg-(--bp-track)" />
          <span
            className="absolute inset-y-0 left-0 bg-(--bp-spent)"
            style={{ width: `${r3((budget.spent / budget.total) * 100)}%` }}
          />
          <span
            className="absolute inset-y-0"
            style={{
              left: `${r3((budget.spent / budget.total) * 100)}%`,
              width: `${r3((budget.committed / budget.total) * 100)}%`,
              backgroundImage: HATCH,
            }}
          />
          <span
            className="absolute inset-y-0 bg-(--bp-pigment)"
            style={{
              left: `${r3((base / budget.total) * 100)}%`,
              width: done
                ? `${r3((Math.min(poured, left) / budget.total) * 100)}%`
                : `calc(min(var(--bp-pour), ${left}) / ${budget.total} * 100%)`,
            }}
          />
        </div>
        {over > 0 && showBlock ? (
          <span
            aria-hidden
            className="absolute rounded-r-full border border-l-0 border-dashed border-(--bp-over)"
            style={{
              top: 84,
              height: barH,
              left: `${pct(budget.total)}%`,
              width: `${pct(over)}%`,
              backgroundImage:
                "repeating-linear-gradient(135deg, color-mix(in oklab, var(--bp-over) 55%, transparent) 0 2px, transparent 2px 5px)",
            }}
          />
        ) : null}

        {/* Rail ticks every $1,000. */}
        {style === "rail" ? (
          <div aria-hidden className="absolute inset-x-0" style={{ top: 92 }}>
            {Array.from(
              { length: Math.floor(budget.total / 1000) + 1 },
              (_, i) => i * 1000,
            ).map((v) => (
              <span
                key={v}
                className={cn(
                  "absolute flex -translate-x-1/2 flex-col items-center gap-0.5 font-mono text-[9px] text-ink-3",
                  v % 3000 !== 0 && "@max-[30rem]:hidden",
                )}
                style={{ left: `${pct(v)}%` }}
              >
                <span className="h-1.5 w-px bg-hairline-strong" />
                {short(v)}
              </span>
            ))}
          </div>
        ) : null}

        {/* Bar end marker and the room-left figure. */}
        <span
          aria-hidden
          className="absolute h-7 w-px bg-hairline-strong"
          style={{ top: 78, left: `${pct(budget.total)}%` }}
        />

        {/* The cap. */}
        {showBlock && !pouring ? (
          <motion.div
            className="absolute top-0 bottom-[34px] w-px"
            style={{ left: capLeft }}
          >
            <span
              aria-hidden
              className="absolute top-6 bottom-0 left-0 w-px border-l border-dashed border-(--bp-accent)"
            />
            <div
              role="slider"
              tabIndex={0}
              aria-label="Cap for this order"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={Math.round(cap)}
              aria-valuetext={`Cap ${formatMoney(cap)}, ${kept} of ${plural(items.length, "item")}, ${formatMoney(afterLeft)} left after`}
              aria-disabled={locked || undefined}
              aria-keyshortcuts="Enter"
              onKeyDown={onCapKey}
              {...capDrag}
              // The chip slides along its line so it never leaves the figure:
              // left-aligned at the start of the scale, right-aligned at the end.
              style={{
                translate:
                  "calc((var(--bp-base) + var(--bp-cap)) / var(--bp-scale) * -100%) 0",
              }}
              className={cn(
                "group/budget-pour-cap absolute top-0 left-0 flex h-6 touch-pan-y items-center gap-1 rounded-full border border-(--bp-accent) bg-card pr-2 pl-1.5 font-mono text-[10px] whitespace-nowrap text-foreground tabular-nums shadow-[0_2px_8px_color-mix(in_oklab,black_14%,transparent)]",
                locked ? "cursor-default" : "cursor-ew-resize",
                FOCUS,
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full bg-(--bp-accent) transition-transform group-active/budget-pour-cap:scale-75"
              />
              <span className="text-ink-3">Cap</span>
              <motion.span>{capText}</motion.span>
            </div>
          </motion.div>
        ) : null}
      </motion.div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-(--bp-spent)" />
          Spent {formatMoney(budget.spent)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundImage: HATCH }}
          />
          Committed {formatMoney(budget.committed)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-(--bp-pigment)" />
          This order {formatMoney(done || pouring ? poured : amount)}
        </span>
        <span className="ml-auto inline-flex items-baseline gap-1.5 font-mono text-[12px] text-foreground tabular-nums">
          <span className="font-sans text-[11px] text-ink-3">Left</span>
          {pouring ? (
            <motion.span>{leftText}</motion.span>
          ) : (
            <Roll
              value={formatMoney(done ? Math.max(0, left - poured) : left)}
              motionSafe={motionSafe}
            />
          )}
          {!done && !pouring && phase !== "declined" ? (
            <span
              className={cn(
                "font-sans text-[11px]",
                over > 0 ? "text-danger" : "text-ink-3",
              )}
            >
              {over > 0
                ? `→ ${formatMoney(over)} over`
                : `→ ${formatMoney(afterLeft)}`}
            </span>
          ) : null}
        </span>
        <span className="sr-only">
          {`${budget.name}: ${formatMoney(budget.total)} budget, ${formatMoney(budget.spent)} spent, ${formatMoney(budget.committed)} committed, ${formatMoney(left)} left. This order takes ${formatMoney(amount)}, leaving ${formatMoney(afterLeft)}.`}
        </span>
      </figcaption>
    </figure>
  );

  const itemTable = (
    <table className="w-full border-collapse text-[12px]">
      <caption className="sr-only">
        Line items in priority order; items past the cap are not bought.
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Quantity</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => {
          const isKept = i < shownKept;
          return (
            <tr
              key={item.id}
              className="border-b border-hairline last:border-b-0"
            >
              <th
                scope="row"
                className={cn(
                  "py-1.5 pr-2 text-left font-normal transition-colors",
                  isKept ? "text-foreground" : "text-ink-3 line-through",
                )}
              >
                {item.name}
                {!isKept ? (
                  <span className="ml-2 rounded-1 bg-surface-2 px-1 align-middle font-mono text-[9px] tracking-[0.06em] text-ink-2 uppercase no-underline">
                    over cap
                  </span>
                ) : null}
              </th>
              <td className="py-1.5 pr-2 text-right font-mono text-[11px] whitespace-nowrap text-ink-3 tabular-nums">
                {item.qty} × {formatMoney(item.unit)}
              </td>
              <td
                className={cn(
                  "py-1.5 text-right font-mono text-[11px] whitespace-nowrap tabular-nums",
                  isKept ? "text-foreground" : "text-ink-3 line-through",
                )}
              >
                {formatMoney(lineTotal(item))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const banners = (
    <>
      {ready && quote.expired && phase === "review" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2 border border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)] px-3 py-2">
          <CalendarX aria-hidden className="size-3.5 shrink-0 text-warn" />
          <p className="min-w-0 flex-1 basis-48 text-[12px] leading-4">
            Quote {request.quote.id} {quote.words}. Prices may have changed.
          </p>
          {onRequestQuote ? (
            <button
              type="button"
              onClick={onRequestQuote}
              className={cn(quiet, "h-7 px-2.5 text-[11px]")}
            >
              Ask for a new quote
            </button>
          ) : null}
        </div>
      ) : null}
      {ready && !quote.expired && over > 0 && phase === "review" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_6%,transparent)] px-3 py-2">
          <TriangleAlert
            aria-hidden
            className="size-3.5 shrink-0 text-danger"
          />
          <p className="min-w-0 flex-1 basis-48 text-[12px] leading-4">
            {formatMoney(over)} more than is left in {budget.name}.
          </p>
          <button
            type="button"
            aria-disabled={locked || undefined}
            onClick={() => {
              if (!locked) commitCap(left);
            }}
            className={cn(quiet, "h-7 px-2.5 text-[11px]")}
          >
            Cap at what’s left
          </button>
        </div>
      ) : null}
      {ready && needSecond && (phase === "review" || phase === "held") ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2 border border-hairline bg-surface-2 px-3 py-2">
          <UserCheck aria-hidden className="size-3.5 shrink-0 text-ink-2" />
          <p className="min-w-0 flex-1 basis-48 text-[12px] leading-4">
            Above {formatMoney(secondApprovalAbove)} this needs{" "}
            {plural(required.length, "approval")}.
          </p>
          <span className="flex items-center gap-2 font-mono text-[11px] text-ink-2 tabular-nums">
            {required.map((a) => {
              const yes = approvals.includes(a.id);
              return (
                <span key={a.id} className="inline-flex items-center gap-1">
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full border",
                      yes
                        ? "border-success bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success"
                        : "border-hairline-strong text-transparent",
                    )}
                  >
                    {yes ? (
                      <svg
                        aria-hidden
                        viewBox="0 0 16 16"
                        className="size-3"
                        fill="none"
                      >
                        <motion.path
                          d="M 3.5 8.4 L 6.6 11.4 L 12.5 4.8"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={motionSafe ? { pathLength: 0 } : false}
                          animate={{ pathLength: 1 }}
                          transition={
                            motionSafe ? springs.flick : { duration: 0 }
                          }
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span className="font-sans text-[11px]">{a.name}</span>
                </span>
              );
            })}
          </span>
        </div>
      ) : null}
    </>
  );

  const pill = !ready
    ? null
    : phase === "approved"
      ? { text: "Approved", dot: "bg-success" }
      : phase === "pouring" || phase === "awaiting"
        ? { text: "Approving", dot: "bg-(--bp-accent)" }
        : phase === "held"
          ? {
              text: `${approvals.filter((a) => required.some((r) => r.id === a)).length} of ${required.length} approvals`,
              dot: "bg-(--bp-accent)",
            }
          : phase === "declined"
            ? { text: "Declined", dot: "bg-ink-3" }
            : quote.expired
              ? { text: "Quote expired", dot: "bg-warn" }
              : over > 0
                ? { text: "Over budget", dot: "bg-danger" }
                : { text: "Waiting for you", dot: "bg-warn" };

  const body = !ready ? (
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-3 p-4">
        <p className="sr-only">Loading the request.</p>
        {[52, 100, 76, 88].map((w, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "rounded-full bg-surface-2 motion-safe:animate-pulse",
              i === 1 ? "h-4" : "h-3",
            )}
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px]">The request did not load.</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={quiet}>
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
        <p className="text-[13px] text-ink-2">No spending requests.</p>
        <p className="text-[12px] text-ink-3">
          Agents ask here before they buy anything.
        </p>
      </div>
    )
  ) : (
    <div className="flex flex-col gap-4 px-4 py-4">
      <p className="text-[12px] leading-[1.5] text-ink-2">“{request.reason}”</p>
      {figure}
      {banners}
      <section aria-labelledby={itemsId} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3
            id={itemsId}
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {request.vendor}
          </h3>
          <button
            type="button"
            aria-expanded={itemsOpen}
            onClick={() => setItemsOpen((v) => !v)}
            className={cn(
              "ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-[11px] text-ink-2 hover:bg-surface-2 hover:text-foreground @min-[28rem]:hidden",
              FOCUS,
            )}
          >
            {shownKept === items.length
              ? plural(items.length, "item")
              : `${shownKept} of ${plural(items.length, "item")}`}
            <ChevronDown
              aria-hidden
              className={cn(
                "size-3.5 transition-transform",
                itemsOpen && "rotate-180",
              )}
            />
          </button>
        </div>
        <div className="hidden @min-[28rem]:block">{itemTable}</div>
        <AnimatePresence initial={false}>
          {itemsOpen ? (
            <motion.div
              key="items"
              className="overflow-hidden @min-[28rem]:hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: 0 }
              }
            >
              {itemTable}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex items-baseline justify-between border-t border-hairline-strong pt-2 text-[12px]">
          <span className="text-ink-2">
            Total{" "}
            {shownKept < items.length ? (
              <span className="text-ink-3">· {formatMoney(total)} quoted</span>
            ) : null}
          </span>
          <span className="font-mono text-[13px] font-medium tabular-nums">
            <Roll value={formatMoney(shownAmount)} motionSafe={motionSafe} />
          </span>
        </div>
      </section>
      {phase === "declined" ? (
        <p className="rounded-2 bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
          Declined. Nothing was spent.
          {sentNote ? (
            <span className="text-ink-3">{` “${sentNote}”`}</span>
          ) : null}
        </p>
      ) : null}
      {phase === "approved" ? (
        <p className="flex items-center gap-2 rounded-2 bg-[color-mix(in_oklab,var(--success)_10%,transparent)] px-3 py-2 text-[12px] text-foreground">
          <Check aria-hidden className="size-3.5 shrink-0 text-success" />
          {formatMoney(poured)} approved. {request.agent} can place the order.
        </p>
      ) : null}
    </div>
  );

  const footer =
    ready &&
    (phase === "review" || phase === "awaiting" || phase === "held") ? (
      <footer className="flex shrink-0 flex-col border-t border-hairline">
        <AnimatePresence initial={false}>
          {declineOpen && phase === "review" ? (
            <motion.div
              key="decline"
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: 0 }
              }
            >
              <form
                className="flex flex-col gap-2 px-4 pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  decline();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeDecline();
                  }
                }}
              >
                <label htmlFor={noteId} className="text-[11px] text-ink-2">
                  Tell the agent why (optional)
                </label>
                <textarea
                  id={noteId}
                  ref={focusOnArrive}
                  rows={2}
                  value={note}
                  onChange={(event) => {
                    const t = event.currentTarget.value;
                    setNote(t);
                  }}
                  placeholder="Wait for the spring budget."
                  className={cn(
                    "w-full resize-none rounded-2 border border-input bg-background px-2.5 py-1.5 text-[12px] leading-4 text-foreground placeholder:text-ink-3",
                    FOCUS,
                  )}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className={cn(
                      button,
                      "bg-foreground text-background hover:opacity-90",
                    )}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={closeDecline}
                    className={quiet}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 px-4 pt-3 text-[12px] leading-4 text-danger"
          >
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {phase === "held" ? (
            <p className="min-w-0 flex-1 text-[12px] text-ink-2">
              Your approval is in. Waiting for{" "}
              {missing.map((a) => a.name).join(" and ")}.
            </p>
          ) : (
            <>
              <button
                ref={declineRef}
                type="button"
                aria-expanded={declineOpen}
                aria-disabled={locked || undefined}
                onClick={() => {
                  if (locked) return;
                  if (declineOpen) closeDecline();
                  else setDeclineOpen(true);
                }}
                className={quiet}
              >
                Decline
              </button>
              <button
                type="button"
                onClick={approve}
                aria-disabled={locked || !!heldWhy || undefined}
                aria-busy={phase === "awaiting" || undefined}
                aria-describedby={heldWhy ? `${uid}-why` : undefined}
                className={cn(
                  button,
                  "ml-auto bg-(--bp-button) text-(--bp-on)",
                  locked || heldWhy
                    ? "cursor-not-allowed opacity-50"
                    : "hover:opacity-90",
                )}
              >
                {phase === "awaiting" ? (
                  "Approving…"
                ) : (
                  <>
                    {needSecond && !youApproved
                      ? "Approve 1 of 2 ·"
                      : "Approve"}{" "}
                    <Roll value={formatMoney(amount)} motionSafe={motionSafe} />
                  </>
                )}
              </button>
              {heldWhy ? (
                <span id={`${uid}-why`} className="sr-only">
                  {heldWhy}
                </span>
              ) : null}
            </>
          )}
        </div>
      </footer>
    ) : null;

  return (
    <div
      ref={rootRef}
      role="region"
      tabIndex={-1}
      aria-labelledby={titleId}
      className={cn(
        "@container flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground outline-none",
        disabled && "opacity-80",
        className,
      )}
      style={{ maxHeight: height, ...accentVars(accent) }}
    >
      <header className="flex shrink-0 flex-wrap items-start gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--bp-wash) text-[12px] font-semibold text-(--bp-accent)"
        >
          {request.agent.charAt(0)}
        </span>
        <div className="flex min-w-0 flex-1 basis-48 flex-col">
          <h2 id={titleId} className="text-[14px] leading-5 font-semibold">
            {request.agent} wants to spend {formatMoney(total)}
          </h2>
          <p className="text-[11px] leading-4 text-ink-3">
            {request.title} · quote {request.quote.id}{" "}
            <span className={cn(quote.expired && "text-warn")}>
              {quote.words}
            </span>
          </p>
        </div>
        {pill ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 text-[11px] text-ink-2">
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", pill.dot)}
            />
            {pill.text}
          </span>
        ) : null}
      </header>
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        {body}
      </div>
      {footer}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
