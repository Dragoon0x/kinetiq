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
  Check,
  Copy,
  LifeBuoy,
  LocateFixed,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import {
  project,
  rubberband,
  rubberClamp,
  useDrag,
} from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type OrderTrackerPath = "rail" | "road" | "arc";
export type OrderTrackerEta = "window" | "countdown" | "day";
export type OrderTrackerMap = "streets" | "dots" | "none";
export type OrderTrackerStatus = "ready" | "loading" | "error";
export type OrderItemKind = "kettle" | "dripper" | "filters" | "mug" | "parcel";

export type OrderStage = {
  id: string;
  /** "Out for delivery". Shown on the path and in the status pill. */
  label: string;
  /** When it was reached, ms — or, while it has not been, when it is expected. */
  at: number;
  /** Whether it has happened. @default `at` is at or before `now` */
  reached?: boolean;
  /** Where it happened: "Basin City warehouse". */
  place?: string;
  /** Where along the map's route it happens, 0 (the origin) to 1 (the door). @default evenly spaced */
  route?: number;
};

export type OrderScan = {
  id: string;
  /** When the carrier recorded it, ms. */
  at: number;
  /** One line, in the carrier's words: "Departed Basin City warehouse". */
  text: string;
  /** The stage it belongs to. */
  stage: string;
  place?: string;
  /** A hold-up or an exception is drawn in the warn ink. @default "default" */
  tone?: "default" | "warn";
};

export type OrderItem = {
  id: string;
  name: string;
  /** "Clay", "1 l". */
  variant?: string;
  qty: number;
  /** Unit price. */
  price: number;
  /** The thumbnail's pigment — any CSS colour, ideally at a fixed lightness so both themes read it. */
  tint: string;
  /** Which thumbnail to draw. @default "parcel" */
  kind?: OrderItemKind;
};

export type OrderWindow = {
  /** Window opens, ms. */
  start: number;
  /** Window closes, ms. */
  end: number;
};

export type OrderTrackerOrder = {
  /** "FW-20417". */
  number: string;
  /** Who sold it. */
  store: string;
  /** Who carries it. */
  carrier: string;
  /** The carrier's tracking number; Copy puts it on the clipboard. */
  tracking: string;
  /** The map's origin label. */
  from: string;
  /** The map's waypoint label, if the route has one. */
  via?: string;
  /** The map's destination label. */
  to: string;
  /** The delivery address, in full. */
  address: string;
};

export type OrderTrackerProps = {
  /** The progress track's shape: a straight rail, a winding road, or one long arc. @default "road" */
  path?: OrderTrackerPath;
  /** How the arrival reads: the delivery window, a countdown to it, or the day. @default "window" */
  eta?: OrderTrackerEta;
  /** The map strip: streets and blocks, a dot grid with the route only, or none. @default "streets" */
  map?: OrderTrackerMap;
  /** The order's numbers and places. @default defaultOrderTrackerOrder */
  order?: OrderTrackerOrder;
  /** The shipment's stages, in order. @default defaultOrderStages */
  stages?: OrderStage[];
  /** Every carrier scan, any order. @default defaultOrderScans */
  scans?: OrderScan[];
  /** What is in the parcel. @default defaultOrderItems */
  items?: OrderItem[];
  /** Shipping charged. 0 reads "Free". @default 0 */
  shipping?: number;
  /** Tax charged. @default 8% of the items */
  tax?: number;
  /** The tracker's moment (Date or ms): where the dot sits and what the countdown reads. @default defaultOrderTrackerNow */
  now?: number | Date;
  /** Controlled delivery window. */
  delivery?: OrderWindow;
  /** Initial delivery window when uncontrolled. @default the first of `windows` */
  defaultDelivery?: OrderWindow;
  /** Fires from the choice that changed the window, with the new one. */
  onDeliveryChange?: (window: OrderWindow) => void;
  /** Windows the visitor may move delivery to. Empty: no Change button. @default defaultOrderWindows */
  windows?: OrderWindow[];
  /** "Get help" was pressed. Without it there is no Get help button. */
  onHelp?: () => void;
  /** A scan was previewed (its id) or the preview went back to now (null). */
  onScanSelect?: (scanId: string | null) => void;
  /** Money. @default Intl currency in `locale` and `currency` */
  format?: (amount: number) => string;
  /** Times. @default "2:40 PM", in UTC */
  formatTime?: (ms: number) => string;
  /** Dates. @default "Thu, Oct 1", in UTC */
  formatDate?: (ms: number) => string;
  /** The weekday the day view shows large. @default "Thursday", in UTC */
  formatDay?: (ms: number) => string;
  /** @default "en-US" */
  locale?: string;
  /** @default "USD" */
  currency?: string;
  /** Whether the tracking has arrived. @default "ready" */
  status?: OrderTrackerStatus;
  /** "Try again" was pressed after tracking failed to load. */
  onRetry?: () => void;
  /** The surface's heading. @default "Track order" */
  title?: string;
  /** The region's accessible name. @default the title */
  label?: string;
  /** Ticks while scrubbing the history, a plip as the dot lands and as a window is chosen. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be scrubbed, panned or changed. @default false */
  disabled?: boolean;
  /** Classes for the root. It is at most 560px tall and scrolls inside itself. */
  className?: string;
};

type Pt = readonly [number, number];

/* ------------------------------ map geometry ----------------------------- */

/** The map's world: blocks on a 64 × 40 grid, streets in the 8-unit gaps. */
const MAP_W = 1000;
const MAP_H = 160;
/**
 * The route runs along street centres and never doubles back in x, so the
 * strip can pan with it. Its corners are the warehouse, the hub and the door.
 */
const ROUTE: Pt[] = [
  [68, 124],
  [196, 124],
  [196, 84],
  [644, 84],
  [644, 44],
  [836, 44],
  [836, 124],
  [900, 124],
];
const HUB_INDEX = 3;

const ROUTE_LENGTHS = (() => {
  const out = [0];
  for (let i = 1; i < ROUTE.length; i += 1) {
    const a = ROUTE[i - 1];
    const b = ROUTE[i];
    out.push(
      (out[i - 1] ?? 0) + (a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0),
    );
  }
  return out;
})();
const ROUTE_TOTAL = ROUTE_LENGTHS[ROUTE_LENGTHS.length - 1] ?? 1;
const HUB_ROUTE = Number(
  ((ROUTE_LENGTHS[HUB_INDEX] ?? 0) / ROUTE_TOTAL).toFixed(4),
);

/* ---------------------------------- data --------------------------------- */

const at = (month: number, day: number, h: number, m: number) =>
  Date.UTC(2026, month - 1, day, h, m);

/** 13:05 UTC on Thursday 1 October 2026: the van is out, the window opens at 14:40. */
export const defaultOrderTrackerNow = at(10, 1, 13, 5);

export const defaultOrderTrackerOrder: OrderTrackerOrder = {
  number: "FW-20417",
  store: "Fernworks Home",
  carrier: "Fieldline Freight",
  tracking: "FLF 4471 0926 3318",
  from: "Basin City",
  via: "Coldbrook hub",
  to: "Larch Row",
  address: "14 Larch Row, Coldbrook",
};

export const defaultOrderStages: OrderStage[] = [
  {
    id: "ordered",
    label: "Ordered",
    at: at(9, 28, 10, 14),
    place: "Fernworks Home",
    route: 0,
  },
  {
    id: "packed",
    label: "Packed",
    at: at(9, 28, 16, 40),
    place: "Basin City warehouse",
    route: 0,
  },
  {
    id: "shipped",
    label: "Shipped",
    at: at(9, 29, 8, 5),
    place: "Basin City warehouse",
    route: 0,
  },
  {
    id: "out",
    label: "Out for delivery",
    at: at(10, 1, 8, 52),
    place: "Coldbrook hub",
    route: HUB_ROUTE,
  },
  {
    id: "delivered",
    label: "Delivered",
    at: at(10, 1, 15, 25),
    reached: false,
    place: "14 Larch Row",
    route: 1,
  },
];

