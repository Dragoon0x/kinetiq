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
  Backpack,
  Check,
  ChevronLeft,
  Download,
  Footprints,
  ImageOff,
  Mail,
  MessageSquareText,
  Package,
  PackageX,
  Printer,
  QrCode,
  Replace,
  RotateCcw,
  Ruler,
  Shirt,
  Store,
  TriangleAlert,
  Truck,
  Undo2,
  Wallet,
  Watch,
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
import {
  panFrom,
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type ReturnPrintKind = "label" | "qr";
export type ReturnStepsStyle = "paged" | "inline";
export type ReturnReasonsStyle = "chips" | "rows" | "tiles";
export type ReturnLabelState = "idle" | "pending" | "ready" | "error";
export type ReturnFlowStatus = "ready" | "loading" | "error";
export type ReturnItemKind = "shoe" | "top" | "bag" | "watch" | "other";
export type ReturnReasonIcon =
  "fit" | "mind" | "damaged" | "wrong" | "described" | "other";

export type ReturnItem = {
  id: string;
  name: string;
  /** Size, colour: "UK 7 · Slate". */
  variant?: string;
  /** Unit price. */
  price: number;
  /** How many were bought; the most that can go back. */
  quantity: number;
  /** Picks the thumbnail's glyph. @default "other" */
  kind?: ReturnItemKind;
  /** Thumbnail tint, any CSS colour — pass a token, never a hex. */
  tint?: string;
  /** False, or the reason it cannot go back ("Final sale"). @default true */
  returnable?: boolean | string;
};

export type ReturnAddress = { name: string; lines: string[] };

export type ReturnOrder = {
  /** The order number, e.g. "FW-20418". */
  id: string;
  /** The shop, shown on the label's return address. */
  merchant: string;
  /** When it arrived, ms since the epoch. The return window counts from here. */
  delivered: number;
  /** Days the return window stays open. @default 30 */
  windowDays?: number;
  /** How it was paid, e.g. "Waylight Pay ···· 4417": where an original-payment refund goes. */
  payment: string;
  /** The customer's address: the label's sender. */
  from: ReturnAddress;
  /** Where returns go: the label's recipient. */
  returnTo: ReturnAddress;
  items: ReturnItem[];
};

export type ReturnReason = {
  id: string;
  label: string;
  /** A short second line, shown where the style has room. */
  detail?: string;
  /** Opens a "Tell us more" field under the item. */
  note?: boolean;
  /** Our fault — damaged, wrong item: no return fee is charged. */
  waivesFee?: boolean;
  /** The tile's glyph. @default "other" */
  icon?: ReturnReasonIcon;
};

export type RefundMethod = {
  id: string;
  label: string;
  /** One line under the label. */
  detail: string;
  /** Extra credit on top of the refund, as a share: 0.1 is +10%. */
  bonus?: number;
  /** Whether the return fee applies with this method. @default true */
  fee?: boolean;
  /** "wallet" for credit, "card" for the original payment. */
  icon?: "card" | "wallet";
};

export type ReturnDropoff = {
  id: string;
  label: string;
  detail: string;
  /** Taken off the refund. @default 0 */
  fee?: number;
  icon?: "store" | "truck";
};

export type ReturnLine = {
  /** How many of this item go back, 1 to the quantity bought. */
  quantity: number;
  /** A `ReturnReason` id. */
  reason?: string;
  note?: string;
};

export type ReturnSelection = {
  /** One line per picked item, keyed by item id. */
  lines: Record<string, ReturnLine>;
  method: string | null;
  dropoff: string | null;
};

export type ReturnShippingLabel = {
  carrier: string;
  /** Printed under the barcode. */
  tracking: string;
  /** The return's reference. */
  rma: string;
  /** The short code a counter types in for the printer-free slip. */
  code: string;
  /** Drop it off by, ms since the epoch. */
  dropBy: number;
};

export type ReturnRefund = {
  items: number;
  count: number;
  shipping: number;
  pickup: number;
  bonus: number;
  total: number;
  /** A fault reason took the return fee away. */
  waived: boolean;
};

export type ReturnFlowProps = {
  /** What comes out of the slot: a shipping label with a barcode, or a printer-free QR slip. @default "label" */
  print?: ReturnPrintKind;
  /** Four pages with a step rail, or one page that unfolds as you go. @default "paged" */
  steps?: ReturnStepsStyle;
  /** How a reason is picked: wrapping chips, rows with a detail line, or icon tiles. @default "chips" */
  reasons?: ReturnReasonsStyle;
  /** The order being returned. @default defaultReturnOrder */
  order?: ReturnOrder;
  /** The reasons on offer. @default defaultReturnReasons */
  reasonOptions?: ReturnReason[];
  /** Where the money goes. @default defaultRefundMethods */
  methods?: RefundMethod[];
  /** How the parcel leaves. @default defaultReturnDropoffs */
  dropoffs?: ReturnDropoff[];
  /** Controlled selection: lines, refund method and drop-off. */
  value?: ReturnSelection;
  /** Initial selection when uncontrolled. @default nothing picked, the first method and drop-off */
  defaultValue?: ReturnSelection;
  /** Fires from the pick, key or field that changed the selection. */
  onValueChange?: (value: ReturnSelection) => void;
  /** Controlled page, 0 to 3 (Items, Reason, Refund, Label). */
  step?: number;
  /** Initial page when uncontrolled. @default 0 */
  defaultStep?: number;
  /** Fires from the button or rail stop that changed the page. */
  onStepChange?: (step: number) => void;
  /** Make the label. Return a promise to hold the button pending; resolve with your label to print it. */
  onCreateLabel?: (
    selection: ReturnSelection,
    refund: ReturnRefund,
  ) => void | Promise<ReturnShippingLabel | void>;
  /** Controlled label state: "ready" prints it. */
  state?: ReturnLabelState;
  /** Fires as the label is requested, made or refused. */
  onStateChange?: (state: ReturnLabelState) => void;
  /** The label to print. @default one made from the order, seeded */
  shippingLabel?: ReturnShippingLabel;
  /** The label was torn off: by a pull or by the Tear off button. */
  onTear?: () => void;
  /** Download on a torn label. */
  onDownload?: () => void;
  /** Email it on a torn label. */
  onEmail?: () => void;
  /** Start over was pressed: the selection and the label are cleared. */
  onStartOver?: () => void;
  /** The return fee, taken off the refund unless the method or a reason waives it. @default 4.95 */
  returnFee?: number;
  /** The flow's moment (Date or ms): the days left and the drop-by date count from it. @default defaultReturnNow */
  now?: number | Date;
  /** Amounts to text. @default US dollars */
  formatPrice?: (amount: number) => string;
  /** The heading. @default "Start a return" */
  title?: string;
  /** Whether the order has arrived. @default "ready" */
  status?: ReturnFlowStatus;
  /** "Try again" was pressed after the order failed to load. */
  onRetry?: () => void;
  /** The region's accessible name. @default the title */
  label?: string;
  /** Clicks for picks and steps, paper as the label feeds and tears. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: everything shows, nothing can be changed. @default false */
  disabled?: boolean;
  /** Classes for the root. It is at most 560px tall and scrolls inside itself. */
  className?: string;
};

/* -------------------------------- defaults ------------------------------- */

const DAY_MS = 86_400_000;

/** 2 October 2026, 09:30 UTC. */
export const defaultReturnNow = Date.UTC(2026, 9, 2, 9, 30);

export const defaultReturnOrder: ReturnOrder = {
  id: "FW-20418",
  merchant: "Fernworks",
  delivered: Date.UTC(2026, 8, 24, 14, 10),
  windowDays: 30,
  payment: "Waylight Pay ···· 4417",
  from: { name: "Ana Ruiz", lines: ["18 Calder Row", "Leeds LS6 2QT"] },
  returnTo: {
    name: "Fernworks Returns",
    lines: ["Unit 4, Kiln Yard", "Wakefield WF1 5PL"],
  },
  items: [
    {
      id: "ridge",
      name: "Ridge Trail Runner",
      variant: "UK 7 · Slate",
      price: 98,
      quantity: 1,
      kind: "shoe",
      tint: "var(--accent-bright)",
    },
    {
      id: "field",
      name: "Field Jacket",
      variant: "M · Moss",
      price: 64,
      quantity: 1,
      kind: "top",
      tint: "var(--success)",
    },
    {
      id: "merino",
      name: "Merino Tee",
      variant: "M · Oat",
      price: 28,
      quantity: 2,
      kind: "top",
      tint: "var(--warn)",
    },
    {
      id: "strap",
      name: "Watch Strap",
      variant: "20 mm · Rust",
      price: 12,
      quantity: 1,
      kind: "watch",
      tint: "var(--danger)",
      returnable: "Final sale",
    },
  ],
};

export const defaultReturnReasons: ReturnReason[] = [
  {
    id: "fit",
    label: "Didn't fit",
    detail: "Too small or too big",
    icon: "fit",
  },
  {
    id: "mind",
    label: "Changed my mind",
    detail: "Nothing wrong with it",
    icon: "mind",
  },
  {
    id: "damaged",
    label: "Arrived damaged",
    detail: "No return fee",
    waivesFee: true,
    icon: "damaged",
  },
  {
    id: "wrong",
    label: "Wrong item sent",
    detail: "No return fee",
    waivesFee: true,
    icon: "wrong",
  },
  {
    id: "described",
    label: "Not as pictured",
    detail: "Colour or finish differs",
    icon: "described",
  },
  {
    id: "other",
    label: "Something else",
    detail: "Tell us in a line",
    note: true,
    icon: "other",
  },
];

export const defaultRefundMethods: RefundMethod[] = [
  {
    id: "original",
    label: "Original payment",
    detail: "3–5 days after it arrives",
    icon: "card",
  },
  {
    id: "credit",
    label: "Fernworks credit",
    detail: "Instant once scanned, no fee",
    bonus: 0.1,
    fee: false,
    icon: "wallet",
  },
];

export const defaultReturnDropoffs: ReturnDropoff[] = [
  {
    id: "counter",
    label: "Waylight Post counter",
    detail: "Any of 2,400 counters",
    icon: "store",
  },
  {
    id: "pickup",
    label: "Courier pickup",
    detail: "Tomorrow, 8–12",
    fee: 3.5,
    icon: "truck",
  },
];

/* -------------------------------- helpers -------------------------------- */

const STEP_NAMES = ["Items", "Reason", "Refund", "Label"] as const;
const PANEL_KEYS = ["items", "why", "refund", "label"] as const;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");

const r2 = (v: number) => Math.round(v * 100) / 100;
const cents = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());

