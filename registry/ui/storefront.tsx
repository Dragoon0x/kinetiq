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
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  ShoppingBag,
  Star,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";
import { CartDrawer, type CartLine } from "@/registry/ui/cart-drawer";
import {
  defaultProduct,
  ProductDetail,
  type ProductInfo,
  type ProductSelection,
} from "@/registry/ui/product-detail";
import {
  defaultProductColors,
  defaultProducts,
  ProductGrid,
  type ProductGridColor,
  type ProductGridFilters,
  type ProductGridItem,
  type ProductGridPriceBand,
  type ProductGridSort,
  type ProductShape,
} from "@/registry/ui/product-grid";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type StorefrontHero = "banner" | "split" | "off";
export type StorefrontDensity = "compact" | "regular" | "roomy";
export type StorefrontStatus = "ready" | "loading" | "error";

/** Home, the featured product's page, or the shelf for a category or a collection. */
export type StoreScreen =
  "home" | "product" | `category:${string}` | `collection:${string}`;

export type StoreCollection = {
  id: string;
  /** The rail's heading. */
  title: string;
  /** One quiet line beside it. */
  subtitle?: string;
  /** Product ids, in rail order. */
  products: string[];
  /** How See all opens the shelf. */
  shelf?: { sort?: ProductGridSort; price?: string | null };
};

export type StoreHero = {
  eyebrow: string;
  title: string;
  body: string;
  /** The button's words; it opens the featured product. */
  cta: string;
};

export type StorefrontProps = {
  /** How many collections show as rails on the home, 1 to 3. @default 2 */
  rails?: number;
  /** The hero: a banner with the copy over the still life, a split with it beside, or none. @default "banner" */
  hero?: StorefrontHero;
  /** Rail card widths and how much each says; also the shelf's density. @default "regular" */
  density?: StorefrontDensity;
  /** The catalogue. @default product-grid's defaultProducts */
  products?: ProductGridItem[];
  /** The glazes products come in. @default product-grid's defaultProductColors */
  colors?: ProductGridColor[];
  /** The rails, in order. @default defaultStoreCollections */
  collections?: StoreCollection[];
  /** The product the hero opens, as a full product page. @default product-detail's defaultProduct */
  featured?: ProductInfo;
  /** The hero's words. @default defaultStoreHero */
  heroCopy?: StoreHero;
  /** Controlled lines in the bag. */
  items?: CartLine[];
  /** Initial bag when uncontrolled. @default [] */
  defaultItems?: CartLine[];
  /** Fires from the quick add, shelf, product page or bag that changed the lines, with all of them. */
  onItemsChange?: (items: CartLine[]) => void;
  /** Controlled: the bag is open. */
  cartOpen?: boolean;
  /** Initially open when uncontrolled. @default false */
  defaultCartOpen?: boolean;
  onCartOpenChange?: (open: boolean) => void;
  /** Controlled screen. */
  screen?: StoreScreen;
  /** Initial screen when uncontrolled. @default "home" */
  defaultScreen?: StoreScreen;
  onScreenChange?: (screen: StoreScreen) => void;
  /** Something went in the bag, with the line as it now stands. */
  onAdd?: (line: CartLine) => void;
  /** Checkout was pressed in the bag. Return a promise to hold it pending. */
  onCheckout?: (items: CartLine[], total: number) => void | Promise<void>;
  /** The moment delivery estimates count from (Date or ms). @default defaultStoreNow */
  now?: Date | number;
  /** Money. @default euros, en-IE */
  format?: (amount: number) => string;
  /** The store's name in the top bar. @default "Fernworks Supply" */
  storeName?: string;
  /** Loading draws placeholder cards; error offers Retry. @default "ready" */
  status?: StorefrontStatus;
  onRetry?: () => void;
  /** The screen's accessible name. @default "Store" */
  label?: string;
  /** Play the adds, the pushes and the bag. Off unless asked for. @default false */
  sound?: boolean;
  /** Browse only: nothing can be added or bought. */
  disabled?: boolean;
  /** Classes for the root. It is 560px tall by default; pass a height class to change it. */
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Defaults: Fernworks Supply on a Friday in October                    */
/* ------------------------------------------------------------------ */

/** Friday 2 October 2026, 09:30 UTC. */
export const defaultStoreNow = Date.UTC(2026, 9, 2, 9, 30);

const idsBy = (
  pick: (p: ProductGridItem) => boolean,
  order: (a: ProductGridItem, b: ProductGridItem) => number,
  n = 8,
) =>
  [...defaultProducts]
    .filter(pick)
    .sort(order)
    .slice(0, n)
    .map((p) => p.id);

export const defaultStoreCollections: StoreCollection[] = [
  {
    id: "new",
    title: "New this season",
    subtitle: "Thrown this autumn",
    products: idsBy(
      () => true,
      (a, b) => b.added - a.added,
    ),
    shelf: { sort: "newest" },
  },
  {
    id: "best",
    title: "Bestsellers",
    subtitle: "What kitchens keep",
    products: idsBy(
      () => true,
      (a, b) => b.reviews - a.reviews,
    ),
    shelf: { sort: "rating" },
  },
  {
    id: "under-40",
    title: "Under €40",
    subtitle: "Small gifts, real stoneware",
    products: idsBy(
      (p) => p.price < 40,
      (a, b) => a.price - b.price,
    ),
    shelf: { sort: "price-asc", price: "under-40" },
  },
];

export const defaultStoreHero: StoreHero = {
  eyebrow: "New glazes",
  title: "The Field Mug, in four colours",
  body: "Thrown by hand, speckled with iron, and no two alike.",
  cta: "Shop the Field Mug",
};

/* ------------------------------------------------------------------ */
/* Look and helpers                                                     */
/* ------------------------------------------------------------------ */

type Mode = "phone" | "tablet" | "desktop";
type Said = { n: number; text: string };

const PHONE_MAX = 640;
const DESKTOP_MIN = 1040;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const TOOL = cn(
  "inline-flex size-9 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  FOCUS,
);

const CARD_W: Record<StorefrontDensity, [number, number]> = {
  compact: [124, 132],
  regular: [148, 160],
  roomy: [172, 196],
};

const PRICE_BANDS: ProductGridPriceBand[] = [
  { id: "under-25", label: "Under €25", min: 0, max: 25 },
  { id: "under-40", label: "Under €40", min: 0, max: 40 },
  { id: "40-100", label: "€40–100", min: 40, max: 100 },
  { id: "over-100", label: "€100+", min: 100 },
];
const NO_FILTERS: ProductGridFilters = {
  categories: [],
  colors: [],
  price: null,
  inStock: false,
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const cents = (v: number) => Math.round(v * 100) / 100;
const toMs = (v: Date | number) => (typeof v === "number" ? v : v.getTime());
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const euros = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});
const defaultFormat = (n: number) => euros.format(n);
const shade = (tint: string) => `color-mix(in oklab, ${tint} 70%, black)`;
const light = (tint: string) => `color-mix(in oklab, ${tint} 72%, white)`;
const panOf = (el?: Element | null) => {
  const rect = el?.getBoundingClientRect();
  return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
};

