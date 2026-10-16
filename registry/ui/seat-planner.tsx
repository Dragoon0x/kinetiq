"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type Variants,
} from "motion/react";
import {
  Armchair,
  Check,
  Minus,
  Plus,
  RotateCcw,
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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type SeatPlannerChairStyle = "chair" | "stool" | "dot";
export type SeatPlannerAccentName = "cobalt" | "plum" | "mint" | "ink";
export type SeatPlannerStatus = "ready" | "loading" | "error";

export type SeatMember = {
  id: string;
  name: string;
  /** Shown in menus: "Owner", "Admin". */
  role?: string;
  /** Whether they hold a seat today. Seated members fill the chairs in order. */
  seated: boolean;
};

export type SeatPricing = {
  /** Price of one seat for a whole period. */
  perSeat: number;
  /** Period start and end, ms since the epoch (end exclusive). */
  periodStart: number;
  periodEnd: number;
};

export type SeatChange = {
  /** The seat count being confirmed. */
  seats: number;
  /** Seats added in this change. */
  added: number;
  /** Paid seats given up in this change. */
  removed: number;
  /** Charged today for the added seats, prorated. */
  charge: number;
  /** Credited on the next invoice for the removed seats, prorated. */
  credit: number;
  /** Who sits where, by member id: the chair's index from 0. */
  assignments: Record<string, number>;
};

type Async = void | Promise<unknown>;

export type SeatPlannerProps = {
  /** Seats paid for today. @default 10 */
  seats?: number;
  /** Controlled draft seat count; the planner follows it whenever it changes. */
  value?: number;
  /** Initial draft count when uncontrolled. @default seats */
  defaultValue?: number;
  /** Fires from the stepper, a key or a menu with the new draft count. */
  onSeatsChange?: (count: number) => void;
  /** Everyone in the workspace, and whether they hold a seat. @default defaultSeatMembers */
  members?: SeatMember[];
  /** Fires when someone is seated (with the chair's index) or stood up (null). */
  onAssign?: (memberId: string, chair: number | null) => void;
  /** Price per seat and the billing period. @default defaultSeatPricing */
  pricing?: SeatPricing;
  /** The moment proration counts from, in ms. @default Oct 17 2026, 14:00 UTC */
  now?: number;
  /** The most seats the plan allows. @default 40 */
  maxSeats?: number;
  /** Confirm was pressed. Return a promise to hold the button; a rejection keeps the draft and shows its message. */
  onConfirm?: (change: SeatChange) => Async;
  /** The draft was thrown away. */
  onDiscard?: () => void;
  /** The workspace's name. @default "Coldbrook" */
  workspace?: string;
  /** Whether the seats have arrived. @default "ready" */
  status?: SeatPlannerStatus;
  /** "Try again" was pressed after the seats failed to load. */
  onRetry?: () => void;
  /** How each seat is drawn. @default "chair" */
  chairStyle?: SeatPlannerChairStyle;
  /** Space between chairs, in px. @default 10 */
  gap?: number;
  /** New chairs, the drop target and Confirm: a named pigment or any CSS colour. @default "cobalt" */
  accent?: SeatPlannerAccentName | (string & {});
  /** How money is written. @default Intl USD */
  formatMoney?: (amount: number) => string;
  /** Seats and assignments are read-only. @default false */
  disabled?: boolean;
  /** Classes for the panel; it caps at 36rem tall and scrolls inside past that. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

export const defaultSeatMembers: SeatMember[] = [
  { id: "ada", name: "Ada Brennan", role: "Owner", seated: true },
  { id: "mira", name: "Mira Okafor", role: "Admin", seated: true },
  { id: "jonah", name: "Jonah Feld", seated: true },
  { id: "lise", name: "Lise Marchetti", seated: true },
  { id: "tomas", name: "Tomás Reyes", seated: true },
  { id: "priya", name: "Priya Nair", seated: true },
  { id: "sven", name: "Sven Aalto", seated: true },
  { id: "hana", name: "Hana Kobayashi", seated: true },
  { id: "noor", name: "Noor Haddad", role: "Invited", seated: false },
  { id: "iven", name: "Iven Castell", role: "Invited", seated: false },
  { id: "teo", name: "Teodor Lind", role: "Invited", seated: false },
];

export const defaultSeatPricing: SeatPricing = {
  perSeat: 12,
  periodStart: Date.UTC(2026, 9, 1),
  periodEnd: Date.UTC(2026, 10, 1),
};

const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14);

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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/** A stable hue per person, from their id (unsigned, so it never goes negative). */
const HUES = [262, 160, 80, 25, 320, 200, 120];
const hueOf = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return HUES[(h >>> 0) % HUES.length] ?? 262;
};
/** Pigment discs: the accent token's lightness pinned, the hue per person. */
const discStyle = (id: string): React.CSSProperties => {
  const hue = hueOf(id);
  return {
    backgroundColor: `oklch(from var(--accent-bright) 0.82 0.07 ${hue})`,
    color: `oklch(from var(--accent-bright) 0.3 0.06 ${hue})`,
  };
};

type Slot = {
  id: string;
  memberId: string | null;
  paid: boolean;
  /** Its place among the chairs one change added, and how many that was. */
  arrive?: { order: number; of: number };
};

const findLast = (list: Slot[], test: (s: Slot) => boolean) => {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (s && test(s)) return i;
  }
  return -1;
};

/** The next free id of a kind: "seat-11", "new-3". Pure, so a re-render agrees. */
const nextId = (list: Slot[], prefix: string, from = 1) => {
  let n = from;
  const taken = new Set(list.map((s) => s.id));
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};

/**
 * Brings the chairs to `target`: a paid seat given up earlier comes back
 * first (so adding and removing never charges and credits the same seat),
 * then new ones; removing takes the last empty new chair, then the last
 * empty paid one — never a chair someone is sitting in.
 */
