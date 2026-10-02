"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { Plus, RotateCcw, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type BundleFly = "arc" | "direct" | "drop";
export type BundleSavings = "flat" | "tiered" | "free";
export type BundleBuilderStatus = "ready" | "loading" | "error";

export type BundleProduct = {
  id: string;
  /** "Basin Ridge". */
  name: string;
  /** Tasting notes: "Stone fruit, cocoa". */
  notes: string;
  /** One bag. */
  price: number;
  /** The bag's label — any CSS colour, ideally at a fixed lightness so both themes read it. */
  tint: string;
  /** Roast, 1 (light) to 5 (dark): the dots under the label. @default 3 */
  roast?: number;
  /** Bags left; 0 is sold out and cannot be picked. @default plenty */
  stock?: number;
};

export type BundleBuilderProps = {
  /** Compartments in the box, 2 to 5. @default 3 */
  slots?: number;
  /** How a picked bag travels to its compartment: a thrown arc, a straight glide, or a lift and a drop. @default "arc" */
  fly?: BundleFly;
  /** The discount the lid shows: `percent` off a full box, a discount that grows with each bag, or the cheapest bag free. @default "flat" */
  savings?: BundleSavings;
  /** The shelf. @default defaultBundleProducts */
  products?: BundleProduct[];
  /** Controlled box: the picked ids, in compartment order. */
  value?: string[];
  /** Initial box when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the press, tap, drop or × that changed the box, with the new ids. */
  onValueChange?: (ids: string[]) => void;
  /** The full box's discount for `flat`, and the top of the ladder for `tiered`, in percent. @default 15 */
  percent?: number;
  /** The full box was added. Return a promise to show a pending state, then Added (or Try again on a rejection). */
  onSubmit?: (ids: string[]) => void | Promise<unknown>;
  /** The submit button's words. @default "Add box to cart" */
  submitLabel?: string;
  /** Money. @default Intl currency in `locale` and `currency` */
  format?: (amount: number) => string;
  /** @default "en-US" */
  locale?: string;
  /** @default "USD" */
  currency?: string;
  /** Whether the shelf has arrived. @default "ready" */
  status?: BundleBuilderStatus;
  /** "Try again" was pressed after the shelf failed to load. */
  onRetry?: () => void;
  /** The builder's heading. @default "Tasting box" */
  title?: string;
  /** The line under the heading. @default the offer, in words */
  subtitle?: string;
  /** The region's accessible name. @default the title */
  label?: string;
  /** A pop as a bag leaves the shelf or the box, a thock as it lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Look only: nothing can be picked, removed or added to the cart. @default false */
  disabled?: boolean;
  /** Classes for the root. Its scroller is at most 560px tall. */
  className?: string;
};

/* ---------------------------------- data --------------------------------- */

export const defaultBundleProducts: BundleProduct[] = [
  {
    id: "basin-ridge",
    name: "Basin Ridge",
    notes: "Stone fruit, cocoa",
    price: 18,
    tint: "oklch(from var(--danger) 0.68 0.12 h)",
    roast: 3,
  },
  {
    id: "coldbrook-valley",
    name: "Coldbrook Valley",
    notes: "Bergamot, honey",
    price: 21,
    tint: "oklch(from var(--accent-bright) 0.66 0.09 h)",
    roast: 2,
  },
  {
    id: "gauge-peak",
    name: "Gauge Peak",
    notes: "Red apple, caramel",
    price: 19,
    tint: "oklch(from var(--success) 0.68 0.1 h)",
    roast: 3,
  },
  {
    id: "fern-hollow",
    name: "Fern Hollow",
    notes: "Jasmine, lime",
    price: 24,
    tint: "oklch(from var(--success) 0.8 0.08 h)",
    roast: 1,
  },
  {
    id: "cinder-mesa",
    name: "Cinder Mesa",
    notes: "Dark chocolate, molasses",
    price: 17,
    tint: "oklch(from var(--ink-3) 0.42 0.02 h)",
    roast: 5,
  },
  {
    id: "juniper-flats",
    name: "Juniper Flats",
    notes: "Brown sugar, almond",
    price: 16,
    tint: "oklch(from var(--warn) 0.76 0.12 h)",
    roast: 4,
  },
  {
    id: "larch-terrace",
    name: "Larch Terrace",
    notes: "Blackcurrant, cedar",
    price: 22,
    tint: "oklch(from var(--danger) 0.55 0.1 h)",
    roast: 2,
    stock: 0,
  },
  {
    id: "waylight-estate",
    name: "Waylight Estate",
    notes: "Plum, black tea",
    price: 23,
    tint: "oklch(from var(--accent-bright) 0.52 0.12 h)",
    roast: 3,
  },
];

/* -------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const WORDS = ["zero", "one", "two", "three", "four", "five", "six"];
const word = (n: number) => WORDS[n] ?? String(n);
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

type Deal = {
  sum: number;
  discount: number;
  total: number;
  /** The percentage off right now, for the tiered ladder. */
  rate: number;
  full: boolean;
  /** What the lid says. */
  message: string;
  /** The cheapest bag, when it is the free one. */
  freeId: string | null;
};

/** What the box costs under its rule, and what the lid says about it. */
function dealOf(
  items: BundleProduct[],
  slots: number,
  rule: BundleSavings,
  percent: number,
  money: (n: number) => string,
): Deal {
  const n = items.length;
  const sum = r2(items.reduce((s, p) => s + p.price, 0));
  const full = n >= slots;
  const left = Math.max(0, slots - n);
  let discount = 0;
  let rate = 0;
  let message = "";
  let freeId: string | null = null;
  if (rule === "tiered") {
    const step = slots > 1 ? percent / (slots - 1) : percent;
    rate = n >= 2 ? Math.min(percent, step * (n - 1)) : 0;
    discount = r2((sum * rate) / 100);
    const next = Math.min(percent, step * n);
    message = full
      ? `You save ${money(discount)}`
      : n === 0
        ? `Up to ${percent}% off`
        : rate === 0
          ? `${r2(next)}% off with one more`
          : `${r2(rate)}% off now, ${percent}% at ${slots}`;
  } else if (rule === "free") {
    if (full && n > 0) {
      const cheapest = [...items].sort((a, b) => a.price - b.price)[0];
      if (cheapest) {
        discount = cheapest.price;
        freeId = cheapest.id;
      }
    }
    const cheap = items.find((p) => p.id === freeId);
    message = full
      ? `${cheap?.name ?? "One bag"} is free`
      : n === 0
        ? "Fill it, the cheapest is free"
        : `${left} more, the cheapest is free`;
  } else {
    rate = full ? percent : 0;
    discount = full ? r2((sum * percent) / 100) : 0;
    message = full
      ? `You save ${money(discount)}`
      : n === 0
        ? `Pick ${slots}, save ${percent}%`
        : `${left} more to save ${percent}%`;
  }
  return {
    sum,
    discount,
    total: r2(sum - discount),
    rate,
    full,
    message,
    freeId,
  };
}

