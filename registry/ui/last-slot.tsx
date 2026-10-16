"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Plus,
  RotateCcw,
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
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type LastSlotProject = {
  id: string;
  name: string;
  /** Who last edited it. */
  owner: string;
  /** When it was last edited, in ms since the epoch. */
  updatedAt: number;
  /** Open plus finished tasks. */
  tasks?: number;
  /** Finished tasks. */
  done?: number;
  /** The next milestone, one short line: "Site visit · Thu". */
  next?: string;
  /** Members' initials, drawn as a small stack. */
  members?: string[];
  /** The tile's colour: a token or CSS colour, never a hex. @default the accent */
  tint?: string;
};

export type LastSlotPlan = {
  id: string;
  name: string;
  /** Projects the plan holds. */
  limit: number;
  /** Price per unit per period. */
  price?: number;
  /** What the price is per: "seat". @default "seat" */
  unit?: string;
  /** @default "month" */
  period?: string;
  /** Two short lines on what else it brings. */
  perks?: string[];
};

export type LastSlotUsage = { used: number; limit: number };
export type LastSlotSlotStyle = "dashed" | "frosted" | "grid";
export type LastSlotLockStyle = "shackle" | "bolt" | "dial";
export type LastSlotAccent = "cobalt" | "signal" | "amber" | "graphite";
export type LastSlotRole = "admin" | "member";
export type LastSlotStatus = "ready" | "loading" | "error";