export const defaultOrderScans: OrderScan[] = [
  {
    id: "s1",
    at: at(9, 28, 10, 14),
    text: "Order placed",
    stage: "ordered",
    place: "Fernworks Home",
  },
  {
    id: "s2",
    at: at(9, 28, 16, 40),
    text: "Packed and labelled",
    stage: "packed",
    place: "Basin City warehouse",
  },
  {
    id: "s3",
    at: at(9, 29, 8, 5),
    text: "Departed Basin City warehouse",
    stage: "shipped",
    place: "Basin City",
  },
  {
    id: "s4",
    at: at(9, 29, 19, 48),
    text: "Arrived at Gauge Junction sort centre",
    stage: "shipped",
    place: "Gauge Junction",
  },
  {
    id: "s5",
    at: at(9, 30, 6, 12),
    text: "Held at Gauge Junction: late linehaul",
    stage: "shipped",
    place: "Gauge Junction",
    tone: "warn",
  },
  {
    id: "s6",
    at: at(9, 30, 21, 30),
    text: "Arrived at Coldbrook hub",
    stage: "shipped",
    place: "Coldbrook",
  },
  {
    id: "s7",
    at: at(10, 1, 8, 52),
    text: "Out for delivery on van 12",
    stage: "out",
    place: "Coldbrook hub",
  },
  {
    id: "s8",
    at: at(10, 1, 12, 16),
    text: "Six stops before yours",
    stage: "out",
    place: "Coldbrook",
  },
];

export const defaultOrderItems: OrderItem[] = [
  {
    id: "pour-over",
    name: "Stoneware pour-over set",
    variant: "Clay",
    qty: 1,
    price: 64,
    tint: "oklch(from var(--danger) 0.72 0.09 h)",
    kind: "dripper",
  },
  {
    id: "kettle",
    name: "Basin kettle, 1 l",
    variant: "Slate",
    qty: 1,
    price: 89,
    tint: "oklch(from var(--accent-bright) 0.66 0.06 h)",
    kind: "kettle",
  },
  {
    id: "filters",
    name: "Paper filters, 100",
    variant: "Unbleached",
    qty: 2,
    price: 8.5,
    tint: "oklch(from var(--warn) 0.86 0.05 h)",
    kind: "filters",
  },
];

export const defaultOrderWindows: OrderWindow[] = [
  { start: at(10, 1, 14, 40), end: at(10, 1, 16, 10) },
  { start: at(10, 1, 18, 0), end: at(10, 1, 20, 0) },
  { start: at(10, 2, 9, 0), end: at(10, 2, 11, 0) },
  { start: at(10, 2, 13, 30), end: at(10, 2, 15, 0) },
];

/* -------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** A fixed 12-hour UTC clock: a locale lookup in render would not survive hydration. */
const clockParts = (ms: number) => {
  const d = new Date(ms);
  const h = d.getUTCHours();
  return {
    text: `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    suffix: h >= 12 ? "PM" : "AM",
  };
};
const utcTime = (ms: number) => {
  const p = clockParts(ms);
  return `${p.text} ${p.suffix}`;
};
const utcDate = (ms: number) => {
  const d = new Date(ms);
  return `${(DAYS[d.getUTCDay()] ?? "").slice(0, 3)}, ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const utcDay = (ms: number) => DAYS[new Date(ms).getUTCDay()] ?? "";
const dayKey = (ms: number) => Math.floor(ms / 86_400_000);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/* ------------------------------ path geometry ---------------------------- */

const TRACK_H: Record<OrderTrackerPath, number> = {
  rail: 40,
  road: 64,
  arc: 80,
};

/** The track's height in px at x (0 to 1 across); x is clamped, so a rubber-banded dot keeps the end's height. */
function curveY(path: OrderTrackerPath, x: number): number {
  const t = clamp01(x);
  if (path === "road") return 32 + 13 * Math.sin(t * Math.PI * 3);
  if (path === "arc") return 64 - 42 * Math.sin(t * Math.PI);
  return 20;
}

/** The track drawn on a 0..1000 viewBox stretched only in x. */
function curvePath(path: OrderTrackerPath): string {
  const n = path === "rail" ? 1 : 60;
  const pts: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const x = i / n;
    pts.push(`${r2(x * 1000)} ${r2(curveY(path, x))}`);
  }
  return `M ${pts.join(" L ")}`;
}

/* ------------------------------ route helpers ---------------------------- */

function routePoint(frac: number): Pt {
  const d = clamp01(frac) * ROUTE_TOTAL;
  for (let i = 1; i < ROUTE.length; i += 1) {
    const l0 = ROUTE_LENGTHS[i - 1] ?? 0;
    const l1 = ROUTE_LENGTHS[i] ?? 0;
    const a = ROUTE[i - 1];
    const b = ROUTE[i];
    if (!a || !b) continue;
    if (d <= l1 || i === ROUTE.length - 1) {
      const t = l1 > l0 ? clamp01((d - l0) / (l1 - l0)) : 0;
      return [r2(lerp(a[0], b[0], t)), r2(lerp(a[1], b[1], t))];
    }
  }
  return ROUTE[0] ?? [0, 0];
}

function routeUpTo(frac: number): string {
  const d = clamp01(frac) * ROUTE_TOTAL;
  if (d <= 0.5) return "";
  const pts: Pt[] = [ROUTE[0] ?? [0, 0]];
  for (let i = 1; i < ROUTE.length; i += 1) {
    const l1 = ROUTE_LENGTHS[i] ?? 0;
    const p = ROUTE[i];
    if (!p) continue;
    if (d >= l1) {
      pts.push(p);
      continue;
    }
    pts.push(routePoint(frac));
    break;
  }
  return `M ${pts.map(([x, y]) => `${x} ${y}`).join(" L ")}`;
}

const ROUTE_D = `M ${ROUTE.map(([x, y]) => `${x} ${y}`).join(" L ")}`;

type Block = { x: number; y: number; w: number; h: number; park: boolean };

/** The streets: a block grid with a riverside park, two seeded parks and a few split blocks. */
function buildBlocks(seed: number): Block[] {
  const out: Block[] = [];
  let s = seed || 1;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const parks = new Set<string>();
  while (parks.size < 2) {
    const i = Math.floor(next() * 15);
    const j = Math.floor(next() * 4);
    if (i === 6 || i === 7) continue;
    parks.add(`${i}:${j}`);
  }
  for (let i = 0; i < 15; i += 1) {
    if (i === 6 || i === 7) continue;
    for (let j = 0; j < 4; j += 1) {
      const x = 8 + i * 64;
      const y = 8 + j * 40;
      const park = parks.has(`${i}:${j}`);
      if (!park && next() < 0.28) {
        out.push({ x, y, w: 26, h: 32, park: false });
        out.push({ x: x + 30, y, w: 26, h: 32, park: false });
      } else {
        out.push({ x, y, w: 56, h: 32, park });
      }
    }
  }
  return out;
}

const RIVER_D = (() => {
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const y = (i / 16) * MAP_H;
    const cx = 452 + 9 * Math.sin((i / 16) * Math.PI * 2.2);
    left.push(`${r2(cx - 17)} ${r2(y)}`);
    right.unshift(`${r2(cx + 17)} ${r2(y)}`);
  }
  return `M ${left.join(" L ")} L ${right.join(" L ")} Z`;
})();

/* ------------------------------- small parts ----------------------------- */

/** One digit as a column of 0–9 that rolls to its value on the snap spring. */
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

/**
 * Text whose digits roll. Columns are keyed from the right, so the minutes
 * stay the minutes as an hour is added; the widest reading is reserved in
 * the same cell, so nothing beside it moves.
 */