/** What a box of these ids costs under a rule — the sums the builder shows. */
export function bundleTotals(
  products: BundleProduct[],
  ids: string[],
  options: { slots?: number; savings?: BundleSavings; percent?: number } = {},
): { sum: number; discount: number; total: number; full: boolean } {
  const capacity = clamp(Math.round(options.slots ?? 3), 2, 5);
  const items = ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is BundleProduct => !!p)
    .slice(0, capacity);
  const d = dealOf(
    items,
    capacity,
    options.savings ?? "flat",
    clamp(options.percent ?? 15, 0, 90),
    String,
  );
  return { sum: d.sum, discount: d.discount, total: d.total, full: d.full };
}

/* --------------------------------- the art ------------------------------- */

/**
 * A coffee bag: kraft paper with a folded top, the origin's label in its
 * own colour and the roast as dots. The paper is a pigment at a fixed
 * lightness, so the bag reads the same in both themes.
 */
function BagArt({
  product,
  className,
}: {
  product: BundleProduct;
  className?: string;
}) {
  const round = hash(product.id) % 2 === 0;
  const roast = clamp(Math.round(product.roast ?? 3), 1, 5);
  const paper = "oklch(from var(--warn) 0.84 0.05 h)";
  const fold = "oklch(from var(--warn) 0.74 0.05 h)";
  const ink = "oklch(from var(--ink-3) 0.32 0.02 h)";
  return (
    <svg aria-hidden viewBox="0 0 48 56" className={cn("block", className)}>
      <ellipse cx={24} cy={54.2} rx={16} ry={1.6} className="fill-ink-3/25" />
      <path
        d="M10 13h28l3 39a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z"
        style={{ fill: paper }}
      />
      <path d="M10 5h28v8H10Z" style={{ fill: fold }} />
      <path
        d="M14 5v8M19 5v8M24 5v8M29 5v8M34 5v8"
        strokeWidth={0.8}
        style={{ stroke: paper }}
      />
      <circle cx={24} cy={17.5} r={1.5} style={{ fill: fold }} />
      {round ? (
        <circle cx={24} cy={32} r={9.5} style={{ fill: product.tint }} />
      ) : (
        <rect
          x={13}
          y={23}
          width={22}
          height={18}
          rx={2.5}
          style={{ fill: product.tint }}
        />
      )}
      <path
        d="M18 32h12"
        strokeWidth={1.6}
        strokeLinecap="round"
        style={{ stroke: paper }}
      />
      {Array.from({ length: 5 }, (_, i) => (
        <circle
          key={i}
          cx={16 + i * 4}
          cy={47.5}
          r={1.3}
          strokeWidth={0.8}
          style={i < roast ? { fill: ink } : { fill: "none", stroke: ink }}
        />
      ))}
    </svg>
  );
}

/* --------------------------------- rolls --------------------------------- */

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

/** Money whose digits roll, keyed from the right, with the widest amount reserved. */
function Roll({
  text,
  widest,
  align = "end",
  motionSafe,
  className,
}: {
  text: string;
  widest: string;
  /** Which side of the reserved width the digits sit on. */
  align?: "start" | "end";
  motionSafe: boolean;
  className?: string;
}) {
  const chars = [...text];
  return (
    <span aria-hidden className={cn("inline-grid tabular-nums", className)}>
      <span className="invisible col-start-1 row-start-1 leading-[1.15em] whitespace-pre">
        {widest.length > text.length ? widest : text}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex leading-[1.15em] whitespace-pre",
          align === "end" ? "justify-self-end" : "justify-self-start",
        )}
      >
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
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
    </span>
  );
}

