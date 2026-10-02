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
  ChevronDown,
  Minus,
  Plus,
  RotateCcw,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type ProductGridReflow = "glide" | "wave" | "fade";
export type ProductGridQuickview = "morph" | "sheet" | "side";
export type ProductGridDensity = "compact" | "regular" | "roomy";
export type ProductGridSort =
  "featured" | "price-asc" | "price-desc" | "newest" | "rating";
export type ProductGridStatus = "ready" | "loading" | "error";
export type ProductShape =
  | "mug"
  | "cup"
  | "tumbler"
  | "kettle"
  | "dripper"
  | "carafe"
  | "grinder"
  | "scale"
  | "canister"
  | "jar"
  | "bowl"
  | "pitcher";

export type ProductGridColor = {
  id: string;
  /** "Clay". */
  name: string;
  /** The glaze as a pigment — any CSS colour, ideally at a fixed lightness so both themes read it. */
  tint: string;
};

export type ProductGridItem = {
  id: string;
  name: string;
  /** A category name; the category chips are made from these. */
  category: string;
  price: number;
  /** The old price, struck through beside the new one. */
  compareAt?: number;
  /** Colour ids, the first is the default. */
  colors: string[];
  /** 0 to 5. */
  rating: number;
  reviews: number;
  /** "New", "Bestseller". A product with no stock reads "Sold out" whatever this says. */
  badge?: string;
  /** Units left; 0 is sold out. */
  stock: number;
  /** When it arrived, ms — "Newest" sorts by it. */
  added: number;
  /** One or two sentences for the quick view. */
  description: string;
  /** Which drawing stands in for the photograph. */
  shape: ProductShape;
};

export type ProductGridPriceBand = {
  id: string;
  /** "Under $25". */
  label: string;
  /** Inclusive. */
  min: number;
  /** Exclusive. Omit it for no ceiling. */
  max?: number;
};

export type ProductGridFilters = {
  /** Categories shown; empty shows every category. */
  categories: string[];
  /** Colour ids; empty shows every colour. */
  colors: string[];
  /** A price band id, or null for any price. */
  price: string | null;
  /** Only what can ship now. */
  inStock: boolean;
};

export type ProductGridAddOptions = { color: string; qty: number };

export type ProductGridProps = {
  /** How the shelf rearranges: everything glides together, a wave by new position, or a cross-fade. @default "glide" */
  reflow?: ProductGridReflow;
  /** How the quick view arrives: it grows out of the card, rises as a sheet, or slides in from the side. @default "morph" */
  quickview?: ProductGridQuickview;
  /** Columns and how much each card says. @default "regular" */
  density?: ProductGridDensity;
  /** The shelf. @default defaultProducts */
  products?: ProductGridItem[];
  /** The glazes products come in. @default defaultProductColors */
  colors?: ProductGridColor[];
  /** The price chips. @default defaultPriceBands */
  priceBands?: ProductGridPriceBand[];
  /** Controlled filters. */
  filters?: ProductGridFilters;
  /** Initial filters when uncontrolled. @default nothing set */
  defaultFilters?: ProductGridFilters;
  /** Fires from the chip, or Clear, that changed the filters. */
  onFiltersChange?: (filters: ProductGridFilters) => void;
  /** Controlled sort. */
  sort?: ProductGridSort;
  /** Initial sort when uncontrolled. @default "featured" */
  defaultSort?: ProductGridSort;
  /** Fires from the sort menu's choice. */
  onSortChange?: (sort: ProductGridSort) => void;
  /** Controlled quick view: the product shown, or null. */
  open?: string | null;
  /** Initial quick view when uncontrolled. @default null */
  defaultOpen?: string | null;
  /** Fires as a quick view opens (its id) or closes (null). */
  onOpenChange?: (id: string | null) => void;
  /** Quick add on a card, or Add to bag in the quick view. */
  onAddToCart?: (id: string, options: ProductGridAddOptions) => void;
  /** "View details" in the quick view. Without it there is no link. */
  onOpen?: (id: string) => void;
  /** Cards shown before "Show more". @default 12 */
  pageSize?: number;
  /** Money. @default Intl currency in `locale` and `currency` */
  format?: (amount: number) => string;
  /** @default "en-US" */
  locale?: string;
  /** @default "USD" */
  currency?: string;
  /** Whether the shelf has arrived. @default "ready" */
  status?: ProductGridStatus;
  /** "Try again" was pressed after the shelf failed to load. */
  onRetry?: () => void;
  /** The shelf's heading. @default "Kitchen" */
  title?: string;
  /** The region's accessible name. @default the title */
  label?: string;
  /** A click for every chip, choice and add; a swish as a quick view opens and closes. Off unless asked for. @default false */
  sound?: boolean;
  /** Browse only: nothing can be filtered, sorted, opened or added. @default false */
  disabled?: boolean;
  /** Classes for the root. Its scroller is at most 560px tall. */
  className?: string;
};

/* ---------------------------------- data --------------------------------- */

export const defaultProductColors: ProductGridColor[] = [
  { id: "clay", name: "Clay", tint: "oklch(from var(--danger) 0.7 0.1 h)" },
  { id: "sage", name: "Sage", tint: "oklch(from var(--success) 0.75 0.07 h)" },
  {
    id: "slate",
    name: "Slate",
    tint: "oklch(from var(--accent-bright) 0.62 0.07 h)",
  },
  { id: "oat", name: "Oat", tint: "oklch(from var(--warn) 0.87 0.05 h)" },
  { id: "ochre", name: "Ochre", tint: "oklch(from var(--warn) 0.74 0.12 h)" },
  {
    id: "charcoal",
    name: "Charcoal",
    tint: "oklch(from var(--ink-3) 0.4 0.012 h)",
  },
];

export const defaultPriceBands: ProductGridPriceBand[] = [
  { id: "under-25", label: "Under $25", min: 0, max: 25 },
  { id: "25-50", label: "$25–50", min: 25, max: 50 },
  { id: "50-100", label: "$50–100", min: 50, max: 100 },
  { id: "over-100", label: "$100+", min: 100 },
];

const day = (month: number, d: number) => Date.UTC(2026, month - 1, d);