const reconcile = (slots: Slot[], target: number, paidCount: number) => {
  const out = slots.slice();
  const of = Math.max(0, target - out.length);
  let order = 0;
  while (out.length < target) {
    const paidHere = out.filter((s) => s.paid).length;
    const arrive = { order: order++, of };
    if (paidHere < paidCount) {
      out.push({ id: nextId(out, "seat"), memberId: null, paid: true, arrive });
    } else {
      out.push({ id: nextId(out, "new"), memberId: null, paid: false, arrive });
    }
  }
  while (out.length > target) {
    let i = findLast(out, (s) => !s.memberId && !s.paid);
    if (i < 0) i = findLast(out, (s) => !s.memberId);
    if (i < 0) break;
    out.splice(i, 1);
  }
  return out;
};

const initialSlots = (
  members: SeatMember[],
  paid: number,
  draft: number,
): Slot[] => {
  const seated = members.filter((m) => m.seated);
  const base: Slot[] = Array.from({ length: Math.max(paid, 0) }, (_, i) => ({
    id: `seat-${i + 1}`,
    memberId: seated[i]?.id ?? null,
    paid: true,
  }));
  return reconcile(base, Math.max(draft, seated.length), paid);
};

/**
 * Accent as custom properties. Text and strokes take the token; the draft
 * chair's fill is pigment, the token's hue and chroma at a fixed lightness,
 * so a tinted chair reads the same in either theme.
 */
const ACCENTS: Record<SeatPlannerAccentName, Record<string, string>> = {
  cobalt: {
    "--sp-ink": "var(--accent-bright)",
    "--sp-fill": "var(--primary)",
    "--sp-on": "var(--primary-foreground)",
  },
  plum: {
    "--sp-ink": "oklch(from var(--accent-bright) l c 320)",
    "--sp-fill": "oklch(from var(--accent-bright) 0.54 c 320)",
    "--sp-on": "var(--primary-foreground)",
  },
  mint: {
    "--sp-ink": "var(--success)",
    "--sp-fill": "oklch(from var(--success) 0.68 c h)",
    "--sp-on": "oklch(from var(--success) 0.22 0.04 h)",
  },
  ink: {
    "--sp-ink": "var(--ink-2)",
    "--sp-fill": "var(--foreground)",
    "--sp-on": "var(--background)",
  },
};