const dayText = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""}, ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const shortDay = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const usd = (v: number) => USD.format(v);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same label for the same order, everywhere. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** The label an order gets when the host does not pass one. */
function labelFor(order: ReturnOrder, now: number): ReturnShippingLabel {
  const next = seeded(hash(order.id));
  const pick = (n: number) =>
    Array.from(
      { length: n },
      () => ALPHABET[Math.floor(next() * ALPHABET.length)] ?? "X",
    ).join("");
  const digits = (n: number) =>
    Array.from({ length: n }, () => Math.floor(next() * 10)).join("");
  return {
    carrier: "Waylight Post",
    tracking: `WP ${digits(4)} ${digits(4)} ${digits(4)} GB`,
    rma: `R-${pick(4)}`,
    code: `${pick(4)}-${pick(4)}`,
    dropBy: Math.floor(now / DAY_MS) * DAY_MS + 14 * DAY_MS,
  };
}

const returnableOf = (item: ReturnItem) =>
  item.returnable !== false && typeof item.returnable !== "string";

/**
 * The refund for a selection: items, less the return fee (unless the method
 * or a fault reason waives it) and any pickup fee, plus a credit bonus.
 */
export function refundFor(
  order: ReturnOrder,
  selection: ReturnSelection,
  reasons: ReturnReason[] = defaultReturnReasons,
  methods: RefundMethod[] = defaultRefundMethods,
  dropoffs: ReturnDropoff[] = defaultReturnDropoffs,
  fee = 4.95,
): ReturnRefund {
  let items = 0;
  let count = 0;
  let waived = false;
  for (const item of order.items) {
    const line = selection.lines[item.id];
    if (!line || !returnableOf(item)) continue;
    const q = clamp(Math.round(line.quantity), 1, Math.max(1, item.quantity));
    items += item.price * q;
    count += q;
    if (reasons.find((r) => r.id === line.reason)?.waivesFee) waived = true;
  }
  const method = methods.find((m) => m.id === selection.method);
  const drop = dropoffs.find((d) => d.id === selection.dropoff);
  const shipping = count && method?.fee !== false && !waived ? cents(fee) : 0;
  const pickup = count ? cents(drop?.fee ?? 0) : 0;
  const bonus = count ? cents(items * (method?.bonus ?? 0)) : 0;
  return {
    items: cents(items),
    count,
    shipping,
    pickup,
    bonus,
    total: Math.max(0, cents(items - shipping - pickup + bonus)),
    waived,
  };
}

const emptySelection = (
  methods: RefundMethod[],
  dropoffs: ReturnDropoff[],
): ReturnSelection => ({
  lines: {},
  method: methods[0]?.id ?? null,
  dropoff: dropoffs[0]?.id ?? null,
});

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const ITEM_ICON: Record<ReturnItemKind, LucideIcon> = {
  shoe: Footprints,
  top: Shirt,
  bag: Backpack,
  watch: Watch,
  other: Package,
};

const REASON_ICON: Record<ReturnReasonIcon, LucideIcon> = {
  fit: Ruler,
  mind: Undo2,
  damaged: PackageX,
  wrong: Replace,
  described: ImageOff,
  other: MessageSquareText,
};

/** Fixed art: label paper is white and its ink black in either theme. */
const PAPER_VARS = {
  "--return-flow-paper": "oklch(from var(--ink) 0.985 0.004 h)",
  "--return-flow-ink": "oklch(from var(--ink) 0.2 0.02 h)",
  "--return-flow-slot": "oklch(from var(--ink) 0.16 0.015 h)",
} as React.CSSProperties;

