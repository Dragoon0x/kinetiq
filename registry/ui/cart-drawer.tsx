"use client";

import * as React from "react";

import {
  ArrowRight,
  Bookmark,
  Check,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  ShoppingBag,
  Trash2,
  TriangleAlert,
  Truck,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type CartArtKind =
  "mug" | "cone" | "beans" | "cloth" | "carafe" | "tumbler";

/** A drawn thumbnail: what the thing is and its colour (any CSS colour, a pigment). */
export type CartArt = { kind: CartArtKind; tint: string };

export type CartLine = {
  id: string;
  name: string;
  /** "Ember · 12 oz" */
  variant?: string;
  /** One unit's price in the currency's major unit (9.5 is €9.50). */
  price: number;
  /** One unit's earlier price, struck through when higher. */
  compareAt?: number;
  quantity: number;
  /** The most of this line one order takes. @default 10 */
  max?: number;
  /** A 56px square thumbnail. Defaults to the drawn `art`. */
  image?: React.ReactNode;
  art?: CartArt;
};

export type CartUpsell = Omit<CartLine, "quantity">;

export type CartSwipe = "reveal" | "full" | "off";
export type CartTotals = "roll" | "count" | "fade";
export type CartStatus = "ready" | "loading" | "error";

export type CartDrawerProps = {
  /** Controlled lines in the bag. */
  items?: CartLine[];
  /** Initial lines when uncontrolled. @default defaultCartItems */
  defaultItems?: CartLine[];
  /** Fires from the stepper, swipe, button or upsell that changed the bag, with every line. */
  onItemsChange?: (items: CartLine[]) => void;
  /** Controlled: the drawer is open. */
  open?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the close button, Escape, the scrim or the pull that closed it. */
  onOpenChange?: (open: boolean) => void;
  /** Things that pair with the bag, offered in a row under the lines. @default defaultCartUpsells */
  upsells?: CartUpsell[];
  /** An upsell was added; it is already at the top of the lines. */
  onUpsellAdd?: (upsell: CartUpsell) => void;
  /** A line left the bag (swiped, removed, or stepped below one). */
  onRemove?: (line: CartLine) => void;
  /** Undo put a removed line back. */
  onUndo?: (line: CartLine) => void;
  /** Save for later was chosen on a line; it has left the bag. */
  onSaveForLater?: (line: CartLine) => void;
  /** Checkout was pressed. Return a promise to hold the button pending; a rejection's message is shown. */
  onCheckout?: (items: CartLine[], total: number) => void | Promise<void>;
  /** The subtotal that earns free delivery, in the currency's major unit. @default 60 */
  threshold?: number;
  /** Delivery under the threshold. @default 4.95 */
  shipping?: number;
  /** How a line is pulled away: open a tray of actions, pull right through to remove, or not at all. @default "reveal" */
  swipe?: CartSwipe;
  /** How changing figures move: digits that roll, figures that count, or a cross-fade. @default "roll" */
  totals?: CartTotals;
  /** Formats an amount for display. @default euros */
  format?: (amount: number) => string;
  /** The drawer's heading and accessible name. @default "Your bag" */
  title?: string;
  /** The checkout button's words. @default "Checkout" */
  checkoutLabel?: string;
  /** The empty bag's heading. @default "Your bag is empty" */
  emptyTitle?: string;
  /** The empty bag's line. */
  emptyBody?: string;
  /** Continue shopping was pressed (it also closes the drawer). */
  onContinue?: () => void;
  /** Loading draws placeholder lines; error offers Retry. @default "ready" */
  status?: CartStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** The page the drawer opens over. It is inert while the drawer is open. */
  children?: React.ReactNode;
  /** The dialog's accessible name when it should differ from the title. */
  label?: string;
  /** Play the steppers, the pulls and the drawer. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the bag but takes no input. */
  disabled?: boolean;
  /** Classes for the box the drawer lives in; give it a height. */
  className?: string;
};

/* -------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r6 = (v: number) => Number(v.toFixed(6));
const cents = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const EURO = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});
const euro = (amount: number) => EURO.format(cents(amount));

const isPromise = <T,>(v: unknown): v is Promise<T> =>
  !!v && typeof (v as { then?: unknown }).then === "function";

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : fallback;

const whole = (n: number) => String(Math.round(n));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** A small seeded generator: the same flecks on every run. */
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

/** Whether this moment is inside something the visitor just did. */
const visitorActive = () =>
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { userActivation?: { isActive: boolean } })
    .userActivation?.isActive === true;

/* --------------------------------- art ---------------------------------- */

const EMBER = "oklch(0.62 0.13 42)";
const MOSS = "oklch(0.62 0.07 138)";
const SLATE = "oklch(0.5 0.035 248)";
const LINEN = "oklch(0.86 0.03 88)";
const KRAFT = "oklch(0.74 0.06 70)";
const KRAFT_DARK = "oklch(0.62 0.06 65)";
const CLAY = "oklch(0.8 0.035 70)";
const COFFEE = "oklch(0.33 0.045 52)";