const accentVars = (accent: string): React.CSSProperties => {
  const named = ACCENTS[accent as SeatPlannerAccentName];
  const vars = named ?? {
    "--sp-ink": accent,
    "--sp-fill": accent,
    "--sp-on": "var(--primary-foreground)",
  };
  return {
    ...vars,
    "--sp-wash": "color-mix(in oklab, var(--sp-ink) 14%, transparent)",
    "--sp-pale": "color-mix(in oklab, var(--sp-ink) 22%, var(--card))",
  } as React.CSSProperties;
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

/** A box whose height follows its measured content on glide. */
function Reveal({
  open,
  motionSafe,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="reveal"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: exitFor(durations.base) }}
          transition={
            motionSafe
              ? { height: springs.glide, opacity: { duration: durations.base } }
              : { duration: 0 }
          }
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** The seat itself, drawn: a chair from the side, a stool, or a plain token. */
function ChairGlyph({
  style,
  fresh,
  taken,
}: {
  style: SeatPlannerChairStyle;
  fresh: boolean;
  taken: boolean;
}) {
  const body = cn(
    "transition-[fill,stroke] duration-300",
    fresh
      ? "fill-[var(--sp-pale)] stroke-[var(--sp-ink)]"
      : taken
        ? "fill-surface-2 stroke-ink-3"
        : "fill-card stroke-ink-3",
  );
  const dash = fresh ? "3 2" : undefined;
  // Confirmed draft chairs firm from dashed accent to solid on a tween.
  if (style === "dot") {
    return (
      <svg aria-hidden viewBox="0 0 44 40" className="block h-10 w-11">
        <circle
          cx={22}
          cy={20}
          r={15}
          strokeWidth={1.5}
          strokeDasharray={dash}
          className={body}
        />
      </svg>
    );
  }
  if (style === "stool") {
    return (
      <svg aria-hidden viewBox="0 0 44 40" className="block h-10 w-11">
        <path
          d="M 13 24 L 11 38 M 31 24 L 33 38 M 22 26 L 22 38 M 14 32 L 30 32"
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          className={fresh ? "stroke-[var(--sp-ink)]" : "stroke-ink-3"}
        />
        <ellipse
          cx={22}
          cy={21}
          rx={13}
          ry={5}
          strokeWidth={1.5}
          strokeDasharray={dash}
          className={body}
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 44 40" className="block h-10 w-11">
      <path
        d="M 12 29 L 11 38 M 32 29 L 33 38"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        className={fresh ? "stroke-[var(--sp-ink)]" : "stroke-ink-3"}
      />
      <rect
        x={11}
        y={2.75}
        width={22}
        height={19}
        rx={6}
        strokeWidth={1.5}
        strokeDasharray={dash}
        className={body}
      />
      <rect
        x={7.75}
        y={22.75}
        width={28.5}
        height={6.5}
        rx={3.25}
        strokeWidth={1.5}
        strokeDasharray={dash}
        className={body}
      />
    </svg>
  );
}

/** Where a seated person's disc sits on each kind of seat. */
const DISC_TOP: Record<SeatPlannerChairStyle, number> = {
  chair: 4,
  stool: 8,
  dot: 6,
};

/* ----------------------------------------------------------------------- */
/*                                 A chair                                  */
/* ----------------------------------------------------------------------- */

function Chair({
  slot,
  index,
  who,
  chairStyle,
  motionSafe,
  target,
  open,
  menuId,
  tabbable,
  disabled,
  flash,
  chairVariants,
  shadowVariants,
  register,
  onFocusChair,
  onKey,
  onOpen,
}: {
  slot: Slot;
  index: number;
  who: SeatMember | null;
  chairStyle: SeatPlannerChairStyle;
  motionSafe: boolean;
  target: boolean;
  open: boolean;
  menuId: string;
  tabbable: boolean;
  disabled: boolean;
  flash: number;
  chairVariants: Variants;
  shadowVariants: Variants;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onFocusChair: (id: string) => void;
  onKey: (event: React.KeyboardEvent, index: number) => void;
  onOpen: (node: HTMLButtonElement) => void;
}) {
  const bind = React.useCallback(
    (node: HTMLButtonElement | null) => register(slot.id, node),
    [register, slot.id],
  );
  const isNew = !slot.paid;
  const delay =
    (slot.arrive?.order ?? 0) * cascade(Math.max(2, slot.arrive?.of ?? 1));
  return (
    <motion.button
      ref={bind}
      type="button"
      custom={delay}
      layout={motionSafe ? "position" : false}
      variants={chairVariants}
      initial="drop"
      animate="sit"
      exit="lift"
      transition={{ layout: springs.glide }}
      tabIndex={tabbable ? 0 : -1}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      aria-label={`Chair ${index + 1}, ${who ? who.name : "empty"}${isNew ? ", new" : ""}`}
      aria-disabled={disabled || undefined}
      data-sp-chair=""
      onFocus={() => onFocusChair(slot.id)}
      onKeyDown={(event) => onKey(event, index)}
      onClick={(event) => onOpen(event.currentTarget)}
      className={cn(
        "relative flex w-11 shrink-0 flex-col items-center rounded-2 pt-1",
        FOCUS,
        disabled ? "cursor-default" : "cursor-pointer",
      )}
    >
      <motion.span
        aria-hidden
        custom={delay}
        variants={shadowVariants}
        className="pointer-events-none absolute top-[2.45rem] left-1/2 -ml-[15px] h-[5px] w-[30px] rounded-full bg-[color-mix(in_oklab,var(--foreground)_12%,transparent)]"
      />
      <motion.span
        aria-hidden
        className="relative block"
        initial={false}
        animate={
          motionSafe
            ? { y: target ? -4 : 0, scale: target ? 1.06 : 1 }
            : { y: 0, scale: 1 }
        }
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        <ChairGlyph style={chairStyle} fresh={isNew} taken={Boolean(who)} />
        {isNew && !who ? (
          <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-[var(--sp-fill)] text-[var(--sp-on)]">
            <Plus className="size-2.5" strokeWidth={3} />
          </span>
        ) : null}
        <AnimatePresence initial={false}>
          {who ? (
            <motion.span
              key={who.id}
              className="absolute left-1/2 -ml-[11px] flex size-[22px] items-center justify-center rounded-full font-mono text-[9px] leading-none font-semibold shadow-sm"
              style={{ top: DISC_TOP[chairStyle], ...discStyle(who.id) }}
              initial={
                motionSafe
                  ? { opacity: 0, y: -10, scale: 0.85 }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                ...(motionSafe ? { y: -8 } : {}),
                transition: exitFor(durations.base),
              }}
              transition={
                motionSafe
                  ? {
                      y: springs.recoil,
                      scale: springs.recoil,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            >
              {initials(who.name)}
            </motion.span>
          ) : null}
        </AnimatePresence>
        {target ? (
          <span className="absolute -inset-0.5 rounded-2 ring-2 ring-[var(--sp-ink)]" />
        ) : null}
        {who && flash > 0 ? (
          <motion.span
            key={flash}
            className="absolute -inset-0.5 rounded-2 ring-2 ring-warn"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{
              duration: durations.page,
              ease: easings.move,
              times: [0, 0.3, 1],
            }}
          />
        ) : null}
      </motion.span>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 font-mono text-[9px] leading-3 tabular-nums",
          isNew ? "text-[var(--sp-ink)]" : "text-ink-3",
        )}
      >
        {index + 1}
      </span>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                              A waiting chip                              */
/* ----------------------------------------------------------------------- */

type Target = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function WaitingChip({
  member,
  motionSafe,
  disabled,
  open,
  menuId,
  onMenu,
  onStart,
  onHover,
  onDrop,
  register,
}: {
  member: SeatMember;
  motionSafe: boolean;
  disabled: boolean;
  open: boolean;
  menuId: string;
  onMenu: () => void;
  onStart: () => void;
  onHover: (x: number, y: number) => void;
  onDrop: (x: number, y: number) => boolean;
  register: (id: string, node: HTMLButtonElement | null) => void;
}) {
  const bindRef = React.useCallback(
    (node: HTMLButtonElement | null) => register(member.id, node),
    [member.id, register],
  );
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [lifted, setLifted] = React.useState(false);
  const home = (vx = 0, vy = 0) => {
    if (!motionSafe) {
      x.jump(0);
      y.jump(0);
      return;
    }
    animate(x, 0, { ...springs.glide, velocity: vx });
    animate(y, 0, { ...springs.glide, velocity: vy });
  };
  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      setLifted(true);
      onStart();
    },
    onMove: ({ offset, point }) => {
      // 1:1 under the finger: the chip is wherever the pointer says.
      x.set(Math.round(offset.x));
      y.set(Math.round(offset.y));
      onHover(point.x, point.y);
    },
    onEnd: ({ point, velocity }) => {
      setLifted(false);
      if (!onDrop(point.x, point.y)) home(velocity.x, velocity.y);
    },
    onCancel: () => {
      setLifted(false);
      onDrop(Number.NaN, Number.NaN);
      home();
    },
    onTap: () => onMenu(),
  });

  return (
    <motion.button
      ref={bindRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      aria-label={`${member.name}, waiting for a seat`}
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        // Pointer presses arrive through the drag's tap; a click with no
        // pointer behind it (Enter, Space, assistive tech) opens the menu.
        if (event.detail === 0) onMenu();
      }}
      {...drag}
      style={{ x, y, zIndex: lifted ? 20 : undefined }}
      exit={{ opacity: 0, scale: 0.92, transition: exitFor(durations.fast) }}
      className={cn(
        "relative inline-flex h-8 max-w-full touch-none items-center gap-2 rounded-full border bg-card pr-3 pl-1 text-[12px] text-foreground select-none",
        FOCUS,
        "transition-[box-shadow,border-color] duration-150",
        lifted
          ? "cursor-grabbing border-[var(--sp-ink)] shadow-lg"
          : "cursor-grab border-hairline hover:border-hairline-strong",
        open && "border-[var(--sp-ink)]",
        disabled && "cursor-default opacity-60",
      )}
    >
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-semibold"
        style={discStyle(member.id)}
      >
        {initials(member.name)}
      </span>
      <span className="truncate">{member.name}</span>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Menu =
  | { kind: "chair"; slotId: string }
  | { kind: "member"; memberId: string }
  | null;