/**
 * A product, drawn: a 64-unit still life of its shape in its glaze, so the
 * shop needs no photographs and every glaze reads in both themes.
 */
function ShapeArt({
  shape,
  tint,
  className,
}: {
  shape: ProductShape;
  tint: string;
  className?: string;
}) {
  const body = { fill: tint };
  const dark = { fill: shade(tint) };
  const lit = { fill: light(tint) };
  const line = {
    fill: "none",
    stroke: shade(tint),
    strokeWidth: 3.5,
    strokeLinecap: "round" as const,
  };
  let art: React.ReactNode;
  switch (shape) {
    case "mug":
      art = (
        <>
          <path d="M42 29h3.5a6.5 6.5 0 0 1 0 13H42" style={line} />
          <rect x={17} y={22} width={26} height={31} rx={5} style={body} />
          <rect x={17} y={22} width={26} height={4.5} rx={2.2} style={lit} />
        </>
      );
      break;
    case "cup":
      art = (
        <>
          <ellipse cx={32} cy={51} rx={20} ry={3.6} style={dark} />
          <path d="M45 33h2a4.5 4.5 0 0 1 0 9h-3.5" style={line} />
          <path
            d="M17 30h30l-3 15.5a5 5 0 0 1-5 4H25a5 5 0 0 1-5-4Z"
            style={body}
          />
          <rect x={17} y={29} width={30} height={3.2} rx={1.6} style={lit} />
        </>
      );
      break;
    case "tumbler":
      art = (
        <>
          <path d="M19 15h26l-3.6 37H22.6Z" style={body} />
          <path d="M19 15h26l-0.6 6H19.6Z" style={lit} />
          <path d="M22 41h20l-0.9 11H22.9Z" style={dark} />
        </>
      );
      break;
    case "kettle":
      art = (
        <>
          <path d="M47 38 57 27" style={line} />
          <path
            d="M22 30c0-8 4.5-12.5 10-12.5S42 22 42 30"
            style={{ ...line, strokeWidth: 3 }}
          />
          <path
            d="M15 52h34l2-15a5.5 5.5 0 0 0-5.5-6.5H18.5A5.5 5.5 0 0 0 13 37Z"
            style={body}
          />
          <rect x={28} y={26.5} width={8} height={4} rx={2} style={dark} />
        </>
      );
      break;
    case "dripper":
      art = (
        <>
          <path d="M23 44h18l-2 8H25Z" style={dark} />
          <path d="M12 18h40L42 38H22Z" style={body} />
          <rect x={18.5} y={38} width={27} height={4} rx={2} style={dark} />
          <path d="M12 18h40l-1.5 3.2h-37Z" style={lit} />
        </>
      );
      break;
    case "carafe":
      art = (
        <>
          <path
            d="M27 10h10v11c0 3 10.5 7 10.5 17.5V48a4 4 0 0 1-4 4h-23a4 4 0 0 1-4-4V38.5C16.5 28 27 24 27 21Z"
            style={body}
          />
          <rect x={25.5} y={19} width={13} height={5} rx={2} style={dark} />
          <path
            d="M19.5 40h25v8a2 2 0 0 1-2 2h-21a2 2 0 0 1-2-2Z"
            style={lit}
          />
        </>
      );
      break;
    case "grinder":
      art = (
        <>
          <path d="M32 18v-7h13" style={{ ...line, strokeWidth: 3 }} />
          <circle cx={46} cy={11} r={3.5} style={dark} />
          <rect x={20.5} y={24} width={23} height={28} rx={4} style={body} />
          <rect x={18.5} y={18} width={27} height={7} rx={2.5} style={dark} />
          <rect x={20.5} y={44} width={23} height={3} style={lit} />
        </>
      );
      break;
    case "scale":
      art = (
        <>
          <rect x={8} y={39} width={48} height={13} rx={3} style={body} />
          <rect x={10} y={35} width={44} height={5} rx={2.5} style={dark} />
          <rect x={25} y={43.5} width={14} height={5} rx={1} style={lit} />
        </>
      );
      break;
    case "canister":
      art = (
        <>
          <rect x={18.5} y={22} width={27} height={30} rx={4} style={body} />
          <rect x={16.5} y={16} width={31} height={7} rx={3} style={dark} />
          <rect x={29} y={11.5} width={6} height={5} rx={2} style={dark} />
          <rect x={18.5} y={30} width={27} height={9} style={lit} />
        </>
      );
      break;
    case "jar":
      art = (
        <>
          <rect x={14.5} y={24} width={35} height={28} rx={9} style={body} />
          <rect x={20} y={17} width={24} height={8} rx={2.5} style={dark} />
          <rect x={20} y={33} width={8} height={14} rx={4} style={lit} />
        </>
      );
      break;
    case "bowl":
      art = (
        <>
          <rect x={24} y={48} width={16} height={4} rx={2} style={dark} />
          <path d="M9 30h46c0 10-10 18-23 18S9 40 9 30Z" style={body} />
          <ellipse cx={32} cy={30} rx={23} ry={3.4} style={lit} />
        </>
      );
      break;
    default:
      art = (
        <>
          <path d="M44 24c6 0 8 5 6 10l-4 7" style={line} />
          <path
            d="M19 14h22l3 6-2 30a3 3 0 0 1-3 2.6H23a3 3 0 0 1-3-2.6L18 20Z"
            style={body}
          />
          <path d="M19 14h22l2 4H17Z" style={lit} />
          <path d="M14 18l5-1 1 5Z" style={dark} />
        </>
      );
  }
  return (
    <svg aria-hidden viewBox="0 0 64 64" className={cn("block", className)}>
      <ellipse cx={32} cy={53.5} rx={19} ry={2.2} fill="black" opacity={0.08} />
      {art}
    </svg>
  );
}

