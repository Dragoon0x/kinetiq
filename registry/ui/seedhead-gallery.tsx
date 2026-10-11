"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SeedheadGalleryItem = {
  /** An image URL. Without one, a picture is drawn in code. */
  src?: string;
  /** What the picture shows. */
  alt: string;
  /** A short title, shown beside a seed when it is enlarged. */
  caption?: string;
};

export type SeedheadGalleryProps = {
  /** The pictures, oldest first: the first sits at the rim, the newest at the core (up to 233). @default 89 drawn pictures */
  items?: SeedheadGalleryItem[];
  /** The divergence between one seed and the next, degrees; 137.5 is the golden angle. @default 137.5 */
  angle?: number;
  /** How much of the head has emerged at rest, 0.1 to 1. @default 0.6 */
  growth?: number;
  /** Tile size, as a share of the room each seed has, 0.5 to 1.5. @default 1 */
  scale?: number;
  /** How far scrolling the page past the head grows it toward full, 0 (not at all) to 1. @default 1 */
  scrollGrowth?: number;
  /** The enlarged seed held by a click or Enter (controlled), or null. */
  value?: number | null;
  /** The held seed to begin with. @default null */
  defaultValue?: number | null;
  /** Fires from the click or key that held a seed or let it go. */
  onValueChange?: (index: number | null) => void;
  /** How large a hovered or focused seed grows, px. @default 96 */
  zoom?: number;
  /** How dense the core is, 0 (even, a plain sunflower) to 1 (tiny at the core, large at the rim). @default 0.7 */
  spread?: number;
  /** Show a caption beside the enlarged seed. @default true */
  captions?: boolean;
  /** What starts the first growth: coming into view, or mounting. @default "inView" */
  trigger?: "inView" | "mount";
  /** The head's accessible name. @default "Seed head of pictures" */
  label?: string;
  /** No growing, hovering or holding. @default false */
  disabled?: boolean;
  /** Sizes the piece; it fills its parent by default (h-full w-full). */
  className?: string;
};

const MAX_SEEDS = 233;

const PLACES = [
  "Salt",
  "North",
  "Low",
  "Pine",
  "Dune",
  "Night",
  "Fog",
  "Amber",
  "Quiet",
  "Upper",
  "Far",
  "Still",
  "Glass",
];
const THINGS = [
  "flats",
  "ridge",
  "tide",
  "hollow",
  "sea",
  "ferry",
  "bank",
  "coast",
  "fen",
  "field",
  "islands",
  "water",
  "orchard",
];
const SCENES = [
  "a pale salt flat under a wide sky",
  "green ridges in haze",
  "shallow water at low tide",
  "dark wooded hills",
  "warm dunes under a high sun",
  "a light on a dark sea",
  "a bank of fog over a shore",
];

/** 89 seeds of drawn pictures, named and described, the same everywhere. */
export const defaultSeedheadItems: SeedheadGalleryItem[] = Array.from(
  { length: 89 },
  (_, k) => {
    const place = PLACES[k % PLACES.length] ?? "Far";
    const thing = THINGS[(k * 5 + 3) % THINGS.length] ?? "field";
    const scene = SCENES[kindOf(k)] ?? SCENES[0] ?? "";
    return {
      caption: `${place} ${thing}`,
      alt: `Variety ${k + 1}: ${scene}`,
    };
  },
);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
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

/**
 * Seeds 21 apart sit on the same arm of the outer spirals, so a picture's kind
 * follows its index modulo 21 in runs: the arms come out in bands of colour.
 */
function kindOf(k: number): number {
  return Math.floor(((k % 21) / 21) * 7);
}

