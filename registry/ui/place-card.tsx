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
import { Navigation } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PlacePoint = readonly [number, number];

export type PlaceMap = {
  /** The world the rest is drawn in; the frame shows its middle, cropped to fit. */
  width: number;
  height: number;
  /** Street centre lines; major roads draw wider. */
  streets: { points: PlacePoint[]; major?: boolean }[];
  /** The river's centre line and its width. */
  river?: { points: PlacePoint[]; width: number };
  parks?: PlacePoint[][];
  blocks?: { x: number; y: number; w: number; h: number }[];
  /** The venue's own building, drawn in the pin's colour. */
  venue?: { x: number; y: number; w: number; h: number };
  /** The walk, from "you" (its first point) to the door (its last), along the streets. */
  path: PlacePoint[];
};

export type PlaceStep = {
  id: string;
  /** One short instruction. */
  text: string;
  /** How far this step walks, in metres. */
  meters: number;
  /** The index in `map.path` where this step starts; it runs to the next step's start. */
  at: number;
};

export type PlaceRoute = "dashes" | "dots" | "line";
export type PlaceHours = "12h" | "24h";
export type PlaceCardSize = "sm" | "md" | "lg";

export type PlaceCardProps = {
  /** The venue: the card's heading. @default "Coldbrook Roasters" */
  name?: string;
  /** What kind of place it is. @default "Coffee and bakery" */
  kind?: string;
  /** @default "14 Basin Street" */
  address?: string;
  /** The moment the hours are read at (Date or ms). Without it the card keeps its own clock, from the first frame after it mounts. */
  now?: Date | number;
  /** The venue's IANA time zone, used to read `now`. @default "UTC" */
  timeZone?: string;
  /** Today's opening time, 24-hour "HH:MM". @default "07:30" */
  opensAt?: string;
  /** Today's closing time, 24-hour "HH:MM"; earlier than `opensAt` means after midnight. @default "22:00" */
  closesAt?: string;
  /** The neighbourhood drawn on the card. @default defaultPlaceMap */
  map?: PlaceMap;
  /** The walk, as numbered steps over `map.path`. @default defaultPlaceSteps */
  steps?: PlaceStep[];
  /** Controlled: whether the directions are open. */
  expanded?: boolean;
  /** Initial directions state when uncontrolled. @default false */
  defaultExpanded?: boolean;
  /** Fires from the press or the Escape that opened or closed the directions. */
  onExpandedChange?: (expanded: boolean) => void;
  /** A step was chosen from the list, with its index. */
  onStepSelect?: (index: number) => void;
  /** How far looking at the card zooms the map toward the pin. @default 1.8 */
  zoom?: number;
  /** How the walk is drawn: dashes that march to the door, footstep dots that march, or a still line. @default "dashes" */
  route?: PlaceRoute;
  /** The clock the hours are read on: the ring's dial and every time on the card. @default "24h" */
  hours?: PlaceHours;
  /** How long the walk takes to draw from you to the door, in ms. @default 700 */
  drawDuration?: number;
  /** Walking pace that turns the steps' metres into minutes, in metres a minute. @default 80 */
  walkSpeed?: number;
  /** The directions button's text while closed. @default "Directions" */
  directionsLabel?: string;
  /** The same button's text while the steps are open; the button is always as wide as the longer one. @default "Hide directions" */
  closeLabel?: string;
  /** The map's height: 136, 168 or 200 px. @default "md" */
  size?: PlaceCardSize;
  /** The walk, "you" and the hours arc, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The pin's pigment, any CSS colour; it is drawn at a fixed lightness. @default "var(--danger)" */
  pinColor?: string;
  /** Play the directions' swish and a plip per chosen step. Off unless asked for. @default false */
  sound?: boolean;
  /** Nothing zooms or opens, and the card is drawn at reduced strength. @default false */
  disabled?: boolean;
  className?: string;
};

/* ---------------------------------------------------------------- map -- */

const WORLD_W = 320;
const WORLD_H = 200;

const STREETS: PlaceMap["streets"] = [
  {
    points: [
      [-10, 28],
      [330, 24],
    ],
  },
  {
    points: [
      [-10, 60],
      [150, 58],
      [330, 54],
    ],
    major: true,
  },
  {
    points: [
      [-10, 104],
      [330, 104],
    ],
  },
  {
    points: [
      [170, 84],
      [330, 84],
    ],
  },
  {
    points: [
      [-10, 150],
      [330, 156],
    ],
    major: true,
  },
  {
    points: [
      [44, -10],
      [48, 210],
    ],
  },
  {
    points: [
      [92, -10],
      [92, 210],
    ],
    major: true,
  },
  {
    points: [
      [130, -10],
      [130, 210],
    ],
  },
  {
    points: [
      [170, 58],
      [170, 156],
    ],
  },
  {
    points: [
      [214, -10],
      [218, 210],
    ],
    major: true,
  },
  {
    points: [
      [264, -10],
      [260, 210],
    ],
  },
];