/** A number whose digits roll: up when it grows, down when it shrinks. */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [seen, setSeen] = React.useState({ value, dir: 1 });
  if (seen.value !== value) {
    setSeen({ value, dir: value > seen.value ? 1 : -1 });
  }
  const dir = seen.value === value ? seen.dir : value > seen.value ? 1 : -1;
  const variants = {
    enter: (d: number) => ({ y: motionSafe ? d * 8 : 0, opacity: 0 }),
    rest: { y: 0, opacity: 1 },
    leave: (d: number) => ({
      y: motionSafe ? -d * 8 : 0,
      opacity: 0,
      transition: exitFor(durations.fast),
    }),
  };
  return (
    <span className="relative inline-grid overflow-hidden tabular-nums">
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={`v${value}`}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="rest"
          exit="leave"
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
          className="[grid-area:1/1]"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function StackScreen({
  index,
  depth,
  level,
  motionSafe,
  children,
}: {
  index: number;
  depth: MotionValue<number>;
  level: number;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  // A pushed screen comes in from the right edge; the one beneath slides a
  // little over a quarter of the way left and dims, so a push reads as depth.
  const x = useTransform(depth, (d) =>
    motionSafe ? `${r2((index - d) * (index > d ? 100 : 28))}%` : "0%",
  );
  const dim = useTransform(depth, (d) =>
    r2(Math.min(1, Math.max(0, d - index)) * 0.3),
  );
  const on = index === level;
  return (
    <motion.div
      aria-hidden={!on || undefined}
      inert={!on}
      className="absolute inset-0 overflow-hidden bg-background"
      style={{ x, zIndex: index }}
      animate={motionSafe ? undefined : { opacity: on ? 1 : 0 }}
      transition={{ duration: durations.fast }}
    >
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,black_100%,transparent)]"
        style={{ opacity: dim }}
      />
    </motion.div>
  );
}

/** The strip along a pushed screen's left edge that takes a back-swipe. */
function EdgeBack({
  width,
  level,
  depth,
  onGrab,
  onBack,
}: {
  width: number;
  level: number;
  depth: MotionValue<number>;
  onGrab: () => void;
  onBack: () => void;
}) {
  const dx = React.useRef(0);
  const settle = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => () => settle.current?.stop(), []);
  const drag = useDrag({
    axis: "x",
    threshold: 6,
    onStart: () => {
      dx.current = 0;
      settle.current?.stop();
      onGrab();
    },
    onMove: ({ offset }) => {
      dx.current = offset.x;
      const w = Math.max(1, width);
      // 1:1 back toward the screen beneath; pulled the other way it resists.
      const d =
        offset.x >= 0
          ? level - Math.min(offset.x, w) / w
          : level + rubberband(-offset.x, w * 0.4) / w;
      depth.set(Math.round(d * 1000) / 1000);
    },
    onEnd: ({ velocity }) => {
      const rest = project(dx.current, velocity.x, 0.99);
      if (rest > width / 2) {
        onBack();
        return;
      }
      settle.current = animate(depth, level, {
        ...springs.glide,
        velocity: -velocity.x / Math.max(1, width),
      });
    },
    onCancel: () => {
      settle.current = animate(depth, level, springs.glide);
    },
    onTap: (event) => {
      // The strip lies over the screen's left edge; a tap is meant for
      // whatever is under it.
      const strip = event.currentTarget as Element;
      const below = document
        .elementsFromPoint(event.clientX, event.clientY)
        .find((n) => n !== strip && !strip.contains(n));
      const target = below?.closest<HTMLElement>(
        "button, a[href], textarea, input, [tabindex]",
      );
      if (!target) return;
      if (target.matches("textarea, input")) target.focus();
      else target.click();
    },
  });
  return (
    <div
      aria-hidden
      {...drag}
      onPointerDown={(event) => {
        drag.onPointerDown(event);
        // Nothing here is clicked, so the strip may hold the pointer at once:
        // a mouse pull that leaves the 16px strip on its first move is
        // still this drag.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A synthetic pointer cannot be captured; the drag still works.
        }
      }}
      className="absolute inset-y-0 left-0 z-30 w-4 cursor-grab touch-pan-y"
    />
  );
}

type Flight = {
  key: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  tint: string;
  qty: number;
};

/**
 * The dot a quick add throws to the bag: x moves at a steady rate while y
 * is thrown up and falls back under gravity, so the tween is the physics.
 */