function DrawnCheck({
  motionSafe,
  small = false,
}: {
  motionSafe: boolean;
  small?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      className={cn("shrink-0", small ? "size-3.5" : "size-4")}
    >
      <motion.path
        d="M3.5 8.4 6.6 11.4 12.6 4.8"
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

/* --------------------------------- shelf --------------------------------- */

type Point = { x: number; y: number };

type TileProps = {
  product: BundleProduct;
  money: (n: number) => string;
  inBox: boolean;
  /** Flying home: it cannot be picked up again until it lands. */
  away: boolean;
  /** In any flight, or in the hand. */
  aloft: boolean;
  full: boolean;
  motionSafe: boolean;
  disabled: boolean;
  motionOf: (id: string, at?: number) => BagMotion;
  register: (
    kind: NodeKind,
    id: string,
    node: Element | null,
  ) => (() => void) | undefined;
  onToggle: (el: HTMLElement) => void;
  onDragStart: (point: Point) => void;
  onDragMove: (offset: Point, point: Point) => void;
  onDragEnd: (point: Point, velocity: Point) => void;
  onDragCancel: () => void;
};

/** One product on the shelf. Its art can be picked up and thrown at the box. */
function ShelfTile({
  product: p,
  money,
  inBox,
  away,
  aloft,
  full,
  motionSafe,
  disabled,
  motionOf,
  register,
  onToggle,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: TileProps) {
  const settle = motionOf(p.id).settle;
  const soldOut = (p.stock ?? 1) <= 0;
  const blocked = disabled || soldOut || (full && !inBox);
  const drag = useDrag({
    threshold: 5,
    disabled: disabled || soldOut || inBox || away,
    onStart: ({ point }) => onDragStart(point),
    onMove: ({ offset, point }) => onDragMove(offset, point),
    onEnd: ({ point, velocity }) => onDragEnd(point, velocity),
    onCancel: onDragCancel,
    onTap: (event) => {
      if (!blocked) onToggle(event.currentTarget as HTMLElement);
    },
  });
  return (
    <article
      aria-label={p.name}
      className="flex min-w-0 flex-col gap-2 rounded-3 border border-hairline bg-card p-2"
    >
      <div
        {...drag}
        aria-hidden
        className={cn(
          "relative flex aspect-[6/5] items-center justify-center rounded-2 bg-surface-2 select-none",
          !disabled &&
            !soldOut &&
            !inBox &&
            !away &&
            "cursor-grab touch-pan-y active:cursor-grabbing",
        )}
      >
        {/* Where the bag stands; an outline while it is away in the box. */}
        <div
          ref={(node) => register("art", p.id, node)}
          className="relative aspect-[48/56] h-[78%]"
        >
          <motion.div
            className="size-full"
            style={{ scale: settle }}
            initial={false}
            animate={{ opacity: inBox || aloft ? 0 : soldOut ? 0.45 : 1 }}
            transition={{ duration: motionSafe ? durations.fast : 0 }}
          >
            <BagArt product={p} className="size-full" />
          </motion.div>
          {inBox || aloft ? (
            <span className="absolute inset-[6%] rounded-2 border border-dashed border-ink-3/40" />
          ) : null}
        </div>
        {soldOut ? (
          <span className="absolute top-1.5 left-1.5 inline-flex h-5 items-center rounded-full bg-card px-1.5 text-[10px] font-medium text-ink-3">
            Sold out
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-1">
        <span
          className="truncate text-[13px] font-medium text-foreground"
          title={p.name}
        >
          {p.name}
        </span>
        <span className="truncate text-[11px] text-ink-3" title={p.notes}>
          {p.notes}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="font-mono text-[12px] text-foreground tabular-nums">
          {money(p.price)}
        </span>
        <button
          ref={(node) => register("toggle", p.id, node)}
          type="button"
          disabled={disabled}
          aria-pressed={inBox}
          aria-disabled={soldOut || (full && !inBox) || undefined}
          aria-label={
            soldOut ? `${p.name}, sold out` : `Add ${p.name} to the box`
          }
          title={
            soldOut
              ? "Sold out"
              : inBox
                ? "In the box"
                : full
                  ? "Box full"
                  : "Add"
          }
          onClick={(event) => {
            if (blocked) return;
            onToggle(event.currentTarget);
          }}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
            inBox
              ? "border-cobalt-bright/50 bg-cobalt-wash text-cobalt-bright"
              : blocked
                ? "cursor-not-allowed border-hairline text-ink-3/60"
                : "border-hairline text-foreground hover:bg-surface-2",
            disabled && "cursor-not-allowed opacity-50",
            FOCUS,
          )}
        >
          {inBox ? (
            <DrawnCheck motionSafe={motionSafe} small />
          ) : (
            <Plus aria-hidden className="size-3.5 shrink-0" />
          )}
        </button>
      </div>
    </article>
  );
}

/* --------------------------------- flights ------------------------------- */

type NodeKind = "art" | "toggle" | "anchor" | "remove";

type Flight = {
  key: number;
  id: string;
  kind: "in" | "out" | "drag";
  /** The flyer's unscaled box, px. */
  w: number;
  h: number;
  /** Its centre, scale, turn and opacity. */
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  s: MotionValue<number>;
  r: MotionValue<number>;
  o: MotionValue<number>;
};

type Rect = { left: number; top: number; width: number; height: number };
const centre = (r: Rect): Point => ({
  x: r.left + r.width / 2,
  y: r.top + r.height / 2,
});

/* -------------------------------- the box -------------------------------- */

type BagMotion = {
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  /** Which compartment the bag is drawn in, animated between them. */
  pos: MotionValue<number>;
  /** Its scale on the shelf as it lands back home. */
  settle: MotionValue<number>;
};

/**
 * A bundle builder. Picking a product — its Add, a tap on its bag, or a drag
 * of the bag onto the box — sends the bag to the next empty compartment on
 * one flight: a thrown arc, a straight glide, or a lift and a drop. It lands
 * with a squash that recovers on recoil, the box dips and the lid hops, and
 * only then do the totals roll and the lid's message change. Taking a bag
 * out flies it home to its place on the shelf, and the bags beside it slide
 * along on glide.
 *
 * The lid shows the deal: `percent` off a full box, a discount that climbs
 * with each bag, or the cheapest bag free. A full box tilts its lid closer
 * and offers "Add box to cart", which can await a promise.
 *
 * Every product has a real toggle button, every filled compartment a real
 * remove button; landings and removals are announced with the new total.
 * Under reduced motion nothing flies, squashes or tilts: bags appear in and
 * leave their compartments in place while totals and messages still change.
 */
export function BundleBuilder({
  slots = 3,
  fly = "arc",
  savings = "flat",
  products = defaultBundleProducts,
  value,
  defaultValue = [],
  onValueChange,
  percent = 15,
  onSubmit,
  submitLabel = "Add box to cart",
  format,
  locale = "en-US",
  currency = "USD",
  status = "ready",
  onRetry,
  title = "Tasting box",
  subtitle,
  label,
  sound = false,
  disabled = false,
  className,
}: BundleBuilderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const capacity = clamp(Math.round(slots), 2, 5);
  const pct = clamp(percent, 0, 90);

  const money = React.useMemo(() => {
    if (format) return format;
    const nf = new Intl.NumberFormat(locale, { style: "currency", currency });
    return (n: number) => nf.format(n);
  }, [format, locale, currency]);
  const byId = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  /* -------------------------------- value -------------------------------- */

  const [own, setOwn] = React.useState<string[]>(() => defaultValue);
  // A box that shrinks lets go of what no longer fits, in the render that
  // shrinks it; the host hears about it from the effect below.
  const [seenCapacity, setSeenCapacity] = React.useState(capacity);
  if (seenCapacity !== capacity) {
    setSeenCapacity(capacity);
    if (own.length > capacity) setOwn(own.slice(0, capacity));
  }
  const raw = value ?? own;
  const picked = raw.filter((id) => byId.has(id)).slice(0, capacity);
  const pickedKey = picked.join(",");

  const latest = React.useRef({ picked, value });
  React.useEffect(() => {
    latest.current = { picked, value };
  });

  const reportedTrim = React.useRef("");
  React.useEffect(() => {
    if (value === undefined || value.length <= capacity) return;
    const trimmed = value.slice(0, capacity).join(",");
    if (reportedTrim.current === trimmed) return;
    reportedTrim.current = trimmed;
    onValueChange?.(value.slice(0, capacity));
  }, [value, capacity, onValueChange]);

  const commit = (next: string[]) => {
    // Two picks inside one frame must not both start from the old box.
    latest.current = { ...latest.current, picked: next };
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /* ------------------------------ geometry ------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef({
    art: new Map<string, Element>(),
    toggle: new Map<string, Element>(),
    anchor: new Map<string, Element>(),
    remove: new Map<string, Element>(),
  });

  const register = (kind: NodeKind, id: string, node: Element | null) => {
    if (!node) return undefined;
    const map = nodes.current[kind];
    map.set(id, node);
    return () => {
      if (map.get(id) === node) map.delete(id);
    };
  };

  const rel = (el: Element | null | undefined): Rect | null => {
    const root = rootRef.current;
    if (!el || !root) return null;
    const a = root.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return {
      left: b.left - a.left - root.clientLeft,
      top: b.top - a.top - root.clientTop,
      width: b.width,
      height: b.height,
    };
  };

  const panAt = (x: number) => {
    const root = rootRef.current;
    if (!root) return 0;
    const a = root.getBoundingClientRect();
    return panFrom(a.left + x, null);
  };

  /* ------------------------------ motion --------------------------------- */

  const [flights, setFlights] = React.useState<Flight[]>([]);
  const flightSeq = React.useRef(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const motions = React.useRef(new Map<string, BagMotion>());
  const boxY = useMotionValue(0);
  const boxX = useMotionValue(0);
  const lidHop = useMotionValue(0);
  const lidTilt = useMotionValue(22);
  const [flash, setFlash] = React.useState(false);
  const flashTimer = React.useRef<number | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  /**
   * Each product's motion values — its squash, its compartment position and
   * its settle on the shelf — made the first time anything asks and kept
   * across renders, so a bag that changes compartment keeps its spring.
   */
  const motionOf = (id: string, at = 0): BagMotion => {
    let m = motions.current.get(id);
    if (!m) {
      m = {
        sx: motionValue(1),
        sy: motionValue(1),
        pos: motionValue(at),
        settle: motionValue(1),
      };
      motions.current.set(id, m);
    }
    return m;
  };

  const inFlight = new Set(
    flights.filter((f) => f.kind !== "out").map((f) => f.id),
  );
  const goingHome = new Set(
    flights.filter((f) => f.kind === "out").map((f) => f.id),
  );
  /** Bags in the air or in a hand: their place on the shelf shows an outline. */
  const aloft = new Set(flights.map((f) => f.id));
  const landedIds = picked.filter((id) => !inFlight.has(id));
  const landed = landedIds
    .map((id) => byId.get(id))
    .filter((p): p is BundleProduct => !!p);
  const deal = dealOf(landed, capacity, savings, pct, money);

  // Bags slide to their compartments when one leaves; a new arrival is
  // placed exactly where its flight landed.
  React.useEffect(() => {
    picked.forEach((id, i) => {
      const p = motions.current.get(id)?.pos;
      if (!p) return;
      if (Math.abs(p.get() - i) < 0.001) return;
      run(
        `pos-${id}`,
        motionSafe
          ? animate(p, i, springs.glide)
          : animate(p, i, { duration: 0 }),
      );
    });
    // The order is the dependency; the values are kept per product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedKey, motionSafe]);

  // The lid closes in when the box fills and opens out as it empties.
  React.useEffect(() => {
    const to = deal.full ? 6 : 22;
    run(
      "lid",
      motionSafe
        ? animate(lidTilt, to, springs.snap)
        : animate(lidTilt, to, { duration: 0 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.full, motionSafe]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ---------------------------- announcements ---------------------------- */

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  // Focus that has to move after a removal goes once the render that moved
  // things has landed, to the node that is there then.
  const [focusAsk, setFocusAsk] = React.useState<{
    n: number;
    kind: NodeKind;
    id: string;
  }>({ n: 0, kind: "remove", id: "" });
  React.useEffect(() => {
    if (focusAsk.n === 0) return;
    const node = nodes.current[focusAsk.kind].get(focusAsk.id);
    if (node instanceof HTMLElement) node.focus({ preventScroll: true });
  }, [focusAsk]);
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const landingWords = (ids: string[], arrived: string) => {
    const items = ids
      .map((id) => byId.get(id))
      .filter((p): p is BundleProduct => !!p);
    const d = dealOf(items, capacity, savings, pct, money);
    const name = byId.get(arrived)?.name ?? "A bag";
    return `${name} is in the box, ${items.length} of ${capacity}. ${d.message}. Total ${money(d.total)}.`;
  };

  /* ------------------------------ landings ------------------------------- */

  const drop = (key: number) =>
    setFlights((list) => list.filter((f) => f.key !== key));

  /** A bag reaches its compartment: squash, dip, hop, sound, totals. */
  const land = (flight: Flight) => {
    const now = latest.current.picked;
    const at = now.indexOf(flight.id);
    if (at === -1) {
      // The host did not keep it: it goes home instead.
      sendHome(flight);
      return;
    }
    motionOf(flight.id, at).pos.jump(at);
    drop(flight.key);
    const sq = motionOf(flight.id, at);
    const big = fly === "drop" ? 1.4 : 1;
    sq.sx.jump(r2(1 + 0.12 * big));
    sq.sy.jump(r2(1 - 0.12 * big));
    run(`sx-${flight.id}`, animate(sq.sx, 1, springs.recoil));
    run(`sy-${flight.id}`, animate(sq.sy, 1, springs.recoil));
    run("boxY", animate(boxY, 0, { ...springs.recoil, velocity: 140 }));
    run("lidHop", animate(lidHop, 0, { ...springs.recoil, velocity: -160 }));
    audio.play("thock", {
      pitch: r2(semitones(Math.min(9, at * 3))),
      gain: 0.6,
      pan: panAt(flight.cx.get()),
    });
    say(landingWords(now, flight.id));
  };

  /** A flyer glides from wherever it is to `to`, on the house glide. */
  const glideTo = (
    flight: Flight,
    to: Rect,
    velocity: Point,
    onDone: () => void,
  ) => {
    const c = centre(to);
    const s = to.width / flight.w;
    run(
      `f${flight.key}x`,
      animate(flight.cx, c.x, { ...springs.glide, velocity: velocity.x }),
    );
    run(`f${flight.key}r`, animate(flight.r, 0, springs.glide));
    run(`f${flight.key}s`, animate(flight.s, s, springs.glide));
    run(
      `f${flight.key}y`,
      animate(flight.cy, c.y, {
        ...springs.glide,
        velocity: velocity.y,
        onComplete: onDone,
      }),
    );
  };

  /** The picked flight: from `from` to `to` along the chosen path. */
  const flyPath = (
    flight: Flight,
    from: Rect,
    to: Rect,
    onDone: () => void,
  ) => {
    const a = centre(from);
    const b = centre(to);
    const s0 = from.width / flight.w;
    const s1 = to.width / flight.w;
    if (fly === "direct") {
      glideTo(flight, to, { x: 0, y: 0 }, onDone);
      return;
    }
    const t = motionValue(0);
    if (fly === "drop") {
      const lift = Math.min(a.y, b.y) - 70;
      run(
        `f${flight.key}t`,
        animate(t, 1, {
          duration: 0.64,
          ease: "linear",
          onUpdate: (v) => {
            // Over the compartment first, easing out; then a fall under
            // gravity, easing in, so it arrives at speed.
            if (v < 0.48) {
              const k = v / 0.48;
              const e = 1 - (1 - k) * (1 - k);
              flight.cx.set(r2(lerp(a.x, b.x, e)));
              flight.cy.set(r2(lerp(a.y, lift, e)));
              flight.s.set(Number(lerp(s0, s1 * 1.06, e).toFixed(4)));
              flight.r.set(
                r2(Math.sin(k * Math.PI) * 6 * Math.sign(b.x - a.x)),
              );
            } else {
              const k = (v - 0.48) / 0.52;
              flight.cx.set(r2(b.x));
              flight.cy.set(r2(lerp(lift, b.y, k * k)));
              flight.s.set(Number(lerp(s1 * 1.06, s1, k).toFixed(4)));
              flight.r.set(0);
            }
          },
          onComplete: onDone,
        }),
      );
      return;
    }
    // A thrown arc: a quadratic whose apex rises above the higher end, the
    // bag turning with its direction of travel.
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const apex = {
      x: (a.x + b.x) / 2,
      y: Math.min(a.y, b.y) - (36 + dist * 0.22),
    };
    const side = Math.sign(b.x - a.x) || 1;
    run(
      `f${flight.key}t`,
      animate(t, 1, {
        ...springs.glide,
        onUpdate: (v) => {
          const k = clamp(v, 0, 1.02);
          const u = 1 - k;
          flight.cx.set(r2(u * u * a.x + 2 * u * k * apex.x + k * k * b.x));
          flight.cy.set(r2(u * u * a.y + 2 * u * k * apex.y + k * k * b.y));
          flight.s.set(Number(lerp(s0, s1, clamp(k, 0, 1)).toFixed(4)));
          flight.r.set(r2(Math.sin(clamp(k, 0, 1) * Math.PI) * 14 * side));
        },
        onComplete: onDone,
      }),
    );
  };

  /** Back to the shelf, or towards it when its tile is scrolled away. */
  const homeRect = (id: string): { rect: Rect | null; hidden: boolean } => {
    const rect = rel(nodes.current.art.get(id));
    const scroller = scrollerRef.current;
    const view = rel(scroller);
    if (!rect || !view) return { rect, hidden: false };
    const midY = rect.top + rect.height / 2;
    const hidden = midY < view.top || midY > view.top + view.height;
    if (!hidden) return { rect, hidden };
    return {
      rect: {
        ...rect,
        top: clamp(
          rect.top,
          view.top - rect.height / 2,
          view.top + view.height - rect.height / 2,
        ),
      },
      hidden,
    };
  };

  const sendHome = (flight: Flight, velocity: Point = { x: 0, y: 0 }) => {
    const { rect, hidden } = homeRect(flight.id);
    setFlights((list) =>
      list.map((f) => (f.key === flight.key ? { ...flight, kind: "out" } : f)),
    );
    const finish = () => {
      drop(flight.key);
      const settle = motionOf(flight.id).settle;
      if (motionSafe) {
        settle.jump(0.9);
        run(`settle-${flight.id}`, animate(settle, 1, springs.snap));
      }
      audio.play("thock", {
        pitch: 0.7,
        gain: 0.3,
        pan: panAt(flight.cx.get()),
      });
    };
    if (!rect) {
      finish();
      return;
    }
    if (hidden) {
      run(
        `f${flight.key}o`,
        animate(flight.o, 0, { duration: durations.slow, ease: easings.exit }),
      );
    }
    glideTo(flight, rect, velocity, finish);
  };

  const newFlight = (id: string, kind: Flight["kind"], from: Rect): Flight => {
    flightSeq.current += 1;
    const c = centre(from);
    return {
      key: flightSeq.current,
      id,
      kind,
      w: from.width,
      h: from.height,
      cx: motionValue(r2(c.x)),
      cy: motionValue(r2(c.y)),
      s: motionValue(1),
      r: motionValue(0),
      o: motionValue(1),
    };
  };

  /* ------------------------------- actions ------------------------------- */

  const addFrom = (id: string, from: Rect | null, el: Element | null) => {
    const now = latest.current.picked;
    if (disabled || now.includes(id) || now.length >= capacity) return;
    const p = byId.get(id);
    if (!p || (p.stock ?? 1) <= 0) return;
    const next = [...now, id];
    const r = el?.getBoundingClientRect();
    audio.play("pop", {
      pitch: r2(semitones(now.length * 2)),
      gain: 0.55,
      pan: r ? panFrom(r.left + r.width / 2, null) : 0,
    });
    const to = rel(nodes.current.anchor.get(String(now.length)));
    commit(next);
    if (!motionSafe || !from || !to) {
      motionOf(id, now.length).pos.jump(now.length);
      say(landingWords(next, id));
      return;
    }
    const flight = newFlight(id, "in", from);
    setFlights((list) => [...list, flight]);
    flyPath(flight, from, to, () => land(flight));
  };

  const remove = (id: string, el: Element | null) => {
    const now = latest.current.picked;
    const at = now.indexOf(id);
    if (disabled || at === -1) return;
    const next = now.filter((x) => x !== id);
    const r = el?.getBoundingClientRect();
    audio.play("pop", {
      pitch: 0.8,
      gain: 0.5,
      pan: r ? panFrom(r.left + r.width / 2, null) : 0,
    });
    const from = rel(nodes.current.anchor.get(String(at)));
    // Focus stays in the box while there is something left in it.
    const stay = next[Math.min(at, next.length - 1)];
    commit(next);
    if (el && el === document.activeElement) {
      setFocusAsk((f) => ({
        n: f.n + 1,
        kind: stay ? "remove" : "toggle",
        id: stay ?? id,
      }));
    }
    const items = next
      .map((x) => byId.get(x))
      .filter((p): p is BundleProduct => !!p);
    const d = dealOf(items, capacity, savings, pct, money);
    say(
      `${byId.get(id)?.name ?? "The bag"} is back on the shelf, ${items.length} of ${capacity}. Total ${money(d.total)}.`,
    );
    if (!motionSafe || !from) return;
    const flight = newFlight(id, "out", from);
    setFlights((list) => [...list, flight]);
    sendHome(flight);
  };

  const toggle = (id: string, el: HTMLElement) => {
    if (latest.current.picked.includes(id)) remove(id, el);
    else addFrom(id, rel(nodes.current.art.get(id)), el);
  };

  /* --------------------------------- drag -------------------------------- */

  const dragging = React.useRef<{ flight: Flight; start: Point } | null>(null);
  const [overBox, setOverBox] = React.useState(false);

  const overTheBox = (point: Point) => {
    const r = boxRef.current?.getBoundingClientRect();
    return (
      !!r &&
      point.x >= r.left - 12 &&
      point.x <= r.right + 12 &&
      point.y >= r.top - 12 &&
      point.y <= r.bottom + 12
    );
  };

  const dragStart = (id: string, point: Point) => {
    const from = rel(nodes.current.art.get(id));
    if (!from || disabled) return;
    const flight = newFlight(id, "drag", from);
    flight.s.set(1.06);
    dragging.current = {
      flight,
      start: { x: flight.cx.get(), y: flight.cy.get() },
    };
    setFlights((list) => [...list, flight]);
    audio.play("pop", { pitch: 1.2, gain: 0.4, pan: panFrom(point.x, null) });
  };

  const dragMove = (offset: Point, point: Point) => {
    const d = dragging.current;
    if (!d) return;
    d.flight.cx.set(r2(d.start.x + offset.x));
    d.flight.cy.set(r2(d.start.y + offset.y));
    d.flight.r.set(r2(clamp(offset.x * 0.04, -10, 10)));
    const over = overTheBox(point);
    setOverBox((was) => (was === over ? was : over));
  };

  const shakeBox = () => {
    if (!motionSafe) {
      // Without travel, the refusal is a brief danger outline.
      setFlash(true);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(false), 420);
      return;
    }
    run(
      "boxX",
      animate(boxX, [0, -6, 6, -4, 4, 0], {
        duration: 0.36,
        ease: easings.move,
      }),
    );
  };

  const dragEnd = (point: Point, velocity: Point) => {
    const d = dragging.current;
    dragging.current = null;
    setOverBox(false);
    if (!d) return;
    const { flight } = d;
    const thrown = {
      x: project(point.x, velocity.x, 0.99),
      y: project(point.y, velocity.y, 0.99),
    };
    const aimed = overTheBox(point) || overTheBox(thrown);
    const now = latest.current.picked;
    const room = now.length < capacity;
    if (aimed && room && !now.includes(flight.id)) {
      const to = rel(nodes.current.anchor.get(String(now.length)));
      const next = [...now, flight.id];
      audio.play("pop", {
        pitch: r2(semitones(now.length * 2)),
        gain: 0.55,
        pan: panFrom(point.x, null),
      });
      commit(next);
      if (!to) {
        drop(flight.key);
        return;
      }
      setFlights((list) =>
        list.map((f) => (f.key === flight.key ? { ...flight, kind: "in" } : f)),
      );
      glideTo(flight, to, velocity, () => land(flight));
      return;
    }
    if (aimed && !room) {
      shakeBox();
      audio.play("thock", {
        pitch: 0.6,
        gain: 0.4,
        pan: panFrom(point.x, null),
      });
      say("The box is full. Take a bag out first.");
    }
    sendHome(flight, velocity);
  };

  const dragCancel = () => {
    const d = dragging.current;
    dragging.current = null;
    setOverBox(false);
    if (d) sendHome(d.flight);
  };

  /* -------------------------------- submit ------------------------------- */

  type Submit = "idle" | "pending" | "success" | "error";
  const [submit, setSubmit] = React.useState<Submit>("idle");
  const submitTimer = React.useRef<number | null>(null);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (submitTimer.current !== null)
        window.clearTimeout(submitTimer.current);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const doSubmit = (el: HTMLElement) => {
    if (disabled || !deal.full || submit === "pending") return;
    const r = el.getBoundingClientRect();
    audio.play("pop", {
      pitch: 1.3,
      gain: 0.5,
      pan: panFrom(r.left + r.width / 2, null),
    });
    const ids = [...latest.current.picked];
    const done = () => {
      if (!alive.current) return;
      setSubmit("success");
      say(`Box added to the cart, ${money(deal.total)}.`);
      if (submitTimer.current !== null)
        window.clearTimeout(submitTimer.current);
      submitTimer.current = window.setTimeout(() => setSubmit("idle"), 1600);
    };
    let result: void | Promise<unknown>;
    try {
      result = onSubmit?.(ids);
    } catch {
      setSubmit("error");
      say("The box was not added. Try again.");
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSubmit("pending");
      say("Adding the box to the cart.");
      (result as Promise<unknown>).then(done, () => {
        if (!alive.current) return;
        setSubmit("error");
        say("The box was not added. Try again.");
      });
    } else {
      done();
    }
  };

  /* -------------------------------- render ------------------------------- */

  const step = capacity > 1 ? pct / (capacity - 1) : pct;
  const offer =
    subtitle ??
    (savings === "tiered"
      ? `Every bag after the first takes ${r2(step)}% off, up to ${pct}%.`
      : savings === "free"
        ? `Fill all ${word(capacity)} and the cheapest bag is on us.`
        : `Pick ${word(capacity)} single origins and save ${pct}% on the box.`);
  const widest = money(
    r2(products.reduce((s, p) => Math.max(s, p.price), 0) * capacity),
  );
  const n = landed.length;
  const box = picked.length;

  const lidFigure =
    deal.discount > 0
      ? `−${money(deal.discount)}`
      : savings === "free"
        ? "1 free"
        : `${pct}%`;

  const boxColumn = (
    <section aria-label="Your box" className="flex flex-col gap-3">
      {/* The lid, hinged on the box's back edge. */}
      <div style={{ perspective: 640 }}>
        <motion.div
          className={cn(
            "relative flex flex-col gap-1.5 rounded-t-3 border border-b-0 px-3 pt-2.5 pb-3 transition-colors",
            deal.full
              ? "border-success/40 bg-success/8"
              : "border-hairline bg-surface-1",
          )}
          style={{
            rotateX: motionSafe ? lidTilt : 0,
            y: lidHop,
            transformOrigin: "50% 100%",
          }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">
              Box of {capacity}
            </span>
            <Roll
              text={lidFigure}
              widest={`−${widest}`}
              motionSafe={motionSafe}
              className={cn(
                "text-[17px] font-semibold",
                deal.full ? "text-success" : "text-foreground",
              )}
            />
          </div>
          <div className="grid text-[12px]">
            <AnimatePresence initial={false}>
              <motion.span
                key={deal.message}
                aria-hidden
                className={cn(
                  "col-start-1 row-start-1 truncate",
                  deal.full ? "text-success" : "text-ink-2",
                )}
                initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.base } }
                    : { duration: durations.fast }
                }
              >
                {deal.message}
              </motion.span>
            </AnimatePresence>
          </div>
          <div aria-hidden className="flex gap-1">
            {Array.from({ length: capacity }, (_, i) => {
              const tierRate =
                savings === "tiered"
                  ? r2(i === 0 ? 0 : Math.min(pct, step * i))
                  : null;
              return (
                <span key={i} className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="relative h-1.5 overflow-clip rounded-full bg-ink-3/15">
                    <motion.span
                      className={cn(
                        "absolute inset-0 origin-left rounded-full",
                        deal.full ? "bg-success" : "bg-cobalt-bright",
                      )}
                      initial={false}
                      animate={{ scaleX: i < n ? 1 : 0 }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  </span>
                  {tierRate !== null ? (
                    <span className="truncate text-center font-mono text-[9px] text-ink-3 tabular-nums">
                      {tierRate}%
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* The box: compartments, and the bags that have landed in them. */}
      <motion.div
        ref={boxRef}
        className={cn(
          "relative -mt-3 rounded-b-3 border p-1.5 transition-colors",
          flash
            ? "border-danger bg-surface-2"
            : overBox
              ? "border-cobalt-bright bg-cobalt-wash"
              : "border-hairline-strong bg-surface-2",
        )}
        style={{ x: boxX, y: boxY }}
      >
        <div className="relative">
          <div
            aria-hidden
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${capacity}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: capacity }, (_, i) => {
              const id = picked[i];
              const here = !!id && !inFlight.has(id);
              const next = i === box && overBox;
              return (
                <div
                  key={i}
                  className={cn(
                    "[container-type:inline-size] flex flex-col items-center gap-1 rounded-2 border border-dashed p-1.5 transition-colors",
                    next
                      ? "border-cobalt-bright bg-card"
                      : here
                        ? "border-transparent bg-card"
                        : id
                          ? "border-cobalt-bright/60 bg-card"
                          : "border-ink-3/30",
                  )}
                >
                  <div
                    ref={(node) => register("anchor", String(i), node)}
                    className="aspect-[48/56] w-full max-w-14"
                  />
                  <span className="flex h-4 w-full items-center justify-center text-[10px] text-ink-3 @max-[48px]:hidden">
                    {here ? "" : i + 1}
                  </span>
                </div>
              );
            })}
          </div>
          {/* The bags, each drawn at its compartment and sliding between them. */}
          <ul
            role="list"
            aria-label={`Box, ${box} of ${capacity} filled`}
            className="absolute inset-0"
          >
            {picked.map((id, i) =>
              inFlight.has(id) ? null : (
                <SlotItem
                  key={id}
                  product={byId.get(id) as BundleProduct}
                  index={i}
                  capacity={capacity}
                  motionOf={motionOf}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  free={deal.freeId === id}
                  register={register}
                  onRemove={(el) => remove(id, el)}
                />
              ),
            )}
          </ul>
        </div>
      </motion.div>

      {/* The price: the sum struck through once a discount applies. */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] text-ink-3">
            {plural(n, "bag", "bags")}
            {deal.discount > 0 ? (
              <>
                {" · "}
                <span className="font-mono tabular-nums line-through">
                  {money(deal.sum)}
                </span>
              </>
            ) : null}
          </span>
          <span className="flex items-baseline gap-2">
            <Roll
              text={money(deal.total)}
              widest={widest}
              align="start"
              motionSafe={motionSafe}
              className="font-mono text-[20px] font-semibold text-foreground"
            />
          </span>
          <span className="sr-only">
            Total {money(deal.total)}
            {deal.discount > 0 ? `, you save ${money(deal.discount)}` : ""}.
          </span>
        </div>
        {deal.discount > 0 ? (
          <span className="shrink-0 rounded-full bg-success/12 px-2 py-0.5 font-mono text-[11px] text-success tabular-nums">
            −{money(deal.discount)}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-disabled={!deal.full || submit === "pending" || undefined}
        aria-busy={submit === "pending" || undefined}
        onClick={(event) => doSubmit(event.currentTarget)}
        className={cn(
          "relative inline-flex h-10 items-center justify-center gap-2 rounded-2 px-4 text-[13px] font-medium transition-colors",
          deal.full
            ? submit === "error"
              ? "bg-danger text-background"
              : "bg-primary text-primary-foreground hover:opacity-90"
            : "cursor-not-allowed bg-surface-2 text-ink-3",
          disabled && "cursor-not-allowed opacity-50",
          FOCUS,
        )}
      >
        {submit === "pending" ? (
          <motion.span
            aria-hidden
            className="size-4 rounded-full border-2 border-current border-t-transparent"
            animate={motionSafe ? { rotate: 360 } : { opacity: [1, 0.4] }}
            transition={
              motionSafe
                ? { duration: 0.8, ease: "linear", repeat: Infinity }
                : { duration: 0.8, repeat: Infinity, repeatType: "reverse" }
            }
          />
        ) : submit === "success" ? (
          <DrawnCheck motionSafe={motionSafe} />
        ) : null}
        <span>
          {!deal.full
            ? `Pick ${capacity - box} more`
            : submit === "pending"
              ? "Adding"
              : submit === "success"
                ? "Added"
                : submit === "error"
                  ? "Try again"
                  : `${submitLabel} · ${money(deal.total)}`}
        </span>
      </button>
    </section>
  );

  const shelf =
    products.length === 0 ? (
      <p className="rounded-3 border border-dashed border-hairline px-4 py-10 text-center text-[13px] text-ink-3">
        Nothing on the shelf right now.
      </p>
    ) : (
      <ul
        role="list"
        aria-label="Shelf"
        className="grid grid-cols-2 gap-2.5 @min-[40rem]:grid-cols-3 @min-[60rem]:grid-cols-4"
      >
        {products.map((p) => (
          <li key={p.id} className="min-w-0">
            <ShelfTile
              product={p}
              money={money}
              inBox={picked.includes(p.id)}
              away={goingHome.has(p.id)}
              aloft={aloft.has(p.id)}
              full={box >= capacity}
              motionSafe={motionSafe}
              disabled={disabled}
              motionOf={motionOf}
              register={register}
              onToggle={(el) => toggle(p.id, el)}
              onDragStart={(point) => dragStart(p.id, point)}
              onDragMove={dragMove}
              onDragEnd={dragEnd}
              onDragCancel={dragCancel}
            />
          </li>
        ))}
      </ul>
    );

  const body = () => {
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className="grid gap-4 px-4 pb-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_17rem]"
        >
          <p className="sr-only">Loading the shelf.</p>
          <div className="grid grid-cols-2 gap-2.5 @min-[48rem]:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-3 border border-hairline p-2"
              >
                <span className="aspect-[6/5] rounded-2 bg-surface-2" />
                <span className="h-3 w-2/3 rounded-1 bg-surface-2" />
                <span className="h-3 w-1/3 rounded-1 bg-surface-2" />
              </div>
            ))}
          </div>
          <span className="h-48 rounded-3 bg-surface-2 @max-[40rem]:order-first" />
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The shelf did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
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
      <div className="flex flex-col gap-3 px-4 pb-4 @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1fr)_16rem] @min-[40rem]:items-start @min-[40rem]:gap-5 @min-[60rem]:grid-cols-[minmax(0,1fr)_19rem]">
        {/* On a phone the box rides at the top while the shelf scrolls under it. */}
        <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-card px-4 pt-1 pb-3 @min-[40rem]:col-start-2 @min-[40rem]:row-start-1 @min-[40rem]:mx-0 @min-[40rem]:border-0 @min-[40rem]:px-0 @min-[40rem]:pt-0 @min-[40rem]:pb-0">
          {boxColumn}
        </div>
        <div className="min-w-0 @min-[40rem]:col-start-1 @min-[40rem]:row-start-1">
          {shelf}
        </div>
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
        "@container relative w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground [contain:paint]",
        disabled && "opacity-70",
        className,
      )}
    >
      <div
        ref={scrollerRef}
        className="relative max-h-[558px] [scrollbar-width:thin] overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <header className="flex flex-col gap-0.5 px-4 pt-4 pb-3">
          <h2
            id={titleId}
            className="text-[15px] font-semibold text-foreground"
          >
            {title}
          </h2>
          <p className="text-[12px] text-ink-3">{offer}</p>
        </header>
        {body()}
      </div>

      {/* The flight layer: over the root's visible box, clipped by it. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
        {flights.map((f) => {
          const p = byId.get(f.id);
          return p ? (
            <motion.div
              key={f.key}
              className="absolute top-0 left-0 drop-shadow-md"
              style={{
                width: f.w,
                height: f.h,
                marginLeft: r2(-f.w / 2),
                marginTop: r2(-f.h / 2),
                x: f.cx,
                y: f.cy,
                scale: f.s,
                rotate: f.r,
                opacity: f.o,
              }}
            >
              <BagArt product={p} className="size-full" />
            </motion.div>
          ) : null;
        })}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/* ------------------------------ a slot's bag ----------------------------- */

function SlotItem({
  product: p,
  index,
  capacity,
  motionOf,
  motionSafe,
  disabled,
  free,
  register,
  onRemove,
}: {
  product: BundleProduct;
  index: number;
  capacity: number;
  motionOf: (id: string, at?: number) => BagMotion;
  motionSafe: boolean;
  disabled: boolean;
  free: boolean;
  register: (
    kind: NodeKind,
    id: string,
    node: Element | null,
  ) => (() => void) | undefined;
  onRemove: (el: HTMLElement) => void;
}) {
  const m = motionOf(p.id, index);
  // One compartment is the item's own width plus the 6px gap.
  const x = useTransform(
    m.pos,
    (v) => `calc(${r2(v * 100)}% + ${r2(v * 6)}px)`,
  );
  return (
    <motion.li
      className="[container-type:inline-size] absolute top-0 left-0 flex h-full flex-col items-center gap-1 p-1.5"
      style={{
        width: `calc((100% - ${(capacity - 1) * 6}px) / ${capacity})`,
        x,
      }}
      initial={motionSafe ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.fast }}
    >
      <motion.div
        className="relative aspect-[48/56] w-full max-w-14"
        style={{
          scaleX: m.sx,
          scaleY: m.sy,
          originX: 0.5,
          originY: 1,
        }}
      >
        <BagArt product={p} className="size-full" />
        {free ? (
          <span className="absolute -top-1 left-1/2 inline-flex h-4 -translate-x-1/2 items-center rounded-full bg-success px-1.5 text-[9px] font-semibold text-background">
            Free
          </span>
        ) : null}
      </motion.div>
      <span
        className="h-4 w-full truncate text-center text-[10px] text-foreground @max-[48px]:hidden"
        title={p.name}
      >
        {p.name}
      </span>
      <button
        ref={(node) => register("remove", p.id, node)}
        type="button"
        disabled={disabled}
        aria-label={`Remove ${p.name} from the box`}
        onClick={(event) => onRemove(event.currentTarget)}
        className={cn(
          "absolute top-0.5 right-0.5 inline-flex size-6 items-center justify-center rounded-full border border-hairline bg-card text-ink-2 shadow-sm transition-[opacity,color] hover:text-foreground disabled:cursor-not-allowed @max-[4.5rem]:size-5",
          FOCUS,
        )}
      >
        <X aria-hidden className="size-3" />
      </button>
    </motion.li>
  );
}
