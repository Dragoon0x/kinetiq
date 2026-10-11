"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BookSpinesItem = {
  /** An image URL for the jacket. Without one, a picture is drawn in code. */
  src?: string;
  /** What the picture shows. */
  alt: string;
  /** The book's title, set on its spine and its cover. Falls back to the alt text. */
  caption?: string;
};

export type BookSpinesShelf = "oak" | "walnut" | "slate" | "glass";

export type BookSpinesProps = {
  /** The books, one picture each (up to 40). @default twenty drawn books */
  items?: BookSpinesItem[];
  /** Width of each spine, px, 14 to 36: wider spines show more of their picture. @default 22 */
  spineWidth?: number;
  /** How far the neighbours lean into the gap, 0 (upright) to 1 (tops meet). @default 0.6 */
  lean?: number;
  /** The shelf's finish. @default "oak" */
  shelf?: BookSpinesShelf;
  /** The book held open (controlled), or null. */
  value?: number | null;
  /** The book held open to begin with. @default null */
  defaultValue?: number | null;
  /** Fires from the click or key that held a book open or let it go. */
  onValueChange?: (index: number | null) => void;
  /** What opens a book under a pointer: resting on it, or clicking it. Focus always opens. @default "hover" */
  openOn?: "hover" | "click";
  /** How long the pointer rests on a spine before it opens, ms. @default 90 */
  delay?: number;
  /** How far an opening book tips toward you, degrees. @default 8 */
  tip?: number;
  /** Cover width as a share of the book's height, 0.55 to 0.85. @default 0.7 */
  coverRatio?: number;
  /** The tallest book, px. @default fitted to the box */
  bookHeight?: number;
  /** Set the titles on the spines. @default true */
  titles?: boolean;
  /** Seeds the books' heights. @default 1 */
  seed?: number;
  /** The shelf's accessible name. @default "Bookshelf" */
  label?: string;
  /** No opening, holding or scrolling. @default false */
  disabled?: boolean;
  /** Sizes the shelf; it fills its parent by default (h-full w-full). */
  className?: string;
};

export const defaultBookSpinesItems: BookSpinesItem[] = [
  { alt: "A pale salt flat under a wide sky", caption: "Salt Flats" },
  { alt: "Green ridges fading into haze", caption: "North Ridge" },
  { alt: "Wet sand and shallow water at low tide", caption: "Low Tide" },
  { alt: "Dark wooded hills around a hollow", caption: "Pine Hollow" },
  { alt: "Warm dunes under a high sun", caption: "Dune Sea" },
  { alt: "A ferry light on a dark sea under the moon", caption: "Night Ferry" },
  { alt: "A bank of fog over a quiet shore", caption: "Fogbank" },
  { alt: "A low sun rising over a still harbour", caption: "Harbour" },
  { alt: "Rows of hills under an evening sky", caption: "Field at Six" },
  { alt: "A still lake in an old quarry", caption: "Quarry Lake" },
  { alt: "Sunlight on a long beach at noon", caption: "Long Shore" },
  { alt: "Stars over a calm black bay", caption: "Bay at Night" },
  { alt: "A glasshouse roof catching the morning", caption: "Glasshouse" },
  { alt: "Orchard rows climbing a gentle slope", caption: "Orchard Rows" },
  { alt: "Reeds and still water in an upland fen", caption: "Upper Fen" },
  { alt: "A mirror-flat reservoir at dusk", caption: "Still Water" },
  { alt: "Amber light along a rocky coast", caption: "Amber Coast" },
  { alt: "Islands fading into a far horizon", caption: "Far Islands" },
  { alt: "A road through a wooded hollow", caption: "Hollow Road" },
  { alt: "Frost on the grass by a spring", caption: "Cold Spring" },
];