type MenuAction =
  | { type: "stand"; slotId: string }
  | { type: "seat"; memberId: string; slotId: string; from: "chair" | "chip" }
  | { type: "remove"; slotId: string }
  | { type: "add"; memberId: string };

type MenuItem = {
  key: string;
  label: string;
  meta?: string;
  tone?: "danger";
  action: MenuAction;
};

type Phase = "idle" | "saving" | "saved" | "failed";

/**
 * Seats as a row of chairs. Seated members sit on theirs as initials on a
 * disc; an empty paid seat is an outline; a seat added in the draft is a
 * dashed chair in the accent with a plus until the change is confirmed.
 * The stepper beside them sets the count, the cost below it says what
 * today's change costs — prorated over the days left — or what comes back
 * as credit, and Confirm sends the change.
 *
 * The signature is the chair drop. A seat added sets a new chair into the
 * row from 16px above, landing on `springs.recoil` — two small settles, a
 * chair put down — while its shadow spreads on the floor, a beat apart per
 * chair when several arrive at once, and today's charge rolls up as they
 * land. A seat removed lifts its chair away on the exit ease while the
 * shadow shrinks, and the credit opens beneath. Someone seated lands their
 * disc on the chair on recoil; the chairs around a removed one close up on
 * `springs.glide`.
 *
 * Waiting members are chips you can drag onto an empty chair (1:1 under the
 * finger, capture after 4px, home on glide with the release velocity) or
 * open: every chip and chair opens a small menu — seat someone, stand them
 * up, remove this seat, add a seat for them — walked with the arrow keys.
 * The chairs are one roving group (Left, Right, Home, End); the count is a
 * spinbutton (arrows, Page keys, Home for the floor, End for the ceiling).
 * The count never falls below the seats in use: asking for less says why
 * and flashes the occupied chairs. A failed confirm keeps the draft. Under
 * reduced motion chairs and discs fade in and out in place.
 */
