"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ThumbsUp,
  TriangleAlert,
  X,
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
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type RatingsBars = "rows" | "columns";
export type RatingsFilter = "single" | "multi";
export type RatingsPhotos = "strip" | "grid" | "off";
export type RatingsSort = "helpful" | "newest" | "highest" | "lowest";
export type RatingsStatus = "ready" | "loading" | "error";
export type ReviewPhotoScene = "trail" | "shore" | "city" | "studio";

export type ReviewPhoto = {
  id: string;
  /** What the photo shows: its accessible name. */
  alt: string;
  /** The product's colour in the photo, any CSS colour — pass a token. */
  tint?: string;
  /** Where it was taken: picks the drawn scene. @default "trail" */
  scene?: ReviewPhotoScene;
};

export type Review = {
  id: string;
  author: string;
  /** 1 to 5. */
  rating: number;
  title: string;
  body: string;
  /** When it was written, ms since the epoch. */
  date: number;
  verified?: boolean;
  /** How many found it helpful, before this visitor. */
  helpful: number;
  /** "UK 7 · Slate". */
  variant?: string;
  photos?: ReviewPhoto[];
};

export type RatingsSummaryProps = {
  /** How the distribution is drawn: horizontal rows, or a five-column histogram. @default "rows" */
  bars?: RatingsBars;
  /** One star at a time (a wash slides between bars), or several toggled together. @default "single" */
  filter?: RatingsFilter;
  /** Photos from reviews as one scrolling strip, a mosaic grid, or left out. @default "strip" */
  photos?: RatingsPhotos;
  /** The page of reviews shown under the summary. @default defaultReviews */
  reviews?: Review[];
  /** Ratings per star for the whole product, 1★ first. @default defaultRatingDistribution, or counted from `reviews` when you pass your own reviews */
  distribution?: number[];
  /** The product, read in the summary sentence. @default "Ridge Trail Runner" */
  productName?: string;
  /** Controlled star filter: the ratings shown, empty for all. */
  stars?: number[];
  /** Initial star filter when uncontrolled. @default [] */
  defaultStars?: number[];
  /** Fires from the bar, key or Clear that changed the filter. */
  onStarsChange?: (stars: number[]) => void;
  /** Controlled order. */
  sort?: RatingsSort;
  /** Initial order when uncontrolled. @default "helpful" */
  defaultSort?: RatingsSort;
  /** Fires when the visitor picks an order. */
  onSortChange?: (sort: RatingsSort) => void;
  /** Controlled: the reviews this visitor marked helpful. */
  voted?: string[];
  /** Initial helpful marks when uncontrolled. @default [] */
  defaultVoted?: string[];
  /** Fires with every helpful mark after a vote. */
  onVotedChange?: (voted: string[]) => void;
  /** A review was marked helpful (true) or unmarked (false). */
  onVote?: (id: string, voted: boolean) => void;
  /** Reviews shown before "Show more". @default 5 */
  pageSize?: number;
  /** A photo was opened in the viewer. */
  onPhotoOpen?: (photoId: string, reviewId: string) => void;
  /** The summary's moment (Date or ms): "3 days ago" counts from it. @default defaultRatingsNow */
  now?: number | Date;
  /** Review dates to text. @default "3 days ago", then "Sep 12" */
  formatDate?: (ms: number, now: number) => string;
  /** The heading. @default "Ratings & reviews" */
  title?: string;
  /** Whether the reviews have arrived. @default "ready" */
  status?: RatingsStatus;
  /** "Try again" was pressed after the reviews failed to load. */
  onRetry?: () => void;
  /** The region's accessible name. @default the title */
  label?: string;
  /** Ticks for bars and photos, a pop for a helpful vote. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: the reviews still read, nothing can be filtered or voted. @default false */
  disabled?: boolean;
  /** Classes for the root. It is at most 560px tall and scrolls inside itself. */
  className?: string;
};

/* -------------------------------- defaults ------------------------------- */

const DAY_MS = 86_400_000;

/** 2 October 2026, 10:00 UTC. */
export const defaultRatingsNow = Date.UTC(2026, 9, 2, 10, 0);

/** 1★ to 5★ for the whole product: 1,284 ratings, 4.5 on average. */
export const defaultRatingDistribution = [38, 21, 64, 297, 864];

const day = (m: number, d: number) => Date.UTC(2026, m, d, 12, 0);