export const defaultProducts: ProductGridItem[] = [
  {
    id: "ridge-pour-over",
    name: "Ridge pour-over",
    category: "Brewing",
    price: 38,
    colors: ["clay", "oat", "charcoal"],
    rating: 4.7,
    reviews: 212,
    badge: "Bestseller",
    stock: 24,
    added: day(5, 12),
    description:
      "A stoneware cone with spiral ribs, so the paper never seals against the wall and the bed drains even.",
    shape: "dripper",
  },
  {
    id: "basin-kettle",
    name: "Basin kettle, 1 l",
    category: "Brewing",
    price: 89,
    compareAt: 104,
    colors: ["slate", "charcoal"],
    rating: 4.8,
    reviews: 96,
    stock: 7,
    added: day(3, 4),
    description:
      "A gooseneck that pours a pencil-thin stream, with a counterweighted handle that keeps the wrist straight.",
    shape: "kettle",
  },
  {
    id: "mesa-grinder",
    name: "Mesa hand grinder",
    category: "Brewing",
    price: 124,
    colors: ["charcoal", "oat"],
    rating: 4.6,
    reviews: 58,
    stock: 12,
    added: day(6, 20),
    description:
      "Steel burrs on two bearings and forty clicks per turn, from espresso fine to cold-brew coarse.",
    shape: "grinder",
  },
  {
    id: "larch-carafe",
    name: "Larch carafe, 600 ml",
    category: "Brewing",
    price: 42,
    colors: ["sage", "slate"],
    rating: 4.5,
    reviews: 71,
    stock: 30,
    added: day(4, 2),
    description:
      "Borosilicate glass with a glazed collar you can hold while it is hot. Takes any cone on top.",
    shape: "carafe",
  },
  {
    id: "gauge-scale",
    name: "Gauge brew scale",
    category: "Brewing",
    price: 64,
    colors: ["charcoal"],
    rating: 4.4,
    reviews: 133,
    stock: 0,
    added: day(2, 14),
    description:
      "Tenth-of-a-gram weighing with a flow timer that starts when the first drop lands.",
    shape: "scale",
  },
  {
    id: "fern-mug",
    name: "Fern mug",
    category: "Drinkware",
    price: 22,
    colors: ["sage", "clay", "oat", "slate"],
    rating: 4.9,
    reviews: 402,
    badge: "Bestseller",
    stock: 80,
    added: day(1, 9),
    description:
      "A 340 ml mug, thrown thick at the base so it stays warm, with a handle that fits three fingers.",
    shape: "mug",
  },
  {
    id: "hollow-tumbler",
    name: "Hollow tumbler, set of 2",
    category: "Drinkware",
    price: 28,
    colors: ["slate", "oat"],
    rating: 4.6,
    reviews: 88,
    badge: "New",
    stock: 40,
    added: day(9, 18),
    description:
      "Double-walled, so iced coffee never sweats and hot tea never burns the hand.",
    shape: "tumbler",
  },
  {
    id: "cinder-cup",
    name: "Cinder cup and saucer",
    category: "Drinkware",
    price: 26,
    colors: ["charcoal", "clay"],
    rating: 4.3,
    reviews: 39,
    stock: 18,
    added: day(7, 1),
    description:
      "A 150 ml cup for a short drink, with a saucer deep enough to hold a spoon still.",
    shape: "cup",
  },
  {
    id: "brook-canister",
    name: "Brook canister",
    category: "Storage",
    price: 34,
    colors: ["oat", "sage", "charcoal"],
    rating: 4.7,
    reviews: 120,
    stock: 26,
    added: day(5, 30),
    description:
      "An airtight lid with a one-way valve: beans breathe out, air stays out. Holds 500 g.",
    shape: "canister",
  },
  {
    id: "juniper-jar",
    name: "Juniper jar, 1 l",
    category: "Storage",
    price: 19,
    colors: ["sage", "oat"],
    rating: 4.2,
    reviews: 64,
    stock: 50,
    added: day(8, 11),
    description:
      "A clamp-top jar for oats, sugar or loose tea, with a wide mouth for a scoop.",
    shape: "jar",
  },
  {
    id: "coldbrook-bowl",
    name: "Coldbrook bowl",
    category: "Serveware",
    price: 24,
    colors: ["clay", "oat", "slate"],
    rating: 4.8,
    reviews: 150,
    stock: 6,
    added: day(6, 5),
    description:
      "A shallow 18 cm bowl for noodles or salad, glazed inside and left raw on the foot.",
    shape: "bowl",
  },
  {
    id: "waylight-pitcher",
    name: "Waylight pitcher",
    category: "Serveware",
    price: 56,
    compareAt: 68,
    colors: ["ochre", "sage"],
    rating: 4.5,
    reviews: 47,
    stock: 15,
    added: day(4, 22),
    description:
      "A one-litre jug with a sharp lip that never drips down the side.",
    shape: "pitcher",
  },
  {
    id: "drift-dripper",
    name: "Drift dripper, glass",
    category: "Brewing",
    price: 29,
    colors: ["slate"],
    rating: 4.1,
    reviews: 22,
    badge: "New",
    stock: 33,
    added: day(9, 24),
    description: "A flat-bottomed glass brewer that forgives an uneven pour.",
    shape: "dripper",
  },
  {
    id: "stone-mug-pair",
    name: "Stone mug, pair",
    category: "Drinkware",
    price: 36,
    colors: ["charcoal", "ochre"],
    rating: 4.7,
    reviews: 76,
    stock: 21,
    added: day(8, 28),
    description:
      "Two squat 250 ml mugs with a speckled glaze; each one is a little different.",
    shape: "mug",
  },
  {
    id: "field-tea-tin",
    name: "Field tea tin",
    category: "Storage",
    price: 16,
    colors: ["ochre", "clay"],
    rating: 4.4,
    reviews: 54,
    stock: 60,
    added: day(3, 19),
    description:
      "A double-lidded tin that keeps 100 g of leaf tea dark and dry.",
    shape: "canister",
  },
  {
    id: "pebble-bowl",
    name: "Pebble serving bowl",
    category: "Serveware",
    price: 72,
    colors: ["sage", "charcoal"],
    rating: 4.6,
    reviews: 33,
    stock: 9,
    added: day(7, 27),
    description:
      "A 28 cm bowl for the middle of the table, heavy enough not to slide when tossed.",
    shape: "bowl",
  },
];

const EMPTY_FILTERS: ProductGridFilters = {
  categories: [],
  colors: [],
  price: null,
  inStock: false,
};

const SORTS: { id: ProductGridSort; label: string; spoken: string }[] = [
  { id: "featured", label: "Featured", spoken: "in featured order" },
  {
    id: "price-asc",
    label: "Price, low to high",
    spoken: "sorted by price, low to high",
  },
  {
    id: "price-desc",
    label: "Price, high to low",
    spoken: "sorted by price, high to low",
  },
  { id: "newest", label: "Newest", spoken: "newest first" },
  { id: "rating", label: "Top rated", spoken: "top rated first" },
];

/* -------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

type FacetKey = "category" | "color" | "price" | "stock";

function passes(
  p: ProductGridItem,
  f: ProductGridFilters,
  bands: ProductGridPriceBand[],
  skip?: FacetKey,
): boolean {
  if (skip !== "category" && f.categories.length > 0) {
    if (!f.categories.includes(p.category)) return false;
  }
  if (skip !== "color" && f.colors.length > 0) {
    if (!p.colors.some((c) => f.colors.includes(c))) return false;
  }
  if (skip !== "price" && f.price) {
    const band = bands.find((b) => b.id === f.price);
    if (
      band &&
      (p.price < band.min || (band.max !== undefined && p.price >= band.max))
    )
      return false;
  }
  if (skip !== "stock" && f.inStock && p.stock <= 0) return false;
  return true;
}

/** The products a set of filters leaves, in data order — the same test the grid uses. */
export function matchProducts(
  products: ProductGridItem[],
  filters: ProductGridFilters,
  priceBands: ProductGridPriceBand[] = defaultPriceBands,
): ProductGridItem[] {
  return products.filter((p) => passes(p, filters, priceBands));
}

function sorted(list: ProductGridItem[], sort: ProductGridSort) {
  const out = [...list];
  if (sort === "price-asc") out.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") out.sort((a, b) => b.price - a.price);
  else if (sort === "newest") out.sort((a, b) => b.added - a.added);
  else if (sort === "rating")
    out.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  return out;
}

const sameFilters = (a: ProductGridFilters, b: ProductGridFilters) =>
  a.price === b.price &&
  a.inStock === b.inStock &&
  a.categories.join("|") === b.categories.join("|") &&
  a.colors.join("|") === b.colors.join("|");

/* ------------------------------- the art --------------------------------- */

const shade = (tint: string) => `color-mix(in oklab, ${tint} 70%, black)`;
const light = (tint: string) => `color-mix(in oklab, ${tint} 55%, white)`;

/**
 * A drawn stand-in for a product photograph. The glaze is a fill with a CSS
 * transition, so choosing another colour tweens the piece rather than
 * swapping it.
 */
