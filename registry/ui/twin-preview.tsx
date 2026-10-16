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
  ChevronUp,
  ImagePlus,
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

export type TwinPreviewFieldId =
  "photos" | "title" | "price" | "size" | "tags" | "description";

export type TwinPreviewPlant = "pearls" | "pilea" | "snake";

export type TwinPreviewPhoto = {
  id: string;
  /** Read by assistive technology wherever the photo appears. */
  alt: string;
  /** Picks the drawn shot: wall, pot, strands and light. */
  seed: number;
  /** What the drawing shows. @default "pearls" */
  plant?: TwinPreviewPlant;
  /** A close-up crop of the same plant. @default false */
  closeUp?: boolean;
};

export type TwinPreviewListing = {
  title: string;
  /** In the shop's currency; null while it has no price. */
  price: number | null;
  /** In order: the first is the cover. */
  photos: TwinPreviewPhoto[];
  /** One of `sizes`, or "" while none is chosen. */
  size: string;
  tags: string[];
  description: string;
};

export type TwinPreviewCardStyle = "tile" | "row" | "poster";
export type TwinPreviewLayout = "split" | "mirror" | "peek";
export type TwinPreviewStatus = "ready" | "loading" | "error";

export type TwinPreviewProps = {
  /** Controlled listing. Every edit is reported through `onChange`. */
  value?: TwinPreviewListing;
  /** Initial listing when uncontrolled. @default defaultTwinPreviewListing */
  defaultValue?: TwinPreviewListing;
  /** Fires from the keystroke, press or upload that changed the listing, with the field it touched. */
  onChange?: (listing: TwinPreviewListing, field: TwinPreviewFieldId) => void;
  /** Publish was pressed with every required field filled. Return a promise to hold the button until it settles. */
  onPublish?: (listing: TwinPreviewListing) => void | Promise<unknown>;
  /** Save draft was pressed (or Ctrl/⌘+S). Return a promise to show it saving. */
  onSaveDraft?: (listing: TwinPreviewListing) => void | Promise<unknown>;
  /** Uploads a photo the listing just gained; call `report` with 0–1 as it goes. Omit it and photos arrive at once. */
  onUpload?: (
    photo: TwinPreviewPhoto,
    report: (progress: number) => void,
  ) => void | Promise<unknown>;
  /** Fires when the field being edited changes, or null when focus leaves the form. */
  onActiveFieldChange?: (field: TwinPreviewFieldId | null) => void;
  /** The shots Add photo takes from, in order. @default defaultTwinPreviewLibrary */
  library?: TwinPreviewPhoto[];
  /** Fields Publish refuses to go without; their empty places on the card are outlined. @default ["photos", "title", "price"] */
  required?: TwinPreviewFieldId[];
  /** The pot sizes offered. @default ["9 cm", "12 cm", "17 cm"] */
  sizes?: string[];
  /** Tags offered as one-press chips. @default ["Pet safe", "Low light", "Trailing", "Air purifying"] */
  suggestedTags?: string[];
  /** @default "USD" */
  currency?: string;
  /** @default "en-US" */
  locale?: string;
  /** The shop's name on the card. @default "Fernworks" */
  shop?: string;
  /** The panel's heading and accessible name. @default "New listing" */
  heading?: string;
  /** The moment the draft's age counts from, in ms — never read from the clock. @default defaultTwinPreviewNow */
  now?: number;
  /** When the draft was last saved, in ms; null for never. @default now − 4 minutes */
  savedAt?: number | null;
  /** Whether the listing has loaded. @default "ready" */
  status?: TwinPreviewStatus;
  /** "Try again" was pressed after the listing failed to load. */
  onRetry?: () => void;
  /** The shop card's look: photo above the text, a thumbnail beside it, or a full-bleed poster. @default "tile" */
  cardStyle?: TwinPreviewCardStyle;
  /** Form then card, card then form, or the card kept in the peek tab even when wide. @default "split" */
  layout?: TwinPreviewLayout;
  /** The lens, the tether, the ripples, the price and Publish — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The panel's height in px; the form scrolls inside it. @default 540 */
  height?: number;
  /** Nothing can be edited, saved or published. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Monday 12 October 2026, 10:24 UTC — mid-morning listing work. */
export const defaultTwinPreviewNow = Date.UTC(2026, 9, 12, 10, 24);

export const defaultTwinPreviewListing: TwinPreviewListing = {
  title: "String of pearls, variegated",
  price: 24,
  photos: [
    {
      id: "pearls-front",
      alt: "String of pearls trailing from a terracotta pot",
      seed: 1,
    },
  ],
  size: "12 cm",
  tags: ["Trailing", "Bright light"],
  description:
    "Cream-edged pearls on long trailing strands. Water when the beads start to pucker and let the soil dry between drinks.",
};

/** Four more shots of the same plant, waiting to be added. */
export const defaultTwinPreviewLibrary: TwinPreviewPhoto[] = [
  {
    id: "pearls-close",
    alt: "Close-up of the cream-edged pearls",
    seed: 8,
    closeUp: true,
  },
  {
    id: "pearls-shelf",
    alt: "Strands spilling over a shelf from a white pot",
    seed: 5,
  },
  {
    id: "pearls-window",
    alt: "The plant in a charcoal pot by a window",
    seed: 10,
  },
  {
    id: "pearls-light",
    alt: "Pearls catching the morning light",
    seed: 13,
    closeUp: true,
  },
];

const LABEL: Record<TwinPreviewFieldId, string> = {
  photos: "Photos",
  title: "Title",
  price: "Price",
  size: "Pot size",
  tags: "Tags",
  description: "Description",
};

const MISSING: Record<TwinPreviewFieldId, string> = {
  photos: "Add at least one photo",
  title: "Give the listing a title",
  price: "Add a price",
  size: "Choose a pot size",
  tags: "Add a tag",
  description: "Write a short description",
};

const TITLE_MAX = 60;
const DESC_MAX = 200;
const TAG_MAX = 6;
const TAG_LEN = 20;
/** Below this container width the card lives in the peek tab. */
const SIDE_MIN = 576;
/** The peek tab's height, px. */
const TAB_H = 48;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FIELD_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const emptyOf = (field: TwinPreviewFieldId, l: TwinPreviewListing) => {
  switch (field) {
    case "photos":
      return l.photos.length === 0;
    case "title":
      return l.title.trim() === "";
    case "price":
      return l.price === null;
    case "size":
      return l.size === "";
    case "tags":
      return l.tags.length === 0;
    case "description":
      return l.description.trim() === "";
  }
};

/** "24", "24.5", "$1,024.00" → a number; "" → null; anything else NaN. */
function parsePrice(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const cleaned = t.replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === "." || (cleaned.match(/\./g) ?? []).length > 1) {
    return NaN;
  }
  return Math.round(Number(cleaned) * 100) / 100;
}

const priceText = (price: number | null) =>
  price === null ? "" : price.toFixed(2);

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const listWords = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/* ----------------------------------------------------------------------- */
/*                                 The art                                  */
/* ----------------------------------------------------------------------- */

const WALL_HUES = [86, 32, 210, 150, 60];
const POTS = [
  "oklch(0.63 0.11 45)",
  "oklch(0.94 0.008 90)",
  "oklch(0.38 0.012 260)",
  "oklch(0.72 0.05 165)",
];
const LEAF = "oklch(0.62 0.12 142)";
const LEAF_DARK = "oklch(0.48 0.09 150)";
const CREAM = "oklch(0.91 0.06 108)";

type Pt = readonly [number, number];
const quad = (a: Pt, c: Pt, b: Pt, t: number): Pt => [
  r2((1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0]),
  r2((1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]),
];

/**
 * A product photo drawn in code: a wall in window light, a shelf, a pot and
 * the plant, every number seeded and rounded so the server and the browser
 * draw the same shot. It is fixed art — it reads the same in both themes,
 * as a photograph would.
 */