function FlightDot({
  flight,
  onLand,
}: {
  flight: Flight;
  onLand: (key: number) => void;
}) {
  const t = useMotionValue(0);
  const dx = flight.to.x - flight.from.x;
  const dy = flight.to.y - flight.from.y;
  const lift = Math.max(48, Math.min(140, Math.abs(dx) * 0.35 + 40));
  const x = useTransform(t, (k) => r2(flight.from.x + dx * k));
  const y = useTransform(t, (k) =>
    r2(flight.from.y + dy * k - lift * 4 * k * (1 - k)),
  );
  const scale = useTransform(t, (k) => r2(1 - 0.45 * k));
  React.useEffect(() => {
    // A re-run carries the throw on from wherever it was, for the time it
    // had left, rather than freezing it mid-air or starting it over.
    const c = animate(t, 1, {
      duration: Math.max(0.05, 0.56 * (1 - t.get())),
      ease: "linear",
      onComplete: () => onLand(flight.key),
    });
    return () => c.stop();
  }, [t, flight.key, onLand]);
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-40 -mt-1.5 -ml-1.5 size-3 rounded-full ring-2 ring-background"
      style={{ x, y, scale, background: flight.tint }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* A rail                                                               */
/* ------------------------------------------------------------------ */

type RailProps = {
  collection: StoreCollection;
  items: ProductGridItem[];
  colorOf: (id: string) => ProductGridColor | undefined;
  cardW: number;
  arrows: boolean;
  density: StorefrontDensity;
  motionSafe: boolean;
  disabled: boolean;
  format: (n: number) => string;
  added: Record<string, number>;
  onOpen: (p: ProductGridItem, by: HTMLElement) => void;
  onQuickAdd: (p: ProductGridItem, by: HTMLElement) => void;
  onSeeAll: (by: HTMLElement) => void;
};

function Rail({
  collection,
  items,
  colorOf,
  cardW,
  arrows,
  density,
  motionSafe,
  disabled,
  format,
  added,
  onOpen,
  onQuickAdd,
  onSeeAll,
}: RailProps) {
  const uid = React.useId();
  const headId = `${uid}-head`;
  const [scroller, setScroller] = React.useState<HTMLUListElement | null>(null);
  // Handlers move the scroll through a ref; the state only binds listeners.
  const scrollRef = React.useRef<HTMLUListElement | null>(null);
  const [edges, setEdges] = React.useState({ start: true, end: false });
  const [roving, setRoving] = React.useState(items[0]?.id ?? "");
  const cards = React.useRef(new Map<string, HTMLButtonElement>());
  const glide = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    if (!scroller) return;
    const read = () =>
      setEdges({
        start: scroller.scrollLeft <= 2,
        end:
          scroller.scrollLeft + scroller.clientWidth >=
          scroller.scrollWidth - 2,
      });
    read();
    scroller.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", read);
      ro.disconnect();
      glide.current?.stop();
    };
  }, [scroller]);

  const scrollTo = (left: number) => {
    const el = scrollRef.current;
    if (!el) return;
    glide.current?.stop();
    const max = el.scrollWidth - el.clientWidth;
    const target = Math.max(0, Math.min(max, Math.round(left)));
    if (!motionSafe) {
      el.scrollLeft = target;
      return;
    }
    // Snap points would fight a frame-by-frame scroll; they are lifted for
    // the glide and come back when it lands.
    el.style.scrollSnapType = "none";
    glide.current = animate(el.scrollLeft, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollLeft = Math.round(v);
      },
      onComplete: () => {
        el.style.scrollSnapType = "";
      },
    });
  };
  const page = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (el) scrollTo(el.scrollLeft + dir * el.clientWidth * 0.8);
  };

  const onKey = (event: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const go = (j: number) => {
      const p = items[Math.min(items.length - 1, Math.max(0, j))];
      if (!p) return;
      setRoving(p.id);
      const node = cards.current.get(p.id);
      node?.focus({ preventScroll: true });
      const li = node?.closest("li");
      if (li && scroller) {
        const left = li.offsetLeft - 16;
        const right =
          li.offsetLeft + li.offsetWidth - scroller.clientWidth + 16;
        if (left < scroller.scrollLeft) scrollTo(left);
        else if (right > scroller.scrollLeft) scrollTo(right);
      }
    };
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        go(i + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        go(i - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(items.length - 1);
        return;
    }
  };

  return (
    <section aria-labelledby={headId} className="flex flex-col gap-2.5 py-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1 px-4">
        <div className="min-w-0 flex-[1_1_10rem]">
          <h3 id={headId} className="truncate text-[15px] font-semibold">
            {collection.title}
          </h3>
          {collection.subtitle ? (
            <p className="truncate text-xs text-ink-3">{collection.subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {arrows ? (
            <>
              <button
                type="button"
                aria-label={`Scroll ${collection.title} back`}
                aria-disabled={edges.start || undefined}
                onClick={() => page(-1)}
                className={cn(TOOL, "size-8 aria-disabled:opacity-40")}
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Scroll ${collection.title} on`}
                aria-disabled={edges.end || undefined}
                onClick={() => page(1)}
                className={cn(TOOL, "size-8 aria-disabled:opacity-40")}
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={(event) => onSeeAll(event.currentTarget)}
            className={cn(
              "inline-flex h-8 items-center rounded-2 px-2 text-xs font-medium text-cobalt-bright transition-colors hover:bg-cobalt-wash",
              FOCUS,
            )}
          >
            See all
          </button>
        </div>
      </div>
      <ul
        ref={(node) => {
          scrollRef.current = node;
          setScroller(node);
        }}
        role="list"
        aria-labelledby={headId}
        className={cn(
          "relative flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1",
          !edges.start && !edges.end
            ? "[mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-28px),transparent)]"
            : !edges.start
              ? "[mask-image:linear-gradient(to_right,transparent,black_20px)]"
              : !edges.end
                ? "[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]"
                : "",
        )}
      >
        {items.map((p, i) => {
          const glaze = colorOf(p.colors[0] ?? "");
          const tint = glaze?.tint ?? "var(--ink-3)";
          const sold = p.stock <= 0;
          const done = added[p.id] ?? 0;
          const on = p.id === roving;
          return (
            <li
              key={p.id}
              className="shrink-0 snap-start"
              style={{ width: cardW }}
            >
              <article className="flex flex-col gap-1.5">
                <div className="relative">
                  <button
                    ref={(node) => {
                      if (node) cards.current.set(p.id, node);
                      else cards.current.delete(p.id);
                    }}
                    type="button"
                    tabIndex={on ? 0 : -1}
                    aria-label={`${p.name}, ${format(p.price)}${sold ? ", sold out" : ""}`}
                    onFocus={() => setRoving(p.id)}
                    onKeyDown={(event) => onKey(event, i)}
                    onClick={(event) => onOpen(p, event.currentTarget)}
                    className={cn(
                      "group/storefront-card block aspect-square w-full overflow-hidden rounded-3 bg-surface-2 transition-colors hover:bg-surface-1",
                      FOCUS,
                    )}
                  >
                    <ShapeArt
                      shape={p.shape}
                      tint={tint}
                      className={cn(
                        "size-full transition-transform duration-300 ease-out",
                        motionSafe &&
                          "group-hover/storefront-card:scale-[1.04]",
                        sold && "opacity-50 grayscale",
                      )}
                    />
                  </button>
                  {p.badge || sold ? (
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute top-2 left-2 rounded-full px-1.5 text-[10px] leading-4 font-medium",
                        sold
                          ? "bg-foreground/80 text-background"
                          : "bg-card/90 text-foreground",
                      )}
                    >
                      {sold ? "Sold out" : p.badge}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    tabIndex={on ? 0 : -1}
                    aria-label={
                      sold
                        ? `${p.name} is sold out`
                        : done
                          ? `Added ${p.name}. Add another`
                          : `Add ${p.name} to bag`
                    }
                    aria-disabled={sold || undefined}
                    disabled={disabled}
                    onClick={(event) => {
                      if (!sold) onQuickAdd(p, event.currentTarget);
                    }}
                    className={cn(
                      "absolute right-2 bottom-2 inline-flex size-8 items-center justify-center rounded-full border shadow-[0_2px_8px_color-mix(in_oklab,black_14%,transparent)] transition-colors",
                      sold
                        ? "border-hairline bg-card/80 text-ink-3"
                        : done
                          ? "border-success/40 bg-success text-background"
                          : "border-hairline bg-card text-foreground hover:bg-primary hover:text-primary-foreground",
                      "disabled:cursor-not-allowed",
                      FOCUS,
                    )}
                  >
                    {done ? (
                      <svg aria-hidden viewBox="0 0 16 16" className="size-4">
                        <motion.path
                          key={done}
                          d="M3.5 8.4 6.6 11.4 12.5 4.8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={{ pathLength: motionSafe ? 0 : 1 }}
                          animate={{ pathLength: 1 }}
                          transition={
                            motionSafe ? springs.flick : { duration: 0 }
                          }
                        />
                      </svg>
                    ) : (
                      <Plus aria-hidden className="size-4" />
                    )}
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 px-0.5">
                  <p
                    className="truncate text-[13px] leading-5 font-medium"
                    title={p.name}
                  >
                    {p.name}
                  </p>
                  <p className="flex items-baseline gap-1.5 text-xs tabular-nums">
                    <span className="font-medium text-foreground">
                      {format(p.price)}
                    </span>
                    {p.compareAt && p.compareAt > p.price ? (
                      <span className="text-ink-3 line-through">
                        {format(p.compareAt)}
                      </span>
                    ) : null}
                  </p>
                  {density !== "compact" ? (
                    <p className="flex items-center gap-1 text-[11px] text-ink-3 tabular-nums">
                      <Star
                        aria-hidden
                        className="size-3 fill-current text-warn"
                      />
                      {p.rating.toFixed(1)}
                      <span>({p.reviews})</span>
                      {density === "roomy" ? (
                        <span className="ml-auto flex gap-0.5">
                          {p.colors.slice(0, 4).map((c) => (
                            <span
                              key={c}
                              aria-hidden
                              className="size-2.5 rounded-full ring-1 ring-hairline"
                              style={{ background: colorOf(c)?.tint }}
                            />
                          ))}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

/**
 * A complete store home: a hero, a category rail, product rails and a bag.
 * The whole store is cart-drawer's page, so the bag slides over it on glide
 * and can be pulled shut; a category or See all pushes product-grid's shelf
 * in from the right on glide, and the hero opens product-detail's page for
 * the featured product.
 *
 * Quick add is the signature: a dot in the glaze leaves the card's button
 * and flies to the bag on a true arc — x steady, y thrown up and falling —
 * shrinking as it goes; when it lands the badge bumps on recoil, its count
 * rolls, and the button draws a check on flick. Rails scroll-snap, glide a
 * page at a time from their arrows, and take Left, Right, Home and End.
 * Pushed screens go back with Back, Alt+Left or a 1:1 swipe from their left
 * edge that commits by projection. Under reduced motion nothing flies or
 * slides: screens cross-fade, the count changes in place and the check
 * appears.
 */
export function Storefront({
  rails = 2,
  hero = "banner",
  density = "regular",
  products = defaultProducts,
  colors = defaultProductColors,
  collections = defaultStoreCollections,
  featured = defaultProduct,
  heroCopy = defaultStoreHero,
  items,
  defaultItems,
  onItemsChange,
  cartOpen,
  defaultCartOpen = false,
  onCartOpenChange,
  screen,
  defaultScreen = "home",
  onScreenChange,
  onAdd,
  onCheckout,
  now = defaultStoreNow,
  format = defaultFormat,
  storeName = "Fernworks Supply",
  status = "ready",
  onRetry,
  label = "Store",
  sound = false,
  disabled = false,
  className,
}: StorefrontProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const screenHeadId = `${uid}-screen`;
  const headIdOf = (s: StoreScreen) =>
    `${screenHeadId}-${s.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const nowMs = toMs(now);

  /* ------------------------------ the data ------------------------------ */

  const byId = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const colorOf = React.useCallback(
    (id: string) => colors.find((c) => c.id === id),
    [colors],
  );
  const categories = React.useMemo(() => {
    const seen = new Map<string, ProductGridItem[]>();
    for (const p of products) {
      const list = seen.get(p.category) ?? [];
      list.push(p);
      seen.set(p.category, list);
    }
    return [...seen.entries()].map(([name, list]) => ({ name, list }));
  }, [products]);

  const [ownItems, setOwnItems] = React.useState<CartLine[]>(
    () => defaultItems ?? [],
  );
  const bag = items ?? ownItems;
  const bagRef = React.useRef(bag);
  React.useEffect(() => {
    bagRef.current = bag;
  }, [bag]);
  const commit = (next: CartLine[]) => {
    bagRef.current = next;
    if (items === undefined) setOwnItems(next);
    onItemsChange?.(next);
  };

  const [ownOpen, setOwnOpen] = React.useState(defaultCartOpen);
  const isOpen = cartOpen ?? ownOpen;
  const setOpen = (open: boolean) => {
    if (cartOpen === undefined) setOwnOpen(open);
    onCartOpenChange?.(open);
  };

  const [ownScreen, setOwnScreen] = React.useState<StoreScreen>(defaultScreen);
  const current = screen ?? ownScreen;
  // The pushed screen keeps drawing while it slides away.
  const [lastPushed, setLastPushed] = React.useState<StoreScreen>(
    current === "home" ? "product" : current,
  );
  if (current !== "home" && current !== lastPushed) setLastPushed(current);

  const count = bag.reduce(
    (n, l) => n + Math.max(0, Math.round(l.quantity)),
    0,
  );

  /* ------------------------------ the frame ----------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    if (!root) return;
    const read = () => setWidth(Math.round(root.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);
  const W = width ?? 760;
  const mode: Mode =
    W < PHONE_MAX ? "phone" : W >= DESKTOP_MIN ? "desktop" : "tablet";
  const phone = mode === "phone";
  const cardW = (CARD_W[density] ?? CARD_W.regular)[phone ? 0 : 1];
  const heroMode: StorefrontHero = hero === "split" && phone ? "banner" : hero;

  const level = current === "home" ? 0 : 1;
  const depth = useMotionValue(level);
  const depthAnim = React.useRef<AnimationPlaybackControls | null>(null);
  React.useLayoutEffect(() => {
    depthAnim.current?.stop();
    if (!motionSafe) depth.jump(level);
    else if (Math.abs(depth.get() - level) > 0.001) {
      depthAnim.current = animate(depth, level, springs.glide);
    }
  }, [level, motionSafe, depth]);
  React.useEffect(() => () => depthAnim.current?.stop(), []);

  /* ------------------------------- state -------------------------------- */

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [added, setAdded] = React.useState<Record<string, number>>({});
  const [shelf, setShelf] = React.useState<{
    filters: ProductGridFilters;
    sort: ProductGridSort;
    open: string | null;
  }>({ filters: NO_FILTERS, sort: "featured", open: null });
  const [pdSel, setPdSel] = React.useState<ProductSelection>(() => {
    const size = featured.sizes.find((s) => s.featured) ?? featured.sizes[0];
    const colour =
      featured.colours.find(
        (c) =>
          !c.soldOut &&
          !featured.unavailable?.includes(`${c.id}:${size?.id ?? ""}`),
      ) ?? featured.colours[0];
    return { colour: colour?.id ?? "", size: size?.id ?? "" };
  });

  const seq = React.useRef(0);
  const bagButton = React.useRef<HTMLButtonElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const addedTimers = React.useRef(new Map<string, number>());
  const focusNext = React.useRef<(() => HTMLElement | null | undefined) | null>(
    null,
  );

  React.useEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    const node = next();
    if (node?.isConnected && !node.closest("[inert]")) {
      node.focus({ preventScroll: true });
    }
  });

  React.useEffect(() => {
    const timers = addedTimers.current;
    return () => {
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  // What the badge shows: everything in the bag but what is still in the air.
  const flying = flights.reduce((n, f) => n + f.qty, 0);
  const shownCount = Math.max(0, count - flying);
  const [badge, setBadge] = React.useState({ count: shownCount, bump: 0 });
  if (badge.count !== shownCount) {
    setBadge({
      count: shownCount,
      bump: shownCount > badge.count ? badge.bump + 1 : badge.bump,
    });
  }

  /* ------------------------------- actions ------------------------------ */

  const swish = (up: boolean, by?: Element | null) =>
    audio.play("swish", { pitch: up ? 1.1 : 0.85, gain: 0.4, pan: panOf(by) });

  const setScreen = (next: StoreScreen) => {
    if (screen === undefined) setOwnScreen(next);
    onScreenChange?.(next);
  };

  const push = (next: StoreScreen, by?: HTMLElement | null) => {
    opener.current = by ?? null;
    swish(true, by);
    setScreen(next);
    focusNext.current = () => document.getElementById(headIdOf(next));
  };
  const back = (by?: Element | null) => {
    if (current === "home") return;
    swish(false, by);
    const to = opener.current;
    opener.current = null;
    setScreen("home");
    focusNext.current = () => (to?.isConnected ? to : null);
  };

  const openShelf = (
    next: StoreScreen,
    filters: ProductGridFilters,
    sort: ProductGridSort,
    open: string | null,
    by?: HTMLElement | null,
  ) => {
    setShelf({ filters, sort, open });
    push(next, by);
  };

  const openCategory = (
    name: string,
    by?: HTMLElement | null,
    product?: string,
  ) => {
    audio.play("pop", { pitch: 1.1, gain: 0.3, pan: panOf(by) });
    openShelf(
      `category:${name}`,
      { ...NO_FILTERS, categories: [name] },
      "featured",
      product ?? null,
      by,
    );
    const n = byIdCount(name);
    say(`${name}, ${plural(n, "product")}.`);
  };
  const byIdCount = (name: string) =>
    categories.find((c) => c.name === name)?.list.length ?? 0;

  /** Puts `qty` of a product in a glaze in the bag, and says so. */
  const addProduct = (p: ProductGridItem, color: string, qty: number) => {
    const glaze = colorOf(color);
    const id = `${p.id}:${color}`;
    const list = bagRef.current;
    const had = list.find((l) => l.id === id);
    const line: CartLine = had
      ? { ...had, quantity: Math.min(had.max ?? 10, had.quantity + qty) }
      : {
          id,
          name: p.name,
          variant: glaze?.name,
          price: p.price,
          ...(p.compareAt ? { compareAt: p.compareAt } : {}),
          quantity: qty,
          max: Math.max(1, Math.min(10, p.stock)),
          image: (
            <ShapeArt
              shape={p.shape}
              tint={glaze?.tint ?? "var(--ink-3)"}
              className="size-full"
            />
          ),
        };
    commit(had ? list.map((l) => (l.id === id ? line : l)) : [line, ...list]);
    onAdd?.(line);
    say(
      `Added ${p.name}${glaze ? `, ${glaze.name}` : ""}. ${plural(count + qty, "item")} in the bag.`,
    );
    return line;
  };

  const quickAdd = (p: ProductGridItem, by: HTMLElement) => {
    if (disabled || status !== "ready" || p.stock <= 0) return;
    const color = p.colors[0] ?? "";
    addProduct(p, color, 1);
    setAdded((a) => ({ ...a, [p.id]: (a[p.id] ?? 0) + 1 }));
    const old = addedTimers.current.get(p.id);
    if (old) window.clearTimeout(old);
    addedTimers.current.set(
      p.id,
      window.setTimeout(() => {
        addedTimers.current.delete(p.id);
        setAdded((a) => {
          const next = { ...a };
          delete next[p.id];
          return next;
        });
      }, 1400),
    );
    const frame = frameRef.current;
    const target = bagButton.current;
    if (!motionSafe || !frame || !target) {
      audio.play("pop", { pitch: 1.1, gain: 0.45, pan: panOf(target) });
      return;
    }
    const f = frame.getBoundingClientRect();
    const a = by.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    seq.current += 1;
    setFlights((list) => [
      ...list,
      {
        key: seq.current,
        from: {
          x: r2(a.left + a.width / 2 - f.left),
          y: r2(a.top + a.height / 2 - f.top),
        },
        to: {
          x: r2(b.left + b.width / 2 - f.left),
          y: r2(b.top + b.height / 2 - f.top),
        },
        tint: colorOf(color)?.tint ?? "var(--accent-bright)",
        qty: 1,
      },
    ]);
  };

  const land = React.useCallback(
    (key: number) => {
      setFlights((list) => list.filter((f) => f.key !== key));
      audio.play("pop", {
        pitch: 1.15,
        gain: 0.45,
        pan: panOf(bagButton.current),
      });
    },
    [audio],
  );

  /* ------------------------------- parts -------------------------------- */

  const pushedTitle = (s: StoreScreen) => {
    if (s === "product") return featured.name;
    if (s.startsWith("category:")) return s.slice("category:".length);
    if (s.startsWith("collection:")) {
      const id = s.slice("collection:".length);
      return collections.find((c) => c.id === id)?.title ?? "Shop";
    }
    return storeName;
  };

  const topBar = (
    <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-hairline bg-card px-2 @min-[40rem]:px-4">
      {current !== "home" ? (
        <button
          type="button"
          aria-label="Back to the shop"
          onClick={(event) => back(event.currentTarget)}
          className={TOOL}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
      ) : (
        <span
          aria-hidden
          className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-2 bg-primary text-primary-foreground"
        >
          <svg viewBox="0 0 20 20" className="size-4">
            <path
              d="M10 3c3 3.5 3 7 0 14M10 3c-3 3.5-3 7 0 14M5 8.5h10"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.h2
            key={current}
            id={headIdOf(current)}
            tabIndex={-1}
            className="truncate text-sm font-semibold outline-none"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {current === "home" ? storeName : pushedTitle(current)}
          </motion.h2>
        </AnimatePresence>
      </div>
      <button
        ref={bagButton}
        type="button"
        aria-label={`Bag, ${plural(count, "item")}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={(event) => {
          swish(true, event.currentTarget);
          setOpen(true);
        }}
        className={cn(TOOL, "relative")}
      >
        <ShoppingBag aria-hidden className="size-[18px]" />
        {badge.count > 0 ? (
          <motion.span
            key={badge.bump}
            aria-hidden
            className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-cobalt-bright px-1 font-mono text-[10px] font-semibold text-background"
            initial={motionSafe && badge.bump ? { scale: 1.45 } : false}
            animate={{ scale: 1 }}
            transition={springs.recoil}
          >
            <Roll value={badge.count} motionSafe={motionSafe} />
          </motion.span>
        ) : null}
      </button>
    </header>
  );

  const swatches = featured.colours.map((c) => c.swatch);
  const heroArt = (
    <svg
      aria-hidden
      viewBox="0 0 240 150"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMax meet"
    >
      <ellipse cx={120} cy={138} rx={104} ry={6} fill="black" opacity={0.08} />
      {[
        { x: 22, s: 0.9, c: swatches[2] },
        { x: 78, s: 1.18, c: swatches[0] },
        { x: 146, s: 1, c: swatches[1] },
        { x: 196, s: 0.78, c: swatches[3] },
      ].map((m, i) => {
        const tint = m.c ?? "var(--ink-3)";
        const w = 34 * m.s;
        const h = 40 * m.s;
        const y = r2(136 - h);
        return (
          <motion.g
            key={i}
            initial={motionSafe ? { y: distances.step, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe
                ? {
                    ...springs.glide,
                    delay: 0.08 + i * 0.06,
                    opacity: {
                      duration: durations.base,
                      delay: 0.08 + i * 0.06,
                    },
                  }
                : { duration: 0 }
            }
          >
            <path
              d={`M${r2(m.x + w - 1)} ${r2(y + h * 0.24)}h${r2(5 * m.s)}a${r2(8 * m.s)} ${r2(8 * m.s)} 0 0 1 0 ${r2(16 * m.s)}h-${r2(5 * m.s)}`}
              fill="none"
              stroke={shade(tint)}
              strokeWidth={r2(4.5 * m.s)}
              strokeLinecap="round"
            />
            <rect
              x={m.x}
              y={y}
              width={r2(w)}
              height={r2(h)}
              rx={r2(6 * m.s)}
              fill={tint}
            />
            <rect
              x={m.x}
              y={y}
              width={r2(w)}
              height={r2(6 * m.s)}
              rx={r2(3 * m.s)}
              fill={light(tint)}
            />
            <rect
              x={m.x}
              y={r2(y + h * 0.78)}
              width={r2(w)}
              height={r2(h * 0.22)}
              rx={r2(4 * m.s)}
              fill={shade(tint)}
              opacity={0.35}
            />
          </motion.g>
        );
      })}
    </svg>
  );

  const heroBlock =
    heroMode === "off" ? null : (
      <section
        aria-labelledby={`${uid}-hero`}
        className={cn(
          "relative mx-4 mt-4 overflow-hidden rounded-4 border border-hairline bg-[color-mix(in_oklab,var(--warn)_10%,var(--card))]",
          heroMode === "split"
            ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center"
            : phone
              ? "h-[180px]"
              : "h-[220px]",
        )}
      >
        {heroMode === "banner" ? (
          <div className="absolute inset-y-3 right-0 w-[62%]">{heroArt}</div>
        ) : null}
        <div
          className={cn(
            "relative flex flex-col items-start gap-1.5 p-5",
            heroMode === "banner" &&
              "h-full max-w-[min(22rem,76%)] justify-end bg-linear-to-r from-[color-mix(in_oklab,var(--warn)_10%,var(--card))] via-[color-mix(in_oklab,var(--warn)_10%,var(--card))]/80 to-transparent @min-[40rem]:max-w-[min(22rem,58%)]",
          )}
        >
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {heroCopy.eyebrow}
          </p>
          <h2
            id={`${uid}-hero`}
            className="text-lg leading-tight font-semibold tracking-[-0.01em] @min-[40rem]:text-xl"
          >
            {heroCopy.title}
          </h2>
          {phone && heroMode === "banner" ? null : (
            <p className="line-clamp-2 text-xs text-ink-2 @min-[40rem]:text-[13px]">
              {heroCopy.body}
            </p>
          )}
          <button
            type="button"
            onClick={(event) => push("product", event.currentTarget)}
            className={cn(
              "mt-1.5 inline-flex h-9 max-w-full items-center gap-1.5 rounded-2 bg-primary px-3.5 text-[13px] font-medium whitespace-nowrap text-primary-foreground transition-opacity hover:opacity-90",
              FOCUS,
            )}
          >
            {heroCopy.cta}
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
        {heroMode === "split" ? (
          <div className="h-[220px] py-4 pr-4">{heroArt}</div>
        ) : null}
      </section>
    );

  const categoryRail = (
    <section aria-labelledby={`${uid}-cats`} className="pt-4">
      <h3 id={`${uid}-cats`} className="px-4 text-[15px] font-semibold">
        Shop by room
      </h3>
      <ul
        role="list"
        className="mt-2.5 flex [scrollbar-width:none] gap-2.5 overflow-x-auto overscroll-x-contain px-4 pb-1"
      >
        {categories.map((c) => {
          const first = c.list[0];
          const tint = colorOf(first?.colors[0] ?? "")?.tint ?? "var(--ink-3)";
          return (
            <li key={c.name} className="shrink-0">
              <button
                type="button"
                onClick={(event) => openCategory(c.name, event.currentTarget)}
                className={cn(
                  "flex h-14 items-center gap-2.5 rounded-3 border border-hairline bg-card pr-4 pl-1.5 text-left transition-colors hover:border-hairline-strong hover:bg-surface-1",
                  FOCUS,
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2 bg-surface-2">
                  {first ? (
                    <ShapeArt
                      shape={first.shape}
                      tint={tint}
                      className="size-10"
                    />
                  ) : null}
                </span>
                <span className="flex flex-col">
                  <span className="text-[13px] leading-5 font-medium">
                    {c.name}
                  </span>
                  <span className="text-[11px] leading-4 text-ink-3 tabular-nums">
                    {plural(c.list.length, "piece")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const shownRails = collections.slice(
    0,
    Math.min(3, Math.max(1, Math.round(rails))),
  );
  const home = (
    <div className="h-full [scrollbar-width:thin] overflow-y-auto overscroll-contain pb-4">
      {status === "error" ? (
        <div className="flex flex-col items-start gap-2 px-4 pt-6">
          <p className="text-[13px] text-foreground">The shop did not load.</p>
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
      ) : (
        <>
          {heroBlock}
          {categoryRail}
          {status === "loading" ? (
            <div aria-hidden className="flex gap-3 overflow-hidden px-4 pt-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex shrink-0 flex-col gap-2"
                  style={{ width: cardW }}
                >
                  <span className="block aspect-square rounded-3 bg-surface-2" />
                  <span className="block h-3 w-3/4 rounded-1 bg-surface-2" />
                  <span className="block h-3 w-1/3 rounded-1 bg-surface-2" />
                </div>
              ))}
            </div>
          ) : (
            shownRails.map((c) => {
              const list = c.products
                .map((id) => byId.get(id))
                .filter((p): p is ProductGridItem => !!p);
              return (
                <Rail
                  key={c.id}
                  collection={c}
                  items={list}
                  colorOf={colorOf}
                  cardW={cardW}
                  arrows={!phone}
                  density={density}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  format={format}
                  added={added}
                  onOpen={(p, by) => openCategory(p.category, by, p.id)}
                  onQuickAdd={quickAdd}
                  onSeeAll={(by) =>
                    openShelf(
                      `collection:${c.id}`,
                      { ...NO_FILTERS, price: c.shelf?.price ?? null },
                      c.shelf?.sort ?? "featured",
                      null,
                      by,
                    )
                  }
                />
              );
            })
          )}
        </>
      )}
    </div>
  );

  const pdQty =
    bag.find((l) => l.id === `${featured.id}:${pdSel.colour}:${pdSel.size}`)
      ?.quantity ?? 0;

  const pushed =
    lastPushed === "product" ? (
      <ProductDetail
        product={featured}
        value={pdSel}
        onValueChange={setPdSel}
        quantity={pdQty}
        onQuantityChange={(q, sel) => {
          const colour = featured.colours.find((c) => c.id === sel.colour);
          const size = featured.sizes.find((s) => s.id === sel.size);
          const id = `${featured.id}:${sel.colour}:${sel.size}`;
          const list = bagRef.current;
          const had = list.find((l) => l.id === id);
          if (q <= 0) {
            commit(list.filter((l) => l.id !== id));
            return;
          }
          const price = cents(
            featured.price +
              (colour?.priceDelta ?? 0) +
              (size?.priceDelta ?? 0),
          );
          const line: CartLine = had
            ? { ...had, quantity: q }
            : {
                id,
                name: featured.name,
                variant: [colour?.name, size?.label]
                  .filter(Boolean)
                  .join(" · "),
                price,
                quantity: q,
                art: { kind: "mug", tint: colour?.swatch ?? "var(--ink-3)" },
              };
          commit(
            had ? list.map((l) => (l.id === id ? line : l)) : [line, ...list],
          );
          if (!had || q > had.quantity) onAdd?.(line);
        }}
        now={nowMs}
        format={format}
        sound={sound}
        disabled={disabled}
        className="h-full rounded-none border-0"
      />
    ) : (
      <ProductGrid
        products={products}
        colors={colors}
        priceBands={PRICE_BANDS}
        filters={shelf.filters}
        onFiltersChange={(filters) => setShelf((s) => ({ ...s, filters }))}
        sort={shelf.sort}
        onSortChange={(sort) => setShelf((s) => ({ ...s, sort }))}
        open={shelf.open}
        onOpenChange={(open) => setShelf((s) => ({ ...s, open }))}
        onAddToCart={(id, options) => {
          const p = byId.get(id);
          if (p) addProduct(p, options.color, options.qty);
        }}
        density={density}
        format={format}
        title={pushedTitle(lastPushed)}
        status={status}
        onRetry={onRetry}
        sound={sound}
        disabled={disabled}
        className="h-full rounded-none border-0 [&>div:first-child]:max-h-full"
      />
    );

  return (
    <div
      ref={setRoot}
      role="region"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.defaultPrevented || current === "home" || isOpen) return;
        if (event.altKey && event.key === "ArrowLeft") {
          event.preventDefault();
          back(null);
        } else if (event.key === "Escape") {
          // Only an Escape nothing inside used: a quick view or a menu in the
          // shelf takes its own first.
          event.preventDefault();
          back(null);
        }
      }}
      className={cn(
        "@container relative isolate h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-background text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <CartDrawer
        items={bag}
        onItemsChange={commit}
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) swish(false, bagButton.current);
          setOpen(open);
        }}
        onCheckout={onCheckout}
        format={format}
        onContinue={() => setOpen(false)}
        sound={sound}
        disabled={disabled}
        className="h-full rounded-none border-0"
      >
        <div ref={frameRef} className="relative isolate flex h-full flex-col">
          {topBar}
          <div className="relative flex-1 overflow-hidden">
            <StackScreen
              index={0}
              depth={depth}
              level={level}
              motionSafe={motionSafe}
            >
              {home}
            </StackScreen>
            <StackScreen
              index={1}
              depth={depth}
              level={level}
              motionSafe={motionSafe}
            >
              {pushed}
            </StackScreen>
            {level > 0 && motionSafe ? (
              <EdgeBack
                width={W}
                level={level}
                depth={depth}
                onGrab={() => depthAnim.current?.stop()}
                onBack={() => back(null)}
              />
            ) : null}
          </div>
          {flights.map((f) => (
            <FlightDot key={f.key} flight={f} onLand={land} />
          ))}
        </div>
      </CartDrawer>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