function ProductArt({
  shape,
  tint,
  className,
}: {
  shape: ProductShape;
  tint: string;
  className?: string;
}) {
  const body: React.CSSProperties = { fill: tint, transition: "fill 240ms" };
  const dark: React.CSSProperties = {
    fill: shade(tint),
    transition: "fill 240ms",
  };
  const lit: React.CSSProperties = {
    fill: light(tint),
    transition: "fill 240ms",
  };
  const line = (
    extra?: React.CSSProperties,
  ): React.SVGProps<SVGPathElement> => ({
    fill: "none",
    strokeWidth: 3.5,
    strokeLinecap: "round",
    style: { stroke: shade(tint), transition: "stroke 240ms", ...extra },
  });
  let art: React.ReactNode;
  switch (shape) {
    case "mug":
      art = (
        <>
          <path d="M41 28h4a6 6 0 0 1 0 12h-4" {...line()} />
          <rect x={17} y={22} width={24} height={30} rx={5} style={body} />
          <rect x={17} y={22} width={24} height={4} rx={2} style={lit} />
        </>
      );
      break;
    case "cup":
      art = (
        <>
          <ellipse cx={32} cy={51} rx={19} ry={3.5} style={dark} />
          <path d="M44.5 33h2a4 4 0 0 1 0 8h-3" {...line()} />
          <path
            d="M18 30h28l-3 15.5a4 4 0 0 1-4 3.5H25a4 4 0 0 1-4-3.5Z"
            style={body}
          />
          <rect x={18} y={29} width={28} height={3} rx={1.5} style={lit} />
        </>
      );
      break;
    case "tumbler":
      art = (
        <>
          <path d="M20 14h24l-3.5 38h-17Z" style={body} />
          <path d="M20 14h24l-0.6 6H20.6Z" style={lit} />
          <path d="M23 40h18l-0.8 12H23.8Z" style={dark} />
        </>
      );
      break;
    case "kettle":
      art = (
        <>
          <path d="M47 38 57 28" {...line()} />
          <path
            d="M22 29c0-8 4-12 10-12s10 4 10 12"
            {...line({ strokeWidth: 3 })}
          />
          <path
            d="M16 52h32l2-16a5 5 0 0 0-5-6H19a5 5 0 0 0-5 6Z"
            style={body}
          />
          <rect x={28} y={26} width={8} height={4} rx={2} style={dark} />
        </>
      );
      break;
    case "dripper":
      art = (
        <>
          <path d="M23 43h18l-2 9H25Z" style={dark} />
          <path d="M13 18h38L41 37H23Z" style={body} />
          <rect x={19} y={37} width={26} height={4} rx={2} style={dark} />
          <path d="M13 18h38l-1.4 3H14.4Z" style={lit} />
        </>
      );
      break;
    case "carafe":
      art = (
        <>
          <path
            d="M27 10h10v11c0 3 10 7 10 17v10a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4V38c0-10 10-14 10-17Z"
            style={body}
          />
          <rect x={25.5} y={19} width={13} height={5} rx={2} style={dark} />
          <path d="M20 40h24v8a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2Z" style={lit} />
        </>
      );
      break;
    case "grinder":
      art = (
        <>
          <path d="M32 18V11h13" {...line({ strokeWidth: 3 })} />
          <circle cx={46} cy={11} r={3.5} style={dark} />
          <rect x={21} y={24} width={22} height={28} rx={4} style={body} />
          <rect x={19} y={18} width={26} height={7} rx={2.5} style={dark} />
          <rect x={21} y={44} width={22} height={3} style={lit} />
        </>
      );
      break;
    case "scale":
      art = (
        <>
          <rect x={9} y={39} width={46} height={13} rx={3} style={body} />
          <rect x={11} y={35} width={42} height={5} rx={2.5} style={dark} />
          <rect x={25} y={43.5} width={14} height={5} rx={1} style={lit} />
        </>
      );
      break;
    case "canister":
      art = (
        <>
          <rect x={19} y={22} width={26} height={30} rx={4} style={body} />
          <rect x={17} y={16} width={30} height={7} rx={3} style={dark} />
          <rect x={29} y={12} width={6} height={5} rx={2} style={dark} />
          <rect x={19} y={30} width={26} height={9} style={lit} />
        </>
      );
      break;
    case "jar":
      art = (
        <>
          <rect x={15} y={24} width={34} height={28} rx={9} style={body} />
          <rect x={20} y={17} width={24} height={8} rx={2.5} style={dark} />
          <path d="M24 25v6" {...line({ strokeWidth: 2.5 })} />
          <rect x={20} y={33} width={8} height={14} rx={4} style={lit} />
        </>
      );
      break;
    case "bowl":
      art = (
        <>
          <rect x={24} y={48} width={16} height={4} rx={2} style={dark} />
          <path d="M9 31h46c0 11-10 18-23 18S9 42 9 31Z" style={body} />
          <ellipse cx={32} cy={31} rx={23} ry={3.5} style={lit} />
        </>
      );
      break;
    case "pitcher":
      art = (
        <>
          <path d="M20 26c-8 0-9 13 0 15" {...line()} />
          <path
            d="M20 20h22l7-5-3 9c4 6 4 14 2 24a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4c-2-10-2-18 2-24Z"
            style={body}
          />
          <path d="M20 20h22l1 3H20.4Z" style={lit} />
        </>
      );
      break;
  }
  return (
    <svg aria-hidden viewBox="0 0 64 64" className={cn("block", className)}>
      <ellipse cx={32} cy={56} rx={19} ry={2.6} className="fill-ink-3/20" />
      {art}
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

/** A number whose digits roll, units keyed from the right, the widest width reserved. */
function Roll({
  text,
  widest,
  align = "end",
  motionSafe,
  className,
}: {
  text: string;
  widest?: string;
  /** Which side of the reserved width the digits sit on. */
  align?: "start" | "end";
  motionSafe: boolean;
  className?: string;
}) {
  const chars = [...text];
  const room = widest && widest.length > text.length ? widest : text;
  return (
    <span aria-hidden className={cn("inline-grid tabular-nums", className)}>
      <span className="invisible col-start-1 row-start-1 leading-[1.15em] whitespace-pre">
        {room}
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
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-4 shrink-0", className)}
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

function Stars({ rating, className }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  return (
    <span aria-hidden className={cn("inline-flex items-center", className)}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3 shrink-0",
            i < full ? "fill-current text-warn" : "text-ink-3/50",
          )}
        />
      ))}
    </span>
  );
}

/* ------------------------------- the chips ------------------------------- */

type Chip = {
  key: string;
  label: string;
  pressed: boolean;
  count: number;
  swatch?: string;
  toggle: (el: Element) => void;
};

/**
 * One facet: a roving-focus group of toggle chips. A pressed chip grows a
 * check whose slot widens on flick, and every chip's count rolls.
 */