const RIVER: PlacePoint[] = [
  [112, -12],
  [138, 40],
  [150, 80],
  [154, 104],
  [162, 130],
  [186, 170],
  [206, 212],
];

const PARKS: PlacePoint[][] = [
  [
    [222, 32],
    [256, 31],
    [255, 48],
    [223, 50],
  ],
  [
    [97, 110],
    [124, 110],
    [124, 143],
    [97, 145],
  ],
];

const VENUE = { x: 176, y: 63, w: 34, h: 16 };

/** Where the river runs at height y, so no building is set in the water. */
function riverX(y: number): number {
  for (let i = 1; i < RIVER.length; i += 1) {
    const a = RIVER[i - 1];
    const b = RIVER[i];
    if (a && b && y >= a[1] && y <= b[1]) {
      return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
    }
  }
  return -999;
}

/** Buildings for every block the streets leave, from a fixed seed. */
function buildBlocks(): NonNullable<PlaceMap["blocks"]> {
  const xs = [-10, 46, 92, 130, 170, 216, 262, 330];
  const ys = [-10, 26, 58, 84, 104, 153, 210];
  let seed = 0x5eed_1273;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffff_ffff;
  };
  const out: NonNullable<PlaceMap["blocks"]> = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x0 = (xs[i] ?? 0) + 6;
      const x1 = (xs[i + 1] ?? 0) - 6;
      const y0 = (ys[j] ?? 0) + 6;
      const y1 = (ys[j + 1] ?? 0) - 6;
      if (x1 - x0 < 10 || y1 - y0 < 8) continue;
      // The short street (Basin Street) only splits the blocks east of the river.
      if (ys[j] === 84 && (xs[i] ?? 0) < 170) continue;
      if (ys[j + 1] === 84 && (xs[i] ?? 0) < 170) {
        const yy = (ys[j + 2] ?? 104) - 6;
        if (yy - y0 < 8) continue;
      }
      const cy = (y0 + y1) / 2;
      const rx = riverX(cy);
      if (rx > x0 - 14 && rx < x1 + 14) continue;
      const inPark = PARKS.some((p) => {
        const a = p[0];
        const c = p[2];
        return a && c && x0 < c[0] && x1 > a[0] && y0 < c[1] && y1 > a[1];
      });
      if (inPark) continue;
      const bottom =
        ys[j + 1] === 84 && (xs[i] ?? 0) < 170 ? (ys[j + 2] ?? 104) - 6 : y1;
      if (
        x0 < VENUE.x + VENUE.w &&
        x1 > VENUE.x &&
        y0 < VENUE.y + VENUE.h &&
        bottom > VENUE.y
      ) {
        continue;
      }
      const split = rand() > 0.45 && x1 - x0 > 26;
      if (split) {
        const cut = Math.round(x0 + (x1 - x0) * (0.4 + rand() * 0.2));
        out.push({ x: x0, y: y0, w: cut - 2 - x0, h: Math.round(bottom - y0) });
        out.push({
          x: cut + 2,
          y: y0,
          w: x1 - cut - 2,
          h: Math.round(bottom - y0),
        });
      } else {
        out.push({ x: x0, y: y0, w: x1 - x0, h: Math.round(bottom - y0) });
      }
    }
  }
  return out;
}

export const defaultPlaceMap: PlaceMap = {
  width: WORLD_W,
  height: WORLD_H,
  streets: STREETS,
  river: { points: RIVER, width: 15 },
  parks: PARKS,
  blocks: buildBlocks(),
  venue: VENUE,
  path: [
    [130, 124],
    [130, 104],
    [170, 104],
    [170, 84],
    [196, 84],
    [196, 79],
  ],
};

export const defaultPlaceSteps: PlaceStep[] = [
  { id: "mill", text: "North on Mill Street", meters: 60, at: 0 },
  {
    id: "weir",
    text: "Right over Weir Bridge",
    meters: 180,
    at: 1,
  },
  { id: "kiln", text: "Left on Kiln Row", meters: 70, at: 2 },
  { id: "basin", text: "Right on Basin Street", meters: 90, at: 3 },
];