export function SeatPlanner({
  seats = 10,
  value: valueProp,
  defaultValue,
  onSeatsChange,
  members = defaultSeatMembers,
  onAssign,
  pricing = defaultSeatPricing,
  now = DEFAULT_NOW,
  maxSeats = 40,
  onConfirm,
  onDiscard,
  workspace = "Coldbrook",
  status = "ready",
  onRetry,
  chairStyle = "chair",
  gap = 10,
  accent = "cobalt",
  formatMoney = defaultMoney,
  disabled = false,
  className,
}: SeatPlannerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const menuId = `${uid}-menu`;
  const hintId = `${uid}-hint`;
  const style: SeatPlannerChairStyle =
    chairStyle === "stool" || chairStyle === "dot" ? chairStyle : "chair";
  const ready = status === "ready";

  /* -------------------------------- state -------------------------------- */

  const [paidCount, setPaidCount] = React.useState(seats);
  const [slots, setSlots] = React.useState<Slot[]>(() =>
    initialSlots(members, seats, valueProp ?? defaultValue ?? seats),
  );
  // The host's figures win whenever they change: a new paid count after a
  // confirm, or a new draft count from a controlled parent.
  const [seenSeats, setSeenSeats] = React.useState(seats);
  if (seats !== seenSeats) {
    setSeenSeats(seats);
    setPaidCount(seats);
    setSlots((list) =>
      list.map((s, i) => (i < seats ? { ...s, paid: true } : s)),
    );
  }
  const [seenValue, setSeenValue] = React.useState(valueProp);
  if (valueProp !== seenValue) {
    setSeenValue(valueProp);
    if (valueProp !== undefined) {
      setSlots((list) => reconcile(list, valueProp, paidCount));
    }
  }

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [failure, setFailure] = React.useState<string | null>(null);
  const [floorHint, setFloorHint] = React.useState(false);
  const [flash, setFlash] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");
  const [menu, setMenu] = React.useState<Menu>(null);
  const [activeChair, setActiveChair] = React.useState<string | null>(null);
  const [hoverSlot, setHoverSlot] = React.useState<string | null>(null);
  const attempt = React.useRef(0);

  const count = slots.length;
  const taken = slots.filter((s) => s.memberId).length;
  const floor = Math.max(1, taken);
  const ceiling = Math.max(floor, maxSeats);
  const added = slots.filter((s) => !s.paid).length;
  const paidHere = slots.filter((s) => s.paid).length;
  const removed = Math.max(0, paidCount - paidHere);
  const daysTotal = Math.max(
    1,
    Math.round((pricing.periodEnd - pricing.periodStart) / DAY),
  );
  const daysLeft = clamp(
    Math.ceil((pricing.periodEnd - now) / DAY),
    0,
    daysTotal,
  );
  const share = daysLeft / daysTotal;
  const charge = cents(added * pricing.perSeat * share);
  const credit = cents(removed * pricing.perSeat * share);
  const dirty = added > 0 || removed > 0;
  const renews = dayLabel(pricing.periodEnd);
  const seated = new Set(slots.map((s) => s.memberId).filter(Boolean));
  const waiting = members.filter((m) => !seated.has(m.id));
  const byId = new Map(members.map((m) => [m.id, m]));

  /* ------------------------------- actions ------------------------------- */

  const commitSlots = (next: Slot[], said: string) => {
    setSlots(next);
    if (next.length !== count) onSeatsChange?.(next.length);
    if (phase !== "saving") setPhase("idle");
    setFailure(null);
    setAnnouncement(said);
  };

  const step = (delta: number) => {
    if (disabled || !ready || phase === "saving") return;
    const target = clamp(count + delta, 1, ceiling);
    if (count + delta < floor) {
      // Never below the seats in use: say why and show which they are.
      setFloorHint(true);
      setFlash((f) => f + 1);
      setAnnouncement(
        `${plural(taken, "seat is", "seats are")} taken. Unassign someone to remove one.`,
      );
      return;
    }
    if (target === count) return;
    setFloorHint(false);
    const next = reconcile(slots, target, paidCount);
    const nextAdded = next.filter((s) => !s.paid).length;
    const nextRemoved = Math.max(
      0,
      paidCount - next.filter((s) => s.paid).length,
    );
    commitSlots(
      next,
      nextAdded > 0
        ? `${plural(target, "seat")}. ${formatMoney(cents(nextAdded * pricing.perSeat * share))} today.`
        : nextRemoved > 0
          ? `${plural(target, "seat")}. ${formatMoney(cents(nextRemoved * pricing.perSeat * share))} credit.`
          : `${plural(target, "seat")}. No change to pay.`,
    );
  };

  const seat = (memberId: string, slotId: string) => {
    const index = slots.findIndex((s) => s.id === slotId);
    const target = slots[index];
    if (!target || target.memberId) return;
    const next = slots.map((s) => (s.id === slotId ? { ...s, memberId } : s));
    setSlots(next);
    onAssign?.(memberId, index);
    setFloorHint(false);
    setAnnouncement(
      `${byId.get(memberId)?.name ?? "Member"} seated in chair ${index + 1}.`,
    );
  };

  const standUp = (slotId: string) => {
    const index = slots.findIndex((s) => s.id === slotId);
    const target = slots[index];
    if (!target?.memberId) return;
    const who = target.memberId;
    setSlots(
      slots.map((s) => (s.id === slotId ? { ...s, memberId: null } : s)),
    );
    onAssign?.(who, null);
    setAnnouncement(
      `${byId.get(who)?.name ?? "Member"} unassigned. Chair ${index + 1} is empty.`,
    );
  };

  const removeSeat = (slotId: string) => {
    const target = slots.find((s) => s.id === slotId);
    if (!target || target.memberId || count <= floor) return;
    const next = slots.filter((s) => s.id !== slotId);
    commitSlots(next, `Seat removed. ${plural(next.length, "seat")}.`);
  };

  const addSeatFor = (memberId: string): string | null => {
    if (count >= ceiling) return null;
    const next = reconcile(slots, count + 1, paidCount);
    const fresh = next[next.length - 1];
    if (!fresh) return null;
    const withMember = next.map((s) =>
      s.id === fresh.id ? { ...s, memberId } : s,
    );
    commitSlots(
      withMember,
      `Seat added for ${byId.get(memberId)?.name ?? "them"}. ${plural(withMember.length, "seat")}.`,
    );
    onAssign?.(memberId, withMember.length - 1);
    return fresh.id;
  };

  const discard = () => {
    if (phase === "saving") return;
    const kept = slots.filter((s) => s.paid);
    const restored = reconcile(kept, paidCount, paidCount);
    const stood = slots.filter((s) => !s.paid && s.memberId);
    commitSlots(restored, `Changes discarded. ${plural(paidCount, "seat")}.`);
    for (const s of stood) if (s.memberId) onAssign?.(s.memberId, null);
    setFloorHint(false);
    onDiscard?.();
  };

  const confirm = () => {
    if (disabled || !ready || !dirty || phase === "saving") return;
    const run = ++attempt.current;
    const assignments: Record<string, number> = {};
    slots.forEach((s, i) => {
      if (s.memberId) assignments[s.memberId] = i;
    });
    const change: SeatChange = {
      seats: count,
      added,
      removed,
      charge,
      credit,
      assignments,
    };
    setPhase("saving");
    setFailure(null);
    setAnnouncement("Saving seats.");
    const land = () => {
      if (attempt.current !== run) return;
      setSlots((list) => list.map((s) => ({ ...s, paid: true })));
      setPaidCount(change.seats);
      setPhase("saved");
      setAnnouncement(
        `${plural(change.seats, "seat")} confirmed.${change.charge > 0 ? ` ${formatMoney(change.charge)} charged today.` : ""}${change.credit > 0 ? ` ${formatMoney(change.credit)} credit on ${renews}.` : ""}`,
      );
    };
    const result = onConfirm?.(change);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(land, (reason: unknown) => {
        if (attempt.current !== run) return;
        const message =
          reason instanceof Error && reason.message
            ? reason.message
            : "The change didn't go through.";
        setPhase("failed");
        setFailure(`${message} Your changes are kept.`);
        setAnnouncement(`Not saved. ${message}`);
      });
    } else {
      land();
    }
  };

  /* -------------------------------- menus -------------------------------- */

  // A chair that already exists takes focus at once; one this action is
  // adding takes it when its node arrives (see registerChair).
  const pendingFocus = React.useRef<string | null>(null);
  const chairRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const chipRefs = React.useRef(new Map<string, HTMLButtonElement>());
  // One stable callback each, so every chair and chip binds its ref once
  // for its whole life (a motion element's ref must never change).
  const registerChair = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (!node) {
        chairRefs.current.delete(id);
        return;
      }
      chairRefs.current.set(id, node);
      if (pendingFocus.current === id) {
        pendingFocus.current = null;
        node.focus({ preventScroll: true });
      }
    },
    [],
  );
  const registerChip = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) chipRefs.current.set(id, node);
      else chipRefs.current.delete(id);
    },
    [],
  );
  const menuTrigger = React.useRef<HTMLElement | null>(null);
  const focusMenu = React.useRef(false);
  const focusChairNow = (id: string) => {
    const node = chairRefs.current.get(id);
    if (node?.isConnected) node.focus({ preventScroll: true });
    else pendingFocus.current = id;
  };

  const openMenu = (next: Menu, trigger: HTMLElement | null) => {
    if (disabled || !ready) return;
    const same =
      menu &&
      next &&
      ((menu.kind === "chair" &&
        next.kind === "chair" &&
        menu.slotId === next.slotId) ||
        (menu.kind === "member" &&
          next.kind === "member" &&
          menu.memberId === next.memberId));
    if (same) {
      setMenu(null);
      return;
    }
    menuTrigger.current = trigger;
    focusMenu.current = true;
    setMenu(next);
  };
  const closeMenu = (refocus: boolean) => {
    setMenu(null);
    const t = menuTrigger.current;
    if (refocus && t?.isConnected) t.focus({ preventScroll: true });
  };
  const bindMenu = React.useCallback((node: HTMLDivElement | null) => {
    if (node && focusMenu.current) {
      focusMenu.current = false;
      node
        .querySelector<HTMLButtonElement>("[role=menuitem]")
        ?.focus({ preventScroll: true });
    }
  }, []);

  // Menu items are data; one handler runs the chosen action, so nothing
  // built during render holds on to a ref.
  const menuItems: MenuItem[] = (() => {
    if (!menu) return [];
    if (menu.kind === "chair") {
      const slot = slots.find((s) => s.id === menu.slotId);
      if (!slot) return [];
      if (slot.memberId) {
        const who = byId.get(slot.memberId);
        return [
          {
            key: "stand",
            label: `Unassign ${who?.name ?? "this member"}`,
            meta: who?.role,
            action: { type: "stand", slotId: slot.id },
          },
        ];
      }
      const items: MenuItem[] = waiting.map((m) => ({
        key: m.id,
        label: `Seat ${m.name}`,
        meta: m.role,
        action: {
          type: "seat",
          memberId: m.id,
          slotId: slot.id,
          from: "chair",
        },
      }));
      if (count > floor) {
        items.push({
          key: "remove",
          label: "Remove this seat",
          meta: slot.paid
            ? `${formatMoney(cents(pricing.perSeat * share))} credit`
            : "Not charged yet",
          tone: "danger",
          action: { type: "remove", slotId: slot.id },
        });
      }
      return items;
    }
    const who = byId.get(menu.memberId);
    if (!who) return [];
    const items: MenuItem[] = slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !s.memberId)
      .map(({ s, i }) => ({
        key: s.id,
        label: `Seat in chair ${i + 1}`,
        meta: s.paid ? "Paid" : "New",
        action: { type: "seat", memberId: who.id, slotId: s.id, from: "chip" },
      }));
    if (count < ceiling) {
      items.push({
        key: "add",
        label: `Add a seat for ${who.name.split(" ")[0] ?? who.name}`,
        meta: `${formatMoney(cents(pricing.perSeat * share))} today`,
        action: { type: "add", memberId: who.id },
      });
    }
    return items;
  })();

  const runMenu = (action: MenuAction) => {
    if (action.type === "stand") {
      standUp(action.slotId);
      closeMenu(true);
    } else if (action.type === "seat") {
      seat(action.memberId, action.slotId);
      if (action.from === "chair") closeMenu(true);
      else {
        // The chip leaves the tray; focus goes to the chair they took.
        setMenu(null);
        focusChairNow(action.slotId);
      }
    } else if (action.type === "remove") {
      const i = slots.findIndex((s) => s.id === action.slotId);
      const neighbour = slots[i + 1] ?? slots[i - 1];
      setMenu(null);
      if (neighbour) focusChairNow(neighbour.id);
      removeSeat(action.slotId);
    } else {
      const id = addSeatFor(action.memberId);
      setMenu(null);
      if (id) focusChairNow(id);
    }
  };

  const menuTitle = !menu
    ? ""
    : menu.kind === "chair"
      ? (() => {
          const i = slots.findIndex((s) => s.id === menu.slotId);
          const s = slots[i];
          const who = s?.memberId ? byId.get(s.memberId)?.name : null;
          return `Chair ${i + 1}${who ? ` · ${who}` : " · empty"}`;
        })()
      : `${byId.get(menu.memberId)?.name ?? ""} · waiting`;

  const menuKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role=menuitem]",
      ),
    );
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (i + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (i - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    } else if (event.key === "Tab") {
      setMenu(null);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  };

  /* -------------------------------- drag --------------------------------- */

  const targets = React.useRef<Target[]>([]);
  const measureTargets = () => {
    targets.current = [];
    for (const s of slots) {
      if (s.memberId) continue;
      const r = chairRefs.current.get(s.id)?.getBoundingClientRect();
      if (r)
        targets.current.push({
          id: s.id,
          left: r.left - 4,
          top: r.top - 4,
          right: r.right + 4,
          bottom: r.bottom + 4,
        });
    }
    setMenu(null);
  };
  const hitTest = (x: number, y: number) =>
    targets.current.find(
      (t) => x >= t.left && x <= t.right && y >= t.top && y <= t.bottom,
    )?.id ?? null;
  const hover = (x: number, y: number) => {
    const id = hitTest(x, y);
    if (id !== hoverSlot) setHoverSlot(id);
  };
  const drop = (memberId: string, x: number, y: number) => {
    const id = Number.isNaN(x) ? null : hitTest(x, y);
    setHoverSlot(null);
    targets.current = [];
    if (!id) return false;
    seat(memberId, id);
    return true;
  };

  /* -------------------------------- chairs ------------------------------- */

  const chairKeys = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = Math.min(slots.length - 1, index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = slots.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const s = slots[next];
    if (!s) return;
    setActiveChair(s.id);
    chairRefs.current.get(s.id)?.focus();
  };

  const rovingId =
    activeChair && slots.some((s) => s.id === activeChair)
      ? activeChair
      : (slots[0]?.id ?? null);

  // A chair is set down on recoil — two small settles — a beat after the
  // one before it when a single change adds several; lifting away is an
  // exit, so it leaves on the exit ease and never springs.
  const chairVariants: Variants = {
    drop: motionSafe ? { opacity: 0, y: -distances.shift } : { opacity: 0 },
    sit: (delay: number) =>
      motionSafe
        ? {
            opacity: 1,
            y: 0,
            transition: {
              y: { ...springs.recoil, delay },
              opacity: { duration: durations.fast, delay },
            },
          }
        : { opacity: 1, transition: { duration: durations.fast } },
    lift: motionSafe
      ? { opacity: 0, y: -12, transition: exitFor(durations.base) }
      : { opacity: 0, transition: { duration: durations.fast } },
  };
  const shadowVariants: Variants = {
    drop: motionSafe ? { opacity: 0, scaleX: 0.4 } : { opacity: 0 },
    sit: (delay: number) =>
      motionSafe
        ? {
            opacity: 1,
            scaleX: 1,
            transition: {
              scaleX: { ...springs.recoil, delay },
              opacity: { duration: durations.base, delay },
            },
          }
        : { opacity: 1, transition: { duration: durations.fast } },
    lift: motionSafe
      ? { opacity: 0, scaleX: 0.4, transition: exitFor(durations.base) }
      : { opacity: 0, transition: { duration: durations.fast } },
  };

  const spinKeys = (event: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 5,
      PageDown: -5,
    };
    if (event.key === "Home") {
      event.preventDefault();
      step(floor - count);
    } else if (event.key === "End") {
      event.preventDefault();
      step(ceiling - count);
    } else if (map[event.key] !== undefined) {
      event.preventDefault();
      const delta = map[event.key] ?? 0;
      // A page step stops at the floor rather than refusing outright.
      step(
        delta < -1 && count > floor ? Math.max(delta, floor - count) : delta,
      );
    }
  };

  /* -------------------------------- render ------------------------------- */

  const confirmLabel =
    phase === "saving"
      ? "Saving…"
      : added > 0
        ? `Add ${plural(added, "seat")} · ${formatMoney(charge)}`
        : removed > 0
          ? `Remove ${plural(removed, "seat")}`
          : phase === "saved"
            ? "Saved"
            : "No changes";

  const summary = (
    <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <span id={`${uid}-count`} className="text-[13px] leading-5 font-medium">
          Seats
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Remove a seat"
            aria-describedby={floorHint ? hintId : undefined}
            aria-disabled={
              disabled || !ready || count <= floor || phase === "saving"
                ? true
                : undefined
            }
            onClick={() => step(-1)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-2 border border-hairline text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
              (disabled || !ready || count <= floor) && "text-ink-3",
            )}
          >
            <Minus aria-hidden className="size-3.5" />
          </button>
          <span
            role="spinbutton"
            tabIndex={disabled || !ready ? -1 : 0}
            aria-labelledby={`${uid}-count`}
            aria-valuenow={count}
            aria-valuemin={floor}
            aria-valuemax={ceiling}
            aria-valuetext={`${plural(count, "seat")}${added ? `, ${added} new` : ""}${removed ? `, ${removed} to remove` : ""}`}
            aria-disabled={disabled || !ready || undefined}
            onKeyDown={spinKeys}
            className={cn(
              "inline-flex h-8 min-w-11 items-center justify-center rounded-2 px-2 font-mono text-[16px] leading-none font-medium text-foreground tabular-nums",
              FOCUS,
            )}
          >
            <Roll value={String(count)} motionSafe={motionSafe} />
          </span>
          <button
            type="button"
            aria-label="Add a seat"
            aria-disabled={
              disabled || !ready || count >= ceiling || phase === "saving"
                ? true
                : undefined
            }
            onClick={() => step(1)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-2 border border-hairline text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
              (disabled || !ready || count >= ceiling) && "text-ink-3",
            )}
          >
            <Plus aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-hairline pt-3">
        <p className={EYEBROW}>
          {removed > 0 && added === 0 ? "Credit" : "Today"}
        </p>
        <p
          className={cn(
            "font-mono text-[22px] leading-7 font-medium tabular-nums",
            removed > 0 && added === 0 ? "text-success" : "text-foreground",
          )}
        >
          <span className="sr-only">
            {removed > 0 && added === 0
              ? `${formatMoney(credit)} credit`
              : `${formatMoney(charge)} today`}
          </span>
          {removed > 0 && added === 0 ? "−" : added > 0 ? "+" : ""}
          <Roll
            value={formatMoney(removed > 0 && added === 0 ? credit : charge)}
            motionSafe={motionSafe}
          />
        </p>
        <p className="text-[11px] leading-4 text-ink-3">
          {added > 0
            ? `${plural(added, "new seat")} × ${daysLeft} of ${daysTotal} days`
            : removed > 0
              ? `${plural(removed, "seat")} × ${daysLeft} of ${daysTotal} days, on the ${renews} invoice`
              : `No change to pay · ${daysLeft} days left`}
        </p>
        <Reveal open={added > 0 && removed > 0} motionSafe={motionSafe}>
          <p className="pt-1 text-[11px] leading-4 text-success">
            −{formatMoney(credit)} credit on the {renews} invoice
          </p>
        </Reveal>
      </div>

      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px] leading-4 text-ink-2">
        <span>From {renews}</span>
        <span className="font-medium text-foreground tabular-nums">
          {plural(count, "seat")} ·{" "}
          {formatMoney(cents(count * pricing.perSeat))}/mo
        </span>
      </p>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={confirm}
          aria-disabled={
            disabled || !ready || !dirty || phase === "saving" || undefined
          }
          aria-busy={phase === "saving" || undefined}
          className={cn(
            "relative inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-2 px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,opacity,translate] active:translate-y-px",
            FOCUS,
            dirty || phase === "saving"
              ? "bg-[var(--sp-fill)] text-[var(--sp-on)] hover:opacity-90"
              : "border border-hairline bg-surface-1 text-ink-2",
            (disabled || !ready || (!dirty && phase !== "saving")) &&
              "cursor-default",
          )}
        >
          {phase === "saved" && !dirty ? (
            <Check aria-hidden className="size-3.5 text-success" />
          ) : null}
          <span className="truncate tabular-nums">{confirmLabel}</span>
        </button>
        {dirty && phase !== "saving" ? (
          <button
            type="button"
            onClick={discard}
            className={cn(
              "self-center rounded-1 text-[11px] leading-4 text-ink-3 underline-offset-2 hover:text-foreground hover:underline",
              FOCUS,
            )}
          >
            Discard changes
          </button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {failure ? (
          <motion.p
            key="failure"
            role="alert"
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
            <span className="flex items-start gap-2 rounded-2 bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-2.5 py-2 text-[11px] leading-4 text-danger">
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {failure}
            </span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const chairs = (
    <div
      role="group"
      aria-label={`Seats, ${count}, ${taken} taken`}
      className="flex flex-wrap"
      style={{ columnGap: clamp(gap, 0, 32), rowGap: clamp(gap, 0, 32) + 6 }}
    >
      <AnimatePresence initial={false}>
        {slots.map((s, i) => (
          <Chair
            key={s.id}
            slot={s}
            index={i}
            who={s.memberId ? (byId.get(s.memberId) ?? null) : null}
            chairStyle={style}
            motionSafe={motionSafe}
            target={hoverSlot === s.id}
            open={menu?.kind === "chair" && menu.slotId === s.id}
            menuId={menuId}
            tabbable={rovingId === s.id}
            disabled={disabled || !ready}
            flash={flash}
            chairVariants={chairVariants}
            shadowVariants={shadowVariants}
            register={registerChair}
            onFocusChair={setActiveChair}
            onKey={chairKeys}
            onOpen={(node) => openMenu({ kind: "chair", slotId: s.id }, node)}
          />
        ))}
      </AnimatePresence>
    </div>
  );

  const tray = (
    <div className="flex flex-col gap-2">
      <p className={EYEBROW}>Waiting for a seat · {waiting.length}</p>
      {waiting.length === 0 ? (
        <p className="text-[12px] leading-4 text-ink-3">
          Everyone in {workspace} has a seat.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {waiting.map((m) => (
              <WaitingChip
                key={m.id}
                member={m}
                motionSafe={motionSafe}
                disabled={disabled || !ready}
                open={menu?.kind === "member" && menu.memberId === m.id}
                menuId={menuId}
                onMenu={() =>
                  openMenu(
                    { kind: "member", memberId: m.id },
                    chipRefs.current.get(m.id) ?? null,
                  )
                }
                onStart={measureTargets}
                onHover={hover}
                onDrop={(x, y) => drop(m.id, x, y)}
                register={registerChip}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
      {waiting.length > 0 && !disabled ? (
        <p className="text-[11px] leading-4 text-ink-3">
          Drag someone onto an empty chair, or open a chair to choose.
        </p>
      ) : null}
    </div>
  );

  const body =
    status === "error" ? (
      <div className="flex flex-col items-center gap-2 rounded-3 border border-hairline px-4 py-6 text-center">
        <TriangleAlert aria-hidden className="size-4 text-danger" />
        <p className="text-[13px] leading-5 text-foreground">
          The seats didn&apos;t load.
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
    ) : status === "loading" ? (
      <div
        aria-busy="true"
        className="grid gap-4 @min-[36rem]:grid-cols-[minmax(0,1fr)_15rem]"
      >
        <span className="sr-only">Loading seats.</span>
        <div className="flex flex-wrap gap-2.5">
          {Array.from({ length: Math.max(1, seats) }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="h-12 w-11 rounded-2 bg-surface-2 motion-safe:animate-pulse"
            />
          ))}
        </div>
        <span
          aria-hidden
          className="h-44 rounded-3 bg-surface-2 motion-safe:animate-pulse"
        />
      </div>
    ) : (
      <div className="grid items-start gap-4 @min-[36rem]:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {chairs}
          <Reveal open={floorHint} motionSafe={motionSafe}>
            <p
              id={hintId}
              className="flex items-start gap-2 rounded-2 bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-2.5 py-2 text-[12px] leading-4 text-foreground"
            >
              <TriangleAlert
                aria-hidden
                className="mt-px size-3.5 shrink-0 text-warn"
              />
              {plural(taken, "seat is", "seats are")} taken. Unassign someone to
              remove one.
            </p>
          </Reveal>
          <Reveal
            open={menu !== null && menuItems.length > 0}
            motionSafe={motionSafe}
          >
            <div
              key={
                menu
                  ? menu.kind === "chair"
                    ? menu.slotId
                    : menu.memberId
                  : "none"
              }
              ref={bindMenu}
              id={menuId}
              role="menu"
              aria-label={menuTitle}
              onKeyDown={menuKeys}
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (next && event.currentTarget.contains(next)) return;
                if (next && menuTrigger.current?.contains(next)) return;
                setMenu(null);
              }}
              className="flex flex-col gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 text-popover-foreground shadow-raised"
            >
              <p
                aria-hidden
                className="truncate px-2 pt-1 pb-0.5 font-mono text-[10px] leading-4 tracking-[0.06em] text-ink-3 uppercase"
              >
                {menuTitle}
              </p>
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => runMenu(item.action)}
                  className={cn(
                    "flex h-8 items-center justify-between gap-3 rounded-2 px-2 text-left text-[12px] transition-colors hover:bg-surface-2 focus-visible:bg-surface-2",
                    FOCUS,
                    item.tone === "danger" ? "text-danger" : "text-foreground",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.meta ? (
                    <span className="shrink-0 font-mono text-[10px] text-ink-3">
                      {item.meta}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </Reveal>
          {tray}
        </div>
        {summary}
      </div>
    );

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
        <div className="flex flex-col gap-4 p-4 @min-[36rem]:p-5">
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--sp-wash)] text-[var(--sp-ink)]"
              >
                <Armchair className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col">
                <h2
                  id={titleId}
                  className="truncate text-[15px] leading-5 font-semibold"
                >
                  Seats
                </h2>
                <p className="truncate text-[12px] leading-4 text-ink-3">
                  {workspace} · {formatMoney(pricing.perSeat)} a seat a month
                </p>
              </div>
            </div>
            {ready ? (
              <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-card px-2.5 font-mono text-[11px] text-ink-2 tabular-nums">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-[var(--sp-ink)]"
                />
                {taken} of {count} taken
              </span>
            ) : null}
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