export const defaultReviews: Review[] = [
  {
    id: "r1",
    author: "Ana R.",
    rating: 5,
    title: "Grippy on wet rock",
    body: "Took them up the ridge after two days of rain and never slipped once. The lugs shed mud on the descent instead of packing up, and the toe bumper saved me on a root I didn't see.",
    date: day(8, 29),
    verified: true,
    helpful: 42,
    variant: "UK 7 · Slate",
    photos: [
      {
        id: "p1",
        alt: "Slate trail runners on a wet rock slab",
        tint: "var(--accent-bright)",
        scene: "trail",
      },
      {
        id: "p2",
        alt: "Muddy outsole after a descent",
        tint: "var(--accent-bright)",
        scene: "studio",
      },
    ],
  },
  {
    id: "r2",
    author: "Theo M.",
    rating: 4,
    title: "Light, but runs small",
    body: "Order half a size up. Once I did, they were the lightest trail shoe I've owned, and the heel lock is better than my last pair.",
    date: day(8, 21),
    verified: true,
    helpful: 31,
    variant: "UK 10 · Moss",
    photos: [
      {
        id: "p3",
        alt: "Moss runners beside a size box",
        tint: "var(--success)",
        scene: "city",
      },
    ],
  },
  {
    id: "r3",
    author: "Priya K.",
    rating: 5,
    title: "Third pair, no regrets",
    body: "Same fit every time, which is the whole point. About 600 km per pair before the lugs go flat.",
    date: day(8, 3),
    verified: true,
    helpful: 18,
    variant: "UK 5 · Slate",
  },
  {
    id: "r4",
    author: "Jonas W.",
    rating: 2,
    title: "Sole wore fast on road",
    body: "Great on dirt, but I do a mile of tarmac to reach the trail and the forefoot lugs were half gone in two months. Fine if you never touch pavement; I do, so I'm going back to my old pair for daily runs and keeping these for weekends. Customer service were quick and helpful about it, to be fair.",
    date: day(7, 30),
    verified: true,
    helpful: 27,
    variant: "UK 9 · Slate",
    photos: [
      {
        id: "p4",
        alt: "Worn forefoot lugs after two months",
        tint: "var(--accent-bright)",
        scene: "studio",
      },
    ],
  },
  {
    id: "r5",
    author: "Mara L.",
    rating: 5,
    title: "Comfortable from the first mile",
    body: "No break-in at all. Wore them straight out of the box for a 20 km loop and finished without a hot spot.",
    date: day(8, 26),
    verified: false,
    helpful: 12,
    variant: "UK 6 · Rust",
    photos: [
      {
        id: "p5",
        alt: "Rust runners at a lake shore at dusk",
        tint: "var(--danger)",
        scene: "shore",
      },
    ],
  },
  {
    id: "r6",
    author: "Sam O.",
    rating: 3,
    title: "Good shoe, narrow toe box",
    body: "Everything about the ride is right, but my little toes rub after an hour. If you have wide feet, try them on first.",
    date: day(8, 14),
    verified: true,
    helpful: 15,
    variant: "UK 11 · Slate",
  },
  {
    id: "r7",
    author: "Ines B.",
    rating: 4,
    title: "Great on gravel",
    body: "Stable and quiet on loose gravel, a touch firm on hardpack. The drop feels lower than listed.",
    date: day(8, 9),
    verified: true,
    helpful: 9,
    variant: "UK 4 · Moss",
    photos: [
      {
        id: "p6",
        alt: "Moss runners on a gravel track",
        tint: "var(--success)",
        scene: "trail",
      },
    ],
  },
  {
    id: "r8",
    author: "Dev P.",
    rating: 1,
    title: "Laces snapped twice",
    body: "The shoe is fine but both laces snapped within a month. Replacement laces arrived quickly, then one of those went too.",
    date: day(8, 18),
    verified: true,
    helpful: 6,
    variant: "UK 8 · Slate",
  },
  {
    id: "r9",
    author: "Lucia F.",
    rating: 5,
    title: "Drains fast after a crossing",
    body: "Waded a stream at the start of a long day and they were nearly dry an hour later. No blisters.",
    date: day(7, 22),
    verified: true,
    helpful: 11,
    variant: "UK 6 · Slate",
  },
  {
    id: "r10",
    author: "Oskar N.",
    rating: 4,
    title: "Solid daily trainer",
    body: "Not the fastest shoe I own but the one I reach for most. Grip is excellent, cushioning is middle of the road.",
    date: day(8, 30),
    verified: true,
    helpful: 4,
    variant: "UK 9 · Rust",
    photos: [
      {
        id: "p7",
        alt: "Rust runners laced up on a doorstep",
        tint: "var(--danger)",
        scene: "city",
      },
    ],
  },
  {
    id: "r11",
    author: "Hana T.",
    rating: 5,
    title: "Worth every penny",
    body: "Light, grippy, and they look good enough to wear to the pub afterwards.",
    date: day(7, 11),
    verified: false,
    helpful: 3,
    variant: "UK 5 · Moss",
  },
  {
    id: "r12",
    author: "Rui C.",
    rating: 3,
    title: "Heel slips a little",
    body: "Had to use the extra eyelet to stop my heel lifting on steep climbs. Otherwise a lovely shoe.",
    date: day(8, 1),
    verified: true,
    helpful: 7,
    variant: "UK 8 · Moss",
    photos: [
      {
        id: "p8",
        alt: "Heel lock lacing on moss runners",
        tint: "var(--success)",
        scene: "studio",
      },
    ],
  },
  {
    id: "r13",
    author: "Ellie G.",
    rating: 5,
    title: "Ran a 50k in them",
    body: "Mixed terrain, nine hours, and my feet were the least of my problems. Will be buying the next version.",
    date: day(7, 3),
    verified: true,
    helpful: 22,
    variant: "UK 6 · Slate",
    photos: [
      {
        id: "p9",
        alt: "Finish line arch with slate runners in front",
        tint: "var(--accent-bright)",
        scene: "shore",
      },
    ],
  },
  {
    id: "r14",
    author: "Ben A.",
    rating: 4,
    title: "Nice colour, firm ride",
    body: "The rust colour is even better in person. Firmer underfoot than I expected, which I've come to like.",
    date: day(8, 27),
    verified: true,
    helpful: 2,
    variant: "UK 10 · Rust",
  },
];

/* -------------------------------- helpers -------------------------------- */

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const SORTS: { id: RatingsSort; label: string }[] = [
  { id: "helpful", label: "Most helpful" },
  { id: "newest", label: "Newest" },
  { id: "highest", label: "Highest rated" },
  { id: "lowest", label: "Lowest rated" },
];
const STARS = [5, 4, 3, 2, 1];

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());
/** "1,284": by hand, so server and browser print the same. */
const thousands = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const relative = (ms: number, now: number) => {
  const days = Math.floor((now - ms) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

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

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Star pigment: amber at a fixed lightness, the same in both themes. */
const STAR = "oklch(from var(--warn) 0.8 0.15 h)";
const STAR_PATH =
  "M8 1.4l1.96 4.1 4.5.56-3.3 3.1.84 4.46L8 11.44l-4 2.18.84-4.46-3.3-3.1 4.5-.56Z";

/* ----------------------------- small pieces ------------------------------ */

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function RollDigit({
  digit,
  motionSafe,
  from,
}: {
  digit: number;
  motionSafe: boolean;
  from?: number;
}) {
  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ height: "1em", lineHeight: 1 }}
    >
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={from !== undefined && motionSafe ? { y: `${-from}em` } : false}
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

/** A figure whose digits roll on snap, keyed from the right. */
function Roll({
  text,
  motionSafe,
  className,
  fromZero = false,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
  /** Roll up from zero when it first appears. */
  fromZero?: boolean;
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
              from={fromZero ? 0 : undefined}
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

function Stars({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const box = size === "md" ? "size-4" : "size-3";
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 16 16" className={box}>
          <path
            d={STAR_PATH}
            style={{ fill: n <= Math.round(value) ? STAR : undefined }}
            className={n <= Math.round(value) ? undefined : "fill-ink-3/25"}
          />
        </svg>
      ))}
    </span>
  );
}

/**
 * A seeded photograph: sky, a horizon of hills or a skyline, and the product
 * in the visitor's colour. Pigments sit at fixed lightness, so the photo is
 * the same picture in either theme.
 */