const PlantArt = React.memo(function PlantArt({
  photo,
  className,
}: {
  photo: TwinPreviewPhoto;
  className?: string;
}) {
  const rand = mulberry32(photo.seed * 7919 + 17);
  const hue = WALL_HUES[photo.seed % WALL_HUES.length] ?? 86;
  const pot = POTS[(photo.seed >>> 1) % POTS.length] ?? POTS[0];
  const plant = photo.plant ?? "pearls";
  const cx = r1(52 + rand() * 16);
  const shelf = 68;
  const rim = 47;
  const potW = 34;
  const lightX = r1(20 + rand() * 80);

  const strands: { d: string; beads: Pt[] }[] = [];
  const mound: { p: Pt; r: number; cream: boolean }[] = [];
  const leaves: { d: string; fill: string }[] = [];

  if (plant === "pearls") {
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const startX = r1(cx + (i - n / 2) * 4);
      const a: Pt = [startX, rim + 1];
      const c: Pt = [r1(startX + side * (12 + rand() * 8)), r1(rim - 4)];
      const b: Pt = [
        r1(startX + side * (16 + rand() * 18)),
        r1(shelf + 4 + rand() * 18),
      ];
      const beads: Pt[] = [];
      for (let t = 0.12; t <= 1.001; t += 0.085) beads.push(quad(a, c, b, t));
      strands.push({
        d: `M ${a[0]} ${a[1]} Q ${c[0]} ${c[1]} ${b[0]} ${b[1]}`,
        beads,
      });
    }
    for (let i = 0; i < 16; i += 1) {
      mound.push({
        p: [r1(cx - 14 + rand() * 28), r1(rim - 2 - rand() * 9)],
        r: r1(2 + rand() * 0.8),
        cream: rand() < 0.35,
      });
    }
  } else if (plant === "pilea") {
    for (let i = 0; i < 9; i += 1) {
      const ang = -Math.PI / 2 + (i - 4) * 0.32 + (rand() - 0.5) * 0.12;
      const len = 14 + rand() * 12;
      const x = r1(cx + Math.cos(ang) * len);
      const y = r1(rim - 2 + Math.sin(ang) * len);
      const r = r1(5 + rand() * 2.4);
      leaves.push({
        d: `M ${cx} ${rim} L ${x} ${y} M ${r1(x + r)} ${y} A ${r} ${r} 0 1 0 ${r1(x - r)} ${y} A ${r} ${r} 0 1 0 ${r1(x + r)} ${y} Z`,
        fill: i % 3 === 0 ? LEAF_DARK : LEAF,
      });
    }
  } else {
    for (let i = 0; i < 6; i += 1) {
      const x = r1(cx - 11 + i * 4.4 + (rand() - 0.5) * 2);
      const top = r1(rim - 22 - rand() * 18);
      const w = r1(2.6 + rand() * 1.4);
      const lean = r1((i - 2.5) * 1.6);
      leaves.push({
        d: `M ${r1(x - w)} ${rim} Q ${r1(x - w + lean * 0.4)} ${r1((rim + top) / 2)} ${r1(x + lean)} ${top} Q ${r1(x + w + lean * 0.4)} ${r1((rim + top) / 2)} ${r1(x + w)} ${rim} Z`,
        fill: i % 2 === 0 ? LEAF_DARK : LEAF,
      });
    }
  }

  const crop = photo.closeUp
    ? `translate(${r1(-cx * 0.9 + 6)} ${r1(-rim * 0.9 + 4)}) scale(1.9)`
    : undefined;

  return (
    <svg
      aria-hidden
      viewBox="0 0 120 90"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block size-full", className)}
    >
      <rect width="120" height="90" fill={`oklch(0.88 0.03 ${hue})`} />
      <ellipse
        cx={lightX}
        cy="18"
        rx="44"
        ry="30"
        fill="oklch(0.97 0.02 90)"
        opacity="0.5"
      />
      <g transform={crop}>
        <rect y={shelf} width="120" height="22" fill="oklch(0.79 0.04 68)" />
        <rect y={shelf} width="120" height="1.4" fill="oklch(0.86 0.03 70)" />
        <ellipse
          cx={cx}
          cy={shelf + 1}
          rx={potW * 0.62}
          ry="2.6"
          fill="oklch(0.25 0.02 60)"
          opacity="0.18"
        />
        {leaves.map((leaf, i) =>
          plant === "pilea" ? (
            <path
              key={i}
              d={leaf.d}
              fill={leaf.fill}
              stroke={LEAF_DARK}
              strokeWidth="0.7"
            />
          ) : (
            <path key={i} d={leaf.d} fill={leaf.fill} />
          ),
        )}
        {plant === "snake"
          ? leaves.map((leaf, i) => (
              <path
                key={`band-${i}`}
                d={leaf.d}
                fill="none"
                stroke={CREAM}
                strokeWidth="0.6"
                opacity="0.6"
              />
            ))
          : null}
        <path
          d={`M ${r1(cx - potW / 2)} ${rim} L ${r1(cx + potW / 2)} ${rim} L ${r1(cx + potW * 0.38)} ${shelf} L ${r1(cx - potW * 0.38)} ${shelf} Z`}
          fill={pot}
        />
        <rect
          x={r1(cx - potW / 2 - 1.5)}
          y={rim - 1}
          width={potW + 3}
          height="4.5"
          rx="1"
          fill={pot}
        />
        <rect
          x={r1(cx - potW / 2 - 1.5)}
          y={rim - 1}
          width={potW + 3}
          height="4.5"
          rx="1"
          fill="black"
          opacity="0.08"
        />
        <path
          d={`M ${r1(cx - potW * 0.3)} ${rim + 5} L ${r1(cx - potW * 0.24)} ${shelf - 2}`}
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.22"
        />
        {strands.map((s, i) => (
          <g key={i}>
            <path d={s.d} fill="none" stroke={LEAF_DARK} strokeWidth="0.7" />
            {s.beads.map((b, j) => (
              <circle
                key={j}
                cx={b[0]}
                cy={b[1]}
                r={j % 4 === 3 ? 2.2 : 1.9}
                fill={(i + j) % 5 === 0 ? CREAM : LEAF}
              />
            ))}
          </g>
        ))}
        {mound.map((m, i) => (
          <circle
            key={i}
            cx={m.p[0]}
            cy={m.p[1]}
            r={m.r}
            fill={m.cream ? CREAM : LEAF}
            stroke={LEAF_DARK}
            strokeWidth="0.3"
          />
        ))}
      </g>
    </svg>
  );
});

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/**
 * Characters that roll in their slots on snap, toward the direction the
 * number moved. Slots are keyed from the right so "$9.00" → "$12.00" rolls
 * the digits that changed and grows one slot on the left.
 */