export type LastSlotProps = {
  /** The projects in the grid, in order. @default defaultLastSlotProjects (five) */
  projects?: LastSlotProject[];
  /** How many projects are used and allowed. @default { used: projects.length, limit: plan.limit } */
  usage?: LastSlotUsage;
  /** The workspace's plan. @default Starter, 5 projects */
  plan?: LastSlotPlan;
  /** The plan that holds more projects, shown on the back of the slot. @default Team, 50 projects, $12 a seat a month */
  offer?: LastSlotPlan;
  /** Admins can upgrade; members ask an admin. @default "admin" */
  viewerRole?: LastSlotRole;
  /** Who members ask. @default "Mara" */
  adminName?: string;
  /** The slot was pressed by an admin at the limit. */
  onUpgrade?: (offer: LastSlotPlan) => void;
  /** The slot was pressed by a member at the limit. */
  onAskAdmin?: (offer: LastSlotPlan) => void;
  /** Compare plans was pressed. */
  onCompare?: () => void;
  /** Not now was pressed: the slot steps aside. */
  onDismiss?: () => void;
  /** Controlled: the slot has been set aside. */
  dismissed?: boolean;
  /** Initial dismissed state when uncontrolled. @default false */
  defaultDismissed?: boolean;
  /** Fires from Not now (true) or the header's chip (false). */
  onDismissedChange?: (dismissed: boolean) => void;
  /** A project card was pressed. */
  onOpenProject?: (project: LastSlotProject) => void;
  /** The slot was pressed while there is still room under the limit. */
  onCreate?: () => void;
  /** The moment edit times count from, in ms. @default defaultLastSlotNow */
  now?: number;
  /** Formats a price. @default US dollars, cents only when there are some */
  formatPrice?: (amount: number) => string;
  /** The empty slot: a dashed outline, frosted glass over a faint card, or blueprint grid paper. @default "dashed" */
  slotStyle?: LastSlotSlotStyle;
  /** The lock: a padlock whose shackle swings, a sliding door bolt, or a combination dial. @default "shackle" */
  lockStyle?: LastSlotLockStyle;
  /** The lock, the offer's price and call to action: a named accent or any CSS colour. @default "cobalt" */
  accent?: LastSlotAccent | (string & {});
  /** Whether the projects have arrived. @default "ready" */
  status?: LastSlotStatus;
  /** "Try again" was pressed after the projects failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Projects" */
  title?: string;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                  Defaults                                */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A fixed afternoon, so relative times render the same everywhere. */
export const defaultLastSlotNow = Date.UTC(2026, 9, 12, 15, 20);
const N = defaultLastSlotNow;

/** Five Fieldline projects: the Starter plan's whole allowance. */
export const defaultLastSlotProjects: LastSlotProject[] = [
  {
    id: "harbor",
    name: "Harbor relaunch",
    next: "Launch review · Thu",
    owner: "Ines",
    updatedAt: N - 26 * MIN,
    tasks: 48,
    done: 31,
    members: ["IR", "TM", "PK", "SO"],
    tint: "var(--accent-bright)",
  },
  {
    id: "survey",
    name: "Q4 field survey",
    next: "Site visits · Oct 19",
    owner: "Tomas",
    updatedAt: N - 2 * HOUR,
    tasks: 22,
    done: 9,
    members: ["TM", "SO"],
    tint: "var(--signal)",
  },
  {
    id: "onboarding",
    name: "Onboarding v3",
    next: "Wrap-up notes · today",
    owner: "Priya",
    updatedAt: N - 5 * HOUR,
    tasks: 35,
    done: 35,
    members: ["PK", "MA", "IR"],
    tint: "var(--warn)",
  },
  {
    id: "supplier",
    name: "Supplier portal",
    next: "Vendor sign-off · Oct 22",
    owner: "Kenji",
    updatedAt: N - DAY,
    tasks: 61,
    done: 18,
    members: ["KN", "JO"],
    tint: "var(--danger)",
  },
  {
    id: "brand",
    name: "Brand refresh",
    next: "Type tests · next week",
    owner: "Mara",
    updatedAt: N - 3 * DAY,
    tasks: 14,
    done: 4,
    members: ["MA"],
    tint: "var(--ink-2)",
  },
];

export const defaultLastSlotPlan: LastSlotPlan = {
  id: "starter",
  name: "Starter",
  limit: 5,
  price: 0,
};

export const defaultLastSlotOffer: LastSlotPlan = {
  id: "team",
  name: "Team",
  limit: 50,
  price: 12,
  unit: "seat",
  period: "month",
  perks: ["Guest access", "Version history"],
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<LastSlotAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
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

/** The ghost's key among the project ids. */
const GHOST = "\u0000ghost";

const pct = (v: number) =>
  `${Number(Math.min(100, Math.max(0, v)).toFixed(3))}%`;

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;

/* ----------------------------------------------------------------------- */
/*                                   Locks                                  */
/* ----------------------------------------------------------------------- */

/** Twelve dial ticks, rounded so the server and the browser agree. */
const DIAL_TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const r1 = i % 3 === 0 ? 5.6 : 6.6;
  const r2 = 8;
  const f = (v: number) => Number(v.toFixed(3));
  return {
    x1: f(16 + r1 * Math.sin(a)),
    y1: f(19 - r1 * Math.cos(a)),
    x2: f(16 + r2 * Math.sin(a)),
    y2: f(19 - r2 * Math.cos(a)),
  };
});