function PhotoArt({
  photo,
  className,
}: {
  photo: ReviewPhoto;
  className?: string;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gid = `ph-${uid}`;
  const next = seeded(hash(photo.id));
  const scene = photo.scene ?? "trail";
  const tint = photo.tint ?? "var(--accent-bright)";
  const skyA =
    scene === "shore"
      ? "oklch(from var(--warn) 0.86 0.07 h)"
      : scene === "city"
        ? "oklch(from var(--ink-2) 0.86 0.02 h)"
        : scene === "studio"
          ? "oklch(from var(--ink-2) 0.93 0.01 h)"
          : "oklch(from var(--accent-bright) 0.88 0.05 h)";
  const skyB =
    scene === "shore"
      ? "oklch(from var(--danger) 0.74 0.08 h)"
      : scene === "studio"
        ? "oklch(from var(--ink-2) 0.84 0.015 h)"
        : "oklch(from var(--accent-bright) 0.78 0.06 h)";
  const ground =
    scene === "shore"
      ? "oklch(from var(--accent-bright) 0.5 0.08 h)"
      : scene === "city"
        ? "oklch(from var(--ink-2) 0.5 0.02 h)"
        : scene === "studio"
          ? "oklch(from var(--ink-2) 0.76 0.015 h)"
          : "oklch(from var(--success) 0.55 0.08 h)";
  const far = "oklch(from var(--success) 0.68 0.06 h)";
  const shoe = `oklch(from ${tint} 0.6 0.13 h)`;
  const sole = "oklch(from var(--ink) 0.95 0.01 h)";
  const h0 = r2(30 + next() * 8);
  const hills: string[] = [];
  for (let layer = 0; layer < 2; layer += 1) {
    let d = `M0 60 L0 ${r2(h0 - 6 + layer * 8)}`;
    for (let x = 10; x <= 80; x += 10) {
      d += ` L${x} ${r2(h0 - 10 + layer * 8 + next() * 10)}`;
    }
    hills.push(`${d} L80 60 Z`);
  }
  const towers = Array.from({ length: 7 }, (_, i) => ({
    x: i * 12 - 2 + Math.round(next() * 3),
    h: Math.round(10 + next() * 18),
  }));
  const sx = r2(18 + next() * 20);
  const sy = r2(scene === "studio" ? 36 : 40 + next() * 4);
  const sunX = r2(15 + next() * 50);
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 60"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block size-full", className)}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: skyA }} />
          <stop offset="1" style={{ stopColor: skyB }} />
        </linearGradient>
      </defs>
      <rect width="80" height="60" fill={`url(#${gid})`} />
      {scene === "studio" ? (
        <rect y="42" width="80" height="18" style={{ fill: ground }} />
      ) : scene === "city" ? (
        <>
          {towers.map((t, i) => (
            <rect
              key={i}
              x={t.x}
              y={44 - t.h}
              width="10"
              height={t.h + 16}
              style={{ fill: far }}
              opacity="0.55"
            />
          ))}
          <rect y="44" width="80" height="16" style={{ fill: ground }} />
        </>
      ) : (
        <>
          {scene === "shore" ? (
            <circle
              cx={sunX}
              cy="22"
              r="7"
              style={{ fill: sole }}
              opacity="0.85"
            />
          ) : null}
          <path d={hills[0]} style={{ fill: far }} />
          <path d={hills[1]} style={{ fill: ground }} />
        </>
      )}
      <g>
        <path
          d={`M${sx} ${sy}c2-6 9-7 13-5l5 2c4 1 10 2 13 5v3H${sx}Z`}
          style={{ fill: shoe }}
        />
        <rect
          x={sx - 0.5}
          y={sy + 5}
          width="32"
          height="2.6"
          rx="1.3"
          style={{ fill: sole }}
        />
        <path
          d={`M${r2(sx + 8)} ${r2(sy - 3.5)}l3 4M${r2(sx + 11)} ${r2(sy - 4.2)}l3 4`}
          stroke={sole}
          strokeWidth="0.9"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/**
 * A box whose height follows its content on glide, measured where it lands.
 * Hidden still scrolls, so a scroll is put back at once.
 */