/* ------------------------------------------------------------ helpers -- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const MAP_H: Record<PlaceCardSize, number> = { sm: 136, md: 168, lg: 200 };

const toD = (pts: readonly PlacePoint[]) =>
  pts.length === 0
    ? ""
    : `M ${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L ")}`;

/** A smooth line through points: quadratic curves through the midpoints. */
function smoothD(pts: readonly PlacePoint[]): string {
  const first = pts[0];
  if (!first) return "";
  let d = `M ${r2(first[0])} ${r2(first[1])}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const p = pts[i];
    const q = pts[i + 1];
    if (!p || !q) continue;
    d += ` Q ${r2(p[0])} ${r2(p[1])} ${r2((p[0] + q[0]) / 2)} ${r2((p[1] + q[1]) / 2)}`;
  }
  const last = pts[pts.length - 1];
  if (last && pts.length > 1) d += ` L ${r2(last[0])} ${r2(last[1])}`;
  return d;
}

function lengthOf(pts: readonly PlacePoint[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a && b) total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** The first `share` of a polyline's length, as a path. */
function partOf(pts: readonly PlacePoint[], share: number): string {
  const total = lengthOf(pts);
  const want = clamp(share, 0, 1) * total;
  if (want <= 0.01) return "";
  const out: PlacePoint[] = [];
  let run = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    if (out.length === 0) out.push(a);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (run + len >= want) {
      const t = len > 0 ? (want - run) / len : 0;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      return toD(out);
    }
    out.push(b);
    run += len;
  }
  return toD(out);
}

/** Minutes after midnight of an "HH:MM" string; NaN-safe. */
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((v) => Number(v));
  return clamp(((h ?? 0) || 0) * 60 + ((m ?? 0) || 0), 0, 1439);
}

/** Minutes after midnight of a moment, read in a time zone; the same on the server and in the browser. */
function minutesIn(at: Date | number, timeZone: string): number {
  const date = typeof at === "number" ? new Date(at) : at;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return (h % 24) * 60 + m;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function clockText(min: number, hours: PlaceHours): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (hours === "24h") {
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? "am" : "pm";
  return mm === 0
    ? `${h12} ${ap}`
    : `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
}

function spanText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

type Opening = {
  open: boolean;
  /** Minutes until it closes (open) or opens (closed). */
  left: number;
};

function openingAt(now: number, opens: number, closes: number): Opening {
  const overnight = closes <= opens;
  const open = overnight
    ? now >= opens || now < closes
    : now >= opens && now < closes;
  const target = open ? closes : opens;
  return { open, left: (target - now + 1440) % 1440 };
}

/* --------------------------------------------------------------- ring -- */

const RING = 56;
const RC = RING / 2;

function polar(r: number, minute: number, dialMinutes: number) {
  const a = (minute / dialMinutes) * Math.PI * 2 - Math.PI / 2;
  return [r3(RC + r * Math.cos(a)), r3(RC + r * Math.sin(a))] as const;
}

function arcD(r: number, from: number, len: number, dial: number): string {
  if (len <= 0.5) return "";
  const full = len >= dial - 0.5;
  if (full) {
    const [ax, ay] = polar(r, from, dial);
    const [bx, by] = polar(r, from + dial / 2, dial);
    return `M ${ax} ${ay} A ${r} ${r} 0 1 1 ${bx} ${by} A ${r} ${r} 0 1 1 ${ax} ${ay}`;
  }
  const [ax, ay] = polar(r, from, dial);
  const [bx, by] = polar(r, from + len, dial);
  const large = len > dial / 2 ? 1 : 0;
  return `M ${ax} ${ay} A ${r} ${r} 0 ${large} 1 ${bx} ${by}`;
}

/**
 * A clock dial around the closing time: a faint band for the opening hours,
 * an arc from now to closing (or, closed, a dashed arc to opening) and a dot
 * at now. The arc's start and length are springs, so a later `now` sweeps it.
 */