/** Small drawn thumbnails for the default lines: no files, no network. */
function Art({ art }: { art: CartArt }) {
  const t = art.tint;
  let body: React.ReactNode;
  switch (art.kind) {
    case "mug":
      body = (
        <>
          <ellipse cx={24} cy={41} rx={14} ry={2} fill="black" opacity={0.12} />
          <path
            d="M33 18c7 0 7 13 0 13"
            fill="none"
            stroke={t}
            strokeWidth={3.4}
            strokeLinecap="round"
          />
          <rect x={11} y={12} width={22} height={28} rx={3} fill={t} />
          <rect x={11} y={34} width={22} height={6} rx={2.5} fill={CLAY} />
          <rect
            x={14}
            y={15}
            width={3}
            height={18}
            fill="white"
            opacity={0.25}
          />
          <rect
            x={27}
            y={12}
            width={6}
            height={28}
            fill="black"
            opacity={0.1}
          />
          <ellipse cx={22} cy={12} rx={11} ry={2.4} fill={t} />
          <ellipse
            cx={22}
            cy={12.4}
            rx={8.6}
            ry={1.6}
            fill="black"
            opacity={0.3}
          />
        </>
      );
      break;
    case "cone":
      body = (
        <>
          <ellipse cx={24} cy={40} rx={13} ry={2} fill="black" opacity={0.12} />
          <rect x={14} y={33} width={20} height={4} rx={2} fill={t} />
          <path d="M9 13h30l-9 20H18z" fill={t} />
          <path
            d="M15 16l5 15M24 16v15M33 16l-5 15"
            stroke="black"
            strokeOpacity={0.14}
            strokeWidth={1.2}
          />
          <path d="M9 13h6l5 20h-2z" fill="white" opacity={0.18} />
          <ellipse cx={24} cy={13} rx={15} ry={2.6} fill={t} />
          <ellipse
            cx={24}
            cy={13.3}
            rx={12.4}
            ry={1.7}
            fill="black"
            opacity={0.3}
          />
        </>
      );
      break;
    case "beans":
      body = (
        <>
          <ellipse cx={24} cy={41} rx={14} ry={2} fill="black" opacity={0.12} />
          <path d="M13 13h22l2 27H11z" fill={KRAFT} />
          <rect x={13} y={9} width={22} height={5} rx={1} fill={KRAFT_DARK} />
          <rect x={15} y={21} width={18} height={12} rx={1.5} fill={t} />
          <ellipse
            cx={24}
            cy={27}
            rx={3.4}
            ry={4.6}
            fill={COFFEE}
            transform="rotate(-24 24 27)"
          />
          <path
            d="M22.6 23.6c1.8 2 1.2 5-0.6 7"
            stroke={KRAFT}
            strokeWidth={0.9}
            fill="none"
          />
          <path d="M31 13h4l2 27h-4z" fill="black" opacity={0.08} />
        </>
      );
      break;
    case "cloth":
      body = (
        <>
          <ellipse cx={24} cy={39} rx={16} ry={2} fill="black" opacity={0.1} />
          <rect x={8} y={26} width={32} height={11} rx={2} fill={t} />
          <rect x={10} y={17} width={28} height={10} rx={2} fill={t} />
          <rect
            x={10}
            y={17}
            width={28}
            height={10}
            rx={2}
            fill="white"
            opacity={0.18}
          />
          <path
            d="M12 21.5h24M10 31.5h28"
            stroke="black"
            strokeOpacity={0.18}
            strokeWidth={0.8}
            strokeDasharray="1.6 1.6"
          />
        </>
      );
      break;
    case "carafe":
      body = (
        <>
          <ellipse cx={24} cy={42} rx={13} ry={2} fill="black" opacity={0.12} />
          <path
            d="M20 7h8v9c6 3 9 8 9 14 0 6-5 10-13 10s-13-4-13-10c0-6 3-11 9-14z"
            className="fill-ink-3/15 stroke-ink-3/50"
            strokeWidth={1}
          />
          <path
            d="M12.2 28h23.6c.2.6.2 1.3.2 2 0 6-5 10-12 10s-12-4-12-10c0-.7 0-1.4.2-2z"
            fill={COFFEE}
            opacity={0.85}
          />
          <rect x={19} y={13} width={10} height={4} rx={1} fill={t} />
          <path
            d="M16 22c-2 2-3 5-3 8"
            stroke="white"
            strokeOpacity={0.4}
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
      break;
    default:
      body = (
        <>
          <ellipse cx={24} cy={41} rx={12} ry={2} fill="black" opacity={0.12} />
          <path d="M14 11h20l-2.5 29h-15z" fill={t} />
          <path d="M14 11h4l1.5 29h-2z" fill="white" opacity={0.2} />
          <path d="M30 11h4l-2.5 29h-3z" fill="black" opacity={0.1} />
          <ellipse cx={24} cy={11} rx={10} ry={1.8} fill={t} />
          <ellipse
            cx={24}
            cy={11.3}
            rx={8}
            ry={1.2}
            fill="black"
            opacity={0.3}
          />
        </>
      );
  }
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="block size-full">
      {body}
    </svg>
  );
}

function Thumb({ item, size = 56 }: { item: CartUpsell; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative block shrink-0 overflow-clip rounded-2 bg-surface-2"
      style={{ width: size, height: size }}
    >
      {item.image ?? (item.art ? <Art art={item.art} /> : null)}
    </span>
  );
}

/* -------------------------------- defaults ------------------------------- */

export const defaultCartItems: CartLine[] = [
  {
    id: "field-mug-ember-12",
    name: "Field Mug",
    variant: "Ember · 12 oz",
    price: 32,
    quantity: 1,
    max: 6,
    art: { kind: "mug", tint: EMBER },
  },
  {
    id: "house-beans",
    name: "Coldbrook House Beans",
    variant: "250 g · whole bean",
    price: 9.5,
    compareAt: 10.5,
    quantity: 2,
    art: { kind: "beans", tint: SLATE },
  },
];

export const defaultCartUpsells: CartUpsell[] = [
  {
    id: "linen-napkins",
    name: "Linen Napkins",
    variant: "Set of two · oat",
    price: 14,
    art: { kind: "cloth", tint: LINEN },
  },
  {
    id: "pour-over-cone",
    name: "Pour-over Cone",
    variant: "Moss",
    price: 24,
    compareAt: 28,
    art: { kind: "cone", tint: MOSS },
  },
  {
    id: "glass-carafe",
    name: "Glass Carafe",
    variant: "600 ml",
    price: 38,
    art: { kind: "carafe", tint: EMBER },
  },
  {
    id: "field-tumbler",
    name: "Field Tumbler",
    variant: "Slate · 8 oz",
    price: 18,
    art: { kind: "tumbler", tint: SLATE },
  },
];

/* -------------------------------- figures -------------------------------- */

const DIGITS = Array.from({ length: 10 }, (_, n) => n);