function FacetGroup({
  name,
  chips,
  motionSafe,
  disabled,
}: {
  name: string;
  chips: Chip[];
  motionSafe: boolean;
  disabled: boolean;
}) {
  const [focus, setFocus] = React.useState(0);
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const headingId = React.useId();
  const at = Math.min(focus, Math.max(0, chips.length - 1));

  const move = (to: number) => {
    const chip = chips[to];
    if (!chip) return;
    setFocus(to);
    nodes.current.get(chip.key)?.focus({ preventScroll: true });
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5 @min-[40rem]:flex-col @min-[40rem]:items-stretch @min-[40rem]:gap-2">
      <span
        id={headingId}
        className="sr-only text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase @min-[40rem]:not-sr-only"
      >
        {name}
      </span>
      <div
        role="group"
        aria-labelledby={headingId}
        onKeyDown={(event) => {
          const n = chips.length;
          if (n === 0) return;
          let to: number | null = null;
          if (event.key === "ArrowRight" || event.key === "ArrowDown")
            to = (at + 1) % n;
          else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
            to = (at - 1 + n) % n;
          else if (event.key === "Home") to = 0;
          else if (event.key === "End") to = n - 1;
          if (to === null) return;
          event.preventDefault();
          move(to);
        }}
        className="flex shrink-0 gap-1.5 @min-[40rem]:flex-wrap"
      >
        {chips.map((chip, i) => (
          <button
            key={chip.key}
            ref={(node) => {
              if (node) nodes.current.set(chip.key, node);
              else nodes.current.delete(chip.key);
            }}
            type="button"
            tabIndex={i === at ? 0 : -1}
            disabled={disabled}
            aria-pressed={chip.pressed}
            aria-label={`${chip.label}, ${plural(chip.count, "product", "products")}`}
            onFocus={() => setFocus(i)}
            onClick={(event) => chip.toggle(event.currentTarget)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full border pr-2.5 pl-2.5 text-[12px] whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              chip.pressed
                ? "border-cobalt-bright/50 bg-cobalt-wash text-cobalt-bright"
                : "border-hairline text-foreground hover:bg-surface-2",
              chip.count === 0 && !chip.pressed && "text-ink-3",
              FOCUS,
            )}
          >
            <motion.span
              aria-hidden
              className="inline-flex shrink-0 items-center overflow-clip"
              initial={false}
              animate={{ width: chip.pressed ? 18 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            >
              {chip.pressed ? (
                <DrawnCheck motionSafe={motionSafe} className="size-3.5" />
              ) : null}
            </motion.span>
            {chip.swatch ? (
              <span
                aria-hidden
                className="mr-1.5 size-3 shrink-0 rounded-full ring-1 ring-ink-3/30"
                style={{ background: chip.swatch }}
              />
            ) : null}
            <span>{chip.label}</span>
            <Roll
              text={String(chip.count)}
              widest="00"
              motionSafe={motionSafe}
              className="ml-1.5 font-mono text-[10px] text-ink-3"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- the sort ------------------------------- */

function SortMenu({
  value,
  onChoose,
  motionSafe,
  disabled,
}: {
  value: ProductGridSort;
  onChoose: (sort: ProductGridSort, el: Element | null) => void;
  motionSafe: boolean;
  disabled: boolean;
}) {
  const uid = React.useId();
  const listId = `${uid}-sort`;
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const options = React.useRef(new Map<ProductGridSort, HTMLDivElement>());
  const current = SORTS.find((s) => s.id === value) ?? SORTS[0];

  const show = (at: number) => {
    setActive(at);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus({ preventScroll: true });
  };

  // Focus follows the highlighted option once the list exists.
  React.useEffect(() => {
    if (!open) return;
    const id = SORTS[active]?.id;
    if (id) options.current.get(id)?.focus({ preventScroll: true });
  }, [open, active]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const selected = SORTS.findIndex((s) => s.id === value);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : show(Math.max(0, selected)))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show(
              event.key === "ArrowUp"
                ? SORTS.length - 1
                : Math.max(0, selected),
            );
          }
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
          FOCUS,
        )}
      >
        <span className="text-ink-3">Sort</span>
        <span className="font-medium">{current?.label}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-ink-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="list"
            id={listId}
            role="listbox"
            aria-label="Sort by"
            onKeyDown={(event) => {
              const n = SORTS.length;
              let to: number | null = null;
              if (event.key === "ArrowDown") to = (active + 1) % n;
              else if (event.key === "ArrowUp") to = (active - 1 + n) % n;
              else if (event.key === "Home") to = 0;
              else if (event.key === "End") to = n - 1;
              else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const s = SORTS[active];
                if (s) {
                  onChoose(s.id, options.current.get(s.id) ?? null);
                  close(true);
                }
                return;
              } else if (event.key === "Escape") {
                // Handled where focus is; the stage must not see it.
                event.preventDefault();
                close(true);
                return;
              } else if (event.key === "Tab") {
                close(false);
                return;
              }
              if (to === null) return;
              event.preventDefault();
              setActive(to);
            }}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              transition: { duration: durations.fast, ease: easings.exit },
            }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="absolute top-full right-0 z-30 mt-1.5 flex w-48 flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-lg"
          >
            {SORTS.map((s, i) => {
              const on = s.id === value;
              return (
                <div
                  key={s.id}
                  ref={(node) => {
                    if (node) options.current.set(s.id, node);
                    else options.current.delete(s.id);
                  }}
                  role="option"
                  tabIndex={i === active ? 0 : -1}
                  aria-selected={on}
                  onPointerMove={() => {
                    if (i !== active) setActive(i);
                  }}
                  onClick={(event) => {
                    onChoose(s.id, event.currentTarget);
                    close(true);
                  }}
                  className={cn(
                    "relative flex h-8 cursor-pointer items-center justify-between gap-2 rounded-2 px-2.5 text-[12px] text-foreground",
                    FOCUS_IN,
                  )}
                >
                  {i === active ? (
                    <motion.span
                      layoutId={`${uid}-pill`}
                      aria-hidden
                      className="absolute inset-0 rounded-2 bg-cobalt-wash"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <span className="relative">{s.label}</span>
                  {on ? (
                    <span className="relative text-cobalt-bright">
                      <DrawnCheck
                        motionSafe={motionSafe}
                        className="size-3.5"
                      />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------- the card ------------------------------- */

type NodeKind = "button" | "image" | "card";

type CardProps = {
  product: ProductGridItem;
  index: number;
  count: number;
  colors: Map<string, ProductGridColor>;
  money: (n: number) => string;
  density: ProductGridDensity;
  reflow: ProductGridReflow;
  entering: boolean;
  hidden: boolean;
  added: number;
  motionSafe: boolean;
  disabled: boolean;
  /** Files the card's nodes by product id; returns the cleanup React calls when the node goes. */
  register: (
    kind: NodeKind,
    id: string,
    node: Element | null,
  ) => (() => void) | undefined;
  onQuickView: (el: HTMLButtonElement) => void;
  onQuickAdd: (el: HTMLButtonElement) => void;
};

const ProductCard = React.forwardRef<HTMLLIElement, CardProps>(
  function ProductCard(
    {
      product: p,
      index,
      count,
      colors,
      money,
      density,
      reflow,
      entering,
      hidden,
      added,
      motionSafe,
      disabled,
      register,
      onQuickView,
      onQuickAdd,
    },
    ref,
  ) {
    const [lifted, setLifted] = React.useState(false);
    const [within, setWithin] = React.useState(false);
    const first = colors.get(p.colors[0] ?? "");
    const soldOut = p.stock <= 0;
    const badge = soldOut
      ? "Sold out"
      : (p.badge ?? (p.stock <= 8 ? "Low stock" : undefined));
    const delay = reflow === "wave" && motionSafe ? index * cascade(count) : 0;
    const travel = reflow !== "fade" && motionSafe;
    const roomy = density === "roomy";
    const compact = density === "compact";

    return (
      <motion.li
        ref={ref}
        layout={travel ? "position" : false}
        initial={
          entering
            ? motionSafe && reflow !== "fade"
              ? { opacity: 0, scale: 0.94 }
              : { opacity: 0 }
            : false
        }
        animate={{ opacity: hidden ? 0 : 1, scale: 1 }}
        exit={{
          opacity: 0,
          scale: motionSafe && reflow !== "fade" ? 0.94 : 1,
          transition: { duration: durations.fast, ease: easings.exit },
        }}
        transition={{
          layout: { ...springs.glide, delay },
          scale: motionSafe ? { ...springs.glide, delay } : { duration: 0 },
          // Only an arrival fades; a card handing over to its quick view,
          // or taking back from it, swaps at once.
          opacity: entering
            ? { duration: durations.base, ease: easings.enter, delay }
            : { duration: 0 },
        }}
        className="min-w-0"
      >
        <motion.article
          ref={(node) => register("card", p.id, node)}
          aria-label={p.name}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setLifted(true);
          }}
          onPointerLeave={() => setLifted(false)}
          onFocus={() => setWithin(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              setWithin(false);
          }}
          animate={{
            y: motionSafe && (lifted || within) && !disabled ? -2 : 0,
          }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
          className={cn(
            "relative flex h-full rounded-3 border border-hairline bg-card transition-shadow",
            (lifted || within) && !disabled && "shadow-md",
            roomy
              ? "flex-row gap-3 p-2 @min-[40rem]:flex-col @min-[40rem]:gap-0 @min-[40rem]:p-0"
              : "flex-col",
          )}
        >
          <button
            ref={(node) => register("button", p.id, node)}
            type="button"
            disabled={disabled}
            aria-label={`Quick view, ${p.name}, ${money(p.price)}`}
            onClick={(event) => onQuickView(event.currentTarget)}
            className={cn(
              "flex min-w-0 flex-1 rounded-3 text-left disabled:cursor-not-allowed",
              roomy
                ? "flex-row gap-3 @min-[40rem]:flex-col @min-[40rem]:gap-0"
                : "flex-col",
              FOCUS,
            )}
          >
            <div
              ref={(node) => register("image", p.id, node)}
              className={cn(
                "relative aspect-square shrink-0 overflow-clip rounded-2 bg-surface-2",
                roomy
                  ? "w-24 @min-[40rem]:m-2 @min-[40rem]:w-auto"
                  : compact
                    ? "m-1.5"
                    : "m-2",
              )}
            >
              <ProductArt
                shape={p.shape}
                tint={first?.tint ?? "var(--ink-3)"}
                className="size-full"
              />
              {badge ? (
                <span
                  className={cn(
                    "absolute top-1.5 left-1.5 inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-medium",
                    soldOut
                      ? "bg-card text-ink-3"
                      : badge === "Low stock"
                        ? "bg-card text-warn"
                        : "bg-card text-foreground",
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </div>
            <span
              className={cn(
                "flex min-w-0 flex-col gap-0.5",
                compact
                  ? "px-2 pb-2"
                  : roomy
                    ? "py-1 pr-9 @min-[40rem]:px-3 @min-[40rem]:pb-3"
                    : "px-3 pb-3",
              )}
            >
              <span
                className={cn(
                  "truncate font-medium text-foreground",
                  compact ? "text-[12px]" : "text-[13px]",
                )}
                title={p.name}
              >
                {p.name}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "font-mono text-foreground tabular-nums",
                    compact ? "text-[11px]" : "text-[12px]",
                  )}
                >
                  {money(p.price)}
                </span>
                {p.compareAt ? (
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums line-through">
                    {money(p.compareAt)}
                  </span>
                ) : null}
              </span>
              {compact ? null : (
                <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                  <Stars rating={p.rating} />
                  <span className="tabular-nums">{p.reviews}</span>
                </span>
              )}
              {roomy ? (
                <span className="line-clamp-2 text-[12px] leading-snug text-ink-2">
                  {p.description}
                </span>
              ) : null}
              <span aria-hidden className="mt-1 flex items-center gap-1">
                {p.colors.map((c) => {
                  const color = colors.get(c);
                  return color ? (
                    <span
                      key={c}
                      className="size-2.5 rounded-full ring-1 ring-ink-3/30"
                      style={{ background: color.tint }}
                    />
                  ) : null;
                })}
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled={disabled || soldOut}
            aria-label={
              added ? `${p.name} added to the bag` : `Add ${p.name} to the bag`
            }
            onClick={(event) => onQuickAdd(event.currentTarget)}
            className={cn(
              "absolute inline-flex size-8 items-center justify-center rounded-full border border-hairline bg-card text-foreground shadow-sm transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40",
              roomy
                ? "right-2 bottom-2 @min-[40rem]:top-4 @min-[40rem]:right-4 @min-[40rem]:bottom-auto"
                : compact
                  ? "top-3 right-3 size-7"
                  : "top-4 right-4",
              FOCUS,
            )}
          >
            {added ? (
              <DrawnCheck
                key={added}
                motionSafe={motionSafe}
                className="size-3.5 text-success"
              />
            ) : (
              <Plus aria-hidden className="size-3.5 shrink-0" />
            )}
          </button>
        </motion.article>
      </motion.li>
    );
  },
);

/* ----------------------------- the quick view ---------------------------- */

type Rect = { left: number; top: number; width: number; height: number };
type Geo = {
  /** The card and its image, where the morph starts. */
  card: Rect;
  image: Rect;
  /** The panel and its image, where it ends. */
  panel: Rect;
  panelImage: Rect;
};
type DialogMode = "morph" | "sheet" | "side";

type QuickViewProps = {
  product: ProductGridItem;
  colors: Map<string, ProductGridColor>;
  money: (n: number) => string;
  mode: DialogMode;
  progress: MotionValue<number>;
  fade: MotionValue<number>;
  geo: MotionValue<Geo | null>;
  motionSafe: boolean;
  disabled: boolean;
  bindPanel: (node: HTMLDivElement | null) => void;
  bindImage: (node: HTMLDivElement | null) => void;
  onClose: () => void;
  onAdd: (options: ProductGridAddOptions, el: HTMLElement) => void;
  onOpen?: (id: string) => void;
  onSound: (el: Element | null) => void;
};

function QuickView({
  product: p,
  colors,
  money,
  mode,
  progress,
  fade,
  geo,
  motionSafe,
  disabled,
  bindPanel,
  bindImage,
  onClose,
  onAdd,
  onOpen,
  onSound,
}: QuickViewProps) {
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const [color, setColor] = React.useState(p.colors[0] ?? "");
  const [qty, setQty] = React.useState(1);
  const [added, setAdded] = React.useState(0);
  const addedTimer = React.useRef<number | null>(null);
  const swatches = React.useRef(new Map<string, HTMLButtonElement>());
  const tint = colors.get(color)?.tint ?? "var(--ink-3)";
  const soldOut = p.stock <= 0;
  const maxQty = Math.max(1, Math.min(9, p.stock));

  React.useEffect(
    () => () => {
      if (addedTimer.current !== null) window.clearTimeout(addedTimer.current);
    },
    [],
  );

  const clip = useTransform([progress, geo] as MotionValue[], ([m, g]) => {
    const t = m as number;
    const G = g as Geo | null;
    if (mode !== "morph" || !G) return "inset(0px round 12px)";
    const k = 1 - clamp01(t);
    const top = Math.max(0, G.card.top - G.panel.top) * k;
    const left = Math.max(0, G.card.left - G.panel.left) * k;
    const right =
      Math.max(0, G.panel.left + G.panel.width - (G.card.left + G.card.width)) *
      k;
    const bottom =
      Math.max(0, G.panel.top + G.panel.height - (G.card.top + G.card.height)) *
      k;
    return `inset(${r2(top)}px ${r2(right)}px ${r2(bottom)}px ${r2(left)}px round 12px)`;
  });
  const imageX = useTransform([progress, geo] as MotionValue[], ([m, g]) => {
    const G = g as Geo | null;
    if (mode !== "morph" || !G) return 0;
    return r2(lerp(G.image.left - G.panelImage.left, 0, clamp01(m as number)));
  });
  const imageY = useTransform([progress, geo] as MotionValue[], ([m, g]) => {
    const G = g as Geo | null;
    if (mode !== "morph" || !G) return 0;
    return r2(lerp(G.image.top - G.panelImage.top, 0, clamp01(m as number)));
  });
  const imageScale = useTransform(
    [progress, geo] as MotionValue[],
    ([m, g]) => {
      const G = g as Geo | null;
      if (mode !== "morph" || !G || G.panelImage.width <= 0) return 1;
      return Number(
        lerp(
          G.image.width / G.panelImage.width,
          1,
          clamp01(m as number),
        ).toFixed(4),
      );
    },
  );
  const contentOpacity = useTransform(progress, (m) =>
    mode === "morph" ? r2(clamp01((m - 0.45) / 0.55)) : 1,
  );
  const panelY = useTransform([progress, geo] as MotionValue[], ([m, g]) => {
    const G = g as Geo | null;
    if (mode !== "sheet" || !G) return 0;
    return r2((1 - clamp01(m as number)) * (G.panel.height + 16));
  });
  const panelX = useTransform([progress, geo] as MotionValue[], ([m, g]) => {
    const G = g as Geo | null;
    if (mode !== "side" || !G) return 0;
    return r2((1 - clamp01(m as number)) * (G.panel.width + 16));
  });
  const scrim = useTransform([progress, fade] as MotionValue[], ([m, f]) =>
    r2(clamp01(m as number) * (f as number)),
  );

  const trap = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Handled where focus is, so the stage never sees it.
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], [tabindex='0']",
      ),
    ].filter((n) => n.tabIndex >= 0);
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (!firstNode || !lastNode) return;
    const at = document.activeElement;
    if (event.shiftKey && (at === firstNode || at === event.currentTarget)) {
      event.preventDefault();
      lastNode.focus();
    } else if (!event.shiftKey && at === lastNode) {
      event.preventDefault();
      firstNode.focus();
    }
  };

  const colorIndex = Math.max(0, p.colors.indexOf(color));
  const pickColor = (c: string) => {
    setColor(c);
    const node = swatches.current.get(c) ?? null;
    node?.focus({ preventScroll: true });
    onSound(node);
  };

  return (
    <motion.div className="absolute inset-0 z-40" style={{ opacity: fade }}>
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-background/70"
        style={{ opacity: scrim }}
        onPointerDown={onClose}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex [filter:drop-shadow(0_12px_28px_color-mix(in_oklab,black_22%,transparent))]",
          mode === "morph" &&
            "items-center-safe justify-center-safe p-3 @min-[40rem]:p-6",
          mode === "sheet" && "items-end justify-center",
          mode === "side" && "items-stretch justify-end",
        )}
      >
        <motion.div
          ref={bindPanel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={trap}
          className={cn(
            "pointer-events-auto relative flex max-h-full w-full [scrollbar-width:thin] flex-col overflow-y-auto overscroll-contain border border-hairline-strong bg-popover text-foreground outline-none",
            mode === "morph" && "max-w-[40rem] rounded-3",
            mode === "sheet" &&
              "max-h-[88%] max-w-[44rem] rounded-t-4 border-b-0",
            mode === "side" && "max-w-[22rem] border-y-0 border-r-0",
          )}
          style={{ clipPath: clip, x: panelX, y: panelY }}
        >
          <div
            className={cn(
              "grid gap-4 p-4",
              mode !== "side" &&
                "@min-[40rem]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] @min-[40rem]:gap-5 @min-[40rem]:p-5",
            )}
          >
            <div
              className={cn(
                "flex gap-3",
                mode !== "side" && "@min-[40rem]:block",
              )}
            >
              <motion.div
                ref={bindImage}
                className={cn(
                  "relative aspect-square w-28 shrink-0 overflow-clip rounded-2 bg-surface-2",
                  mode === "side" ? "w-28" : "@min-[40rem]:w-full",
                )}
                style={{
                  x: imageX,
                  y: imageY,
                  scale: imageScale,
                  originX: 0,
                  originY: 0,
                }}
              >
                <ProductArt shape={p.shape} tint={tint} className="size-full" />
              </motion.div>
              <motion.div
                className={cn(
                  "flex min-w-0 flex-col gap-1",
                  mode !== "side" && "@min-[40rem]:hidden",
                )}
                style={{ opacity: contentOpacity }}
              >
                <p className="text-[11px] text-ink-3">{p.category}</p>
                <p
                  aria-hidden
                  className="text-[15px] leading-snug font-semibold"
                >
                  {p.name}
                </p>
              </motion.div>
            </div>
            <motion.div
              className="flex min-w-0 flex-col gap-3"
              style={{ opacity: contentOpacity }}
            >
              <div
                className={cn(
                  "flex flex-col gap-1",
                  mode !== "side" ? "hidden @min-[40rem]:flex" : "hidden",
                )}
              >
                <p className="text-[11px] text-ink-3">{p.category}</p>
                <p
                  aria-hidden
                  className="text-[17px] leading-snug font-semibold"
                >
                  {p.name}
                </p>
              </div>
              <h3 id={titleId} className="sr-only">
                {p.name}
              </h3>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-[16px] font-medium tabular-nums">
                  {money(p.price)}
                </span>
                {p.compareAt ? (
                  <span className="font-mono text-[12px] text-ink-3 tabular-nums line-through">
                    {money(p.compareAt)}
                  </span>
                ) : null}
                <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                  <Stars rating={p.rating} />
                  <span>
                    {p.rating.toFixed(1)} ·{" "}
                    {plural(p.reviews, "review", "reviews")}
                  </span>
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-ink-2">
                {p.description}
              </p>
              <div className="flex flex-col gap-2">
                <p className="text-[12px] text-ink-3">
                  Glaze:{" "}
                  <span className="text-foreground">
                    {colors.get(color)?.name ?? color}
                  </span>
                </p>
                <div
                  role="radiogroup"
                  aria-label="Glaze"
                  onKeyDown={(event) => {
                    const n = p.colors.length;
                    if (n === 0) return;
                    let to: number | null = null;
                    if (event.key === "ArrowRight" || event.key === "ArrowDown")
                      to = (colorIndex + 1) % n;
                    else if (
                      event.key === "ArrowLeft" ||
                      event.key === "ArrowUp"
                    )
                      to = (colorIndex - 1 + n) % n;
                    else if (event.key === "Home") to = 0;
                    else if (event.key === "End") to = n - 1;
                    if (to === null) return;
                    event.preventDefault();
                    const c = p.colors[to];
                    if (c) pickColor(c);
                  }}
                  className="flex flex-wrap gap-2"
                >
                  {p.colors.map((c) => {
                    const col = colors.get(c);
                    const on = c === color;
                    return (
                      <button
                        key={c}
                        ref={(node) => {
                          if (node) swatches.current.set(c, node);
                          else swatches.current.delete(c);
                        }}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={col?.name ?? c}
                        tabIndex={on ? 0 : -1}
                        disabled={disabled}
                        onClick={() => pickColor(c)}
                        className={cn(
                          "relative inline-flex size-8 items-center justify-center rounded-full",
                          FOCUS,
                        )}
                      >
                        <span
                          aria-hidden
                          className="size-6 rounded-full ring-1 ring-ink-3/30"
                          style={{ background: col?.tint }}
                        />
                        {on ? (
                          <motion.span
                            aria-hidden
                            layoutId={`${uid}-ring`}
                            className="absolute inset-0 rounded-full border-2 border-foreground"
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label="Quantity"
                  className="inline-flex h-9 items-center rounded-2 border border-hairline"
                >
                  <button
                    type="button"
                    aria-label="One fewer"
                    disabled={disabled || soldOut || qty <= 1}
                    onClick={(event) => {
                      setQty((q) => Math.max(1, q - 1));
                      onSound(event.currentTarget);
                    }}
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-l-2 text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40",
                      FOCUS_IN,
                    )}
                  >
                    <Minus aria-hidden className="size-3.5" />
                  </button>
                  <span className="w-7 text-center font-mono text-[13px]">
                    <Roll text={String(qty)} motionSafe={motionSafe} />
                    <span className="sr-only">{qty}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="One more"
                    disabled={disabled || soldOut || qty >= maxQty}
                    onClick={(event) => {
                      setQty((q) => Math.min(maxQty, q + 1));
                      onSound(event.currentTarget);
                    }}
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-r-2 text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40",
                      FOCUS_IN,
                    )}
                  >
                    <Plus aria-hidden className="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  aria-disabled={soldOut || undefined}
                  onClick={(event) => {
                    if (soldOut) return;
                    onAdd({ color, qty }, event.currentTarget);
                    setAdded((a) => a + 1);
                    if (addedTimer.current !== null)
                      window.clearTimeout(addedTimer.current);
                    addedTimer.current = window.setTimeout(
                      () => setAdded(0),
                      1400,
                    );
                  }}
                  className={cn(
                    "inline-flex h-9 min-w-[9rem] flex-1 items-center justify-center gap-2 rounded-2 px-4 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    soldOut
                      ? "bg-surface-2 text-ink-3"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                    FOCUS,
                  )}
                >
                  {added ? (
                    <DrawnCheck key={added} motionSafe={motionSafe} />
                  ) : null}
                  {soldOut ? "Sold out" : added ? "Added" : "Add to bag"}
                </button>
              </div>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className={cn(
                    "self-start rounded-1 text-[12px] text-cobalt-bright underline-offset-2 hover:underline",
                    FOCUS,
                  )}
                >
                  View details
                </button>
              ) : null}
            </motion.div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(
              "absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <X aria-hidden className="size-4" />
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------- the grid -------------------------------- */

/**
 * A filterable product grid. Facet chips (category, glaze, price band, in
 * stock) and a sort menu reshape the shelf, and the shelf moves rather than
 * snaps: cards that stay travel to their new cells on the glide spring,
 * cards that leave shrink and fade on the exit ease, and cards that arrive
 * scale in — together, as a wave timed by each card's new position, or as a
 * cross-fade. Every chip shows what it would leave and its count rolls.
 *
 * A card's quick view opens a dialog inside the shelf's own frame. In
 * `morph` it grows out of the card: the panel's rounded clip opens from the
 * card's box while the product's art flies from the card to its place in
 * the dialog on one glide progress, and the details fade in over the second
 * half. Closing runs it back into the card on an exit tween.
 *
 * Facets are roving-focus groups of toggle buttons, sort is a listbox, the
 * quick view is a modal dialog that traps focus, closes on Escape and gives
 * focus back to the card. Under reduced motion the shelf rearranges on
 * opacity alone and the dialog fades in place.
 */
export function ProductGrid({
  reflow = "glide",
  quickview = "morph",
  density = "regular",
  products = defaultProducts,
  colors = defaultProductColors,
  priceBands = defaultPriceBands,
  filters,
  defaultFilters = EMPTY_FILTERS,
  onFiltersChange,
  sort,
  defaultSort = "featured",
  onSortChange,
  open,
  defaultOpen = null,
  onOpenChange,
  onAddToCart,
  onOpen,
  pageSize = 12,
  format,
  locale = "en-US",
  currency = "USD",
  status = "ready",
  onRetry,
  title = "Kitchen",
  label,
  sound = false,
  disabled = false,
  className,
}: ProductGridProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const money = React.useMemo(() => {
    if (format) return format;
    const nf = new Intl.NumberFormat(locale, { style: "currency", currency });
    return (n: number) => nf.format(n);
  }, [format, locale, currency]);
  const colorMap = React.useMemo(
    () => new Map(colors.map((c) => [c.id, c])),
    [colors],
  );

  /* ------------------------------- state --------------------------------- */

  const [ownFilters, setOwnFilters] = React.useState(defaultFilters);
  const shownFilters = filters ?? ownFilters;
  const [ownSort, setOwnSort] = React.useState<ProductGridSort>(defaultSort);
  const shownSort = sort ?? ownSort;
  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpen);
  const openId = open === undefined ? ownOpen : open;
  const [pages, setPages] = React.useState(1);

  const click = (el: Element | null | undefined, pitch = 1) => {
    const r = el?.getBoundingClientRect();
    audio.play("click", {
      pitch,
      gain: 0.5,
      pan: r ? panFrom(r.left + r.width / 2, null) : 0,
    });
  };

  const setFilters = (next: ProductGridFilters) => {
    if (disabled) return;
    if (filters === undefined) setOwnFilters(next);
    onFiltersChange?.(next);
  };

  /* ------------------------------ the shelf ------------------------------ */

  const categories = React.useMemo(() => {
    const out: string[] = [];
    for (const p of products)
      if (!out.includes(p.category)) out.push(p.category);
    return out;
  }, [products]);
  const usedColors = colors.filter((c) =>
    products.some((p) => p.colors.includes(c.id)),
  );

  const matching = sorted(
    products.filter((p) => passes(p, shownFilters, priceBands)),
    shownSort,
  );
  const shownCount = Math.max(1, pageSize) * pages;
  const visible = matching.slice(0, shownCount);
  const visibleKey = visible.map((p) => p.id).join(",");
  const signature = `${JSON.stringify(shownFilters)}|${shownSort}`;

  // A new set of filters, or a new sort, starts from the first page and is
  // announced — decided in the render that changes them, from the new values.
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seenSignature, setSeenSignature] = React.useState(signature);
  if (seenSignature !== signature) {
    setSeenSignature(signature);
    setPages(1);
    const order = SORTS.find((s) => s.id === shownSort)?.spoken ?? "";
    setSaid((s) => ({
      n: s.n + 1,
      text: `${plural(matching.length, "product", "products")}, ${order}.`,
    }));
  }

  // Cards that were not on the shelf in the last render are the only ones
  // that enter; a card that merely moved never replays an entrance.
  const [prevVisible, setPrevVisible] = React.useState(visibleKey);
  const [entering, setEntering] = React.useState<Set<string>>(() => new Set());
  if (prevVisible !== visibleKey) {
    const before = new Set(prevVisible.split(","));
    setEntering(
      new Set(visible.map((p) => p.id).filter((id) => !before.has(id))),
    );
    setPrevVisible(visibleKey);
  }

  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const chipSound = (pressed: boolean) => (el?: Element | null) =>
    click(el, pressed ? 0.9 : 1.15);

  const categoryChips: Chip[] = categories.map((c) => {
    const pressed = shownFilters.categories.includes(c);
    return {
      key: c,
      label: c,
      pressed,
      count: products.filter(
        (p) =>
          p.category === c && passes(p, shownFilters, priceBands, "category"),
      ).length,
      toggle: (el) => {
        chipSound(pressed)(el);
        setFilters({
          ...shownFilters,
          categories: toggleIn(shownFilters.categories, c),
        });
      },
    };
  });
  const colorChips: Chip[] = usedColors.map((c) => {
    const pressed = shownFilters.colors.includes(c.id);
    return {
      key: c.id,
      label: c.name,
      swatch: c.tint,
      pressed,
      count: products.filter(
        (p) =>
          p.colors.includes(c.id) &&
          passes(p, shownFilters, priceBands, "color"),
      ).length,
      toggle: (el) => {
        chipSound(pressed)(el);
        setFilters({
          ...shownFilters,
          colors: toggleIn(shownFilters.colors, c.id),
        });
      },
    };
  });
  const priceChips: Chip[] = priceBands.map((b) => {
    const pressed = shownFilters.price === b.id;
    return {
      key: b.id,
      label: b.label,
      pressed,
      count: products.filter(
        (p) =>
          p.price >= b.min &&
          (b.max === undefined || p.price < b.max) &&
          passes(p, shownFilters, priceBands, "price"),
      ).length,
      toggle: (el) => {
        chipSound(pressed)(el);
        setFilters({ ...shownFilters, price: pressed ? null : b.id });
      },
    };
  });
  const stockChips: Chip[] = [
    {
      key: "in-stock",
      label: "In stock",
      pressed: shownFilters.inStock,
      count: products.filter(
        (p) => p.stock > 0 && passes(p, shownFilters, priceBands, "stock"),
      ).length,
      toggle: (el) => {
        chipSound(shownFilters.inStock)(el);
        setFilters({ ...shownFilters, inStock: !shownFilters.inStock });
      },
    },
  ];
  const anyFilter = !sameFilters(shownFilters, EMPTY_FILTERS);

  /* ------------------------------ quick add ------------------------------ */

  const [addedMap, setAddedMap] = React.useState<Record<string, number>>({});
  const addTimers = React.useRef(new Map<string, number>());
  React.useEffect(() => {
    const timers = addTimers.current;
    return () => {
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  const addToBag = (
    p: ProductGridItem,
    options: ProductGridAddOptions,
    el: Element | null,
    flash: boolean,
  ) => {
    if (disabled || p.stock <= 0) return;
    click(el, 1.3);
    onAddToCart?.(p.id, options);
    const colorName = colorMap.get(options.color)?.name;
    setSaid((s) => ({
      n: s.n + 1,
      text: `Added ${options.qty > 1 ? `${options.qty} × ` : ""}${p.name}${colorName ? `, ${colorName}` : ""}, to the bag.`,
    }));
    if (!flash) return;
    setAddedMap((m) => ({ ...m, [p.id]: (m[p.id] ?? 0) + 1 }));
    window.clearTimeout(addTimers.current.get(p.id));
    addTimers.current.set(
      p.id,
      window.setTimeout(() => {
        addTimers.current.delete(p.id);
        setAddedMap((m) => {
          const next = { ...m };
          delete next[p.id];
          return next;
        });
      }, 1400),
    );
  };

  /* ----------------------------- quick view ------------------------------ */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const buttons = React.useRef(new Map<string, Element>());
  const images = React.useRef(new Map<string, Element>());
  const cards = React.useRef(new Map<string, Element>());
  const returnTo = React.useRef<HTMLElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const progress = useMotionValue(0);
  // A dialog mounts invisible and is shown by its opening, never a frame early.
  const fade = useMotionValue(0);
  const geo = useMotionValue<Geo | null>(null);

  /** The dialog on screen: the open id while open, and the closing one until it has gone. */
  const [shown, setShown] = React.useState<{
    id: string;
    key: number;
    mode: DialogMode;
  } | null>(() => (openId ? { id: openId, key: 0, mode: quickview } : null));
  const [closing, setClosing] = React.useState(false);
  const [panelNode, setPanelNode] = React.useState<HTMLDivElement | null>(null);
  const panelImage = React.useRef<HTMLDivElement | null>(null);
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const [rootW, setRootW] = React.useState(0);
  React.useEffect(() => {
    if (!rootNode || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setRootW(rootNode.clientWidth));
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  /**
   * Files a card's node under its product id and, on cleanup, removes it only
   * if it is still the node filed there: a card fading out under a new key
   * must not unregister the card that replaced it.
   */
  const register = (kind: NodeKind, id: string, node: Element | null) => {
    if (!node) return undefined;
    const map: Map<string, Element> =
      kind === "button"
        ? buttons.current
        : kind === "image"
          ? images.current
          : cards.current;
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
      left: r2(b.left - a.left - root.clientLeft),
      top: r2(b.top - a.top - root.clientTop),
      width: r2(b.width),
      height: r2(b.height),
    };
  };

  // A side panel needs a tablet's width; on a phone it rises as a sheet.
  const modeFor = (): DialogMode =>
    quickview === "side" && rootW > 0 && rootW < 640 ? "sheet" : quickview;

  const requestOpen = (id: string | null) => {
    if (open === undefined) setOwnOpen(id);
    onOpenChange?.(id);
  };

  // The open id decides what is shown: a new id mounts the dialog; null
  // starts its exit. Decided in render, from the new value.
  const [seenOpen, setSeenOpen] = React.useState(openId);
  if (seenOpen !== openId) {
    setSeenOpen(openId);
    if (openId) {
      setShown((s) => ({
        id: openId,
        key: (s?.key ?? 0) + 1,
        mode: modeFor(),
      }));
      setClosing(false);
    } else if (shown) {
      setClosing(true);
    }
  }

  const openQuickView = (p: ProductGridItem, el: HTMLButtonElement) => {
    if (disabled) return;
    returnTo.current = el;
    const r = el.getBoundingClientRect();
    audio.play("swish", {
      pitch: 1.2,
      gain: 0.45,
      pan: panFrom(r.left + r.width / 2, null),
    });
    requestOpen(p.id);
  };

  const closeQuickView = () => {
    if (!shown || closing) return;
    audio.play("swish", { pitch: 0.85, gain: 0.35 });
    requestOpen(null);
  };

  // The dialog arrives on the card's box and grows into its own; measured
  // once per opening, when the panel node exists.
  const shownKey = shown?.key ?? -1;
  React.useLayoutEffect(() => {
    if (!shown || closing || !panelNode) return;
    const panel = rel(panelNode);
    const pImage = rel(panelImage.current);
    const card = rel(cards.current.get(shown.id));
    const image = rel(images.current.get(shown.id));
    const morphable =
      shown.mode === "morph" && !!card && !!image && !!panel && !!pImage;
    if (panel && pImage) {
      geo.set(
        morphable && card && image
          ? { card, image, panel, panelImage: pImage }
          : { card: panel, image: pImage, panel, panelImage: pImage },
      );
    }
    if (!motionSafe || (shown.mode === "morph" && !morphable)) {
      progress.jump(1);
      fade.jump(0);
      run(
        "fade",
        animate(fade, 1, { duration: durations.base, ease: easings.enter }),
      );
    } else {
      fade.jump(1);
      progress.jump(0);
      run("progress", animate(progress, 1, springs.glide));
    }
    panelNode.focus({ preventScroll: true });
    // Once per opening, not on every render of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, panelNode]);

  // Closing runs the opening backwards, into wherever the card is now.
  React.useLayoutEffect(() => {
    if (!shown || !closing) return;
    const finish = () => {
      fade.jump(0);
      setShown((s) => (s && s.key === shown.key ? null : s));
      setClosing(false);
    };
    // Back to the card that opened it, if it is still on the shelf.
    const back = returnTo.current;
    const again = buttons.current.get(shown.id);
    const target =
      back && back.isConnected
        ? back
        : again instanceof HTMLElement
          ? again
          : headingRef.current;
    target?.focus({ preventScroll: true });
    const card = rel(cards.current.get(shown.id));
    const image = rel(images.current.get(shown.id));
    const g = geo.get();
    if (motionSafe && shown.mode === "morph" && card && image && g) {
      geo.set({ ...g, card, image });
      run(
        "progress",
        animate(progress, 0, {
          duration: durations.slow * 0.8,
          ease: easings.move,
          onComplete: finish,
        }),
      );
    } else if (motionSafe && shown.mode !== "morph") {
      run(
        "progress",
        animate(progress, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: finish,
        }),
      );
    } else {
      run(
        "fade",
        animate(fade, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: finish,
        }),
      );
    }
    // Once per closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing, shownKey]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const shownProduct = shown
    ? products.find((p) => p.id === shown.id)
    : undefined;
  // A product that leaves the data takes its dialog with it.
  if (shown && !shownProduct && !closing) {
    setClosing(true);
  }

  /* ------------------------------- render -------------------------------- */

  const columns =
    density === "compact"
      ? "grid-cols-2 gap-2 @min-[40rem]:grid-cols-4 @min-[60rem]:grid-cols-6"
      : density === "roomy"
        ? "grid-cols-1 gap-3 @min-[40rem]:grid-cols-2 @min-[60rem]:grid-cols-3"
        : "grid-cols-2 gap-3 @min-[40rem]:grid-cols-3 @min-[60rem]:grid-cols-4";
  const fadeKey = reflow === "fade" ? `${signature}|${pages}` : "";
  const remaining = matching.length - visible.length;

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="truncate text-[15px] font-semibold text-foreground outline-none"
        >
          {title}
        </h2>
        <span
          className={cn(
            "flex items-baseline gap-1 text-[12px] text-ink-3",
            status !== "ready" && "invisible",
          )}
        >
          <Roll
            text={String(matching.length)}
            align="start"
            motionSafe={motionSafe}
            className="font-mono"
          />
          <span aria-hidden>
            {matching.length === 1 ? "product" : "products"}
          </span>
          <span className="sr-only">
            {plural(matching.length, "product", "products")}
          </span>
        </span>
      </div>
      <SortMenu
        value={shownSort}
        motionSafe={motionSafe}
        disabled={disabled || status !== "ready"}
        onChoose={(s, el) => {
          click(el, 1.05);
          if (s === shownSort) return;
          if (sort === undefined) setOwnSort(s);
          onSortChange?.(s);
        }}
      />
    </header>
  );

  const facets = (
    <div className="flex flex-col gap-2 @min-[40rem]:gap-4">
      <div className="relative flex scroll-px-6 [scrollbar-width:none] gap-3 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] px-4 py-1 @min-[40rem]:flex-col @min-[40rem]:gap-4 @min-[40rem]:overflow-visible @min-[40rem]:[mask-image:none] @min-[40rem]:px-0">
        <FacetGroup
          name="Category"
          chips={categoryChips}
          motionSafe={motionSafe}
          disabled={disabled}
        />
        <span
          aria-hidden
          className="w-px shrink-0 self-stretch bg-hairline @min-[40rem]:hidden"
        />
        <FacetGroup
          name="Glaze"
          chips={colorChips}
          motionSafe={motionSafe}
          disabled={disabled}
        />
        <span
          aria-hidden
          className="w-px shrink-0 self-stretch bg-hairline @min-[40rem]:hidden"
        />
        <FacetGroup
          name="Price"
          chips={priceChips}
          motionSafe={motionSafe}
          disabled={disabled}
        />
        <span
          aria-hidden
          className="w-px shrink-0 self-stretch bg-hairline @min-[40rem]:hidden"
        />
        <FacetGroup
          name="Availability"
          chips={stockChips}
          motionSafe={motionSafe}
          disabled={disabled}
        />
      </div>
      <AnimatePresence initial={false}>
        {anyFilter ? (
          <motion.div
            key="clear"
            className="px-4 @min-[40rem]:px-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: durations.fast } }}
            transition={{ duration: durations.fast }}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                click(event.currentTarget, 0.8);
                setFilters(EMPTY_FILTERS);
                headingRef.current?.focus({ preventScroll: true });
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[12px] font-medium text-cobalt-bright hover:bg-cobalt-wash disabled:cursor-not-allowed",
                FOCUS,
              )}
            >
              <X aria-hidden className="size-3.5" />
              Clear filters
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const grid =
    visible.length === 0 ? (
      <div className="flex flex-col items-center gap-3 rounded-3 border border-dashed border-hairline px-6 py-12 text-center">
        <p className="text-sm text-foreground">
          Nothing matches those filters.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            click(event.currentTarget, 0.8);
            setFilters(EMPTY_FILTERS);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground hover:bg-surface-2",
            FOCUS,
          )}
        >
          Clear filters
        </button>
      </div>
    ) : (
      <ul
        role="list"
        aria-label={`${title}, ${plural(matching.length, "product", "products")}`}
        className={cn("relative grid", columns)}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((p, i) => (
            <ProductCard
              key={reflow === "fade" ? `${fadeKey}:${p.id}` : p.id}
              product={p}
              index={i}
              count={visible.length}
              colors={colorMap}
              money={money}
              density={density}
              reflow={reflow}
              entering={reflow === "fade" || entering.has(p.id)}
              hidden={
                !!shown &&
                shown.id === p.id &&
                shown.mode === "morph" &&
                motionSafe
              }
              added={addedMap[p.id] ?? 0}
              motionSafe={motionSafe}
              disabled={disabled}
              register={register}
              onQuickView={(el) => openQuickView(p, el)}
              onQuickAdd={(el) =>
                addToBag(p, { color: p.colors[0] ?? "", qty: 1 }, el, true)
              }
            />
          ))}
        </AnimatePresence>
      </ul>
    );

  const body = () => {
    if (status === "loading") {
      return (
        <div aria-busy="true" className="flex flex-col gap-3 px-4 pb-4">
          <p className="sr-only">Loading products.</p>
          <div className="flex gap-2">
            {[64, 80, 72, 96].map((w) => (
              <span
                key={w}
                className="h-8 shrink-0 rounded-full bg-surface-2"
                style={{ width: w }}
              />
            ))}
          </div>
          <div className={cn("grid", columns)}>
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-3 border border-hairline p-2"
              >
                <span className="aspect-square rounded-2 bg-surface-2" />
                <span className="h-3 w-3/4 rounded-1 bg-surface-2" />
                <span className="h-3 w-1/3 rounded-1 bg-surface-2" />
              </div>
            ))}
          </div>
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
      <div className="flex flex-col gap-3 pb-4 @min-[40rem]:grid @min-[40rem]:grid-cols-[11rem_minmax(0,1fr)] @min-[40rem]:gap-5 @min-[40rem]:px-4">
        <aside aria-label="Filters">{facets}</aside>
        <div className="flex min-w-0 flex-col gap-3 px-4 @min-[40rem]:px-0">
          {grid}
          {remaining > 0 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                click(event.currentTarget, 1);
                setPages((n) => n + 1);
              }}
              className={cn(
                "inline-flex h-9 items-center justify-center self-center rounded-2 border border-hairline px-4 text-[12px] text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed",
                FOCUS,
              )}
            >
              Show {Math.min(remaining, Math.max(1, pageSize))} more
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        setRootNode(node);
      }}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground [contain:paint]",
        disabled && "opacity-70",
        className,
      )}
    >
      <motion.div
        layoutScroll
        inert={!!shown && !closing}
        className="relative max-h-[558px] [scrollbar-width:thin] overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        {header}
        {body()}
      </motion.div>
      {shown && shownProduct ? (
        <QuickView
          key={shown.key}
          product={shownProduct}
          colors={colorMap}
          money={money}
          mode={shown.mode}
          progress={progress}
          fade={fade}
          geo={geo}
          motionSafe={motionSafe}
          disabled={disabled}
          bindPanel={setPanelNode}
          bindImage={(node) => {
            panelImage.current = node;
          }}
          onClose={closeQuickView}
          onAdd={(options, el) => addToBag(shownProduct, options, el, false)}
          onOpen={onOpen}
          onSound={(el) => click(el, 1.1)}
        />
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