function Measured({
  motionSafe,
  className,
  children,
}: {
  motionSafe: boolean;
  className?: string;
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
      style={{ height }}
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

/* ------------------------------ distribution ----------------------------- */

function Distribution({
  uid,
  bars,
  filter,
  counts,
  total,
  chosen,
  onToggle,
  onMove,
  motionSafe,
  disabled,
}: {
  uid: string;
  bars: RatingsBars;
  filter: RatingsFilter;
  counts: number[];
  total: number;
  chosen: number[];
  onToggle: (star: number, el: HTMLElement) => void;
  onMove: (star: number, el: HTMLElement) => void;
  motionSafe: boolean;
  disabled: boolean;
}) {
  const [focus, setFocus] = React.useState(5);
  const max = Math.max(1, ...counts);
  const order = bars === "columns" ? [1, 2, 3, 4, 5] : STARS;
  const any = chosen.length > 0;
  const step = cascade(5);

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const back = bars === "columns" ? "ArrowLeft" : "ArrowUp";
    const fwd = bars === "columns" ? "ArrowRight" : "ArrowDown";
    let to = -1;
    if (event.key === fwd) to = Math.min(order.length - 1, i + 1);
    else if (event.key === back) to = Math.max(0, i - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = order.length - 1;
    if (to === -1) return;
    event.preventDefault();
    const star = order[to];
    if (star === undefined) return;
    setFocus(star);
    const group = event.currentTarget.closest("[role='group']");
    const node = group?.querySelector<HTMLElement>(`[data-star="${star}"]`);
    node?.focus();
    if (node) onMove(star, node);
  };

  return (
    <div
      role="group"
      aria-label="Filter by rating"
      className={cn(
        bars === "columns"
          ? "grid grid-cols-5 items-end gap-1.5"
          : "flex flex-col gap-0.5",
      )}
    >
      {order.map((star, i) => {
        const count = counts[star - 1] ?? 0;
        const share = total ? count / total : 0;
        const fill = r2(count / max);
        const on = chosen.includes(star);
        const pct = Math.round(share * 100);
        const name = `${star} ${star === 1 ? "star" : "stars"}, ${thousands(count)} ${count === 1 ? "rating" : "ratings"}, ${pct} percent`;
        const fillTransition = motionSafe
          ? { ...springs.glide, delay: (5 - star) * step }
          : { duration: 0 };
        return (
          <button
            key={star}
            type="button"
            data-star={star}
            aria-pressed={on}
            aria-label={name}
            aria-disabled={disabled || undefined}
            tabIndex={star === focus ? 0 : -1}
            onFocus={() => setFocus(star)}
            onClick={(event) => {
              if (!disabled) onToggle(star, event.currentTarget);
            }}
            onKeyDown={(event) => onKeyDown(event, i)}
            className={cn(
              "group/ratings-summary-bar relative rounded-2 text-left transition-opacity duration-150",
              any && !on ? "opacity-55 hover:opacity-90" : "opacity-100",
              bars === "columns"
                ? "flex flex-col items-center gap-1.5 px-0.5 pt-1 pb-1.5"
                : "grid h-8 grid-cols-[2.25rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-2",
              RING_IN,
            )}
          >
            {on && filter === "single" ? (
              <motion.span
                aria-hidden
                layoutId={motionSafe ? `${uid}-wash` : undefined}
                transition={springs.snap}
                className="absolute inset-0 rounded-2 bg-cobalt-wash"
              />
            ) : null}
            {on && filter === "multi" ? (
              <span
                aria-hidden
                className="absolute inset-0 rounded-2 bg-cobalt-wash"
              />
            ) : null}
            {!on ? (
              <span
                aria-hidden
                className="absolute inset-0 rounded-2 bg-surface-2 opacity-0 transition-opacity group-hover/ratings-summary-bar:opacity-100"
              />
            ) : null}
            {bars === "columns" ? (
              <>
                <span className="relative font-mono text-[10px] text-ink-3 tabular-nums">
                  <span className="group-hover/ratings-summary-bar:hidden group-focus-visible/ratings-summary-bar:hidden">
                    {thousands(count)}
                  </span>
                  <span className="hidden group-hover/ratings-summary-bar:inline group-focus-visible/ratings-summary-bar:inline">
                    {pct}%
                  </span>
                </span>
                <span className="relative flex h-24 w-full items-end overflow-hidden rounded-1 bg-surface-2">
                  <motion.span
                    className={cn(
                      "block w-full origin-bottom rounded-1",
                      on ? "bg-cobalt-bright" : "bg-ink-3/45",
                    )}
                    style={{ height: "100%" }}
                    initial={motionSafe ? { scaleY: 0 } : false}
                    animate={{ scaleY: fill }}
                    transition={fillTransition}
                  />
                </span>
                <span className="relative inline-flex items-center gap-0.5 text-[11px] text-ink-2">
                  {star}
                  <svg aria-hidden viewBox="0 0 16 16" className="size-2.5">
                    <path d={STAR_PATH} style={{ fill: STAR }} />
                  </svg>
                  {on && filter === "multi" ? (
                    <Check
                      aria-hidden
                      className="size-3 text-cobalt-bright"
                      strokeWidth={2.4}
                    />
                  ) : null}
                </span>
              </>
            ) : (
              <>
                <span className="relative inline-flex items-center gap-1 text-[12px] text-ink-2">
                  {star}
                  <svg aria-hidden viewBox="0 0 16 16" className="size-3">
                    <path d={STAR_PATH} style={{ fill: STAR }} />
                  </svg>
                </span>
                <span className="relative h-2 overflow-hidden rounded-full bg-surface-2">
                  <motion.span
                    className={cn(
                      "absolute inset-y-0 left-0 w-full origin-left rounded-full",
                      on ? "bg-cobalt-bright" : "bg-ink-3/45",
                    )}
                    initial={motionSafe ? { scaleX: 0 } : false}
                    animate={{ scaleX: fill }}
                    transition={fillTransition}
                  />
                </span>
                <span className="relative inline-flex items-center justify-end gap-1 font-mono text-[11px] text-ink-3 tabular-nums">
                  {on && filter === "multi" ? (
                    <Check
                      aria-hidden
                      className="size-3 text-cobalt-bright"
                      strokeWidth={2.4}
                    />
                  ) : null}
                  <span className="group-hover/ratings-summary-bar:hidden group-focus-visible/ratings-summary-bar:hidden">
                    {thousands(count)}
                  </span>
                  <span className="hidden group-hover/ratings-summary-bar:inline group-focus-visible/ratings-summary-bar:inline">
                    {pct}%
                  </span>
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- viewer -------------------------------- */

type Shot = { photo: ReviewPhoto; review: Review };

function Viewer({
  uid,
  shots,
  index,
  from,
  grow,
  onIndex,
  onClose,
  onSeeReview,
  motionSafe,
  formatDate,
}: {
  uid: string;
  shots: Shot[];
  index: number;
  /** The index it opened on: only that one grows out of its thumbnail. */
  from: number;
  /** Whether the thumbnail it opened from can be grown out of. */
  grow: boolean;
  onIndex: (i: number, dir: number) => void;
  onClose: () => void;
  onSeeReview: (reviewId: string) => void;
  motionSafe: boolean;
  formatDate: (ms: number) => string;
}) {
  const shot = shots[index];
  const [dir, setDir] = React.useState(1);
  const dx = useMotionValue(0);
  const [box, setBox] = React.useState<HTMLDivElement | null>(null);
  const width = React.useRef(300);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    if (!box) return;
    box.focus({ preventScroll: true });
  }, [box]);

  React.useEffect(() => () => anim.current?.stop(), []);

  const go = (d: number) => {
    const to = index + d;
    if (to < 0 || to >= shots.length) {
      if (motionSafe) {
        anim.current?.stop();
        anim.current = animate(dx, 0, { ...springs.snap, velocity: d * -400 });
      }
      return;
    }
    setDir(d);
    onIndex(to, d);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    onStart: ({ event }) => {
      anim.current?.stop();
      const el = event.currentTarget as HTMLElement | null;
      width.current = el?.getBoundingClientRect().width || 300;
    },
    onMove: ({ offset }) => {
      const atEdge =
        (offset.x > 0 && index === 0) ||
        (offset.x < 0 && index === shots.length - 1);
      dx.set(r2(atEdge ? rubberband(offset.x, width.current) : offset.x));
    },
    onEnd: ({ offset, velocity }) => {
      const landing = project(offset.x, velocity.x, 0.99);
      const d =
        landing < -width.current / 4 ? 1 : landing > width.current / 4 ? -1 : 0;
      const canGo =
        d !== 0 && index + d >= 0 && index + d < shots.length && motionSafe;
      if (canGo) {
        dx.jump(0);
        go(d);
        return;
      }
      anim.current = animate(
        dx,
        0,
        motionSafe
          ? { ...springs.snap, velocity: velocity.x }
          : { duration: 0 },
      );
    },
    onCancel: () => {
      anim.current = animate(dx, 0, springs.snap);
    },
  });

  if (!shot) return null;

  const trap = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
      return;
    }
    if (event.key !== "Tab" || !box) return;
    const nodes = [
      ...box.querySelectorAll<HTMLElement>("button:not([disabled])"),
    ];
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === box)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <motion.div
      ref={setBox}
      role="dialog"
      aria-label={`Photo ${index + 1} of ${shots.length}: ${shot.photo.alt}`}
      tabIndex={-1}
      onKeyDown={trap}
      className="absolute inset-0 z-40 flex flex-col gap-3 bg-popover p-3 outline-none @min-[40rem]:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-ink-3 tabular-nums">
          {index + 1} of {shots.length}
        </p>
        <button
          type="button"
          aria-label="Close photo"
          onClick={onClose}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            RING,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div
        {...drag}
        className="relative flex flex-1 touch-pan-y items-center-safe justify-center-safe overflow-clip select-none"
      >
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <motion.div
            key={shot.photo.id}
            custom={dir}
            className="relative aspect-[4/3] max-h-full w-full max-w-[34rem] overflow-hidden rounded-3"
            variants={{
              enter: (d: number) => ({
                opacity: 0,
                x: motionSafe && index !== from ? distances.shift * d : 0,
              }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({
                opacity: 0,
                x: motionSafe ? -distances.shift * d : 0,
                transition: exitFor(durations.base),
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={
              motionSafe
                ? { x: springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
          >
            <motion.div
              className="size-full"
              layoutId={
                motionSafe && grow && index === from
                  ? `${uid}-photo-${shot.photo.id}`
                  : undefined
              }
              transition={springs.glide}
            >
              {/* The hand's offset rides an inner layer, never the one the
                  layout animation is moving. */}
              <motion.div className="size-full" style={{ x: dx }}>
                <PhotoArt photo={shot.photo} />
              </motion.div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
        <button
          type="button"
          aria-label="Previous photo"
          aria-disabled={index === 0 || undefined}
          onClick={() => go(-1)}
          className={cn(
            "absolute top-1/2 left-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-hairline bg-card/90 text-foreground transition-opacity aria-disabled:opacity-0",
            RING,
          )}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next photo"
          aria-disabled={index === shots.length - 1 || undefined}
          onClick={() => go(1)}
          className={cn(
            "absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-hairline bg-card/90 text-foreground transition-opacity aria-disabled:opacity-0",
            RING,
          )}
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Stars value={shot.review.rating} />
            <p className="truncate text-[13px] font-medium text-foreground">
              {shot.review.title}
            </p>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-3">
            {shot.review.author} · {formatDate(shot.review.date)} ·{" "}
            {shot.photo.alt}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSeeReview(shot.review.id)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
            RING,
          )}
        >
          See review
        </button>
      </div>
    </motion.div>
  );
}

/* --------------------------------- review -------------------------------- */

const LONG = 170;

function ReviewItem({
  review,
  voted,
  expanded,
  onVote,
  onExpand,
  onPhoto,
  bindPhoto,
  bind,
  photosOn,
  uid,
  motionSafe,
  disabled,
  formatDate,
}: {
  review: Review;
  voted: boolean;
  expanded: boolean;
  onVote: (el: HTMLElement) => void;
  onExpand: () => void;
  onPhoto: (photoId: string, el: HTMLElement) => void;
  bindPhoto: (id: string, node: HTMLButtonElement | null) => void;
  bind: (node: HTMLElement | null) => void;
  photosOn: boolean;
  uid: string;
  motionSafe: boolean;
  disabled: boolean;
  formatDate: (ms: number) => string;
}) {
  const headId = `${uid}-rev-${review.id}`;
  const long = review.body.length > LONG;
  const count = review.helpful + (voted ? 1 : 0);
  return (
    <article
      ref={bind}
      tabIndex={-1}
      aria-labelledby={headId}
      className="flex flex-col gap-1.5 rounded-3 border border-hairline bg-card p-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
    >
      <div className="flex items-center gap-2">
        <Stars value={review.rating} />
        <span className="sr-only">Rated {review.rating} out of 5.</span>
        <h4
          id={headId}
          className="min-w-0 truncate text-[13px] font-medium text-foreground"
          title={review.title}
        >
          {review.title}
        </h4>
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-3">
        <span className="text-ink-2">{review.author}</span>
        {review.verified ? (
          <span className="inline-flex items-center gap-0.5 text-success">
            <BadgeCheck aria-hidden className="size-3" />
            Verified buyer
          </span>
        ) : null}
        <span aria-hidden>·</span>
        <span>{formatDate(review.date)}</span>
        {review.variant ? (
          <>
            <span aria-hidden>·</span>
            <span>{review.variant}</span>
          </>
        ) : null}
      </p>
      <Measured motionSafe={motionSafe}>
        <p
          id={`${headId}-body`}
          className={cn(
            "text-[13px] leading-relaxed text-ink-2",
            long && !expanded && "line-clamp-3",
          )}
        >
          {review.body}
        </p>
      </Measured>
      {long ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`${headId}-body`}
          onClick={onExpand}
          className={cn(
            "-ml-1 w-fit rounded-1 px-1 text-[12px] text-cobalt-bright hover:underline",
            RING,
          )}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
      {photosOn && review.photos?.length ? (
        <div className="flex gap-1.5 pt-0.5">
          {review.photos.map((p) => (
            <button
              key={p.id}
              type="button"
              ref={(node) => bindPhoto(`r:${p.id}`, node)}
              aria-label={`Open photo: ${p.alt}`}
              onClick={(event) => onPhoto(p.id, event.currentTarget)}
              className={cn(
                "size-12 overflow-hidden rounded-2 border border-hairline",
                RING,
              )}
            >
              <PhotoArt photo={p} />
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          aria-pressed={voted}
          aria-label={`Helpful, ${count} ${count === 1 ? "person" : "people"} found this helpful`}
          aria-disabled={disabled || undefined}
          onClick={(event) => {
            if (!disabled) onVote(event.currentTarget);
          }}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors",
            voted
              ? "border-cobalt-bright/50 bg-cobalt-wash text-cobalt-bright"
              : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
            RING,
          )}
        >
          <motion.span
            aria-hidden
            className="inline-flex"
            animate={
              voted && motionSafe
                ? { scale: [1, 1.4, 1], rotate: [0, -12, 0] }
                : { scale: 1, rotate: 0 }
            }
            transition={{ duration: 0.34, ease: easings.enter }}
          >
            <ThumbsUp className="size-3.5" strokeWidth={voted ? 2.2 : 1.8} />
          </motion.span>
          Helpful
          <span aria-hidden className="text-ink-3">
            ·
          </span>
          <Roll
            text={String(count)}
            motionSafe={motionSafe}
            className="font-mono text-[12px]"
          />
        </button>
      </div>
    </article>
  );
}

/* --------------------------------- summary ------------------------------- */

type Said = { n: number; text: string };

/**
 * A product's ratings, with the distribution as the filter. The average
 * rolls up on snap when the data arrives, the stars fill from the left on
 * glide and the five bars grow on a cascade; pressing a bar filters the
 * list below, which reflows rather than reloads — leavers fade out, the rest
 * travel to their new places on glide and newcomers arrive from 8px, inside a
 * height that glides with them. One star at a time slides a wash between
 * bars on snap; several toggle with checks.
 *
 * Helpful votes roll their count and pop the thumb. Photos from reviews sit
 * in a strip or a mosaic, and open in a viewer that covers the component's
 * own frame: the photo grows out of its thumbnail, Left and Right or a swipe
 * move between photos, See review takes you to the words. Under reduced
 * motion every fill appears whole and the list swaps without travel; every
 * count and filter still shows.
 */
export function RatingsSummary({
  bars = "rows",
  filter = "single",
  photos = "strip",
  reviews = defaultReviews,
  distribution,
  productName = "Ridge Trail Runner",
  stars,
  defaultStars = [],
  onStarsChange,
  sort,
  defaultSort = "helpful",
  onSortChange,
  voted,
  defaultVoted = [],
  onVotedChange,
  onVote,
  pageSize = 5,
  onPhotoOpen,
  now = defaultRatingsNow,
  formatDate,
  title = "Ratings & reviews",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: RatingsSummaryProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const nowMs = toMs(now);
  const fmt = (ms: number) =>
    formatDate ? formatDate(ms, nowMs) : relative(ms, nowMs);

  const counts = React.useMemo(() => {
    if (distribution && distribution.length >= 5)
      return distribution.slice(0, 5).map((n) => Math.max(0, Math.round(n)));
    if (!distribution && reviews === defaultReviews)
      return defaultRatingDistribution;
    const c = [0, 0, 0, 0, 0];
    for (const r of reviews) {
      const s = clamp(Math.round(r.rating), 1, 5);
      c[s - 1] = (c[s - 1] ?? 0) + 1;
    }
    return c;
  }, [distribution, reviews]);
  const total = counts.reduce((s, n) => s + n, 0);
  const average = total
    ? counts.reduce((s, n, i) => s + n * (i + 1), 0) / total
    : 0;
  const avgText = average.toFixed(1);
  const recommend = total
    ? Math.round((((counts[3] ?? 0) + (counts[4] ?? 0)) / total) * 100)
    : 0;

  const [ownStars, setOwnStars] = React.useState<number[]>(defaultStars);
  const chosen = stars ?? ownStars;
  const [ownSort, setOwnSort] = React.useState<RatingsSort>(defaultSort);
  const order = sort ?? ownSort;
  const [ownVoted, setOwnVoted] = React.useState<string[]>(defaultVoted);
  const votes = voted ?? ownVoted;
  const [limit, setLimit] = React.useState(Math.max(1, pageSize));
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const [viewer, setViewer] = React.useState<{
    index: number;
    from: number;
    grow: boolean;
  } | null>(null);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const reviewNodes = React.useRef(new Map<string, HTMLElement>());
  const photoNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const opener = React.useRef<HTMLElement | null>(null);
  const restore = React.useRef<HTMLElement | null>(null);
  const focusReview = React.useRef<string | null>(null);

  const shots: Shot[] = React.useMemo(
    () =>
      reviews.flatMap((review) =>
        (review.photos ?? []).map((photo) => ({ photo, review })),
      ),
    [reviews],
  );

  const matching = reviews.filter(
    (r) =>
      chosen.length === 0 || chosen.includes(clamp(Math.round(r.rating), 1, 5)),
  );
  const compare = (a: Review, b: Review) => {
    if (order === "newest") return b.date - a.date;
    if (order === "highest")
      return b.rating - a.rating || b.helpful - a.helpful;
    if (order === "lowest") return a.rating - b.rating || b.helpful - a.helpful;
    return b.helpful - a.helpful || b.date - a.date;
  };
  const sorted = [...matching].sort(compare);
  const shown = sorted.slice(0, limit);
  const step = cascade(Math.max(2, shown.length));

  const tick = (star: number, el?: Element | null, gain = 0.4) => {
    const rect = el?.getBoundingClientRect();
    audio.play("tick", {
      pitch: r2(semitones((star - 3) * 2)),
      gain,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const setStars = (next: number[]) => {
    if (stars === undefined) setOwnStars(next);
    onStarsChange?.(next);
    setLimit(Math.max(1, pageSize));
    const n = reviews.filter(
      (r) =>
        next.length === 0 || next.includes(clamp(Math.round(r.rating), 1, 5)),
    ).length;
    const which = [...next].sort((a, b) => b - a).join(" and ");
    say(
      next.length === 0
        ? `Showing all reviews: ${reviews.length}.`
        : `Showing ${which} star reviews: ${n}.`,
    );
  };

  const toggleStar = (star: number, el: HTMLElement) => {
    tick(star, el, 0.5);
    if (filter === "single") {
      setStars(chosen.length === 1 && chosen[0] === star ? [] : [star]);
      return;
    }
    setStars(
      chosen.includes(star)
        ? chosen.filter((s) => s !== star)
        : [...chosen, star].sort((a, b) => b - a),
    );
  };

  const vote = (review: Review, el: HTMLElement) => {
    const on = !votes.includes(review.id);
    const next = on
      ? [...votes, review.id]
      : votes.filter((v) => v !== review.id);
    if (on) {
      const rect = el.getBoundingClientRect();
      audio.play("pop", {
        pitch: 1.15,
        gain: 0.55,
        pan: panFrom(rect.left + rect.width / 2, null),
      });
    }
    if (voted === undefined) setOwnVoted(next);
    onVotedChange?.(next);
    onVote?.(review.id, on);
    const count = review.helpful + (on ? 1 : 0);
    say(
      on
        ? `Marked helpful. ${count} ${count === 1 ? "person" : "people"} found this helpful.`
        : "Helpful mark removed.",
    );
  };

  const openPhoto = (photoId: string, el: HTMLElement) => {
    if (disabled) return;
    const i = shots.findIndex((s) => s.photo.id === photoId);
    const shot = shots[i];
    if (!shot) return;
    opener.current = el;
    tick(4, el, 0.35);
    // Only a thumbnail that carries the photo's layout id, and is on screen,
    // can be grown out of; anything else opens on a fade.
    const grow = el.hasAttribute("data-photo-grow") && el.offsetParent !== null;
    setViewer({ index: i, from: i, grow });
    onPhotoOpen?.(shot.photo.id, shot.review.id);
  };

  const closeViewer = () => {
    const v = viewer;
    const shot = v ? shots[v.index] : undefined;
    const back =
      (shot && photoNodes.current.get(`s:${shot.photo.id}`)) ??
      (shot && photoNodes.current.get(`r:${shot.photo.id}`)) ??
      opener.current;
    restore.current =
      back && back.offsetParent !== null ? back : opener.current;
    setViewer(null);
  };

  // The page under the viewer is inert until the viewer has gone, so focus
  // goes back to the thumbnail after that commit, not before it.
  React.useEffect(() => {
    if (viewer) return;
    const node = restore.current;
    restore.current = null;
    if (node?.isConnected) node.focus({ preventScroll: true });
  }, [viewer]);

  const seeReview = (reviewId: string) => {
    setViewer(null);
    const at = sorted.findIndex((r) => r.id === reviewId);
    if (at === -1) {
      // Filtered out: the filter is cleared so the review can be read.
      setStars([]);
      const i = [...reviews].sort(compare).findIndex((r) => r.id === reviewId);
      setLimit(Math.max(Math.max(1, pageSize), i + 1));
    } else if (at >= limit) {
      setLimit(at + 1);
    }
    focusReview.current = reviewId;
  };

  // A review asked for lands in view and takes focus once it is there.
  React.useEffect(() => {
    const id = focusReview.current;
    if (!id) return;
    const node = reviewNodes.current.get(id);
    if (!node) return;
    focusReview.current = null;
    node.focus({ preventScroll: true });
    const scroller = rootRef.current?.querySelector<HTMLElement>(
      "[data-ratings-scroll]",
    );
    if (scroller) {
      const top =
        node.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        12;
      scroller.scrollTo({
        top: Math.max(0, top),
        behavior: motionSafe ? "smooth" : "auto",
      });
    }
  });

  const bindPhoto = (id: string, node: HTMLButtonElement | null) => {
    if (node) photoNodes.current.set(id, node);
    else photoNodes.current.delete(id);
  };

  /* -------------------------------- pieces ------------------------------- */

  const summary = (
    <section
      aria-labelledby={`${uid}-h-sum`}
      className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3"
    >
      <h3 id={`${uid}-h-sum`} className="sr-only">
        Summary
      </h3>
      <div className="flex items-center gap-3">
        <Roll
          text={avgText}
          motionSafe={motionSafe}
          fromZero
          className="font-mono text-4xl font-semibold text-foreground"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="relative inline-flex">
            <Stars value={0} size="md" />
            <motion.span
              aria-hidden
              className="absolute inset-y-0 left-0 overflow-hidden"
              initial={motionSafe ? { width: "0%" } : false}
              animate={{ width: `${r2((average / 5) * 100)}%` }}
              transition={
                motionSafe ? { ...springs.glide, delay: 0.08 } : { duration: 0 }
              }
            >
              <span className="inline-flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <svg key={n} viewBox="0 0 16 16" className="size-4 shrink-0">
                    <path d={STAR_PATH} style={{ fill: STAR }} />
                  </svg>
                ))}
              </span>
            </motion.span>
          </span>
          <p className="text-[12px] text-ink-3">
            <span className="sr-only">
              Rated {avgText} out of 5 from {thousands(total)} ratings.
            </span>
            <span aria-hidden>{thousands(total)} ratings</span>
          </p>
        </div>
      </div>
      <p className="text-[12px] text-ink-2">
        <span className="font-medium text-foreground">{recommend}%</span> rate
        it 4 or 5 stars
      </p>
      <div className="border-t border-hairline pt-2">
        <Distribution
          uid={uid}
          bars={bars}
          filter={filter}
          counts={counts}
          total={total}
          chosen={chosen}
          onToggle={toggleStar}
          onMove={(star, el) => tick(star, el, 0.3)}
          motionSafe={motionSafe}
          disabled={disabled}
        />
      </div>
    </section>
  );

  const photoStrip =
    photos === "strip" && shots.length ? (
      <section
        aria-labelledby={`${uid}-h-photos`}
        className="flex flex-col gap-2"
      >
        <h3 id={`${uid}-h-photos`} className="text-[12px] text-ink-2">
          Photos from reviews · {shots.length}
        </h3>
        <div className="relative">
          <ul
            role="list"
            className="flex [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain py-1"
          >
            {shots.map((s, i) => (
              <li key={s.photo.id} className="shrink-0">
                <PhotoThumb
                  shot={s}
                  uid={uid}
                  size="size-16"
                  tabbable={i === 0}
                  bind={(node) => bindPhoto(`s:${s.photo.id}`, node)}
                  hidden={viewer !== null && viewer.grow && viewer.from === i}
                  onOpen={(el) => openPhoto(s.photo.id, el)}
                  onArrow={(d, el) => {
                    const list = el.closest("ul");
                    const all = list
                      ? [...list.querySelectorAll<HTMLElement>("button")]
                      : [];
                    const at = all.indexOf(el);
                    const to = all[clamp(at + d, 0, all.length - 1)];
                    to?.focus();
                  }}
                  motionSafe={motionSafe}
                />
              </li>
            ))}
          </ul>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-card to-transparent"
          />
        </div>
      </section>
    ) : null;

  const photoGrid = (column: boolean) =>
    photos === "grid" && shots.length ? (
      <section
        aria-labelledby={`${uid}-h-grid-${column ? "c" : "m"}`}
        className={cn(
          "flex flex-col gap-2",
          column
            ? "hidden rounded-3 border border-hairline bg-surface-1 p-3 @min-[68rem]:sticky @min-[68rem]:top-0 @min-[68rem]:flex"
            : "@min-[68rem]:hidden",
        )}
      >
        <h3
          id={`${uid}-h-grid-${column ? "c" : "m"}`}
          className="text-[12px] text-ink-2"
        >
          Photos from reviews · {shots.length}
        </h3>
        <ul
          role="list"
          className={cn("grid gap-1.5", column ? "grid-cols-3" : "grid-cols-4")}
        >
          {(() => {
            const cap = column ? 9 : 8;
            const list = shots.length > cap ? shots.slice(0, cap - 1) : shots;
            const rest = shots.length - list.length;
            return (
              <>
                {list.map((s, i) => (
                  <li key={s.photo.id}>
                    <PhotoThumb
                      shot={s}
                      uid={uid}
                      size="aspect-square w-full"
                      tabbable
                      bind={(node) =>
                        bindPhoto(`${column ? "c" : "s"}:${s.photo.id}`, node)
                      }
                      hidden={
                        !column &&
                        viewer !== null &&
                        viewer.grow &&
                        viewer.from === i
                      }
                      onOpen={(el) => openPhoto(s.photo.id, el)}
                      motionSafe={motionSafe}
                      layout={!column}
                    />
                  </li>
                ))}
                {rest > 0 ? (
                  <li>
                    <button
                      type="button"
                      aria-label={`${rest} more photos`}
                      onClick={(event) => {
                        const s = shots[list.length];
                        if (s) openPhoto(s.photo.id, event.currentTarget);
                      }}
                      className={cn(
                        "flex aspect-square w-full items-center justify-center rounded-2 border border-hairline bg-surface-2 font-mono text-[13px] text-ink-2 transition-colors hover:bg-surface-1",
                        RING,
                      )}
                    >
                      +{rest}
                    </button>
                  </li>
                ) : null}
              </>
            );
          })()}
        </ul>
      </section>
    ) : null;

  const which = [...chosen].sort((a, b) => b - a);
  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-2">
        {which.length ? (
          <>
            <span className="truncate">
              {which.map((s) => `${s}★`).join(" and ")} · {matching.length}{" "}
              {matching.length === 1 ? "review" : "reviews"}
            </span>
            <button
              type="button"
              onClick={(event) => {
                tick(3, event.currentTarget, 0.3);
                setStars([]);
              }}
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-hairline-strong px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                RING,
              )}
            >
              <X aria-hidden className="size-3" />
              Clear
            </button>
          </>
        ) : (
          <span>All reviews · {reviews.length}</span>
        )}
      </p>
      <label className="flex items-center gap-2 text-[12px] text-ink-3">
        Sort
        <select
          value={order}
          disabled={disabled}
          onChange={(event) => {
            const next = event.currentTarget.value as RatingsSort;
            if (sort === undefined) setOwnSort(next);
            onSortChange?.(next);
            say(
              `Sorted by ${SORTS.find((s) => s.id === next)?.label.toLowerCase() ?? next}.`,
            );
          }}
          className={cn(
            "h-8 rounded-2 border border-hairline-strong bg-card px-2 text-[12px] text-foreground",
            RING,
          )}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const empty =
    which.length && matching.length === 0 ? (
      <div className="flex flex-col items-center gap-1 rounded-3 border border-dashed border-hairline-strong px-4 py-8 text-center">
        <p className="text-[13px] text-foreground">
          No {which.join(" or ")}-star reviews on this page.
        </p>
        <p className="text-[12px] text-ink-3">
          {thousands(which.reduce((s, n) => s + (counts[n - 1] ?? 0), 0))}{" "}
          people rated it {which.join(" or ")}{" "}
          {which.length === 1 && which[0] === 1 ? "star" : "stars"} without
          writing a review.
        </p>
      </div>
    ) : null;

  const list = (
    <Measured motionSafe={motionSafe}>
      {empty}
      <ol role="list" className="relative flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((r, i) => (
            <motion.li
              key={r.id}
              layout={motionSafe ? "position" : false}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? -distances.nudge : 0,
                transition: exitFor(durations.base),
              }}
              transition={
                motionSafe
                  ? {
                      layout: springs.glide,
                      y: { ...springs.glide, delay: Math.min(i, 8) * step },
                      opacity: {
                        duration: durations.base,
                        delay: Math.min(i, 8) * step,
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              <ReviewItem
                review={r}
                uid={uid}
                voted={votes.includes(r.id)}
                expanded={expanded.includes(r.id)}
                onVote={(el) => vote(r, el)}
                onExpand={() =>
                  setExpanded((e) =>
                    e.includes(r.id)
                      ? e.filter((x) => x !== r.id)
                      : [...e, r.id],
                  )
                }
                onPhoto={openPhoto}
                bindPhoto={bindPhoto}
                bind={(node) => {
                  if (node) reviewNodes.current.set(r.id, node);
                  else reviewNodes.current.delete(r.id);
                }}
                photosOn={photos !== "off"}
                motionSafe={motionSafe}
                disabled={disabled}
                formatDate={fmt}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </Measured>
  );

  const more = sorted.length - shown.length;

  const body = () => {
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className="grid gap-3 p-3 @min-[40rem]:grid-cols-[15rem_minmax(0,1fr)] @min-[40rem]:p-4"
        >
          <p className="sr-only">Loading reviews.</p>
          <div className="h-56 rounded-3 border border-hairline bg-surface-1" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3"
              >
                <span className="h-3 w-1/3 rounded-1 bg-surface-2" />
                <span className="h-2.5 w-4/5 rounded-1 bg-surface-2" />
                <span
                  className="h-2.5 rounded-1 bg-surface-2"
                  style={{ width: `${50 + i * 15}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Reviews did not load.</p>
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
    return (
      <div
        inert={disabled || viewer !== null}
        className={cn(
          "grid gap-4 p-3 @min-[40rem]:grid-cols-[15rem_minmax(0,1fr)] @min-[40rem]:p-4",
          photos === "grid" &&
            "@min-[68rem]:grid-cols-[15rem_minmax(0,1fr)_15rem]",
        )}
      >
        <div className="min-w-0 @min-[40rem]:sticky @min-[40rem]:top-0 @min-[40rem]:self-start">
          {summary}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {photoStrip}
          {photoGrid(false)}
          {toolbar}
          {list}
          {more > 0 ? (
            <button
              type="button"
              onClick={(event) => {
                tick(3, event.currentTarget, 0.25);
                setLimit((l) => l + Math.max(1, pageSize));
                say(
                  `Showing ${Math.min(sorted.length, limit + pageSize)} of ${sorted.length} reviews.`,
                );
              }}
              className={cn(
                "inline-flex h-8 w-fit items-center self-center rounded-2 border border-hairline-strong bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                RING,
              )}
            >
              Show {Math.min(more, pageSize)} more
            </button>
          ) : null}
        </div>
        {photos === "grid" ? (
          <div className="hidden min-w-0 @min-[68rem]:block">
            {photoGrid(true)}
          </div>
        ) : null}
      </div>
    );
  };

  const v = viewer;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex max-h-[560px] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
          <p className="truncate text-[11px] text-ink-3">{productName}</p>
        </div>
        {status === "ready" ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-1 px-2 font-mono text-[11px] text-ink-2 tabular-nums">
            <svg aria-hidden viewBox="0 0 16 16" className="size-3">
              <path d={STAR_PATH} style={{ fill: STAR }} />
            </svg>
            {avgText} · {thousands(total)}
          </span>
        ) : null}
      </header>
      <motion.div
        layoutScroll
        data-ratings-scroll=""
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        {body()}
      </motion.div>
      <AnimatePresence>
        {v ? (
          <Viewer
            key="viewer"
            uid={uid}
            shots={shots}
            index={v.index}
            from={v.from}
            grow={v.grow}
            onIndex={(i) => {
              const shot = shots[i];
              setViewer({ index: i, from: v.from, grow: v.grow });
              tick(3 + (i % 3), null, 0.3);
              if (shot)
                say(`Photo ${i + 1} of ${shots.length}: ${shot.photo.alt}.`);
            }}
            onClose={closeViewer}
            onSeeReview={seeReview}
            motionSafe={motionSafe}
            formatDate={fmt}
          />
        ) : null}
      </AnimatePresence>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

function PhotoThumb({
  shot,
  uid,
  size,
  tabbable,
  hidden,
  bind,
  onOpen,
  onArrow,
  motionSafe,
  layout = true,
}: {
  shot: Shot;
  uid: string;
  size: string;
  tabbable: boolean;
  hidden: boolean;
  bind: (node: HTMLButtonElement | null) => void;
  onOpen: (el: HTMLElement) => void;
  onArrow?: (d: number, el: HTMLElement) => void;
  motionSafe: boolean;
  /** Whether this thumbnail is where an opening photo grows from. */
  layout?: boolean;
}) {
  return (
    <button
      type="button"
      ref={bind}
      data-photo-grow={layout && motionSafe ? "" : undefined}
      tabIndex={onArrow && !tabbable ? -1 : 0}
      aria-label={`Open photo: ${shot.photo.alt}, from ${shot.review.author}`}
      onClick={(event) => onOpen(event.currentTarget)}
      onKeyDown={(event) => {
        if (!onArrow) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          onArrow(event.key === "ArrowRight" ? 1 : -1, event.currentTarget);
        }
      }}
      className={cn(
        "relative block overflow-hidden rounded-2 border border-hairline",
        size,
        RING,
      )}
    >
      <motion.span
        className={cn("block size-full", hidden && "opacity-0")}
        layoutId={
          motionSafe && layout ? `${uid}-photo-${shot.photo.id}` : undefined
        }
        transition={springs.glide}
      >
        <PhotoArt photo={shot.photo} />
      </motion.span>
    </button>
  );
}
