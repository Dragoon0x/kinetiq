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
  type Transition,
} from "motion/react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  Coffee,
  Delete,
  Landmark,
  PiggyBank,
  Plus,
  Receipt,
  RotateCcw,
  ShoppingBag,
  ShoppingBasket,
  TrainFront,
  X,
  type LucideIcon,
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { semitones, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";
import { EyeLid } from "@/registry/ui/eye-lid";
import { SettleButton, type SettleState } from "@/registry/ui/settle-button";

/* --------------------------------- types --------------------------------- */

export type BankHideStyle = "roll" | "frost" | "redact";
export type BankSheetStyle = "bottom" | "full" | "float";
export type BankDensity = "compact" | "cozy" | "roomy";
export type BankStatus = "ready" | "loading" | "error";
export type BankCategory =
  | "groceries"
  | "dining"
  | "transport"
  | "bills"
  | "shopping"
  | "transfer"
  | "income"
  | "savings";
export type BankSendMode = "send" | "request" | "add";

export type BankTransaction = {
  id: string;
  /** Who it was with: a merchant, an employer or a person. */
  name: string;
  /** Signed, in major units: negative left the account. */
  amount: number;
  /** When it happened, epoch ms. */
  at: number;
  category: BankCategory;
  /** A quieter line under the name: "Card ··4821", "Dinner split". */
  note?: string;
  /** Still clearing. A pending debit holds money; a pending credit is not spendable yet. */
  pending?: boolean;
  /** The contact's id, when it was a transfer with a person. */
  contact?: string;
};

export type BankAccount = {
  /** "Everyday". */
  name: string;
  /** The last four digits. */
  number: string;
  /** The balance before the first transaction in the list; the balance shown is this plus the list. */
  opening: number;
  /** ISO 4217. @default "USD" */
  currency?: string;
};

export type BankContact = {
  id: string;
  name: string;
  /** "@mira". */
  handle?: string;
};

export type BankPayment = {
  mode: BankSendMode;
  /** Major units, always positive. */
  amount: number;
  /** The contact's id; absent when adding money from savings. */
  contact?: string;
};

export type BankAppProps = {
  /** The account on the card. @default defaultBankAccount */
  account?: BankAccount;
  /** Controlled transactions, any order (they are shown newest first). */
  transactions?: BankTransaction[];
  /** Initial transactions when uncontrolled. @default defaultBankTransactions */
  defaultTransactions?: BankTransaction[];
  /** Fires with every transaction once a payment made here has landed. */
  onTransactionsChange?: (transactions: BankTransaction[]) => void;
  /** Who money can be sent to or asked from. @default defaultBankContacts */
  contacts?: BankContact[];
  /** The first name in the greeting. @default "Ada" */
  owner?: string;
  /** The bank's name, over the greeting and in the accessible name. @default "Coldbrook Bank" */
  bank?: string;
  /** The current moment (Date or ms): the status bar's clock, Today and Yesterday. @default defaultBankNow */
  now?: Date | number;
  /** Minutes east of UTC that times are shown in, so server and browser agree. @default 0 */
  zoneOffset?: number;
  /** Controlled privacy: true hides the balance. */
  hidden?: boolean;
  /** Initial privacy when uncontrolled. @default false */
  defaultHidden?: boolean;
  /** Fires from the eye that hid or showed the balance. */
  onHiddenChange?: (hidden: boolean) => void;
  /** How the balance hides: its digits roll down into dots, frost over, or a bar wipes across them. @default "roll" */
  balance?: BankHideStyle;
  /** How the send sheet presents: rising while home recedes behind it, covering the screen, or as a floating card. @default "bottom" */
  sheet?: BankSheetStyle;
  /** Row height 48, 56 or 64px, with avatars, paddings and the balance to match. @default "cozy" */
  density?: BankDensity;
  /** Sends, requests or adds the money. A returned promise holds the button until it settles; a rejection leaves the sheet open on Retry. */
  onSend?: (payment: BankPayment) => Promise<unknown> | unknown;
  /** A transaction's detail opened (its id) or closed (null). */
  onTransactionOpen?: (id: string | null) => void;
  /** The locale for amounts. @default "en-US" */
  locale?: string;
  /** Formats an amount (always positive) for the card, the rows and the sheet. @default Intl.NumberFormat currency in `locale` */
  format?: (amount: number, currency: string) => string;
  /** Whether the activity has arrived. @default "ready" */
  status?: BankStatus;
  /** "Try again" was pressed after the activity failed to load. */
  onRetry?: () => void;
  /** The screen's accessible name. @default `bank` */
  label?: string;
  /** Play the pad's ticks and the navigation. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

/** Wednesday 30 September 2026, 09:41. */
export const defaultBankNow = Date.UTC(2026, 8, 30, 9, 41);

export const defaultBankAccount: BankAccount = {
  name: "Everyday",
  number: "4821",
  opening: 3027.6,
  currency: "USD",
};

export const defaultBankContacts: BankContact[] = [
  { id: "mira", name: "Mira Chen", handle: "@mira" },
  { id: "tomas", name: "Tomas Reyes", handle: "@tomasr" },
  { id: "ines", name: "Ines Park", handle: "@ines" },
  { id: "juno", name: "Juno Adeyemi", handle: "@juno" },
];

const CARD = "Card ··4821";
/** Name, amount, day of September, time, category, note, then "pending" or a contact's id. */
const SEED: [string, number, number, string, BankCategory, string, string?][] =
  [
    ["Basinworks Market", -36.2, 30, "09:05", "groceries", CARD, "pending"],
    ["Fernworks Café", -4.8, 30, "08:12", "dining", CARD],
    ["Line 4 Transit", -2.75, 30, "07:48", "transport", "Tap to ride"],
    ["Mira Chen", 18.5, 29, "19:40", "transfer", "Dinner split", "mira"],
    ["Waylight Books", -22.99, 29, "13:15", "shopping", CARD],
    ["Gaugeworks Energy", -64.1, 29, "10:02", "bills", "Direct debit"],
    ["Tomas Reyes", -40, 28, "18:20", "transfer", "Climbing gym", "tomas"],
    ["Coldbrook Bakery", -6.4, 28, "08:30", "dining", CARD],
    ["Round-ups", -12.4, 28, "06:05", "savings", "To Savings ··1190"],
    ["Fieldline Ltd", 2640, 28, "06:00", "income", "Monthly pay"],
    ["Line 4 Transit", -2.75, 27, "16:40", "transport", "Tap to ride"],
    ["Basinworks Market", -58.45, 27, "11:20", "groceries", CARD],
    ["Fernworks Café", -3.9, 27, "09:10", "dining", CARD],
    ["Ines Park", 25, 26, "20:15", "transfer", "Concert tickets", "ines"],
    ["Harbour Cinema", -24, 26, "19:00", "dining", CARD],
    [
      "Larch Row Lettings",
      -1250,
      26,
      "09:00",
      "bills",
      "Rent · standing order",
    ],
  ];

/** Five days of Ada's Everyday account: 16 transactions, one still pending. */
export const defaultBankTransactions: BankTransaction[] = SEED.map(
  ([name, amount, day, time, category, note, extra], i) => {
    const [h = 0, m = 0] = time.split(":").map(Number);
    return {
      id: `t${SEED.length - i}`,
      name,
      amount,
      at: Date.UTC(2026, 8, day, h, m),
      category,
      note,
      ...(extra === "pending"
        ? { pending: true }
        : extra
          ? { contact: extra }
          : {}),
    };
  },
);

/* -------------------------------- helpers -------------------------------- */

const DAY = 86_400_000;
const SAVINGS = "Savings ··1190";
const ADD_LIMIT = 5000;
const MAX_WHOLE = 7;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (d: Date | number) => (typeof d === "number" ? d : d.getTime());
const pad2 = (n: number) => String(n).padStart(2, "0");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS =
  "January February March April May June July August September October November December".split(
    " ",
  );

/** A moment's parts in the shown zone, read in UTC so the server agrees. */
const partsOf = (ms: number, offset: number) => new Date(ms + offset * 60_000);
const dayIndex = (ms: number, offset: number) =>
  Math.floor((ms + offset * 60_000) / DAY);
const clockOf = (ms: number, offset: number) => {
  const d = partsOf(ms, offset);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
const dateOf = (ms: number, offset: number, long = false) => {
  const d = partsOf(ms, offset);
  const month = MONTHS[d.getUTCMonth()] ?? "";
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${long ? month : month.slice(0, 3)}`;
};
const dayName = (ms: number, now: number, offset: number) => {
  const gap = dayIndex(now, offset) - dayIndex(ms, offset);
  return gap === 0 ? "Today" : gap === 1 ? "Yesterday" : dateOf(ms, offset);
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/**
 * Category tints are turns of the accent's own hue at a fixed lightness:
 * pigment, so a chip reads the same on the light page and the dark one.
 */
const CATEGORY: Record<
  BankCategory,
  { label: string; icon: LucideIcon; turn: number }
> = {
  groceries: { label: "Groceries", icon: ShoppingBasket, turn: -110 },
  dining: { label: "Eating out", icon: Coffee, turn: 140 },
  transport: { label: "Transport", icon: TrainFront, turn: -30 },
  bills: { label: "Bills", icon: Receipt, turn: 40 },
  shopping: { label: "Shopping", icon: ShoppingBag, turn: 75 },
  transfer: { label: "Transfer", icon: ArrowLeftRight, turn: -62 },
  income: { label: "Income", icon: Landmark, turn: -100 },
  savings: { label: "Savings", icon: PiggyBank, turn: -150 },
};
const ink = (turn: number) =>
  `oklch(from var(--accent-bright) 0.62 0.14 calc(h + ${turn}))`;
const wash = (turn: number) =>
  `oklch(from var(--accent-bright) 0.66 0.13 calc(h + ${turn}) / 0.16)`;

const DENSITY: Record<
  BankDensity,
  { row: number; avatar: number; figure: number; pad: string; text: string }
> = {
  compact: {
    row: 48,
    avatar: 28,
    figure: 30,
    pad: "px-3",
    text: "text-[13px]",
  },
  cozy: { row: 56, avatar: 32, figure: 34, pad: "px-4", text: "text-sm" },
  roomy: { row: 64, avatar: 36, figure: 38, pad: "px-4", text: "text-sm" },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Money that has actually moved: a pending credit is not spendable yet. */
const counts = (t: BankTransaction) => !(t.pending && t.amount > 0);

/** Arrow keys walk a radiogroup and choose as they go, as a native one does. */
function roveRadio(
  event: React.KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  choose: (to: number) => void,
) {
  const dir =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (!dir || count < 1) return;
  event.preventDefault();
  const to = (index + dir + count) % count;
  choose(to);
  event.currentTarget.parentElement
    ?.querySelectorAll<HTMLElement>("[role=radio]")
    [to]?.focus();
}

/* ------------------------------- the balance ------------------------------ */

const WHEEL = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "•"];

/**
 * One digit as a wheel of 0–9 and a dot. Its position is a motion value the
 * spring drives, so a hide, a reveal and a change of balance are the same
 * roll; a StrictMode re-run carries the roll on to rest rather than freezing.
 */
function Wheel({
  target,
  lh,
  transition,
}: {
  /** 0–9, or 10 for the dot. */
  target: number;
  lh: number;
  transition: Transition;
}) {
  const y = useMotionValue(-target * lh);
  const latest = React.useRef(transition);
  React.useEffect(() => {
    latest.current = transition;
  });
  React.useEffect(() => {
    const controls = animate(y, -target * lh, latest.current);
    return () => controls.stop();
  }, [target, lh, y]);
  return (
    <span
      className="relative inline-block overflow-clip text-center"
      style={{ width: "1ch", height: lh }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ y }}
      >
        {WHEEL.map((c) => (
          <span key={c} className="block" style={{ height: lh }}>
            {c}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * The balance, drawn as wheels. Hiding rolls them down to dots right to left
 * (`roll`), frosts them (`frost`) or wipes a bar across them (`redact`); in
 * the last two the wheels turn to dots out of sight, so the figure is never
 * readable underneath. A new balance rolls units first, on glide.
 */
function Figure({
  text,
  hidden,
  style,
  size,
  motionSafe,
}: {
  text: string;
  hidden: boolean;
  style: BankHideStyle;
  size: number;
  motionSafe: boolean;
}) {
  const lh = Math.round(size * 1.18);
  // What changed since the last render decides the roll: a hide sweeps, a
  // new balance counts like an odometer.
  const [seen, setSeen] = React.useState({
    text,
    hidden,
    cause: "none" as "none" | "toggle" | "value",
  });
  if (seen.text !== text || seen.hidden !== hidden) {
    setSeen({
      text,
      hidden,
      cause: seen.hidden !== hidden ? "toggle" : "value",
    });
  }
  const chars = Array.from(text);
  const digits = chars.filter((c) => /\d/.test(c)).length;
  const step = cascade(Math.max(2, digits));

  let order = 0;
  const slots = chars.map((c, i) => {
    const fromRight = chars.length - 1 - i;
    if (!/\d/.test(c)) {
      return (
        <motion.span
          key={`s${fromRight}`}
          className="inline-block"
          initial={false}
          animate={{ opacity: hidden && style === "roll" ? 0.45 : 1 }}
          transition={{ duration: durations.base }}
        >
          {c}
        </motion.span>
      );
    }
    const k = order;
    order += 1;
    let transition: Transition = { duration: 0 };
    if (motionSafe && seen.cause === "toggle") {
      transition =
        style === "roll"
          ? { ...springs.snap, delay: r3((hidden ? digits - 1 - k : k) * step) }
          : // Frost and redact turn the wheels while they are covered.
            { duration: 0, delay: hidden ? 0.2 : 0 };
    } else if (motionSafe && seen.cause === "value") {
      transition = { ...springs.glide, delay: r3((digits - 1 - k) * 0.03) };
    }
    return (
      <Wheel
        key={`d${fromRight}`}
        target={hidden ? 10 : Number(c)}
        lh={lh}
        transition={transition}
      />
    );
  });

  const frost = style === "frost" && hidden;
  const redact = style === "redact" && hidden;
  return (
    <span
      aria-hidden
      className="relative inline-flex font-semibold tracking-tight tabular-nums"
      style={{ fontSize: size, lineHeight: `${lh}px`, height: lh }}
    >
      <motion.span
        className="inline-flex"
        initial={false}
        animate={{
          opacity: frost ? 0.18 : 1,
          filter: motionSafe && frost ? "blur(8px)" : "blur(0px)",
        }}
        transition={{ duration: durations.slow, ease: easings.enter }}
      >
        {slots}
      </motion.span>
      {style === "frost" ? (
        <motion.span
          className="absolute inset-y-[14%] left-0 flex items-center rounded-full bg-white/18 px-3 text-[0.62em] tracking-[0.2em] backdrop-blur-sm"
          initial={false}
          animate={{ opacity: frost ? 1 : 0 }}
          transition={{
            duration: durations.base,
            delay: frost && motionSafe ? 0.08 : 0,
          }}
        >
          ••••••
        </motion.span>
      ) : null}
      {style === "redact" ? (
        <motion.span
          className="absolute inset-y-[4%] -right-1.5 -left-1.5 rounded-1 bg-[oklch(from_var(--accent)_0.24_0.07_h)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,white_12%,transparent)]"
          initial={false}
          animate={
            motionSafe
              ? { scaleX: redact ? 1 : 0, opacity: 1 }
              : { scaleX: 1, opacity: redact ? 1 : 0 }
          }
          style={{ originX: redact ? 0 : 1 }}
          transition={
            motionSafe
              ? { scaleX: springs.glide }
              : { duration: durations.fast }
          }
        />
      ) : null}
    </span>
  );
}

/* --------------------------------- pieces --------------------------------- */

function Avatar({
  tx,
  size,
}: {
  tx: Pick<BankTransaction, "category" | "contact" | "name">;
  size: number;
}) {
  if (tx.contact) {
    const turn = (hash(tx.contact) % 12) * 30 - 180;
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
        style={{
          width: size,
          height: size,
          background: wash(turn),
          color: ink(turn),
        }}
      >
        {initials(tx.name)}
      </span>
    );
  }
  const meta = CATEGORY[tx.category];
  const Icon = meta.icon;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: wash(meta.turn),
        color: ink(meta.turn),
      }}
    >
      <Icon className="size-4" />
    </span>
  );
}

function StatusBar({ time }: { time: string }) {
  return (
    <div
      aria-hidden
      className="relative flex h-7 shrink-0 items-center justify-between px-5 font-mono text-[11px] font-medium tabular-nums"
    >
      <span>{time}</span>
      <span className="absolute top-1.5 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full bg-black @min-[640px]:hidden" />
      <span className="flex items-center gap-1.5">
        <svg viewBox="0 0 16 10" className="h-2.5 w-4" fill="currentColor">
          <rect x="0" y="7" width="3" height="3" rx="0.6" />
          <rect x="4.3" y="5" width="3" height="5" rx="0.6" />
          <rect x="8.6" y="2.5" width="3" height="7.5" rx="0.6" />
          <rect x="12.9" y="0" width="3" height="10" rx="0.6" opacity="0.35" />
        </svg>
        <svg viewBox="0 0 24 11" className="h-2.5 w-5" fill="currentColor">
          <rect
            x="0.5"
            y="0.5"
            width="20"
            height="10"
            rx="2.5"
            fill="none"
            stroke="currentColor"
            opacity="0.45"
          />
          <rect x="2" y="2" width="13" height="7" rx="1.4" />
          <rect x="21.5" y="3.5" width="2" height="4" rx="0.8" opacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

/* --------------------------------- detail --------------------------------- */

function Detail({
  t,
  who,
  account,
  offset,
  pad,
  backLabel,
  signed,
  disabled,
  headingRef,
  onBack,
  onAction,
}: {
  t: BankTransaction;
  who?: BankContact;
  account: BankAccount;
  offset: number;
  pad: string;
  backLabel: string;
  signed: (v: number) => string;
  disabled: boolean;
  headingRef: (node: HTMLHeadingElement | null) => void;
  onBack: () => void;
  onAction: (kind: "send" | "split", el: HTMLElement) => void;
}) {
  const meta = CATEGORY[t.category];
  const kind: "send" | "split" | null = who
    ? "send"
    : t.amount < 0 && !["savings", "bills"].includes(t.category)
      ? "split"
      : null;
  const ref = `CB-${(hash(t.id) % 46656).toString(36).toUpperCase().padStart(3, "0")}-${pad2(hash(t.name) % 97)}${pad2(dayIndex(t.at, offset) % 100)}`;
  const facts: [string, string][] = [
    ["Date", dateOf(t.at, offset, true)],
    ["Time", clockOf(t.at, offset)],
    ["Category", meta.label],
    ["Account", `${account.name} ··${account.number}`],
    ["Reference", ref],
  ];
  if (t.note) facts.push(["Note", t.note]);
  return (
    <div className="flex flex-col pb-5">
      <div className={cn("flex h-11 items-center", pad)}>
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "-ml-1.5 inline-flex h-8 items-center gap-0.5 rounded-2 pr-2 pl-1 text-sm text-cobalt-bright hover:bg-cobalt-wash",
            FOCUS,
          )}
        >
          <ChevronLeft aria-hidden className="size-4" />
          {backLabel}
        </button>
      </div>
      <div
        className={cn(
          "flex flex-col items-center gap-2 pt-2 pb-5 text-center",
          pad,
        )}
      >
        <Avatar tx={t} size={52} />
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 max-w-full truncate text-base font-semibold outline-none"
        >
          {t.name}
        </h2>
        <p
          className={cn(
            "text-[28px] leading-none font-semibold tracking-tight tabular-nums",
            t.amount > 0 && !t.pending ? "text-success" : "text-foreground",
          )}
        >
          {signed(t.amount)}
        </p>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[11px] font-medium",
            t.pending ? "text-warn" : "text-success",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              t.pending ? "bg-warn" : "bg-success",
            )}
          />
          {t.pending ? "Pending" : "Completed"}
        </span>
      </div>
      <dl className="mx-4 flex flex-col divide-y divide-hairline rounded-3 border border-hairline bg-card">
        {facts.map(([k, v]) => (
          <div
            key={k}
            className="flex h-10 items-center justify-between gap-3 px-3 text-[13px]"
          >
            <dt className="shrink-0 text-ink-3">{k}</dt>
            <dd
              className={cn(
                "min-w-0 truncate text-right",
                k === "Reference" && "font-mono text-xs",
              )}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {kind ? (
        <div className="px-4 pt-4">
          <button
            type="button"
            aria-haspopup="dialog"
            disabled={disabled}
            onClick={(event) => onAction(kind, event.currentTarget)}
            className={cn(
              "inline-flex h-10 w-full items-center justify-center gap-2 rounded-3 bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50",
              FOCUS,
            )}
          >
            {kind === "send" ? (
              <ArrowUpRight aria-hidden className="size-4" />
            ) : (
              <ArrowLeftRight aria-hidden className="size-4" />
            )}
            {kind === "send" && who
              ? `Send to ${who.name.split(" ")[0] ?? who.name}`
              : "Split with a friend"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** This month from the list, for the unfolded right pane. */
function MonthSummary({
  list,
  now,
  offset,
  money,
  motionSafe,
}: {
  list: BankTransaction[];
  now: number;
  offset: number;
  money: (v: number) => string;
  motionSafe: boolean;
}) {
  const m = partsOf(now, offset);
  const by = new Map<BankCategory, number>();
  let spent = 0;
  let received = 0;
  for (const t of list) {
    const p = partsOf(t.at, offset);
    if (
      p.getUTCMonth() !== m.getUTCMonth() ||
      p.getUTCFullYear() !== m.getUTCFullYear()
    )
      continue;
    if (t.amount < 0 && t.category !== "savings") {
      spent += -t.amount;
      by.set(t.category, (by.get(t.category) ?? 0) + -t.amount);
    } else if (t.amount > 0 && counts(t)) received += t.amount;
  }
  const parts = [...by.entries()]
    .map(([category, value]) => ({ category, value: r2(value) }))
    .sort((a, b) => b.value - a.value);
  const top = parts[0]?.value ?? 1;
  const step = cascade(parts.length);
  const grow = (i: number): Transition =>
    motionSafe
      ? { ...springs.glide, delay: r3(0.06 + i * step) }
      : { duration: 0 };
  return (
    <div className="flex flex-col gap-4 px-5 pt-3 pb-6">
      <div>
        <p className="text-[11px] text-ink-3">This month</p>
        <h2 className="text-base font-semibold">{MONTHS[m.getUTCMonth()]}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["Spent", r2(spent), "text-foreground"],
            ["Received", r2(received), "text-success"],
          ] as const
        ).map(([k, v, tone]) => (
          <div
            key={k}
            className="rounded-3 border border-hairline bg-card px-3 py-2.5"
          >
            <p className="text-[11px] text-ink-3">{k}</p>
            <p
              className={cn(
                "mt-0.5 text-lg font-semibold tracking-tight tabular-nums",
                tone,
              )}
            >
              {money(v)}
            </p>
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-2.5" aria-label="Spending by category">
        {parts.map((p, i) => {
          const meta = CATEGORY[p.category];
          return (
            <li key={p.category} className="flex items-center gap-3">
              <Avatar
                tx={{ category: p.category, name: meta.label }}
                size={28}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate">{meta.label}</span>
                  <span className="shrink-0 text-ink-2 tabular-nums">
                    {money(p.value)}
                  </span>
                </span>
                <span className="mt-1 block h-1 overflow-clip rounded-full bg-surface-2">
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ background: ink(meta.turn), originX: 0 }}
                    initial={motionSafe ? { scaleX: 0 } : false}
                    animate={{ scaleX: r3(p.value / top) }}
                    transition={grow(i)}
                  />
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------------------------- sheet ---------------------------------- */

type Typed = { id: number; ch: string };

const VERBS: Record<
  BankSendMode,
  { title: string; label: string; pending: string; paid: string; error: string }
> = {
  send: {
    title: "Send money",
    label: "Send",
    pending: "Sending",
    paid: "Sent",
    error: "Not sent",
  },
  request: {
    title: "Request money",
    label: "Request",
    pending: "Asking",
    paid: "Asked",
    error: "Not asked",
  },
  add: {
    title: "Add money",
    label: "Add",
    pending: "Adding",
    paid: "Added",
    error: "Couldn't add",
  },
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

/** The typed amount after one key, or null when the key would break it. */
function typeInto(text: string, key: string): string | null {
  if (key === "⌫") return text.length ? text.slice(0, -1) : null;
  const dot = text.indexOf(".");
  if (key === ".") {
    if (dot !== -1) return null;
    return text === "" ? "0." : `${text}.`;
  }
  if (dot !== -1) return text.length - dot > 2 ? null : text + key;
  if (text === "0") return key === "0" ? null : key;
  if (text.length >= MAX_WHOLE) return null;
  return text + key;
}

const toTyped = (text: string, from: number): Typed[] =>
  Array.from(text).map((ch, i) => ({ id: from + i, ch }));

type SheetProps = {
  mode: BankSendMode;
  prefill?: { contact?: string; amount?: number };
  look: BankSheetStyle;
  /** Unfolded: the sheet covers the right pane, the scrim both. */
  wide: boolean;
  contacts: BankContact[];
  account: BankAccount;
  total: number;
  hidden: boolean;
  money: (v: number) => string;
  symbol: string;
  locale: string;
  format?: (amount: number, currency: string) => string;
  motionSafe: boolean;
  sound: boolean;
  disabled: boolean;
  /** The parent's view of the sheet: its offset, its height and its fade. */
  sheetY: MotionValue<number>;
  sheetH: MotionValue<number>;
  fade: MotionValue<number>;
  progress: MotionValue<number>;
  onSend?: (payment: BankPayment) => Promise<unknown> | unknown;
  onLanded: (payment: BankPayment) => void;
  onClosing: () => void;
  onGone: () => void;
};

/**
 * The send sheet. It owns the amount as typed, the pad, the contact and the
 * settle button; the parent owns where it sits, so home can recede in step.
 */
function SendSheet({
  mode,
  prefill,
  look,
  wide,
  contacts,
  account,
  total,
  hidden,
  money,
  symbol,
  locale,
  format,
  motionSafe,
  sound,
  disabled,
  sheetY,
  sheetH,
  fade,
  progress,
  onSend,
  onLanded,
  onClosing,
  onGone,
}: SheetProps) {
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const currency = account.currency ?? "USD";
  const verbs = VERBS[mode];
  const start =
    prefill?.amount && prefill.amount > 0
      ? r2(prefill.amount).toFixed(2).replace(/\.00$/, "")
      : "";
  const [text, setText] = React.useState(start);
  const [typed, setTyped] = React.useState<Typed[]>(() => toTyped(start, 1));
  const seq = React.useRef(start.length + 1);
  const [contact, setContact] = React.useState<string | null>(
    mode === "add" ? null : (prefill?.contact ?? contacts[0]?.id ?? null),
  );
  const [settle, setSettle] = React.useState<SettleState>("idle");
  const [closing, setClosing] = React.useState(false);
  const [padAt, setPadAt] = React.useState(0);
  const [flash, setFlash] = React.useState(false);
  const shake = useMotionValue(0);
  const node = React.useRef<HTMLDivElement | null>(null);
  const amountNode = React.useRef<HTMLOutputElement | null>(null);
  const sendWrap = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const landedRef = React.useRef(onLanded);
  React.useEffect(() => {
    landedRef.current = onLanded;
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  const amount = Number(text || "0");
  const over =
    (mode === "send" && amount > total) ||
    (mode === "add" && amount > ADD_LIMIT);
  const valid = amount > 0 && !over && (mode === "add" || !!contact);
  const busy = settle === "pending" || settle === "success";

  // It arrives from where its look says, measured as it mounts; focus goes
  // to the chosen contact, or the amount.
  React.useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const h = el.offsetHeight + 16;
    sheetH.set(h);
    if (!motionSafe) {
      sheetY.jump(0);
      fade.jump(0);
      run(
        "fade",
        animate(fade, 1, { duration: durations.base, ease: easings.enter }),
      );
    } else if (look === "float") {
      sheetY.jump(distances.shift);
      fade.jump(0);
      run("y", animate(sheetY, 0, springs.snap));
      run(
        "fade",
        animate(fade, 1, { duration: durations.base, ease: easings.enter }),
      );
    } else {
      sheetY.jump(h);
      fade.jump(1);
      run("y", animate(sheetY, 0, springs.glide));
    }
    const first =
      el.querySelector<HTMLElement>("[role=radio][aria-checked=true]") ??
      amountNode.current;
    first?.focus({ preventScroll: true });
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
    // Once per opening: the sheet is remounted for every one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = (velocity?: number) => {
    if (closing) return;
    setClosing(true);
    onClosing();
    const done = () => onGone();
    if (!motionSafe) {
      run(
        "fade",
        animate(fade, 0, { duration: durations.fast, onComplete: done }),
      );
    } else if (look === "float" && velocity === undefined) {
      run("y", animate(sheetY, distances.shift, exitFor(durations.base)));
      run(
        "fade",
        animate(fade, 0, { ...exitFor(durations.base), onComplete: done }),
      );
    } else {
      // A throw keeps its own speed; a press leaves on the exit ease.
      const t: Transition =
        velocity !== undefined
          ? { ...springs.glide, velocity }
          : exitFor(durations.slow);
      run("y", animate(sheetY, sheetH.get(), { ...t, onComplete: done }));
      if (look === "float")
        run("fade", animate(fade, 0, exitFor(durations.slow)));
    }
  };

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: closing || settle === "pending",
    onStart: () => {
      anims.current.get("y")?.stop();
      fade.set(1);
    },
    onMove: ({ offset }) => {
      const h = sheetH.get();
      sheetY.set(r2(offset.y < 0 ? -rubberband(-offset.y, h) : offset.y));
    },
    onEnd: ({ velocity }) => {
      if (project(sheetY.get(), velocity.y, 0.99) > sheetH.get() * 0.35) {
        close(velocity.y);
        return;
      }
      run(
        "y",
        animate(
          sheetY,
          0,
          motionSafe
            ? { ...springs.glide, velocity: velocity.y }
            : { duration: 0 },
        ),
      );
    },
    onCancel: () => run("y", animate(sheetY, 0, springs.glide)),
  });

  const press = (key: string) => {
    if (closing || busy || disabled) return;
    const next = typeInto(text, key);
    if (next === null) {
      audio.play("tick", { pitch: 0.55, gain: 0.25 });
      if (motionSafe) {
        run(
          "shake",
          animate(shake, [0, -7, 6, -4, 2, 0], {
            duration: 0.32,
            ease: "easeOut",
          }),
        );
      } else {
        setFlash(true);
        later(durations.slow * 1000, () => setFlash(false));
      }
      return;
    }
    const pitch =
      key === "⌫" ? 0.8 : key === "." ? 1.6 : semitones(Number(key));
    audio.play("tick", { pitch: r3(pitch), gain: 0.4 });
    if (key === "⌫") {
      setTyped((t) => t.slice(0, -1));
    } else if (text === "0") {
      setTyped([{ id: seq.current, ch: key }]);
      seq.current += 1;
    } else {
      // "." from nothing arrives as "0.": two characters.
      const add = toTyped(next.slice(text.length), seq.current);
      seq.current += add.length;
      setTyped((t) => [...t, ...add]);
    }
    // The button waits on an amount that cannot go; it never holds focus
    // while it does, or focus would fall to the page.
    const value = Number(next || "0");
    const ok =
      value > 0 &&
      !(mode === "send" && value > total) &&
      !(mode === "add" && value > ADD_LIMIT);
    if (!ok && sendWrap.current?.contains(document.activeElement)) {
      amountNode.current?.focus({ preventScroll: true });
    }
    setText(next);
  };

  const scrim = useTransform(progress, (p) => r2(p * 0.4));
  const opacity = useTransform(fade, (f) =>
    !motionSafe || look === "float" ? r2(f) : 1,
  );
  const who = contacts.find((c) => c.id === contact);
  const scale = typed.length <= 5 ? 1 : typed.length <= 7 ? 0.84 : 0.7;

  return (
    <>
      <motion.div
        aria-hidden
        onPointerDown={() => {
          if (settle !== "pending") close();
        }}
        className="absolute inset-0 bg-black"
        style={{ opacity: scrim }}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0",
          wide ? "left-1/2" : "left-0",
        )}
      >
        <motion.div
          ref={node}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${uid}-title`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (settle !== "pending") close();
              return;
            }
            if (event.key === "Tab") {
              const all = [
                ...(node.current?.querySelectorAll<HTMLElement>(
                  "button:not([disabled]), [tabindex]",
                ) ?? []),
              ].filter((n) => n.tabIndex >= 0);
              const first = all[0];
              const last = all[all.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
              return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const key =
              event.key === "Backspace" || event.key === "Delete"
                ? "⌫"
                : event.key === ","
                  ? "."
                  : event.key;
            if (KEYS.includes(key)) {
              event.preventDefault();
              press(key);
            }
          }}
          className={cn(
            "pointer-events-auto absolute flex flex-col bg-popover text-foreground shadow-[0_-8px_32px_color-mix(in_oklab,black_22%,transparent)]",
            look === "bottom" && "inset-x-0 top-[6%] bottom-0 rounded-t-4",
            look === "full" && "inset-0",
            look === "float" &&
              "inset-x-2 bottom-2 max-h-[calc(100%-16px)] rounded-4 border border-hairline-strong",
          )}
          style={{ y: sheetY, opacity }}
        >
          <div
            {...drag}
            className="flex shrink-0 cursor-grab touch-none flex-col items-center px-4 pt-2 active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-ink-3/40" />
            <div className="flex h-11 w-full items-center justify-between gap-3">
              <h2
                id={`${uid}-title`}
                className="truncate text-base font-semibold"
              >
                {verbs.title}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  if (settle !== "pending") close();
                }}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 [scrollbar-width:none] flex-col overflow-y-auto overscroll-contain px-4 pb-4">
            {mode === "add" ? (
              <div className="flex h-14 shrink-0 items-center gap-3 rounded-3 border border-hairline bg-card px-3">
                <Avatar
                  tx={{ category: "savings", name: "Savings" }}
                  size={32}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    From {SAVINGS}
                  </span>
                  <span className="block truncate text-[11px] text-ink-3">
                    Up to {money(ADD_LIMIT)} at a time
                  </span>
                </span>
              </div>
            ) : (
              <div
                role="radiogroup"
                aria-label={mode === "send" ? "Send to" : "Ask"}
                className="-mx-1 flex shrink-0 [scrollbar-width:none] gap-1 overflow-x-auto px-1 py-1"
              >
                {contacts.map((c, i) => {
                  const on = contact === c.id;
                  const choose = (id: string) => {
                    if (id === contact) return;
                    audio.play("tick", { pitch: 1.1, gain: 0.3 });
                    setContact(id);
                  };
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={c.handle ? `${c.name}, ${c.handle}` : c.name}
                      tabIndex={on || (!contact && i === 0) ? 0 : -1}
                      onClick={() => choose(c.id)}
                      onKeyDown={(event) =>
                        roveRadio(event, i, contacts.length, (to) => {
                          const next = contacts[to];
                          if (next) choose(next.id);
                        })
                      }
                      className={cn(
                        "relative flex w-16 shrink-0 flex-col items-center gap-1 rounded-3 py-1.5",
                        FOCUS_IN,
                      )}
                    >
                      {on ? (
                        <motion.span
                          layoutId={`${uid}-contact`}
                          aria-hidden
                          className="absolute inset-0 rounded-3 bg-cobalt-wash"
                          transition={
                            motionSafe ? springs.snap : { duration: 0 }
                          }
                        />
                      ) : null}
                      <span className="relative">
                        <Avatar
                          tx={{
                            category: "transfer",
                            contact: c.id,
                            name: c.name,
                          }}
                          size={36}
                        />
                      </span>
                      <span
                        className={cn(
                          "relative max-w-full truncate px-1 text-[11px]",
                          on ? "font-medium text-foreground" : "text-ink-2",
                        )}
                      >
                        {c.name.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <motion.output
              ref={amountNode}
              tabIndex={-1}
              aria-live="polite"
              className={cn(
                "mt-3 flex h-16 shrink-0 items-center justify-center rounded-3 transition-colors focus-visible:bg-surface-2",
                FOCUS_IN,
                over || flash ? "text-danger" : "text-foreground",
              )}
              style={{ x: shake }}
            >
              <span className="sr-only">
                Amount {money(amount)}
                {over ? ", more than allowed" : ""}
              </span>
              <motion.span
                aria-hidden
                className="flex items-baseline font-semibold tracking-tight tabular-nums"
                animate={{ scale }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                style={{ fontSize: 40, lineHeight: "48px" }}
              >
                <span
                  className={cn(
                    "mr-0.5 text-[0.6em]",
                    typed.length ? "" : "text-ink-3",
                  )}
                >
                  {symbol}
                </span>
                {typed.length === 0 ? (
                  <span className="text-ink-3">0</span>
                ) : null}
                <AnimatePresence initial={false} mode="popLayout">
                  {typed.map((c) => (
                    <motion.span
                      key={c.id}
                      className="inline-block"
                      initial={
                        motionSafe
                          ? { opacity: 0, y: distances.step }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={
                        motionSafe
                          ? {
                              opacity: 0,
                              y: distances.step,
                              transition: exitFor(durations.fast),
                            }
                          : { opacity: 0, transition: { duration: 0 } }
                      }
                      transition={{
                        y: springs.snap,
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                        },
                      }}
                    >
                      {c.ch}
                    </motion.span>
                  ))}
                </AnimatePresence>
                <span className="ml-0.5 h-9 w-0.5 self-center rounded-full bg-cobalt-bright" />
              </motion.span>
            </motion.output>
            <p
              className={cn(
                "shrink-0 text-center text-[11px]",
                over ? "text-danger" : "text-ink-3",
              )}
            >
              {mode === "send"
                ? over
                  ? "More than your balance"
                  : hidden
                    ? "Balance hidden"
                    : `Balance ${money(total)}`
                : mode === "request"
                  ? `${who?.name ?? "They"} will get a request`
                  : over
                    ? `Up to ${money(ADD_LIMIT)} at a time`
                    : `Arrives in ${account.name} now`}
            </p>

            <div
              role="group"
              aria-label="Amount pad"
              className="mt-3 grid shrink-0 grid-cols-3 gap-1.5"
            >
              {KEYS.map((k, i) => (
                <motion.button
                  key={k}
                  type="button"
                  tabIndex={i === padAt ? 0 : -1}
                  aria-label={
                    k === "⌫" ? "Delete" : k === "." ? "Decimal point" : k
                  }
                  onFocus={() => setPadAt(i)}
                  onClick={() => press(k)}
                  onKeyDown={(event) => {
                    const move: Record<string, number> = {
                      ArrowRight: 1,
                      ArrowLeft: -1,
                      ArrowDown: 3,
                      ArrowUp: -3,
                    };
                    const to =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? KEYS.length - 1
                          : i + (move[event.key] ?? NaN);
                    if (Number.isNaN(to)) return;
                    event.preventDefault();
                    const at = clamp(to, 0, KEYS.length - 1);
                    setPadAt(at);
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLElement>("button")
                      [at]?.focus();
                  }}
                  whileTap={motionSafe ? { scale: 0.94 } : undefined}
                  transition={springs.flick}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-3 bg-surface-2/70 text-lg font-medium tabular-nums transition-colors select-none hover:bg-surface-2 active:bg-hairline-strong",
                    FOCUS,
                  )}
                >
                  {k === "⌫" ? <Delete aria-hidden className="size-5" /> : k}
                </motion.button>
              ))}
            </div>

            <div ref={sendWrap} className="mt-3 shrink-0">
              <SettleButton
                amount={amount}
                currency={currency}
                locale={locale}
                format={format ? (v) => format(v, currency) : undefined}
                label={verbs.label}
                pendingLabel={verbs.pending}
                paidLabel={verbs.paid}
                errorLabel={verbs.error}
                successHold={0}
                onPay={() =>
                  onSend?.({
                    mode,
                    amount,
                    contact:
                      mode === "add" ? undefined : (contact ?? undefined),
                  })
                }
                onStateChange={(next) => {
                  setSettle(next);
                  if (next !== "success") return;
                  const payment: BankPayment = {
                    mode,
                    amount,
                    contact:
                      mode === "add" ? undefined : (contact ?? undefined),
                  };
                  // The stamp lands first; then the money moves.
                  later(motionSafe ? 720 : 360, () => {
                    landedRef.current(payment);
                    close();
                  });
                }}
                disabled={disabled || !valid}
                sound={sound}
                className="flex w-full [&>button]:flex-1"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}

/* ---------------------------------- app ----------------------------------- */

type Said = { n: number; text: string };
type Sheet = {
  key: number;
  mode: BankSendMode;
  prefill?: { contact?: string; amount?: number };
  from: HTMLElement | null;
  closing: boolean;
};
type Filter = "all" | "in" | "out";

const FILTERS: { id: Filter; label: string; name: string }[] = [
  { id: "all", label: "All", name: "All" },
  { id: "in", label: "In", name: "Money in" },
  { id: "out", label: "Out", name: "Money out" },
];

/**
 * A complete mobile banking home, framed as a phone at every width. The
 * balance card hides and reveals through the composed eye — its digits are
 * wheels that roll down into dots, frost over or are wiped out by a bar —
 * and a change of balance rolls the same wheels, units first. Three quick
 * actions open a send sheet with an amount pad (characters rise into the
 * figure, a refused key shakes it), contacts, and the composed settle button
 * as Send; a payment that lands drops into Today and the balance rolls to
 * match, because the balance is the opening figure plus the list.
 *
 * The activity is grouped by day and filters to money in or out, the rows
 * closing up on glide. A row pushes its detail, which can be dragged back
 * 1:1 and is released by projection. Wide, the phone unfolds: home on the
 * left, the month's summary or the chosen transaction on the right.
 *
 * Everything is a button, a radiogroup, a heading or a dialog with a focus
 * trap; rows rove with the arrow keys, Escape steps back, digits type into
 * the sheet from anywhere in it. Under reduced motion nothing travels or
 * rolls: screens and sheets cross-fade and the figures swap, and every
 * number still changes.
 */
export function BankApp({
  account = defaultBankAccount,
  transactions,
  defaultTransactions = defaultBankTransactions,
  onTransactionsChange,
  contacts = defaultBankContacts,
  owner = "Ada",
  bank = "Coldbrook Bank",
  now = defaultBankNow,
  zoneOffset = 0,
  hidden,
  defaultHidden = false,
  onHiddenChange,
  balance = "roll",
  sheet: look = "bottom",
  density = "cozy",
  onSend,
  onTransactionOpen,
  locale = "en-US",
  format,
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: BankAppProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;
  const nowMs = toMs(now);
  const currency = account.currency ?? "USD";

  const formatter = React.useMemo(() => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency });
    } catch {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      });
    }
  }, [locale, currency]);
  const money = (v: number) =>
    format ? format(Math.abs(v), currency) : formatter.format(Math.abs(v));
  const symbol =
    formatter.formatToParts(0).find((p) => p.type === "currency")?.value ?? "$";
  const signed = (v: number) => `${v < 0 ? "−" : "+"}${money(v)}`;
  const spoken = (v: number) => `${v < 0 ? "minus" : "plus"} ${money(v)}`;

  /* ------------------------------ the data ------------------------------- */

  const [ownList, setOwnList] = React.useState(defaultTransactions);
  const list = transactions ?? ownList;
  const sorted = React.useMemo(
    () => [...list].sort((a, b) => b.at - a.at),
    [list],
  );
  const total = r2(
    sorted.reduce(
      (sum, t) => (counts(t) ? sum + t.amount : sum),
      account.opening,
    ),
  );

  const [ownHidden, setOwnHidden] = React.useState(defaultHidden);
  const isHidden = hidden ?? ownHidden;

  const [filter, setFilter] = React.useState<Filter>("all");
  const visible = sorted.filter((t) =>
    filter === "all" ? true : filter === "in" ? t.amount > 0 : t.amount < 0,
  );
  const groups: { key: number; label: string; items: BankTransaction[] }[] = [];
  for (const t of visible) {
    const k = dayIndex(t.at, zoneOffset);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(t);
    else
      groups.push({
        key: k,
        label: dayName(t.at, nowMs, zoneOffset),
        items: [t],
      });
  }

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [fresh, setFresh] = React.useState<string | null>(null);
  const made = React.useRef(0);

  /* ------------------------------ the frame ------------------------------ */

  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.round(w));
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);
  const wide = width !== null && width >= 640;

  /* ----------------------------- navigation ------------------------------ */

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [closingDetail, setClosingDetail] = React.useState(false);
  const openTx = sorted.find((t) => t.id === openId) ?? null;
  // A transaction that leaves the list takes its detail with it.
  if (openId !== null && !openTx) setOpenId(null);

  const push = useMotionValue(0);
  const paneW = React.useRef(360);
  const leftPane = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const rows = React.useRef(new Map<string, HTMLButtonElement>());
  const [focusRow, setFocusRow] = React.useState<string | null>(null);
  const wantHeading = React.useRef(false);
  const [heading, setHeading] = React.useState<HTMLHeadingElement | null>(null);
  const refocus = React.useRef<HTMLElement | string | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  const openDetail = (id: string) => {
    const t = sorted.find((x) => x.id === id);
    if (disabled || !t) return;
    audio.play("tick", { pitch: 1.15, gain: 0.35 });
    wantHeading.current = true;
    setOpenId(id);
    setClosingDetail(false);
    setFocusRow(id);
    if (!wide) {
      paneW.current = leftPane.current?.clientWidth ?? paneW.current;
      run(
        "push",
        animate(
          push,
          1,
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.enter },
        ),
      );
    }
    onTransactionOpen?.(id);
    say(`${t.name}, ${spoken(t.amount)}.`);
  };

  const closeDetail = (velocity?: number) => {
    if (!openId || closingDetail) return;
    const id = openId;
    const at = document.activeElement;
    if (
      !at ||
      at === document.body ||
      at.closest(`[data-bank-detail="${uid}"]`)
    ) {
      refocus.current = id;
    }
    audio.play("tick", { pitch: 0.9, gain: 0.3 });
    onTransactionOpen?.(null);
    if (wide) {
      setOpenId(null);
      return;
    }
    setClosingDetail(true);
    const t: Transition = !motionSafe
      ? { duration: durations.fast }
      : velocity !== undefined
        ? { ...springs.glide, velocity }
        : exitFor(durations.slow);
    run(
      "push",
      animate(push, 0, {
        ...t,
        onComplete: () => {
          setOpenId((now) => (now === id ? null : now));
          setClosingDetail(false);
        },
      }),
    );
  };

  const detailDrag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: disabled || wide || !openId || closingDetail,
    onStart: () => {
      anims.current.get("push")?.stop();
      paneW.current = leftPane.current?.clientWidth ?? paneW.current;
    },
    onMove: ({ offset }) => {
      const w = Math.max(1, paneW.current);
      const dx = offset.x < 0 ? -rubberband(-offset.x, w) : offset.x;
      push.set(r3(1 - dx / w));
    },
    onEnd: ({ velocity }) => {
      const w = Math.max(1, paneW.current);
      if (project((1 - push.get()) * w, velocity.x, 0.99) > w * 0.45) {
        closeDetail(-velocity.x / w);
        return;
      }
      run(
        "push",
        animate(
          push,
          1,
          motionSafe
            ? { ...springs.glide, velocity: -velocity.x / w }
            : { duration: 0 },
        ),
      );
    },
    onCancel: () => run("push", animate(push, 1, springs.glide)),
  });

  const detailX = useTransform(push, (p) =>
    motionSafe ? `${r2((1 - p) * 100)}%` : "0%",
  );
  const detailOpacity = useTransform(push, (p) =>
    motionSafe ? 1 : r2(clamp(p, 0, 1)),
  );
  const homeX = useTransform(push, (p) =>
    motionSafe ? `${r2(-clamp(p, 0, 1.2) * 25)}%` : "0%",
  );
  const homeDim = useTransform(push, (p) => r2(clamp(p, 0, 1) * 0.28));

  /* -------------------------------- sheet -------------------------------- */

  const [sheet, setSheet] = React.useState<Sheet | null>(null);
  const sheetCount = React.useRef(0);
  // Closed is a sheet's own height below where it opens: nothing recedes
  // until one is on its way up.
  const sheetY = useMotionValue(520);
  const sheetH = useMotionValue(520);
  const sheetFade = useMotionValue(0);
  const progress = useTransform(
    [sheetY, sheetH, sheetFade] as MotionValue<number>[],
    ([y = 0, h = 1, f = 0]: number[]) =>
      !motionSafe || look === "float"
        ? clamp(f, 0, 1)
        : clamp(1 - y / Math.max(1, h), 0, 1),
  );
  const recede = motionSafe && look === "bottom";
  const behindScale = useTransform(progress, (p) =>
    recede ? r3(1 - 0.06 * p) : 1,
  );
  const behindY = useTransform(progress, (p) => (recede ? r2(10 * p) : 0));
  const behindRadius = useTransform(progress, (p) => (recede ? r2(18 * p) : 0));
  const sheetOpen = !!sheet && !sheet.closing;

  const openSheet = (
    mode: BankSendMode,
    from: HTMLElement | null,
    prefill?: Sheet["prefill"],
  ) => {
    if (disabled || sheet) return;
    sheetCount.current += 1;
    setSheet({ key: sheetCount.current, mode, prefill, from, closing: false });
    audio.play("tick", { pitch: 1.3, gain: 0.35 });
    say(`${VERBS[mode].title}.`);
  };

  const land = (payment: BankPayment) => {
    const who = contacts.find((c) => c.id === payment.contact);
    made.current += 1;
    const id = `${uid.replace(/[^a-zA-Z0-9]/g, "")}-p${made.current}`;
    const base = { id, at: nowMs + made.current * 60_000 };
    const tx: BankTransaction =
      payment.mode === "add"
        ? {
            ...base,
            name: "From Savings",
            amount: payment.amount,
            category: "savings",
            note: SAVINGS,
          }
        : {
            ...base,
            name: who?.name ?? "Contact",
            amount: payment.mode === "send" ? -payment.amount : payment.amount,
            category: "transfer",
            note:
              payment.mode === "send"
                ? `Sent from ${account.name}`
                : "Requested · waiting",
            pending: payment.mode === "request",
            contact: who?.id,
          };
    const next = [tx, ...list];
    if (transactions === undefined) setOwnList(next);
    onTransactionsChange?.(next);
    setFresh(id);
    later(900, () => setFresh((f) => (f === id ? null : f)));
    if (filter !== "all" && (filter === "in") !== tx.amount > 0)
      setFilter("all");
    const after = money(r2(total + (counts(tx) ? tx.amount : 0)));
    const name = who?.name ?? "your contact";
    const value = money(payment.amount);
    say(
      payment.mode === "send"
        ? `Sent ${value} to ${name}. Balance ${after}.`
        : payment.mode === "request"
          ? `Asked ${name} for ${value}.`
          : `Added ${value} from savings. Balance ${after}.`,
    );
  };

  /* ------------------------------- effects ------------------------------- */

  // A width change moves the detail between the push and the right pane.
  React.useEffect(() => {
    anims.current.get("push")?.stop();
    push.jump(openId && !wide ? 1 : 0);
    // Only the layout decides this; open and close run their own springs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide]);

  // A detail that vanished without its close leaves home where it belongs.
  React.useEffect(() => {
    if (!openTx && !closingDetail && push.get() !== 0) push.jump(0);
  }, [openTx, closingDetail, push]);

  // The detail's heading takes focus when it arrives, not on a guessed frame.
  React.useEffect(() => {
    if (!heading || !wantHeading.current) return;
    wantHeading.current = false;
    heading.focus({ preventScroll: true });
  }, [heading]);

  // Focus goes back once what covered it is no longer inert over it.
  React.useEffect(() => {
    const target = refocus.current;
    if (!target || sheetOpen || (!wide && openId && !closingDetail)) return;
    refocus.current = null;
    const node = typeof target === "string" ? rows.current.get(target) : target;
    if (node?.isConnected) node.focus({ preventScroll: true });
  });

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  /* ------------------------------- render -------------------------------- */

  const order = visible.map((t) => t.id);
  const tabRow =
    focusRow && order.includes(focusRow) ? focusRow : (order[0] ?? null);

  const onRowKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const i = order.indexOf(id);
    const to =
      event.key === "ArrowDown"
        ? Math.min(order.length - 1, i + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, i - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? order.length - 1
              : -1;
    const target = order[to];
    if (to === -1 || !target) return;
    event.preventDefault();
    setFocusRow(target);
    rows.current.get(target)?.focus();
  };

  const chooseFilter = (id: Filter) => {
    if (id === filter) return;
    setFilter(id);
    audio.play("tick", {
      pitch: id === "all" ? 1 : id === "in" ? 1.2 : 0.85,
      gain: 0.35,
    });
    const n = sorted.filter((t) =>
      id === "all" ? true : id === "in" ? t.amount > 0 : t.amount < 0,
    ).length;
    const what =
      id === "all"
        ? "Showing everything"
        : id === "in"
          ? "Showing money in"
          : "Showing money out";
    say(`${what}, ${n} ${n === 1 ? "transaction" : "transactions"}.`);
  };

  const hour = partsOf(nowMs, zoneOffset).getUTCHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const home = (
    <motion.div
      layoutScroll
      className="absolute inset-0 [scrollbar-width:none] overflow-y-auto overscroll-contain"
    >
      <div className={cn("flex items-center gap-2.5 pt-2 pb-3", d.pad)}>
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-xs font-semibold text-cobalt-bright"
        >
          {owner.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-ink-3">{bank}</p>
          <p className="truncate text-sm font-semibold">
            {greeting}, {owner}
          </p>
        </div>
      </div>

      <div className={d.pad}>
        <div
          className="relative overflow-clip rounded-4 p-4 text-primary-foreground shadow-[0_8px_24px_color-mix(in_oklab,black_18%,transparent)]"
          style={{
            backgroundImage:
              "linear-gradient(135deg, oklch(from var(--accent) 0.52 0.19 h), oklch(from var(--accent) 0.38 0.15 calc(h + 28)))",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-10 -right-8 size-36 rounded-full bg-white/8"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-primary-foreground/75">
                {account.name} ··{account.number}
              </p>
              <p className="sr-only">
                {isHidden ? "Balance hidden" : `Balance ${money(total)}`}
              </p>
              <div className="mt-1.5">
                <Figure
                  text={`${total < 0 ? "−" : ""}${money(total)}`}
                  hidden={isHidden}
                  style={balance}
                  size={d.figure}
                  motionSafe={motionSafe}
                />
              </div>
              <p className="mt-1 text-[11px] text-primary-foreground/70">
                Available balance
              </p>
            </div>
            <EyeLid
              compact
              size="sm"
              pressed={isHidden}
              onPressedChange={(next) => {
                if (hidden === undefined) setOwnHidden(next);
                onHiddenChange?.(next);
                say(
                  next ? "Balance hidden." : `Balance shown, ${money(total)}.`,
                );
              }}
              shownLabel="Balance visible"
              hiddenLabel="Balance hidden"
              blink={1}
              sound={sound}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      <div className={cn("mt-4 flex items-start gap-2", d.pad)}>
        {(
          [
            ["send", "Send", ArrowUpRight],
            ["request", "Request", ArrowDownLeft],
            ["add", "Add money", Plus],
          ] as const
        ).map(([mode, text, Icon]) => (
          <button
            key={mode}
            type="button"
            aria-haspopup="dialog"
            disabled={disabled}
            onClick={(event) => openSheet(mode, event.currentTarget)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-3 py-1 text-[11px] font-medium text-ink-2 transition-colors enabled:hover:text-foreground disabled:opacity-50",
              FOCUS,
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-cobalt-wash text-cobalt-bright">
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="max-w-full truncate">{text}</span>
          </button>
        ))}
      </div>

      <div
        className={cn("mt-5 flex items-center justify-between gap-3", d.pad)}
      >
        <h2 id={`${uid}-activity`} className="text-sm font-semibold">
          Activity
        </h2>
        <div
          role="radiogroup"
          aria-label="Show"
          className="flex h-7 shrink-0 items-center rounded-full bg-surface-2 p-0.5"
        >
          {FILTERS.map((f, i) => {
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={f.name}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => chooseFilter(f.id)}
                onKeyDown={(event) =>
                  roveRadio(event, i, FILTERS.length, (to) => {
                    const next = FILTERS[to];
                    if (next) chooseFilter(next.id);
                  })
                }
                className={cn(
                  "relative h-6 rounded-full px-2.5 text-[11px] font-medium transition-colors",
                  on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                  FOCUS,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-filter`}
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative">{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="group"
        aria-labelledby={`${uid}-activity`}
        className="relative mt-2 pb-4"
      >
        {status === "loading" ? (
          <ul aria-busy="true" aria-label="Loading activity">
            {[0, 1, 2, 3, 4].map((i) => (
              <li
                key={i}
                aria-hidden
                className={cn("flex items-center gap-3", d.pad)}
                style={{ height: d.row }}
              >
                <span
                  className="shrink-0 rounded-full bg-surface-2"
                  style={{ width: d.avatar, height: d.avatar }}
                />
                <span className="flex flex-1 flex-col gap-1.5">
                  <span className="h-2.5 w-2/5 rounded-full bg-surface-2" />
                  <span className="h-2 w-1/4 rounded-full bg-surface-2" />
                </span>
                <span className="h-2.5 w-12 rounded-full bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : status === "error" ? (
          <div className={cn("flex flex-col items-start gap-2 py-6", d.pad)}>
            <p className="text-sm font-medium">Activity didn&rsquo;t load</p>
            <p className="text-xs text-ink-3">
              Your balance is up to date. The list will be back shortly.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-xs font-medium hover:bg-surface-2",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          </div>
        ) : groups.length === 0 ? (
          <p className={cn("py-8 text-center text-xs text-ink-3", d.pad)}>
            {sorted.length === 0
              ? "No activity yet. Money you send and receive shows up here."
              : filter === "in"
                ? "No money in yet."
                : "No money out yet."}
          </p>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {groups.map((g) => (
              <motion.div
                key={g.key}
                layout={motionSafe ? "position" : false}
                transition={{ layout: springs.glide }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                className="relative"
              >
                <h3
                  className={cn(
                    "sticky top-0 z-10 flex h-7 items-center justify-between bg-background/92 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase backdrop-blur-sm",
                    d.pad,
                  )}
                >
                  <span>{g.label}</span>
                  <span className="tabular-nums">
                    {signed(r2(g.items.reduce((s, t) => s + t.amount, 0)))}
                  </span>
                </h3>
                <ul className="relative flex flex-col">
                  <AnimatePresence initial={false} mode="popLayout">
                    {g.items.map((t) => {
                      const meta = CATEGORY[t.category];
                      const current = wide && openId === t.id;
                      const kind = t.contact
                        ? t.amount < 0
                          ? "sent"
                          : "received"
                        : meta.label.toLowerCase();
                      return (
                        <motion.li
                          key={t.id}
                          layout={motionSafe ? "position" : false}
                          initial={
                            t.id === fresh
                              ? motionSafe
                                ? { opacity: 0, y: -distances.step }
                                : { opacity: 0 }
                              : false
                          }
                          animate={{ opacity: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{
                            layout: springs.glide,
                            y: springs.snap,
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          }}
                        >
                          <button
                            ref={(node) => {
                              if (node) rows.current.set(t.id, node);
                              else rows.current.delete(t.id);
                            }}
                            type="button"
                            tabIndex={tabRow === t.id ? 0 : -1}
                            aria-current={current || undefined}
                            aria-label={`${t.name}, ${kind}${t.pending ? ", pending" : ""}, ${clockOf(t.at, zoneOffset)}, ${spoken(t.amount)}`}
                            disabled={disabled}
                            onFocus={() => setFocusRow(t.id)}
                            onKeyDown={(event) => onRowKey(event, t.id)}
                            onClick={() => openDetail(t.id)}
                            className={cn(
                              "flex w-full items-center gap-3 text-left transition-colors",
                              current
                                ? "bg-cobalt-wash"
                                : "enabled:hover:bg-surface-2",
                              d.pad,
                              FOCUS_IN,
                            )}
                            style={{ height: d.row }}
                          >
                            <Avatar tx={t} size={d.avatar} />
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "block truncate font-medium",
                                  d.text,
                                )}
                                title={t.name}
                              >
                                {t.name}
                              </span>
                              <span className="block truncate text-[11px] text-ink-3">
                                {t.pending ? "Pending · " : ""}
                                {t.note ?? meta.label} ·{" "}
                                {clockOf(t.at, zoneOffset)}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "shrink-0 font-medium tabular-nums",
                                d.text,
                                t.pending
                                  ? "text-ink-3"
                                  : t.amount > 0
                                    ? "text-success"
                                    : "text-foreground",
                              )}
                            >
                              {signed(t.amount)}
                            </span>
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );

  const onDetailAction = (kind: "send" | "split", el: HTMLElement) => {
    if (!openTx) return;
    if (kind === "send") openSheet("send", el, { contact: openTx.contact });
    else openSheet("request", el, { amount: r2(-openTx.amount / 2) });
  };
  const detailNode = openTx ? (
    <Detail
      t={openTx}
      who={
        openTx.contact
          ? contacts.find((c) => c.id === openTx.contact)
          : undefined
      }
      account={account}
      offset={zoneOffset}
      pad={d.pad}
      backLabel={wide ? "Summary" : "Activity"}
      signed={signed}
      disabled={disabled}
      headingRef={setHeading}
      onBack={() => closeDetail()}
      onAction={onDetailAction}
    />
  ) : null;
  const onDetailKey = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeDetail();
  };
  const behind = { scale: behindScale, y: behindY, borderRadius: behindRadius };
  const narrowDetail = !wide && openTx;

  return (
    <div
      ref={setRootNode}
      role="region"
      aria-label={label ?? bank}
      className={cn("@container w-full", className)}
    >
      <div
        inert={disabled}
        className={cn(
          "relative mx-auto flex h-[560px] w-full max-w-[360px] flex-col overflow-clip rounded-[28px] border border-hairline-strong bg-background text-foreground shadow-[0_12px_40px_color-mix(in_oklab,black_16%,transparent)] @min-[640px]:max-w-[720px]",
          disabled && "opacity-60",
        )}
      >
        <StatusBar time={clockOf(nowMs, zoneOffset).replace(/^0/, "")} />
        <div className="relative grid flex-1 overflow-hidden @min-[640px]:grid-cols-2">
          {/* Left: home, and on a phone the detail pushed over it. */}
          <div
            ref={leftPane}
            className="relative overflow-clip"
            inert={sheetOpen}
          >
            <motion.div
              className="absolute inset-0 origin-top overflow-clip bg-background"
              style={wide ? undefined : behind}
            >
              <motion.div
                className="absolute inset-0 isolate"
                inert={!!narrowDetail && !closingDetail}
                style={{ x: wide ? 0 : homeX }}
              >
                {home}
                {wide ? null : (
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-black"
                    style={{ opacity: homeDim }}
                  />
                )}
              </motion.div>
              {narrowDetail ? (
                <motion.div
                  data-bank-detail={uid}
                  role="region"
                  aria-label={`${openTx.name}, details`}
                  {...detailDrag}
                  onKeyDown={onDetailKey}
                  className="absolute inset-0 z-20 touch-pan-y [scrollbar-width:none] overflow-y-auto overscroll-contain border-l border-hairline bg-background shadow-[-12px_0_32px_color-mix(in_oklab,black_14%,transparent)]"
                  style={{ x: detailX, opacity: detailOpacity }}
                >
                  {detailNode}
                </motion.div>
              ) : null}
            </motion.div>
          </div>

          {/* Right, unfolded: the month, or the chosen transaction. */}
          <div
            className="relative hidden overflow-clip border-l border-hairline @min-[640px]:block"
            inert={sheetOpen}
          >
            <motion.div
              className="absolute inset-0 origin-top overflow-clip bg-background"
              style={wide ? behind : undefined}
            >
              <div className="absolute inset-0 grid [scrollbar-width:none] overflow-y-auto overscroll-contain">
                <AnimatePresence initial={false}>
                  <motion.div
                    key={wide && openTx ? openTx.id : "summary"}
                    data-bank-detail={wide && openTx ? uid : undefined}
                    role={wide && openTx ? "region" : undefined}
                    aria-label={
                      wide && openTx ? `${openTx.name}, details` : undefined
                    }
                    onKeyDown={wide && openTx ? onDetailKey : undefined}
                    className="bg-background [grid-area:1/1]"
                    initial={
                      motionSafe
                        ? {
                            opacity: 0,
                            x:
                              wide && openTx
                                ? distances.shift
                                : -distances.shift,
                          }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      x: springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }}
                  >
                    {wide && openTx ? (
                      detailNode
                    ) : (
                      <MonthSummary
                        list={sorted}
                        now={nowMs}
                        offset={zoneOffset}
                        money={money}
                        motionSafe={motionSafe}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-3 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,black_8%,transparent),transparent)] @min-[640px]:block"
          />

          {sheet ? (
            <div className="absolute inset-0 z-30">
              <SendSheet
                key={sheet.key}
                mode={sheet.mode}
                prefill={sheet.prefill}
                look={look}
                wide={wide}
                contacts={contacts}
                account={account}
                total={total}
                hidden={isHidden}
                money={money}
                symbol={symbol}
                locale={locale}
                format={format}
                motionSafe={motionSafe}
                sound={sound}
                disabled={disabled}
                sheetY={sheetY}
                sheetH={sheetH}
                fade={sheetFade}
                progress={progress}
                onSend={onSend}
                onLanded={land}
                onClosing={() => {
                  refocus.current = sheet.from;
                  setSheet((s) =>
                    s && s.key === sheet.key ? { ...s, closing: true } : s,
                  );
                }}
                onGone={() =>
                  setSheet((s) => (s && s.key === sheet.key ? null : s))
                }
              />
            </div>
          ) : null}
        </div>
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