/** A pigment from a token's hue at a fixed lightness: the same in both themes. */
const tone = (token: string, l: number, c: number, turn = 0, alpha = 1) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn})${alpha < 1 ? ` / ${alpha}` : ""})`;

/** A small landscape in gradients, legible as a colour even at a few pixels. */
function seedArt(k: number): string {
  const kind = kindOf(k);
  const r = (n: number) => hash(k + 101, 7, n);
  const sx = Math.round(26 + r(1) * 48);
  const sy = Math.round(22 + r(2) * 14);
  const tw = Math.round((r(3) - 0.5) * 30);
  const sun = `radial-gradient(circle at ${sx}% ${sy}%, ${tone("--warn", 0.97, 0.05)} 0 6%, ${tone("--warn", 0.9, 0.08, 0, 0.45)} 7%, transparent 20%)`;
  switch (kind) {
    case 0:
      return [
        `linear-gradient(to bottom, transparent 62%, ${tone("--accent", 0.42, 0.03, tw)} 62% 64%, transparent 64%)`,
        sun,
        `linear-gradient(to bottom, ${tone("--accent", 0.76, 0.05, tw)}, ${tone("--accent", 0.93, 0.02, tw)} 62%, ${tone("--warn", 0.86, 0.03, tw)} 64%)`,
      ].join(", ");
    case 1:
      return [
        `radial-gradient(90% 46% at 30% 100%, ${tone("--success", 0.4, 0.07, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(100% 44% at 70% 86%, ${tone("--success", 0.6, 0.05, tw + 30)} 0 98%, transparent 100%)`,
        sun,
        `linear-gradient(to bottom, ${tone("--accent", 0.74, 0.07, tw)}, ${tone("--success", 0.9, 0.04, tw + 60)} 80%)`,
      ].join(", ");
    case 2:
      return [
        `linear-gradient(to bottom, transparent 52%, ${tone("--accent", 0.56, 0.06, tw)} 52%, ${tone("--accent", 0.66, 0.05, tw)} 70%, ${tone("--warn", 0.72, 0.05, tw)} 72%, ${tone("--warn", 0.58, 0.06, tw)} 100%)`,
        sun,
        `linear-gradient(to bottom, ${tone("--accent", 0.7, 0.06, tw)}, ${tone("--accent", 0.88, 0.04, tw)} 52%)`,
      ].join(", ");
    case 3:
      return [
        `radial-gradient(80% 50% at 25% 100%, ${tone("--success", 0.26, 0.05, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(90% 56% at 80% 100%, ${tone("--success", 0.36, 0.05, tw + 20)} 0 98%, transparent 100%)`,
        sun,
        `linear-gradient(to bottom, ${tone("--warn", 0.82, 0.06, tw - 20)}, ${tone("--success", 0.76, 0.04, tw + 40)} 70%)`,
      ].join(", ");
    case 4:
      return [
        `radial-gradient(90% 40% at 30% 100%, ${tone("--danger", 0.56, 0.1, tw + 30)} 0 98%, transparent 100%)`,
        `radial-gradient(110% 40% at 60% 86%, ${tone("--warn", 0.74, 0.1, tw)} 0 98%, transparent 100%)`,
        sun,
        `linear-gradient(to bottom, ${tone("--accent", 0.72, 0.06, tw)}, ${tone("--warn", 0.9, 0.05, tw)} 75%)`,
      ].join(", ");
    case 5:
      return [
        `radial-gradient(circle at ${sx}% 64%, ${tone("--warn", 0.94, 0.12)} 0 3%, ${tone("--warn", 0.8, 0.14, 0, 0.5)} 5%, transparent 12%)`,
        `radial-gradient(circle at ${100 - sx}% ${sy}%, ${tone("--warn", 0.95, 0.03)} 0 7%, transparent 18%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.18, 0.05, tw)}, ${tone("--accent", 0.32, 0.08, tw)} 62%, ${tone("--accent", 0.2, 0.05, tw)} 62%)`,
      ].join(", ");
    default:
      return [
        `linear-gradient(to bottom, transparent 46%, ${tone("--accent", 0.84, 0.01, tw, 0.8)} 58%, transparent 72%)`,
        `radial-gradient(90% 36% at 70% 76%, ${tone("--accent", 0.62, 0.02, tw)} 0 50%, transparent 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.86, 0.012, tw)}, ${tone("--accent", 0.76, 0.015, tw)})`,
      ].join(", ");
  }
}

type Geo = {
  w: number;
  h: number;
  /** The head's full radius, px. */
  R: number;
  /** The rim tile's diameter at full growth, px: every seed is drawn this size and scaled. */
  rim: number;
  /** The drawn size of a seed element, px (the larger of the rim and the zoom). */
  base: number;
  p: number;
  /** The tile scale. */
  s: number;
  cx: number;
  cy: number;
  zoom: number;
};

function geometryOf(
  w: number,
  h: number,
  n: number,
  scale: number,
  spread: number,
  zoom: number,
): Geo {
  const p = lerp(0.5, 0.95, clamp(spread, 0, 1));
  const s = clamp(scale, 0.5, 1.5);
  const k = Math.sqrt((2 * Math.PI * p) / Math.max(1, n)) * 0.94 * s;
  const half = Math.min(w, h) / 2 - 8;
  const R = Math.max(10, half / (1 + k / 2));
  const rim = R * k;
  const z = Math.round(clamp(zoom, 32, Math.min(w, h) * 0.6));
  return {
    w,
    h,
    R: r2(R),
    rim: r2(rim),
    base: Math.round(Math.max(rim, z)),
    p,
    s,
    cx: Math.round(w / 2),
    cy: Math.round(h / 2),
    zoom: z,
  };
}

/** Seed `k`'s pose for `E` emerged seeds at divergence `deg`. */
function poseOf(k: number, E: number, deg: number, n: number, geo: Geo) {
  const age = E - k;
  if (age <= 0) return { x: 0, y: 0, d: 0, r: 0 };
  const t = clamp(age / n, 0, 1);
  const r = geo.R * Math.pow(t, geo.p);
  const a = (k * deg * Math.PI) / 180;
  // The tile fills the area its ring of the spiral gives it.
  const area =
    (2 * Math.PI * geo.R * geo.R * geo.p * Math.pow(t, 2 * geo.p - 1)) / n;
  // A new seed swells from nothing over its first step of age.
  const g = clamp(age, 0, 1);
  const d = Math.sqrt(area) * 0.94 * geo.s * g * g * (3 - 2 * g);
  return { x: r * Math.cos(a), y: r * Math.sin(a), d: Math.max(0, d), r };
}

type SeedProps = {
  index: number;
  item: SeedheadGalleryItem;
  geo: Geo;
  n: number;
  E: MotionValue<number>;
  deg: MotionValue<number>;
  active: boolean;
  dimmed: boolean;
  held: boolean;
  emerged: number;
  tabbable: boolean;
  disabled: boolean;
  motionSafe: boolean;
  register: (index: number, node: HTMLButtonElement | null) => void;
  onEnter: (index: number, on: boolean) => void;
  onFocusSeed: (index: number, visible: boolean) => void;
  onActivate: (index: number) => void;
  onKeyDown: (index: number, event: React.KeyboardEvent) => void;
};

function Seed({
  index,
  item,
  geo,
  n,
  E,
  deg,
  active,
  dimmed,
  held,
  emerged,
  tabbable,
  disabled,
  motionSafe,
  register,
  onEnter,
  onFocusSeed,
  onActivate,
  onKeyDown,
}: SeedProps) {
  const lift = useMotionValue(active ? 1 : 0);
  const fade = useMotionValue(dimmed ? 0.6 : 1);
  React.useEffect(() => {
    const target = active ? 1 : 0;
    if (!motionSafe) {
      lift.jump(target);
      return;
    }
    const c = animate(lift, target, springs.snap);
    return () => c.stop();
  }, [active, motionSafe, lift]);
  React.useEffect(() => {
    const c = animate(fade, dimmed ? 0.6 : 1, {
      duration: durations.base,
      ease: easings.enter,
    });
    return () => c.stop();
  }, [dimmed, fade]);

  const inputs = [E, deg, lift] as MotionValue<number>[];
  const pose = (e: unknown, d: unknown) =>
    poseOf(index, e as number, d as number, n, geo);
  const x = useTransform(inputs, ([e, d, l]) => {
    const p = pose(e, d);
    // An enlarged seed near the rim is drawn inward so it stays in the box.
    const room = Math.min(geo.w, geo.h) / 2 - geo.zoom / 2 - 6;
    const pull = p.r > room && p.r > 0 ? (1 - room / p.r) * (l as number) : 0;
    return r2(p.x * (1 - pull));
  });
  const y = useTransform(inputs, ([e, d, l]) => {
    const p = pose(e, d);
    const room = Math.min(geo.w, geo.h) / 2 - geo.zoom / 2 - 6;
    const pull = p.r > room && p.r > 0 ? (1 - room / p.r) * (l as number) : 0;
    return r2(p.y * (1 - pull));
  });
  const scale = useTransform(inputs, ([e, d, l]) => {
    const size = pose(e, d).d;
    const big = Math.max(size * 1.6, geo.zoom);
    return r3(lerp(size, big, l as number) / geo.base);
  });
  const ring = useTransform([lift, scale] as MotionValue<number>[], ([l, s]) =>
    (l as number) > 0.02
      ? `0 0 0 ${r2(2 / Math.max(0.05, s as number))}px var(--accent-bright), 0 ${r2(8 / Math.max(0.05, s as number))}px ${r2(18 / Math.max(0.05, s as number))}px color-mix(in oklab, black 40%, transparent)`
      : `0 0 0 ${r2(1 / Math.max(0.05, s as number))}px color-mix(in oklab, black 18%, transparent)`,
  );
  const ringWidth = useTransform(
    scale,
    (s) => `${r2(2 / Math.max(0.05, s))}px`,
  );
  const ringOffset = useTransform(
    scale,
    (s) => `${r2(3 / Math.max(0.05, s))}px`,
  );
  const name = item.caption ?? item.alt;
  const out = index >= emerged;
  const ref = React.useCallback(
    (node: HTMLButtonElement | null) => register(index, node),
    [index, register],
  );

  return (
    <motion.button
      ref={ref}
      type="button"
      data-seed={index}
      tabIndex={tabbable && !out ? 0 : -1}
      inert={out}
      aria-hidden={out || undefined}
      aria-label={`${name}, seed ${index + 1} of ${emerged}: ${item.alt}`}
      aria-pressed={held}
      disabled={disabled}
      onClick={(event) => {
        // A press with the pointer is handled on pointer up below; a click
        // with no pointer behind it (Enter, Space) is a press too.
        if (event.detail === 0) onActivate(index);
      }}
      onPointerUp={(event) => {
        if (event.button === 0) onActivate(index);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") onEnter(index, true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") onEnter(index, false);
      }}
      onFocus={(event) =>
        onFocusSeed(index, event.currentTarget.matches(":focus-visible"))
      }
      onKeyDown={(event) => onKeyDown(index, event)}
      className={cn(
        "absolute top-0 left-0 block overflow-hidden rounded-full outline-none",
        "focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
      style={{
        width: geo.base,
        height: geo.base,
        marginLeft: geo.cx - geo.base / 2,
        marginTop: geo.cy - geo.base / 2,
        x,
        y,
        scale,
        opacity: fade,
        zIndex: active ? 1000 : Math.round(index / 2) + 1,
        boxShadow: ring,
        outlineWidth: ringWidth,
        outlineOffset: ringOffset,
        backgroundImage: item.src ? undefined : seedArt(index),
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {item.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src}
          alt=""
          draggable={false}
          className="pointer-events-none size-full object-cover"
        />
      ) : null}
    </motion.button>
  );
}

/** The enlarged seed's caption, kept inside the box beside it. */
function Caption({
  index,
  item,
  emerged,
  geo,
  n,
  E,
  deg,
}: {
  index: number;
  item: SeedheadGalleryItem;
  emerged: number;
  geo: Geo;
  n: number;
  E: MotionValue<number>;
  deg: MotionValue<number>;
}) {
  const width = Math.min(176, geo.w - 16);
  const both = [E, deg] as MotionValue<number>[];
  const x = useTransform(both, ([e, d]) => {
    const p = poseOf(index, e as number, d as number, n, geo);
    return r2(clamp(geo.cx + p.x - width / 2, 8, geo.w - width - 8));
  });
  const y = useTransform(both, ([e, d]) => {
    const p = poseOf(index, e as number, d as number, n, geo);
    const above = geo.cy + p.y - geo.zoom / 2 - 44;
    const below = geo.cy + p.y + geo.zoom / 2 + 8;
    return r2(clamp(above >= 8 ? above : below, 8, geo.h - 44));
  });
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 flex flex-col gap-0.5 rounded-2 border border-hairline-strong bg-popover px-2.5 py-1.5 shadow-md"
      style={{ x, y, width, zIndex: 1001 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.fast, ease: easings.enter }}
    >
      <span className="truncate text-xs font-medium text-foreground">
        {item.caption ?? item.alt}
      </span>
      <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums">
        seed {index + 1} of {emerged}
      </span>
    </motion.div>
  );
}

/**
 * Pictures set like seeds in a sunflower: seed `k` is born at `k × angle`
 * (the golden angle by default) and keeps that angle, while its distance from
 * the centre grows with its age, so the core is dense and tiny and the rim
 * roomy and large, each tile sized by the area its ring of the spiral gives
 * it. The number of emerged seeds is one motion value on springs.drift: when
 * it rises, new pictures emerge at the very centre and every older seed is
 * pushed outward along its own ray, the parastichies rolling out with them.
 *
 * `growth` sets how much has emerged at rest, and scrolling the page past the
 * head grows it on toward full (and back). Hover or focus enlarges a seed in
 * place on springs.snap with its caption beside it; a click or Enter holds it.
 * Changing `angle` re-spirals the head on springs.glide. The seeds are one
 * roving tab stop: arrows walk the spiral, Home and End jump to the rim and
 * the core, + and − grow and shrink it. Under reduced motion the head is
 * shown full and still, and every change is immediate.
 */
export function SeedheadGallery({
  items,
  angle = 137.5,
  growth = 0.6,
  scale = 1,
  scrollGrowth = 1,
  value,
  defaultValue = null,
  onValueChange,
  zoom = 96,
  spread = 0.7,
  captions = true,
  trigger = "inView",
  label = "Seed head of pictures",
  disabled = false,
  className,
}: SeedheadGalleryProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list =
    items && items.length > 0
      ? items.slice(0, MAX_SEEDS)
      : defaultSeedheadItems;
  const n = list.length;

  const base = Math.max(3, Math.round(clamp(growth, 0.1, 1) * n));
  const [extra, setExtra] = React.useState(0);
  const [scrolled, setScrolled] = React.useState(0);
  const target = !motionSafe
    ? n
    : clamp(
        base + extra + (n - base) * scrolled * clamp(scrollGrowth, 0, 1),
        3,
        n,
      );

  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const geo = geometryOf(box.w || 720, box.h || 520, n, scale, spread, zoom);

  // The first frame is a full head a band short of its rest growth; the
  // entrance grows that band in at the core.
  const first = Math.max(3, base - Math.min(21, Math.round(base * 0.4)));
  const E = useMotionValue(first);
  const deg = useMotionValue(angle);
  const [emerged, setEmerged] = React.useState(Math.floor(first));

  const controlled = value !== undefined;
  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const held = controlled ? value : own;
  const [preview, setPreview] = React.useState<number | null>(null);
  const activeRaw = preview ?? held;
  const active =
    activeRaw === null || activeRaw === undefined || activeRaw >= emerged
      ? null
      : activeRaw;
  const [focusIndex, setFocusIndex] = React.useState(() => held ?? 0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLButtonElement>());
  const growRun = React.useRef<AnimationPlaybackControls | null>(null);
  const angleRun = React.useRef<AnimationPlaybackControls | null>(null);
  const [live, setLive] = React.useState(trigger === "mount");

  const register = React.useCallback(
    (index: number, node: HTMLButtonElement | null) => {
      if (node) nodes.current.set(index, node);
      else nodes.current.delete(index);
    },
    [],
  );

  const commit = (next: number | null) => {
    if (disabled) return;
    if (next === held) return;
    if (!controlled) setOwn(next);
    onValueChange?.(next);
    const item = next === null ? null : list[next];
    setSaid((s) => ({
      n: s.n + 1,
      text: item ? `${bare(item.caption ?? item.alt)} held.` : "Let go.",
    }));
  };

  const activate = (i: number) => {
    if (disabled) return;
    setFocusIndex(i);
    commit(held === i ? null : i);
  };

  const onEnter = (i: number, on: boolean) => {
    if (disabled) return;
    setPreview((p) => (on ? i : p === i ? null : p));
  };

  const onFocusSeed = (i: number, visible: boolean) => {
    setFocusIndex(i);
    if (visible && !disabled) setPreview(i);
  };

  const focusSeed = (i: number) => {
    setFocusIndex(i);
    nodes.current.get(i)?.focus();
  };

  const grow = (by: number) => {
    if (disabled) return;
    const next = clamp(base + extra + by, 3, n) - base;
    setExtra(next);
    setSaid((s) => ({
      n: s.n + 1,
      text: `${Math.round(clamp(base + next, 3, n))} of ${n} grown.`,
    }));
  };

  const onKeyDown = (i: number, event: React.KeyboardEvent) => {
    const k = event.key;
    const last = Math.max(0, emerged - 1);
    let next: number | null = null;
    if (k === "ArrowRight" || k === "ArrowDown") next = Math.min(last, i + 1);
    else if (k === "ArrowLeft" || k === "ArrowUp") next = Math.max(0, i - 1);
    else if (k === "Home") next = 0;
    else if (k === "End") next = last;
    else if (k === "+" || k === "=") {
      event.preventDefault();
      grow(8);
      return;
    } else if (k === "-" || k === "_") {
      event.preventDefault();
      grow(-8);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    if (held !== null) commit(next);
    focusSeed(next);
  };

  /* -------------------------------- effects ------------------------------ */

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // The emerged count is information: buttons enter the tab order as their
  // seeds emerge, and the count reads out.
  React.useEffect(
    () =>
      E.on("change", (v) => {
        const whole = Math.floor(v + 0.001);
        setEmerged((e) => (e === whole ? e : whole));
      }),
    [E],
  );

  // Grows (or shrinks) toward the target on drift once the head is live;
  // a re-run carries on from wherever the last one stopped.
  React.useEffect(() => {
    if (!live && motionSafe) return;
    growRun.current?.stop();
    if (!motionSafe) {
      E.jump(target);
      return;
    }
    growRun.current = animate(E, target, springs.drift);
    return () => growRun.current?.stop();
  }, [target, live, motionSafe, E]);

  React.useEffect(() => {
    angleRun.current?.stop();
    if (!motionSafe) {
      deg.jump(angle);
      return;
    }
    angleRun.current = animate(deg, angle, springs.glide);
    return () => angleRun.current?.stop();
  }, [angle, motionSafe, deg]);

  // In view: the entrance starts, and the page's scroll position past the
  // head is read (passively, only while it is on screen) as growth.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let inView = false;
    let raf = 0;
    const read = () => {
      raf = 0;
      if (!inView || scrollGrowth <= 0) return;
      const r = root.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = clamp((vh - r.top) / (vh + r.height), 0, 1);
      // The middle of the pass is the rest state; the head grows from there
      // on as it rises toward the top of the viewport.
      const grown = r3(clamp((progress - 0.5) * 2, 0, 1));
      setScrolled((s) => (Math.abs(s - grown) < 0.01 ? s : grown));
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(read);
    };
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) {
        setLive(true);
        onScroll();
      }
    });
    io.observe(root);
    window.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [scrollGrowth]);

  /* --------------------------------- render ------------------------------ */

  const headScale = useTransform(E, (e) =>
    r3(
      clamp(
        Math.pow(clamp(e / n, 0, 1), geo.p) + geo.rim / (2 * geo.R),
        0,
        1.2,
      ),
    ),
  );
  const activeItem = active === null ? null : list[active];
  const tabbable = clamp(focusIndex, 0, Math.max(0, emerged - 1));

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || (held === null && preview === null))
          return;
        event.preventDefault();
        commit(null);
        setPreview(null);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setPreview(null);
      }}
      onPointerLeave={() => setPreview(null)}
      className={cn(
        "relative isolate h-full w-full touch-manipulation overflow-clip [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* The receptacle the seeds sit in. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          left: r2(geo.cx - geo.R),
          top: r2(geo.cy - geo.R),
          width: r2(geo.R * 2),
          height: r2(geo.R * 2),
          scale: headScale,
          background: `radial-gradient(circle, ${tone("--warn", 0.6, 0.06, -20, 0.22)}, ${tone("--warn", 0.5, 0.05, -20, 0.1)} 70%, transparent 100%)`,
          boxShadow: "inset 0 0 0 1px var(--hairline)",
        }}
      />
      {list.map((item, i) => (
        <Seed
          key={i}
          index={i}
          item={item}
          geo={geo}
          n={n}
          E={E}
          deg={deg}
          active={active === i}
          dimmed={active !== null && active !== i}
          held={held === i}
          emerged={emerged}
          tabbable={i === tabbable}
          disabled={disabled}
          motionSafe={motionSafe}
          register={register}
          onEnter={onEnter}
          onFocusSeed={onFocusSeed}
          onActivate={activate}
          onKeyDown={onKeyDown}
        />
      ))}
      {captions && activeItem && active !== null ? (
        <Caption
          key={active}
          index={active}
          item={activeItem}
          emerged={emerged}
          geo={geo}
          n={n}
          E={E}
          deg={deg}
        />
      ) : null}
      <p id={hintId} className="sr-only">
        Arrow keys walk the spiral, Home goes to the rim and End to the core;
        plus and minus grow and shrink the head; Enter holds a picture.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