function HoursRing({
  now,
  opens,
  closes,
  hours,
  accent,
  motionSafe,
}: {
  now: number | null;
  opens: number;
  closes: number;
  hours: PlaceHours;
  accent: string;
  motionSafe: boolean;
}) {
  const dial = hours === "12h" ? 720 : 1440;
  const state = now === null ? null : openingAt(now, opens, closes);
  const span = (closes - opens + 1440) % 1440 || 1440;
  const start = useMotionValue(now ?? 0);
  const len = useMotionValue(state ? Math.min(state.left, dial) : 0);
  const shown = React.useRef({ now, left: state?.left ?? 0, dial });
  const sweeps = React.useRef<AnimationPlaybackControls[]>([]);

  // A later `now` sweeps the arc forward on glide. The sweep is stopped only
  // by the next one, never by an effect re-run, so it always lands.
  React.useEffect(() => {
    const s = shown.current;
    const left = state?.left ?? 0;
    if (now === null) return;
    if (s.now === now && s.left === left && s.dial === dial) return;
    shown.current = { now, left, dial };
    for (const c of sweeps.current) c.stop();
    sweeps.current = [];
    const nextLen = Math.min(left, dial);
    if (!motionSafe || s.now === null || s.dial !== dial) {
      start.jump(now);
      len.jump(nextLen);
      return;
    }
    const nextStart = start.get() + ((now - s.now + 1440) % 1440);
    sweeps.current = [
      animate(start, nextStart, springs.glide),
      animate(len, nextLen, springs.glide),
    ];
  }, [now, state?.left, dial, motionSafe, start, len]);

  React.useEffect(
    () => () => {
      for (const c of sweeps.current) c.stop();
    },
    [],
  );

  const arc = useTransform(
    [start, len] as MotionValue<number>[],
    ([a = 0, l = 0]: number[]) => arcD(20.5, a, l, dial),
  );
  const dot = useTransform(start, (a) => polar(20.5, a, dial));
  const dotX = useTransform(dot, (p) => p[0]);
  const dotY = useTransform(dot, (p) => p[1]);

  const ticks = Array.from({ length: hours === "12h" ? 12 : 24 }, (_, i) => {
    const major = hours === "12h" ? i % 3 === 0 : i % 6 === 0;
    const m = i * 60;
    const [x1, y1] = polar(27, m, dial);
    const [x2, y2] = polar(major ? 23.5 : 25.2, m, dial);
    return { i, x1, y1, x2, y2, major };
  });

  return (
    <span
      aria-hidden
      className="relative block size-14 shrink-0"
      style={
        {
          "--arc": state?.open ? accent : "var(--ink-3)",
        } as React.CSSProperties
      }
    >
      <svg
        viewBox={`0 0 ${RING} ${RING}`}
        className="block size-14 overflow-visible"
      >
        {ticks.map((t) => (
          <line
            key={t.i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            strokeWidth={t.major ? 1.2 : 0.8}
            strokeLinecap="round"
            className={t.major ? "stroke-ink-3" : "stroke-hairline-strong"}
          />
        ))}
        <path
          d={
            span < dial
              ? arcD(20.5, opens, span, dial)
              : arcD(20.5, opens, dial, dial)
          }
          fill="none"
          strokeWidth={3}
          className="stroke-hairline-strong"
        />
        {state ? (
          <>
            <motion.path
              d={arc}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={state.open ? "none" : "2 3"}
              className="stroke-(--arc)"
            />
            <motion.circle
              cx={dotX}
              cy={dotY}
              r={2.6}
              className="fill-foreground"
            />
          </>
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[10px] leading-none text-foreground tabular-nums">
          {clockText(state && !state.open ? opens : closes, hours)}
        </span>
      </span>
    </span>
  );
}

/* ---------------------------------------------------------- component -- */

type Latest = { looking: boolean };

/**
 * A venue card whose map finds the door as you look. Hovering the card, or
 * moving keyboard focus into it, zooms the map toward the pin on the glide
 * spring — the view closes in about a point by the pin, so the pin holds
 * still while the streets grow — and then draws the walk from you to the
 * door, after which the dashes march toward the door and the pin hops once
 * on the recoil spring. Markers and the walk keep their size on screen as
 * the map zooms, and the streets thin as they would on a real map.
 *
 * Under the map, a dial around the closing time shows the opening hours and
 * how long is left from `now`. Directions opens the card into numbered
 * steps, its height gliding open; choosing a step lights its stretch of the
 * walk. It is a real disclosure: focus moves to the first step, Up and Down
 * move between steps, Escape closes it and focus returns to the button.
 * Under reduced motion nothing zooms, marches or hops: the walk fades in
 * whole and the list opens without travel.
 */
export function PlaceCard({
  name = "Coldbrook Roasters",
  kind = "Coffee and bakery",
  address = "14 Basin Street",
  now,
  timeZone = "UTC",
  opensAt = "07:30",
  closesAt = "22:00",
  map = defaultPlaceMap,
  steps = defaultPlaceSteps,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onStepSelect,
  zoom = 1.8,
  route = "dashes",
  hours = "24h",
  drawDuration = 700,
  walkSpeed = 80,
  directionsLabel = "Directions",
  closeLabel = "Hide directions",
  size = "md",
  accent = "var(--accent-bright)",
  pinColor = "var(--danger)",
  sound = false,
  disabled = false,
  className,
}: PlaceCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const nameId = `${uid}-name`;
  const listId = `${uid}-steps`;
  const zoomTo = clamp(zoom, 1, 3);
  const mapH = MAP_H[size] ?? MAP_H.md;

  const [ownOpen, setOwnOpen] = React.useState(defaultExpanded);
  const isOpen = expanded ?? ownOpen;
  const [hover, setHover] = React.useState(false);
  const [focusWithin, setFocusWithin] = React.useState(false);
  const looking = !disabled && (hover || focusWithin || isOpen);
  const [step, setStep] = React.useState(0);
  const [spoken, setSpoken] = React.useState("");
  const [onScreen, setOnScreen] = React.useState(true);
  const [pageVisible, setPageVisible] = React.useState(true);
  const [drawn, setDrawn] = React.useState(false);

  // The card's own clock, only when the host gives it none: read after
  // mount, so the server and the first browser render agree.
  const [clock, setClock] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (now !== undefined) return;
    const tick = () => setClock(Date.now());
    const first = window.setTimeout(tick, 0);
    const every = window.setInterval(() => {
      if (!document.hidden) tick();
    }, 30_000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [now]);
  const moment = now ?? clock;
  const nowMin = moment === null ? null : minutesIn(moment, timeZone);
  const opens = minutesOf(opensAt);
  const closes = minutesOf(closesAt);
  const opening = nowMin === null ? null : openingAt(nowMin, opens, closes);

  const meters = steps.reduce((sum, s) => sum + Math.max(0, s.meters), 0);
  const walkMin = Math.max(1, Math.round(meters / Math.max(1, walkSpeed)));

  /* ---- map geometry ---- */
  const path = map.path;
  const you = path[0] ?? [map.width / 2, map.height / 2];
  const door = path[path.length - 1] ?? you;
  // The view closes in about a point between the door and the middle of the
  // walk, so the whole walk stays in frame as it grows.
  const xsOf = path.map((p) => p[0]);
  const ysOf = path.map((p) => p[1]);
  const mid: PlacePoint = [
    (Math.min(...xsOf) + Math.max(...xsOf)) / 2,
    (Math.min(...ysOf) + Math.max(...ysOf)) / 2,
  ];
  const focus: PlacePoint = [
    door[0] + (mid[0] - door[0]) * 0.45,
    door[1] + (mid[1] - door[1]) * 0.45,
  ];

  const look = useMotionValue(0);
  const draw = useMotionValue(0);
  const routeOpacity = useMotionValue(0);
  const march = useMotionValue(0);
  const hop = useMotionValue(0);
  const markX = useMotionValue(you[0]);
  const markY = useMotionValue(you[1]);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const rootRef = React.useRef<HTMLElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const stepNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const focusFirst = React.useRef(false);
  const latest = React.useRef<Latest>({ looking: false });

  const run = React.useCallback((key: string, c: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, c);
  }, []);
  const halt = React.useCallback((key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  }, []);

  React.useEffect(() => {
    latest.current = { looking };
  });

  // Looking: zoom on glide, then draw the walk, then the pin hops.
  React.useEffect(() => {
    if (looking) {
      if (!motionSafe) {
        halt("look");
        look.jump(0);
        draw.jump(1);
        run(
          "routeOpacity",
          animate(routeOpacity, 1, {
            duration: durations.base,
            ease: easings.enter,
          }),
        );
        const t = window.setTimeout(() => setDrawn(true), 0);
        return () => window.clearTimeout(t);
      }
      run("look", animate(look, 1, springs.glide));
      halt("routeOpacity");
      routeOpacity.jump(1);
      if (draw.get() >= 0.999) {
        const t = window.setTimeout(() => setDrawn(true), 0);
        return () => window.clearTimeout(t);
      }
      run(
        "draw",
        animate(draw, 1, {
          duration: Math.max(0.1, drawDuration / 1000),
          ease: easings.move,
          delay: 0.12,
          onComplete: () => {
            if (!latest.current.looking) return;
            setDrawn(true);
            run(
              "hop",
              animate(hop, 1, {
                duration: durations.fast,
                ease: easings.enter,
                onComplete: () => run("hop", animate(hop, 0, springs.recoil)),
              }),
            );
          },
        }),
      );
      return;
    }
    const t = window.setTimeout(() => setDrawn(false), 0);
    run(
      "routeOpacity",
      animate(routeOpacity, 0, {
        ...exitFor(durations.base),
        onComplete: () => draw.jump(0),
      }),
    );
    if (motionSafe) run("look", animate(look, 0, springs.glide));
    else look.jump(0);
    halt("hop");
    hop.jump(0);
    return () => window.clearTimeout(t);
  }, [
    looking,
    motionSafe,
    drawDuration,
    look,
    draw,
    routeOpacity,
    hop,
    run,
    halt,
  ]);

  // The march: only while looking, drawn, on screen and the page visible.
  const period = route === "dots" ? 6 : route === "dashes" ? 11 : 0;
  const marching =
    looking && drawn && onScreen && pageVisible && motionSafe && period > 0;
  React.useEffect(() => {
    if (!marching) {
      halt("march");
      return;
    }
    march.jump(0);
    run(
      "march",
      animate(march, -period, {
        duration: 0.9,
        ease: "linear",
        repeat: Infinity,
      }),
    );
    return () => halt("march");
  }, [marching, period, march, run, halt]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setOnScreen(e.isIntersecting);
    });
    io.observe(root);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // The chosen step's start: the marker glides along the walk to it.
  const chosenStep = steps[clamp(step, 0, Math.max(0, steps.length - 1))];
  const stepFrom = chosenStep ? clamp(chosenStep.at, 0, path.length - 1) : 0;
  const nextStep = steps[step + 1];
  const stepTo = nextStep
    ? clamp(nextStep.at, stepFrom, path.length - 1)
    : path.length - 1;
  const from = path[stepFrom] ?? you;
  React.useEffect(() => {
    if (!motionSafe) {
      markX.jump(from[0]);
      markY.jump(from[1]);
      return;
    }
    const a = animate(markX, from[0], springs.glide);
    const b = animate(markY, from[1], springs.glide);
    return () => {
      a.stop();
      b.stop();
    };
  }, [from, motionSafe, markX, markY]);

  React.useEffect(() => {
    if (!isOpen || !focusFirst.current) return;
    focusFirst.current = false;
    const first = steps[0];
    const node = first ? stepNodes.current.get(first.id) : undefined;
    node?.focus({ preventScroll: true });
  }, [isOpen, steps]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const setOpen = (next: boolean) => {
    if (disabled || next === isOpen) return;
    if (next) {
      focusFirst.current = true;
      setStep(0);
    } else if (rootRef.current?.contains(document.activeElement)) {
      buttonRef.current?.focus({ preventScroll: true });
    }
    if (expanded === undefined) setOwnOpen(next);
    onExpandedChange?.(next);
    audio.play("swish", {
      pitch: next ? 1.1 : 0.85,
      gain: 0.45,
      pan: panOf(buttonRef.current),
    });
  };

  const choose = (index: number, focus: boolean) => {
    const s = steps[index];
    if (!s) return;
    const node = stepNodes.current.get(s.id);
    if (focus) node?.focus({ preventScroll: true });
    if (index === step) return;
    setStep(index);
    setSpoken(`Step ${index + 1} of ${steps.length}: ${s.text}, ${s.meters} m`);
    onStepSelect?.(index);
    audio.play("plip", {
      pitch: r2(semitones(index * 2)),
      gain: 0.45,
      pan: panOf(node),
    });
  };

  const onStepKey = (index: number, event: React.KeyboardEvent) => {
    const last = steps.length - 1;
    const to =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? Math.min(last, index + 1)
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (to < 0) return;
    event.preventDefault();
    choose(to, true);
  };

  /* ---- per-frame map values ---- */
  const scale = useTransform(look, (k) => 1 + (zoomTo - 1) * k);
  const viewBox = useTransform(scale, (s) => {
    const w = map.width / s;
    const h = map.height / s;
    return `${r3(focus[0] * (1 - 1 / s))} ${r3(focus[1] * (1 - 1 / s))} ${r3(w)} ${r3(h)}`;
  });
  // Streets thin as the map zooms, as they would on a real map; markers and
  // the walk keep their size on screen.
  const majorW = useTransform(scale, (s) => r3(6 / Math.pow(s, 0.6)));
  const minorW = useTransform(scale, (s) => r3(3.4 / Math.pow(s, 0.6)));
  const inv = useTransform(scale, (s) => r3(1 / s));
  const routeW = useTransform(scale, (s) =>
    r3((route === "dots" ? 3.4 : 2.6) / s),
  );
  const dash = useTransform(scale, (s) =>
    route === "dashes"
      ? `${r3(6 / s)} ${r3(5 / s)}`
      : route === "dots"
        ? `${r3(0.01 / s)} ${r3(6 / s)}`
        : "none",
  );
  const dashOffset = useTransform(
    [march, scale] as MotionValue<number>[],
    ([m = 0, s = 1]: number[]) => r3(m / s),
  );
  const walk = useTransform(draw, (d) => partOf(path, d));
  const pinY = useTransform(
    [hop, scale] as MotionValue<number>[],
    ([h = 0, s = 1]: number[]) => r3((-7 * h) / s),
  );
  const shadowScale = useTransform(
    [hop, scale] as MotionValue<number>[],
    ([h = 0, s = 1]: number[]) => r3((1 - 0.35 * h) / s),
  );
  const highlightW = useTransform(scale, (s) => r3(7 / s));
  const markR = useTransform(scale, (s) => r3(4.5 / s));
  const markStroke = useTransform(scale, (s) => r3(2 / s));

  const segment = toD(path.slice(stepFrom, stepTo + 1));
  const pinFill = `oklch(from ${pinColor} 0.62 0.19 h)`;
  const [dx, dy] = door;

  const statusTone =
    opening === null
      ? "text-ink-2"
      : !opening.open
        ? "text-danger"
        : opening.left <= 60
          ? "text-warn"
          : "text-success";
  const statusWord =
    opening === null
      ? "Hours"
      : !opening.open
        ? "Closed"
        : opening.left <= 60
          ? "Closing soon"
          : "Open";
  const statusLine =
    opening === null
      ? `${clockText(opens, hours)} to ${clockText(closes, hours)}`
      : opening.open
        ? `Closes in ${spanText(opening.left)}`
        : `Opens at ${clockText(opens, hours)}`;

  return (
    <article
      ref={rootRef}
      aria-labelledby={nameId}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (!(to instanceof Node) || !event.currentTarget.contains(to)) {
          setFocusWithin(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          // Handled where focus is, inside the card; the stage must not
          // also take this Escape.
          event.preventDefault();
          setOpen(false);
        }
      }}
      className={cn(
        "w-full max-w-80 overflow-clip rounded-4 border border-hairline bg-card",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        role="img"
        aria-label={`Map: a ${walkMin} minute walk from you to ${name}`}
        className="relative overflow-clip border-b border-hairline bg-surface-2"
        style={{ height: mapH }}
      >
        <motion.svg
          aria-hidden
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid slice"
          className="block size-full"
        >
          <rect
            x={-20}
            y={-20}
            width={map.width + 40}
            height={map.height + 40}
            className="fill-surface-2"
          />
          {(map.parks ?? []).map((p, i) => (
            <path
              key={i}
              d={`${toD(p)} Z`}
              style={{
                fill: "color-mix(in oklab, var(--success) 20%, var(--bg-2))",
              }}
            />
          ))}
          {map.river ? (
            <path
              d={smoothD(map.river.points)}
              fill="none"
              strokeWidth={map.river.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                stroke: "color-mix(in oklab, var(--accent) 26%, var(--bg-2))",
              }}
            />
          ) : null}
          {(map.blocks ?? []).map((b, i) => (
            <rect
              key={i}
              x={b.x}
              y={b.y}
              width={Math.max(0, b.w)}
              height={Math.max(0, b.h)}
              rx={2}
              style={{
                fill: "color-mix(in oklab, var(--ink-3) 13%, var(--bg-2))",
              }}
            />
          ))}
          {map.venue ? (
            <rect
              x={map.venue.x}
              y={map.venue.y}
              width={map.venue.w}
              height={map.venue.h}
              rx={2}
              style={{
                fill: `color-mix(in oklab, ${pinFill} 30%, var(--bg-2))`,
              }}
            />
          ) : null}
          <motion.g
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={minorW}
            style={{
              stroke: "color-mix(in oklab, var(--ink) 12%, var(--bg-2))",
            }}
          >
            {map.streets
              .filter((s) => !s.major)
              .map((s, i) => (
                <path key={i} d={toD(s.points)} />
              ))}
          </motion.g>
          <motion.g
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={majorW}
            style={{
              stroke: "color-mix(in oklab, var(--ink) 18%, var(--bg-2))",
            }}
          >
            {map.streets
              .filter((s) => s.major)
              .map((s, i) => (
                <path key={i} d={toD(s.points)} />
              ))}
          </motion.g>

          {/* The chosen step's stretch, under the walk. */}
          <motion.path
            d={segment}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={highlightW}
            initial={false}
            animate={{ opacity: isOpen ? 0.32 : 0 }}
            transition={{ duration: durations.base, ease: easings.enter }}
            style={{ stroke: accent }}
          />
          <motion.path
            d={walk}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={routeW}
            strokeDasharray={dash}
            strokeDashoffset={dashOffset}
            style={{ stroke: accent, opacity: routeOpacity }}
          />
          <motion.circle
            cx={markX}
            cy={markY}
            r={markR}
            strokeWidth={markStroke}
            initial={false}
            animate={{ opacity: isOpen ? 1 : 0 }}
            transition={{ duration: durations.fast }}
            className="fill-card"
            style={{ stroke: accent }}
          />

          {/* You: a dot with a halo, held at its size on screen. */}
          <motion.g style={{ scale: inv, originX: 0.5, originY: 0.5 }}>
            <circle
              cx={you[0]}
              cy={you[1]}
              r={9}
              style={{
                fill: `color-mix(in oklab, ${accent} 22%, transparent)`,
              }}
            />
            <circle cx={you[0]} cy={you[1]} r={5} className="fill-card" />
            <circle cx={you[0]} cy={you[1]} r={3.4} style={{ fill: accent }} />
          </motion.g>

          {/* The pin: its tip on the door, scaled about the tip. */}
          <motion.ellipse
            cx={dx}
            cy={dy}
            rx={4.5}
            ry={1.6}
            style={{
              scale: shadowScale,
              originX: 0.5,
              originY: 0.5,
              fill: "color-mix(in oklab, black 30%, transparent)",
            }}
          />
          <motion.g style={{ scale: inv, y: pinY, originX: 0.5, originY: 1 }}>
            <path
              d={`M ${dx} ${dy} C ${dx - 2} ${dy - 4} ${dx - 7} ${dy - 8} ${dx - 7} ${dy - 14} A 7 7 0 1 1 ${dx + 7} ${dy - 14} C ${dx + 7} ${dy - 8} ${dx + 2} ${dy - 4} ${dx} ${dy} Z`}
              style={{ fill: pinFill }}
            />
            <circle cx={dx} cy={dy - 14} r={2.7} className="fill-card" />
          </motion.g>
        </motion.svg>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3
            id={nameId}
            title={name}
            className="truncate text-base leading-6 font-medium text-foreground"
          >
            {name}
          </h3>
          <p className="truncate text-xs leading-4 text-ink-3">
            {kind}
            {kind && address ? " · " : ""}
            {address}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <HoursRing
            now={nowMin}
            opens={opens}
            closes={closes}
            hours={hours}
            accent={accent}
            motionSafe={motionSafe}
          />
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm leading-5 font-medium", statusTone)}>
              {statusWord}
            </p>
            <p className="truncate text-xs leading-4 text-ink-2">
              {statusLine}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-sm leading-5 text-foreground tabular-nums">
              {walkMin} min
            </p>
            <p className="text-[11px] leading-4 text-ink-3">
              walk · {meters} m
            </p>
          </div>
        </div>

        <button
          ref={buttonRef}
          type="button"
          aria-expanded={isOpen}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => setOpen(!isOpen)}
          className={cn(
            "inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-2 border border-hairline-strong bg-surface-2 text-sm text-foreground transition-colors outline-none",
            "hover:bg-surface-1",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
          )}
        >
          <span className="grid">
            {[false, true].map((state) => (
              <span
                key={String(state)}
                aria-hidden={state !== isOpen}
                className={cn(
                  "col-start-1 row-start-1 inline-flex items-center justify-center gap-2",
                  state !== isOpen && "invisible",
                )}
              >
                <Navigation aria-hidden className="size-4 shrink-0" />
                {state ? closeLabel : directionsLabel}
              </span>
            ))}
          </span>
        </button>

        <Disclosure open={isOpen} motionSafe={motionSafe}>
          <ol
            id={listId}
            aria-label={`Walking directions to ${name}`}
            inert={!isOpen}
            className="flex flex-col gap-1"
          >
            {steps.map((s, i) => {
              const current = i === step;
              return (
                <motion.li
                  key={s.id}
                  initial={false}
                  animate={
                    isOpen
                      ? { opacity: 1, y: 0 }
                      : { opacity: 0, y: motionSafe ? -distances.nudge : 0 }
                  }
                  transition={
                    isOpen
                      ? motionSafe
                        ? {
                            y: {
                              ...springs.glide,
                              delay: 0.05 + i * cascade(steps.length),
                            },
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                              delay: 0.05 + i * cascade(steps.length),
                            },
                          }
                        : { duration: durations.fast }
                      : exitFor(durations.fast)
                  }
                >
                  <button
                    ref={(node) => {
                      if (node) stepNodes.current.set(s.id, node);
                      else stepNodes.current.delete(s.id);
                    }}
                    type="button"
                    aria-current={current ? "step" : undefined}
                    tabIndex={current ? 0 : -1}
                    onClick={() => choose(i, false)}
                    onKeyDown={(event) => onStepKey(i, event)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-2 px-2 py-2 text-left transition-colors outline-none",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                      current ? "bg-cobalt-wash" : "hover:bg-surface-2",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] leading-none tabular-nums transition-colors",
                        current
                          ? "text-primary-foreground"
                          : "border border-hairline-strong text-ink-2",
                      )}
                      style={current ? { background: accent } : undefined}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-5 text-foreground">
                      {s.text}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-ink-3 tabular-nums">
                      {s.meters} m
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ol>
        </Disclosure>
      </div>
      <span aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </article>
  );
}

/**
 * Height that follows its content: measured by a ResizeObserver bound to the
 * content when it arrives, and animated on glide between 0 and that height.
 */
function Disclosure({
  open,
  motionSafe,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node) return;
    const measure = () => setHeight(r2(node.offsetHeight));
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      className="-mt-3 overflow-clip"
      initial={false}
      animate={{ height: open ? height || "auto" : 0 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      <div ref={setNode} className="pt-3">
        {children}
      </div>
    </motion.div>
  );
}