const MAX_BOOKS = 40;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Words as they sit inside a sentence: no full stop of their own to double. */
const bare = (text: string) => text.trim().replace(/[.!?]+$/, "");

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A pigment from a token's hue at a fixed lightness: the same in both themes. */
const tone = (token: string, l: number, c: number, turn = 0, alpha = 1) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn})${alpha < 1 ? ` / ${alpha}` : ""})`;

const KINDS = [
  "flats",
  "hills",
  "tide",
  "pines",
  "dunes",
  "night",
  "fog",
  "sea",
] as const;

/** A jacket picture in gradients, tall enough to wrap round a spine and a cover. */
function jacketArt(i: number): string {
  const kind = KINDS[i % KINDS.length] ?? "sea";
  const r = (k: number) => hash(i + 7, 11, k);
  const sx = Math.round(30 + r(1) * 50);
  const sy = Math.round(18 + r(2) * 14);
  const tw = Math.round((r(3) - 0.5) * 30);
  const grain =
    "radial-gradient(140% 90% at 60% 40%, transparent 55%, color-mix(in oklab, black 22%, transparent) 100%)";
  let layers: string[];
  switch (kind) {
    case "flats":
      layers = [
        `linear-gradient(to bottom, transparent 66%, ${tone("--accent", 0.42, 0.03, tw)} 66% 67%, transparent 67%)`,
        `radial-gradient(circle at ${sx}% ${sy + 30}%, ${tone("--warn", 0.98, 0.03)} 0 4%, transparent 14%)`,
        `linear-gradient(to bottom, transparent 67%, ${tone("--warn", 0.9, 0.03, tw)} 67%, ${tone("--warn", 0.78, 0.04, tw)} 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.74, 0.06, tw)}, ${tone("--accent", 0.94, 0.02, tw)} 66%)`,
      ];
      break;
    case "hills":
      layers = [
        `radial-gradient(90% 30% at 30% 100%, ${tone("--success", 0.36, 0.07, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(80% 26% at 85% 100%, ${tone("--success", 0.46, 0.07, tw + 10)} 0 98%, transparent 100%)`,
        `radial-gradient(110% 30% at 55% 86%, ${tone("--success", 0.6, 0.05, tw + 30)} 0 98%, transparent 100%)`,
        `radial-gradient(circle at ${sx}% ${sy}%, ${tone("--warn", 0.97, 0.05)} 0 6%, ${tone("--warn", 0.9, 0.08, 0, 0.4)} 7%, transparent 20%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.7, 0.07, tw)}, ${tone("--success", 0.9, 0.04, tw + 60)} 82%)`,
      ];
      break;
    case "tide":
      layers = [
        `radial-gradient(40% 8% at ${sx}% 84%, ${tone("--warn", 0.92, 0.05, 0, 0.7)}, transparent)`,
        `linear-gradient(to bottom, transparent 58%, ${tone("--accent", 0.55, 0.06, tw)} 58%, ${tone("--accent", 0.64, 0.05, tw)} 72%, ${tone("--warn", 0.74, 0.05, tw)} 74%, ${tone("--warn", 0.56, 0.06, tw - 10)} 100%)`,
        `radial-gradient(circle at ${sx}% ${sy + 20}%, ${tone("--warn", 0.97, 0.04)} 0 5%, transparent 16%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.68, 0.06, tw)}, ${tone("--accent", 0.88, 0.04, tw)} 58%)`,
      ];
      break;
    case "pines":
      layers = [
        `radial-gradient(70% 34% at 20% 100%, ${tone("--success", 0.24, 0.05, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(70% 40% at 85% 100%, ${tone("--success", 0.29, 0.05, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(100% 44% at 50% 100%, ${tone("--success", 0.4, 0.05, tw + 20)} 0 98%, transparent 100%)`,
        `radial-gradient(circle at ${sx}% ${sy}%, ${tone("--warn", 0.95, 0.05)} 0 5%, transparent 15%)`,
        `linear-gradient(to bottom, ${tone("--warn", 0.8, 0.06, tw - 20)}, ${tone("--success", 0.76, 0.04, tw + 40)} 70%)`,
      ];
      break;
    case "dunes":
      layers = [
        `radial-gradient(80% 26% at 30% 100%, ${tone("--danger", 0.55, 0.1, tw + 30)} 0 98%, transparent 100%)`,
        `radial-gradient(70% 24% at 78% 96%, ${tone("--warn", 0.66, 0.11, tw - 10)} 0 98%, transparent 100%)`,
        `radial-gradient(110% 30% at 55% 86%, ${tone("--warn", 0.76, 0.1, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(circle at ${sx}% ${sy}%, ${tone("--warn", 0.98, 0.04)} 0 5%, ${tone("--warn", 0.92, 0.07, 0, 0.5)} 6%, transparent 18%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.7, 0.06, tw)}, ${tone("--warn", 0.9, 0.05, tw)} 76%)`,
      ];
      break;
    case "night":
      layers = [
        `radial-gradient(2% 12% at ${sx}% 82%, ${tone("--warn", 0.85, 0.12, 0, 0.8)}, transparent)`,
        `radial-gradient(circle at ${sx}% 68%, ${tone("--warn", 0.94, 0.12)} 0 1%, ${tone("--warn", 0.8, 0.14, 0, 0.5)} 1.8%, transparent 5%)`,
        `radial-gradient(circle at ${Math.round(12 + r(9) * 70)}% ${Math.round(8 + r(8) * 30)}%, ${tone("--accent", 0.95, 0.02)} 0 0.8%, transparent 1.6%)`,
        `radial-gradient(circle at ${Math.round(12 + r(7) * 70)}% ${Math.round(8 + r(6) * 30)}%, ${tone("--accent", 0.95, 0.02)} 0 0.8%, transparent 1.6%)`,
        `radial-gradient(circle at ${100 - sx}% ${sy}%, ${tone("--warn", 0.95, 0.03)} 0 6%, ${tone("--accent", 0.6, 0.05, 0, 0.35)} 7%, transparent 20%)`,
        `linear-gradient(to bottom, transparent 66%, ${tone("--accent", 0.22, 0.05, tw)} 66%, ${tone("--accent", 0.14, 0.04, tw)} 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.16, 0.05, tw)}, ${tone("--accent", 0.32, 0.08, tw)} 66%)`,
      ];
      break;
    case "fog":
      layers = [
        `radial-gradient(80% 18% at 30% 90%, ${tone("--success", 0.5, 0.02, tw, 0.6)} 0 60%, transparent 100%)`,
        `linear-gradient(to bottom, transparent 50%, ${tone("--accent", 0.84, 0.01, tw, 0.8)} 60%, transparent 74%)`,
        `radial-gradient(90% 26% at 70% 78%, ${tone("--accent", 0.6, 0.02, tw)} 0 50%, transparent 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.86, 0.012, tw)}, ${tone("--accent", 0.76, 0.015, tw)} 100%)`,
      ];
      break;
    default:
      layers = [
        `radial-gradient(3% 14% at ${sx}% 80%, ${tone("--warn", 0.93, 0.07, 0, 0.8)}, transparent)`,
        `radial-gradient(circle at ${sx}% ${sy + 30}%, ${tone("--warn", 0.98, 0.04)} 0 5%, ${tone("--warn", 0.9, 0.09, 0, 0.5)} 6%, transparent 20%)`,
        `linear-gradient(to bottom, transparent 64%, ${tone("--accent", 0.46, 0.07, tw)} 64%, ${tone("--accent", 0.26, 0.05, tw)} 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.58, 0.08, tw - 30)}, ${tone("--warn", 0.86, 0.08, -10)} 62%, ${tone("--warn", 0.93, 0.06)} 64%)`,
      ];
  }
  return [grain, ...layers].join(", ");
}

const PAPER = tone("--warn", 0.96, 0.012);
const PAPER_INK = tone("--warn", 0.3, 0.02);
const PAGES = `repeating-linear-gradient(to right, ${tone("--warn", 0.95, 0.015)} 0 1px, ${tone("--warn", 0.86, 0.02)} 1px 2px)`;
const SPINE_SHEEN =
  "linear-gradient(to right, color-mix(in oklab, black 30%, transparent), transparent 22%, color-mix(in oklab, white 16%, transparent) 46%, transparent 64%, color-mix(in oklab, black 34%, transparent))";
const COVER_SHEEN =
  "linear-gradient(105deg, color-mix(in oklab, white 14%, transparent), transparent 38%, transparent 70%, color-mix(in oklab, black 16%, transparent))";

const SHELVES: Record<
  BookSpinesShelf,
  { top: string; front: string; edge: string }
> = {
  oak: {
    top: tone("--warn", 0.8, 0.06, -12),
    front: `repeating-linear-gradient(90deg, transparent 0 9px, ${tone("--warn", 0.6, 0.07, -14, 0.35)} 9px 10px, transparent 10px 23px), linear-gradient(to bottom, ${tone("--warn", 0.7, 0.08, -14)}, ${tone("--warn", 0.6, 0.08, -16)})`,
    edge: tone("--warn", 0.88, 0.05, -10),
  },
  walnut: {
    top: tone("--warn", 0.5, 0.05, -30),
    front: `repeating-linear-gradient(90deg, transparent 0 7px, ${tone("--warn", 0.32, 0.04, -30, 0.45)} 7px 8px, transparent 8px 17px), linear-gradient(to bottom, ${tone("--warn", 0.42, 0.05, -30)}, ${tone("--warn", 0.32, 0.045, -32)})`,
    edge: tone("--warn", 0.6, 0.05, -28),
  },
  slate: {
    top: tone("--accent", 0.56, 0.015),
    front: `linear-gradient(to bottom, ${tone("--accent", 0.46, 0.014)}, ${tone("--accent", 0.36, 0.012)})`,
    edge: tone("--accent", 0.68, 0.015),
  },
  glass: {
    top: tone("--success", 0.9, 0.03, 10, 0.55),
    front: `linear-gradient(to bottom, ${tone("--success", 0.86, 0.035, 10, 0.4)}, ${tone("--success", 0.7, 0.03, 10, 0.25)})`,
    edge: tone("--success", 0.97, 0.02, 10, 0.9),
  },
};

type Pose = {
  /** In the row: the lean into a gap, degrees, and the slide toward it, px. */
  lean: MotionValue<number>;
  shift: MotionValue<number>;
  /** Out of the row: tip toward you, the turn to the cover, forward, lift. */
  tip: MotionValue<number>;
  turn: MotionValue<number>;
  forward: MotionValue<number>;
  lift: MotionValue<number>;
  /** The cover board's hinge, degrees. */
  ajar: MotionValue<number>;
  /** Reduced motion: the flat cover card's opacity. */
  card: MotionValue<number>;
};

const KEYS = [
  "lean",
  "shift",
  "tip",
  "turn",
  "forward",
  "lift",
  "ajar",
  "card",
] as const;

const makePose = (): Pose => ({
  lean: motionValue(0),
  shift: motionValue(0),
  tip: motionValue(0),
  turn: motionValue(0),
  forward: motionValue(0),
  lift: motionValue(0),
  ajar: motionValue(0),
  card: motionValue(0),
});

type BookGeo = { left: number; s: number; h: number; c: number };

type Layout = {
  w: number;
  h: number;
  plank: number;
  books: BookGeo[];
  rowW: number;
  /** Row offsets the scroll may take: equal when the row fits. */
  min: number;
  max: number;
  scrolls: boolean;
};

function layoutOf(
  w: number,
  h: number,
  n: number,
  spineWidth: number,
  coverRatio: number,
  bookHeight: number | undefined,
  seed: number,
): Layout {
  const plank = Math.round(clamp(h * 0.085, 12, 20));
  const room = h - plank;
  const tallest = Math.round(clamp(bookHeight ?? room * 0.86, 40, room - 12));
  const s0 = clamp(spineWidth, 14, 36);
  const books: BookGeo[] = [];
  let x = 0;
  for (let i = 0; i < n; i += 1) {
    const s = Math.round(s0 + (hash(seed, i, 2) - 0.5) * 4);
    const bh = Math.round(tallest * (0.78 + 0.22 * hash(seed, i, 1)));
    books.push({
      left: x,
      s,
      h: bh,
      c: Math.round(bh * clamp(coverRatio, 0.55, 0.85)),
    });
    x += s + 1;
  }
  const rowW = Math.max(0, x - 1);
  const pad = 12;
  const scrolls = rowW > w - 2 * pad;
  const centred = Math.round((w - rowW) / 2);
  return {
    w,
    h,
    plank,
    books,
    rowW,
    min: scrolls ? Math.round(w - pad - rowW) : centred,
    max: scrolls ? pad : centred,
    scrolls,
  };
}

const FACE_RING =
  "group-focus-visible/book-spines:outline-2 group-focus-visible/book-spines:outline-offset-2 group-focus-visible/book-spines:outline-ring group-focus-visible/book-spines:outline-solid";

type BookProps = {
  index: number;
  n: number;
  item: BookSpinesItem;
  geo: BookGeo;
  pose: Pose;
  z: number;
  held: boolean;
  tabbable: boolean;
  titles: boolean;
  disabled: boolean;
  register: (index: number, node: HTMLButtonElement | null) => void;
  onActivate: (index: number) => void;
  onKeyDown: (index: number, event: React.KeyboardEvent) => void;
  onFocusBook: (index: number, visible: boolean) => void;
  onHover: (index: number, on: boolean, touch: boolean) => void;
};

/**
 * One book: a real CSS 3D box. The spine faces you; the cover is its right
 * side, edge-on until the book turns. The jacket is one picture wrapped round
 * both, so the spine's sliver runs on into the cover.
 */
function Book({
  index,
  n,
  item,
  geo,
  pose,
  z,
  held,
  tabbable,
  titles,
  disabled,
  register,
  onActivate,
  onKeyDown,
  onFocusBook,
  onHover,
}: BookProps) {
  const { s, h, c } = geo;
  const title = item.caption ?? item.alt;
  const art = item.src ? undefined : jacketArt(index);
  const jacket = (offset: number): React.CSSProperties => ({
    backgroundImage: item.src ? `url("${item.src}")` : art,
    backgroundSize: `${s + c}px ${h}px`,
    backgroundPosition: `${-offset}px 0`,
  });
  const fontSize = Math.round(clamp(s * 0.42, 8, 11));
  const ref = React.useCallback(
    (node: HTMLButtonElement | null) => register(index, node),
    [index, register],
  );
  // The body sits half a cover behind its spine, so at rest the spine is
  // exactly in the picture plane; `forward` brings it out from there.
  const bodyZ = useTransform(pose.forward, (f) => r2(f - c / 2));

  return (
    <motion.button
      ref={ref}
      type="button"
      data-book={index}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${title}, ${index + 1} of ${n}: ${item.alt}`}
      aria-pressed={held}
      disabled={disabled}
      onClick={(event) => {
        // Pointer presses arrive through the shelf's tap; a click with no
        // pointer behind it (Enter, Space, assistive tech) is a press too.
        if (event.detail === 0) onActivate(index);
      }}
      onKeyDown={(event) => onKeyDown(index, event)}
      onFocus={(event) =>
        onFocusBook(index, event.currentTarget.matches(":focus-visible"))
      }
      onPointerEnter={(event) =>
        onHover(index, true, event.pointerType === "touch")
      }
      onPointerLeave={(event) =>
        onHover(index, false, event.pointerType === "touch")
      }
      className={cn(
        "group/book-spines absolute bottom-0 block outline-none select-none",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
      style={{
        left: geo.left,
        width: s,
        height: h,
        x: pose.shift,
        rotate: pose.lean,
        originX: 0.5,
        originY: 1,
        zIndex: z,
      }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 block"
        style={{
          rotateY: pose.turn,
          rotateX: pose.tip,
          z: bodyZ,
          y: pose.lift,
          transformPerspective: 900,
          transformStyle: "preserve-3d",
          originX: 0.5,
          originY: 1,
        }}
      >
        {/* The spine. */}
        <span
          className={cn(
            "absolute inset-0 block overflow-hidden rounded-[2px] [backface-visibility:hidden]",
            FACE_RING,
          )}
          style={{ ...jacket(0), transform: `translateZ(${c / 2}px)` }}
        >
          <span
            className="absolute inset-0"
            style={{ background: SPINE_SHEEN }}
          />
          <span
            className="absolute inset-x-0 top-[5%] h-[3px]"
            style={{
              background: "color-mix(in oklab, black 30%, transparent)",
            }}
          />
          <span
            className="absolute inset-x-0 bottom-[5%] h-[3px]"
            style={{
              background: "color-mix(in oklab, black 30%, transparent)",
            }}
          />
          {titles && s >= 15 ? (
            <span
              className="absolute left-1/2 block -translate-x-1/2 overflow-hidden rounded-[2px] font-medium tracking-[0.06em] text-ellipsis whitespace-nowrap"
              style={{
                top: "14%",
                maxHeight: "60%",
                width: s - 8,
                padding: "6px 0",
                // In vertical writing the line box runs across the spine, so
                // a line height equal to the label's width centres the title.
                lineHeight: `${s - 8}px`,
                background: PAPER,
                color: PAPER_INK,
                fontSize,
                writingMode: "vertical-rl",
              }}
            >
              {title}
            </span>
          ) : null}
          <span
            className="absolute left-1/2 size-1 -translate-x-1/2 rounded-full"
            style={{ bottom: "11%", background: PAPER }}
          />
        </span>
        {/* The cover side: the page block, under a board on its hinge. */}
        <span
          className="absolute top-0 block h-full"
          style={{
            width: c,
            left: (s - c) / 2,
            transform: `rotateY(90deg) translateZ(${s / 2}px)`,
            transformStyle: "preserve-3d",
          }}
        >
          <span
            className="absolute top-[3px] right-[2px] bottom-[3px] left-0 block"
            style={{ background: PAGES, transform: "translateZ(-2px)" }}
          />
          <motion.span
            className={cn(
              "absolute inset-0 block overflow-hidden rounded-r-[3px] [backface-visibility:hidden]",
              FACE_RING,
            )}
            style={{ ...jacket(s), rotateY: pose.ajar, originX: 0 }}
          >
            <span
              className="absolute inset-0"
              style={{ background: COVER_SHEEN }}
            />
            <span
              className="absolute inset-x-[8%] bottom-[7%] flex items-center justify-center rounded-[2px] px-1 py-1"
              style={{ background: PAPER, color: PAPER_INK }}
            >
              <span
                className="truncate leading-none font-medium tracking-[0.04em]"
                style={{ fontSize: Math.round(clamp(c * 0.085, 9, 12)) }}
              >
                {title}
              </span>
            </span>
          </motion.span>
        </span>
      </motion.span>
    </motion.button>
  );
}

/**
 * Pictures shelved as books, by their spines: each wears a jacket printed
 * with its picture, so the spine shows a sliver of it under a vertical title.
 * Rest on a spine (or focus it) and the book tips out of the row toward you
 * on springs.snap, turns on its own axis to show its cover — a real CSS 3D
 * box, the jacket running on from spine to cover — on springs.glide, and
 * leaves its cover a few degrees ajar on the page block; the books either
 * side lean into the gap it left, the lean running down the row and landing
 * on springs.snap. A click (or Enter) holds a book open as the value.
 *
 * A shelf wider than its box scrolls: dragged 1:1, rubber-banded at the
 * ends, flicked by projection and settled on springs.glide. The books are one
 * roving tab stop — arrows browse (each focused book opens), Home/End jump,
 * Enter holds, Escape lets go. Under reduced motion nothing tips or leans: a
 * flat cover card fades in above the book instead.
 */
export function BookSpines({
  items,
  spineWidth = 22,
  lean = 0.6,
  shelf = "oak",
  value,
  defaultValue = null,
  onValueChange,
  openOn = "hover",
  delay = 90,
  tip = 8,
  coverRatio = 0.7,
  bookHeight,
  titles = true,
  seed = 1,
  label = "Bookshelf",
  disabled = false,
  className,
}: BookSpinesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list =
    items && items.length > 0
      ? items.slice(0, MAX_BOOKS)
      : defaultBookSpinesItems;
  const n = list.length;

  const [ownHeld, setOwnHeld] = React.useState<number | null>(defaultValue);
  const heldRaw = value !== undefined ? value : ownHeld;
  const held =
    heldRaw === null || heldRaw === undefined
      ? null
      : clamp(Math.round(heldRaw), 0, n - 1);
  const [preview, setPreview] = React.useState<number | null>(null);
  const open = preview ?? held;

  const [geo, setGeo] = React.useState({ w: 0, h: 0 });
  // Until the box is measured the shelf is laid out for a gallery card, so
  // the first paint is already a full shelf.
  const lay = React.useMemo(
    () =>
      layoutOf(
        geo.w || 720,
        geo.h || 208,
        n,
        spineWidth,
        coverRatio,
        bookHeight,
        seed,
      ),
    [geo.w, geo.h, n, spineWidth, coverRatio, bookHeight, seed],
  );
  const measured = geo.w > 0;

  const poses = React.useMemo(
    () => Array.from({ length: n }, () => makePose()),
    [n],
  );
  const scroll = useMotionValue(0);
  const [focusIndex, setFocusIndex] = React.useState(() => held ?? 0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((v) => ({ n: v.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLButtonElement>());
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const hoverTimer = React.useRef(0);
  const scrollFrom = React.useRef(0);
  const shown = React.useRef<number | null>(null);

  const register = React.useCallback(
    (index: number, node: HTMLButtonElement | null) => {
      if (node) nodes.current.set(index, node);
      else nodes.current.delete(index);
    },
    [],
  );

  const go = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };

  /* ------------------------------ choreography --------------------------- */

  /** Where every book's pose goes for `o` open (or none). */
  const targets = (o: number | null, at: number) => {
    const book = lay.books[at];
    const zero = {
      lean: 0,
      shift: 0,
      tip: 0,
      turn: 0,
      forward: 0,
      lift: 0,
      ajar: 0,
      card: 0,
    };
    if (o === null || !book) return zero;
    const opened = lay.books[o];
    if (!opened) return zero;
    if (at === o) {
      // Keep the open cover inside the box: its centre is where its spine was.
      const centre = scroll.get() + opened.left + opened.s / 2;
      const half = opened.c / 2 + 6;
      const fix = clamp(centre, half, lay.w - half) - centre;
      return {
        ...zero,
        shift: r2(fix),
        tip: r2(-clamp(tip, 0, 20)),
        turn: -90,
        forward: r2(opened.c / 2 - opened.s / 2 + 18),
        lift: -Math.min(10, Math.max(0, lay.h - lay.plank - opened.h - 2)),
        ajar: -16,
        card: 1,
      };
    }
    const k = Math.abs(at - o);
    const side = at < o ? 1 : -1;
    const amount = clamp(lean, 0, 1);
    const reach = 2 + Math.round(amount * 4);
    if (k > reach || amount === 0) return zero;
    const gap = opened.s + 2;
    const first =
      ((Math.asin(clamp(gap / book.h, 0, 1)) * 180) / Math.PI) * 1.3;
    const decay = 0.55 + 0.25 * amount;
    const fall = Math.pow(decay, k - 1);
    return {
      ...zero,
      lean: r2(side * amount * clamp(first, 4, 14) * fall),
      shift: r2(side * gap * amount * 0.22 * fall),
    };
  };

  const play = (o: number | null, from: number | null) => {
    for (let i = 0; i < n; i += 1) {
      const pose = poses[i];
      if (!pose) continue;
      const t = targets(o, i);
      if (!motionSafe) {
        for (const key of KEYS) {
          runs.current.get(`${i}:${key}`)?.stop();
          if (key !== "card") pose[key].jump(0);
        }
        go(
          `${i}:card`,
          animate(pose.card, t.card, {
            duration: durations.base,
            ease: easings.enter,
          }),
        );
        continue;
      }
      const opening = i === o;
      const closing = i === from && i !== o;
      const distance = o === null ? 0 : Math.abs(i - o);
      const leanDelay = o === null ? 0 : 0.03 + distance * 0.025;
      if (opening) {
        go(`${i}:tip`, animate(pose.tip, t.tip, springs.snap));
        go(`${i}:lift`, animate(pose.lift, t.lift, springs.snap));
        go(`${i}:forward`, animate(pose.forward, t.forward, springs.glide));
        go(
          `${i}:turn`,
          animate(pose.turn, t.turn, { ...springs.glide, delay: 0.04 }),
        );
        go(
          `${i}:ajar`,
          animate(pose.ajar, t.ajar, { ...springs.glide, delay: 0.2 }),
        );
        go(`${i}:shift`, animate(pose.shift, t.shift, springs.glide));
        go(`${i}:lean`, animate(pose.lean, 0, springs.glide));
      } else if (closing) {
        go(`${i}:ajar`, animate(pose.ajar, 0, springs.glide));
        go(`${i}:turn`, animate(pose.turn, 0, springs.glide));
        go(`${i}:tip`, animate(pose.tip, 0, { ...springs.glide, delay: 0.08 }));
        go(
          `${i}:forward`,
          animate(pose.forward, t.forward, { ...springs.glide, delay: 0.08 }),
        );
        go(
          `${i}:lift`,
          animate(pose.lift, t.lift, { ...springs.glide, delay: 0.08 }),
        );
        go(`${i}:shift`, animate(pose.shift, t.shift, springs.glide));
        go(`${i}:lean`, animate(pose.lean, t.lean, springs.glide));
      } else {
        // The neighbours fall into the gap and land with one overshoot; when
        // the book goes back they straighten up without one.
        const physics = o === null ? springs.glide : springs.snap;
        go(
          `${i}:lean`,
          animate(pose.lean, t.lean, { ...physics, delay: leanDelay }),
        );
        go(
          `${i}:shift`,
          animate(pose.shift, t.shift, { ...physics, delay: leanDelay }),
        );
        for (const key of ["tip", "turn", "forward", "lift", "ajar"] as const) {
          if (Math.abs(pose[key].get()) > 0.01) {
            go(`${i}:${key}`, animate(pose[key], 0, springs.glide));
          }
        }
      }
      pose.card.jump(0);
    }
  };

  /** Brings a book's slot (and its open cover) into the visible part of the row. */
  const reveal = (i: number) => {
    const book = lay.books[i];
    if (!book || !lay.scrolls) return;
    const half = book.c / 2 + 12;
    const centre = book.left + book.s / 2;
    const now = scroll.get();
    const lo = half - centre;
    const hi = lay.w - half - centre;
    const target = Math.round(clamp(clamp(now, lo, hi), lay.min, lay.max));
    if (Math.abs(target - now) < 0.5) return;
    if (!motionSafe) scroll.jump(target);
    else go("scroll", animate(scroll, target, springs.glide));
  };

  /* -------------------------------- intents ------------------------------ */

  const commitHeld = (next: number | null) => {
    if (disabled || next === held) return;
    if (value === undefined) setOwnHeld(next);
    onValueChange?.(next);
    const item = next === null ? null : list[next];
    say(
      item
        ? `${bare(item.caption ?? item.alt)} held open.`
        : "Book put back on the shelf.",
    );
  };

  const activate = (i: number) => {
    if (disabled) return;
    setFocusIndex(i);
    if (held === i) {
      commitHeld(null);
      setPreview(null);
    } else {
      commitHeld(i);
      setPreview(null);
      reveal(i);
    }
  };

  const onHover = (i: number, on: boolean, touch: boolean) => {
    if (disabled || touch || openOn !== "hover") return;
    window.clearTimeout(hoverTimer.current);
    if (on) {
      hoverTimer.current = window.setTimeout(
        () => setPreview(i),
        Math.max(0, delay),
      );
    } else {
      hoverTimer.current = window.setTimeout(() => {
        setPreview((p) => (p === i ? null : p));
      }, 120);
    }
  };

  const onFocusBook = (i: number, visible: boolean) => {
    setFocusIndex(i);
    if (!visible || disabled) return;
    setPreview(i);
    reveal(i);
  };

  const focusBook = (i: number) => {
    const node = nodes.current.get(i);
    setFocusIndex(i);
    node?.focus();
  };

  const onKeyDown = (i: number, event: React.KeyboardEvent) => {
    const k = event.key;
    let next: number | null = null;
    if (k === "ArrowRight" || k === "ArrowDown") next = Math.min(n - 1, i + 1);
    else if (k === "ArrowLeft" || k === "ArrowUp") next = Math.max(0, i - 1);
    else if (k === "Home") next = 0;
    else if (k === "End") next = n - 1;
    if (next === null) return;
    event.preventDefault();
    if (next === i) return;
    if (held !== null) commitHeld(next);
    focusBook(next);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 5,
    // Always on, for the taps; a shelf that fits simply does not scroll.
    disabled,
    onStart: () => {
      runs.current.get("scroll")?.stop();
      scrollFrom.current = scroll.get();
    },
    onMove: ({ offset }) => {
      if (!lay.scrolls) return;
      scroll.set(
        r2(
          rubberClamp(
            scrollFrom.current + offset.x,
            lay.min,
            lay.max,
            lay.w / 3,
          ),
        ),
      );
    },
    onEnd: ({ velocity }) => {
      if (!lay.scrolls) return;
      const v = motionSafe ? velocity.x : 0;
      const target = Math.round(
        clamp(project(scroll.get(), v, 0.995), lay.min, lay.max),
      );
      if (!motionSafe) {
        scroll.jump(target);
        return;
      }
      go("scroll", animate(scroll, target, { ...springs.glide, velocity: v }));
    },
    onCancel: () => {
      const target = clamp(scroll.get(), lay.min, lay.max);
      go("scroll", animate(scroll, target, springs.glide));
    },
    onTap: (event) => {
      const target = (event.target as Element | null)?.closest?.("[data-book]");
      const index = target ? Number(target.getAttribute("data-book")) : NaN;
      if (Number.isFinite(index)) activate(index);
      else if (held !== null) commitHeld(null);
    },
  });

  /* -------------------------------- effects ------------------------------ */

  const api = React.useRef({ play, scrollTo: (x: number) => scroll.jump(x) });
  React.useEffect(() => {
    api.current = { play, scrollTo: (x: number) => scroll.jump(x) };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const box = root.getBoundingClientRect();
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      setGeo((g) => (g.w === w && g.h === h ? g : { w, h }));
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // The row sits centred, or at its start when it scrolls; a new size keeps
  // a scrolled row inside its limits.
  const rowMin = lay.min;
  const rowMax = lay.max;
  React.useEffect(() => {
    const now = scroll.get();
    const fits = rowMin === rowMax;
    api.current.scrollTo(
      fits ? rowMin : clamp(now === 0 ? rowMax : now, rowMin, rowMax),
    );
  }, [rowMin, rowMax, scroll]);

  // Every change of the open book — hover, focus, keys, the host — runs
  // the same choreography; a new layout re-lays the open pose.
  React.useEffect(() => {
    const from = shown.current;
    shown.current = open;
    api.current.play(open, from);
  }, [open, lay, lean, tip, motionSafe]);

  // A horizontal wheel or trackpad swipe scrolls a shelf that scrolls; a
  // vertical one is left to the page.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || !lay.scrolls || disabled) return;
    const onWheel = (event: WheelEvent) => {
      const d = wheelPixels(event);
      if (Math.abs(d.x) <= Math.abs(d.y)) return;
      event.preventDefault();
      runs.current.get("scroll")?.stop();
      scroll.set(r2(clamp(scroll.get() - d.x, lay.min, lay.max)));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [lay.scrolls, lay.min, lay.max, disabled, scroll]);

  React.useEffect(() => {
    const running = runs.current;
    return () => {
      window.clearTimeout(hoverTimer.current);
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* --------------------------------- render ------------------------------ */

  const finish = SHELVES[shelf] ?? SHELVES.oak;
  const openBook = open === null ? null : lay.books[open];
  const openItem = open === null ? null : list[open];
  const tabbable = clamp(focusIndex, 0, n - 1);
  const zOf = (i: number) =>
    i === open ? 200 : open === null ? 1 : 100 - Math.abs(i - open);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || open === null) return;
        event.preventDefault();
        if (held !== null) commitHeld(null);
        setPreview(null);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setPreview(null);
      }}
      onPointerLeave={() => {
        if (openOn === "hover") {
          window.clearTimeout(hoverTimer.current);
          setPreview(null);
        }
      }}
      {...drag}
      className={cn(
        "relative isolate h-full w-full touch-pan-y overflow-clip [contain:paint] select-none",
        lay.scrolls && !disabled && "cursor-grab active:cursor-grabbing",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* The wall's shadow above the plank. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0"
        style={{
          bottom: lay.plank,
          height: Math.round(lay.h * 0.3),
          background:
            "linear-gradient(to top, color-mix(in oklab, black 7%, transparent), transparent)",
        }}
      />
      <motion.div
        className="absolute left-0"
        style={{
          bottom: lay.plank,
          width: lay.rowW,
          height: lay.h - lay.plank,
          x: measured ? scroll : lay.min,
          maskImage: lay.scrolls
            ? "linear-gradient(to right, transparent, black 18px, black calc(100% - 18px), transparent)"
            : undefined,
        }}
      >
        {list.map((item, i) => {
          const pose = poses[i];
          const book = lay.books[i];
          if (!pose || !book) return null;
          return (
            <Book
              key={i}
              index={i}
              n={n}
              item={item}
              geo={book}
              pose={pose}
              z={zOf(i)}
              held={held === i}
              tabbable={i === tabbable}
              titles={titles}
              disabled={disabled}
              register={register}
              onActivate={activate}
              onKeyDown={onKeyDown}
              onFocusBook={onFocusBook}
              onHover={onHover}
            />
          );
        })}
        {!motionSafe && openBook && openItem && open !== null ? (
          <FlatCover
            item={openItem}
            index={open}
            book={openBook}
            card={poses[open]?.card}
            rowShift={scroll}
            w={lay.w}
          />
        ) : null}
      </motion.div>
      {/* The plank: a lit top edge, then its front face. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{ height: lay.plank }}
      >
        <div
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: finish.top }}
        />
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: finish.edge }}
        />
        <div
          className="absolute inset-x-0 top-[3px] bottom-0"
          style={{
            background: finish.front,
            boxShadow:
              "inset 0 -1px 0 color-mix(in oklab, black 20%, transparent)",
          }}
        />
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys move along the shelf and open each book; Enter holds a book
        open and Escape puts it back.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** Reduced motion: the whole picture as a flat card above its slot, faded in. */
function FlatCover({
  item,
  index,
  book,
  card,
  rowShift,
  w,
}: {
  item: BookSpinesItem;
  index: number;
  book: BookGeo;
  card: MotionValue<number> | undefined;
  rowShift: MotionValue<number>;
  w: number;
}) {
  const left = clamp(
    book.left + book.s / 2 - book.c / 2,
    6 - rowShift.get(),
    w - 6 - book.c - rowShift.get(),
  );
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute bottom-0 block overflow-hidden rounded-r-[3px] shadow-lg"
      style={{
        left: Math.round(left),
        width: book.c,
        height: book.h,
        opacity: card,
        zIndex: 300,
        backgroundImage: item.src ? `url("${item.src}")` : jacketArt(index),
        backgroundSize: `${book.s + book.c}px ${book.h}px`,
        backgroundPosition: `${-book.s}px 0`,
      }}
    >
      <span
        className="absolute inset-x-[8%] bottom-[7%] flex items-center justify-center rounded-[2px] px-1 py-1"
        style={{ background: PAPER, color: PAPER_INK }}
      >
        <span
          className="truncate leading-none font-medium"
          style={{ fontSize: Math.round(clamp(book.c * 0.085, 9, 12)) }}
        >
          {item.caption ?? item.alt}
        </span>
      </span>
    </motion.span>
  );
}