function Lock({
  look,
  open,
  motionSafe,
}: {
  look: LastSlotLockStyle;
  open: boolean;
  motionSafe: boolean;
}) {
  // The unlatch leads the turn; the re-latch waits for the card to come back.
  const snap = !motionSafe
    ? { duration: 0 }
    : open
      ? springs.snap
      : { ...springs.snap, delay: 0.16 };
  const glide = !motionSafe
    ? { duration: 0 }
    : open
      ? springs.glide
      : { ...springs.glide, delay: 0.12 };
  return (
    <svg
      aria-hidden
      viewBox="0 0 32 32"
      className={cn(
        "size-9 overflow-visible transition-colors duration-200",
        open ? "text-(--ls-accent)" : "text-ink-2",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {look === "shackle" ? (
        <>
          <motion.path
            d="M11 15 V10.5 a5 5 0 0 1 10 0 V15"
            initial={false}
            animate={{ y: open ? -3.5 : 0, rotate: open ? -22 : 0 }}
            transition={snap}
            style={{ originX: 0, originY: 1 }}
          />
          <rect
            x={7}
            y={15}
            width={18}
            height={13}
            rx={3}
            className="fill-[color-mix(in_oklab,currentColor_14%,var(--card))]"
          />
          <motion.g
            initial={false}
            animate={{ rotate: open ? 90 : 0 }}
            transition={snap}
            style={{ originX: 0.5, originY: 0.5 }}
          >
            <circle
              cx={16}
              cy={20.5}
              r={1.6}
              fill="currentColor"
              stroke="none"
            />
            <path d="M16 21.5 V24" />
          </motion.g>
        </>
      ) : look === "bolt" ? (
        <>
          <rect
            x={3.5}
            y={10.5}
            width={17}
            height={11}
            rx={2.5}
            className="fill-[color-mix(in_oklab,currentColor_14%,var(--card))]"
          />
          <circle
            cx={6.5}
            cy={13.5}
            r={0.6}
            fill="currentColor"
            stroke="none"
          />
          <circle
            cx={6.5}
            cy={18.5}
            r={0.6}
            fill="currentColor"
            stroke="none"
          />
          <rect
            x={22.5}
            y={11.5}
            width={6}
            height={9}
            rx={1.5}
            strokeWidth={1.6}
          />
          <motion.g
            initial={false}
            animate={{ x: open ? -7 : 0 }}
            transition={snap}
          >
            <rect
              x={9}
              y={14.5}
              width={17.5}
              height={3}
              rx={1.5}
              fill="currentColor"
              stroke="none"
            />
            <motion.circle
              cx={13}
              cy={14.5}
              r={2.2}
              initial={false}
              animate={{ y: open ? 3.5 : 0 }}
              transition={snap}
              className="fill-card"
            />
          </motion.g>
        </>
      ) : (
        <>
          <motion.path
            d="M12 10 V7.5 a4 4 0 0 1 8 0 V10"
            initial={false}
            animate={{ y: open ? -3 : 0 }}
            transition={
              !motionSafe
                ? { duration: 0 }
                : open
                  ? { ...springs.snap, delay: 0.22 }
                  : springs.snap
            }
          />
          <circle
            cx={16}
            cy={19}
            r={9.5}
            className="fill-[color-mix(in_oklab,currentColor_12%,var(--card))]"
          />
          <motion.g
            initial={false}
            animate={{ rotate: open ? 270 : 0 }}
            transition={glide}
            style={{ originX: 0.5, originY: 0.5 }}
          >
            {DIAL_TICKS.map((t, i) => (
              <line key={i} {...t} strokeWidth={i % 3 === 0 ? 1.6 : 1} />
            ))}
            <circle cx={16} cy={19} r={2} fill="currentColor" stroke="none" />
          </motion.g>
          <path
            d="M14.6 8.6 L17.4 8.6 L16 10.4 Z"
            fill="currentColor"
            stroke="none"
          />
        </>
      )}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The grid                                 */
/* ----------------------------------------------------------------------- */

/**
 * A project grid at its plan's limit. The used projects fill the grid and the
 * next cell is a ghost slot carrying a lock. Hovering or focusing the ghost
 * unlatches the lock on snap — a shackle lifts and swings, a bolt slides out
 * of its keeper, or a dial spins and pops — and a beat later the card turns
 * over on glide (about Y in the grid, about X when it is a wide row) to show
 * the plan that holds more projects, its price and the call to action, while
 * the header's meter re-reads for that plan. Leaving turns it back and
 * re-latches the lock. Nothing else dims: every project stays a working
 * button, and arrow keys move between cards by the measured columns.
 *
 * The ghost is one labelled button whose name carries the offer and price;
 * pressing it upgrades (admins) or asks an admin (members). Compare plans and
 * Not now sit beside it as their own buttons; Not now sets the slot aside and
 * a quiet chip in the header brings it back. Under reduced motion the faces
 * cross-fade and the lock is simply drawn open; the offer still shows.
 */
export function LastSlot({
  projects = defaultLastSlotProjects,
  usage,
  plan = defaultLastSlotPlan,
  offer = defaultLastSlotOffer,
  viewerRole = "admin",
  adminName = "Mara",
  onUpgrade,
  onAskAdmin,
  onCompare,
  onDismiss,
  dismissed,
  defaultDismissed = false,
  onDismissedChange,
  onOpenProject,
  onCreate,
  now = defaultLastSlotNow,
  formatPrice = dollars,
  slotStyle = "dashed",
  lockStyle = "shackle",
  accent = "cobalt",
  status = "ready",
  onRetry,
  title = "Projects",
  disabled = false,
  className,
}: LastSlotProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const color =
    accent in ACCENTS ? ACCENTS[accent as LastSlotAccent] : (accent as string);
  const ready = status === "ready";
  const used = usage?.used ?? projects.length;
  const limit = Math.max(1, usage?.limit ?? plan.limit);
  const atLimit = used >= limit;
  const member = viewerRole === "member";

  const [ownDismissed, setOwnDismissed] = React.useState(defaultDismissed);
  const isDismissed = dismissed ?? ownDismissed;
  const showSlot = ready && !(atLimit && isDismissed);

  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [tapped, setTapped] = React.useState(false);
  const turned =
    atLimit && showSlot && !disabled && (hovered || focused || tapped);
  const [axis, setAxis] = React.useState<"y" | "x">("y");
  const [roving, setRoving] = React.useState("");
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const itemNodes = React.useRef(new Map<string, HTMLElement>());
  const lastPointer = React.useRef<string>("mouse");
  const focusChip = React.useRef(false);
  const focusGhost = React.useRef(false);
  const [slotNode, setSlotNode] = React.useState<HTMLDivElement | null>(null);

  // A wide, short slot (one column) turns over about X like a flap; a card
  // turns about Y like a page.
  React.useEffect(() => {
    if (!slotNode) return;
    const ro = new ResizeObserver(() => {
      const r = slotNode.getBoundingClientRect();
      setAxis(r.height > 0 && r.width / r.height > 2.1 ? "x" : "y");
    });
    ro.observe(slotNode);
    return () => ro.disconnect();
  }, [slotNode]);

  const price = formatPrice(offer.price ?? 0);
  const unit = offer.unit ?? "seat";
  const period = offer.period ?? "month";
  const offerLine = `${offer.name} holds ${offer.limit} projects for ${price} a ${unit} a ${period}.`;
  const ghostName = atLimit
    ? `New project. ${plan.name} holds ${plural(limit, "project")} and all are in use. ${offerLine} ${
        member ? `Press to ask ${adminName} to upgrade.` : `Press to upgrade.`
      }`
    : `New project. ${plural(limit - used, "slot")} left on ${plan.name}.`;

  const itemIds = [...projects.map((p) => p.id), ...(showSlot ? [GHOST] : [])];
  const rovingId = itemIds.includes(roving) ? roving : (itemIds[0] ?? "");

  const setDismissedTo = (next: boolean) => {
    if (dismissed === undefined) setOwnDismissed(next);
    onDismissedChange?.(next);
  };

  const dismiss = () => {
    if (disabled) return;
    focusChip.current = true;
    setHovered(false);
    setFocused(false);
    setTapped(false);
    setDismissedTo(true);
    onDismiss?.();
    say("Set aside. The limit chip in the header brings it back.");
  };

  const restore = () => {
    if (disabled) return;
    focusGhost.current = true;
    setRoving(GHOST);
    setDismissedTo(false);
    say(`${offer.name} plan shown again at the end of the grid.`);
  };

  const pressGhost = () => {
    if (disabled) return;
    if (!atLimit) {
      onCreate?.();
      return;
    }
    // A touch has no hover: the first tap turns the card over to read it.
    if (lastPointer.current === "touch" && !turned) {
      setTapped(true);
      return;
    }
    if (member) {
      onAskAdmin?.(offer);
      say(`Asked ${adminName} to upgrade to ${offer.name}.`);
    } else {
      onUpgrade?.(offer);
    }
  };

  const onItemKeyDown = (event: React.KeyboardEvent, id: string) => {
    const index = itemIds.indexOf(id);
    const itemCount = itemIds.length;
    const nodes = itemIds.map((i) => itemNodes.current.get(i));
    const tops = nodes.map((n) => n?.getBoundingClientRect().top ?? 0);
    const first = tops[0] ?? 0;
    const cols = Math.max(
      1,
      tops.filter((t) => Math.abs(t - first) < 4).length,
    );
    let next = index;
    switch (event.key) {
      case "ArrowRight":
        next = index + 1;
        break;
      case "ArrowLeft":
        next = index - 1;
        break;
      case "ArrowDown":
        next = index + cols;
        break;
      case "ArrowUp":
        next = index - cols;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = itemCount - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const to = itemIds[Math.min(itemCount - 1, Math.max(0, next))];
    if (to === undefined) return;
    setRoving(to);
    itemNodes.current.get(to)?.focus();
  };

  const registerItem = React.useCallback(
    (id: string, node: HTMLElement | null) => {
      if (node) itemNodes.current.set(id, node);
      else itemNodes.current.delete(id);
      if (node && id === GHOST && focusGhost.current) {
        focusGhost.current = false;
        node.focus({ preventScroll: true });
      }
    },
    [],
  );

  const bindChip = React.useCallback((node: HTMLButtonElement | null) => {
    if (node && focusChip.current) {
      focusChip.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);

  /* ------------------------------ header ------------------------------- */

  const fill = turned ? used / offer.limit : Math.min(1, used / limit);
  const segments = Math.min(limit, 12);
  const meter = (
    <div className="flex items-center gap-2.5">
      <div className="relative order-2 h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-colors duration-200",
            turned
              ? "bg-(--ls-pigment)"
              : used > limit
                ? "bg-warn"
                : "bg-ink-3",
          )}
          initial={false}
          animate={{ width: pct(fill * 100) }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
        {Array.from({ length: segments - 1 }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "absolute inset-y-0 w-0.5 bg-card transition-opacity duration-200",
              turned ? "opacity-0" : "opacity-100",
            )}
            style={{ left: pct(((i + 1) / segments) * 100) }}
          />
        ))}
      </div>
      <div className="relative order-1 grid text-[11px] text-ink-3 tabular-nums">
        <AnimatePresence initial={false}>
          <motion.span
            key={turned ? "offer" : "plan"}
            className="text-right whitespace-nowrap [grid-area:1/1]"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            {turned ? (
              <>
                <span className="text-(--ls-accent)">
                  {used} of {offer.limit}
                </span>{" "}
                on {offer.name}
              </>
            ) : (
              <>
                <span className={cn(atLimit ? "text-foreground" : "")}>
                  {used} of {limit}
                </span>{" "}
                projects
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );

  /* ------------------------------- ghost ------------------------------- */

  const frontLook = cn(
    "absolute inset-0 flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-3 px-4 text-center",
    slotStyle === "dashed" &&
      "border-[1.5px] border-dashed border-hairline-strong bg-transparent",
    slotStyle === "frosted" && "border border-hairline bg-surface-1",
    slotStyle === "grid" &&
      "border border-[color-mix(in_oklab,var(--ls-accent)_38%,transparent)] bg-[color-mix(in_oklab,var(--ls-pigment)_5%,var(--card))] bg-[linear-gradient(color-mix(in_oklab,var(--ls-accent)_12%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--ls-accent)_12%,transparent)_1px,transparent_1px)] bg-size-[12px_12px]",
  );

  const front = (
    <div className={frontLook} style={{ backfaceVisibility: "hidden" }}>
      {slotStyle === "frosted" ? (
        <div
          aria-hidden
          className="absolute inset-3 flex flex-col gap-2 opacity-60 blur-[3px]"
        >
          <div className="flex items-center gap-2">
            <span className="size-7 rounded-2 bg-[color-mix(in_oklab,var(--ls-pigment)_30%,var(--card))]" />
            <span className="h-2.5 w-24 rounded-full bg-ink-3/40" />
          </div>
          <span className="h-2 w-3/4 rounded-full bg-ink-3/25" />
          <span className="mt-auto h-1.5 w-full rounded-full bg-ink-3/25" />
        </div>
      ) : null}
      {slotStyle === "frosted" ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-[color-mix(in_oklab,var(--card)_55%,transparent)] backdrop-blur-[2px]"
        />
      ) : null}
      <div className="relative flex flex-col items-center gap-1.5">
        {atLimit ? (
          <Lock look={lockStyle} open={turned} motionSafe={motionSafe} />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full border border-hairline-strong text-ink-2">
            <Plus aria-hidden className="size-4" />
          </span>
        )}
        <span className="text-[13px] font-medium text-foreground">
          New project
        </span>
        <span className="text-[11px] text-ink-3">
          {atLimit
            ? `${plan.name} holds ${plural(limit, "project")}`
            : `${plural(limit - used, "slot")} left on ${plan.name}`}
        </span>
      </div>
    </div>
  );

  const back = (
    <div
      className="absolute inset-0 flex flex-col gap-2 overflow-hidden rounded-3 border border-[color-mix(in_oklab,var(--ls-accent)_40%,var(--hairline-strong))] bg-popover p-3.5 text-left shadow-[0_10px_28px_color-mix(in_oklab,black_14%,transparent)]"
      style={{
        backfaceVisibility: "hidden",
        transform: motionSafe
          ? axis === "x"
            ? "rotateX(180deg)"
            : "rotateY(180deg)"
          : undefined,
      }}
    >
      <span className="pr-7 font-mono text-[10px] tracking-[0.08em] text-(--ls-accent) uppercase">
        {offer.name} plan · {plural(offer.limit, "project")}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl leading-none font-semibold tracking-tight tabular-nums">
          {price}
        </span>
        <span className="text-[11px] text-ink-3">
          a {unit} / {period}
        </span>
      </div>
      {offer.perks && offer.perks.length > 0 ? (
        <ul className="hidden flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2 @min-[30rem]:flex">
          {offer.perks.slice(0, 2).map((p) => (
            <li key={p} className="inline-flex items-center gap-1">
              <Check
                aria-hidden
                className="size-3 shrink-0 text-(--ls-accent)"
              />
              {p}
            </li>
          ))}
        </ul>
      ) : null}
      <span className="mt-auto inline-flex h-7 w-fit items-center gap-1.5 rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground">
        {member ? `Ask ${adminName}` : `Upgrade`}
        <ArrowRight aria-hidden className="size-3.5 shrink-0" />
      </span>
    </div>
  );

  const turnTransition = !motionSafe
    ? { duration: durations.fast }
    : turned
      ? { ...springs.glide, delay: 0.09 }
      : springs.glide;

  const ghost = (
    <motion.li
      key="ghost"
      className="relative"
      initial={{ opacity: 0, scale: motionSafe ? 0.96 : 1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.96 : 1,
        transition: exitFor(),
      }}
      transition={
        motionSafe
          ? { scale: springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
    >
      <div
        ref={setSlotNode}
        // One column: a full-width flap a little taller than a row.
        className="relative h-28 [perspective:900px] @min-[30rem]:h-full"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHovered(false);
        }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          const to = e.relatedTarget;
          if (!(to instanceof Node && e.currentTarget.contains(to))) {
            setFocused(false);
            setTapped(false);
          }
        }}
      >
        <div className="relative h-full">
          {motionSafe ? (
            <motion.div
              className="absolute inset-0"
              style={{ transformStyle: "preserve-3d" }}
              initial={false}
              animate={
                axis === "x"
                  ? { rotateX: turned ? 180 : 0, rotateY: 0 }
                  : { rotateY: turned ? 180 : 0, rotateX: 0 }
              }
              transition={turnTransition}
            >
              {front}
              {back}
            </motion.div>
          ) : (
            <div className="absolute inset-0">
              <motion.div
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: turned ? 0 : 1 }}
                transition={{ duration: durations.fast }}
              >
                {front}
              </motion.div>
              <motion.div
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: turned ? 1 : 0 }}
                transition={{ duration: durations.fast }}
              >
                {back}
              </motion.div>
            </div>
          )}
          <button
            ref={(node) => registerItem(GHOST, node)}
            type="button"
            aria-label={ghostName}
            aria-disabled={disabled || undefined}
            tabIndex={rovingId === GHOST ? 0 : -1}
            data-ls-ghost=""
            onPointerDown={(e) => {
              lastPointer.current = e.pointerType;
            }}
            onKeyDown={(e) => onItemKeyDown(e, GHOST)}
            onFocus={() => setRoving(GHOST)}
            onClick={pressGhost}
            className={cn(
              "absolute inset-0 rounded-3",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          />
          {atLimit ? (
            <motion.div
              className={cn(
                "pointer-events-none absolute inset-0",
                turned && "[&>*]:pointer-events-auto",
              )}
              initial={false}
              animate={{ opacity: turned ? 1 : 0 }}
              transition={
                turned
                  ? {
                      duration: durations.fast,
                      delay: motionSafe ? 0.24 : 0,
                    }
                  : { duration: durations.blink }
              }
            >
              <button
                type="button"
                onClick={() => {
                  if (!disabled) onCompare?.();
                }}
                aria-disabled={disabled || undefined}
                className={cn(
                  "absolute right-2.5 bottom-3.5 inline-flex h-7 items-center rounded-2 px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                Compare plans
              </button>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Not now"
                title="Not now"
                aria-disabled={disabled || undefined}
                className={cn(
                  "absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </motion.div>
          ) : null}
        </div>
      </div>
    </motion.li>
  );

  /* ------------------------------- cards ------------------------------- */

  const card = (p: LastSlotProject) => {
    const tint = p.tint ?? color;
    const total = p.tasks ?? 0;
    const finished = Math.min(total, p.done ?? 0);
    const share = total > 0 ? finished / total : 0;
    const when = ago(p.updatedAt, now);
    return (
      <li key={p.id} className="relative">
        <button
          ref={(node) => registerItem(p.id, node)}
          type="button"
          tabIndex={rovingId === p.id ? 0 : -1}
          aria-disabled={disabled || undefined}
          aria-label={`${p.name}. Edited ${when} by ${p.owner}.${
            total > 0 ? ` ${finished} of ${total} tasks done.` : ""
          }${p.next ? ` Next: ${p.next}.` : ""}`}
          onKeyDown={(e) => onItemKeyDown(e, p.id)}
          onFocus={() => setRoving(p.id)}
          onClick={() => {
            if (!disabled) onOpenProject?.(p);
          }}
          className={cn(
            "group/last-slot-card flex h-full w-full items-center gap-3 rounded-3 border border-hairline bg-surface-1 p-2.5 text-left transition-colors",
            "@min-[30rem]:flex-col @min-[30rem]:items-stretch @min-[30rem]:gap-2.5 @min-[30rem]:p-3.5",
            disabled
              ? "cursor-not-allowed"
              : "hover:border-hairline-strong hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-3 @min-[30rem]:flex-none">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-2 text-[13px] font-semibold"
              style={{
                backgroundColor: `color-mix(in oklab, oklch(from ${tint} 0.72 c h) 20%, var(--card))`,
                color: tint,
              }}
            >
              {p.name.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-[13px] font-medium"
                title={p.name}
              >
                {p.name}
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                {when} · {p.owner}
              </span>
            </span>
          </span>
          {p.next ? (
            <span
              aria-hidden
              className="hidden items-center gap-1.5 truncate text-[11px] text-ink-2 @min-[30rem]:flex"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-(--ls-pigment)" />
              <span className="truncate">Next: {p.next}</span>
            </span>
          ) : null}
          <span
            aria-hidden
            className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums @min-[30rem]:hidden"
          >
            {Math.round(share * 100)}%
          </span>
          <span
            aria-hidden
            className="mt-auto hidden flex-col gap-2 @min-[30rem]:flex"
          >
            <span className="flex items-center justify-between text-[11px] text-ink-3 tabular-nums">
              <span>
                {finished}/{total} tasks
              </span>
              <span className="flex -space-x-1.5">
                {(p.members ?? []).slice(0, 4).map((m) => (
                  <span
                    key={m}
                    className="flex size-5 items-center justify-center rounded-full border-2 border-surface-1 bg-surface-2 text-[8px] font-semibold text-ink-2 group-hover/last-slot-card:border-surface-2"
                  >
                    {m}
                  </span>
                ))}
              </span>
            </span>
            <span className="relative h-1 overflow-hidden rounded-full bg-surface-2 group-hover/last-slot-card:bg-[color-mix(in_oklab,var(--color-surface-0)_60%,var(--card))]">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: pct(share * 100),
                  backgroundColor: `oklch(from ${tint} 0.68 c h)`,
                }}
              />
            </span>
          </span>
        </button>
      </li>
    );
  };

  const gridClass =
    "grid grid-cols-1 gap-2 @min-[30rem]:grid-cols-2 @min-[30rem]:gap-3 @min-[44rem]:grid-cols-3";

  const body = () => {
    if (status === "error") {
      return (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The projects did not load.</p>
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
        <div aria-busy="true" className="flex-1 overflow-y-auto p-4">
          <p className="sr-only">Loading the projects.</p>
          <ul aria-hidden className={gridClass}>
            {Array.from({ length: 6 }, (_, i) => (
              <li
                key={i}
                className="flex h-14 items-center gap-3 rounded-3 border border-hairline bg-surface-1 p-2.5 @min-[30rem]:h-36 @min-[30rem]:flex-col @min-[30rem]:items-stretch @min-[30rem]:p-3.5"
              >
                <span className="size-8 shrink-0 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                <span className="h-2.5 w-2/3 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 @min-[30rem]:p-4">
        <ul
          aria-labelledby={titleId}
          className={cn(
            gridClass,
            "@min-[30rem]:auto-rows-[10rem] @min-[44rem]:auto-rows-[11rem]",
          )}
        >
          {projects.map((p) => card(p))}
          <AnimatePresence initial={false}>
            {showSlot ? ghost : null}
          </AnimatePresence>
        </ul>
        <p className="mt-auto hidden text-[11px] text-ink-3 @min-[30rem]:block">
          Archived projects do not count toward the limit.
        </p>
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
          "--ls-accent": color,
          "--ls-pigment": `oklch(from ${color} 0.66 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-hairline bg-surface-1 px-2 text-[11px] text-ink-2">
            {plan.name}
          </span>
        </div>
        {ready ? (
          <div className="flex items-center gap-3">
            <AnimatePresence initial={false}>
              {atLimit && isDismissed ? (
                <motion.button
                  key="chip"
                  ref={bindChip}
                  type="button"
                  onClick={restore}
                  aria-disabled={disabled || undefined}
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          y: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--ls-accent)_35%,transparent)] px-2 text-[11px] text-(--ls-accent) transition-colors hover:bg-[color-mix(in_oklab,var(--ls-pigment)_10%,transparent)]",
                    FOCUS_RING,
                  )}
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-(--ls-pigment)"
                  />
                  Limit reached · See options
                </motion.button>
              ) : null}
            </AnimatePresence>
            {meter}
          </div>
        ) : null}
      </header>

      {body()}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