/** One digit as a column of 0–9 that rolls to its value on snap. */
function Digit({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span
      className="relative inline-block overflow-clip"
      style={{ height: "1.2em", lineHeight: "1.2em" }}
    >
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-value * 10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((n) => (
          <span
            key={n}
            className="block"
            style={{ height: "1.2em", lineHeight: "1.2em" }}
          >
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * A figure that changes the way `totals` says: digit columns that roll on
 * snap (keyed from the right, so the units stay the units), a count through
 * the cents on a tween, or a cross-fade with a nudge. The words are always
 * the new figure, for assistive technology.
 */
function Figure({
  amount,
  money,
  mode,
  motionSafe,
  className,
}: {
  amount: number;
  money: (amount: number) => string;
  mode: CartTotals;
  motionSafe: boolean;
  className?: string;
}) {
  const text = money(amount);
  return (
    <span
      className={cn("inline-grid justify-items-end tabular-nums", className)}
    >
      <span className="sr-only">{text}</span>
      {mode === "roll" ? (
        <span
          aria-hidden
          className="col-start-1 row-start-1 inline-flex whitespace-pre"
          style={{ lineHeight: "1.2em" }}
        >
          {[...text].map((ch, i, all) => {
            const fromRight = all.length - i;
            return ch >= "0" && ch <= "9" ? (
              <Digit
                key={`d${fromRight}`}
                value={Number(ch)}
                motionSafe={motionSafe}
              />
            ) : (
              <span key={`c${fromRight}${ch}`} className="inline-block">
                {ch}
              </span>
            );
          })}
        </span>
      ) : mode === "count" ? (
        <Count amount={amount} money={money} motionSafe={motionSafe} />
      ) : (
        <AnimatePresence initial={false}>
          <motion.span
            key={text}
            aria-hidden
            className="col-start-1 row-start-1 whitespace-pre"
            style={{ lineHeight: "1.2em" }}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: motionSafe ? -distances.nudge : 0,
              transition: exitFor(durations.fast),
            }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  );
}

function Count({
  amount,
  money,
  motionSafe,
}: {
  amount: number;
  money: (amount: number) => string;
  motionSafe: boolean;
}) {
  const value = useMotionValue(amount);
  React.useEffect(() => {
    if (!motionSafe) {
      value.jump(amount);
      return;
    }
    const c = animate(value, amount, { duration: 0.4, ease: easings.move });
    return () => c.stop();
  }, [amount, motionSafe, value]);
  const text = useTransform(value, (v) => money(cents(v)));
  return (
    <motion.span
      aria-hidden
      className="col-start-1 row-start-1 whitespace-pre"
      style={{ lineHeight: "1.2em" }}
    >
      {text}
    </motion.span>
  );
}

/* ------------------------------ free delivery ---------------------------- */

const FLECKS = (() => {
  const rand = seeded(29);
  const tones = ["bg-success", "bg-cobalt-bright", "bg-warn", "bg-signal"];
  return Array.from({ length: 12 }, (_, i) => {
    // Out of the bar's end, up and back over the bar, never past the panel.
    const a = Math.PI * (0.55 + rand() * 0.9);
    const d = 22 + rand() * 46;
    return {
      x: r2(Math.cos(a) * d),
      y: r2(-Math.abs(Math.sin(a)) * d * 0.55 - 4),
      r: Math.round(rand() * 360),
      size: rand() < 0.5 ? 4 : 3,
      tone: tones[i % tones.length] ?? "bg-success",
      delay: r2(rand() * 0.06),
    };
  });
})();

function FreeDelivery({
  sub,
  threshold,
  money,
  party,
  motionSafe,
}: {
  sub: number;
  threshold: number;
  money: (amount: number) => string;
  party: number;
  motionSafe: boolean;
}) {
  const ratio = threshold > 0 ? clamp(sub / threshold, 0, 1) : 1;
  const free = sub >= threshold;
  const away = cents(Math.max(0, threshold - sub));
  const fill = useMotionValue(ratio);
  React.useEffect(() => {
    const c = animate(
      fill,
      ratio,
      motionSafe ? springs.glide : { duration: durations.fast },
    );
    return () => c.stop();
  }, [ratio, motionSafe, fill]);
  const scaleX = useTransform(fill, (f) => r6(f));
  const vanLeft = useTransform(
    fill,
    (f) => `clamp(10px, ${r2(f * 100)}%, calc(100% - 10px))`,
  );
  // Each celebration sprays once and is cleared once its flecks have faded.
  const [spent, setSpent] = React.useState(party);
  React.useEffect(() => {
    if (party === 0) return;
    const t = window.setTimeout(() => setSpent(party), 700);
    return () => window.clearTimeout(t);
  }, [party]);
  const flecks = motionSafe && party > 0 && spent !== party ? party : 0;
  const words = free
    ? "Free delivery unlocked"
    : `${money(away)} away from free delivery`;

  return (
    <div className="px-4 pb-3">
      <div className="grid h-5 items-center text-[12px]">
        <AnimatePresence initial={false}>
          <motion.p
            key={free ? "free" : "away"}
            className={cn(
              "col-start-1 row-start-1 flex items-center gap-1.5 truncate",
              free ? "font-medium text-success" : "text-ink-2",
            )}
            initial={
              free && motionSafe
                ? { opacity: 0, scale: 0.9, y: distances.nudge }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              free && motionSafe
                ? {
                    scale: springs.recoil,
                    y: springs.recoil,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.base, ease: easings.enter }
            }
            style={{ originX: 0 }}
          >
            {free ? <Check aria-hidden className="size-3.5 shrink-0" /> : null}
            {free ? (
              words
            ) : (
              <span className="truncate">
                <span className="font-medium text-foreground tabular-nums">
                  {money(away)}
                </span>{" "}
                away from free delivery
              </span>
            )}
          </motion.p>
        </AnimatePresence>
      </div>
      <div
        role="progressbar"
        aria-label="Free delivery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuetext={words}
        className="relative mt-2 h-1.5 rounded-full bg-surface-2"
      >
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-0 origin-left rounded-full transition-colors duration-[400ms]",
            free ? "bg-success" : "bg-cobalt-bright",
          )}
          style={{ scaleX }}
        />
        <motion.span
          aria-hidden
          className={cn(
            "absolute top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card transition-colors duration-[400ms]",
            free
              ? "border-success text-success"
              : "border-cobalt-bright/60 text-cobalt-bright",
          )}
          style={{ left: vanLeft }}
        >
          <Truck className="size-3" />
        </motion.span>
        {flecks > 0 ? (
          <span
            key={flecks}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5"
          >
            {FLECKS.map((f, i) => (
              <motion.span
                key={i}
                className={cn("absolute rounded-full", f.tone)}
                style={{ width: f.size, height: f.size }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ x: f.x, y: f.y, opacity: 0, rotate: f.r }}
                transition={{
                  duration: 0.52,
                  delay: f.delay,
                  ease: easings.enter,
                  opacity: {
                    duration: 0.52,
                    delay: f.delay + 0.1,
                    ease: "easeIn",
                  },
                }}
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- lines -------------------------------- */

const TRAY = 144;
const ACTION = 72;

type LineRowProps = {
  line: CartLine;
  money: (amount: number) => string;
  swipe: CartSwipe;
  totals: CartTotals;
  motionSafe: boolean;
  disabled: boolean;
  trayOpen: boolean;
  onTray: (open: boolean) => void;
  onStep: (delta: 1 | -1, el: Element | null) => void;
  onRemove: (el: Element | null) => void;
  onSave: (el: Element | null) => void;
  onArm: (armed: boolean, el: Element | null) => void;
  bind: (node: HTMLElement | null) => void;
};

/**
 * One line. Its face slides over a tray of actions: 1:1 under the finger,
 * rubber-banded to the right and past the tray, and released onto the tray
 * or home on snap with the throw's velocity. In `full` mode a pull past 60%
 * of the row arms Remove, and letting go sends the face off on glide.
 */
function LineRow({
  line,
  money,
  swipe,
  totals,
  motionSafe,
  disabled,
  trayOpen,
  onTray,
  onStep,
  onRemove,
  onSave,
  onArm,
  bind,
}: LineRowProps) {
  const x = useMotionValue(0);
  const faceRef = React.useRef<HTMLDivElement | null>(null);
  const from = React.useRef(0);
  const width = React.useRef(320);
  const armedRef = React.useRef(false);
  const removing = React.useRef(false);
  const [dragging, setDragging] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const q = Math.max(0, Math.round(line.quantity));
  const max = line.max ?? 10;
  const swipes = swipe !== "off";

  // The face follows the tray's word: another line opening closes this one,
  // and a release rests where its tray says. A re-run carries it on to rest.
  React.useEffect(() => {
    if (dragging || removing.current) return;
    const to = trayOpen && swipes ? -TRAY : 0;
    if (Math.abs(x.get() - to) < 0.5) {
      x.jump(to);
      return;
    }
    if (!motionSafe) {
      x.jump(to);
      return;
    }
    const c = animate(x, to, springs.snap);
    return () => c.stop();
  }, [trayOpen, dragging, swipes, motionSafe, x]);

  const arm = (on: boolean) => {
    if (armedRef.current === on) return;
    armedRef.current = on;
    setArmed(on);
    onArm(on, faceRef.current);
  };

  const finish = (velocity: number) => {
    // Latched: nothing that happens to the row on its way out can undo it.
    removing.current = true;
    if (!motionSafe) {
      onRemove(faceRef.current);
      return;
    }
    void animate(x, -width.current - 24, {
      ...springs.glide,
      velocity: Math.min(velocity, -600),
    }).then(() => onRemove(faceRef.current));
  };

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: disabled || !swipes,
    onStart: () => {
      x.stop();
      from.current = x.get();
      width.current = Math.max(160, faceRef.current?.offsetWidth ?? 320);
      setDragging(true);
    },
    onMove: ({ offset }) => {
      if (removing.current) return;
      const w = width.current;
      let v = from.current + offset.x;
      if (v > 0) v = rubberband(v, w);
      else if (swipe === "reveal" && v < -TRAY) {
        v = -TRAY + rubberband(v + TRAY, w);
      } else if (v < -w) v = -w + rubberband(v + w, w);
      x.set(r2(v));
      if (swipe === "full") arm(v < -w * 0.6);
    },
    onEnd: ({ velocity }) => {
      if (removing.current) return;
      const w = width.current;
      const land = project(x.get(), velocity.x, 0.99);
      if (swipe === "full" && (armedRef.current || land < -w * 0.85)) {
        finish(velocity.x);
        return;
      }
      arm(false);
      setDragging(false);
      onTray(land < -TRAY / 2);
    },
    onCancel: () => {
      if (removing.current) return;
      arm(false);
      setDragging(false);
    },
    onTap: () => {
      if (trayOpen) onTray(false);
    },
  });

  const removeW = useTransform(x, (v) =>
    r2(Math.max(ACTION, -v - (armed ? 0 : ACTION))),
  );
  const total = cents(line.price * q);
  const was =
    line.compareAt !== undefined && line.compareAt > line.price
      ? cents(line.compareAt * q)
      : null;

  return (
    <div ref={bind} className="relative overflow-clip">
      {swipes ? (
        <div
          aria-hidden={!trayOpen || undefined}
          inert={!trayOpen || undefined}
          className="absolute inset-y-0 right-0 flex"
        >
          <motion.button
            type="button"
            onClick={(event) => onSave(event.currentTarget)}
            className={cn(
              "flex h-full flex-col items-center justify-center gap-1 overflow-clip bg-surface-2 text-[11px] text-ink-2",
              FOCUS_IN,
            )}
            initial={false}
            animate={{ width: armed ? 0 : ACTION, opacity: armed ? 0 : 1 }}
            transition={
              motionSafe
                ? { width: springs.snap, opacity: { duration: durations.fast } }
                : { duration: 0 }
            }
          >
            <Bookmark aria-hidden className="size-4 shrink-0" />
            Save
          </motion.button>
          <motion.button
            type="button"
            onClick={(event) => onRemove(event.currentTarget)}
            className={cn(
              "flex h-full flex-col justify-center gap-1 overflow-clip text-[11px] font-medium text-white transition-colors",
              armed
                ? "items-start bg-[oklch(from_var(--danger)_0.52_c_h)] pl-6"
                : "items-center bg-[oklch(from_var(--danger)_0.6_c_h)]",
              FOCUS_IN,
            )}
            style={{ width: removeW }}
          >
            <motion.span
              className="flex flex-col items-center gap-1"
              initial={false}
              animate={{ scale: armed && motionSafe ? 1.15 : 1 }}
              transition={springs.snap}
            >
              <Trash2 aria-hidden className="size-4 shrink-0" />
              Remove
            </motion.span>
          </motion.button>
        </div>
      ) : null}

      <motion.div
        ref={faceRef}
        {...drag}
        style={{ x }}
        className={cn(
          "relative flex gap-3 bg-card px-4 py-3",
          swipes && "touch-pan-y select-none",
          dragging && "cursor-grabbing",
        )}
      >
        <Thumb item={line} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-[13px] leading-5 font-medium text-foreground"
                title={line.name}
              >
                {line.name}
              </p>
              <p className="truncate text-[12px] leading-4 text-ink-3">
                {line.variant}
                {line.variant && q > 1 ? " · " : ""}
                {q > 1 ? `${money(line.price)} each` : ""}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Remove ${line.name}`}
              disabled={disabled}
              onClick={(event) => onRemove(event.currentTarget)}
              className={cn(
                "-mt-1 -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-danger",
                FOCUS,
              )}
            >
              <Trash2 aria-hidden className="size-3.5" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div
              role="group"
              aria-label={`${line.name}, quantity`}
              className="flex h-8 shrink-0 items-center rounded-full border border-hairline"
            >
              <button
                type="button"
                aria-label={
                  q === 1 ? "One fewer, takes it out of the bag" : "One fewer"
                }
                disabled={disabled}
                onClick={(event) => onStep(-1, event.currentTarget)}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                <Minus aria-hidden className="size-3.5" />
              </button>
              <span className="w-6 text-center font-mono text-[12px] text-foreground">
                <Figure
                  amount={q}
                  money={whole}
                  mode={totals}
                  motionSafe={motionSafe}
                />
              </span>
              <button
                type="button"
                aria-label={
                  q >= max ? `One more, ${max} is the most` : "One more"
                }
                aria-disabled={q >= max || undefined}
                disabled={disabled}
                onClick={(event) => {
                  if (q < max) onStep(1, event.currentTarget);
                }}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
                  FOCUS_IN,
                )}
              >
                <Plus aria-hidden className="size-3.5" />
              </button>
            </div>
            <span className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
              {was !== null ? (
                <span className="truncate text-[11px] text-ink-3 tabular-nums line-through">
                  <span className="sr-only">was </span>
                  {money(was)}
                </span>
              ) : null}
              <Figure
                amount={total}
                money={money}
                mode={totals}
                motionSafe={motionSafe}
                className="font-medium text-foreground"
              />
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* --------------------------------- drawer -------------------------------- */

type Removed = { line: CartLine; index: number; key: number; saved: boolean };

const UNDO_MS = 6000;

type DrawerApi = {
  slideTo: (open: boolean, velocity?: number) => void;
};

function totalsOf(lines: CartLine[], threshold: number, shipping: number) {
  let sub = 0;
  let save = 0;
  let count = 0;
  for (const l of lines) {
    const q = Math.max(0, Math.round(l.quantity));
    sub += l.price * q;
    if (l.compareAt !== undefined && l.compareAt > l.price) {
      save += (l.compareAt - l.price) * q;
    }
    count += q;
  }
  sub = cents(sub);
  save = cents(save);
  const free = lines.length > 0 && sub >= threshold;
  const delivery = lines.length === 0 || free ? 0 : cents(shipping);
  return {
    sub,
    save,
    count,
    free,
    delivery,
    total: cents(sub + delivery),
    away: cents(Math.max(0, threshold - sub)),
  };
}

/**
 * A bag that slides over the page it belongs to. The panel arrives from the
 * right edge on glide over a fading scrim, with the page behind it inert,
 * and can be pulled shut by its header — 1:1, rubber-banded to the left, a
 * release past 40% or a flick closes it on glide with the throw's velocity.
 *
 * Every line has a stepper whose count rolls and a total that moves the way
 * `totals` says; its face slides over a tray of actions (`swipe`): Save and
 * Remove, or in `full` a pull right through it that removes the line. A
 * removed line slides away, its height closes on glide, and Undo keeps it for
 * six seconds. A bar fills toward free delivery on glide with a van on its
 * leading edge; when the visitor carries the subtotal over `threshold`, the
 * bar turns success, flecks spray from its end and the news lands on recoil.
 * An upsell row adds to the top of the bag.
 *
 * The panel is a dialog over its own box: focus moves in when it is opened
 * and back to whatever opened it when it closes, Escape closes it (or a tray
 * first), and every swipe has a button that does the same thing. Under
 * reduced motion the panel fades in place, lines appear and leave on opacity,
 * swipes still follow the finger but release without a spring, no flecks fly
 * — and every change still shows and is announced.
 */
export function CartDrawer({
  items,
  defaultItems,
  onItemsChange,
  open,
  defaultOpen = false,
  onOpenChange,
  upsells = defaultCartUpsells,
  onUpsellAdd,
  onRemove,
  onUndo,
  onSaveForLater,
  onCheckout,
  threshold = 60,
  shipping = 4.95,
  swipe = "reveal",
  totals = "roll",
  format,
  title = "Your bag",
  checkoutLabel = "Checkout",
  emptyTitle = "Your bag is empty",
  emptyBody = "Start with something you'll reach for every morning.",
  onContinue,
  status = "ready",
  onRetry,
  children,
  label,
  sound = false,
  disabled = false,
  className,
}: CartDrawerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const money = format ?? euro;

  const [ownItems, setOwnItems] = React.useState<CartLine[]>(
    () => defaultItems ?? defaultCartItems,
  );
  const lines = items ?? ownItems;
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;

  const t = totalsOf(lines, threshold, shipping);

  const [openRow, setOpenRow] = React.useState<string | null>(null);
  const [undo, setUndo] = React.useState<Removed | null>(null);
  const [restored, setRestored] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<"idle" | "pending">("idle");
  const [failure, setFailure] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [visible, setVisible] = React.useState(isOpen);
  if (isOpen && !visible) setVisible(true);

  /* --------------------- free delivery: the celebration -------------------- */

  // Only a change the visitor made celebrates: the handler arms it, and the
  // render that shows the change spends it.
  const [armedParty, setArmedParty] = React.useState(false);
  const [seenFree, setSeenFree] = React.useState(t.free);
  const [party, setParty] = React.useState(0);
  if (seenFree !== t.free) {
    setSeenFree(t.free);
    if (t.free && armedParty) setParty((p) => p + 1);
  }
  if (armedParty) setArmedParty(false);

  /* ----------------------------- what is said ----------------------------- */

  const sig = lines.map((l) => `${l.id}×${l.quantity}`).join("|");
  const [seen, setSeen] = React.useState({ sig, lines, free: t.free });
  if (seen.sig !== sig) {
    const before = new Map(seen.lines.map((l) => [l.id, l]));
    const now = new Map(lines.map((l) => [l.id, l]));
    const parts: string[] = [];
    for (const l of seen.lines) {
      if (now.has(l.id)) continue;
      parts.push(
        undo && undo.line.id === l.id
          ? `${l.name} ${undo.saved ? "saved for later" : "removed"}. Undo is available.`
          : `${l.name} removed.`,
      );
    }
    for (const l of lines) {
      const was = before.get(l.id);
      if (!was)
        parts.push(`${l.name} ${restored === l.id ? "is back" : "added"}.`);
      else if (was.quantity !== l.quantity) {
        parts.push(`${l.name}, ${l.quantity}.`);
      }
    }
    if (seen.free !== t.free) {
      parts.push(
        t.free
          ? "Free delivery unlocked."
          : `${money(t.away)} away from free delivery.`,
      );
    }
    if (lines.length > 0) parts.push(`Total ${money(t.total)}.`);
    setSeen({ sig, lines, free: t.free });
    setSaid((s) => ({ n: s.n + 1, text: parts.join(" ") }));
  }
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* -------------------------------- refs -------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const rows = React.useRef(new Map<string, HTMLElement>());
  const focusRow = React.useRef<string | null>(null);
  const focusUndo = React.useRef(false);
  const target = React.useRef(isOpen);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<DrawerApi | null>(null);
  const alive = React.useRef(true);
  const [check, setCheck] = React.useState(0);
  const [closeNode, setCloseNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [undoNode, setUndoNode] = React.useState<HTMLButtonElement | null>(
    null,
  );

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const panOf = (el: Element | null | undefined) => {
    const r = el?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };

  /* -------------------------------- panel -------------------------------- */

  // `slide` is the panel's travel as a share of its width (0 open, 1 away);
  // `veil` its opacity, which is how it comes and goes under reduced motion.
  const slide = useMotionValue(isOpen ? 0 : 1);
  const veil = useMotionValue(isOpen ? 1 : 0);
  const [pulling, setPulling] = React.useState(false);
  const pullFrom = React.useRef(0);

  const slideTo = (to: boolean, velocity = 0) => {
    const done = () => {
      if (!target.current) setVisible(false);
    };
    if (!motionSafe) {
      anims.current.get("slide")?.stop();
      slide.jump(0);
      const c = animate(veil, to ? 1 : 0, {
        duration: durations.fast,
        ease: to ? easings.enter : easings.exit,
      });
      run("veil", c);
      if (!to) void c.then(done);
      return;
    }
    veil.jump(1);
    // Arrivals and thrown closes ride glide with the hand's velocity; a
    // close from a button leaves on the exit ease, never a spring.
    const c = animate(
      slide,
      to ? 0 : 1,
      to || velocity !== 0
        ? { ...springs.glide, velocity }
        : exitFor(durations.slow),
    );
    run("slide", c);
    if (!to) void c.then(done);
  };

  React.useEffect(() => {
    api.current = { slideTo };
  });

  React.useEffect(() => {
    if (target.current === isOpen) return;
    target.current = isOpen;
    api.current?.slideTo(isOpen);
  }, [isOpen, check]);

  const setOpen = (next: boolean, velocity = 0, el?: Element | null) => {
    if (next === isOpen) {
      api.current?.slideTo(next, velocity);
      return;
    }
    if (!next && panelRef.current?.contains(document.activeElement)) {
      // Focus goes home before the panel stops answering.
      (returnTo.current?.isConnected
        ? returnTo.current
        : rootRef.current
      )?.focus({ preventScroll: true });
    }
    target.current = next;
    slideTo(next, velocity);
    audio.play("swish", {
      pitch: next ? 1.1 : 0.85,
      gain: 0.3,
      pan: panOf(el ?? panelRef.current),
    });
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
    React.startTransition(() => setCheck((c) => c + 1));
  };

  // Opened from outside (the page's own bag button): focus moves in, and the
  // way home is remembered. A drawer open on first paint never takes focus.
  const wasOpen = React.useRef(isOpen);
  React.useEffect(() => {
    const before = wasOpen.current;
    wasOpen.current = isOpen;
    if (isOpen && !before) {
      const at = document.activeElement;
      returnTo.current =
        at instanceof HTMLElement && at !== document.body ? at : null;
      if (visitorActive()) {
        audio.play("swish", { pitch: 1.1, gain: 0.3 });
      }
    } else if (!isOpen && before) {
      if (panelRef.current?.contains(document.activeElement)) {
        (returnTo.current?.isConnected
          ? returnTo.current
          : rootRef.current
        )?.focus({ preventScroll: true });
      }
    }
  }, [isOpen, audio]);
  React.useEffect(() => {
    if (!isOpen || !closeNode || !returnTo.current) return;
    if (panelRef.current?.contains(document.activeElement)) return;
    closeNode.focus({ preventScroll: true });
  }, [isOpen, closeNode]);

  const pull = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || !isOpen,
    onStart: () => {
      slide.stop();
      pullFrom.current = slide.get();
      setPulling(true);
    },
    onMove: ({ offset }) => {
      const w = Math.max(1, panelRef.current?.offsetWidth ?? 320);
      const raw = pullFrom.current * w + offset.x;
      // Past open it gives a little and then less: the panel is anchored.
      const v = raw < 0 ? rubberband(raw, w) * 0.4 : raw;
      slide.set(r6(v / w));
    },
    onEnd: ({ velocity }) => {
      setPulling(false);
      const w = Math.max(1, panelRef.current?.offsetWidth ?? 320);
      const land = project(slide.get() * w, velocity.x, 0.99) / w;
      if (land > 0.4) setOpen(false, r6(velocity.x / w));
      else api.current?.slideTo(true, r6(velocity.x / w));
    },
    onCancel: () => {
      setPulling(false);
      api.current?.slideTo(true);
    },
  });

  /* ---------------------------- the visitor's moves ---------------------------- */

  const commit = (next: CartLine[]) => {
    setArmedParty(true);
    if (items === undefined) setOwnItems(next);
    onItemsChange?.(next);
  };

  const removeLine = (id: string, el: Element | null, saved = false) => {
    if (disabled) return;
    const index = lines.findIndex((l) => l.id === id);
    const line = lines[index];
    if (!line) return;
    const row = rows.current.get(id);
    if (row?.contains(document.activeElement)) focusUndo.current = true;
    audio.play("swish", { pitch: saved ? 1 : 0.9, gain: 0.35, pan: panOf(el) });
    setUndo((u) => ({ line, index, key: (u?.key ?? 0) + 1, saved }));
    setOpenRow(null);
    commit(lines.filter((l) => l.id !== id));
    if (saved) onSaveForLater?.(line);
    else onRemove?.(line);
  };

  const stepLine = (id: string, delta: 1 | -1, el: Element | null) => {
    if (disabled) return;
    const line = lines.find((l) => l.id === id);
    if (!line) return;
    const q = Math.round(line.quantity) + delta;
    if (q <= 0) {
      removeLine(id, el);
      return;
    }
    if (q > (line.max ?? 10)) return;
    audio.play("pop", {
      pitch: delta > 0 ? r2(1 + Math.min(q, 8) * 0.06) : 0.78,
      gain: delta > 0 ? 0.5 : 0.4,
      pan: panOf(el),
    });
    commit(lines.map((l) => (l.id === id ? { ...l, quantity: q } : l)));
  };

  const undoRemove = () => {
    const u = undo;
    if (!u || disabled) return;
    // A host that never took the line out leaves nothing to put back.
    if (lines.some((l) => l.id === u.line.id)) {
      setUndo(null);
      return;
    }
    const next = [...lines];
    next.splice(Math.min(u.index, next.length), 0, u.line);
    audio.play("swish", { pitch: 1.2, gain: 0.25, pan: panOf(undoNode) });
    if (undoNode && document.activeElement === undoNode) {
      focusRow.current = u.line.id;
    }
    setUndo(null);
    setRestored(u.line.id);
    commit(next);
    onUndo?.(u.line);
  };

  const addUpsell = (u: CartUpsell, el: Element | null) => {
    if (disabled) return;
    audio.play("pop", { pitch: 1.12, gain: 0.5, pan: panOf(el) });
    commit([{ ...u, quantity: 1 }, ...lines]);
    onUpsellAdd?.(u);
  };

  const checkout = async () => {
    if (disabled || phase === "pending" || lines.length === 0) return;
    setFailure(null);
    let result: void | Promise<void>;
    try {
      result = onCheckout?.(lines, t.total);
    } catch (error) {
      setFailure(messageOf(error, "Checkout didn't open. Try again."));
      return;
    }
    if (!isPromise<void>(result)) return;
    setPhase("pending");
    say("Opening checkout.");
    try {
      await result;
    } catch (error) {
      if (!alive.current) return;
      setFailure(messageOf(error, "Checkout didn't open. Try again."));
    }
    if (alive.current) setPhase("idle");
  };

  /* -------------------------------- effects -------------------------------- */

  React.useEffect(() => {
    alive.current = true;
    const map = anims.current;
    return () => {
      alive.current = false;
      for (const c of map.values()) c.stop();
      map.clear();
    };
  }, []);

  // The celebration is heard once, as the visitor's change lands.
  const heard = React.useRef(party);
  React.useEffect(() => {
    if (party === heard.current) return;
    heard.current = party;
    audio.play("pop", { pitch: 1.5, gain: 0.45, pan: 0.4 });
  }, [party, audio]);

  // The Undo clock: six seconds, paused while the page is hidden.
  const undoKey = undo?.key;
  const countdown = useMotionValue(1);
  React.useEffect(() => {
    if (undoKey === undefined) return;
    countdown.jump(1);
    const c = animate(countdown, 0, {
      duration: UNDO_MS / 1000,
      ease: "linear",
    });
    void c.then(() => setUndo((u) => (u && u.key === undoKey ? null : u)));
    const onVisibility = () => {
      if (document.hidden) c.pause();
      else c.play();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      c.stop();
    };
  }, [undoKey, countdown]);

  // Focus that was on a removed line lands on Undo once Undo exists; Undo
  // hands it back to the line it restored.
  React.useEffect(() => {
    if (!undoNode || !focusUndo.current) return;
    focusUndo.current = false;
    undoNode.focus({ preventScroll: true });
  }, [undoNode]);
  React.useEffect(() => {
    const id = focusRow.current;
    if (!id) return;
    const row = rows.current.get(id);
    if (!row) return;
    focusRow.current = null;
    row.querySelector<HTMLElement>("[role=group] button")?.focus({
      preventScroll: true,
    });
  }, [sig]);

  /* --------------------------------- view --------------------------------- */

  const panelX = useTransform(slide, (s) => `${r2(s * 100)}%`);
  const scrim = useTransform([slide, veil], ([s = 0, v = 0]: number[]) =>
    r2(Math.max(0, 1 - s) * v),
  );
  const shownUpsells = upsells.filter((u) => !lines.some((l) => l.id === u.id));
  const step = cascade(lines.length);

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-hidden className="flex flex-col gap-4 px-4 py-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-3">
            <span
              className={cn(
                "size-14 rounded-2 bg-ink-3/10",
                motionSafe && "animate-pulse",
              )}
            />
            <span className="flex flex-1 flex-col gap-2 pt-1">
              <span className="h-3 w-32 rounded-1 bg-ink-3/15" />
              <span className="h-3 w-20 rounded-1 bg-ink-3/10" />
              <span className="h-7 w-24 rounded-full bg-ink-3/10" />
            </span>
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center-safe justify-center-safe gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">
          Your bag didn&apos;t load.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={onRetry}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[13px] text-foreground transition-colors enabled:hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Retry
        </button>
      </div>
    );
  } else {
    body = (
      <>
        {lines.length === 0 ? (
          <motion.div
            className="flex flex-col items-center gap-2 px-6 pt-8 pb-6 text-center"
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              opacity: { duration: durations.base, ease: easings.enter },
              y: motionSafe ? springs.glide : { duration: 0 },
            }}
          >
            <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-3">
              <ShoppingBag aria-hidden className="size-5" />
            </span>
            <p className="text-[14px] font-medium text-foreground">
              {emptyTitle}
            </p>
            <p className="text-[12px] leading-4 text-ink-3">{emptyBody}</p>
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                onContinue?.();
                setOpen(false, 0, event.currentTarget);
              }}
              className={cn(
                "mt-2 inline-flex h-9 items-center rounded-2 border border-hairline-strong px-3 text-[13px] text-foreground transition-colors enabled:hover:bg-surface-2",
                FOCUS,
              )}
            >
              Continue shopping
            </button>
          </motion.div>
        ) : null}
        <ol role="list" className="flex flex-col divide-y divide-hairline">
          <AnimatePresence initial={false}>
            {lines.map((line, i) => (
              <motion.li
                key={line.id}
                className="overflow-clip"
                initial={
                  motionSafe
                    ? { height: 0, opacity: 0, x: distances.step }
                    : { opacity: 0 }
                }
                animate={{ height: "auto", opacity: 1, x: 0 }}
                exit={
                  motionSafe
                    ? {
                        height: 0,
                        opacity: 0,
                        x: -distances.shift,
                        transition: {
                          height: { ...springs.glide, delay: 0.04 },
                          x: exitFor(durations.base),
                          opacity: exitFor(durations.base),
                        },
                      }
                    : { opacity: 0, transition: exitFor(durations.fast) }
                }
                transition={
                  motionSafe
                    ? {
                        height: springs.glide,
                        x: { ...springs.glide, delay: i === 0 ? 0 : step },
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
              >
                <LineRow
                  line={line}
                  money={money}
                  swipe={swipe}
                  totals={totals}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  trayOpen={openRow === line.id}
                  onTray={(on) =>
                    setOpenRow((r) => (on ? line.id : r === line.id ? null : r))
                  }
                  onStep={(delta, el) => stepLine(line.id, delta, el)}
                  onRemove={(el) => removeLine(line.id, el)}
                  onSave={(el) => removeLine(line.id, el, true)}
                  onArm={(on, el) =>
                    audio.play("pop", {
                      pitch: on ? 0.62 : 0.5,
                      gain: on ? 0.35 : 0.2,
                      pan: panOf(el),
                    })
                  }
                  bind={(node) => {
                    if (node) rows.current.set(line.id, node);
                    else rows.current.delete(line.id);
                  }}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>

        <AnimatePresence initial={false}>
          {undo && !lines.some((l) => l.id === undo.line.id) ? (
            <motion.div
              key="undo"
              className="overflow-clip"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: durations.fast }
              }
            >
              <div className="mx-4 my-2 overflow-clip rounded-2 bg-surface-2">
                <div className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
                  <p className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                    <span className="font-medium text-foreground">
                      {undo.line.name}
                    </span>{" "}
                    {undo.saved ? "saved for later" : "removed"}
                  </p>
                  <button
                    ref={setUndoNode}
                    type="button"
                    disabled={disabled}
                    onClick={undoRemove}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-[12px] font-medium text-cobalt-bright transition-colors enabled:hover:bg-cobalt-wash",
                      FOCUS,
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Undo
                  </button>
                </div>
                <motion.span
                  aria-hidden
                  className="block h-0.5 origin-left bg-cobalt-bright/50"
                  style={{ scaleX: countdown }}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {shownUpsells.length > 0 ? (
          <section
            aria-labelledby={`${uid}-pairs`}
            className="border-t border-hairline pt-3 pb-4"
          >
            <h3
              id={`${uid}-pairs`}
              className="px-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              {lines.length === 0 ? "You might like" : "Pairs well with"}
            </h3>
            <ul
              role="list"
              className="mt-2 flex snap-x scroll-px-4 [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)] px-4 pb-1"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {shownUpsells.map((u) => (
                  <motion.li
                    key={u.id}
                    layout={motionSafe ? "position" : false}
                    className="flex w-52 shrink-0 snap-start items-center gap-2.5 rounded-3 border border-hairline p-2"
                    initial={{ opacity: 0, scale: motionSafe ? 0.94 : 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: motionSafe ? 0.9 : 1,
                      transition: exitFor(durations.fast),
                    }}
                    transition={{
                      layout: springs.glide,
                      scale: springs.snap,
                      opacity: { duration: durations.base },
                    }}
                  >
                    <Thumb item={u} size={44} />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[12px] font-medium text-foreground"
                        title={u.name}
                      >
                        {u.name}
                      </span>
                      <span className="block truncate text-[11px] text-ink-3 tabular-nums">
                        {money(u.price)}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Add ${u.name}, ${money(u.price)}`}
                      disabled={disabled}
                      onClick={(event) => addUpsell(u, event.currentTarget)}
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-foreground transition-colors enabled:hover:bg-surface-2",
                        FOCUS,
                      )}
                    >
                      <Plus aria-hidden className="size-4" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ) : null}
      </>
    );
  }

  const pending = phase === "pending";
  const labels = [checkoutLabel, "Opening checkout…"];

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={cn(
        "@container/cd relative isolate h-[36rem] w-full overflow-clip rounded-4 border border-hairline bg-background text-foreground outline-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        inert={isOpen || undefined}
        aria-hidden={isOpen || undefined}
        className="absolute inset-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        {children}
      </div>

      <motion.div
        aria-hidden
        onPointerDown={() => {
          if (isOpen && !disabled) setOpen(false);
        }}
        className={cn(
          "absolute inset-0 bg-[color-mix(in_oklab,black_32%,transparent)]",
          isOpen ? "pointer-events-auto" : "pointer-events-none",
          !visible && "invisible",
        )}
        style={{ opacity: scrim }}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-labelledby={label ? undefined : titleId}
        aria-label={label}
        aria-hidden={!isOpen || undefined}
        aria-busy={status === "loading" || pending || undefined}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // Handled where focus is; the page must not also see this Escape.
          event.preventDefault();
          if (openRow) {
            setOpenRow(null);
            return;
          }
          setOpen(false);
        }}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col bg-card shadow-[0_0_40px_color-mix(in_oklab,black_22%,transparent)] @min-[30rem]/cd:w-[22rem] @min-[30rem]/cd:border-l @min-[30rem]/cd:border-hairline @min-[64rem]/cd:w-[25rem]",
          !isOpen && "pointer-events-none",
          !visible && "invisible",
        )}
        style={{ x: panelX, opacity: veil }}
      >
        {/* Card under the panel's right edge while it is pulled, so a pull past
            open never shows a gap. Only then: at rest nothing sits outside the box. */}
        {pulling ? (
          <span
            aria-hidden
            className="absolute inset-y-0 left-full w-10 bg-card"
          />
        ) : null}
        <span
          aria-hidden
          {...pull}
          className="absolute inset-y-0 left-0 z-10 hidden w-3 cursor-grab touch-pan-y @min-[30rem]/cd:block"
        >
          <span className="absolute top-1/2 left-1 h-10 w-1 -translate-y-1/2 rounded-full bg-ink-3/30" />
        </span>

        <div
          {...pull}
          className={cn(
            "flex shrink-0 touch-pan-y items-center gap-2 px-4 pt-4 pb-3 select-none",
            pulling ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <h2
            id={titleId}
            className="text-[15px] font-semibold text-foreground"
          >
            {title}
          </h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2 px-1.5 font-mono text-[11px] text-ink-2 tabular-nums">
            <span className="sr-only">
              {plural(t.count, "item")} in the bag:{" "}
            </span>
            <span aria-hidden>{t.count}</span>
          </span>
          <button
            ref={setCloseNode}
            type="button"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={(event) => setOpen(false, 0, event.currentTarget)}
            className={cn(
              "ml-auto inline-flex size-8 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {status === "ready" ? (
          <FreeDelivery
            sub={t.sub}
            threshold={threshold}
            money={money}
            party={party}
            motionSafe={motionSafe}
          />
        ) : null}

        <div className="flex-1 [scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain border-t border-hairline">
          {body}
        </div>

        {status === "ready" && lines.length > 0 ? (
          <div className="shrink-0 border-t border-hairline bg-card px-4 pt-3 pb-4">
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-ink-2">Subtotal</dt>
              <dd className="text-right text-foreground">
                <Figure
                  amount={t.sub}
                  money={money}
                  mode={totals}
                  motionSafe={motionSafe}
                />
              </dd>
              {t.save > 0 ? (
                <>
                  <dt className="text-ink-2">Savings</dt>
                  <dd className="text-right text-success">
                    <span aria-hidden>−</span>
                    <Figure
                      amount={t.save}
                      money={money}
                      mode={totals}
                      motionSafe={motionSafe}
                    />
                  </dd>
                </>
              ) : null}
              <dt className="text-ink-2">Delivery</dt>
              <dd className="text-right text-foreground">
                {t.free ? (
                  <span className="text-success">Free</span>
                ) : (
                  <Figure
                    amount={t.delivery}
                    money={money}
                    mode={totals}
                    motionSafe={motionSafe}
                  />
                )}
              </dd>
              <dt className="pt-1 text-[14px] font-medium text-foreground">
                Total
              </dt>
              <dd className="pt-1 text-right text-[15px] font-semibold text-foreground">
                <Figure
                  amount={t.total}
                  money={money}
                  mode={totals}
                  motionSafe={motionSafe}
                />
              </dd>
            </dl>
            <button
              type="button"
              aria-busy={pending || undefined}
              disabled={disabled}
              onClick={() => void checkout()}
              className={cn(
                "mt-3 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-4 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                pending && "cursor-progress",
                FOCUS,
              )}
            >
              <span className="grid">
                {labels.map((text) => {
                  const on = (text === labels[1]) === pending;
                  return (
                    <span
                      key={text}
                      aria-hidden={!on || undefined}
                      className={cn(
                        "col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap",
                        on ? "visible" : "invisible",
                      )}
                    >
                      {text === labels[1] ? (
                        <LoaderCircle
                          aria-hidden
                          className={cn("size-4", motionSafe && "animate-spin")}
                        />
                      ) : null}
                      {text}
                      {text === labels[0] ? (
                        <ArrowRight aria-hidden className="size-4" />
                      ) : null}
                    </span>
                  );
                })}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {failure ? (
                <motion.p
                  key="failure"
                  role="alert"
                  className="mt-2 flex items-center gap-1.5 text-[12px] leading-4 text-danger"
                  initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                  {failure}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}
      </motion.div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