/* ----------------------------- small pieces ------------------------------ */

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function RollDigit({
  digit,
  motionSafe,
}: {
  digit: number;
  motionSafe: boolean;
}) {
  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ height: "1em", lineHeight: 1 }}
    >
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-digit}em` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((n) => (
          <span key={n} style={{ height: "1em", lineHeight: 1 }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** A figure whose digits roll on snap, keyed from the right so units stay put. */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = Array.from(text);
  return (
    <span className={cn("relative inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span
        aria-hidden
        className="inline-flex"
        style={{ height: "1em", lineHeight: 1 }}
      >
        {chars.map((ch, i) => {
          const key = chars.length - i;
          return /\d/.test(ch) ? (
            <RollDigit
              key={`d${key}`}
              digit={Number(ch)}
              motionSafe={motionSafe}
            />
          ) : (
            <span key={`c${key}${ch}`} style={{ height: "1em", lineHeight: 1 }}>
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}

function Thumb({
  item,
  size = "md",
}: {
  item: ReturnItem;
  size?: "sm" | "md";
}) {
  const Icon = ITEM_ICON[item.kind ?? "other"];
  const tint = item.tint ?? "var(--accent-bright)";
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "sm" ? "size-7 rounded-2" : "size-10 rounded-2",
      )}
      style={{
        background: `color-mix(in oklab, ${tint} 16%, transparent)`,
        color: tint,
      }}
    >
      <Icon
        className={size === "sm" ? "size-3.5" : "size-5"}
        strokeWidth={1.6}
      />
    </span>
  );
}

/** A checkbox whose tick draws on flick. */
function TickBox({
  checked,
  motionSafe,
}: {
  checked: boolean;
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-1 border transition-colors",
        checked
          ? "border-cobalt-bright bg-cobalt-bright text-primary-foreground"
          : "border-hairline-strong bg-card",
      )}
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="none">
        <motion.path
          d="M2.5 6.2 5 8.6l4.6-5.2"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={
            motionSafe
              ? {
                  pathLength: springs.flick,
                  opacity: { duration: durations.blink },
                }
              : { duration: 0 }
          }
        />
      </svg>
    </span>
  );
}

function Spinner({ spin }: { spin: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn("size-4 shrink-0", spin && "animate-spin")}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A box whose height follows its content on glide. The content is measured
 * where it lands (ResizeObserver bound to the node as it arrives), so nothing
 * is reserved and nothing below jumps.
 */
function Measured({
  motionSafe,
  className,
  style,
  children,
}: {
  motionSafe: boolean;
  className?: string;
  style?: { x?: MotionValue<number> };
  children: React.ReactNode;
}) {
  const height = useMotionValue<number | "auto">("auto");
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const seen = React.useRef(false);
  React.useEffect(() => {
    if (!node) return;
    let anim: AnimationPlaybackControls | null = null;
    const ro = new ResizeObserver(() => {
      const h = r2(node.offsetHeight);
      anim?.stop();
      const from = height.get();
      if (!seen.current || !motionSafe || typeof from !== "number") {
        seen.current = true;
        height.jump(h);
        return;
      }
      anim = animate(height, h, springs.glide);
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      anim?.stop();
    };
  }, [node, motionSafe, height]);
  return (
    <motion.div
      className={cn("-m-1 overflow-hidden", className)}
      style={{ height, ...style }}
      // Hidden still scrolls: focus moving into a panel while the height is
      // still opening must not leave it scrolled.
      onScroll={(event) => {
        event.currentTarget.scrollTop = 0;
      }}
    >
      <div ref={setNode} className="relative p-1">
        {children}
      </div>
    </motion.div>
  );
}

/** Arrow keys, Home and End over a radiogroup: selection follows focus. */
function radioKeys(
  event: React.KeyboardEvent,
  index: number,
  count: number,
  choose: (i: number) => void,
) {
  let to = -1;
  if (event.key === "ArrowRight" || event.key === "ArrowDown")
    to = (index + 1) % count;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    to = (index - 1 + count) % count;
  else if (event.key === "Home") to = 0;
  else if (event.key === "End") to = count - 1;
  if (to === -1) return;
  event.preventDefault();
  choose(to);
  const group = (event.currentTarget as HTMLElement).closest(
    "[role='radiogroup']",
  );
  const radios = group?.querySelectorAll<HTMLElement>("[role='radio']");
  radios?.[to]?.focus();
}

/* ------------------------------ reason picker ---------------------------- */

function ReasonPicker({
  style,
  options,
  value,
  onChoose,
  labelledBy,
  motionSafe,
  disabled,
}: {
  style: ReturnReasonsStyle;
  options: ReturnReason[];
  value?: string;
  onChoose: (id: string, el: HTMLElement) => void;
  labelledBy: string;
  motionSafe: boolean;
  disabled: boolean;
}) {
  const chosenIndex = options.findIndex((o) => o.id === value);
  const tabbable = chosenIndex === -1 ? 0 : chosenIndex;
  const common = (o: ReturnReason, i: number) => ({
    role: "radio" as const,
    type: "button" as const,
    "aria-checked": o.id === value,
    tabIndex: i === tabbable ? 0 : -1,
    "aria-disabled": disabled || undefined,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled) onChoose(o.id, event.currentTarget);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      radioKeys(event, i, options.length, (to) => {
        const next = options[to];
        if (next) onChoose(next.id, event.currentTarget);
      });
    },
  });

  if (style === "rows") {
    return (
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        className="flex flex-col overflow-hidden rounded-3 border border-hairline bg-card"
      >
        {options.map((o, i) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              {...common(o, i)}
              className={cn(
                "flex items-center gap-3 border-b border-hairline px-3 py-2 text-left transition-colors last:border-b-0",
                on ? "bg-cobalt-wash" : "hover:bg-surface-2",
                RING_IN,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  on ? "border-cobalt-bright" : "border-hairline-strong",
                )}
              >
                <motion.span
                  className="size-2 rounded-full bg-cobalt-bright"
                  initial={false}
                  animate={{ scale: on ? 1 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-foreground">
                  {o.label}
                </span>
                {o.detail ? (
                  <span className="block truncate text-[11px] text-ink-3">
                    {o.detail}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (style === "tiles") {
    return (
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        className="grid grid-cols-2 gap-2 @min-[40rem]:grid-cols-3"
      >
        {options.map((o, i) => {
          const on = o.id === value;
          const Icon = REASON_ICON[o.icon ?? "other"];
          return (
            <button
              key={o.id}
              {...common(o, i)}
              className={cn(
                "flex h-full flex-col items-start gap-1.5 rounded-3 border p-2.5 text-left transition-colors duration-150",
                on
                  ? "border-cobalt-bright/60 bg-cobalt-wash"
                  : "border-hairline bg-card hover:bg-surface-2",
                RING,
              )}
            >
              <motion.span
                aria-hidden
                className={cn(
                  "flex size-4 items-center justify-center",
                  on ? "text-cobalt-bright" : "text-ink-2",
                )}
                initial={false}
                animate={{ y: on && motionSafe ? -2 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <Icon className="size-4" strokeWidth={1.7} />
              </motion.span>
              <span className="text-[12px] leading-tight font-medium text-foreground">
                {o.label}
              </span>
              {o.detail ? (
                <span className="text-[11px] leading-tight text-ink-3">
                  {o.detail}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <motion.button
            key={o.id}
            layout={motionSafe ? "position" : false}
            transition={springs.glide}
            {...common(o, i)}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-[12px] transition-colors",
              on
                ? "border-cobalt-bright bg-cobalt-bright text-primary-foreground"
                : "border-hairline-strong bg-card text-foreground hover:bg-surface-2",
              RING,
            )}
          >
            <motion.span
              aria-hidden
              className="inline-flex shrink-0 items-center overflow-hidden"
              initial={false}
              animate={{
                width: on ? 16 : 0,
                opacity: on ? 1 : 0,
                x: on || !motionSafe ? 0 : -distances.nudge,
              }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <Check className="size-3 shrink-0" strokeWidth={2.4} />
            </motion.span>
            {o.label}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ------------------------------ choice cards ----------------------------- */

type Choice = {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  badge?: string;
};

function ChoiceCards({
  choices,
  value,
  onChoose,
  labelledBy,
  layoutId,
  motionSafe,
  disabled,
}: {
  choices: Choice[];
  value: string | null;
  onChoose: (id: string, el: HTMLElement) => void;
  labelledBy: string;
  layoutId: string;
  motionSafe: boolean;
  disabled: boolean;
}) {
  const chosen = choices.findIndex((c) => c.id === value);
  const tabbable = chosen === -1 ? 0 : chosen;
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="grid gap-2 @min-[30rem]:grid-cols-2"
    >
      {choices.map((c, i) => {
        const on = c.id === value;
        const Icon = c.icon;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled || undefined}
            tabIndex={i === tabbable ? 0 : -1}
            onClick={(event) => {
              if (!disabled) onChoose(c.id, event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (disabled) return;
              radioKeys(event, i, choices.length, (to) => {
                const next = choices[to];
                if (next) onChoose(next.id, event.currentTarget);
              });
            }}
            className={cn(
              "relative flex items-start gap-3 rounded-3 border border-hairline bg-card p-3 text-left transition-colors",
              !on && "hover:bg-surface-2",
              RING,
            )}
          >
            {on ? (
              <motion.span
                aria-hidden
                layoutId={motionSafe ? layoutId : undefined}
                transition={springs.snap}
                className="absolute -inset-px rounded-3 border border-cobalt-bright/60 bg-cobalt-wash"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative flex size-8 shrink-0 items-center justify-center rounded-2",
                on ? "bg-card text-cobalt-bright" : "bg-surface-2 text-ink-2",
              )}
            >
              <Icon className="size-4" strokeWidth={1.7} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {c.label}
                </span>
                {c.badge ? (
                  <span className="shrink-0 rounded-full bg-success/12 px-1.5 py-px font-mono text-[10px] text-success">
                    {c.badge}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">
                {c.detail}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- paper --------------------------------- */

function barcode(seed: string, height: number) {
  const next = seeded(hash(seed));
  let x = 0;
  const parts: string[] = [];
  const bar = (w: number) => {
    parts.push(`M${x} 0h${w}v${height}h${-w}z`);
    x += w;
  };
  bar(2);
  x += 1;
  bar(1);
  x += 1;
  for (let i = 0; i < 30; i += 1) {
    bar(1 + Math.floor(next() * 3));
    x += 1 + Math.floor(next() * 2);
  }
  bar(1);
  x += 1;
  bar(2);
  return { d: parts.join(""), width: x };
}

/** A 21×21 code with its three finder squares, the rest seeded. One path. */
function qrPath(seed: string): string {
  const N = 21;
  const Q = 2;
  const next = seeded(hash(`qr:${seed}`));
  const finder = (r: number, c: number, r0: number, c0: number) => {
    const y = r - r0;
    const x = c - c0;
    if (x < 0 || y < 0 || x > 6 || y > 6) return null;
    const edge = x === 0 || y === 0 || x === 6 || y === 6;
    const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
    return edge || core;
  };
  const parts: string[] = [];
  for (let r = 0; r < N; r += 1) {
    let run = 0;
    const flush = (c: number) => {
      if (run > 0) parts.push(`M${c - run + Q} ${r + Q}h${run}v1h${-run}z`);
      run = 0;
    };
    for (let c = 0; c < N; c += 1) {
      const f =
        finder(r, c, 0, 0) ?? finder(r, c, 0, 14) ?? finder(r, c, 14, 0);
      const quiet =
        (r <= 7 && c <= 7) || (r <= 7 && c >= 13) || (r >= 13 && c <= 7);
      let on: boolean;
      if (f !== null) on = f;
      else if (quiet) on = false;
      else if (r === 6 || c === 6) on = (r + c) % 2 === 0;
      else on = next() > 0.52;
      if (on) run += 1;
      else flush(c);
    }
    flush(N);
  }
  return parts.join("");
}

function QrMark({ seed, className }: { seed: string; className?: string }) {
  const d = React.useMemo(() => qrPath(seed), [seed]);
  return (
    <svg
      aria-hidden
      viewBox="0 0 25 25"
      shapeRendering="crispEdges"
      className={className}
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function LabelFace({
  kind,
  label,
  order,
  count,
}: {
  kind: ReturnPrintKind;
  label: ReturnShippingLabel;
  order: ReturnOrder;
  count: number;
}) {
  const bars = React.useMemo(
    () => barcode(label.tracking, 40),
    [label.tracking],
  );
  const drop = shortDay(label.dropBy).toUpperCase();
  if (kind === "qr") {
    return (
      <div className="flex flex-col items-center gap-2 px-4 pt-3 pb-3.5 text-center">
        <p className="text-[13px] leading-none font-bold tracking-[0.12em] uppercase">
          {label.carrier}
        </p>
        <p className="font-mono text-[9px] leading-none tracking-[0.14em]">
          NO PRINTER NEEDED
        </p>
        <QrMark seed={label.code} className="mt-1 size-32" />
        <p className="font-mono text-base leading-none font-bold tracking-[0.16em]">
          {label.code}
        </p>
        <p className="max-w-[16rem] text-[10px] leading-snug">
          Show this at any {label.carrier} counter. They print the label for
          you.
        </p>
        <p className="w-full border-t border-current/30 pt-1.5 font-mono text-[9px] leading-none tracking-[0.06em]">
          {label.rma} · {count} {count === 1 ? "ITEM" : "ITEMS"} · BY {drop}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 px-3 pt-3 pb-3 font-mono text-[9px] leading-[1.35]">
      <div className="flex items-start justify-between gap-2 border-b-2 border-current pb-2">
        <div className="min-w-0">
          <p className="truncate font-sans text-[13px] leading-none font-bold tracking-[0.1em] uppercase">
            {label.carrier}
          </p>
          <p className="mt-1 leading-none tracking-[0.06em]">
            RETURNS · GROUND · 2–4 DAYS
          </p>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center border-2 border-current font-sans text-lg leading-none font-black">
          R
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 uppercase">
        <div className="min-w-0">
          <p className="opacity-60">From</p>
          <p className="break-words">{order.from.name}</p>
          {order.from.lines.map((l) => (
            <p key={l} className="break-words">
              {l}
            </p>
          ))}
        </div>
        <div className="min-w-0">
          <p className="opacity-60">To</p>
          <p className="font-bold break-words">{order.returnTo.name}</p>
          {order.returnTo.lines.map((l) => (
            <p key={l} className="break-words">
              {l}
            </p>
          ))}
        </div>
      </div>
      <svg
        aria-hidden
        viewBox={`0 0 ${bars.width} 40`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="mt-0.5 h-10 w-full"
      >
        <path d={bars.d} fill="currentColor" />
      </svg>
      <p className="-mt-1 text-center tracking-[0.18em]">{label.tracking}</p>
      <div className="flex items-end justify-between gap-2 border-t border-current pt-2">
        <div className="min-w-0 uppercase">
          <p className="font-bold">
            {label.rma} · {order.id}
          </p>
          <p>
            {count} {count === 1 ? "item" : "items"} · drop by {drop}
          </p>
        </div>
        <QrMark seed={label.code} className="size-9 shrink-0" />
      </div>
    </div>
  );
}

/* -------------------------------- printer -------------------------------- */

type Phase = "feeding" | "printed" | "torn";

/** The paper above the perforation that stays in the slot, px. */
const STUB = 10;
const TOOTH = 3;
const TEETH = 24;
/** How far a pull runs the rip right across, px. */
const RIP_PX = 64;
/** How far the label pivots as the rip runs, degrees. */
const ANGLE = 5;
/** Where a torn label comes to rest below the stub, px. */
const REST = 16;
/** A full label's feed, s. */
const FEED_S = 1.7;
/** The stepper motor's step, px. */
const FEED_STEP = 3;

const teethTop = (r: number) => {
  const cut = r * TEETH;
  const pts: string[] = [];
  for (let i = 0; i <= TEETH; i += 1) {
    const x = r2((i / TEETH) * 100);
    pts.push(`${x}% ${i <= cut && i % 2 === 1 ? TOOTH : 0}px`);
  }
  pts.push("100% 100%", "0% 100%");
  return `polygon(${pts.join(", ")})`;
};

const teethBottom = (r: number) => {
  const cut = r * TEETH;
  const pts: string[] = ["0% 0px", "100% 0px"];
  for (let i = TEETH; i >= 0; i -= 1) {
    const x = r2((i / TEETH) * 100);
    pts.push(`${x}% ${i <= cut && i % 2 === 0 ? STUB - TOOTH : STUB}px`);
  }
  return `polygon(${pts.join(", ")})`;
};

type PrinterProps = {
  kind: ReturnPrintKind;
  label: ReturnShippingLabel;
  order: ReturnOrder;
  count: number;
  refundText: string;
  destination: string;
  motionSafe: boolean;
  audio: TactileSound;
  /** Whether the visitor's own press started this print: only then does it sound. */
  visitor: React.RefObject<boolean>;
  disabled: boolean;
  onPrinted: () => void;
  onTorn: () => void;
  onDownload?: () => void;
  onEmail?: () => void;
  onStartOver: () => void;
};

/**
 * The printer and its paper. The feed is one motion value drawn in 3px steps,
 * so the paper moves like a stepper motor rather than a slide. Once printed,
 * a pull runs a rip along the perforation from the left while the label
 * pivots about its unripped corner; past the line it comes free and lands.
 */
function ReturnPrinter({
  kind,
  label,
  order,
  count,
  refundText,
  destination,
  motionSafe,
  audio,
  visitor,
  disabled,
  onPrinted,
  onTorn,
  onDownload,
  onEmail,
  onStartOver,
}: PrinterProps) {
  const uid = React.useId();
  const [phase, setPhase] = React.useState<Phase>("feeding");
  const feed = useMotionValue(0);
  const total = useMotionValue(0);
  const rip = useMotionValue(0);
  const freed = useMotionValue(0);
  const freeY = useMotionValue(0);
  const drop = useMotionValue(0);
  const shown = useMotionValue(motionSafe ? 1 : 0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const grip = React.useRef<{ torn: boolean; at: number } | null>(null);
  const tearing = React.useRef(false);
  const focusDone = React.useRef(false);
  const [paper, setPaper] = React.useState<HTMLDivElement | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  React.useEffect(() => {
    if (!paper) return;
    const ro = new ResizeObserver(() => total.set(r2(paper.offsetHeight)));
    ro.observe(paper);
    return () => ro.disconnect();
  }, [paper, total]);

  // The feed. A StrictMode re-run carries on from where the paper got to.
  React.useEffect(() => {
    if (phase !== "feeding") return;
    const running = anims.current;
    const pending = timers.current;
    if (!motionSafe) {
      feed.jump(1);
      const fade = animate(shown, 1, {
        duration: durations.base,
        ease: easings.enter,
        onComplete: () => {
          setPhase("printed");
          onPrinted();
        },
      });
      running.set("shown", fade);
      return () => fade.stop();
    }
    shown.jump(1);
    const left = Math.max(0, 1 - feed.get());
    const go = animate(feed, 1, {
      duration: FEED_S * left,
      ease: "linear",
      onComplete: () => {
        setPhase("printed");
        onPrinted();
      },
    });
    running.set("feed", go);
    if (visitor.current) {
      const bursts = Math.max(1, Math.round((FEED_S * left) / 0.17));
      for (let i = 0; i < bursts; i += 1) {
        pending.push(
          window.setTimeout(
            () =>
              audio.play("paper", {
                pitch: r2(1.05 + (i % 3) * 0.07),
                gain: 0.2,
              }),
            Math.round(i * 170),
          ),
        );
      }
    }
    return () => {
      go.stop();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
    // The feed runs once per print; its callbacks are read when it ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, motionSafe]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
    };
  }, []);

  const visible = useTransform(
    [feed, total] as MotionValue<number>[],
    ([f = 0, t = 0]: number[]) =>
      f >= 1 ? t : Math.round((f * t) / FEED_STEP) * FEED_STEP,
  );
  const wrapH = useTransform(
    [visible, drop] as MotionValue<number>[],
    ([v = 0, d = 0]: number[]) => r2(v + d),
  );
  const paperY = useTransform(
    [visible, total] as MotionValue<number>[],
    ([v = 0, t = 0]: number[]) => r2(v - t),
  );
  const tilt = useTransform(
    [rip, freed] as MotionValue<number>[],
    ([r = 0, f = 0]: number[]) => r2(-ANGLE * r * (1 - f)),
  );
  const labelClip = useTransform(rip, (r) =>
    r <= 0.001 ? "none" : teethTop(r),
  );
  const stubClip = useTransform(rip, (r) =>
    r <= 0.001 ? "none" : teethBottom(r),
  );
  const perfLeft = useTransform(rip, (r) => `${r2(r * 100)}%`);
  const lift = useTransform(
    [freeY, rip] as MotionValue<number>[],
    ([y = 0, r = 0]: number[]) => {
      const k = Math.min(1, Math.max(r, y / REST));
      return k < 0.02
        ? "none"
        : `drop-shadow(0 ${r2(2 + 3 * k)}px ${r2(3 + 5 * k)}px color-mix(in oklab, black ${Math.round(12 + 12 * k)}%, transparent))`;
    },
  );

  const land = (velocity: number) => {
    if (!motionSafe) {
      freeY.jump(REST);
      drop.jump(REST);
      return;
    }
    run("freeY", animate(freeY, REST, { ...springs.recoil, velocity }));
    run("drop", animate(drop, REST, springs.glide));
  };

  const tearNow = (from: "pull" | "key" | "tap") => {
    if (tearing.current) return;
    tearing.current = true;
    if (from === "key") focusDone.current = true;
    rip.jump(1);
    setPhase("torn");
    audio.play("paper", {
      pitch: 0.78,
      gain: 0.6,
      pan: paper ? panFrom(paper.getBoundingClientRect().left + 40, null) : 0,
    });
    if (motionSafe) run("freed", animate(freed, 1, springs.snap));
    else freed.jump(1);
    onTorn();
  };

  const springBack = (velocity: number) => {
    run(
      "rip",
      animate(rip, 0, { ...springs.snap, velocity: velocity / RIP_PX }),
    );
    run("freeY", animate(freeY, 0, springs.snap));
  };

  const finishRip = (velocity: number, from: "pull" | "key") => {
    run(
      "rip",
      animate(rip, 1, {
        ...(from === "key"
          ? { duration: 0.28, ease: easings.move }
          : { ...springs.flick, velocity: velocity / RIP_PX }),
        onComplete: () => {
          tearNow(from);
          land(from === "key" ? 0 : velocity * 0.3);
        },
      }),
    );
  };

  const tearInstantly = (from: "key" | "tap") => {
    tearNow(from);
    land(0);
  };

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || phase !== "printed",
    onStart: () => {
      if (!motionSafe) return;
      anims.current.get("rip")?.stop();
      anims.current.get("freeY")?.stop();
      grip.current = { torn: false, at: 0 };
    },
    onMove: ({ offset }) => {
      const g = grip.current;
      if (!g) return;
      const pull = offset.y;
      if (!g.torn) {
        if (pull <= 0) {
          rip.set(0);
          freeY.set(r2(rubberband(pull, 60)));
          return;
        }
        freeY.set(0);
        const r = Math.min(1, pull / RIP_PX);
        rip.set(Number(r.toFixed(4)));
        if (r >= 1) {
          g.torn = true;
          g.at = pull;
          tearNow("pull");
        }
        return;
      }
      // Free of the printer it hangs from the hand, but not far: past its
      // resting place it gives less and less.
      const raw = pull - g.at;
      freeY.set(
        r2(raw <= REST ? Math.max(-4, raw) : REST + rubberband(raw - REST, 60)),
      );
    },
    onEnd: ({ offset, velocity }) => {
      const g = grip.current;
      grip.current = null;
      if (!g) return;
      if (g.torn) {
        land(velocity.y);
        return;
      }
      if (project(offset.y, velocity.y, 0.99) >= RIP_PX)
        finishRip(velocity.y, "pull");
      else springBack(velocity.y);
    },
    onCancel: () => {
      const g = grip.current;
      grip.current = null;
      if (!g) return;
      if (g.torn) land(0);
      else springBack(0);
    },
    onTap: () => {
      if (phase !== "printed" || disabled) return;
      if (!motionSafe) {
        tearInstantly("tap");
        return;
      }
      // A tap shows where the paper is held: it gives a little and comes back.
      run(
        "rip",
        animate(rip, 0.14, {
          ...springs.snap,
          onComplete: () => run("rip", animate(rip, 0, springs.snap)),
        }),
      );
    },
  });

  const status =
    phase === "feeding"
      ? "Printing…"
      : phase === "printed"
        ? "Printed"
        : "Torn off";
  const dropText = dayText(label.dropBy);
  const paperName =
    kind === "qr"
      ? `Return code ${label.code} from ${label.carrier}, ${count} ${count === 1 ? "item" : "items"}, drop off by ${dropText}`
      : `Return label from ${label.carrier}, tracking ${label.tracking}, ${count} ${count === 1 ? "item" : "items"}, drop off by ${dropText}`;

  return (
    <div
      role="group"
      aria-label="Return label"
      className="flex flex-col items-center"
      style={PAPER_VARS}
    >
      <div className="relative z-20 w-[17rem] max-w-full rounded-3 border border-hairline-strong bg-surface-2 px-3 pt-2.5 shadow-[0_4px_14px_color-mix(in_oklab,black_10%,transparent)]">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-2">
            {kind === "qr" ? (
              <QrCode aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <Printer aria-hidden className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{status}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-ink-3">
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                phase === "feeding"
                  ? cn("bg-signal", motionSafe && "animate-pulse")
                  : phase === "printed"
                    ? "bg-success"
                    : "bg-ink-3/50",
              )}
            />
            {label.rma}
          </span>
        </div>
        <div
          aria-hidden
          className="mt-2.5 h-2 rounded-t-full bg-[var(--return-flow-slot)]"
        />
      </div>

      <motion.div
        className="relative z-10 -mt-1 w-[232px] max-w-full"
        style={{ height: wrapH, clipPath: "inset(0px -48px -96px -48px)" }}
      >
        <motion.div
          ref={setPaper}
          role="img"
          aria-label={paperName}
          {...drag}
          className={cn(
            "absolute inset-x-0 top-0 touch-pan-x select-none",
            phase === "printed" &&
              !disabled &&
              "cursor-grab active:cursor-grabbing",
          )}
          style={{ y: paperY, opacity: shown }}
        >
          <motion.div
            className="bg-[var(--return-flow-paper)]"
            style={{ height: STUB, clipPath: stubClip }}
          />
          {/* The shadow sits on an unclipped wrapper: a clip-path would
              cut a shadow drawn on the torn paper itself. */}
          <motion.div
            style={{
              rotate: tilt,
              y: freeY,
              originX: 1,
              originY: 0,
              filter: lift,
            }}
          >
            <motion.div
              className="relative bg-[var(--return-flow-paper)] text-[var(--return-flow-ink)]"
              style={{ clipPath: labelClip }}
            >
              {phase !== "torn" ? (
                <motion.span
                  aria-hidden
                  className="absolute top-0 right-0 border-t border-dashed border-[var(--return-flow-ink)]/45"
                  style={{ left: perfLeft }}
                />
              ) : null}
              <LabelFace
                kind={kind}
                label={label}
                order={order}
                count={count}
              />
            </motion.div>
          </motion.div>
        </motion.div>
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-linear-to-b from-[var(--return-flow-paper)] to-transparent"
          initial={false}
          animate={{ opacity: phase === "feeding" && motionSafe ? 0.9 : 0 }}
          transition={{ duration: durations.fast }}
        />
      </motion.div>

      <div className="mt-3 flex w-full flex-col items-center gap-2">
        {phase === "printed" ? (
          <motion.div
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            <p className="text-center text-[12px] text-ink-3">
              Pull the {kind === "qr" ? "slip" : "label"} down to tear it off.
            </p>
            <button
              type="button"
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (disabled || tearing.current) return;
                if (!motionSafe) tearInstantly("key");
                else finishRip(0, "key");
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                RING,
              )}
            >
              Tear off
            </button>
          </motion.div>
        ) : null}
        {phase === "torn" ? (
          <motion.div
            className="flex w-full max-w-[20rem] flex-col items-center gap-3 text-center"
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? {
                    y: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
          >
            <div>
              <h3
                ref={(node) => {
                  if (node && focusDone.current) {
                    focusDone.current = false;
                    node.focus({ preventScroll: true });
                  }
                }}
                id={`${uid}-done`}
                tabIndex={-1}
                className="text-sm font-medium text-foreground outline-none"
              >
                {kind === "qr" ? "Your code is ready" : "Your label is ready"}
              </h3>
              <p className="mt-1 text-[12px] leading-snug text-ink-3">
                {kind === "qr"
                  ? `Show it at a ${label.carrier} counter by ${dropText}.`
                  : `Drop it at a ${label.carrier} counter by ${dropText}.`}{" "}
                {refundText} goes to {destination} once it is scanned.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onDownload ? (
                <button
                  type="button"
                  aria-disabled={disabled || undefined}
                  onClick={() => {
                    if (!disabled) onDownload();
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                    RING,
                  )}
                >
                  <Download aria-hidden className="size-3.5 shrink-0" />
                  Download
                </button>
              ) : null}
              {onEmail ? (
                <button
                  type="button"
                  aria-disabled={disabled || undefined}
                  onClick={() => {
                    if (!disabled) onEmail();
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                    RING,
                  )}
                >
                  <Mail aria-hidden className="size-3.5 shrink-0" />
                  Email it
                </button>
              ) : null}
              <button
                type="button"
                aria-disabled={disabled || undefined}
                onClick={() => {
                  if (!disabled) onStartOver();
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5 shrink-0" />
                Start over
              </button>
            </div>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------- the flow -------------------------------- */

type Said = { n: number; text: string };

/**
 * A complete returns flow, from the order to paper in your hand. Pick what is
 * going back — each pick draws its tick on flick and takes a cobalt wash — give
 * each item a reason (chips, rows or tiles, every one a radiogroup), choose
 * where the refund goes and how the parcel leaves while the refund's digits
 * roll on snap, then print. The label feeds out of the printer's slot in 3px
 * steps like a stepper motor; a pull runs a rip along its perforation from the
 * left while the label pivots about its unripped corner, and past the line it
 * comes free and lands on recoil. "Tear off" reaches the same end by key.
 *
 * Paged, the four steps sit under a rail whose pill slides on snap and the
 * panels move by direction inside a box that glides to each one's measured
 * height; inline, everything unfolds on one page. Under reduced motion panels
 * cross-fade, the label appears whole and tears with a press, and every
 * figure, tick and state still shows.
 */
export function ReturnFlow({
  print = "label",
  steps = "paged",
  reasons = "chips",
  order = defaultReturnOrder,
  reasonOptions = defaultReturnReasons,
  methods = defaultRefundMethods,
  dropoffs = defaultReturnDropoffs,
  value,
  defaultValue,
  onValueChange,
  step,
  defaultStep = 0,
  onStepChange,
  onCreateLabel,
  state,
  onStateChange,
  shippingLabel,
  onTear,
  onDownload,
  onEmail,
  onStartOver,
  returnFee = 4.95,
  now = defaultReturnNow,
  formatPrice = usd,
  title = "Start a return",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: ReturnFlowProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const nowMs = toMs(now);
  const paged = steps === "paged";

  const [ownValue, setOwnValue] = React.useState<ReturnSelection>(
    () => defaultValue ?? emptySelection(methods, dropoffs),
  );
  const selection = value ?? ownValue;
  const [ownStep, setOwnStep] = React.useState(() =>
    clamp(Math.round(defaultStep), 0, 2),
  );
  const [ownState, setOwnState] = React.useState<ReturnLabelState>("idle");
  const labelState = state ?? ownState;
  const [made, setMade] = React.useState<ReturnShippingLabel | null>(null);
  const [printRun, setPrintRun] = React.useState(0);
  const [torn, setTorn] = React.useState(false);
  const [printed, setPrinted] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const printing = labelState === "ready";
  const current = printing ? 3 : clamp(Math.round(step ?? ownStep), 0, 2);
  const [view, setView] = React.useState({ step: current, dir: 1 });
  if (view.step !== current) {
    setView({ step: current, dir: current > view.step ? 1 : -1 });
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const visitor = React.useRef(false);
  const focusTarget = React.useRef<string | null>(null);
  const mounted = React.useRef(true);
  const shake = useMotionValue(0);
  const shaking = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      shaking.current?.stop();
    };
  }, []);

  const items = order.items;
  const picked = items.filter((i) => selection.lines[i.id] && returnableOf(i));
  const refund = refundFor(
    order,
    selection,
    reasonOptions,
    methods,
    dropoffs,
    returnFee,
  );
  const method = methods.find((m) => m.id === selection.method);
  const dropoff = dropoffs.find((d) => d.id === selection.dropoff);
  const theLabel = shippingLabel ?? made ?? labelFor(order, nowMs);
  const windowEnd = order.delivered + (order.windowDays ?? 30) * DAY_MS;
  const daysLeft = Math.max(0, Math.ceil((windowEnd - nowMs) / DAY_MS));
  const missing = picked.filter((i) => !selection.lines[i.id]?.reason);
  const destination =
    method && (method.icon === "wallet" || method.bonus)
      ? `your ${method.label}`
      : order.payment;
  const money = (v: number) => formatPrice(v);

  const click = (pitch: number, el?: Element | null, gain = 0.45) => {
    const rect = el?.getBoundingClientRect();
    audio.play("click", {
      pitch,
      gain,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const setSelection = (next: ReturnSelection) => {
    if (value === undefined) setOwnValue(next);
    onValueChange?.(next);
  };

  const setLabelState = (next: ReturnLabelState) => {
    if (state === undefined) setOwnState(next);
    onStateChange?.(next);
  };

  const focusInside = () => {
    const at = typeof document === "undefined" ? null : document.activeElement;
    return !!at && !!rootRef.current?.contains(at);
  };

  const goTo = (to: number, el?: Element | null) => {
    const next = clamp(to, 0, 2);
    if (next === current || printing) return;
    click(next > current ? 1.15 : 0.9, el);
    setProblem(null);
    focusTarget.current = focusInside() ? (PANEL_KEYS[next] ?? null) : null;
    if (step === undefined) setOwnStep(next);
    onStepChange?.(next);
    say(`Step ${next + 1} of 4, ${STEP_NAMES[next]}.`);
  };

  const refuse = (message: string, focusSel: string | null) => {
    setProblem(message);
    say(message);
    audio.play("click", { pitch: 0.55, gain: 0.5 });
    if (motionSafe) {
      shaking.current?.stop();
      shaking.current = animate(shake, [0, -6, 6, -3, 0], {
        duration: 0.32,
        ease: "easeOut",
      });
    }
    if (focusSel) {
      rootRef.current?.querySelector<HTMLElement>(focusSel)?.focus();
    }
  };

  /* --------------------------- selection edits --------------------------- */

  const toggleItem = (item: ReturnItem, el: Element) => {
    if (disabled || printing || !returnableOf(item)) return;
    const lines = { ...selection.lines };
    const had = !!lines[item.id];
    if (had) delete lines[item.id];
    else lines[item.id] = { quantity: Math.max(1, item.quantity) };
    click(had ? 0.85 : 1.1, el);
    setProblem(null);
    setSelection({ ...selection, lines });
    say(
      had
        ? `${item.name} removed from the return.`
        : `${item.name} added to the return.`,
    );
  };

  const setQuantity = (item: ReturnItem, q: number, el: Element) => {
    const line = selection.lines[item.id];
    if (!line || disabled || printing) return;
    const next = clamp(q, 1, Math.max(1, item.quantity));
    if (next === line.quantity) return;
    click(next > line.quantity ? 1.2 : 0.95, el, 0.35);
    setSelection({
      ...selection,
      lines: { ...selection.lines, [item.id]: { ...line, quantity: next } },
    });
    say(`${next} of ${item.quantity} ${item.name} going back.`);
  };

  const setReason = (item: ReturnItem, reasonId: string, el: Element) => {
    const line = selection.lines[item.id];
    if (!line || disabled || printing || line.reason === reasonId) return;
    const idx = reasonOptions.findIndex((r) => r.id === reasonId);
    click(1 + idx * 0.05, el, 0.4);
    setProblem(null);
    setSelection({
      ...selection,
      lines: { ...selection.lines, [item.id]: { ...line, reason: reasonId } },
    });
  };

  const setNote = (item: ReturnItem, note: string) => {
    const line = selection.lines[item.id];
    if (!line || disabled || printing) return;
    setSelection({
      ...selection,
      lines: { ...selection.lines, [item.id]: { ...line, note } },
    });
  };

  const setMethod = (id: string, el: Element) => {
    if (disabled || printing || id === selection.method) return;
    click(1.05, el);
    setSelection({ ...selection, method: id });
  };

  const setDropoff = (id: string, el: Element) => {
    if (disabled || printing || id === selection.dropoff) return;
    click(1.05, el);
    setSelection({ ...selection, dropoff: id });
  };

  /* ------------------------------ continuing ----------------------------- */

  const firstItemSel = `[data-return-item]`;
  const reasonSel = (id: string) =>
    `[data-return-reasons="${id}"] [role='radio']`;

  const check = (upTo: number): boolean => {
    if (picked.length === 0) {
      if (paged && current !== 0) goTo(0);
      refuse(
        "Pick at least one item to return.",
        paged && current !== 0 ? null : firstItemSel,
      );
      return false;
    }
    if (upTo >= 1 && missing.length > 0) {
      const first = missing[0];
      if (paged && current !== 1) goTo(1);
      refuse(
        missing.length === 1 && first
          ? `Choose a reason for ${first.name}.`
          : `Choose a reason for ${missing.length} items.`,
        first && (!paged || current === 1) ? reasonSel(first.id) : null,
      );
      return false;
    }
    return true;
  };

  const create = (el: Element | null) => {
    if (disabled || labelState === "pending" || printing) return;
    if (!check(2)) return;
    click(1.2, el, 0.55);
    setProblem(null);
    visitor.current = true;
    const result = onCreateLabel?.(selection, refund);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setLabelState("pending");
      say("Creating your label.");
      (result as Promise<ReturnShippingLabel | void>).then(
        (got) => {
          if (!mounted.current) return;
          if (got) setMade(got);
          setPrintRun((r) => r + 1);
          setPrinted(false);
          setTorn(false);
          focusTarget.current = focusInside() ? "label" : null;
          setLabelState("ready");
          onStepChange?.(3);
          say(print === "qr" ? "Printing your code." : "Printing your label.");
        },
        () => {
          if (!mounted.current) return;
          setLabelState("error");
          visitor.current = false;
          say("The label could not be made. Try again.");
        },
      );
      return;
    }
    setPrintRun((r) => r + 1);
    setPrinted(false);
    setTorn(false);
    focusTarget.current = focusInside() ? "label" : null;
    setLabelState("ready");
    onStepChange?.(3);
    say(print === "qr" ? "Printing your code." : "Printing your label.");
  };

  const next = (el: Element) => {
    if (disabled) return;
    if (current === 0) {
      if (!check(0)) return;
      goTo(1, el);
    } else if (current === 1) {
      if (!check(1)) return;
      goTo(2, el);
    } else if (current === 2) {
      create(el);
    }
  };

  const startOver = () => {
    visitor.current = false;
    setTorn(false);
    setPrinted(false);
    setMade(null);
    setProblem(null);
    setSelection(emptySelection(methods, dropoffs));
    setLabelState("idle");
    // Paged, the items heading arrives with its page and takes focus then;
    // on one page it is already there, so it takes focus now.
    if (paged) focusTarget.current = focusInside() ? "items" : null;
    else if (focusInside()) {
      rootRef.current
        ?.querySelector<HTMLElement>("[data-panel='items']")
        ?.focus({ preventScroll: true });
    }
    if (step === undefined) setOwnStep(0);
    onStepChange?.(0);
    onStartOver?.();
    say("Return cleared. Step 1 of 4, Items.");
  };

  /* -------------------------------- pieces ------------------------------- */

  // Bound to the heading as it arrives; only the one asked for takes focus,
  // so a re-render that re-attaches every heading's ref moves nothing.
  const headingRef = React.useCallback(
    (node: HTMLHeadingElement | null) => {
      const key = node?.dataset.panel;
      if (!node || !key || focusTarget.current !== key) return;
      focusTarget.current = null;
      node.focus({ preventScroll: true });
      const root = rootRef.current;
      if (!root) return;
      const top =
        node.getBoundingClientRect().top - root.getBoundingClientRect().top;
      if (top < 0 || top > root.clientHeight - 80) {
        root.scrollTo({
          top: Math.max(0, root.scrollTop + top - 16),
          behavior: motionSafe ? "smooth" : "auto",
        });
      }
    },
    [motionSafe],
  );

  const reasonLabel = (id?: string) =>
    reasonOptions.find((r) => r.id === id)?.label;

  const reasonBlock = (item: ReturnItem, compact: boolean) => {
    const line = selection.lines[item.id];
    if (!line) return null;
    const reason = reasonOptions.find((r) => r.id === line.reason);
    const headId = `${uid}-why-${item.id}`;
    const noteId = `${uid}-note-${item.id}`;
    return (
      <div className="flex flex-col gap-2" data-return-reasons={item.id}>
        {compact ? (
          <p id={headId} className="text-[12px] text-ink-2">
            Why is it going back?
          </p>
        ) : (
          <div className="flex items-center gap-2.5">
            <Thumb item={item} size="sm" />
            <p
              id={headId}
              className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
            >
              Why is {item.name} going back?
            </p>
            {line.quantity > 1 ? (
              <span className="shrink-0 font-mono text-[11px] text-ink-3">
                ×{line.quantity}
              </span>
            ) : null}
          </div>
        )}
        <ReasonPicker
          style={reasons}
          options={reasonOptions}
          value={line.reason}
          onChoose={(id, el) => setReason(item, id, el)}
          labelledBy={headId}
          motionSafe={motionSafe}
          disabled={disabled || printing}
        />
        <AnimatePresence initial={false}>
          {reason?.note ? (
            <motion.div
              key="note"
              className="-m-1 overflow-hidden p-1"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.base),
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: 0 }
              }
            >
              <label
                htmlFor={noteId}
                className="mb-1 block text-[11px] text-ink-3"
              >
                Tell us more (optional)
              </label>
              <textarea
                id={noteId}
                rows={2}
                value={line.note ?? ""}
                disabled={disabled || printing}
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  setNote(item, text);
                }}
                className={cn(
                  "block w-full resize-none rounded-2 border border-hairline-strong bg-card px-2.5 py-2 text-[13px] text-foreground placeholder:text-ink-3",
                  RING,
                )}
                placeholder="What happened?"
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  const itemRow = (item: ReturnItem, index: number) => {
    const line = selection.lines[item.id];
    const ok = returnableOf(item);
    const on = !!line && ok;
    const why =
      typeof item.returnable === "string"
        ? item.returnable
        : "Can't be returned";
    const descId = `${uid}-item-${item.id}`;
    const detail = ok
      ? `${item.variant ? `${item.variant} · ` : ""}${money(item.price)}${item.quantity > 1 ? ` · ${item.quantity} bought` : ""}`
      : `${item.variant ? `${item.variant} · ` : ""}${why}`;
    return (
      <motion.li
        key={item.id}
        initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { ...springs.glide, delay: index * cascade(items.length) }
            : { duration: 0 }
        }
        className={cn(
          "rounded-3 border transition-colors duration-150",
          on
            ? "border-cobalt-bright/40 bg-cobalt-wash"
            : "border-hairline bg-surface-1",
        )}
      >
        <div className="flex items-center gap-2 p-1.5 pr-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-disabled={!ok || disabled || printing || undefined}
            aria-describedby={descId}
            data-return-item={ok ? "" : undefined}
            onClick={(event) => toggleItem(item, event.currentTarget)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-2 p-1 text-left",
              ok && !disabled && !printing
                ? "cursor-pointer"
                : "cursor-not-allowed",
              RING_IN,
            )}
          >
            {ok ? (
              <TickBox checked={on} motionSafe={motionSafe} />
            ) : (
              <span aria-hidden className="size-[18px] shrink-0" />
            )}
            <span
              className={cn(
                "flex min-w-0 flex-1 items-center gap-3",
                !ok && "opacity-55",
              )}
            >
              <Thumb item={item} />
              <span className="min-w-0 flex-1">
                <span
                  title={item.name}
                  className="block truncate text-[13px] font-medium text-foreground"
                >
                  {item.name}
                </span>
                <span
                  id={descId}
                  title={detail}
                  className="block truncate text-[11px] text-ink-3"
                >
                  {detail}
                </span>
              </span>
            </span>
          </button>
          {on && item.quantity > 1 && line ? (
            <div
              role="group"
              aria-label={`How many ${item.name} go back: ${line.quantity} of ${item.quantity}`}
              className="flex h-8 shrink-0 items-center gap-0.5 rounded-2 border border-hairline-strong bg-card px-0.5"
            >
              <button
                type="button"
                aria-label={`Return one fewer ${item.name}`}
                aria-disabled={
                  line.quantity <= 1 || disabled || printing || undefined
                }
                onClick={(event) =>
                  setQuantity(item, line.quantity - 1, event.currentTarget)
                }
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-1 text-ink-2 hover:bg-surface-2 aria-disabled:opacity-40",
                  RING_IN,
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  −
                </span>
              </button>
              <Roll
                text={String(line.quantity)}
                motionSafe={motionSafe}
                className="w-4 justify-center font-mono text-[13px] text-foreground"
              />
              <button
                type="button"
                aria-label={`Return one more ${item.name}`}
                aria-disabled={
                  line.quantity >= item.quantity ||
                  disabled ||
                  printing ||
                  undefined
                }
                onClick={(event) =>
                  setQuantity(item, line.quantity + 1, event.currentTarget)
                }
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-1 text-ink-2 hover:bg-surface-2 aria-disabled:opacity-40",
                  RING_IN,
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  +
                </span>
              </button>
            </div>
          ) : null}
        </div>
        {!paged ? (
          <AnimatePresence initial={false}>
            {on ? (
              <motion.div
                key="why"
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: exitFor(durations.base),
                }}
                transition={
                  motionSafe
                    ? {
                        height: springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: 0 }
                }
              >
                <div className="border-t border-cobalt-bright/20 px-3 pt-2.5 pb-3">
                  {reasonBlock(item, true)}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : null}
      </motion.li>
    );
  };

  const itemsSection = (heading: string) => (
    <section aria-labelledby={`${uid}-h-items`} className="flex flex-col gap-3">
      <div>
        <h3
          ref={headingRef}
          data-panel="items"
          id={`${uid}-h-items`}
          tabIndex={-1}
          className="text-sm font-medium text-foreground outline-none"
        >
          {heading}
        </h3>
        <p className="mt-0.5 text-[12px] text-ink-3">
          Returns open until {shortDay(windowEnd)}. Pick what is going back.
        </p>
      </div>
      <ul role="list" className="flex flex-col gap-2">
        {items.map(itemRow)}
      </ul>
    </section>
  );

  const reasonsSection = (
    <section aria-labelledby={`${uid}-h-why`} className="flex flex-col gap-4">
      <div>
        <h3
          ref={headingRef}
          data-panel="why"
          id={`${uid}-h-why`}
          tabIndex={-1}
          className="text-sm font-medium text-foreground outline-none"
        >
          Tell us why
        </h3>
        <p className="mt-0.5 text-[12px] text-ink-3">
          It helps us fix sizes and listings. A fault means no return fee.
        </p>
      </div>
      {picked.map((item) => (
        <div
          key={item.id}
          className="rounded-3 border border-hairline bg-surface-1 p-3"
        >
          {reasonBlock(item, false)}
        </div>
      ))}
    </section>
  );

  const refundLines = (
    <dl className="flex flex-col gap-1.5 text-[12px]">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-ink-3">Items ({refund.count})</dt>
        <dd className="font-mono text-ink-2 tabular-nums">
          {money(refund.items)}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-ink-3">Return shipping</dt>
        <dd
          className={cn(
            "font-mono tabular-nums",
            refund.shipping ? "text-ink-2" : "text-success",
          )}
        >
          {refund.shipping ? `−${money(refund.shipping)}` : "Free"}
        </dd>
      </div>
      {refund.pickup ? (
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">Courier pickup</dt>
          <dd className="font-mono text-ink-2 tabular-nums">
            −{money(refund.pickup)}
          </dd>
        </div>
      ) : null}
      {refund.bonus ? (
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">Credit bonus</dt>
          <dd className="font-mono text-success tabular-nums">
            +{money(refund.bonus)}
          </dd>
        </div>
      ) : null}
    </dl>
  );

  const printButtonLabel = print === "qr" ? "Get QR code" : "Print label";
  const pendingLabel = "Creating…";

  const printButton = (wide: boolean) => (
    <button
      type="button"
      aria-busy={labelState === "pending" || undefined}
      aria-disabled={disabled || labelState === "pending" || undefined}
      onClick={(event) => create(event.currentTarget)}
      className={cn(
        "inline-grid h-9 items-center rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        wide && "w-full",
        RING,
      )}
    >
      {[printButtonLabel, pendingLabel].map((text) => {
        const on =
          labelState === "pending"
            ? text === pendingLabel
            : text === printButtonLabel;
        return (
          <span
            key={text}
            aria-hidden={!on || undefined}
            className={cn(
              "col-start-1 row-start-1 inline-flex items-center justify-center gap-2",
              !on && "invisible",
            )}
          >
            {text === pendingLabel ? (
              <Spinner spin={motionSafe} />
            ) : print === "qr" ? (
              <QrCode aria-hidden className="size-4 shrink-0" />
            ) : (
              <Printer aria-hidden className="size-4 shrink-0" />
            )}
            {text}
          </span>
        );
      })}
    </button>
  );

  const refundSection = (withButton: boolean) => (
    <section
      aria-labelledby={`${uid}-h-refund`}
      className="flex flex-col gap-4"
    >
      <div>
        <h3
          ref={headingRef}
          data-panel="refund"
          id={`${uid}-h-refund`}
          tabIndex={-1}
          className="text-sm font-medium text-foreground outline-none"
        >
          {paged ? "Refund and drop-off" : "How you'd like your refund"}
        </h3>
        <p className="mt-0.5 text-[12px] text-ink-3">
          Your refund starts when the parcel is scanned.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p id={`${uid}-h-method`} className="text-[12px] text-ink-2">
          Refund to
        </p>
        <ChoiceCards
          choices={methods.map((m) => ({
            id: m.id,
            label: m.label,
            detail:
              m.icon === "wallet" || m.bonus
                ? m.detail
                : `${order.payment} · ${m.detail}`,
            icon: m.icon === "wallet" || m.bonus ? Wallet : Undo2,
            badge: m.bonus ? `+${Math.round(m.bonus * 100)}%` : undefined,
          }))}
          value={selection.method}
          onChoose={setMethod}
          labelledBy={`${uid}-h-method`}
          layoutId={`${uid}-method`}
          motionSafe={motionSafe}
          disabled={disabled || printing}
        />
      </div>
      <div className="flex flex-col gap-2">
        <p id={`${uid}-h-drop`} className="text-[12px] text-ink-2">
          Send it by
        </p>
        <ChoiceCards
          choices={dropoffs.map((d) => ({
            id: d.id,
            label: d.label,
            detail: d.fee
              ? `${d.detail} · ${money(d.fee)}`
              : `${d.detail} · Free`,
            icon: d.icon === "truck" ? Truck : Store,
          }))}
          value={selection.dropoff}
          onChoose={setDropoff}
          labelledBy={`${uid}-h-drop`}
          layoutId={`${uid}-drop`}
          motionSafe={motionSafe}
          disabled={disabled || printing}
        />
      </div>
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        {refundLines}
        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
          <span className="text-[13px] font-medium text-foreground">
            Refund
          </span>
          <Roll
            text={money(refund.total)}
            motionSafe={motionSafe}
            className="font-mono text-xl font-semibold text-foreground"
          />
        </div>
        {withButton ? printButton(true) : null}
      </div>
    </section>
  );

  const printerSection = (
    <section aria-labelledby={`${uid}-h-label`} className="flex flex-col gap-4">
      <div className={cn(paged ? "" : "border-t border-hairline pt-4")}>
        <h3
          ref={headingRef}
          data-panel="label"
          id={`${uid}-h-label`}
          tabIndex={-1}
          className="text-sm font-medium text-foreground outline-none"
        >
          {print === "qr" ? "Your return code" : "Your return label"}
        </h3>
        <p className="mt-0.5 text-[12px] text-ink-3">
          {torn
            ? "Torn off and ready to go."
            : printed
              ? "Printed. Tear it off along the dotted line."
              : print === "qr"
                ? "No printer needed: the counter prints it for you."
                : "Printing now."}
        </p>
      </div>
      <ReturnPrinter
        key={printRun}
        kind={print}
        label={theLabel}
        order={order}
        count={refund.count}
        refundText={money(refund.total)}
        destination={destination}
        motionSafe={motionSafe}
        audio={audio}
        visitor={visitor}
        disabled={disabled}
        onPrinted={() => {
          setPrinted(true);
          say(
            print === "qr"
              ? "Code printed. Tear it off along the line."
              : "Label printed. Tear it off along the line.",
          );
        }}
        onTorn={() => {
          setTorn(true);
          onTear?.();
          say(print === "qr" ? "Code torn off." : "Label torn off.");
        }}
        onDownload={onDownload}
        onEmail={onEmail}
        onStartOver={startOver}
      />
    </section>
  );

  /* -------------------------------- layout ------------------------------- */

  const railLine = (i: number) => {
    if (i === 0)
      return picked.length
        ? `${picked.length} of ${items.filter(returnableOf).length} items`
        : "Nothing picked yet";
    if (i === 1)
      return picked.length === 0
        ? "Pick items first"
        : missing.length
          ? `${missing.length} still to choose`
          : "All reasons given";
    if (i === 2) return `${method?.label ?? "Refund"} · ${money(refund.total)}`;
    return printing
      ? `Drop by ${shortDay(theLabel.dropBy)}`
      : "Prints at the end";
  };

  const reachable = (i: number) => {
    if (printing) return false;
    if (i === 0) return true;
    if (i === 1) return picked.length > 0;
    if (i === 2) return picked.length > 0 && missing.length === 0;
    return false;
  };

  const rail = paged ? (
    <nav aria-label="Return steps" className="@min-[68rem]:row-span-2">
      <div className="flex flex-col gap-2 @min-[40rem]:hidden">
        <p className="text-[12px] text-ink-2">
          <span className="font-mono text-ink-3">{current + 1} of 4</span> ·{" "}
          {STEP_NAMES[current]}
        </p>
        <div aria-hidden className="grid grid-cols-4 gap-1">
          {STEP_NAMES.map((name, i) => (
            <span
              key={name}
              className="h-1 overflow-hidden rounded-full bg-surface-2"
            >
              <motion.span
                className="block h-full origin-left rounded-full bg-cobalt-bright"
                initial={false}
                animate={{ scaleX: i <= current ? 1 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            </span>
          ))}
        </div>
      </div>
      <ol className="hidden gap-1 @min-[40rem]:flex @min-[68rem]:flex-col">
        {STEP_NAMES.map((name, i) => {
          const done = i < current;
          const here = i === current;
          const can = reachable(i) && !here;
          return (
            <li
              key={name}
              className="relative min-w-0 flex-1 @min-[68rem]:flex-none"
            >
              {here ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? `${uid}-rail` : undefined}
                  transition={springs.snap}
                  className="absolute inset-0 rounded-2 bg-cobalt-wash"
                />
              ) : null}
              <button
                type="button"
                aria-current={here ? "step" : undefined}
                aria-disabled={!can || disabled || undefined}
                aria-label={`Step ${i + 1}, ${name}${done ? ", done" : here ? ", current" : ""}`}
                onClick={(event) => {
                  if (!can || disabled) return;
                  if (i > current && !check(i - 1)) return;
                  goTo(i, event.currentTarget);
                }}
                className={cn(
                  "relative flex w-full items-center gap-2 rounded-2 px-2 py-1.5 text-left",
                  can && !disabled
                    ? "cursor-pointer hover:bg-surface-2"
                    : "cursor-default",
                  RING_IN,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] transition-colors",
                    done || (i === 3 && torn)
                      ? "bg-cobalt-bright text-primary-foreground"
                      : here
                        ? "border border-cobalt-bright text-cobalt-bright"
                        : "border border-hairline-strong text-ink-3",
                  )}
                >
                  {done || (i === 3 && torn) ? (
                    <Check className="size-3" strokeWidth={2.4} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[12px]",
                      here ? "font-medium text-foreground" : "text-ink-2",
                    )}
                  >
                    {name}
                  </span>
                  <span className="hidden truncate text-[11px] text-ink-3 @min-[68rem]:block">
                    {railLine(i)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  ) : null;

  const summary = (
    <aside
      aria-labelledby={`${uid}-h-summary`}
      className={cn(
        "hidden flex-col gap-3 self-start rounded-3 border border-hairline bg-surface-1 p-3 @min-[40rem]:sticky @min-[40rem]:top-0 @min-[40rem]:flex",
        paged
          ? "@min-[40rem]:col-start-2 @min-[40rem]:row-span-2 @min-[40rem]:row-start-1 @min-[68rem]:col-start-3"
          : "@min-[40rem]:col-start-2",
      )}
    >
      <h3
        id={`${uid}-h-summary`}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        Your return
      </h3>
      {picked.length ? (
        <ul role="list" className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {picked.map((item) => {
              const line = selection.lines[item.id];
              return (
                <motion.li
                  key={item.id}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe ? springs.glide : { duration: durations.fast }
                  }
                  className="flex items-center gap-2"
                >
                  <Thumb item={item} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-foreground">
                      {item.name}
                      {line && line.quantity > 1 ? ` ×${line.quantity}` : ""}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-[11px]",
                        line?.reason ? "text-ink-3" : "text-warn",
                      )}
                    >
                      {reasonLabel(line?.reason) ?? "Reason needed"}
                    </span>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="text-[12px] text-ink-3">Nothing picked yet.</p>
      )}
      <dl className="flex flex-col gap-1 border-t border-hairline pt-2.5 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-3">To</dt>
          <dd className="truncate text-right text-ink-2">
            {method?.label ?? "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-3">By</dt>
          <dd className="truncate text-right text-ink-2">
            {dropoff?.label ?? "—"}
          </dd>
        </div>
      </dl>
      <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2.5">
        <span className="text-[12px] text-ink-2">Refund</span>
        <Roll
          text={money(refund.total)}
          motionSafe={motionSafe}
          className="font-mono text-base font-semibold text-foreground"
        />
      </div>
      <p className="text-[11px] text-ink-3">
        {printing
          ? `Drop off by ${dayText(theLabel.dropBy)}`
          : `Returns open until ${shortDay(windowEnd)}`}
      </p>
    </aside>
  );

  const panelVariants = {
    enter: (d: number) => ({
      opacity: 0,
      x: motionSafe ? distances.shift * d : 0,
    }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({
      opacity: 0,
      x: motionSafe ? -distances.shift * d : 0,
      transition: exitFor(durations.base),
    }),
  };

  const pagedPanel = (s: number) => {
    if (s === 0) return itemsSection("What's going back?");
    if (s === 1) return reasonsSection;
    if (s === 2) return refundSection(false);
    return printerSection;
  };

  const footer =
    paged && !printing ? (
      <div className="sticky bottom-0 z-20 -mx-3 mt-1 flex flex-col gap-2 border-t border-hairline bg-card px-3 pt-3 pb-3 @min-[40rem]:mx-0 @min-[40rem]:px-0">
        <AnimatePresence initial={false}>
          {problem ? (
            <motion.p
              key={problem}
              className="flex items-center gap-1.5 text-[12px] text-danger"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
              {problem}
            </motion.p>
          ) : null}
        </AnimatePresence>
        {labelState === "error" ? (
          <p role="alert" className="text-[12px] text-danger">
            The label could not be made. Try again.
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          {current > 0 ? (
            <button
              type="button"
              aria-disabled={disabled || labelState === "pending" || undefined}
              onClick={(event) => {
                if (labelState !== "pending")
                  goTo(current - 1, event.currentTarget);
              }}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1 rounded-2 px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                RING,
              )}
            >
              <ChevronLeft aria-hidden className="size-4 shrink-0" />
              Back
            </button>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3 @min-[40rem]:invisible">
            {refund.count ? (
              <>
                Refund{" "}
                <span className="font-mono text-foreground tabular-nums">
                  {money(refund.total)}
                </span>
              </>
            ) : (
              "Nothing picked yet"
            )}
          </span>
          {current === 2 ? (
            printButton(false)
          ) : (
            <button
              type="button"
              aria-disabled={disabled || undefined}
              onClick={(event) => next(event.currentTarget)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                RING,
              )}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    ) : null;

  const body = () => {
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className="flex flex-col gap-3 p-3 @min-[40rem]:p-4"
        >
          <p className="sr-only">Loading the order.</p>
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-3 border border-hairline bg-surface-1 p-3"
            >
              <span className="size-10 shrink-0 rounded-2 bg-surface-2" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span
                  className="h-3 rounded-1 bg-surface-2"
                  style={{ width: `${45 + ((i * 17) % 30)}%` }}
                />
                <span className="h-2.5 w-1/3 rounded-1 bg-surface-2" />
              </span>
            </div>
          ))}
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The order did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }

    if (!paged) {
      return (
        <div
          inert={disabled}
          className="grid gap-4 p-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]:p-4 @min-[68rem]:grid-cols-[minmax(0,1fr)_17rem]"
        >
          <motion.div
            className="flex min-w-0 flex-col gap-6"
            style={{ x: shake }}
          >
            {itemsSection("1 · What's going back?")}
            {refundSection(!printing)}
            {problem ? (
              <p className="-mt-3 flex items-center gap-1.5 text-[12px] text-danger">
                <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                {problem}
              </p>
            ) : null}
            {labelState === "error" ? (
              <p role="alert" className="-mt-3 text-[12px] text-danger">
                The label could not be made. Try again.
              </p>
            ) : null}
            {printing ? printerSection : null}
          </motion.div>
          {summary}
        </div>
      );
    }

    return (
      <div
        inert={disabled}
        className="grid gap-4 p-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]:p-4 @min-[68rem]:grid-cols-[11.5rem_minmax(0,1fr)_16rem]"
      >
        {rail}
        <div className="flex min-w-0 flex-col @min-[40rem]:col-start-1 @min-[40rem]:row-start-2 @min-[68rem]:col-start-2 @min-[68rem]:row-start-1">
          <Measured motionSafe={motionSafe} style={{ x: shake }}>
            <AnimatePresence initial={false} mode="popLayout" custom={view.dir}>
              <motion.div
                key={current}
                custom={view.dir}
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={
                  motionSafe
                    ? {
                        x: springs.snap,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
                className="pb-3"
              >
                {pagedPanel(current)}
              </motion.div>
            </AnimatePresence>
          </Measured>
          {footer}
        </div>
        {summary}
      </div>
    );
  };

  return (
    // layoutScroll: the root scrolls, and layout animations inside it must
    // measure against its scroll position.
    <motion.div
      layoutScroll
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative max-h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            Order {order.id} · delivered {shortDay(order.delivered)} ·{" "}
            {order.merchant}
          </p>
        </div>
        {status === "ready" ? (
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2 font-mono text-[11px] tabular-nums",
              daysLeft <= 5 ? "text-warn" : "text-ink-2",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                daysLeft <= 5 ? "bg-warn" : "bg-success",
              )}
            />
            {daysLeft === 0
              ? "Window closes today"
              : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}
          </span>
        ) : null}
      </header>
      {body()}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </motion.div>
  );
}