function Rolling({
  text,
  dir,
  motionSafe,
}: {
  text: string;
  dir: number;
  motionSafe: boolean;
}) {
  const chars = Array.from(text);
  return (
    <span aria-hidden className="inline-flex">
      {chars.map((ch, i) => (
        <span
          key={chars.length - i}
          className="relative inline-flex overflow-clip"
        >
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.span
              key={ch}
              custom={dir}
              className="inline-block whitespace-pre"
              variants={{
                enter: (d: number) => ({
                  opacity: 0,
                  y: motionSafe ? `${d * 70}%` : 0,
                }),
                shown: { opacity: 1, y: 0 },
                leave: (d: number) => ({
                  opacity: 0,
                  y: motionSafe ? `${-d * 70}%` : 0,
                  transition: exitFor(durations.fast),
                }),
              }}
              initial="enter"
              animate="shown"
              exit="leave"
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/** A progress fill that glides to each report; under reduced motion it steps. */
function Fill({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const mv = useMotionValue(clamp01(value));
  React.useEffect(() => {
    const c = animate(
      mv,
      clamp01(value),
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => c.stop();
  }, [mv, value, motionSafe]);
  const width = useTransform(mv, (v) => `${r2(clamp01(v) * 100)}%`);
  return (
    <motion.span
      aria-hidden
      className={cn("absolute inset-y-0 left-0 rounded-full", className)}
      style={{ width }}
    />
  );
}

/** The ring a thumbnail wears while it uploads. */
function Ring({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const C = 2 * Math.PI * 9;
  const mv = useMotionValue(clamp01(value));
  React.useEffect(() => {
    const c = animate(
      mv,
      clamp01(value),
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => c.stop();
  }, [mv, value, motionSafe]);
  const offset = useTransform(mv, (v) => r2(C * (1 - clamp01(v))));
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="white"
        strokeOpacity="0.35"
        strokeWidth="2.5"
      />
      <motion.circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={r2(C)}
        style={{
          strokeDashoffset: offset,
          rotate: -90,
          originX: 0.5,
          originY: 0.5,
        }}
      />
    </svg>
  );
}

/**
 * Siblings that glide to their new places when a list changes — measured in
 * offsets inside the list, so a banner opening above the form (which moves
 * the whole list on screen) never sets them sliding. A glide already under
 * way is picked up from where it is, not restarted from its old place.
 */
function useFlip(
  ref: React.RefObject<HTMLElement | null>,
  ids: string[],
  motionSafe: boolean,
  salt = "",
) {
  const key = `${ids.join("\u0000")}\u0001${salt}`;
  const prev = React.useRef(new Map<string, readonly [number, number]>());
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  React.useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const live = new Set(key.split("\u0001")[0]?.split("\u0000"));
    const next = new Map<string, readonly [number, number]>();
    for (const node of Array.from(list.children)) {
      if (!(node instanceof HTMLElement)) continue;
      const id = node.dataset.flip;
      // A leaving item is popped out of the flow; only the stayers glide.
      if (!id || !live.has(id)) continue;
      const at = [node.offsetLeft, node.offsetTop] as const;
      next.set(id, at);
      const old = prev.current.get(id);
      if (!old || !motionSafe) continue;
      const m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      const dx = old[0] + m.e - at[0];
      const dy = old[1] + m.f - at[1];
      if (old[0] === at[0] && old[1] === at[1]) continue;
      runs.current.get(id)?.stop();
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      runs.current.set(
        id,
        animate(node, { x: [r1(dx), 0], y: [r1(dy), 0] }, springs.glide),
      );
    }
    prev.current = next;
  }, [ref, key, motionSafe]);
  React.useEffect(() => {
    const running = runs.current;
    return () => {
      for (const c of running.values()) c.complete();
      running.clear();
    };
  }, []);
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * A soft highlight that glides between targets on glide. The first target
 * (or any under reduced motion) is jumped to and faded in, so it never
 * sweeps in from the corner; a target that has not moved does not restart
 * the springs.
 */
function useLens(motionSafe: boolean) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const w = useMotionValue(0);
  const h = useMotionValue(0);
  const o = useMotionValue(0);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const last = React.useRef<string>("");

  const stop = React.useCallback(() => {
    for (const c of runs.current) c.stop();
    runs.current = [];
  }, []);

  const go = React.useCallback(
    (r: Rect | null) => {
      const key = r ? `${r1(r.x)},${r1(r.y)},${r1(r.w)},${r1(r.h)}` : "";
      if (key === last.current) return;
      const wasShown = last.current !== "";
      last.current = key;
      stop();
      if (!r) {
        runs.current = [
          animate(o, 0, { duration: durations.fast, ease: easings.exit }),
        ];
        return;
      }
      const fade = animate(o, 1, {
        duration: durations.base,
        ease: easings.enter,
      });
      if (!wasShown || !motionSafe) {
        x.jump(r1(r.x));
        y.jump(r1(r.y));
        w.jump(r1(r.w));
        h.jump(r1(r.h));
        runs.current = [fade];
        return;
      }
      runs.current = [
        fade,
        animate(x, r1(r.x), springs.glide),
        animate(y, r1(r.y), springs.glide),
        animate(w, r1(r.w), springs.glide),
        animate(h, r1(r.h), springs.glide),
      ];
    },
    [h, motionSafe, o, stop, w, x, y],
  );

  React.useEffect(() => stop, [stop]);
  return { x, y, w, h, o, go };
}

type Upload = { progress: number; state: "running" | "failed" | "done" };
type Flag = "idle" | "pending" | "done" | "failed";

/* ----------------------------------------------------------------------- */
/*                                The editor                                */
/* ----------------------------------------------------------------------- */

/**
 * A listing editor with its shop card beside it, both driven by one value.
 * The field you are on and its place on the card are lit by twin lenses
 * that glide to each new focus on the glide spring, joined by a thin tether
 * whose ends ride the same springs, so moving down the form visibly walks
 * the card. Every edit ripples out of the region it changed — a ring of
 * accent that spreads and fades — while the price rolls its digits on snap,
 * new tags pop in on snap and a new cover cross-fades.
 *
 * Photos upload inside the card: the frame sits under a scrim with a fill
 * that glides to each report. Required fields that are empty stand on the
 * card as dashed ghosts; a Publish that cannot go turns them red, names the
 * fields with links to each, and the lenses glide to the first. Below a
 * 36rem container the card waits in a peek tab at the foot of the form and
 * rises as a sheet when pressed.
 *
 * Every field is a real control: photos are one list stop where arrows
 * move, Shift with an arrow reorders, Enter makes a cover and Delete
 * removes; pot size is a radiogroup; tags take Enter, comma and Backspace.
 * Ctrl/⌘+S saves the draft and Ctrl/⌘+Enter publishes. Under reduced motion
 * the lenses and tether jump and fade, ripples become a wash, and digits
 * swap — progress, outlines and counts still change.
 */
export function TwinPreview({
  value,
  defaultValue,
  onChange,
  onPublish,
  onSaveDraft,
  onUpload,
  onActiveFieldChange,
  library = defaultTwinPreviewLibrary,
  required = ["photos", "title", "price"],
  sizes = ["9 cm", "12 cm", "17 cm"],
  suggestedTags = ["Pet safe", "Low light", "Trailing", "Air purifying"],
  currency = "USD",
  locale = "en-US",
  shop = "Fernworks",
  heading = "New listing",
  now = defaultTwinPreviewNow,
  savedAt,
  status = "ready",
  onRetry,
  cardStyle = "tile",
  layout = "split",
  accent = "var(--accent-bright)",
  height = 540,
  disabled = false,
  className,
}: TwinPreviewProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const headingId = `${uid}-heading`;
  const photoHintId = `${uid}-photo-hint`;
  const tagHintId = `${uid}-tag-hint`;
  const sheetId = `${uid}-sheet`;
  const ready = status === "ready";
  const locked = disabled || !ready;
  const side = layout !== "peek";

  const money = React.useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [locale, currency],
  );
  const symbol = React.useMemo(
    () =>
      money.formatToParts(0).find((p) => p.type === "currency")?.value ?? "",
    [money],
  );

  /* ------------------------------- state -------------------------------- */

  const [own, setOwn] = React.useState<TwinPreviewListing>(
    () => defaultValue ?? defaultTwinPreviewListing,
  );
  const listing = value ?? own;

  const [active, setActive] = React.useState<TwinPreviewFieldId | null>(null);
  const [uploads, setUploads] = React.useState<Record<string, Upload>>({});
  const [attempted, setAttempted] = React.useState(false);
  const [publish, setPublish] = React.useState<Flag>("idle");
  const [draft, setDraft] = React.useState<Flag>("idle");
  const [dirty, setDirty] = React.useState(false);
  const [peekOpen, setPeekOpen] = React.useState(false);
  const [narrow, setNarrow] = React.useState(false);
  const [panelH, setPanelH] = React.useState(0);
  const [tagDraft, setTagDraft] = React.useState("");
  const [priceDraft, setPriceDraft] = React.useState(() =>
    priceText(listing.price),
  );
  const [priceSeen, setPriceSeen] = React.useState(listing.price);
  const [priceTouched, setPriceTouched] = React.useState(false);
  const [priceDir, setPriceDir] = React.useState(1);
  const [photoTab, setPhotoTab] = React.useState<string | null>(null);
  const [photoFocus, setPhotoFocus] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  const [fresh, setFresh] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // A price that changes from outside (the host, a reset) refills the field,
  // unless it is what the field already says.
  if (priceSeen !== listing.price) {
    setPriceSeen(listing.price);
    setPriceDir((listing.price ?? 0) >= (priceSeen ?? 0) ? 1 : -1);
    if (parsePrice(priceDraft) !== listing.price) {
      setPriceDraft(priceText(listing.price));
    }
  }

  const missing = required.filter((f) => emptyOf(f, listing));
  const flagged = (f: TwinPreviewFieldId) => attempted && missing.includes(f);
  const priceBad = Number.isNaN(parsePrice(priceDraft));
  const running = Object.entries(uploads).filter(
    ([, u]) => u.state === "running",
  );
  const failedUploads = Object.entries(uploads).filter(
    ([, u]) => u.state === "failed",
  );
  const nextShot = library.find(
    (p) => !listing.photos.some((q) => q.id === p.id),
  );
  const tabbablePhoto =
    listing.photos.find((p) => p.id === photoTab)?.id ??
    listing.photos[0]?.id ??
    null;

  /* ------------------------------- refs --------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const columnRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const cardInnerRef = React.useRef<HTMLDivElement | null>(null);
  const rippleRef = React.useRef<HTMLSpanElement | null>(null);
  const photoListRef = React.useRef<HTMLUListElement | null>(null);
  const tagListRef = React.useRef<HTMLDivElement | null>(null);
  const cardTagsRef = React.useRef<HTMLDivElement | null>(null);
  const dotRef = React.useRef<HTMLSpanElement | null>(null);
  const rippleRun = React.useRef<AnimationPlaybackControls | null>(null);
  const tetherRun = React.useRef<AnimationPlaybackControls | null>(null);
  const alive = React.useRef(false);
  const timers = React.useRef(new Set<number>());
  const measureRef = React.useRef<() => void>(() => {});
  const latest = React.useRef(listing);

  React.useEffect(() => {
    latest.current = listing;
  });

  React.useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      rippleRun.current?.stop();
      tetherRun.current?.stop();
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  /* ---------------------------- lens + tether ---------------------------- */

  useFlip(
    photoListRef,
    listing.photos.map((p) => p.id),
    motionSafe,
  );
  useFlip(tagListRef, listing.tags, motionSafe);
  useFlip(cardTagsRef, listing.tags, motionSafe, cardStyle);

  const formLens = useLens(motionSafe);
  const cardLens = useLens(motionSafe);
  const scroll = useMotionValue(0);
  const colScroll = useMotionValue(0);
  const ox = useMotionValue(0);
  const oy = useMotionValue(0);
  const kx = useMotionValue(0);
  const ky = useMotionValue(0);
  const dir = useMotionValue(1);
  const clipTop = useMotionValue(0);
  const clipBottom = useMotionValue(0);
  const tether = useMotionValue(0);

  const ends = [
    formLens.x,
    formLens.y,
    formLens.w,
    formLens.h,
    cardLens.x,
    cardLens.y,
    cardLens.w,
    cardLens.h,
    scroll,
    colScroll,
    ox,
    oy,
    kx,
    ky,
    dir,
    clipTop,
    clipBottom,
  ] as MotionValue<number>[];
  const tetherD = useTransform(ends, (v: number[]) => {
    const [fx = 0, fy = 0, fw = 0, fh = 0, cx = 0, cy = 0, cw = 0, ch = 0] = v;
    const [s = 0, cs = 0, x0 = 0, y0 = 0, x1 = 0, y1 = 0, d = 1] = v.slice(8);
    const [top = 0, bottom = 0] = v.slice(15);
    const sx = x0 + (d > 0 ? fx + fw : fx);
    const sy = clamp(
      y0 - s + fy + fh / 2,
      top + 6,
      Math.max(top + 6, bottom - 6),
    );
    const ex = x1 + (d > 0 ? cx : cx + cw);
    const ey = clamp(
      y1 - cs + cy + ch / 2,
      top + 6,
      Math.max(top + 6, bottom - 6),
    );
    const hx = (ex - sx) * 0.5;
    return `M ${r1(sx)} ${r1(sy)} C ${r1(sx + hx)} ${r1(sy)} ${r1(ex - hx)} ${r1(ey)} ${r1(ex)} ${r1(ey)}`;
  });
  const startX = useTransform(ends, (v: number[]) =>
    r1(
      (v[10] ?? 0) +
        ((v[14] ?? 1) > 0 ? (v[0] ?? 0) + (v[2] ?? 0) : (v[0] ?? 0)),
    ),
  );
  const startY = useTransform(ends, (v: number[]) => {
    const top = v[15] ?? 0;
    const bottom = v[16] ?? 0;
    return r1(
      clamp(
        (v[11] ?? 0) - (v[8] ?? 0) + (v[1] ?? 0) + (v[3] ?? 0) / 2,
        top + 6,
        Math.max(top + 6, bottom - 6),
      ),
    );
  });
  const endX = useTransform(ends, (v: number[]) =>
    r1(
      (v[12] ?? 0) +
        ((v[14] ?? 1) > 0 ? (v[4] ?? 0) : (v[4] ?? 0) + (v[6] ?? 0)),
    ),
  );
  const endY = useTransform(ends, (v: number[]) => {
    const top = v[15] ?? 0;
    const bottom = v[16] ?? 0;
    return r1(
      clamp(
        (v[13] ?? 0) - (v[9] ?? 0) + (v[5] ?? 0) + (v[7] ?? 0) / 2,
        top + 6,
        Math.max(top + 6, bottom - 6),
      ),
    );
  });
  const tetherOpacity = useTransform(
    [tether, formLens.o, cardLens.o] as MotionValue<number>[],
    ([t = 0, a = 0, b = 0]: number[]) => r2(t * Math.min(a, b) * 0.55),
  );
  const dotOpacity = useTransform(tetherOpacity, (v) => r2(v * 1.6));

  // Measured after every commit, and again whenever a box changes size: the
  // lenses glide to whatever the field and its card region now are.
  React.useLayoutEffect(() => {
    measureRef.current = () => {
      const root = rootRef.current;
      const body = bodyRef.current;
      const scroller = scrollerRef.current;
      const content = contentRef.current;
      const card = cardRef.current;
      const column = columnRef.current;
      if (!root || !body || !scroller || !content || !card || !column) return;
      const sideNow = side && root.offsetWidth >= SIDE_MIN;
      const bb = body.getBoundingClientRect();
      // Rects are read in screen space; a scaled ancestor (a gallery card
      // easing in) is divided back out so the lenses land in layout space.
      const k = bb.width / (body.offsetWidth || 1) || 1;
      const cb = content.getBoundingClientRect();
      const kb = card.getBoundingClientRect();
      const sb = scroller.getBoundingClientRect();
      const field = active
        ? content.querySelector<HTMLElement>(`[data-tp-field="${active}"]`)
        : null;
      if (field && ready) {
        const r = field.getBoundingClientRect();
        formLens.go({
          x: (r.left - cb.left) / k - 8,
          y: (r.top - cb.top) / k - 6,
          w: r.width / k + 16,
          h: r.height / k + 12,
        });
      } else formLens.go(null);
      const region = active
        ? card.querySelector<HTMLElement>(`[data-tp-region="${active}"]`)
        : null;
      const cardVisible = sideNow || peekOpen;
      if (region && ready && cardVisible) {
        const r = region.getBoundingClientRect();
        const cw = kb.width / k;
        const chh = kb.height / k;
        const x = clamp((r.left - kb.left) / k - 3, 1, cw - 2);
        const y = clamp((r.top - kb.top) / k - 3, 1, chh - 2);
        cardLens.go({
          x,
          y,
          w: Math.min(cw - 1 - x, r.width / k + 6),
          h: Math.min(chh - 1 - y, r.height / k + 6),
        });
      } else cardLens.go(null);
      ox.set(r1((cb.left - bb.left) / k));
      oy.set(r1((cb.top - bb.top) / k + scroller.scrollTop));
      kx.set(r1((kb.left - bb.left) / k));
      ky.set(r1((kb.top - bb.top) / k + column.scrollTop));
      scroll.set(scroller.scrollTop);
      colScroll.set(column.scrollTop);
      dir.set(kb.left + kb.width / 2 >= cb.left + cb.width / 2 ? 1 : -1);
      clipTop.set(r1((sb.top - bb.top) / k));
      clipBottom.set(r1((sb.bottom - bb.top) / k));
      const want = sideNow && field && region && ready ? 1 : 0;
      if (tether.get() !== want) {
        tetherRun.current?.stop();
        tetherRun.current = animate(tether, want, {
          duration: want ? durations.base : durations.fast,
          ease: want ? easings.enter : easings.exit,
        });
      }
    };
    measureRef.current();
  });

  // Container width decides where the card lives; content sizes decide
  // where the lenses go and how tall the peek sheet opens.
  React.useEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    const content = contentRef.current;
    const card = cardInnerRef.current;
    if (!root || !body || !content || !card) return;
    const ro = new ResizeObserver(() => {
      setNarrow(!side || root.offsetWidth < SIDE_MIN);
      setPanelH(
        Math.round(
          Math.min(
            card.offsetHeight,
            Math.max(0, body.offsetHeight - TAB_H - 20),
          ),
        ),
      );
      measureRef.current();
    });
    ro.observe(root);
    ro.observe(body);
    ro.observe(content);
    ro.observe(card);
    return () => ro.disconnect();
  }, [side, status]);

  // A photo moved by key keeps the focus that moved it.
  React.useEffect(() => {
    if (!photoFocus) return;
    rootRef.current
      ?.querySelector<HTMLElement>(
        `[data-tp-photo="${CSS.escape(photoFocus.id)}"]`,
      )
      ?.focus();
  }, [photoFocus]);

  /* ------------------------------ actions ------------------------------- */

  const activate = (field: TwinPreviewFieldId | null) => {
    if (field === active) return;
    setActive(field);
    onActiveFieldChange?.(field);
  };

  const ripple = (field: TwinPreviewFieldId) => {
    const card = cardRef.current;
    const body = bodyRef.current;
    const root = rootRef.current;
    if (!card || !body || !root) return;
    const cardShown = (side && root.offsetWidth >= SIDE_MIN) || peekOpen;
    rippleRun.current?.stop();
    if (!cardShown) {
      // The card is tucked away: the tab's dot answers instead.
      const dot = dotRef.current;
      if (dot) {
        rippleRun.current = motionSafe
          ? animate(
              dot,
              { scale: [1, 1.9, 1], opacity: [1, 0.6, 1] },
              { duration: durations.slow, ease: easings.move },
            )
          : animate(dot, { opacity: [0.4, 1] }, { duration: durations.base });
      }
      return;
    }
    const el = rippleRef.current;
    const region = card.querySelector<HTMLElement>(
      `[data-tp-region="${field}"]`,
    );
    if (!el || !region) return;
    const k = body.getBoundingClientRect().width / (body.offsetWidth || 1) || 1;
    const kb = card.getBoundingClientRect();
    const r = region.getBoundingClientRect();
    if (motionSafe) {
      const R = 72;
      const cx = (r.left - kb.left + r.width / 2) / k;
      const cy = (r.top - kb.top + r.height / 2) / k;
      el.style.left = `${r1(cx - R)}px`;
      el.style.top = `${r1(cy - R)}px`;
      el.style.width = `${R * 2}px`;
      el.style.height = `${R * 2}px`;
      el.style.borderRadius = "9999px";
      rippleRun.current = animate(
        el,
        { scale: [0.12, 1], opacity: [0.9, 0] },
        { duration: 0.6, ease: easings.enter },
      );
    } else {
      el.style.left = `${r1((r.left - kb.left) / k)}px`;
      el.style.top = `${r1((r.top - kb.top) / k)}px`;
      el.style.width = `${r1(r.width / k)}px`;
      el.style.height = `${r1(r.height / k)}px`;
      el.style.borderRadius = "8px";
      rippleRun.current = animate(
        el,
        { scale: 1, opacity: [0.7, 0] },
        { duration: durations.slow, ease: easings.enter },
      );
    }
  };

  const commit = (next: TwinPreviewListing, field: TwinPreviewFieldId) => {
    if (locked) return;
    if (value === undefined) setOwn(next);
    onChange?.(next, field);
    setDirty(true);
    if (publish === "done" || publish === "failed") setPublish("idle");
    if (draft === "done" || draft === "failed") setDraft("idle");
    ripple(field);
  };

  const focusField = (field: TwinPreviewFieldId) => {
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-tp-control="${field}"]`,
    );
    node?.focus();
  };

  const startUpload = (photo: TwinPreviewPhoto) => {
    if (!onUpload) return;
    setUploads((u) => ({
      ...u,
      [photo.id]: { progress: 0, state: "running" },
    }));
    const report = (p: number) => {
      if (!alive.current) return;
      setUploads((u) =>
        u[photo.id]?.state === "running"
          ? { ...u, [photo.id]: { progress: clamp01(p), state: "running" } }
          : u,
      );
    };
    const finish = (ok: boolean) => {
      if (!alive.current) return;
      setUploads((u) =>
        u[photo.id]
          ? {
              ...u,
              [photo.id]: ok
                ? { progress: 1, state: "done" }
                : { progress: u[photo.id]?.progress ?? 0, state: "failed" },
            }
          : u,
      );
      const at = latest.current.photos.findIndex((p) => p.id === photo.id);
      if (at === -1) return;
      say(ok ? `Photo ${at + 1} uploaded.` : `Photo ${at + 1} didn't upload.`);
      if (ok) {
        later(() => {
          setUploads((u) => {
            if (u[photo.id]?.state !== "done") return u;
            const rest = { ...u };
            delete rest[photo.id];
            return rest;
          });
        }, 900);
      }
    };
    let result: void | Promise<unknown>;
    try {
      result = onUpload(photo, report);
    } catch {
      finish(false);
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(
        () => finish(true),
        () => finish(false),
      );
    } else finish(true);
  };

  const addPhoto = () => {
    if (locked || !nextShot) return;
    const next = { ...listing, photos: [...listing.photos, nextShot] };
    setFresh(nextShot.id);
    commit(next, "photos");
    say(
      onUpload
        ? `Uploading photo ${next.photos.length}.`
        : `Photo ${next.photos.length} added.`,
    );
    startUpload(nextShot);
  };

  const movePhoto = (id: string, to: number) => {
    const from = listing.photos.findIndex((p) => p.id === id);
    const target = clamp(to, 0, listing.photos.length - 1);
    if (from === -1 || from === target) return;
    const photos = [...listing.photos];
    const [moved] = photos.splice(from, 1);
    if (!moved) return;
    photos.splice(target, 0, moved);
    setFresh(null);
    commit({ ...listing, photos }, "photos");
    setPhotoTab(id);
    setPhotoFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    say(
      target === 0
        ? `${moved.alt} is the cover.`
        : `Photo moved to place ${target + 1} of ${photos.length}.`,
    );
  };

  const removePhoto = (id: string) => {
    const at = listing.photos.findIndex((p) => p.id === id);
    if (at === -1) return;
    const photos = listing.photos.filter((p) => p.id !== id);
    setFresh(null);
    setUploads((u) => {
      if (!u[id]) return u;
      const rest = { ...u };
      delete rest[id];
      return rest;
    });
    commit({ ...listing, photos }, "photos");
    say(`Photo removed. ${plural(photos.length, "photo", "photos")} left.`);
    const neighbour = photos[Math.min(at, photos.length - 1)];
    if (neighbour) {
      setPhotoTab(neighbour.id);
      setPhotoFocus((f) => ({ id: neighbour.id, n: (f?.n ?? 0) + 1 }));
    } else {
      focusField("photos");
    }
  };

  const addTags = (raw: string[]) => {
    const tags = [...listing.tags];
    const added: string[] = [];
    for (const r of raw) {
      const t = r.trim().slice(0, TAG_LEN);
      if (!t || tags.length >= TAG_MAX) continue;
      if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
      tags.push(t);
      added.push(t);
    }
    if (added.length === 0) return false;
    commit({ ...listing, tags }, "tags");
    say(`Tag ${listWords(added)} added.`);
    return true;
  };

  const removeTag = (tag: string) => {
    commit({ ...listing, tags: listing.tags.filter((t) => t !== tag) }, "tags");
    say(`Tag ${tag} removed.`);
  };

  const run = (
    fn: ((l: TwinPreviewListing) => void | Promise<unknown>) | undefined,
    set: (f: Flag) => void,
    done: string,
    failed: string,
    after?: () => void,
  ) => {
    const result = fn?.(listing);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      set("pending");
      (result as Promise<unknown>).then(
        () => {
          if (!alive.current) return;
          set("done");
          after?.();
          say(done);
        },
        () => {
          if (!alive.current) return;
          set("failed");
          say(failed);
        },
      );
    } else {
      set("done");
      after?.();
      say(done);
    }
  };

  const saveDraft = () => {
    if (locked || draft === "pending" || publish === "pending") return;
    run(
      onSaveDraft,
      setDraft,
      "Draft saved.",
      "The draft didn't save. Your changes are still here.",
      () => setDirty(false),
    );
  };

  const publishNow = () => {
    if (locked || publish === "pending") return;
    setAttempted(true);
    if (missing.length > 0) {
      say(
        `${plural(missing.length, "field needs", "fields need")} attention: ${listWords(missing.map((f) => LABEL[f]))}.`,
      );
      const first = missing[0];
      if (first) focusField(first);
      return;
    }
    if (running.length > 0) {
      say(
        `Wait for ${plural(running.length, "photo", "photos")} to finish uploading.`,
      );
      return;
    }
    if (failedUploads.length > 0) {
      say("A photo didn't upload. Retry or remove it first.");
      focusField("photos");
      return;
    }
    run(
      onPublish,
      setPublish,
      `Published. ${listing.title} is live.`,
      "It didn't publish. Nothing was lost; try again.",
      () => setDirty(false),
    );
  };

  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && (event.key === "s" || event.key === "S")) {
      event.preventDefault();
      saveDraft();
    } else if (mod && event.key === "Enter") {
      event.preventDefault();
      publishNow();
    } else if (event.key === "Escape" && peekOpen) {
      // Ours: the sheet closes, and nothing behind it.
      event.preventDefault();
      setPeekOpen(false);
    }
  };

  const openRegion = (field: TwinPreviewFieldId) => {
    if (locked) return;
    if (narrow) setPeekOpen(false);
    focusField(field);
  };

  /* ------------------------------- render ------------------------------- */

  const cover = listing.photos[0];
  const coverUpload = cover ? uploads[cover.id] : undefined;
  const anyRunning = running[0];
  const runningIndex = anyRunning
    ? listing.photos.findIndex((p) => p.id === anyRunning[0])
    : -1;
  const shownPrice = listing.price === null ? "" : money.format(listing.price);
  const published = publish === "done";

  const chip = (() => {
    if (publish === "pending") return { text: "Publishing…", tone: "accent" };
    if (published) return { text: "Published", tone: "success" };
    if (draft === "pending") return { text: "Saving…", tone: "accent" };
    if (draft === "failed" || publish === "failed") {
      return { text: "Not saved", tone: "danger" };
    }
    if (dirty) return { text: "Unsaved changes", tone: "warn" };
    if (draft === "done") return { text: "Draft saved", tone: "neutral" };
    const at = savedAt === undefined ? now - 4 * MIN : savedAt;
    return {
      text: at === null ? "Draft" : `Draft · saved ${ago(at, now)}`,
      tone: "neutral",
    };
  })();
  const chipDot =
    chip.tone === "success"
      ? "bg-success"
      : chip.tone === "danger"
        ? "bg-danger"
        : chip.tone === "warn"
          ? "bg-warn"
          : chip.tone === "accent"
            ? "bg-(--tp-accent)"
            : "bg-ink-3";

  const ghost = (field: TwinPreviewFieldId, text: string, onDark = false) => (
    <span
      className={cn(
        "flex items-center rounded-2 border border-dashed px-2 py-1 text-[12px] leading-4 transition-colors",
        flagged(field)
          ? "border-danger/70 text-danger"
          : onDark
            ? "border-white/60 text-white/80"
            : "border-hairline-strong text-ink-3",
      )}
    >
      {text}
    </span>
  );

  const regionClass = cn("relative", !locked && "cursor-pointer");

  const coverBody = (round: string, onDark = false) => (
    <div
      data-tp-region="photos"
      onClick={() => openRegion("photos")}
      className={cn(
        "relative size-full overflow-hidden",
        round,
        !locked && "cursor-pointer",
      )}
    >
      {cover ? (
        <AnimatePresence initial={false}>
          <motion.div
            key={cover.id}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.slow, ease: easings.enter }}
          >
            <PlantArt photo={cover} />
          </motion.div>
        </AnimatePresence>
      ) : (
        <div
          className={cn(
            "absolute inset-2 flex flex-col items-center justify-center gap-1.5 rounded-2 border border-dashed text-[12px] transition-colors",
            flagged("photos")
              ? "border-danger/70 text-danger"
              : onDark
                ? "border-hairline-strong text-ink-3"
                : "border-hairline-strong text-ink-3",
          )}
        >
          <ImagePlus aria-hidden className="size-5" />
          Add a photo
        </div>
      )}
      {coverUpload && coverUpload.state !== "done" ? (
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 text-white",
            coverUpload.state === "failed"
              ? "bg-[color-mix(in_oklab,var(--danger)_55%,black_20%)]"
              : "bg-[color-mix(in_oklab,black_42%,transparent)]",
          )}
        >
          {coverUpload.state === "failed" ? (
            <>
              <TriangleAlert aria-hidden className="size-5" />
              <span className="text-[12px] font-medium">Upload failed</span>
            </>
          ) : (
            <>
              <span className="font-mono text-[11px] tracking-[0.08em] uppercase tabular-nums">
                Uploading {Math.round(coverUpload.progress * 100)}%
              </span>
              <span className="relative h-1 w-2/3 overflow-hidden rounded-full bg-white/30">
                <Fill
                  value={coverUpload.progress}
                  motionSafe={motionSafe}
                  className="bg-white"
                />
              </span>
            </>
          )}
        </div>
      ) : anyRunning && runningIndex > 0 ? (
        <div className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-full bg-[color-mix(in_oklab,black_45%,transparent)] px-2.5 py-1 text-white">
          <span className="font-mono text-[10px] whitespace-nowrap tabular-nums">
            Photo {runningIndex + 1} ·{" "}
            {Math.round((anyRunning[1].progress ?? 0) * 100)}%
          </span>
          <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/30">
            <Fill
              value={anyRunning[1].progress}
              motionSafe={motionSafe}
              className="bg-white"
            />
          </span>
        </div>
      ) : null}
      {listing.photos.length > 1 && cardStyle !== "poster" ? (
        <span
          aria-hidden
          className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,black_38%,transparent)] px-1.5 py-1"
        >
          {listing.photos.slice(0, 6).map((p, i) => (
            <span
              key={p.id}
              className={cn(
                "size-1.5 rounded-full",
                uploads[p.id]?.state === "running"
                  ? "ring-1 ring-white"
                  : i === 0
                    ? "bg-white"
                    : "bg-white/45",
              )}
            />
          ))}
        </span>
      ) : null}
    </div>
  );

  const titleNode = (onDark = false) => (
    <div
      data-tp-region="title"
      onClick={() => openRegion("title")}
      className={regionClass}
    >
      {listing.title.trim() ? (
        <p
          className={cn(
            "line-clamp-2 text-[15px] leading-snug font-semibold break-words",
            onDark ? "text-white" : "text-foreground",
          )}
        >
          {listing.title}
        </p>
      ) : required.includes("title") ? (
        ghost("title", "Add a title", onDark)
      ) : (
        <p className="text-[15px] leading-snug font-semibold text-ink-3">
          Untitled plant
        </p>
      )}
    </div>
  );

  const priceNode = (onDark = false) => (
    <div
      data-tp-region="price"
      onClick={() => openRegion("price")}
      className={regionClass}
    >
      {listing.price !== null ? (
        <span
          className={cn(
            "font-mono text-[14px] font-medium tabular-nums",
            onDark ? "text-white" : "text-(--tp-accent)",
          )}
        >
          <span className="sr-only">{shownPrice}</span>
          <Rolling text={shownPrice} dir={priceDir} motionSafe={motionSafe} />
        </span>
      ) : required.includes("price") ? (
        ghost("price", "Add a price", onDark)
      ) : null}
    </div>
  );

  const sizeNode = (onDark = false) =>
    listing.size || required.includes("size") ? (
      <div
        data-tp-region="size"
        onClick={() => openRegion("size")}
        className={regionClass}
      >
        {listing.size ? (
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-full border px-2 text-[11px] leading-none whitespace-nowrap",
              onDark
                ? "border-white/40 text-white"
                : "border-hairline-strong text-ink-2",
            )}
          >
            <span className="relative inline-grid overflow-clip">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={listing.size}
                  className="[grid-area:1/1]"
                  initial={{ opacity: 0, y: motionSafe ? 6 : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: motionSafe ? -6 : 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? {
                          y: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  {listing.size} pot
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
        ) : (
          ghost("size", "Pot size", onDark)
        )}
      </div>
    ) : null;

  const tagsNode = (onDark = false) =>
    listing.tags.length > 0 || required.includes("tags") ? (
      <div
        ref={cardTagsRef}
        data-tp-region="tags"
        onClick={() => openRegion("tags")}
        className={cn(regionClass, "flex flex-wrap gap-1")}
      >
        {listing.tags.length === 0 ? ghost("tags", "Add a tag", onDark) : null}
        <AnimatePresence mode="popLayout" initial={false}>
          {listing.tags.map((tag) => (
            <motion.span
              key={tag}
              data-flip={tag}
              className={cn(
                "inline-flex h-5 items-center rounded-full px-2 text-[11px] leading-none whitespace-nowrap",
                onDark
                  ? "bg-[color-mix(in_oklab,black_42%,transparent)] text-white backdrop-blur-sm"
                  : "bg-(--tp-wash) text-foreground",
              )}
              initial={{ opacity: 0, scale: motionSafe ? 0.85 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: motionSafe ? 0.9 : 1,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? {
                      scale: springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            >
              {tag}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    ) : null;

  const descNode = (lines: string, onDark = false) =>
    listing.description.trim() || required.includes("description") ? (
      <div
        data-tp-region="description"
        onClick={() => openRegion("description")}
        className={regionClass}
      >
        {listing.description.trim() ? (
          <p
            className={cn(
              "text-[12px] leading-[1.45] break-words",
              lines,
              onDark ? "text-white/85" : "text-ink-2",
            )}
          >
            {listing.description}
          </p>
        ) : (
          ghost("description", "Add a description", onDark)
        )}
      </div>
    ) : null;

  const shopLine = (onDark = false) => (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          "truncate font-mono text-[10px] tracking-[0.08em] uppercase",
          onDark ? "text-white/75" : "text-ink-3",
        )}
      >
        {shop}
      </span>
      <AnimatePresence initial={false}>
        {published ? (
          <motion.span
            key="live"
            className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--success)_16%,transparent)] px-2 text-[10px] font-medium text-success"
            initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? {
                    scale: springs.recoil,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
          >
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            Live
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const basket = (
    <span
      aria-hidden
      className="mt-1 inline-flex h-8 items-center justify-center rounded-2 bg-foreground text-[12px] font-medium text-background"
    >
      Add to basket
    </span>
  );

  const cardBody =
    status === "loading" ? (
      <div aria-hidden className="flex flex-col gap-3 p-3">
        <div className="aspect-[4/3] w-full rounded-2 bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-3 w-3/4 rounded-full bg-surface-2" />
        <div className="h-3 w-1/3 rounded-full bg-surface-2" />
        <div className="h-3 w-1/2 rounded-full bg-surface-2" />
      </div>
    ) : cardStyle === "row" ? (
      <div className="flex gap-3 p-3">
        <div className="size-24 shrink-0">{coverBody("rounded-2")}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {shopLine()}
          {titleNode()}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {priceNode()}
            {sizeNode()}
          </div>
          {tagsNode()}
          {descNode("line-clamp-2")}
        </div>
      </div>
    ) : cardStyle === "poster" ? (
      <div className="relative aspect-[4/5] w-full">
        {coverBody("")}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-[oklch(0.16_0.02_258/0.88)] to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-start gap-2 p-3">
          <div className="min-w-0 flex-1">{tagsNode(true)}</div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3">
          {shopLine(true)}
          {titleNode(true)}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {priceNode(true)}
            {sizeNode(true)}
          </div>
          {descNode("line-clamp-2", true)}
        </div>
      </div>
    ) : (
      <div className="flex flex-col">
        <div className="aspect-[4/3] w-full">{coverBody("")}</div>
        <div className="flex flex-col gap-1.5 p-3">
          {shopLine()}
          {titleNode()}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            {priceNode()}
            {sizeNode()}
          </div>
          {tagsNode()}
          {descNode("line-clamp-3")}
          {basket}
        </div>
      </div>
    );

  const card = (
    <figure
      aria-label={`Preview: ${listing.title.trim() || "untitled listing"}${shownPrice ? `, ${shownPrice}` : ""}`}
      className="m-0 mx-auto w-full max-w-[20rem]"
    >
      <div
        ref={cardRef}
        className={cn(
          "relative isolate overflow-hidden rounded-3 border border-hairline bg-card shadow-[0_8px_24px_color-mix(in_oklab,black_10%,transparent)] transition-colors",
          attempted &&
            missing.length > 0 &&
            "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]",
        )}
      >
        {cardBody}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 rounded-2 bg-(--tp-wash) ring-1 ring-(--tp-line)"
          style={{
            x: cardLens.x,
            y: cardLens.y,
            width: cardLens.w,
            height: cardLens.h,
            opacity: cardLens.o,
          }}
        />
        <span
          ref={rippleRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 size-0 border-2 border-(--tp-line) bg-(--tp-wash) opacity-0"
        />
      </div>
    </figure>
  );

  /* ------------------------------- the form ------------------------------ */

  const errorFor = (field: TwinPreviewFieldId): string | null => {
    if (field === "price" && priceBad && (priceTouched || attempted)) {
      return "Use a number, like 24.00";
    }
    return flagged(field) ? MISSING[field] : null;
  };

  const fieldShell = (
    field: TwinPreviewFieldId,
    labelFor: string | undefined,
    children: React.ReactNode,
    extra?: React.ReactNode,
  ) => {
    const error = errorFor(field);
    const labelId = `${uid}-${field}-label`;
    return (
      <div
        data-tp-field={field}
        onFocus={() => activate(field)}
        className="relative flex flex-col gap-1.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <label
            id={labelId}
            htmlFor={labelFor}
            className="text-[12px] font-medium text-foreground"
          >
            {LABEL[field]}
            {required.includes(field) ? (
              <span className="text-ink-3"> · required</span>
            ) : null}
          </label>
          {extra}
        </div>
        {children}
        {error ? (
          <p
            id={`${uid}-${field}-error`}
            className="flex items-center gap-1.5 text-[12px] text-danger"
          >
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    );
  };

  const describedBy = (field: TwinPreviewFieldId, hint?: string) => {
    const ids = [hint, errorFor(field) ? `${uid}-${field}-error` : undefined]
      .filter(Boolean)
      .join(" ");
    return ids || undefined;
  };

  const inputClass = cn(
    "h-9 w-full rounded-2 border bg-surface-1 px-3 text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
    FIELD_RING,
  );
  const border = (field: TwinPreviewFieldId) =>
    errorFor(field) ? "border-danger/70" : "border-hairline-strong";

  const photosField = fieldShell(
    "photos",
    undefined,
    <>
      <p id={photoHintId} className="sr-only">
        Left and Right move between photos. Shift with Left or Right moves the
        photo. Enter makes it the cover. Delete removes it.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {/* A layout root: the thumbs glide when they trade places, not
            when something above the list moves the whole form. */}
        <ul
          ref={photoListRef}
          role="list"
          aria-labelledby={`${uid}-photos-label`}
          className="relative flex flex-wrap items-center gap-2"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {listing.photos.map((photo, i) => {
              const up = uploads[photo.id];
              return (
                <motion.li
                  key={photo.id}
                  data-flip={photo.id}
                  className="group/twin-preview-photo relative"
                  initial={
                    fresh === photo.id
                      ? { opacity: 0, scale: motionSafe ? 0.85 : 1 }
                      : false
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: motionSafe ? 0.85 : 1,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? {
                          scale: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <button
                    type="button"
                    data-tp-photo={photo.id}
                    tabIndex={tabbablePhoto === photo.id ? 0 : -1}
                    aria-label={`Photo ${i + 1} of ${listing.photos.length}${i === 0 ? ", cover" : ""}: ${photo.alt}${up?.state === "running" ? `, uploading ${Math.round(up.progress * 100)}%` : up?.state === "failed" ? ", upload failed" : ""}`}
                    aria-describedby={photoHintId}
                    aria-disabled={locked || undefined}
                    onFocus={() => setPhotoTab(photo.id)}
                    onClick={() => {
                      if (!locked && i > 0) movePhoto(photo.id, 0);
                    }}
                    onKeyDown={(event) => {
                      if (locked) return;
                      const idx = listing.photos.findIndex(
                        (p) => p.id === photo.id,
                      );
                      const step =
                        event.key === "ArrowRight"
                          ? 1
                          : event.key === "ArrowLeft"
                            ? -1
                            : 0;
                      if (step !== 0) {
                        event.preventDefault();
                        if (event.shiftKey) {
                          movePhoto(photo.id, idx + step);
                        } else {
                          const to = listing.photos[idx + step];
                          if (to) {
                            setPhotoTab(to.id);
                            setPhotoFocus((f) => ({
                              id: to.id,
                              n: (f?.n ?? 0) + 1,
                            }));
                          }
                        }
                      } else if (event.key === "Home" || event.key === "End") {
                        event.preventDefault();
                        const to =
                          event.key === "Home"
                            ? listing.photos[0]
                            : listing.photos[listing.photos.length - 1];
                        if (to) {
                          setPhotoTab(to.id);
                          setPhotoFocus((f) => ({
                            id: to.id,
                            n: (f?.n ?? 0) + 1,
                          }));
                        }
                      } else if (
                        event.key === "Delete" ||
                        event.key === "Backspace"
                      ) {
                        event.preventDefault();
                        removePhoto(photo.id);
                      }
                    }}
                    className={cn(
                      "relative block size-14 overflow-hidden rounded-2 border transition-colors",
                      i === 0
                        ? "border-(--tp-accent)"
                        : "border-hairline-strong hover:border-ink-3",
                      FOCUS_RING,
                    )}
                  >
                    <PlantArt photo={photo} />
                    {i === 0 ? (
                      <span className="absolute inset-x-0 bottom-0 bg-[color-mix(in_oklab,black_45%,transparent)] py-px text-center font-mono text-[9px] tracking-[0.08em] text-white uppercase">
                        Cover
                      </span>
                    ) : null}
                    {up && up.state !== "done" ? (
                      <span
                        className={cn(
                          "absolute inset-0 flex items-center justify-center",
                          up.state === "failed"
                            ? "bg-[color-mix(in_oklab,var(--danger)_60%,black_15%)] text-white"
                            : "bg-[color-mix(in_oklab,black_40%,transparent)]",
                        )}
                      >
                        {up.state === "failed" ? (
                          <TriangleAlert aria-hidden className="size-4" />
                        ) : (
                          <Ring value={up.progress} motionSafe={motionSafe} />
                        )}
                      </span>
                    ) : null}
                  </button>
                  {/* Pointer shortcut only: the photo's own Delete key is
                      the keyboard path, so this stays out of the tab order. */}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => {
                      if (!locked) removePhoto(photo.id);
                    }}
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-hairline-strong bg-popover text-ink-2 opacity-0 shadow-sm transition-opacity group-focus-within/twin-preview-photo:opacity-100 group-hover/twin-preview-photo:opacity-100 hover:text-foreground"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        <button
          type="button"
          data-tp-control="photos"
          aria-disabled={locked || !nextShot || undefined}
          aria-describedby={describedBy("photos")}
          onClick={addPhoto}
          className={cn(
            "flex size-14 flex-col items-center justify-center gap-0.5 rounded-2 border border-dashed text-[10px] transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
            errorFor("photos")
              ? "border-danger/70 text-danger"
              : "border-hairline-strong text-ink-2 hover:border-(--tp-accent) hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <Plus aria-hidden className="size-4" />
          Add
          <span className="sr-only">
            {" "}
            photo{nextShot ? `: ${nextShot.alt}` : ", the library is empty"}
          </span>
        </button>
      </div>
      {failedUploads.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-danger">
          <span>
            {plural(failedUploads.length, "photo", "photos")} didn&apos;t
            upload.
          </span>
          <button
            type="button"
            onClick={() => {
              for (const [id] of failedUploads) {
                const photo = listing.photos.find((p) => p.id === id);
                if (photo) startUpload(photo);
              }
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Retry
          </button>
        </div>
      ) : null}
    </>,
    <span className="text-[11px] text-ink-3">The first is the cover</span>,
  );

  const titleField = fieldShell(
    "title",
    `${uid}-title`,
    <input
      id={`${uid}-title`}
      data-tp-control="title"
      value={listing.title}
      maxLength={TITLE_MAX}
      disabled={locked}
      placeholder="What customers will search for"
      aria-invalid={errorFor("title") ? true : undefined}
      aria-describedby={describedBy("title")}
      onChange={(event) => {
        const text = event.currentTarget.value;
        commit({ ...listing, title: text }, "title");
      }}
      className={cn(inputClass, border("title"))}
    />,
    <span className="font-mono text-[11px] text-ink-3 tabular-nums">
      {listing.title.length}/{TITLE_MAX}
    </span>,
  );

  const priceField = fieldShell(
    "price",
    `${uid}-price`,
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[13px] text-ink-3"
      >
        {symbol}
      </span>
      <input
        id={`${uid}-price`}
        data-tp-control="price"
        value={priceDraft}
        inputMode="decimal"
        disabled={locked}
        placeholder="0.00"
        aria-invalid={errorFor("price") ? true : undefined}
        aria-describedby={describedBy("price")}
        onChange={(event) => {
          const text = event.currentTarget.value;
          setPriceDraft(text);
          const n = parsePrice(text);
          if (n === null || !Number.isNaN(n)) {
            if (n !== listing.price) {
              setPriceDir((n ?? 0) >= (listing.price ?? 0) ? 1 : -1);
              setPriceSeen(n);
              commit({ ...listing, price: n }, "price");
            }
          }
        }}
        onBlur={() => {
          setPriceTouched(true);
          if (!priceBad) setPriceDraft(priceText(listing.price));
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const base = listing.price ?? 0;
          const step =
            (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
          const n = Math.max(0, Math.round((base + step) * 100) / 100);
          setPriceDraft(priceText(n));
          setPriceDir(step > 0 ? 1 : -1);
          setPriceSeen(n);
          commit({ ...listing, price: n }, "price");
        }}
        className={cn(
          inputClass,
          border("price"),
          "pl-7 font-mono tabular-nums",
        )}
      />
    </div>,
  );

  const sizeIndex = sizes.indexOf(listing.size);
  const sizeField = fieldShell(
    "size",
    undefined,
    <div
      role="radiogroup"
      aria-labelledby={`${uid}-size-label`}
      aria-describedby={describedBy("size")}
      className="relative grid auto-cols-fr grid-flow-col gap-1 rounded-2 border border-hairline bg-surface-1 p-1"
    >
      {sizes.map((size, i) => {
        const on = listing.size === size;
        const tabbable = sizeIndex === -1 ? i === 0 : on;
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={locked || undefined}
            tabIndex={tabbable ? 0 : -1}
            data-tp-control={tabbable ? "size" : undefined}
            onClick={() => {
              if (!on) {
                commit({ ...listing, size }, "size");
                say(`Pot size ${size}.`);
              }
            }}
            onKeyDown={(event) => {
              const keys: Record<string, number> = {
                ArrowRight: i + 1,
                ArrowDown: i + 1,
                ArrowLeft: i - 1,
                ArrowUp: i - 1,
                Home: 0,
                End: sizes.length - 1,
              };
              const to = keys[event.key];
              if (to === undefined) return;
              event.preventDefault();
              const target = (to + sizes.length) % sizes.length;
              const next = sizes[target];
              if (!next || locked) return;
              commit({ ...listing, size: next }, "size");
              say(`Pot size ${next}.`);
              const group = event.currentTarget.parentElement;
              group
                ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                [target]?.focus();
            }}
            className={cn(
              "relative inline-flex h-7 items-center justify-center rounded-[5px] px-2 text-[12px] font-medium whitespace-nowrap transition-colors",
              on ? "text-foreground" : "text-ink-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-size-pill`}
                aria-hidden
                className="absolute inset-0 rounded-[5px] border border-(--tp-line) bg-card shadow-sm"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative">{size}</span>
          </button>
        );
      })}
    </div>,
  );

  const suggestions = suggestedTags.filter(
    (t) => !listing.tags.some((x) => x.toLowerCase() === t.toLowerCase()),
  );
  const tagsField = fieldShell(
    "tags",
    `${uid}-tags`,
    <>
      <p id={tagHintId} className="sr-only">
        Enter or a comma adds the tag. Backspace in an empty field removes the
        last one.
      </p>
      <div
        ref={tagListRef}
        className={cn(
          "relative flex flex-wrap items-center gap-1.5 rounded-2 border bg-surface-1 p-1.5 transition-colors focus-within:border-(--tp-line)",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-1 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
          border("tags"),
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {listing.tags.map((tag) => (
            <motion.span
              key={tag}
              data-flip={tag}
              className="inline-flex h-6 items-center gap-1 rounded-full bg-(--tp-wash) pr-0.5 pl-2 text-[12px] text-foreground"
              initial={{ opacity: 0, scale: motionSafe ? 0.85 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: motionSafe ? 0.9 : 1,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? {
                      scale: springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                disabled={locked}
                onClick={() => removeTag(tag)}
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          id={`${uid}-tags`}
          data-tp-control="tags"
          value={tagDraft}
          disabled={locked || listing.tags.length >= TAG_MAX}
          maxLength={TAG_LEN + 1}
          placeholder={
            listing.tags.length >= TAG_MAX
              ? "Six tags is the most"
              : "Add a tag"
          }
          aria-invalid={errorFor("tags") ? true : undefined}
          aria-describedby={describedBy("tags", tagHintId)}
          onChange={(event) => {
            const text = event.currentTarget.value;
            if (text.includes(",")) {
              const parts = text.split(",");
              const rest = parts.pop() ?? "";
              addTags(parts);
              setTagDraft(rest);
            } else setTagDraft(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (addTags([tagDraft])) setTagDraft("");
            } else if (
              event.key === "Backspace" &&
              tagDraft === "" &&
              listing.tags.length > 0
            ) {
              event.preventDefault();
              const last = listing.tags[listing.tags.length - 1];
              if (last) removeTag(last);
            }
          }}
          className="h-6 min-w-[6rem] flex-1 bg-transparent px-1 text-[13px] text-foreground outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
      </div>
      {suggestions.length > 0 && listing.tags.length < TAG_MAX ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              disabled={locked}
              onClick={() => addTags([t])}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-hairline-strong px-2 text-[11px] text-ink-2 transition-colors hover:border-(--tp-line) hover:text-foreground disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              <Plus aria-hidden className="size-3" />
              {t}
            </button>
          ))}
        </div>
      ) : null}
    </>,
    <span className="font-mono text-[11px] text-ink-3 tabular-nums">
      {listing.tags.length}/{TAG_MAX}
    </span>,
  );

  const descField = fieldShell(
    "description",
    `${uid}-desc`,
    <textarea
      id={`${uid}-desc`}
      data-tp-control="description"
      value={listing.description}
      rows={3}
      maxLength={DESC_MAX}
      disabled={locked}
      placeholder="Light, water, how it grows"
      aria-invalid={errorFor("description") ? true : undefined}
      aria-describedby={describedBy("description")}
      onChange={(event) => {
        const text = event.currentTarget.value;
        commit({ ...listing, description: text }, "description");
      }}
      className={cn(
        "w-full resize-none rounded-2 border bg-surface-1 px-3 py-2 text-[13px] leading-5 text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
        border("description"),
        FIELD_RING,
      )}
    />,
    <span className="font-mono text-[11px] text-ink-3 tabular-nums">
      {listing.description.length}/{DESC_MAX}
    </span>,
  );

  const banner =
    attempted && missing.length > 0 ? (
      <div className="flex flex-col gap-1.5 rounded-3 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))] px-3 py-2.5 text-[12px]">
        <p className="flex items-center gap-1.5 font-medium text-danger">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {plural(missing.length, "field needs", "fields need")} attention
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {missing.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => focusField(f)}
              className={cn(
                "rounded-1 text-left text-[12px] text-foreground underline decoration-danger/50 underline-offset-2 hover:decoration-danger",
                FOCUS_RING,
              )}
            >
              {MISSING[f]}
            </button>
          ))}
        </div>
      </div>
    ) : publish === "failed" ? (
      <div className="flex items-center gap-2 rounded-3 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))] px-3 py-2.5 text-[12px] text-danger">
        <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
        It didn&apos;t publish. Nothing was lost; try again.
      </div>
    ) : null;

  const form =
    status === "loading" ? (
      <div aria-hidden className="flex flex-col gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <span className="h-2.5 w-20 rounded-full bg-surface-2" />
            <span
              className={cn(
                "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                i === 0 ? "h-14 w-32" : "h-9 w-full",
              )}
            />
          </div>
        ))}
      </div>
    ) : (
      <>
        {banner}
        {photosField}
        {titleField}
        <div className="grid grid-cols-1 gap-5 @min-[24rem]/twin-preview-form:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
          {priceField}
          {sizeField}
        </div>
        {tagsField}
        {descField}
      </>
    );

  const peekLabel = `${peekOpen ? "Hide" : "Show"} preview: ${listing.title.trim() || "untitled listing"}${shownPrice ? `, ${shownPrice}` : ""}`;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={headingId}
      aria-busy={status === "loading" || undefined}
      onKeyDown={onRootKeyDown}
      className={cn(
        "@container/twin-preview relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--tp-accent" as string]: accent,
        ["--tp-wash" as string]: `color-mix(in oklab, ${accent} 9%, transparent)`,
        ["--tp-line" as string]: `color-mix(in oklab, ${accent} 45%, transparent)`,
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-[8rem] flex-1">
          <p id={headingId} className="truncate text-sm font-semibold">
            {heading}
          </p>
          <div className="relative h-4 overflow-clip text-[11px] text-ink-3">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.p
                key={chip.text}
                className="flex items-center gap-1.5 truncate"
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe && chip.text === "Published"
                    ? {
                        y: springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.base, ease: easings.enter }
                }
              >
                <span
                  aria-hidden
                  className={cn("size-1.5 shrink-0 rounded-full", chipDot)}
                />
                <span className="truncate">
                  {shop} · {chip.text}
                </span>
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-disabled={locked || draft === "pending" || undefined}
            aria-busy={draft === "pending" || undefined}
            aria-keyshortcuts="Control+S Meta+S"
            onClick={saveDraft}
            className={cn(
              "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50 aria-disabled:hover:bg-transparent",
              FOCUS_RING,
            )}
          >
            {draft === "pending" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            aria-disabled={locked || publish === "pending" || undefined}
            aria-busy={publish === "pending" || undefined}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onClick={publishNow}
            className={cn(
              "relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-2 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90 aria-disabled:opacity-50",
              FOCUS_RING,
            )}
            style={{ backgroundColor: "oklch(from var(--tp-accent) 0.52 c h)" }}
          >
            {publish === "pending" ? (
              <motion.span
                aria-hidden
                className="size-3 rounded-full border-2 border-white/40 border-t-white"
                animate={motionSafe ? { rotate: 360 } : { rotate: 0 }}
                transition={
                  motionSafe
                    ? { duration: 0.8, ease: "linear", repeat: Infinity }
                    : { duration: 0 }
                }
              />
            ) : null}
            {publish === "pending"
              ? "Publishing"
              : published
                ? "Update"
                : "Publish"}
          </button>
        </div>
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            This listing didn&apos;t load.
          </p>
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
      ) : (
        <div ref={bodyRef} className="relative flex-1 overflow-hidden">
          <div
            className={cn(
              "h-full",
              side &&
                (layout === "mirror"
                  ? "@min-[36rem]/twin-preview:grid @min-[36rem]/twin-preview:grid-cols-[17.5rem_minmax(0,1fr)] @min-[64rem]/twin-preview:grid-cols-[20rem_minmax(0,1fr)]"
                  : "@min-[36rem]/twin-preview:grid @min-[36rem]/twin-preview:grid-cols-[minmax(0,1fr)_17.5rem] @min-[64rem]/twin-preview:grid-cols-[minmax(0,1fr)_20rem]"),
            )}
          >
            <div
              ref={scrollerRef}
              onScroll={(event) => scroll.set(event.currentTarget.scrollTop)}
              onBlur={(event) => {
                const to = event.relatedTarget;
                if (!(to instanceof Node && event.currentTarget.contains(to))) {
                  activate(null);
                }
              }}
              className={cn(
                "relative h-full [scrollbar-width:thin] overflow-y-auto overscroll-contain",
                side &&
                  layout === "mirror" &&
                  "@min-[36rem]/twin-preview:order-2",
              )}
            >
              <div
                ref={contentRef}
                className={cn(
                  "@container/twin-preview-form relative flex flex-col gap-5 px-4 pt-4",
                  side ? "pb-16 @min-[36rem]/twin-preview:pb-6" : "pb-16",
                )}
              >
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 rounded-3 bg-(--tp-wash) ring-1 ring-(--tp-line)"
                  style={{
                    x: formLens.x,
                    y: formLens.y,
                    width: formLens.w,
                    height: formLens.h,
                    opacity: formLens.o,
                  }}
                />
                {form}
              </div>
            </div>

            <div
              className={cn(
                "absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-4 border-t border-hairline-strong bg-popover shadow-[0_-10px_30px_color-mix(in_oklab,black_16%,transparent)]",
                side &&
                  "@min-[36rem]/twin-preview:static @min-[36rem]/twin-preview:z-auto @min-[36rem]/twin-preview:h-full @min-[36rem]/twin-preview:overflow-hidden @min-[36rem]/twin-preview:rounded-none @min-[36rem]/twin-preview:border-t-0 @min-[36rem]/twin-preview:bg-surface-1 @min-[36rem]/twin-preview:shadow-none",
                side &&
                  (layout === "mirror"
                    ? "@min-[36rem]/twin-preview:order-1 @min-[36rem]/twin-preview:border-r @min-[36rem]/twin-preview:border-hairline"
                    : "@min-[36rem]/twin-preview:border-l @min-[36rem]/twin-preview:border-hairline"),
              )}
            >
              <button
                type="button"
                aria-expanded={peekOpen}
                aria-controls={sheetId}
                aria-label={peekLabel}
                onClick={() => setPeekOpen((o) => !o)}
                className={cn(
                  "relative flex w-full shrink-0 items-center gap-3 px-4 pt-2 text-left",
                  side && "@min-[36rem]/twin-preview:hidden",
                  FOCUS_RING,
                )}
                style={{ height: TAB_H }}
              >
                <span
                  aria-hidden
                  className="absolute top-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-hairline-strong"
                />
                <span
                  aria-hidden
                  className="relative size-8 shrink-0 overflow-hidden rounded-2 border border-hairline bg-surface-2"
                >
                  {cover ? <PlantArt photo={cover} /> : null}
                </span>
                <span aria-hidden className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] leading-4 font-medium text-foreground">
                    {listing.title.trim() || "Untitled listing"}
                  </span>
                  <span className="truncate font-mono text-[11px] leading-4 text-ink-3 tabular-nums">
                    {shownPrice || "No price"} · Preview
                  </span>
                </span>
                <span
                  ref={dotRef}
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-(--tp-accent)"
                />
                <motion.span
                  aria-hidden
                  className="inline-flex shrink-0 text-ink-2"
                  initial={false}
                  animate={{ rotate: peekOpen ? 180 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                >
                  <ChevronUp className="size-4" />
                </motion.span>
              </button>
              <motion.div
                id={sheetId}
                ref={columnRef}
                aria-hidden={narrow && !peekOpen ? true : undefined}
                initial={false}
                animate={{
                  height: peekOpen ? panelH : 0,
                  opacity: peekOpen || !narrow ? 1 : 0,
                }}
                transition={
                  motionSafe
                    ? {
                        height: springs.glide,
                        opacity: { duration: durations.base },
                      }
                    : { duration: durations.fast }
                }
                onScroll={(event) =>
                  colScroll.set(event.currentTarget.scrollTop)
                }
                className={cn(
                  "[scrollbar-width:thin] overflow-y-auto overscroll-contain",
                  side &&
                    "@min-[36rem]/twin-preview:h-full! @min-[36rem]/twin-preview:opacity-100!",
                )}
              >
                <div
                  ref={cardInnerRef}
                  className="px-4 pt-1 pb-4 @min-[36rem]/twin-preview:pt-4"
                >
                  <p
                    aria-hidden
                    className={cn(
                      "mb-2 hidden font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
                      side && "@min-[36rem]/twin-preview:block",
                    )}
                  >
                    Live preview
                  </p>
                  {card}
                </div>
              </motion.div>
            </div>
          </div>

          {side ? (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 hidden size-full overflow-visible @min-[36rem]/twin-preview:block"
            >
              <motion.path
                d={tetherD}
                fill="none"
                stroke="var(--tp-accent)"
                strokeWidth={1.25}
                strokeLinecap="round"
                style={{ opacity: tetherOpacity }}
              />
              <motion.circle
                cx={startX}
                cy={startY}
                r={2.5}
                fill="var(--tp-accent)"
                style={{ opacity: dotOpacity }}
              />
              <motion.circle
                cx={endX}
                cy={endY}
                r={2.5}
                fill="var(--tp-accent)"
                style={{ opacity: dotOpacity }}
              />
            </svg>
          ) : null}
        </div>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