function Roll({
  text,
  widest,
  motionSafe,
  className,
}: {
  text: string;
  widest: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = [...text];
  return (
    <span aria-hidden className={cn("inline-grid tabular-nums", className)}>
      <span className="invisible col-start-1 row-start-1 leading-[1.15em] whitespace-pre">
        {widest.length > text.length ? widest : text}
      </span>
      <span className="col-start-1 row-start-1 inline-flex leading-[1.15em] whitespace-pre">
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          if (ch >= "0" && ch <= "9") {
            return (
              <Digit
                key={`d${fromRight}`}
                value={Number(ch)}
                motionSafe={motionSafe}
              />
            );
          }
          return (
            <span key={`c${fromRight}${ch}`} className="inline-block">
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** A check that draws itself on the flick spring. */
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
      className={cn("size-3.5 shrink-0", className)}
    >
      <motion.path
        d="M3.5 8.4 6.6 11.4 12.6 4.8"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: motionSafe ? 0 : 1 }}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

function ItemArt({
  kind = "parcel",
  tint,
}: {
  kind?: OrderItemKind;
  tint: string;
}) {
  const body = { fill: tint };
  return (
    <svg
      aria-hidden
      viewBox="0 0 40 40"
      className="size-10 shrink-0 rounded-2 bg-surface-2"
    >
      <ellipse cx={20} cy={33.5} rx={11} ry={1.6} className="fill-ink-3/20" />
      {kind === "kettle" ? (
        <>
          <path
            d="M12 31.5h16l1.6-11.5a2 2 0 0 0-2-2.3H12.4a2 2 0 0 0-2 2.3Z"
            style={body}
          />
          <path
            d="M28.6 21.5 33 17.6"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="text-ink-3"
          />
          <path
            d="M14 17.7c0-4.2 2.7-6.2 6-6.2s6 2 6 6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="text-ink-2"
          />
          <rect x={18} y={15.2} width={4} height={2.4} rx={1} style={body} />
        </>
      ) : kind === "dripper" ? (
        <>
          <path d="M10.5 13.5h19L23.6 25h-7.2Z" style={body} />
          <rect x={14} y={25} width={12} height={2} rx={1} style={body} />
          <path d="M13.5 28.5h13l-1 3.4h-11Z" className="fill-ink-3/35" />
        </>
      ) : kind === "filters" ? (
        <>
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${11 + i * 2} ${15 + i * 3}h15l-4 ${14 - i * 2}h-7Z`}
              style={body}
              className="stroke-card"
              strokeWidth={1}
            />
          ))}
        </>
      ) : kind === "mug" ? (
        <>
          <rect x={11} y={14} width={15} height={17.5} rx={3} style={body} />
          <path
            d="M26 18.5h2.4a3 3 0 0 1 0 6H26"
            fill="none"
            strokeWidth={2}
            style={{ stroke: tint }}
          />
        </>
      ) : (
        <>
          <rect x={10} y={15} width={20} height={16.5} rx={2} style={body} />
          <path
            d="M10 20h20M20 15v5"
            className="stroke-card"
            strokeWidth={1.4}
          />
        </>
      )}
    </svg>
  );
}

/* --------------------------------- the map ------------------------------- */

type RouteMapProps = {
  style: Exclude<OrderTrackerMap, "none">;
  /** The vehicle's place along the route, 0 to 1. */
  progress: MotionValue<number>;
  order: OrderTrackerOrder;
  delivered: boolean;
  motionSafe: boolean;
  disabled: boolean;
};

/**
 * The map strip. The map is drawn at the strip's height and is wider than the
 * strip; it is placed with CSS container units around the vehicle's x, so the
 * server and the browser compute the same pan without a measurement. A drag
 * offsets that pan, 1:1 and rubber-banded, and coasts to rest on release.
 */
function RouteMap({
  style,
  progress,
  order,
  delivered,
  motionSafe,
  disabled,
}: RouteMapProps) {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const dotsId = `order-map-dots-${uid}`;
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const dragX = useMotionValue(0);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const grab = React.useRef<{
    from: number;
    lo: number;
    hi: number;
    w: number;
  } | null>(null);
  const [panned, setPanned] = React.useState(false);

  const blocks = React.useMemo(
    () => buildBlocks(hash(order.tracking)),
    [order.tracking],
  );

  const vehicle = useTransform(progress, (p) => routePoint(p));
  const vx = useTransform(vehicle, (v) => v[0]);
  const vy = useTransform(vehicle, (v) => v[1]);
  const travelled = useTransform(progress, (p) => routeUpTo(p));
  const vanOpacity = useTransform(progress, (p) =>
    p >= 0.999 ? 0 : p > 0.97 ? r2((0.999 - p) / 0.029) : 1,
  );
  // The map is 6.25 strip-heights wide; the vehicle's world x converts to the
  // same container units, and the clamp keeps both ends of the map in view.
  const pan = useTransform(
    vx,
    (x) =>
      `translateX(clamp(calc(100cqw - 625cqh), calc(50cqw - ${r2(x * 0.625)}cqh), 0px))`,
  );

  /** The drag's limits, px: the total pan stays between the map's ends. */
  const limits = () => {
    const strip = stripRef.current;
    if (!strip) return null;
    const w = strip.clientWidth;
    const h = strip.clientHeight;
    const mapW = (MAP_W * h) / MAP_H;
    // The same clamp as the CSS: max(min, min(value, max)).
    const base = Math.max(
      w - mapW,
      Math.min(w / 2 - (vx.get() * h) / MAP_H, 0),
    );
    return { lo: Math.min(0, w - mapW - base), hi: Math.max(0, -base), w };
  };

  const glideTo = (to: number, velocity = 0) => {
    anim.current?.stop();
    anim.current = motionSafe
      ? animate(dragX, to, { ...springs.glide, velocity })
      : animate(dragX, to, { duration: 0 });
    setPanned(Math.abs(to) > 4);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      anim.current?.stop();
      const l = limits();
      if (!l) return;
      grab.current = { from: dragX.get(), ...l };
    },
    onMove: ({ offset }) => {
      const g = grab.current;
      if (!g) return;
      dragX.set(r2(rubberClamp(g.from + offset.x, g.lo, g.hi, g.w * 0.5)));
    },
    onEnd: ({ velocity }) => {
      const g = grab.current;
      grab.current = null;
      if (!g) return;
      const rest = clamp(project(dragX.get(), velocity.x, 0.995), g.lo, g.hi);
      glideTo(r2(rest), velocity.x);
    },
    onCancel: () => {
      const g = grab.current;
      grab.current = null;
      if (g) glideTo(clamp(dragX.get(), g.lo, g.hi));
    },
  });

  React.useEffect(() => () => anim.current?.stop(), []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const l = limits();
    if (!l) return;
    const step = 64;
    let to: number | null = null;
    if (event.key === "ArrowLeft") to = dragX.get() + step;
    else if (event.key === "ArrowRight") to = dragX.get() - step;
    else if (event.key === "Home") to = l.hi;
    else if (event.key === "End") to = l.lo;
    else if (event.key === "r" || event.key === "R") to = 0;
    if (to === null) return;
    event.preventDefault();
    glideTo(r2(clamp(to, l.lo, l.hi)));
  };

  const hub = ROUTE[HUB_INDEX] ?? [0, 0];
  const start = ROUTE[0] ?? [0, 0];
  const end = ROUTE[ROUTE.length - 1] ?? [0, 0];

  return (
    <div className="relative">
      <div
        ref={stripRef}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Route map from ${order.from} to ${order.to}. Arrow keys pan, R recentres.`}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "[container-type:size] relative h-24 touch-pan-y overflow-clip rounded-3 border border-hairline bg-surface-1 select-none @min-[40rem]:h-32",
          !disabled && "cursor-grab active:cursor-grabbing",
          FOCUS,
        )}
      >
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ transform: pan }}
        >
          <motion.div className="h-full" style={{ x: dragX }}>
            <svg
              aria-hidden
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="block"
              style={{ width: "625cqh", height: "100cqh" }}
            >
              {style === "dots" ? (
                <>
                  <defs>
                    <pattern
                      id={dotsId}
                      width={16}
                      height={16}
                      patternUnits="userSpaceOnUse"
                    >
                      <circle cx={8} cy={8} r={1.4} className="fill-ink-3/30" />
                    </pattern>
                  </defs>
                  <rect width={MAP_W} height={MAP_H} fill={`url(#${dotsId})`} />
                </>
              ) : (
                <>
                  {blocks.map((b, i) => (
                    <rect
                      key={i}
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      rx={4}
                      className={b.park ? "fill-success/20" : "fill-ink-3/12"}
                    />
                  ))}
                  <rect
                    x={392}
                    y={0}
                    width={120}
                    height={MAP_H}
                    className="fill-success/14"
                  />
                  <path d={RIVER_D} className="fill-cobalt-bright/25" />
                  <rect
                    x={414}
                    y={78}
                    width={76}
                    height={12}
                    rx={2}
                    className="fill-surface-1 stroke-ink-3/40"
                    strokeWidth={1}
                  />
                  <text
                    x={240}
                    y={120.5}
                    className="fill-ink-3 stroke-surface-1 text-[12px]"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    Basin Rd
                  </text>
                  <text
                    x={690}
                    y={40.5}
                    className="fill-ink-3 stroke-surface-1 text-[12px]"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    Fern Ave
                  </text>
                </>
              )}
              <path
                d={ROUTE_D}
                fill="none"
                strokeWidth={3}
                strokeDasharray="2 7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-ink-3/70"
              />
              <motion.path
                d={travelled}
                fill="none"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={
                  delivered ? "stroke-success" : "stroke-cobalt-bright"
                }
              />
              {/* The warehouse, the hub and the door. */}
              <rect
                x={start[0] - 7}
                y={start[1] - 7}
                width={14}
                height={14}
                rx={3}
                className="fill-ink-2 stroke-surface-1"
                strokeWidth={2}
              />
              {order.via ? (
                <rect
                  x={hub[0] - 6}
                  y={hub[1] - 6}
                  width={12}
                  height={12}
                  rx={2}
                  transform={`rotate(45 ${hub[0]} ${hub[1]})`}
                  className="fill-ink-2 stroke-surface-1"
                  strokeWidth={2}
                />
              ) : null}
              <path
                d={`M ${end[0]} ${end[1] + 1} l -8 -10 a 10 10 0 1 1 16 0 Z`}
                className={cn(
                  "stroke-surface-1",
                  delivered ? "fill-success" : "fill-ink-2",
                )}
                strokeWidth={2}
              />
              <circle
                cx={end[0]}
                cy={end[1] - 13}
                r={3}
                className="fill-surface-1"
              />
              {[
                {
                  p: start,
                  text: order.from,
                  anchor: "start" as const,
                  dx: -4,
                  dy: -14,
                },
                ...(order.via
                  ? [
                      {
                        p: hub,
                        text: order.via,
                        anchor: "middle" as const,
                        dx: 0,
                        dy: 26,
                      },
                    ]
                  : []),
                {
                  p: end,
                  text: order.to,
                  anchor: "end" as const,
                  dx: -14,
                  dy: 22,
                },
              ].map((l) => (
                <text
                  key={l.text}
                  x={l.p[0] + l.dx}
                  y={l.p[1] + l.dy}
                  textAnchor={l.anchor}
                  className="fill-foreground stroke-surface-1 text-[15px] font-medium"
                  strokeWidth={4}
                  paintOrder="stroke"
                >
                  {l.text}
                </text>
              ))}
              {/* At the door the van hands over to the pin. */}
              <motion.g style={{ opacity: vanOpacity }}>
                <motion.circle
                  cx={vx}
                  cy={vy}
                  r={11}
                  className="fill-cobalt-bright/20"
                />
                <motion.circle
                  cx={vx}
                  cy={vy}
                  r={6.5}
                  strokeWidth={2.5}
                  className="fill-cobalt-bright stroke-surface-1"
                />
              </motion.g>
            </svg>
          </motion.div>
        </motion.div>
      </div>
      <AnimatePresence initial={false}>
        {panned ? (
          <motion.button
            key="recentre"
            type="button"
            onClick={() => {
              glideTo(0);
              stripRef.current?.focus({ preventScroll: true });
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
            className={cn(
              "absolute top-2 right-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-popover px-2.5 text-[11px] font-medium text-foreground shadow-sm hover:bg-surface-2",
              FOCUS,
            )}
          >
            <LocateFixed aria-hidden className="size-3.5 shrink-0" />
            Recentre
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------- the tracker ----------------------------- */

type Mark = { x: number; scan: OrderScan | null };

/**
 * An order tracking surface. One progress coordinate drives everything: the
 * live dot rides the shipment's path between its stages (placed by how much
 * of the time between the last reached stage and the next has passed, from
 * `now`), the path fills behind it, and on the map strip the van rides the
 * route to the door while the strip pans to keep it centred. A new `now`
 * glides the dot on; reaching the last stage lands it in a check that pops
 * on recoil.
 *
 * The path can be scrubbed: grab the dot, or the track, and it follows 1:1
 * through the shipment's history — the fill, the van and a time chip
 * rewinding with it, a tick at every scan crossed — then settles on the
 * nearest scan with the release velocity, or glides home to now if thrown
 * that way. The delivery window is a rolling readout (window, countdown or
 * day), and "Change" opens a measured disclosure of other windows.
 *
 * The path is a real `role="slider"`: arrow keys step through the scans,
 * Home goes to the first, End and Escape come back to now. Under reduced
 * motion the dot, the van and the pan move without travel and digits swap,
 * while every position and reading still changes.
 */
export function OrderTracker({
  path = "road",
  eta = "window",
  map = "streets",
  order = defaultOrderTrackerOrder,
  stages = defaultOrderStages,
  scans = defaultOrderScans,
  items = defaultOrderItems,
  shipping = 0,
  tax,
  now,
  delivery,
  defaultDelivery,
  onDeliveryChange,
  windows = defaultOrderWindows,
  onHelp,
  onScanSelect,
  format,
  formatTime,
  formatDate,
  formatDay,
  locale = "en-US",
  currency = "USD",
  status = "ready",
  onRetry,
  title = "Track order",
  label,
  sound = false,
  disabled = false,
  className,
}: OrderTrackerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const windowsId = `${uid}-windows`;
  const sliderHintId = `${uid}-hint`;

  const time = formatTime ?? utcTime;
  const date = formatDate ?? utcDate;
  const dayName = formatDay ?? utcDay;
  const money = React.useMemo(() => {
    if (format) return format;
    const nf = new Intl.NumberFormat(locale, { style: "currency", currency });
    return (n: number) => nf.format(n);
  }, [format, locale, currency]);

  const nowMs =
    now === undefined
      ? defaultOrderTrackerNow
      : typeof now === "number"
        ? now
        : now.getTime();

  /* ---------------------------- the progress ----------------------------- */

  const n = stages.length;
  const stageX = (i: number) => (n > 1 ? i / (n - 1) : 1);
  const isReached = (s: OrderStage) => s.reached ?? s.at <= nowMs;
  let last = -1;
  stages.forEach((s, i) => {
    if (isReached(s)) last = i;
  });
  const delivered = n > 0 && last === n - 1;

  const timeToX = (t: number): number => {
    if (n < 2) return 1;
    const first = stages[0];
    if (!first || t <= first.at) return 0;
    for (let i = 0; i < n - 1; i += 1) {
      const a = stages[i];
      const b = stages[i + 1];
      if (!a || !b) continue;
      if (t < b.at || i === n - 2) {
        const f = b.at > a.at ? clamp01((t - a.at) / (b.at - a.at)) : 1;
        return lerp(stageX(i), stageX(i + 1), f);
      }
    }
    return 1;
  };

  const xToTime = (x: number): number => {
    if (n < 2) return stages[0]?.at ?? nowMs;
    const c = clamp01(x) * (n - 1);
    const i = Math.min(n - 2, Math.floor(c));
    const a = stages[i];
    const b = stages[i + 1];
    if (!a || !b) return nowMs;
    return Math.round(lerp(a.at, b.at, c - i));
  };

  const nowX = (() => {
    if (n === 0 || last === -1) return 0;
    if (last >= n - 1) return 1;
    const a = stages[last];
    const b = stages[last + 1];
    if (!a || !b) return stageX(last);
    // Held short of the next node until its scan says it got there.
    const f = b.at > a.at ? clamp((nowMs - a.at) / (b.at - a.at), 0, 0.92) : 0;
    return r4(lerp(stageX(last), stageX(last + 1), f));
  })();

  const routeAt = (x: number): number => {
    if (n < 2) return delivered ? 1 : 0;
    const c = clamp01(x) * (n - 1);
    const i = Math.min(n - 2, Math.floor(c));
    const ra = stages[i]?.route ?? i / (n - 1);
    const rb = stages[i + 1]?.route ?? (i + 1) / (n - 1);
    return r4(lerp(ra, rb, c - i));
  };

  const sortedScans = React.useMemo(
    () => [...scans].sort((a, b) => a.at - b.at),
    [scans],
  );
  const pastScans = sortedScans.filter((s) => s.at <= nowMs);

  /** The scans the dot can stop on, oldest first, and now. */
  const marks: Mark[] = [
    ...pastScans.map((scan) => ({
      x: r4(Math.min(timeToX(scan.at), nowX)),
      scan,
    })),
    { x: nowX, scan: null },
  ];

  /* ------------------------------ the window ----------------------------- */

  const [ownDelivery, setOwnDelivery] = React.useState<OrderWindow | null>(
    () => defaultDelivery ?? windows[0] ?? null,
  );
  const shownDelivery = delivery ?? ownDelivery;
  const [changing, setChanging] = React.useState(false);

  const windowText = (w: OrderWindow) => {
    if (formatTime) return `${formatTime(w.start)}–${formatTime(w.end)}`;
    const a = clockParts(w.start);
    const b = clockParts(w.end);
    return a.suffix === b.suffix
      ? `${a.text}–${b.text} ${b.suffix}`
      : `${a.text} ${a.suffix}–${b.text} ${b.suffix}`;
  };

  const deliveredScan = delivered
    ? [...pastScans].reverse().find((s) => s.stage === stages[n - 1]?.id)
    : undefined;
  const deliveredAt = deliveredScan?.at ?? stages[n - 1]?.at ?? nowMs;

  const countdown = (() => {
    if (!shownDelivery) return "Soon";
    const diff = shownDelivery.start - nowMs;
    if (diff > 0) {
      const mins = Math.ceil(diff / 60_000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h} h ${m} min` : `${m} min`;
    }
    return nowMs <= shownDelivery.end ? "Any minute" : "Running late";
  })();

  /* ------------------------------ the dot -------------------------------- */

  const dotX = useMotionValue(nowX);
  const dotAnim = React.useRef<AnimationPlaybackControls | null>(null);
  /** Where the dot was last sent, so a re-render does not restart its glide. */
  const settledX = React.useRef(nowX);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const sliderRef = React.useRef<HTMLDivElement | null>(null);
  const grab = React.useRef<{
    left: number;
    width: number;
    passed: number;
  } | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [previewIndex, setPreviewIndex] = React.useState(-1);
  const [shownNodes, setShownNodes] = React.useState(-1);

  const passedOf = (x: number) => {
    let k = 0;
    for (const m of marks) if (m.scan && m.x <= x + 1e-6) k += 1;
    return k;
  };
  const nodesOf = (x: number) => {
    let k = -1;
    for (let i = 0; i < n; i += 1) if (stageX(i) <= x + 1e-6) k = i;
    return k;
  };

  const glideDot = (to: number, velocity = 0, onDone?: () => void) => {
    settledX.current = to;
    dotAnim.current?.stop();
    dotAnim.current = motionSafe
      ? animate(dotX, to, { ...springs.glide, velocity, onComplete: onDone })
      : animate(dotX, to, { duration: 0, onComplete: onDone });
  };

  const panOf = () => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return panFrom(r.left + dotX.get() * r.width, null);
  };

  const backToNow = (velocity = 0) => {
    setPreviewing(false);
    setPreviewIndex(-1);
    setShownNodes(-1);
    onScanSelect?.(null);
    const pan = panOf();
    glideDot(nowX, velocity, () =>
      audio.play("plip", { pitch: 1.12, gain: 0.5, pan }),
    );
  };

  const previewMark = (index: number, velocity = 0) => {
    const m = marks[index];
    if (!m) return;
    if (!m.scan) {
      backToNow(velocity);
      return;
    }
    setPreviewing(true);
    setPreviewIndex(index);
    setShownNodes(nodesOf(m.x));
    onScanSelect?.(m.scan.id);
    audio.play("tick", {
      pitch: r2(semitones(Math.min(14, index * 2))),
      gain: 0.45,
      pan: panOf(),
    });
    glideDot(m.x, velocity);
  };

  const nearestMark = (x: number) => {
    let best = 0;
    let gap = Infinity;
    marks.forEach((m, i) => {
      const d = Math.abs(m.x - x);
      if (d < gap - 1e-9) {
        gap = d;
        best = i;
      }
    });
    return best;
  };

  // A new `now` (or new stages) carries the dot on, unless it is showing the
  // past. Nothing here stops a glide on cleanup, so StrictMode's second run
  // finds the dot already sent and leaves that glide running.
  React.useEffect(() => {
    if (previewing || grab.current) return;
    if (settledX.current === nowX) return;
    settledX.current = nowX;
    dotAnim.current?.stop();
    dotAnim.current = motionSafe
      ? animate(dotX, nowX, springs.glide)
      : animate(dotX, nowX, { duration: 0 });
  }, [nowX, previewing, motionSafe, dotX]);

  React.useEffect(() => () => dotAnim.current?.stop(), []);

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || status !== "ready",
    onStart: ({ point }) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      dotAnim.current?.stop();
      grab.current = { left: r.left, width: Math.max(1, r.width), passed: -1 };
      setPreviewing(true);
      const x = clamp((point.x - r.left) / r.width, 0, nowX);
      grab.current.passed = passedOf(x);
      setShownNodes(nodesOf(x));
    },
    onMove: ({ point }) => {
      const g = grab.current;
      if (!g) return;
      const raw = (point.x - g.left) / g.width;
      const x =
        raw < 0
          ? rubberband(raw * g.width, 14) / g.width
          : raw > nowX
            ? nowX + rubberband((raw - nowX) * g.width, 14) / g.width
            : raw;
      dotX.set(r4(x));
      const passed = passedOf(x);
      if (passed !== g.passed) {
        g.passed = passed;
        setPreviewIndex(passed - 1);
        setShownNodes(nodesOf(x));
        audio.play("tick", {
          pitch: r2(semitones(Math.min(14, passed * 2))),
          gain: 0.4,
          pan: panFrom(point.x, null),
        });
      }
    },
    onEnd: ({ velocity }) => {
      const g = grab.current;
      grab.current = null;
      if (!g) return;
      const v = velocity.x / g.width;
      const landing = project(dotX.get() * g.width, velocity.x, 0.99) / g.width;
      // Thrown at now, or let go past it: home. Otherwise the nearest scan.
      if (landing >= nowX - 0.01) {
        backToNow(v);
        return;
      }
      const i = nearestMark(clamp(landing, 0, nowX));
      const m = marks[i];
      if (!m?.scan) {
        backToNow(v);
        return;
      }
      setPreviewIndex(i);
      setShownNodes(nodesOf(m.x));
      onScanSelect?.(m.scan.id);
      glideDot(m.x, v);
    },
    onCancel: () => {
      grab.current = null;
      backToNow();
    },
    onTap: (event) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = clamp((event.clientX - r.left) / Math.max(1, r.width), 0, 1);
      sliderRef.current?.focus({ preventScroll: true });
      if (x >= nowX - 0.02) {
        if (previewing) backToNow();
        return;
      }
      previewMark(nearestMark(x));
    },
  });

  const currentIndex =
    previewing && previewIndex >= 0 ? previewIndex : marks.length - 1;

  const onSliderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const lastIndex = marks.length - 1;
    let to: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        to = Math.max(0, currentIndex - 1);
        break;
      case "ArrowRight":
      case "ArrowUp":
        to = Math.min(lastIndex, currentIndex + 1);
        break;
      case "PageDown":
        to = Math.max(0, currentIndex - 3);
        break;
      case "PageUp":
        to = Math.min(lastIndex, currentIndex + 3);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = lastIndex;
        break;
      case "Escape":
        if (!previewing) return;
        event.preventDefault();
        backToNow();
        return;
      default:
        return;
    }
    event.preventDefault();
    if (to === currentIndex) return;
    previewMark(to);
  };

  /* ----------------------------- derived motion -------------------------- */

  const trackH = TRACK_H[path] ?? 64;
  const curve = React.useMemo(() => curvePath(path), [path]);
  const dotLeft = useTransform(dotX, (x) => `${r2(x * 100)}%`);
  const dotTop = useTransform(dotX, (x) => r2(curveY(path, x)));
  const clipW = useTransform(dotX, (x) => r2(clamp01(x) * 1000));
  const chipShift = useTransform(dotX, (x) => `${-r2(clamp01(x) * 100)}%`);
  const chipText = useTransform(dotX, (x) => {
    if (!previewing) {
      return delivered
        ? `Delivered ${time(deliveredAt)}`
        : `Now · ${time(nowMs)}`;
    }
    // Resting on a scan, the chip reads the scan's own minute, not one
    // recovered from a rounded position.
    const m = marks[previewIndex];
    const t =
      m?.scan && Math.abs(m.x - x) < 0.0006
        ? m.scan.at
        : xToTime(clamp(x, 0, nowX));
    return `${(DAYS[new Date(t).getUTCDay()] ?? "").slice(0, 3)} ${time(t)}`;
  });
  const routeProgress = useTransform(dotX, (x) => routeAt(x));

  /* ------------------------------- awake --------------------------------- */

  // The halo breathes only while the path is on screen and the page is shown.
  const [onScreen, setOnScreen] = React.useState(false);
  const [pageShown, setPageShown] = React.useState(true);
  const [pathNode, setPathNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!pathNode || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setOnScreen(e.isIntersecting);
    });
    io.observe(pathNode);
    return () => io.disconnect();
  }, [pathNode]);
  React.useEffect(() => {
    const onVisibility = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const breathing =
    motionSafe && onScreen && pageShown && !delivered && !previewing;

  /* --------------------------- the disclosure ---------------------------- */

  const changeRef = React.useRef<HTMLButtonElement | null>(null);
  const windowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [panelNode, setPanelNode] = React.useState<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = React.useState(0);
  React.useEffect(() => {
    if (!panelNode || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setPanelH(panelNode.offsetHeight));
    ro.observe(panelNode);
    return () => ro.disconnect();
  }, [panelNode]);

  const keyOf = (w: OrderWindow) => `${w.start}-${w.end}`;
  const shownKey = shownDelivery ? keyOf(shownDelivery) : "";
  const [focusWindow, setFocusWindow] = React.useState(0);

  const chooseWindow = (w: OrderWindow, el: Element | null) => {
    if (disabled) return;
    const r = el?.getBoundingClientRect();
    audio.play("plip", {
      pitch: 1.25,
      gain: 0.5,
      pan: r ? panFrom(r.left + r.width / 2, null) : 0,
    });
    setChanging(false);
    changeRef.current?.focus({ preventScroll: true });
    if (keyOf(w) === shownKey) return;
    if (delivery === undefined) setOwnDelivery(w);
    onDeliveryChange?.(w);
  };

  const openChange = () => {
    if (disabled) return;
    const i = Math.max(
      0,
      windows.findIndex((w) => keyOf(w) === shownKey),
    );
    setFocusWindow(i);
    setChanging((c) => !c);
  };

  // Focus goes into the windows once the panel exists and is open.
  const [focusIn, setFocusIn] = React.useState(false);
  React.useEffect(() => {
    if (!focusIn || !changing) return;
    const w = windows[focusWindow];
    const node = w ? windowRefs.current.get(keyOf(w)) : undefined;
    node?.focus({ preventScroll: true });
  }, [focusIn, changing, focusWindow, windows]);

  const onWindowsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = windows.length;
    if (count === 0) return;
    let to: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      to = (focusWindow + 1) % count;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = (focusWindow - 1 + count) % count;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = count - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setChanging(false);
      changeRef.current?.focus({ preventScroll: true });
      return;
    }
    if (to === null) return;
    event.preventDefault();
    setFocusWindow(to);
    setFocusIn(true);
    const w = windows[to];
    if (w) windowRefs.current.get(keyOf(w))?.focus({ preventScroll: true });
  };

  /* ----------------------------- announcements --------------------------- */

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seen, setSeen] = React.useState({
    last,
    key: shownKey,
  });
  if (seen.last !== last || seen.key !== shownKey) {
    // Frozen at the change, from the new values, in the render that flips them.
    let text = "";
    if (seen.last !== last && last >= 0) {
      const s = stages[last];
      text = delivered
        ? `Delivered at ${time(deliveredAt)}.`
        : s
          ? `${s.label}.`
          : "";
    } else if (shownDelivery) {
      text = `Delivery moved to ${date(shownDelivery.start)}, ${windowText(shownDelivery)}.`;
    }
    setSeen({ last, key: shownKey });
    if (text) setSaid((p) => ({ n: p.n + 1, text }));
  }

  /* -------------------------------- copy --------------------------------- */

  const [copied, setCopied] = React.useState(0);
  const copyTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );
  const copyTracking = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    try {
      void navigator.clipboard?.writeText(order.tracking).catch(() => {});
    } catch {
      // No clipboard here: the number is still on screen to select.
    }
    audio.play("plip", {
      pitch: 1.4,
      gain: 0.45,
      pan: panFrom(r.left + r.width / 2, null),
    });
    setCopied((c) => c + 1);
    setSaid((p) => ({ n: p.n + 1, text: "Tracking number copied." }));
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(0), 1600);
  };

  /* ------------------------------- the scans ----------------------------- */

  const [allScans, setAllScans] = React.useState(false);
  const newestFirst = [...pastScans].reverse();
  const scanLimit = 5;
  const listedScans = allScans ? newestFirst : newestFirst.slice(0, scanLimit);
  const previewedScan = previewing ? (marks[previewIndex]?.scan ?? null) : null;

  /* ------------------------------- the totals ---------------------------- */

  const subtotal = r2(items.reduce((sum, it) => sum + it.qty * it.price, 0));
  const taxShown = tax ?? r2(subtotal * 0.08);
  const total = r2(subtotal + shipping + taxShown);
  const itemCount = items.reduce((sum, it) => sum + it.qty, 0);

  /* -------------------------------- render ------------------------------- */

  const current = last >= 0 ? stages[last] : undefined;
  const pillText = delivered ? "Delivered" : (current?.label ?? "Processing");
  const latestScan = pastScans[pastScans.length - 1];
  const delayed = !delivered && latestScan?.tone === "warn";

  const etaLabel = delivered
    ? "Delivered"
    : eta === "countdown"
      ? "Arrives in"
      : "Arriving";
  const etaBig = delivered
    ? time(deliveredAt)
    : eta === "countdown"
      ? countdown
      : eta === "day"
        ? shownDelivery
          ? dayName(shownDelivery.start)
          : "Soon"
        : shownDelivery
          ? windowText(shownDelivery)
          : "Soon";
  const etaSmall = delivered
    ? `${date(deliveredAt)} · ${deliveredScan?.place ?? order.address}`
    : shownDelivery
      ? eta === "window"
        ? date(shownDelivery.start)
        : `${date(shownDelivery.start)} · ${windowText(shownDelivery)}`
      : order.address;
  const etaWidest = (() => {
    if (delivered) return "12:00 PM";
    if (eta === "countdown") return "00 h 00 min";
    if (eta === "day") return etaBig;
    return [...windows, ...(shownDelivery ? [shownDelivery] : [])]
      .map(windowText)
      .reduce((a, b) => (b.length > a.length ? b : a), "");
  })();
  const etaSpoken = delivered
    ? `Delivered ${date(deliveredAt)} at ${time(deliveredAt)}`
    : shownDelivery
      ? eta === "countdown"
        ? `Arrives in ${countdown}, window ${date(shownDelivery.start)} ${windowText(shownDelivery)}`
        : `Arriving ${date(shownDelivery.start)}, ${windowText(shownDelivery)}`
      : "Arrival to be confirmed";

  const readout = previewedScan
    ? `${date(previewedScan.at)} · ${time(previewedScan.at)} · ${previewedScan.text}`
    : delivered
      ? `Delivered · ${time(deliveredAt)}`
      : current
        ? `${current.label} · since ${time(current.at)}`
        : "Waiting for the first scan";
  const valueText = previewedScan
    ? `${date(previewedScan.at)}, ${time(previewedScan.at)}: ${previewedScan.text}`
    : delivered
      ? `Now: delivered at ${time(deliveredAt)}`
      : `Now: ${current?.label ?? "processing"}${eta === "countdown" && shownDelivery ? `, ${countdown} to the window` : ""}`;

  const nodesLit = previewing ? shownNodes : last;
  const scanDots = marks.filter(
    (m) => m.scan && !stages.some((_, i) => Math.abs(stageX(i) - m.x) < 0.012),
  );

  const header = (
    <header className="flex flex-col gap-3 p-4 @min-[40rem]:flex-row @min-[40rem]:items-start @min-[40rem]:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id={titleId}
            className="text-[15px] font-semibold text-foreground"
          >
            {title}
          </h2>
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium",
              delivered
                ? "bg-success/12 text-success"
                : delayed
                  ? "bg-warn/14 text-warn"
                  : "bg-cobalt-wash text-cobalt-bright",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                delivered
                  ? "bg-success"
                  : delayed
                    ? "bg-warn"
                    : "bg-cobalt-bright",
              )}
            />
            {delayed ? `${pillText} · running late` : pillText}
          </span>
        </div>
        <p className="truncate text-[12px] text-ink-3">
          {order.store} · {order.number} · {itemCount}{" "}
          {itemCount === 1 ? "item" : "items"}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[12px] text-ink-2">
            {order.carrier}{" "}
            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
              {order.tracking}
            </span>
          </span>
          <button
            type="button"
            disabled={disabled}
            aria-label={
              copied ? "Tracking number copied" : "Copy tracking number"
            }
            onClick={(event) => copyTracking(event.currentTarget)}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
              FOCUS,
            )}
          >
            {copied ? (
              <DrawnCheck
                key={copied}
                motionSafe={motionSafe}
                className="text-success"
              />
            ) : (
              <Copy aria-hidden className="size-3.5 shrink-0" />
            )}
          </button>
          {onHelp ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onHelp}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
                FOCUS,
              )}
            >
              <LifeBuoy aria-hidden className="size-3.5 shrink-0" />
              Get help
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1 @min-[40rem]:items-end @min-[40rem]:text-right">
        <p className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">
          {etaLabel}
        </p>
        <p className="sr-only">{etaSpoken}</p>
        <div className="grid text-[26px] leading-none font-semibold tracking-tight text-foreground">
          {eta === "day" && !delivered ? (
            <AnimatePresence initial={false}>
              <motion.span
                key={etaBig}
                aria-hidden
                className="col-start-1 row-start-1"
                initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? -distances.step : 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.base } }
                    : { duration: durations.fast }
                }
              >
                {etaBig}
              </motion.span>
            </AnimatePresence>
          ) : (
            <Roll
              text={etaBig}
              widest={etaWidest}
              motionSafe={motionSafe}
              className={cn(
                "col-start-1 row-start-1",
                delivered && "text-success",
              )}
            />
          )}
        </div>
        <div className="flex items-center gap-2 @min-[40rem]:justify-end">
          <span aria-hidden className="truncate text-[12px] text-ink-2">
            {etaSmall}
          </span>
          {windows.length > 0 && !delivered ? (
            <button
              ref={changeRef}
              type="button"
              disabled={disabled}
              aria-expanded={changing}
              aria-controls={windowsId}
              onClick={() => {
                setFocusIn(false);
                openChange();
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && !changing) {
                  event.preventDefault();
                  setFocusIn(true);
                  openChange();
                }
              }}
              className={cn(
                "inline-flex h-7 shrink-0 items-center rounded-2 px-2 text-[12px] font-medium text-cobalt-bright transition-colors hover:bg-cobalt-wash disabled:cursor-not-allowed disabled:opacity-50",
                FOCUS,
              )}
            >
              Change
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );

  const disclosure =
    windows.length > 0 && !delivered ? (
      <motion.div
        id={windowsId}
        className="overflow-hidden"
        initial={false}
        animate={{ height: changing ? panelH : 0 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        inert={!changing}
      >
        <div ref={setPanelNode} className="px-4 pb-3">
          <div
            role="group"
            aria-label="Delivery windows"
            onKeyDown={onWindowsKeyDown}
            className="flex flex-wrap gap-2 rounded-3 border border-hairline bg-surface-1 p-2"
          >
            {windows.map((w, i) => {
              const on = keyOf(w) === shownKey;
              return (
                <button
                  key={keyOf(w)}
                  ref={(node) => {
                    if (node) windowRefs.current.set(keyOf(w), node);
                    else windowRefs.current.delete(keyOf(w));
                  }}
                  type="button"
                  tabIndex={i === focusWindow ? 0 : -1}
                  aria-pressed={on}
                  onFocus={() => setFocusWindow(i)}
                  onClick={(event) => chooseWindow(w, event.currentTarget)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors",
                    on
                      ? "border-cobalt-bright/50 bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline text-foreground hover:bg-surface-2",
                    FOCUS,
                  )}
                >
                  {on ? (
                    <Check aria-hidden className="size-3.5 shrink-0" />
                  ) : null}
                  <span>
                    {(DAYS[new Date(w.start).getUTCDay()] ?? "").slice(0, 3)}{" "}
                    <span className="font-mono tabular-nums">
                      {windowText(w)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    ) : null;

  const pathSection = (
    <section
      aria-label="Shipment progress"
      className="flex flex-col gap-1 px-4"
    >
      <div className="flex h-7 items-center justify-between gap-3">
        <p aria-hidden className="grid min-w-0 text-[12px]">
          <AnimatePresence initial={false}>
            <motion.span
              key={readout}
              className={cn(
                "col-start-1 row-start-1 truncate",
                previewedScan?.tone === "warn" ? "text-warn" : "text-ink-2",
              )}
              title={readout}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.fast } }}
              transition={{ duration: durations.fast }}
            >
              {readout}
            </motion.span>
          </AnimatePresence>
        </p>
        <AnimatePresence initial={false}>
          {previewing ? (
            <motion.button
              key="now"
              type="button"
              onClick={() => {
                sliderRef.current?.focus({ preventScroll: true });
                backToNow();
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.fast } }}
              transition={{ duration: durations.fast }}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2.5 text-[11px] font-medium text-foreground hover:bg-surface-2",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3 shrink-0" />
              Back to now
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <p id={sliderHintId} className="sr-only">
        Left and Right step through the scans, Home goes to the first, End and
        Escape come back to now.
      </p>
      <ol className="sr-only">
        {stages.map((s, i) => (
          <li key={s.id} aria-current={i === last ? "step" : undefined}>
            {s.label}
            {isReached(s) ? `, ${date(s.at)} ${time(s.at)}` : ", not yet"}
          </li>
        ))}
      </ol>

      <div
        ref={(node) => {
          sliderRef.current = node;
          setPathNode(node);
        }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Shipment history"
        aria-describedby={sliderHintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((marks[currentIndex]?.x ?? nowX) * 100)}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onSliderKeyDown}
        className={cn("relative overflow-clip rounded-3 px-1", FOCUS)}
      >
        {/* The time chip rides above the dot and never leaves the track's box. */}
        <div aria-hidden className="relative mx-3 h-6">
          <motion.span
            className={cn(
              "absolute top-0.5 inline-flex h-5 items-center rounded-full px-2 font-mono text-[10px] whitespace-nowrap tabular-nums",
              previewing
                ? "bg-foreground text-background"
                : delivered
                  ? "bg-success/12 text-success"
                  : "bg-cobalt-wash text-cobalt-bright",
            )}
            style={{ left: dotLeft, x: chipShift }}
          >
            {chipText}
          </motion.span>
        </div>
        <div
          ref={trackRef}
          aria-hidden
          {...drag}
          className={cn(
            "relative mx-3 touch-pan-y select-none",
            !disabled && "cursor-grab active:cursor-grabbing",
          )}
          style={{ height: trackH }}
        >
          <svg
            viewBox={`0 0 1000 ${trackH}`}
            preserveAspectRatio="none"
            className="absolute inset-0 block h-full w-full overflow-visible"
          >
            <defs>
              <clipPath id={`${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-fill`}>
                <motion.rect
                  x={-20}
                  y={-20}
                  height={trackH + 40}
                  width={clipW}
                />
              </clipPath>
            </defs>
            <path
              d={curve}
              fill="none"
              strokeWidth={4}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-hairline-strong"
            />
            <path
              d={curve}
              fill="none"
              strokeWidth={4}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              clipPath={`url(#${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-fill)`}
              className={delivered ? "stroke-success" : "stroke-cobalt-bright"}
            />
          </svg>
          {scanDots.map((m) => (
            <span
              key={m.scan?.id}
              className={cn(
                "absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                m.scan?.tone === "warn"
                  ? "bg-warn"
                  : "bg-card ring-1 ring-ink-3/60",
              )}
              style={{
                left: `${r2(m.x * 100)}%`,
                top: r2(curveY(path, m.x)),
              }}
            />
          ))}
          {stages.map((s, i) => {
            const lit = i <= nodesLit;
            const isLast = i === n - 1;
            return (
              <span
                key={s.id}
                className={cn(
                  "absolute flex size-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-colors",
                  lit
                    ? delivered
                      ? "border-success bg-success"
                      : "border-cobalt-bright bg-cobalt-bright"
                    : "border-hairline-strong bg-card",
                  isLast && "size-4",
                )}
                style={{
                  left: `${r2(stageX(i) * 100)}%`,
                  top: r2(curveY(path, stageX(i))),
                }}
              />
            );
          })}
          {/* The live dot. */}
          <motion.span
            className="pointer-events-none absolute"
            style={{ left: dotLeft, top: dotTop }}
          >
            <motion.span
              className={cn(
                "absolute -top-3.5 -left-3.5 size-7 rounded-full",
                delivered ? "bg-success/30" : "bg-cobalt-bright/30",
              )}
              initial={false}
              animate={
                breathing
                  ? { opacity: [0.7, 0], scale: [0.6, 1.5] }
                  : { opacity: 0, scale: 0.6 }
              }
              transition={
                breathing
                  ? { duration: 1.6, ease: easings.enter, repeat: Infinity }
                  : { duration: durations.fast }
              }
            />
            <motion.span
              className={cn(
                "absolute -top-[9px] -left-[9px] flex size-[18px] items-center justify-center rounded-full border-[3px] border-card shadow-sm",
                delivered ? "bg-success" : "bg-cobalt-bright",
                previewing && "bg-foreground",
              )}
              initial={false}
              animate={{ scale: previewing ? 1.2 : 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
            <motion.span
              className="absolute -top-2.5 -left-2.5 flex size-5 items-center justify-center rounded-full bg-success text-background"
              initial={false}
              animate={{
                scale: delivered && !previewing ? 1 : 0,
                opacity: delivered && !previewing ? 1 : 0,
              }}
              transition={
                motionSafe
                  ? {
                      scale: springs.recoil,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: 0 }
              }
            >
              <Check aria-hidden className="size-3" strokeWidth={3} />
            </motion.span>
          </motion.span>
        </div>
        {/* Stage names, from a tablet up; a phone reads the current one above. */}
        <div
          aria-hidden
          className="relative mx-3 mt-2 hidden h-9 @min-[40rem]:block"
        >
          {stages.map((s, i) => {
            const x = stageX(i);
            const edge = i === 0 ? "start" : i === n - 1 ? "end" : "mid";
            return (
              <span
                key={s.id}
                className={cn(
                  "absolute top-0 flex w-max max-w-[9rem] flex-col text-[12px] leading-tight",
                  edge === "start"
                    ? "items-start text-left"
                    : edge === "end"
                      ? "-translate-x-full items-end text-right"
                      : "-translate-x-1/2 items-center text-center",
                )}
                style={{ left: `${r2(x * 100)}%` }}
              >
                <span
                  className={cn(
                    "truncate font-medium",
                    i <= last ? "text-foreground" : "text-ink-3",
                  )}
                >
                  {s.label}
                </span>
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {isReached(s)
                    ? `${(DAYS[new Date(s.at).getUTCDay()] ?? "").slice(0, 3)} ${time(s.at)}`
                    : "Expected"}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );

  const scansBlock = (
    <section
      aria-labelledby={`${uid}-scans`}
      className="flex min-w-0 flex-col gap-2"
    >
      <h3
        id={`${uid}-scans`}
        className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase"
      >
        Scans
      </h3>
      {listedScans.length === 0 ? (
        <p className="rounded-2 border border-dashed border-hairline px-3 py-4 text-[12px] text-ink-3">
          No scans yet. The carrier logs the first one when it collects the
          parcel.
        </p>
      ) : null}
      <ol role="list" className="flex flex-col">
        {listedScans.map((scan, i) => {
          const prev = listedScans[i - 1];
          const newDay = !prev || dayKey(prev.at) !== dayKey(scan.at);
          const markIndex = marks.findIndex((m) => m.scan?.id === scan.id);
          const on = previewedScan?.id === scan.id;
          return (
            <li key={scan.id} className="flex flex-col">
              {newDay ? (
                <span className="pt-1.5 pb-1 text-[11px] font-medium text-ink-3">
                  {date(scan.at)}
                </span>
              ) : null}
              <motion.button
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => {
                  if (on) backToNow();
                  else previewMark(markIndex);
                }}
                initial={
                  i >= scanLimit && motionSafe
                    ? { opacity: 0, y: -distances.nudge }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.snap,
                        delay:
                          Math.max(0, i - scanLimit) *
                          cascade(listedScans.length),
                      }
                    : { duration: 0 }
                }
                className={cn(
                  "flex items-start gap-3 rounded-2 px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed",
                  on ? "bg-cobalt-wash" : "hover:bg-surface-2",
                  FOCUS_IN,
                )}
              >
                <span className="w-14 shrink-0 pt-px font-mono text-[11px] text-ink-3 tabular-nums">
                  {time(scan.at)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "text-[13px] leading-snug",
                      scan.tone === "warn" ? "text-warn" : "text-foreground",
                    )}
                  >
                    {scan.tone === "warn" ? (
                      <TriangleAlert
                        aria-hidden
                        className="mr-1 inline size-3.5 -translate-y-px"
                      />
                    ) : null}
                    {scan.text}
                  </span>
                  {scan.place ? (
                    <span className="truncate text-[11px] text-ink-3">
                      {scan.place}
                    </span>
                  ) : null}
                </span>
              </motion.button>
            </li>
          );
        })}
      </ol>
      {newestFirst.length > scanLimit ? (
        <button
          type="button"
          aria-expanded={allScans}
          onClick={() => setAllScans((v) => !v)}
          className={cn(
            "inline-flex h-7 items-center self-start rounded-2 px-2 text-[12px] font-medium text-cobalt-bright hover:bg-cobalt-wash",
            FOCUS,
          )}
        >
          {allScans ? "Show fewer" : `Show all ${newestFirst.length}`}
        </button>
      ) : null}
    </section>
  );

  const itemsBlock = (
    <section
      aria-labelledby={`${uid}-items`}
      className="flex min-w-0 flex-col gap-2"
    >
      <h3
        id={`${uid}-items`}
        className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase"
      >
        In this parcel
      </h3>
      <ul role="list" className="flex flex-col gap-2.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3">
            <ItemArt kind={it.kind} tint={it.tint} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className="truncate text-[13px] text-foreground"
                title={it.name}
              >
                {it.name}
              </span>
              <span className="truncate text-[11px] text-ink-3">
                {it.variant ? `${it.variant} · ` : ""}
                {it.qty} × {money(it.price)}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[12px] text-foreground tabular-nums">
              {money(r2(it.qty * it.price))}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-1 flex flex-col gap-1 border-t border-hairline pt-2.5 text-[12px]">
        {[
          ["Subtotal", money(subtotal)],
          ["Shipping", shipping === 0 ? "Free" : money(shipping)],
          ["Tax", money(taxShown)],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">{k}</dt>
            <dd className="font-mono text-ink-2 tabular-nums">{v}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 pt-1 text-[13px]">
          <dt className="font-medium text-foreground">Total</dt>
          <dd className="font-mono font-semibold text-foreground tabular-nums">
            {money(total)}
          </dd>
        </div>
      </dl>
      <p className="text-[11px] leading-snug text-ink-3">{order.address}</p>
    </section>
  );

  const body = () => {
    if (status === "loading") {
      return (
        <div aria-busy="true" className="flex flex-col gap-4 p-4">
          <p className="sr-only">Loading tracking.</p>
          <div className="flex items-center justify-between gap-3">
            <span className="h-5 w-40 rounded-1 bg-surface-2" />
            <span className="h-7 w-28 rounded-1 bg-surface-2" />
          </div>
          <span className="h-16 rounded-3 bg-surface-2" />
          <div className="grid gap-4 @min-[40rem]:grid-cols-2">
            <span className="h-24 rounded-3 bg-surface-2" />
            <span className="h-24 rounded-3 bg-surface-2" />
          </div>
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Tracking did not load.</p>
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
    const hasMap = map !== "none";
    return (
      <>
        {header}
        {disclosure}
        {pathSection}
        <div
          className={cn(
            "grid gap-5 p-4 @min-[40rem]:grid-cols-2",
            hasMap
              ? "@min-[60rem]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]"
              : "@min-[60rem]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
          )}
        >
          {hasMap ? (
            <div className="min-w-0 @min-[40rem]:col-start-1 @min-[40rem]:row-start-1">
              <RouteMap
                style={map}
                progress={routeProgress}
                order={order}
                delivered={delivered}
                motionSafe={motionSafe}
                disabled={disabled}
              />
            </div>
          ) : null}
          <div
            className={cn(
              "min-w-0 @min-[40rem]:col-start-1",
              hasMap
                ? "@min-[40rem]:row-start-2 @min-[60rem]:col-start-2 @min-[60rem]:row-start-1"
                : "@min-[40rem]:row-start-1",
            )}
          >
            {scansBlock}
          </div>
          <div
            className={cn(
              "min-w-0 @min-[40rem]:col-start-2 @min-[40rem]:row-start-1",
              hasMap &&
                "@min-[40rem]:row-span-2 @min-[60rem]:col-start-3 @min-[60rem]:row-span-1",
            )}
          >
            {itemsBlock}
          </div>
        </div>
      </>
    );
  };

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative max-h-[560px] w-full [scrollbar-width:thin] overflow-x-hidden overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      {status === "ready" ? null : (
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
      )}
      {body()}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
